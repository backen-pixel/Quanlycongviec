/** Completion is independent of Kanban movement and its optional advance gate. */
const CLOSED = new Set(['done', 'completed', 'cancelled', 'canceled']);

function isRequiredOpen(task) {
  return task?.blocks_stage_advance === true
    && !CLOSED.has(String(task.status || '').toLowerCase());
}

function completionState(raw, blockers) {
  return raw === 'xong' && blockers.length ? 'dang' : raw;
}

async function readAll(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error; // Never accept completion on an unreadable task source.
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}

async function loadRequiredStageTasks(db, projectId) {
  const projectIds = Array.isArray(projectId) ? projectId : [projectId];
  if (!projectIds.length) return [];
  if (projectIds.length > 80) {
    const rows = [];
    for (let i = 0; i < projectIds.length; i += 80) {
      rows.push(...await loadRequiredStageTasks(db, projectIds.slice(i, i + 80)));
    }
    return rows;
  }
  const leads = await readAll(() => db.from('crm_leads').select('id,project_id')
    .in('project_id', projectIds).order('id'));
  const projectTasks = await readAll(() => db.from('tasks')
    .select('id,project_id,title,status,production_stage_id,blocks_stage_advance,metadata')
    .in('project_id', projectIds).eq('blocks_stage_advance', true).order('id'));
  const crmTasks = [];
  for (let i = 0; i < leads.length; i += 80) {
    const ids = leads.slice(i, i + 80).map((lead) => lead.id);
    crmTasks.push(...await readAll(() => db.from('crm_tasks')
      .select('id,lead_id,title,status,stage_slug,production_pipeline_stage_id,blocks_stage_advance')
      .in('lead_id', ids).eq('blocks_stage_advance', true).order('id')));
  }
  const projectByLead = new Map(leads.map((lead) => [String(lead.id), lead.project_id]));
  return [
    ...projectTasks.map((task) => ({ ...task, source: 'project_task', stage_id: task.production_stage_id })),
    ...crmTasks.map((task) => ({ ...task, project_id: projectByLead.get(String(task.lead_id)), source: 'crm_task', stage_id: task.production_pipeline_stage_id })),
  ];
}

function blockersForStage(tasks, stage, projectId = null) {
  // Legacy tasks without a column ID use the same slug as task generation.
  const { sxStageSlugFromPipelineRow } = require('./sxPipelineStageSlug');
  const slug = sxStageSlugFromPipelineRow(stage);
  const prefixSlug = `sx_pl_${String(stage.id).slice(0, 8)}`;
  return tasks.filter((task) => (!projectId || String(task.project_id) === String(projectId))
    && isRequiredOpen(task) && (task.stage_id
    ? String(task.stage_id) === String(stage.id)
    : task.source === 'crm_task' && [slug, prefixSlug].includes(task.stage_slug)));
}

function completionConflict(blockers) {
  return {
    code: 'SX_STAGE_REQUIRED_TASKS_INCOMPLETE',
    error: `Chưa thể xác nhận công đoạn Xong: còn ${blockers.length} nhiệm vụ bắt buộc chưa hoàn thành.\n`
      + blockers.map((task) => `• ${task.title}`).join('\n'),
    remaining_tasks: blockers.map(({ id, title, source }) => ({ id, title, source })),
  };
}

module.exports = { isRequiredOpen, completionState, readAll, loadRequiredStageTasks, blockersForStage, completionConflict };
