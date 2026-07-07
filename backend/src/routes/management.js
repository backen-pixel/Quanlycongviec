/**
 * API module Quản lý — dashboard tổng hợp CRM + SX + VC và trang deal thống nhất.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const { getWonDealProjectIds } = require('../helpers/workshopKanban');
const { buildProjectDealBundle } = require('../helpers/projectDealBundle');
const {
  resolveCompanyScopeForRequest,
  applyCompanyScopeFilter,
  applyProjectScopeFilter,
  TENANT_EMPTY_COMPANY_SENTINEL,
} = require('../helpers/tenantScope');

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

function assertProjectInScope(res, scope, project) {
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
  if (!inScope(cid) && !inScope(lcid)) {
    res.status(403).json({ error: 'Không có quyền xem dự án này' });
    return false;
  }
  return true;
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
    .select('budget, estimated_value, deadline, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)')
    .eq('type', 'deal');
  q = applyCompanyScopeFilter(q, scope);
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo) q = q.lte('created_at', dateTo);
  if (assigneeId) q = q.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
  const { data } = await q;
  const now = Date.now();
  let pipelineValue = 0;
  let crmOverdue = 0;
  for (const row of data || []) {
    if (row.stage?.is_won || row.stage?.is_lost) continue;
    pipelineValue += Number(row.budget || row.estimated_value || 0);
    if (row.deadline && new Date(row.deadline).getTime() < now) crmOverdue += 1;
  }
  return { pipeline_value: pipelineValue, crm_overdue: crmOverdue };
}

function isProjectOverdue(project) {
  if (!project?.deadline) return false;
  if (project.status === 'completed') return false;
  return new Date(project.deadline).getTime() < Date.now();
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
    out = out.filter((d) => d.project_id && isProjectOverdue(d.project));
  } else if (focus === 'vc_overdue') {
    out = out.filter((d) => d.project?.vc_kanban_column_id && isProjectOverdue(d.project));
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
    const { data } = await supabase.from('production_pipeline_stages').select('id, name, color').in('id', sxIds);
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
    value: d.budget || d.estimated_value || d.project?.estimated_value || 0,
  }));
}

async function loadWorkshopStages(table, scope) {
  const companyIds = getScopeCompanyIds(scope);
  let stagesQuery = supabase
    .from(table)
    .select('id, name, color, icon, order_index, bucket_slug, company_id')
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
    let pq = supabase.from('projects').select('id').in('id', wonIds);
    pq = applyCompanyScopeFilter(pq, scope);
    const { data: filtered } = await pq;
    wonIds = (filtered || []).map((p) => p.id);
    if (!wonIds.length) return { kpis: { active: 0, intake: 0, overdue: 0 }, pipeline: [] };
  }

  let q = supabase
    .from('projects')
    .select('id, sx_kanban_column_id, deadline, status, company_id')
    .in('id', wonIds);
  q = applyCompanyScopeFilter(q, scope);
  const { data: projects } = await q;

  const stages = await loadWorkshopStages('production_pipeline_stages', scope);

  const now = Date.now();
  let overdue = 0;
  let intake = 0;
  for (const p of projects || []) {
    if (p.deadline && new Date(p.deadline).getTime() < now && p.status !== 'completed') overdue += 1;
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
    .select('id, vc_kanban_column_id, deadline, status, company_id, logistics_company_id')
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
  const now = Date.now();
  let vcOverdue = 0;
  let installOverdue = 0;
  for (const p of projects || []) {
    const col = p.vc_kanban_column_id ? String(p.vc_kanban_column_id) : '';
    const overdue = p.deadline && new Date(p.deadline).getTime() < now && p.status !== 'completed';
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

    let taskQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .neq('status', 'completed').neq('status', 'done');
    taskQ = applyCompanyScopeFilter(taskQ, scope);
    const { count: openTasks } = await taskQ;

    let overdueQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .lt('deadline', new Date().toISOString())
      .neq('status', 'completed').neq('status', 'done');
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

    const listSelect = `
          id, code, title, type, budget, estimated_value, created_at, updated_at, deadline,
          project_id, company_id, assigned_to, lead_owner_id,
          stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost),
          customer:customers(id, full_name, phone),
          assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
          lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
          company:companies(id, name, short_name),
          project:projects(id, code, name, status, deadline, estimated_value, sx_kanban_column_id, vc_kanban_column_id, install_address)
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
        query = query.lt('deadline', new Date().toISOString()).not('deadline', 'is', null);
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
        company:companies(id, name, short_name),
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
      supabase.from('lead_documents').select('id, name, file_name, doc_type, created_at, shared_to_workshop, allowed_share_modules, file_path, file_url')
        .eq('lead_id', leadId).order('created_at', { ascending: false }),
      supabase.from('crm_activities').select('id, type, title, content, result, created_at, created_by')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(30),
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
r.get('/by-project/:projectId', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const bundle = await buildProjectDealBundle(req.params.projectId, { user: req.user });
    if (!bundle) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (!assertProjectInScope(res, scope, bundle.project)) return;
    res.json(bundle);
  } catch (e) {
    console.error('[management/by-project]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng hợp dự án' });
  }
});

module.exports = r;
