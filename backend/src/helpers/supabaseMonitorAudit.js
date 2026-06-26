/**
 * Ghi nhận ai vào / thao tác trên trang Giám sát Supabase.
 * Lưu user_activity_log (module supabase_monitor) + audit_log cho thao tác quan trọng.
 */
const { supabase } = require('../config/supabase');
const { writeAuditLog, clientIp } = require('./auditLog');

const ACTION_LABELS = {
  monitor_unlock: 'Mở khóa trang giám sát (nhập mật khẩu)',
  monitor_enter: 'Vào trang giám sát Supabase',
  monitor_verify: 'Kiểm tra drift Primary ↔ Backup',
  monitor_run_sync: 'Chạy đồng bộ Primary → Backup',
  monitor_save_settings: 'Cập nhật lịch / cấu hình đồng bộ',
  monitor_switch_prepare: 'Chuẩn bị chuyển đổi database',
  monitor_switch_countdown: 'Bắt đầu đếm ngược chuyển DB',
  monitor_switch_cancel: 'Hủy chuyển đổi database',
  monitor_switch_confirm: 'Xác nhận chuyển đổi database',
  monitor_tab: 'Chuyển tab trên trang giám sát',
};

function actionTypeFor(action) {
  if (action === 'monitor_unlock' || action === 'monitor_enter' || action === 'monitor_tab') return 'click';
  if (action === 'monitor_save_settings') return 'update';
  if (action.startsWith('monitor_switch')) return 'update';
  if (action === 'monitor_run_sync') return 'create';
  if (action === 'monitor_verify') return 'click';
  return 'click';
}

/**
 * @param {import('express').Request} req
 * @param {object} opts
 * @param {string} opts.action — key trong ACTION_LABELS hoặc tùy chỉnh
 * @param {string} [opts.label]
 * @param {number} [opts.importance] 1–3
 * @param {object} [opts.metadata]
 */
async function logSupabaseMonitorAction(req, opts = {}) {
  try {
    const userId = req?.user?.userId || req?.user?.id;
    if (!userId) return;

    const action = String(opts.action || 'monitor_action').slice(0, 60);
    const label = String(opts.label || ACTION_LABELS[action] || action).slice(0, 400);
    const importance = Number.isInteger(opts.importance) ? opts.importance : 2;
    const meta = {
      ...(opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {}),
      monitor_action: action,
      ip: clientIp(req),
      user_name: req?.user?.full_name || req?.user?.name || null,
    };

    const { error } = await supabase.from('user_activity_log').insert({
      user_id: userId,
      action_type: actionTypeFor(action),
      module: 'supabase_monitor',
      feature: opts.feature || 'backup_sync',
      path: '/management/backup-sync',
      label,
      metadata: meta,
      importance: Math.min(3, Math.max(1, importance)),
    });
    if (error && !/user_activity_log|does not exist|42P01/i.test(String(error.message || ''))) {
      console.warn('[supabase-monitor-audit] activity insert:', error.message);
    }

    if (importance >= 2) {
      void writeAuditLog(req, {
        module: 'supabase_monitor',
        action,
        entity_label: label,
        metadata: meta,
      });
    }
  } catch (e) {
    console.warn('[supabase-monitor-audit]', e?.message || e);
  }
}

async function getSupabaseMonitorActivityLog({ days = 30, limit = 80 } = {}) {
  const safeDays = Math.min(90, Math.max(1, parseInt(days, 10) || 30));
  const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 80));
  const since = new Date(Date.now() - safeDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from('user_activity_log')
    .select('id, user_id, action_type, label, metadata, importance, created_at, user:users(id, full_name, email)')
    .eq('module', 'supabase_monitor')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (/user_activity_log|does not exist|42P01/i.test(String(error.message || ''))) {
      return { ok: false, error: 'missing_table', items: [] };
    }
    throw error;
  }

  return {
    ok: true,
    since,
    items: (data || []).map((row) => ({
      id: row.id,
      at: row.created_at,
      action_type: row.action_type,
      label: row.label,
      importance: row.importance,
      metadata: row.metadata,
      user: row.user
        ? { id: row.user.id, name: row.user.full_name || row.user.email, email: row.user.email }
        : { id: row.user_id, name: row.metadata?.user_name || '—' },
    })),
  };
}

module.exports = {
  logSupabaseMonitorAction,
  getSupabaseMonitorActivityLog,
  ACTION_LABELS,
};
