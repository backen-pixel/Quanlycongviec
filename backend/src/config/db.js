/**
 * pg.Pool — Supavisor transaction mode (6543) cho read aggregate 1-shot;
 * session pool (5432) cho multi-statement tx khi cần.
 *
 * Disable: PG_POOL_DISABLED=1 → pgQuery trả null, caller fallback Supabase REST.
 * Failover: khi active target = backup → dùng SUPABASE_BACKUP_DB_URL / DIRECT.
 */

const { Pool } = require('pg');
const { buildPgPoolConfig, normalizeSupabasePoolerUrl, primaryProjectRef, backupProjectRef } = require('./pgConnection');

const PG_DISABLED = process.env.PG_POOL_DISABLED === '1';
const PG_AUTH_BACKOFF_MS = parseInt(process.env.PG_AUTH_BACKOFF_MS || String(10 * 60 * 1000), 10);

let _pgAuthBackoffUntil = 0;
let _pool = null;
let _sessionPool = null;
let _poolUrl = null;
let _sessionPoolUrl = null;

function _activeDbUrl() {
  try {
    const { getActiveTarget, isFailoverEnabled } = require('./supabaseRouter');
    if (isFailoverEnabled() && getActiveTarget() === 'backup' && process.env.SUPABASE_BACKUP_DB_URL) {
      return normalizeSupabasePoolerUrl(process.env.SUPABASE_BACKUP_DB_URL, backupProjectRef());
    }
  } catch { /* ignore */ }
  return normalizeSupabasePoolerUrl(
    process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '',
    primaryProjectRef(),
  );
}

function _activeDbDirectUrl() {
  try {
    const { getActiveTarget, isFailoverEnabled } = require('./supabaseRouter');
    if (isFailoverEnabled() && getActiveTarget() === 'backup' && process.env.SUPABASE_BACKUP_DB_DIRECT_URL) {
      return process.env.SUPABASE_BACKUP_DB_DIRECT_URL;
    }
  } catch { /* ignore */ }
  return process.env.SUPABASE_DB_DIRECT_URL || process.env.DATABASE_URL || '';
}

function _buildPool(connectionString, maxDefault) {
  if (!connectionString) return null;
  const pool = new Pool(buildPgPoolConfig(connectionString, {
    max: parseInt(process.env.PG_POOL_MAX || String(maxDefault), 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    query_timeout: 15_000,
  }));
  pool.on('error', (err) => {
    console.warn('[pg-pool]', err.message);
  });
  return pool;
}

function isPgAuthBackoffActive() {
  return Date.now() < _pgAuthBackoffUntil;
}

function getPgAuthBackoffUntil() {
  return _pgAuthBackoffUntil;
}

/** Tạm dừng thử kết nối DB khi sai mật khẩu / Supabase ECIRCUITBREAKER. */
function notePgAuthFailure(err) {
  if (!err || !isPgConnectionError(err)) return;
  const msg = String(err.message || '');
  if (
    err.code === '28P01'
    || err.code === 'XX000'
    || /ECIRCUITBREAKER|authentication failed|password authentication/i.test(msg)
  ) {
    _pgAuthBackoffUntil = Date.now() + PG_AUTH_BACKOFF_MS;
    resetPools();
    const mins = Math.ceil(PG_AUTH_BACKOFF_MS / 60_000);
    console.warn(`[pg-pool] tạm dừng kết nối PostgreSQL ${mins} phút (sai mật khẩu hoặc circuit breaker)`);
  }
}

function resetPools() {
  if (_pool) {
    _pool.end().catch(() => {});
    _pool = null;
    _poolUrl = null;
  }
  if (_sessionPool) {
    _sessionPool.end().catch(() => {});
    _sessionPool = null;
    _sessionPoolUrl = null;
  }
}

function getPool() {
  if (PG_DISABLED || isPgAuthBackoffActive()) return null;
  const url = _activeDbUrl();
  if (!url) return null;
  if (_pool && _poolUrl !== url) {
    _pool.end().catch(() => {});
    _pool = null;
  }
  if (!_pool) {
    _poolUrl = url;
    _pool = _buildPool(url, 10);
  }
  return _pool;
}

function getSessionPool() {
  if (PG_DISABLED || isPgAuthBackoffActive()) return null;
  const url = _activeDbDirectUrl();
  if (!url) return getPool();
  if (_sessionPool && _sessionPoolUrl !== url) {
    _sessionPool.end().catch(() => {});
    _sessionPool = null;
  }
  if (!_sessionPool) {
    _sessionPoolUrl = url;
    _sessionPool = _buildPool(url, 4);
  }
  return _sessionPool;
}

function isPgEnabled() {
  return !PG_DISABLED && !!(_activeDbUrl() || _activeDbDirectUrl());
}

const PG_FALLBACK_CODES = new Set(['28P01', '3D000', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'XX000']);

function isPgConnectionError(err) {
  if (!err) return false;
  if (PG_FALLBACK_CODES.has(err.code)) return true;
  const msg = String(err.message || '');
  return /authentication failed|password authentication|connection terminated|timeout|circuitbreaker/i.test(msg);
}

/**
 * Như pgQuery nhưng trả null khi lỗi kết nối/xác thực — caller fallback Supabase REST.
 */
async function pgQuerySafe(text, params = []) {
  try {
    return await pgQuery(text, params);
  } catch (err) {
    if (isPgConnectionError(err)) {
      notePgAuthFailure(err);
      console.warn('[pg-pool] query fallback REST:', err.code || 'err', String(err.message || '').slice(0, 100));
      return null;
    }
    throw err;
  }
}

/**
 * Chạy query trên transaction pool. Trả null nếu pool không khả dụng (caller fallback).
 * Ghi metrics pg_query_count / pg_query_ms.
 */
async function pgQuery(text, params = []) {
  const pool = getPool();
  if (!pool) return null;

  let metrics = null;
  try { metrics = require('../helpers/requestMetrics'); } catch { /* ignore */ }

  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (metrics && typeof metrics.incPgQuery === 'function') {
      metrics.incPgQuery(Date.now() - start);
    }
    return result;
  } catch (err) {
    if (metrics && typeof metrics.incPgQuery === 'function') {
      metrics.incPgQuery(Date.now() - start, true);
    }
    notePgAuthFailure(err);
    throw err;
  }
}

async function pgSessionQuery(text, params = []) {
  const pool = getSessionPool() || getPool();
  if (!pool) return null;

  let metrics = null;
  try { metrics = require('../helpers/requestMetrics'); } catch { /* ignore */ }

  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (metrics && typeof metrics.incPgQuery === 'function') {
      metrics.incPgQuery(Date.now() - start);
    }
    return result;
  } catch (err) {
    if (metrics && typeof metrics.incPgQuery === 'function') {
      metrics.incPgQuery(Date.now() - start, true);
    }
    notePgAuthFailure(err);
    throw err;
  }
}

module.exports = {
  getPool,
  getSessionPool,
  isPgEnabled,
  isPgAuthBackoffActive,
  getPgAuthBackoffUntil,
  notePgAuthFailure,
  pgQuery,
  pgQuerySafe,
  pgSessionQuery,
  resetPools,
  isPgConnectionError,
};
