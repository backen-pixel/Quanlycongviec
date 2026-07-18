/**
 * Thông báo cho module Giao việc CRM (id BIGINT, không phải UUID).
 * Cần migration database/197_notifications_entity_id_text.sql.
 */
const { supabase } = require('../config/supabase');
const { emitNotifyBadge } = require('./notifyBadge');

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
 * Gửi TB «Bạn vừa được giao nhiệm vụ» → mở /crm/assignments hoặc /sx/assignments
 * Người được giao tường minh phải nhận TB — không lọc theo company/region lead
 * (NV xưởng thường khác company_id so với deal CRM).
 */
async function notifyNewCrmAssignmentAssignees(req, {
  assignmentId,
  title,
  userIds,
  lead,
  deadline,
  stageSlug,
  crmTaskId,
  assignmentModule = 'crm',
}) {
  if (!assignmentId || !userIds?.length) return;
  const actorId = req?.user?.userId;
  const targets = [...new Set(userIds.filter(Boolean).map(String))]
    .filter((uid) => !actorId || String(uid) !== String(actorId));
  if (!targets.length) return;

  const isProduction = assignmentModule === 'production'
    || String(stageSlug || '').startsWith('sx_');
  const moduleKey = isProduction ? 'production' : 'crm';
  const navPath = isProduction ? '/sx/assignments' : '/crm/assignments';
  const notifTitle = isProduction
    ? '📋 Bạn vừa được giao nhiệm vụ Sản xuất'
    : '📋 Bạn vừa được giao nhiệm vụ CRM';

  const leadLabel = [lead?.code, lead?.title].filter(Boolean).join(' ').trim();
  const leadSuffix = leadLabel ? ` (${leadLabel})` : '';
  const dl = deadline ? ` — hạn ${new Date(deadline).toLocaleString('vi-VN')}` : '';
  const msg = `"${title || 'Nhiệm vụ'}"${leadSuffix}${dl}`;

  const io = req?.app?.get?.('io');
  const pushFn = req?.app?.get?.('pushNotification');

  for (const uid of targets) {
    const notif = await persistAssignmentNotification(supabase, uid, {
      type: 'crm_assignment_assigned',
      title: notifTitle,
      message: msg,
      assignmentId,
      metadata: {
        module_key: moduleKey,
        ecosystem_module_key: moduleKey,
        lead_id: lead?.id || null,
        crm_task_id: crmTaskId || null,
        nav_path: navPath,
        open: assignmentId,
      },
    });
    const payload = notif || buildAssignmentNotificationInsert(uid, {
      type: 'crm_assignment_assigned',
      title: notifTitle,
      message: msg,
      assignmentId,
      metadata: {
        module_key: moduleKey,
        ecosystem_module_key: moduleKey,
        lead_id: lead?.id || null,
        crm_task_id: crmTaskId || null,
        nav_path: navPath,
        open: assignmentId,
      },
    });
    // pushNotification = socket + FCM; vẫn emit socket khi persist lỗi để app đang mở nhận được.
    if (typeof pushFn === 'function') {
      void pushFn(uid, payload);
    } else if (io) {
      io.to(`user:${uid}`).emit('notification', payload);
    }
    emitNotifyBadge(req?.app, 'assignments', { company_id: req?.user?.company_id || null });
  }
}

/** Thông báo sau khi sync crm_tasks → crm_assignments (bulk gen từ bộ mẫu / tạo dự án). */
async function notifyAfterCrmTaskAssignmentSync(req, {
  task,
  assigneeIds,
  assignmentId,
  leadCache = null,
  assignmentModule = 'crm',
  notify = true,
}) {
  if (!notify || !req || !assignmentId || !assigneeIds?.length || !task?.id) return;
  let lead = leadCache?.lead ?? null;
  if (!lead && task.lead_id) {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, code, title, company_id, region_id')
      .eq('id', task.lead_id)
      .maybeSingle();
    lead = data || null;
    if (leadCache) leadCache.lead = lead;
  }
  try {
    await notifyNewCrmAssignmentAssignees(req, {
      assignmentId,
      title: task.title,
      userIds: assigneeIds,
      lead,
      deadline: task.deadline,
      stageSlug: task.stage_slug,
      crmTaskId: task.id,
      assignmentModule,
    });
  } catch (e) {
    console.warn('[notifyAfterCrmTaskAssignmentSync]', e.message);
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
  notifyAfterCrmTaskAssignmentSync,
  resolveAssignmentIdForTask,
};
