/**
 * Đồng bộ DB primary → backup theo log + bảng lệch (không clone full trừ khi bắt buộc).
 */
const path = require('path');
const { spawn } = require('child_process');

function scriptsDir() {
  return path.join(__dirname, '../../scripts');
}

function runScript(scriptName, args, onLog) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(scriptsDir(), scriptName);
    if (onLog) onLog(`> node ${scriptName} ${args.join(' ')}`.trim());
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: path.join(scriptsDir(), '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => {
      String(d).split('\n').filter(Boolean).forEach((line) => onLog?.(line));
    });
    child.stderr.on('data', (d) => {
      String(d).split('\n').filter(Boolean).forEach((line) => onLog?.(line));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exit ${code}`));
    });
  });
}

async function getDriftState() {
  const { Pool } = require('pg');
  const { resolvePrimaryDbUrl, resolveBackupDbUrl, buildPgPoolConfig } = require('../config/pgConnection');

  function dbUrls() {
    return {
      primary: resolvePrimaryDbUrl('probe'),
      backup: resolveBackupDbUrl('probe'),
    };
  }

  const { primary, backup } = dbUrls();
  if (!primary || !backup) {
    const { verifyBackup } = require('./supabaseBackupSync');
    const verify = await verifyBackup();
    return {
      verify,
      drifted: (verify.rows || []).filter((r) => r.table && !r.ok),
      all_ok: verify.all_ok === true,
    };
  }

  const pPool = new Pool(buildPgPoolConfig(primary));
  const bPool = new Pool(buildPgPoolConfig(backup));
  try {
    const { rows: tableRows } = await pPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const rows = [];
    for (const { table_name: table } of tableRows) {
      let primaryCount = null;
      let backupCount = null;
      let error = null;
      try {
        const [p, b] = await Promise.all([
          pPool.query(`SELECT COUNT(*)::bigint AS n FROM public.${table}`),
          bPool.query(`SELECT COUNT(*)::bigint AS n FROM public.${table}`),
        ]);
        primaryCount = Number(p.rows[0]?.n || 0);
        backupCount = Number(b.rows[0]?.n || 0);
      } catch (e) {
        error = e.message;
      }
      rows.push({
        table,
        primary: primaryCount,
        backup: backupCount,
        drift: primaryCount != null && backupCount != null ? primaryCount - backupCount : null,
        ok: primaryCount != null && backupCount != null && primaryCount === backupCount,
        error,
      });
    }
    return {
      verify: {
        checked_at: new Date().toISOString(),
        rows,
        all_ok: rows.every((r) => r.ok),
      },
      drifted: rows.filter((r) => r.table && !r.ok),
      all_ok: rows.every((r) => r.ok),
    };
  } finally {
    await pPool.end().catch(() => {});
    await bPool.end().catch(() => {});
  }
}

async function drainReplicationLog(onLog) {
  try {
    const {
      drainReplicationQueue,
      getQueueDepth,
      isReplicationConfigured,
    } = require('./supabaseReplication');
    if (!isReplicationConfigured()) {
      onLog?.('Log replication: tắt — chỉ đồng bộ bảng lệch (bật SUPABASE_REPLICATION_ENABLED=1 để dùng log realtime)');
      return { skipped: true, processed: 0, remaining: 0 };
    }
    onLog?.('Áp dụng log replication (chỉ thay đổi mới ghi vào queue)…');
    let processed = 0;
    for (let round = 0; round < 50; round += 1) {
      const remainingBefore = await getQueueDepth();
      if (remainingBefore === 0) break;
      const r = await drainReplicationQueue({ maxJobs: 200 });
      processed += r.processed || 0;
      onLog?.(`Replication vòng ${round + 1}: áp ${r.processed} job, còn ${r.remaining}`);
      if ((r.processed || 0) === 0) break;
    }
    return { processed, remaining: await getQueueDepth() };
  } catch (e) {
    onLog?.(`Replication log: ${e.message}`);
    return { error: e.message, processed: 0 };
  }
}

/**
 * @returns {Promise<{ ok: boolean, mode: string, verify?: object, drifted?: array, full_clone_required?: boolean, replication?: object }>}
 */
async function runIncrementalDbSyncPrimaryToBackup({ onLog } = {}) {
  const log = (line) => { if (line && onLog) onLog(String(line)); };

  if (process.env.PG_POOL_DISABLED === '1') {
    log('PG pool tắt — thử đồng bộ qua URL DB trực tiếp trong script bảng lệch');
  }

  const replication = await drainReplicationLog(log);

  let state = await getDriftState().catch((e) => {
    log(`Không kiểm tra drift DB: ${e.message}`);
    return { verify: null, drifted: [], all_ok: false, error: e.message };
  });

  if (state.all_ok) {
    log('DB đã khớp — bỏ qua clone full (0 bảng cần sync)');
    return { ok: true, mode: 'log_only', verify: state.verify, replication };
  }

  const tables = state.drifted.map((r) => r.table);
  if (!tables.length) {
    return {
      ok: false,
      mode: 'verify_failed',
      verify: state.verify,
      replication,
      full_clone_required: true,
      error: state.error,
    };
  }

  log(`Drift ${tables.length} bảng [${tables.join(', ')}] — sync incremental (data-only, không clone cả DB)`);
  for (const row of state.drifted) {
    if (row.primary != null && row.backup != null) {
      log(`  · ${row.table}: primary=${row.primary} backup=${row.backup} (Δ${row.drift})`);
    }
  }

  try {
    await runScript('sync-tables-to-backup.js', ['--tables', tables.join(',')], log);
  } catch (e) {
    log(`Sync bảng lệch lỗi: ${e.message}`);
    return {
      ok: false,
      mode: 'incremental_failed',
      verify: state.verify,
      drifted: state.drifted,
      replication,
      full_clone_required: true,
      error: e.message,
    };
  }

  state = await getDriftState().catch((e) => ({
    verify: null,
    drifted: tables.map((t) => ({ table: t })),
    all_ok: false,
    error: e.message,
  }));

  if (state.all_ok) {
    log('Đồng bộ incremental DB xong — drift đã hết');
    return {
      ok: true,
      mode: 'incremental',
      tables,
      verify: state.verify,
      replication,
    };
  }

  log(`Vẫn còn lệch sau incremental: ${state.drifted.map((r) => r.table).join(', ')}`);
  return {
    ok: false,
    mode: 'incremental_partial',
    verify: state.verify,
    drifted: state.drifted,
    replication,
    full_clone_required: true,
  };
}

module.exports = {
  runIncrementalDbSyncPrimaryToBackup,
  drainReplicationLog,
  getDriftState,
};
