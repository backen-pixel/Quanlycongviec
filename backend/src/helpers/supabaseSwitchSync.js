/**
 * Giai đoạn đệm đồng bộ khi chuyển primary ↔ backup.
 *
 * Env:
 *   SUPABASE_SWITCH_SYNC_ROUNDS=6       — số vòng sync (mặc định 6)
 *   SUPABASE_SWITCH_SYNC_INTERVAL_MS=5000 — nghỉ giữa mỗi vòng (ms)
 *   SUPABASE_SWITCH_SYNC_MAX_MS=60000 — tối đa thời gian đệm (ms)
 *   SUPABASE_SWITCH_SYNC_DISABLED=1     — tắt, chuyển ngay
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

/**
 * Trước khi chuyển target: drain queue replication hoặc failback replay.
 */
async function runPreSwitchSync(from, to) {
  const cfg = switchSyncConfig();
  if (cfg.disabled || from === to) {
    return { skipped: true, from, to };
  }

  const start = Date.now();
  const rounds = [];
  let remaining = null;

  if (from === 'primary' && to === 'backup') {
    const { drainReplicationQueue, getQueueDepth } = require('./supabaseReplication');
    for (let i = 0; i < cfg.rounds; i++) {
      if (Date.now() - start >= cfg.maxMs) break;
      const r = await drainReplicationQueue({ maxJobs: 200 });
      remaining = r.remaining;
      rounds.push({ round: i + 1, direction: 'primary→backup', ...r });
      if (r.remaining === 0) break;
      if (i < cfg.rounds - 1) await sleep(cfg.intervalMs);
    }
    if (remaining == null) remaining = await getQueueDepth();
  } else if (from === 'backup' && to === 'primary') {
    const { runFailbackReplay, getPendingCount } = require('./supabaseFailback');
    for (let i = 0; i < cfg.rounds; i++) {
      if (Date.now() - start >= cfg.maxMs) break;
      const r = await runFailbackReplay({ limit: 500 });
      remaining = r.remaining;
      rounds.push({ round: i + 1, direction: 'backup→primary', ...r });
      if (r.remaining === 0) break;
      if (i < cfg.rounds - 1) await sleep(cfg.intervalMs);
    }
    if (remaining == null) remaining = await getPendingCount();
  }

  const result = {
    from,
    to,
    elapsed_ms: Date.now() - start,
    rounds_run: rounds.length,
    remaining,
    rounds,
    config: cfg,
  };
  _lastRun = result;
  console.warn(
    `[supabase-switch-sync] ${from}→${to}: ${rounds.length} vòng, còn ${remaining ?? '?'} job, ${result.elapsed_ms}ms`,
  );
  return result;
}

function getLastSwitchSyncRun() {
  return _lastRun;
}

module.exports = {
  runPreSwitchSync,
  getLastSwitchSyncRun,
  switchSyncConfig,
};
