/**
 * API module Quản lý — dashboard tổng hợp CRM + SX + VC và trang deal thống nhất.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const { getWonDealProjectIds, ensureHasCrmDealColumn } = require('../helpers/workshopKanban');
const { fetchAllByIds, fetchAllByIdsParallel, fetchAllPagesParallel } = require('../helpers/supabaseFetchAll');
const {
  buildProjectDealBundle,
  isProjectDeliveryStageRow,
  buildDeliveryFlow,
  DEFAULT_DELIVERY_STAGES,
} = require('../helpers/projectDealBundle');
const { sortProjectCrmDeals } = require('../helpers/workshopCrmDeals');
const {
  listCrmLinkedProjectIds,
  projectHasCrmDealInCompanies,
} = require('../helpers/projectParticipantCompanies');
const {
  resolveCompanyScopeForRequest,
  applyCompanyScopeFilter,
  applyProjectScopeFilter,
  TENANT_EMPTY_COMPANY_SENTINEL,
} = require('../helpers/tenantScope');
const { applyOpenOnlyFilter, applyPrimaryLeadOnly } = require('../helpers/unifiedTasksQuery');
const { warnQ } = require('../helpers/queryErrorLog');
const { resolveWorkRegionScope } = require('../helpers/workRegionFilter');
const { responseCache } = require('../middleware/responseCache');
const { PROJECTS_LIST_TAG } = require('../middleware/projectsCacheInvalidation');
const { MODULE, resolveModuleDeadline } = require('../helpers/moduleDeadlinePolicy');
const { classifyProjectForecast } = require('../helpers/projectForecast');
const { orgReportDealIsClosedWon, loadDealKhSplitContext } = require('../helpers/crmDealKhSplit');
const {
  WORK_UNIFIED_UUID_RE,
  parseWorkUnifiedUserIds,
  workUnifiedItemMatchesUserIds,
  dealMatchesWorkUnifiedUser,
} = require('../helpers/workUnifiedUserFilter');

const r = Router();
r.use(auth);

function userIsAdmin(role) {
  return isAdminLike({ role });
}

function scopedAdminCompanyId(req) {
  const sac = req.user?.scoped_admin_company_id || req.user?.scopedAdminCompanyId;
  return sac && String(sac).trim() ? String(sac).trim() : null;
}

function getCompanyScope(req, companyIdQuery) {
  return resolveCompanyScopeForRequest(req, companyIdQuery, {
    scopedAdminCompanyId: scopedAdminCompanyId(req),
  });
}

function primaryCompanyIdFromScope(scope) {
  if (!scope?.ok) return null;
  if (scope.companyId && scope.companyId !== TENANT_EMPTY_COMPANY_SENTINEL) return scope.companyId;
  if (scope.companyIds?.length === 1) return scope.companyIds[0];
  return scope.companyIds?.[0] || null;
}

function scopeCompanyIdList(scope) {
  if (!scope?.ok) return [];
  if (scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) return [];
  if (scope.companyIds?.length) return scope.companyIds.map(String);
  if (scope.companyId) return [String(scope.companyId)];
  return [];
}

function pickWorkUnifiedDeal(deals, scopeIds) {
  const list = deals || [];
  if (!list.length) return null;
  const scoped = scopeIds?.size
    ? list.filter((d) => scopeIds.has(String(d.company_id)))
    : list;
  return sortProjectCrmDeals(scoped.length ? scoped : list)[0] || null;
}

function attachDealToProjectMap(map, projectId, deal) {
  if (!projectId || !deal?.id) return;
  const k = String(projectId);
  if (!map.has(k)) map.set(k, []);
  const arr = map.get(k);
  if (!arr.some((d) => String(d.id) === String(deal.id))) arr.push(deal);
}

const WORK_UNIFIED_PROJECT_COLUMNS = `
        id, code, name, status, deadline, estimated_value, production_value, deposit_amount, collected_amount,
        customer_id, current_stage_id, install_date, delivery_date, production_deadline,
        project_manager_id, sales_person_id, production_person_id, company_id, logistics_company_id,
        workshop_type_id, sx_kanban_column_id,
        customer:customers(id, full_name, phone),
        current_stage:workflow_stages(id, name, slug, color, order_index),
        project_manager:users!projects_project_manager_id_fkey(id, full_name),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        production_person:users!projects_production_person_id_fkey(id, full_name)
      `;

/**
 * Bộ cột NHẸ cho lượt quét lọc/đếm của /work-unified (view Danh sách).
 * Bỏ hết embed nặng (customer, workflow_stages, 3× users) — chỉ giữ cột phẳng đủ để
 * tính luồng giao hàng, forecast, và mọi bộ lọc. Embed chỉ tốn thời gian khi phải
 * serialize cho CẢ tập (8.000 dòng), trong khi người dùng chỉ xem 20 dòng/trang.
 * `current_stage_id` là cột phẳng nên resolveDeliveryCurrentIndex() vẫn khớp đúng công
 * đoạn mà không cần embed workflow_stages.
 */
const WORK_UNIFIED_PROJECT_COLUMNS_LITE = `
        id, code, name, status, deadline, install_date, delivery_date, production_deadline,
        customer_id, current_stage_id,
        project_manager_id, sales_person_id, production_person_id, company_id, logistics_company_id,
        workshop_type_id, sx_kanban_column_id
      `;

/** Như trên nhưng thêm tên khách — chỉ cần khi có tham số `search` (tìm theo tên KH). */
const WORK_UNIFIED_PROJECT_COLUMNS_LITE_SEARCH = `${WORK_UNIFIED_PROJECT_COLUMNS_LITE}, customer:customers(full_name)`;

/** Cột deal nhẹ — bỏ embed company_regions; bộ lọc khu vực chỉ dùng `region_id` phẳng. */
const WORK_UNIFIED_DEAL_COLUMNS_LITE = 'id, code, title, type, project_id, company_id, parent_lead_id, created_at, assigned_to, lead_owner_id, region_id, stage_id';

/** Cột deal đầy đủ — cần `crm_region` + tên NV deal để cột «Người phụ trách» khớp bộ lọc NV. */
const WORK_UNIFIED_DEAL_COLUMNS = `${WORK_UNIFIED_DEAL_COLUMNS_LITE}, crm_region:company_regions(id, name, company_id), assignee:users!crm_leads_assigned_to_fkey(id, full_name), lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name)`;

function denyScope(res, scope) {
  if (scope?.ok) return false;
  res.status(scope?.code === 'tenant_company_denied' ? 403 : 400).json({
    error: scope?.error || 'Không có quyền truy cập',
    code: scope?.code,
  });
  return true;
}

function assertLeadInScope(res, scope, lead) {
  if (!scope?.ok) return denyScope(res, scope);
  if (scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) {
    res.status(404).json({ error: 'Không tìm thấy deal/lead' });
    return false;
  }
  const cid = lead?.company_id != null ? String(lead.company_id) : null;
  if (!cid) {
    res.status(403).json({ error: 'Không có quyền xem deal này' });
    return false;
  }
  if (scope.companyId && scope.companyId !== cid) {
    res.status(403).json({ error: 'Không có quyền xem deal này' });
    return false;
  }
  if (scope.companyIds?.length && !scope.companyIds.includes(cid)) {
    res.status(403).json({ error: 'Không có quyền xem deal này' });
    return false;
  }
  return true;
}

async function assertProjectInScope(res, scope, project) {
  if (!project) return true;
  if (!scope?.ok) return denyScope(res, scope);
  if (scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) {
    res.status(404).json({ error: 'Không tìm thấy dự án' });
    return false;
  }
  const cid = project.company_id != null ? String(project.company_id) : null;
  const lcid = project.logistics_company_id != null ? String(project.logistics_company_id) : null;
  const inScope = (id) => {
    if (!id) return false;
    if (scope.companyId) return scope.companyId === id;
    if (scope.companyIds?.length) return scope.companyIds.includes(id);
    return true;
  };
  if (inScope(cid) || inScope(lcid)) return true;
  const scopedCompanies = scopeCompanyIdList(scope);
  if (scopedCompanies.length && await projectHasCrmDealInCompanies(project.id, scopedCompanies)) {
    return true;
  }
  res.status(403).json({ error: 'Không có quyền xem dự án này' });
  return false;
}

function parsePagination(req, defaultSize = 50, maxSize = 200) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const requested = parseInt(req.query.page_size || req.query.limit, 10) || defaultSize;
  const pageSize = Math.max(1, Math.min(maxSize, requested));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

const FETCH_ALL_CHUNK = 1000;
const FETCH_ALL_MAX = 100000;

async function fetchAllLeadRows(queryBuilder) {
  const rows = [];
  let offset = 0;
  while (rows.length < FETCH_ALL_MAX) {
    const { data, error } = await queryBuilder().range(offset, offset + FETCH_ALL_CHUNK - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < FETCH_ALL_CHUNK) break;
    offset += FETCH_ALL_CHUNK;
  }
  return rows;
}

async function loadDefaultPipelineId(companyId) {
  const { data } = await supabase
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

function getScopeCompanyIds(scope) {
  if (!scope?.ok) return [];
  if (scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) return [];
  if (scope.companyId) return [scope.companyId];
  if (scope.companyIds?.length) return scope.companyIds;
  return null;
}

function mergeStagesForPipeline(stages) {
  const map = new Map();
  for (const s of stages || []) {
    const key = `${s.order_index ?? 0}|${String(s.name || '').trim().toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        order_index: s.order_index,
        is_won: s.is_won,
        is_lost: s.is_lost,
        bucket_slug: s.bucket_slug,
        stage_ids: [String(s.id)],
      });
    } else {
      map.get(key).stage_ids.push(String(s.id));
    }
  }
  return [...map.values()].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

async function loadCrmStagesForScope(scope, pipelineType) {
  if (scope?.companyId === TENANT_EMPTY_COMPANY_SENTINEL) return [];
  const companyIds = getScopeCompanyIds(scope);

  if (companyIds?.length === 1) {
    const pipelineId = await loadDefaultPipelineId(companyIds[0]);
    let q = supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type')
      .eq('is_active', true)
      .eq('pipeline_type', pipelineType)
      .order('order_index');
    if (pipelineId) q = q.eq('pipeline_id', pipelineId);
    const { data } = await q;
    return (data || []).filter((s) => !s.is_lost);
  }

  if (companyIds?.length > 1) {
    const allStages = [];
    for (const cid of companyIds) {
      const pipelineId = await loadDefaultPipelineId(cid);
      if (!pipelineId) continue;
      const { data } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type')
        .eq('is_active', true)
        .eq('pipeline_type', pipelineType)
        .eq('pipeline_id', pipelineId)
        .order('order_index');
      (data || []).forEach((s) => { if (!s.is_lost) allStages.push(s); });
    }
    return mergeStagesForPipeline(allStages);
  }

  let q = supabase
    .from('crm_pipeline_stages')
    .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type, pipeline_id')
    .eq('is_active', true)
    .eq('pipeline_type', pipelineType)
    .order('order_index');
  const { data } = await q;
  return mergeStagesForPipeline((data || []).filter((s) => !s.is_lost));
}

async function loadCrmDealStages(scope) {
  return loadCrmStagesForScope(scope, 'deal');
}

async function loadCrmLeadStages(scope) {
  return loadCrmStagesForScope(scope, 'lead');
}

async function countLeadsByStage(scope, type, dateFrom, dateTo, assigneeId) {
  let q = supabase
    .from('crm_leads')
    .select('stage_id')
    .eq('type', type);
  q = applyCompanyScopeFilter(q, scope);
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo) q = q.lte('created_at', dateTo);
  if (assigneeId) q = q.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
  const { data } = await q;
  const counts = {};
  for (const row of data || []) {
    const sid = row.stage_id ? String(row.stage_id) : '__none__';
    counts[sid] = (counts[sid] || 0) + 1;
  }
  return counts;
}

function buildPipelineFromStages(stages, counts) {
  return (stages || []).map((s) => {
    const ids = s.stage_ids || [String(s.id)];
    const count = ids.reduce((sum, id) => sum + (counts[id] || counts[String(id)] || 0), 0);
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      order_index: s.order_index,
      is_won: s.is_won,
      count,
      stage_ids: ids,
    };
  });
}

async function loadWonStageIds(scope) {
  const stages = await loadCrmDealStages(scope);
  return (stages || []).filter((s) => s.is_won).map((s) => String(s.id));
}

async function loadDealPipelineMetrics(scope, dateFrom, dateTo, assigneeId) {
  let q = supabase
    .from('crm_leads')
    // crm_leads không có `budget` lẫn `deadline` — chỉ có estimated_value.
    .select('estimated_value, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)')
    .eq('type', 'deal');
  q = applyCompanyScopeFilter(q, scope);
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo) q = q.lte('created_at', dateTo);
  if (assigneeId) q = q.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
  const { data } = warnQ('management:deal-pipeline')(await q);
  const now = Date.now();
  let pipelineValue = 0;
  let crmOverdue = 0;
  for (const row of data || []) {
    if (row.stage?.is_won || row.stage?.is_lost) continue;
    pipelineValue += Number(row.estimated_value || 0);
  }
  return { pipeline_value: pipelineValue, crm_overdue: crmOverdue };
}

function isProjectOverdue(project, moduleKey = MODULE.PRODUCTION, stage = null) {
  return resolveModuleDeadline(moduleKey, project, { stage }).state === 'overdue';
}

function applyDealRowFilters(rows, { phase, focus, sxStageId, sxStageIds, vcStageId, vcStageIds, installStageIds }) {
  let out = rows || [];
  const sxIds = String(sxStageIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  const vcIds = String(vcStageIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  const installIds = installStageIds || new Set();
  if (phase === 'crm') {
    out = out.filter((d) => !d.project_id || !d.stage?.is_won);
  } else if (phase === 'sx') {
    out = out.filter((d) => d.project_id);
  } else if (phase === 'install') {
    out = out.filter((d) => {
      const col = d.project?.vc_kanban_column_id;
      return col && installIds.has(String(col));
    });
  } else if (phase === 'vc') {
    out = out.filter((d) => {
      const col = d.project?.vc_kanban_column_id;
      if (!col) return false;
      return !installIds.has(String(col));
    });
  }
  if (focus === 'overdue_crm') {
    const now = Date.now();
    out = out.filter((d) => d.deadline && new Date(d.deadline).getTime() < now && !d.stage?.is_won);
  } else if (focus === 'sx_intake') {
    out = out.filter((d) => d.project_id && !d.project?.sx_kanban_column_id);
  } else if (focus === 'sx_overdue') {
    out = out.filter((d) => d.project_id
      && isProjectOverdue(d.project, MODULE.PRODUCTION, d.project?.sx_stage));
  } else if (focus === 'vc_overdue') {
    out = out.filter((d) => d.project?.vc_kanban_column_id
      && isProjectOverdue(d.project, MODULE.LOGISTICS, d.project?.vc_stage));
  }
  if (sxStageId === '__intake__') {
    out = out.filter((d) => d.project_id && !d.project?.sx_kanban_column_id);
  } else if (sxStageId || sxIds.length) {
    const match = (col) => {
      if (!col) return false;
      if (sxIds.length) return sxIds.includes(String(col));
      return String(col) === String(sxStageId);
    };
    out = out.filter((d) => match(d.project?.sx_kanban_column_id));
  }
  if (vcStageId || vcIds.length) {
    const match = (col) => {
      if (!col) return false;
      if (vcIds.length) return vcIds.includes(String(col));
      return String(col) === String(vcStageId);
    };
    out = out.filter((d) => match(d.project?.vc_kanban_column_id));
  }
  return out;
}

function needsDealPostFilter({ phase, focus, sxStageId, vcStageId }) {
  return !!(phase === 'crm' || phase === 'sx' || phase === 'vc' || phase === 'install'
    || focus === 'sx_intake' || focus === 'sx_overdue' || focus === 'vc_overdue' || sxStageId || vcStageId);
}

function isInstallStageMeta(stage) {
  const name = String(stage?.name || '').toLowerCase();
  const slug = String(stage?.bucket_slug || '').toLowerCase();
  return slug.includes('install') || name.includes('lắp') || name.includes('lap dat') || name.includes('lắp đặt');
}

function collectStageIds(stages, predicate) {
  const ids = new Set();
  for (const s of stages || []) {
    if (!predicate(s)) continue;
    for (const id of (s.stage_ids || [String(s.id)])) ids.add(String(id));
  }
  return ids;
}

async function enrichRowsWithWorkshopStages(rows) {
  const sxIds = [...new Set((rows || []).map((r) => r.project?.sx_kanban_column_id).filter(Boolean))];
  const vcIds = [...new Set((rows || []).map((r) => r.project?.vc_kanban_column_id).filter(Boolean))];
  const sxMap = {};
  const vcMap = {};
  if (sxIds.length) {
    const { data } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, color, bucket_slug, sla_days, counts_as_completed_revenue, counts_as_collected_revenue')
      .in('id', sxIds);
    for (const s of data || []) sxMap[String(s.id)] = s;
  }
  if (vcIds.length) {
    const { data } = await supabase.from('logistics_pipeline_stages').select('id, name, color, bucket_slug').in('id', vcIds);
    for (const s of data || []) vcMap[String(s.id)] = s;
  }
  return (rows || []).map((row) => {
    if (!row.project) return row;
    const p = { ...row.project };
    if (p.sx_kanban_column_id && sxMap[String(p.sx_kanban_column_id)]) {
      p.sx_stage = sxMap[String(p.sx_kanban_column_id)];
    }
    if (p.vc_kanban_column_id && vcMap[String(p.vc_kanban_column_id)]) {
      p.vc_stage = vcMap[String(p.vc_kanban_column_id)];
    }
    return { ...row, project: p };
  });
}

async function attachTaskAndDocCounts(rows) {
  const leadIds = (rows || []).map((d) => d.id).filter(Boolean);
  const taskCounts = {};
  const docCounts = {};
  const CHUNK = 150;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const chunk = leadIds.slice(i, i + CHUNK);
    const [{ data: crmTasks }, { data: docs }] = await Promise.all([
      supabase.from('crm_tasks').select('lead_id, status').in('lead_id', chunk),
      supabase.from('lead_documents').select('lead_id').in('lead_id', chunk),
    ]);
    for (const t of crmTasks || []) {
      const lid = String(t.lead_id);
      if (!taskCounts[lid]) taskCounts[lid] = { crm_total: 0, crm_done: 0 };
      taskCounts[lid].crm_total += 1;
      if (t.status === 'completed') taskCounts[lid].crm_done += 1;
    }
    for (const d of docs || []) {
      const lid = String(d.lead_id);
      docCounts[lid] = (docCounts[lid] || 0) + 1;
    }
  }
  return (rows || []).map((d) => ({
    ...d,
    task_stats: taskCounts[String(d.id)] || { crm_total: 0, crm_done: 0 },
    document_count: docCounts[String(d.id)] || 0,
    // Bỏ `d.budget`: crm_leads không có cột này, luôn undefined.
    value: d.estimated_value || d.project?.estimated_value || 0,
  }));
}

async function loadWorkshopStages(table, scope) {
  const companyIds = getScopeCompanyIds(scope);
  const deadlineFields = table === 'production_pipeline_stages'
    ? ', sla_days, counts_as_completed_revenue, counts_as_collected_revenue'
    : '';
  let stagesQuery = supabase
    .from(table)
    .select(`id, name, color, icon, order_index, bucket_slug, company_id${deadlineFields}`)
    .eq('is_active', true)
    .order('order_index');
  if (companyIds?.length === 1) {
    stagesQuery = stagesQuery.eq('company_id', companyIds[0]);
    const { data } = await stagesQuery;
    return (data || []).map((s) => ({ ...s, stage_ids: [String(s.id)] }));
  }
  if (companyIds?.length > 1) {
    const { data } = await stagesQuery.in('company_id', companyIds);
    return mergeStagesForPipeline(data || []);
  }
  const { data } = await stagesQuery;
  return mergeStagesForPipeline(data || []);
}

function countByStageIds(rows, idField, stages) {
  const counts = {};
  for (const row of rows || []) {
    const sid = row[idField] ? String(row[idField]) : '__none__';
    counts[sid] = (counts[sid] || 0) + 1;
  }
  const pipeline = (stages || []).map((s) => {
    const ids = s.stage_ids || [String(s.id)];
    const count = ids.reduce((sum, id) => sum + (counts[id] || 0), 0);
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      bucket_slug: s.bucket_slug,
      count,
      stage_ids: ids,
    };
  });
  return { counts, pipeline };
}

async function loadSxPipelineSummary(scope) {
  let wonIds = await getWonDealProjectIds();
  if (!wonIds.length) return { kpis: { active: 0, intake: 0, overdue: 0 }, pipeline: [] };

  if (scope?.ok && (scope.companyIds?.length || scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL)) {
    // wonIds đo được 713 (mọi deal có project_id) + 525 (crm_deal_projects) → vượt xa
    // mốc gãy URL 556–643 id. fetchAllByIds tự chia lô. CỐ Ý không truyền companyId vào
    // getWonDealProjectIds: sẽ thu hẹp ý nghĩa «won» khi chưa đo intake xưởng HCB.
    const filtered = await fetchAllByIds({
      table: 'projects',
      columns: 'id',
      key: 'id',
      ids: wonIds,
      tune: (q) => applyCompanyScopeFilter(q, scope),
    });
    wonIds = (filtered || []).map((p) => p.id);
    if (!wonIds.length) return { kpis: { active: 0, intake: 0, overdue: 0 }, pipeline: [] };
  }

  const projects = await fetchAllByIds({
    table: 'projects',
    columns: `
      id, sx_kanban_column_id, sx_kanban_deadline_at, production_finish_date,
      production_deadline, delivery_date, deadline, status, company_id,
      logistics_company_id, vc_kanban_column_id
    `,
    key: 'id',
    ids: wonIds,
    tune: (q) => applyCompanyScopeFilter(q, scope),
  });

  const stages = await loadWorkshopStages('production_pipeline_stages', scope);

  const now = Date.now();
  const stageById = new Map(stages.flatMap((s) => (
    (s.stage_ids || [s.id]).map((id) => [String(id), s])
  )));
  let overdue = 0;
  let intake = 0;
  for (const p of projects || []) {
    if (resolveModuleDeadline(MODULE.PRODUCTION, p, {
      nowMs: now,
      stage: stageById.get(String(p.sx_kanban_column_id || '')),
    }).state === 'overdue') overdue += 1;
    if (!p.sx_kanban_column_id) intake += 1;
  }

  const { pipeline } = countByStageIds(projects, 'sx_kanban_column_id', stages);
  if (intake > 0) {
    pipeline.unshift({ id: '__intake__', name: 'Tiếp nhận', color: '#2563EB', icon: '📥', count: intake });
  }

  return {
    kpis: { active: (projects || []).length, intake, overdue },
    pipeline,
  };
}

async function loadVcInstallPipelines(scope) {
  let q = supabase
    .from('projects')
    .select(`
      id, vc_kanban_column_id, deadline, install_date, delivery_date,
      status, company_id, logistics_company_id
    `)
    .not('vc_kanban_column_id', 'is', null);
  q = applyProjectScopeFilter(q, scope);
  let { data: projects, error } = await q;
  if (error && /vc_kanban_column_id/.test(error.message || '')) {
    return {
      vc: { kpis: { active: 0, overdue: 0 }, pipeline: [] },
      install: { kpis: { active: 0, overdue: 0 }, pipeline: [] },
    };
  }

  const stages = await loadWorkshopStages('logistics_pipeline_stages', scope);
  const installStages = stages.filter(isInstallStageMeta);
  const vcStages = stages.filter((s) => !isInstallStageMeta(s));
  const installIds = collectStageIds(installStages, () => true);

  const installProjects = [];
  const vcProjects = [];
  const stageById = new Map(stages.flatMap((s) => (
    (s.stage_ids || [s.id]).map((id) => [String(id), s])
  )));
  const now = Date.now();
  let vcOverdue = 0;
  let installOverdue = 0;
  for (const p of projects || []) {
    const col = p.vc_kanban_column_id ? String(p.vc_kanban_column_id) : '';
    const overdue = resolveModuleDeadline(MODULE.LOGISTICS, p, {
      nowMs: now,
      stage: stageById.get(col),
    }).state === 'overdue';
    if (col && installIds.has(col)) {
      installProjects.push(p);
      if (overdue) installOverdue += 1;
    } else {
      vcProjects.push(p);
      if (overdue) vcOverdue += 1;
    }
  }

  return {
    vc: {
      kpis: { active: vcProjects.length, overdue: vcOverdue },
      pipeline: countByStageIds(vcProjects, 'vc_kanban_column_id', vcStages).pipeline,
    },
    install: {
      kpis: { active: installProjects.length, overdue: installOverdue },
      pipeline: countByStageIds(installProjects, 'vc_kanban_column_id', installStages).pipeline,
    },
  };
}

// GET /api/management/overview
r.get('/overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const companyId = primaryCompanyIdFromScope(scope);
    const { date_from: dateFrom, date_to: dateTo, assignee_id: assigneeId } = req.query;

    const [dealStages, leadStages, dealCounts, leadCounts, sx, vcInstall, pipelineMetrics] = await Promise.all([
      loadCrmDealStages(scope),
      loadCrmLeadStages(scope),
      countLeadsByStage(scope, 'deal', dateFrom, dateTo, assigneeId),
      countLeadsByStage(scope, 'lead', dateFrom, dateTo, assigneeId),
      loadSxPipelineSummary(scope),
      loadVcInstallPipelines(scope),
      loadDealPipelineMetrics(scope, dateFrom, dateTo, assigneeId),
    ]);
    const vc = vcInstall.vc;
    const install = vcInstall.install;

    // applyPrimaryLeadOnly: khử dòng nhân do dự án có nhiều deal (migration 594).
    let taskQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .neq('status', 'completed').neq('status', 'done');
    taskQ = applyPrimaryLeadOnly(taskQ, false);
    taskQ = applyCompanyScopeFilter(taskQ, scope);
    const { count: openTasks } = await taskQ;

    let overdueQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .lt('deadline', new Date().toISOString())
      .neq('status', 'completed').neq('status', 'done');
    overdueQ = applyPrimaryLeadOnly(overdueQ, false);
    overdueQ = applyCompanyScopeFilter(overdueQ, scope);
    const { count: overdueTasks } = await overdueQ;

    const totalDeals = Object.values(dealCounts).reduce((s, n) => s + n, 0);
    const totalLeads = Object.values(leadCounts).reduce((s, n) => s + n, 0);
    const wonDeals = dealStages.filter((s) => s.is_won).reduce((s, st) => s + (dealCounts[String(st.id)] || 0), 0);

    const crmLeadPipeline = buildPipelineFromStages(leadStages, leadCounts);
    const crmDealPipeline = buildPipelineFromStages(dealStages, dealCounts);
    if (leadCounts.__none__ > 0) {
      crmLeadPipeline.push({ id: '__none__', name: 'Chưa gán giai đoạn', color: '#94a3b8', icon: '❓', count: leadCounts.__none__ });
    }
    if (dealCounts.__none__ > 0) {
      crmDealPipeline.push({ id: '__none__', name: 'Chưa gán giai đoạn', color: '#94a3b8', icon: '❓', count: dealCounts.__none__ });
    }

    res.json({
      company_id: companyId,
      tenant_scoped: !!(scope.companyIds?.length || scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL),
      kpis: {
        crm_leads: totalLeads,
        crm_deals: totalDeals,
        crm_won: wonDeals,
        crm_overdue: pipelineMetrics.crm_overdue,
        pipeline_value: pipelineMetrics.pipeline_value,
        sx_active: sx.kpis.active,
        sx_intake: sx.kpis.intake,
        sx_overdue: sx.kpis.overdue,
        vc_active: vc.kpis.active,
        vc_overdue: vc.kpis.overdue,
        install_active: install.kpis.active,
        install_overdue: install.kpis.overdue,
        open_tasks: openTasks || 0,
        overdue_tasks: overdueTasks || 0,
      },
      urgent: {
        crm_deal_overdue: pipelineMetrics.crm_overdue,
        sx_intake: sx.kpis.intake,
        sx_overdue: sx.kpis.overdue,
        vc_overdue: vc.kpis.overdue,
        overdue_tasks: overdueTasks || 0,
      },
      pipelines: {
        crm_lead: crmLeadPipeline,
        crm_deal: crmDealPipeline,
        sx: sx.pipeline,
        vc: vc.pipeline,
        install: install.pipeline,
      },
    });
  } catch (e) {
    console.error('[management/overview]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan' });
  }
});

const WORK_OVERVIEW_ACTIVE_STATUSES = [
  'consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'shipping', 'installing',
];

/** Dự án/deal từ lúc ký HĐ — không gồm tư vấn/thiết kế/báo giá và không gồm lead. */
const POST_CONTRACT_PROJECT_STATUSES = ['contract_signed', 'producing', 'shipping', 'installing'];
const POST_CONTRACT_SLUGS = new Set(['contract_signed', 'producing', 'installing', 'completed', 'won']);
const OVERVIEW_TASK_SELECT = 'unified_id, source, source_id, project_id, lead_id, title, status, deadline, assignee_id, task_kind, project_code, project_name, lead_title';

function dealHasSignedContract(deal, khCtx) {
  if (!deal || String(deal.type || 'deal') === 'lead') return false;
  const st = deal.stage || (deal.stage_id && khCtx?.stageMap?.[deal.stage_id]) || null;
  if (!st || st.is_lost) return false;
  if (st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') return false;
  if (orgReportDealIsClosedWon(st, khCtx?.wonStageOrderByPipe)) return true;
  if (st.is_won) return true;
  if (POST_CONTRACT_SLUGS.has(String(st.canonical_slug || ''))) return true;
  if (st.deal_report_bucket === 'implementation' || st.deal_report_bucket === 'completed') return true;
  return /ký\s*(hợp\s*)?đồng|ký hd/i.test(String(st.name || ''));
}

function overviewTaskAllowed(t) {
  const kind = String(t?.task_kind || '');
  if (kind === 'CRM-Lead' || kind === 'Cá nhân') return false;
  return true;
}

async function attachOverviewTaskAssignees(tasks) {
  const ids = [...new Set((tasks || []).map((t) => t.assignee_id).filter(Boolean).map(String))];
  if (!ids.length) return tasks || [];
  const users = await fetchAllByIds({
    table: 'users', columns: 'id, full_name', key: 'id', ids,
  });
  const names = new Map((users || []).map((u) => [String(u.id), u.full_name]));
  return (tasks || []).map((t) => ({
    ...t,
    assignee_name: names.get(String(t.assignee_id || '')) || null,
  }));
}

async function fetchPostContractOverviewTasks({
  projectIds, leadIds, scope, deadlineGte, deadlineLte, deadlineLt,
}) {
  const pids = [...new Set((projectIds || []).filter(Boolean).map(String))];
  const lids = [...new Set((leadIds || []).filter(Boolean).map(String))];
  if (!pids.length && !lids.length) return [];

  const tune = (q, leadScoped) => {
    let t = applyOpenOnlyFilter(applyPrimaryLeadOnly(q, !!leadScoped))
      .neq('task_kind', 'CRM-Lead')
      .not('deadline', 'is', null);
    if (deadlineGte) t = t.gte('deadline', deadlineGte);
    if (deadlineLte) t = t.lte('deadline', deadlineLte);
    if (deadlineLt) t = t.lt('deadline', deadlineLt);
    return applyCompanyScopeFilter(t, scope);
  };

  const seen = new Map();
  const merge = (rows) => {
    for (const row of rows || []) {
      if (!row?.unified_id || !overviewTaskAllowed(row)) continue;
      const k = String(row.unified_id);
      if (!seen.has(k)) seen.set(k, row);
    }
  };
  if (pids.length) {
    merge(await fetchAllByIdsParallel({
      table: 'unified_tasks_v',
      columns: OVERVIEW_TASK_SELECT,
      key: 'project_id',
      ids: pids,
      tune: (q) => tune(q, false),
    }));
  }
  if (lids.length) {
    merge(await fetchAllByIdsParallel({
      table: 'unified_tasks_v',
      columns: OVERVIEW_TASK_SELECT,
      key: 'lead_id',
      ids: lids,
      tune: (q) => tune(q, true),
    }));
  }
  return [...seen.values()];
}

// GET /api/management/work-overview — KPI + dự án cần chú ý lấy cùng tập Work Unified
r.get('/work-overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const dateFrom = String(req.query.date_from || '').trim().slice(0, 10);
    const dateTo = String(req.query.date_to || '').trim().slice(0, 10);
    const hasDateRange = !!(dateFrom || dateTo);
    const pad2 = (n) => String(n).padStart(2, '0');
    const ymdLocal = (raw) => {
      if (!raw) return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };
    const ymdInRange = (ymd, from, to) => {
      if (!ymd) return false;
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
      return true;
    };

    const regionScope = await resolveWorkRegionScope(req.query.region_id, scope);
    const regionProjectIds = regionScope && !regionScope.none ? regionScope.projectIds : null;
    const regionEmptyProjects = Array.isArray(regionProjectIds) && regionProjectIds.length === 0;

    const applyRegionProjectIn = (q) => {
      if (regionEmptyProjects) return q.eq('id', '00000000-0000-0000-0000-000000000000');
      if (regionProjectIds) return q.in('id', regionProjectIds.slice(0, 500));
      return q;
    };

    let trendQ = supabase.from('projects').select('id, estimated_value, created_at, status')
      .gte('created_at', sixMonthsAgoStart.toISOString())
      .not('status', 'in', '(new,consulting,designing,quoting)');
    trendQ = applyProjectScopeFilter(trendQ, scope);
    trendQ = applyRegionProjectIn(trendQ);

    const customersFrom = dateFrom
      ? `${dateFrom}T00:00:00+07:00`
      : firstDayThisMonth.toISOString();
    const { data: signedStages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, is_won, is_lost, canonical_slug, deal_report_bucket, name');
    const signedStageIds = (signedStages || [])
      .filter((st) => dealHasSignedContract({ type: 'deal', stage: st }, { wonStageOrderByPipe: {} }))
      .map((st) => st.id);
    let newCustomersQ = supabase.from('crm_leads').select('*', { count: 'exact', head: true })
      .eq('type', 'deal').gte('created_at', customersFrom);
    if (signedStageIds.length) newCustomersQ = newCustomersQ.in('stage_id', signedStageIds.slice(0, 200));
    else newCustomersQ = newCustomersQ.eq('id', '00000000-0000-0000-0000-000000000000');
    if (dateTo) newCustomersQ = newCustomersQ.lte('created_at', `${dateTo}T23:59:59+07:00`);
    newCustomersQ = applyCompanyScopeFilter(newCustomersQ, scope);
    if (regionScope?.none) newCustomersQ = newCustomersQ.is('region_id', null);
    else if (regionScope?.regionId) newCustomersQ = newCustomersQ.eq('region_id', regionScope.regionId);

    const [wu, trendRes, newCustomersRes] = await Promise.all([
      queryWorkUnifiedList(req, { forceLite: true, postContract: true }),
      trendQ, newCustomersQ,
    ]);
    if (wu.scope && denyScope(res, wu.scope)) return;

    // Doanh thu 6 tháng gần đây — giá trị dự án (estimated_value) tạo trong tháng đó.
    const trendBuckets = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      trendBuckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `T${d.getMonth() + 1}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        total: 0,
        count: 0,
      });
    }
    const trendRows = (trendRes.data || []).filter((p) => {
      if (!regionScope?.none) return true;
      return !regionScope.projectIdSet.has(String(p.id));
    });
    for (const p of trendRows) {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = trendBuckets.find((b) => b.key === key);
      if (bucket) {
        bucket.total += (p.estimated_value || 0);
        bucket.count += 1;
      }
    }
    trendBuckets[trendBuckets.length - 1].isCurrentMonth = true;

    // Dự án cần chú ý — cùng tập + forecast với Work Unified (late / at_risk).
    const atRiskLite = (wu.filtered || [])
      .filter((it) => it.forecast === 'late' || it.forecast === 'at_risk')
      .sort((a, b) => {
        const ao = a.forecast === 'late' ? 0 : 1;
        const bo = b.forecast === 'late' ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (a.days_remaining ?? 0) - (b.days_remaining ?? 0);
      })
      .slice(0, 50);
    const atRiskHydrated = await wu.hydratePage(atRiskLite);
    const projectsAtRisk = atRiskHydrated.map((it) => {
      const late = it.forecast === 'late';
      return {
        id: it.id,
        code: it.code,
        name: it.name,
        deadline: it.deadline,
        days_left: it.days_remaining,
        owner_name: it.assignee_name || it.person1_name || null,
        risk: late
          ? { level: 'overdue', label: `Trễ hạn ${it.delay_days || 0} ngày` }
          : { level: 'warning', label: 'Nguy cơ trễ' },
      };
    });

    const projectsActive = wu.stats?.total || 0;

    let revenuePeriod = trendBuckets[trendBuckets.length - 1].total;
    if (hasDateRange) {
      revenuePeriod = 0;
      for (const p of trendRows) {
        if (ymdInRange(ymdLocal(p.created_at), dateFrom, dateTo)) {
          revenuePeriod += (p.estimated_value || 0);
        }
      }
    }

    const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const dueFrom = dateFrom || todayYmd;
    const dueTo = dateTo || todayYmd;
    const overdueToYmd = (!dateTo || dateTo >= todayYmd)
      ? (() => {
        const [y, m, d] = todayYmd.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d - 1));
        return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      })()
      : dateTo;
    const projectIds = (wu.filtered || []).map((it) => it.id).filter(Boolean);
    const signedLeadIds = [...new Set(
      (wu.filtered || []).flatMap((it) => it.signed_lead_ids || []),
    )];
    const [todayRaw, overdueRaw] = await Promise.all([
      fetchPostContractOverviewTasks({
        projectIds,
        leadIds: signedLeadIds,
        scope,
        deadlineGte: `${dueFrom}T00:00:00+07:00`,
        deadlineLte: `${dueTo}T23:59:59+07:00`,
      }),
      fetchPostContractOverviewTasks({
        projectIds,
        leadIds: signedLeadIds,
        scope,
        ...(dateFrom ? { deadlineGte: `${dateFrom}T00:00:00+07:00` } : {}),
        deadlineLte: `${overdueToYmd}T23:59:59+07:00`,
      }),
    ]);
    todayRaw.sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')));
    overdueRaw.sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')));
    const [todayTasks, overdueTaskItems] = await Promise.all([
      attachOverviewTaskAssignees(todayRaw.slice(0, 50)),
      attachOverviewTaskAssignees(overdueRaw.slice(0, 50)),
    ]);

    res.json({
      company_id: primaryCompanyIdFromScope(scope),
      projects_active: projectsActive,
      new_customers_this_month: newCustomersRes.count || 0,
      overdue_tasks: overdueRaw.length,
      today_task_count: todayRaw.length,
      today_tasks: todayTasks,
      overdue_task_items: overdueTaskItems,
      revenue_this_month: revenuePeriod,
      revenue_trend: trendBuckets.map((b, idx) => ({
        label: b.label,
        year: b.year,
        month: b.month,
        total: b.total,
        count: b.count,
        is_current: idx === trendBuckets.length - 1,
      })),
      projects_at_risk: projectsAtRisk,
    });
  } catch (e) {
    console.error('[management/work-overview]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan công việc' });
  }
});

const CRM_OVERVIEW_BUCKET_LABEL = {
  potential: 'Tiềm năng',
  consulting: 'Đang tư vấn',
  won: 'Đã chốt',
  old: 'Khách cũ',
};

/** Phân nhóm 1 lead/deal cho trang tổng quan CRM đơn giản (4 nhóm cố định). */
function classifyCrmOverviewBucket(row) {
  if (row.stage?.is_won) return 'won';
  if (row.stage?.is_lost) return 'old';
  if (row.type === 'deal') return 'consulting';
  return 'potential';
}

// GET /api/management/crm-overview — Tổng quan CRM (KH, nguồn, trạng thái, tỉ lệ chuyển đổi)
r.get('/crm-overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { status, q: searchQ } = req.query;
    const { page, pageSize } = parsePagination(req, 50, 200);

    const CRM_OVERVIEW_SELECT = `
      id, code, title, type, phone, created_at, updated_at, project_id,
      customer:customers(id, full_name, phone, address),
      assignee:users!crm_leads_assigned_to_fkey(id, full_name),
      stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, is_won, is_lost),
      source:crm_sources(id, name),
      project:projects(id, code, name)
    `;
    // Cột gọn dùng để quét toàn bộ tập dữ liệu (phân nhóm/thống kê) — không kéo theo các join
    // nặng (customer/assignee/source/project) mà chỉ trang hiện tại mới cần tới.
    const CRM_OVERVIEW_SCAN_SELECT = `
      id, type, created_at, updated_at,
      stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)
    `;

    const applyOverviewFilters = (qq) => {
      qq = qq.is('parent_lead_id', null);
      qq = applyCompanyScopeFilter(qq, scope);
      if (searchQ) {
        const s = String(searchQ).trim();
        qq = qq.or(`title.ilike.%${s}%,code.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      return qq;
    };

    // Supabase/PostgREST giới hạn cứng 1000 dòng/request bất kể .limit() truyền vào bao nhiêu,
    // nên phải đếm tổng số thật trước rồi phân trang nội bộ (range theo batch 1000, chạy song song)
    // để lấy ĐỦ dữ liệu, tránh tổng số bị khóa cứng ở 1000 và bản ghi cũ bị cắt mất.
    const { count: totalCount, error: countErr } = await applyOverviewFilters(
      supabase.from('crm_leads').select('id', { count: 'exact', head: true })
    );
    if (countErr) throw countErr;

    const BATCH = 1000;
    const MAX_ROWS = 30000;
    const batchStarts = [];
    for (let from = 0; from < Math.min(totalCount || 0, MAX_ROWS); from += BATCH) batchStarts.push(from);
    const batches = await Promise.all(batchStarts.map((from) => (
      applyOverviewFilters(supabase.from('crm_leads').select(CRM_OVERVIEW_SCAN_SELECT))
        .order('updated_at', { ascending: false })
        .range(from, from + BATCH - 1)
    )));
    const scanRows = [];
    batches.forEach(({ data: batch, error }) => {
      if (error) throw error;
      scanRows.push(...(batch || []));
    });

    const tabs = { all: 0, potential: 0, consulting: 0, won: 0, old: 0 };
    let newThisMonth = 0;
    const classified = scanRows.map((row) => {
      const bucket = classifyCrmOverviewBucket(row);
      tabs.all += 1;
      tabs[bucket] += 1;
      if (new Date(row.created_at) >= firstDayThisMonth) newThisMonth += 1;
      return { id: row.id, updated_at: row.updated_at, bucket };
    });
    const conversionRate = tabs.all > 0 ? Math.round((tabs.won / tabs.all) * 100) : 0;

    const filtered = (status && status !== 'all')
      ? classified.filter((it) => it.bucket === status)
      : classified;
    const pageStart = (page - 1) * pageSize;
    const pageMeta = filtered.slice(pageStart, pageStart + pageSize);

    // Chỉ fetch đầy đủ dữ liệu (kèm các join nặng) cho đúng các dòng của trang hiện tại.
    let items = [];
    if (pageMeta.length > 0) {
      const bucketById = new Map(pageMeta.map((it) => [it.id, it.bucket]));
      const { data: pageRows, error: pageErr } = await supabase
        .from('crm_leads').select(CRM_OVERVIEW_SELECT)
        .in('id', pageMeta.map((it) => it.id));
      if (pageErr) throw pageErr;
      const rowById = new Map((pageRows || []).map((row) => [row.id, row]));
      items = pageMeta.map((meta) => {
        const row = rowById.get(meta.id);
        if (!row) return null;
        return {
          id: row.id,
          code: row.code,
          title: row.title,
          type: row.type,
          phone: row.phone || row.customer?.phone || null,
          customer: row.customer || null,
          assignee: row.assignee || null,
          source_name: row.source?.name || null,
          project: row.project || null,
          updated_at: row.updated_at,
          created_at: row.created_at,
          bucket: meta.bucket,
          bucket_label: CRM_OVERVIEW_BUCKET_LABEL[bucketById.get(meta.id)],
        };
      }).filter(Boolean);
    }

    res.json({
      company_id: primaryCompanyIdFromScope(scope),
      stats: {
        total: tabs.all,
        new_this_month: newThisMonth,
        consulting: tabs.consulting,
        conversion_rate: conversionRate,
      },
      tabs,
      items,
      total: filtered.length,
      page,
      page_size: pageSize,
    });
  } catch (e) {
    console.error('[management/crm-overview]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan CRM' });
  }
});

/**
 * Cùng tập dự án + bộ lọc với GET /work-unified (kèm deal CRM đặt xưởng khác).
 * `forceLite`: quét cột nhẹ (trang Tổng quan công việc) — hydrate sau cho đúng dòng cần hiện.
 */
async function queryWorkUnifiedList(req, opts = {}) {
  const scope = getCompanyScope(req, req.query.company_id);
  if (!scope?.ok) return { scope };
  const {
    stage: stageFilter, forecast: forecastFilter,
    search: searchQuery, region_id: regionIdFilter,
    date_from: dateFrom, date_to: dateTo, page: pageParam, page_size: pageSizeParam,
  } = req.query;
  const userIdFilters = parseWorkUnifiedUserIds(req.query, req.originalUrl || req.url);
  const userIdSet = new Set(userIdFilters);

  const searchQ = String(searchQuery || '').trim().toLowerCase();
  const pageSize = opts.forceLite
    ? null
    : (pageSizeParam ? Math.max(1, Math.min(200, parseInt(pageSizeParam, 10) || 20)) : null);
  const useLite = opts.forceLite || !!pageSize;

  const scanProjectColumns = !useLite
    ? WORK_UNIFIED_PROJECT_COLUMNS
    : (searchQ ? WORK_UNIFIED_PROJECT_COLUMNS_LITE_SEARCH : WORK_UNIFIED_PROJECT_COLUMNS_LITE);
  const scanDealColumns = useLite ? WORK_UNIFIED_DEAL_COLUMNS_LITE : WORK_UNIFIED_DEAL_COLUMNS;

  const [stageRowsRes, ownedProjects] = await Promise.all([
    supabase
      .from('workflow_stages')
      .select('id, name, slug, color, order_index, is_active, company_id')
      .is('company_id', null)
      .eq('is_active', true)
      .order('order_index'),
    fetchAllPagesParallel(() => {
      const pq = supabase.from('projects').select(scanProjectColumns)
        .in('status', WORK_OVERVIEW_ACTIVE_STATUSES);
      return applyProjectScopeFilter(pq, scope);
    }),
  ]);
  const stages = (stageRowsRes?.data || []).filter(isProjectDeliveryStageRow);
  const deliveryStages = stages.length ? stages : DEFAULT_DELIVERY_STAGES;

  const scopedCompanyIds = scopeCompanyIdList(scope);
  const scopeIdSet = new Set(scopedCompanyIds);
  const projectsById = new Map();
  (ownedProjects || []).forEach((p) => { if (p?.id) projectsById.set(String(p.id), p); });

  if (scopedCompanyIds.length) {
    const linkedIds = await listCrmLinkedProjectIds(scopedCompanyIds);
    const missing = linkedIds.filter((id) => !projectsById.has(String(id)));
    if (missing.length) {
      const extra = await fetchAllByIdsParallel({
        table: 'projects',
        columns: scanProjectColumns,
        key: 'id',
        ids: missing,
        tune: (q) => q.in('status', WORK_OVERVIEW_ACTIVE_STATUSES),
      });
      (extra || []).forEach((p) => { if (p?.id) projectsById.set(String(p.id), p); });
    }
  }

  const projects = [...projectsById.values()];
  const projectIds = projects.map((p) => p.id);
  const workshopTypeIds = [...new Set(projects.map((p) => p.workshop_type_id).filter(Boolean))];
  const sxColumnIds = [...new Set(projects.map((p) => p.sx_kanban_column_id).filter(Boolean))];
  const dealsForProject = new Map();
  const workshopTypeById = new Map();
  const sxStageById = new Map();
  if (projectIds.length) {
    const [deals, linksOrNull, workshopTypes, sxStages] = await Promise.all([
      fetchAllByIdsParallel({
        table: 'crm_leads',
        columns: scanDealColumns,
        key: 'project_id',
        ids: projectIds,
        tune: (q) => q.eq('type', 'deal'),
      }),
      fetchAllByIdsParallel({
        table: 'crm_deal_projects',
        columns: 'deal_id, project_id',
        key: 'project_id',
        ids: projectIds,
      }).catch((e) => {
        if (!String(e.message || '').includes('crm_deal_projects')) {
          console.warn('[work-unified] junction deals:', e.message);
        }
        return null;
      }),
      workshopTypeIds.length
        ? fetchAllByIdsParallel({
          table: 'workshop_project_types',
          columns: 'id, name',
          key: 'id',
          ids: workshopTypeIds,
        })
        : Promise.resolve([]),
      sxColumnIds.length
        ? fetchAllByIdsParallel({
          table: 'production_pipeline_stages',
          columns: 'id, name, bucket_slug, counts_as_completed_revenue, counts_as_collected_revenue',
          key: 'id',
          ids: sxColumnIds,
        })
        : Promise.resolve([]),
    ]);
    (workshopTypes || []).forEach((w) => { if (w?.id) workshopTypeById.set(String(w.id), w); });
    (sxStages || []).forEach((s) => { if (s?.id) sxStageById.set(String(s.id), s); });
    const dealById = new Map();
    (deals || []).forEach((d) => {
      if (d?.id) dealById.set(String(d.id), d);
      attachDealToProjectMap(dealsForProject, d.project_id, d);
    });
    try {
      const links = linksOrNull;
      const missingDealIds = [...new Set((links || [])
        .map((r) => r.deal_id)
        .filter((id) => id && !dealById.has(String(id)))
        .map(String))];
      if (missingDealIds.length) {
        const extraDeals = await fetchAllByIdsParallel({
          table: 'crm_leads',
          columns: scanDealColumns,
          key: 'id',
          ids: missingDealIds,
          tune: (q) => q.eq('type', 'deal'),
        });
        (extraDeals || []).forEach((d) => { if (d?.id) dealById.set(String(d.id), d); });
      }
      (links || []).forEach((r) => {
        attachDealToProjectMap(dealsForProject, r.project_id, dealById.get(String(r.deal_id)));
      });
    } catch (e) {
      if (!String(e.message || '').includes('crm_deal_projects')) {
        console.warn('[work-unified] junction deals:', e.message);
      }
    }
  }

  let khCtx = { stageMap: {}, wonStageOrderByPipe: {}, dealKhSplitAvailable: false };
  if (opts.postContract && projectIds.length) {
    const allLoadedDeals = [...dealsForProject.values()].flat().filter(Boolean);
    try {
      const stageIds = [...new Set(allLoadedDeals.map((d) => d.stage_id).filter(Boolean))];
      if (stageIds.length) {
        const { data: stRows } = await supabase
          .from('crm_pipeline_stages')
          .select('id, pipeline_id, order_index, is_won, is_lost, canonical_slug, deal_report_bucket, pipeline_type, name')
          .in('id', stageIds);
        const stById = Object.create(null);
        (stRows || []).forEach((s) => { if (s?.id) stById[s.id] = s; });
        allLoadedDeals.forEach((d) => {
          if (d.stage_id && stById[d.stage_id]) d.stage = stById[d.stage_id];
        });
      }
      khCtx = await loadDealKhSplitContext(allLoadedDeals);
    } catch (e) {
      console.warn('[work-unified] signed-contract stages:', e.message);
    }
  }

  const buildItem = (p, dealMap) => {
    const flow = buildDeliveryFlow({ project: p, deliveryStages, pipelines: {} });
    const doneSteps = flow.filter((s) => s.status === 'done').length;
    const currentStep = flow.find((s) => s.status === 'current');
    const progressPct = flow.length
      ? Math.round(((doneSteps + (currentStep ? 0.35 : 0)) / flow.length) * 100)
      : 0;
    const commitmentDate = p.install_date || p.delivery_date || p.production_deadline || p.deadline || null;
    const workshopType = p.workshop_type || workshopTypeById.get(String(p.workshop_type_id || '')) || null;
    const sxStage = sxStageById.get(String(p.sx_kanban_column_id || '')) || p.sx_pipeline_stage || null;
    const { forecast, days_remaining, delay_days } = classifyProjectForecast(commitmentDate, {
      project: { ...p, workshop_type: workshopType },
      sxStage,
    });
    const allDeals = dealMap.get(String(p.id)) || [];
    const scopedDeals = scopeIdSet.size
      ? allDeals.filter((d) => scopeIdSet.has(String(d.company_id)))
      : allDeals;
    const signedLeadIds = [...new Set(
      (scopedDeals.length ? scopedDeals : allDeals)
        .filter((d) => dealHasSignedContract(d, khCtx))
        .map((d) => d.id)
        .filter(Boolean)
        .map(String),
    )];
    const postContract = signedLeadIds.length > 0
      || (!allDeals.length && POST_CONTRACT_PROJECT_STATUSES.includes(p.status));
    const dealStaffIds = [...new Set(
      allDeals.flatMap((d) => [d.assigned_to, d.lead_owner_id]).filter(Boolean).map(String),
    )];
    const matchingDeal = userIdSet.size
      ? allDeals.find((d) => dealMatchesWorkUnifiedUser(d, userIdSet))
      : null;
    const deal = matchingDeal || pickWorkUnifiedDeal(allDeals, scopeIdSet);
    const projectAssignee = p.project_manager || p.sales_person || p.production_person || null;
    const person1 = p.project_manager || p.sales_person || null;
    const person2 = p.production_person && p.production_person.id !== person1?.id ? p.production_person : null;
    const person1IdFlat = p.project_manager_id || p.sales_person_id || null;
    const person2IdFlat = p.production_person_id
      && String(p.production_person_id) !== String(person1IdFlat || '')
      ? p.production_person_id
      : null;
    const dealAssigneeId = deal?.assigned_to || deal?.lead_owner_id || null;
    const dealAssigneeName = deal?.assignee?.full_name
      || deal?.lead_owner?.full_name
      || null;
    const assigneeId = dealAssigneeId || projectAssignee?.id || person1IdFlat || p.production_person_id || null;
    const assigneeName = dealAssigneeName
      || projectAssignee?.full_name
      || null;
    const hasCrm = !!deal;
    const hasSx = !!p.company_id;
    const hasVc = !!(p.logistics_company_id || p.install_date || p.delivery_date);
    const regionCompany = deal?.crm_region?.company_id != null ? String(deal.crm_region.company_id) : '';
    const region = (deal?.crm_region && (
      !regionCompany
      || regionCompany === String(deal.company_id || '')
      || regionCompany === String(p.company_id || '')
    ))
      ? deal.crm_region
      : null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      customer_name: p.customer?.full_name || null,
      customer_phone: p.customer?.phone || null,
      deal_code: deal?.code || null,
      deal_title: deal?.title || null,
      flow,
      current_stage_slug: currentStep?.key || null,
      current_stage_label: currentStep?.stage_name || currentStep?.label || null,
      progress_pct: progressPct,
      forecast,
      days_remaining,
      delay_days,
      deadline: commitmentDate,
      production_deadline: p.production_deadline || null,
      delivery_date: p.delivery_date || null,
      install_date: p.install_date || null,
      value: p.estimated_value || p.production_value || null,
      has_crm: hasCrm,
      has_sx: hasSx,
      has_vc: hasVc,
      assignee_name: assigneeName,
      assignee_id: assigneeId,
      person1_name: person1?.full_name || dealAssigneeName || null,
      person1_id: person1?.id || person1IdFlat || dealAssigneeId || null,
      person2_name: person2?.full_name || null,
      person2_id: person2?.id || person2IdFlat || null,
      sales_person_id: p.sales_person_id || p.sales_person?.id || null,
      project_manager_id: p.project_manager_id || p.project_manager?.id || null,
      region_id: region?.id || deal?.region_id || null,
      region_name: region?.name || null,
      deal_assignee_id: dealAssigneeId,
      deal_staff_ids: dealStaffIds,
      signed_lead_ids: signedLeadIds,
      post_contract: postContract,
    };
  };

  const hydratePage = async (liteItems) => {
    const ids = liteItems.map((it) => it.id).filter(Boolean);
    if (!ids.length) return liteItems;
    const [fullProjects, fullDeals, fullLinks] = await Promise.all([
      fetchAllByIdsParallel({
        table: 'projects', columns: WORK_UNIFIED_PROJECT_COLUMNS, key: 'id', ids,
      }),
      fetchAllByIdsParallel({
        table: 'crm_leads',
        columns: WORK_UNIFIED_DEAL_COLUMNS,
        key: 'project_id',
        ids,
        tune: (q) => q.eq('type', 'deal'),
      }),
      fetchAllByIdsParallel({
        table: 'crm_deal_projects', columns: 'deal_id, project_id', key: 'project_id', ids,
      }).catch(() => []),
    ]);
    const pageDealMap = new Map();
    const dealById = new Map();
    (fullDeals || []).forEach((d) => {
      if (d?.id) dealById.set(String(d.id), d);
      attachDealToProjectMap(pageDealMap, d.project_id, d);
    });
    const missingDealIds = [...new Set((fullLinks || [])
      .map((r) => r.deal_id)
      .filter((id) => id && !dealById.has(String(id)))
      .map(String))];
    if (missingDealIds.length) {
      const extra = await fetchAllByIdsParallel({
        table: 'crm_leads',
        columns: WORK_UNIFIED_DEAL_COLUMNS,
        key: 'id',
        ids: missingDealIds,
        tune: (q) => q.eq('type', 'deal'),
      });
      (extra || []).forEach((d) => { if (d?.id) dealById.set(String(d.id), d); });
    }
    (fullLinks || []).forEach((r) => {
      attachDealToProjectMap(pageDealMap, r.project_id, dealById.get(String(r.deal_id)));
    });

    const fullById = new Map();
    (fullProjects || []).forEach((p) => { if (p?.id) fullById.set(String(p.id), p); });
    return liteItems.map((it) => {
      const p = fullById.get(String(it.id));
      return p ? buildItem(p, pageDealMap) : it;
    });
  };

  const items = (projects || []).map((p) => buildItem(p, dealsForProject));

  let filtered = items;
  if (stageFilter) filtered = filtered.filter((it) => it.current_stage_slug === stageFilter);
  if (searchQ) {
    filtered = filtered.filter((it) => {
      const hay = [it.code, it.name, it.customer_name, it.deal_code, it.deal_title]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchQ);
    });
  }
  if (userIdFilters.length) {
    filtered = filtered.filter((it) => workUnifiedItemMatchesUserIds(it, userIdSet));
  }
  if (regionIdFilter === '__none__') {
    filtered = filtered.filter((it) => !it.region_id);
  } else if (regionIdFilter) {
    filtered = filtered.filter((it) => String(it.region_id || '') === String(regionIdFilter));
  }
  if (dateFrom || dateTo) {
    filtered = filtered.filter((it) => {
      const d = it.deadline ? String(it.deadline).slice(0, 10) : '';
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }
  if (opts.postContract) {
    filtered = filtered.filter((it) => it.post_contract);
  }

  const stats = { total: filtered.length, on_track: 0, at_risk: 0, late: 0 };
  filtered.forEach((it) => {
    if (it.forecast === 'late') stats.late += 1;
    else if (it.forecast === 'at_risk') stats.at_risk += 1;
    else stats.on_track += 1;
  });

  return {
    scope,
    deliveryStages,
    filtered,
    stats,
    hydratePage,
    pageSize,
    pageParam,
    forecastFilter,
  };
}

// GET /api/management/work-unified/search — tìm nhanh dự án (ô nhảy trang chi tiết)
r.get('/work-unified/search', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const raw = String(req.query.q || '').trim();
    const q = raw.replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (q.length < 2) return res.json({ items: [] });

    const userIds = parseWorkUnifiedUserIds(req.query, req.originalUrl || req.url);
    const userIdSet = new Set(userIds);
    const regionRaw = String(req.query.region_id || '').trim();
    const regionNone = regionRaw === '__none__';
    const regionId = WORK_UNIFIED_UUID_RE.test(regionRaw) ? regionRaw : '';
    const dateFrom = String(req.query.date_from || '').trim().slice(0, 10);
    const dateTo = String(req.query.date_to || '').trim().slice(0, 10);
    const hasExtra = !!(userIds.length || regionId || regionNone || dateFrom || dateTo);

    let regionProjectIds = null;
    if (regionId) {
      const { data: leads, error: leadErr } = await supabase
        .from('crm_leads')
        .select('project_id')
        .eq('region_id', regionId)
        .not('project_id', 'is', null)
        .limit(800);
      if (leadErr) throw leadErr;
      regionProjectIds = [...new Set((leads || []).map((l) => l.project_id).filter(Boolean))];
      if (!regionProjectIds.length) return res.json({ items: [] });
    }

    const like = `%${q}%`;
    const searchSelect = `
        id, code, name, status, deadline, install_date, delivery_date, production_deadline,
        project_manager_id, sales_person_id, production_person_id,
        customer:customers(full_name)
      `;
    let query = supabase
      .from('projects')
      .select(searchSelect)
      .or(`code.ilike."${like}",name.ilike."${like}"`)
      .in('status', WORK_OVERVIEW_ACTIVE_STATUSES)
      .order('code', { ascending: false })
      .limit(hasExtra ? 60 : 8);
    query = applyProjectScopeFilter(query, scope);
    if (regionProjectIds) query = query.in('id', regionProjectIds);
    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    const extraIds = await listCrmLinkedProjectIds(scopeCompanyIdList(scope));
    if (extraIds.length) {
      const have = new Set(rows.map((p) => String(p.id)));
      const missing = extraIds.filter((id) => !have.has(String(id)));
      if (missing.length) {
        let extraQ = supabase
          .from('projects')
          .select(searchSelect)
          .or(`code.ilike."${like}",name.ilike."${like}"`)
          .in('status', WORK_OVERVIEW_ACTIVE_STATUSES)
          .in('id', missing.slice(0, 500))
          .order('code', { ascending: false })
          .limit(hasExtra ? 60 : 8);
        if (regionProjectIds) extraQ = extraQ.in('id', regionProjectIds);
        const extraRes = await extraQ;
        if (extraRes.error) throw extraRes.error;
        (extraRes.data || []).forEach((p) => {
          if (!have.has(String(p.id))) {
            have.add(String(p.id));
            rows.push(p);
          }
        });
      }
    }
    if (regionNone) {
      const { data: withRegionLeads } = await supabase
        .from('crm_leads')
        .select('project_id')
        .not('region_id', 'is', null)
        .not('project_id', 'is', null)
        .limit(2000);
      const withRegion = new Set((withRegionLeads || []).map((l) => String(l.project_id)));
      rows = rows.filter((p) => !withRegion.has(String(p.id)));
    }
    if (userIds.length) {
      const byProjectPeople = new Set();
      rows.forEach((p) => {
        const hit = [p.project_manager_id, p.sales_person_id, p.production_person_id]
          .some((id) => userIdSet.has(String(id || '')));
        if (hit) byProjectPeople.add(String(p.id));
      });
      const leftover = rows.filter((p) => !byProjectPeople.has(String(p.id))).map((p) => p.id);
      if (leftover.length) {
        const { data: dealRows } = await supabase
          .from('crm_leads')
          .select('project_id, assigned_to, lead_owner_id')
          .in('project_id', leftover)
          .eq('type', 'deal');
        (dealRows || []).forEach((d) => {
          if ([d.assigned_to, d.lead_owner_id].some((id) => userIdSet.has(String(id || ''))) && d.project_id) {
            byProjectPeople.add(String(d.project_id));
          }
        });
      }
      rows = rows.filter((p) => byProjectPeople.has(String(p.id)));
    }
    if (dateFrom || dateTo) {
      rows = rows.filter((p) => {
        const d = String(p.install_date || p.delivery_date || p.production_deadline || p.deadline || '').slice(0, 10);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }

    res.json({
      items: rows.slice(0, 8).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        customer_name: p.customer?.full_name || null,
      })),
    });
  } catch (e) {
    console.error('[management/work-unified/search]', e);
    res.status(500).json({ error: e.message || 'Lỗi tìm dự án' });
  }
});

// GET /api/management/work-unified — Tổng quan dự án theo luồng giao hàng (mockup Work Unified)
// responseCache: trang tổng quan này đọc rất nặng (quét cả tập dự án để tính KPI + đếm tab)
// và người dùng thường bấm qua lại giữa các tab/trang cùng bộ lọc. scope 'user' vì phạm vi
// dữ liệu phụ thuộc quyền của từng người (getCompanyScope). Cache key đã gồm query string
// nên mỗi tổ hợp bộ lọc/trang là một entry riêng. TTL ngắn theo đúng mức module
// projectsCacheInvalidation ghi nhận (20–30s) — đủ để hứng các lần bấm liên tiếp mà không
// làm dữ liệu cũ quá lâu.
r.get('/work-unified', responseCache({ ttl: 20, scope: 'user', tags: [PROJECTS_LIST_TAG] }), async (req, res) => {
  try {
    const wu = await queryWorkUnifiedList(req);
    if (denyScope(res, wu.scope)) return;
    let filtered = wu.filtered;
    if (wu.forecastFilter && wu.forecastFilter !== 'all') {
      filtered = filtered.filter((it) => it.forecast === wu.forecastFilter);
    }
    filtered.sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });

    const total = filtered.length;
    let pageItems = filtered;
    if (wu.pageSize) {
      const page = Math.max(1, parseInt(wu.pageParam, 10) || 1);
      const startIdx = (page - 1) * wu.pageSize;
      pageItems = filtered.slice(startIdx, startIdx + wu.pageSize);
      pageItems = await wu.hydratePage(pageItems);
    }

    res.json({
      company_id: primaryCompanyIdFromScope(wu.scope),
      stages: wu.deliveryStages.map((st) => ({ slug: st.slug, label: st.name })),
      stats: wu.stats,
      items: pageItems,
      total,
    });
  } catch (e) {
    console.error('[management/work-unified]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan dự án' });
  }
});

const PR_STATUS_LABELS = {
  draft: 'Nháp', requested: 'Đã yêu cầu', confirmed: 'NCC xác nhận', received: 'Đã nhận',
  qc_pass: 'QC đạt', qc_fail: 'QC lỗi', delayed: 'Trễ', done: 'Hoàn tất',
};
const PO_STATUS_LABELS = {
  draft: 'Nháp', submitted: 'Đã gửi MH', confirmed: 'Xác nhận', ordered: 'Đã đặt NCC',
  partial_received: 'Nhận 1 phần', received: 'Đã nhận', cancelled: 'Đã hủy',
};
const PURCHASING_STAGES = [
  { key: 'request', label: 'Đề nghị' },
  { key: 'approve', label: 'Duyệt & chọn NCC' },
  { key: 'po', label: 'Đã đặt hàng (PO)' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'received', label: 'Đã nhận & nhập kho' },
];

function prStageOf(status) {
  if (status === 'confirmed') return 'approve';
  if (['received', 'qc_pass', 'qc_fail', 'done'].includes(status)) return 'received';
  return 'request';
}
function poStageOf(status) {
  if (status === 'draft') return 'approve';
  if (['submitted', 'confirmed'].includes(status)) return 'po';
  if (status === 'ordered') return 'shipping';
  if (['partial_received', 'received'].includes(status)) return 'received';
  return 'po';
}

// GET /api/management/purchasing-overview — Tổng quan Mua hàng (đề nghị vật tư + đơn mua hàng NCC)
r.get('/purchasing-overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let prQ = supabase.from('purchase_requests').select(`
      id, project_id, item_name, description, source_type, supplier_id,
      requested_date, supplier_committed_date, expected_price, actual_price,
      status, delay_reason, next_action, created_at,
      supplier:suppliers(id, name),
      project:projects(id, code, name)
    `).order('created_at', { ascending: false }).limit(300);
    prQ = applyCompanyScopeFilter(prQ, scope);

    let poQ = supabase.from('purchase_orders').select(`
      id, code, supplier_id, title, order_date, expected_date, total, status, created_at,
      supplier:suppliers(id, name),
      lead:crm_leads(id, code, title)
    `).order('created_at', { ascending: false }).limit(300);
    poQ = applyCompanyScopeFilter(poQ, scope);

    const [prRes, poRes] = await Promise.all([prQ, poQ]);
    if (prRes.error && !/purchase_requests/i.test(prRes.error.message || '')) throw prRes.error;
    if (poRes.error && !/purchase_orders/i.test(poRes.error.message || '')) throw poRes.error;

    const prItems = (prRes.data || []).map((r2) => ({
      kind: 'PR',
      id: r2.id,
      ref: `YC-${String(r2.id).slice(0, 8).toUpperCase()}`,
      title: r2.item_name,
      subtitle: r2.project ? `${r2.project.code} · ${r2.project.name}` : null,
      supplier_name: r2.supplier?.name || null,
      amount: r2.actual_price ?? r2.expected_price ?? null,
      status: r2.status,
      status_label: PR_STATUS_LABELS[r2.status] || r2.status,
      stage: prStageOf(r2.status),
      late: r2.status === 'delayed',
      date: r2.supplier_committed_date || r2.requested_date || r2.created_at,
      created_at: r2.created_at,
    }));

    const poItems = (poRes.data || []).map((o) => {
      const overdue = !!(o.expected_date && new Date(o.expected_date) < now && !['received', 'cancelled'].includes(o.status));
      return {
        kind: 'PO',
        id: o.id,
        ref: o.code,
        title: o.title,
        subtitle: o.lead ? [o.lead.code, o.lead.title].filter(Boolean).join(' · ') : null,
        supplier_name: o.supplier?.name || null,
        amount: o.total,
        status: o.status,
        status_label: PO_STATUS_LABELS[o.status] || o.status,
        stage: poStageOf(o.status),
        late: overdue,
        date: o.expected_date || o.order_date || o.created_at,
        created_at: o.created_at,
      };
    });

    const items = [...prItems, ...poItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const orderedValueThisMonth = poItems
      .filter((o) => o.status !== 'draft' && new Date(o.created_at) >= firstDayThisMonth)
      .reduce((s, o) => s + (Number(o.amount) || 0), 0);

    const stats = {
      pending_approval: prItems.filter((i) => i.status === 'requested').length,
      ordered_value_this_month: orderedValueThisMonth,
      shipping: poItems.filter((i) => i.status === 'ordered').length,
      late: items.filter((i) => i.late).length,
    };

    res.json({
      company_id: primaryCompanyIdFromScope(scope),
      stages: PURCHASING_STAGES,
      stats,
      items,
    });
  } catch (e) {
    console.error('[management/purchasing-overview]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan mua hàng' });
  }
});

const PRODUCTION_SCOPE_STATUSES = ['producing', 'shipping', 'installing'];

/**
 * Pipeline công đoạn xưởng THEO TỪNG CÔNG TY riêng (không gộp) — dùng để tính đúng
 * % tiến độ / công đoạn hiện tại của một dự án cụ thể (khác với loadWorkshopStages,
 * vốn gộp nhiều công ty lại chỉ để đếm số lượng theo tên công đoạn).
 */
async function loadStagesByCompany(table, companyIds) {
  const map = new Map();
  if (!companyIds?.length) return map;
  const { data } = await supabase
    .from(table)
    .select('id, name, order_index, company_id')
    .eq('is_active', true)
    .in('company_id', companyIds)
    .order('order_index');
  (data || []).forEach((s) => {
    const cid = String(s.company_id);
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(s);
  });
  return map;
}

// GET /api/management/production-overview — Tổng quan Sản xuất (dự án đang/đã qua công đoạn SX)
r.get('/production-overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let q = supabase.from('projects').select(`
      id, code, name, status, deadline, sx_kanban_column_id, production_person_id, updated_at, company_id,
      production_person:users!projects_production_person_id_fkey(id, full_name)
    `).in('status', PRODUCTION_SCOPE_STATUSES);
    q = applyProjectScopeFilter(q, scope);
    const { data: projects, error } = await q;
    if (error) throw error;

    const projectCompanyIds = [...new Set((projects || []).map((p) => p.company_id).filter(Boolean))];
    const projectIds = (projects || []).map((p) => p.id);
    const openPrProjectIds = new Set();
    const [stagesByCompany, prsRes, productionTasks] = await Promise.all([
      loadStagesByCompany('production_pipeline_stages', projectCompanyIds),
      projectIds.length
        ? supabase.from('purchase_requests')
          .select('project_id, status').in('project_id', projectIds).in('status', ['draft', 'requested'])
        : Promise.resolve({ data: [] }),
      projectIds.length
        ? fetchAllByIdsParallel({
          table: 'unified_tasks_v',
          columns: 'unified_id, source, source_id, project_id, title, status, priority, deadline, assignee_id, task_kind',
          key: 'project_id',
          ids: projectIds,
          tune: (taskQ) => applyPrimaryLeadOnly(taskQ, false).in('task_kind', ['SX', 'Dự án']),
        })
        : Promise.resolve([]),
    ]);
    if (prsRes.error) throw prsRes.error;
    (prsRes.data || []).forEach((r2) => { if (r2.project_id) openPrProjectIds.add(String(r2.project_id)); });

    const taskAssigneeIds = [...new Set((productionTasks || []).map((t) => t.assignee_id).filter(Boolean))];
    const { data: taskAssignees, error: taskAssigneesError } = taskAssigneeIds.length
      ? await supabase.from('users').select('id, full_name').in('id', taskAssigneeIds)
      : { data: [], error: null };
    if (taskAssigneesError) throw taskAssigneesError;
    const taskAssigneeNameById = new Map((taskAssignees || []).map((u) => [String(u.id), u.full_name]));
    const productionTasksByProject = new Map();
    const seenProductionTaskIds = new Set();
    for (const task of productionTasks || []) {
      if (!task?.project_id || !task?.unified_id || seenProductionTaskIds.has(String(task.unified_id))) continue;
      seenProductionTaskIds.add(String(task.unified_id));
      const pid = String(task.project_id);
      if (!productionTasksByProject.has(pid)) productionTasksByProject.set(pid, []);
      productionTasksByProject.get(pid).push({
        ...task,
        assignee_name: task.assignee_id ? (taskAssigneeNameById.get(String(task.assignee_id)) || null) : null,
      });
    }

    const items = (projects || []).map((p) => {
      const companyStages = stagesByCompany.get(String(p.company_id)) || [];
      const totalStages = companyStages.length || 1;
      const stageIdx = companyStages.findIndex((s) => String(s.id) === String(p.sx_kanban_column_id));
      const foundStage = stageIdx >= 0;
      const progressPct = foundStage ? Math.round(((stageIdx + 1) / totalStages) * 100) : null;
      const movedPastProduction = p.status !== 'producing';
      const waitingMaterial = openPrProjectIds.has(String(p.id));
      const overdue = !!(p.deadline && new Date(p.deadline) < now);
      const projectTasks = productionTasksByProject.get(String(p.id)) || [];
      const openTasks = projectTasks.filter((t) => !['done', 'completed', 'cancelled'].includes(String(t.status)));
      const overdueTasks = openTasks.filter((t) => t.deadline && new Date(t.deadline) < now);
      const taskItems = openTasks
        .slice()
        .sort((a, b) => {
          const aOverdue = a.deadline && new Date(a.deadline) < now ? 0 : 1;
          const bOverdue = b.deadline && new Date(b.deadline) < now ? 0 : 1;
          if (aOverdue !== bOverdue) return aOverdue - bOverdue;
          return new Date(a.deadline || '9999-12-31').getTime() - new Date(b.deadline || '9999-12-31').getTime();
        })
        .slice(0, 3)
        .map((task) => ({
          ...task,
          effective_assignee_name: task.assignee_name || p.production_person?.full_name || null,
        }));

      let bucket;
      if (movedPastProduction) bucket = 'done';
      else if (waitingMaterial) bucket = 'waiting_material';
      else if (overdue) bucket = 'late';
      else bucket = 'on_track';

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        current_stage_label: movedPastProduction ? 'Đã qua công đoạn SX' : (foundStage ? companyStages[stageIdx].name : 'Chưa vào công đoạn'),
        current_stage_idx: movedPastProduction ? totalStages - 1 : (foundStage ? stageIdx : null),
        total_stages: totalStages,
        progress_pct: movedPastProduction ? 100 : progressPct,
        assignee_name: p.production_person?.full_name || null,
        tasks: {
          total: projectTasks.length,
          open: openTasks.length,
          overdue: overdueTasks.length,
          items: taskItems,
        },
        bucket,
        deadline: p.deadline,
        updated_at: p.updated_at,
      };
    });

    items.sort((a, b) => new Date(a.deadline || '9999-12-31').getTime() - new Date(b.deadline || '9999-12-31').getTime());

    const stats = {
      active: items.filter((i) => i.bucket !== 'done').length,
      waiting_material: items.filter((i) => i.bucket === 'waiting_material').length,
      late: items.filter((i) => i.bucket === 'late').length,
      done_this_week: items.filter((i) => i.bucket === 'done' && i.updated_at && new Date(i.updated_at) >= sevenDaysAgo).length,
    };

    // Danh sách nhãn công đoạn để lọc — lấy từ chính các công đoạn thật đang xuất hiện trong items,
    // không dùng danh sách gộp nhiều công ty (tránh sai lệch khi xem "Tất cả công ty").
    const stageLabelSet = new Map();
    items.forEach((it) => {
      if (it.current_stage_label && !stageLabelSet.has(it.current_stage_label)) {
        stageLabelSet.set(it.current_stage_label, it.current_stage_idx ?? 999);
      }
    });
    const stages = [...stageLabelSet.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => ({ label }));

    res.json({
      company_id: primaryCompanyIdFromScope(scope),
      stages,
      stats,
      items,
    });
  } catch (e) {
    console.error('[management/production-overview]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan sản xuất' });
  }
});

// GET /api/management/deals
r.get('/deals', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const {
      q: searchQ, date_from: dateFrom, date_to: dateTo,
      phase, focus, crm_stage_id: crmStageId, lead_stage_id: leadStageId,
      crm_stage_ids: crmStageIds, lead_stage_ids: leadStageIds,
      sx_stage_id: sxStageId, sx_stage_ids: sxStageIds,
      vc_stage_id: vcStageId, vc_stage_ids: vcStageIds,
      assignee_id: assigneeId,
      has_project: hasProject, record_type: recordType,
      module_tab: moduleTab,
    } = req.query;
    const leadType = recordType === 'lead' ? 'lead' : (recordType === 'all' || recordType === 'both' ? 'all' : 'deal');
    const loadAll = req.query.all === '1' || req.query.all === 'true' || req.query.page_size === 'all';
    const { page, pageSize, from, to } = parsePagination(req);
    let effectivePhase = phase || '';
    if (!effectivePhase && moduleTab === 'sx') effectivePhase = 'sx';
    if (!effectivePhase && moduleTab === 'vc') effectivePhase = 'vc';
    if (!effectivePhase && moduleTab === 'install') effectivePhase = 'install';
    const postFilter = needsDealPostFilter({ phase: effectivePhase, focus, sxStageId, vcStageId });
    const wonStageIds = (focus === 'overdue_crm' || effectivePhase === 'crm') ? await loadWonStageIds(scope) : [];
    const vcStagesAll = (effectivePhase === 'vc' || effectivePhase === 'install' || postFilter)
      ? await loadWorkshopStages('logistics_pipeline_stages', scope)
      : [];
    const installStageIds = collectStageIds(vcStagesAll.filter(isInstallStageMeta), () => true);

    // crm_leads KHÔNG có `budget` lẫn `deadline`. Hai tên sai này làm Postgres trả
    // 42703 và huỷ CẢ câu ⇒ GET /management/deals trả HTTP 500, tab tổng quan trống.
    // `deadline:` là ALIAS PostgREST về cột thật `kanban_deadline_at` — MỘT nguồn,
    // không COALESCE rải rác (DECISIONS AI-002). Khi route này được nối vào
    // `crm_effective_deadline_at` của migration 596 thì thay alias bằng lời gọi policy.
    const listSelect = `
          id, code, title, type, estimated_value, created_at, updated_at,
          deadline:kanban_deadline_at, expected_close_date,
          project_id, company_id, assigned_to, lead_owner_id,
          stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost),
          customer:customers(id, full_name, phone),
          assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
          lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
          company:companies!crm_leads_company_id_fkey(id, name, short_name),
          project:projects(
            id, code, name, status, deadline, sx_kanban_deadline_at,
            production_finish_date, production_deadline, delivery_date, install_date,
            company_id, logistics_company_id, estimated_value,
            sx_kanban_column_id, vc_kanban_column_id, install_address
          )
        `;

    function applyStageIdFilter(query, singleId, multiIds) {
      const ids = String(multiIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 1) return query.in('stage_id', ids);
      const one = singleId || ids[0];
      if (one) return query.eq('stage_id', one);
      return query;
    }

    function applyDealQueryFilters(query) {
      query = applyCompanyScopeFilter(query, scope);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);
      if (leadType === 'lead') {
        query = applyStageIdFilter(query, leadStageId || crmStageId, leadStageIds || crmStageIds);
      } else if (leadType === 'deal') {
        query = applyStageIdFilter(query, crmStageId, crmStageIds);
      }
      if (assigneeId) query = query.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
      if (hasProject === '1') query = query.not('project_id', 'is', null);
      if (hasProject === '0') query = query.is('project_id', null);
      if (phase === 'sx' || effectivePhase === 'sx' || focus === 'sx_intake' || focus === 'sx_overdue' || sxStageId) {
        query = query.not('project_id', 'is', null);
      }
      if (effectivePhase === 'vc' || effectivePhase === 'install') {
        query = query.not('project_id', 'is', null);
      }
      if (focus === 'overdue_crm') {
        // Lọc phải dùng TÊN CỘT THẬT (`kanban_deadline_at`), alias chỉ đổi tên lúc trả về.
        query = query
          .lt('kanban_deadline_at', new Date().toISOString())
          .not('kanban_deadline_at', 'is', null);
        if (wonStageIds.length) query = query.not('stage_id', 'in', `(${wonStageIds.join(',')})`);
      }
      if (searchQ) {
        const s = String(searchQ).trim();
        query = query.or(`title.ilike.%${s}%,code.ilike.%${s}%`);
      }
      return query;
    }

    function buildLeadsQuery(select) {
      let q = supabase.from('crm_leads').select(select);
      if (leadType === 'all') q = q.in('type', ['lead', 'deal']);
      else q = q.eq('type', leadType);
      q = q.order('updated_at', { ascending: false });
      return applyDealQueryFilters(q);
    }

    async function fetchTypeRows(type) {
      return fetchAllLeadRows(() => {
        let q = supabase.from('crm_leads').select(listSelect).eq('type', type).order('updated_at', { ascending: false });
        return applyDealQueryFilters(q);
      });
    }

    let rows = [];
    let count = 0;

    if (loadAll || postFilter) {
      if (leadType === 'all') {
        const [leads, deals] = await Promise.all([
          fetchTypeRows('lead'),
          fetchTypeRows('deal'),
        ]);
        rows = [...leads, ...deals].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      } else {
        rows = await fetchAllLeadRows(() => buildLeadsQuery(listSelect));
      }
    } else {
      let q = buildLeadsQuery(listSelect);
      const res = await q.range(from, to);
      if (res.error) throw res.error;
      count = res.count ?? (res.data || []).length;
      rows = res.data || [];
    }

    if (postFilter) {
      rows = applyDealRowFilters(rows, {
        phase: effectivePhase, focus, sxStageId, sxStageIds, vcStageId, vcStageIds, installStageIds,
      });
      count = rows.length;
      if (!loadAll) rows = rows.slice(from, Math.min(to + 1, rows.length));
    } else if (loadAll) {
      count = rows.length;
    }

    rows = await enrichRowsWithWorkshopStages(rows);
    const deals = await attachTaskAndDocCounts(rows);

    res.json({
      deals,
      total: count ?? deals.length,
      page,
      page_size: loadAll ? deals.length : pageSize,
      module_tab: moduleTab || null,
    });
  } catch (e) {
    console.error('[management/deals]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải danh sách deal' });
  }
});

// GET /api/management/deals/:leadId — bundle cho trang tổng hợp
r.get('/deals/:leadId', async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;

    let leadQ = supabase
      .from('crm_leads')
      .select(`
        *,
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, order_index),
        customer:customers(id, full_name, phone, email, address),
        assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar, phone),
        lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar, phone),
        company:companies!crm_leads_company_id_fkey(id, name, short_name),
        project:projects(
          id, code, name, status, deadline, production_deadline, estimated_value, production_value, deposit_amount,
          notes, company_id, logistics_company_id, workshop_type_id,
          sx_kanban_column_id, vc_kanban_column_id, sx_pipeline_stage_entered_at,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone),
          company:companies!projects_company_id_fkey(id, name, short_name),
          logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name)
        )
      `)
      .eq('id', leadId)
      .maybeSingle();

    const { data: lead, error: leadErr } = await leadQ;
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal/lead' });
    if (!assertLeadInScope(res, scope, lead)) return;

    const projectId = lead.project_id;

    const [
      crmTasksRes,
      projectTasksRes,
      docsRes,
      activitiesRes,
      unifiedByProjectRes,
      quotationsRes,
      ordersRes,
    ] = await Promise.all([
      supabase.from('crm_tasks').select('id, title, status, stage_slug, deadline, assignee_id, priority')
        .eq('lead_id', leadId).order('order_index'),
      projectId
        ? supabase.from('tasks').select('id, title, status, priority, due_date, assignee_id, task_type, metadata')
          .eq('project_id', projectId).order('order_index')
        : Promise.resolve({ data: [] }),
      supabase.from('lead_documents').select('id, name, file_name, doc_type, created_at, shared_to_workshop, allowed_share_modules, file_url')
        .eq('lead_id', leadId).order('created_at', { ascending: false })
        .then(warnQ('management:lead_documents')),
      // crm_activities: cột đúng là `description` và `outcome`
      supabase.from('crm_activities').select('id, type, title, description, outcome, created_at, created_by')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(30)
        .then(warnQ('management:crm_activities')),
      projectId
        ? supabase.from('unified_tasks_v').select('unified_id, source, task_kind, title, status, deadline, assignee_id')
          .eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100)
        : Promise.resolve({ data: [] }),
      supabase.from('quotations').select('id, code, status, total, created_at')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10),
      supabase.from('orders').select('id, code, status, total, created_at')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10),
    ]);

    let sxStage = null;
    let vcStage = null;
    const proj = lead.project;
    if (proj?.sx_kanban_column_id) {
      const { data } = await supabase
        .from('production_pipeline_stages')
        .select('id, name, color, icon, bucket_slug')
        .eq('id', proj.sx_kanban_column_id)
        .maybeSingle();
      sxStage = data;
    }
    if (proj?.vc_kanban_column_id) {
      const { data } = await supabase
        .from('logistics_pipeline_stages')
        .select('id, name, color, icon, bucket_slug')
        .eq('id', proj.vc_kanban_column_id)
        .maybeSingle();
      vcStage = data;
    }

    const crmTasks = crmTasksRes.data || [];
    const projectTasks = projectTasksRes.data || [];
    const unifiedTasks = unifiedByProjectRes.data || [];

    const sxTasks = projectTasks.filter((t) => {
      const slug = String(t.metadata?.workshop_area || t.metadata?.stage_slug || '');
      return slug.includes('sx_') || t.metadata?.workshop_module === 'production';
    });
    const vcTasks = projectTasks.filter((t) => {
      const slug = String(t.metadata?.workshop_area || t.metadata?.stage_slug || '');
      return slug.includes('vc_') || t.metadata?.workshop_module === 'logistics';
    });

    const countDone = (list, doneVals = new Set(['completed', 'done'])) => ({
      total: list.length,
      done: list.filter((t) => doneVals.has(String(t.status))).length,
    });

    res.json({
      lead: {
        ...lead,
        stage: lead.stage,
        customer: lead.customer,
        assignee: lead.assignee,
      },
      project: proj || null,
      pipelines: {
        crm: lead.stage ? { id: lead.stage.id, name: lead.stage.name, color: lead.stage.color, is_won: lead.stage.is_won } : null,
        sx: sxStage,
        vc: vcStage,
      },
      stats: {
        crm_tasks: countDone(crmTasks),
        sx_tasks: countDone(sxTasks),
        vc_tasks: countDone(vcTasks),
        project_tasks: countDone(projectTasks),
        unified_tasks: countDone(unifiedTasks),
        documents: (docsRes.data || []).length,
        activities: (activitiesRes.data || []).length,
        quotations: (quotationsRes.data || []).length,
        orders: (ordersRes.data || []).length,
      },
      crm_tasks: crmTasks,
      project_tasks: projectTasks,
      unified_tasks: unifiedTasks,
      documents: docsRes.data || [],
      activities: activitiesRes.data || [],
      quotations: quotationsRes.data || [],
      orders: ordersRes.data || [],
    });
  } catch (e) {
    console.error('[management/deals/:id]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải chi tiết deal' });
  }
});

// GET /api/management/by-project/:projectId — tổng hợp deal theo dự án
r.get('/by-project/:projectId', responseCache({ ttl: 15, scope: 'user', tags: ['project-deal', PROJECTS_LIST_TAG] }), async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const bundle = await buildProjectDealBundle(req.params.projectId, {
      user: req.user,
      lite: ['1', 'true'].includes(String(req.query.lite || '').toLowerCase()),
    });
    if (!bundle) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (!await assertProjectInScope(res, scope, bundle.project)) return;
    res.json(bundle);
  } catch (e) {
    console.error('[management/by-project]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng hợp dự án' });
  }
});

const MATERIAL_READY_STATUSES = ['received', 'qc_pass', 'qc_fail', 'done'];
const DONE_TASK_STATUSES = ['done', 'completed'];

// GET /api/management/production-overview/:projectId — Chi tiết 1 dự án đang ở công đoạn sản xuất
r.get('/production-overview/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;

    const { data: project, error } = await supabase.from('projects').select(`
      id, code, name, status, deadline, production_deadline, install_address,
      sx_kanban_column_id, sx_pipeline_stage_entered_at, sx_schedule_slip_days,
      production_person_id, company_id, updated_at,
      company:companies!projects_company_id_fkey(id, name),
      production_person:users!projects_production_person_id_fkey(id, full_name)
    `).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (!await assertProjectInScope(res, scope, project)) return;

    const { data: stagesRaw } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, order_index')
      .eq('company_id', project.company_id)
      .eq('is_active', true)
      .order('order_index');
    const stages = stagesRaw || [];
    const totalStages = stages.length || 1;
    const stageIdx = stages.findIndex((s) => String(s.id) === String(project.sx_kanban_column_id));
    const foundStage = stageIdx >= 0;
    const movedPastProduction = project.status !== 'producing';
    const progressPct = movedPastProduction ? 100 : (foundStage ? Math.round(((stageIdx + 1) / totalStages) * 100) : null);
    const currentStageIdx = movedPastProduction ? stages.length - 1 : (foundStage ? stageIdx : null);
    const stageList = stages.map((s, idx) => ({
      id: s.id,
      name: s.name,
      status: movedPastProduction || idx < currentStageIdx ? 'done' : idx === currentStageIdx ? 'current' : 'pending',
    }));

    const { data: leadRows } = await supabase.from('crm_leads')
      .select('id, code').eq('project_id', projectId).order('created_at', { ascending: true });
    const primaryLead = leadRows?.[0] || null;
    const leadIds = (leadRows || []).map((l) => l.id);

    const { data: prs } = await supabase.from('purchase_requests')
      .select('id, item_name, status').eq('project_id', projectId);
    const materialsTotal = (prs || []).length;
    const materialsReady = (prs || []).filter((p) => MATERIAL_READY_STATUSES.includes(p.status)).length;
    const materialsReadyPct = materialsTotal > 0 ? Math.round((materialsReady / materialsTotal) * 100) : null;
    const openPrCount = (prs || []).filter((p) => ['draft', 'requested'].includes(p.status)).length;

    let taskQuery = supabase.from('unified_tasks_v').select('unified_id, status, deadline').eq('project_id', projectId);
    const { data: projectTasks } = await taskQuery;
    let crmTasks = [];
    if (leadIds.length) {
      const { data: ct } = await supabase.from('unified_tasks_v').select('unified_id, status, deadline').in('lead_id', leadIds);
      crmTasks = ct || [];
    }
    const seenTaskIds = new Set();
    const allTasks = [...(projectTasks || []), ...crmTasks].filter((t) => {
      if (seenTaskIds.has(t.unified_id)) return false;
      seenTaskIds.add(t.unified_id);
      return true;
    });
    const now = new Date();
    const openTasks = allTasks.filter((t) => !DONE_TASK_STATUSES.includes(String(t.status)));
    const overdueTasks = openTasks.filter((t) => t.deadline && new Date(t.deadline) < now);

    const overdue = !!(project.deadline && new Date(project.deadline) < now);
    let bucket;
    if (movedPastProduction) bucket = 'done';
    else if (openPrCount > 0) bucket = 'waiting_material';
    else if (overdue) bucket = 'late';
    else bucket = 'on_track';

    res.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        company: project.company || null,
        install_address: project.install_address || null,
        deadline: project.production_deadline || project.deadline || null,
        production_person: project.production_person || null,
        sx_pipeline_stage_entered_at: project.sx_pipeline_stage_entered_at || null,
        sx_schedule_slip_days: project.sx_schedule_slip_days ?? null,
        updated_at: project.updated_at,
      },
      crm_lead: primaryLead,
      bucket,
      stages: stageList,
      current_stage_idx: currentStageIdx,
      current_stage_label: movedPastProduction ? 'Đã qua công đoạn SX' : (foundStage ? stages[stageIdx].name : 'Chưa vào công đoạn'),
      total_stages: totalStages,
      progress_pct: progressPct,
      materials: {
        total: materialsTotal,
        ready: materialsReady,
        pending: materialsTotal - materialsReady,
        ready_pct: materialsReadyPct,
      },
      tasks: {
        total: allTasks.length,
        open: openTasks.length,
        overdue: overdueTasks.length,
      },
    });
  } catch (e) {
    console.error('[management/production-overview/:projectId]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải chi tiết dự án sản xuất' });
  }
});

module.exports = r;
