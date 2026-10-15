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
const REDIS_CONSUMER_KEY = 'supabase:replication:consumer';
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

/** Preserve error bodies without widening backup ACLs or retrying denied writes. */
async function backupFetchWithErrorText(fetchFn) {
  const res = await fetchFn();
  if (res.ok) return { res, text: '' };
  if (res.status === 401 || res.status === 403) {
    await res.text().catch(() => '');
    throw replicationFailure('REPLICATION_BACKUP_PERMISSION_DENIED', null, res.status);
  }
  const text = await res.text().catch(() => '');
  return { res, text };
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
  let details = text;
  // PostgREST quotes the parent table inside its JSON details string. Decode
  // that string before matching, including errors prefixed by our operation.
  const jsonStart = text.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart));
      if (typeof parsed.details === 'string') details = parsed.details;
    } catch { /* A plain PostgreSQL error can still be matched below. */ }
  }
  const m = details.match(/Key \(([^)]+)\)=\(([^)]+)\) is not present in table "([^"]+)"/);
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
  facebook_contacts: ['lead_id', 'customer_id'],
  facebook_messages: ['contact_id', 'lead_id', 'customer_id'],
  crm_leads: ['customer_id', 'stage_id', 'source_id', 'assigned_to', 'lead_owner_id'],
  crm_daily_reports: ['user_id', 'template_id', 'company_id'],
  crm_daily_report_lines: ['report_id', 'template_item_id'],
  crm_daily_report_template_items: ['template_id'],
  crm_daily_report_user_extras: ['user_id', 'company_id'],
};

function resolveParentTableForColumn(column) {
  const map = {
    contact_id: 'facebook_contacts',
    customer_id: 'customers',
    lead_id: 'crm_leads',
    stage_id: 'crm_pipeline_stages',
    source_id: 'crm_sources',
    assigned_to: 'users',
    lead_owner_id: 'users',
    company_id: 'companies',
    created_by: 'users',
    user_id: 'users',
    template_id: 'crm_daily_report_templates',
    template_item_id: 'crm_daily_report_template_items',
    report_id: 'crm_daily_reports',
  };
  return map[column] || null;
}

/** Cột GENERATED ALWAYS — không gửi khi replicate sang backup. */
const REPLICATION_STRIP_COLUMNS = {
  crm_leads: ['weighted_value', 'info_complete'],
};

function stripRowForBackupReplication(table, row) {
  if (!row || typeof row !== 'object') return row;
  const cols = REPLICATION_STRIP_COLUMNS[table];
  if (!cols?.length) return row;
  const out = { ...row };
  for (const col of cols) delete out[col];
  return out;
}

function stripReplicationBody(table, body) {
  if (body == null || body === '') return body;
  const parsed = parseJsonBody(body);
  if (!parsed) return body;
  const isArray = Array.isArray(parsed);
  const rows = isArray ? parsed : [parsed];
  const out = rows.map((r) => stripRowForBackupReplication(table, r));
  return JSON.stringify(isArray ? out : out[0]);
}

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
  // Queue jobs must not retain the primary service credential. backupHeaders
  // supplies the destination credential only when the job is applied.
  for (const key of Object.keys(h)) {
    if (['authorization', 'apikey', 'cookie', 'set-cookie'].includes(key.toLowerCase())) delete h[key];
    if (key.toLowerCase() === 'accept') delete h[key];
  }
  // A primary client's .single() Accept header is not a replication contract.
  h.accept = 'application/json';
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
    `${backupBase}/rest/v1/${table}?${filters.join('&')}&select=id`,
    {
      method: 'PATCH',
      headers: {
        ...backupHeaders({}),
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify(stripRowForBackupReplication(table, patch)),
      dispatcher: supabaseDispatcher,
    },
  );
  if (!res.ok) return false;
  await confirmedBackupRow(res, table);
  return true;
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

function replicationFailure(code, table, status) {
  const error = new Error(`${code}${table ? ` ${table}` : ''}${status ? ` HTTP ${status}` : ''}`);
  error.code = code;
  return error;
}

// A successful HTTP PATCH can affect zero rows. Never count that as restoring
// a missing FK parent (for example users.id colliding on a different email ID).
async function confirmedBackupRow(res, table, expectedId) {
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.id ||
      (expectedId && rows[0].id !== expectedId)) {
    throw replicationFailure('REPLICATION_WRITE_UNCONFIRMED', table, res.status);
  }
  return rows[0];
}

async function backupRowExists(table, id) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const res = await undiciFetch(
    `${backupBase}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`,
    { headers: backupHeaders({}), dispatcher: supabaseDispatcher },
  );
  if (!res.ok) throw replicationFailure('REPLICATION_BACKUP_READ_FAILED', table, res.status);
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => row?.id !== id))
    throw replicationFailure('REPLICATION_BACKUP_READ_INVALID', table);
  return Array.isArray(rows) && rows.length > 0;
}

async function fetchPrimaryRow(table, id) {
  const primaryBase = trimBase(config.supabaseUrl);
  const res = await undiciFetch(
    `${primaryBase}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: primaryHeaders(), dispatcher: supabaseDispatcher },
  );
  if (!res.ok) throw replicationFailure('REPLICATION_PRIMARY_READ_FAILED', table, res.status);
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => row?.id !== id))
    throw replicationFailure('REPLICATION_PRIMARY_READ_INVALID', table);
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

async function fetchBackupLeadByCode(code) {
  if (!code) return null;
  const backupBase = trimBase(config.supabaseBackupUrl);
  const url = `${backupBase}/rest/v1/crm_leads?code=eq.${encodeURIComponent(code)}&select=id,type,company_id&limit=2`;
  const res = await undiciFetch(url, { headers: backupHeaders({}), dispatcher: supabaseDispatcher });
  if (!res.ok) throw replicationFailure('REPLICATION_BACKUP_READ_FAILED', 'crm_leads', res.status);
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => !row?.id))
    throw replicationFailure('REPLICATION_BACKUP_READ_INVALID', 'crm_leads');
  return rows.length ? rows[0] : null;
}

function assertCrmLeadIdentity(backupRow, sourceRow) {
  if (!backupRow) return;
  if (backupRow.id !== sourceRow.id ||
      (Object.hasOwn(sourceRow, 'company_id') && sourceRow.company_id !== backupRow.company_id)) {
    throw replicationFailure('REPLICATION_IDENTITY_CONFLICT', 'crm_leads');
  }
}

async function validateCrmLeadBackupIdentity(row, { checkPrimaryIdentity = false } = {}) {
  if (!row || typeof row !== 'object') return;
  if (checkPrimaryIdentity && row.id) {
    const current = await fetchPrimaryRow('crm_leads', row.id);
    if (!current) {
      await validateCrmLeadBackupIdentity(row);
      return { sourceMissing: true, id: row.id };
    }
    if (!['company_id', 'code', 'type'].every(key => Object.hasOwn(current, key)))
      throw replicationFailure('REPLICATION_PRIMARY_READ_INVALID', 'crm_leads');
    if (Object.hasOwn(row, 'company_id') && row.company_id !== current.company_id)
      throw replicationFailure('REPLICATION_IDENTITY_CONFLICT', 'crm_leads');
    // The original body is still what will be sent. Check its supplied code as
    // well, so an old code cannot bypass a newer current-source identity check.
    await validateCrmLeadBackupIdentity(row);
    // Partial queued PATCHes do not carry ownership/code. Check authoritative
    // primary identity while preserving the original mutation body unchanged.
    row = { ...row, company_id: current.company_id, code: current.code, type: current.type };
  }
  if (row.id && Object.hasOwn(row, 'company_id')) {
    const backupBase = trimBase(config.supabaseBackupUrl);
    const res = await undiciFetch(`${backupBase}/rest/v1/crm_leads?id=eq.${encodeURIComponent(row.id)}&select=id,company_id`,
      { headers: backupHeaders({}), dispatcher: supabaseDispatcher });
    if (!res.ok) throw replicationFailure('REPLICATION_BACKUP_READ_FAILED', 'crm_leads', res.status);
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows) || rows.length > 1 || rows.some(value => value?.id !== row.id))
      throw replicationFailure('REPLICATION_BACKUP_READ_INVALID', 'crm_leads');
    assertCrmLeadIdentity(rows[0], row);
  }
  if (row.code) assertCrmLeadIdentity(await fetchBackupLeadByCode(row.code), row);
}

/** Upsert crm_leads without inferring identity from a shared code. */
async function upsertCrmLeadOnBackup(row, depth = 0) {
  if (!row) return null;
  await validateCrmLeadBackupIdentity(row);
  for (const col of REPLICATION_PARENT_DEPS.crm_leads || []) {
    const pid = row[col];
    if (!pid) continue;
    const parentTable = resolveParentTableForColumn(col);
    if (parentTable) await ensureRowOnBackup(parentTable, pid, depth + 1);
  }

  const payload = stripRowForBackupReplication('crm_leads', row);
  const backupBase = trimBase(config.supabaseBackupUrl);
  const isLeadWithCode = row.type === 'lead' && row.code;

  async function patchLeadById(backupId, patchBody) {
    const { id, created_at, ...patch } = patchBody;
    const patchRes = await undiciFetch(
      `${backupBase}/rest/v1/crm_leads?id=eq.${encodeURIComponent(backupId)}`,
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
      return (await confirmedBackupRow(patchRes, 'crm_leads', backupId)).id;
    }
    const patchText = await patchRes.text().catch(() => '');
    const patchFk = parseFkMissingFromError(patchText);
    if (patchFk && depth < 6) {
      await ensureRowOnBackup(patchFk.parentTable, patchFk.parentId, depth + 1);
      return upsertCrmLeadOnBackup(row, depth + 1);
    }
    return null;
  }

  if (isLeadWithCode) {
    const existingByCode = await fetchBackupLeadByCode(row.code);
    if (existingByCode) {
      assertCrmLeadIdentity(existingByCode, row);
      const patchedId = await patchLeadById(existingByCode.id, payload);
      if (patchedId) return patchedId;
    }
  }

  const res = await undiciFetch(`${backupBase}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: {
      ...backupHeaders({}),
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
    dispatcher: supabaseDispatcher,
  });

  if (res.ok) {
    return (await confirmedBackupRow(res, 'crm_leads', row.id)).id;
  }

  const text = await res.text().catch(() => '');
  const fk = parseFkMissingFromError(text);
  if (fk && depth < 6) {
    await ensureRowOnBackup(fk.parentTable, fk.parentId, depth + 1);
    return upsertCrmLeadOnBackup(row, depth + 1);
  }

  if ((res.status === 409 || /23505|duplicate key/i.test(text)) && isLeadWithCode) {
    const existingByCode = await fetchBackupLeadByCode(row.code);
    if (existingByCode) {
      assertCrmLeadIdentity(existingByCode, row);
      const patchedId = await patchLeadById(existingByCode.id, payload);
      if (patchedId) return patchedId;
    }
  }

  throw new Error(`backup upsert crm_leads → ${res.status} ${text.slice(0, 200)}`);
}

/** Upsert facebook_contacts theo (page_id, psid) — tránh 409 khi backup có uuid khác primary. */
async function ensureCrmLeadOnBackup(leadId, depth = 0) {
  if (!leadId || depth > 6) throw replicationFailure('REPLICATION_PARENT_DEPTH', 'crm_leads');
  if (await backupRowExists('crm_leads', leadId)) return leadId;
  const row = await fetchPrimaryRow('crm_leads', leadId);
  if (!row) throw replicationFailure('REPLICATION_PRIMARY_ROW_MISSING', 'crm_leads');
  return upsertCrmLeadOnBackup(row, depth);
}

async function ensureFacebookContactParents(row, depth = 0) {
  if (!row || depth > 5) return row;
  let next = row;
  if (row.lead_id) {
    const backupLeadId = await ensureCrmLeadOnBackup(row.lead_id, depth);
    if (backupLeadId) {
      next = { ...next, lead_id: backupLeadId };
    }
  }
  if (row.customer_id) {
    await ensureRowOnBackup('customers', row.customer_id, depth);
    if (!(await backupRowExists('customers', row.customer_id))) {
      throw replicationFailure('REPLICATION_PARENT_UNCONFIRMED', 'customers');
    }
  }
  return next;
}

async function upsertFacebookContactOnBackup(row, depth = 0) {
  const backupBase = trimBase(config.supabaseBackupUrl);
  const pageId = row?.page_id;
  const psid = row?.psid;
  if (!pageId || !psid) return null;

  const rowToWrite = await ensureFacebookContactParents(row, depth);

  const { res: upsertRes, text: upsertText } = await backupFetchWithErrorText(() => undiciFetch(
    `${backupBase}/rest/v1/facebook_contacts?on_conflict=page_id,psid`,
    {
      method: 'POST',
      headers: {
        ...backupHeaders({}),
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(rowToWrite),
      dispatcher: supabaseDispatcher,
    },
  ));

  if (upsertRes.ok) {
    return (await confirmedBackupRow(upsertRes, 'facebook_contacts')).id;
  }

  const text = upsertText || await upsertRes.text().catch(() => '');
  const fk = parseFkMissingFromError(text);
  if (fk && depth < 6) {
    await ensureRowOnBackup(fk.parentTable, fk.parentId, depth + 1);
    return upsertFacebookContactOnBackup(row, depth + 1);
  }

  if (upsertRes.status === 409 || /23505|duplicate key/i.test(text)) {
    const { id, created_at, ...patch } = rowToWrite;
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
      return (await confirmedBackupRow(patchRes, 'facebook_contacts')).id;
    }
    const patchText = await patchRes.text().catch(() => '');
    const patchFk = parseFkMissingFromError(patchText);
    if (patchFk && depth < 6) {
      await ensureRowOnBackup(patchFk.parentTable, patchFk.parentId, depth + 1);
      return upsertFacebookContactOnBackup(row, depth + 1);
    }
    throw new Error(`backup upsert facebook_contacts → ${patchRes.status} ${patchText.slice(0, 200)}`);
  }

  throw new Error(`backup upsert facebook_contacts → ${upsertRes.status} ${text.slice(0, 200)}`);
}

async function ensureFacebookContactOnBackup(primaryContactId, depth = 0) {
  if (!primaryContactId || depth > 4) throw replicationFailure('REPLICATION_PARENT_DEPTH', 'facebook_contacts');
  const row = await fetchPrimaryRow('facebook_contacts', primaryContactId);
  if (!row) throw replicationFailure('REPLICATION_PRIMARY_ROW_MISSING', 'facebook_contacts');
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
  if (table === 'crm_leads') {
    await upsertCrmLeadOnBackup(row, depth);
    return;
  }
  let payload = stripRowForBackupReplication(table, row);
  // Parent deps trước khi insert
  const deps = REPLICATION_PARENT_DEPS[table] || [];
  for (const col of deps) {
    const pid = payload?.[col];
    if (!pid) continue;
    const parentTable = resolveParentTableForColumn(col);
    if (parentTable) await ensureRowOnBackup(parentTable, pid, depth + 1);
  }

  const backupBase = trimBase(config.supabaseBackupUrl);
  const { res, text: responseText } = await backupFetchWithErrorText(() => undiciFetch(
    `${backupBase}/rest/v1/${table}?on_conflict=id&select=id`,
    {
      method: 'POST',
      headers: {
        ...backupHeaders({}),
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
      dispatcher: supabaseDispatcher,
    },
  ));
  if (res.ok) {
    await confirmedBackupRow(res, table, row.id);
    return;
  }
  const text = responseText || await res.text().catch(() => '');
  const fk = parseFkMissingFromError(text);
  if (fk && depth < 4) {
    await ensureRowOnBackup(fk.parentTable, fk.parentId, depth + 1);
    // Keep the FK intact if the source parent cannot be restored.
    if (
      fk.childColumn === 'template_item_id'
      && !(await backupRowExists('crm_daily_report_template_items', fk.parentId))
    ) {
      throw replicationFailure('REPLICATION_PARENT_UNCONFIRMED', fk.parentTable);
    }
    return postRowToBackup(table, row, depth + 1);
  }
  // 409 duplicate mà không có on_conflict hiệu lực → PATCH theo id
  if ((res.status === 409 || /23505|duplicate key/i.test(text)) && payload?.id) {
    const { id, created_at, ...patch } = payload;
    const patchRes = await undiciFetch(
      `${backupBase}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`,
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
      try {
        await confirmedBackupRow(patchRes, table, id);
      } catch (error) {
        if (table === 'users' && /23505/.test(text))
          throw replicationFailure('REPLICATION_IDENTITY_CONFLICT', table);
        throw error;
      }
      return;
    }
  }
  throw new Error(`backup upsert ${table} → ${res.status} ${text.slice(0, 200)}`);
}

async function ensureRowOnBackup(table, id, depth = 0) {
  if (!table || !id || depth > 6) throw replicationFailure('REPLICATION_PARENT_DEPTH', table);
  if (table === 'facebook_contacts') {
    await ensureFacebookContactOnBackup(id, depth);
    return;
  }
  if (table === 'crm_leads') {
    await ensureCrmLeadOnBackup(id, depth);
    return;
  }
  if (await backupRowExists(table, id)) return;
  const row = await fetchPrimaryRow(table, id);
  if (!row) throw replicationFailure('REPLICATION_PRIMARY_ROW_MISSING', table);
  await postRowToBackup(table, row, depth);
}

async function ensureReplicationTargetRow(job) {
  const method = String(job.method || '').toUpperCase();
  // A delete must never recreate the row it is supposed to remove.
  if (!['PATCH', 'PUT'].includes(method)) return;
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
      const resolvedTable = (table === 'facebook_messages' && column === 'contact_id')
        ? 'facebook_contacts'
        : resolveParentTableForColumn(column);
      if (resolvedTable) await ensureRowOnBackup(resolvedTable, id);
    }
  }
}

async function redisPush(job) {
  const redis = getRedisIfReady();
  if (redis) {
    await redis.rpush(REDIS_KEY, JSON.stringify(job));
    return;
  }
  memQueue.push(job);
}

async function requeueReplicationJob(job, err, entry) {
  const retry = Math.min(Number.isSafeInteger(job.retry) && job.retry > 0 ? job.retry + 1 : 1, 1000000);
  const now = Date.now();
  // Never discard a failed operation. A blocked parent requires reconciliation,
  // not a successful-looking decrease in queue depth after twelve failures.
  const delay = Math.min(300000, 5000 * 2 ** Math.min(retry - 1, 6));
  const next = { ...job, retry, deferred_at: new Date(now).toISOString(),
    next_attempt_at: new Date(now + delay).toISOString() };
  // Keep a failed operation ahead of every later operation for the same row.
  // Moving it to the tail could replay stale data after a newer PATCH/DELETE.
  if (!entry) throw replicationFailure('REPLICATION_QUEUE_RETRY_UNCONFIRMED');
  await replaceQueueEntry(entry, next);
}

function replicationRetryDue(job) {
  const when = Date.parse(job?.next_attempt_at || '');
  return !Number.isFinite(when) || when <= Date.now();
}

function replicationErrorSummary(error) {
  const message = String(error?.message || error || '');
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code : message.match(/"code"\s*:\s*"([A-Z0-9_]+)"/)?.[1] || 'REPLICATION_APPLY_FAILED';
  const table = message.match(/backup (?:upsert |(?:POST|PATCH|PUT|DELETE) \/rest\/v1\/)([a-z_]+)/i)?.[1];
  const fk = parseFkMissingFromError(message);
  return [code, table, fk && `parent=${fk.parentTable} column=${fk.childColumn}`,
    message.match(/HTTP \d{3}/)?.[0]].filter(Boolean).join(' ');
}

async function pendingQueueEntries(redis) {
  if (redis) {
    const raw = await redis.lrange(REDIS_KEY, 0, -1);
    return raw.map(value => ({ job: JSON.parse(value), raw: value, redis }));
  }
  return memQueue.slice().map(job => ({ job }));
}

async function withQueueConsumer(fn) {
  const redis = getRedisIfReady();
  if (!redis) return fn(null, async () => {});
  const token = randomUUID();
  let acquired;
  try { acquired = await redis.set(REDIS_CONSUMER_KEY, token, 'NX'); }
  catch { throw replicationFailure('REPLICATION_CONSUMER_LOCK_UNAVAILABLE'); }
  if (acquired !== 'OK') return { processed: 0, failed: 0, deferred: 0, skipped: true, consumer_locked: true };
  // Deliberately no TTL: an expired lease could permit a new consumer while an
  // old HTTP write is still in flight. After a crash, operators must prove the
  // old process stopped before recovering this lock. Never auto-delete it.
  const assertOwned = async () => {
    let owner;
    try { owner = await redis.get(REDIS_CONSUMER_KEY); }
    catch { throw replicationFailure('REPLICATION_CONSUMER_LOCK_UNAVAILABLE'); }
    if (owner !== token) throw replicationFailure('REPLICATION_CONSUMER_LOCK_LOST');
  };
  try { return await fn(redis, assertOwned); }
  finally {
    try {
      await redis.eval(`
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
        return 0`, 1, REDIS_CONSUMER_KEY, token);
    } catch {
      console.warn('[supabase-replication] REPLICATION_CONSUMER_LOCK_RELEASE_UNCONFIRMED');
    }
  }
}

async function replaceQueueEntry(entry, next) {
  if (entry.redis) {
    // Compare and replace atomically: another writer can append while we work.
    const updated = await entry.redis.eval(`
      local values = redis.call('LRANGE', KEYS[1], 0, -1)
      for i, value in ipairs(values) do
        if value == ARGV[1] then
          redis.call('LSET', KEYS[1], i - 1, ARGV[2])
          return 1
        end
      end
      return 0`, 1, REDIS_KEY, entry.raw, JSON.stringify(next));
    if (Number(updated) !== 1) throw replicationFailure('REPLICATION_QUEUE_RETRY_UNCONFIRMED');
    return;
  }
  const index = memQueue.indexOf(entry.job);
  if (index < 0) throw replicationFailure('REPLICATION_QUEUE_RETRY_UNCONFIRMED');
  memQueue[index] = next;
}

async function acknowledgeQueueEntry(entry) {
  if (entry.redis) {
    const removed = await entry.redis.lrem(REDIS_KEY, 1, entry.raw);
    if (Number(removed) !== 1) throw replicationFailure('REPLICATION_QUEUE_ACK_UNCONFIRMED');
    return;
  }
  const index = memQueue.indexOf(entry.job);
  if (index < 0) throw replicationFailure('REPLICATION_QUEUE_ACK_UNCONFIRMED');
  memQueue.splice(index, 1);
}

function replicationScopes(job) {
  if (job.type === 'storage') return [{ table: `storage:${job.bucket || '*'}`, key: job.path || '*' }];
  const table = restTableFromPath(job.path);
  if (!table) return [{ table: '*', key: '*' }];
  // These tables can map distinct primary IDs onto a shared natural-key row.
  if (['crm_leads', 'facebook_contacts'].includes(table)) return [{ table, key: '*' }];
  const conflicts = parseOnConflictColumns(job.path);
  if (conflicts && (conflicts.length !== 1 || conflicts[0] !== 'id')) return [{ table, key: '*' }];
  const id = extractEqFilterId(job.path, 'id');
  if (id) return [{ table, key: id }];
  if (String(job.method).toUpperCase() === 'POST') {
    const parsed = parseJsonBody(job.body);
    const rows = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : [];
    if (rows.length && rows.every(row => typeof row?.id === 'string' && row.id))
      return rows.map(row => ({ table, key: row.id }));
  }
  // Arbitrary filters/composite keys can overlap. A table fence is conservative.
  return [{ table, key: '*' }];
}

function scopesOverlap(left, right) {
  return left.some(a => right.some(b => a.table === '*' || b.table === '*' ||
    (a.table === b.table && (a.key === '*' || b.key === '*' || a.key === b.key))));
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

/** Mirror a primary CRM RPC's committed row; never replay business RPCs on backup. */
async function enqueueCommittedCrmLeadReplication(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      typeof row.id !== 'string' || !row.id.trim()) {
    throw replicationFailure('REPLICATION_COMMITTED_ROW_INVALID', 'crm_leads');
  }
  const path = '/rest/v1/crm_leads?on_conflict=id';
  if (!canReplicate() || shouldSkipRestUrl(path)) return { enqueued: false, skipped: true };
  let body;
  try { body = JSON.stringify(stripRowForBackupReplication('crm_leads', row)); }
  catch { throw replicationFailure('REPLICATION_COMMITTED_ROW_INVALID', 'crm_leads'); }
  const job = { id: randomUUID(), type: 'rest', method: 'POST', path,
    committed_crm_projection: true, entity_id: row.id,
    headers: sanitizeReplicationHeaders({ 'content-type': 'application/json' }),
    body, enqueued_at: new Date().toISOString() };
  try { await redisPush(job); }
  catch { throw replicationFailure('REPLICATION_QUEUE_ENQUEUE_FAILED', 'crm_leads'); }
  _stats.enqueued += 1;
  return { enqueued: true, job_id: job.id };
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
  if (job.committed_crm_projection) {
    const id = job.entity_id;
    if (typeof id !== 'string' || !id) throw replicationFailure('REPLICATION_COMMITTED_ROW_INVALID', 'crm_leads');
    // A delayed RPC response can arrive after a newer write/delete. Reconcile
    // the current source state instead of replaying its stale returned snapshot.
    const current = await fetchPrimaryRow('crm_leads', id);
    if (!current) await validateCrmLeadBackupIdentity(parseJsonBody(job.body));
    return applyRestJob({ ...job, committed_crm_projection: false,
      method: current ? 'POST' : 'DELETE',
      path: current ? '/rest/v1/crm_leads?on_conflict=id' : `/rest/v1/crm_leads?id=eq.${encodeURIComponent(id)}`,
      body: current ? JSON.stringify(current) : null });
  }
  const path = sanitizeReplicationRestPath(job.path);
  const method = String(job.method || 'GET').toUpperCase();
  const table = restTableFromPath(path);
  let headers = backupHeaders(sanitizeReplicationHeaders(job.headers || {}));
  headers = ensureUpsertPrefer(headers, path, method);
  let body = job.body ?? undefined;
  if (body != null && table === 'facebook_messages') {
    body = await remapFacebookMessagesBodyForBackup(body);
  }
  if (body != null && table) {
    body = stripReplicationBody(table, body);
  }
  if (body != null) {
    headers['content-type'] = headers['content-type'] || 'application/json';
  }
  headers.prefer = headers.prefer || 'return=minimal';
  if (['PATCH', 'PUT'].includes(method)) {
    const preferences = headers.prefer.split(',').map(part => part.trim())
      .filter(part => part && !part.toLowerCase().startsWith('return='));
    headers.prefer = [...preferences, 'return=representation'].join(',');
  }

  const prepared = { ...job, path, body };
  if (table === 'crm_leads' && ['POST', 'PATCH', 'PUT'].includes(method)) {
    const parsed = parseJsonBody(body);
    const rows = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : [];
    for (const row of rows) {
      const identity = await validateCrmLeadBackupIdentity({ ...row, id: row?.id || extractEqFilterId(path, 'id') }, { checkPrimaryIdentity: true });
      if (identity?.sourceMissing) {
        if (rows.length !== 1) throw replicationFailure('REPLICATION_SOURCE_ABSENCE_RECONCILIATION_REQUIRED', 'crm_leads');
        // The source has authoritatively deleted this exact UUID. Apply a real
        // idempotent delete rather than holding an obsolete PATCH ahead of its
        // later DELETE forever. Known code/context aliases were checked above;
        // historical unknown aliases still require separate reconciliation.
        return applyRestJob({ ...job, method: 'DELETE', path: `/rest/v1/crm_leads?id=eq.${encodeURIComponent(identity.id)}`, body: null });
      }
    }
  }
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

  async function confirmed(res) {
    if (!res.ok) return false;
    if (['PATCH', 'PUT'].includes(method)) {
      const rows = await res.json().catch(() => null);
      const expectedId = extractEqFilterId(path, 'id');
      if (!Array.isArray(rows) || rows.length === 0 ||
          rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length === 0) ||
          (expectedId && (rows.length !== 1 || rows[0].id !== expectedId)))
        throw replicationFailure('REPLICATION_WRITE_UNCONFIRMED', table, res.status);
    }
    return true;
  }

  let { res, text } = await backupFetchWithErrorText(doFetch);
  if (await confirmed(res)) return;
  if (!text) text = await res.text().catch(() => '');
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
    if (await confirmed(res)) return;
    text = await res.text().catch(() => '');
    if (method === 'DELETE' && (res.status === 404 || /PGRST116|0 rows/i.test(text))) {
      return;
    }
  }
  if (
    method === 'POST'
    && table === 'crm_leads'
    && (res.status === 409 || /23505|duplicate key/i.test(text))
  ) {
    const parsed = parseJsonBody(body);
    const rows = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : [];
    let ok = rows.length > 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      try {
        await upsertCrmLeadOnBackup(row, 0);
      } catch {
        ok = false;
      }
    }
    if (ok && rows.length) return;
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
}

async function processQueueBatch(maxJobs, force = false) {
  return withQueueConsumer(async (redis, assertOwned) => {
    let processed = 0;
    let failed = 0;
    let deferred = 0;
    const blocked = [];
    // Snapshot pending order to carry every earlier fence, including a long
    // blocked prefix. HTTP attempts remain bounded; unrelated rows can progress.
    const limit = Math.max(1, Math.min(1000, Math.floor(Number(maxJobs)) || 100));
    const entries = await pendingQueueEntries(redis);
    for (const entry of entries) {
      if (processed + failed >= limit) break;
      const { job } = entry;
      if (!force && !isActivePrimary()) break;
      const scopes = replicationScopes(job);
      if (!replicationRetryDue(job) || scopesOverlap(scopes, blocked)) {
        blocked.push(...scopes);
        deferred++;
        continue;
      }
      try {
        await assertOwned();
        await applyJob(job);
        await assertOwned();
        await acknowledgeQueueEntry(entry);
        _stats.applied += 1;
        _stats.last_applied_at = new Date().toISOString();
        processed += 1;
      } catch (e) {
        failed += 1;
        _stats.failed += 1;
        _stats.last_error = replicationErrorSummary(e);
        if (/^REPLICATION_CONSUMER_LOCK_/.test(e.code || '')) throw e;
        if ((job.retry || 0) < 3) {
          console.warn('[supabase-replication] apply failed:',
            job.type === 'storage' ? 'storage' : restTableFromPath(job.path), _stats.last_error);
        }
        blocked.push(...scopes);
        await requeueReplicationJob(job, e, entry);
      }
    }
    return { processed, failed, deferred };
  });
}

async function drainReplicationQueue({ maxJobs = 100, force = false } = {}) {
  if (!isReplicationConfigured() || (!force && !isActivePrimary()) || _workerBusy) {
    return { processed: 0, failed: 0, remaining: await getQueueDepth(), skipped: true };
  }
  _workerBusy = true;
  let result;
  try {
    result = await processQueueBatch(maxJobs, force);
  } finally {
    _workerBusy = false;
  }
  return { ...result, remaining: await getQueueDepth() };
}

async function workerTickBatch() {
  if (_workerBusy || !isReplicationConfigured()) return { processed: 0, idle: true };
  if (!isActivePrimary()) return { processed: 0, idle: true };

  const cfg = replicationConfig();
  _workerBusy = true;
  try {
    const result = await processQueueBatch(cfg.batchSize);
    return { ...result, idle: result.processed === 0 };
  } finally {
    _workerBusy = false;
  }
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
    next_attempt_at: job.next_attempt_at || null,
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
    queue_storage: getRedisIfReady() ? 'redis' : 'process_memory',
    retry_policy: 'retain_with_backoff',
    queue_ordering: 'fifo_per_entity',
    redis_consumer_recovery: 'manual_after_owner_stopped',
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
  enqueueCommittedCrmLeadReplication,
  replicateStorageUpload,
  startReplicationWorker,
  getReplicationStatus,
  getQueueDepth,
  drainReplicationQueue,
  listReplicationQueue,
  summarizeReplicationJob,
};
