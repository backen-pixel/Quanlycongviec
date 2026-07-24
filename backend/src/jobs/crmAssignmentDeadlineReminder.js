/**
 * Nhắc hạn nhiệm vụ "Giao việc" (crm_assignments) — CRM + Sản xuất.
 * Chạy mỗi 30 phút (tách biệt với reminder lead/deal).
 * - Sắp đến hạn (≤2h) → type: crm_assignment_due_soon
 * - Quá hạn           → type: crm_assignment_overdue
 * Dedup theo (type, entity_id, user_id) trong 4 giờ gần nhất.
 *
 * Metadata gắn đúng module (production → SX mobile tray + deep link Work).
 * Disable bằng env CRM_ASSIGNMENT_REMINDER_DISABLED=1.
 */
const { supabase } = require('../config/supabase');
const {
  buildAssignmentNotificationInsert,
  assignmentModuleMeta,
} = require('../helpers/crmAssignmentNotifications');
const { runIfLeader } = require('../helpers/cronLeader');

const RUN_INTERVAL_MS = 30 * 60 * 1000;
const DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000;

async function runOnce(io) {
  const now = new Date();
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  try {
    const selectCols = 'id, title, deadline, status, assignment_module, assignee_id';
    let dueSoon;
    let overdue;
    let listErr;

    ({ data: dueSoon, error: listErr } = await supabase
      .from('crm_assignments')
      .select(selectCols)
      .neq('status', 'completed')
      .gte('deadline', now.toISOString())
      .lt('deadline', in2h.toISOString())
      .limit(200));
    if (listErr && /assignment_module/.test(listErr.message || '')) {
      ({ data: dueSoon } = await supabase
        .from('crm_assignments')
        .select('id, title, deadline, status, assignee_id')
        .neq('status', 'completed')
        .gte('deadline', now.toISOString())
        .lt('deadline', in2h.toISOString())
        .limit(200));
    }

    ({ data: overdue, error: listErr } = await supabase
      .from('crm_assignments')
      .select(selectCols)
      .neq('status', 'completed')
      .lt('deadline', now.toISOString())
      .limit(200));
    if (listErr && /assignment_module/.test(listErr.message || '')) {
      ({ data: overdue } = await supabase
        .from('crm_assignments')
        .select('id, title, deadline, status, assignee_id')
        .neq('status', 'completed')
        .lt('deadline', now.toISOString())
        .limit(200));
    }

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

    const { data: assigneeRows } = await supabase
      .from('crm_assignment_assignees')
      .select('assignment_id, user_id')
      .in('assignment_id', allIds);

    const assigneesByTask = new Map();
    (assigneeRows || []).forEach((r) => {
      if (!assigneesByTask.has(r.assignment_id)) assigneesByTask.set(r.assignment_id, []);
      assigneesByTask.get(r.assignment_id).push(r.user_id);
    });

    const since = new Date(now.getTime() - DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from('notifications')
      .select('type, entity_id, user_id')
      .in('type', ['crm_assignment_due_soon', 'crm_assignment_overdue'])
      .gte('created_at', since);
    const seen = new Set((recent || []).map((n) => `${n.type}:${n.entity_id}:${n.user_id}`));

    const fmtDt = (iso) => {
      try {
        return new Date(iso).toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return iso;
      }
    };

    const collectTargets = (task) => {
      const set = new Set();
      (assigneesByTask.get(task.id) || []).forEach((uid) => {
        if (uid) set.add(String(uid));
      });
      if (task.assignee_id) set.add(String(task.assignee_id));
      return [...set];
    };

    const notifs = [];
    const push = (taskList, type, titleFn, msgFn) => {
      for (const t of taskList || []) {
        const mod = assignmentModuleMeta(t.assignment_module);
        const targets = collectTargets(t);
        for (const uid of targets) {
          const key = `${type}:${t.id}:${uid}`;
          if (seen.has(key)) continue;
          notifs.push(buildAssignmentNotificationInsert(uid, {
            type,
            title: titleFn(mod.isProduction),
            message: msgFn(t, mod.isProduction),
            assignmentId: t.id,
            assignmentModule: mod.moduleKey,
            metadata: {
              ...mod.metadata,
              open: t.id,
            },
          }));
          seen.add(key);
        }
      }
    };

    push(
      dueSoon,
      'crm_assignment_due_soon',
      (isProd) => (isProd ? '⏰ Sắp đến hạn công việc Sản xuất (≤2h)' : '⏰ Sắp đến hạn nhiệm vụ (≤2h)'),
      (t) => `"${t.title}" — hạn ${fmtDt(t.deadline)}`,
    );

    push(
      overdue,
      'crm_assignment_overdue',
      (isProd) => (isProd ? '🚨 Quá hạn công việc Sản xuất' : '🚨 Quá hạn nhiệm vụ'),
      (t) => {
        const days = Math.max(1, Math.floor((Date.now() - new Date(t.deadline).getTime()) / 86400000));
        return `"${t.title}" — quá hạn ${days} ngày (${fmtDt(t.deadline)})`;
      },
    );

    if (!notifs.length) {
      console.log(`[crm-assignment-reminder] Không có thông báo mới (${(dueSoon || []).length} sắp, ${(overdue || []).length} quá hạn)`);
      return;
    }

    const { data: inserted } = await supabase.from('notifications').insert(notifs).select('*');
    const { dispatchNotificationToUser } = require('../helpers/notifications');
    for (const n of inserted || []) {
      await dispatchNotificationToUser(io, n.user_id, n);
    }
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
  setTimeout(() => { void runIfLeader('crm-assignment-reminder', () => runOnce(io), { ttlSec: 1700 }); }, 90 * 1000);
  setInterval(() => { void runIfLeader('crm-assignment-reminder', () => runOnce(io), { ttlSec: 1700 }); }, RUN_INTERVAL_MS);
  console.log('[crm-assignment-reminder] Started — interval 30 phút');
}

module.exports = { start, runOnce };
