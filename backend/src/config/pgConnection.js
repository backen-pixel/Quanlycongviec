/**
 * PostgreSQL connection helpers — ưu tiên pooler (6543) trên cloud (Render không có IPv6 tới db.*.supabase.co).
 */
const dns = require('dns');

function resolvePgProbeUrl(directUrl, poolUrl) {
  if (process.env.PG_MONITOR_USE_DIRECT === '1') {
    return directUrl || poolUrl || '';
  }
  return poolUrl || directUrl || '';
}

function resolvePrimaryDbUrl(mode = 'probe') {
  const pool = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
  const direct = process.env.SUPABASE_DB_DIRECT_URL || process.env.DATABASE_URL || '';
  if (mode === 'session') return direct || pool;
  return resolvePgProbeUrl(direct, pool);
}

function resolveBackupDbUrl(mode = 'probe') {
  const pool = process.env.SUPABASE_BACKUP_DB_URL || '';
  const direct = process.env.SUPABASE_BACKUP_DB_DIRECT_URL || '';
  if (mode === 'session') return direct || pool;
  return resolvePgProbeUrl(direct, pool);
}

/** Session pooler (5432) — dùng cho pg_dump trên Render (không có IPv6 tới db.*). */
function toSessionPoolerUrl(poolUrl) {
  if (!poolUrl || !poolUrl.includes('pooler.supabase.com:6543')) return '';
  return poolUrl.replace('pooler.supabase.com:6543', 'pooler.supabase.com:5432');
}

function resolvePrimaryDbDumpUrl() {
  if (process.env.PG_DUMP_USE_DIRECT === '1') {
    return process.env.SUPABASE_DB_DIRECT_URL || process.env.DATABASE_URL || '';
  }
  return toSessionPoolerUrl(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '')
    || process.env.SUPABASE_DB_DIRECT_URL
    || process.env.SUPABASE_DB_URL
    || process.env.DATABASE_URL
    || '';
}

function resolveBackupDbDumpUrl() {
  if (process.env.PG_DUMP_USE_DIRECT === '1') {
    return process.env.SUPABASE_BACKUP_DB_DIRECT_URL || '';
  }
  return toSessionPoolerUrl(process.env.SUPABASE_BACKUP_DB_URL || '')
    || process.env.SUPABASE_BACKUP_DB_DIRECT_URL
    || process.env.SUPABASE_BACKUP_DB_URL
    || '';
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

module.exports = {
  resolvePgProbeUrl,
  resolvePrimaryDbUrl,
  resolveBackupDbUrl,
  resolvePrimaryDbDumpUrl,
  resolveBackupDbDumpUrl,
  toSessionPoolerUrl,
  listPgProbeCandidates,
  ipv4Lookup,
  buildPgPoolConfig,
  classifyPgError,
};
