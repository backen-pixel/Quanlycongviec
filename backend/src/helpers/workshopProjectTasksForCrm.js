const { supabase } = require('../config/supabase');

function mapChecklistRows(rows) {
  return (rows || [])
    .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
    .map((c, i) => ({
      id: c.id,
      title: c.title || '',
      description: '',
      notes: c.notes || '',
      done: !!c.is_completed,
      order_index: c.order_index ?? i,
      attachments: Array.isArray(c.attachments) ? c.attachments : [],
    }));
}

function mapWorkshopProjectTaskToCrmTask(task, leadId, projectMeta = {}) {
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const wsSlug = String(meta.guessed_stage_slug || task.stage?.slug || 'delivery');
  const perTaskColId = meta.logistics_pipeline_stage_id || null;
  const vcColId = perTaskColId || null;
  const statusRaw = String(task.status || 'todo');
  const status = statusRaw === 'done' ? 'completed' : statusRaw;

  return {
    id: task.id,
    lead_id: leadId,
    title: task.title,
    description: task.description || null,
    notes: null,
    status,
    priority: task.priority || 'medium',
    order_index: Number(task.order_index) || 0,
    assignee_id: task.assignee_id || null,
    assignee: task.assignee || null,
    stage_slug: vcColId ? `vc_pl_${String(vcColId).slice(0, 8)}` : `vc_ws_${wsSlug}`,
    logistics_pipeline_stage_id: vcColId,
    production_pipeline_stage_id: null,
    pipeline_stage_id: null,
    blocks_stage_advance: !!task.blocks_stage_advance,
    file_note_recorded: !!task.file_note_recorded,
    deadline: task.due_date || null,
    checklist: mapChecklistRows(task.checklists),
    file_count: 0,
    note_count: 0,
    attachment_count: 0,
    _workshop_project_task: true,
    source: 'workshop',
    metadata: meta,
  };
}

/**
 * Nhiệm vụ bảng `tasks` (workshop_area=logistics) → shape crm_tasks cho CRMTasksTab (tab VC/LĐ).
 */
async function loadWorkshopLogisticsTasksForCrmLead(leadId, projectId) {
  if (!leadId || !projectId) return [];

  const { data: project } = await supabase
    .from('projects')
    .select('id, vc_kanban_column_id, logistics_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project?.id) return [];

  let { data: rows, error } = await supabase
    .from('tasks')
    .select(`
      id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
      assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
      stage:workflow_stages(id, name, slug),
      checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)
    `)
    .eq('project_id', projectId)
    .order('order_index')
    .order('created_at');

  if (error && /file_note_recorded/i.test(String(error.message || ''))) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug),
        checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)
      `)
      .eq('project_id', projectId)
      .order('order_index')
      .order('created_at'));
  }

  if (error && /task_checklists.*attachments|column.*attachments/i.test(String(error.message || ''))) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug),
        checklists:task_checklists(id, title, is_completed, order_index, notes)
      `)
      .eq('project_id', projectId)
      .order('order_index')
      .order('created_at'));
  }

  if (error && String(error.message || '').includes('task_checklists')) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug)
      `)
      .eq('project_id', projectId)
      .order('order_index')
      .order('created_at'));
  }
  if (error) {
    console.warn('[workshopProjectTasksForCrm] tasks:', error.message);
    return [];
  }

  const logistics = (rows || []).filter((t) => {
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    return meta.workshop_area === 'logistics';
  });

  return logistics.map((t) => mapWorkshopProjectTaskToCrmTask(t, leadId, project));
}

/**
 * Nhiệm vụ workshop logistics cho GET /crm/tasks/overview (inbox VC).
 * Gắn lead từ crm_leads.project_id; lọc theo công ty / assignee giống overview.
 */
async function loadWorkshopLogisticsTasksForOverview(opts = {}) {
  const {
    companyId = null,
    assigneeId = null,
    status = null,
    userId = null,
    companyWide = false,
  } = opts;

  // Dự án đã vào module VC: có logistics_company_id hoặc vc_kanban_column_id
  // (khớp listWorkshopPickerProjectIds logistics — không lấy deal CRM thuần).
  let projQ = supabase
    .from('projects')
    .select('id, code, name, company_id, logistics_company_id, vc_kanban_column_id')
    .or('logistics_company_id.not.is.null,vc_kanban_column_id.not.is.null')
    .is('vc_deleted_at', null)
    .limit(800);
  if (companyId) {
    projQ = projQ.or(`logistics_company_id.eq.${companyId},company_id.eq.${companyId}`);
  }
  let { data: projects, error: projErr } = await projQ;
  if (projErr && /vc_deleted_at/i.test(String(projErr.message || ''))) {
    let q2 = supabase
      .from('projects')
      .select('id, code, name, company_id, logistics_company_id, vc_kanban_column_id')
      .or('logistics_company_id.not.is.null,vc_kanban_column_id.not.is.null')
      .limit(800);
    if (companyId) q2 = q2.or(`logistics_company_id.eq.${companyId},company_id.eq.${companyId}`);
    ({ data: projects, error: projErr } = await q2);
  }
  if (projErr && /vc_kanban_column_id/i.test(String(projErr.message || ''))) {
    let q3 = supabase
      .from('projects')
      .select('id, code, name, company_id, logistics_company_id')
      .not('logistics_company_id', 'is', null)
      .limit(800);
    if (companyId) q3 = q3.or(`logistics_company_id.eq.${companyId},company_id.eq.${companyId}`);
    ({ data: projects, error: projErr } = await q3);
  }
  if (projErr) {
    console.warn('[workshopOverview] projects:', projErr.message);
    return [];
  }
  const projectList = projects || [];
  if (!projectList.length) return [];
  const projectIds = projectList.map((p) => p.id).filter(Boolean);
  const projectById = new Map(projectList.map((p) => [String(p.id), p]));

  // Deal CRM gắn project
  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, title, code, type, project_id, customer:customers(id, full_name)')
    .in('project_id', projectIds.slice(0, 400));
  if (leadErr) {
    console.warn('[workshopOverview] leads:', leadErr.message);
    return [];
  }
  const leadByProject = new Map();
  for (const L of leads || []) {
    const pid = L.project_id ? String(L.project_id) : '';
    if (!pid || leadByProject.has(pid)) continue;
    leadByProject.set(pid, L);
  }

  const TASK_SELECT = `
    id, title, description, status, priority, due_date, order_index, assignee_id, project_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
    assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
    stage:workflow_stages(id, name, slug)
  `;
  let taskQ = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .in('project_id', projectIds.slice(0, 400))
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(2000);
  if (assigneeId) taskQ = taskQ.eq('assignee_id', assigneeId);
  else if (!companyWide && userId) taskQ = taskQ.eq('assignee_id', userId);

  let { data: taskRows, error: taskErr } = await taskQ;
  if (taskErr && /file_note_recorded/i.test(String(taskErr.message || ''))) {
    let q2 = supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, project_id, blocks_stage_advance, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug)
      `)
      .in('project_id', projectIds.slice(0, 400))
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(2000);
    if (assigneeId) q2 = q2.eq('assignee_id', assigneeId);
    else if (!companyWide && userId) q2 = q2.eq('assignee_id', userId);
    ({ data: taskRows, error: taskErr } = await q2);
  }
  if (taskErr) {
    console.warn('[workshopOverview] tasks:', taskErr.message);
    return [];
  }

  const out = [];
  for (const t of taskRows || []) {
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    if (meta.workshop_area !== 'logistics') continue;
    if (status) {
      const want = String(status).toLowerCase();
      const raw = String(t.status || '').toLowerCase();
      const mapped = raw === 'done' ? 'completed' : raw === 'todo' ? 'pending' : raw;
      if (mapped !== want && raw !== want) continue;
    }
    const pid = t.project_id ? String(t.project_id) : '';
    const lead = leadByProject.get(pid);
    if (!lead?.id) continue;
    const mapped = mapWorkshopProjectTaskToCrmTask(t, lead.id, projectById.get(pid) || {});
    mapped.lead = {
      id: lead.id,
      title: lead.title,
      code: lead.code,
      type: lead.type,
      project_id: lead.project_id,
      customer: lead.customer || null,
    };
    mapped.lead_id = lead.id;
    out.push(mapped);
  }
  return out;
}

module.exports = {
  loadWorkshopLogisticsTasksForCrmLead,
  loadWorkshopLogisticsTasksForOverview,
  mapWorkshopProjectTaskToCrmTask,
};
