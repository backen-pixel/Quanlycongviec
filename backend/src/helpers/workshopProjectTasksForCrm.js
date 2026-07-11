const { supabase } = require('../config/supabase');

function mapChecklistRows(rows) {
  return (rows || [])
    .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
    .map((c, i) => ({
      id: c.id,
      title: c.title || '',
      description: c.notes || '',
      notes: c.notes || '',
      done: !!c.is_completed,
      order_index: c.order_index ?? i,
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
    deadline: task.due_date || null,
    checklist: mapChecklistRows(task.checklists),
    file_count: 0,
    note_count: 0,
    attachment_count: 0,
    _workshop_project_task: true,
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
      id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, metadata, created_at,
      assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
      stage:workflow_stages(id, name, slug),
      checklists:task_checklists(id, title, is_completed, order_index, notes)
    `)
    .eq('project_id', projectId)
    .order('order_index')
    .order('created_at');

  if (error && String(error.message || '').includes('task_checklists')) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, metadata, created_at,
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

module.exports = {
  loadWorkshopLogisticsTasksForCrmLead,
  mapWorkshopProjectTaskToCrmTask,
};
