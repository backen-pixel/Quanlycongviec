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
  res.json({
    ok: true,
    token,
    expires_in_ms: 12 * 60 * 60 * 1000,
  });
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

router.get('/usage-analytics', auth, monitorGate, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 14;
    res.json(await require('../helpers/userUsageAnalytics').getSystemUsageAnalytics(days));
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
    res.json({ ok: true, message: 'Đã bắt đầu đồng bộ nền', started: true });
    void runBackupSync({ includeDb, includeStorage, verifyAfter, userId }).catch((e) => {
      console.warn('[supabase-backup-sync] run failed:', e.message);
    });
    return;
  }

  try {
    const result = await runBackupSync({ includeDb, includeStorage, verifyAfter, userId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
