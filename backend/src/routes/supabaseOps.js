/**
 * Admin API — trạng thái Supabase failover & chuyển target thủ công.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const {
  getHealthStatus,
  runHealthCheck,
  setActiveTarget,
  isFailoverEnabled,
  getActiveTarget,
} = require('../config/supabaseRouter');
const {
  runFailbackReplay,
  getFailbackStatus,
  getPendingCount,
} = require('../helpers/supabaseFailback');

const router = Router();

router.get('/status', auth, async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const status = await runHealthCheck();
    const pending = await getPendingCount().catch(() => null);
    res.json({ ...status, failback_pending: pending });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/failback/status', auth, async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const pending = await getPendingCount();
    res.json({ ...getFailbackStatus(), pending });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Replay log backup → primary. Tuỳ chọn chuyển về primary sau khi replay xong.
 * Body: { dry_run?, limit?, switch_to_primary?, force_switch? }
 */
router.post('/failback', auth, async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Forbidden' });
  if (!isFailoverEnabled()) {
    return res.status(400).json({ error: 'Failover chưa bật — cần SUPABASE_FAILOVER_ENABLED=1' });
  }

  const dryRun = req.body?.dry_run === true;
  const limit = Math.min(5000, Math.max(1, parseInt(req.body?.limit || '500', 10)));
  const switchToPrimary = req.body?.switch_to_primary === true;
  const forceSwitch = req.body?.force_switch === true;

  try {
    const result = await runFailbackReplay({ dryRun, limit });

    if (switchToPrimary && !dryRun) {
      if (result.remaining > 0 && !forceSwitch) {
        return res.status(409).json({
          error: `Còn ${result.remaining} job chưa replay — dùng force_switch=true để chuyển anyway`,
          ...result,
          active: getActiveTarget(),
        });
      }
      await setActiveTarget('primary', `admin_failback:${req.user?.userId || 'unknown'}`);
    }

    res.json({
      ok: true,
      active: getActiveTarget(),
      ...result,
      status: getHealthStatus(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/switch', auth, async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Forbidden' });
  const target = String(req.body?.target || '').toLowerCase();
  if (target !== 'primary' && target !== 'backup') {
    return res.status(400).json({ error: 'target phải là "primary" hoặc "backup"' });
  }
  if (target === 'backup' && !isFailoverEnabled()) {
    return res.status(400).json({
      error: 'Failover chưa bật — cần SUPABASE_FAILOVER_ENABLED=1 và env backup',
    });
  }

  if (target === 'primary' && getActiveTarget() === 'backup') {
    const pending = await getPendingCount().catch(() => 0);
    if (pending > 0 && req.body?.skip_failback !== true) {
      return res.status(409).json({
        error: `Còn ${pending} failback job — gọi POST /failback trước hoặc skip_failback=true`,
        failback_pending: pending,
      });
    }
  }

  try {
    await setActiveTarget(target, `admin:${req.user?.userId || 'unknown'}`);
    res.json({ ok: true, active: getActiveTarget(), status: getHealthStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
