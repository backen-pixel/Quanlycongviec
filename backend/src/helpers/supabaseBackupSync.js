/**
 * Backup sync — verify, manual run, lịch cron, lưu cấu hình app_settings.
 */
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const { supabase } = require('../config/supabase');
const { getAppSettingValue, invalidateAppSettingKey } = require('./appSettingsCache');
const { runIfLeader } = require('./cronLeader');

const SETTINGS_KEY = 'supabase_backup_sync';

const VERIFY_TABLES = ['users', 'crm_leads', 'projects', 'companies', 'notifications'];

const DEFAULT_SETTINGS = {
  schedule_enabled: false,
  interval_hours: 24,
  include_db: true,
  include_storage: true,
  verify_after_sync: true,
  last_run_at: null,
  last_run_status: null,
  last_run_error: null,
  last_run_by: null,
  last_verify_at: null,
  last_verify_rows: [],
  next_run_at: null,
};

let _jobRunning = false;
let _jobLog = [];

function scriptsDir() {
  return path.join(__dirname, '../../scripts');
}

function appendLog(line) {
  const s = String(line || '').trim();
  if (!s) return;
  _jobLog.push({ at: new Date().toISOString(), line: s.slice(0, 500) });
  if (_jobLog.length > 200) _jobLog.shift();
}

async function loadSettings() {
  const raw = await getAppSettingValue(SETTINGS_KEY, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...raw };
}

async function saveSettings(patch, userId) {
  const cur = await loadSettings();
  const next = {
    ...cur,
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
  if (next.schedule_enabled && next.interval_hours > 0) {
    if (!next.next_run_at) {
      next.next_run_at = new Date(Date.now() + next.interval_hours * 3600_000).toISOString();
    }
  } else if (!patch.next_run_at) {
    next.next_run_at = null;
  }
  const { error } = await supabase.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw error;
  invalidateAppSettingKey(SETTINGS_KEY);
  return next;
}

function dbUrls() {
  return {
    primary: process.env.SUPABASE_DB_DIRECT_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    backup: process.env.SUPABASE_BACKUP_DB_DIRECT_URL || process.env.SUPABASE_BACKUP_DB_URL,
  };
}

async function countRows(pool, table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS n FROM public.${table}`);
  return Number(rows[0]?.n || 0);
}

async function verifyBackup() {
  const { primary, backup } = dbUrls();
  if (!primary || !backup) {
    throw new Error('Thiếu SUPABASE_DB_* hoặc SUPABASE_BACKUP_DB_* trong env');
  }
  const pPool = new Pool({ connectionString: primary, ssl: { rejectUnauthorized: false } });
  const bPool = new Pool({ connectionString: backup, ssl: { rejectUnauthorized: false } });
  try {
    const rows = [];
    for (const table of VERIFY_TABLES) {
      let primaryCount = null;
      let backupCount = null;
      let error = null;
      try {
        [primaryCount, backupCount] = await Promise.all([
          countRows(pPool, table),
          countRows(bPool, table),
        ]);
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
      checked_at: new Date().toISOString(),
      rows,
      all_ok: rows.every((r) => r.ok),
    };
  } finally {
    await pPool.end().catch(() => {});
    await bPool.end().catch(() => {});
  }
}

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(scriptsDir(), scriptName);
    appendLog(`> node ${scriptName} ${args.join(' ')}`.trim());
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: path.join(scriptsDir(), '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => appendLog(d.toString()));
    child.stderr.on('data', (d) => appendLog(d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exit ${code}`));
    });
  });
}

async function runBackupSync({ includeDb = true, includeStorage = true, verifyAfter = true, userId } = {}) {
  if (_jobRunning) {
    throw new Error('Đang chạy đồng bộ — vui lòng đợi job hiện tại xong');
  }
  if (!dbUrls().primary || !dbUrls().backup) {
    throw new Error('Chưa cấu hình URL DB primary/backup');
  }

  _jobRunning = true;
  _jobLog = [];
  const startedAt = new Date().toISOString();
  appendLog('Bắt đầu đồng bộ backup…');

  const settings = await loadSettings();
  try {
    if (includeDb) {
      appendLog('Clone DB primary → backup…');
      await runScript('clone-primary-to-backup.js');
      appendLog('Fix grants backup…');
      await runScript('fix-backup-schema-grants.js');
    }
    if (includeStorage) {
      appendLog('Đồng bộ Storage…');
      await runScript('sync-storage-to-backup.js');
    }

    let verifyResult = null;
    if (verifyAfter) {
      verifyResult = await verifyBackup();
      settings.last_verify_at = verifyResult.checked_at;
      settings.last_verify_rows = verifyResult.rows;
    }

    settings.last_run_at = startedAt;
    settings.last_run_status = 'success';
    settings.last_run_error = null;
    settings.last_run_by = userId || null;
    if (settings.schedule_enabled && settings.interval_hours > 0) {
      settings.next_run_at = new Date(Date.now() + settings.interval_hours * 3600_000).toISOString();
    }

    await supabase.from('app_settings').upsert(
      { key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    invalidateAppSettingKey(SETTINGS_KEY);
    appendLog('Hoàn tất.');
    return { ok: true, started_at: startedAt, finished_at: new Date().toISOString(), verify: verifyResult };
  } catch (e) {
    settings.last_run_at = startedAt;
    settings.last_run_status = 'failed';
    settings.last_run_error = String(e.message || e).slice(0, 500);
    settings.last_run_by = userId || null;
    await supabase.from('app_settings').upsert(
      { key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    ).catch(() => {});
    invalidateAppSettingKey(SETTINGS_KEY);
    appendLog(`Lỗi: ${e.message}`);
    throw e;
  } finally {
    _jobRunning = false;
  }
}

async function getFullStatus() {
  const settings = await loadSettings();
  let supabaseHealth = null;
  let replication = null;
  let failback = null;
  let switchSync = null;

  try {
    const { runHealthCheck, getActiveTarget, isFailoverEnabled } = require('../config/supabaseRouter');
    supabaseHealth = await runHealthCheck();
    supabaseHealth.active_target = getActiveTarget();
    supabaseHealth.failover_enabled = isFailoverEnabled();
  } catch { /* ignore */ }

  try {
    const { getReplicationStatus, getQueueDepth } = require('./supabaseReplication');
    replication = { ...getReplicationStatus(), queue_depth: await getQueueDepth() };
  } catch { /* ignore */ }

  try {
    const { getFailbackStatus, getPendingCount } = require('./supabaseFailback');
    failback = { ...getFailbackStatus(), pending: await getPendingCount() };
  } catch { /* ignore */ }

  try {
    const { getLastSwitchSyncRun, switchSyncConfig } = require('./supabaseSwitchSync');
    switchSync = { config: switchSyncConfig(), last_run: getLastSwitchSyncRun() };
  } catch { /* ignore */ }

  return {
    settings,
    job: {
      running: _jobRunning,
      log: _jobLog.slice(-30),
    },
    supabase: supabaseHealth,
    replication,
    failback,
    switch_sync: switchSync,
    backup_configured: !!(process.env.SUPABASE_BACKUP_URL && process.env.SUPABASE_BACKUP_SERVICE_ROLE_KEY),
  };
}

async function cronTick() {
  if (_jobRunning) return;
  const s = await loadSettings();
  if (!s.schedule_enabled) return;
  if (!s.next_run_at) return;
  if (Date.now() < new Date(s.next_run_at).getTime()) return;

  await runBackupSync({
    includeDb: s.include_db !== false,
    includeStorage: s.include_storage !== false,
    verifyAfter: s.verify_after_sync !== false,
    userId: 'cron',
  });
}

function startBackupSyncCron() {
  if (process.env.SUPABASE_BACKUP_SYNC_CRON_DISABLED === '1') return;
  const intervalMs = Math.max(60_000, parseInt(process.env.SUPABASE_BACKUP_SYNC_CRON_MS || '300000', 10));
  setInterval(() => {
    void runIfLeader('supabase-backup-sync-cron', () => cronTick(), { ttlSec: Math.ceil(intervalMs / 1000) + 10 });
  }, intervalMs);
  console.log(`[supabase-backup-sync] Cron kiểm tra lịch mỗi ${intervalMs}ms`);
}

module.exports = {
  loadSettings,
  saveSettings,
  verifyBackup,
  runBackupSync,
  getFullStatus,
  startBackupSyncCron,
  isJobRunning: () => _jobRunning,
};
