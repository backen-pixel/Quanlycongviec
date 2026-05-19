/**
 * Nhắc hạn nhiệm vụ "Giao việc CRM" (bảng crm_assignments).
 * Chạy mỗi 30 phút (tách biệt với reminder lead/deal).
 * - Sắp đến hạn (1–2h tới) → type: crm_assignment_due_soon
 * - Quá hạn                  → type: crm_assignment_overdue
 * Dedup theo (type, entity_id) trong 4 giờ gần nhất.
 *
 * Disable bằng env CRM_ASSIGNMENT_REMINDER_DISABLED=1.
 * Tích hợp: require('./jobs/crmAssignmentDeadlineReminder').start(io)
 */
const { supabase } = require('../config/supabase');
const { buildAssignmentNotificationInsert } = require('../helpers/crmAssignmentNotifications');

const RUN_INTERVAL_MS = 30 * 60 * 1000;
const DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000;

async function runOnce(io) {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  try {
    const { data: dueSoon } = await supabase
      .from('crm_assignments')
      .select('id, title, deadline, status')
      .neq('status', 'completed')
      .gte('deadline', now.toISOString())
      .lt('deadline', in2h.toISOString())
      .limit(200);

    const { data: overdue } = await supabase
      .from('crm_assignments')
      .select('id, title, deadline, status')
      .neq('status', 'completed')
      .lt('deadline', now.toISOString())
      .limit(200);

    const allIds = [
      ...new Set([
        ...(dueSoon || []).map((t) => t.id),
        ...(overdue || []).map((t) => t.id),
      ]),
    ];
    if (!allIds.length) {
      console.log('[crm-assignment-reminder] Không có nhiệm vụ sắp/quá hạn');
      return;
    }

    // Lấy assignees cho mỗi nhiệm vụ
    const { data: assigneeRows } = await supabase
      .from('crm_assignment_assignees')
      .select('assignment_id, user_id')
      .in('assignment_id', allIds);

    const assigneesByTask = new Map();
    (assigneeRows || []).forEach((r) => {
      if (!assigneesByTask.has(r.assignment_id)) assigneesByTask.set(r.assignment_id, []);
      assigneesByTask.get(r.assignment_id).push(r.user_id);
    });

    // Dedup: thông báo gần nhất 4h
    const since = new Date(now.getTime() - DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from('notifications')
      .select('type, entity_id, user_id')
      .in('type', ['crm_assignment_due_soon', 'crm_assignment_overdue'])
      .gte('created_at', since);
    const seen = new Set((recent || []).map((n) => `${n.type}:${n.entity_id}:${n.user_id}`));

    const notifs = [];
    const push = (taskList, type, titlePrefix, msgFn) => {
      for (const t of taskList || []) {
        const targets = assigneesByTask.get(t.id) || [];
        for (const uid of targets) {
          const key = `${type}:${t.id}:${uid}`;
          if (seen.has(key)) continue;
          notifs.push(buildAssignmentNotificationInsert(uid, {
            type,
            title: titlePrefix,
            message: msgFn(t),
            assignmentId: t.id,
          }));
          seen.add(key);
        }
      }
    };

    const fmtDt = (iso) => {
      try {
        return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    };

    push(dueSoon, 'crm_assignment_due_soon', '⏰ Sắp đến hạn (≤2h)',
      (t) => `"${t.title}" — hạn ${fmtDt(t.deadline)}`);

    push(overdue, 'crm_assignment_overdue', '🚨 Quá hạn nhiệm vụ',
      (t) => {
        const days = Math.max(1, Math.floor((Date.now() - new Date(t.deadline).getTime()) / 86400000));
        return `"${t.title}" — quá hạn ${days} ngày (${fmtDt(t.deadline)})`;
      });

    if (!notifs.length) {
      console.log(`[crm-assignment-reminder] Không có thông báo mới (${(dueSoon || []).length} sắp, ${(overdue || []).length} quá hạn)`);
      return;
    }

    const { data: inserted } = await supabase.from('notifications').insert(notifs).select('*');
    (inserted || []).forEach((n) => io && io.to(`user:${n.user_id}`).emit('notification', n));
    console.log(`[crm-assignment-reminder] Đã gửi ${inserted?.length || 0}/${notifs.length} thông báo`);
  } catch (e) {
    console.error('[crm-assignment-reminder]', e.message);
  }
}

function start(io) {
  if (process.env.CRM_ASSIGNMENT_REMINDER_DISABLED === '1') {
    console.log('[crm-assignment-reminder] Disabled (env)');
    return;
  }
  // Defer first run 90s để không tranh tài nguyên với startup
  setTimeout(() => { void runOnce(io); }, 90 * 1000);
  setInterval(() => { void runOnce(io); }, RUN_INTERVAL_MS);
  console.log('[crm-assignment-reminder] Started — interval 30 phút');
}

module.exports = { start, runOnce };
