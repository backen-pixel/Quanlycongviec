/**
 * Giám sát chi tiết trạng thái Supabase primary + backup.
 */
const { fetch: undiciFetch } = require('undici');
const { Pool } = require('pg');
const config = require('../config');
const { supabaseDispatcher } = require('../config/httpAgents');

function trimBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function projectRefFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

function maskUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    if (u.password) u.password = '***';
    return u.toString().replace(/^http:\/\//, 'postgresql://');
  } catch {
    return 'configured';
  }
}

async function probeAuthHealth(base, key) {
  const start = Date.now();
  try {
    const res = await undiciFetch(`${base}/auth/v1/health`, {
      dispatcher: supabaseDispatcher,
      headers: { apikey: key },
    });
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message };
  }
}

async function probeRest(base, key) {
  const start = Date.now();
  try {
    const res = await undiciFetch(`${base}/rest/v1/?`, {
      dispatcher: supabaseDispatcher,
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    return {
      ok: res.ok || res.status === 200,
      latency_ms: Date.now() - start,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message };
  }
}

async function probeStorage(base, key) {
  const start = Date.now();
  try {
    const res = await undiciFetch(`${base}/storage/v1/bucket`, {
      dispatcher: supabaseDispatcher,
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    let bucketCount = null;
    if (res.ok) {
      const data = await res.json().catch(() => []);
      bucketCount = Array.isArray(data) ? data.length : null;
    }
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      status: res.status,
      bucket_count: bucketCount,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message };
  }
}

async function probeDb(connectionString) {
  if (!connectionString) {
    return { ok: false, configured: false, error: 'not_configured' };
  }
  const start = Date.now();
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const { rows } = await pool.query(`
      SELECT
        current_database() AS db,
        version() AS version,
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS table_count,
        pg_database_size(current_database()) AS db_size_bytes
    `);
    const row = rows[0] || {};
    return {
      ok: true,
      configured: true,
      latency_ms: Date.now() - start,
      database: row.db,
      table_count: row.table_count,
      db_size_bytes: Number(row.db_size_bytes || 0),
      postgres_version: String(row.version || '').split(' ').slice(0, 2).join(' '),
    };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      latency_ms: Date.now() - start,
      error: e.message,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function probeInstance({ label, url, serviceKey, dbUrl }) {
  const base = trimBase(url);
  const configured = !!(base && serviceKey);
  const checked_at = new Date().toISOString();

  if (!configured) {
    return {
      label,
      project_ref: null,
      url: null,
      configured: false,
      overall: 'not_configured',
      checked_at,
    };
  }

  const [auth, rest, storage, db] = await Promise.all([
    probeAuthHealth(base, serviceKey),
    probeRest(base, serviceKey),
    probeStorage(base, serviceKey),
    probeDb(dbUrl),
  ]);

  const checks = { auth, rest, storage, db };
  const criticalOk = auth.ok && rest.ok && db.ok;
  const allOk = criticalOk && storage.ok;

  let overall = 'healthy';
  if (!auth.ok && !rest.ok && !db.ok) overall = 'down';
  else if (!criticalOk) overall = 'degraded';
  else if (!storage.ok) overall = 'warning';

  return {
    label,
    project_ref: projectRefFromUrl(base),
    url: base,
    db_url_masked: maskUrl(dbUrl),
    configured: true,
    overall,
    checked_at,
    checks,
    latency_ms: Math.max(auth.latency_ms || 0, rest.latency_ms || 0, db.latency_ms || 0),
  };
}

async function getSupabaseMonitorReport() {
  const {
    runHealthCheck,
    getActiveTarget,
    isFailoverEnabled,
    getHealthStatus,
  } = require('../config/supabaseRouter');

  let routerHealth = null;
  try {
    routerHealth = await runHealthCheck();
  } catch {
    routerHealth = getHealthStatus();
  }

  const [primary, backup] = await Promise.all([
    probeInstance({
      label: 'primary',
      url: config.supabaseUrl,
      serviceKey: config.supabaseServiceKey,
      dbUrl: process.env.SUPABASE_DB_DIRECT_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    }),
    probeInstance({
      label: 'backup',
      url: config.supabaseBackupUrl,
      serviceKey: config.supabaseBackupServiceKey,
      dbUrl: process.env.SUPABASE_BACKUP_DB_DIRECT_URL || process.env.SUPABASE_BACKUP_DB_URL,
    }),
  ]);

  let replication = null;
  let failback = null;
  try {
    const { getReplicationStatus, getQueueDepth } = require('./supabaseReplication');
    replication = { ...getReplicationStatus(), queue_depth: await getQueueDepth() };
  } catch { /* ignore */ }
  try {
    const { getFailbackStatus, getPendingCount } = require('./supabaseFailback');
    failback = { ...getFailbackStatus(), pending: await getPendingCount() };
  } catch { /* ignore */ }

  const activeTarget = getActiveTarget();
  const failoverEnabled = isFailoverEnabled();

  let systemOverall = 'healthy';
  if (activeTarget === 'primary' && primary.overall === 'down') {
    systemOverall = backup.overall === 'healthy' || backup.overall === 'warning' ? 'failover_ready' : 'critical';
  } else if (activeTarget === 'backup') {
    systemOverall = backup.overall === 'healthy' || backup.overall === 'warning' ? 'on_backup' : 'critical';
  } else if (primary.overall === 'degraded' || primary.overall === 'warning') {
    systemOverall = 'degraded';
  } else if (primary.overall === 'down') {
    systemOverall = 'critical';
  }

  return {
    checked_at: new Date().toISOString(),
    system_overall: systemOverall,
    active_target: activeTarget,
    failover_enabled: failoverEnabled,
    failover_count: routerHealth?.failover_count ?? 0,
    last_failover_at: routerHealth?.last_failover_at ?? null,
    instances: { primary, backup },
    router: routerHealth,
    replication,
    failback,
    env: {
      replication_enabled: process.env.SUPABASE_REPLICATION_ENABLED === '1',
      replication_light: process.env.SUPABASE_REPLICATION_LIGHT === '1',
      pg_pool: process.env.PG_POOL_DISABLED === '1' ? 'disabled' : 'enabled',
    },
  };
}

module.exports = {
  getSupabaseMonitorReport,
  probeInstance,
};
