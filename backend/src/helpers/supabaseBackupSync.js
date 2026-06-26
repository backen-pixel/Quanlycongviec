/**
 * Backup sync — verify, manual run, lịch cron theo slot VN, lưu cấu hình app_settings.
 */
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const { supabase } = require('../config/supabase');
const { getAppSettingValue, invalidateAppSettingKey } = require('./appSettingsCache');
const { runIfLeader } = require('./cronLeader');

const SETTINGS_KEY = 'supabase_backup_sync';
const VN_TZ = 'Asia/Ho_Chi_Minh';

const VERIFY_TABLES = ['users', 'crm_leads', 'projects', 'companies', 'notifications'];

/** Đồng bộ lớn + kiểm tra drift: 05:00, 12:30, 18:00 giờ VN */
const DEFAULT_SYNC_SLOTS_VN = [
  { h: 5, m: 0 },
  { h: 12, m: 30 },
  { h: 18, m: 0 },
];

const DEFAULT_SETTINGS = {
  schedule_enabled: process.env.SUPABASE_BACKUP_SYNC_SCHEDULE_ENABLED === '1',
  schedule_mode: 'slots',
  sync_slots_vn: DEFAULT_SYNC_SLOTS_VN,
  verify_before_sync: true,
  interval_hours: 24,
  include_db: true,
  include_storage: true,
  verify_after_sync: true,
  last_run_at: null,
  last_run_status: null,
  last_run_error: null,
  last_run_by: null,
  last_run_slot: null,
  last_verify_at: null,
  last_verify_rows: [],
  last_cron_slots: null,
  next_run_at: null,
};

let _jobRunning = false;
let _jobLog = [];

function slotLabel(slot) {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`;
}

function parseSlotsVn(raw, fallback = DEFAULT_SYNC_SLOTS_VN) {
  if (Array.isArray(raw) && raw.length) {
    const slots = raw
      .map((s) => ({ h: parseInt(s.h, 10), m: parseInt(s.m, 10) }))
      .filter((s) => s.h >= 0 && s.h <= 23 && s.m >= 0 && s.m <= 59);
    if (slots.length) return slots.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const slots = [];
    for (const part of raw.split(',')) {
      const m = part.trim().match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
      if (m) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        if (h >= 0 && h <= 23 && min >= 0 && min <= 59) slots.push({ h, m: min });
      }
    }
    if (slots.length) return slots.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  }
  return [...fallback];
}

function getEffectiveSyncSlots(settings = {}) {
  if (Array.isArray(settings.sync_slots_vn) && settings.sync_slots_vn.length) {
    return parseSlotsVn(settings.sync_slots_vn, DEFAULT_SYNC_SLOTS_VN);
  }
  return parseSlotsVn(process.env.SUPABASE_BACKUP_SYNC_SLOTS_VN, DEFAULT_SYNC_SLOTS_VN);
}

function vnCalendarYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function vnNowParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hh, mm };
}

function vnMinutesNow() {
  const { hh, mm } = vnNowParts();
  return hh * 60 + mm;
}

function msUntilNextRun(slots) {
  const nowMin = vnMinutesNow();
  const slotMins = slots.map((s) => s.h * 60 + s.m).sort((a, b) => a - b);
  for (const sm of slotMins) {
    if (sm > nowMin) return (sm - nowMin) * 60 * 1000;
  }
  return (24 * 60 - nowMin + slotMins[0]) * 60 * 1000;
}

function computeNextRunAt(settings) {
  if (!settings?.schedule_enabled) return null;
  if (settings.schedule_mode === 'interval' && settings.interval_hours > 0) {
    return new Date(Date.now() + settings.interval_hours * 3600_000).toISOString();
  }
  const slots = getEffectiveSyncSlots(settings);
  if (!slots.length) return null;
  return new Date(Date.now() + msUntilNextRun(slots)).toISOString();
}

function slotAlreadyRan(settings, vnDate, label) {
  const rec = settings.last_cron_slots;
  return rec?.date === vnDate && Array.isArray(rec.slots) && rec.slots.includes(label);
}

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
  const merged = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!Array.isArray(merged.sync_slots_vn) || !merged.sync_slots_vn.length) {
    merged.sync_slots_vn = getEffectiveSyncSlots({});
  } else {
    merged.sync_slots_vn = parseSlotsVn(merged.sync_slots_vn, DEFAULT_SYNC_SLOTS_VN);
  }
  if (!merged.schedule_mode) merged.schedule_mode = 'slots';
  return merged;
}

async function saveSettings(patch, userId) {
  const cur = await loadSettings();
  const next = {
    ...cur,
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
  if (Array.isArray(next.sync_slots_vn)) {
    next.sync_slots_vn = parseSlotsVn(next.sync_slots_vn, DEFAULT_SYNC_SLOTS_VN);
  }
  if (next.schedule_enabled) {
    next.next_run_at = computeNextRunAt(next);
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

async function runBackupSync({
  includeDb = true,
  includeStorage = true,
  verifyAfter = true,
  verifyBefore = false,
  userId,
  slotLabel: runSlot = null,
} = {}) {
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
  if (runSlot) appendLog(`Lịch VN ${runSlot}`);

  const settings = await loadSettings();
  try {
    if (verifyBefore) {
      appendLog('Kiểm tra drift primary vs backup…');
      const preVerify = await verifyBackup();
      settings.last_verify_at = preVerify.checked_at;
      settings.last_verify_rows = preVerify.rows;
      appendLog(preVerify.all_ok ? 'Drift: OK (khớp)' : 'Drift: có chênh lệch — vẫn chạy đồng bộ');
    }

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
    settings.last_run_slot = runSlot;
    if (settings.schedule_enabled) {
      settings.next_run_at = computeNextRunAt(settings);
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
    schedule: {
      mode: settings.schedule_mode || 'slots',
      sync_slots_vn: getEffectiveSyncSlots(settings),
      verify_before_sync: settings.verify_before_sync !== false,
    },
    supabase: supabaseHealth,
    replication,
    failback,
    switch_sync: switchSync,
    backup_configured: !!(process.env.SUPABASE_BACKUP_URL && process.env.SUPABASE_BACKUP_SERVICE_ROLE_KEY),
  };
}

async function cronIntervalTick() {
  if (_jobRunning) return;
  const s = await loadSettings();
  if (!s.schedule_enabled || s.schedule_mode !== 'interval') return;
  if (!s.next_run_at) return;
  if (Date.now() < new Date(s.next_run_at).getTime()) return;

  await runBackupSync({
    includeDb: s.include_db !== false,
    includeStorage: s.include_storage !== false,
    verifyBefore: s.verify_before_sync === true,
    verifyAfter: s.verify_after_sync !== false,
    userId: 'cron',
  });
}

async function cronSlotTick() {
  if (_jobRunning) return;
  const s = await loadSettings();
  if (!s.schedule_enabled) return;
  if (s.schedule_mode === 'interval') return cronIntervalTick();

  const slots = getEffectiveSyncSlots(s);
  if (!slots.length) return;

  const now = vnNowParts();
  const vnDate = vnCalendarYmd();
  const matching = slots.filter((sl) => sl.h === now.hh && sl.m === now.mm);
  if (!matching.length) return;

  const label = slotLabel(matching[0]);
  if (slotAlreadyRan(s, vnDate, label)) return;

  const ranRec = {
    date: vnDate,
    slots: [...(s.last_cron_slots?.date === vnDate ? s.last_cron_slots.slots || [] : []), label],
  };
  await saveSettings({ last_cron_slots: ranRec }, 'cron');

  await runBackupSync({
    includeDb: s.include_db !== false,
    includeStorage: s.include_storage !== false,
    verifyBefore: s.verify_before_sync !== false,
    verifyAfter: s.verify_after_sync !== false,
    userId: 'cron',
    slotLabel: label,
  });
}

async function bootstrapScheduleIfEmpty() {
  try {
    const raw = await getAppSettingValue(SETTINGS_KEY, null);
    if (raw) return;
    await saveSettings({
      schedule_enabled: process.env.SUPABASE_BACKUP_SYNC_SCHEDULE_ENABLED === '1',
      schedule_mode: 'slots',
      sync_slots_vn: getEffectiveSyncSlots({}),
      verify_before_sync: true,
      include_db: true,
      include_storage: true,
      verify_after_sync: true,
    }, 'bootstrap');
    console.log('[supabase-backup-sync] Đã khởi tạo lịch mặc định (3 slot VN/ngày)');
  } catch (e) {
    console.warn('[supabase-backup-sync] bootstrap schedule:', e.message);
  }
}

function startBackupSyncCron() {
  if (process.env.SUPABASE_BACKUP_SYNC_CRON_DISABLED === '1') return;
  void bootstrapScheduleIfEmpty();
  const tickMs = Math.max(30_000, parseInt(process.env.SUPABASE_BACKUP_SYNC_CRON_MS || '60000', 10));
  const slots = getEffectiveSyncSlots({});
  setInterval(() => {
    void runIfLeader('supabase-backup-sync-cron', () => cronSlotTick(), { ttlSec: Math.ceil(tickMs / 1000) + 10 });
  }, tickMs);
  const slotStr = slots.map((s) => slotLabel(s)).join(', ');
  console.log(`[supabase-backup-sync] Lịch VN: ${slotStr} (kiểm tra + đồng bộ lớn) · tick ${tickMs}ms`);
}

module.exports = {
  loadSettings,
  saveSettings,
  verifyBackup,
  runBackupSync,
  getFullStatus,
  startBackupSyncCron,
  isJobRunning: () => _jobRunning,
  getEffectiveSyncSlots,
  computeNextRunAt,
  slotLabel,
  DEFAULT_SYNC_SLOTS_VN,
};
