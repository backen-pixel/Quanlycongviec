/**
 * PostgreSQL connection helpers — ưu tiên pooler (6543) trên cloud (Render không có IPv6 tới db.*.supabase.co).
 */
const dns = require('dns');

function projectRefFromSupabaseUrl(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1].toLowerCase() : '';
}

/** Lấy project ref từ URI Postgres (pooler user postgres.ref hoặc host db.ref.supabase.co). */
function projectRefFromPgUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.username.startsWith('postgres.')) {
      return u.username.slice('postgres.'.length).split('.')[0].toLowerCase();
    }
    const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    /* ignore */
  }
  return '';
}

function primaryProjectRef() {
  return (
    process.env.PRIMARY_PROJECT_REF
    || projectRefFromSupabaseUrl(process.env.SUPABASE_URL)
    || projectRefFromPgUrl(process.env.SUPABASE_DB_URL)
    || projectRefFromPgUrl(process.env.SUPABASE_DB_DIRECT_URL)
    || projectRefFromPgUrl(process.env.DATABASE_URL)
    || ''
  ).toLowerCase();
}

function backupProjectRef() {
  return (
    process.env.BACKUP_PROJECT_REF
    || projectRefFromSupabaseUrl(process.env.SUPABASE_BACKUP_URL)
    || projectRefFromPgUrl(process.env.SUPABASE_BACKUP_DB_URL)
    || projectRefFromPgUrl(process.env.SUPABASE_BACKUP_DB_DIRECT_URL)
    || ''
  ).toLowerCase();
}

/** Pooler Supavisor bắt buộc user postgres.{project_ref} — luôn ghi đè trên pooler. */
function normalizeSupabasePoolerUrl(connectionUrl, projectRef = '') {
  if (!connectionUrl) return '';
  try {
    const u = new URL(connectionUrl);
    if (!u.hostname.includes('pooler.supabase.com')) return connectionUrl;
    let ref = String(projectRef || '').trim();
    if (!ref && u.username.startsWith('postgres.')) {
      ref = u.username.slice('postgres.'.length).split('@')[0].split('.')[0];
    }
    if (ref) {
      u.username = `postgres.${ref}`;
    }
    return u.toString();
  } catch {
    return connectionUrl;
  }
}

function describePgTarget(connectionUrl) {
  try {
    const { user, host, port, database } = parsePgConnectionUrl(connectionUrl);
    return `${user}@${host}:${port}/${database}`;
  } catch {
    return '(invalid url)';
  }
}

function parsePgConnectionUrl(connectionUrl) {
  const u = new URL(connectionUrl);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username || 'postgres'),
    password: decodeURIComponent(u.password || ''),
    database: (u.pathname || '/postgres').replace(/^\//, '') || 'postgres',
  };
}

function mergePgOptions(base, extra) {
  const b = String(base || '').trim();
  const e = String(extra || '').trim();
  if (!b) return e;
  if (!e) return b;
  return `${b} ${e}`;
}

function pgCliEnv(connectionUrl, opts = {}) {
  const { password } = parsePgConnectionUrl(connectionUrl);
  const env = { ...process.env, PGPASSWORD: password, PGSSLMODE: 'require' };
  const pgOptions = mergePgOptions(process.env.PGOPTIONS, opts.pgOptions);
  if (pgOptions) env.PGOPTIONS = pgOptions;
  return env;
}

/** Tắt trigger + FK check khi pg_restore data-only (tránh trigger CRM cập nhật bảng chưa sync). */
function pgRestoreEnv(connectionUrl) {
  return pgCliEnv(connectionUrl, { pgOptions: '-c session_replication_role=replica' });
}

function resolvePgProbeUrl(directUrl, poolUrl) {
  if (process.env.PG_MONITOR_USE_DIRECT === '1') {
    return directUrl || poolUrl || '';
  }
  return poolUrl || directUrl || '';
}

function resolvePrimaryDbUrl(mode = 'probe') {
  const pool = normalizeSupabasePoolerUrl(
    process.env.SUPABASE_DB_URL || '',
    primaryProjectRef(),
  ) || normalizeSupabasePoolerUrl(process.env.DATABASE_URL || '', primaryProjectRef());
  const direct = process.env.SUPABASE_DB_DIRECT_URL || '';
  if (mode === 'session') return direct || pool;
  return resolvePgProbeUrl(direct, pool);
}

function resolveBackupDbUrl(mode = 'probe') {
  const pool = normalizeSupabasePoolerUrl(
    process.env.SUPABASE_BACKUP_DB_URL || '',
    backupProjectRef(),
  );
  const direct = process.env.SUPABASE_BACKUP_DB_DIRECT_URL || '';
  if (mode === 'session') return direct || pool;
  return resolvePgProbeUrl(direct, pool);
}

function resolvePrimaryDbProbeInputs() {
  const pool = normalizeSupabasePoolerUrl(
    process.env.SUPABASE_DB_URL || '',
    primaryProjectRef(),
  ) || normalizeSupabasePoolerUrl(process.env.DATABASE_URL || '', primaryProjectRef());
  return {
    pool,
    direct: process.env.SUPABASE_DB_DIRECT_URL || '',
    projectRef: primaryProjectRef(),
  };
}

function resolveBackupDbProbeInputs() {
  return {
    pool: normalizeSupabasePoolerUrl(
      process.env.SUPABASE_BACKUP_DB_URL || '',
      backupProjectRef(),
    ),
    direct: process.env.SUPABASE_BACKUP_DB_DIRECT_URL || '',
    projectRef: backupProjectRef(),
  };
}

function listPrimaryPgProbeCandidates() {
  const { pool, direct } = resolvePrimaryDbProbeInputs();
  return listPgProbeCandidates(direct, pool);
}

function listBackupPgProbeCandidates() {
  const { pool, direct } = resolveBackupDbProbeInputs();
  return listPgProbeCandidates(direct, pool);
}

/**
 * Thử lần lượt các URL probe (6543 → session 5432 → direct nếu bật).
 * @returns {Promise<{ pool: import('pg').Pool, url: string }>}
 */
async function connectPgWithProbeCandidates(candidateUrls, { label = 'PG', onLog } = {}) {
  const { Pool } = require('pg');
  const urls = [...new Set((candidateUrls || []).filter(Boolean))];
  if (!urls.length) {
    throw new Error(`${label}: chưa cấu hình SUPABASE_DB_URL / SUPABASE_BACKUP_DB_URL`);
  }
  let lastErr;
  for (const url of urls) {
    onLog?.(`${label}: thử ${describePgTarget(url)}`);
    const pool = new Pool({ ...buildPgPoolConfig(url), max: 2 });
    try {
      await pool.query('SELECT 1');
      onLog?.(`${label}: OK qua ${describePgTarget(url)}`);
      return { pool, url };
    } catch (e) {
      lastErr = e;
      await pool.end().catch(() => {});
    }
  }
  const hint = /password authentication failed for user "postgres"/i.test(String(lastErr?.message || ''))
    ? ` — trên pooler cần user postgres.{project_ref}, không phải postgres`
    : '';
  throw new Error(`${lastErr?.message || 'Không kết nối PG'}${hint}`);
}

/** Session pooler (5432) — dùng cho pg_dump trên Render (không có IPv6 tới db.*). */
function toSessionPoolerUrl(poolUrl) {
  if (!poolUrl || !poolUrl.includes('pooler.supabase.com')) return '';
  if (poolUrl.includes('pooler.supabase.com:5432')) return poolUrl;
  if (poolUrl.includes('pooler.supabase.com:6543')) {
    return poolUrl.replace('pooler.supabase.com:6543', 'pooler.supabase.com:5432');
  }
  return '';
}

function resolvePrimaryDbDumpUrl() {
  if (process.env.PG_DUMP_USE_DIRECT === '1') {
    return process.env.SUPABASE_DB_DIRECT_URL || process.env.DATABASE_URL || '';
  }
  const pool = normalizeSupabasePoolerUrl(
    process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '',
    primaryProjectRef(),
  );
  return toSessionPoolerUrl(pool) || pool || '';
}

function resolveBackupDbDumpUrl() {
  if (process.env.PG_DUMP_USE_DIRECT === '1') {
    return process.env.SUPABASE_BACKUP_DB_DIRECT_URL || '';
  }
  const pool = normalizeSupabasePoolerUrl(
    process.env.SUPABASE_BACKUP_DB_URL || '',
    backupProjectRef(),
  );
  return toSessionPoolerUrl(pool) || pool || '';
}

/** Thử lần lượt pool 6543 → session pooler 5432 → direct (nếu bật). */
function listPgProbeCandidates(directUrl, poolUrl) {
  const urls = [];
  const preferred = resolvePgProbeUrl(directUrl, poolUrl);
  if (preferred) urls.push(preferred);
  const sessionPool = toSessionPoolerUrl(poolUrl);
  if (sessionPool && !urls.includes(sessionPool)) urls.push(sessionPool);
  if (process.env.PG_MONITOR_USE_DIRECT === '1' && directUrl && !urls.includes(directUrl)) {
    urls.push(directUrl);
  }
  return urls;
}

/** Ép IPv4 — tránh ENETUNREACH khi hostname resolve ra IPv6 trên server không có IPv6. */
function ipv4Lookup(hostname, options, callback) {
  dns.lookup(hostname, { ...(options || {}), family: 4 }, callback);
}

function buildPgPoolConfig(connectionString, extra = {}) {
  if (!connectionString) return null;
  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
    lookup: ipv4Lookup,
    ...extra,
  };
}

function classifyPgError(err) {
  const msg = String(err?.message || err || '');
  if (err?.code === '28P01' || /password authentication failed/i.test(msg)) {
    return { error: 'password_auth_failed', message: 'Sai mật khẩu DB — cập nhật URL trên Render' };
  }
  if (err?.code === 'ENETUNREACH' || /ENETUNREACH/i.test(msg)) {
    return {
      error: 'ipv6_unreachable',
      message: 'Không kết nối IPv6 tới db.*.supabase.co — dùng pooler (6543) hoặc cập nhật SUPABASE_DB_URL',
    };
  }
  if (err?.code === 'XX000' || /ECIRCUITBREAKER/i.test(msg)) {
    return { error: 'circuit_breaker', message: 'Supabase tạm khóa kết nối — thử lại sau vài phút' };
  }
  return { error: 'connect_failed', message: msg.slice(0, 200) || 'Không kết nối được PostgreSQL' };
}

function isPgCircuitBreakerError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === 'XX000' || /ECIRCUITBREAKER|circuit breaker|too many authentication failures/i.test(msg);
}

function isPgPasswordAuthError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '28P01' || /password authentication failed/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** Retry PG connect khi Supabase ECIRCUITBREAKER (quá nhiều lần auth fail trước đó). */
async function withPgCircuitBreakerRetry(fn, { label = 'PG', onWait } = {}) {
  const waits = [0, 45_000, 90_000, 120_000];
  let lastErr;
  for (let i = 0; i < waits.length; i += 1) {
    if (waits[i] > 0) {
      const sec = Math.round(waits[i] / 1000);
      onWait?.(`${label}: ECIRCUITBREAKER — đợi ${sec}s rồi thử lại (${i + 1}/${waits.length})…`);
      await sleep(waits[i]);
    }
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isPgCircuitBreakerError(e)) throw e;
    }
  }
  const classified = classifyPgError(lastErr);
  throw new Error(classified.message || lastErr?.message || 'ECIRCUITBREAKER');
}

module.exports = {
  resolvePgProbeUrl,
  resolvePrimaryDbUrl,
  resolveBackupDbUrl,
  resolvePrimaryDbProbeInputs,
  resolveBackupDbProbeInputs,
  resolvePrimaryDbDumpUrl,
  resolveBackupDbDumpUrl,
  toSessionPoolerUrl,
  normalizeSupabasePoolerUrl,
  primaryProjectRef,
  backupProjectRef,
  projectRefFromSupabaseUrl,
  projectRefFromPgUrl,
  parsePgConnectionUrl,
  pgCliEnv,
  pgRestoreEnv,
  listPgProbeCandidates,
  listPrimaryPgProbeCandidates,
  listBackupPgProbeCandidates,
  connectPgWithProbeCandidates,
  ipv4Lookup,
  buildPgPoolConfig,
  classifyPgError,
  isPgCircuitBreakerError,
  isPgPasswordAuthError,
  describePgTarget,
  sleep,
  withPgCircuitBreakerRetry,
};
