/**
 * pg.Pool — Supavisor transaction mode (6543) cho read aggregate 1-shot;
 * session pool (5432) cho multi-statement tx khi cần.
 *
 * Disable: PG_POOL_DISABLED=1 → pgQuery trả null, caller fallback Supabase REST.
 * Failover: khi active target = backup → dùng SUPABASE_BACKUP_DB_URL / DIRECT.
 */

const { Pool } = require('pg');

const PG_DISABLED = process.env.PG_POOL_DISABLED === '1';

let _pool = null;
let _sessionPool = null;
let _poolUrl = null;
let _sessionPoolUrl = null;

function _activeDbUrl() {
  try {
    const { getActiveTarget, isFailoverEnabled } = require('./supabaseRouter');
    if (isFailoverEnabled() && getActiveTarget() === 'backup' && process.env.SUPABASE_BACKUP_DB_URL) {
      return process.env.SUPABASE_BACKUP_DB_URL;
    }
  } catch { /* ignore */ }
  return process.env.SUPABASE_DB_URL || '';
}

function _activeDbDirectUrl() {
  try {
    const { getActiveTarget, isFailoverEnabled } = require('./supabaseRouter');
    if (isFailoverEnabled() && getActiveTarget() === 'backup' && process.env.SUPABASE_BACKUP_DB_DIRECT_URL) {
      return process.env.SUPABASE_BACKUP_DB_DIRECT_URL;
    }
  } catch { /* ignore */ }
  return process.env.SUPABASE_DB_DIRECT_URL || '';
}

function _buildPool(connectionString, maxDefault) {
  if (!connectionString) return null;
  const pool = new Pool({
    connectionString,
    max: parseInt(process.env.PG_POOL_MAX || String(maxDefault), 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15_000,
    query_timeout: 15_000,
  });
  pool.on('error', (err) => {
    console.warn('[pg-pool]', err.message);
  });
  return pool;
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
  if (PG_DISABLED) return null;
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
  if (PG_DISABLED) return null;
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
    throw err;
  }
}

module.exports = {
  getPool,
  getSessionPool,
  isPgEnabled,
  pgQuery,
  pgSessionQuery,
  resetPools,
};
