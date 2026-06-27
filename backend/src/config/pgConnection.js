/**
 * PostgreSQL connection helpers — ưu tiên pooler (6543) trên cloud (Render không có IPv6 tới db.*.supabase.co).
 */
const dns = require('dns');

function projectRefFromSupabaseUrl(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1].toLowerCase() : '';
}

function primaryProjectRef() {
  return process.env.PRIMARY_PROJECT_REF
    || projectRefFromSupabaseUrl(process.env.SUPABASE_URL)
    || '';
}

function backupProjectRef() {
  return process.env.BACKUP_PROJECT_REF
    || projectRefFromSupabaseUrl(process.env.SUPABASE_BACKUP_URL)
    || '';
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

function pgCliEnv(connectionUrl) {
  const { password } = parsePgConnectionUrl(connectionUrl);
  return { ...process.env, PGPASSWORD: password, PGSSLMODE: 'require' };
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
  resolvePrimaryDbDumpUrl,
  resolveBackupDbDumpUrl,
  toSessionPoolerUrl,
  normalizeSupabasePoolerUrl,
  primaryProjectRef,
  backupProjectRef,
  projectRefFromSupabaseUrl,
  parsePgConnectionUrl,
  pgCliEnv,
  listPgProbeCandidates,
  ipv4Lookup,
  buildPgPoolConfig,
  classifyPgError,
  isPgCircuitBreakerError,
  isPgPasswordAuthError,
  describePgTarget,
  sleep,
  withPgCircuitBreakerRetry,
};
