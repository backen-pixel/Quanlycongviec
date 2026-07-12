/**
 * Supabase router — primary/backup failover với state đồng bộ qua Redis (multi-instance).
 *
 * Env:
 *   SUPABASE_FAILOVER_ENABLED=1 — backup client + chuyển DB thủ công
 *   SUPABASE_AUTO_FAILOVER=1     — tự chuyển khi probe/fetch lỗi (mặc định tắt)
 *   SUPABASE_BACKUP_URL, SUPABASE_BACKUP_SERVICE_ROLE_KEY
 *   SUPABASE_HEALTH_INTERVAL_MS (default 15000)
 *   SUPABASE_FAIL_THRESHOLD (default 3)
 *   SUPABASE_AUTO_FAILBACK=1  — tự quay primary khi hồi phục (mặc định tắt)
 */

const { createClient } = require('@supabase/supabase-js');
const { fetch: undiciFetch } = require('undici');
const config = require('./index');
const { supabaseDispatcher } = require('./httpAgents');
const { getRedisIfReady } = require('./redis');

const REDIS_ACTIVE_KEY = 'supabase:active_target';

let _primaryClient = null;
let _backupClient = null;
let _activeTarget = 'primary';
let _primaryFailStreak = 0;
let _recoveryStreak = 0;
let _healthTimer = null;

const _health = {
  active: 'primary',
  failover_enabled: false,
  failover_count: 0,
  last_failover_at: null,
  primary: { healthy: null, latency_ms: null, last_check: null, error: null, configured: true },
  backup: { healthy: null, latency_ms: null, last_check: null, error: null, configured: false },
};

function trimBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function isFailoverEnabled() {
  return !!(
    config.supabaseFailoverEnabled
    && config.supabaseBackupUrl
    && config.supabaseBackupServiceKey
  );
}

/** Chuyển DB tự động (health_probe / runtime_fetch) — tách khỏi failover thủ công. */
function isAutoFailoverEnabled() {
  return isFailoverEnabled() && config.supabaseAutoFailoverEnabled === true;
}

function isRetryableFetchError(err) {
  const msg = String(err?.message || err);
  const causeMsg = err?.cause != null ? String(err.cause?.message || err.cause) : '';
  return (
    msg.includes('fetch failed')
    || msg.includes('ECONNRESET')
    || msg.includes('ETIMEDOUT')
    || msg.includes('ECONNREFUSED')
    || msg.includes('ENOTFOUND')
    || msg.includes('UND_ERR')
    || causeMsg.includes('ECONNRESET')
    || causeMsg.includes('ETIMEDOUT')
    || causeMsg.includes('UND_ERR')
  );
}

function rewriteUrlForActive(url) {
  const primary = trimBase(config.supabaseUrl);
  const backup = trimBase(config.supabaseBackupUrl);
  const s = String(url);
  if (!isFailoverEnabled() || !primary || !backup) return s;
  if (_activeTarget === 'backup' && s.startsWith(primary)) {
    return backup + s.slice(primary.length);
  }
  if (_activeTarget === 'primary' && s.startsWith(backup)) {
    return primary + s.slice(backup.length);
  }
  return s;
}

async function syncActiveFromRedis() {
  const redis = getRedisIfReady();
  if (!redis) return;
  try {
    const v = await redis.get(REDIS_ACTIVE_KEY);
    if (v === 'primary' || v === 'backup') _activeTarget = v;
  } catch { /* ignore */ }
}

async function setActiveTarget(target, reason, opts = {}) {
  if (target !== 'primary' && target !== 'backup') return;
  const prev = _activeTarget;
  if (prev === target) return;

  const skipSync = opts.skipSync === true;
  let switchSync = null;
  if (!skipSync && isFailoverEnabled()) {
    try {
      const { runPreSwitchSync } = require('../helpers/supabaseSwitchSync');
      switchSync = await runPreSwitchSync(prev, target);
    } catch (e) {
      console.warn('[supabase-switch-sync] Lỗi:', e.message);
    }
  }

  _activeTarget = target;
  _health.active = target;

  if (target === 'backup' && prev !== 'backup') {
    _health.failover_count += 1;
    _health.last_failover_at = new Date().toISOString();
    console.warn(`[supabase-failover] Chuyển sang BACKUP (${reason})`, switchSync ? `sync: ${switchSync.rounds_run} vòng` : '');
  } else if (target === 'primary' && prev !== 'primary') {
    console.warn(`[supabase-failover] Chuyển sang PRIMARY (${reason})`, switchSync ? `sync: ${switchSync.rounds_run} vòng` : '');
  }

  const redis = getRedisIfReady();
  if (redis) {
    try {
      await redis.set(REDIS_ACTIVE_KEY, target);
    } catch { /* ignore */ }
  }

  try {
    const { resetPools } = require('./db');
    resetPools();
  } catch { /* ignore */ }
}

function getActiveTarget() {
  return _activeTarget;
}

async function sharedFetch(url, init) {
  const attempts = 4;
  const baseMs = 300;
  let lastErr;
  const originalUrl = String(url);
  const primaryBase = trimBase(config.supabaseUrl);

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await undiciFetch(rewriteUrlForActive(url), { ...init, dispatcher: supabaseDispatcher });
      if (originalUrl.startsWith(primaryBase) && _activeTarget === 'primary') {
        try {
          const { maybeEnqueueRestReplication } = require('../helpers/supabaseReplication');
          maybeEnqueueRestReplication(originalUrl, init, res);
        } catch { /* ignore */ }
      }
      if (originalUrl.startsWith(primaryBase) && _activeTarget === 'backup') {
        try {
          const { maybeLogFailbackRest } = require('../helpers/supabaseFailback');
          maybeLogFailbackRest(originalUrl, init, res);
        } catch { /* ignore */ }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (!isRetryableFetchError(err) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
    }
  }

  if (isAutoFailoverEnabled() && _activeTarget === 'primary') {
    const primary = trimBase(config.supabaseUrl);
    const backup = trimBase(config.supabaseBackupUrl);
    if (backup && String(url).startsWith(primary)) {
      try {
        const backupUrl = backup + String(url).slice(primary.length);
        console.warn('[supabase-failover] fetch primary lỗi, thử backup:', String(lastErr?.message || lastErr));
        const res = await undiciFetch(backupUrl, { ...init, dispatcher: supabaseDispatcher });
        await setActiveTarget('backup', 'runtime_fetch', { skipSync: true });
        if (String(url).startsWith(primary)) {
          try {
            const { maybeLogFailbackRest } = require('../helpers/supabaseFailback');
            maybeLogFailbackRest(String(url), init, res);
          } catch { /* ignore */ }
        }
        return res;
      } catch {
        /* fall through */
      }
    }
  }

  throw lastErr;
}

function buildClient(url, key) {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: sharedFetch },
  });
}

function getPrimaryClient() {
  if (!_primaryClient) {
    _primaryClient = buildClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return _primaryClient;
}

function getBackupClient() {
  if (!_backupClient) {
    _backupClient = buildClient(config.supabaseBackupUrl, config.supabaseBackupServiceKey);
  }
  return _backupClient;
}

function getActiveClient() {
  if (_activeTarget === 'backup' && isFailoverEnabled()) {
    return getBackupClient() || getPrimaryClient();
  }
  return getPrimaryClient();
}

function wrapSubClient(getSub) {
  return new Proxy({}, {
    get(_target, prop) {
      const sub = getSub();
      if (!sub) return undefined;
      const val = sub[prop];
      if (typeof val === 'function') return val.bind(sub);
      if (val && typeof val === 'object') {
        return wrapSubClient(() => getSub()[prop]);
      }
      return val;
    },
  });
}

const supabaseProxy = new Proxy({}, {
  get(_target, prop) {
    const client = getActiveClient();
    if (!client) return undefined;
    const val = client[prop];
    if (typeof val === 'function') return val.bind(client);
    if (val && typeof val === 'object' && (prop === 'storage' || prop === 'auth' || prop === 'functions')) {
      return wrapSubClient(() => getActiveClient()[prop]);
    }
    return val;
  },
});

async function probeTarget(url, key) {
  const base = trimBase(url);
  if (!base || !key) {
    return { healthy: false, configured: false, latency_ms: null, error: 'not_configured' };
  }
  const start = Date.now();
  try {
    const res = await undiciFetch(`${base}/auth/v1/health`, {
      dispatcher: supabaseDispatcher,
      headers: { apikey: key },
    });
    return {
      healthy: res.ok,
      configured: true,
      latency_ms: Date.now() - start,
      status: res.status,
    };
  } catch (err) {
    return {
      healthy: false,
      configured: true,
      latency_ms: Date.now() - start,
      error: String(err?.message || err),
    };
  }
}

function getHealthStatus() {
  return {
    ..._health,
    active: _activeTarget,
    failover_enabled: isFailoverEnabled(),
    auto_failover_enabled: isAutoFailoverEnabled(),
  };
}

function isSystemHealthy() {
  const h = getHealthStatus();
  if (h.primary?.healthy === true) return true;
  if (isFailoverEnabled() && h.backup?.configured && h.backup?.healthy === true) return true;
  if (h.primary?.healthy == null) return true;
  return false;
}

async function runHealthCheck() {
  _health.failover_enabled = isFailoverEnabled();
  _health.backup.configured = !!(config.supabaseBackupUrl && config.supabaseBackupServiceKey);

  const [primary, backup] = await Promise.all([
    probeTarget(config.supabaseUrl, config.supabaseServiceKey),
    _health.backup.configured
      ? probeTarget(config.supabaseBackupUrl, config.supabaseBackupServiceKey)
      : Promise.resolve({ ..._health.backup, last_check: new Date().toISOString() }),
  ]);

  _health.primary = { ...primary, last_check: new Date().toISOString(), configured: true };
  _health.backup = { ...backup, last_check: new Date().toISOString(), configured: _health.backup.configured };

  await syncActiveFromRedis();

  if (!isFailoverEnabled()) {
    _health.active = 'primary';
    return getHealthStatus();
  }

  const threshold = config.supabaseFailThreshold;

  if (!primary.healthy) {
    _primaryFailStreak += 1;
    _recoveryStreak = 0;
    if (
      isAutoFailoverEnabled()
      && _primaryFailStreak >= threshold
      && backup.configured
      && backup.healthy
      && _activeTarget !== 'backup'
    ) {
      await setActiveTarget('backup', 'health_probe');
    }
  } else {
    _primaryFailStreak = 0;
    if (config.supabaseAutoFailback && _activeTarget === 'backup') {
      _recoveryStreak += 1;
      if (_recoveryStreak >= threshold) {
        try {
          const { runFailbackReplay, getPendingCount } = require('../helpers/supabaseFailback');
          const pending = await getPendingCount();
          if (pending > 0) {
            const result = await runFailbackReplay({ limit: 1000 });
            if (result.remaining > 0) {
              console.warn(`[supabase-failback] Auto failback hoãn — còn ${result.remaining} job pending`);
              _recoveryStreak = 0;
            } else {
              await setActiveTarget('primary', 'auto_failback');
              _recoveryStreak = 0;
            }
          } else {
            await setActiveTarget('primary', 'auto_failback');
            _recoveryStreak = 0;
          }
        } catch (e) {
          console.warn('[supabase-failback] Auto failback replay lỗi:', e.message);
          _recoveryStreak = 0;
        }
      }
    } else if (_activeTarget === 'primary') {
      _recoveryStreak = 0;
    }
  }

  _health.active = _activeTarget;
  return getHealthStatus();
}

function startHealthChecker() {
  if (_healthTimer) return;
  void runHealthCheck();
  _healthTimer = setInterval(() => { void runHealthCheck(); }, config.supabaseHealthIntervalMs);
  if (_healthTimer.unref) _healthTimer.unref();
  console.log(
    `[supabase-health] Probe mỗi ${config.supabaseHealthIntervalMs}ms (failover=${isFailoverEnabled() ? 'on' : 'off'}, auto=${isAutoFailoverEnabled() ? 'on' : 'off'})`,
  );
}

module.exports = {
  supabase: supabaseProxy,
  getActiveClient,
  getActiveTarget,
  setActiveTarget,
  getHealthStatus,
  runHealthCheck,
  startHealthChecker,
  isFailoverEnabled,
  isAutoFailoverEnabled,
  isSystemHealthy,
  getBackupClient,
  getPrimaryClient,
  probeTarget,
};
