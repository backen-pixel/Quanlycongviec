/**
 * Business OS — composition/read model mới chạy song song với các module legacy.
 * Giai đoạn đầu chỉ có vertical slice Sales: Lead → Qualification → Deal.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike, isPlatformAdmin, isSystemAdmin } = require('../helpers/adminRole');
const { assertCompanyAccessible } = require('../helpers/tenantScope');
const {
  getSalesPilotConfig,
  isSalesPilotCompany,
  isMissingProcessTable,
  getQualificationStageContract,
  saveQualificationStageContract,
  listQualificationContractVersions,
  rollbackQualificationStageContract,
  isQualificationTask,
  PROCESS_STAGES,
} = require('../helpers/salesQualificationPilot');
const {
  createQualificationCustomField,
  updateQualificationCustomField,
  deactivateQualificationCustomField,
  loadCustomFieldValuesByRecords,
} = require('../helpers/businessOsCustomFields');
const { collectBlockingTasks } = require('../helpers/crmTaskStageAdvanceGate');
const { buildBusinessOsSnapshot } = require('../helpers/businessOsOverview');
const {
  getQualificationAutomation,
  saveQualificationAutomation,
  listQualificationAutomationVersions,
  rollbackQualificationAutomation,
  evaluateQualificationSlaEscalations,
} = require('../helpers/businessOsQualificationAutomation');
const {
  CONFIGURABLE_STAGE_KEYS,
  getStageAutomation,
  saveStageAutomation,
  listStageAutomationVersions,
  rollbackStageAutomation,
  evaluateStageSlaEscalations,
} = require('../helpers/businessOsDealWorkflow');
const {
  getTenantBlueprintInstallation,
  getCompanyBlueprintInstallations,
  isMissingBlueprintSchema,
} = require('../helpers/businessBlueprint');

const r = Router();
r.use(auth);

const LEAD_SELECT = [
  'id',
  'code',
  'title',
  'type',
  'company_id',
  'customer_id',
  'phone',
  'region_id',
  'assigned_to',
  'lead_owner_id',
  'description',
  'estimated_value',
  'expected_construction_time',
  'install_address',
  'created_at',
  'updated_at',
  'customer:customers(id, full_name, phone, address)',
  'assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar)',
  'lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar)',
].join(', ');

const TASK_SELECT = [
  'id',
  'lead_id',
  'title',
  'status',
  'stage_slug',
  'blocks_stage_advance',
  'completion_requires_file_or_note',
  'required_evidence_file_types',
  'requires_quick_verdict',
  'quick_verdict',
  'quick_verdict_reason',
  'notes',
  'business_os_process_key',
  'business_os_stage_key',
].join(', ');

function text(value) {
  return String(value || '').trim();
}

async function listAccessibleCompanies(req, config = null) {
  const userCompany = text(req.user?.company_id);
  const canBrowseAllCompanies = isPlatformAdmin(req.user) || isSystemAdmin(req.user);
  let allowedIds = null;

  if (userCompany) {
    allowedIds = req.tenantContext?.enforced
      && !(req.tenantCompanyIds || []).includes(userCompany)
      ? []
      : [userCompany];
  } else if (req.tenantContext?.enforced) {
    allowedIds = canBrowseAllCompanies ? [...(req.tenantCompanyIds || [])] : [];
  } else if (!canBrowseAllCompanies) {
    const { data: links, error: linksError } = await supabase
      .from('user_companies')
      .select('company_id')
      .eq('user_id', req.user?.userId || req.user?.id);
    if (linksError) throw linksError;
    allowedIds = (links || []).map((row) => text(row.company_id)).filter(Boolean);
  }

  if (Array.isArray(allowedIds) && !allowedIds.length) return [];

  let query = supabase
    .from('companies')
    .select('id, name, short_name, is_active, tenant_id')
    .or('is_active.eq.true,is_active.is.null')
    .order('name');
  if (Array.isArray(allowedIds)) query = query.in('id', allowedIds);

  const { data, error } = await query;
  if (error) throw error;

  const pilotConfig = config || await getSalesPilotConfig();
  return (data || []).map((company) => ({
    ...company,
    business_os_pilot: pilotConfig.enabled && String(pilotConfig.company_id) === String(company.id),
  }));
}

async function resolveOverviewCompanyId(req) {
  const requested = text(req.query.company_id);
  const userCompany = text(req.user?.company_id);
  if (userCompany && requested && requested !== userCompany) {
    return { ok: false, status: 403, error: 'Không có quyền xem Business OS của công ty khác.' };
  }

  const config = await getSalesPilotConfig();
  const companies = await listAccessibleCompanies(req, config);
  const accessibleIds = new Set(companies.map((company) => String(company.id)));

  if (requested && !accessibleIds.has(requested)) {
    return {
      ok: false,
      status: 403,
      code: 'BUSINESS_OS_COMPANY_DENIED',
      error: 'Không có quyền mở Business OS của công ty này.',
    };
  }

  const preferredPilot = config.company_id && accessibleIds.has(String(config.company_id))
    ? String(config.company_id)
    : null;
  const companyId = requested
    || (userCompany && accessibleIds.has(userCompany) ? userCompany : null)
    || preferredPilot
    || text(companies[0]?.id)
    || null;

  if (!companyId) {
    return {
      ok: false,
      status: 400,
      code: 'BUSINESS_OS_COMPANY_REQUIRED',
      error: 'Tài khoản chưa có công ty đang hoạt động để mở Business OS.',
    };
  }
  return {
    ok: true,
    companyId,
    company: companies.find((company) => String(company.id) === companyId) || null,
    companies,
    config,
  };
}

async function resolveConfigCompany(req, res, requestedCompanyId = null) {
  if (!isAdminLike(req.user)) {
    res.status(403).json({ error: 'Chỉ quản trị viên được cấu hình Business OS.' });
    return null;
  }
  const companyId = text(requestedCompanyId) || text(req.user?.company_id);
  if (!companyId) {
    res.status(400).json({ error: 'Thiếu company_id.' });
    return null;
  }
  const companies = await listAccessibleCompanies(req);
  const company = companies.find((item) => String(item.id) === companyId);
  if (!company) {
    res.status(403).json({
      error: 'Không có quyền cấu hình Business OS của công ty này.',
      code: 'BUSINESS_OS_COMPANY_DENIED',
    });
    return null;
  }
  if (!assertCompanyAccessible(req, res, companyId)) return null;
  return { companyId, company };
}

async function loadProcessInstances(companyId) {
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', 'sales_lead_qualification_v1')
    .eq('record_type', 'crm_lead')
    .limit(500);
  if (error) {
    if (isMissingProcessTable(error)) return { available: false, data: [] };
    throw error;
  }
  return { available: true, data: data || [] };
}

async function loadBlockingTasksByLead(records, qualificationContract = null, instances = []) {
  const ids = (records || []).map((record) => record.id);
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('crm_tasks')
    .select(TASK_SELECT)
    .in('lead_id', ids)
    .neq('status', 'cancelled')
    .limit(2000);
  if (error) throw error;
  const grouped = new Map();
  for (const task of data || []) {
    const key = String(task.lead_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  }
  const recordById = new Map((records || []).map((record) => [String(record.id), record]));
  const instanceById = new Map((instances || []).map((instance) => [String(instance.record_id), instance]));
  const entries = await Promise.all(ids.map(async (leadId) => {
    const key = String(leadId);
    const record = recordById.get(key);
    const currentStage = instanceById.get(key)?.current_stage_key || (record?.type === 'deal' ? 'deal' : 'lead');
    const relevantTasks = (grouped.get(key) || []).filter((task) => {
      if (currentStage === 'qualification') return isQualificationTask(task, qualificationContract?.task_stage_slugs);
      if (['survey', 'design', 'design_review'].includes(currentStage)) {
        return task.business_os_process_key === 'sales_lead_qualification_v1'
          && task.business_os_stage_key === currentStage;
      }
      return false;
    });
    const stageName = currentStage === 'survey'
      ? 'Khảo sát'
      : currentStage === 'design'
        ? 'Thiết kế'
        : currentStage === 'design_review'
          ? 'Kiểm tra thiết kế có sẵn'
          : 'Qualification';
    return [key, await collectBlockingTasks(relevantTasks, { id: null, name: stageName })];
  }));
  return new Map(entries);
}

function rolloutCatalog(activeProcessKey, allModulesEnabled = false, enabledModules = new Set()) {
  const gatewayStatus = allModulesEnabled ? 'gateway' : 'planned';
  return [
    { key: 'sales', module_key: 'crm', name: 'Sales', flow: 'Lead → Qualification → Deal', status: activeProcessKey ? 'pilot' : (enabledModules.has('crm') ? 'gateway' : 'planned') },
    { key: 'project', module_key: 'projects', name: 'Project', flow: 'Deal → Survey → Design → Project', status: enabledModules.has('projects') ? 'gateway' : gatewayStatus },
    { key: 'production', module_key: 'production', name: 'Production', flow: 'Plan → Produce → QC → Ready', status: enabledModules.has('production') ? 'gateway' : gatewayStatus },
    { key: 'installation', module_key: 'logistics', name: 'Installation', flow: 'Schedule → Deliver → Install → Handover', status: enabledModules.has('logistics') ? 'gateway' : gatewayStatus },
    { key: 'customer', module_key: 'customers', name: 'Customer', flow: 'Care → Warranty → Renewal', status: enabledModules.has('customers') ? 'gateway' : gatewayStatus },
    { key: 'report_ai', module_key: 'ai_assistant', name: 'KPI & AI', flow: 'Event → KPI → Alert → Agent', status: enabledModules.has('ai_assistant') ? 'gateway' : gatewayStatus },
  ];
}

async function resolveTenantBlueprint(req, companyId) {
  const tenantId = text(req.user?.tenant_id);
  if (!tenantId) return null;
  try {
    if (text(companyId)) {
      try {
        const companyInstallations = await getCompanyBlueprintInstallations({ tenantId, companyId });
        const activeCompany = companyInstallations.find((installation) => installation.status === 'active');
        if (activeCompany) {
          const definition = activeCompany.configuration?.effective_definition
            || activeCompany.version?.definition
            || {};
          return {
            key: activeCompany.blueprint?.blueprint_key || null,
            name: activeCompany.blueprint?.name || null,
            industry: activeCompany.blueprint?.industry || null,
            version: activeCompany.version?.version_number || null,
            applied_at: activeCompany.applied_at,
            scope: 'company_blueprint',
            company_id: activeCompany.company_id,
            modules: (definition.modules || []).filter((module) => module.enabled !== false).map((module) => module.key),
            processes: definition.processes || [],
            operating_kernel: definition.operating_kernel || {},
            has_company_overrides: Object.keys(activeCompany.company_overrides?.modules || {}).length > 0
              || Object.keys(activeCompany.company_overrides?.processes || {}).length > 0
              || (activeCompany.company_overrides?.department_templates?.add || []).length > 0
              || (activeCompany.company_overrides?.department_templates?.hidden || []).length > 0,
          };
        }
      } catch (companyError) {
        if (!isMissingBlueprintSchema(companyError)) throw companyError;
      }
    }
    const installations = await getTenantBlueprintInstallation(tenantId);
    const active = installations.find((installation) => installation.status === 'active');
    if (!active) return null;
    const definition = active.version?.definition || {};
    return {
      key: active.blueprint?.blueprint_key || null,
      name: active.blueprint?.name || null,
      industry: active.blueprint?.industry || null,
      version: active.version?.version_number || null,
      applied_at: active.applied_at,
      scope: 'tenant_blueprint',
      company_id: null,
      modules: (definition.modules || []).filter((module) => module.enabled !== false).map((module) => module.key),
      processes: definition.processes || [],
      operating_kernel: definition.operating_kernel || {},
    };
  } catch (error) {
    if (!isMissingBlueprintSchema(error)) {
      console.warn('[business-os/blueprint]', error.message);
    }
    return null;
  }
}

r.get('/overview', async (req, res) => {
  try {
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    }
    const { companyId } = resolved;
    if (!assertCompanyAccessible(req, res, companyId)) return;

    const company = resolved.company;
    if (!company) return res.status(404).json({ error: 'Không tìm thấy công ty.' });

    const [pilot, tenantBlueprint, qualificationContract, qualificationAutomation, surveyAutomation, designAutomation, designReviewAutomation] = await Promise.all([
      isSalesPilotCompany(companyId),
      resolveTenantBlueprint(req, companyId),
      getQualificationStageContract(companyId),
      getQualificationAutomation(companyId),
      getStageAutomation(companyId, 'survey'),
      getStageAutomation(companyId, 'design'),
      getStageAutomation(companyId, 'design_review'),
    ]);
    const enabledModules = new Set(tenantBlueprint?.modules || []);
    const allModulesEnabled = pilot.config.workspace_mode === 'all_modules_gateway'
      || enabledModules.has('business_os');
    const base = {
      generated_at: new Date().toISOString(),
      company,
      blueprint: tenantBlueprint,
      rollout: {
        enabled: pilot.enabled || !!tenantBlueprint,
        mode: pilot.config.mode,
        scope: pilot.enabled ? 'single_company' : (tenantBlueprint?.scope || (tenantBlueprint ? 'tenant_blueprint' : 'connected_read_only')),
        environment: 'staging',
        feature_flag: 'business_os_sales_pilot_v1',
        legacy_fallback: true,
        data_connected: true,
        blueprint_managed: !!tenantBlueprint,
        workspace_mode: allModulesEnabled ? 'all_modules_gateway' : 'sales_only',
        all_modules_enabled: allModulesEnabled,
      },
      catalog: rolloutCatalog(pilot.enabled ? pilot.config.process_key : null, allModulesEnabled, enabledModules),
    };

    const recordsQuery = supabase
      .from('crm_leads')
      .select(LEAD_SELECT)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(200);
    const auditsQuery = supabase
      .from('work_audit_logs')
      .select('id, company_id, actor_user_id, action, entity_type, entity_id, before, after, request_id, created_at')
      .eq('company_id', companyId)
      .eq('entity_type', 'business_os_sales_process')
      .order('created_at', { ascending: false })
      .limit(1000);

    const [recordsResult, auditsResult, instances] = pilot.enabled
      ? await Promise.all([recordsQuery, auditsQuery, loadProcessInstances(companyId)])
      : [await recordsQuery, { data: [], error: null }, { available: false, data: [] }];
    const { data: records, error: recordsError } = recordsResult;
    const { data: audits, error: auditsError } = auditsResult;
    if (recordsError) throw recordsError;
    if (auditsError) throw auditsError;

    const safeRecords = records || [];
    const blockingTasksByLead = pilot.enabled
      ? await loadBlockingTasksByLead(safeRecords, qualificationContract, instances.data)
      : new Map();
    const qualificationValuesByLead = pilot.enabled
      ? await loadCustomFieldValuesByRecords({
        companyId,
        recordIds: safeRecords.filter((record) => record.type !== 'deal').map((record) => record.id),
        definitions: qualificationContract.fields.filter((field) => field.custom),
      })
      : new Map();
    const snapshot = buildBusinessOsSnapshot({
      records: safeRecords,
      audits: audits || [],
      instances: instances.data,
      blockingTasksByLead,
      qualificationContract,
      qualificationAutomation,
      stageAutomations: { survey: surveyAutomation, design: designAutomation, design_review: designReviewAutomation },
      qualificationValuesByLead,
    });
    const recordById = new Map(snapshot.records.map((record) => [String(record.id), record]));
    const recentEvents = (audits || []).slice(0, 20).map((event) => ({
      id: event.id,
      action: event.action,
      entity_id: event.entity_id,
      record: recordById.get(String(event.entity_id)) || null,
      from_stage_key: event.after?.from_stage_key || event.before?.stage_key || null,
      to_stage_key: event.after?.to_stage_key || event.after?.stage_key || null,
      occurred_at: event.created_at,
      actor_user_id: event.actor_user_id,
    }));

    res.set('Cache-Control', 'no-store');
    return res.json({
      ...base,
      ...snapshot,
      storage_mode: instances.available ? 'business_os_kernel' : 'work_kernel_compat',
      qualification_contract: qualificationContract,
      qualification_automation: qualificationAutomation,
      stage_automations: { survey: surveyAutomation, design: designAutomation, design_review: designReviewAutomation },
      recent_events: recentEvents,
      limits: { records_returned: safeRecords.length, records_max: 200 },
      permissions: {
        can_configure: isAdminLike(req.user),
        can_open_records: true,
      },
    });
  } catch (error) {
    console.error('[business-os/overview]', error);
    return res.status(500).json({ error: error.message || 'Không tải được Business OS.' });
  }
});

r.get('/qualification-contract', async (req, res) => {
  try {
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    }
    if (!assertCompanyAccessible(req, res, resolved.companyId)) return;
    const contract = await getQualificationStageContract(resolved.companyId);
    res.set('Cache-Control', 'no-store');
    return res.json({
      company: resolved.company,
      contract,
      permissions: { can_configure: isAdminLike(req.user) },
    });
  } catch (error) {
    console.error('[business-os/qualification-contract/get]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Không tải được Stage Contract.',
      code: error.code,
    });
  }
});

r.put('/qualification-contract', async (req, res) => {
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const { companyId, company } = resolved;
    const contract = await saveQualificationStageContract({
      companyId,
      requiredFields: req.body?.required_fields,
      optionalFields: req.body?.optional_fields,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company, contract });
  } catch (error) {
    console.error('[business-os/qualification-contract/put]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Không lưu được Stage Contract.',
      code: error.code,
    });
  }
});

r.get('/qualification-contract/versions', async (req, res) => {
  try {
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    }
    if (!assertCompanyAccessible(req, res, resolved.companyId)) return;
    const versions = await listQualificationContractVersions(resolved.companyId);
    res.set('Cache-Control', 'no-store');
    return res.json({
      company: resolved.company,
      versions,
      permissions: { can_configure: isAdminLike(req.user) },
    });
  } catch (error) {
    console.error('[business-os/qualification-contract/versions]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.post('/qualification-contract/rollback', async (req, res) => {
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const contract = await rollbackQualificationStageContract({
      companyId: resolved.companyId,
      version: req.body?.version,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, contract });
  } catch (error) {
    console.error('[business-os/qualification-contract/rollback]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.post('/qualification-custom-fields', async (req, res) => {
  let createdField = null;
  let createdCompanyId = null;
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    createdCompanyId = resolved.companyId;
    const actorUserId = req.user?.userId || req.user?.id;
    const current = await getQualificationStageContract(resolved.companyId);
    createdField = await createQualificationCustomField({
      companyId: resolved.companyId,
      input: req.body,
      actorUserId,
    });
    const mode = ['required', 'optional', 'hidden'].includes(req.body?.mode)
      ? req.body.mode
      : createdField.default_mode;
    const contract = await saveQualificationStageContract({
      companyId: resolved.companyId,
      requiredFields: mode === 'required'
        ? [...current.required_fields, createdField.key]
        : current.required_fields,
      optionalFields: mode === 'optional'
        ? [...current.optional_fields, createdField.key]
        : current.optional_fields,
      actorUserId,
      changeType: 'custom_field_created',
    });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ company: resolved.company, field: createdField, contract });
  } catch (error) {
    if (createdField?.id && createdCompanyId) {
      await supabase
        .from('business_os_custom_field_definitions')
        .update({ is_active: false })
        .eq('id', createdField.id)
        .eq('company_id', createdCompanyId);
    }
    console.error('[business-os/qualification-custom-fields/post]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.put('/qualification-custom-fields/:id', async (req, res) => {
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const field = await updateQualificationCustomField({
      companyId: resolved.companyId,
      fieldId: req.params.id,
      input: req.body,
      actorUserId: req.user?.userId || req.user?.id,
    });
    const contract = await getQualificationStageContract(resolved.companyId);
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, field, contract });
  } catch (error) {
    console.error('[business-os/qualification-custom-fields/put]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.delete('/qualification-custom-fields/:id', async (req, res) => {
  let removedField = null;
  try {
    const resolved = await resolveConfigCompany(req, res, req.query?.company_id || req.body?.company_id);
    if (!resolved) return;
    const actorUserId = req.user?.userId || req.user?.id;
    const current = await getQualificationStageContract(resolved.companyId);
    removedField = await deactivateQualificationCustomField({
      companyId: resolved.companyId,
      fieldId: req.params.id,
      actorUserId,
    });
    const contract = await saveQualificationStageContract({
      companyId: resolved.companyId,
      requiredFields: current.required_fields.filter((key) => key !== removedField.key),
      optionalFields: current.optional_fields.filter((key) => key !== removedField.key),
      actorUserId,
      changeType: 'custom_field_removed',
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, removed_field: removedField, contract });
  } catch (error) {
    if (removedField?.id) {
      await supabase
        .from('business_os_custom_field_definitions')
        .update({ is_active: true })
        .eq('id', removedField.id);
    }
    console.error('[business-os/qualification-custom-fields/delete]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.get('/qualification-automation', async (req, res) => {
  try {
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    }
    if (!assertCompanyAccessible(req, res, resolved.companyId)) return;
    const automation = await getQualificationAutomation(resolved.companyId);
    res.set('Cache-Control', 'no-store');
    return res.json({
      company: resolved.company,
      automation,
      permissions: { can_configure: isAdminLike(req.user) },
    });
  } catch (error) {
    console.error('[business-os/qualification-automation/get]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.put('/qualification-automation', async (req, res) => {
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const automation = await saveQualificationAutomation({
      companyId: resolved.companyId,
      input: req.body?.automation || req.body,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, automation });
  } catch (error) {
    console.error('[business-os/qualification-automation/put]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.get('/qualification-automation/versions', async (req, res) => {
  try {
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) {
      return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    }
    if (!assertCompanyAccessible(req, res, resolved.companyId)) return;
    const versions = await listQualificationAutomationVersions(resolved.companyId);
    res.set('Cache-Control', 'no-store');
    return res.json({
      company: resolved.company,
      versions,
      permissions: { can_configure: isAdminLike(req.user) },
    });
  } catch (error) {
    console.error('[business-os/qualification-automation/versions]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.post('/qualification-automation/rollback', async (req, res) => {
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const automation = await rollbackQualificationAutomation({
      companyId: resolved.companyId,
      version: req.body?.version,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, automation });
  } catch (error) {
    console.error('[business-os/qualification-automation/rollback]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.post('/qualification-sla/evaluate', async (req, res) => {
  try {
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const result = await evaluateQualificationSlaEscalations({ companyId: resolved.companyId });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, result });
  } catch (error) {
    console.error('[business-os/qualification-sla/evaluate]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

function configurableStage(req, res) {
  const stageKey = text(req.params.stageKey).toLowerCase();
  if (!CONFIGURABLE_STAGE_KEYS.includes(stageKey)) {
    res.status(400).json({
      error: 'Stage automation chỉ hỗ trợ survey, design hoặc design_review trong lát cắt hiện tại.',
      code: 'BUSINESS_OS_STAGE_NOT_CONFIGURABLE',
    });
    return null;
  }
  return stageKey;
}

r.get('/stage-automations/:stageKey', async (req, res) => {
  try {
    const stageKey = configurableStage(req, res);
    if (!stageKey) return;
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    if (!assertCompanyAccessible(req, res, resolved.companyId)) return;
    const automation = await getStageAutomation(resolved.companyId, stageKey);
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, automation, permissions: { can_configure: isAdminLike(req.user) } });
  } catch (error) {
    console.error('[business-os/stage-automations/get]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.put('/stage-automations/:stageKey', async (req, res) => {
  try {
    const stageKey = configurableStage(req, res);
    if (!stageKey) return;
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const automation = await saveStageAutomation({
      companyId: resolved.companyId,
      stageKey,
      input: req.body?.automation || req.body,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, automation });
  } catch (error) {
    console.error('[business-os/stage-automations/put]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.get('/stage-automations/:stageKey/versions', async (req, res) => {
  try {
    const stageKey = configurableStage(req, res);
    if (!stageKey) return;
    const resolved = await resolveOverviewCompanyId(req);
    if (!resolved.ok) return res.status(resolved.status || 400).json({ error: resolved.error, code: resolved.code });
    if (!assertCompanyAccessible(req, res, resolved.companyId)) return;
    const versions = await listStageAutomationVersions(resolved.companyId, stageKey);
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, versions, permissions: { can_configure: isAdminLike(req.user) } });
  } catch (error) {
    console.error('[business-os/stage-automations/versions]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.post('/stage-automations/:stageKey/rollback', async (req, res) => {
  try {
    const stageKey = configurableStage(req, res);
    if (!stageKey) return;
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const automation = await rollbackStageAutomation({
      companyId: resolved.companyId,
      stageKey,
      version: req.body?.version,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, automation });
  } catch (error) {
    console.error('[business-os/stage-automations/rollback]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.post('/stage-sla/:stageKey/evaluate', async (req, res) => {
  try {
    const stageKey = configurableStage(req, res);
    if (!stageKey) return;
    const resolved = await resolveConfigCompany(req, res, req.body?.company_id);
    if (!resolved) return;
    const result = await evaluateStageSlaEscalations({ companyId: resolved.companyId, stageKey });
    res.set('Cache-Control', 'no-store');
    return res.json({ company: resolved.company, result });
  } catch (error) {
    console.error('[business-os/stage-sla/evaluate]', error);
    return res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

r.get('/companies', async (req, res) => {
  try {
    const config = await getSalesPilotConfig();
    const companies = await listAccessibleCompanies(req, config);
    const preferredPilot = companies.find((company) => company.business_os_pilot);
    res.set('Cache-Control', 'no-store');
    return res.json({
      companies,
      default_company_id: text(req.user?.company_id)
        || preferredPilot?.id
        || companies[0]?.id
        || null,
    });
  } catch (error) {
    console.error('[business-os/companies]', error);
    return res.status(500).json({ error: error.message || 'Không tải được danh sách công ty.' });
  }
});

module.exports = r;
