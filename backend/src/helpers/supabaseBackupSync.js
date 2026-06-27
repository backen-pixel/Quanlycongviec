/**
 * Backup sync — verify, manual run, lịch cron theo slot VN, lưu cấu hình app_settings.
 */
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const { supabase } = require('../config/supabase');
const { resolvePrimaryDbUrl, resolveBackupDbUrl, buildPgPoolConfig } = require('../config/pgConnection');
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
let _jobStartedAt = null;
let _jobFinishedAt = null;
let _jobLastOk = true;
let _jobLastError = null;
let _jobSyncParts = ['DB', 'Storage'];
let _jobStartedBy = null;
let _logListener = null;
let _ioRef = null;

function setBackupSyncIo(io) {
  _ioRef = io || null;
}

function isUserScopedSyncActor(userId) {
  if (!userId) return false;
  const id = String(userId);
  if (id === 'cron' || id === 'admin') return false;
  return !id.startsWith('switch:');
}

function broadcastBackupSync(event, data = {}) {
  if (!_ioRef) return;
  try {
    const userId = data.userId || _jobStartedBy;
    if (!isUserScopedSyncActor(userId)) return;
    const payload = { ...data, userId: String(userId) };
    _ioRef.to(`user:${String(userId)}`).emit(event, payload);
  } catch { /* ignore */ }
}

function setBackupSyncLogListener(fn) {
  _logListener = typeof fn === 'function' ? fn : null;
}

function getJobLog(limit = 30) {
  return _jobLog.slice(-limit);
}

function isRecentIso(iso, maxMs = 15 * 60 * 1000) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < maxMs;
}

function getBackupJobPublicSnapshot() {
  if (!_jobRunning && !_jobFinishedAt) return null;
  if (!_jobRunning && !isRecentIso(_jobFinishedAt)) return null;
  return {
    type: 'backup',
    running: _jobRunning,
    status: _jobRunning ? null : (_jobLastOk ? 'done' : 'error'),
    title: 'Đồng bộ Supabase Backup',
    direction: 'primary→backup',
    started_by: _jobStartedBy,
    message: _jobLog.length
      ? _jobLog[_jobLog.length - 1].line
      : 'Đang đồng bộ backup Primary → Backup…',
    sync_parts: _jobSyncParts,
    log: _jobLog.slice(-80),
    started_at: _jobStartedAt,
    finished_at: _jobFinishedAt,
    error: _jobLastError,
  };
}

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
  if (_logListener) {
    try {
      _logListener(s, _jobLog.length);
    } catch { /* ignore */ }
  } else {
    broadcastBackupSync('supabase:backup-sync-progress', {
      line: s,
      at: new Date().toISOString(),
      log_count: _jobLog.length,
      userId: _jobStartedBy,
    });
  }
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
    primary: resolvePrimaryDbUrl('probe'),
    backup: resolveBackupDbUrl('probe'),
  };
}

async function countRows(pool, table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS n FROM public.${table}`);
  return Number(rows[0]?.n || 0);
}

function getBackupRestClient() {
  const { createClient } = require('@supabase/supabase-js');
  const config = require('../config');
  return createClient(config.supabaseBackupUrl, config.supabaseBackupServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function countRowsRest(client, table) {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return Number(count || 0);
}

async function verifyBackupViaPg() {
  const { primary, backup } = dbUrls();
  const pPool = new Pool(buildPgPoolConfig(primary));
  const bPool = new Pool(buildPgPoolConfig(backup));
  try {
    await Promise.all([pPool.query('SELECT 1'), bPool.query('SELECT 1')]);
    const rows = [];
    for (const table of VERIFY_TABLES) {
      const [primaryCount, backupCount] = await Promise.all([
        countRows(pPool, table),
        countRows(bPool, table),
      ]);
      rows.push({
        table,
        primary: primaryCount,
        backup: backupCount,
        drift: primaryCount - backupCount,
        ok: primaryCount === backupCount,
        error: null,
      });
    }
    return rows;
  } finally {
    await pPool.end().catch(() => {});
    await bPool.end().catch(() => {});
  }
}

async function verifyBackupViaRest() {
  const { supabase } = require('../config/supabase');
  const backupClient = getBackupRestClient();
  const rows = [];
  for (const table of VERIFY_TABLES) {
    const [primaryCount, backupCount] = await Promise.all([
      countRowsRest(supabase, table),
      countRowsRest(backupClient, table),
    ]);
    rows.push({
      table,
      primary: primaryCount,
      backup: backupCount,
      drift: primaryCount - backupCount,
      ok: primaryCount === backupCount,
      error: null,
    });
  }
  return rows;
}

async function verifyBackup() {
  const { primary, backup } = dbUrls();
  if ((!primary && !process.env.SUPABASE_URL) || (!backup && !process.env.SUPABASE_BACKUP_URL)) {
    throw new Error('Thiếu SUPABASE_DB_* hoặc SUPABASE_BACKUP_DB_* trong env');
  }
  let rows = [];
  let source = 'postgres';
  let pgError = null;
  try {
    rows = await verifyBackupViaPg();
  } catch (e) {
    pgError = e.message;
    try {
      rows = await verifyBackupViaRest();
      source = 'rest';
    } catch (restErr) {
      const errRows = [];
      for (const table of VERIFY_TABLES) {
        errRows.push({
          table,
          primary: null,
          backup: null,
          drift: null,
          ok: false,
          error: pgError || e.message,
        });
      }
      return {
        checked_at: new Date().toISOString(),
        rows: errRows,
        all_ok: false,
        source: 'postgres',
        pg_error: pgError || e.message,
        rest_error: restErr.message,
      };
    }
  }
  return {
    checked_at: new Date().toISOString(),
    rows,
    all_ok: rows.every((r) => r.ok),
    source,
    pg_error: source === 'rest' ? pgError : null,
  };
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
  _jobFinishedAt = null;
  _jobLastError = null;
  _jobLastOk = true;
  const startedAt = new Date().toISOString();
  _jobStartedAt = startedAt;
  _jobStartedBy = isUserScopedSyncActor(userId) ? String(userId) : null;
  const parts = [];
  if (includeDb) parts.push('DB');
  if (includeStorage) parts.push('Storage/bucket');
  _jobSyncParts = parts.length ? parts : ['DB', 'Storage'];
  appendLog('Bắt đầu đồng bộ backup…');
  broadcastBackupSync('supabase:backup-sync-start', {
    message: 'Đang đồng bộ Primary → Backup…',
    userId: _jobStartedBy,
    slot: runSlot,
    at: startedAt,
  });
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
      appendLog('Đồng bộ DB incremental (log thay đổi + bảng lệch, không clone full)…');
      const { runIncrementalDbSyncPrimaryToBackup } = require('./supabaseIncrementalDbSync');
      const inc = await runIncrementalDbSyncPrimaryToBackup({ onLog: appendLog });
      if (inc.ok) {
        appendLog(`DB OK (${inc.mode})`);
      } else if (inc.full_clone_required && process.env.SUPABASE_BACKUP_ALLOW_FULL_CLONE === '1') {
        appendLog('Incremental chưa đủ — clone full DB (SUPABASE_BACKUP_ALLOW_FULL_CLONE=1)…');
        await runScript('clone-primary-to-backup.js');
        appendLog('Fix grants backup…');
        await runScript('fix-backup-schema-grants.js');
      } else if (!inc.ok) {
        const names = (inc.drifted || []).map((r) => r.table).filter(Boolean).join(', ');
        throw new Error(
          names
            ? `DB vẫn lệch sau incremental (${names}). Sửa mật khẩu DB hoặc bật SUPABASE_BACKUP_ALLOW_FULL_CLONE=1 để clone full.`
            : (inc.error || 'Đồng bộ DB incremental thất bại'),
        );
      }
    }
    if (includeStorage) {
      appendLog('Đồng bộ Storage (chỉ file mới / khác kích thước)…');
      const { runStorageSync } = require('./supabaseStorageSync');
      await runStorageSync({
        from: 'primary',
        to: 'backup',
        onLog: appendLog,
      });
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

    const { error: saveErr } = await supabase.from('app_settings').upsert(
      { key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    if (saveErr) throw saveErr;
    invalidateAppSettingKey(SETTINGS_KEY);
    appendLog('Hoàn tất.');
    broadcastBackupSync('supabase:backup-sync-done', {
      ok: true,
      userId: _jobStartedBy,
      at: new Date().toISOString(),
    });
    return { ok: true, started_at: startedAt, finished_at: new Date().toISOString(), verify: verifyResult };
  } catch (e) {
    settings.last_run_at = startedAt;
    settings.last_run_status = 'failed';
    settings.last_run_error = String(e.message || e).slice(0, 500);
    settings.last_run_by = userId || null;
    try {
      const { error: failSaveErr } = await supabase.from('app_settings').upsert(
        { key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (failSaveErr) console.warn('[supabase-backup-sync] save failed status:', failSaveErr.message);
    } catch { /* ignore */ }
    invalidateAppSettingKey(SETTINGS_KEY);
    appendLog(`Lỗi: ${e.message}`);
    _jobLastOk = false;
    _jobLastError = String(e.message || e).slice(0, 500);
    broadcastBackupSync('supabase:backup-sync-done', {
      ok: false,
      error: _jobLastError,
      userId: _jobStartedBy,
      at: new Date().toISOString(),
    });
    throw e;
  } finally {
    _jobRunning = false;
    _jobFinishedAt = new Date().toISOString();
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
  getJobLog,
  getBackupJobPublicSnapshot,
  setBackupSyncLogListener,
  setBackupSyncIo,
  getEffectiveSyncSlots,
  computeNextRunAt,
  slotLabel,
  DEFAULT_SYNC_SLOTS_VN,
};
