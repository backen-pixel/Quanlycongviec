/**
 * Chuyển đổi thủ công primary ↔ backup — replay log thay đổi, đếm ngược, chuyển.
 */
const crypto = require('crypto');
const config = require('../config');
const {
  getActiveTarget,
  setActiveTarget,
  runHealthCheck,
} = require('../config/supabaseRouter');
const { runPreSwitchSync, isLogSyncComplete } = require('./supabaseSwitchSync');
const { verifyBackup, runBackupSync, isJobRunning, setBackupSyncLogListener } = require('./supabaseBackupSync');
const { verifyStorageSync, runStorageSync } = require('./supabaseStorageSync');
const { getPendingCount, runFailbackReplay } = require('./supabaseFailback');
const { getQueueDepth } = require('./supabaseReplication');

const COUNTDOWN_MS = Math.max(5000, parseInt(process.env.SUPABASE_SWITCH_COUNTDOWN_MS || '15000', 10));
const QUICK_SWITCH_COUNTDOWN_MS = Math.max(
  3000,
  parseInt(process.env.SUPABASE_QUICK_SWITCH_COUNTDOWN_MS || '5000', 10),
);
const PREPARE_TOKEN_TTL_MS = 10 * 60 * 1000;

let _pending = null;
let _switchTimer = null;
let _ioRef = null;
let _prepareActivity = null;

const ACTIVITY_TTL_MS = 15 * 60 * 1000;

function isRecentIso(iso, maxMs = ACTIVITY_TTL_MS) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < maxMs;
}

function initPrepareActivity(from, target, userId) {
  const direction = from === 'primary' && target === 'backup'
    ? 'Chính → Dự phòng'
    : 'Dự phòng → Chính';
  _prepareActivity = {
    running: true,
    type: 'switch_prepare',
    phase: 'health',
    title: 'Chuẩn bị chuyển database',
    message: 'Đang kiểm tra kết nối Primary và Backup…',
    from,
    target,
    direction,
    steps: [],
    log: [],
    sync_parts: [],
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    userId: userId || null,
  };
  broadcast('supabase:switch-prepare-start', {
    from,
    target,
    direction,
    message: _prepareActivity.message,
    at: _prepareActivity.started_at,
  });
}

function pushPrepareLog(line) {
  if (!_prepareActivity || !line) return;
  const entry = { at: new Date().toISOString(), line: String(line).slice(0, 500) };
  _prepareActivity.log = [...(_prepareActivity.log || []), entry].slice(-150);
  _prepareActivity.message = String(line).slice(0, 300);
  _prepareActivity.updated_at = entry.at;
}

function syncPrepareSteps(steps, extra = {}) {
  if (!_prepareActivity) return;
  const publicSteps = (steps || []).map((s) => ({
    id: s.id,
    label: s.label,
    ok: s.ok,
    running: !!s.detail?.running,
    error: s.detail?.error || null,
  }));
  const running = publicSteps.find((s) => s.running)
    || publicSteps.find((s) => s.ok === false)
    || publicSteps[publicSteps.length - 1];
  const fullSync = (steps || []).find((s) => s.id === 'full_sync');
  const syncParts = [];
  if (fullSync?.detail?.needDb) syncParts.push('DB');
  if (fullSync?.detail?.needStorage) syncParts.push('Storage/bucket');
  if (fullSync?.detail?.running && syncParts.length) {
    _prepareActivity.sync_parts = syncParts;
  }
  Object.assign(_prepareActivity, {
    steps: publicSteps,
    phase: extra.phase || running?.id || _prepareActivity.phase,
    message: extra.message || running?.label || _prepareActivity.message,
    updated_at: new Date().toISOString(),
    ...extra,
  });
  broadcast('supabase:switch-prepare-update', {
    from: _prepareActivity.from,
    target: _prepareActivity.target,
    direction: _prepareActivity.direction,
    phase: _prepareActivity.phase,
    message: _prepareActivity.message,
    sync_parts: _prepareActivity.sync_parts,
    steps: _prepareActivity.steps,
    at: _prepareActivity.updated_at,
  });
}

function finishPrepareActivity({ ok, error, sync_verified_100 } = {}) {
  if (!_prepareActivity) return;
  _prepareActivity.running = false;
  _prepareActivity.status = ok ? 'done' : 'error';
  _prepareActivity.error = error || null;
  _prepareActivity.sync_verified_100 = sync_verified_100 === true;
  _prepareActivity.finished_at = new Date().toISOString();
  _prepareActivity.message = ok
    ? 'Đã đồng bộ dữ liệu thành công 100%'
    : (error || 'Chuẩn bị chuyển thất bại');
  _prepareActivity.updated_at = _prepareActivity.finished_at;
  const finishedAt = _prepareActivity.finished_at;
  setTimeout(() => {
    if (_prepareActivity && !_prepareActivity.running && _prepareActivity.finished_at === finishedAt) {
      _prepareActivity = null;
    }
  }, ACTIVITY_TTL_MS);
}

function getPrepareActivityPublic() {
  if (!_prepareActivity) return null;
  if (_prepareActivity.running || isRecentIso(_prepareActivity.finished_at)) {
    const { userId, ...safe } = _prepareActivity;
    return {
      ...safe,
      log: (_prepareActivity.log || []).slice(-80),
      steps: (_prepareActivity.steps || []).slice(-20),
    };
  }
  return null;
}

function getPublicSyncActivity() {
  const { getBackupJobPublicSnapshot } = require('./supabaseBackupSync');
  const backup = getBackupJobPublicSnapshot();
  const prepare = getPrepareActivityPublic();
  const pending = getPublicPendingSwitch();
  let active = null;
  if (prepare?.running) active = prepare;
  else if (backup?.running) active = backup;
  else if (prepare) active = prepare;
  else if (backup) active = backup;
  return { active, pending_countdown: pending };
}

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

function getPublicPendingSwitch() {
  const p = getPendingSwitch();
  if (!p) return null;
  const { token, ...safe } = p;
  return safe;
}

async function runPostSwitchSync(from, target, userId) {
  const direction = from === 'primary' && target === 'backup'
    ? 'Chính → Dự phòng'
    : 'Dự phòng → Chính';
  console.warn(`[supabase-switch] Replay log sau chuyển: ${direction}`);
  broadcast('supabase:switch-full-sync-start', {
    from,
    target,
    direction,
    post_sync: true,
    sync_mode: 'log',
    message: `Đang replay log thay đổi (${direction})…`,
    at: new Date().toISOString(),
  });

  const onLog = (line) => {
    pushPrepareLog(line);
    broadcast('supabase:switch-full-sync-progress', {
      line,
      from,
      target,
      at: new Date().toISOString(),
    });
  };

  try {
    const { runLogBasedSwitchSync } = require('./supabaseSwitchSync');
    const result = await runLogBasedSwitchSync(from, target, { force: from === 'primary', onLog });
    if (result.remaining > 0) {
      onLog(`Còn ${result.remaining} job trong log — chạy thêm lần đồng bộ hoặc bật replication`);
    } else if (result.processed > 0) {
      onLog(`Hoàn tất replay log: ${result.processed} thao tác`);
    } else {
      onLog('Không có thay đổi mới trong log');
    }
    broadcast('supabase:switch-full-sync-done', {
      from,
      target,
      direction,
      post_sync: true,
      sync_mode: 'log',
      remaining: result.remaining,
      processed: result.processed,
      at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[supabase-switch] post-sync log failed:', e.message);
    broadcast('supabase:switch-full-sync-error', {
      error: e.message,
      from,
      target,
      post_sync: true,
      at: new Date().toISOString(),
    });
  }
}

async function executeSwitch(pending) {
  clearPendingTimer();
  const { from, target, userId, sync_after: syncAfter } = pending;
  try {
    await setActiveTarget(target, `manual_switch:${userId || 'admin'}`, { skipSync: true });
    const status = await runHealthCheck();
    broadcast('supabase:switch-done', {
      ok: true,
      from,
      target,
      active: getActiveTarget(),
      sync_after: !!syncAfter,
      at: new Date().toISOString(),
    });
    console.warn(`[supabase-switch] Hoàn tất chuyển ${from} → ${target}`);
    if (syncAfter) {
      void runPostSwitchSync(from, target, userId);
    }
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

function buildSyncIssues({ verify, storageVerify, sync, replicationAfter, failbackAfter }) {
  const issues = [];
  if (verify && !verify.all_ok) {
    const bad = (verify?.rows || []).filter((r) => !r.ok);
    if (bad.length) {
      issues.push(`Drift DB: ${bad.map((r) => `${r.table} (${r.primary} vs ${r.backup})`).join(', ')}`);
    } else {
      issues.push('Drift DB — bảng mẫu chưa khớp 100%');
    }
  }
  if (storageVerify && !storageVerify.all_ok) {
    const bad = (storageVerify.rows || []).filter((r) => !r.ok);
    if (bad.length) {
      issues.push(`Bucket thiếu file: ${bad.map((r) => `${r.bucket} (thiếu ${r.missing_on_dest}/${r.source_count})`).join(', ')}`);
    } else {
      issues.push('Storage bucket chưa khớp 100%');
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

function isFullySynced({ verify, storageVerify, sync, replicationAfter, failbackAfter }) {
  const logOk = (sync?.remaining === 0 || sync?.remaining == null)
    && (replicationAfter === 0 || replicationAfter == null)
    && (failbackAfter === 0 || failbackAfter == null);
  const storageOk = storageVerify == null || storageVerify.all_ok === true;
  return verify?.all_ok === true && storageOk && logOk;
}

async function runAutoFullSyncForSwitch(from, target, userId, { needDb = true, needStorage = true } = {}) {
  if (isJobRunning()) {
    throw new Error('Đang có job đồng bộ backup khác — vui lòng đợi xong');
  }

  const direction = from === 'primary' && target === 'backup'
    ? 'Chính → Dự phòng'
    : 'Dự phòng → Chính';

  const parts = [];
  if (needDb) parts.push('DB');
  if (needStorage) parts.push('Storage/bucket');

  broadcast('supabase:switch-full-sync-start', {
    from,
    target,
    direction,
    message: `Đang đồng bộ ${parts.join(' + ') || 'dữ liệu'} (${direction})…`,
    at: new Date().toISOString(),
  });

  if (_prepareActivity) {
    Object.assign(_prepareActivity, {
      phase: 'full_sync',
      message: `Đang đồng bộ ${parts.join(' + ') || 'dữ liệu'} (${direction})…`,
      sync_parts: parts,
      updated_at: new Date().toISOString(),
    });
  }

  const onLog = (line) => {
    pushPrepareLog(line);
    broadcast('supabase:switch-full-sync-progress', {
      line,
      from,
      target,
      at: new Date().toISOString(),
    });
  };

  setBackupSyncLogListener(onLog);

  try {
    if (from === 'primary' && target === 'backup') {
      if (needDb) {
        const { runIncrementalDbSyncPrimaryToBackup } = require('./supabaseIncrementalDbSync');
        onLog('Đồng bộ DB incremental (log + bảng lệch)…');
        const inc = await runIncrementalDbSyncPrimaryToBackup({ onLog });
        if (!inc.ok) {
          if (inc.full_clone_required && process.env.SUPABASE_BACKUP_ALLOW_FULL_CLONE === '1') {
            onLog('Incremental chưa đủ — clone full DB…');
            setBackupSyncLogListener(onLog);
            await runBackupSync({
              includeDb: true,
              includeStorage: false,
              verifyBefore: false,
              verifyAfter: false,
              userId: userId ? `switch:${userId}` : 'switch',
            });
          } else {
            const names = (inc.drifted || []).map((r) => r.table).join(', ');
            throw new Error(names ? `DB vẫn lệch: ${names}` : (inc.error || 'Đồng bộ DB thất bại'));
          }
        }
      }
      if (needStorage) {
        setBackupSyncLogListener(null);
        onLog('Đồng bộ Storage (chỉ file mới/khác)…');
        await runStorageSync({ from, to: target, onLog });
      }
    } else {
      let remaining = await getPendingCount().catch(() => 0);
      if (remaining > 0) {
        try {
          let rounds = 0;
          while (remaining > 0 && rounds < 15) {
            rounds += 1;
            onLog(`Replay failback vòng ${rounds} — còn ${remaining} job…`);
            const r = await runFailbackReplay({ limit: 500 });
            remaining = r?.remaining ?? 0;
            if (r?.applied === 0 && remaining > 0) break;
          }
        } catch (e) {
          onLog(`Failback: ${e.message} — tiếp tục sync log…`);
        }
      }
      for (let i = 0; i < 3; i += 1) {
        await runPreSwitchSync(from, target);
      }
      if (needStorage) {
        setBackupSyncLogListener(null);
        await runStorageSync({ from, to: target, onLog });
      }
    }
  } finally {
    setBackupSyncLogListener(null);
  }

  broadcast('supabase:switch-full-sync-done', {
    from,
    target,
    direction,
    at: new Date().toISOString(),
  });
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

  initPrepareActivity(from, target, userId);
  const steps = [];
  const trackSteps = (extra) => syncPrepareSteps(steps, extra);

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
  trackSteps({ phase: 'health' });

  const targetHealthy = target === 'primary' ? health.primary?.healthy : health.backup?.healthy;
  if (!targetHealthy) {
    trackSteps();
    finishPrepareActivity({
      ok: false,
      error: `${target === 'primary' ? 'Primary' : 'Backup'} chưa healthy — không thể chuyển`,
    });
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
  let storageVerifyBefore = null;
  try {
    verifyBefore = await verifyBackup();
    steps.push({
      id: 'drift_before',
      label: 'Kiểm tra drift DB (trước sync)',
      ok: verifyBefore.all_ok,
      detail: { rows: verifyBefore.rows, all_ok: verifyBefore.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'drift_before',
      label: 'Kiểm tra drift DB (trước sync)',
      ok: false,
      detail: { error: e.message },
    });
  }

  try {
    storageVerifyBefore = await verifyStorageSync(from, target);
    steps.push({
      id: 'storage_before',
      label: 'Kiểm tra bucket Storage (trước sync)',
      ok: storageVerifyBefore.all_ok,
      detail: { rows: storageVerifyBefore.rows, all_ok: storageVerifyBefore.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'storage_before',
      label: 'Kiểm tra bucket Storage (trước sync)',
      ok: false,
      detail: { error: e.message },
    });
  }
  trackSteps({ phase: 'sync', message: 'Đang đồng bộ log thay đổi…' });

  const replicationBefore = await getQueueDepth().catch(() => null);
  const failbackBefore = await getPendingCount().catch(() => null);

  let sync = await runPreSwitchSync(from, target);
  steps.push({
    id: 'sync',
    label: from === 'primary' ? 'Đồng bộ log primary → backup' : 'Đồng bộ log backup → primary',
    ok: sync.remaining === 0 || sync.remaining == null,
    detail: sync,
  });
  trackSteps({ phase: 'sync' });

  let extraRound = 0;
  while (sync.remaining > 0 && extraRound < 2) {
    extraRound += 1;
    sync = await runPreSwitchSync(from, target);
  }

  let replicationAfter = await getQueueDepth().catch(() => 0);
  let failbackAfter = await getPendingCount().catch(() => 0);

  let verifyAfter = null;
  let storageVerifyAfter = null;
  try {
    verifyAfter = await verifyBackup();
    steps.push({
      id: 'drift_after',
      label: 'Kiểm tra drift DB (sau sync log)',
      ok: verifyAfter.all_ok,
      detail: { rows: verifyAfter.rows, all_ok: verifyAfter.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'drift_after',
      label: 'Kiểm tra drift DB (sau sync log)',
      ok: false,
      detail: { error: e.message },
    });
  }

  try {
    storageVerifyAfter = await verifyStorageSync(from, target);
    steps.push({
      id: 'storage_after',
      label: 'Kiểm tra bucket Storage (sau sync log)',
      ok: storageVerifyAfter.all_ok,
      detail: { rows: storageVerifyAfter.rows, all_ok: storageVerifyAfter.all_ok },
    });
  } catch (e) {
    steps.push({
      id: 'storage_after',
      label: 'Kiểm tra bucket Storage (sau sync log)',
      ok: false,
      detail: { error: e.message },
    });
  }
  trackSteps({ phase: 'drift_after' });

  let syncVerified100 = isLogSyncComplete({
    sync,
    replicationAfter,
    failbackAfter,
  });

  if (!syncVerified100) {
    steps.push({
      id: 'log_sync',
      label: `Replay log thay đổi ${from} → ${target}`,
      ok: false,
      detail: { running: true, remaining: sync?.remaining ?? replicationAfter ?? failbackAfter },
    });
    trackSteps({ phase: 'log_sync' });

    try {
      const { runLogBasedSwitchSync } = require('./supabaseSwitchSync');
      const onLog = (line) => {
        pushPrepareLog(line);
        broadcast('supabase:switch-full-sync-progress', {
          line,
          from,
          target,
          at: new Date().toISOString(),
        });
      };
      broadcast('supabase:switch-full-sync-start', {
        from,
        target,
        direction: from === 'primary' ? 'Chính → Dự phòng' : 'Dự phòng → Chính',
        sync_mode: 'log',
        message: `Đang replay log thay đổi…`,
        at: new Date().toISOString(),
      });

      await runLogBasedSwitchSync(from, target, { onLog, force: false });

      sync = await runPreSwitchSync(from, target);
      extraRound = 0;
      while (sync.remaining > 0 && extraRound < 3) {
        extraRound += 1;
        sync = await runPreSwitchSync(from, target);
      }
      replicationAfter = await getQueueDepth().catch(() => 0);
      failbackAfter = await getPendingCount().catch(() => 0);

      steps[steps.length - 1] = {
        ...steps[steps.length - 1],
        ok: isLogSyncComplete({ sync, replicationAfter, failbackAfter }),
        detail: {
          running: false,
          remaining: sync?.remaining ?? replicationAfter ?? failbackAfter,
        },
      };

      broadcast('supabase:switch-full-sync-done', {
        from,
        target,
        sync_mode: 'log',
        at: new Date().toISOString(),
      });
    } catch (e) {
      steps[steps.length - 1] = {
        ...steps[steps.length - 1],
        ok: false,
        detail: { running: false, error: e.message },
      };
      broadcast('supabase:switch-full-sync-error', {
        error: e.message,
        from,
        target,
        at: new Date().toISOString(),
      });
    }
    trackSteps({ phase: 'verify_final' });

    syncVerified100 = isLogSyncComplete({
      sync,
      replicationAfter,
      failbackAfter,
    });

    if (!syncVerified100 && process.env.SUPABASE_BACKUP_ALLOW_FULL_CLONE === '1') {
      const needDb = verifyAfter?.all_ok !== true;
      const needStorage = storageVerifyAfter?.all_ok !== true;
      steps.push({
        id: 'full_sync',
        label: `Fallback clone full (log chưa đủ) ${from} → ${target}`,
        ok: false,
        detail: { running: true, needDb, needStorage },
      });
      trackSteps({ phase: 'full_sync' });
      try {
        await runAutoFullSyncForSwitch(from, target, userId, { needDb, needStorage });
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          ok: true,
          detail: { running: false, completed: true },
        };
        sync = await runPreSwitchSync(from, target);
        replicationAfter = await getQueueDepth().catch(() => 0);
        failbackAfter = await getPendingCount().catch(() => 0);
        syncVerified100 = isLogSyncComplete({ sync, replicationAfter, failbackAfter });
      } catch (e) {
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          ok: false,
          detail: { running: false, error: e.message },
        };
      }
    }
  }

  steps.push({
    id: 'verify_final',
    label: 'Xác nhận log đồng bộ',
    ok: syncVerified100,
    detail: {
      drift_ok: verifyAfter?.all_ok === true,
      storage_ok: storageVerifyAfter?.all_ok === true,
      log_queue_ok: syncVerified100,
      log_remaining: sync?.remaining ?? replicationAfter ?? failbackAfter,
      replication_ok: replicationAfter === 0,
      failback_ok: failbackAfter === 0,
    },
  });
  trackSteps({ phase: 'verify_final' });

  const issues = buildSyncIssues({
    verify: verifyAfter,
    storageVerify: storageVerifyAfter,
    sync,
    replicationAfter,
    failbackAfter,
  });

  if (!syncVerified100) {
    trackSteps();
    const logIssues = buildSyncIssues({
      verify: null,
      storageVerify: null,
      sync,
      replicationAfter,
      failbackAfter,
    });
    finishPrepareActivity({
      ok: false,
      error: logIssues.length
        ? `Log chưa replay hết — ${logIssues.join(' · ')}`
        : 'Log chưa replay hết',
    });
    return {
      ok: false,
      sync_verified_100: false,
      error: logIssues.length
        ? `Log chưa replay hết — ${logIssues.join(' · ')}`
        : 'Log chưa replay hết',
      steps,
      from,
      target,
      verify: verifyAfter,
      storage_verify: storageVerifyAfter,
      verify_before: verifyBefore,
      storage_verify_before: storageVerifyBefore,
      sync,
      replication: { before: replicationBefore, after: replicationAfter },
      failback: { before: failbackBefore, after: failbackAfter },
      issues,
    };
  }

  broadcast('supabase:switch-sync-ready', {
    from,
    target,
    message: 'Log thay đổi đã replay xong',
    at: new Date().toISOString(),
  });

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

  trackSteps();
  finishPrepareActivity({ ok: true, sync_verified_100: true });
  return {
    ok: true,
    sync_verified_100: true,
    message: 'Log thay đổi đã replay xong',
    from,
    target,
    steps,
    verify: verifyAfter,
    storage_verify: storageVerifyAfter,
    verify_before: verifyBefore,
    storage_verify_before: storageVerifyBefore,
    sync,
    replication: { before: replicationBefore, after: replicationAfter },
    failback: { before: failbackBefore, after: failbackAfter },
    prepare_token,
    prepare_expires_at: new Date(prepareTokenPayload.exp).toISOString(),
    countdown_sec: Math.round(COUNTDOWN_MS / 1000),
    countdown_started: false,
    ready_to_switch: true,
  };
}

function beginSwitchCountdown({
  from,
  target,
  userId,
  syncVerified100 = false,
  syncAfter = false,
  countdownMs = COUNTDOWN_MS,
} = {}) {
  const preparedAt = Date.now();
  const switchAt = preparedAt + countdownMs;
  const exp = switchAt + 60_000;

  const switchRoute = from === 'primary' && target === 'backup'
    ? 'Chính → Dự phòng'
    : 'Dự phòng → Chính';
  const countdownSec = Math.round(countdownMs / 1000);

  const tokenPayload = {
    type: 'switch',
    from,
    target,
    userId: userId || null,
    preparedAt,
    switchAt,
    exp,
    sync_verified_100: syncVerified100 === true,
    sync_after: syncAfter === true,
  };
  const token = signPayload(tokenPayload);

  _pending = {
    ...tokenPayload,
    token,
    public: {
      from,
      target,
      direction: switchRoute,
      prepared_at: new Date(preparedAt).toISOString(),
      switch_at: new Date(switchAt).toISOString(),
      countdown_sec: countdownSec,
      token,
      sync_verified_100: syncVerified100 === true,
      sync_after: syncAfter === true,
      quick_switch: syncAfter === true,
    },
  };

  scheduleSwitchExecution(_pending);

  const countdownMessage = syncAfter
    ? `Chuyển ${switchRoute} sau ${countdownSec}s — đồng bộ sẽ chạy sau khi chuyển. Vui lòng hoàn tất thao tác đang làm.`
    : `Đã đồng bộ 100% — chuyển ${switchRoute} sau ${countdownSec} giây. Vui lòng hoàn tất thao tác đang làm.`;

  if (!syncAfter) {
    broadcast('supabase:switch-sync-ready', {
      from,
      target,
      message: 'Log thay đổi đã replay xong',
      at: new Date().toISOString(),
    });
  }

  broadcast('supabase:switch-countdown', {
    from,
    target,
    direction: switchRoute,
    switch_at: new Date(switchAt).toISOString(),
    countdown_sec: countdownSec,
    sync_verified_100: syncVerified100 === true,
    sync_after: syncAfter === true,
    quick_switch: syncAfter === true,
    message: countdownMessage,
  });

  console.warn(`[supabase-switch] Đếm ngược ${countdownSec}s: ${switchRoute}${syncAfter ? ' (đồng bộ sau)' : ''}`);

  return {
    ok: true,
    sync_verified_100: syncVerified100 === true,
    sync_after: syncAfter === true,
    message: syncAfter
      ? `Chuyển ${switchRoute} sau ${countdownSec}s — đồng bộ nền sau khi chuyển`
      : 'Đã đồng bộ dữ liệu thành công 100%',
    from,
    target,
    countdown_sec: countdownSec,
    switch_at: new Date(switchAt).toISOString(),
    token,
    pending: getPendingSwitch(),
  };
}

/**
 * Chuyển nhanh: chỉ kiểm tra kết nối đích, đếm ngược 5s, đồng bộ nền sau khi chuyển.
 */
async function startQuickSwitch(target, userId) {
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

  const health = await runHealthCheck();
  const targetHealthy = target === 'primary' ? health.primary?.healthy : health.backup?.healthy;
  if (!targetHealthy) {
    throw new Error(`${target === 'primary' ? 'Primary' : 'Backup'} chưa healthy — không thể chuyển`);
  }

  return beginSwitchCountdown({
    from,
    target,
    userId,
    syncVerified100: false,
    syncAfter: true,
    countdownMs: QUICK_SWITCH_COUNTDOWN_MS,
  });
}

/**
 * Bước 2: sau thông báo 100% — bắt đầu đếm ngược + broadcast toàn hệ thống.
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
  if (payload.userId && userId && String(payload.userId) !== String(userId)) {
    throw new Error('Token không thuộc phiên admin hiện tại');
  }

  const { from, target } = payload;
  if (getActiveTarget() !== from) {
    throw new Error(`Database đang dùng đã đổi (${getActiveTarget()}) — kiểm tra lại từ đầu`);
  }
  if (_pending && Date.now() < _pending.exp) {
    throw new Error('Đang có lịch chuyển đổi — hủy hoặc đợi hoàn tất');
  }

  const freshPrepare = payload.preparedAt && (Date.now() - payload.preparedAt < 120_000);
  const skipReverify = freshPrepare || process.env.PG_POOL_DISABLED === '1';

  if (!skipReverify) {
    let verify = null;
    try {
      verify = await verifyBackup();
    } catch (e) {
      throw new Error(`Không kiểm tra lại drift DB: ${e.message}`);
    }
    let storageVerify = null;
    try {
      storageVerify = await verifyStorageSync(from, target);
    } catch (e) {
      console.warn('[supabase-switch] storage verify before countdown:', e.message);
    }
    const replicationAfter = await getQueueDepth().catch(() => 0);
    const failbackAfter = await getPendingCount().catch(() => 0);
    if (!isFullySynced({
      verify,
      storageVerify,
      sync: { remaining: 0 },
      replicationAfter,
      failbackAfter,
    })) {
      const issues = buildSyncIssues({
        verify,
        storageVerify,
        sync: { remaining: 0 },
        replicationAfter,
        failbackAfter,
      });
      throw new Error(`Dữ liệu thay đổi sau khi kiểm tra — ${issues.join(' · ')}`);
    }
  } else {
    console.warn('[supabase-switch] Bỏ qua kiểm tra lại trước countdown (token mới hoặc PG_POOL_DISABLED)');
  }

  return beginSwitchCountdown({
    from,
    target,
    userId,
    syncVerified100: true,
    syncAfter: false,
    countdownMs: COUNTDOWN_MS,
  });
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
  startQuickSwitch,
  startSwitchCountdown,
  confirmManualSwitch,
  cancelManualSwitch,
  getPendingSwitch,
  getPublicPendingSwitch,
  getPublicSyncActivity,
  COUNTDOWN_MS,
  QUICK_SWITCH_COUNTDOWN_MS,
  isBackupConfigured,
};
