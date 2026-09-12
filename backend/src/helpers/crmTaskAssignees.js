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
  // DELETE + INSERT KHÔNG nguyên tử: hai luồng cùng lưu một task sẽ đâm nhau ở
  // crm_task_assignees_pkey (task_id, user_id) — đo được 7 lần trong 1 giờ.
  // upsert-ignore giữ nguyên hàng đã có thay vì ném 23505 rồi bị nuốt.
  const { error } = await supabase.from('crm_task_assignees').upsert(
    uniq.map((uid) => ({ task_id: taskId, user_id: uid })),
    { onConflict: 'task_id,user_id', ignoreDuplicates: true },
  );
  if (error) {
    if (!/crm_task_assignees/.test(error.message || '')) throw error;
    console.warn('[crm-task-assignees]', error.code || '', error.message);
  }
  return uniq;
}

module.exports = {
  attachAssigneesToCrmTasks,
  replaceCrmTaskAssignees,
};
