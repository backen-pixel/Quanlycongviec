/**
 * Giám sát chi tiết trạng thái Supabase primary + backup.
 */
const { fetch: undiciFetch } = require('undici');
const { Pool } = require('pg');
const config = require('../config');
const { supabaseDispatcher } = require('../config/httpAgents');
const {
  resolvePrimaryDbUrl,
  resolveBackupDbUrl,
  buildPgPoolConfig,
  classifyPgError,
  listPgProbeCandidates,
} = require('../config/pgConnection');

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

async function queryStorageBucketStatsViaPg(connectionString) {
  if (!connectionString || process.env.PG_POOL_DISABLED === '1') return null;
  const start = Date.now();
  const pool = new Pool(buildPgPoolConfig(connectionString, {
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    statement_timeout: 15000,
  }));
  try {
    const { rows } = await pool.query(`
      SELECT
        bucket_id AS name,
        COUNT(*)::int AS object_count,
        COALESCE(SUM(COALESCE((metadata->>'size')::bigint, 0)), 0)::bigint AS size_bytes
      FROM storage.objects
      GROUP BY bucket_id
      ORDER BY bucket_id
    `);
    return {
      source: 'postgres',
      latency_ms: Date.now() - start,
      buckets: rows.map((r) => ({
        name: r.name,
        object_count: r.object_count,
        size_bytes: Number(r.size_bytes || 0),
      })),
    };
  } catch (e) {
    return { source: 'postgres', error: e.message, buckets: null };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function queryStorageBucketStatsViaApi(base, key, extraNames = []) {
  const { createClient } = require('@supabase/supabase-js');
  const { getStorageBuckets, summarizeBucketViaApi } = require('./supabaseStorageSync');
  const client = createClient(base, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const start = Date.now();
  const bucketNames = [...new Set([...getStorageBuckets(), ...extraNames])].filter(Boolean);
  const buckets = [];
  for (const name of bucketNames) {
    try {
      buckets.push(await summarizeBucketViaApi(client, name));
    } catch (e) {
      buckets.push({ name, object_count: null, size_bytes: null, error: e.message });
    }
  }
  return {
    source: 'storage_api',
    latency_ms: Date.now() - start,
    buckets,
  };
}

function aggregateBucketStats(buckets) {
  const list = (buckets || []).filter((b) => b && !b.error);
  return {
    bucket_count: list.length,
    total_object_count: list.reduce((s, b) => s + (b.object_count || 0), 0),
    total_size_bytes: list.reduce((s, b) => s + (b.size_bytes || 0), 0),
    buckets: buckets || [],
  };
}

async function probeStorage(base, key, dbUrl) {
  const start = Date.now();
  try {
    const res = await undiciFetch(`${base}/storage/v1/bucket`, {
      dispatcher: supabaseDispatcher,
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    let apiBucketNames = [];
    if (res.ok) {
      const data = await res.json().catch(() => []);
      apiBucketNames = Array.isArray(data) ? data.map((b) => b.name || b.id).filter(Boolean) : [];
    }

    let stats = await queryStorageBucketStatsViaPg(dbUrl);
    if (!stats?.buckets?.length) {
      stats = await queryStorageBucketStatsViaApi(base, key, apiBucketNames);
    }

    const agg = aggregateBucketStats(stats?.buckets);
    if (apiBucketNames.length && stats?.source === 'postgres') {
      const known = new Set(agg.buckets.map((b) => b.name));
      for (const name of apiBucketNames) {
        if (!known.has(name)) {
          agg.buckets.push({ name, object_count: 0, size_bytes: 0, empty: true });
          agg.bucket_count += 1;
        }
      }
      agg.buckets.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      status: res.status,
      bucket_count: apiBucketNames.length || agg.bucket_count,
      buckets: agg.buckets,
      total_object_count: agg.total_object_count,
      total_size_bytes: agg.total_size_bytes,
      stats_source: stats?.source || null,
      stats_error: stats?.error || null,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message, buckets: [] };
  }
}

async function probeDbViaRest(base, key) {
  if (!base || !key) return null;
  const start = Date.now();
  try {
    const { createClient } = require('@supabase/supabase-js');
    const client = createClient(trimBase(base), key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { count, error } = await client.from('users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return {
      ok: true,
      configured: true,
      mode: 'rest_fallback',
      latency_ms: Date.now() - start,
      note: 'PG pool lỗi — kiểm tra qua REST (service role)',
      user_count: Number(count || 0),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function probeDb(connectionString, restProbe = null) {
  if (!connectionString && !restProbe?.url) {
    return { ok: false, configured: false, error: 'not_configured' };
  }
  if (process.env.PG_POOL_DISABLED === '1') {
    const rest = await probeDbViaRest(restProbe?.url, restProbe?.key);
    if (rest?.ok) return { ...rest, skipped: true };
    return {
      ok: true,
      configured: false,
      skipped: true,
      mode: 'rest_only',
      latency_ms: 0,
      note: 'PG_POOL_DISABLED — dùng Supabase REST',
    };
  }

  const candidates = listPgProbeCandidates(
    restProbe?.directUrl || '',
    restProbe?.poolUrl || connectionString,
  );
  const start = Date.now();
  let lastErr = null;

  for (const url of candidates) {
    const pool = new Pool(buildPgPoolConfig(url, {
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 8000,
      statement_timeout: 8000,
    }));
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
        connection_mode: url.includes(':6543') ? 'pooler_tx' : url.includes('pooler') ? 'pooler_session' : 'direct',
      };
    } catch (e) {
      lastErr = e;
    } finally {
      await pool.end().catch(() => {});
    }
  }

  const rest = await probeDbViaRest(restProbe?.url, restProbe?.key);
  if (rest?.ok) {
    const classified = classifyPgError(lastErr);
    return {
      ...rest,
      pg_error: classified.error,
      pg_error_detail: classified.message,
    };
  }

  const classified = classifyPgError(lastErr);
  return {
    ok: false,
    configured: true,
    latency_ms: Date.now() - start,
    error: classified.error,
    error_detail: classified.message,
  };
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
    probeStorage(base, serviceKey, dbUrl),
    probeDb(dbUrl, {
      url: base,
      key: serviceKey,
      poolUrl: label === 'primary'
        ? (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL)
        : process.env.SUPABASE_BACKUP_DB_URL,
      directUrl: label === 'primary'
        ? process.env.SUPABASE_DB_DIRECT_URL
        : process.env.SUPABASE_BACKUP_DB_DIRECT_URL,
    }),
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
      dbUrl: resolvePrimaryDbUrl('probe'),
    }),
    probeInstance({
      label: 'backup',
      url: config.supabaseBackupUrl,
      serviceKey: config.supabaseBackupServiceKey,
      dbUrl: resolveBackupDbUrl('probe'),
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
      replication_enabled: process.env.SUPABASE_REPLICATION_ENABLED === '1'
        || process.env.SUPABASE_SWITCH_LOG_ENABLED === '1',
      switch_log_enabled: process.env.SUPABASE_SWITCH_LOG_ENABLED === '1',
      auto_failover_enabled: process.env.SUPABASE_AUTO_FAILOVER === '1',
      auto_failback_enabled: process.env.SUPABASE_AUTO_FAILBACK === '1',
      replication_light: process.env.SUPABASE_REPLICATION_LIGHT === '1',
      pg_pool: process.env.PG_POOL_DISABLED === '1' ? 'disabled' : 'enabled',
    },
  };
}

module.exports = {
  getSupabaseMonitorReport,
  probeInstance,
};
