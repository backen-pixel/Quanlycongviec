/**
 * Đồng bộ khi chuyển primary ↔ backup — chỉ replay log thay đổi.
 *
 * Quy tắc: đọc log ghi trên DB đang dùng (nguồn), áp dụng đúng các thao tác đó
 * lên DB đích — không clone full DB/Storage.
 *
 * - Primary → Backup: queue replication (REST + Storage) → backup
 * - Backup → Primary: bảng supabase_failback_log trên backup → primary
 *
 * Env:
 *   SUPABASE_SWITCH_SYNC_ROUNDS=6
 *   SUPABASE_SWITCH_SYNC_INTERVAL_MS=5000
 *   SUPABASE_SWITCH_SYNC_MAX_MS=60000
 *   SUPABASE_SWITCH_SYNC_DISABLED=1 — tắt
 *   SUPABASE_REPLICATION_ENABLED=1 — ghi log khi đang dùng Primary
 *   SUPABASE_FAILOVER_ENABLED=1 hoặc REPLICATION — ghi log khi đang dùng Backup
 */

const config = require('../config');

function switchSyncConfig() {
  const light = process.env.SUPABASE_REPLICATION_LIGHT === '1'
    || process.env.SUPABASE_SWITCH_SYNC_LIGHT === '1';
  return {
    rounds: Math.max(1, parseInt(process.env.SUPABASE_SWITCH_SYNC_ROUNDS || (light ? '2' : '3'), 10)),
    intervalMs: Math.max(500, parseInt(process.env.SUPABASE_SWITCH_SYNC_INTERVAL_MS || (light ? '3000' : '5000'), 10)),
    maxMs: Math.max(3000, parseInt(process.env.SUPABASE_SWITCH_SYNC_MAX_MS || (light ? '15000' : '30000'), 10)),
    disabled: process.env.SUPABASE_SWITCH_SYNC_DISABLED === '1',
    light,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let _lastRun = null;

function isLogSyncComplete({ sync, replicationAfter, failbackAfter } = {}) {
  return (sync?.remaining === 0 || sync?.remaining == null)
    && (replicationAfter === 0 || replicationAfter == null)
    && (failbackAfter === 0 || failbackAfter == null);
}

/**
 * Replay log từ DB nguồn (from) sang DB đích (to).
 * @param {{ force?: boolean, onLog?: (line: string) => void }} opts
 *   force=true — drain replication sau khi đã chuyển sang backup
 */
async function runLogBasedSwitchSync(from, to, opts = {}) {
  const cfg = switchSyncConfig();
  const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
  const force = opts.force === true;

  if (cfg.disabled || from === to) {
    return { skipped: true, from, to, remaining: 0 };
  }

  const start = Date.now();
  const rounds = [];
  let remaining = null;
  let totalProcessed = 0;
  let totalFailed = 0;

  const log = (line) => {
    if (onLog) onLog(line);
  };

  if (from === 'primary' && to === 'backup') {
    const { drainReplicationQueue, getQueueDepth } = require('./supabaseReplication');
    const repEnabled = config.supabaseReplicationEnabled
      && config.supabaseBackupUrl
      && config.supabaseBackupServiceKey;
    if (!repEnabled) {
      log('Replication chưa bật (SUPABASE_REPLICATION_ENABLED=1) — không có log Primary→Backup');
      remaining = await getQueueDepth().catch(() => 0);
      return {
        from,
        to,
        mode: 'log',
        skipped: true,
        reason: 'replication_disabled',
        remaining,
        elapsed_ms: Date.now() - start,
      };
    }

    log(`Replay log Primary → Backup${force ? ' (sau chuyển)' : ''}…`);
    for (let i = 0; i < cfg.rounds; i++) {
      if (Date.now() - start >= cfg.maxMs) break;
      const r = await drainReplicationQueue({ maxJobs: 500, force });
      totalProcessed += r.processed || 0;
      totalFailed += r.failed || 0;
      remaining = r.remaining;
      rounds.push({ round: i + 1, direction: 'primary→backup', ...r });
      if (r.processed > 0) {
        log(`  Vòng ${i + 1}: ${r.processed} job OK, ${r.failed || 0} lỗi, còn ${r.remaining}`);
      }
      if (r.remaining === 0) break;
      if (i < cfg.rounds - 1) await sleep(cfg.intervalMs);
    }
    if (remaining == null) remaining = await getQueueDepth();
  } else if (from === 'backup' && to === 'primary') {
    const { runFailbackReplay, getPendingCount, hasFailbackEndpoints } = require('./supabaseFailback');
    if (!hasFailbackEndpoints()) {
      log('Chưa cấu hình backup URL — không replay failback');
      return { from, to, mode: 'log', skipped: true, reason: 'no_backup', remaining: 0, elapsed_ms: Date.now() - start };
    }

    log('Replay log Backup → Primary (supabase_failback_log)…');
    for (let i = 0; i < cfg.rounds; i++) {
      if (Date.now() - start >= cfg.maxMs) break;
      const r = await runFailbackReplay({ limit: 500 });
      totalProcessed += r.applied || 0;
      totalFailed += r.failed || 0;
      remaining = r.remaining;
      rounds.push({ round: i + 1, direction: 'backup→primary', ...r });
      if (r.applied > 0) {
        log(`  Vòng ${i + 1}: ${r.applied} job OK, ${r.failed || 0} lỗi, còn ${r.remaining}`);
      }
      if (r.remaining === 0) break;
      if (i < cfg.rounds - 1) await sleep(cfg.intervalMs);
    }
    if (remaining == null) remaining = await getPendingCount();
  }

  const result = {
    from,
    to,
    mode: 'log',
    elapsed_ms: Date.now() - start,
    rounds_run: rounds.length,
    processed: totalProcessed,
    failed: totalFailed,
    remaining,
    rounds,
    config: cfg,
  };
  _lastRun = result;
  console.warn(
    `[supabase-switch-sync] log ${from}→${to}: ${totalProcessed} applied, ${totalFailed} failed, còn ${remaining ?? '?'} job, ${result.elapsed_ms}ms`,
  );
  return result;
}

/**
 * Trước khi chuyển target: drain queue replication hoặc failback replay.
 */
async function runPreSwitchSync(from, to, opts = {}) {
  return runLogBasedSwitchSync(from, to, { ...opts, force: false });
}

function getLastSwitchSyncRun() {
  return _lastRun;
}

module.exports = {
  runPreSwitchSync,
  runLogBasedSwitchSync,
  getLastSwitchSyncRun,
  switchSyncConfig,
  isLogSyncComplete,
};
