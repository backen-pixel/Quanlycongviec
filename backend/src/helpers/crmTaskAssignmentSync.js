/**
 * Đồng bộ crm_tasks ↔ crm_assignments (trang /crm/assignments).
 */
const { supabase } = require('../config/supabase');
const { replaceCrmTaskAssignees } = require('./crmTaskAssignees');

const SHARED_COLUMN_DEFAULTS = [
  { name: 'Chưa làm', color: '#94A3B8', position: 0, is_done_column: false, is_in_progress_column: false },
  { name: 'Đang làm', color: '#3B82F6', position: 1, is_done_column: false, is_in_progress_column: true },
  { name: 'Hoàn thành', color: '#10B981', position: 2, is_done_column: true, is_in_progress_column: false },
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
  let { data, error } = await supabase
    .from('crm_assignment_columns')
    .select('id, position, is_done_column, is_in_progress_column')
    .is('company_id', null)
    .order('position', { ascending: true });
  if (error && /is_in_progress_column/.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('crm_assignment_columns')
      .select('id, position, is_done_column')
      .is('company_id', null)
      .order('position', { ascending: true }));
  }
  if (error) throw error;
  return data || [];
}

function columnIdForTaskStatus(cols, status) {
  if (!cols.length) return null;
  if (status === 'completed') {
    return cols.find((c) => c.is_done_column)?.id ?? cols[cols.length - 1].id;
  }
  if (status === 'in_progress') {
    const flagged = cols.find((c) => c.is_in_progress_column);
    if (flagged) return flagged.id;
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
  const explicit = String(explicitModule || '').toLowerCase();
  if (explicit === 'production' || explicit === 'crm' || explicit === 'logistics') return explicit;
  const slug = String(task?.stage_slug || '');
  if (slug.startsWith('sx_')) return 'production';
  if (slug.startsWith('vc_')) return 'logistics';
  return 'crm';
}

function isTaskSourceSyncColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('task_source_type') || m.includes('employee_error_module');
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
  const columnId = opts.columnId || columnIdForTaskStatus(cols, status);
  const companyId = opts.companyId !== undefined
    ? (opts.companyId || null)
    : (lead?.company_id || null);

  const row = {
    title: task.title,
    description: task.description || null,
    assignee_id: ids[0],
    priority: task.priority || 'medium',
    status,
    deadline: task.deadline || null,
    column_id: columnId,
    company_id: companyId,
    executor_company_id: task.executor_company_id || null,
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
  if (opts.taskSourceType !== undefined || task.task_source_type !== undefined) {
    row.task_source_type = opts.taskSourceType !== undefined
      ? opts.taskSourceType
      : (task.task_source_type || null);
    row.employee_error_module = opts.employeeErrorModule !== undefined
      ? opts.employeeErrorModule
      : (task.employee_error_module || null);
  }
  if (opts.departmentId !== undefined || task.department_id !== undefined) {
    row.department_id = opts.departmentId !== undefined ? opts.departmentId : (task.department_id || null);
  }
  if (opts.phatSinhKind !== undefined || task.phat_sinh_kind !== undefined) {
    row.phat_sinh_kind = opts.phatSinhKind !== undefined ? opts.phatSinhKind : (task.phat_sinh_kind || null);
  }
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
    if (error && /executor_company_id/.test(error.message || '')) {
      const { executor_company_id: _e, ...legacy } = row;
      ({ error } = await supabase.from('crm_assignments').update(legacy).eq('id', assignmentId));
    }
    if (error && isTaskSourceSyncColumnError(error)) {
      const { task_source_type: _ts, employee_error_module: _em, ...legacy } = row;
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
    if (error && /executor_company_id/.test(error.message || '')) {
      const { executor_company_id: _e, ...legacy } = insertRow;
      ({ data: created, error } = await supabase.from('crm_assignments').insert(legacy).select(ASSIGNMENT_SELECT).single());
    }
    if (error && isTaskSourceSyncColumnError(error)) {
      const { task_source_type: _ts, employee_error_module: _em, ...legacy } = insertRow;
      ({ data: created, error } = await supabase.from('crm_assignments').insert(legacy).select(ASSIGNMENT_SELECT).single());
    }
    if (error) throw error;
    assignmentId = created?.id || null;
  }

  if (assignmentId) {
    await replaceAssignmentAssignees(assignmentId, ids);
    try {
      const { syncAllTaskArtifactsToAssignment } = require('./crmTaskAssignmentArtifactSync');
      await syncAllTaskArtifactsToAssignment(task.id, assignmentId, req);
    } catch (artErr) {
      console.warn('[sync] task→assignment artifacts:', artErr.message);
    }
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
  if (assignment.description !== undefined) {
    update.description = assignment.description;
    // Đồng bộ description → notes nhiệm vụ (nguồn Giao việc)
    update.notes = assignment.description;
  }
  if (assignment.priority != null) update.priority = assignment.priority;
  if (assignment.status != null) update.status = assignment.status;
  if (assignment.deadline !== undefined) update.deadline = assignment.deadline;
  if (assignment.status === 'completed') {
    update.completed_at = assignment.completed_at || new Date().toISOString();
  } else if (assignment.status) {
    update.completed_at = null;
  }
  if (assignment.assignee_id !== undefined) update.assignee_id = assignment.assignee_id;
  if (assignment.task_source_type !== undefined) {
    update.task_source_type = assignment.task_source_type || null;
    update.employee_error_module = assignment.task_source_type === 'employee_error'
      ? (assignment.employee_error_module || null)
      : null;
  } else if (assignment.employee_error_module !== undefined) {
    update.employee_error_module = assignment.employee_error_module || null;
  }

  let { error } = await supabase.from('crm_tasks').update(update).eq('id', taskId);
  if (error && isTaskSourceSyncColumnError(error)) {
    const { task_source_type: _ts, employee_error_module: _em, ...legacy } = update;
    ({ error } = await supabase.from('crm_tasks').update(legacy).eq('id', taskId));
  }
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
  const taskIds = [...new Set(list.map((a) => a.crm_task_id).filter(Boolean))];
  if (!taskIds.length) return list;
  const CHUNK = 200;
  const allRows = [];
  let useLegacy = false;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const slice = taskIds.slice(i, i + CHUNK);
    const selectFull = 'id, notes, status, lead_id, title, stage_slug, production_pipeline_stage_id, show_fill_form, form_config, form_data';
    const selectLegacy = 'id, notes, status, lead_id, title, stage_slug, production_pipeline_stage_id';
    let { data, error } = await supabase
      .from('crm_tasks')
      .select(useLegacy ? selectLegacy : selectFull)
      .in('id', slice);
    if (error && !useLegacy && /show_fill_form|form_config|form_data/i.test(error.message || '')) {
      useLegacy = true;
      ({ data, error } = await supabase.from('crm_tasks').select(selectLegacy).in('id', slice));
    }
    if (error) return list;
    allRows.push(...(data || []));
  }
  return attachCrmTaskMetaToAssignmentsWithRows(list, allRows, taskIds);
}

async function attachCrmTaskMetaToAssignmentsWithRows(list, taskRows, taskIds) {
  const byId = new Map((taskRows || []).map((t) => [String(t.id), t]));
  let countMap = {};
  try {
    const { loadCrmTaskAttachmentCountMap } = require('./crmTaskAttachmentCounts');
    countMap = await loadCrmTaskAttachmentCountMap(supabase, taskIds) || {};
  } catch {
    countMap = {};
  }
  list.forEach((a) => {
    if (!a.crm_task_id) return;
    const task = byId.get(String(a.crm_task_id)) || null;
    if (!task) {
      a.crm_task = null;
      return;
    }
    const counts = countMap[String(a.crm_task_id)] || countMap[a.crm_task_id] || {};
    const files = Number(counts.files || 0);
    const notes = Number(counts.notes || 0);
    a.crm_task = {
      ...task,
      file_count: files,
      note_count: notes,
      attachment_count: files + notes,
    };
    // Linked CRM task: luôn ưu tiên count từ attachments (tránh file_count=0 trên assignment che mất).
    a.file_count = files;
    a.attachment_count = files + notes;
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

/**
 * Sửa lệch status ↔ column_id trên cột shared (KPI đếm theo status, Kanban theo cột).
 * Cập nhật in-memory ngay; ghi DB nền (không chặn response).
 */
async function healAssignmentColumnStatusAlignment(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const cols = await loadSharedColumns();
  if (!cols.length) return list;
  const sharedIds = new Set(cols.map((c) => String(c.id)));
  const patches = [];
  list.forEach((row) => {
    if (!row?.id) return;
    const status = String(row.status || 'pending').toLowerCase();
    const normalized = status === 'done' ? 'completed'
      : (status === 'doing' ? 'in_progress' : status);
    const expected = columnIdForTaskStatus(cols, normalized === 'cancelled' ? 'pending' : normalized);
    if (!expected) return;
    const cur = row.column_id == null ? null : String(row.column_id);
    if (cur === String(expected)) return;
    // Chỉ heal khi đang ở cột shared / chưa gán — không đụng cột custom cá nhân
    if (cur && !sharedIds.has(cur)) return;
    row.column_id = expected;
    patches.push({ id: row.id, column_id: expected });
  });
  if (patches.length) {
    void (async () => {
      const CHUNK = 80;
      for (let i = 0; i < patches.length; i += CHUNK) {
        const slice = patches.slice(i, i + CHUNK);
        await Promise.all(slice.map((p) => supabase
          .from('crm_assignments')
          .update({ column_id: p.column_id, updated_at: new Date().toISOString() })
          .eq('id', p.id)));
      }
    })().catch((e) => console.warn('[crm_assignments] heal column/status:', e?.message || e));
  }
  return list;
}

async function attachAssignmentIdsToCrmTasks(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const taskIds = list.map((t) => t.id);
  let rows = null;
  let error = null;
  ({ data: rows, error } = await supabase
    .from('crm_assignments')
    .select('id, crm_task_id, assignment_module')
    .in('crm_task_id', taskIds));
  if (error && /assignment_module/.test(error.message || '')) {
    ({ data: rows, error } = await supabase
      .from('crm_assignments')
      .select('id, crm_task_id')
      .in('crm_task_id', taskIds));
  }
  if (error && /crm_task_id/.test(error.message || '')) return list;
  const byTask = new Map((rows || []).map((r) => [String(r.crm_task_id), r]));
  list.forEach((t) => {
    const row = byTask.get(String(t.id));
    if (row?.id) {
      t.crm_assignment_id = row.id;
      if (row.assignment_module) t.crm_assignment_module = row.assignment_module;
    }
  });
  return list;
}

/**
 * Sửa lệch status assignment ↔ crm_task (KPI/list đếm theo assignment.status,
 * còn chi tiết deal đọc crm_tasks.status). Cập nhật in-memory ngay; ghi DB nền.
 */
async function healAssignmentStatusFromCrmTask(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const patches = [];
  list.forEach((row) => {
    if (!row?.id || !row.crm_task_id || !row.crm_task) return;
    const asn = normalizeAssignmentStatus(row.status);
    const task = normalizeAssignmentStatus(row.crm_task.status);
    if (!task || asn === task) return;
    row.status = task;
    if (task === 'completed') {
      row.completed_at = row.completed_at || row.crm_task.completed_at || new Date().toISOString();
    } else {
      row.completed_at = null;
    }
    patches.push({
      id: row.id,
      status: task,
      completed_at: row.completed_at,
    });
  });
  if (patches.length) {
    void (async () => {
      const CHUNK = 80;
      for (let i = 0; i < patches.length; i += CHUNK) {
        const slice = patches.slice(i, i + CHUNK);
        await Promise.all(slice.map((p) => supabase
          .from('crm_assignments')
          .update({
            status: p.status,
            completed_at: p.completed_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id)));
      }
    })().catch((e) => console.warn('[crm_assignments] heal status from crm_task:', e?.message || e));
  }
  return list;
}

function normalizeAssignmentStatus(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'doing' || s === 'in_progress') return 'in_progress';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'todo' || s === 'pending') return 'pending';
  return s || 'pending';
}

module.exports = {
  syncAssignmentFromCrmTask,
  syncCrmTaskFromAssignment,
  resolveAssignmentModuleForCrmTask,
  attachAssignmentIdsToCrmTasks,
  attachCrmTaskMetaToAssignments,
  applyAssignmentStatusColumn,
  healAssignmentColumnStatusAlignment,
  healAssignmentStatusFromCrmTask,
  columnIdForTaskStatus,
};
