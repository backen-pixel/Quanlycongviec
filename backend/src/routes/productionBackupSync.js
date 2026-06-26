/**
 * API đồng bộ Supabase backup — module Sản xuất (admin).
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const {
  verifyPassword,
  issueMonitorToken,
  verifyMonitorToken,
} = require('../helpers/supabaseMonitorAuth');
const {
  loadSettings,
  saveSettings,
  verifyBackup,
  runBackupSync,
  getFullStatus,
  isJobRunning,
} = require('../helpers/supabaseBackupSync');
const { getSupabaseMonitorReport } = require('../helpers/supabaseMonitor');
const {
  logSupabaseMonitorAction,
  getSupabaseMonitorActivityLog,
} = require('../helpers/supabaseMonitorAudit');

const router = Router();

function monitorGate(req, res, next) {
  const token = req.headers['x-supabase-monitor-token'];
  if (verifyMonitorToken(token)) return next();
  return res.status(403).json({
    error: 'Cần mật khẩu giám sát Supabase',
    code: 'MONITOR_LOCKED',
  });
}

router.post('/unlock', auth, async (req, res) => {
  const password = String(req.body?.password || '');
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Mật khẩu không đúng' });
  }
  const token = issueMonitorToken();
  void logSupabaseMonitorAction(req, {
    action: 'monitor_unlock',
    importance: 2,
    metadata: { user_agent: req.headers['user-agent'] },
  });
  res.json({
    ok: true,
    token,
    expires_in_ms: 12 * 60 * 60 * 1000,
  });
});

/** Xác thực token giám sát (nhẹ — dùng khi mở lại trang). */
router.get('/session', auth, monitorGate, (req, res) => {
  const token = req.headers['x-supabase-monitor-token'];
  const exp = Number(String(token || '').split('.')[0]) || 0;
  res.json({ ok: true, expires_at: exp ? new Date(exp).toISOString() : null });
});

router.get('/activity-log', auth, monitorGate, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const limit = parseInt(req.query.limit, 10) || 80;
    res.json(await getSupabaseMonitorActivityLog({ days, limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', auth, monitorGate, async (req, res) => {
  try {
    res.json(await getFullStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Giám sát chi tiết primary + backup (API, DB, Storage). */
router.get('/monitor', auth, monitorGate, async (req, res) => {
  try {
    res.json(await getSupabaseMonitorReport());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Log cập nhật Primary + Backup (replication queue + failback_log). */
router.get('/update-logs', auth, monitorGate, async (req, res) => {
  try {
    const { getUpdateLogsReport } = require('../helpers/supabaseUpdateLogs');
    const limit = parseInt(req.query.limit, 10) || 80;
    const pendingOnly = req.query.pending_only === '1' || req.query.pending_only === 'true';
    res.json(await getUpdateLogsReport({ limit, failbackPendingOnly: pendingOnly }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/usage-analytics', auth, monitorGate, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 14;
    const filters = {
      user_id: req.query.user_id,
      department_id: req.query.department_id,
      module: req.query.module,
      action_type: req.query.action_type,
      weekday: req.query.weekday,
      hour_from: req.query.hour_from,
      hour_to: req.query.hour_to,
      min_importance: req.query.min_importance,
    };
    res.json(await require('../helpers/userUsageAnalytics').getSystemUsageAnalytics(days, filters));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/settings', auth, monitorGate, async (req, res) => {
  try {
    res.json(await loadSettings());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/settings', auth, monitorGate, async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};
    if (body.schedule_enabled != null) patch.schedule_enabled = !!body.schedule_enabled;
    if (body.schedule_mode != null) {
      patch.schedule_mode = body.schedule_mode === 'interval' ? 'interval' : 'slots';
    }
    if (body.sync_slots_vn != null && Array.isArray(body.sync_slots_vn)) {
      patch.sync_slots_vn = body.sync_slots_vn;
    }
    if (body.verify_before_sync != null) patch.verify_before_sync = !!body.verify_before_sync;
    if (body.interval_hours != null) {
      patch.interval_hours = Math.min(168, Math.max(1, parseInt(body.interval_hours, 10) || 24));
    }
    if (body.include_db != null) patch.include_db = !!body.include_db;
    if (body.include_storage != null) patch.include_storage = !!body.include_storage;
    if (body.verify_after_sync != null) patch.verify_after_sync = !!body.verify_after_sync;
    if (body.next_run_at != null) patch.next_run_at = body.next_run_at;

    const saved = await saveSettings(patch, req.user?.userId || req.user?.id);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_save_settings',
      importance: 2,
      metadata: { patch },
    });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/verify', auth, monitorGate, async (req, res) => {
  try {
    const result = await verifyBackup();
    await saveSettings({
      last_verify_at: result.checked_at,
      last_verify_rows: result.rows,
    }, req.user?.userId || req.user?.id);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_verify',
      importance: 2,
      metadata: { all_ok: result.all_ok, table_count: result.rows?.length },
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/run', auth, monitorGate, async (req, res) => {
  if (isJobRunning()) {
    return res.status(409).json({ error: 'Đang chạy đồng bộ — vui lòng đợi' });
  }
  const includeDb = req.body?.include_db !== false;
  const includeStorage = req.body?.include_storage !== false;
  const verifyAfter = req.body?.verify_after_sync !== false;
  const async = req.body?.async !== false;

  const userId = req.user?.userId || req.user?.id || 'admin';

  if (async) {
    void logSupabaseMonitorAction(req, {
      action: 'monitor_run_sync',
      importance: 3,
      metadata: { includeDb, includeStorage, verifyAfter, async: true },
    });
    res.json({ ok: true, message: 'Đã bắt đầu đồng bộ nền', started: true });
    void runBackupSync({ includeDb, includeStorage, verifyAfter, userId }).catch((e) => {
      console.warn('[supabase-backup-sync] run failed:', e.message);
    });
    return;
  }

  try {
    const result = await runBackupSync({ includeDb, includeStorage, verifyAfter, userId });
    void logSupabaseMonitorAction(req, {
      action: 'monitor_run_sync',
      importance: 3,
      metadata: { includeDb, includeStorage, verifyAfter, async: false, ok: true },
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Trạng thái đồng bộ — mọi user đăng nhập (bong bóng tiến trình toàn app). */
router.get('/sync/public-status', auth, async (req, res) => {
  try {
    const { getPublicSyncActivity } = require('../helpers/supabaseManualSwitch');
    res.json(getPublicSyncActivity());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Đếm ngược chuyển DB — mọi user đăng nhập (không cần mật khẩu giám sát). */
router.get('/switch/public-pending', auth, async (req, res) => {
  try {
    const { getPublicPendingSwitch } = require('../helpers/supabaseManualSwitch');
    res.json({ pending: getPublicPendingSwitch() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Trạng thái lịch chuyển đổi đang chờ (đếm ngược). */
router.get('/switch/pending', auth, monitorGate, async (req, res) => {
  try {
    const { getPendingSwitch } = require('../helpers/supabaseManualSwitch');
    res.json({ pending: getPendingSwitch() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Chuẩn bị: kiểm tra + sync — chỉ trả token khi đồng bộ 100%. */
router.post('/switch/prepare', auth, monitorGate, async (req, res) => {
  const target = String(req.body?.target || '').toLowerCase();
  if (target !== 'primary' && target !== 'backup') {
    return res.status(400).json({ error: 'target phải là primary hoặc backup' });
  }
  try {
    const { prepareManualSwitch } = require('../helpers/supabaseManualSwitch');
    const userId = req.user?.userId || req.user?.id || 'admin';
    const result = await prepareManualSwitch(target, userId);
    if (!result.ok) return res.status(409).json(result);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_switch_prepare',
      importance: 3,
      metadata: { target, sync_verified: result.sync_verified_100 },
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Chuyển nhanh: đếm ngược 5s, không đồng bộ trước — đồng bộ nền sau khi chuyển. */
router.post('/switch/quick', auth, monitorGate, async (req, res) => {
  const target = String(req.body?.target || '').toLowerCase();
  if (target !== 'primary' && target !== 'backup') {
    return res.status(400).json({ error: 'target phải là primary hoặc backup' });
  }
  try {
    const { startQuickSwitch } = require('../helpers/supabaseManualSwitch');
    const userId = req.user?.userId || req.user?.id || 'admin';
    const out = await startQuickSwitch(target, userId);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_switch_quick',
      importance: 3,
      metadata: { countdown_sec: out.countdown_sec, target: out.target, sync_after: true },
    });
    res.json(out);
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

/** Sau thông báo 100% — bắt đầu đếm ngược. */
router.post('/switch/start-countdown', auth, monitorGate, async (req, res) => {
  const prepareToken = String(req.body?.prepare_token || '');
  if (!prepareToken) return res.status(400).json({ error: 'Thiếu prepare_token' });
  try {
    const { startSwitchCountdown } = require('../helpers/supabaseManualSwitch');
    const userId = req.user?.userId || req.user?.id || 'admin';
    const out = await startSwitchCountdown(prepareToken, userId);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_switch_countdown',
      importance: 3,
      metadata: { countdown_sec: out.countdown_sec, target: out.target },
    });
    res.json(out);
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

router.post('/switch/cancel', auth, monitorGate, async (req, res) => {
  try {
    const { cancelManualSwitch } = require('../helpers/supabaseManualSwitch');
    const userId = req.user?.userId || req.user?.id || 'admin';
    const out = cancelManualSwitch(req.body?.token, userId);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_switch_cancel',
      importance: 2,
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/switch/confirm', auth, monitorGate, async (req, res) => {
  const token = String(req.body?.token || '');
  if (!token) return res.status(400).json({ error: 'Thiếu token' });
  try {
    const { confirmManualSwitch } = require('../helpers/supabaseManualSwitch');
    const userId = req.user?.userId || req.user?.id || 'admin';
    const result = await confirmManualSwitch(token, userId);
    if (result.too_early) return res.status(425).json(result);
    void logSupabaseMonitorAction(req, {
      action: 'monitor_switch_confirm',
      importance: 3,
      metadata: { target: result.target, from: result.from },
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
