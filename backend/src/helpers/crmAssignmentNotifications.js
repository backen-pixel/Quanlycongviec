/**
 * Thông báo cho module Giao việc CRM (id BIGINT, không phải UUID).
 * Cần migration database/197_notifications_entity_id_text.sql.
 */
const { supabase } = require('../config/supabase');
const { emitNotifyBadge } = require('./notifyBadge');
const {
  ecosystemModuleKeyForCrmDeadline,
  crmTaskDeadlineModuleKey,
  filterUserIdsForCrmLeadScopedNotification,
} = require('./deadlineModuleNotifications');

function assignmentIdStr(assignmentId) {
  if (assignmentId == null || assignmentId === '') return null;
  return String(assignmentId);
}

function buildAssignmentNotificationInsert(userId, { type, title, message, assignmentId, metadata = {} }) {
  const id = assignmentIdStr(assignmentId);
  return {
    user_id: userId,
    type,
    title,
    message,
    entity_type: 'crm_assignment',
    entity_id: id,
    metadata: {
      module_key: 'crm',
      ecosystem_module_key: 'crm',
      assignment_id: id,
      nav_path: '/crm/assignments',
      open: id,
      ...metadata,
    },
  };
}

async function persistAssignmentNotification(supabase, userId, payload) {
  if (!userId) return null;
  const row = buildAssignmentNotificationInsert(userId, payload);
  const { data, error } = await supabase.from('notifications').insert(row).select().single();
  if (error) {
    console.warn('[crm_assignment] persistNotification:', error.message);
    return null;
  }
  return data;
}

/**
 * Gửi TB «Bạn vừa được giao nhiệm vụ CRM» → mở /crm/assignments?open=id
 */
async function notifyNewCrmAssignmentAssignees(req, {
  assignmentId,
  title,
  userIds,
  lead,
  deadline,
  stageSlug,
  crmTaskId,
}) {
  if (!assignmentId || !userIds?.length) return;
  const actorId = req?.user?.userId;
  const raw = [...new Set(userIds.filter(Boolean).map(String))]
    .filter((uid) => !actorId || String(uid) !== String(actorId));
  if (!raw.length) return;

  const eco = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(stageSlug));
  const scoped = await filterUserIdsForCrmLeadScopedNotification(
    supabase,
    { company_id: lead?.company_id, region_id: lead?.region_id },
    raw,
    eco,
  );
  if (!scoped.length) return;

  const leadLabel = [lead?.code, lead?.title].filter(Boolean).join(' ').trim();
  const leadSuffix = leadLabel ? ` (${leadLabel})` : '';
  const dl = deadline ? ` — hạn ${new Date(deadline).toLocaleString('vi-VN')}` : '';
  const msg = `"${title || 'Nhiệm vụ'}"${leadSuffix}${dl}`;

  const io = req?.app?.get?.('io');
  const pushFn = req?.app?.get?.('pushNotification');

  for (const uid of scoped) {
    const notif = await persistAssignmentNotification(supabase, uid, {
      type: 'crm_assignment_assigned',
      title: '📋 Bạn vừa được giao nhiệm vụ CRM',
      message: msg,
      assignmentId,
      metadata: {
        lead_id: lead?.id || null,
        crm_task_id: crmTaskId || null,
        nav_path: '/crm/assignments',
        open: assignmentId,
      },
    });
    const payload = notif || buildAssignmentNotificationInsert(uid, {
      type: 'crm_assignment_assigned',
      title: '📋 Bạn vừa được giao nhiệm vụ CRM',
      message: msg,
      assignmentId,
      metadata: { lead_id: lead?.id, open: assignmentId },
    });
    if (io) io.to(`user:${uid}`).emit('notification', payload);
    if (pushFn && notif) pushFn(uid, notif);
    emitNotifyBadge(req?.app, 'assignments');
  }
}

/** Tìm crm_assignments id từ task (cột crm_task_id hoặc lead + tiêu đề). */
async function resolveAssignmentIdForTask(taskId, leadId, title) {
  if (!taskId) return null;
  const { data: byTask, error: findErr } = await supabase
    .from('crm_assignments')
    .select('id')
    .eq('crm_task_id', taskId)
    .maybeSingle();
  if (!findErr && byTask?.id) return byTask.id;
  if (!leadId || !title) return null;
  const { data: byLead } = await supabase
    .from('crm_assignments')
    .select('id')
    .eq('lead_id', leadId)
    .eq('title', title)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return byLead?.id || null;
}

module.exports = {
  assignmentIdStr,
  buildAssignmentNotificationInsert,
  persistAssignmentNotification,
  notifyNewCrmAssignmentAssignees,
  resolveAssignmentIdForTask,
};
