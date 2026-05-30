/**
 * pg.Pool — Supavisor transaction mode (6543) cho read aggregate 1-shot;
 * session pool (5432) cho multi-statement tx khi cần.
 *
 * Disable: PG_POOL_DISABLED=1 → pgQuery trả null, caller fallback Supabase REST.
 */

const { Pool } = require('pg');

const PG_DISABLED = process.env.PG_POOL_DISABLED === '1';

let _pool = null;
let _sessionPool = null;

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

function getPool() {
  if (PG_DISABLED) return null;
  if (!_pool && process.env.SUPABASE_DB_URL) {
    _pool = _buildPool(process.env.SUPABASE_DB_URL, 10);
  }
  return _pool;
}

function getSessionPool() {
  if (PG_DISABLED) return null;
  if (!_sessionPool && process.env.SUPABASE_DB_DIRECT_URL) {
    _sessionPool = _buildPool(process.env.SUPABASE_DB_DIRECT_URL, 4);
  }
  return _sessionPool;
}

function isPgEnabled() {
  return !PG_DISABLED && !!(process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_DIRECT_URL);
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
};
