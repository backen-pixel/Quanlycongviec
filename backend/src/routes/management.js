/**
 * API module Quản lý — dashboard tổng hợp CRM + SX + VC và trang deal thống nhất.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const { getWonDealProjectIds } = require('../helpers/workshopKanban');
const { buildProjectDealBundle } = require('../helpers/projectDealBundle');

const r = Router();
r.use(auth);

function userIsAdmin(role) {
  return isAdminLike({ role });
}

function scopedAdminCompanyId(req) {
  const sac = req.user?.scoped_admin_company_id || req.user?.scopedAdminCompanyId;
  return sac && String(sac).trim() ? String(sac).trim() : null;
}

function resolveEffectiveCompanyId(req, companyIdQuery) {
  const sac = scopedAdminCompanyId(req);
  if (sac) return sac;
  if (!userIsAdmin(req.user?.role)) {
    return req.user?.company_id ? String(req.user.company_id) : null;
  }
  const raw = companyIdQuery && String(companyIdQuery).trim();
  return raw || null;
}

function parsePagination(req, defaultSize = 50, maxSize = 200) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const requested = parseInt(req.query.page_size || req.query.limit, 10) || defaultSize;
  const pageSize = Math.max(1, Math.min(maxSize, requested));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

async function loadCrmDealStages(companyId) {
  let stagesQuery = supabase
    .from('crm_pipeline_stages')
    .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type')
    .eq('is_active', true)
    .eq('pipeline_type', 'deal')
    .order('order_index');
  if (companyId) {
    const { data: defPl } = await supabase
      .from('crm_pipelines')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (defPl?.id) stagesQuery = stagesQuery.eq('pipeline_id', defPl.id);
  }
  const { data } = await stagesQuery;
  return (data || []).filter((s) => !s.is_lost);
}

async function countLeadsByStage(companyId, type, dateFrom, dateTo) {
  let q = supabase
    .from('crm_leads')
    .select('stage_id')
    .eq('type', type);
  if (companyId) q = q.eq('company_id', companyId);
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo) q = q.lte('created_at', dateTo);
  const { data } = await q;
  const counts = {};
  for (const row of data || []) {
    const sid = row.stage_id ? String(row.stage_id) : '__none__';
    counts[sid] = (counts[sid] || 0) + 1;
  }
  return counts;
}

function buildPipelineFromStages(stages, counts) {
  return (stages || []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    order_index: s.order_index,
    is_won: s.is_won,
    count: counts[String(s.id)] || 0,
  }));
}

async function loadSxPipelineSummary(companyId) {
  const wonIds = await getWonDealProjectIds();
  if (!wonIds.length) return { kpis: { active: 0, intake: 0, overdue: 0 }, pipeline: [] };

  let q = supabase
    .from('projects')
    .select('id, sx_kanban_column_id, deadline, status, company_id')
    .in('id', wonIds);
  if (companyId) q = q.eq('company_id', companyId);
  const { data: projects } = await q;

  let stagesQuery = supabase
    .from('production_pipeline_stages')
    .select('id, name, color, icon, order_index, bucket_slug')
    .eq('is_active', true)
    .order('order_index');
  if (companyId) stagesQuery = stagesQuery.eq('company_id', companyId);
  const { data: stages } = await stagesQuery;

  const counts = {};
  const now = Date.now();
  let overdue = 0;
  let intake = 0;
  for (const p of projects || []) {
    const colId = p.sx_kanban_column_id ? String(p.sx_kanban_column_id) : '__intake__';
    counts[colId] = (counts[colId] || 0) + 1;
    if (p.deadline && new Date(p.deadline).getTime() < now && p.status !== 'completed') overdue += 1;
    if (!p.sx_kanban_column_id) intake += 1;
  }

  const pipeline = (stages || []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    bucket_slug: s.bucket_slug,
    count: counts[String(s.id)] || 0,
  }));
  if (intake > 0) {
    pipeline.unshift({ id: '__intake__', name: 'Tiếp nhận', color: '#2563EB', icon: '📥', count: intake });
  }

  return {
    kpis: { active: (projects || []).length, intake, overdue },
    pipeline,
  };
}

async function loadVcPipelineSummary(companyId) {
  let q = supabase
    .from('projects')
    .select('id, vc_kanban_column_id, deadline, status, company_id, logistics_company_id')
    .not('vc_kanban_column_id', 'is', null);
  if (companyId) {
    q = q.or(`company_id.eq.${companyId},logistics_company_id.eq.${companyId}`);
  }
  let { data: projects, error } = await q;
  if (error && /vc_kanban_column_id/.test(error.message || '')) {
    return { kpis: { active: 0, overdue: 0 }, pipeline: [] };
  }

  let stagesQuery = supabase
    .from('logistics_pipeline_stages')
    .select('id, name, color, icon, order_index, bucket_slug')
    .eq('is_active', true)
    .order('order_index');
  if (companyId) stagesQuery = stagesQuery.eq('company_id', companyId);
  const { data: stages } = await stagesQuery;

  const counts = {};
  const now = Date.now();
  let overdue = 0;
  for (const p of projects || []) {
    const colId = p.vc_kanban_column_id ? String(p.vc_kanban_column_id) : '__none__';
    counts[colId] = (counts[colId] || 0) + 1;
    if (p.deadline && new Date(p.deadline).getTime() < now && p.status !== 'completed') overdue += 1;
  }

  return {
    kpis: { active: (projects || []).length, overdue },
    pipeline: (stages || []).map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      count: counts[String(s.id)] || 0,
    })),
  };
}

// GET /api/management/overview
r.get('/overview', async (req, res) => {
  try {
    const companyId = resolveEffectiveCompanyId(req, req.query.company_id);
    const { date_from: dateFrom, date_to: dateTo } = req.query;

    const [dealStages, leadStages, dealCounts, leadCounts, sx, vc] = await Promise.all([
      loadCrmDealStages(companyId),
      loadCrmDealStages(companyId).then(async () => {
        let q = supabase
          .from('crm_pipeline_stages')
          .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type')
          .eq('is_active', true)
          .eq('pipeline_type', 'lead')
          .order('order_index');
        if (companyId) {
          const { data: defPl } = await supabase
            .from('crm_pipelines')
            .select('id')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (defPl?.id) q = q.eq('pipeline_id', defPl.id);
        }
        const { data } = await q;
        return (data || []).filter((s) => !s.is_lost);
      }),
      countLeadsByStage(companyId, 'deal', dateFrom, dateTo),
      countLeadsByStage(companyId, 'lead', dateFrom, dateTo),
      loadSxPipelineSummary(companyId),
      loadVcPipelineSummary(companyId),
    ]);

    let taskQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .neq('status', 'completed').neq('status', 'done');
    if (companyId) taskQ = taskQ.eq('company_id', companyId);
    const { count: openTasks } = await taskQ;

    let overdueQ = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true })
      .lt('deadline', new Date().toISOString())
      .neq('status', 'completed').neq('status', 'done');
    if (companyId) overdueQ = overdueQ.eq('company_id', companyId);
    const { count: overdueTasks } = await overdueQ;

    const totalDeals = Object.values(dealCounts).reduce((s, n) => s + n, 0);
    const totalLeads = Object.values(leadCounts).reduce((s, n) => s + n, 0);
    const wonDeals = dealStages.filter((s) => s.is_won).reduce((s, st) => s + (dealCounts[String(st.id)] || 0), 0);

    res.json({
      company_id: companyId,
      kpis: {
        crm_leads: totalLeads,
        crm_deals: totalDeals,
        crm_won: wonDeals,
        sx_active: sx.kpis.active,
        sx_overdue: sx.kpis.overdue,
        vc_active: vc.kpis.active,
        vc_overdue: vc.kpis.overdue,
        open_tasks: openTasks || 0,
        overdue_tasks: overdueTasks || 0,
      },
      pipelines: {
        crm_lead: buildPipelineFromStages(leadStages, leadCounts),
        crm_deal: buildPipelineFromStages(dealStages, dealCounts),
        sx: sx.pipeline,
        vc: vc.pipeline,
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
    const companyId = resolveEffectiveCompanyId(req, req.query.company_id);
    const {
      q: searchQ, date_from: dateFrom, date_to: dateTo,
      phase, crm_stage_id: crmStageId, assignee_id: assigneeId,
      has_project: hasProject,
    } = req.query;
    const { page, pageSize, from, to } = parsePagination(req);

    let q = supabase
      .from('crm_leads')
      .select(`
        id, code, title, type, budget, estimated_value, created_at, updated_at, deadline,
        project_id, company_id, assignee_id,
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost),
        customer:customers(id, full_name, phone),
        assignee:users!crm_leads_assignee_id_fkey(id, full_name, avatar),
        project:projects(
          id, code, name, status, deadline, estimated_value, production_value, deposit_amount,
          sx_kanban_column_id, vc_kanban_column_id, company_id,
          sx_stage:production_pipeline_stages!projects_sx_kanban_column_id_fkey(id, name, color),
          vc_stage:logistics_pipeline_stages!projects_vc_kanban_column_id_fkey(id, name, color)
        )
      `, { count: 'exact' })
      .eq('type', 'deal')
      .order('updated_at', { ascending: false });

    if (companyId) q = q.eq('company_id', companyId);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);
    if (crmStageId) q = q.eq('stage_id', crmStageId);
    if (assigneeId) q = q.eq('assignee_id', assigneeId);
    if (hasProject === '1') q = q.not('project_id', 'is', null);
    if (hasProject === '0') q = q.is('project_id', null);
    if (searchQ) {
      const s = String(searchQ).trim();
      q = q.or(`title.ilike.%${s}%,code.ilike.%${s}%`);
    }

    q = q.range(from, to);
    let { data, error, count } = await q;

    if (error && /production_pipeline_stages|logistics_pipeline_stages|sx_kanban|vc_kanban/.test(error.message || '')) {
      let q2 = supabase
        .from('crm_leads')
        .select(`
          id, code, title, type, budget, estimated_value, created_at, updated_at, deadline,
          project_id, company_id, assignee_id,
          stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost),
          customer:customers(id, full_name, phone),
          assignee:users!crm_leads_assignee_id_fkey(id, full_name, avatar),
          project:projects(id, code, name, status, deadline, estimated_value, sx_kanban_column_id, vc_kanban_column_id)
        `, { count: 'exact' })
        .eq('type', 'deal')
        .order('updated_at', { ascending: false });
      if (companyId) q2 = q2.eq('company_id', companyId);
      if (dateFrom) q2 = q2.gte('created_at', dateFrom);
      if (dateTo) q2 = q2.lte('created_at', dateTo);
      if (crmStageId) q2 = q2.eq('stage_id', crmStageId);
      if (assigneeId) q2 = q2.eq('assignee_id', assigneeId);
      if (hasProject === '1') q2 = q2.not('project_id', 'is', null);
      if (hasProject === '0') q2 = q2.is('project_id', null);
      if (searchQ) {
        const s = String(searchQ).trim();
        q2 = q2.or(`title.ilike.%${s}%,code.ilike.%${s}%`);
      }
      q2 = q2.range(from, to);
      ({ data, error, count } = await q2);
    }
    if (error) throw error;

    let rows = data || [];
    if (phase === 'crm') {
      rows = rows.filter((d) => !d.project_id || !d.stage?.is_won);
    } else if (phase === 'sx') {
      rows = rows.filter((d) => d.project_id);
    } else if (phase === 'vc') {
      rows = rows.filter((d) => d.project?.vc_kanban_column_id);
    }

    const leadIds = rows.map((d) => d.id).filter(Boolean);
    const projectIds = rows.map((d) => d.project_id).filter(Boolean);

    const taskCounts = {};
    if (leadIds.length) {
      const { data: crmTasks } = await supabase
        .from('crm_tasks')
        .select('lead_id, status')
        .in('lead_id', leadIds);
      for (const t of crmTasks || []) {
        const lid = String(t.lead_id);
        if (!taskCounts[lid]) taskCounts[lid] = { crm_total: 0, crm_done: 0 };
        taskCounts[lid].crm_total += 1;
        if (t.status === 'completed') taskCounts[lid].crm_done += 1;
      }
    }

    const docCounts = {};
    if (leadIds.length) {
      const { data: docs } = await supabase
        .from('crm_lead_documents')
        .select('lead_id')
        .in('lead_id', leadIds);
      for (const d of docs || []) {
        const lid = String(d.lead_id);
        docCounts[lid] = (docCounts[lid] || 0) + 1;
      }
    }

    const deals = rows.map((d) => ({
      ...d,
      task_stats: taskCounts[String(d.id)] || { crm_total: 0, crm_done: 0 },
      document_count: docCounts[String(d.id)] || 0,
      value: d.budget || d.estimated_value || d.project?.estimated_value || 0,
    }));

    res.json({
      deals,
      total: count ?? deals.length,
      page,
      page_size: pageSize,
      project_ids_loaded: projectIds.length,
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
    const companyId = resolveEffectiveCompanyId(req, req.query.company_id);

    let leadQ = supabase
      .from('crm_leads')
      .select(`
        *,
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, order_index),
        customer:customers(id, full_name, phone, email, address),
        assignee:users!crm_leads_assignee_id_fkey(id, full_name, avatar, phone),
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
    if (companyId && String(lead.company_id) !== String(companyId)) {
      return res.status(403).json({ error: 'Không có quyền xem deal này' });
    }

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
    const companyId = resolveEffectiveCompanyId(req, req.query.company_id);
    const bundle = await buildProjectDealBundle(req.params.projectId, { user: req.user });
    if (!bundle) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (companyId && bundle.project?.company_id && String(bundle.project.company_id) !== String(companyId)) {
      return res.status(403).json({ error: 'Không có quyền xem dự án này' });
    }
    res.json(bundle);
  } catch (e) {
    console.error('[management/by-project]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng hợp dự án' });
  }
});

module.exports = r;
