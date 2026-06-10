/**
 * Đồng bộ crm_tasks ↔ crm_assignments (trang /crm/assignments).
 */
const { supabase } = require('../config/supabase');
const { replaceCrmTaskAssignees } = require('./crmTaskAssignees');

const SHARED_COLUMN_DEFAULTS = [
  { name: 'Chưa làm', color: '#94A3B8', position: 0, is_done_column: false },
  { name: 'Đang làm', color: '#3B82F6', position: 1, is_done_column: false },
  { name: 'Hoàn thành', color: '#10B981', position: 2, is_done_column: true },
];

const ASSIGNMENT_SELECT = `
  id, company_id, column_id, lead_id, crm_task_id, assignment_module, title, description,
  assignee_id, created_by_id, priority, status, deadline,
  position, created_at, updated_at, completed_at
`;

async function ensureSharedAssignmentColumns(userId) {
  const { count, error: countErr } = await supabase
    .from('crm_assignment_columns')
    .select('id', { count: 'exact', head: true })
    .is('company_id', null);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;
  const rows = SHARED_COLUMN_DEFAULTS.map((d) => ({
    ...d,
    company_id: null,
    created_by_id: userId || null,
  }));
  const { error } = await supabase.from('crm_assignment_columns').insert(rows);
  if (error) throw error;
}

async function loadSharedColumns() {
  const { data, error } = await supabase
    .from('crm_assignment_columns')
    .select('id, position, is_done_column')
    .is('company_id', null)
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

function columnIdForTaskStatus(cols, status) {
  if (!cols.length) return null;
  if (status === 'completed') {
    return cols.find((c) => c.is_done_column)?.id ?? cols[cols.length - 1].id;
  }
  if (status === 'in_progress') {
    return cols.find((c) => !c.is_done_column && c.position >= 1)?.id ?? cols[0].id;
  }
  return cols.find((c) => !c.is_done_column)?.id ?? cols[0].id;
}

async function replaceAssignmentAssignees(assignmentId, userIds) {
  await supabase.from('crm_assignment_assignees').delete().eq('assignment_id', assignmentId);
  const uniq = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!uniq.length) return uniq;
  const { error } = await supabase.from('crm_assignment_assignees').insert(
    uniq.map((uid) => ({ assignment_id: assignmentId, user_id: uid })),
  );
  if (error && !/crm_assignment_assignees/.test(error.message || '')) throw error;
  return uniq;
}

/**
 * Tạo/cập nhật crm_assignments khi gán NV cho crm_tasks.
 */
function resolveAssignmentModuleForCrmTask(task, explicitModule) {
  if (explicitModule === 'production' || explicitModule === 'crm') return explicitModule;
  const slug = String(task?.stage_slug || '');
  if (slug.startsWith('sx_')) return 'production';
  return 'crm';
}

async function syncAssignmentFromCrmTask(req, task, assigneeIds, opts = {}) {
  if (!task?.id) return { assignmentId: null };
  const ids = [...new Set((assigneeIds || []).filter(Boolean).map(String))];
  const assignmentModule = resolveAssignmentModuleForCrmTask(task, opts.assignmentModule);

  let existing = null;
  const { data: byTask, error: findErr } = await supabase
    .from('crm_assignments')
    .select('id')
    .eq('crm_task_id', task.id)
    .maybeSingle();
  if (findErr && /crm_task_id/.test(findErr.message || '')) {
    return { assignmentId: null, skipped: true };
  }
  if (byTask) existing = byTask;

  if (!ids.length) {
    if (existing?.id) {
      await supabase.from('crm_assignments').delete().eq('id', existing.id);
    }
    return { assignmentId: null };
  }

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, company_id')
    .eq('id', task.lead_id)
    .maybeSingle();

  await ensureSharedAssignmentColumns(req.user?.userId);
  const cols = await loadSharedColumns();
  const status = task.status || 'pending';
  const columnId = columnIdForTaskStatus(cols, status);

  const row = {
    title: task.title,
    description: task.description || null,
    assignee_id: ids[0],
    priority: task.priority || 'medium',
    status,
    deadline: task.deadline || null,
    column_id: columnId,
    company_id: lead?.company_id || null,
    lead_id: task.lead_id,
    crm_task_id: task.id,
    assignment_module: assignmentModule,
    completion_requires_file_or_note: !!task.completion_requires_file_or_note
      || (Array.isArray(task.required_evidence_file_types) && task.required_evidence_file_types.length > 0),
    required_evidence_file_types: Array.isArray(task.required_evidence_file_types) ? task.required_evidence_file_types : [],
    requires_quick_verdict: !!task.requires_quick_verdict,
    quick_verdict: task.quick_verdict || null,
    quick_verdict_reason: task.quick_verdict_reason || null,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed') {
    row.completed_at = task.completed_at || new Date().toISOString();
  } else {
    row.completed_at = null;
  }

  let assignmentId = existing?.id || null;
  if (assignmentId) {
    let { error } = await supabase.from('crm_assignments').update(row).eq('id', assignmentId);
    if (error && /assignment_module/.test(error.message || '')) {
      const { assignment_module: _m, ...legacy } = row;
      ({ error } = await supabase.from('crm_assignments').update(legacy).eq('id', assignmentId));
    }
    if (error && /crm_task_id/.test(error.message || '')) {
      const { crm_task_id: _t, assignment_module: _m, ...legacy } = row;
      ({ error } = await supabase.from('crm_assignments').update(legacy).eq('id', assignmentId));
    }
    if (error) throw error;
  } else {
    let insertRow = {
      ...row,
      created_by_id: req.user?.userId || null,
      position: 0,
    };
    let { data: created, error } = await supabase
      .from('crm_assignments')
      .insert(insertRow)
      .select(ASSIGNMENT_SELECT)
      .single();
    if (error && /assignment_module/.test(error.message || '')) {
      const { assignment_module: _m, ...legacy } = insertRow;
      ({ data: created, error } = await supabase.from('crm_assignments').insert(legacy).select(ASSIGNMENT_SELECT).single());
    }
    if (error && /crm_task_id/.test(error.message || '')) {
      const { crm_task_id: _t, assignment_module: _m, ...legacy } = insertRow;
      ({ data: created, error } = await supabase.from('crm_assignments').insert(legacy).select(ASSIGNMENT_SELECT).single());
    }
    if (error) throw error;
    assignmentId = created?.id || null;
  }

  if (assignmentId) {
    await replaceAssignmentAssignees(assignmentId, ids);
  }

  return { assignmentId };
}

/**
 * Đồng bộ ngược: thay đổi trên /crm/assignments → crm_tasks.
 */
async function syncCrmTaskFromAssignment(assignment) {
  const taskId = assignment?.crm_task_id;
  if (!taskId) return;

  const update = {
    updated_at: new Date().toISOString(),
  };
  if (assignment.title != null) update.title = assignment.title;
  if (assignment.description !== undefined) update.description = assignment.description;
  if (assignment.priority != null) update.priority = assignment.priority;
  if (assignment.status != null) update.status = assignment.status;
  if (assignment.deadline !== undefined) update.deadline = assignment.deadline;
  if (assignment.status === 'completed') {
    update.completed_at = assignment.completed_at || new Date().toISOString();
  } else if (assignment.status) {
    update.completed_at = null;
  }
  if (assignment.assignee_id !== undefined) update.assignee_id = assignment.assignee_id;

  const { error } = await supabase.from('crm_tasks').update(update).eq('id', taskId);
  if (error) throw error;

  const { data: asnRows } = await supabase
    .from('crm_assignment_assignees')
    .select('user_id')
    .eq('assignment_id', assignment.id);
  const ids = (asnRows || []).map((r) => r.user_id);
  if (ids.length) {
    await replaceCrmTaskAssignees(taskId, ids);
    if (!update.assignee_id) {
      await supabase.from('crm_tasks').update({ assignee_id: ids[0] }).eq('id', taskId);
    }
  }
}

async function attachCrmTaskMetaToAssignments(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const taskIds = list.map((a) => a.crm_task_id).filter(Boolean);
  if (!taskIds.length) return list;
  const { data, error } = await supabase
    .from('crm_tasks')
    .select('id, notes, status, lead_id, title')
    .in('id', taskIds);
  if (error) return list;
  const byId = new Map((data || []).map((t) => [String(t.id), t]));
  list.forEach((a) => {
    if (a.crm_task_id) a.crm_task = byId.get(String(a.crm_task_id)) || null;
  });
  return list;
}

async function applyAssignmentStatusColumn(update, status) {
  if (!status) return update;
  const cols = await loadSharedColumns();
  if (cols.length) update.column_id = columnIdForTaskStatus(cols, status);
  if (status === 'completed') {
    update.completed_at = update.completed_at || new Date().toISOString();
  } else if (status) {
    update.completed_at = null;
  }
  return update;
}

async function attachAssignmentIdsToCrmTasks(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const taskIds = list.map((t) => t.id);
  const { data, error } = await supabase
    .from('crm_assignments')
    .select('id, crm_task_id')
    .in('crm_task_id', taskIds);
  if (error && /crm_task_id/.test(error.message || '')) return list;
  const byTask = new Map((data || []).map((r) => [String(r.crm_task_id), r.id]));
  list.forEach((t) => {
    const aid = byTask.get(String(t.id));
    if (aid) t.crm_assignment_id = aid;
  });
  return list;
}

module.exports = {
  syncAssignmentFromCrmTask,
  syncCrmTaskFromAssignment,
  attachAssignmentIdsToCrmTasks,
  attachCrmTaskMetaToAssignments,
  applyAssignmentStatusColumn,
  columnIdForTaskStatus,
};
