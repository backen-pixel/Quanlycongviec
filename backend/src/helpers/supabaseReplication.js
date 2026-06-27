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
    (config.supabaseReplicationEnabled || config.supabaseSwitchLogEnabled)
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

function primaryHeaders() {
  const key = config.supabaseServiceKey;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
  };
}

function parseFkMissingFromError(errOrText) {
  const text = String(errOrText?.message || errOrText || '');
  const m = text.match(/Key \(([^)]+)\)=\(([^)]+)\) is not present in table "([^"]+)"/);
  if (!m) return null;
  return { childColumn: m[1], parentId: m[2], parentTable: m[3] };
}

function parseJsonBody(body) {
  if (body == null || body === '') return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function collectFkValues(body, column) {
  const parsed = parseJsonBody(body);
  if (!parsed) return [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return [...new Set(rows.map((r) => r?.[column]).filter(Boolean))];
}

/** Bảng con → cột FK cần có trên backup trước khi ghi. */
const REPLICATION_PARENT_DEPS = {
  facebook_messages: ['contact_id'],
  crm_leads: ['customer_id', 'stage_id', 'source_id', 'assigned_to'],
};

const REPLICATION_STRIP_QUERY = new Set(['select', 'order', 'limit', 'offset', 'columns']);

function sanitizeReplicationRestPath(path) {
  try {
    const u = new URL(String(path || ''), 'http://local');
    for (const key of [...u.searchParams.keys()]) {
      if (REPLICATION_STRIP_QUERY.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    const qs = u.searchParams.toString();
    return u.pathname + (qs ? `?${qs}` : '');
  } catch {
    return String(path || '').replace(/([?&])select=[^&]*/gi, '$1').replace(/\?&/, '?').replace(/\?$/, '');
  }
}

function sanitizeReplicationHeaders(headers = {}) {
  const h = { ...headers };
  const preferKey = Object.keys(h).find((k) => k.toLowerCase() === 'prefer');
  const prefer = preferKey ? String(h[preferKey]) : '';
  const parts = prefer.split(',').map((s) => s.trim()).filter(Boolean);
  const hasMerge = parts.some((p) => p.toLowerCase() === 'resolution=merge-duplicates');
  const filtered = parts.filter((p) => {
    const low = p.toLowerCase();
    return low !== 'return=representation' && low !== 'return=headers-only';
  });
  if (!filtered.some((p) => p.toLowerCase().startsWith('return='))) {
    filtered.push('return=minimal');
  }
  if (hasMerge && !filtered.some((p) => p.toLowerCase() === 'resolution=merge-duplicates')) {
    filtered.unshift('resolution=merge-duplicates');
  }
  if (filtered.length) h.prefer = filtered.join(',');
  else if (preferKey) delete h.prefer;
  return h;
}

function parseOnConflictColumns(path) {
  try {
    const u = new URL(String(path || ''), 'http://local');
    const raw = u.searchParams.get('on_conflict');
    if (!raw) return null;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function ensureUpsertPrefer(headers, path, method) {
  if (method !== 'POST' || !parseOnConflictColumns(path)?.length) return headers;
  const prefer = String(headers.prefer || '');
  if (/resolution=merge-duplicates/i.test(prefer)) return headers;
  const parts = prefer.split(',').map((s) => s.trim()).filter(Boolean);
  parts.unshift('resolution=merge-duplicates');
  return { ...headers, prefer: parts.join(',') };
}

async function patchBackupRowByConflictColumns(table, columns, row) {
  if (!table || !columns?.length || !row || typeof row !== 'object') return false;
  const backupBase = trimBase(config.supabaseBackupUrl);
  const filters = columns.map((col) => {
    const val = row[col];
    if (val == null) return null;
    return `${col}=eq.${encodeURIComponent(String(val))}`;
  }).filter(Boolean);
  if (filters.length !== columns.length) return false;
  const { id, created_at, ...patch } = row;
  const res = await undiciFetch(
    `${backupBase}/rest/v1/${table}?${filters.join('&')}`,
    {
      method: 'PATCH',
      headers: {
        ...backupHeaders({}),
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
      dispatcher: supabaseDispatcher,
    },
  );
  return res.ok;
}

async function retryDuplicateUpsertOnBackup(table, path, body) {
  const conflictCols = parseOnConflictColumns(path);
  if (!table || !conflictCols?.length) return false;
  const parsed = parseJsonBody(body);
  if (!parsed) return false;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  for (const row of rows) {
    const ok = await patchBackupRowByConflictColumns(table, conflictCols, row);
    if (!ok) return false;
  }
  return true;
}

function extractEqFilterId(path, column = 'id') {
  try {
    const u = new URL(String(path || ''), 'http://local');
    const raw = u.searchParams.get(column);
    if (!raw) return null;
    const m = String(raw).match(/^eq\.(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function isMissingRowReplicationError(errOrText) {
  const text = String(errOrText?.message || errOrText || '');
  return /→ 406\b|PGRST116|contains 0 rows|→ 404\b|"code":"PGRST116"/i.test(text);
}

async function backupRowExists(table, id) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const res = await undiciFetch(
    `${backupBase}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`,
    { headers: backupHeaders({}), dispatcher: supabaseDispatcher },
  );
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

async function fetchPrimaryRow(table, id) {
  const primaryBase = trimBase(config.supabaseUrl);
  const res = await undiciFetch(
    `${primaryBase}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: primaryHeaders(), dispatcher: supabaseDispatcher },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function fetchBackupContactIdByNaturalKey(pageId, psid) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const res = await undiciFetch(
    `${backupBase}/rest/v1/facebook_contacts?page_id=eq.${encodeURIComponent(pageId)}&psid=eq.${encodeURIComponent(psid)}&select=id`,
    { headers: backupHeaders({}), dispatcher: supabaseDispatcher },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0].id : null;
}

/** Upsert facebook_contacts theo (page_id, psid) — tránh 409 khi backup có uuid khác primary. */
async function upsertFacebookContactOnBackup(row, depth = 0) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const pageId = row?.page_id;
  const psid = row?.psid;
  if (!pageId || !psid) return null;

  const upsertRes = await undiciFetch(
    `${backupBase}/rest/v1/facebook_contacts?on_conflict=page_id,psid`,
    {
      method: 'POST',
      headers: {
        ...backupHeaders({}),
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(row),
      dispatcher: supabaseDispatcher,
    },
  );

  if (upsertRes.ok) {
    const saved = await upsertRes.json().catch(() => null);
    const savedRow = Array.isArray(saved) ? saved[0] : saved;
    return savedRow?.id || row.id || null;
  }

  const text = await upsertRes.text().catch(() => '');
  const fk = parseFkMissingFromError(text);
  if (fk && depth < 4) {
    await ensureRowOnBackup(fk.parentTable, fk.parentId, depth + 1);
    return upsertFacebookContactOnBackup(row, depth + 1);
  }

  if (upsertRes.status === 409 || /23505|duplicate key/i.test(text)) {
    const { id, created_at, ...patch } = row;
    const patchRes = await undiciFetch(
      `${backupBase}/rest/v1/facebook_contacts?page_id=eq.${encodeURIComponent(pageId)}&psid=eq.${encodeURIComponent(psid)}`,
      {
        method: 'PATCH',
        headers: {
          ...backupHeaders({}),
          'content-type': 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify(patch),
        dispatcher: supabaseDispatcher,
      },
    );
    if (patchRes.ok) {
      const patched = await patchRes.json().catch(() => null);
      const patchedRow = Array.isArray(patched) ? patched[0] : patched;
      return patchedRow?.id || (await fetchBackupContactIdByNaturalKey(pageId, psid));
    }
    const patchText = await patchRes.text().catch(() => '');
    throw new Error(`backup upsert facebook_contacts → ${patchRes.status} ${patchText.slice(0, 200)}`);
  }

  throw new Error(`backup upsert facebook_contacts → ${upsertRes.status} ${text.slice(0, 200)}`);
}

async function ensureFacebookContactOnBackup(primaryContactId, depth = 0) {
  if (!primaryContactId || depth > 4) return null;
  const row = await fetchPrimaryRow('facebook_contacts', primaryContactId);
  if (!row) return null;
  return upsertFacebookContactOnBackup(row, depth);
}

async function remapFacebookMessagesBodyForBackup(body) {
  if (body == null || body === '') return body;
  const parsed = parseJsonBody(body);
  if (!parsed) return body;
  const isArray = Array.isArray(parsed);
  const rows = isArray ? parsed : [parsed];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      out.push(row);
      continue;
    }
    if (row.contact_id) {
      const backupContactId = await ensureFacebookContactOnBackup(row.contact_id);
      out.push(backupContactId ? { ...row, contact_id: backupContactId } : row);
    } else {
      out.push(row);
    }
  }
  return JSON.stringify(isArray ? out : out[0]);
}

async function postRowToBackup(table, row, depth = 0) {
  if (table === 'facebook_contacts') {
    await upsertFacebookContactOnBackup(row, depth);
    return;
  }
  const backupBase = trimBase(config.supabaseBackupUrl);
  const res = await undiciFetch(`${backupBase}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...backupHeaders({}),
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
    dispatcher: supabaseDispatcher,
  });
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  const fk = parseFkMissingFromError(text);
  if (fk && depth < 4) {
    await ensureRowOnBackup(fk.parentTable, fk.parentId, depth + 1);
    return postRowToBackup(table, row, depth + 1);
  }
  throw new Error(`backup upsert ${table} → ${res.status} ${text.slice(0, 200)}`);
}

async function ensureRowOnBackup(table, id, depth = 0) {
  if (!table || !id || depth > 4) return;
  if (table === 'facebook_contacts') {
    await ensureFacebookContactOnBackup(id, depth);
    return;
  }
  if (await backupRowExists(table, id)) return;
  const row = await fetchPrimaryRow(table, id);
  if (!row) return;
  await postRowToBackup(table, row, depth);
}

async function ensureReplicationTargetRow(job) {
  const method = String(job.method || '').toUpperCase();
  if (!['PATCH', 'PUT', 'DELETE'].includes(method)) return;
  const path = sanitizeReplicationRestPath(job.path);
  const table = restTableFromPath(path);
  if (!table) return;
  const id = extractEqFilterId(path, 'id');
  if (id) await ensureRowOnBackup(table, id);
}

async function ensureReplicationParents(job) {
  if (job.type !== 'rest' || !job.body) return;
  const table = restTableFromPath(sanitizeReplicationRestPath(job.path));
  const deps = REPLICATION_PARENT_DEPS[table];
  if (!deps?.length) return;
  for (const column of deps) {
    const ids = collectFkValues(job.body, column);
    for (const id of ids) {
      let resolvedTable = null;
      if (table === 'facebook_messages' && column === 'contact_id') resolvedTable = 'facebook_contacts';
      else if (column === 'customer_id') resolvedTable = 'customers';
      else if (column === 'stage_id') resolvedTable = 'crm_pipeline_stages';
      else if (column === 'source_id') resolvedTable = 'crm_sources';
      else if (column === 'assigned_to') resolvedTable = 'users';
      if (resolvedTable) await ensureRowOnBackup(resolvedTable, id);
    }
  }
}

async function redisPush(job) {
  const redis = getRedisIfReady();
  if (redis) {
    await redis.lpush(REDIS_KEY, JSON.stringify(job));
    return;
  }
  memQueue.push(job);
}

/** Đẩy job xuống cuối hàng — dùng khi FK chưa sẵn sàng, xử lý job khác trước. */
async function redisPushTail(job) {
  const redis = getRedisIfReady();
  if (redis) {
    await redis.rpush(REDIS_KEY, JSON.stringify(job));
    return;
  }
  memQueue.unshift(job);
}

function isDeferrableReplicationError(err) {
  const msg = String(err?.message || err || '');
  return /→ 409\b|"code":"23503"|foreign key|is not present in table|PGRST116|→ 406\b|→ 404\b|contains 0 rows|"code":"23505"|duplicate key/i.test(msg);
}

async function requeueReplicationJob(job, err) {
  const retry = (job.retry || 0) + 1;
  if (retry > 12) {
    console.warn('[supabase-replication] bỏ job sau 12 lần:', job.path || job.bucket, err?.message);
    return;
  }
  const next = { ...job, retry, deferred_at: new Date().toISOString() };
  if (isDeferrableReplicationError(err)) {
    await redisPushTail(next);
  } else if (getRedisIfReady()) {
    await redisPush(next);
  } else {
    memQueue.push(next);
  }
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
    path: sanitizeReplicationRestPath(rel),
    headers: sanitizeReplicationHeaders(extractHeaders(init)),
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
  const path = sanitizeReplicationRestPath(job.path);
  const method = String(job.method || 'GET').toUpperCase();
  const table = restTableFromPath(path);
  let headers = sanitizeReplicationHeaders(backupHeaders(job.headers || {}));
  headers = ensureUpsertPrefer(headers, path, method);
  let body = job.body ?? undefined;
  if (body != null && table === 'facebook_messages') {
    body = await remapFacebookMessagesBodyForBackup(body);
  }
  if (body != null) {
    headers['content-type'] = headers['content-type'] || 'application/json';
  }
  headers.prefer = headers.prefer || 'return=minimal';

  const prepared = { ...job, path, body };
  await ensureReplicationParents(prepared);
  await ensureReplicationTargetRow(prepared);

  const backupBase = trimBase(config.supabaseBackupUrl);
  const url = backupBase + path;

  async function doFetch() {
    return undiciFetch(url, {
      method: job.method,
      headers,
      body: body ?? undefined,
      dispatcher: supabaseDispatcher,
    });
  }

  let res = await doFetch();
  if (!res.ok) {
    let text = await res.text().catch(() => '');
    if (method === 'DELETE' && (res.status === 404 || /PGRST116|0 rows/i.test(text))) {
      return;
    }
    const fk = parseFkMissingFromError(text);
    const missingRow = isMissingRowReplicationError(text);
    if (fk || missingRow) {
      if (missingRow) {
        const missingTable = restTableFromPath(path);
        const id = extractEqFilterId(path, 'id');
        if (missingTable && id) await ensureRowOnBackup(missingTable, id);
      }
      if (fk) await ensureRowOnBackup(fk.parentTable, fk.parentId);
      res = await doFetch();
      if (res.ok) return;
      text = await res.text().catch(() => '');
      if (method === 'DELETE' && (res.status === 404 || /PGRST116|0 rows/i.test(text))) {
        return;
      }
    }
    if (
      method === 'POST'
      && (res.status === 409 || /23505|duplicate key/i.test(text))
      && await retryDuplicateUpsertOnBackup(table, path, body)
    ) {
      return;
    }
    throw new Error(`backup ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
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

async function drainReplicationQueue({ maxJobs = 100, force = false } = {}) {
  if (!isReplicationConfigured()) {
    return { processed: 0, failed: 0, remaining: await getQueueDepth(), skipped: true };
  }
  if (!force && !isActivePrimary()) {
    return { processed: 0, failed: 0, remaining: await getQueueDepth(), skipped: true };
  }
  let processed = 0;
  let failed = 0;
  while (processed + failed < maxJobs) {
    const job = await redisPopNonBlocking();
    if (!job) break;
    if (!force && !isActivePrimary()) break;
    try {
      await applyJob(job);
      processed += 1;
    } catch (e) {
      failed += 1;
      _stats.failed += 1;
      _stats.last_error = e.message;
      await requeueReplicationJob(job, e);
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
        await requeueReplicationJob(job, e);
        if (!isDeferrableReplicationError(e)) break;
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

function summarizeReplicationJob(job) {
  if (!job) return '—';
  if (job.type === 'storage') {
    return `Storage ${job.bucket}/${job.path || job.storage_path || '?'}`;
  }
  const method = job.method || 'REST';
  const path = job.path || '';
  const table = path.match(/^\/rest\/v1\/([^/?]+)/)?.[1];
  return table ? `${method} ${table}` : `${method} ${path.slice(0, 80)}`;
}

function sanitizeReplicationJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type || 'rest',
    method: job.method || null,
    path: job.path || null,
    bucket: job.bucket || null,
    storage_path: job.type === 'storage' ? (job.path || job.storage_path) : null,
    enqueued_at: job.enqueued_at || null,
    retry: job.retry || 0,
    summary: summarizeReplicationJob(job),
  };
}

/** Liệt kê job trong queue (không xóa) — newest trước. */
async function listReplicationQueue({ limit = 50 } = {}) {
  const cap = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const redis = getRedisIfReady();
  let jobs = [];

  if (redis) {
    try {
      const raw = await redis.lrange(REDIS_KEY, 0, cap - 1);
      jobs = raw.map((s) => {
        try { return JSON.parse(s); } catch { return null; }
      }).filter(Boolean);
    } catch {
      jobs = memQueue.slice(-cap).reverse();
    }
  } else {
    jobs = [...memQueue].slice(-cap).reverse();
  }

  const items = jobs.map(sanitizeReplicationJob).filter(Boolean);
  const total = await getQueueDepth();
  return { items, total };
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
  isReplicationConfigured,
  maybeEnqueueRestReplication,
  replicateStorageUpload,
  startReplicationWorker,
  getReplicationStatus,
  getQueueDepth,
  drainReplicationQueue,
  listReplicationQueue,
  summarizeReplicationJob,
};
