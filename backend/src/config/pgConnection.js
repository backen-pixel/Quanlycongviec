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
  ipv4Lookup,
  buildPgPoolConfig,
  classifyPgError,
};
