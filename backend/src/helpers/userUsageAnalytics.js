/**
 * Phân tích mức sử dụng hệ thống theo giờ VN — tìm khung giờ ít user nhất.
 * Nguồn: user_activity_log + snapshot online mỗi giờ (app_settings).
 */
const { Pool } = require('pg');
const config = require('../config');
const { supabase } = require('../config/supabase');
const { getAppSettingValue, invalidateAppSettingKey } = require('./appSettingsCache');
const { runIfLeader } = require('./cronLeader');
const { ONLINE_THRESHOLD_MS, getPresenceForUserIds } = require('./userPresence');
const { getEffectiveSyncSlots, slotLabel } = require('./supabaseBackupSync');

const VN_TZ = 'Asia/Ho_Chi_Minh';
const SNAPSHOTS_KEY = 'system_usage_hourly_snapshots';
const MAX_SNAPSHOTS = 24 * 45; // ~45 ngày

function vnHourMinute(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d);
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const wd = parts.find((p) => p.type === 'weekday')?.value || '';
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { hh, mm, weekday: wdMap[wd] || 1 };
}

function pgPool() {
  const url = config.supabaseDbDirectUrl || config.supabaseDbUrl || process.env.SUPABASE_DB_DIRECT_URL || process.env.SUPABASE_DB_URL;
  if (!url) return null;
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });
}

async function loadSnapshots() {
  const raw = await getAppSettingValue(SNAPSHOTS_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

async function saveSnapshots(list) {
  const trimmed = list.slice(-MAX_SNAPSHOTS);
  const { error } = await supabase.from('app_settings').upsert(
    { key: SNAPSHOTS_KEY, value: trimmed, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw error;
  invalidateAppSettingKey(SNAPSHOTS_KEY);
  return trimmed;
}

async function countOnlineUsers() {
  const thresholdIso = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
  const { count, error } = await supabase
    .from('user_last_activity')
    .select('user_id', { count: 'exact', head: true })
    .gte('last_ping_at', thresholdIso);
  if (error) {
    if (/user_last_activity/i.test(error.message || '')) return { online: 0, error: 'missing_table' };
    throw error;
  }
  return { online: count || 0 };
}

async function countActiveUsersLastHour() {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data, error } = await supabase
    .from('user_activity_log')
    .select('user_id')
    .gte('created_at', since)
    .gte('importance', 1);
  if (error) {
    if (/user_activity_log/i.test(error.message || '')) return { count: 0, error: 'missing_table' };
    throw error;
  }
  const ids = new Set((data || []).map((r) => String(r.user_id)).filter(Boolean));
  return { count: ids.size };
}

/** Ghi snapshot mỗi giờ (VN :00) — online + user có activity 1h qua */
async function recordHourlySnapshot() {
  const { hh, mm, weekday } = vnHourMinute();
  if (mm !== 0) return;

  const snapshots = await loadSnapshots();
  const vnDate = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date());
  const key = `${vnDate}T${String(hh).padStart(2, '0')}:00`;
  if (snapshots.some((s) => s.key === key)) return;

  const [onlineRes, activeRes] = await Promise.all([
    countOnlineUsers(),
    countActiveUsersLastHour(),
  ]);

  snapshots.push({
    key,
    at: new Date().toISOString(),
    hour_vn: hh,
    weekday,
    online_count: onlineRes.online,
    active_users_1h: activeRes.count,
  });
  await saveSnapshots(snapshots);
  console.log(`[usage-analytics] Snapshot VN ${key}: online=${onlineRes.online}, active_1h=${activeRes.count}`);
}

async function queryActivityViaPg(days) {
  const pool = pgPool();
  if (!pool) return null;
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  try {
    const hourly = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE '${VN_TZ}')::int AS hour_vn,
        COUNT(*)::int AS actions,
        COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log
      WHERE created_at >= $1 AND importance >= 1
      GROUP BY 1
      ORDER BY 1
    `, [since]);

    const halfHourly = await pool.query(`
      SELECT
        (EXTRACT(HOUR FROM created_at AT TIME ZONE '${VN_TZ}')::int * 2
          + CASE WHEN EXTRACT(MINUTE FROM created_at AT TIME ZONE '${VN_TZ}')::int >= 30 THEN 1 ELSE 0 END) AS slot_idx,
        COUNT(*)::int AS actions,
        COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log
      WHERE created_at >= $1 AND importance >= 1
      GROUP BY 1
      ORDER BY 1
    `, [since]);

    const byWeekday = await pool.query(`
      SELECT
        EXTRACT(ISODOW FROM created_at AT TIME ZONE '${VN_TZ}')::int AS weekday,
        COUNT(*)::int AS actions,
        COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log
      WHERE created_at >= $1 AND importance >= 1
      GROUP BY 1
      ORDER BY 1
    `, [since]);

    const perUser = await pool.query(`
      SELECT
        u.id AS user_id,
        u.full_name,
        u.email,
        u.role,
        d.name AS department,
        COUNT(l.*)::int AS actions,
        MAX(l.created_at) AS last_action_at
      FROM user_activity_log l
      JOIN users u ON u.id = l.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE l.created_at >= $1 AND l.importance >= 1 AND u.is_active IS DISTINCT FROM false
      GROUP BY u.id, u.full_name, u.email, u.role, d.name
      ORDER BY actions DESC
      LIMIT 50
    `, [since]);

    const perUserHours = await pool.query(`
      SELECT
        l.user_id,
        EXTRACT(HOUR FROM l.created_at AT TIME ZONE '${VN_TZ}')::int AS hour_vn,
        COUNT(*)::int AS actions
      FROM user_activity_log l
      WHERE l.created_at >= $1 AND l.importance >= 1
      GROUP BY l.user_id, hour_vn
    `, [since]);

    return {
      hourly: hourly.rows,
      halfHourly: halfHourly.rows,
      byWeekday: byWeekday.rows,
      perUser: perUser.rows,
      perUserHours: perUserHours.rows,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function queryActivityViaSupabase(days) {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('user_activity_log')
    .select('user_id, created_at, module, action_type')
    .gte('created_at', since)
    .gte('importance', 1)
    .limit(15000);
  if (error) throw error;

  const hourCounts = Array.from({ length: 24 }, (_, h) => ({ hour_vn: h, actions: 0, users: new Set() }));
  const halfCounts = Array.from({ length: 48 }, (_, i) => ({ slot_idx: i, actions: 0, users: new Set() }));
  const userMap = new Map();

  for (const r of data || []) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: VN_TZ,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date(r.created_at));
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const slotIdx = h * 2 + (m >= 30 ? 1 : 0);
    hourCounts[h].actions += 1;
    halfCounts[slotIdx].actions += 1;
    if (r.user_id) {
      hourCounts[h].users.add(String(r.user_id));
      halfCounts[slotIdx].users.add(String(r.user_id));
      const uid = String(r.user_id);
      if (!userMap.has(uid)) userMap.set(uid, { user_id: uid, actions: 0, modules: {} });
      const u = userMap.get(uid);
      u.actions += 1;
      const mod = r.module || '_none_';
      u.modules[mod] = (u.modules[mod] || 0) + 1;
    }
  }

  return {
    hourly: hourCounts.map((x) => ({ hour_vn: x.hour_vn, actions: x.actions, users: x.users.size })),
    halfHourly: halfCounts.map((x) => ({ slot_idx: x.slot_idx, actions: x.actions, users: x.users.size })),
    byWeekday: [],
    perUser: [...userMap.values()].sort((a, b) => b.actions - a.actions).slice(0, 50).map((u) => ({
      user_id: u.user_id,
      actions: u.actions,
      modules: u.modules,
    })),
    perUserHours: [],
  };
}

async function attachUserProfiles(perUser) {
  const ids = (perUser || []).map((r) => r.user_id).filter(Boolean);
  if (!ids.length) return perUser;
  const { data } = await supabase
    .from('users')
    .select('id, full_name, email, role, department:departments!users_department_id_fkey(name)')
    .in('id', ids.slice(0, 50));
  const map = new Map((data || []).map((u) => [String(u.id), u]));
  return perUser.map((r) => {
    const u = map.get(String(r.user_id));
    return {
      ...r,
      full_name: u?.full_name || null,
      email: u?.email || null,
      role: u?.role || null,
      department: u?.department?.name || null,
    };
  });
}

function slotIdxToLabel(idx) {
  const h = Math.floor(idx / 2);
  const m = idx % 2 === 1 ? 30 : 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weekdayLabel(n) {
  const map = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
  return map[n] || String(n);
}

function buildQuietHours(hourly, halfHourly, snapshots) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour_vn: h,
    actions: 0,
    users: 0,
    label: `${String(h).padStart(2, '0')}:00`,
  }));
  for (const row of hourly || []) {
    const h = Number(row.hour_vn);
    if (h >= 0 && h < 24) {
      hours[h].actions = Number(row.actions || 0);
      hours[h].users = Number(row.users || 0);
    }
  }

  const half = Array.from({ length: 48 }, (_, i) => ({
    slot_idx: i,
    label: slotIdxToLabel(i),
    actions: 0,
    users: 0,
  }));
  for (const row of halfHourly || []) {
    const i = Number(row.slot_idx);
    if (i >= 0 && i < 48) {
      half[i].actions = Number(row.actions || 0);
      half[i].users = Number(row.users || 0);
    }
  }

  const snapshotByHour = Array.from({ length: 24 }, () => ({ samples: 0, online_sum: 0, active_sum: 0 }));
  for (const s of snapshots || []) {
    const h = Number(s.hour_vn);
    if (h >= 0 && h < 24) {
      snapshotByHour[h].samples += 1;
      snapshotByHour[h].online_sum += Number(s.online_count || 0);
      snapshotByHour[h].active_sum += Number(s.active_users_1h || 0);
    }
  }

  const scored = hours.map((h) => {
    const snap = snapshotByHour[h.hour_vn];
    const avgOnline = snap.samples ? snap.online_sum / snap.samples : null;
    const avgActive = snap.samples ? snap.active_sum / snap.samples : null;
    const score = h.actions + (avgOnline != null ? avgOnline * 5 : 0);
    return { ...h, avg_online: avgOnline, avg_active_1h: avgActive, score };
  });

  const quietestHours = [...scored].sort((a, b) => a.score - b.score).slice(0, 5);
  const quietestHalfHours = [...half].sort((a, b) => a.actions - b.actions).slice(0, 5);

  return { hours: scored, half_hours: half, quietest_hours: quietestHours, quietest_half_hours: quietestHalfHours };
}

function scoreSyncSlot(slot, quietHours) {
  const label = slotLabel(slot);
  const h = slot.h;
  const slotIdx = h * 2 + (slot.m >= 30 ? 1 : 0);
  const hourRow = quietHours.hours[h] || { actions: 0, score: 0 };
  const halfRow = quietHours.half_hours[slotIdx] || { actions: 0 };
  const rank = quietHours.quietest_hours.findIndex((q) => q.hour_vn === h);
  return {
    slot: label,
    hour_vn: h,
    activity_actions: hourRow.actions,
    half_hour_actions: halfRow.actions,
    avg_online: hourRow.avg_online,
    quiet_rank: rank >= 0 ? rank + 1 : null,
    is_quiet: rank >= 0 && rank < 3,
  };
}

async function enrichPerUser(rows, perUserHours, days) {
  const hoursByUser = new Map();
  for (const r of perUserHours || []) {
    const uid = String(r.user_id);
    if (!hoursByUser.has(uid)) hoursByUser.set(uid, Array(24).fill(0));
    const h = Number(r.hour_vn);
    if (h >= 0 && h < 24) hoursByUser.get(uid)[h] = Number(r.actions || 0);
  }

  const userIds = (rows || []).map((r) => r.user_id).filter(Boolean);
  let presence = {};
  try {
    presence = await getPresenceForUserIds(userIds.slice(0, 100));
  } catch { /* ignore */ }

  return (rows || []).map((r) => {
    const uid = String(r.user_id);
    const hourCounts = hoursByUser.get(uid) || [];
    let peakHour = null;
    let peakCount = 0;
    hourCounts.forEach((c, h) => {
      if (c > peakCount) {
        peakCount = c;
        peakHour = h;
      }
    });
    const modules = r.modules && typeof r.modules === 'object'
      ? Object.entries(r.modules).sort((a, b) => b[1] - a[1]).slice(0, 3)
      : [];
    return {
      user_id: uid,
      full_name: r.full_name || null,
      email: r.email || null,
      role: r.role || null,
      department: r.department || null,
      actions: Number(r.actions || 0),
      last_action_at: r.last_action_at || null,
      peak_hour_vn: peakCount > 0 ? peakHour : null,
      peak_hour_actions: peakCount,
      top_modules: modules.map(([m, c]) => ({ module: m, count: c })),
      online: presence[uid]?.online || false,
      last_ping_at: presence[uid]?.last_ping_at || null,
    };
  });
}

async function getSystemUsageAnalytics(days = 14) {
  const safeDays = Math.min(Math.max(parseInt(days, 10) || 14, 1), 90);
  let activity = null;
  let source = 'postgres';

  try {
    activity = await queryActivityViaPg(safeDays);
    if (!activity) {
      source = 'supabase';
      const raw = await queryActivityViaSupabase(safeDays);
      raw.perUser = await attachUserProfiles(raw.perUser);
      activity = raw;
    }
  } catch (e) {
    if (/user_activity_log/i.test(e.message || '')) {
      return {
        ok: false,
        error: 'Bảng user_activity_log chưa có — chạy database/235_user_activity_log.sql',
        days: safeDays,
      };
    }
    throw e;
  }

  const snapshots = await loadSnapshots();
  const quiet = buildQuietHours(activity.hourly, activity.halfHourly, snapshots);
  const totalActions = quiet.hours.reduce((s, h) => s + h.actions, 0);

  let backupSettings = {};
  try {
    backupSettings = await require('./supabaseBackupSync').loadSettings();
  } catch { /* ignore */ }

  const syncSlots = getEffectiveSyncSlots(backupSettings);
  const syncSlotAnalysis = syncSlots.map((s) => scoreSyncSlot(s, quiet));

  const users = await enrichPerUser(activity.perUser, activity.perUserHours, safeDays);

  const recommended = quiet.quietest_half_hours
    .slice(0, 3)
    .map((h) => {
      const [hh, mm] = h.label.split(':').map((x) => parseInt(x, 10));
      return { h: hh, m: mm || 0, label: h.label, actions: h.actions };
    });

  return {
    ok: true,
    days: safeDays,
    source,
    generated_at: new Date().toISOString(),
    summary: {
      total_actions: totalActions,
      distinct_users: users.length,
      snapshots_count: snapshots.length,
      quietest_hour: quiet.quietest_hours[0] || null,
      recommended_sync_slots: recommended,
    },
    hourly: quiet.hours,
    quietest_hours: quiet.quietest_hours,
    quietest_half_hours: quiet.quietest_half_hours,
    by_weekday: (activity.byWeekday || []).map((r) => ({
      weekday: Number(r.weekday),
      label: weekdayLabel(Number(r.weekday)),
      actions: Number(r.actions || 0),
      users: Number(r.users || 0),
    })),
    users,
    sync_slot_analysis: syncSlotAnalysis,
    snapshots_recent: snapshots.slice(-48),
  };
}

function startUsageAnalyticsCron() {
  if (process.env.USAGE_ANALYTICS_CRON_DISABLED === '1') return;
  const tickMs = 60_000;
  setInterval(() => {
    void runIfLeader('usage-analytics-hourly', () => recordHourlySnapshot(), { ttlSec: 120 });
  }, tickMs);
  console.log('[usage-analytics] Snapshot online mỗi giờ (VN :00) · tick 60s');
}

module.exports = {
  getSystemUsageAnalytics,
  recordHourlySnapshot,
  startUsageAnalyticsCron,
};
