/**
 * Async replication primary → backup (REST + Storage).
 * Chỉ chạy khi active target = primary; khi failover sang backup thì dừng replicate.
 *
 * Env:
 *   SUPABASE_REPLICATION_ENABLED=1
 *   SUPABASE_REPLICATION_SKIP_TABLES=facebook_webhook_logs,auth_event_log (optional)
 *   SUPABASE_REPLICATION_DISABLED=1 — tắt worker
 */

const { randomUUID } = require('crypto');
const { fetch: undiciFetch } = require('undici');
const config = require('../config');
const { supabaseDispatcher } = require('../config/httpAgents');
const { getRedisIfReady } = require('../config/redis');
const { runIfLeader } = require('./cronLeader');

const REDIS_KEY = 'supabase:replication:pending';
const memQueue = [];

const _stats = {
  enqueued: 0,
  applied: 0,
  failed: 0,
  last_error: null,
  last_applied_at: null,
};

let _workerStarted = false;
let _workerBusy = false;

function trimBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function replicationConfig() {
  const light = process.env.SUPABASE_REPLICATION_LIGHT === '1';
  return {
    light,
    pollActiveMs: Math.max(500, parseInt(process.env.SUPABASE_REPLICATION_POLL_MS || (light ? '5000' : '2000'), 10)),
    pollIdleMs: Math.max(2000, parseInt(process.env.SUPABASE_REPLICATION_IDLE_POLL_MS || (light ? '60000' : '30000'), 10)),
    batchSize: Math.max(1, parseInt(process.env.SUPABASE_REPLICATION_BATCH_SIZE || (light ? '3' : '10'), 10)),
    storageEnabled: process.env.SUPABASE_REPLICATION_STORAGE !== '0' && !light,
  };
}
function skipTablesSet() {
  const cfg = replicationConfig();
  const lightSkips = 'notifications,auth_event_log,facebook_webhook_logs,user_activity_log,audit_logs';
  const defaults = cfg.light
    ? `supabase_failback_log,user_last_activity,user_devices,user_current_location,app_heartbeat,${lightSkips}`
    : 'supabase_failback_log,user_last_activity,user_devices,user_current_location,app_heartbeat';
  const raw = process.env.SUPABASE_REPLICATION_SKIP_TABLES || defaults;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function isReplicationConfigured() {
  return !!(
    config.supabaseReplicationEnabled
    && config.supabaseBackupUrl
    && config.supabaseBackupServiceKey
  );
}

function isActivePrimary() {
  try {
    const { getActiveTarget } = require('../config/supabaseRouter');
    return getActiveTarget() === 'primary';
  } catch {
    return true;
  }
}

function canReplicate() {
  return isReplicationConfigured() && isActivePrimary();
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

function shouldSkipRestUrl(urlStr) {
  const u = new URL(urlStr, 'http://local');
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

function backupHeaders(orig) {
  const key = config.supabaseBackupServiceKey;
  return {
    ...orig,
    apikey: key,
    authorization: `Bearer ${key}`,
  };
}

async function redisPush(job) {
  const redis = getRedisIfReady();
  if (redis) {
    await redis.lpush(REDIS_KEY, JSON.stringify(job));
    return;
  }
  memQueue.push(job);
}

async function redisPop(timeoutSec = 1) {
  const redis = getRedisIfReady();
  if (redis) {
    const res = await redis.brpop(REDIS_KEY, timeoutSec);
    return res ? JSON.parse(res[1]) : null;
  }
  return memQueue.shift() || null;
}

async function redisPopNonBlocking() {
  const redis = getRedisIfReady();
  if (redis) {
    const item = await redis.lpop(REDIS_KEY);
    return item ? JSON.parse(item) : null;
  }
  return memQueue.shift() || null;
}

/**
 * Gọi từ supabaseRouter.sharedFetch sau write thành công lên primary.
 */
function maybeEnqueueRestReplication(originalUrl, init, response) {
  if (!canReplicate()) return;
  const method = String(init?.method || 'GET').toUpperCase();
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
  if (!response || response.status < 200 || response.status >= 300) return;

  const rel = primaryRelativePath(originalUrl);
  if (!rel || shouldSkipRestUrl(rel)) return;

  const body = init?.body;
  if (body != null && typeof body !== 'string' && !Buffer.isBuffer(body)) return;

  const job = {
    id: randomUUID(),
    type: 'rest',
    method,
    path: rel,
    headers: extractHeaders(init),
    body: body != null ? (Buffer.isBuffer(body) ? body.toString('utf8') : body) : null,
    enqueued_at: new Date().toISOString(),
  };

  void redisPush(job).then(() => { _stats.enqueued += 1; }).catch((e) => {
    console.warn('[supabase-replication] enqueue failed:', e.message);
  });
}

/**
 * Dual-write storage sau upload primary thành công.
 */
function replicateStorageUpload({ bucket, storagePath, mimetype, upsert = true }) {
  if (!canReplicate()) return;
  if (!replicationConfig().storageEnabled) return;
  if (!bucket || !storagePath) return;

  const job = {
    id: randomUUID(),
    type: 'storage',
    bucket,
    path: storagePath,
    mimetype: mimetype || 'application/octet-stream',
    upsert: !!upsert,
    enqueued_at: new Date().toISOString(),
  };

  void redisPush(job).then(() => { _stats.enqueued += 1; }).catch((e) => {
    console.warn('[supabase-replication] storage enqueue failed:', e.message);
  });
}

async function applyRestJob(job) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const url = backupBase + job.path;
  const headers = backupHeaders(job.headers || {});
  if (job.body != null) {
    headers['content-type'] = headers['content-type'] || 'application/json';
  }
  const res = await undiciFetch(url, {
    method: job.method,
    headers,
    body: job.body ?? undefined,
    dispatcher: supabaseDispatcher,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`backup ${job.method} ${job.path} → ${res.status} ${text.slice(0, 200)}`);
  }
}

async function applyStorageJob(job) {
  const { getPrimaryClient, getBackupClient } = require('../config/supabaseRouter');
  const primary = getPrimaryClient();
  const backup = getBackupClient();
  if (!primary || !backup) throw new Error('primary/backup client unavailable');
  const { data, error: dlErr } = await primary.storage.from(job.bucket).download(job.path);
  if (dlErr) throw dlErr;
  const buffer = Buffer.from(await data.arrayBuffer());
  const { error } = await backup.storage.from(job.bucket).upload(job.path, buffer, {
    contentType: job.mimetype,
    upsert: job.upsert !== false,
  });
  if (error) throw error;
}

async function applyJob(job) {
  if (job.type === 'storage') await applyStorageJob(job);
  else await applyRestJob(job);
  _stats.applied += 1;
  _stats.last_applied_at = new Date().toISOString();
}

async function drainReplicationQueue({ maxJobs = 100 } = {}) {
  if (!isReplicationConfigured() || !isActivePrimary()) {
    return { processed: 0, failed: 0, remaining: await getQueueDepth() };
  }
  let processed = 0;
  let failed = 0;
  while (processed + failed < maxJobs) {
    const job = await redisPopNonBlocking();
    if (!job) break;
    if (!isActivePrimary()) break;
    try {
      await applyJob(job);
      processed += 1;
    } catch (e) {
      failed += 1;
      _stats.failed += 1;
      _stats.last_error = e.message;
      if (getRedisIfReady() && (job.retry || 0) < 5) {
        await redisPush({ ...job, retry: (job.retry || 0) + 1 }).catch(() => {});
      }
    }
  }
  return { processed, failed, remaining: await getQueueDepth() };
}

async function workerTickBatch() {
  if (_workerBusy || !isReplicationConfigured()) return { processed: 0, idle: true };
  if (!isActivePrimary()) return { processed: 0, idle: true };

  const cfg = replicationConfig();
  _workerBusy = true;
  let processed = 0;
  try {
    for (let i = 0; i < cfg.batchSize; i++) {
      const job = await redisPopNonBlocking();
      if (!job) break;
      if (!isActivePrimary()) break;
      try {
        await applyJob(job);
        processed += 1;
      } catch (e) {
        _stats.failed += 1;
        _stats.last_error = e.message;
        if ((job.retry || 0) < 3) {
          console.warn('[supabase-replication] apply failed:', job.type, job.path || job.bucket, e.message);
        }
        if (getRedisIfReady() && (job.retry || 0) < 5) {
          await redisPush({ ...job, retry: (job.retry || 0) + 1 }).catch(() => {});
        }
        break;
      }
    }
  } finally {
    _workerBusy = false;
  }
  return { processed, idle: processed === 0 };
}

async function workerTick() {
  await workerTickBatch();
}

async function getQueueDepth() {
  const redis = getRedisIfReady();
  if (redis) {
    try {
      return await redis.llen(REDIS_KEY);
    } catch {
      return memQueue.length;
    }
  }
  return memQueue.length;
}

function getReplicationStatus() {
  return {
    enabled: isReplicationConfigured(),
    active_primary: isActivePrimary(),
    ...replicationConfig(),
    ..._stats,
  };
}

function startReplicationWorker() {
  if (_workerStarted) return;
  if (process.env.SUPABASE_REPLICATION_DISABLED === '1') {
    console.log('[supabase-replication] Disabled (env SUPABASE_REPLICATION_DISABLED=1)');
    return;
  }
  if (!isReplicationConfigured()) {
    console.log('[supabase-replication] Off — set SUPABASE_REPLICATION_ENABLED=1 + backup env');
    return;
  }
  _workerStarted = true;
  const cfg = replicationConfig();
  let timer = null;

  const schedule = (delayMs) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        let tickResult = { processed: 0, idle: true };
        await runIfLeader('supabase-replication', async () => {
          tickResult = await workerTickBatch();
        }, { ttlSec: 5 });
        const depth = await getQueueDepth().catch(() => 0);
        const nextMs = (tickResult.processed > 0 || depth > 0) ? cfg.pollActiveMs : cfg.pollIdleMs;
        schedule(nextMs);
      } catch {
        schedule(cfg.pollIdleMs);
      }
    }, delayMs);
    if (timer.unref) timer.unref();
  };

  schedule(15_000);
  console.log(
    `[supabase-replication] Worker adaptive (active=${cfg.pollActiveMs}ms idle=${cfg.pollIdleMs}ms batch=${cfg.batchSize} storage=${cfg.storageEnabled} light=${cfg.light})`,
  );
}

module.exports = {
  canReplicate,
  maybeEnqueueRestReplication,
  replicateStorageUpload,
  startReplicationWorker,
  getReplicationStatus,
  getQueueDepth,
  drainReplicationQueue,
};
