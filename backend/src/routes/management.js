/**
 * API module Quản lý — dashboard tổng hợp CRM + SX + VC và trang deal thống nhất.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const { getWonDealProjectIds } = require('../helpers/workshopKanban');
const {
  buildProjectDealBundle,
  isProjectDeliveryStageRow,
  buildDeliveryFlow,
  DEFAULT_DELIVERY_STAGES,
} = require('../helpers/projectDealBundle');
const {
  resolveCompanyScopeForRequest,
  applyCompanyScopeFilter,
  applyProjectScopeFilter,
  TENANT_EMPTY_COMPANY_SENTINEL,
} = require('../helpers/tenantScope');
const {
  applyOpenOnlyFilter,
  countUnifiedOpenTasks,
  countUnifiedOverdueTasks,
} = require('../helpers/unifiedTasksQuery');
const {
  loadOperationalProjectIdsForScope,
  loadOperationalProjectAccess,
} = require('../helpers/operationalProjectScope');
const {
  buildOperationsMetricContract,
  buildOperationsQueue,
} = require('../helpers/operationsReadModel');
const { buildProjectHealthContract } = require('../helpers/projectHealthContract');
const { buildProjectChangeReadModel } = require('../helpers/projectChangeReadModel');

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
  const data = await fetchAllLeadRows(() => {
    let q = supabase
      .from('crm_leads')
      .select('stage_id')
      .eq('type', type)
      .order('id');
    q = applyCompanyScopeFilter(q, scope);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    if (assigneeId) q = q.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
    return q;
  });
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
  const data = await fetchAllLeadRows(() => {
    let q = supabase
      .from('crm_leads')
      .select('estimated_value, deadline:kanban_deadline_at, stage_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)')
      .eq('type', 'deal')
      .order('id');
    q = applyCompanyScopeFilter(q, scope);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    if (assigneeId) q = q.or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
    return q;
  });
  const now = Date.now();
  let pipelineValue = 0;
  let crmOverdue = 0;
  for (const row of data || []) {
    if (row.stage?.is_won || row.stage?.is_lost) continue;
    pipelineValue += Number(row.estimated_value || 0);
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
    value: d.estimated_value || d.project?.estimated_value || 0,
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

async function loadWorkshopStagesForCompanies(table, companyIds, referencedStageIds = []) {
  const ids = [...new Set((companyIds || []).filter(Boolean).map(String))];
  const stageIds = [...new Set((referencedStageIds || []).filter(Boolean).map(String))];
  if (!ids.length && !stageIds.length) return [];

  const queries = [];
  if (ids.length) {
    let companyQ = supabase
      .from(table)
      .select('id, name, color, icon, order_index, bucket_slug, company_id')
      .eq('is_active', true)
      .order('order_index');
    companyQ = ids.length === 1 ? companyQ.eq('company_id', ids[0]) : companyQ.in('company_id', ids);
    queries.push(companyQ);
  }
  if (stageIds.length) {
    queries.push(
      supabase
        .from(table)
        .select('id, name, color, icon, order_index, bucket_slug, company_id')
        .in('id', stageIds)
        .order('order_index'),
    );
  }

  const results = await Promise.all(queries);
  const byId = new Map();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const stage of result.data || []) byId.set(String(stage.id), stage);
  }
  return mergeStagesForPipeline([...byId.values()]);
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

async function loadSxPipelineSummary(scope, scopedProjectIdsPromise = loadOperationalProjectIdsForScope(scope)) {
  let wonIds = await getWonDealProjectIds();
  if (!wonIds.length) return { kpis: { active: 0, intake: 0, overdue: 0 }, pipeline: [], projects: [] };

  const scopedProjectIds = await scopedProjectIdsPromise;
  if (scopedProjectIds !== null) {
    const allowed = new Set(scopedProjectIds.map(String));
    wonIds = wonIds.filter((id) => allowed.has(String(id)));
    if (!wonIds.length) return { kpis: { active: 0, intake: 0, overdue: 0 }, pipeline: [], projects: [] };
  }

  let q = supabase
    .from('projects')
    .select(`
      id, code, name, status, deadline, production_deadline, delivery_date, install_date,
      install_address, sx_kanban_column_id, vc_kanban_column_id, production_person_id,
      logistics_person_id, installation_person_id, installer_person_id,
      company_id, logistics_company_id, updated_at
    `)
    .in('id', wonIds);
  const { data: projects, error } = await q;
  if (error) throw error;

  const stages = await loadWorkshopStagesForCompanies(
    'production_pipeline_stages',
    (projects || []).map((project) => project.company_id),
    (projects || []).map((project) => project.sx_kanban_column_id),
  );

  const now = Date.now();
  let overdue = 0;
  let intake = 0;
  for (const p of projects || []) {
    const productionDeadline = p.production_deadline || p.deadline;
    if (productionDeadline && new Date(productionDeadline).getTime() < now && !['completed', 'cancelled'].includes(p.status)) overdue += 1;
    if (!p.sx_kanban_column_id) intake += 1;
  }

  const { pipeline } = countByStageIds(projects, 'sx_kanban_column_id', stages);
  if (intake > 0) {
    pipeline.unshift({ id: '__intake__', name: 'Chờ xưởng tiếp nhận', color: '#2563EB', icon: '📥', count: intake });
  }

  return {
    kpis: { active: (projects || []).length, intake, overdue },
    pipeline,
    projects: (projects || []).map((project) => ({
      ...project,
      stage: stages.find((stage) => (stage.stage_ids || [String(stage.id)]).includes(String(project.sx_kanban_column_id))) || null,
    })),
  };
}

async function loadVcInstallPipelines(scope, scopedProjectIdsPromise = loadOperationalProjectIdsForScope(scope)) {
  const scopedProjectIds = await scopedProjectIdsPromise;
  if (scopedProjectIds?.length === 0) {
    return {
      vc: { kpis: { active: 0, overdue: 0 }, pipeline: [], projects: [] },
      install: { kpis: { active: 0, overdue: 0 }, pipeline: [], projects: [] },
    };
  }
  let q = supabase
    .from('projects')
    .select(`
      id, code, name, status, deadline, production_deadline, delivery_date, install_date,
      install_address, sx_kanban_column_id, vc_kanban_column_id, production_person_id,
      logistics_person_id, installation_person_id, installer_person_id,
      company_id, logistics_company_id, updated_at
    `)
    .not('vc_kanban_column_id', 'is', null);
  if (scopedProjectIds) q = q.in('id', scopedProjectIds);
  let { data: projects, error } = await q;
  if (error && /vc_kanban_column_id/.test(error.message || '')) {
    return {
      vc: { kpis: { active: 0, overdue: 0 }, pipeline: [], projects: [] },
      install: { kpis: { active: 0, overdue: 0 }, pipeline: [], projects: [] },
    };
  }

  const stages = await loadWorkshopStagesForCompanies(
    'logistics_pipeline_stages',
    (projects || []).flatMap((project) => [project.logistics_company_id, project.company_id]),
    (projects || []).map((project) => project.vc_kanban_column_id),
  );
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
      projects: vcProjects.map((project) => ({
        ...project,
        stage: vcStages.find((stage) => (stage.stage_ids || [String(stage.id)]).includes(String(project.vc_kanban_column_id))) || null,
      })),
    },
    install: {
      kpis: { active: installProjects.length, overdue: installOverdue },
      pipeline: countByStageIds(installProjects, 'vc_kanban_column_id', installStages).pipeline,
      projects: installProjects.map((project) => ({
        ...project,
        stage: installStages.find((stage) => (stage.stage_ids || [String(stage.id)]).includes(String(project.vc_kanban_column_id))) || null,
      })),
    },
  };
}

async function loadOperationsCommercialRecords(scope, projectIds) {
  const byProject = {};
  const ids = [...new Set((projectIds || []).filter(Boolean).map(String))];
  const chunkSize = 150;
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    let query = supabase
      .from('crm_leads')
      .select(`
        id, code, title, type, project_id, company_id, updated_at,
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, is_won, is_lost),
        customer:customers(id, full_name, phone),
        assignee:users!crm_leads_assigned_to_fkey(id, full_name),
        lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name)
      `)
      .in('project_id', ids.slice(offset, offset + chunkSize))
      .in('type', ['lead', 'deal'])
      .order('updated_at', { ascending: false });
    query = applyCompanyScopeFilter(query, scope);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row.project_id);
      const score = (row.stage?.is_won ? 4 : 0) + (row.type === 'deal' ? 2 : 0);
      const current = byProject[key];
      const currentScore = current ? ((current.stage?.is_won ? 4 : 0) + (current.type === 'deal' ? 2 : 0)) : -1;
      if (!current || score > currentScore) byProject[key] = row;
    }
  }
  return byProject;
}

async function loadLookupByIds(table, ids, select = 'id, name') {
  const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return {};
  const byId = {};
  const chunkSize = 150;
  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in('id', uniqueIds.slice(offset, offset + chunkSize));
    if (error) throw error;
    for (const row of data || []) byId[String(row.id)] = row;
  }
  return byId;
}

async function loadOperationsReadModel(scope, sx = null, vcInstall = null) {
  const operationalProjectIdsPromise = loadOperationalProjectIdsForScope(scope);
  const [sxData, vcInstallData] = await Promise.all([
    sx ? Promise.resolve(sx) : loadSxPipelineSummary(scope, operationalProjectIdsPromise),
    vcInstall ? Promise.resolve(vcInstall) : loadVcInstallPipelines(scope, operationalProjectIdsPromise),
  ]);
  const allProjects = [
    ...(sxData.projects || []),
    ...(vcInstallData.vc?.projects || []),
    ...(vcInstallData.install?.projects || []),
  ];
  const projectIds = allProjects.map((project) => project.id);
  const [recordsByProject, companiesById, usersById] = await Promise.all([
    loadOperationsCommercialRecords(scope, projectIds),
    loadLookupByIds('companies', allProjects.flatMap((project) => [project.company_id, project.logistics_company_id]), 'id, name, short_name'),
    loadLookupByIds('users', allProjects.flatMap((project) => [
      project.production_person_id,
      project.logistics_person_id,
      project.installation_person_id,
      project.installer_person_id,
    ]), 'id, full_name, avatar'),
  ]);
  const companyId = primaryCompanyIdFromScope(scope);
  return {
    ...buildOperationsQueue({
      production: sxData.projects || [],
      delivery: vcInstallData.vc?.projects || [],
      installation: vcInstallData.install?.projects || [],
      recordsByProject,
      companiesById,
      usersById,
      companyId,
    }),
    pipelines: {
      production: sxData.pipeline || [],
      delivery: vcInstallData.vc?.pipeline || [],
      installation: vcInstallData.install?.pipeline || [],
    },
  };
}

// GET /api/management/operations-queue — read model Project duy nhất cho SX → VC → Lắp đặt
r.get('/operations-queue', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    res.set('Cache-Control', 'no-store');
    res.json(await loadOperationsReadModel(scope));
  } catch (e) {
    console.error('[management/operations-queue]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải hàng đợi vận hành' });
  }
});

// GET /api/management/overview
r.get('/overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const companyId = primaryCompanyIdFromScope(scope);
    const { date_from: dateFrom, date_to: dateTo, assignee_id: assigneeId } = req.query;
    const operationalProjectIdsPromise = loadOperationalProjectIdsForScope(scope);

    const [dealStages, leadStages, dealCounts, leadCounts, sx, vcInstall, pipelineMetrics] = await Promise.all([
      loadCrmDealStages(scope),
      loadCrmLeadStages(scope),
      countLeadsByStage(scope, 'deal', dateFrom, dateTo, assigneeId),
      countLeadsByStage(scope, 'lead', dateFrom, dateTo, assigneeId),
      loadSxPipelineSummary(scope, operationalProjectIdsPromise),
      loadVcInstallPipelines(scope, operationalProjectIdsPromise),
      loadDealPipelineMetrics(scope, dateFrom, dateTo, assigneeId),
    ]);
    const vc = vcInstall.vc;
    const install = vcInstall.install;

    const taskScope = {
      company_id: scope.companyId || undefined,
      company_ids: scope.companyIds || undefined,
    };
    const [openTasks, overdueTasks] = await Promise.all([
      countUnifiedOpenTasks(req.user, taskScope),
      countUnifiedOverdueTasks(req.user, taskScope),
    ]);

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
      metric_contract: buildOperationsMetricContract(companyId),
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

// GET /api/management/work-overview — Tổng quan công việc (doanh thu, dự án cần chú ý, KH mới)
r.get('/work-overview', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    let activeQ = supabase.from('projects').select('*', { count: 'exact', head: true })
      .in('status', WORK_OVERVIEW_ACTIVE_STATUSES);
    activeQ = applyProjectScopeFilter(activeQ, scope);

    let trendQ = supabase.from('projects').select('estimated_value, created_at')
      .gte('created_at', sixMonthsAgoStart.toISOString());
    trendQ = applyProjectScopeFilter(trendQ, scope);

    let newCustomersQ = supabase.from('crm_leads').select('*', { count: 'exact', head: true })
      .eq('type', 'lead').gte('created_at', firstDayThisMonth.toISOString());
    newCustomersQ = applyCompanyScopeFilter(newCustomersQ, scope);

    let overdueTasksQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .lt('deadline', now.toISOString()).not('deadline', 'is', null);
    overdueTasksQ = applyOpenOnlyFilter(overdueTasksQ);
    overdueTasksQ = applyCompanyScopeFilter(overdueTasksQ, scope);

    let atRiskQ = supabase.from('projects')
      .select('id, code, name, status, deadline, sx_kanban_column_id, company_id')
      .in('status', WORK_OVERVIEW_ACTIVE_STATUSES)
      .not('deadline', 'is', null);
    atRiskQ = applyProjectScopeFilter(atRiskQ, scope);

    const [activeRes, trendRes, newCustomersRes, overdueTasksRes, atRiskRes] = await Promise.all([
      activeQ, trendQ, newCustomersQ, overdueTasksQ, atRiskQ,
    ]);
    const atRiskCompanyIds = [...new Set((atRiskRes.data || []).map((p) => p.company_id).filter(Boolean))];
    const stagesByCompany = await loadStagesByCompany('production_pipeline_stages', atRiskCompanyIds);

    // Doanh thu 6 tháng gần đây — giá trị dự án (estimated_value) tạo trong tháng đó.
    const trendBuckets = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      trendBuckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `T${d.getMonth() + 1}`, total: 0 });
    }
    for (const p of (trendRes.data || [])) {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = trendBuckets.find((b) => b.key === key);
      if (bucket) bucket.total += (p.estimated_value || 0);
    }
    trendBuckets[trendBuckets.length - 1].isCurrentMonth = true;

    // Dự án cần chú ý — trễ hạn hoặc sắp hết hạn mà tiến độ SX còn thấp (theo pipeline riêng của từng công ty).
    const nowMs = now.getTime();
    const projectsAtRisk = (atRiskRes.data || [])
      .map((p) => {
        const companyStages = stagesByCompany.get(String(p.company_id)) || [];
        const totalStages = companyStages.length || 1;
        const stageIdx = companyStages.findIndex((s) => String(s.id) === String(p.sx_kanban_column_id));
        const progressPct = stageIdx >= 0 ? Math.round(((stageIdx + 1) / totalStages) * 100) : null;
        const daysLeft = Math.ceil((new Date(p.deadline).getTime() - nowMs) / 86400000);
        let risk = null;
        if (daysLeft < 0) risk = { level: 'overdue', label: `Trễ hạn ${Math.abs(daysLeft)} ngày` };
        else if (daysLeft <= 3 && (progressPct == null || progressPct < 85)) risk = { level: 'warning', label: 'Nguy cơ trễ' };
        if (!risk) return null;
        return {
          id: p.id, code: p.code, name: p.name, deadline: p.deadline,
          days_left: daysLeft, progress_pct: progressPct, risk,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.days_left - b.days_left)
      .slice(0, 6);

    res.json({
      company_id: primaryCompanyIdFromScope(scope),
      projects_active: activeRes.count || 0,
      new_customers_this_month: newCustomersRes.count || 0,
      overdue_tasks: overdueTasksRes.count || 0,
      revenue_this_month: trendBuckets[trendBuckets.length - 1].total,
      revenue_trend: trendBuckets.map((b, idx) => ({ label: b.label, total: b.total, is_current: idx === trendBuckets.length - 1 })),
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

function startOfDayMs(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** on_track | at_risk | late | unknown — cùng ngưỡng với buildProjectOverview (projectDealBundle.js). */
function classifyProjectForecast(commitmentDate) {
  if (!commitmentDate) return { forecast: 'unknown', days_remaining: null, delay_days: 0 };
  const daysRemaining = Math.round((startOfDayMs(commitmentDate) - startOfDayMs(new Date())) / 86400000);
  if (daysRemaining < 0) return { forecast: 'late', days_remaining: daysRemaining, delay_days: Math.abs(daysRemaining) };
  if (daysRemaining <= 3) return { forecast: 'at_risk', days_remaining: daysRemaining, delay_days: 2 };
  return { forecast: 'on_track', days_remaining: daysRemaining, delay_days: 0 };
}

// GET /api/management/work-unified — Tổng quan dự án theo luồng giao hàng (mockup Work Unified)
r.get('/work-unified', async (req, res) => {
  try {
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    const { stage: stageFilter, forecast: forecastFilter } = req.query;

    const { data: stageRows } = await supabase
      .from('workflow_stages')
      .select('id, name, slug, color, order_index, is_active, company_id')
      .is('company_id', null)
      .eq('is_active', true)
      .order('order_index');
    const stages = (stageRows || []).filter(isProjectDeliveryStageRow);
    const deliveryStages = stages.length ? stages : DEFAULT_DELIVERY_STAGES;

    let q = supabase.from('projects').select(`
      id, code, name, status, deadline, estimated_value, production_value, deposit_amount, collected_amount,
      company_id, logistics_company_id,
      customer_id, current_stage_id, install_date, delivery_date, production_deadline,
      project_manager_id, sales_person_id, production_person_id,
      customer:customers(id, full_name),
      current_stage:workflow_stages(id, name, slug, color, order_index),
      project_manager:users!projects_project_manager_id_fkey(id, full_name),
      sales_person:users!projects_sales_person_id_fkey(id, full_name),
      production_person:users!projects_production_person_id_fkey(id, full_name)
    `).in('status', WORK_OVERVIEW_ACTIVE_STATUSES);
    q = applyProjectScopeFilter(q, scope);
    const { data: projects, error } = await q;
    if (error) throw error;

    const projectIds = (projects || []).map((p) => p.id);
    let dealByProjectId = {};
    if (projectIds.length) {
      const { data: deals } = await supabase.from('crm_leads')
        .select('id, code, title, project_id').in('project_id', projectIds);
      (deals || []).forEach((d) => { dealByProjectId[String(d.project_id)] = d; });
    }

    const items = (projects || []).map((p) => {
      const flow = buildDeliveryFlow({ project: p, deliveryStages, pipelines: {} });
      const doneSteps = flow.filter((s) => s.status === 'done').length;
      const currentStep = flow.find((s) => s.status === 'current');
      const progressPct = flow.length
        ? Math.round(((doneSteps + (currentStep ? 0.35 : 0)) / flow.length) * 100)
        : 0;
      const commitmentDate = p.install_date || p.delivery_date || p.production_deadline || p.deadline || null;
      const { forecast, days_remaining, delay_days } = classifyProjectForecast(commitmentDate);
      const deal = dealByProjectId[String(p.id)] || null;
      const assignee = p.project_manager || p.sales_person || p.production_person || null;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        company_id: p.company_id,
        logistics_company_id: p.logistics_company_id,
        customer_name: p.customer?.full_name || null,
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
        assignee_name: assignee?.full_name || null,
      };
    });

    const stats = { total: items.length, on_track: 0, at_risk: 0, late: 0 };
    items.forEach((it) => {
      if (it.forecast === 'late') stats.late += 1;
      else if (it.forecast === 'at_risk') stats.at_risk += 1;
      else stats.on_track += 1;
    });

    let filtered = items;
    if (stageFilter) filtered = filtered.filter((it) => it.current_stage_slug === stageFilter);
    if (forecastFilter && forecastFilter !== 'all') filtered = filtered.filter((it) => it.forecast === forecastFilter);
    filtered.sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });

    res.json({
      company_id: primaryCompanyIdFromScope(scope),
      stages: deliveryStages.map((s) => ({ slug: s.slug, label: s.name })),
      stats,
      items: filtered,
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

const PRODUCTION_PAST_STATUSES = new Set(['shipping', 'installing', 'completed', 'cancelled']);

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
    res.set('Cache-Control', 'no-store');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sx = await loadSxPipelineSummary(scope);
    const projects = sx.projects || [];

    const projectCompanyIds = [...new Set((projects || []).map((p) => p.company_id).filter(Boolean))];
    const stagesByCompany = await loadStagesByCompany('production_pipeline_stages', projectCompanyIds);
    const usersById = await loadLookupByIds(
      'users',
      (projects || []).map((project) => project.production_person_id),
      'id, full_name, avatar',
    );

    const projectIds = (projects || []).map((p) => p.id);
    const openPrProjectIds = new Set();
    if (projectIds.length) {
      const { data: prs } = await supabase.from('purchase_requests')
        .select('project_id, status').in('project_id', projectIds).in('status', ['draft', 'requested']);
      (prs || []).forEach((r2) => { if (r2.project_id) openPrProjectIds.add(String(r2.project_id)); });
    }

    const items = (projects || []).map((p) => {
      const companyStages = stagesByCompany.get(String(p.company_id)) || [];
      const totalStages = companyStages.length || 1;
      const stageIdx = companyStages.findIndex((s) => String(s.id) === String(p.sx_kanban_column_id));
      const foundStage = stageIdx >= 0;
      const progressPct = foundStage ? Math.round(((stageIdx + 1) / totalStages) * 100) : null;
      const movedPastProduction = PRODUCTION_PAST_STATUSES.has(String(p.status || '').toLowerCase());
      const waitingMaterial = openPrProjectIds.has(String(p.id));
      const effectiveDeadline = p.production_deadline || p.deadline;
      const overdue = !!(effectiveDeadline && new Date(effectiveDeadline) < now && !movedPastProduction);

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
        assignee_name: usersById[String(p.production_person_id)]?.full_name || null,
        bucket,
        deadline: effectiveDeadline,
        updated_at: p.updated_at,
        company_id: p.company_id,
        logistics_company_id: p.logistics_company_id,
      };
    });

    items.sort((a, b) => new Date(a.deadline || '9999-12-31').getTime() - new Date(b.deadline || '9999-12-31').getTime());

    const stats = {
      in_pipeline: items.length,
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
      metric_contract: buildOperationsMetricContract(primaryCompanyIdFromScope(scope)),
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

    const listSelect = `
          id, code, title, type, estimated_value, created_at, updated_at, deadline:kanban_deadline_at,
          project_id, company_id, assigned_to, lead_owner_id,
          stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost),
          customer:customers(id, full_name, phone),
          assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
          lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
          company:companies!crm_leads_company_id_fkey(id, name, short_name),
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
        query = query.lt('kanban_deadline_at', new Date().toISOString()).not('kanban_deadline_at', 'is', null);
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
    const access = await loadOperationalProjectAccess(req.params.projectId, scope);
    if (!access) return res.status(404).json({ error: 'Không tìm thấy dự án trong phạm vi vận hành' });
    res.json(bundle);
  } catch (e) {
    console.error('[management/by-project]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng hợp dự án' });
  }
});

const MATERIAL_READY_STATUSES = ['received', 'qc_pass', 'qc_fail', 'done'];
const DONE_TASK_STATUSES = ['done', 'completed'];

// GET /api/management/production-overview/:projectId — Project Cockpit chuyển tiếp, đọc xuyên suốt 8 macro phase
r.get('/production-overview/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const scope = getCompanyScope(req, req.query.company_id);
    if (denyScope(res, scope)) return;
    res.set('Cache-Control', 'no-store');

    const { data: project, error } = await supabase.from('projects').select(`
      id, code, name, status, deadline, design_deadline, production_deadline, install_address,
      production_start_date, production_finish_date, completed_date, sx_reception_date,
      sx_kanban_column_id, sx_pipeline_stage_entered_at, sx_schedule_slip_days,
      vc_kanban_column_id, delivery_date, install_date, pickup_at,
      designer_id, design_person_id, project_manager_id, production_person_id, shipping_person_id,
      logistics_person_id, installation_person_id, installer_person_id,
      company_id, logistics_company_id, updated_at,
      company:companies!projects_company_id_fkey(id, name),
      production_person:users!projects_production_person_id_fkey(id, full_name),
      current_stage:workflow_stages(id, slug, name)
    `).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const access = await loadOperationalProjectAccess(projectId, scope);
    if (!access) return res.status(404).json({ error: 'Không tìm thấy dự án trong phạm vi vận hành' });

    const { data: stagesRaw } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, order_index, bucket_slug, progress_percent, counts_as_collected_revenue, is_packaging_done, deadline_group')
      .eq('company_id', project.company_id)
      .eq('is_active', true)
      .order('order_index');
    const stages = stagesRaw || [];
    const totalStages = stages.length || 1;
    const stageIdx = stages.findIndex((s) => String(s.id) === String(project.sx_kanban_column_id));
    const foundStage = stageIdx >= 0;
    const movedPastProduction = PRODUCTION_PAST_STATUSES.has(String(project.status || '').toLowerCase());
    const progressPct = movedPastProduction ? 100 : (foundStage ? Math.round(((stageIdx + 1) / totalStages) * 100) : null);
    const currentStageIdx = movedPastProduction ? stages.length - 1 : (foundStage ? stageIdx : null);
    const stageList = stages.map((s, idx) => ({
      id: s.id,
      name: s.name,
      status: movedPastProduction || idx < currentStageIdx ? 'done' : idx === currentStageIdx ? 'current' : 'pending',
    }));

    let logisticsStage = null;
    let logisticsStages = [];
    if (project.vc_kanban_column_id) {
      const { data: stage, error: logisticsStageError } = await supabase
        .from('logistics_pipeline_stages')
        .select('id, name, order_index, bucket_slug, color, company_id, progress_percent, crm_sync_type')
        .eq('id', project.vc_kanban_column_id)
        .maybeSingle();
      if (logisticsStageError) throw logisticsStageError;
      logisticsStage = stage || null;
      if (logisticsStage) {
        let logisticsStagesQuery = supabase
          .from('logistics_pipeline_stages')
          .select('id, name, order_index, bucket_slug, color, company_id, progress_percent, crm_sync_type')
          .eq('is_active', true)
          .order('order_index');
        logisticsStagesQuery = logisticsStage.company_id
          ? logisticsStagesQuery.eq('company_id', logisticsStage.company_id)
          : logisticsStagesQuery.is('company_id', null);
        const { data: stageRows, error: logisticsStagesError } = await logisticsStagesQuery;
        if (logisticsStagesError) throw logisticsStagesError;
        logisticsStages = stageRows || [];
      }
    }
    const [operationUsers, operationCompanies] = await Promise.all([
      loadLookupByIds('users', [
        project.designer_id,
        project.design_person_id,
        project.project_manager_id,
        project.shipping_person_id,
        project.logistics_person_id,
        project.installation_person_id,
        project.installer_person_id,
      ], 'id, full_name, avatar'),
      loadLookupByIds('companies', [project.logistics_company_id], 'id, name, short_name'),
    ]);

    const { data: leadRows } = await supabase.from('crm_leads')
      .select('id, code').eq('project_id', projectId).order('created_at', { ascending: true });
    const primaryLead = leadRows?.[0] || null;
    const leadIds = (leadRows || []).map((l) => l.id);

    const [incidentsRes, approvalsRes, additionalDealsRes] = await Promise.all([
      supabase.from('project_incidents').select(`
        id, title, description, severity, status, created_at, resolved_at,
        change_type, cause, phase_key, owner_user_id, cost_impact, schedule_impact_days,
        cost_bearer, requires_approval, approval_status, approval_notes, approved_at,
        rejected_reason, attachments, related_links,
        reporter:users!project_incidents_reported_by_fkey(id, full_name, avatar),
        resolver:users!project_incidents_resolved_by_fkey(id, full_name, avatar),
        owner:users!project_incidents_owner_user_id_fkey(id, full_name, avatar, department_id),
        approver:users!project_incidents_approved_by_fkey(id, full_name, avatar)
      `).eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_approvals').select(`
        id, project_id, stage_id, status, notes, attachments, reject_reason, approve_notes,
        decided_at, created_at,
        stage:workflow_stages(id, name, slug),
        requester:users!project_approvals_requested_by_fkey(id, full_name, avatar),
        decider:users!project_approvals_decided_by_fkey(id, full_name, avatar)
      `).eq('project_id', projectId).order('created_at', { ascending: false }),
      leadIds.length
        ? supabase.from('crm_leads')
          .select('id, code, title, description, created_at, stage_id, estimated_value, source_customer_deal_id, project_id, assigned_to, lead_owner_id')
          .in('source_customer_deal_id', leadIds)
          .eq('type', 'deal')
          .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (incidentsRes.error) throw incidentsRes.error;
    if (approvalsRes.error) throw approvalsRes.error;
    if (additionalDealsRes.error) throw additionalDealsRes.error;

    const additionalDeals = additionalDealsRes.data || [];
    const [additionalStages, additionalOwners] = await Promise.all([
      loadLookupByIds('crm_pipeline_stages', additionalDeals.map((item) => item.stage_id), 'id, name, color, is_won, is_lost'),
      loadLookupByIds('users', additionalDeals.flatMap((item) => [item.assigned_to, item.lead_owner_id]), 'id, full_name, avatar'),
    ]);
    const changeContract = buildProjectChangeReadModel({
      projectId,
      incidents: incidentsRes.data || [],
      approvals: approvalsRes.data || [],
      commercialAdditions: additionalDeals.map((item) => ({
        ...item,
        stage: additionalStages[String(item.stage_id)] || null,
        assignee: additionalOwners[String(item.assigned_to)] || null,
        lead_owner: additionalOwners[String(item.lead_owner_id)] || null,
      })),
    });

    const { data: prs } = await supabase.from('purchase_requests')
      .select('id, item_name, status, qc_status, owner_user_id, requested_date, supplier_committed_date, delay_reason, next_action')
      .eq('project_id', projectId);
    const materialsTotal = (prs || []).length;
    const materialsReady = (prs || []).filter((p) => MATERIAL_READY_STATUSES.includes(p.status)).length;
    const materialsReadyPct = materialsTotal > 0 ? Math.round((materialsReady / materialsTotal) * 100) : null;
    const openPrCount = (prs || []).filter((p) => ['draft', 'requested'].includes(p.status)).length;

    let taskQuery = supabase.from('unified_tasks_v').select('unified_id, title, task_kind, status, deadline').eq('project_id', projectId);
    const { data: projectTasks } = await taskQuery;
    let crmTasks = [];
    if (leadIds.length) {
      const { data: ct } = await supabase.from('unified_tasks_v').select('unified_id, title, task_kind, status, deadline').in('lead_id', leadIds);
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

    const effectiveDeadline = project.production_deadline || project.deadline;
    const overdue = !!(effectiveDeadline && new Date(effectiveDeadline) < now && !movedPastProduction);
    let bucket;
    if (movedPastProduction) bucket = 'done';
    else if (openPrCount > 0) bucket = 'waiting_material';
    else if (overdue) bucket = 'late';
    else bucket = 'on_track';

    const materialOwnerIds = (prs || []).map((item) => item.owner_user_id).filter(Boolean);
    const materialOwners = await loadLookupByIds('users', materialOwnerIds, 'id, full_name, avatar');
    const projectManager = operationUsers[String(project.project_manager_id)] || null;
    const procurementOwnerId = (prs || []).find((item) => !MATERIAL_READY_STATUSES.includes(item.status) && item.owner_user_id)?.owner_user_id
      || (prs || []).find((item) => item.owner_user_id)?.owner_user_id;
    const deliveryOwner = operationUsers[String(project.logistics_person_id || project.shipping_person_id)] || projectManager;
    const installationOwner = operationUsers[String(project.installation_person_id || project.installer_person_id)] || projectManager;
    const healthContract = buildProjectHealthContract({
      project,
      productionStages: stages,
      productionStage: foundStage ? stages[stageIdx] : null,
      logisticsStages,
      logisticsStage,
      materials: prs || [],
      tasks: allTasks,
      externalBlockers: changeContract.blockers,
      owners: {
        design: operationUsers[String(project.design_person_id || project.designer_id)] || projectManager,
        procurement: materialOwners[String(procurementOwnerId)] || projectManager,
        production: project.production_person || projectManager,
        quality: project.production_person || projectManager,
        packing: project.production_person || projectManager,
        delivery: deliveryOwner,
        installation: installationOwner,
        acceptance: installationOwner,
      },
      now,
    });

    res.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        company: project.company || null,
        company_id: project.company_id,
        logistics_company_id: project.logistics_company_id,
        install_address: project.install_address || null,
        deadline: effectiveDeadline || null,
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
      logistics: {
        phase: logisticsStage ? (isInstallStageMeta(logisticsStage) ? 'installation' : 'delivery') : null,
        stage: logisticsStage,
        company: operationCompanies[String(project.logistics_company_id)] || null,
        logistics_person: operationUsers[String(project.logistics_person_id)] || null,
        installation_person: operationUsers[String(project.installation_person_id || project.installer_person_id)] || null,
        delivery_date: project.delivery_date || null,
        install_date: project.install_date || null,
        pickup_at: project.pickup_at || null,
      },
      health_contract: healthContract,
      changes_contract: changeContract,
      metric_contract: buildOperationsMetricContract(primaryCompanyIdFromScope(scope)),
    });
  } catch (e) {
    console.error('[management/production-overview/:projectId]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải Tổng quan Project' });
  }
});

module.exports = r;
