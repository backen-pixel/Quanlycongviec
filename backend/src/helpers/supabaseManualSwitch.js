/**
 * Chuyển đổi thủ công primary ↔ backup — kiểm tra drift, sync log, đếm ngược, chuyển mượt.
 */
const crypto = require('crypto');
const config = require('../config');
const {
  getActiveTarget,
  setActiveTarget,
  runHealthCheck,
} = require('../config/supabaseRouter');
const { runPreSwitchSync } = require('./supabaseSwitchSync');
const { verifyBackup } = require('./supabaseBackupSync');
const { getPendingCount } = require('./supabaseFailback');
const { getQueueDepth } = require('./supabaseReplication');

const COUNTDOWN_MS = Math.max(5000, parseInt(process.env.SUPABASE_SWITCH_COUNTDOWN_MS || '15000', 10));

let _pending = null;
let _switchTimer = null;
let _ioRef = null;

function setSwitchIo(io) {
  _ioRef = io || null;
}

function isBackupConfigured() {
  return !!(config.supabaseBackupUrl && config.supabaseBackupServiceKey);
}

function signPayload(obj) {
  const body = JSON.stringify(obj);
  const sig = crypto
    .createHmac('sha256', config.jwtSecret || 'supabase-switch')
    .update(body)
    .digest('hex');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [bodyB64, sig] = token.split('.');
  if (!bodyB64 || !sig) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const expected = crypto
    .createHmac('sha256', config.jwtSecret || 'supabase-switch')
    .update(JSON.stringify(payload))
    .digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    if (sig !== expected) return null;
  }
  return payload;
}

function broadcast(event, data) {
  if (!_ioRef) return;
  try {
    _ioRef.emit(event, data);
  } catch (e) {
    console.warn('[supabase-switch]', event, e.message);
  }
}

function clearPendingTimer() {
  if (_switchTimer) {
    clearTimeout(_switchTimer);
    _switchTimer = null;
  }
}

function getPendingSwitch() {
  if (!_pending) return null;
  const now = Date.now();
  if (now > _pending.exp) {
    _pending = null;
    clearPendingTimer();
    return null;
  }
  return {
    ..._pending.public,
    remaining_ms: Math.max(0, _pending.switchAt - now),
  };
}

async function executeSwitch(pending) {
  clearPendingTimer();
  const { from, target, userId } = pending;
  try {
    await setActiveTarget(target, `manual_switch:${userId || 'admin'}`, { skipSync: true });
    const status = await runHealthCheck();
    broadcast('supabase:switch-done', {
      ok: true,
      from,
      target,
      active: getActiveTarget(),
      at: new Date().toISOString(),
    });
    console.warn(`[supabase-switch] Hoàn tất chuyển ${from} → ${target}`);
    return { ok: true, active: getActiveTarget(), status };
  } catch (e) {
    broadcast('supabase:switch-cancelled', {
      reason: 'error',
      error: e.message,
      at: new Date().toISOString(),
    });
    throw e;
  } finally {
    _pending = null;
  }
}

function scheduleSwitchExecution(pending) {
  clearPendingTimer();
  const delay = Math.max(0, pending.switchAt - Date.now());
  _switchTimer = setTimeout(() => {
    void executeSwitch(pending).catch((e) => {
      console.warn('[supabase-switch] execute failed:', e.message);
    });
  }, delay);
  if (_switchTimer.unref) _switchTimer.unref();
}

/**
 * Bước 1: kiểm tra + sync log + bắt đầu đếm ngược toàn hệ thống.
 */
async function prepareManualSwitch(target, userId) {
  if (target !== 'primary' && target !== 'backup') {
    throw new Error('target phải là primary hoặc backup');
  }
  if (!isBackupConfigured()) {
    throw new Error('Chưa cấu hình SUPABASE_BACKUP_URL + SUPABASE_BACKUP_SERVICE_ROLE_KEY');
  }

  const from = getActiveTarget();
  if (from === target) {
    throw new Error(`Đang dùng ${target === 'primary' ? 'Primary' : 'Backup'} rồi`);
  }

  if (_pending && Date.now() < _pending.exp) {
    throw new Error('Đang có lịch chuyển đổi — hủy hoặc đợi hoàn tất trước');
  }

  const steps = [];
  const health = await runHealthCheck();
  steps.push({
    id: 'health',
    label: 'Kiểm tra kết nối',
    ok: target === 'primary' ? health.primary?.healthy : health.backup?.healthy,
    detail: {
      primary: health.primary?.healthy,
      backup: health.backup?.healthy,
      active: health.active,
    },
  });

  const targetHealthy = target === 'primary' ? health.primary?.healthy : health.backup?.healthy;
  if (!targetHealthy) {
    return {
      ok: false,
      error: `${target === 'primary' ? 'Primary' : 'Backup'} chưa healthy — không thể chuyển`,
      steps,
      from,
      target,
    };
  }

  let verify = null;
  try {
    verify = await verifyBackup();
    steps.push({
      id: 'drift',
      label: 'Kiểm tra drift dữ liệu',
      ok: verify.all_ok,
      detail: { rows: verify.rows, all_ok: verify.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'drift',
      label: 'Kiểm tra drift dữ liệu',
      ok: false,
      detail: { error: e.message },
    });
  }

  const replicationBefore = await getQueueDepth().catch(() => null);
  const failbackBefore = await getPendingCount().catch(() => null);

  const sync = await runPreSwitchSync(from, target);
  steps.push({
    id: 'sync',
    label: from === 'primary' ? 'Đồng bộ log primary → backup' : 'Đồng bộ log backup → primary',
    ok: sync.remaining === 0 || sync.remaining == null,
    detail: sync,
  });

  const replicationAfter = await getQueueDepth().catch(() => null);
  const failbackAfter = await getPendingCount().catch(() => null);

  const preparedAt = Date.now();
  const switchAt = preparedAt + COUNTDOWN_MS;
  const exp = switchAt + 60_000;

  const tokenPayload = {
    from,
    target,
    userId: userId || null,
    preparedAt,
    switchAt,
    exp,
  };
  const token = signPayload(tokenPayload);

  _pending = {
    ...tokenPayload,
    token,
    public: {
      from,
      target,
      prepared_at: new Date(preparedAt).toISOString(),
      switch_at: new Date(switchAt).toISOString(),
      countdown_sec: Math.round(COUNTDOWN_MS / 1000),
      token,
    },
  };

  scheduleSwitchExecution(_pending);

  broadcast('supabase:switch-countdown', {
    from,
    target,
    switch_at: new Date(switchAt).toISOString(),
    countdown_sec: Math.round(COUNTDOWN_MS / 1000),
    message: `Hệ thống sẽ chuyển sang ${target === 'primary' ? 'Primary (Chính)' : 'Backup (Dự phòng)'} sau ${Math.round(COUNTDOWN_MS / 1000)} giây — vui lòng hoàn tất thao tác đang làm.`,
  });

  return {
    ok: true,
    from,
    target,
    steps,
    verify,
    sync,
    replication: { before: replicationBefore, after: replicationAfter },
    failback: { before: failbackBefore, after: failbackAfter },
    can_switch: sync.remaining === 0 || sync.remaining == null,
    warnings: (sync.remaining > 0)
      ? [`Còn ${sync.remaining} job trong queue — đã lên lịch chuyển sau đếm ngược`]
      : [],
    countdown_sec: Math.round(COUNTDOWN_MS / 1000),
    switch_at: new Date(switchAt).toISOString(),
    token,
    pending: getPendingSwitch(),
  };
}

function cancelManualSwitch(token, userId) {
  if (!_pending) return { ok: true, cancelled: false, reason: 'no_pending' };
  if (token && _pending.token !== token) {
    const payload = verifySignedToken(token);
    if (!payload || payload.target !== _pending.target) {
      throw new Error('Token không khớp lịch chuyển đổi');
    }
  }
  clearPendingTimer();
  _pending = null;
  broadcast('supabase:switch-cancelled', {
    reason: 'cancelled',
    by: userId || null,
    at: new Date().toISOString(),
  });
  return { ok: true, cancelled: true };
}

/**
 * Xác nhận sớm (sau khi đếm ngược) — thường server đã tự chuyển; dùng khi cần chốt tay.
 */
async function confirmManualSwitch(token, userId) {
  const payload = verifySignedToken(token);
  if (!payload) throw new Error('Token chuyển đổi không hợp lệ');

  if (Date.now() < payload.switchAt) {
    const waitSec = Math.ceil((payload.switchAt - Date.now()) / 1000);
    return {
      ok: false,
      too_early: true,
      wait_sec: waitSec,
      switch_at: new Date(payload.switchAt).toISOString(),
    };
  }

  if (Date.now() > payload.exp) {
    _pending = null;
    clearPendingTimer();
    throw new Error('Token chuyển đổi đã hết hạn');
  }

  if (getActiveTarget() === payload.target) {
    _pending = null;
    clearPendingTimer();
    return { ok: true, already_switched: true, active: payload.target };
  }

  if (!_pending || _pending.token !== token) {
    await setActiveTarget(payload.target, `manual_confirm:${userId || 'admin'}`, { skipSync: true });
    return { ok: true, active: getActiveTarget(), status: await runHealthCheck() };
  }

  clearPendingTimer();
  const result = await executeSwitch(_pending);
  return { ok: true, ...result };
}

module.exports = {
  setSwitchIo,
  prepareManualSwitch,
  confirmManualSwitch,
  cancelManualSwitch,
  getPendingSwitch,
  COUNTDOWN_MS,
  isBackupConfigured,
};
