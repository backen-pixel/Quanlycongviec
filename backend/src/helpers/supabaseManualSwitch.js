/**
 * Chuyển đổi thủ công primary ↔ backup — kiểm tra drift, sync log, xác nhận 100%, đếm ngược, chuyển.
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
const PREPARE_TOKEN_TTL_MS = 10 * 60 * 1000;

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

function buildSyncIssues({ verify, sync, replicationAfter, failbackAfter }) {
  const issues = [];
  if (!verify?.all_ok) {
    const bad = (verify?.rows || []).filter((r) => !r.ok);
    if (bad.length) {
      issues.push(`Drift dữ liệu: ${bad.map((r) => `${r.table} (${r.primary} vs ${r.backup})`).join(', ')}`);
    } else {
      issues.push('Drift dữ liệu — bảng mẫu chưa khớp 100%');
    }
  }
  if (sync?.remaining > 0) {
    issues.push(`Queue sync log còn ${sync.remaining} job`);
  }
  if (replicationAfter > 0) {
    issues.push(`Replication queue còn ${replicationAfter} job`);
  }
  if (failbackAfter > 0) {
    issues.push(`Failback log còn ${failbackAfter} job chưa replay`);
  }
  return issues;
}

function isFullySynced({ verify, sync, replicationAfter, failbackAfter }) {
  const logOk = (sync?.remaining === 0 || sync?.remaining == null)
    && (replicationAfter === 0 || replicationAfter == null)
    && (failbackAfter === 0 || failbackAfter == null);
  return verify?.all_ok === true && logOk;
}

/**
 * Bước 1: kiểm tra + sync log — KHÔNG đếm ngược. Chỉ trả prepare_token khi 100%.
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
      sync_verified_100: false,
      error: `${target === 'primary' ? 'Primary' : 'Backup'} chưa healthy — không thể chuyển`,
      steps,
      from,
      target,
    };
  }

  let verifyBefore = null;
  try {
    verifyBefore = await verifyBackup();
    steps.push({
      id: 'drift_before',
      label: 'Kiểm tra drift (trước sync)',
      ok: verifyBefore.all_ok,
      detail: { rows: verifyBefore.rows, all_ok: verifyBefore.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'drift_before',
      label: 'Kiểm tra drift (trước sync)',
      ok: false,
      detail: { error: e.message },
    });
  }

  const replicationBefore = await getQueueDepth().catch(() => null);
  const failbackBefore = await getPendingCount().catch(() => null);

  let sync = await runPreSwitchSync(from, target);
  steps.push({
    id: 'sync',
    label: from === 'primary' ? 'Đồng bộ log primary → backup' : 'Đồng bộ log backup → primary',
    ok: sync.remaining === 0 || sync.remaining == null,
    detail: sync,
  });

  // Retry sync nếu còn job (tối đa thêm 2 vòng)
  let extraRound = 0;
  while (sync.remaining > 0 && extraRound < 2) {
    extraRound += 1;
    sync = await runPreSwitchSync(from, target);
  }

  const replicationAfter = await getQueueDepth().catch(() => 0);
  const failbackAfter = await getPendingCount().catch(() => 0);

  let verifyAfter = null;
  try {
    verifyAfter = await verifyBackup();
    steps.push({
      id: 'drift_after',
      label: 'Kiểm tra drift (sau sync)',
      ok: verifyAfter.all_ok,
      detail: { rows: verifyAfter.rows, all_ok: verifyAfter.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'drift_after',
      label: 'Kiểm tra drift (sau sync)',
      ok: false,
      detail: { error: e.message },
    });
  }

  const syncVerified100 = isFullySynced({
    verify: verifyAfter,
    sync,
    replicationAfter,
    failbackAfter,
  });

  steps.push({
    id: 'verify_final',
    label: 'Xác nhận đồng bộ 100%',
    ok: syncVerified100,
    detail: {
      drift_ok: verifyAfter?.all_ok === true,
      log_queue_ok: (sync?.remaining || 0) === 0,
      replication_ok: replicationAfter === 0,
      failback_ok: failbackAfter === 0,
    },
  });

  const issues = buildSyncIssues({
    verify: verifyAfter,
    sync,
    replicationAfter,
    failbackAfter,
  });

  if (!syncVerified100) {
    return {
      ok: false,
      sync_verified_100: false,
      error: issues.length
        ? `Chưa đồng bộ 100% — ${issues.join(' · ')}`
        : 'Chưa đồng bộ 100% — chạy «Chạy đồng bộ ngay» rồi thử lại',
      steps,
      from,
      target,
      verify: verifyAfter,
      verify_before: verifyBefore,
      sync,
      replication: { before: replicationBefore, after: replicationAfter },
      failback: { before: failbackBefore, after: failbackAfter },
      issues,
    };
  }

  const preparedAt = Date.now();
  const prepareTokenPayload = {
    type: 'prepare',
    from,
    target,
    userId: userId || null,
    preparedAt,
    exp: preparedAt + PREPARE_TOKEN_TTL_MS,
    sync_verified_100: true,
  };
  const prepare_token = signPayload(prepareTokenPayload);

  return {
    ok: true,
    sync_verified_100: true,
    message: 'Đã đồng bộ dữ liệu thành công 100%',
    from,
    target,
    steps,
    verify: verifyAfter,
    verify_before: verifyBefore,
    sync,
    replication: { before: replicationBefore, after: replicationAfter },
    failback: { before: failbackBefore, after: failbackAfter },
    prepare_token,
    prepare_expires_at: new Date(prepareTokenPayload.exp).toISOString(),
    countdown_sec: Math.round(COUNTDOWN_MS / 1000),
  };
}

/**
 * Bước 2: sau thông báo 100% — bắt đầu đếm ngược 15s + broadcast toàn hệ thống.
 */
async function startSwitchCountdown(prepareToken, userId) {
  const payload = verifySignedToken(prepareToken);
  if (!payload || payload.type !== 'prepare') {
    throw new Error('Token chuẩn bị không hợp lệ');
  }
  if (Date.now() > payload.exp) {
    throw new Error('Token chuẩn bị đã hết hạn — kiểm tra lại từ đầu');
  }
  if (!payload.sync_verified_100) {
    throw new Error('Chưa xác nhận đồng bộ 100%');
  }
  if (payload.userId && userId && payload.userId !== userId) {
    throw new Error('Token không thuộc phiên admin hiện tại');
  }

  const { from, target } = payload;
  if (getActiveTarget() !== from) {
    throw new Error(`Database đang dùng đã đổi (${getActiveTarget()}) — kiểm tra lại từ đầu`);
  }
  if (_pending && Date.now() < _pending.exp) {
    throw new Error('Đang có lịch chuyển đổi — hủy hoặc đợi hoàn tất');
  }

  // Kiểm tra lại nhanh trước countdown
  const verify = await verifyBackup();
  const replicationAfter = await getQueueDepth().catch(() => 0);
  const failbackAfter = await getPendingCount().catch(() => 0);
  if (!isFullySynced({ verify, sync: { remaining: 0 }, replicationAfter, failbackAfter })) {
    const issues = buildSyncIssues({ verify, sync: { remaining: 0 }, replicationAfter, failbackAfter });
    throw new Error(`Dữ liệu thay đổi sau khi kiểm tra — ${issues.join(' · ')}`);
  }

  const preparedAt = Date.now();
  const switchAt = preparedAt + COUNTDOWN_MS;
  const exp = switchAt + 60_000;

  const tokenPayload = {
    type: 'switch',
    from,
    target,
    userId: userId || null,
    preparedAt,
    switchAt,
    exp,
    sync_verified_100: true,
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
      sync_verified_100: true,
    },
  };

  scheduleSwitchExecution(_pending);

  broadcast('supabase:switch-sync-ready', {
    from,
    target,
    message: 'Đã đồng bộ dữ liệu thành công 100%',
    at: new Date().toISOString(),
  });

  broadcast('supabase:switch-countdown', {
    from,
    target,
    switch_at: new Date(switchAt).toISOString(),
    countdown_sec: Math.round(COUNTDOWN_MS / 1000),
    sync_verified_100: true,
    message: `Đã đồng bộ 100% — chuyển sang ${target === 'primary' ? 'Primary (Chính)' : 'Backup (Dự phòng)'} sau ${Math.round(COUNTDOWN_MS / 1000)} giây. Vui lòng hoàn tất thao tác đang làm.`,
  });

  return {
    ok: true,
    sync_verified_100: true,
    message: 'Đã đồng bộ dữ liệu thành công 100%',
    from,
    target,
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
  startSwitchCountdown,
  confirmManualSwitch,
  cancelManualSwitch,
  getPendingSwitch,
  COUNTDOWN_MS,
  isBackupConfigured,
};
