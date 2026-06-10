const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { responseCache, invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');
const { effectiveWorkshopCompanyId, normalizeWorkshopCompanyId } = require('../helpers/workshopCompanyScope');
const { isSystemAdmin } = require('../helpers/adminRole');
const {
  WORKSHOP_STAGE_SLUGS,
  WORKSHOP_STATUSES,
  INTAKE_BUCKET,
  getWorkshopStageMap,
  getWonDealProjectIds,
  buildScopeOrFilter,
  loadProductionPipelineStagesRows,
  getResolvedKanbanStages,
  resolveSxHandoverColumnId,
  resolveSxDisplayColumnId,
  enrichProjectsForSx,
  buildPipelineSummary,
  syncCrmLeadSxPipelineFromProject,
  shouldAutoOverwriteCrmStage,
  syncVcPipelineStageToLead,
  getCrmVcDeliveryStageId,
  emitCrmBadgeUpdateForProject,
  getDbIntakeStageId,
} = require('../helpers/workshopKanban');
const { attachCrmProductionTaskStatsToProjects } = require('../helpers/crmProductionTaskStats');
const { applyProductionCompanyScopeFilter, getExecutorProjectIdsForCompany } = require('../helpers/crossCompanyWorkspace');
const {
  applyWorkshopTemplateToProject,
  applyAllActiveWorkshopTemplatesForArea,
} = require('../helpers/workshopApplyTemplates');
const {
  applyProductionTemplateToFulfillmentLead,
  applyProductionTemplatesOnPipelineEnter,
} = require('../helpers/projectOrderFulfillment');
const { assertSxKanbanAdvanceAllowed } = require('../helpers/workshopStageAdvanceGate');
const { notifyMultiple: notifyMultipleShared, createNotification: createNotif } = require('../helpers/notifications');
const {
  buildPipelineStageSelect,
  isHandoverMissingError,
  isCrmTargetStageMissingError,
  isCrmTargetStageEmbedRelationshipError,
  isPipelineProgressPercentMissingError,
  isPipelineWorkshopTypeMissingError,
  isPipelineWorkshopTypeEmbedRelationshipError,
  markHandoverColumnMissing,
  markCrmTargetStageColumnMissing,
  markCrmTargetStageJoinMissing,
  markPipelineProgressPercentColumnMissing,
  markPipelineWorkshopTypeColumnMissing,
  markPipelineWorkshopTypeJoinMissing,
  isPipelineKpiSlaMissingError,
  markPipelineKpiSlaColumnMissing,
  isPipelineCollectedRevenueMissingError,
  markPipelineCollectedRevenueColumnMissing,
  isPipelineRequiresDeadlineMissingError,
  markPipelineRequiresDeadlineColumnMissing,
  stripHandoverFields,
  fetchProductionPipelineStageById,
  insertProductionPipelineStageRow,
  INSERT_COLUMN_RETRIES,
  normalizePipelineStageApiRow,
  mapSwitchWorkshopTypeBodyToDb,
} = require('../helpers/productionPipelineSchema');
const { normalizePipelineStageSlaDaysForDb } = require('../helpers/crmPipelineSla');
const { computeSxRevenueKpis } = require('../helpers/sxPipelineRevenue');
const {
  leadDocVisibleForModuleAndUser,
  isLeadDocSharedToWorkshop: isDocSharedToWorkshop,
} = require('../helpers/documentShareScope');
const { ensureDealLeadDocumentsForProjectId } = require('../helpers/ensureDealLeadDocumentsForModuleTransition');
const { validateProductionCompanyId } = require('../helpers/productionCompanyGate');
const {
  assignProductionCompanyDealResponsibility,
  resolveProductionHandoverResponsibleUserId,
} = require('../helpers/productionHandoverSettings');
const { getRestrictedDivisionIdsForModule } = require('../helpers/ecosystemModuleScope');

const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function productionInvalidate(body) {
    if (res.statusCode < 400) void rcInvalidateTags(['production']);
    return origJson(body);
  };
  next();
});

/** Tắt toàn bộ thông báo (DB + socket) phát ra từ module Sản xuất (/api/production). */
const DISABLE_PRODUCTION_PUSH_NOTIFICATIONS = true;

function friendlyPipelineStageDbError(e) {
  const msg = String(e?.message || e || '');
  if (msg.includes('workshop_type_id') && (msg.includes('foreign key') || msg.includes('violates'))) {
    return 'Phân loại xưởng không tồn tại hoặc đã bị xóa. Tải lại trang và chọn lại phân loại trên màn hình.';
  }
  if (msg.includes('foreign key') || e?.code === '23503') {
    return 'Không lưu được — dữ liệu liên quan không hợp lệ. Tải lại trang và thử lại.';
  }
  return msg || 'Lỗi pipeline sản xuất';
}

async function assertWorkshopTypeForCompany(workshopTypeId, companyId) {
  const wkt = workshopTypeId != null && String(workshopTypeId).trim() ? String(workshopTypeId).trim() : null;
  if (!wkt) return;
  if (!companyId) {
    const err = new Error('Thiếu company_id khi gắn phân loại xưởng');
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabase
    .from('workshop_project_types')
    .select('id, company_id, is_active')
    .eq('id', wkt)
    .maybeSingle();
  if (error) throw error;
  if (!data || String(data.company_id) !== String(companyId)) {
    const err = new Error('Phân loại xưởng không tồn tại hoặc không thuộc công ty này. Chọn lại phân loại trên màn hình.');
    err.status = 400;
    throw err;
  }
  if (data.is_active === false) {
    const err = new Error('Phân loại xưởng đang tắt — bật lại hoặc chọn phân loại khác.');
    err.status = 400;
    throw err;
  }
}

function parseProductionStageKpiBody(b) {
  const out = {};
  if (b.default_probability !== undefined) {
    if (b.default_probability === null || b.default_probability === '') {
      out.default_probability = null;
    } else {
      const n = Number(b.default_probability);
      out.default_probability = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
    }
  }
  if (b.sla_days !== undefined) {
    out.sla_days = normalizePipelineStageSlaDaysForDb(b.sla_days);
  }
  if (b.counts_as_won_revenue !== undefined) {
    out.counts_as_won_revenue = b.counts_as_won_revenue == null ? null : !!b.counts_as_won_revenue;
  }
  if (b.counts_as_completed_revenue !== undefined) {
    out.counts_as_completed_revenue = b.counts_as_completed_revenue == null ? null : !!b.counts_as_completed_revenue;
  }
  if (b.counts_as_collected_revenue !== undefined) {
    out.counts_as_collected_revenue = b.counts_as_collected_revenue == null ? null : !!b.counts_as_collected_revenue;
  }
  if (b.requires_deadline !== undefined) {
    out.requires_deadline = b.requires_deadline == null ? null : !!b.requires_deadline;
  }
  return out;
}

async function touchProjectSxPipelineStageEnteredAt(projectId, targetColId, currentColId) {
  if (!projectId || !targetColId) return;
  if (currentColId && String(currentColId) === String(targetColId)) return;
  const nowIso = new Date().toISOString();
  try {
    await supabase
      .from('projects')
      .update({ sx_pipeline_stage_entered_at: nowIso })
      .eq('id', projectId);
  } catch (e) {
    if (!String(e.message || '').includes('sx_pipeline_stage_entered_at')) {
      console.warn('[production] sx_pipeline_stage_entered_at:', e.message);
    }
  }
}

/** Gán NV mặc định theo phân loại xưởng khi deal vào cột intake nếu dự án chưa có đủ NV SX. */
async function applyDefaultIntakeAssigneeIfNeeded(projectId, companyId) {
  if (!projectId || !companyId) return;
  try {
    const { data: proj } = await supabase
      .from('projects')
      .select('id, production_person_id, company_id, workshop_type_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!proj) return;

    const { loadProjectProductionStaffUserIds, applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
    const existingStaff = await loadProjectProductionStaffUserIds(projectId);
    if (existingStaff.length > 0 && proj.production_person_id) return;

    await applyWorkshopTypeDefaultStaffToProject(projectId, companyId, proj.workshop_type_id || null);
  } catch (e) {
    console.warn('[production] applyDefaultIntakeAssigneeIfNeeded:', e.message);
  }
}

/** Cột VC intake theo công ty dự án (có fallback pipeline global). */
async function resolveLogisticsVcIntakeColumnId(companyId) {
  const cid = normalizeWorkshopCompanyId(companyId);
  try {
    if (cid) {
      const r1 = await supabase
        .from('logistics_pipeline_stages')
        .select('id')
        .eq('bucket_slug', 'delivery_pending')
        .eq('is_active', true)
        .eq('company_id', cid)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      if (r1.data?.id) return r1.data.id;
    }
    const r2 = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('bucket_slug', 'delivery_pending')
      .eq('is_active', true)
      .is('company_id', null)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (r2.data?.id) return r2.data.id;
    const { data: vcFirst } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    return vcFirst?.id || null;
  } catch (_e) {
    return null;
  }
}

/** Cột SX theo workflow_stage_id, ưu tiên pipeline của công ty dự án. */
async function findSxPipelineStageRowForWorkflow(workflowStageId, projectCompanyId) {
  const pcid = normalizeWorkshopCompanyId(projectCompanyId);
  const pick = async (companyScope) => {
    let q = supabase
      .from('production_pipeline_stages')
      .select('id, is_handover_to_logistics, name')
      .eq('workflow_stage_id', workflowStageId)
      .eq('is_active', true);
    if (companyScope === 'company') q = q.eq('company_id', pcid);
    if (companyScope === 'global') q = q.is('company_id', null);
    let { data, error } = await q.limit(1).maybeSingle();
    if (error && isHandoverMissingError(error)) {
      markHandoverColumnMissing();
      let q2 = supabase
        .from('production_pipeline_stages')
        .select('id, name')
        .eq('workflow_stage_id', workflowStageId)
        .eq('is_active', true);
      if (companyScope === 'company') q2 = q2.eq('company_id', pcid);
      if (companyScope === 'global') q2 = q2.is('company_id', null);
      ({ data, error } = await q2.limit(1).maybeSingle());
      if (data) data = { ...data, is_handover_to_logistics: false };
    }
    if (error || !data) return null;
    return data;
  };
  try {
    if (pcid) {
      const scoped = await pick('company');
      if (scoped) return scoped;
    }
    return await pick('global');
  } catch (_e) {
    return null;
  }
}

function calcTaskProgress(tasks) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100);
}

const CRM_DEALS_FOR_PROJECT_EMBED = `
  id, code, title, type, estimated_value, created_at, sx_handover_at, region_id,
  crm_region:company_regions!crm_leads_region_id_fkey(id, name, code),
  assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
  lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
  sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name))
`;

// Một số DB cũ chưa có các cột `status`, `lost_reason` trên crm_leads.
// Giữ select tối thiểu để không làm vỡ màn hình chi tiết xưởng.
const CRM_DEALS_FOR_PROJECT_MIN = 'id, code, title, type, estimated_value, created_at';

async function nextDealCode() {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', 'DEAL')
    .single();
  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix: 'DEAL', current_number: num, year });
  return `DEAL-${year}-${String(num).padStart(3, '0')}`;
}

async function resolveDefaultPipelineAndStage(companyId) {
  // pipeline ưu tiên theo công ty, fallback pipeline chung theo migration 21.
  const PIPELINE_CHUNG_ID = '00000000-0000-0000-0000-000000000001';
  let pipelineId = PIPELINE_CHUNG_ID;
  try {
    if (companyId) {
      const { data: p } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (p?.id) pipelineId = p.id;
    }
  } catch (_) { /* ignore */ }

  let stageId = null;
  try {
    const { data: s } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (s?.id) stageId = s.id;
  } catch (_) { /* ignore */ }

  return { pipelineId, stageId };
}

async function insertCrmDealForProjectResilient(insertRow) {
  const { stripInvalidCrmLeadColumns } = require('../helpers/crmLeadInsert');
  // Một số DB cũ có thể thiếu cột pipeline_id / lead_owner_id / created_by... nên cần retry.
  const tryInsert = async (row) => supabase.from('crm_leads').insert(row).select('id, company_id').single();
  let row = stripInvalidCrmLeadColumns({ ...insertRow });
  let r = await tryInsert(row);
  if (!r.error) return r;

  const msg = String(r.error?.message || r.error?.details || '');
  const missing = (col) => msg.toLowerCase().includes(col.toLowerCase()) && (msg.includes('does not exist') || msg.includes('Could not find') || msg.includes('could not find'));
  // Strip columns progressively based on error message
  if (missing('lead_owner_id')) {
    const { lead_owner_id: _x, ...rest } = row;
    row = rest;
    r = await tryInsert(row);
    if (!r.error) return r;
  }
  if (missing('pipeline_id')) {
    const { pipeline_id: _x, ...rest } = row;
    row = rest;
    r = await tryInsert(row);
    if (!r.error) return r;
  }
  if (missing('stage_id')) {
    const { stage_id: _x, ...rest } = row;
    row = rest;
    r = await tryInsert(row);
    if (!r.error) return r;
  }
  if (missing('created_by')) {
    const { created_by: _x, ...rest } = row;
    row = rest;
    r = await tryInsert(row);
    if (!r.error) return r;
  }
  // Final: throw original error
  return r;
}

/**
 * Deals CRM cho chi tiết dự án SX: mặc định crm_leads.project_id.
 * Fallback: đơn CRM (orders) gắng project_id nhưng deal chưa được set project_id — lấy lead_id / fulfillment_lead_id.
 */
async function loadCrmDealsSummaryForProductionProject(projectId) {
  let rows = [];
  try {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_DEALS_FOR_PROJECT_EMBED)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.warn('[production] crmDeals embed:', e.message);
    const { data } = await supabase
      .from('crm_leads')
      .select(CRM_DEALS_FOR_PROJECT_MIN)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    rows = data || [];
  }
  if (rows.length) return rows;

  let orderRows = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('lead_id, fulfillment_lead_id')
      .eq('project_id', projectId);
    if (error) throw error;
    orderRows = data || [];
  } catch (e) {
    console.warn('[production] crmDeals orders lookup:', e.message);
    return [];
  }

  const idOrder = [];
  const seen = new Set();
  for (const o of orderRows) {
    if (o.lead_id && !seen.has(String(o.lead_id))) {
      seen.add(String(o.lead_id));
      idOrder.push(o.lead_id);
    }
    if (o.fulfillment_lead_id && !seen.has(String(o.fulfillment_lead_id))) {
      seen.add(String(o.fulfillment_lead_id));
      idOrder.push(o.fulfillment_lead_id);
    }
  }
  if (!idOrder.length) return [];

  try {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_DEALS_FOR_PROJECT_EMBED)
      .in('id', idOrder);
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.warn('[production] crmDeals orders fallback embed:', e.message);
    const { data } = await supabase
      .from('crm_leads')
      .select(CRM_DEALS_FOR_PROJECT_MIN)
      .in('id', idOrder);
    rows = data || [];
  }
  const rank = new Map(idOrder.map((id, i) => [String(id), i]));
  rows.sort((a, b) => (rank.get(String(a.id)) ?? 999) - (rank.get(String(b.id)) ?? 999));
  return rows;
}

const ALLOWED_WORKFLOW_STAGE_CACHE_MS = 45_000;
let _allowedWorkflowStageIdsCache = null;
let _allowedWorkflowStageIdsCacheKey = '';
let _allowedWorkflowStageIdsAt = 0;

function invalidateAllowedWorkflowStageIdsCache() {
  _allowedWorkflowStageIdsCache = null;
  _allowedWorkflowStageIdsCacheKey = '';
  _allowedWorkflowStageIdsAt = 0;
}

async function allowedWorkflowStageIdsForPatch(companyId = null) {
  const cacheKey = String(companyId || '__global__');
  const now = Date.now();
  if (
    _allowedWorkflowStageIdsCache
    && _allowedWorkflowStageIdsCacheKey === cacheKey
    && now - _allowedWorkflowStageIdsAt < ALLOWED_WORKFLOW_STAGE_CACHE_MS
  ) {
    return _allowedWorkflowStageIdsCache;
  }
  const ids = new Set();

  // Ưu tiên lấy từ bảng production_pipeline_stages (đầy đủ mapping).
  // Nếu bảng này lỗi/thiếu schema và helper trả null, fallback sang pipeline đã resolve (có cả fallback stages)
  // để tránh chặn thao tác kéo Kanban bằng stage_id hợp lệ.
  const [pipeRows, workshopMap] = await Promise.all([
    loadProductionPipelineStagesRows(true, companyId),
    getWorkshopStageMap(),
  ]);

  if (pipeRows === null) {
    const { stages } = await getResolvedKanbanStages(companyId);
    (stages || []).forEach((s) => {
      const wid = s.workflow_stage_id || s.workflow_stage?.id || null;
      if (wid) ids.add(String(wid));
    });
  } else {
    (pipeRows || []).forEach((r) => {
      if (r.workflow_stage_id) ids.add(String(r.workflow_stage_id));
    });
  }

  // Luôn cho phép các workflow stage thuộc “xưởng” (để kéo card về các cột workshop chuẩn).
  (workshopMap?.ids || []).forEach((wid) => ids.add(String(wid)));

  _allowedWorkflowStageIdsCache = ids;
  _allowedWorkflowStageIdsCacheKey = cacheKey;
  _allowedWorkflowStageIdsAt = now;
  return ids;
}

async function invalidateProductionPipelineCache() {
  invalidateAllowedWorkflowStageIdsCache();
  await rcInvalidateTags(['production']);
}

// ─── GET /production/pipeline-stages ──
// Hỗ trợ filter workshop_type_id:
//   - không truyền        → trả tất cả (Global + theo loại) cho công ty
//   - 'global'            → chỉ cột không gắn loại (workshop_type_id IS NULL)
//   - <uuid>              → cột gắn loại đó + cột Global
r.get('/pipeline-stages', requirePermission('projects', 'view'), responseCache({ ttl: 300, scope: 'company', tags: ['production'] }), async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const company_id = effectiveWorkshopCompanyId(req, req.query.company_id);
    const rawWorkshopType = req.query.workshop_type_id;
    const strictCompany = req.query.strict_company === 'true';
    const rows = await loadProductionPipelineStagesRows(includeInactive, company_id);
    if (rows === null) {
      const { stages } = await getResolvedKanbanStages(company_id);
      return res.json(stages);
    }
    let out = (rows || []).map((r) => normalizePipelineStageApiRow(r));
    // strict_company=true: không fallback sang bộ Global khi đang cấu hình theo 1 công ty cụ thể.
    if (strictCompany && company_id) {
      out = out.filter((s) => String(s.company_id || '') === String(company_id));
    }
    if (rawWorkshopType !== undefined && rawWorkshopType !== null && rawWorkshopType !== '') {
      const wkt = String(rawWorkshopType);
      if (wkt.toLowerCase() === 'global') {
        out = out.filter((s) => (
          !s.workshop_type_id
          || s.bucket_slug === INTAKE_BUCKET
        ));
      } else {
        out = out.filter((s) => (
          !s.workshop_type_id
          || String(s.workshop_type_id) === wkt
          || s.bucket_slug === INTAKE_BUCKET
        ));
      }
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/pipeline-stages', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên cột' });
    const insertCompanyId = effectiveWorkshopCompanyId(req, b.company_id);
    if (b.bucket_slug && b.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    const scopedStages = await loadProductionPipelineStagesRows(true, insertCompanyId);
    if (b.bucket_slug === INTAKE_BUCKET) {
      const hasIntake = (scopedStages || []).some((r) => r.bucket_slug === INTAKE_BUCKET);
      if (hasIntake) return res.status(400).json({ error: 'Đã có cột chờ vào xưởng trong phạm vi công ty này' });
    }
    const nextOrder = (scopedStages || []).reduce((m, r) => Math.max(m, Number(r.order_index) || 0), 0) + 1;
    const isIntake = b.bucket_slug === INTAKE_BUCKET;
    const wantsHandover = !isIntake && !!b.is_handover_to_logistics;
    const wantsSwitchType = !isIntake && !wantsHandover && !!(b.is_switch_workshop_type ?? b.converts_workshop_type);
    const targetWorkshopTypeId = wantsSwitchType ? (b.target_workshop_type_id || null) : null;

    const workshopTypeId = isIntake ? null : (b.workshop_type_id || null);
    if (workshopTypeId) {
      await assertWorkshopTypeForCompany(workshopTypeId, insertCompanyId);
    }
    if (targetWorkshopTypeId) {
      await assertWorkshopTypeForCompany(targetWorkshopTypeId, insertCompanyId);
      if (workshopTypeId && String(workshopTypeId) === String(targetWorkshopTypeId)) {
        return res.status(400).json({ error: 'Phân loại đích phải khác phân loại hiện tại của cột' });
      }
    }
    if (wantsSwitchType && !targetWorkshopTypeId) {
      return res.status(400).json({ error: 'Chọn phân loại đích khi bật «Chuyển phân loại»' });
    }

    const insertPayload = {
      name: b.name.trim(),
      color: b.color || '#0f766e',
      icon: b.icon || '📋',
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      progress_percent: b.progress_percent ?? null,
      workflow_stage_id: isIntake ? null : (b.workflow_stage_id || null),
      bucket_slug: b.bucket_slug || null,
      is_handover_to_logistics: wantsHandover,
      converts_workshop_type: wantsSwitchType,
      target_workshop_type_id: targetWorkshopTypeId,
      crm_sync_type: isIntake || wantsHandover || wantsSwitchType ? null : (b.crm_sync_type || null),
      crm_target_stage_id: isIntake || wantsHandover || wantsSwitchType ? null : (b.crm_target_stage_id || null),
      company_id: insertCompanyId || null,
      workshop_type_id: workshopTypeId,
      ...parseProductionStageKpiBody(b),
    };

    const data = await insertProductionPipelineStageRow(supabase, insertPayload);
    await invalidateProductionPipelineCache();
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : friendlyPipelineStageDbError(e) });
  }
});

r.put('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const switchOn = b.is_switch_workshop_type === true || b.converts_workshop_type === true;
    const switchOff = b.is_switch_workshop_type === false || b.converts_workshop_type === false;
    const { data: existingRow, error: existErr } = await supabase
      .from('production_pipeline_stages')
      .select('bucket_slug, company_id, workshop_type_id, is_handover_to_logistics')
      .eq('id', req.params.id)
      .maybeSingle();
    if (existErr) throw existErr;
    if (!existingRow) {
      return res.status(404).json({ error: 'Không tìm thấy cột pipeline' });
    }
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_active', 'workflow_stage_id', 'bucket_slug',
      'is_handover_to_logistics', 'converts_workshop_type', 'target_workshop_type_id',
      'crm_sync_type', 'crm_target_stage_id', 'progress_percent',
      'workshop_type_id'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (b.is_switch_workshop_type !== undefined && b.converts_workshop_type === undefined) {
      update.converts_workshop_type = b.is_switch_workshop_type;
    }
    Object.assign(update, parseProductionStageKpiBody(b));
    if (existingRow?.bucket_slug === INTAKE_BUCKET) {
      update.workflow_stage_id = null;
      update.is_handover_to_logistics = false;
      update.converts_workshop_type = false;
      update.target_workshop_type_id = null;
      update.crm_sync_type = null;
      update.crm_target_stage_id = null;
      update.workshop_type_id = null;
      delete update.default_probability;
      delete update.sla_days;
      delete update.counts_as_won_revenue;
      delete update.counts_as_completed_revenue;
      delete update.counts_as_collected_revenue;
      delete update.requires_deadline;
    }
    if (update.bucket_slug && update.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }

    if (b.is_handover_to_logistics === true) {
      update.crm_sync_type = null;
      update.crm_target_stage_id = null;
      update.converts_workshop_type = false;
      update.target_workshop_type_id = null;
    }
    if (switchOn) {
      update.crm_sync_type = null;
      update.crm_target_stage_id = null;
      update.is_handover_to_logistics = false;
      update.converts_workshop_type = true;
      const tgt = update.target_workshop_type_id ?? existingRow?.target_workshop_type_id ?? null;
      if (!tgt) {
        return res.status(400).json({ error: 'Chọn phân loại đích khi bật «Chuyển phân loại»' });
      }
      const srcType = update.workshop_type_id ?? existingRow?.workshop_type_id ?? null;
      if (srcType && String(srcType) === String(tgt)) {
        return res.status(400).json({ error: 'Phân loại đích phải khác phân loại hiện tại của cột' });
      }
      const scopeCompanyId = existingRow?.company_id || effectiveWorkshopCompanyId(req, b.company_id);
      await assertWorkshopTypeForCompany(tgt, scopeCompanyId);
    }
    if (switchOff) {
      update.converts_workshop_type = false;
      update.target_workshop_type_id = null;
    }
    if (update.target_workshop_type_id) {
      const scopeCompanyId = existingRow?.company_id || effectiveWorkshopCompanyId(req, b.company_id);
      await assertWorkshopTypeForCompany(update.target_workshop_type_id, scopeCompanyId);
    }

    if (update.workshop_type_id !== undefined && update.workshop_type_id) {
      const scopeCompanyId = existingRow?.company_id || effectiveWorkshopCompanyId(req, b.company_id);
      await assertWorkshopTypeForCompany(update.workshop_type_id, scopeCompanyId);
    }

    let u = stripHandoverFields(mapSwitchWorkshopTypeBodyToDb({ ...update }));
    const tryUpdate = () => supabase
      .from('production_pipeline_stages')
      .update(u)
      .eq('id', req.params.id);

    let { error } = await tryUpdate();
    for (let pass = 0; pass < 3 && error; pass += 1) {
      let changed = false;
      for (const [isErr, mark] of INSERT_COLUMN_RETRIES) {
        if (error && isErr(error)) {
          mark();
          u = stripHandoverFields(mapSwitchWorkshopTypeBodyToDb({ ...update }));
          changed = true;
        }
      }
      if (error?.message?.includes('crm_sync_type')) {
        const { crm_sync_type: _omit, ...rest } = u;
        u = rest;
        changed = true;
      }
      if (!changed) break;
      ({ error } = await tryUpdate());
    }
    if (error) throw error;

    const { data, error: fetchErr } = await fetchProductionPipelineStageById(supabase, req.params.id);
    if (fetchErr) throw fetchErr;
    await invalidateProductionPipelineCache();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : friendlyPipelineStageDbError(e) });
  }
});

r.delete('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const stageId = req.params.id;
    const { data: row, error: fetchErr } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, bucket_slug, company_id, workshop_type_id')
      .eq('id', stageId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) {
      await invalidateProductionPipelineCache();
      return res.json({ message: 'Cột pipeline đã được xóa', already_deleted: true });
    }
    if (row.bucket_slug === INTAKE_BUCKET) {
      return res.status(400).json({ error: 'Không xóa cột deal thắng — chỉ có thể ẩn' });
    }

    const [{ count: dealCount }, { count: tplCount }] = await Promise.all([
      supabase
        .from('crm_leads')
        .select('id', { count: 'exact', head: true })
        .eq('sx_pipeline_stage_id', stageId),
      supabase
        .from('workshop_task_templates')
        .select('id', { count: 'exact', head: true })
        .eq('production_stage_id', stageId),
    ]);

    if ((dealCount || 0) > 0) {
      return res.status(400).json({
        error: `Không xóa được — ${dealCount} deal đang ở cột «${row.name}». Chuyển deal sang cột khác trên Kanban SX trước.`,
      });
    }

    // Gỡ liên kết mẫu nhiệm vụ (tránh CASCADE xóa nhầm bộ mẫu)
    if ((tplCount || 0) > 0) {
      await supabase
        .from('workshop_task_templates')
        .update({ production_stage_id: null, updated_at: new Date().toISOString() })
        .eq('production_stage_id', stageId);
    }

    const { error: delErr } = await supabase
      .from('production_pipeline_stages')
      .delete()
      .eq('id', stageId);
    if (delErr) {
      const msg = String(delErr.message || '');
      if (msg.includes('foreign key') || delErr.code === '23503') {
        return res.status(400).json({
          error: 'Không xóa được — cột đang được tham chiếu bởi dữ liệu khác. Hãy ẩn cột thay vì xóa.',
        });
      }
      throw delErr;
    }
    await invalidateProductionPipelineCache();
    const extra = (tplCount || 0) > 0
      ? ` Đã gỡ ${tplCount} mẫu nhiệm vụ khỏi cột này.`
      : '';
    res.json({ message: `Đã xóa cột «${row.name}».${extra}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi xóa cột pipeline' });
  }
});

r.put('/pipeline-stages-reorder', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { stages } = req.body;
    if (!Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ error: 'Thiếu danh sách cột cần sắp xếp' });
    }
    const stageIds = stages.map((s) => s?.id).filter(Boolean);
    const { data: existingRows, error: existErr } = await supabase
      .from('production_pipeline_stages')
      .select('id')
      .in('id', stageIds);
    if (existErr) throw existErr;
    const existingIds = new Set((existingRows || []).map((r) => String(r.id)));
    const missing = stageIds.filter((id) => !existingIds.has(String(id)));
    if (missing.length) {
      return res.status(404).json({
        error: 'Một số cột pipeline không còn tồn tại — tải lại trang và thử lại.',
        missing_stage_ids: missing,
      });
    }
    for (const s of stages) {
      if (!s?.id) continue;
      const { error } = await supabase
        .from('production_pipeline_stages')
        .update({ order_index: s.order_index })
        .eq('id', s.id);
      if (error) throw error;
    }
    await invalidateProductionPipelineCache();
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** Thêm cột mẫu pipeline SX đầy đủ (bản vẽ → vật tư → CNC → lắp ráp → sơn → QC → đóng gói → bàn giao VC nếu chưa có cột handover) — idempotent */
r.post('/pipeline-stages/seed-samples', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { ensureSampleProductionPipelineStages } = require('../helpers/productionPipelineSampleStages');
    const company_id = effectiveWorkshopCompanyId(req, req.body?.company_id);
    const rawTypeId = req.body?.workshop_type_id;
    let workshop_type_id = null;
    if (rawTypeId !== undefined && rawTypeId !== null && rawTypeId !== '' && String(rawTypeId).toLowerCase() !== 'global') {
      workshop_type_id = String(rawTypeId);
    }
    const out = await ensureSampleProductionPipelineStages(supabase, company_id, { workshopTypeId: workshop_type_id });
    invalidateAllowedWorkflowStageIdsCache();
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Tạo nhanh 2 phân loại (Tủ bếp, Cánh kính) + 22 cột pipeline mặc định cho công ty.
// Dùng cho công ty mới hoặc bổ sung. Idempotent: chạy lại không nhân đôi.
r.post('/pipeline-stages/seed-default-kitchen-glass', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { ensureKitchenAndGlassDefaults } = require('../helpers/productionDefaultKitchenGlassPipelines');
    const company_id = effectiveWorkshopCompanyId(req, req.body?.company_id);
    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });
    const out = await ensureKitchenAndGlassDefaults(supabase, company_id);
    invalidateAllowedWorkflowStageIdsCache();
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Danh sách công ty bên ngoài (đối tác B2B) — theo công ty SX
r.get('/external-companies', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const companyId = effectiveWorkshopCompanyId(req, req.query.company_id);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });
    const { listProductionExternalCompanies } = require('../helpers/productionExternalCompanies');
    const items = await listProductionExternalCompanies(companyId);
    res.json({ items });
  } catch (e) {
    console.error('[production/external-companies GET]', e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/external-companies', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = effectiveWorkshopCompanyId(req, b.company_id || b.production_company_id);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });
    const { upsertProductionExternalCompany, normalizeExternalCompanyName } = require('../helpers/productionExternalCompanies');
    const nameTrim = normalizeExternalCompanyName(b.name);
    if (!nameTrim) return res.status(400).json({ error: 'Nhập tên công ty' });
    const saved = await upsertProductionExternalCompany({
      productionCompanyId: companyId,
      name: nameTrim,
      userId: req.user.userId,
    });
    if (!saved) {
      return res.status(503).json({ error: 'Chưa cài bảng danh sách công ty bên ngoài — chạy migration 302' });
    }
    res.status(saved.created ? 201 : 200).json(saved);
  } catch (e) {
    console.error('[production/external-companies POST]', e);
    res.status(500).json({ error: e.message });
  }
});

// Tạo đơn trực tiếp trên Kanban SX — không qua CRM (pipeline Deal tự sinh nội bộ).
r.post('/workshop-intake', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = effectiveWorkshopCompanyId(req, b.company_id);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });

    const { createWorkshopIntakeOrder } = require('../helpers/createWorkshopIntake');
    const result = await createWorkshopIntakeOrder({
      req,
      userId: req.user.userId,
      companyId,
      workshopTypeId: b.workshop_type_id || null,
      title: b.title,
      customerId: b.customer_id || null,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      customerEmail: b.customer_email,
      installAddress: b.install_address,
      regionId: b.region_id || null,
      estimatedValue: b.estimated_value,
      description: b.description,
      externalCompanyName: b.external_company_name,
    });

    if (!result.ok) {
      return res.status(result.statusCode || 500).json({
        error: result.error,
        deal_id: result.deal_id,
      });
    }

    rcInvalidateTags(['production', 'crm']);
    res.status(201).json({
      project_id: result.project_id,
      project_code: result.project_code,
      project_name: result.project_name,
      tasks_created: result.tasks_created,
      deal_id: result.deal_id,
      deal_code: result.deal_code,
    });
  } catch (e) {
    console.error('[production/workshop-intake]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/dashboard ──
r.get('/dashboard', requirePermission('projects', 'view'), responseCache({ ttl: 30, scope: 'user', tags: ['production'] }), async (req, res) => {
  try {
    const { division_id, company_id: companyIdQuery, workshop_type_id } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);
    const { ids: stageIds } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    // Truyền workshop_type_id xuống resolver để pipeline Kanban khớp với phân loại đang chọn
    const { stages: kanbanStages } = await getResolvedKanbanStages(company_id, {
      workshopTypeId: workshop_type_id || null,
    });
    const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);

    const orFilter = buildScopeOrFilter(stageIds, wonIds);
    /**
     * Modes:
     *  - 'full': join workshop_type + scalar workshop_type_id
     *  - 'no_join': chỉ scalar workshop_type_id (FK chưa nạp được)
     *  - 'no_col':  bỏ cả workshop_type_id (DB chưa migrate cột — migration 251)
     */
    const runQuery = (mode = 'full') => {
      const wtScalar = mode === 'no_col' ? '' : ', workshop_type_id';
      const wtJoin = mode === 'full' ? ', workshop_type:workshop_project_types(id, name, applies_to)' : '';
      return supabase
        .from('projects')
        .select(`
          id, code, name, estimated_value, production_value, status, deadline, created_at, company_id,
          sx_pipeline_stage_entered_at, sx_kanban_deadline_at, sx_kanban_deadline_reason,
          current_stage_id${wtScalar},
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          tasks(id, status)${wtJoin}
        `)
        .or(orFilter);
    };

    // workshop_type_id='none' → lọc deal CHƯA phân loại (workshop_type_id IS NULL)
    const wantsUnclassified = String(workshop_type_id || '').toLowerCase() === 'none';
    const applyWorkshopTypeFilter = (q) => {
      if (wantsUnclassified) return q.is('workshop_type_id', null);
      if (workshop_type_id) return q.eq('workshop_type_id', workshop_type_id);
      return q;
    };

    let query = runQuery('full');
    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = await applyProductionCompanyScopeFilter(query, company_id);
    query = applyWorkshopTypeFilter(query);

    let projects = [];
    let { data, error } = await query.order('created_at', { ascending: false });

    // Bước 1: nếu lỗi do FK embed chưa nạp → bỏ join, vẫn giữ scalar workshop_type_id
    const needsNoJoin = error && (
      error.message?.includes('workshop_project_types') ||
      (error.message?.includes('relationship') && !error.message?.includes('workflow_stages'))
    );
    if (needsNoJoin) {
      let q2 = runQuery('no_join');
      if (division_id) q2 = q2.eq('division_id', division_id);
      if (company_id) q2 = await applyProductionCompanyScopeFilter(q2, company_id);
      q2 = applyWorkshopTypeFilter(q2);
      ({ data, error } = await q2.order('created_at', { ascending: false }));
    }
    // Bước 2: nếu vẫn lỗi do cột workshop_type_id chưa tồn tại trên bảng projects → fallback hoàn toàn
    if (error && error.message?.includes('workshop_type_id')) {
      let q3 = runQuery('no_col');
      if (division_id) q3 = q3.eq('division_id', division_id);
      if (company_id) q3 = await applyProductionCompanyScopeFilter(q3, company_id);
      // Không thể filter theo workshop_type_id khi DB chưa có cột — bỏ filter này
      ({ data, error } = await q3.order('created_at', { ascending: false }));
    }
    // Bước 3: chưa migrate deadline thẻ SX
    if (error && /sx_kanban_deadline/.test(error.message || '')) {
      const runNoKanbanDl = (mode = 'full') => {
        const wtScalar = mode === 'no_col' ? '' : ', workshop_type_id';
        const wtJoin = mode === 'full' ? ', workshop_type:workshop_project_types(id, name, applies_to)' : '';
        return supabase
          .from('projects')
          .select(`
          id, code, name, estimated_value, production_value, status, deadline, created_at, company_id,
          sx_pipeline_stage_entered_at,
          current_stage_id${wtScalar},
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          tasks(id, status)${wtJoin}
        `)
          .or(orFilter);
      };
      let qDl = runNoKanbanDl(needsNoJoin ? 'no_join' : (error.message?.includes('workshop_type_id') ? 'no_col' : 'full'));
      if (division_id) qDl = qDl.eq('division_id', division_id);
      if (company_id) qDl = await applyProductionCompanyScopeFilter(qDl, company_id);
      qDl = applyWorkshopTypeFilter(qDl);
      ({ data, error } = await qDl.order('created_at', { ascending: false }));
    }
    if (error) throw error;
    projects = data || [];

    const enriched = await enrichProjectsForSx(projects, wonIds, company_id, workshop_type_id || null);
    const workflowProjects = enriched.map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
      task_total: project.tasks?.length || 0,
      done_tasks: project.tasks?.filter((t) => t.status === 'done').length || 0,
    }));
    const enhancedProjects = await attachCrmProductionTaskStatsToProjects(workflowProjects);

    const projectIds = enhancedProjects.map((p) => p.id).filter(Boolean);
    const dealProbByProjectId = {};
    if (projectIds.length) {
      const { data: dealRows } = await supabase
        .from('crm_leads')
        .select('project_id, probability')
        .eq('type', 'deal')
        .in('project_id', projectIds);
      for (const d of dealRows || []) {
        if (d.project_id) dealProbByProjectId[String(d.project_id)] = d.probability;
      }
    }
    const projectsWithDealProb = enhancedProjects.map((p) => ({
      ...p,
      deal_probability: dealProbByProjectId[String(p.id)] ?? null,
    }));
    const revenueKpis = computeSxRevenueKpis(projectsWithDealProb, sortedKanban, dealProbByProjectId);

    const intakeCount = projectsWithDealProb.filter((p) => p.sx_intake).length;

    const kpis = {
      total_projects: projectsWithDealProb.length,
      producing: revenueKpis.producing,
      awaiting_delivery: revenueKpis.awaiting_delivery,
      shipped: revenueKpis.shipped,
      delivering: revenueKpis.awaiting_delivery,
      customer_care: projectsWithDealProb.filter((project) => project.current_stage?.slug === 'customer-care' || project.status === 'warranty').length,
      completed: projectsWithDealProb.filter((project) => project.status === 'completed').length,
      overdue: revenueKpis.overdue,
      intake_pending: intakeCount,
      total_value: projectsWithDealProb.reduce((sum, project) => sum + (project.production_value || 0), 0),
      avg_progress: projectsWithDealProb.length
        ? Math.round(projectsWithDealProb.reduce((sum, project) => sum + (project.progress || 0), 0) / projectsWithDealProb.length)
        : 0,
      won_revenue_value: revenueKpis.won_revenue_value,
      completed_revenue_value: revenueKpis.completed_revenue_value,
      collected_revenue_value: revenueKpis.collected_revenue_value,
      debt_revenue_value: revenueKpis.debt_revenue_value,
      debt_count: revenueKpis.debt_count,
      collected_count: revenueKpis.collected_count,
      weighted_pipeline_value: revenueKpis.weighted_pipeline_value,
    };

    const pipeline = buildPipelineSummary(sortedKanban, projectsWithDealProb);

    res.json({
      kpis,
      pipeline,
      projects: projectsWithDealProb,
      won_deal_project_ids: wonIds,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects ──
r.get('/projects', requirePermission('projects', 'view'), responseCache({ ttl: 20, scope: 'user', tags: ['production'] }), async (req, res) => {
  try {
    const {
      search, priority, page = 1, limit = 100, division_id, company_id: companyIdQuery, stage_slug, sx_intake, workshop_type_id,
    } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const offset = (parsedPage - 1) * parsedLimit;
    const { ids: stageIds } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    // Truyền workshop_type_id để pipeline khớp với phân loại đang lọc trên dashboard
    const { stages: kanbanStages } = await getResolvedKanbanStages(company_id, {
      workshopTypeId: workshop_type_id || null,
    });
    const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);

    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, production_value, priority, deadline, ${MIGRATION_300_COLS} created_at, status, notes, company_id,
        production_deadline, production_note, vc_kanban_column_id,
        current_stage_id, workshop_type_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        vc_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug),
        customer:customers(id, full_name, phone),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        supervisor:users!projects_supervisor_id_fkey(id, full_name),
        ${CRM_DEALS_PROJECT_EMBED},
        workshop_type:workshop_project_types(id, name, applies_to),
        tasks(id, status)
      `, { count: 'exact' });

    if (String(sx_intake) === '1') {
      if (!wonIds.length) {
        return res.json({ projects: [], total: 0, page: parsedPage, totalPages: 0 });
      }
      query = query.in('id', wonIds);
      if (stageIds.length) {
        query = query.or(`current_stage_id.is.null,current_stage_id.not.in.(${stageIds.join(',')})`);
      }
    } else {
      query = query.or(buildScopeOrFilter(stageIds, wonIds));
    }

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = await applyProductionCompanyScopeFilter(query, company_id);
    // workshop_type_id='none' → lọc deal CHƯA phân loại (workshop_type_id IS NULL)
    const wantsUnclassified = String(workshop_type_id || '').toLowerCase() === 'none';
    if (wantsUnclassified) query = query.is('workshop_type_id', null);
    else if (workshop_type_id) query = query.eq('workshop_type_id', workshop_type_id);

    if (search) {
      const searchPattern = `%${search}%`;
      query = query.or(`code.ilike.${searchPattern},name.ilike.${searchPattern},notes.ilike.${searchPattern}`);
    }

    if (priority) query = query.eq('priority', priority);
    if (stage_slug && String(sx_intake) !== '1') {
      if (stage_slug === INTAKE_BUCKET) {
        query = query.in('id', wonIds);
        if (stageIds.length) {
          query = query.or(`current_stage_id.is.null,current_stage_id.not.in.(${stageIds.join(',')})`);
        }
      } else {
        query = query.eq('current_stage.slug', stage_slug);
      }
    }

    query = query.order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + parsedLimit - 1);

    let { data: projects, error, count } = await query;
    const needsFallback = error && (
      error.message?.includes('production_deadline') ||
      error.message?.includes('vc_kanban_column_id') ||
      error.message?.includes('logistics_pipeline_stages') ||
      error.message?.includes('workshop_project_types') ||
      error.message?.includes('workshop_type_id') ||
      error.message?.includes('relationship') ||
      isOrderDeliveryDateMissingError(error) ||
      isExternalCompanyNameMissingError(error)
    );
    if (needsFallback) {
      // Migration not yet applied or FK not ready — retry without new columns
      let fallbackQuery = supabase
        .from('projects')
        .select(`
          id, code, name, estimated_value, production_value, priority, deadline, created_at, status, notes,
          production_deadline, production_note, workshop_type_id,
          current_stage_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
          production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
          sales_person:users!projects_sales_person_id_fkey(id, full_name),
          supervisor:users!projects_supervisor_id_fkey(id, full_name),
          ${CRM_DEALS_PROJECT_EMBED_LEGACY},
          tasks(id, status)
        `, { count: 'exact' });
      if (String(sx_intake) === '1') {
        if (!wonIds.length) return res.json({ projects: [], total: 0, page: parsedPage, totalPages: 0 });
        fallbackQuery = fallbackQuery.in('id', wonIds);
        if (stageIds.length) fallbackQuery = fallbackQuery.or(`current_stage_id.is.null,current_stage_id.not.in.(${stageIds.join(',')})`);
      } else {
        fallbackQuery = fallbackQuery.or(buildScopeOrFilter(stageIds, wonIds));
      }
      if (search) fallbackQuery = fallbackQuery.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
      if (priority) fallbackQuery = fallbackQuery.eq('priority', priority);
      if (division_id) fallbackQuery = fallbackQuery.eq('division_id', division_id);
      if (company_id) fallbackQuery = await applyProductionCompanyScopeFilter(fallbackQuery, company_id);
      if (wantsUnclassified) fallbackQuery = fallbackQuery.is('workshop_type_id', null);
      else if (workshop_type_id) fallbackQuery = fallbackQuery.eq('workshop_type_id', workshop_type_id);
      fallbackQuery = fallbackQuery.order('deadline', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).range(offset, offset + parsedLimit - 1);
      ({ data: projects, error, count } = await fallbackQuery);
    }
    if (error) throw error;

    const enrichedSx = await enrichProjectsForSx(projects, wonIds, company_id, workshop_type_id || null);
    const { attachProductionStaffToProjects, backfillMissingProductionStaff } = require('../helpers/productionWorkshopTypeStaff');
    try {
      await backfillMissingProductionStaff(enrichedSx);
    } catch (bfErr) {
      console.warn('[production/kanban] backfill staff:', bfErr.message);
    }
    const enrichedWithStaff = await attachProductionStaffToProjects(enrichedSx);
    const workflowProjects = enrichedWithStaff.map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
      task_total: project.tasks?.length || 0,
      done_tasks: project.tasks?.filter((task) => task.status === 'done').length || 0,
      is_overdue: Boolean(project.deadline && new Date(project.deadline) < new Date() && project.status !== 'completed'),
      is_production_overdue: Boolean(project.production_deadline && new Date(project.production_deadline) < new Date() && project.status !== 'completed'),
    }));
    const enhanced = await attachCrmProductionTaskStatsToProjects(workflowProjects);

    res.json({
      projects: enhanced,
      total: count || enhanced.length,
      page: parsedPage,
      totalPages: Math.ceil((count || enhanced.length) / parsedLimit),
      won_deal_project_ids: wonIds,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects/:id ──
/** Columns added in migration 76 — included here, falls back gracefully if migration not yet applied */
const MIGRATION_76_COLS = 'production_deadline, production_note,';
/** Columns added in migration 300 — ngày đặt / giao hàng trên dự án SX */
const MIGRATION_300_COLS = 'order_date, delivery_date,';
/** Embed CRM deals — migration 301 thêm external_company_name */
const CRM_DEALS_PROJECT_EMBED = 'crm_deals:crm_leads(id, type, region_id, created_at, external_company_name, crm_region:company_regions(id, name, code))';
const CRM_DEALS_PROJECT_EMBED_LEGACY = 'crm_deals:crm_leads(id, type, region_id, created_at, crm_region:company_regions(id, name, code))';
function isExternalCompanyNameMissingError(err) {
  const m = String(err?.message || '');
  return m.includes('external_company_name');
}
function stripMigration300Cols(sel) {
  return sel.replace(MIGRATION_300_COLS, '');
}
function isOrderDeliveryDateMissingError(err) {
  const m = String(err?.message || '');
  return m.includes('order_date') || m.includes('delivery_date');
}
/**
 * Workshop type fields (migration 97 + 251).
 * `workshop_type_id` scalar + embed `workshop_type:workshop_project_types(...)` để frontend
 * hiển thị badge "Đã phân loại / Chưa phân loại" và load pipeline stepper theo loại.
 */
const WORKSHOP_TYPE_SCALAR = 'workshop_type_id,';
const WORKSHOP_TYPE_EMBED = 'workshop_type:workshop_project_types(id, name, applies_to),';

const PROJECT_DETAIL_SELECT = `
        id, company_id, code, name, description, estimated_value, production_value, priority, deadline, ${MIGRATION_300_COLS} ${MIGRATION_76_COLS} status, notes, created_at,
        current_stage_id, ${WORKSHOP_TYPE_SCALAR}
        ${WORKSHOP_TYPE_EMBED}
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address, city),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        sales_person:users!projects_sales_person_id_fkey(id, full_name, avatar, email),
        project_manager:users!projects_project_manager_id_fkey(id, full_name, avatar, email),
        supervisor:users!projects_supervisor_id_fkey(id, full_name, avatar, email),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        shipping_person:users!projects_shipping_person_id_fkey(id, full_name, avatar),
        installation_person:users!projects_installation_person_id_fkey(id, full_name, avatar),
        care_person:users!projects_care_person_id_fkey(id, full_name, avatar),
        tasks(
          id, title, description, status, order_index, priority, deadline, due_date, metadata,
          assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
          stage:workflow_stages(id, slug, name, color),
          task_participants(id, role, user_id),
          checklists:task_checklists(id, title, is_completed, order_index)
        ),
        stage_transitions(
          id, from_stage_id, to_stage_id, created_at,
          from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(id, name, slug),
          to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(id, name, slug),
          user:users(id, full_name)
        )
      `;

// Fallback select khi DB thiếu cột/relationship mới (FK users, task_checklists, participants…)
// Mục tiêu: vẫn mở được chi tiết dự án + hiển thị stage/tag đúng.
const PROJECT_DETAIL_SELECT_MIN = `
        id, company_id, code, name, description, estimated_value, production_value, priority, deadline, ${MIGRATION_300_COLS} status, notes, created_at,
        current_stage_id, ${WORKSHOP_TYPE_SCALAR}
        ${WORKSHOP_TYPE_EMBED}
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address, city),
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        tasks(
          id, title, description, status, order_index, priority, deadline, due_date, metadata,
          stage:workflow_stages(id, slug, name, color)
        ),
        stage_transitions(
          id, from_stage_id, to_stage_id, created_at,
          from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(id, name, slug),
          to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(id, name, slug)
        )
      `;

/**
 * Strip workshop_type fields khi DB chưa có (migration 97/251 chưa apply) hoặc
 * PostgREST schema cache chưa nạp FK `projects.workshop_type_id → workshop_project_types`.
 * Bỏ embed trước, nếu vẫn lỗi sẽ bỏ cả scalar.
 */
function stripWorkshopTypeEmbed(sel) {
  return sel.replace(WORKSHOP_TYPE_EMBED, '');
}
function stripWorkshopTypeAll(sel) {
  return sel.replace(WORKSHOP_TYPE_EMBED, '').replace(WORKSHOP_TYPE_SCALAR, '');
}
function isWorkshopTypeEmbedError(err) {
  const m = String(err?.message || '');
  return m.includes('workshop_project_types');
}
function isWorkshopTypeColumnError(err) {
  const m = String(err?.message || '');
  return m.includes('workshop_type_id');
}

r.get('/projects/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bySlug } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    const wonSet = new Set(wonIds);

    let projectId = id;
    let { data: project, error } = await supabase
      .from('projects')
      .select(PROJECT_DETAIL_SELECT)
      .eq('id', projectId)
      .single();

    // Migration 76 not yet applied — retry without new columns
    if (error && error.message?.includes('production_deadline')) {
      const fallbackSelect = PROJECT_DETAIL_SELECT.replace(MIGRATION_76_COLS, '');
      ({ data: project, error } = await supabase.from('projects').select(fallbackSelect).eq('id', projectId).single());
    }
    // Migration 300 not yet applied — retry without order_date / delivery_date
    if (error && isOrderDeliveryDateMissingError(error)) {
      ({ data: project, error } = await supabase
        .from('projects')
        .select(stripMigration300Cols(PROJECT_DETAIL_SELECT))
        .eq('id', projectId)
        .single());
    }
    // FK workshop_project_types chưa nạp được trên PostgREST → bỏ embed, giữ scalar workshop_type_id
    if (error && isWorkshopTypeEmbedError(error)) {
      ({ data: project, error } = await supabase
        .from('projects')
        .select(stripWorkshopTypeEmbed(PROJECT_DETAIL_SELECT))
        .eq('id', projectId)
        .single());
    }
    // Cột workshop_type_id chưa tồn tại (migration 97/251 chưa chạy) → bỏ cả scalar
    if (error && isWorkshopTypeColumnError(error)) {
      ({ data: project, error } = await supabase
        .from('projects')
        .select(stripWorkshopTypeAll(PROJECT_DETAIL_SELECT))
        .eq('id', projectId)
        .single());
    }
    // Relationship/columns not ready — retry with minimal select (no optional embeds)
    if (error && (error.message?.includes('relationship') || error.message?.includes('does not exist'))) {
      let minSel = PROJECT_DETAIL_SELECT_MIN;
      if (isWorkshopTypeEmbedError(error)) minSel = stripWorkshopTypeEmbed(minSel);
      if (isWorkshopTypeColumnError(error)) minSel = stripWorkshopTypeAll(minSel);
      ({ data: project, error } = await supabase.from('projects').select(minSel).eq('id', projectId).single());
    }

    if (error || !project) {
      const { data: bareProject } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
      if (bareProject && error) {
        console.error('[production] PROJECT_DETAIL_SELECT failed:', error?.message || error);
        return res.status(500).json({
          error: 'Lỗi tải chi tiết dự án',
          details: error?.message || String(error),
          project_id: projectId,
        });
      }

      const { data: leadRow, error: leadErr } = await supabase
        .from('crm_leads')
        .select('project_id, title, type, stage_id')
        .eq('id', id)
        .maybeSingle();
      if (leadErr) {
        console.warn('[production] crm_leads by id:', leadErr.message);
      }

      if (leadRow && !leadRow.project_id) {
        return res.status(404).json({
          error: 'Project not found',
          reason: 'deal_without_project',
          hint: 'Uuid trùng với một bản ghi CRM nhưng chưa có project_id. Chuyển deal sang Thắng (tự tạo dự án) hoặc tạo dự án từ deal, rồi mở /sx/projects/{project_id} — project_id xem ở API chi tiết deal hoặc DB.',
          crm_lead_id: id,
          title: leadRow.title || null,
          lead_type: leadRow.type || null,
        });
      }

      if (leadRow?.project_id) {
        projectId = leadRow.project_id;
        const { data: minProj } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
        if (!minProj) {
          return res.status(404).json({
            error: 'Project not found',
            reason: 'broken_project_link',
            hint: 'CRM có project_id nhưng không còn dự án trong bảng projects (có thể đã xóa). Cập nhật hoặc tạo lại dự án cho deal.',
            project_id: leadRow.project_id,
          });
        }
        ({ data: project, error } = await supabase
          .from('projects')
          .select(PROJECT_DETAIL_SELECT)
          .eq('id', projectId)
          .single());
        if (error && error.message?.includes('production_deadline')) {
          const fallbackSelect = PROJECT_DETAIL_SELECT.replace(MIGRATION_76_COLS, '');
          ({ data: project, error } = await supabase.from('projects').select(fallbackSelect).eq('id', projectId).single());
        }
        if (error && isOrderDeliveryDateMissingError(error)) {
          ({ data: project, error } = await supabase
            .from('projects')
            .select(stripMigration300Cols(PROJECT_DETAIL_SELECT))
            .eq('id', projectId)
            .single());
        }
        if (error && isWorkshopTypeEmbedError(error)) {
          ({ data: project, error } = await supabase
            .from('projects')
            .select(stripWorkshopTypeEmbed(PROJECT_DETAIL_SELECT))
            .eq('id', projectId)
            .single());
        }
        if (error && isWorkshopTypeColumnError(error)) {
          ({ data: project, error } = await supabase
            .from('projects')
            .select(stripWorkshopTypeAll(PROJECT_DETAIL_SELECT))
            .eq('id', projectId)
            .single());
        }
        if (error && (error.message?.includes('relationship') || error.message?.includes('does not exist'))) {
          let minSel = PROJECT_DETAIL_SELECT_MIN;
          if (isWorkshopTypeEmbedError(error)) minSel = stripWorkshopTypeEmbed(minSel);
          if (isWorkshopTypeColumnError(error)) minSel = stripWorkshopTypeAll(minSel);
          ({ data: project, error } = await supabase.from('projects').select(minSel).eq('id', projectId).single());
        }
      }
    }

    if (error || !project) {
      return res.status(404).json({
        error: 'Project not found',
        reason: 'unknown_id',
        hint: 'Không có dự án với id này, và không có crm_leads trùng id. Copy đúng projects.id từ danh sách dự án hoặc từ deal.project_id sau khi đã liên kết.',
      });
    }

    const inSxScope = wonSet.has(project.id);

    const { ids: workshopIds } = await getWorkshopStageMap();
    const inWorkshopStage = project.current_stage_id && workshopIds.includes(project.current_stage_id);
    const inWorkshopStatus = WORKSHOP_STATUSES.includes(project.status);
    if (!inSxScope && !inWorkshopStage && !inWorkshopStatus) {
      return res.status(403).json({ error: 'Dự án không thuộc phạm vi sản xuất / deal thắng' });
    }

    const viewerCompanyId = req.user?.company_id || null;
    const ownerCompanyId = project.company_id || null;
    let isPartnerProjectView = false;
    if (viewerCompanyId && ownerCompanyId && String(viewerCompanyId) !== String(ownerCompanyId)) {
      const partnerIds = await getExecutorProjectIdsForCompany(viewerCompanyId);
      if (!partnerIds.includes(project.id)) {
        return res.status(403).json({ error: 'Dự án không thuộc phạm vi công ty của bạn' });
      }
      isPartnerProjectView = true;
    }

    const [documentsRes, commentsRes, incidentsRes] = await Promise.all([
      supabase
        .from('lead_documents')
        .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_comments')
        .select('id, content, attachments, created_at, user:users(id, full_name, avatar)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('project_incidents')
        .select(`id, title, severity, status, created_at, reporter:users!project_incidents_reported_by_fkey(id, full_name)`)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const documents = documentsRes.data || [];
    const isSxTaskDocForProject = (d) => (
      !!d?.project_id
      && !!d?.source_crm_task_id
      && String(d.crm_stage_slug || '').startsWith('sx_')
    );
    const isVisibleSxDoc = (d) => (
      (isDocSharedToWorkshop(d) || isSxTaskDocForProject(d))
      && leadDocVisibleForModuleAndUser(d, 'production', req.user)
    );
    const sharedDocuments = documents.filter(isVisibleSxDoc);
    const hiddenDocuments = documents.filter((doc) => !isVisibleSxDoc(doc));

    let crmSummary = await loadCrmDealsSummaryForProductionProject(project.id);
    // Nếu dự án được tạo thẳng từ module SX (không qua CRM / không có orders),
    // thì auto tạo 1 deal CRM "master" gắn project_id để:
    // - CRMTasksTab có leadId để load/gen sx_* tasks
    // - Đồng bộ pipeline SX→CRM có target stage
    if (!crmSummary?.length) {
      try {
        const { data: existedMaster } = await supabase
          .from('crm_leads')
          .select('id')
          .eq('project_id', project.id)
          .is('parent_lead_id', null)
          .limit(1)
          .maybeSingle();
        if (!existedMaster?.id) {
          const { pipelineId, stageId } = await resolveDefaultPipelineAndStage(project.company_id || null);
          const code = await nextDealCode();
          const insert = {
            code,
            title: project.name || project.code || 'Deal xưởng',
            description: 'Tạo tự động từ module Sản xuất để gắn nhiệm vụ sx_*',
            type: 'deal',
            customer_id: project.customer_id || null,
            company_id: project.company_id || null,
            pipeline_id: pipelineId || null,
            stage_id: stageId || null,
            assigned_to: req.user.userId,
            lead_owner_id: req.user.userId,
            project_id: project.id,
            estimated_value: project.estimated_value || 0,
            created_by: req.user.userId,
          };
          const insRes = await insertCrmDealForProjectResilient(insert);
          if (insRes.error) throw insRes.error;
          const newDeal = insRes.data;

          await applyProductionTemplateToFulfillmentLead({
            leadId: newDeal.id,
            createdBy: req.user.userId,
            requireTemplateCompanyMatch: true,
            dealCompanyId: newDeal.company_id || project.company_id || null,
          });
        }
        crmSummary = await loadCrmDealsSummaryForProductionProject(project.id);
      } catch (e) {
        console.warn('[production] auto create master deal skipped:', e.message);
        project.__crm_deal_autocreate_error = e.message || String(e);
      }
    }

    const leadIds = (crmSummary || []).map((d) => d.id).filter(Boolean);
    let crmSharedNotes = [];
    if (leadIds.length) {
      try {
        const { crmActivityVisibleForModuleAndUser } = require('../helpers/documentShareScope');
        const { data: acts, error: actErr } = await supabase
          .from('crm_activities')
          .select(`
            id, lead_id, type, title, description, activity_date, created_at, shared_to_workshop,
            allowed_share_modules,
            creator:users!crm_activities_created_by_fkey(id, full_name)
          `)
          .in('lead_id', leadIds)
          .eq('shared_to_workshop', true)
          .order('created_at', { ascending: false })
          .limit(80);
        if (actErr) throw actErr;
        crmSharedNotes = (acts || []).filter((a) =>
          crmActivityVisibleForModuleAndUser(a, 'production', req.user),
        );
      } catch (e) {
        console.warn('[production] crmSharedNotes skip:', e.message);
        crmSharedNotes = [];
      }
    }

    const taskProgress = calcTaskProgress(project.tasks);
    const prodSlugs = new Set(['production']);
    const logSlugs = new Set(['delivery', 'shipping', 'installing', 'installation']);
    const productionTasks = (project.tasks || []).filter((t) => prodSlugs.has(t.stage?.slug));
    const logisticsTasks = (project.tasks || []).filter((t) => logSlugs.has(t.stage?.slug));
    const productionTaskProgress = calcTaskProgress(productionTasks);
    const logisticsTaskProgress = calcTaskProgress(logisticsTasks);
    const tasksByStage = {};
    (project.tasks || []).forEach((task) => {
      const stageKey = task.stage?.slug || 'unassigned';
      if (!tasksByStage[stageKey]) tasksByStage[stageKey] = [];
      tasksByStage[stageKey].push(task);
    });

    const workshopPipeline = WORKSHOP_STAGE_SLUGS.map((slug) => bySlug[slug]).filter(Boolean);
    const pcid = project.company_id || project.company?.id || null;
    // Pipeline xưởng + cột Kanban được tách theo `workshop_type_id` (phân loại):
    // - Có loại  → cột riêng của loại đó (+ cột chung không gắn loại).
    // - Chưa phân loại → chỉ cột chung (workshopTypeId = 'none').
    // Nếu KHÔNG truyền workshopTypeId, helper gộp TẤT CẢ cột của TẤT CẢ loại trong công ty,
    // dẫn đến `sx_kanban_column_id` bám nhầm cột của một loại khác (cùng workflow_stage_id "Sản xuất"
    // nhưng khác phân loại) → thông báo "không nằm trong danh sách cột đang hiển thị".
    const projectWorkshopTypeId = project.workshop_type_id
      || project.workshop_type?.id
      || null;
    const wktForResolve = projectWorkshopTypeId || 'none';
    const { stages: kStages } = await getResolvedKanbanStages(pcid ? String(pcid) : null, { workshopTypeId: wktForResolve });
    const sortedK = [...kStages].sort((a, b) => a.order_index - b.order_index);
    const [sxRow] = await enrichProjectsForSx([project], wonIds, pcid ? String(pcid) : null, wktForResolve);

    // Khi cùng `workflow_stage_id` (vd: "Sản xuất") có nhiều cột Kanban khác nhau của cùng phân loại
    // (Tiếp nhận, Thiết kế, Sản xuất, Thu tiền…), `kanbanColumnIdForProject` chỉ match qua
    // `current_stage_id` nên luôn trả cột có `order_index` thấp nhất. Ưu tiên `sx_pipeline_stage_id`
    // lưu trên CRM deal (nguồn sự thật khi user kéo card trên Kanban) — chỉ dùng khi cột đó còn nằm
    // trong danh sách đã lọc theo workshop_type, tránh "rò" cột thuộc phân loại khác.
    const sortedKIdSet = new Set(sortedK.map((c) => String(c.id)));
    const primaryDeal = (crmSummary || [])[0] || null;
    const dealHasHandover = !!primaryDeal?.sx_handover_at;
    const crmStageId = (crmSummary || [])
      .map((d) => d?.sx_pipeline_stage?.id || null)
      .find((sid) => sid && sortedKIdSet.has(String(sid))) || null;
    const intakeCol = sortedK.find((c) => c.bucket_slug === INTAKE_BUCKET);
    const handoverCol = sortedK.find((c) => c.is_handover_to_logistics === true);
    const VC_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);
    const projectInVcFlow = VC_STATUSES.has(String(project.status || ''));
    const defaultFirstColId = intakeCol?.id || sortedK[0]?.id || null;
    const fallbackRepairColId = projectInVcFlow
      ? (handoverCol?.id || defaultFirstColId)
      : defaultFirstColId;

    // Auto-fix dữ liệu cũ: deal lưu sx_pipeline_stage_id lệch khỏi pipeline phân loại
    // hiện tại (vd. cột thuộc phân loại Tủ bếp nhưng project đã đổi sang phân loại Cửa).
    // Reset về cột đầu để Kanban + stepper hiển thị đúng pipeline đang chọn.
    const orphanDeals = (crmSummary || []).filter((d) => (
      d?.sx_pipeline_stage?.id
      && !sortedKIdSet.has(String(d.sx_pipeline_stage.id))
    ));
    if (orphanDeals.length && fallbackRepairColId) {
      try {
        await supabase
          .from('crm_leads')
          .update({ sx_pipeline_stage_id: fallbackRepairColId, updated_at: new Date().toISOString() })
          .in('id', orphanDeals.map((d) => d.id));
        for (const d of orphanDeals) {
          d.sx_pipeline_stage = sortedK.find((c) => String(c.id) === String(fallbackRepairColId)) || null;
        }
      } catch (e) {
        console.warn('[production] auto-fix orphan sx_pipeline_stage_id:', e.message);
      }
    }

    const displayLeadCol = crmStageId
      || (crmSummary || [])
        .map((d) => d?.sx_pipeline_stage?.id || null)
        .find((sid) => sid && sortedKIdSet.has(String(sid))) || null;
    let finalSxKanbanColumnId = resolveSxDisplayColumnId(
      { ...project, sx_kanban_column_id: sxRow.sx_kanban_column_id, sx_intake: sxRow.sx_intake },
      sortedK,
      {
        leadColId: displayLeadCol,
        sxWonDeal: sxRow.sx_won_deal,
        hasSxHandover: dealHasHandover,
      },
    );
    if (!finalSxKanbanColumnId) finalSxKanbanColumnId = fallbackRepairColId;
    const finalIntakeFromCrm = finalSxKanbanColumnId
      ? Boolean(sortedK.find((c) => String(c.id) === String(finalSxKanbanColumnId))?.bucket_slug === INTAKE_BUCKET)
      : sxRow.sx_intake;

    res.json({
      project: {
        ...project,
        is_partner_project_view: isPartnerProjectView,
        sx_won_deal: sxRow.sx_won_deal,
        sx_kanban_column_id: finalSxKanbanColumnId,
        sx_intake: finalIntakeFromCrm,
        taskProgress,
        productionTaskProgress,
        logisticsTaskProgress,
        productionTaskCount: productionTasks.length,
        logisticsTaskCount: logisticsTasks.length,
        tasksByStage,
        // Chỉ trả tài liệu CRM được phép xem ở SX (tránh lộ file đã khóa qua field documents)
        documents: sharedDocuments,
        sharedDocuments,
        hiddenDocumentsCount: hiddenDocuments.length,
        crmDeals: crmSummary || [],
        crmSharedNotes,
        recentComments: commentsRes.data || [],
        incidents: incidentsRes.error ? [] : (incidentsRes.data || []),
        workshopPipeline,
        sxKanbanStages: sortedK.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          order_index: c.order_index,
          bucket_slug: c.bucket_slug,
          workflow_stage_id: c.workflow_stage_id || c.workflow_stage?.id,
          slug: c.workflow_stage?.slug,
          is_handover_to_logistics: c.is_handover_to_logistics ?? false,
          is_switch_workshop_type: c.is_switch_workshop_type ?? false,
          target_workshop_type_id: c.target_workshop_type_id ?? null,
          target_workshop_type: c.target_workshop_type ?? null,
        })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /production/projects/:id/stage ──
// Tối ưu: song song truy vấn validation, cache allowed stages; trả JSON ngay sau khi ghi DB,
// đồng bộ CRM / handover / thông báo / socket chạy nền (setImmediate) để giảm thời gian HTTP.
r.patch('/projects/:id/stage', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { stage_id, move_to_intake } = req.body;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name, status, company_id, sx_kanban_deadline_at')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    /** Kéo về cột «Chờ vào xưởng» — không có workflow_stage_id trên cột intake */
    if (move_to_intake === true || move_to_intake === 'true') {
      const [wonIds, { ids: workshopIds }] = await Promise.all([
        getWonDealProjectIds(),
        getWorkshopStageMap(),
      ]);
      const wonSet = new Set(wonIds);
      if (!wonSet.has(id)) {
        return res.status(400).json({ error: 'Chỉ dự án deal thắng mới kéo về cột chờ xưởng' });
      }
      const wasOnWorkshop = !project.current_stage_id || workshopIds.includes(String(project.current_stage_id));

      const { error: updateError } = await supabase
        .from('projects')
        .update({ current_stage_id: null })
        .eq('id', id);

      if (updateError) throw updateError;

      try {
        const intakeId = await getDbIntakeStageId(project.company_id);
        await touchProjectSxPipelineStageEnteredAt(
          id,
          intakeId,
          req.body?.current_sx_pipeline_stage_id || null,
        );
      } catch (te) {
        console.warn('[production] intake sx_pipeline_stage_entered_at:', te.message);
      }

      try {
        await supabase.from('stage_transitions').insert({
          project_id: id,
          from_stage_id: project.current_stage_id,
          to_stage_id: null,
          notes: 'Kéo về cột chờ xưởng (Kanban)',
          transitioned_by: userId,
        });
      } catch (te) {
        console.warn('[production] stage_transitions intake:', te.message);
      }

      await applyDefaultIntakeAssigneeIfNeeded(id, project.company_id);

      const { data: updated } = await supabase
        .from('projects')
        .select(`
          id, code, name, status, current_stage_id,
          current_stage:workflow_stages(id, slug, name, color)
        `)
        .eq('id', id)
        .single();

      res.json({ project: updated, moved_to_intake: true, was_on_workshop: wasOnWorkshop });

      const ioIntake = req.app.get('io');
      setImmediate(() => {
        void (async () => {
          try {
            await syncCrmLeadSxPipelineFromProject(id);
          } catch (syncErr) {
            console.warn('[production] syncCrmLeadSxPipelineFromProject (intake):', syncErr.message);
          }
          try {
            if (ioIntake) await emitCrmBadgeUpdateForProject(id, ioIntake);
          } catch (emitErr) {
            console.warn('[production] emitCrmBadgeUpdateForProject (intake):', emitErr.message);
          }
        })();
      });
      return;
    }

    const pipelineStageId = req.body?.production_pipeline_stage_id || req.body?.sx_pipeline_stage_id || null;

    // Cột Kanban (production_pipeline_stages.id) — ưu tiên trước stage_id workflow (nhiều cột có thể dùng chung workflow).
    if (pipelineStageId) {
      const colId = String(pipelineStageId);
      let { data: colRow } = await supabase
        .from('production_pipeline_stages')
        .select('id, workflow_stage_id, bucket_slug, crm_target_stage_id, requires_deadline')
        .eq('id', colId)
        .maybeSingle();
      if (!colRow) {
        ({ data: colRow } = await supabase
          .from('production_pipeline_stages')
          .select('id, workflow_stage_id, bucket_slug, crm_target_stage_id')
          .eq('id', colId)
          .maybeSingle());
      }
      if (!colRow) return res.status(400).json({ error: 'Cột pipeline sản xuất không tồn tại' });

      const currentColId = req.body?.current_sx_pipeline_stage_id || null;
      const isColChange = !currentColId || String(currentColId) !== String(colId);
      const rawDeadline = req.body?.sx_kanban_deadline_at ?? req.body?.kanban_deadline_at;
      const hasDeadlineInput = rawDeadline !== undefined && rawDeadline !== null && rawDeadline !== '';
      let parsedDeadlineTs = null;
      if (hasDeadlineInput) {
        parsedDeadlineTs = new Date(rawDeadline).getTime();
        if (Number.isNaN(parsedDeadlineTs)) {
          return res.status(400).json({ error: 'Deadline không hợp lệ' });
        }
      }

      // Gate parity CRM: chặn kéo cột Kanban SX khi còn nhiệm vụ tick "Chặn chuyển giai đoạn"
      // (crm_tasks sx_* hoặc tasks dự án) ở cột hiện tại — chỉ chặn khi kéo TIẾN. Lùi / về intake cho phép.
      const gate = await assertSxKanbanAdvanceAllowed({
        projectId: id,
        targetColId: colId,
        currentColId: req.body?.current_sx_pipeline_stage_id || null,
      });
      if (!gate.ok) {
        return res.status(400).json({
          error: gate.error,
          code: gate.code,
          remaining_tasks: gate.remaining_tasks,
          current_stage_id: gate.current_stage_id,
          target_stage_id: gate.target_stage_id,
          current_stage_name: gate.current_stage_name,
          target_stage_name: gate.target_stage_name,
        });
      }

      // Gate deadline: cột bật requires_deadline → bắt buộc chọn deadline khi chuyển sang (cột mới).
      if (isColChange && colRow?.requires_deadline && !hasDeadlineInput) {
        return res.status(400).json({
          error: 'Cột này yêu cầu đặt deadline khi chuyển thẻ tới.',
          code: 'requires_deadline',
          requires_deadline: true,
          stage_id: colRow.id,
          stage_name: colRow.name,
        });
      }

      const leadPatch = { sx_pipeline_stage_id: colId };
      // Lần đầu SX bấm cột pipeline = Sale đã handover sang xưởng → mark sx_handover_at
      const nowIso = new Date().toISOString();
      const colChanged = isColChange;
      const { data: existingLeads } = await supabase
        .from('crm_leads')
        .select('id, sx_handover_at, stage_id')
        .eq('project_id', id)
        .eq('type', 'deal');
      const leadIdsToHandover = (existingLeads || [])
        .filter((l) => !l.sx_handover_at)
        .map((l) => l.id);
      const { error: leadUpdErr } = await supabase
        .from('crm_leads')
        .update(leadPatch)
        .eq('project_id', id)
        .eq('type', 'deal');
      if (leadUpdErr && !leadUpdErr.message?.includes('sx_pipeline_stage_id')) throw leadUpdErr;
      if (leadIdsToHandover.length) {
        try {
          await supabase
            .from('crm_leads')
            .update({ sx_handover_at: nowIso })
            .in('id', leadIdsToHandover);
        } catch (e) {
          console.warn('[production] auto sx_handover_at:', e.message);
        }
      }

      // Trigger CRM stage_id theo crm_target_stage_id của cột (nếu cấu hình)
      // — không yêu cầu sx_handover_at vì SX vừa explicit chọn cột này.
      if (colRow.crm_target_stage_id) {
        try {
          await supabase
            .from('crm_leads')
            .update({ stage_id: colRow.crm_target_stage_id, updated_at: nowIso })
            .eq('project_id', id)
            .eq('type', 'deal')
            .neq('stage_id', colRow.crm_target_stage_id);
        } catch (e) {
          console.warn('[production] crm_target_stage_id sync:', e.message);
        }
      }

      let projectUpd = {};
      if (colChanged) projectUpd.sx_pipeline_stage_entered_at = nowIso;
      if (hasDeadlineInput) {
        projectUpd.sx_kanban_deadline_at = new Date(parsedDeadlineTs).toISOString();
        const reason = (req.body?.deadline_reason || req.body?.sx_kanban_deadline_reason || '').toString().trim();
        projectUpd.sx_kanban_deadline_reason = reason || null;
      }
      if (colRow.workflow_stage_id) {
        projectUpd = { current_stage_id: colRow.workflow_stage_id };
        const { data: targetStage } = await supabase
          .from('workflow_stages')
          .select('slug')
          .eq('id', colRow.workflow_stage_id)
          .maybeSingle();
        const statusMap = { production: 'producing', delivery: 'shipping', 'customer-care': 'warranty' };
        if (targetStage?.slug && statusMap[targetStage.slug]) {
          projectUpd.status = statusMap[targetStage.slug];
        }
      }
      if (Object.keys(projectUpd).length) {
        let { error: projUpdErr } = await supabase.from('projects').update(projectUpd).eq('id', id);
        if (projUpdErr && /sx_kanban_deadline/.test(projUpdErr.message || '')) {
          const fallbackUpd = { ...projectUpd };
          delete fallbackUpd.sx_kanban_deadline_at;
          delete fallbackUpd.sx_kanban_deadline_reason;
          ({ error: projUpdErr } = await supabase.from('projects').update(fallbackUpd).eq('id', id));
          if (!projUpdErr && hasDeadlineInput) {
            return res.status(503).json({
              error: 'Chưa cài đặt cột deadline thẻ SX trên database. Chạy migration database/288_production_kanban_deadline.sql',
              code: 'migration_required',
            });
          }
        }
        if (projUpdErr) throw projUpdErr;
      }

      const { data: updatedPipe } = await supabase
        .from('projects')
        .select(`
          id, code, name, status, current_stage_id, production_person_id,
          current_stage:workflow_stages(id, slug, name, color)
        `)
        .eq('id', id)
        .single();

      res.json({
        project: {
          ...updatedPipe,
          sx_kanban_column_id: colId,
          sx_intake: colRow.bucket_slug === INTAKE_BUCKET,
        },
        pipeline_stage_id: colId,
      });

      const ioPipe = req.app.get('io');
      const shouldApplyPipelineTemplates = colChanged && colRow.bucket_slug !== INTAKE_BUCKET;
      setImmediate(() => {
        void (async () => {
          try {
            await syncCrmLeadSxPipelineFromProject(id);
          } catch (syncErr) {
            console.warn('[production] syncCrmLeadSxPipelineFromProject (pipeline col):', syncErr.message);
          }
          if (shouldApplyPipelineTemplates) {
            try {
              const rTpl = await applyProductionTemplatesOnPipelineEnter({
                projectId: id,
                pipelineStageId: colId,
                userId,
                req,
              });
              if (rTpl?.created > 0) {
                console.info(
                  `[production] pipeline templates applied: project=${id} stage=${colId} created=${rTpl.created} synced=${rTpl.synced_assignments || 0}`,
                );
              }
            } catch (tplErr) {
              console.warn('[production] applyProductionTemplatesOnPipelineEnter:', tplErr.message);
            }
          }
          try {
            if (ioPipe) await emitCrmBadgeUpdateForProject(id, ioPipe);
          } catch (emitErr) {
            console.warn('[production] emitCrmBadgeUpdateForProject (pipeline col):', emitErr.message);
          }
        })();
      });
      return;
    }

    if (!stage_id) {
      return res.status(400).json({ error: 'stage_id required' });
    }

    // Lưu ý: project.company_id đôi khi null/khác scope hiện tại của xưởng.
    // UI dashboard có thể đang thao tác theo 1 company filter → cho phép truyền company_id từ client để validate đúng pipeline.
    const companyIdForPipeline = effectiveWorkshopCompanyId(req, req.body?.company_id || project.company_id);

    const [allowed, targetRes] = await Promise.all([
      allowedWorkflowStageIdsForPatch(companyIdForPipeline),
      supabase
        .from('workflow_stages')
        .select('id, slug')
        .eq('id', stage_id)
        .single(),
    ]);
    const { data: targetStage, error: targetStageErr } = targetRes;

    if (!allowed.has(String(stage_id))) {
      return res.status(400).json({ error: 'Giai đoạn không hợp lệ cho pipeline sản xuất' });
    }
    if (targetStageErr || !targetStage) {
      return res.status(400).json({ error: 'Giai đoạn workflow không tồn tại' });
    }

    // Gate parity CRM cho nhánh PipelineStepper (gửi stage_id = workflow_stage_id):
    //   Tìm cột pipeline SX (production_pipeline_stages) tương ứng với workflow_stage_id
    //   + company + workshop_type của project, rồi gọi assertSxKanbanAdvanceAllowed.
    try {
      let wktId = req.body?.workshop_type_id || null;
      if (!wktId) {
        try {
          const { data: pj } = await supabase
            .from('projects')
            .select('workshop_type_id')
            .eq('id', id)
            .maybeSingle();
          wktId = pj?.workshop_type_id || null;
        } catch (_) { /* DB chưa migration 97 → bỏ qua */ }
      }
      const explicitColId = req.body?.production_pipeline_stage_id || req.body?.sx_pipeline_stage_id || null;
      let targetColId = explicitColId ? String(explicitColId) : null;
      if (!targetColId) {
        let q = supabase
          .from('production_pipeline_stages')
          .select('id')
          .eq('company_id', companyIdForPipeline)
          .eq('workflow_stage_id', stage_id);
        if (wktId) q = q.eq('workshop_type_id', wktId);
        const { data: matched } = await q.order('order_index').limit(1);
        targetColId = matched?.[0]?.id || null;
      }
      if (targetColId) {
        const gate = await assertSxKanbanAdvanceAllowed({
          projectId: id,
          targetColId,
          currentColId: req.body?.current_sx_pipeline_stage_id || null,
        });
        if (!gate.ok) {
          return res.status(400).json({
            error: gate.error,
            code: gate.code,
            remaining_tasks: gate.remaining_tasks,
            current_stage_id: gate.current_stage_id,
            target_stage_id: gate.target_stage_id,
            current_stage_name: gate.current_stage_name,
            target_stage_name: gate.target_stage_name,
          });
        }
      }
    } catch (gateErr) {
      console.warn('[production] gate by workflow_stage_id:', gateErr.message);
    }

    const statusMap = {
      production: 'producing',
      delivery: 'shipping',
      'customer-care': 'warranty',
    };

    const updatePayload = { current_stage_id: stage_id };
    if (statusMap[targetStage.slug]) updatePayload.status = statusMap[targetStage.slug];

    const { error: updateError } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) throw updateError;

    await supabase.from('stage_transitions').insert({
      project_id: id,
      from_stage_id: project.current_stage_id,
      to_stage_id: stage_id,
      transitioned_by: userId,
    });

    const explicitSxColId = req.body?.production_pipeline_stage_id || req.body?.sx_pipeline_stage_id || null;
    if (explicitSxColId) {
      const colId = String(explicitSxColId);
      const nowIsoStg = new Date().toISOString();
      const { data: leadsBeforeStg } = await supabase
        .from('crm_leads')
        .select('id, sx_handover_at')
        .eq('project_id', id)
        .eq('type', 'deal');
      const leadIdsHandoverStg = (leadsBeforeStg || [])
        .filter((l) => !l.sx_handover_at)
        .map((l) => l.id);
      await supabase
        .from('crm_leads')
        .update({ sx_pipeline_stage_id: colId, updated_at: nowIsoStg })
        .eq('project_id', id)
        .eq('type', 'deal');
      if (leadIdsHandoverStg.length) {
        try {
          await supabase
            .from('crm_leads')
            .update({ sx_handover_at: nowIsoStg })
            .in('id', leadIdsHandoverStg);
        } catch (e) {
          console.warn('[production/stage] auto sx_handover_at:', e.message);
        }
      }
      try {
        const { data: colCfg } = await supabase
          .from('production_pipeline_stages')
          .select('crm_target_stage_id')
          .eq('id', colId)
          .maybeSingle();
        if (colCfg?.crm_target_stage_id) {
          await supabase
            .from('crm_leads')
            .update({ stage_id: colCfg.crm_target_stage_id, updated_at: nowIsoStg })
            .eq('project_id', id)
            .eq('type', 'deal')
            .neq('stage_id', colCfg.crm_target_stage_id);
        }
      } catch (e) {
        console.warn('[production/stage] crm_target_stage_id sync:', e.message);
      }
      await touchProjectSxPipelineStageEnteredAt(
        id,
        colId,
        req.body?.current_sx_pipeline_stage_id || null,
      );
    }

    const { data: updated } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, current_stage_id, production_person_id,
        current_stage:workflow_stages(id, slug, name, color)
      `)
      .eq('id', id)
      .single();

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', updated);

    res.json({
      project: {
        ...updated,
        ...(explicitSxColId ? {
          sx_kanban_column_id: String(explicitSxColId),
          sx_intake: false,
        } : {}),
      },
    });
    const projectId = id;
    const toStageId = stage_id;
    const updatedSnapshot = updated;
    const reqRef = req;

    setImmediate(() => {
      void (async () => {
        try {
          await syncCrmLeadSxPipelineFromProject(projectId);
        } catch (syncErr) {
          console.warn('[production] syncCrmLeadSxPipelineFromProject:', syncErr.message);
        }

        // Kiểm tra cột SX có cờ is_handover_to_logistics → chuyển sang module VC
        try {
          const sxPipeStage = await findSxPipelineStageRowForWorkflow(toStageId, companyIdForPipeline);

          if (sxPipeStage?.is_handover_to_logistics) {
            let autoVcStageId = null;
            try {
              autoVcStageId = await resolveLogisticsVcIntakeColumnId(companyIdForPipeline);
              if (!autoVcStageId) {
                const { data: vcFirst } = await supabase
                  .from('logistics_pipeline_stages').select('id').eq('is_active', true).order('order_index').limit(1).maybeSingle();
                autoVcStageId = vcFirst?.id || null;
              }
            } catch (_e) { /* ignore */ }

            const autoUpd = { status: 'shipping' };
            if (autoVcStageId) autoUpd.vc_kanban_column_id = autoVcStageId;
            const { error: autoUpdErr } = await supabase.from('projects').update(autoUpd).eq('id', projectId);
            if (autoUpdErr && autoUpdErr.message?.includes('vc_kanban_column_id')) {
              await supabase.from('projects').update({ status: 'shipping' }).eq('id', projectId);
            }

            try {
              const { ensureLeadDocumentsIncludeShareModules } = require('../helpers/moduleLeadDocuments');
              await ensureLeadDocumentsIncludeShareModules(projectId, ['logistics']);
            } catch (mdErr) {
              console.warn('[production/stage] expand doc modules for VC:', mdErr.message);
            }

            try {
              await ensureDealLeadDocumentsForProjectId(projectId);
            } catch (ensErr) {
              console.warn('[production/stage] ensure deal lead_documents:', ensErr.message);
            }

            try {
              const vcDeliveryStageId = await getCrmVcDeliveryStageId();
              if (vcDeliveryStageId) {
                const { data: leads } = await supabase
                  .from('crm_leads')
                  .select('id, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sync_role, is_won, is_lost)')
                  .eq('project_id', projectId)
                  .eq('type', 'deal');
                await Promise.all(
                  (leads || []).map((lead) => {
                    const patch = {};
                    if (autoVcStageId) patch.vc_pipeline_stage_id = autoVcStageId;
                    // Race-guard: chỉ ghi stage_id khi deal đang ở cột auto-managed hoặc Thắng.
                    if (
                      String(lead.stage_id || '') !== String(vcDeliveryStageId)
                      && shouldAutoOverwriteCrmStage(lead.stage)
                    ) {
                      patch.stage_id = vcDeliveryStageId;
                    }
                    if (!Object.keys(patch).length) return Promise.resolve();
                    return supabase.from('crm_leads').update(patch).eq('id', lead.id);
                  }),
                );
              }
            } catch (crmErr) {
              console.warn('[production/handover] sync CRM VC delivery:', crmErr.message);
            }

            const { data: vcUsers } = await supabase
              .from('users')
              .select('id')
              .in('role', ['logistics', 'installer', 'manager'])
              .eq('is_active', true);
            const vcRecipients = (vcUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
            if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && vcRecipients.length) {
              await notifyMultipleShared(
                reqRef,
                vcRecipients,
                'workshop_new_deal',
                `🚚 Vận chuyển: Deal mới từ Xưởng`,
                `Dự án ${updatedSnapshot.code || updatedSnapshot.name} đã hoàn thành sản xuất, chuyển sang Vận chuyển & Lắp đặt`,
                'project',
                projectId,
              );
            }
          }
        } catch (handoverErr) {
          console.warn('[production/stage] handover to logistics:', handoverErr.message);
        }

        try {
          const { data: workshopUsers } = await supabase
            .from('users')
            .select('id')
            .in('role', ['production', 'manager'])
            .eq('is_active', true);
          const recipientIds = (workshopUsers || [])
            .map((u) => u.id)
            .filter((uid) => uid !== userId);
          if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && recipientIds.length) {
            const stageName = updatedSnapshot.current_stage?.name || '';
            await notifyMultipleShared(
              reqRef,
              recipientIds,
              'workshop_new_deal',
              `🏭 Xưởng: ${stageName}`,
              `Dự án ${updatedSnapshot.code || updatedSnapshot.name} vừa chuyển sang giai đoạn "${stageName}"`,
              'project',
              projectId,
            );
          }
        } catch (notifErr) {
          console.warn('[production/stage] notify workshop staff:', notifErr.message);
        }

        // Emit sau sync + handover CRM để thẻ Kanban CRM luôn nhận đúng SX/VC (một lần, đủ dữ liệu)
        try {
          if (io) await emitCrmBadgeUpdateForProject(projectId, io);
        } catch (emitErr) {
          console.warn('[production/stage] emitCrmBadgeUpdateForProject:', emitErr.message);
        }
      })();
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /production/projects/:id/kanban-deadline ──
/** Đặt/sửa deadline thẻ Kanban SX (kèm lý do nếu đã có deadline). */
r.patch('/projects/:id/kanban-deadline', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, sx_kanban_deadline_at')
      .eq('id', id)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const raw = req.body?.sx_kanban_deadline_at ?? req.body?.kanban_deadline_at;
    const clearing = raw === null || raw === '';
    let newIso = null;
    if (!clearing) {
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return res.status(400).json({ error: 'Deadline không hợp lệ' });
      newIso = new Date(ts).toISOString();
    }

    const reason = (req.body?.reason || req.body?.sx_kanban_deadline_reason || '').toString().trim();
    if (project.sx_kanban_deadline_at && !reason) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do thay đổi deadline', code: 'reason_required' });
    }
    if (String(project.sx_kanban_deadline_at || '') === String(newIso || '')) {
      return res.json({ ok: true, unchanged: true, sx_kanban_deadline_at: project.sx_kanban_deadline_at });
    }

    const { error: upErr } = await supabase
      .from('projects')
      .update({
        sx_kanban_deadline_at: newIso,
        sx_kanban_deadline_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (upErr) {
      if (/sx_kanban_deadline/.test(upErr.message || '')) {
        return res.status(503).json({
          error: 'Chưa cài đặt cột deadline thẻ SX. Chạy migration database/288_production_kanban_deadline.sql',
          code: 'migration_required',
        });
      }
      throw upErr;
    }

    res.json({ ok: true, sx_kanban_deadline_at: newIso, sx_kanban_deadline_reason: reason || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /production/projects/:id/switch-workshop-type ─────────────────
// Chuyển phân loại xưởng khi thẻ vào cột được đánh dấu is_switch_workshop_type
r.patch('/projects/:id/switch-workshop-type', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const triggerColId = req.body?.production_pipeline_stage_id || req.body?.sx_pipeline_stage_id || null;
    if (!triggerColId) {
      return res.status(400).json({ error: 'Thiếu production_pipeline_stage_id' });
    }

    const { data: triggerCol, error: colErr } = await fetchProductionPipelineStageById(supabase, triggerColId);
    if (colErr || !triggerCol) {
      return res.status(400).json({ error: 'Cột pipeline không tồn tại' });
    }
    if (!(triggerCol.is_switch_workshop_type || triggerCol.converts_workshop_type) || !triggerCol.target_workshop_type_id) {
      return res.status(400).json({ error: 'Cột này chưa được cấu hình chuyển phân loại' });
    }

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, code, name, company_id, workshop_type_id, current_stage_id, status')
      .eq('id', id)
      .maybeSingle();
    if (projErr) throw projErr;
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const companyId = project.company_id || triggerCol.company_id || null;
    const targetTypeId = String(triggerCol.target_workshop_type_id);
    await assertWorkshopTypeForCompany(targetTypeId, companyId);

    const { stages: targetStages } = await getResolvedKanbanStages(companyId, { workshopTypeId: targetTypeId });
    const firstCol = [...(targetStages || [])]
      .filter((s) => s.is_active !== false && s.bucket_slug !== INTAKE_BUCKET)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))[0];
    if (!firstCol?.id) {
      return res.status(400).json({ error: 'Phân loại đích chưa có cột pipeline — tạo cột trước trong Cài đặt pipeline' });
    }

    const nowIso = new Date().toISOString();
    const projectUpd = {
      workshop_type_id: targetTypeId,
      sx_pipeline_stage_entered_at: nowIso,
    };
    if (firstCol.workflow_stage_id) {
      projectUpd.current_stage_id = firstCol.workflow_stage_id;
      const { data: targetStage } = await supabase
        .from('workflow_stages')
        .select('slug')
        .eq('id', firstCol.workflow_stage_id)
        .maybeSingle();
      const statusMap = { production: 'producing', delivery: 'shipping', 'customer-care': 'warranty' };
      if (targetStage?.slug && statusMap[targetStage.slug]) {
        projectUpd.status = statusMap[targetStage.slug];
      }
    }

    const { error: updErr } = await supabase.from('projects').update(projectUpd).eq('id', id);
    if (updErr) throw updErr;

    try {
      await touchProjectSxPipelineStageEnteredAt(id, firstCol.id, req.body?.current_sx_pipeline_stage_id || null);
    } catch (te) {
      console.warn('[production/switch-workshop-type] sx_pipeline_stage_entered_at:', te.message);
    }

    const leadPatch = { sx_pipeline_stage_id: firstCol.id };
    const { error: leadUpdErr } = await supabase
      .from('crm_leads')
      .update(leadPatch)
      .eq('project_id', id)
      .eq('type', 'deal');
    if (leadUpdErr && !leadUpdErr.message?.includes('sx_pipeline_stage_id')) throw leadUpdErr;

    try {
      const { applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
      await applyWorkshopTypeDefaultStaffToProject(id, companyId, targetTypeId);
    } catch (staffErr) {
      console.warn('[production/switch-workshop-type] default staff:', staffErr.message);
    }

    try {
      await supabase.from('stage_transitions').insert({
        project_id: id,
        from_stage_id: project.current_stage_id,
        to_stage_id: firstCol.workflow_stage_id || null,
        notes: `Chuyển phân loại → ${triggerCol.target_workshop_type?.name || targetTypeId} (cột ${firstCol.name})`,
        transitioned_by: userId,
      });
    } catch (te) {
      console.warn('[production/switch-workshop-type] stage_transitions:', te.message);
    }

    let workshopType = triggerCol.target_workshop_type || null;
    if (!workshopType) {
      const { data: wtRow } = await supabase
        .from('workshop_project_types')
        .select('id, name')
        .eq('id', targetTypeId)
        .maybeSingle();
      workshopType = wtRow || null;
    }

    const { data: updated } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, current_stage_id, workshop_type_id,
        workshop_type:workshop_project_types(id, name),
        current_stage:workflow_stages(id, slug, name, color)
      `)
      .eq('id', id)
      .single();

    res.json({
      project: {
        ...updated,
        workshop_type: workshopType || updated?.workshop_type,
        sx_kanban_column_id: firstCol.id,
        sx_intake: false,
        sx_pipeline_stage: {
          id: firstCol.id,
          name: firstCol.name,
          color: firstCol.color,
          icon: firstCol.icon,
        },
      },
      from_workshop_type_id: project.workshop_type_id,
      to_workshop_type_id: targetTypeId,
      pipeline_stage_id: firstCol.id,
      switched: true,
    });

    const ioSw = req.app.get('io');
    setImmediate(() => {
      void (async () => {
        try {
          await syncCrmLeadSxPipelineFromProject(id);
        } catch (syncErr) {
          console.warn('[production/switch-workshop-type] sync CRM:', syncErr.message);
        }
        try {
          if (ioSw) await emitCrmBadgeUpdateForProject(id, ioSw);
        } catch (emitErr) {
          console.warn('[production/switch-workshop-type] emit badge:', emitErr.message);
        }
      })();
    });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─── PATCH /production/projects/:id/handover-vc ───────────────────────────
// Bàn giao thủ công từ SX sang module Vận chuyển & Lắp đặt
r.patch('/projects/:id/handover-vc', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const logisticsPersonId = req.body?.logistics_person_id || null;
    const logisticsCompanyId = req.body?.logistics_company_id || null;
    const deliveryTeamId = req.body?.delivery_team_id || null;
    const installationTeamId = req.body?.installation_team_id || null;

    if (!logisticsCompanyId) return res.status(400).json({ error: 'Vui lòng chọn công ty Vận chuyển/Lắp đặt.' });

    // Validate logistics company belongs to module scope (logistics)
    const { data: lco, error: lcoErr } = await supabase
      .from('companies')
      .select('id, division_unit_id, is_active')
      .eq('id', logisticsCompanyId)
      .maybeSingle();
    if (lcoErr || !lco) return res.status(400).json({ error: 'Công ty VC/Lắp đặt không tồn tại.' });
    if (lco.is_active === false) return res.status(400).json({ error: 'Công ty VC/Lắp đặt đã ngưng hoạt động.' });
    try {
      const restricted = await getRestrictedDivisionIdsForModule('logistics');
      if (restricted && restricted.size > 0) {
        const primary = lco.division_unit_id ? String(lco.division_unit_id) : '';
        let ok = primary && restricted.has(primary);
        if (!ok) {
          const { data: links } = await supabase
            .from('company_division_units')
            .select('division_unit_id')
            .eq('company_id', logisticsCompanyId);
          ok = (links || []).some((r) => r?.division_unit_id && restricted.has(String(r.division_unit_id)));
        }
        if (!ok) return res.status(400).json({ error: 'Công ty VC/Lắp đặt không thuộc phạm vi module Vận chuyển & Lắp đặt.' });
      }
    } catch (_e) { /* ignore */ }

    if (logisticsPersonId) {
      const { data: u, error: uErr } = await supabase
        .from('users')
        .select('id, role, is_active')
        .eq('id', logisticsPersonId)
        .maybeSingle();
      if (uErr || !u) return res.status(400).json({ error: 'Người nhận bàn giao không tồn tại.' });
      if (u.is_active === false) return res.status(400).json({ error: 'Người nhận bàn giao đã ngưng hoạt động.' });
      if (!['logistics', 'installer', 'manager', 'admin'].includes(String(u.role || ''))) {
        return res.status(400).json({ error: 'Người nhận bàn giao phải thuộc nhóm Vận chuyển/Lắp đặt.' });
      }
    }

    // Validate teams nếu có gửi lên (không bắt buộc)
    if (deliveryTeamId) {
      const { data: delTeam } = await supabase
        .from('workshop_teams')
        .select('id, type, is_active')
        .eq('id', deliveryTeamId)
        .maybeSingle();
      if (!delTeam) return res.status(400).json({ error: 'Đơn vị vận chuyển không tồn tại.' });
      if (delTeam.is_active === false) return res.status(400).json({ error: 'Đơn vị vận chuyển đã ngưng hoạt động.' });
      if (String(delTeam.type || '') !== 'delivery') return res.status(400).json({ error: 'Đơn vị vận chuyển không hợp lệ.' });
    }
    if (installationTeamId) {
      const { data: insTeam } = await supabase
        .from('workshop_teams')
        .select('id, type, is_active')
        .eq('id', installationTeamId)
        .maybeSingle();
      if (!insTeam) return res.status(400).json({ error: 'Đội lắp đặt không tồn tại.' });
      if (insTeam.is_active === false) return res.status(400).json({ error: 'Đội lắp đặt đã ngưng hoạt động.' });
      if (String(insTeam.type || '') !== 'installation') return res.status(400).json({ error: 'Đội lắp đặt không hợp lệ.' });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, status, current_stage_id')
      .eq('id', id)
      .single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // ── 0. Cột pipeline SX «Bàn giao VC» — ưu tiên id client gửi (kéo thả Kanban), fallback workflow cũ ──
    let sxHandoverPipelineStageId = req.body?.production_pipeline_stage_id
      || req.body?.sx_pipeline_stage_id
      || null;
    if (sxHandoverPipelineStageId) sxHandoverPipelineStageId = String(sxHandoverPipelineStageId);
    try {
      if (sxHandoverPipelineStageId) {
        const { data: colVerify } = await supabase
          .from('production_pipeline_stages')
          .select('id')
          .eq('id', sxHandoverPipelineStageId)
          .maybeSingle();
        if (!colVerify?.id) sxHandoverPipelineStageId = null;
      }
      if (!sxHandoverPipelineStageId && project.current_stage_id) {
        const { data: sxPipeRow } = await supabase
          .from('production_pipeline_stages')
          .select('id')
          .eq('workflow_stage_id', project.current_stage_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        sxHandoverPipelineStageId = sxPipeRow?.id || null;
      }
      if (!sxHandoverPipelineStageId) {
        const { data: projMeta } = await supabase
          .from('projects')
          .select('company_id, workshop_type_id')
          .eq('id', id)
          .maybeSingle();
        const { stages: sxStages } = await getResolvedKanbanStages(projMeta?.company_id || null, {
          workshopTypeId: projMeta?.workshop_type_id || null,
        });
        const resolvedHo = resolveSxHandoverColumnId(sxStages, projMeta || {}, null);
        if (resolvedHo) sxHandoverPipelineStageId = String(resolvedHo);
      }
    } catch (_e) { /* ignore */ }

    // ── 1. Lấy cột intake của VC pipeline theo công ty VC đã chọn ──────────
    let vcStageId = null;
    try {
      const { data: vcIntakeRow } = await supabase
        .from('logistics_pipeline_stages')
        .select('id, name')
        .eq('bucket_slug', 'delivery_pending')
        .eq('is_active', true)
        .eq('company_id', logisticsCompanyId)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      if (!vcIntakeRow) {
        const { data: vcFirstRow } = await supabase
          .from('logistics_pipeline_stages')
          .select('id')
          .eq('is_active', true)
          .eq('company_id', logisticsCompanyId)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        vcStageId = vcFirstRow?.id || null;
        // Fallback pipeline global nếu công ty chưa có pipeline riêng
        if (!vcStageId) {
          const { data: gIntake } = await supabase
            .from('logistics_pipeline_stages')
            .select('id')
            .eq('bucket_slug', 'delivery_pending')
            .eq('is_active', true)
            .is('company_id', null)
            .order('order_index')
            .limit(1)
            .maybeSingle();
          vcStageId = gIntake?.id || null;
        }
      } else {
        vcStageId = vcIntakeRow.id;
      }
    } catch (stageErr) {
      console.warn('[production/handover-vc] lookup VC intake stage:', stageErr.message);
    }

    // ── 2. Đổi status sang 'shipping', xoá current_stage_id, gán vc_kanban_column_id ──
    const projectUpdate = { status: 'shipping', current_stage_id: null };
    if (logisticsPersonId) projectUpdate.logistics_person_id = logisticsPersonId;
    projectUpdate.logistics_company_id = logisticsCompanyId;
    if (deliveryTeamId) projectUpdate.delivery_team_id = deliveryTeamId;
    if (installationTeamId) projectUpdate.installation_team_id = installationTeamId;
    if (vcStageId) projectUpdate.vc_kanban_column_id = vcStageId;

    const { error: updateError } = await supabase
      .from('projects')
      .update(projectUpdate)
      .eq('id', id);
    if (updateError) {
      // Nếu vc_kanban_column_id column chưa tồn tại, thử lại không có nó
      if (updateError.message?.includes('vc_kanban_column_id')) {
        const { error: retryErr } = await supabase
          .from('projects')
          .update({
            status: 'shipping',
            current_stage_id: null,
            logistics_company_id: logisticsCompanyId,
            ...(deliveryTeamId ? { delivery_team_id: deliveryTeamId } : {}),
            ...(installationTeamId ? { installation_team_id: installationTeamId } : {}),
          })
          .eq('id', id);
        if (retryErr) throw retryErr;
      } else if (updateError.message?.includes('logistics_company_id')) {
        // DB chưa có cột logistics_company_id — bỏ qua, vẫn bàn giao theo pipeline global
        const { error: retryErr } = await supabase
          .from('projects')
          .update({
            status: 'shipping',
            current_stage_id: null,
            ...(deliveryTeamId ? { delivery_team_id: deliveryTeamId } : {}),
            ...(installationTeamId ? { installation_team_id: installationTeamId } : {}),
            ...(vcStageId ? { vc_kanban_column_id: vcStageId } : {}),
            ...(logisticsPersonId ? { logistics_person_id: logisticsPersonId } : {}),
          })
          .eq('id', id);
        if (retryErr) throw retryErr;
      } else {
        throw updateError;
      }
    }

    try {
      const { ensureLeadDocumentsIncludeShareModules } = require('../helpers/moduleLeadDocuments');
      await ensureLeadDocumentsIncludeShareModules(id, ['logistics']);
    } catch (mdErr) {
      console.warn('[production/handover-vc] expand doc modules for VC:', mdErr.message);
    }

    // ── 2b. Gen nhiệm vụ VC/LĐ theo bộ mẫu của công ty VC đã chọn ────────────
    // Idempotent theo metadata.workshop_template_id nên gọi lại an toàn.
    try {
      const out = await applyAllActiveWorkshopTemplatesForArea(id, userId, {
        workshopArea: 'logistics',
        companyId: logisticsCompanyId,
      });
      if (!out?.ok) {
        console.warn('[production/handover-vc] gen logistics templates:', out?.error || 'unknown');
      }
    } catch (tplErr) {
      console.warn('[production/handover-vc] gen logistics templates:', tplErr.message);
    }

    try {
      await ensureDealLeadDocumentsForProjectId(id);
    } catch (ensErr) {
      console.warn('[production/handover-vc] ensure deal lead_documents:', ensErr.message);
    }

    // Ghi stage_transition
    try {
      await supabase.from('stage_transitions').insert({
        project_id: id,
        from_stage_id: project.current_stage_id,
        to_stage_id: null,
        notes: 'Bàn giao sang module Vận chuyển & Lắp đặt (thủ công)',
        transitioned_by: userId,
      });
    } catch (te) { console.warn('[production/handover-vc] stage_transitions:', te.message); }

    // ── 3. Đồng bộ CRM deal: cột stage_id + sx_pipeline_stage_id + vc_pipeline_stage_id ──
    try {
      const vcDeliveryStageId = await getCrmVcDeliveryStageId();
      const { data: leads } = await supabase
        .from('crm_leads').select('id').eq('project_id', id).eq('type', 'deal');

      for (const lead of leads || []) {
        // Thử update đầy đủ kể cả vc/sx_pipeline_stage_id
        const fullUpd = {};
        if (vcStageId) fullUpd.vc_pipeline_stage_id = vcStageId;
        if (sxHandoverPipelineStageId) fullUpd.sx_pipeline_stage_id = sxHandoverPipelineStageId;
        if (vcDeliveryStageId) fullUpd.stage_id = vcDeliveryStageId;

        const { error: leadErr } = await supabase.from('crm_leads').update(fullUpd).eq('id', lead.id);

        if (leadErr) {
          // Nếu lỗi do column chưa tồn tại → chỉ cập nhật stage_id (cột CRM)
          const isColErr = leadErr.message?.includes('vc_pipeline_stage_id') || leadErr.message?.includes('sx_pipeline_stage_id');
          if (isColErr && vcDeliveryStageId) {
            const { error: simpleErr } = await supabase.from('crm_leads').update({ stage_id: vcDeliveryStageId }).eq('id', lead.id);
            if (simpleErr) console.warn('[production/handover-vc] simple CRM update:', simpleErr.message);
            else console.log(`[production/handover-vc] CRM deal ${lead.id} → stage_id=${vcDeliveryStageId} (columns not migrated yet)`);
          } else {
            console.warn('[production/handover-vc] CRM update lead', lead.id, ':', leadErr.message);
          }
        } else {
          console.log(`[production/handover-vc] CRM deal ${lead.id} synced → vcStage=${vcStageId}, crmCol=${vcDeliveryStageId || '(not configured)'}`);
        }
      }
    } catch (crmErr) {
      console.warn('[production/handover-vc] sync CRM:', crmErr.message);
    }

    // Thông báo nhân viên VC
    try {
      const { data: vcUsers } = await supabase
        .from('users').select('id').in('role', ['logistics', 'installer', 'manager']).eq('is_active', true);
      const vcRecipients = (vcUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
      if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && vcRecipients.length) {
        await notifyMultipleShared(
          req, vcRecipients, 'workshop_new_deal',
          `🚚 Vận chuyển: Deal mới từ Xưởng`,
          `Dự án ${project.code || project.name} đã bàn giao sang Vận chuyển & Lắp đặt`,
          'project', id,
        );
      }
    } catch (notifErr) {
      console.warn('[production/handover-vc] notify VC:', notifErr.message);
    }

    const { data: updated } = await supabase
      .from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, slug, name)')
      .eq('id', id).single();

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', updated);

    // Emit badge update cho CRM deals liên quan sau khi sync vc_pipeline_stage_id
    emitCrmBadgeUpdateForProject(id, io).catch(() => {});

    res.json({
      project: {
        ...updated,
        ...(sxHandoverPipelineStageId ? { sx_kanban_column_id: sxHandoverPipelineStageId } : {}),
      },
      handed_over: true,
      sx_pipeline_stage_id: sxHandoverPipelineStageId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ WORKSHOP TASK TEMPLATES (bộ mẫu SX / VC–LĐ) ═══
const isWorkshopTplCompanyMissingError = (err) =>
  String(err?.message || '').includes('workshop_task_templates.company_id')
  || (String(err?.message || '').includes('column') && String(err?.message || '').includes('company_id'));

const isWorkshopTplPipelineStageMissingError = (err) => {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('production_stage_id') || m.includes('logistics_stage_id');
};

async function validateWorkshopTemplatePipelineStage(workshopArea, { production_stage_id, logistics_stage_id, company_id }) {
  const area = String(workshopArea || 'production');
  if (area === 'production' && logistics_stage_id) {
    return { ok: false, error: 'Bộ mẫu Sản xuất không dùng logistics_stage_id' };
  }
  if (area === 'logistics' && production_stage_id) {
    return { ok: false, error: 'Bộ mẫu VC–LĐ không dùng production_stage_id' };
  }
  const stageId = area === 'logistics' ? logistics_stage_id : production_stage_id;
  if (!stageId) return { ok: true };
  const table = area === 'logistics' ? 'logistics_pipeline_stages' : 'production_pipeline_stages';
  const { data: stageRow, error } = await supabase
    .from(table)
    .select('id, company_id')
    .eq('id', stageId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!stageRow?.id) return { ok: false, error: 'Không tìm thấy cột pipeline' };
  if (company_id && stageRow.company_id && String(stageRow.company_id) !== String(company_id)) {
    return { ok: false, error: 'Cột pipeline không thuộc công ty đã chọn' };
  }
  return { ok: true };
}

function applyWorkshopTemplateStageFilter(q, reqQuery, workshopAreaHint) {
  const area = reqQuery.workshop_area === 'logistics' ? 'logistics' : 'production';
  const rawProd = reqQuery.production_stage_id;
  const rawLog = reqQuery.logistics_stage_id;
  const stageCol = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
  const raw = area === 'logistics' ? rawLog : rawProd;
  if (raw === undefined || raw === null || raw === '') return q;
  if (String(raw).toLowerCase() === 'global') {
    return q.is(stageCol, null);
  }
  return q.eq(stageCol, raw);
}

const {
  isWorkshopTplWorkshopTypeMissingError,
  applyWorkshopTemplateWorkshopTypeFilter,
  normalizeWorkshopTypeIdForInsert,
  validateWorkshopTemplateWorkshopType,
} = require('../helpers/workshopTaskTemplateWorkshopType');

r.get('/task-templates', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const company_id = effectiveWorkshopCompanyId(req, req.query.company_id);
    let q = supabase
      .from('workshop_task_templates')
      .select('*, items:workshop_task_template_items(*)')
      .order('order_index');
    if (req.query.workshop_area && ['production', 'logistics'].includes(req.query.workshop_area)) {
      q = q.eq('workshop_area', req.query.workshop_area);
    }
    if (req.query.active_only !== 'false') {
      q = q.eq('is_active', true);
    }
    if (company_id) {
      q = q.eq('company_id', company_id);
    }
    if (req.query.production_stage_id !== undefined || req.query.logistics_stage_id !== undefined) {
      q = applyWorkshopTemplateStageFilter(q, req.query);
    }
    if (req.query.workshop_type_id !== undefined && req.query.workshop_area !== 'logistics') {
      q = applyWorkshopTemplateWorkshopTypeFilter(q, req.query.workshop_type_id);
    }
    let { data, error } = await q;
    if (error && company_id && isWorkshopTplCompanyMissingError(error)) {
      const retry = await supabase
        .from('workshop_task_templates')
        .select('*, items:workshop_task_template_items(*)')
        .order('order_index');
      data = retry.data;
      error = retry.error;
    }
    if (error && isWorkshopTplPipelineStageMissingError(error)) {
      let retryQ = supabase
        .from('workshop_task_templates')
        .select('*, items:workshop_task_template_items(*)')
        .order('order_index');
      if (req.query.workshop_area) retryQ = retryQ.eq('workshop_area', req.query.workshop_area);
      if (company_id) retryQ = retryQ.eq('company_id', company_id);
      const r2 = await retryQ;
      data = r2.data;
      error = r2.error;
    }
    if (error && isWorkshopTplWorkshopTypeMissingError(error)) {
      let retryQ = supabase
        .from('workshop_task_templates')
        .select('*, items:workshop_task_template_items(*)')
        .order('order_index');
      if (req.query.workshop_area) retryQ = retryQ.eq('workshop_area', req.query.workshop_area);
      if (company_id) retryQ = retryQ.eq('company_id', company_id);
      retryQ = applyWorkshopTemplateStageFilter(retryQ, req.query);
      const r3 = await retryQ;
      data = r3.data;
      error = r3.error;
    }
    if (error) throw error;
    const rows = (data || []).map((t) => ({
      ...t,
      items: [...(t.items || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    }));
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/task-templates', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { name, workshop_area, description, order_index } = req.body;
    const company_id = effectiveWorkshopCompanyId(req, req.body?.company_id);
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Thiếu tên bộ mẫu' });
    }
    if (!['production', 'logistics'].includes(workshop_area)) {
      return res.status(400).json({ error: 'workshop_area phải là production hoặc logistics' });
    }
    const production_stage_id = workshop_area === 'production'
      ? (req.body?.production_stage_id || null)
      : null;
    const logistics_stage_id = req.body?.logistics_stage_id || null;
    const stageCheck = await validateWorkshopTemplatePipelineStage(workshop_area, {
      production_stage_id,
      logistics_stage_id,
      company_id,
    });
    if (!stageCheck.ok) return res.status(400).json({ error: stageCheck.error });

    const wktCheck = await validateWorkshopTemplateWorkshopType({
      workshop_area,
      company_id,
      workshop_type_id: req.body?.workshop_type_id,
      production_stage_id: workshop_area === 'production' ? (production_stage_id || null) : null,
    });
    if (!wktCheck.ok) return res.status(400).json({ error: wktCheck.error });

    const insertRow = {
      name: name.trim(),
      workshop_area,
      description: description || null,
      order_index: order_index ?? 0,
      is_active: true,
      company_id: company_id || null,
      production_stage_id: workshop_area === 'production' ? (production_stage_id || null) : null,
      logistics_stage_id: workshop_area === 'logistics' ? (logistics_stage_id || null) : null,
      workshop_type_id: wktCheck.workshop_type_id,
    };
    let { data, error } = await supabase
      .from('workshop_task_templates')
      .insert(insertRow)
      .select()
      .single();
    if (error && isWorkshopTplCompanyMissingError(error)) {
      const { company_id: _c, production_stage_id: _p, logistics_stage_id: _l, ...legacy } = insertRow;
      const retry = await supabase
        .from('workshop_task_templates')
        .insert(legacy)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error && isWorkshopTplPipelineStageMissingError(error)) {
      const { production_stage_id: _p, logistics_stage_id: _l, ...noStage } = insertRow;
      const retry = await supabase
        .from('workshop_task_templates')
        .insert(noStage)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error && isWorkshopTplWorkshopTypeMissingError(error)) {
      const { workshop_type_id: _w, ...noWkt } = insertRow;
      const retry = await supabase
        .from('workshop_task_templates')
        .insert(noWkt)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/set-default-bundle', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const company_id = effectiveWorkshopCompanyId(req, req.body.company_id);
    const rawWkt = req.body.workshop_type_id;
    const markDefault = req.body.is_default !== false;
    const template_ids = Array.isArray(req.body.template_ids)
      ? req.body.template_ids.map(String).filter(Boolean)
      : null;

    if (!company_id) return res.status(400).json({ error: 'Thiếu company_id' });
    if (!rawWkt || String(rawWkt).toLowerCase() === 'global') {
      return res.status(400).json({ error: 'Chọn phân loại cụ thể (Cánh kính / Tủ bếp / …)' });
    }

    const wktCheck = await validateWorkshopTemplateWorkshopType({
      workshop_area: 'production',
      company_id,
      workshop_type_id: rawWkt,
      production_stage_id: null,
    });
    if (!wktCheck.ok) return res.status(400).json({ error: wktCheck.error });
    const workshop_type_id = wktCheck.workshop_type_id;

    let clearQ = supabase
      .from('workshop_task_templates')
      .update({ is_default: false })
      .eq('workshop_area', 'production')
      .eq('company_id', company_id)
      .eq('workshop_type_id', workshop_type_id);
    const { error: clearErr } = await clearQ;
    if (clearErr) throw clearErr;

    if (!markDefault) {
      return res.json({ ok: true, updated: 0, is_default: false, workshop_type_id });
    }

    let ids = template_ids;
    if (!ids?.length) {
      const { data: rows, error: listErr } = await supabase
        .from('workshop_task_templates')
        .select('id')
        .eq('workshop_area', 'production')
        .eq('company_id', company_id)
        .eq('workshop_type_id', workshop_type_id)
        .eq('is_active', true);
      if (listErr) throw listErr;
      ids = (rows || []).map((row) => row.id).filter(Boolean);
    }

    if (!ids.length) {
      return res.status(400).json({ error: 'Không có bộ mẫu nào để đặt mặc định cho phân loại này' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('workshop_task_templates')
      .update({ is_default: true })
      .in('id', ids)
      .eq('company_id', company_id)
      .eq('workshop_type_id', workshop_type_id)
      .select('id, name, is_default, order_index');
    if (updErr) throw updErr;

    res.json({
      ok: true,
      updated: updated?.length || 0,
      is_default: true,
      workshop_type_id,
      templates: (updated || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    let { data: existingRow, error: existingErr } = await supabase
      .from('workshop_task_templates')
      .select('workshop_area, company_id, production_stage_id, logistics_stage_id, workshop_type_id')
      .eq('id', req.params.id)
      .single();
    if (existingErr && isWorkshopTplCompanyMissingError(existingErr)) {
      const retryExisting = await supabase
        .from('workshop_task_templates')
        .select('workshop_area, production_stage_id, logistics_stage_id')
        .eq('id', req.params.id)
        .single();
      existingRow = retryExisting.data;
      existingErr = retryExisting.error;
    }
    if (existingErr) throw existingErr;

    const update = {};
    ['name', 'description', 'is_active', 'order_index', 'workshop_area', 'is_default'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.company_id !== undefined) {
      update.company_id = effectiveWorkshopCompanyId(req, req.body.company_id) || null;
    }
    if (req.body.production_stage_id !== undefined) {
      update.production_stage_id = req.body.production_stage_id || null;
    }
    if (req.body.logistics_stage_id !== undefined) {
      update.logistics_stage_id = req.body.logistics_stage_id || null;
    }
    if (req.body.workshop_type_id !== undefined) {
      const areaForWkt = update.workshop_area || existingRow?.workshop_area || 'production';
      const wktCheck = await validateWorkshopTemplateWorkshopType({
        workshop_area: areaForWkt,
        company_id: update.company_id !== undefined ? update.company_id : (existingRow?.company_id || null),
        workshop_type_id: req.body.workshop_type_id,
        production_stage_id: update.production_stage_id !== undefined
          ? update.production_stage_id
          : (existingRow?.production_stage_id ?? null),
      });
      if (!wktCheck.ok) return res.status(400).json({ error: wktCheck.error });
      update.workshop_type_id = wktCheck.workshop_type_id;
    }
    const areaForCheck = update.workshop_area || existingRow?.workshop_area || 'production';
    const mergedProdStage = update.production_stage_id !== undefined
      ? update.production_stage_id
      : (existingRow?.production_stage_id ?? null);
    const mergedLogStage = update.logistics_stage_id !== undefined
      ? update.logistics_stage_id
      : (existingRow?.logistics_stage_id ?? null);
    if (req.body.production_stage_id !== undefined || req.body.logistics_stage_id !== undefined
      || req.body.workshop_area !== undefined) {
      const stageCheck = await validateWorkshopTemplatePipelineStage(areaForCheck, {
        production_stage_id: mergedProdStage,
        logistics_stage_id: mergedLogStage,
        company_id: update.company_id !== undefined ? update.company_id : (existingRow?.company_id || null),
      });
      if (!stageCheck.ok) return res.status(400).json({ error: stageCheck.error });
    }
    if (update.workshop_area && !['production', 'logistics'].includes(update.workshop_area)) {
      return res.status(400).json({ error: 'workshop_area không hợp lệ' });
    }
    let { data, error } = await supabase
      .from('workshop_task_templates')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error && isWorkshopTplCompanyMissingError(error)) {
      const { company_id: _ignoredCompanyId, ...updateNoCompany } = update;
      const retry = await supabase
        .from('workshop_task_templates')
        .update(updateNoCompany)
        .eq('id', req.params.id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/task-templates/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    await supabase.from('workshop_task_template_items').delete().eq('template_id', req.params.id);
    const { error } = await supabase.from('workshop_task_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/task-templates/:tplId/items', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.title?.trim()) {
      return res.status(400).json({ error: 'Thiếu tiêu đề nhiệm vụ mẫu' });
    }
    const { data: existing } = await supabase
      .from('workshop_task_template_items')
      .select('order_index')
      .eq('template_id', req.params.tplId)
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.order_index ?? 0) + 1;
    const insertRow = {
      template_id: req.params.tplId,
      title: b.title.trim(),
      description: b.description || null,
      priority: b.priority || 'medium',
      deadline_days: Number.isFinite(Number(b.deadline_days)) ? Number(b.deadline_days) : 0,
      order_index: nextOrder,
      checklist: Array.isArray(b.checklist) ? b.checklist : [],
      default_allowed_companies: Array.isArray(b.default_allowed_companies) ? b.default_allowed_companies : null,
      default_allowed_departments: Array.isArray(b.default_allowed_departments) ? b.default_allowed_departments : null,
      executor_company_id: b.executor_company_id || null,
      blocks_stage_advance: !!b.blocks_stage_advance,
      completion_requires_file_or_note: !!b.completion_requires_file_or_note
        || (Array.isArray(b.required_evidence_file_types) && b.required_evidence_file_types.length > 0),
      required_evidence_file_types: Array.isArray(b.required_evidence_file_types) ? b.required_evidence_file_types : [],
      requires_quick_verdict: !!b.requires_quick_verdict,
    };
    let { data, error } = await supabase
      .from('workshop_task_template_items')
      .insert(insertRow)
      .select()
      .single();
    if (error && /required_evidence_file_types|completion_requires_file_or_note|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột minh chứng (migration 315/316). Chạy database/315_task_required_evidence_file_types.sql trên Supabase rồi thử lại.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && /executor_company_id/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột giao việc chéo (migration 318). Chạy database/318_cross_company_executor.sql trên Supabase rồi thử lại.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && String(error.message || '').includes('blocks_stage_advance')) {
      // DB chưa apply migration 256 — bỏ cờ và retry để vẫn tạo được item.
      const { blocks_stage_advance: _drop, ...legacy } = insertRow;
      ({ data, error } = await supabase
        .from('workshop_task_template_items')
        .insert(legacy)
        .select()
        .single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/:tplId/items/:itemId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'priority', 'deadline_days', 'order_index', 'checklist',
      'default_allowed_companies', 'default_allowed_departments', 'executor_company_id', 'blocks_stage_advance',
      'completion_requires_file_or_note', 'required_evidence_file_types', 'requires_quick_verdict'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.executor_company_id === '' || req.body.executor_company_id === null) {
      update.executor_company_id = null;
    }
    if (req.body.required_evidence_file_types !== undefined) {
      const types = Array.isArray(req.body.required_evidence_file_types) ? req.body.required_evidence_file_types : [];
      update.required_evidence_file_types = types;
      if (types.length && update.completion_requires_file_or_note === undefined) {
        update.completion_requires_file_or_note = true;
      }
    }
    let { data, error } = await supabase
      .from('workshop_task_template_items')
      .update(update)
      .eq('id', req.params.itemId)
      .select()
      .single();
    if (error && /required_evidence_file_types|completion_requires_file_or_note|requires_quick_verdict/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột minh chứng (migration 315/316). Chạy database/315_task_required_evidence_file_types.sql trên Supabase rồi thử lại.',
        code: 'db_migration_required_evidence',
      });
    }
    if (error && /executor_company_id/.test(error.message || '')) {
      return res.status(503).json({
        error: 'Database chưa có cột giao việc chéo (migration 318). Chạy database/318_cross_company_executor.sql trên Supabase rồi thử lại.',
        code: 'db_migration_executor_company',
      });
    }
    if (error && String(error.message || '').includes('blocks_stage_advance')) {
      const { blocks_stage_advance: _drop, ...legacy } = update;
      ({ data, error } = await supabase
        .from('workshop_task_template_items')
        .update(legacy)
        .eq('id', req.params.itemId)
        .select()
        .single());
    }
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/task-templates/:tplId/items/:itemId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { error } = await supabase.from('workshop_task_template_items').delete().eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/projects/:id/tasks/from-template', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const projectId = req.params.id;
    const { template_id } = req.body;
    const userId = req.user.userId;

    if (!template_id) {
      return res.status(400).json({ error: 'Thiếu template_id' });
    }

    const { data: tplRow } = await supabase
      .from('workshop_task_templates')
      .select('workshop_area, production_stage_id, logistics_stage_id')
      .eq('id', template_id)
      .maybeSingle();
    const applyOpts = {};
    if (tplRow?.workshop_area === 'production' && tplRow?.production_stage_id) {
      applyOpts.productionStageId = tplRow.production_stage_id;
    }
    const result = await applyWorkshopTemplateToProject(projectId, template_id, userId, applyOpts);
    if (!result.ok) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }
    res.status(201).json({ count: result.count, task_ids: result.task_ids });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Gen hàng loạt nhiệm vụ từ bộ mẫu xưởng — logic trong helpers/workshopApplyTemplates.js (applyAllActiveWorkshopTemplatesForArea).
 */
r.post('/projects/:id/tasks/generate-from-templates', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const workshop_area = String(req.body?.workshop_area || 'production');
    if (!['production', 'logistics'].includes(workshop_area)) {
      return res.status(400).json({ error: 'workshop_area phải là production hoặc logistics' });
    }

    const out = await applyAllActiveWorkshopTemplatesForArea(req.params.id, req.user.userId, {
      workshopArea: workshop_area,
      companyId: req.body?.company_id ?? undefined,
      productionStageId: req.body?.production_stage_id ?? undefined,
      logisticsStageId: req.body?.logistics_stage_id ?? undefined,
    });
    if (!out.ok) {
      const msg = String(out.error || '');
      const st = msg.includes('Không tìm thấy dự án') ? 404 : 400;
      return res.status(st).json({ error: out.error });
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ INCIDENTS (Sự cố xưởng) ═══

r.get('/projects/:id/incidents', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('project_incidents')
      .select(`
        id, title, description, severity, status, created_at, resolved_at,
        reporter:users!project_incidents_reported_by_fkey(id, full_name, avatar),
        resolver:users!project_incidents_resolved_by_fkey(id, full_name, avatar)
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ incidents: data || [] });
  } catch (e) {
    if (e.message?.includes('project_incidents')) {
      return res.json({ incidents: [], _note: 'migration_pending' });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/projects/:id/incidents', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, severity } = req.body;
    const userId = req.user.userId;
    if (!title?.trim()) return res.status(400).json({ error: 'Thiếu tiêu đề sự cố' });
    const { data, error } = await supabase
      .from('project_incidents')
      .insert({
        project_id: id,
        reported_by: userId,
        title: title.trim(),
        description: description || null,
        severity: severity || 'medium',
        status: 'open',
      })
      .select(`
        id, title, description, severity, status, created_at,
        reporter:users!project_incidents_reported_by_fkey(id, full_name, avatar)
      `)
      .single();
    if (error) throw error;

    // Notify managers and production supervisors
    try {
      const { data: managers } = await supabase
        .from('users')
        .select('id')
        .in('role', ['manager', 'admin'])
        .eq('is_active', true);
      const recipientIds = (managers || []).map((u) => u.id).filter((uid) => uid !== userId);
      if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && recipientIds.length) {
        const { notifyMultiple: notifyM } = require('../helpers/notifications');
        await notifyM(
          req, recipientIds, 'project_updated',
          `⚠️ Sự cố: ${title}`,
          `Dự án ${id} báo sự cố mức ${severity || 'medium'}`,
          'project', id,
        );
      }
    } catch (ne) {
      console.warn('[incidents] notify:', ne.message);
    }

    res.status(201).json({ incident: data });
  } catch (e) {
    if (e.message?.includes('project_incidents')) {
      return res.status(503).json({ error: 'Tính năng báo sự cố chưa được kích hoạt. Vui lòng chạy migration 76.' });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.patch('/projects/:projectId/incidents/:incidentId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { projectId, incidentId } = req.params;
    const { status, description } = req.body;
    const userId = req.user.userId;
    const update = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (description !== undefined) update.description = description;
    if (status === 'resolved' || status === 'closed') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = userId;
    }
    const { data, error } = await supabase
      .from('project_incidents')
      .update(update)
      .eq('id', incidentId)
      .eq('project_id', projectId)
      .select('id, title, severity, status, resolved_at')
      .single();
    if (error) throw error;
    res.json({ incident: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

function userCanAccessProductionHandover(req, productionCompanyId) {
  const pid = String(productionCompanyId || '').trim();
  if (!pid) return false;
  if (isSystemAdmin(req.user)) return true;
  if (String(req.user?.company_id || '') === pid) return true;
  return false;
}

// ─── Bàn giao CRM → SX: người phụ trách + phân công mục mẫu + đội SX ───
r.get('/handover-settings/:companyId', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const v = await validateProductionCompanyId(companyId);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!userCanAccessProductionHandover(req, companyId)) return res.status(403).json({ error: 'Không có quyền xem cấu hình công ty này' });

    const { data: settings } = await supabase
      .from('production_handover_settings')
      .select('*')
      .eq('production_company_id', companyId)
      .maybeSingle();

    const { data: assignments } = await supabase
      .from('production_handover_task_assignments')
      .select('*')
      .eq('production_company_id', companyId);

    const { data: teams } = await supabase
      .from('workshop_teams')
      .select('id, name, type, company_id, color, is_active')
      .eq('company_id', companyId)
      .eq('type', 'production')
      .order('name');

    const { data: tplScoped } = await supabase
      .from('workshop_task_templates')
      .select('id, name')
      .eq('workshop_area', 'production')
      .eq('is_active', true)
      .eq('company_id', companyId);
    const { data: tplGlobal } = await supabase
      .from('workshop_task_templates')
      .select('id, name')
      .eq('workshop_area', 'production')
      .eq('is_active', true)
      .is('company_id', null);

    const tplList = [...(tplScoped || []), ...(tplGlobal || [])];
    const tplIds = [...new Set(tplList.map((t) => t.id).filter(Boolean))];
    let template_items = [];
    if (tplIds.length) {
      const { data: items } = await supabase
        .from('workshop_task_template_items')
        .select('id, template_id, title, order_index')
        .in('template_id', tplIds)
        .order('order_index');
      const nameByTpl = Object.fromEntries(tplList.map((t) => [t.id, t.name]));
      template_items = (items || []).map((it) => ({
        ...it,
        template_name: nameByTpl[it.template_id] || '',
      }));
    }

    // Users theo công ty: hệ thống có thể không set `users.company_id` (chỉ suy ra qua departments.company_id).
    // Vì vậy: ưu tiên lấy trực tiếp theo users.company_id; nếu rỗng thì fallback qua departments → users.department_id.
    let usersCo = [];
    try {
      const { data: direct } = await supabase
        .from('users')
        .select('id, full_name, email, role, department:departments!users_department_id_fkey(id, name, company_id)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('full_name');
      usersCo = direct || [];
    } catch (_e) {
      usersCo = [];
    }
    if (!usersCo.length) {
      const { data: dpts } = await supabase
        .from('departments')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true);
      const deptIds = (dpts || []).map((d) => d.id).filter(Boolean);
      if (deptIds.length) {
        const { data: viaDept } = await supabase
          .from('users')
          .select('id, full_name, email, role, department:departments!users_department_id_fkey(id, name, company_id)')
          .in('department_id', deptIds)
          .eq('is_active', true)
          .order('full_name');
        usersCo = viaDept || [];
      }
    }

    res.json({
      settings: settings || null,
      assignments: assignments || [],
      production_teams: teams || [],
      template_items,
      users: usersCo || [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/handover-settings/:companyId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const v = await validateProductionCompanyId(companyId);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!userCanAccessProductionHandover(req, companyId)) return res.status(403).json({ error: 'Không có quyền sửa cấu hình công ty này' });

    const { responsible_user_id, default_production_team_id, assignments } = req.body || {};

    if (default_production_team_id) {
      const { data: wt } = await supabase
        .from('workshop_teams')
        .select('id, company_id, type')
        .eq('id', default_production_team_id)
        .maybeSingle();
      if (!wt || wt.type !== 'production' || String(wt.company_id || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Đội SX mặc định không hợp lệ cho công ty này' });
      }
    }

    if (responsible_user_id) {
      // User có thể không set `users.company_id` (suy ra qua department.company_id)
      const { data: ru } = await supabase
        .from('users')
        .select('id, company_id, department:departments!users_department_id_fkey(id, company_id)')
        .eq('id', responsible_user_id)
        .maybeSingle();
      const resolvedCompanyId = ru?.company_id || ru?.department?.company_id || null;
      if (!ru || String(resolvedCompanyId || '') !== String(companyId)) {
        return res.status(400).json({ error: 'Người phụ trách phải thuộc đúng công ty sản xuất' });
      }
    }

    const now = new Date().toISOString();
    const { error: upErr } = await supabase.from('production_handover_settings').upsert(
      {
        production_company_id: companyId,
        responsible_user_id: responsible_user_id || null,
        default_production_team_id: default_production_team_id || null,
        updated_at: now,
      },
      { onConflict: 'production_company_id' },
    );
    if (upErr) throw upErr;

    await supabase.from('production_handover_task_assignments').delete().eq('production_company_id', companyId);

    const rows = [];
    if (Array.isArray(assignments)) {
      for (const a of assignments) {
        const tid = a.template_item_id && String(a.template_item_id).trim();
        if (!tid) continue;
        rows.push({
          production_company_id: companyId,
          template_item_id: tid,
          assignee_user_id: a.assignee_user_id || null,
        });
      }
    }
    if (rows.length) {
      const { error: insA } = await supabase.from('production_handover_task_assignments').insert(rows);
      if (insA) throw insA;
    }

    const { data: settings } = await supabase
      .from('production_handover_settings')
      .select('*')
      .eq('production_company_id', companyId)
      .single();

    const { data: assignmentsOut } = await supabase
      .from('production_handover_task_assignments')
      .select('*')
      .eq('production_company_id', companyId);

    res.json({ settings, assignments: assignmentsOut || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── NV mặc định theo phân loại xưởng (multi-select) ───
r.get('/workshop-type-staff-defaults/:companyId', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const v = await validateProductionCompanyId(companyId);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!userCanAccessProductionHandover(req, companyId)) {
      return res.status(403).json({ error: 'Không có quyền xem cấu hình công ty này' });
    }

    const {
      loadUsersForProductionCompany,
      loadWorkshopTypeDefaultStaffMap,
      formatDefaultsForApi,
    } = require('../helpers/productionWorkshopTypeStaff');

    const { data: types } = await supabase
      .from('workshop_project_types')
      .select('id, name, order_index, is_active, applies_to')
      .eq('company_id', companyId)
      .in('applies_to', ['production', 'both'])
      .order('order_index')
      .order('name');

    const { data: settings } = await supabase
      .from('production_handover_settings')
      .select('responsible_user_id')
      .eq('production_company_id', companyId)
      .maybeSingle();

    const staffMap = await loadWorkshopTypeDefaultStaffMap(companyId);
    const defaults = formatDefaultsForApi(staffMap);

    const users = await loadUsersForProductionCompany(companyId);

    res.json({
      users,
      workshop_types: types || [],
      defaults,
      fallback_responsible_user_id: settings?.responsible_user_id || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/workshop-type-staff-defaults/:companyId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const v = await validateProductionCompanyId(companyId);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (!userCanAccessProductionHandover(req, companyId)) {
      return res.status(403).json({ error: 'Không có quyền sửa cấu hình công ty này' });
    }

    const { defaults, fallback_responsible_user_id } = req.body || {};
    const { saveWorkshopTypeDefaultStaff, userBelongsToProductionCompany } = require('../helpers/productionWorkshopTypeStaff');

    if (fallback_responsible_user_id !== undefined) {
      if (fallback_responsible_user_id) {
        const ok = await userBelongsToProductionCompany(fallback_responsible_user_id, companyId);
        if (!ok) return res.status(400).json({ error: 'Người dự phòng phải thuộc đúng công ty sản xuất' });
      }
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from('production_handover_settings')
        .select('default_production_team_id')
        .eq('production_company_id', companyId)
        .maybeSingle();
      await supabase.from('production_handover_settings').upsert(
        {
          production_company_id: companyId,
          responsible_user_id: fallback_responsible_user_id || null,
          default_production_team_id: existing?.default_production_team_id || null,
          updated_at: now,
        },
        { onConflict: 'production_company_id' },
      );
    }

    const result = await saveWorkshopTypeDefaultStaff(companyId, defaults);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SX PERSONAL PLANNER — mỗi user tự tạo cột và xếp dự án sản xuất vào
// (mirror /api/crm/planner/* trên 170_crm_user_planner.sql)
// ════════════════════════════════════════════════════════════════════════════

function sxPlannerTableMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('sx_user_planner_columns') || msg.includes('sx_user_planner_items');
}

// GET /api/production/planner/me — toàn bộ columns + items của user hiện tại
r.get('/planner/me', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: cols, error: colErr } = await supabase
      .from('sx_user_planner_columns')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('id', { ascending: true });
    if (colErr) {
      if (sxPlannerTableMissing(colErr)) return res.json({ columns: [], items: [] });
      throw colErr;
    }

    const columnIds = (cols || []).map((c) => c.id);
    let items = [];
    if (columnIds.length) {
      const { data: itemRows, error: itemErr } = await supabase
        .from('sx_user_planner_items')
        .select('id, column_id, project_id, position, added_at')
        .in('column_id', columnIds)
        .order('position', { ascending: true })
        .order('id', { ascending: true });
      if (itemErr && !sxPlannerTableMissing(itemErr)) throw itemErr;
      items = itemRows || [];
    }

    res.json({ columns: cols || [], items });
  } catch (e) {
    console.error('GET /production/planner/me:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/planner/columns', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên cột bắt buộc' });
    const color = req.body?.color || null;
    const companyId = (req.body?.company_id || req.user?.company_id || null) || null;

    const { data: maxRow } = await supabase
      .from('sx_user_planner_columns')
      .select('position')
      .eq('user_id', userId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from('sx_user_planner_columns')
      .insert({ user_id: userId, company_id: companyId, name, color, position: nextPos })
      .select('*')
      .single();
    if (error) {
      if (sxPlannerTableMissing(error)) {
        return res.status(500).json({
          error: 'Bảng planner chưa được tạo. Hãy chạy migration database/247_sx_user_planner.sql.',
        });
      }
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('POST /production/planner/columns:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.patch('/planner/columns/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    const patch = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
    if (req.body?.color !== undefined) patch.color = req.body.color || null;
    if (req.body?.position !== undefined) patch.position = Number(req.body.position) || 0;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('sx_user_planner_columns')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('PATCH /production/planner/columns/:id:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/planner/columns/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    const { error } = await supabase
      .from('sx_user_planner_columns')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /production/planner/columns/:id:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/planner/columns/:id/items', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const columnId = Number(req.params.id);
    const projectIds = Array.isArray(req.body?.project_ids)
      ? req.body.project_ids.map((v) => String(v || '').trim()).filter(Boolean)
      : (req.body?.project_id ? [String(req.body.project_id).trim()] : []);
    if (!projectIds.length) return res.status(400).json({ error: 'project_id bắt buộc' });

    const { data: col } = await supabase
      .from('sx_user_planner_columns')
      .select('id')
      .eq('id', columnId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!col) return res.status(404).json({ error: 'Không tìm thấy cột' });

    const { data: maxRow } = await supabase
      .from('sx_user_planner_items')
      .select('position')
      .eq('column_id', columnId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextPos = (maxRow?.position ?? -1) + 1;

    const rows = projectIds.map((pid) => ({ column_id: columnId, project_id: pid, position: nextPos++ }));
    const { data, error } = await supabase
      .from('sx_user_planner_items')
      .upsert(rows, { onConflict: 'column_id,project_id', ignoreDuplicates: true })
      .select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('POST /production/planner/columns/:id/items:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.post('/planner/reorder', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ ok: true });

    const { data: myCols } = await supabase
      .from('sx_user_planner_columns')
      .select('id')
      .eq('user_id', userId);
    const allowed = new Set((myCols || []).map((c) => Number(c.id)));

    for (const it of items) {
      const id = Number(it.id);
      const columnId = Number(it.column_id);
      const position = Number(it.position) || 0;
      if (!id || !columnId || !allowed.has(columnId)) continue;
      await supabase
        .from('sx_user_planner_items')
        .update({ column_id: columnId, position })
        .eq('id', id);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /production/planner/reorder:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

r.delete('/planner/items/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    const { data: row } = await supabase
      .from('sx_user_planner_items')
      .select('id, column:sx_user_planner_columns!inner(user_id)')
      .eq('id', id)
      .maybeSingle();
    if (!row || String(row.column?.user_id || '') !== String(userId || '')) {
      return res.status(404).json({ error: 'Không tìm thấy' });
    }
    const { error } = await supabase
      .from('sx_user_planner_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /production/planner/items/:id:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

function isSxProductionCommentNotification(n) {
  if (!n || String(n.type || '') !== 'comment_added') return false;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (String(meta.ecosystem_module_key || '') === 'production') return true;
  return n.entity_type === 'project' && !!meta.project_id;
}

async function filterSxProductionCommentNotifications(rows) {
  const list = (rows || []).filter(isSxProductionCommentNotification);
  const projectIds = [
    ...new Set(list.map((n) => {
      const meta = n.metadata || {};
      return String(meta.project_id || n.entity_id || '').trim();
    }).filter(Boolean)),
  ];
  if (!projectIds.length) return [];
  const { data: projs } = await supabase
    .from('projects')
    .select('id, code, name, production_person_id')
    .in('id', projectIds);
  const prodMap = new Map(
    (projs || [])
      .filter((p) => p.production_person_id)
      .map((p) => [String(p.id), p]),
  );
  return list
    .filter((n) => {
      const meta = n.metadata || {};
      const pid = String(meta.project_id || n.entity_id || '');
      return prodMap.has(pid);
    })
    .map((n) => {
      const meta = n.metadata || {};
      const pid = String(meta.project_id || n.entity_id || '');
      const proj = prodMap.get(pid);
      return {
        ...n,
        metadata: {
          ...meta,
          project_id: pid,
          project_code: meta.project_code || proj?.code || null,
          project_name: meta.project_name || proj?.name || null,
        },
      };
    });
}

// ─── Xưởng SX: thông báo bình luận ───
r.get('/notifications/comments', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const unreadOnly = String(req.query.unread || '') === 'true';

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'comment_added')
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) throw error;

    let items = await filterSxProductionCommentNotifications(data);
    if (unreadOnly) items = items.filter((n) => !n.is_read);
    const unreadCount = items.filter((n) => !n.is_read).length;
    res.json({ notifications: items.slice(0, lim), unread_count: unreadCount });
  } catch (e) {
    console.error('GET /production/notifications/comments:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải thông báo' });
  }
});

r.get('/notifications/comments/unread-count', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'comment_added')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) throw error;
    const items = await filterSxProductionCommentNotifications(data);
    res.json({ unread_count: items.length });
  } catch (e) {
    console.error('GET /production/notifications/comments/unread-count:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.put('/notifications/comments/read-all', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, entity_type, metadata, is_read')
      .eq('user_id', userId)
      .eq('type', 'comment_added')
      .eq('is_read', false)
      .limit(500);
    if (error) throw error;
    const items = await filterSxProductionCommentNotifications(data);
    const ids = items.map((n) => n.id).filter(Boolean);
    if (ids.length) {
      const { error: upErr } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', ids)
        .eq('user_id', userId);
      if (upErr) throw upErr;
    }
    try {
      rcInvalidateTags(['notifications', `user:${userId}`]);
    } catch { /* ignore */ }
    res.json({ ok: true, marked: ids.length });
  } catch (e) {
    console.error('PUT /production/notifications/comments/read-all:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

module.exports = r;
