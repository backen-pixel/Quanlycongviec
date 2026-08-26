const { randomUUID } = require('crypto');
const { supabase } = require('../config/supabase');
const { getAppSettingValue } = require('./appSettingsCache');
const { collectBlockingTasks } = require('./crmTaskStageAdvanceGate');
const { addBusinessMinutes } = require('../services/businessHours');
const {
  customFieldDisplayValue,
  customFieldValueComplete,
  isMissingCustomFieldTable,
  listQualificationCustomFields,
  loadCustomFieldValuesByRecords,
} = require('./businessOsCustomFields');
const {
  getQualificationAutomation,
  ensurePersistedQualificationAutomation,
  ensureQualificationTasks,
} = require('./businessOsQualificationAutomation');

const SALES_PILOT_SETTING_KEY = 'business_os_sales_pilot_v1';
const SALES_PROCESS_KEY = 'sales_lead_qualification_v1';
const SALES_PROCESS_NAME = 'Lead → Qualification → Deal → Báo giá → Đơn hàng → Dự án → Sản xuất';
const QUALIFICATION_SLA_MINUTES = 2 * 8 * 60;
const QUALIFICATION_FIELD_DEFINITIONS = [
  { key: 'customer_id', label: 'Khách hàng liên kết', system_required: true, edit_field: null },
  { key: 'phone', label: 'Số điện thoại', system_required: false, edit_field: null },
  { key: 'region_id', label: 'Khu vực phụ trách', system_required: true, edit_field: null },
  { key: 'owner_id', label: 'Người chịu trách nhiệm', system_required: true, edit_field: null },
  { key: 'description', label: 'Nhu cầu khách hàng', system_required: false, edit_field: 'description' },
  { key: 'estimated_value', label: 'Ngân sách sơ bộ', system_required: false, edit_field: 'estimated_value' },
  { key: 'expected_construction_time', label: 'Thời điểm dự kiến', system_required: false, edit_field: 'expected_construction_time' },
  { key: 'install_address', label: 'Địa điểm lắp đặt', system_required: false, edit_field: 'install_address' },
];
const QUALIFICATION_FIELD_KEYS = new Set(QUALIFICATION_FIELD_DEFINITIONS.map((field) => field.key));
const LOCKED_REQUIRED_FIELDS = QUALIFICATION_FIELD_DEFINITIONS
  .filter((field) => field.system_required)
  .map((field) => field.key);
const DEFAULT_REQUIRED_FIELDS = [...LOCKED_REQUIRED_FIELDS, 'description'];
const DEFAULT_OPTIONAL_FIELDS = [
  'phone',
  'estimated_value',
  'expected_construction_time',
  'install_address',
];
const DEFAULT_QUALIFICATION_TASK_STAGE_SLUGS = [
  'qualification',
  'lead_qualification',
  'consulting',
];
const PROCESS_STAGES = [
  { key: 'lead', name: 'Lead', order: 1 },
  { key: 'qualification', name: 'Qualification', order: 2 },
  { key: 'qualified', name: 'Đủ điều kiện', order: 3 },
  { key: 'deal', name: 'Deal', order: 4 },
  { key: 'survey', name: 'Khảo sát', order: 5 },
  { key: 'design', name: 'Thiết kế', order: 6 },
  { key: 'design_review', name: 'Kiểm tra thiết kế có sẵn', order: 7 },
  { key: 'design_completed', name: 'Thiết kế hoàn tất', order: 8 },
  { key: 'quotation', name: 'Báo giá', order: 9 },
  { key: 'negotiation', name: 'Thương lượng', order: 10 },
  { key: 'order_ready', name: 'Sẵn sàng đặt hàng', order: 11 },
  { key: 'order', name: 'Đơn hàng', order: 12 },
  { key: 'project', name: 'Dự án', order: 13 },
  { key: 'production', name: 'Sản xuất', order: 14 },
  { key: 'delivery_ready', name: 'Sẵn sàng giao', order: 15 },
  { key: 'installation', name: 'Vận chuyển / Lắp đặt', order: 16 },
  { key: 'completed', name: 'Hoàn tất bàn giao', order: 17 },
];

const TASK_SELECT = [
  'id',
  'title',
  'status',
  'stage_slug',
  'pipeline_stage_id',
  'blocks_stage_advance',
  'completion_requires_file_or_note',
  'required_evidence_file_types',
  'requires_quick_verdict',
  'quick_verdict',
  'quick_verdict_reason',
  'notes',
].join(', ');

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => foldText(item)).filter(Boolean))];
}

function isQualificationTask(task, allowedSlugs = DEFAULT_QUALIFICATION_TASK_STAGE_SLUGS) {
  const stageSlug = String(task?.stage_slug || '').trim().toLowerCase();
  const allowed = allowedSlugs instanceof Set
    ? allowedSlugs
    : new Set(normalizeStringList(allowedSlugs).map((slug) => slug.toLowerCase()));
  return allowed.has(stageSlug);
}

function foldText(value) {
  return String(value || '').trim();
}

function truthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeSalesPilotConfig(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const envCompanyId = foldText(process.env.BUSINESS_OS_SALES_PILOT_COMPANY_ID);
  const companyId = envCompanyId || foldText(value.company_id);
  const envEnabled = process.env.BUSINESS_OS_SALES_PILOT_ENABLED;
  const enabled = envEnabled == null
    ? value.enabled === true
    : truthyEnv(envEnabled);

  return {
    enabled: enabled && !!companyId,
    company_id: companyId || null,
    mode: value.mode === 'observe' ? 'observe' : 'enforce',
    workspace_mode: value.workspace_mode === 'all_modules_gateway'
      ? 'all_modules_gateway'
      : 'sales_only',
    process_key: SALES_PROCESS_KEY,
    process_name: SALES_PROCESS_NAME,
    qualification_sla_minutes: QUALIFICATION_SLA_MINUTES,
  };
}

async function getSalesPilotConfig() {
  const raw = await getAppSettingValue(SALES_PILOT_SETTING_KEY, {});
  return normalizeSalesPilotConfig(raw);
}

async function isSalesPilotCompany(companyId) {
  const config = await getSalesPilotConfig();
  return {
    enabled: config.enabled && String(config.company_id) === String(companyId || ''),
    config,
  };
}

function expectedConstructionLabel(value) {
  if (value === 'under_1m') return 'Dưới 1 tháng';
  if (value === '1_2m') return '1–2 tháng';
  if (value === 'over_2m') return 'Trên 2 tháng';
  return null;
}

function normalizeQualificationStageContract(raw = {}, customFields = null) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const effectiveCustomFields = (Array.isArray(customFields)
    ? customFields
    : (Array.isArray(value.fields) ? value.fields.filter((field) => field?.custom) : []))
    .filter((field) => field?.key || field?.field_key)
    .map((field) => ({ ...field, key: field.key || field.field_key, custom: true }));
  const allowedFieldKeys = new Set([
    ...QUALIFICATION_FIELD_KEYS,
    ...effectiveCustomFields.map((field) => field.key),
  ]);
  const hasFieldConfig = Array.isArray(value.required_fields) || Array.isArray(value.optional_fields);
  const configuredRequired = hasFieldConfig
    ? normalizeStringList(value.required_fields).filter((key) => allowedFieldKeys.has(key))
    : [
      ...DEFAULT_REQUIRED_FIELDS,
      ...effectiveCustomFields.filter((field) => field.default_mode === 'required').map((field) => field.key),
    ];
  const requiredFields = [...new Set([...LOCKED_REQUIRED_FIELDS, ...configuredRequired])];
  const requiredSet = new Set(requiredFields);
  const optionalFields = (hasFieldConfig
    ? normalizeStringList(value.optional_fields)
    : [
      ...DEFAULT_OPTIONAL_FIELDS,
      ...effectiveCustomFields.filter((field) => field.default_mode === 'optional').map((field) => field.key),
    ])
    .filter((key) => allowedFieldKeys.has(key) && !requiredSet.has(key));
  const optionalSet = new Set(optionalFields);
  const configuredTaskSlugs = normalizeStringList(value.task_stage_slugs);
  const taskStageSlugs = configuredTaskSlugs.length
    ? configuredTaskSlugs
    : DEFAULT_QUALIFICATION_TASK_STAGE_SLUGS;

  return {
    id: value.id || null,
    company_id: value.company_id || null,
    process_key: SALES_PROCESS_KEY,
    stage_key: 'qualification',
    schema_version: Number(value.schema_version || 1),
    version: Number(value.version || 1),
    persisted: !!value.id,
    storage_mode: value.id ? 'company_contract' : 'default_contract',
    required_fields: requiredFields,
    optional_fields: optionalFields,
    task_stage_slugs: taskStageSlugs,
    fields: [
      ...QUALIFICATION_FIELD_DEFINITIONS,
      ...effectiveCustomFields,
    ].map((field) => ({
      ...field,
      mode: requiredSet.has(field.key)
        ? 'required'
        : optionalSet.has(field.key)
          ? 'optional'
          : 'hidden',
    })),
  };
}

function isMissingStageContractTable(error) {
  const errorText = String(error?.message || error?.details || '').toLowerCase();
  return errorText.includes('business_os_stage_contracts')
    || (errorText.includes('relation') && errorText.includes('does not exist'));
}

async function getQualificationStageContract(companyId) {
  const customFields = await listQualificationCustomFields(companyId);
  const { data, error } = await supabase
    .from('business_os_stage_contracts')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', 'qualification')
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    if (isMissingStageContractTable(error)) {
      return normalizeQualificationStageContract({ company_id: companyId }, customFields);
    }
    throw error;
  }
  return normalizeQualificationStageContract(data || { company_id: companyId }, customFields);
}

function validateQualificationFieldList(value, name, allowedFieldKeys = QUALIFICATION_FIELD_KEYS) {
  if (!Array.isArray(value)) {
    const error = new Error(`${name} phải là một danh sách.`);
    error.status = 400;
    throw error;
  }
  const normalized = normalizeStringList(value);
  const unknown = normalized.filter((key) => !allowedFieldKeys.has(key));
  if (unknown.length) {
    const error = new Error(`Trường Qualification không hợp lệ: ${unknown.join(', ')}`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function saveQualificationStageContract({
  companyId,
  requiredFields,
  optionalFields,
  actorUserId,
  changeType = 'update',
  sourceVersion = null,
}) {
  const customFields = await listQualificationCustomFields(companyId);
  const allowedFieldKeys = new Set([
    ...QUALIFICATION_FIELD_KEYS,
    ...customFields.map((field) => field.key),
  ]);
  const requestedRequired = validateQualificationFieldList(requiredFields, 'required_fields', allowedFieldKeys);
  const requestedOptional = validateQualificationFieldList(optionalFields, 'optional_fields', allowedFieldKeys);
  const normalized = normalizeQualificationStageContract({
    company_id: companyId,
    required_fields: requestedRequired,
    optional_fields: requestedOptional,
  }, customFields);
  const { data: current, error: currentError } = await supabase
    .from('business_os_stage_contracts')
    .select('id, version, created_by')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', 'qualification')
    .maybeSingle();
  if (currentError) {
    if (isMissingStageContractTable(currentError)) {
      const error = new Error('Chưa cài đặt Stage Contract. Chạy migration database/568_business_os_stage_contracts.sql');
      error.code = 'BUSINESS_OS_STAGE_CONTRACT_MIGRATION_REQUIRED';
      error.status = 503;
      throw error;
    }
    throw currentError;
  }
  const payload = {
    company_id: companyId,
    process_key: SALES_PROCESS_KEY,
    stage_key: 'qualification',
    schema_version: 1,
    required_fields: normalized.required_fields,
    optional_fields: normalized.optional_fields,
    task_stage_slugs: DEFAULT_QUALIFICATION_TASK_STAGE_SLUGS,
    is_active: true,
    version: Number(current?.version || 0) + 1,
    created_by: current?.created_by || actorUserId || null,
    updated_by: actorUserId || null,
  };
  const { data, error } = await supabase
    .from('business_os_stage_contracts')
    .upsert(payload, { onConflict: 'company_id,process_key,stage_key' })
    .select('*')
    .single();
  if (error) throw error;
  const { error: versionError } = await supabase
    .from('business_os_stage_contract_versions')
    .insert({
      contract_id: data.id,
      company_id: companyId,
      process_key: SALES_PROCESS_KEY,
      stage_key: 'qualification',
      version: data.version,
      required_fields: data.required_fields,
      optional_fields: data.optional_fields,
      task_stage_slugs: data.task_stage_slugs,
      custom_field_snapshot: customFields,
      change_type: changeType,
      source_version: sourceVersion,
      created_by: actorUserId || null,
    });
  if (versionError) {
    if (isMissingCustomFieldTable(versionError)) {
      const migrationError = new Error('Chưa cài đặt lịch sử Stage Contract. Chạy migration database/569_business_os_dynamic_custom_fields.sql');
      migrationError.code = 'BUSINESS_OS_CUSTOM_FIELDS_MIGRATION_REQUIRED';
      migrationError.status = 503;
      throw migrationError;
    }
    throw versionError;
  }
  return normalizeQualificationStageContract(data, customFields);
}

async function listQualificationContractVersions(companyId) {
  const { data, error } = await supabase
    .from('business_os_stage_contract_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', 'qualification')
    .order('version', { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingCustomFieldTable(error)) return [];
    throw error;
  }
  return (data || []).map((row) => ({
    id: row.id,
    version: Number(row.version),
    required_fields: row.required_fields || [],
    optional_fields: row.optional_fields || [],
    task_stage_slugs: row.task_stage_slugs || [],
    custom_field_snapshot: row.custom_field_snapshot || [],
    change_type: row.change_type,
    source_version: row.source_version == null ? null : Number(row.source_version),
    created_by: row.created_by || null,
    created_at: row.created_at,
  }));
}

async function rollbackQualificationStageContract({ companyId, version, actorUserId }) {
  const sourceVersion = Number(version);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
    const error = new Error('Phiên bản cần khôi phục không hợp lệ.');
    error.status = 400;
    throw error;
  }
  const { data: target, error } = await supabase
    .from('business_os_stage_contract_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', 'qualification')
    .eq('version', sourceVersion)
    .maybeSingle();
  if (error) {
    if (isMissingCustomFieldTable(error)) {
      const migrationError = new Error('Chưa cài đặt lịch sử Stage Contract.');
      migrationError.status = 503;
      throw migrationError;
    }
    throw error;
  }
  if (!target) {
    const notFound = new Error('Không tìm thấy phiên bản Stage Contract.');
    notFound.status = 404;
    throw notFound;
  }
  const activeCustomFields = await listQualificationCustomFields(companyId);
  const allowed = new Set([...QUALIFICATION_FIELD_KEYS, ...activeCustomFields.map((field) => field.key)]);
  return saveQualificationStageContract({
    companyId,
    requiredFields: (target.required_fields || []).filter((key) => allowed.has(key)),
    optionalFields: (target.optional_fields || []).filter((key) => allowed.has(key)),
    actorUserId,
    changeType: 'rollback',
    sourceVersion,
  });
}

function buildQualificationRequirements(lead, contract = null, customValues = {}) {
  const effectiveContract = normalizeQualificationStageContract(contract || {});
  const customer = lead?.customer || null;
  const phone = foldText(lead?.phone) || foldText(customer?.phone);
  const address = foldText(lead?.install_address) || foldText(customer?.address);
  const ownerId = foldText(lead?.assigned_to) || foldText(lead?.lead_owner_id);
  const description = foldText(lead?.description);
  const estimatedValue = Number(lead?.estimated_value || 0);
  const expectedTime = foldText(lead?.expected_construction_time);

  const requirements = [
    {
      key: 'customer_id',
      label: 'Khách hàng liên kết',
      complete: !!lead?.customer_id,
      value: customer?.full_name || null,
      edit_field: null,
    },
    {
      key: 'phone',
      label: 'Số điện thoại',
      complete: !!phone,
      value: phone || null,
      edit_field: null,
    },
    {
      key: 'region_id',
      label: 'Khu vực phụ trách',
      complete: !!lead?.region_id,
      value: lead?.region?.name || null,
      edit_field: null,
    },
    {
      key: 'owner_id',
      label: 'Người chịu trách nhiệm',
      complete: !!ownerId,
      value: lead?.assignee?.full_name || lead?.lead_owner?.full_name || null,
      edit_field: null,
    },
    {
      key: 'description',
      label: 'Nhu cầu khách hàng',
      complete: description.length >= 10,
      value: description || null,
      edit_field: 'description',
      hint: 'Mô tả tối thiểu 10 ký tự',
    },
    {
      key: 'estimated_value',
      label: 'Ngân sách sơ bộ',
      complete: Number.isFinite(estimatedValue) && estimatedValue > 0,
      value: estimatedValue > 0 ? estimatedValue : null,
      edit_field: 'estimated_value',
    },
    {
      key: 'expected_construction_time',
      label: 'Thời điểm dự kiến',
      complete: ['under_1m', '1_2m', 'over_2m'].includes(expectedTime),
      value: expectedConstructionLabel(expectedTime),
      raw_value: expectedTime || null,
      edit_field: 'expected_construction_time',
    },
    {
      key: 'install_address',
      label: 'Địa điểm lắp đặt',
      complete: !!address,
      value: address || null,
      edit_field: 'install_address',
    },
    ...effectiveContract.fields
      .filter((field) => field.custom)
      .map((field) => {
        const rawValue = customValues?.[field.key];
        return {
          key: field.key,
          label: field.label,
          complete: customFieldValueComplete(field, rawValue),
          value: customFieldDisplayValue(field, rawValue),
          raw_value: rawValue ?? null,
          edit_field: field.edit_field || `custom.${field.key}`,
          hint: field.help_text || field.placeholder || null,
          custom: true,
          field_type: field.field_type,
          options: field.options || [],
          validation: field.validation || {},
          placeholder: field.placeholder || null,
          help_text: field.help_text || null,
        };
      }),
  ];
  const fieldModes = new Map(effectiveContract.fields.map((field) => [field.key, field]));
  return requirements
    .filter((requirement) => fieldModes.get(requirement.key)?.mode !== 'hidden')
    .map((requirement) => {
      const field = fieldModes.get(requirement.key);
      return {
        ...requirement,
        required: field.mode === 'required',
        mode: field.mode,
        system_required: field.system_required,
        custom: field.custom === true,
      };
    });
}

async function loadQualificationBlockingTasks(leadId, contract = null) {
  const { data, error } = await supabase
    .from('crm_tasks')
    .select(TASK_SELECT)
    .eq('lead_id', leadId)
    .neq('status', 'cancelled')
    .limit(200);
  if (error) throw error;
  // Chỉ nhiệm vụ thuộc Lead/Qualification mới được chặn bước này. Các task
  // deal_new, quotation, ordering, schedule... là việc của những stage sau và
  // không được làm một Lead đủ thông tin bị kẹt trước khi chuyển thành Deal.
  const qualificationTasks = (data || []).filter((task) => isQualificationTask(
    task,
    contract?.task_stage_slugs || DEFAULT_QUALIFICATION_TASK_STAGE_SLUGS,
  ));
  return collectBlockingTasks(qualificationTasks, { id: null, name: 'Qualification' });
}

async function buildQualificationReadiness(lead) {
  const contract = await getQualificationStageContract(lead.company_id);
  const valuesByLead = await loadCustomFieldValuesByRecords({
    companyId: lead.company_id,
    recordIds: [lead.id],
    definitions: contract.fields.filter((field) => field.custom),
  });
  const requirements = buildQualificationRequirements(
    lead,
    contract,
    valuesByLead.get(String(lead.id)) || {},
  );
  const blockingTasks = await loadQualificationBlockingTasks(lead.id, contract);
  const requiredRequirements = requirements.filter((item) => item.required);
  const optionalRequirements = requirements.filter((item) => !item.required);
  const missingRequirements = requiredRequirements.filter((item) => !item.complete);
  const missingOptionalRequirements = optionalRequirements.filter((item) => !item.complete);
  return {
    ready: missingRequirements.length === 0 && blockingTasks.length === 0,
    completed_requirements: requiredRequirements.length - missingRequirements.length,
    total_requirements: requiredRequirements.length,
    completed_optional: optionalRequirements.length - missingOptionalRequirements.length,
    total_optional: optionalRequirements.length,
    requirements,
    missing_requirements: missingRequirements,
    missing_optional_requirements: missingOptionalRequirements,
    blocking_tasks: blockingTasks,
    contract,
  };
}

function isMissingProcessTable(error) {
  const text = String(error?.message || error?.details || '').toLowerCase();
  return text.includes('business_os_process_instances')
    || text.includes('business_os_process_events')
    || text.includes('relation') && text.includes('does not exist');
}

function migrationRequiredError(cause) {
  const error = new Error('Chưa cài đặt kernel Business OS. Chạy migration database/473_business_os_sales_qualification_pilot.sql');
  error.code = 'BUSINESS_OS_MIGRATION_REQUIRED';
  error.status = 503;
  error.cause = cause;
  return error;
}

async function loadCompatInstance(lead) {
  const { data, error } = await supabase
    .from('work_audit_logs')
    .select('id, action, after, created_at, actor_user_id')
    .eq('company_id', lead.company_id)
    .eq('entity_type', 'business_os_sales_process')
    .eq('entity_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const meta = data.after && typeof data.after === 'object' ? data.after : {};
  if (meta.process_key && meta.process_key !== SALES_PROCESS_KEY) return null;
  const stageKey = meta.to_stage_key || meta.stage_key || 'lead';
  return {
    id: null,
    company_id: lead.company_id,
    process_key: SALES_PROCESS_KEY,
    record_type: 'crm_lead',
    record_id: lead.id,
    current_stage_key: stageKey,
    status: stageKey === 'deal' ? 'completed' : 'active',
    stage_entered_at: data.created_at,
    sla_started_at: meta.sla_started_at || null,
    sla_due_at: meta.sla_due_at || null,
    qualified_at: meta.qualified_at || (stageKey === 'qualified' || stageKey === 'deal' ? data.created_at : null),
    converted_at: meta.converted_at || (stageKey === 'deal' ? data.created_at : null),
    version: Number(meta.version || 1),
    compat_storage: true,
  };
}

async function loadProcessInstance(lead) {
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .select('*')
    .eq('company_id', lead.company_id)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('record_type', 'crm_lead')
    .eq('record_id', lead.id)
    .maybeSingle();
  if (error) {
    if (isMissingProcessTable(error)) return loadCompatInstance(lead);
    throw error;
  }
  return data || null;
}

async function ensureProcessInstance(lead, actorUserId) {
  const existing = await loadProcessInstance(lead);
  if (existing) return existing;
  const stageKey = lead.type === 'deal' ? 'deal' : 'lead';
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .upsert({
      company_id: lead.company_id,
      process_key: SALES_PROCESS_KEY,
      process_version: 1,
      record_type: 'crm_lead',
      record_id: lead.id,
      current_stage_key: stageKey,
      status: stageKey === 'deal' ? 'completed' : 'active',
      stage_entered_at: now,
      created_by: actorUserId,
      updated_by: actorUserId,
    }, { onConflict: 'company_id,process_key,record_type,record_id' })
    .select('*')
    .single();
  if (error) {
    if (isMissingProcessTable(error)) {
      return {
        id: null,
        company_id: lead.company_id,
        process_key: SALES_PROCESS_KEY,
        record_type: 'crm_lead',
        record_id: lead.id,
        current_stage_key: stageKey,
        status: stageKey === 'deal' ? 'completed' : 'active',
        stage_entered_at: now,
        sla_started_at: null,
        sla_due_at: null,
        version: 1,
        compat_storage: true,
      };
    }
    throw error;
  }
  return data;
}

async function findCommandReceipt(companyId, idempotencyKey, leadId = null) {
  if (!idempotencyKey) return null;
  const { data, error } = await supabase
    .from('business_os_process_events')
    .select('id, process_instance_id, event_type, payload, occurred_at')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) {
    if (isMissingProcessTable(error)) {
      let compatQuery = supabase
        .from('work_command_receipts')
        .select('id, command_type, resource_id, response, created_at')
        .eq('company_id', companyId)
        .eq('idempotency_key', idempotencyKey);
      if (leadId) compatQuery = compatQuery.eq('resource_id', leadId);
      const { data: compat, error: compatError } = await compatQuery.limit(1).maybeSingle();
      if (compatError) throw compatError;
      return compat || null;
    }
    throw error;
  }
  return data || null;
}

async function appendProcessEvent({ instance, actorUserId, eventType, fromStageKey, toStageKey, idempotencyKey, payload = {} }) {
  const effectiveIdempotencyKey = idempotencyKey || randomUUID();
  if (instance.compat_storage) {
    const compatState = {
      process_key: SALES_PROCESS_KEY,
      storage_mode: 'work_kernel_compat',
      stage_key: toStageKey || instance.current_stage_key || null,
      from_stage_key: fromStageKey || null,
      to_stage_key: toStageKey || null,
      idempotency_key: effectiveIdempotencyKey,
      sla_started_at: payload.sla_started_at || instance.sla_started_at || null,
      sla_due_at: payload.sla_due_at || instance.sla_due_at || null,
      qualified_at: payload.qualified_at || instance.qualified_at || null,
      converted_at: payload.converted_at || instance.converted_at || null,
      version: Number(instance.version || 1),
      payload,
    };
    const { data, error } = await supabase
      .from('work_audit_logs')
      .insert({
        company_id: instance.company_id,
        actor_user_id: actorUserId,
        entity_type: 'business_os_sales_process',
        entity_id: instance.record_id,
        action: eventType,
        before: fromStageKey ? { process_key: SALES_PROCESS_KEY, stage_key: fromStageKey } : null,
        after: compatState,
        request_id: payload.request_id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    const { error: outboxError } = await supabase.from('work_outbox_events').insert({
      aggregate_type: 'business_os_sales_process',
      aggregate_id: instance.record_id,
      event_type: `${eventType}.v1`,
      company_id: instance.company_id,
      payload: compatState,
    });
    if (outboxError) throw outboxError;
    const { error: receiptError } = await supabase.from('work_command_receipts').upsert({
      company_id: instance.company_id,
      idempotency_key: effectiveIdempotencyKey,
      command_type: eventType,
      resource_id: instance.record_id,
      response: compatState,
    }, { onConflict: 'company_id,idempotency_key,command_type' });
    if (receiptError) throw receiptError;
    return data;
  }

  const eventRow = {
    company_id: instance.company_id,
    process_instance_id: instance.id,
    process_key: SALES_PROCESS_KEY,
    event_type: eventType,
    from_stage_key: fromStageKey || null,
    to_stage_key: toStageKey || null,
    actor_user_id: actorUserId,
    idempotency_key: effectiveIdempotencyKey,
    payload,
  };
  const { data, error } = await supabase
    .from('business_os_process_events')
    .insert(eventRow)
    .select('*')
    .single();
  if (error) {
    if (isMissingProcessTable(error)) throw migrationRequiredError(error);
    throw error;
  }

  const requestId = payload.request_id || null;
  await Promise.allSettled([
    supabase.from('work_audit_logs').insert({
      company_id: instance.company_id,
      actor_user_id: actorUserId,
      action: eventType,
      entity_type: 'business_os_process_instance',
      entity_id: instance.id,
      before: fromStageKey ? { stage_key: fromStageKey } : null,
      after: toStageKey ? { stage_key: toStageKey } : payload,
      request_id: requestId,
    }),
    supabase.from('work_outbox_events').insert({
      aggregate_type: 'business_os_process_instance',
      aggregate_id: instance.id,
      event_type: `${eventType}.v1`,
      company_id: instance.company_id,
      payload: { ...payload, from_stage_key: fromStageKey || null, to_stage_key: toStageKey || null },
    }),
    supabase.from('audit_log').insert({
      user_id: actorUserId,
      company_id: instance.company_id,
      module: 'business_os',
      entity_type: 'crm_lead',
      entity_id: instance.record_id,
      action: eventType,
      entity_label: SALES_PROCESS_NAME,
      before_data: fromStageKey ? { stage_key: fromStageKey } : null,
      after_data: toStageKey ? { stage_key: toStageKey } : payload,
      metadata: {
        process_key: SALES_PROCESS_KEY,
        storage_mode: 'kernel',
        from_stage_key: fromStageKey || null,
        to_stage_key: toStageKey || null,
        idempotency_key: effectiveIdempotencyKey,
        sla_started_at: payload.sla_started_at || instance.sla_started_at || null,
        sla_due_at: payload.sla_due_at || instance.sla_due_at || null,
        qualified_at: payload.qualified_at || instance.qualified_at || null,
        converted_at: payload.converted_at || instance.converted_at || null,
        version: Number(instance.version || 1),
        payload,
      },
    }),
  ]);
  return data;
}

function responseStageKey(lead, instance) {
  if (lead?.type === 'deal') return 'deal';
  return instance?.current_stage_key || 'lead';
}

function formatInstance(instance, stageKey) {
  return {
    id: instance?.id || null,
    current_stage_key: stageKey,
    status: instance?.status || (stageKey === 'deal' ? 'completed' : 'active'),
    stage_entered_at: instance?.stage_entered_at || null,
    sla_due_at: instance?.sla_due_at || null,
    qualified_at: instance?.qualified_at || null,
    converted_at: instance?.converted_at || null,
    version: instance?.version || 0,
    storage_mode: instance?.compat_storage ? 'work_kernel_compat' : 'kernel',
  };
}

async function getQualificationState(lead) {
  const pilot = await isSalesPilotCompany(lead?.company_id);
  if (!pilot.enabled) {
    return {
      enabled: false,
      pilot: pilot.config,
      process: { key: SALES_PROCESS_KEY, name: SALES_PROCESS_NAME, stages: PROCESS_STAGES },
    };
  }

  const [instance, automation] = await Promise.all([
    loadProcessInstance(lead),
    getQualificationAutomation(lead.company_id),
  ]);
  const stageKey = responseStageKey(lead, instance);
  const readiness = lead.type === 'deal'
    ? { ready: true, completed_requirements: 0, total_requirements: 0, requirements: [], missing_requirements: [], blocking_tasks: [] }
    : await buildQualificationReadiness(lead);

  return {
    enabled: true,
    pilot: pilot.config,
    process: { key: SALES_PROCESS_KEY, name: SALES_PROCESS_NAME, stages: PROCESS_STAGES },
    instance: formatInstance(instance, stageKey),
    readiness,
    automation,
    allowed_actions: {
      start_qualification: lead.type !== 'deal' && stageKey === 'lead',
      complete_qualification: lead.type !== 'deal' && stageKey === 'qualification' && readiness.ready,
      convert_to_deal: lead.type !== 'deal' && stageKey === 'qualified' && readiness.ready,
    },
  };
}

async function startQualification({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead.type === 'deal') return getQualificationState(lead);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return getQualificationState(lead);

  let instance = await ensureProcessInstance(lead, actorUserId);
  if (instance.current_stage_key === 'qualification' || instance.current_stage_key === 'qualified') {
    if (instance.current_stage_key === 'qualification') {
      await ensureQualificationTasks({
        lead,
        actorUserId,
        startedAt: instance.sla_started_at || instance.stage_entered_at || new Date(),
      });
    }
    return getQualificationState(lead);
  }
  const automation = await ensurePersistedQualificationAutomation(lead.company_id, actorUserId);
  const now = new Date();
  const slaDueAt = await addBusinessMinutes(now, automation.sla_policy.duration_minutes, {
    companyId: lead.company_id,
    userId: lead.assigned_to || lead.lead_owner_id || actorUserId,
  });
  const fromStage = instance.current_stage_key || 'lead';
  if (instance.compat_storage) {
    instance = {
      ...instance,
      current_stage_key: 'qualification',
      status: 'active',
      stage_entered_at: now.toISOString(),
      sla_started_at: now.toISOString(),
      sla_due_at: slaDueAt.toISOString(),
      version: Number(instance.version || 0) + 1,
    };
    await appendProcessEvent({
      instance,
      actorUserId,
      eventType: 'sales.qualification.started',
      fromStageKey: fromStage,
      toStageKey: 'qualification',
      idempotencyKey,
      payload: {
        lead_id: lead.id,
        request_id: requestId,
        sla_started_at: instance.sla_started_at,
        sla_due_at: instance.sla_due_at,
      },
    });
    await ensureQualificationTasks({ lead, actorUserId, startedAt: now });
    return getQualificationState(lead);
  }
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .update({
      current_stage_key: 'qualification',
      status: 'active',
      stage_entered_at: now.toISOString(),
      sla_started_at: now.toISOString(),
      sla_due_at: slaDueAt.toISOString(),
      updated_by: actorUserId,
      version: Number(instance.version || 0) + 1,
    })
    .eq('id', instance.id)
    .select('*')
    .single();
  if (error) throw error;
  instance = data;
  await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.qualification.started',
    fromStageKey: fromStage,
    toStageKey: 'qualification',
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      request_id: requestId,
      sla_started_at: instance.sla_started_at,
      sla_due_at: instance.sla_due_at,
    },
  });
  await ensureQualificationTasks({ lead, actorUserId, startedAt: now });
  return getQualificationState(lead);
}

async function completeQualification({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead.type === 'deal') return getQualificationState(lead);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return getQualificationState(lead);

  const instance = await ensureProcessInstance(lead, actorUserId);
  if (instance.current_stage_key === 'qualified') return getQualificationState(lead);
  if (instance.current_stage_key !== 'qualification') {
    const error = new Error('Lead phải ở bước Qualification trước khi xác nhận đủ điều kiện.');
    error.code = 'BUSINESS_OS_INVALID_TRANSITION';
    error.status = 409;
    throw error;
  }

  const readiness = await buildQualificationReadiness(lead);
  if (!readiness.ready) {
    const error = new Error('Lead chưa đủ điều kiện để hoàn tất Qualification.');
    error.code = 'BUSINESS_OS_QUALIFICATION_INCOMPLETE';
    error.status = 409;
    error.details = readiness;
    throw error;
  }

  const now = new Date().toISOString();
  if (instance.compat_storage) {
    const updatedInstance = {
      ...instance,
      current_stage_key: 'qualified',
      stage_entered_at: now,
      qualified_at: now,
      version: Number(instance.version || 0) + 1,
    };
    await appendProcessEvent({
      instance: updatedInstance,
      actorUserId,
      eventType: 'sales.qualification.completed',
      fromStageKey: 'qualification',
      toStageKey: 'qualified',
      idempotencyKey,
      payload: {
        lead_id: lead.id,
        request_id: requestId,
        sla_started_at: updatedInstance.sla_started_at,
        sla_due_at: updatedInstance.sla_due_at,
        qualified_at: now,
        requirement_keys: readiness.requirements.map((item) => item.key),
      },
    });
    return getQualificationState(lead);
  }
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .update({
      current_stage_key: 'qualified',
      stage_entered_at: now,
      qualified_at: now,
      qualified_by: actorUserId,
      updated_by: actorUserId,
      version: Number(instance.version || 0) + 1,
    })
    .eq('id', instance.id)
    .select('*')
    .single();
  if (error) throw error;
  await appendProcessEvent({
    instance: data,
    actorUserId,
    eventType: 'sales.qualification.completed',
    fromStageKey: 'qualification',
    toStageKey: 'qualified',
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      request_id: requestId,
      sla_started_at: data.sla_started_at,
      sla_due_at: data.sla_due_at,
      qualified_at: data.qualified_at,
      requirement_keys: readiness.requirements.map((item) => item.key),
    },
  });
  return getQualificationState(lead);
}

async function assertQualificationConversionAllowed({ lead, actorUserId }) {
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled || pilot.config.mode === 'observe') return { ok: true, enabled: pilot.enabled };

  const state = await getQualificationState(lead);
  if (state.instance?.current_stage_key !== 'qualified' || !state.readiness?.ready) {
    return {
      ok: false,
      enabled: true,
      status: 409,
      code: 'BUSINESS_OS_QUALIFICATION_REQUIRED',
      error: 'Lead phải hoàn tất Qualification và đủ toàn bộ thông tin bắt buộc trước khi chuyển Deal.',
      qualification: state,
      actor_user_id: actorUserId,
    };
  }
  return { ok: true, enabled: true, qualification: state };
}

async function recordQualificationConverted({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return null;
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return receipt;
  const instance = await ensureProcessInstance({ ...lead, type: 'deal' }, actorUserId);
  const fromStage = instance.current_stage_key || 'qualified';
  const now = new Date().toISOString();
  if (instance.compat_storage) {
    const updatedInstance = {
      ...instance,
      current_stage_key: 'deal',
      status: 'completed',
      stage_entered_at: now,
      converted_at: now,
      version: Number(instance.version || 0) + 1,
    };
    return appendProcessEvent({
      instance: updatedInstance,
      actorUserId,
      eventType: 'sales.lead.converted_to_deal',
      fromStageKey: fromStage,
      toStageKey: 'deal',
      idempotencyKey,
      payload: {
        lead_id: lead.id,
        request_id: requestId,
        sla_started_at: updatedInstance.sla_started_at,
        sla_due_at: updatedInstance.sla_due_at,
        qualified_at: updatedInstance.qualified_at,
        converted_at: now,
      },
    });
  }
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .update({
      current_stage_key: 'deal',
      status: 'completed',
      stage_entered_at: now,
      converted_at: now,
      converted_by: actorUserId,
      updated_by: actorUserId,
      version: Number(instance.version || 0) + 1,
    })
    .eq('id', instance.id)
    .select('*')
    .single();
  if (error) throw error;
  return appendProcessEvent({
    instance: data,
    actorUserId,
    eventType: 'sales.lead.converted_to_deal',
    fromStageKey: fromStage,
    toStageKey: 'deal',
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      request_id: requestId,
      sla_started_at: data.sla_started_at,
      sla_due_at: data.sla_due_at,
      qualified_at: data.qualified_at,
      converted_at: data.converted_at,
    },
  });
}

module.exports = {
  SALES_PILOT_SETTING_KEY,
  SALES_PROCESS_KEY,
  SALES_PROCESS_NAME,
  QUALIFICATION_SLA_MINUTES,
  QUALIFICATION_FIELD_DEFINITIONS,
  LOCKED_REQUIRED_FIELDS,
  DEFAULT_REQUIRED_FIELDS,
  DEFAULT_OPTIONAL_FIELDS,
  PROCESS_STAGES,
  isQualificationTask,
  normalizeSalesPilotConfig,
  normalizeQualificationStageContract,
  buildQualificationRequirements,
  buildQualificationReadiness,
  getQualificationStageContract,
  saveQualificationStageContract,
  listQualificationContractVersions,
  rollbackQualificationStageContract,
  getSalesPilotConfig,
  isSalesPilotCompany,
  getQualificationState,
  startQualification,
  completeQualification,
  assertQualificationConversionAllowed,
  recordQualificationConverted,
  loadProcessInstance,
  ensureProcessInstance,
  findCommandReceipt,
  appendProcessEvent,
  isMissingProcessTable,
  isMissingStageContractTable,
};
