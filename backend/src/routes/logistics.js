/**
 * Module Vận chuyển & Lắp đặt (VC)
 * API prefix: /api/logistics
 * Quản lý dự án ở giai đoạn giao hàng / lắp đặt / bảo hành
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const { syncCrmLeadFromLogisticsStage, syncVcPipelineStageToLead, emitCrmBadgeUpdateForProject } = require('../helpers/workshopKanban');

const r = Router();
r.use(auth);

const LOGISTICS_STAGE_SLUGS = ['delivery', 'installation', 'customer-care'];
const LOGISTICS_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];
const INTAKE_BUCKET = 'delivery_pending'; // projects bàn giao từ sản xuất sang VC

// Bảng cấu hình Kanban cho module VC
const VC_PIPELINE_TABLE = 'logistics_pipeline_stages';

function calcTaskProgress(tasks) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100);
}

async function getLogisticsStageMap() {
  const { data: stages = [] } = await supabase
    .from('workflow_stages')
    .select('id, slug, name, color, icon')
    .in('slug', LOGISTICS_STAGE_SLUGS)
    .order('order_index');
  const bySlug = {};
  stages.forEach((s) => { bySlug[s.slug] = s; });
  return { stages, bySlug, ids: stages.map((s) => s.id).filter(Boolean) };
}

function buildLogisticsScopeFilter(stageIds) {
  const parts = [];
  if (stageIds.length) parts.push(`current_stage_id.in.(${stageIds.join(',')})`);
  parts.push(`status.in.(${LOGISTICS_STATUSES.join(',')})`);
  return parts.join(',');
}

async function loadLogisticsPipelineRows(includeInactive = false) {
  let q = supabase
    .from(VC_PIPELINE_TABLE)
    .select(`id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type,
      crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index),
      workflow_stage:workflow_stages(id, slug, name, color, icon)`)
    .order('order_index');
  if (!includeInactive) q = q.eq('is_active', true);
  let { data, error } = await q;
  // Graceful: crm_target_stage_id column may not exist yet
  if (error && error.message?.includes('crm_target_stage_id')) {
    let q2 = supabase
      .from(VC_PIPELINE_TABLE)
      .select('id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)')
      .order('order_index');
    if (!includeInactive) q2 = q2.eq('is_active', true);
    ({ data, error } = await q2);
  }
  if (error) {
    console.warn('[logistics] logistics_pipeline_stages not ready:', error.message);
    return null;
  }
  return data || [];
}

function defaultLogisticsStages() {
  return [
    { id: '__vc_intake', name: 'Chờ vận chuyển', slug: 'delivery_pending', icon: '📦', color: '#f97316', bucket_slug: INTAKE_BUCKET, workflow_stage_id: null, order_index: 1 },
    { id: '__vc_ship', name: 'Đang vận chuyển', slug: 'delivery', icon: '🚚', color: '#ea580c', bucket_slug: null, workflow_stage_id: null, order_index: 2 },
    { id: '__vc_install', name: 'Đang lắp đặt', slug: 'installation', icon: '🔧', color: '#d97706', bucket_slug: null, workflow_stage_id: null, order_index: 3 },
    { id: '__vc_warranty', name: 'Bảo hành', slug: 'customer-care', icon: '🤝', color: '#0f766e', bucket_slug: null, workflow_stage_id: null, order_index: 4 },
    { id: '__vc_done', name: 'Hoàn thành', slug: 'completed', icon: '✅', color: '#16a34a', bucket_slug: null, workflow_stage_id: null, order_index: 5 },
  ];
}

async function getResolvedLogisticsStages() {
  const rows = await loadLogisticsPipelineRows();
  if (rows && rows.length > 0) return { stages: rows };
  const { stages: wfStages, bySlug } = await getLogisticsStageMap();
  const defaults = defaultLogisticsStages();
  const merged = defaults.map((d) => {
    const wf = bySlug[d.slug];
    return { ...d, workflow_stage_id: wf?.id || d.workflow_stage_id, workflow_stage: wf || null };
  });
  return { stages: merged };
}

function enrichProjectsForLogistics(projects, sortedKanban) {
  const intakeCol = sortedKanban.find((c) => c.bucket_slug === INTAKE_BUCKET);
  const firstCol = sortedKanban[0] || null;
  const colIdSet = new Set(sortedKanban.map((c) => String(c.id)));

  return projects.map((project) => {
    const stageSlug = project.current_stage?.slug;
    const status = project.status;
    let matchedCol = null;

    // 1. Ưu tiên: vc_kanban_column_id đã lưu trong DB (từ lần kéo thả trước)
    if (project.vc_kanban_column_id && colIdSet.has(String(project.vc_kanban_column_id))) {
      matchedCol = sortedKanban.find((c) => String(c.id) === String(project.vc_kanban_column_id)) || null;
    }

    // 2. Fallback: khớp theo workflow_stage slug hoặc status (bỏ qua cột intake)
    if (!matchedCol) {
      for (const col of sortedKanban) {
        if (col.bucket_slug === INTAKE_BUCKET) continue;
        const ws = col.workflow_stage;
        if (ws && ws.slug === stageSlug) { matchedCol = col; break; }
        if (col.slug === stageSlug) { matchedCol = col; break; }
        if (col.slug === status) { matchedCol = col; break; }
      }
    }

    // 3. Nếu vẫn không có → cột intake hoặc cột đầu tiên (vừa bàn giao từ SX)
    const inScope = LOGISTICS_STATUSES.includes(status) || LOGISTICS_STAGE_SLUGS.includes(stageSlug);
    if (!matchedCol && inScope) {
      matchedCol = intakeCol || firstCol;
    }

    return {
      ...project,
      vc_kanban_column_id: matchedCol?.id || project.vc_kanban_column_id || null,
      vc_intake: !matchedCol?.workflow_stage_id || matchedCol?.bucket_slug === INTAKE_BUCKET,
    };
  });
}

function buildLogisticsPipelineSummary(stages, projects) {
  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    bucket_slug: s.bucket_slug,
    count: projects.filter((p) => p.vc_kanban_column_id === s.id).length,
    value: projects
      .filter((p) => p.vc_kanban_column_id === s.id)
      .reduce((sum, p) => sum + (p.estimated_value || 0), 0),
  }));
}

// ─── Pipeline Stages CRUD ──────────────────────────────────────────────────

r.get('/pipeline-stages', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const rows = await loadLogisticsPipelineRows(includeInactive);
    if (rows === null) {
      const { stages } = await getResolvedLogisticsStages();
      return res.json(stages);
    }
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/pipeline-stages', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên cột' });
    if (b.bucket_slug && b.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    if (b.bucket_slug === INTAKE_BUCKET) {
      const { data: existing } = await supabase
        .from(VC_PIPELINE_TABLE).select('id').eq('bucket_slug', INTAKE_BUCKET).limit(1);
      if (existing?.length) return res.status(400).json({ error: 'Đã có cột chờ vận chuyển' });
    }
    const { data: last } = await supabase
      .from(VC_PIPELINE_TABLE).select('order_index').order('order_index', { ascending: false }).limit(1);
    const nextOrder = (last?.[0]?.order_index ?? 0) + 1;
    const isIntakeRow = b.bucket_slug === INTAKE_BUCKET;
    const insertPayload = {
      name: b.name.trim(),
      color: b.color || '#f97316',
      icon: b.icon || '📦',
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      workflow_stage_id: isIntakeRow ? null : (b.workflow_stage_id || null),
      bucket_slug: b.bucket_slug || null,
      crm_sync_type: isIntakeRow ? null : (b.crm_sync_type || null),
      crm_target_stage_id: isIntakeRow ? null : (b.crm_target_stage_id || null),
    };
    const vcSelect = 'id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)';
    let { data, error } = await supabase
      .from(VC_PIPELINE_TABLE)
      .insert(insertPayload)
      .select(`${vcSelect}, crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index)`)
      .single();
    // Graceful: crm_target_stage_id column may not exist yet
    if (error && error.message?.includes('crm_target_stage_id')) {
      const { crm_target_stage_id: _t, ...payloadWithout } = insertPayload;
      const r2 = await supabase.from(VC_PIPELINE_TABLE).insert(payloadWithout).select(vcSelect).single();
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const { data: existingRow } = await supabase
      .from(VC_PIPELINE_TABLE).select('bucket_slug').eq('id', req.params.id).single();
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_active', 'workflow_stage_id', 'bucket_slug',
      'crm_sync_type', 'crm_target_stage_id'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (existingRow?.bucket_slug === INTAKE_BUCKET) {
      update.workflow_stage_id = null;
      update.crm_sync_type = null;
      update.crm_target_stage_id = null;
    }
    if (update.bucket_slug && update.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    const vcSelect = 'id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, crm_sync_type, workflow_stage:workflow_stages(id, slug, name, color, icon)';
    let { data, error } = await supabase
      .from(VC_PIPELINE_TABLE)
      .update(update)
      .eq('id', req.params.id)
      .select(`${vcSelect}, crm_target_stage_id, crm_target_stage:crm_pipeline_stages(id, name, color, icon, order_index)`)
      .single();
    // Graceful: crm_target_stage_id column may not exist yet
    if (error && error.message?.includes('crm_target_stage_id')) {
      const { crm_target_stage_id: _t, ...updateWithout } = update;
      const r2 = await supabase.from(VC_PIPELINE_TABLE).update(updateWithout).eq('id', req.params.id).select(vcSelect).single();
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: row } = await supabase
      .from(VC_PIPELINE_TABLE).select('bucket_slug').eq('id', req.params.id).single();
    if (row?.bucket_slug === INTAKE_BUCKET) {
      return res.status(400).json({ error: 'Không xóa cột chờ vận chuyển — chỉ có thể ẩn' });
    }
    await supabase.from(VC_PIPELINE_TABLE).delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/pipeline-stages-reorder', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { stages } = req.body;
    for (const s of stages || []) {
      await supabase.from(VC_PIPELINE_TABLE).update({ order_index: s.order_index }).eq('id', s.id);
    }
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Dashboard ─────────────────────────────────────────────────────────────

r.get('/dashboard', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { division_id, company_id } = req.query;
    const { ids: stageIds } = await getLogisticsStageMap();
    const { stages: kanbanStages } = await getResolvedLogisticsStages();
    const sortedKanban = [...kanbanStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const orFilter = buildLogisticsScopeFilter(stageIds);
    if (!orFilter) return res.json({ kpis: {}, pipeline: [], projects: [] });

    let query = supabase
      .from('projects')
      .select(`id, code, name, estimated_value, status, deadline, created_at,
        current_stage_id, vc_kanban_column_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name),
        company:companies(id, name, short_name),
        tasks(id, status)`)
      .or(orFilter);

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);

    let { data: projectsRaw, error: dashErr } = await query.order('created_at', { ascending: false });
    // Graceful degradation nếu vc_kanban_column_id chưa tồn tại
    if (dashErr && dashErr.message?.includes('vc_kanban_column_id')) {
      const r2 = await supabase
        .from('projects')
        .select(`id, code, name, estimated_value, status, deadline, created_at,
          current_stage_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name),
          company:companies(id, name, short_name),
          tasks(id, status)`)
        .or(orFilter)
        .order('created_at', { ascending: false });
      projectsRaw = r2.data;
    }
    const projects = projectsRaw || [];

    const enhanced = enrichProjectsForLogistics(projects, sortedKanban).map((p) => ({
      ...p,
      progress: calcTaskProgress(p.tasks),
      task_total: p.tasks?.length || 0,
      done_tasks: p.tasks?.filter((t) => t.status === 'done').length || 0,
    }));

    const overdueCount = enhanced.filter((p) =>
      p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed'
    ).length;

    const kpis = {
      total_projects: enhanced.length,
      shipping: enhanced.filter((p) => p.status === 'shipping' || p.current_stage?.slug === 'delivery').length,
      installing: enhanced.filter((p) => p.status === 'installing' || p.current_stage?.slug === 'installation').length,
      warranty: enhanced.filter((p) => p.status === 'warranty' || p.current_stage?.slug === 'customer-care').length,
      completed: enhanced.filter((p) => p.status === 'completed').length,
      overdue: overdueCount,
      total_value: enhanced.reduce((s, p) => s + (p.estimated_value || 0), 0),
      avg_progress: enhanced.length
        ? Math.round(enhanced.reduce((s, p) => s + (p.progress || 0), 0) / enhanced.length)
        : 0,
    };

    res.json({ kpis, pipeline: buildLogisticsPipelineSummary(sortedKanban, enhanced), projects: enhanced });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Projects list ──────────────────────────────────────────────────────────

r.get('/projects', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { search, priority, page = 1, limit = 100, division_id, company_id } = req.query;
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const { ids: stageIds } = await getLogisticsStageMap();
    const { stages: kanbanStages } = await getResolvedLogisticsStages();
    const sortedKanban = [...kanbanStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const orFilter = buildLogisticsScopeFilter(stageIds);
    if (!orFilter) return res.json({ projects: [], total: 0 });

    let query = supabase
      .from('projects')
      .select(`id, code, name, estimated_value, priority, deadline, created_at, status, notes,
        current_stage_id, vc_kanban_column_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone),
        company:companies(id, name, short_name),
        logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
        production_person:users!projects_production_person_id_fkey(id, full_name),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        tasks(id, status)`, { count: 'exact' })
      .or(orFilter);

    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    if (priority) query = query.eq('priority', priority);
    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);

    let { data: projectsRaw, error } = await query
      .order('created_at', { ascending: false })
      .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);

    let projects = projectsRaw || [];

    // Fallback if logistics_person column / FK doesn't exist yet
    const isLogisticsPersonError = (err) =>
      err?.message?.includes('logistics_person_id') ||
      err?.message?.includes('logistics_person') ||
      err?.message?.includes('projects_logistics_person') ||
      (err?.message?.includes('relationship') && err?.message?.includes('users'));
    if (error && isLogisticsPersonError(error)) {
      // Thử lại không có logistics_person join
      const fb2 = await supabase
        .from('projects')
        .select(`id, code, name, estimated_value, priority, deadline, created_at, status,
          current_stage_id, vc_kanban_column_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone),
          company:companies(id, name, short_name),
          tasks(id, status)`, { count: 'exact' })
        .or(orFilter)
        .order('created_at', { ascending: false })
        .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);

      if (!fb2.error) {
        projects = fb2.data || [];
        error = null;
      } else {
        // Thử lại tiếp không có bất kỳ user join nào
        const fb3 = await supabase
          .from('projects')
          .select(`id, code, name, estimated_value, priority, deadline, created_at, status,
            current_stage_id,
            current_stage:workflow_stages(id, slug, name, color, icon),
            customer:customers(id, full_name, phone),
            tasks(id, status)`)
          .or(orFilter)
          .order('created_at', { ascending: false })
          .range((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit - 1);
        projects = fb3.data || [];
        error = fb3.error;
      }
    }

    if (error && projects.length === 0) throw error;

    const enhanced = enrichProjectsForLogistics(projects, sortedKanban).map((p) => ({
      ...p,
      progress: calcTaskProgress(p.tasks),
      task_total: p.tasks?.length || 0,
      done_tasks: p.tasks?.filter((t) => t.status === 'done').length || 0,
    }));

    res.json({ projects: enhanced, total: enhanced.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Project detail ─────────────────────────────────────────────────────────

r.get('/projects/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    let { data: project, error } = await supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, status, deadline, created_at, notes, priority,
        production_deadline, production_note, install_address, vc_kanban_column_id,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address),
        company:companies(id, name, short_name),
        logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
        installer_person:users!projects_installer_person_id_fkey(id, full_name, avatar),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        supervisor:users!projects_supervisor_id_fkey(id, full_name),
        assignee:users!projects_assigned_to_fkey(id, full_name),
        delivery_team:workshop_teams!projects_delivery_team_id_fkey(id, name, color, type),
        installation_team:workshop_teams!projects_installation_team_id_fkey(id, name, color, type),
        tasks(id, title, status, priority, due_date, stage_id, stage:workflow_stages(id, slug, name))
      `)
      .eq('id', id)
      .single();

    // Graceful degradation: nếu các cột mới chưa tồn tại (migration 79 chưa chạy)
    if (error && (error.message?.includes('installer_person_id') || error.message?.includes('workshop_teams') || error.message?.includes('delivery_team'))) {
      const fallback = await supabase
        .from('projects')
        .select(`
          id, code, name, estimated_value, status, deadline, created_at, notes, priority,
          production_deadline, production_note, install_address, vc_kanban_column_id,
          current_stage_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone, email, address),
          company:companies(id, name, short_name),
          logistics_person:users!projects_logistics_person_id_fkey(id, full_name, avatar),
          production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
          sales_person:users!projects_sales_person_id_fkey(id, full_name),
          supervisor:users!projects_supervisor_id_fkey(id, full_name),
          assignee:users!projects_assigned_to_fkey(id, full_name),
          tasks(id, title, status, priority, due_date, stage_id, stage:workflow_stages(id, slug, name))
        `)
        .eq('id', id)
        .single();
      if (!fallback.error) { project = fallback.data; error = null; }
    }

    if (error || !project) {
      return res.status(404).json({ error: 'Dự án không tồn tại' });
    }

    // Kiểm tra dự án có trong scope VC không
    const { ids: stageIds } = await getLogisticsStageMap();
    const inScope = LOGISTICS_STATUSES.includes(project.status)
      || stageIds.includes(String(project.current_stage_id));
    if (!inScope) {
      return res.status(403).json({ error: 'Dự án này chưa ở giai đoạn vận chuyển' });
    }

    // Tài liệu
    const { data: docs = [] } = await supabase
      .from('project_documents')
      .select('id, name, file_url, file_type, notes, created_at, shared_to_workshop')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    const sharedDocs = docs.filter((d) => d.shared_to_workshop);

    // CRM deals
    const { data: crmDeals = [] } = await supabase
      .from('crm_leads')
      .select('id, name, type, stage:crm_pipeline_stages(id, name, color, is_won)')
      .eq('project_id', id)
      .eq('type', 'deal');

    // Stage transitions
    const { data: transitions = [] } = await supabase
      .from('stage_transitions')
      .select('id, from_stage_id, to_stage_id, created_at, notes, transitioned_by, from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(id,name), to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(id,name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Comments
    const { data: comments = [] } = await supabase
      .from('project_comments')
      .select('id, content, created_at, user:users(id, full_name, avatar)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(30);

    // Incidents
    const { data: incidents = [] } = await supabase
      .from('project_incidents')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
      .catch(() => ({ data: [] }));

    const { stages: kStages } = await getResolvedLogisticsStages();
    const sortedK = [...kStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const [vcRow] = enrichProjectsForLogistics([project], sortedK);

    res.json({
      project: {
        ...project,
        vc_kanban_column_id: vcRow.vc_kanban_column_id,
        vc_intake: vcRow.vc_intake,
        taskProgress: calcTaskProgress(project.tasks),
        documents: docs,
        sharedDocuments: sharedDocs,
        crmDeals: crmDeals || [],
        stageTransitions: transitions || [],
        recentComments: comments || [],
        incidents: incidents || [],
        vcKanbanStages: sortedK.map((c) => ({
          id: c.id, name: c.name, color: c.color, icon: c.icon,
          bucket_slug: c.bucket_slug,
          workflow_stage_id: c.workflow_stage_id || c.workflow_stage?.id,
          slug: c.workflow_stage?.slug,
        })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Stage move ──────────────────────────────────────────────────────────────

r.patch('/projects/:id/stage', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    // stage_id = workflow_stages.id (tùy chọn), vc_stage_id = logistics_pipeline_stages.id (ưu tiên)
    const { stage_id, vc_stage_id, move_to_intake } = req.body;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name, status')
      .eq('id', id)
      .single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (move_to_intake === true || move_to_intake === 'true') {
      // Tìm cột intake/first để lưu vc_kanban_column_id
      const { stages: kStages } = await getResolvedLogisticsStages().catch(() => ({ stages: [] }));
      const intakeCol = kStages.find((c) => c.bucket_slug === INTAKE_BUCKET) || kStages[0] || null;
      const intakeColId = intakeCol?.id && !String(intakeCol.id).startsWith('__') ? intakeCol.id : null;

      const intakeUpdate = { current_stage_id: null };
      if (intakeColId) intakeUpdate.vc_kanban_column_id = intakeColId;
      await supabase.from('projects').update(intakeUpdate).eq('id', id)
        .catch(() => supabase.from('projects').update({ current_stage_id: null }).eq('id', id));

      try {
        await supabase.from('stage_transitions').insert({
          project_id: id, from_stage_id: project.current_stage_id, to_stage_id: null,
          notes: 'Kéo về cột chờ vận chuyển (Kanban VC)', transitioned_by: userId,
        });
      } catch (te) { console.warn('[logistics] stage_transitions intake:', te.message); }

      if (intakeColId) {
        await syncVcPipelineStageToLead(id, intakeColId).catch((ve) => console.warn('[logistics/intake] sync vc stage:', ve.message));
      }

      const { data: updated } = await supabase
        .from('projects').select('id, code, name, status, current_stage_id, vc_kanban_column_id, current_stage:workflow_stages(id, slug, name, color)').eq('id', id).single()
        .catch(() => supabase.from('projects').select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, slug, name, color)').eq('id', id).single());
      return res.json({ project: updated?.data || updated });
    }

    // Cần ít nhất một trong: stage_id (workflow_stages) hoặc vc_stage_id (logistics_pipeline_stages)
    if (!stage_id && !vc_stage_id) return res.status(400).json({ error: 'Cần stage_id hoặc vc_stage_id hoặc move_to_intake' });

    // Nếu chỉ có vc_stage_id, tìm workflow_stage_id tương ứng (nếu có)
    let resolvedStageId = stage_id || null;
    let vcPipeStageRow = null;
    if (vc_stage_id) {
      const { data: vcRow } = await supabase
        .from(VC_PIPELINE_TABLE)
        .select('id, name, crm_sync_type, crm_target_stage_id, workflow_stage_id')
        .eq('id', vc_stage_id)
        .maybeSingle();
      vcPipeStageRow = vcRow;
      if (vcRow?.workflow_stage_id && !resolvedStageId) {
        resolvedStageId = vcRow.workflow_stage_id;
      }
    }

    const targetStage = resolvedStageId
      ? (await supabase.from('workflow_stages').select('id, slug').eq('id', resolvedStageId).single()).data
      : null;

    const statusMap = {
      delivery: 'shipping',
      installation: 'installing',
      'customer-care': 'warranty',
    };

    const updatePayload = {};
    if (resolvedStageId) updatePayload.current_stage_id = resolvedStageId;
    if (vc_stage_id) updatePayload.vc_kanban_column_id = vc_stage_id;
    if (statusMap[targetStage?.slug]) updatePayload.status = statusMap[targetStage.slug];

    // Thử update với vc_kanban_column_id; nếu cột chưa tồn tại, fallback không có cột đó
    let { error: updateError } = await supabase.from('projects').update(updatePayload).eq('id', id);
    if (updateError && updateError.message?.includes('vc_kanban_column_id')) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.vc_kanban_column_id;
      ({ error: updateError } = await supabase.from('projects').update(fallbackPayload).eq('id', id));
    }
    if (updateError) throw updateError;

    await supabase.from('stage_transitions').insert({
      project_id: id,
      from_stage_id: project.current_stage_id,
      to_stage_id: resolvedStageId || null,
      transitioned_by: userId,
    }).catch((e) => console.warn('[logistics] stage_transitions:', e.message));

    const { data: updated } = await supabase
      .from('projects')
      .select('id, code, name, status, current_stage_id, vc_kanban_column_id, current_stage:workflow_stages(id, slug, name, color)')
      .eq('id', id).single()
      .catch(() => supabase.from('projects').select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, slug, name, color)').eq('id', id).single());

    // Kiểm tra cột VC có cờ crm_sync_type → đồng bộ CRM deal
    try {
      // Dùng vcPipeStageRow từ lookup trên nếu đã có
      let vcPipeStage = vcPipeStageRow;
      if (!vcPipeStage && resolvedStageId) {
        const { data } = await supabase
          .from(VC_PIPELINE_TABLE)
          .select('id, crm_sync_type, name')
          .eq('workflow_stage_id', resolvedStageId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        vcPipeStage = data;
      }

      // Luôn cập nhật vc_pipeline_stage_id cho deal CRM
      const syncId = vcPipeStage?.id || vc_stage_id || null;
      if (syncId) {
        await syncVcPipelineStageToLead(id, syncId);
        const io = req.app.get('io');
        emitCrmBadgeUpdateForProject(id, io).catch(() => {});
      }

      if (vcPipeStage?.crm_sync_type || vcPipeStage?.crm_target_stage_id) {
        // Truyền full row để syncCrmLeadFromLogisticsStage ưu tiên crm_target_stage_id
        await syncCrmLeadFromLogisticsStage(id, vcPipeStage);

        // Thông báo CRM/sale team biết deal đổi trạng thái
        try {
          const { data: saleUsers } = await supabase
            .from('users').select('id').in('role', ['sale', 'manager']).eq('is_active', true);
          const saleRecipients = (saleUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
          const labelMap = { delivery: 'Vận chuyển', installation: 'Lắp đặt', customer_care: 'Chăm sóc KH' };
          const syncLabel = vcPipeStage.crm_sync_type ? (labelMap[vcPipeStage.crm_sync_type] || vcPipeStage.crm_sync_type) : 'CRM';
          if (saleRecipients.length) {
            await notifyMultipleShared(req, saleRecipients, 'crm_stage_changed',
              `📋 CRM: Deal chuyển sang ${syncLabel}`,
              `Dự án ${updated.code || updated.name} đã đạt mốc "${vcPipeStage.name}" — deal CRM tự động cập nhật`,
              'project', id);
          }
        } catch (crmNotifErr) {
          console.warn('[logistics/stage] notify CRM sync:', crmNotifErr.message);
        }
      }
    } catch (crmSyncErr) {
      console.warn('[logistics/stage] crm_sync_type:', crmSyncErr.message);
    }

    // Thông báo nhân viên VC
    try {
      const { data: vcUsers } = await supabase
        .from('users').select('id').in('role', ['logistics', 'installer', 'manager']).eq('is_active', true);
      const recipientIds = (vcUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
      if (recipientIds.length) {
        const stageName = updated.current_stage?.name || '';
        await notifyMultipleShared(req, recipientIds, 'logistics_stage_changed',
          `🚚 VC: ${stageName}`,
          `Dự án ${updated.code || updated.name} vừa chuyển sang "${stageName}"`,
          'project', id);
      }
    } catch (notifErr) {
      console.warn('[logistics/stage] notify:', notifErr.message);
    }

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', updated);

    res.json({ project: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Incidents ──────────────────────────────────────────────────────────────

r.get('/projects/:id/incidents', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('project_incidents')
      .select('*')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) return res.json([]);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/projects/:id/incidents', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { title, description, severity = 'medium' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Thiếu tiêu đề sự cố' });
    const { data, error } = await supabase
      .from('project_incidents')
      .insert({ project_id: req.params.id, title: title.trim(), description, severity, reported_by: req.user.userId, status: 'open' })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.patch('/projects/:projectId/incidents/:incidentId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'severity', 'status'].forEach((f) => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    if (['resolved', 'closed'].includes(update.status)) {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = req.user.userId;
    }
    const { data, error } = await supabase
      .from('project_incidents').update(update).eq('id', req.params.incidentId).eq('project_id', req.params.projectId).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
