/**
 * Failback log — ghi thao tác trên backup khi failover, replay về primary.
 *
 * Env:
 *   SUPABASE_FAILOVER_ENABLED=1 (bật ghi log khi active=backup)
 *   SUPABASE_FAILBACK_SKIP_TABLES=supabase_failback_log,... (optional)
 */

const { fetch: undiciFetch } = require('undici');
const config = require('../config');
const { supabaseDispatcher } = require('../config/httpAgents');
const { getRedisIfReady } = require('../config/redis');

const TABLE = 'supabase_failback_log';
const REDIS_FALLBACK_KEY = 'supabase:failback:pending';

const _stats = {
  logged: 0,
  replayed: 0,
  replay_failed: 0,
  last_replay_at: null,
  last_error: null,
};

function trimBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function skipTablesSet() {
  const raw = process.env.SUPABASE_FAILBACK_SKIP_TABLES
    || process.env.SUPABASE_REPLICATION_SKIP_TABLES
    || 'supabase_failback_log';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function isFailbackConfigured() {
  return !!(
    config.supabaseFailoverEnabled
    && config.supabaseBackupUrl
    && config.supabaseBackupServiceKey
    && config.supabaseUrl
    && config.supabaseServiceKey
  );
}

function isActiveBackup() {
  try {
    const { getActiveTarget } = require('../config/supabaseRouter');
    return getActiveTarget() === 'backup';
  } catch {
    return false;
  }
}

function canLogFailback() {
  return isFailbackConfigured() && isActiveBackup();
}

function extractHeaders(init) {
  if (!init?.headers) return {};
  const h = init.headers;
  if (typeof h.forEach === 'function') {
    const o = {};
    h.forEach((v, k) => { o[String(k).toLowerCase()] = v; });
    return o;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h.map(([k, v]) => [String(k).toLowerCase(), v]));
  }
  const o = {};
  for (const [k, v] of Object.entries(h)) o[String(k).toLowerCase()] = v;
  return o;
}

function restTableFromPath(pathname) {
  const m = String(pathname || '').match(/^\/rest\/v1\/([^/?]+)/);
  return m ? m[1] : null;
}

function shouldSkipRestPath(relPath) {
  const u = new URL(relPath, 'http://local');
  if (!u.pathname.startsWith('/rest/v1/')) return true;
  if (u.pathname.startsWith('/rest/v1/rpc/')) return true;
  const table = restTableFromPath(u.pathname);
  if (table && skipTablesSet().has(table)) return true;
  return false;
}

function primaryRelativePath(urlStr) {
  const primary = trimBase(config.supabaseUrl);
  const s = String(urlStr);
  if (s.startsWith(primary)) return s.slice(primary.length);
  return null;
}

function primaryHeaders(orig) {
  const key = config.supabaseServiceKey;
  return {
    ...orig,
    apikey: key,
    authorization: `Bearer ${key}`,
  };
}

async function persistLogRow(row) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const key = config.supabaseBackupServiceKey;
  const res = await undiciFetch(`${backupBase}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
    dispatcher: supabaseDispatcher,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`persist failback log → ${res.status} ${text.slice(0, 200)}`);
  }
}

async function redisPushFallback(row) {
  const redis = getRedisIfReady();
  if (redis) await redis.lpush(REDIS_FALLBACK_KEY, JSON.stringify(row));
}

async function enqueueLog(row) {
  try {
    await persistLogRow(row);
    _stats.logged += 1;
  } catch (e) {
    console.warn('[supabase-failback] DB log failed, Redis fallback:', e.message);
    try {
      await redisPushFallback(row);
      _stats.logged += 1;
    } catch (e2) {
      console.warn('[supabase-failback] enqueue failed:', e2.message);
    }
  }
}

/**
 * Gọi từ sharedFetch sau write thành công khi active=backup.
 */
function maybeLogFailbackRest(originalUrl, init, response) {
  if (!canLogFailback()) return;
  const method = String(init?.method || 'GET').toUpperCase();
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
  if (!response || response.status < 200 || response.status >= 300) return;

  const rel = primaryRelativePath(originalUrl);
  if (!rel || shouldSkipRestPath(rel)) return;

  const body = init?.body;
  if (body != null && typeof body !== 'string' && !Buffer.isBuffer(body)) return;

  void enqueueLog({
    job_type: 'rest',
    method,
    path: rel,
    headers: extractHeaders(init),
    body: body != null ? (Buffer.isBuffer(body) ? body.toString('utf8') : body) : null,
  });
}

/**
 * Ghi storage upload khi đang chạy trên backup.
 */
function maybeLogFailbackStorage({ bucket, storagePath, mimetype, upsert = true }) {
  if (!canLogFailback()) return;
  if (!bucket || !storagePath) return;

  void enqueueLog({
    job_type: 'storage',
    bucket,
    storage_path: storagePath,
    mimetype: mimetype || 'application/octet-stream',
    upsert: upsert !== false,
  });
}

async function fetchPendingLogs(limit = 100) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const key = config.supabaseBackupServiceKey;
  const q = `${backupBase}/rest/v1/${TABLE}?applied_to_primary=eq.false&order=created_at.asc&limit=${limit}`;
  const res = await undiciFetch(q, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    dispatcher: supabaseDispatcher,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`fetch pending failback → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function markLogApplied(id) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const key = config.supabaseBackupServiceKey;
  const res = await undiciFetch(`${backupBase}/rest/v1/${TABLE}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      applied_to_primary: true,
      applied_at: new Date().toISOString(),
      error: null,
    }),
    dispatcher: supabaseDispatcher,
  });
  if (!res.ok) throw new Error(`mark applied ${id} → ${res.status}`);
}

async function markLogError(id, errMsg, retryCount) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const key = config.supabaseBackupServiceKey;
  await undiciFetch(`${backupBase}/rest/v1/${TABLE}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      error: String(errMsg).slice(0, 500),
      retry_count: retryCount,
    }),
    dispatcher: supabaseDispatcher,
  }).catch(() => {});
}

async function applyRestToPrimary(row) {
  const primaryBase = trimBase(config.supabaseUrl);
  const url = primaryBase + row.path;
  const headers = primaryHeaders(row.headers || {});
  if (row.body != null) headers['content-type'] = headers['content-type'] || 'application/json';
  const res = await undiciFetch(url, {
    method: row.method,
    headers,
    body: row.body ?? undefined,
    dispatcher: supabaseDispatcher,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`primary ${row.method} ${row.path} → ${res.status} ${text.slice(0, 200)}`);
  }
}

async function applyStorageToPrimary(row) {
  const { getBackupClient, getPrimaryClient } = require('../config/supabaseRouter');
  const backup = getBackupClient();
  const primary = getPrimaryClient();
  if (!backup || !primary) throw new Error('backup/primary client unavailable');

  const { data, error: dlErr } = await backup.storage.from(row.bucket).download(row.storage_path);
  if (dlErr) throw dlErr;
  const buffer = Buffer.from(await data.arrayBuffer());
  const { error: upErr } = await primary.storage.from(row.bucket).upload(row.storage_path, buffer, {
    contentType: row.mimetype || 'application/octet-stream',
    upsert: row.upsert !== false,
  });
  if (upErr) throw upErr;
}

async function applyLogRow(row) {
  if (row.job_type === 'storage') await applyStorageToPrimary(row);
  else await applyRestToPrimary(row);
}

async function getPendingCount() {
  if (!isFailbackConfigured()) return 0;
  try {
    const backupBase = trimBase(config.supabaseBackupUrl);
    const key = config.supabaseBackupServiceKey;
    const res = await undiciFetch(
      `${backupBase}/rest/v1/${TABLE}?applied_to_primary=eq.false&select=id`,
      { headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact' }, dispatcher: supabaseDispatcher },
    );
    const range = res.headers.get('content-range') || '';
    const m = range.match(/\/(\d+)$/);
    if (m) return parseInt(m[1], 10);
    if (res.ok) {
      const rows = await res.json();
      return Array.isArray(rows) ? rows.length : 0;
    }
  } catch { /* ignore */ }
  return 0;
}

/**
 * Replay pending failback logs từ backup → primary.
 * @returns {{ applied, failed, remaining, errors: string[] }}
 */
async function runFailbackReplay({ dryRun = false, limit = 500 } = {}) {
  if (!isFailbackConfigured()) {
    throw new Error('Failback chưa cấu hình — cần SUPABASE_FAILOVER_ENABLED=1 + env primary/backup');
  }

  const { probeTarget } = require('../config/supabaseRouter');
  const primaryHealth = await probeTarget(config.supabaseUrl, config.supabaseServiceKey);
  if (!primaryHealth.healthy) {
    throw new Error('Primary chưa healthy — không replay failback');
  }

  const pending = await fetchPendingLogs(limit);
  if (dryRun) {
    return { applied: 0, failed: 0, remaining: pending.length, errors: [], dry_run: true };
  }

  let applied = 0;
  let failed = 0;
  const errors = [];

  for (const row of pending) {
    try {
      await applyLogRow(row);
      await markLogApplied(row.id);
      applied += 1;
      _stats.replayed += 1;
    } catch (e) {
      failed += 1;
      _stats.replay_failed += 1;
      _stats.last_error = e.message;
      errors.push(`${row.id}: ${e.message}`);
      await markLogError(row.id, e.message, (row.retry_count || 0) + 1);
    }
  }

  _stats.last_replay_at = new Date().toISOString();
  const remaining = await getPendingCount();
  return { applied, failed, remaining, errors };
}

function getFailbackStatus() {
  return {
    configured: isFailbackConfigured(),
    active_backup: isActiveBackup(),
    ..._stats,
  };
}

module.exports = {
  canLogFailback,
  maybeLogFailbackRest,
  maybeLogFailbackStorage,
  runFailbackReplay,
  getFailbackStatus,
  getPendingCount,
};
