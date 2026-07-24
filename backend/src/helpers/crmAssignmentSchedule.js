/**
 * Lịch giao việc CRM/SX — tạo schedule và spawn crm_assignments theo chu kỳ.
 */
const { supabase } = require('../config/supabase');

const ADMIN_ROLES = new Set(['admin', 'manager', 'sales_admin', 'crm_production_admin']);
const isAdmin = (req) => ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase());

const ASSIGNMENT_SELECT = `
  id, company_id, column_id, lead_id, crm_task_id, assignment_module, title, description,
  assignee_id, created_by_id, priority, status, deadline, schedule_id,
  position, created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar)
`;

function computeNextRunAt(fromDate, recurrenceType, interval) {
  const d = new Date(fromDate);
  const n = Math.max(1, Number(interval) || 1);
  if (recurrenceType === 'daily') d.setDate(d.getDate() + n);
  else if (recurrenceType === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (recurrenceType === 'monthly') d.setMonth(d.getMonth() + n);
  else return null;
  return d;
}

function resolveInstanceDeadline(schedule, runAt) {
  if (!schedule.deadline_at) return null;
  const start = new Date(schedule.scheduled_start);
  const deadline = new Date(schedule.deadline_at);
  const offsetMs = deadline.getTime() - start.getTime();
  if (offsetMs <= 0) return schedule.deadline_at;
  return new Date(new Date(runAt).getTime() + offsetMs).toISOString();
}

async function replaceAssignees(assignmentId, userIds) {
  await supabase.from('crm_assignment_assignees').delete().eq('assignment_id', assignmentId);
  const uniq = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!uniq.length) return [];
  await supabase.from('crm_assignment_assignees').insert(
    uniq.map((uid) => ({ assignment_id: assignmentId, user_id: uid }))
  );
  return uniq;
}

async function copyScheduleFilesToAssignment(scheduleId, assignmentId, uploadedBy) {
  const { data: files } = await supabase
    .from('crm_assignment_schedule_files')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('kind', 'req');
  if (!files?.length) return;
  await supabase.from('crm_assignment_files').insert(
    files.map((f) => ({
      assignment_id: assignmentId,
      kind: f.kind || 'req',
      file_name: f.file_name,
      file_url: f.file_url,
      file_size: f.file_size,
      mime_type: f.mime_type,
      storage_path: f.storage_path,
      uploaded_by: uploadedBy || f.uploaded_by,
    }))
  );
}

async function notifyAssignees(io, assignment, assigneeIds, creatorId) {
  const { notifyNewCrmAssignmentAssignees } = require('./crmAssignmentNotifications');
  const { dispatchNotificationToUser } = require('./notifications');
  const pushFn = async (userId, notification) => {
    await dispatchNotificationToUser(io, userId, notification);
  };
  const fakeReq = {
    user: { userId: creatorId },
    app: {
      get(key) {
        if (key === 'io') return io;
        if (key === 'pushNotification') return pushFn;
        return undefined;
      },
    },
  };
  await notifyNewCrmAssignmentAssignees(fakeReq, {
    assignmentId: assignment.id,
    title: assignment.title,
    userIds: assigneeIds,
    deadline: assignment.deadline,
    assignmentModule: assignment.assignment_module || 'crm',
  });
}

async function spawnAssignmentFromSchedule(schedule, io) {
  const assigneeIds = Array.isArray(schedule.assignee_ids)
    ? schedule.assignee_ids.filter(Boolean).map(String)
    : [];
  const runAt = schedule.next_run_at || schedule.scheduled_start;
  const primaryAssignee = assigneeIds[0] || null;

  let posBase = 0;
  if (schedule.column_id) {
    const { data: maxRow } = await supabase.from('crm_assignments').select('position')
      .eq('column_id', schedule.column_id).order('position', { ascending: false }).limit(1).maybeSingle();
    posBase = ((maxRow?.position ?? -1) + 1);
  }

  const insertRow = {
    title: schedule.title,
    description: schedule.description || null,
    assignee_id: primaryAssignee,
    created_by_id: schedule.created_by_id,
    column_id: schedule.column_id || null,
    company_id: schedule.company_id || null,
    priority: schedule.priority || 'medium',
    status: 'pending',
    deadline: resolveInstanceDeadline(schedule, runAt),
    position: posBase,
    assignment_module: schedule.assignment_module === 'production' ? 'production' : 'crm',
    schedule_id: schedule.id,
  };

  let { data, error } = await supabase.from('crm_assignments').insert(insertRow).select(ASSIGNMENT_SELECT).single();
  if (error && /schedule_id/.test(error.message || '')) {
    delete insertRow.schedule_id;
    ({ data, error } = await supabase.from('crm_assignments').insert(insertRow).select(ASSIGNMENT_SELECT).single());
  }
  if (error && /assignment_module/.test(error.message || '')) {
    delete insertRow.assignment_module;
    ({ data, error } = await supabase.from('crm_assignments').insert(insertRow).select(ASSIGNMENT_SELECT).single());
  }
  if (error) throw new Error(error.message || 'Không tạo được nhiệm vụ từ lịch');

  await replaceAssignees(data.id, assigneeIds);
  try {
    await copyScheduleFilesToAssignment(schedule.id, data.id, schedule.created_by_id);
  } catch (copyErr) {
    console.warn('[crm-assignment-schedule] copy files:', copyErr.message);
  }
  await notifyAssignees(io, data, assigneeIds, schedule.created_by_id);
  return data;
}

async function createCrmAssignmentSchedule(req, body) {
  const {
    title, description, assignee_ids, column_id, company_id, priority,
    deadline, scheduled_start, recurrence_type, recurrence_interval, recurrence_end_at,
    assignment_module,
  } = body || {};

  if (!title || !String(title).trim()) return { error: 'Cần tiêu đề', status: 400 };
  if (!scheduled_start) return { error: 'Cần thời gian bắt đầu lịch', status: 400 };

  const start = new Date(scheduled_start);
  if (Number.isNaN(start.getTime())) return { error: 'Thời gian lịch không hợp lệ', status: 400 };

  const ids = (assignee_ids || []).filter(Boolean).map(String);
  if (!ids.length) return { error: 'Cần chọn ít nhất một nhân viên', status: 400 };

  const recType = ['daily', 'weekly', 'monthly'].includes(recurrence_type) ? recurrence_type : null;
  const recInterval = Math.max(1, Number(recurrence_interval) || 1);
  const recEnd = recurrence_end_at ? new Date(recurrence_end_at) : null;
  if (recEnd && Number.isNaN(recEnd.getTime())) return { error: 'Ngày kết thúc lặp không hợp lệ', status: 400 };

  let effectiveCompany = isAdmin(req)
    ? (company_id || req.user?.company_id || null)
    : (req.user?.company_id || null);

  const resolvedModule = assignment_module === 'production' ? 'production' : 'crm';
  const deadlineAt = deadline ? new Date(deadline).toISOString() : null;

  const row = {
    company_id: effectiveCompany,
    assignment_module: resolvedModule,
    title: String(title).trim(),
    description: description || null,
    column_id: column_id || null,
    priority: priority || 'medium',
    created_by_id: req.user.userId,
    assignee_ids: ids,
    scheduled_start: start.toISOString(),
    deadline_at: deadlineAt,
    recurrence_type: recType,
    recurrence_interval: recInterval,
    recurrence_end_at: recEnd ? recEnd.toISOString() : null,
    next_run_at: start.toISOString(),
    is_active: true,
  };

  const { data, error } = await supabase
    .from('crm_assignment_schedules')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    if (/crm_assignment_schedules/.test(error.message || '')) {
      return { error: 'Database chưa có bảng lịch giao việc (migration 357). Chạy database/357_crm_assignment_schedules.sql trên Supabase.', status: 503 };
    }
    return { error: error.message, status: 500 };
  }

  // Nếu lịch đã đến hạn ngay → spawn luôn
  if (start.getTime() <= Date.now()) {
    try {
      const assignment = await spawnAssignmentFromSchedule(data, req.app?.get?.('io'));
      const now = new Date();
      const updates = { last_run_at: now.toISOString(), last_assignment_id: assignment.id, updated_at: now.toISOString() };
      if (recType) {
        let next = computeNextRunAt(start, recType, recInterval);
        while (next && next.getTime() <= now.getTime()) {
          next = computeNextRunAt(next, recType, recInterval);
        }
        if (!next || (recEnd && next.getTime() > recEnd.getTime())) {
          updates.is_active = false;
          updates.next_run_at = now.toISOString();
        } else {
          updates.next_run_at = next.toISOString();
        }
      } else {
        updates.is_active = false;
        updates.next_run_at = start.toISOString();
      }
      await supabase.from('crm_assignment_schedules').update(updates).eq('id', data.id);
      return { data: { schedule: { ...data, ...updates }, assignment, spawned: true }, status: 201 };
    } catch (spawnErr) {
      console.error('[crm-assignment-schedule] immediate spawn:', spawnErr.message);
    }
  }

  return { data: { schedule: data, spawned: false }, status: 201 };
}

async function processDueCrmAssignmentSchedules(io) {
  const now = new Date();
  const { data: due, error } = await supabase
    .from('crm_assignment_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(50);

  if (error) {
    if (/crm_assignment_schedules/.test(error.message || '')) return { processed: 0, skipped: true };
    throw error;
  }
  if (!due?.length) return { processed: 0 };

  let processed = 0;
  for (const schedule of due) {
    try {
      const assignment = await spawnAssignmentFromSchedule(schedule, io);
      const updates = {
        last_run_at: now.toISOString(),
        last_assignment_id: assignment.id,
        updated_at: now.toISOString(),
      };

      if (schedule.recurrence_type) {
        let next = computeNextRunAt(schedule.next_run_at || schedule.scheduled_start, schedule.recurrence_type, schedule.recurrence_interval);
        const recEnd = schedule.recurrence_end_at ? new Date(schedule.recurrence_end_at) : null;
        while (next && next.getTime() <= now.getTime()) {
          next = computeNextRunAt(next, schedule.recurrence_type, schedule.recurrence_interval);
        }
        if (!next || (recEnd && next.getTime() > recEnd.getTime())) {
          updates.is_active = false;
          updates.next_run_at = (schedule.next_run_at || schedule.scheduled_start);
        } else {
          updates.next_run_at = next.toISOString();
        }
      } else {
        updates.is_active = false;
      }

      await supabase.from('crm_assignment_schedules').update(updates).eq('id', schedule.id);
      processed += 1;
    } catch (e) {
      console.error(`[crm-assignment-schedule] schedule ${schedule.id}:`, e.message);
    }
  }
  return { processed };
}

module.exports = {
  createCrmAssignmentSchedule,
  processDueCrmAssignmentSchedules,
  spawnAssignmentFromSchedule,
  computeNextRunAt,
};
