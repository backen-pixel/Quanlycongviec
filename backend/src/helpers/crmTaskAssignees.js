/**
 * Multi-assignee cho crm_tasks — junction crm_task_assignees.
 */
const { supabase } = require('../config/supabase');

async function attachAssigneesToCrmTasks(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const ids = list.map((x) => x.id);
  const { data: rows, error } = await supabase
    .from('crm_task_assignees')
    .select('task_id, user_id, user:users(id, full_name, email, avatar)')
    .in('task_id', ids);
  if (error && /crm_task_assignees/.test(error.message || '')) {
    list.forEach((t) => {
      t.assignees = t.assignee ? [t.assignee] : [];
    });
    return list;
  }
  const byId = new Map();
  (rows || []).forEach((r) => {
    if (!byId.has(r.task_id)) byId.set(r.task_id, []);
    if (r.user) byId.get(r.task_id).push(r.user);
  });
  list.forEach((t) => {
    t.assignees = byId.get(t.id) || (t.assignee ? [t.assignee] : []);
  });
  return list;
}

async function replaceCrmTaskAssignees(taskId, userIds) {
  const uniq = [...new Set((userIds || []).filter(Boolean).map(String))];
  await supabase.from('crm_task_assignees').delete().eq('task_id', taskId);
  if (!uniq.length) return uniq;
  const { error } = await supabase.from('crm_task_assignees').insert(
    uniq.map((uid) => ({ task_id: taskId, user_id: uid })),
  );
  if (error && !/crm_task_assignees/.test(error.message || '')) throw error;
  return uniq;
}

module.exports = {
  attachAssigneesToCrmTasks,
  replaceCrmTaskAssignees,
};
