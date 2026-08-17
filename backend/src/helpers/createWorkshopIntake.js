/**
 * Tạo đơn trực tiếp trên module Sản xuất — luồng nhanh (không chạy full autoCreateProjectFromWonDeal).
 * Deal tối thiểu + project + Kanban intake; template/notify chạy nền.
 */

const { supabase } = require('../config/supabase');
const { nextCrmCode } = require('./crmNextCode');
const { ensureDefaultCrmPipelineForCompany } = require('./ensureDefaultCrmPipeline');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('./projectCode');
const { syncCrmLeadSxPipelineFromProject } = require('./workshopKanban');
const { applyWorkshopTypeDefaultStaffToProject } = require('./productionWorkshopTypeStaff');
const { notifyMultiple } = require('./notifications');
const { insertCrmLeadResilient } = require('./crmLeadInsert');
const { isMetallaOrHucabiCompanyId } = require('./dealParticipantProduction');
const { ensureWorkshopClientCompanyLink } = require('./productionClientCompanies');

const PIPELINE_CACHE_TTL_MS = 5 * 60 * 1000;
const pipelineCache = new Map();
let cachedDefaultFlowId = null;
let cachedDefaultFlowAt = 0;
const FLOW_CACHE_TTL_MS = 10 * 60 * 1000;

/** Đo ms từng phase — trả về client để biết bước nào chậm. */
function createIntakeTimer() {
  const t0 = Date.now();
  const phases = {};
  let last = t0;
  return {
    mark(name) {
      const now = Date.now();
      phases[name] = now - last;
      last = now;
    },
    done() {
      return { phases_ms: phases, total_ms: Date.now() - t0 };
    },
  };
}

async function resolveDefaultFlowId() {
  if (cachedDefaultFlowId && Date.now() - cachedDefaultFlowAt < FLOW_CACHE_TTL_MS) {
    return cachedDefaultFlowId;
  }
  let flowId = null;
  try {
    const { data: cfg } = await supabase.from('auto_project_config').select('flow_id').limit(1).maybeSingle();
    flowId = cfg?.flow_id || null;
  } catch (_) { /* ignore */ }
  if (!flowId) {
    const { data: defaultFlow } = await supabase
      .from('workflow_flows')
      .select('id')
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    flowId = defaultFlow?.id || null;
  }
  if (!flowId) {
    const { data: anyFlow } = await supabase
      .from('workflow_flows')
      .select('id')
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    flowId = anyFlow?.id || null;
  }
  if (flowId) {
    cachedDefaultFlowId = flowId;
    cachedDefaultFlowAt = Date.now();
  }
  return flowId;
}

async function resolveWonDealStageId(pipelineId) {
  const { data: won } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('pipeline_type', 'deal')
    .eq('is_won', true)
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();
  if (won?.id) return won.id;

  const { data: first } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('pipeline_type', 'deal')
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();
  return first?.id || null;
}

async function getPipelineAndWonStage(companyId) {
  const hit = pipelineCache.get(String(companyId));
  if (hit && Date.now() - hit.at < PIPELINE_CACHE_TTL_MS) {
    return { pipelineId: hit.pipelineId, wonStageId: hit.wonStageId };
  }
  const pipelineId = await ensureDefaultCrmPipelineForCompany(companyId);
  if (!pipelineId) return { pipelineId: null, wonStageId: null };
  const wonStageId = await resolveWonDealStageId(pipelineId);
  pipelineCache.set(String(companyId), { pipelineId, wonStageId, at: Date.now() });
  return { pipelineId, wonStageId };
}

async function validateWorkshopType(companyId, workshopTypeId) {
  if (!workshopTypeId) return { ok: false, error: 'Chọn phân loại xưởng' };
  const { data: wt } = await supabase
    .from('workshop_project_types')
    .select('id, company_id, applies_to, is_active, name')
    .eq('id', workshopTypeId)
    .maybeSingle();
  if (!wt) return { ok: false, error: 'Phân loại xưởng không tồn tại' };
  if (String(wt.company_id) !== String(companyId)) {
    return { ok: false, error: 'Phân loại không thuộc công ty đã chọn' };
  }
  if (wt.is_active === false) return { ok: false, error: 'Phân loại đang bị ẩn' };
  if (wt.applies_to && !['production', 'both'].includes(String(wt.applies_to))) {
    return { ok: false, error: 'Phân loại không áp dụng cho Sản xuất' };
  }
  return { ok: true, type: wt };
}

async function ensureCustomerId(companyId, incomingCustomerId, customerName, customerPhone, customerEmail, installAddress, fallbackName) {
  if (incomingCustomerId) return { ok: true, customerId: incomingCustomerId };
  const nameTrim = String(customerName || '').trim();
  const phoneTrim = String(customerPhone || '').trim();
  // Module Xưởng: tên KH & SĐT không bắt buộc — fallback từ tên đơn để vẫn lưu được customer record
  // (cột customers.full_name & phone NOT NULL).
  const fallbackTrim = String(fallbackName || '').trim();
  const effectiveName = nameTrim || fallbackTrim || 'Khách hàng xưởng';
  const effectivePhone = phoneTrim || '';
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .insert({
      full_name: effectiveName,
      phone: effectivePhone,
      email: customerEmail || null,
      address: installAddress || null,
      company_id: companyId,
    })
    .select('id')
    .single();
  if (custErr) return { ok: false, error: custErr.message, statusCode: 500 };
  return { ok: true, customerId: customer.id };
}

async function insertWorkshopProject({ deal, companyId, workshopTypeId, userId, flowId, productionValue = null }) {
  const yr = new Date().getFullYear();
  const nowIso = new Date().toISOString();
  const costRaw = productionValue != null ? Number(productionValue) : null;
  const cost = Number.isFinite(costRaw) && costRaw > 0 ? costRaw : null;
  const baseRow = (code) => ({
    code,
    name: deal.title || 'Dự án mới',
    description: deal.description || null,
    customer_id: deal.customer_id,
    company_id: companyId,
    flow_id: flowId,
    status: 'consulting',
    current_stage_id: null,
    install_address: deal.install_address || null,
    /** Xưởng không lưu/hiện doanh thu — chỉ chi phí xưởng */
    estimated_value: null,
    /** Chi phí xưởng — công nợ SX = production_value − deposit */
    production_value: cost,
    deposit_amount: Number(deal.deposit_amount) > 0 ? Number(deal.deposit_amount) : null,
    created_from_sx: true,
    priority: 'medium',
    sales_person_id: deal.assigned_to || deal.lead_owner_id || userId,
    consult_date: nowIso,
    workshop_type_id: workshopTypeId,
  });

  let project;
  let lastInsertErr;
  let omitCreatedFromSx = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = await nextTbProjectCode(supabase, yr);
    const row = baseRow(code);
    if (omitCreatedFromSx) delete row.created_from_sx;
    const { data, error: projErr } = await supabase
      .from('projects')
      .insert(row)
      .select('id, code, name')
      .single();
    if (!projErr) {
      project = data;
      break;
    }
    lastInsertErr = projErr;
    if (String(projErr.message || '').includes('created_from_sx') && !omitCreatedFromSx) {
      omitCreatedFromSx = true;
      continue;
    }
    if (isPostgresUniqueViolation(projErr)) continue;
    throw projErr;
  }
  if (!project) throw lastInsertErr || new Error('Không tạo dự án: trùng mã code');
  return project;
}

/** Template SX, thông báo, activity — không chặn response. */
function scheduleWorkshopIntakeBackground({ req, dealId, projectId, userId, companyId, projectCode, dealTitle }) {
  setImmediate(() => {
    void (async () => {
      try {
        const { applyProductionTemplateToFulfillmentLead } = require('./projectOrderFulfillment');
        await applyProductionTemplateToFulfillmentLead({
          leadId: dealId,
          createdBy: userId,
          assigneeId: null,
          force: true,
          requireTemplateCompanyMatch: true,
          templateSourceCompanyId: companyId,
        });
      } catch (e) {
        console.warn('[workshop-intake/bg] sx template:', e.message);
      }

      try {
        const { applyDefaultWorkshopTemplatesForNewProject } = require('./workshopApplyTemplates');
        await applyDefaultWorkshopTemplatesForNewProject(projectId, userId);
      } catch (e) {
        console.warn('[workshop-intake/bg] workshop templates:', e.message);
      }

      try {
        await supabase.from('crm_activities').insert({
          lead_id: dealId,
          type: 'note',
          title: '🏭 Đơn xưởng mới',
          description: `Dự án ${projectCode} — "${dealTitle}"`,
          created_by: userId,
        });
      } catch (_) { /* ignore */ }

      if (!req) return;
      try {
        const { loadProjectProductionStaffUserIds } = require('./productionWorkshopTypeStaff');
        const staffIds = await loadProjectProductionStaffUserIds(projectId);
        for (const sid of staffIds) {
          if (String(sid) === String(userId)) continue;
          try {
            await notifyMultiple(req, [sid], 'project_assigned',
              '📋 Đơn xưởng mới',
              `Bạn được gán vào dự án ${projectCode} — "${dealTitle}"`,
              'project', projectId, {
                ecosystem_module_key: 'production',
                project_id: String(projectId),
                project_code: projectCode,
              });
          } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore */ }
    })();
  });
}

/**
 * @param {object} opts
 * @param {object} opts.req
 * @param {string} opts.userId
 * @param {string} opts.companyId
 * @param {string} opts.workshopTypeId
 * @param {string} opts.title
 * @param {string} opts.customerId
 * @param {string} [opts.customerName]
 * @param {string} [opts.customerPhone]
 * @param {string} [opts.customerEmail]
 * @param {string} [opts.installAddress]
 * @param {string} [opts.regionId]
 * @param {number} [opts.estimatedValue] — doanh thu
 * @param {number} [opts.productionValue] — chi phí sản xuất
 * @param {string} [opts.description]
 * @param {string} [opts.externalCompanyName]
 * @param {string} [opts.externalCompanyId]
 * @param {string} [opts.externalCatalogId]
 * @param {boolean} [opts.staffAllowFallback=true] — false = chỉ NV setup phân loại (đặt xưởng)
 */
async function createWorkshopIntakeOrder(opts) {
  const {
    req,
    userId,
    companyId,
    workshopTypeId,
    title,
    customerId: incomingCustomerId,
    customerName,
    customerPhone,
    customerEmail,
    installAddress,
    regionId,
    estimatedValue,
    productionValue,
    description,
    externalCompanyName,
    externalCompanyId,
    externalCatalogId,
    staffAllowFallback = true,
  } = opts;

  const timer = createIntakeTimer();
  const titleTrim = String(title || '').trim();
  if (!titleTrim) return { ok: false, error: 'Nhập tên đơn', statusCode: 400 };

  const coCheck = await validateProductionCompanyId(companyId);
  if (!coCheck.ok) return { ok: false, error: coCheck.error, statusCode: 400 };

  const companyUuid = coCheck.company.id;

  const [wtCheck, customerResult, pipelineInfo, flowId, dealCode] = await Promise.all([
    validateWorkshopType(companyUuid, workshopTypeId),
    ensureCustomerId(companyUuid, incomingCustomerId, customerName, customerPhone, customerEmail, installAddress, titleTrim),
    getPipelineAndWonStage(companyUuid),
    resolveDefaultFlowId(),
    nextCrmCode('DEAL'),
  ]);
  timer.mark('prep');

  if (!wtCheck.ok) return { ok: false, error: wtCheck.error, statusCode: 400 };
  if (!customerResult.ok) return { ok: false, error: customerResult.error, statusCode: customerResult.statusCode || 400 };
  if (!flowId) {
    return { ok: false, error: 'Chưa có luồng quy trình. Vui lòng tạo luồng trước.', statusCode: 400 };
  }

  const { pipelineId, wonStageId } = pipelineInfo;
  if (!pipelineId || !wonStageId) {
    return { ok: false, error: 'Không tạo được pipeline nội bộ cho công ty', statusCode: 500 };
  }

  const nowIso = new Date().toISOString();
  const isPartnerWorkshop = await isMetallaOrHucabiCompanyId(companyUuid);
  let resolvedExternalId = externalCompanyId ? String(externalCompanyId).trim() : null;
  let externalCoTrim = String(externalCompanyName || '').trim() || null;

  if (isPartnerWorkshop && (externalCatalogId || (resolvedExternalId && String(resolvedExternalId).startsWith('ext:')))) {
    const { resolveClientCompanyPick } = require('./productionClientCompanies');
    const pick = String(resolvedExternalId || '').startsWith('ext:')
      ? resolvedExternalId
      : `ext:${externalCatalogId}`;
    const resolved = await resolveClientCompanyPick(companyUuid, pick);
    if (resolved.clientCompanyId) resolvedExternalId = resolved.clientCompanyId;
    if (resolved.externalName) externalCoTrim = resolved.externalName;
    else if (!resolvedExternalId && resolved.externalName) externalCoTrim = resolved.externalName;
  } else if (resolvedExternalId && String(resolvedExternalId).startsWith('ext:')) {
    const { resolveClientCompanyPick } = require('./productionClientCompanies');
    const resolved = await resolveClientCompanyPick(companyUuid, resolvedExternalId);
    if (resolved.clientCompanyId) resolvedExternalId = resolved.clientCompanyId;
    if (resolved.externalName) externalCoTrim = resolved.externalName;
  }

  // Bắt buộc công ty ngoài / đối tác cho mọi đơn xưởng (app + web).
  if (!resolvedExternalId && !externalCoTrim) {
    return {
      ok: false,
      error: 'Chọn hoặc nhập công ty ngoài / đối tác',
      statusCode: 400,
    };
  }

  if (isPartnerWorkshop) {
    if (resolvedExternalId) {
      const { data: clientCo, error: coErr } = await supabase
        .from('companies')
        .select('id, name, short_name, is_active')
        .eq('id', resolvedExternalId)
        .maybeSingle();
      if (coErr || !clientCo?.id || clientCo.is_active === false) {
        return { ok: false, error: 'Công ty chủ deal không hợp lệ', statusCode: 400 };
      }
      if (String(clientCo.id) === String(companyUuid)) {
        return { ok: false, error: 'Công ty chủ deal phải khác công ty SX', statusCode: 400 };
      }
      externalCoTrim = clientCo.short_name || clientCo.name;
      try {
        await ensureWorkshopClientCompanyLink(companyUuid, clientCo.id);
        const { upsertProductionExternalCompany, normalizeExternalCompanyName } = require('./productionExternalCompanies');
        const saved = await upsertProductionExternalCompany({
          productionCompanyId: companyUuid,
          name: externalCoTrim,
          userId,
          linkedCompanyId: clientCo.id,
        });
        if (saved?.name) externalCoTrim = normalizeExternalCompanyName(saved.name);
      } catch (e) {
        console.warn('[workshop-intake] external company catalog:', e.message);
      }
    } else if (externalCoTrim) {
      try {
        const { upsertProductionExternalCompany, normalizeExternalCompanyName } = require('./productionExternalCompanies');
        const saved = await upsertProductionExternalCompany({
          productionCompanyId: companyUuid,
          name: externalCoTrim,
          userId,
        });
        if (saved?.name) externalCoTrim = normalizeExternalCompanyName(saved.name);
      } catch (e) {
        console.warn('[workshop-intake] external company catalog:', e.message);
      }
    }
  } else if (resolvedExternalId) {
    const { data: clientCo } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .eq('id', resolvedExternalId)
      .maybeSingle();
    if (clientCo?.id) externalCoTrim = clientCo.short_name || clientCo.name;
  } else if (externalCoTrim) {
    try {
      const { upsertProductionExternalCompany, normalizeExternalCompanyName } = require('./productionExternalCompanies');
      const saved = await upsertProductionExternalCompany({
        productionCompanyId: companyUuid,
        name: externalCoTrim,
        userId,
      });
      if (saved?.name) externalCoTrim = normalizeExternalCompanyName(saved.name);
    } catch (e) {
      console.warn('[workshop-intake] external company catalog:', e.message);
    }
  }
  timer.mark('partner');

  // Deal nội bộ liên kết SX — không gán phụ trách CRM (= người tạo đơn xưởng).
  // Nếu gán assigned_to = userId thì deal xuất hiện oan trong «Deal của tôi» trên CRM mobile/web.
  const dealRow = {
    code: dealCode,
    title: titleTrim,
    type: 'deal',
    customer_id: customerResult.customerId,
    company_id: companyUuid,
    pipeline_id: pipelineId,
    stage_id: wonStageId,
    region_id: regionId || null,
    assigned_to: null,
    lead_owner_id: null,
    created_by: userId,
    estimated_value: estimatedValue != null ? Number(estimatedValue) || 0 : 0,
    probability: 100,
    install_address: installAddress || null,
    description: description ? `[Xưởng] ${description}` : '[Xưởng] Tạo trực tiếp từ module Sản xuất',
    external_company_name: externalCoTrim,
    external_company_id: resolvedExternalId,
    stage_entered_at: nowIso,
    actual_close_date: nowIso.split('T')[0],
  };

  const { data: deal, error: dealErr } = await insertCrmLeadResilient(dealRow, 'id, code, title');
  timer.mark('insert_deal');
  if (dealErr) return { ok: false, error: dealErr.message, statusCode: 500 };

  try {
    const { ensureDealProductionAutoParticipants } = require('./dealParticipantProduction');
    await ensureDealProductionAutoParticipants({
      dealId: deal.id,
      dealCompanyId: companyUuid,
      addedBy: userId,
    });
  } catch (partErr) {
    console.warn('[workshop-intake] auto participants:', partErr.message);
  }
  timer.mark('participants');

  let project;
  try {
    project = await insertWorkshopProject({
      deal: { ...dealRow, ...deal },
      companyId: companyUuid,
      workshopTypeId: wtCheck.type.id,
      userId,
      flowId,
      productionValue: productionValue != null ? productionValue : null,
    });
  } catch (e) {
    return { ok: false, error: e.message || 'Không tạo được dự án', statusCode: 500, deal_id: deal.id };
  }
  timer.mark('insert_project');

  const projectId = project.id;

  try {
    const { error: linkDealErr } = await supabase
      .from('crm_leads')
      .update({ project_id: projectId, updated_at: nowIso })
      .eq('id', deal.id);
    if (linkDealErr) throw linkDealErr;

    await applyWorkshopTypeDefaultStaffToProject(projectId, companyUuid, wtCheck.type.id, {
      allowFallback: staffAllowFallback !== false,
    });

    try {
      const { data: hop } = await supabase
        .from('production_handover_settings')
        .select('default_production_team_id')
        .eq('production_company_id', companyUuid)
        .maybeSingle();
      if (hop?.default_production_team_id) {
        await supabase.from('projects').update({
          production_workshop_team_id: hop.default_production_team_id,
          updated_at: nowIso,
        }).eq('id', projectId);
      }
    } catch (he) {
      console.warn('[workshop-intake] team:', he.message);
    }
  } catch (linkErr) {
    return {
      ok: false,
      error: linkErr.message || 'Không liên kết deal ↔ dự án',
      statusCode: 500,
      deal_id: deal.id,
    };
  }
  timer.mark('link_staff');

  try {
    await syncCrmLeadSxPipelineFromProject(projectId);
  } catch (syncErr) {
    console.warn('[workshop-intake] sync kanban:', syncErr.message);
  }
  timer.mark('sync_kanban');

  try {
    const { ensureDealLeadDocumentsForModuleTransition } = require('./ensureDealLeadDocumentsForModuleTransition');
    await ensureDealLeadDocumentsForModuleTransition({ leadId: deal.id, projectId });
  } catch (docErr) {
    console.warn('[workshop-intake] lead_documents:', docErr.message);
  }
  timer.mark('docs');

  scheduleWorkshopIntakeBackground({
    req,
    dealId: deal.id,
    projectId,
    userId,
    companyId: companyUuid,
    projectCode: project.code,
    dealTitle: deal.title,
  });

  try {
    const { notifyWorkshopIntakeNewDeal, emitProductionBoardRealtime } = require('./workshopIntakeNotify');
    await notifyWorkshopIntakeNewDeal({
      req,
      projectId,
      projectCode: project.code,
      projectName: project.name,
      dealTitle: deal.title,
      actorUserId: userId,
    });
    const io = req?.app?.get('io');
    await emitProductionBoardRealtime(projectId, io, 'workshop_intake');
  } catch (intakeNotifyErr) {
    console.warn('[workshop-intake] notify/socket:', intakeNotifyErr.message);
  }
  timer.mark('notify');

  const timing = timer.done();
  console.info('[workshop-intake] timing', {
    deal_code: deal.code,
    project_code: project.code,
    ...timing,
  });

  return {
    ok: true,
    deal_id: deal.id,
    deal_code: deal.code,
    project_id: projectId,
    project_code: project.code,
    project_name: project.name,
    workshop_type_id: wtCheck.type.id,
    tasks_created: 0,
    timing,
  };
}

module.exports = { createWorkshopIntakeOrder };
