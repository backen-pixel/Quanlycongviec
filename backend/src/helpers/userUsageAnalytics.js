/**
 * Phân tích mức sử dụng hệ thống theo giờ VN — tìm khung giờ ít user nhất.
 * Nguồn: user_activity_log + snapshot online mỗi giờ (app_settings).
 */
const { Pool } = require('pg');
const config = require('../config');
const { isPgConnectionError } = require('../config/db');
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

function normalizeFilters(raw = {}) {
  const empty = (v) => v == null || v === '' || v === 'all';
  const hour = (v) => {
    if (empty(v)) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 23 ? n : null;
  };
  const wd = empty(raw.weekday) ? null : parseInt(raw.weekday, 10);
  return {
    userId: empty(raw.user_id) ? null : String(raw.user_id),
    departmentId: empty(raw.department_id) ? null : String(raw.department_id),
    module: empty(raw.module) ? null : String(raw.module),
    actionType: empty(raw.action_type) ? null : String(raw.action_type),
    weekday: Number.isFinite(wd) && wd >= 1 && wd <= 7 ? wd : null,
    hourFrom: hour(raw.hour_from),
    hourTo: hour(raw.hour_to),
    minImportance: Math.min(3, Math.max(0, parseInt(raw.min_importance, 10) || 1)),
  };
}

function vnPartsFromIso(iso) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const wd = parts.find((p) => p.type === 'weekday')?.value || '';
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { h, m, slotIdx: h * 2 + (m >= 30 ? 1 : 0), weekday: wdMap[wd] || 1 };
}

function hourInRange(h, from, to) {
  if (from == null && to == null) return true;
  if (from != null && to != null) {
    if (from <= to) return h >= from && h <= to;
    return h >= from || h <= to;
  }
  if (from != null) return h >= from;
  return h <= to;
}

function matchesActivityFilters(row, filters, vn, deptUserIds) {
  if ((row.importance ?? 1) < filters.minImportance) return false;
  if (filters.userId && String(row.user_id) !== filters.userId) return false;
  if (filters.departmentId && deptUserIds && !deptUserIds.has(String(row.user_id))) return false;
  if (filters.module && row.module !== filters.module) return false;
  if (filters.actionType && row.action_type !== filters.actionType) return false;
  if (filters.weekday && vn.weekday !== filters.weekday) return false;
  if (!hourInRange(vn.h, filters.hourFrom, filters.hourTo)) return false;
  return true;
}

/** SQL filter cho user_activity_log (alias mặc định `l`), $1 = since */
function buildActivityFilterSql(filters, alias = 'l', startIdx = 2) {
  const parts = [`${alias}.importance >= $${startIdx}`];
  const params = [filters.minImportance];
  let i = startIdx + 1;
  if (filters.userId) {
    parts.push(`${alias}.user_id = $${i++}`);
    params.push(filters.userId);
  }
  if (filters.module) {
    parts.push(`${alias}.module = $${i++}`);
    params.push(filters.module);
  }
  if (filters.actionType) {
    parts.push(`${alias}.action_type = $${i++}`);
    params.push(filters.actionType);
  }
  if (filters.departmentId) {
    parts.push(`${alias}.user_id IN (SELECT id FROM users WHERE department_id = $${i++})`);
    params.push(filters.departmentId);
  }
  const tzHour = `EXTRACT(HOUR FROM ${alias}.created_at AT TIME ZONE '${VN_TZ}')::int`;
  const tzWd = `EXTRACT(ISODOW FROM ${alias}.created_at AT TIME ZONE '${VN_TZ}')::int`;
  if (filters.weekday) {
    parts.push(`${tzWd} = $${i++}`);
    params.push(filters.weekday);
  }
  if (filters.hourFrom != null && filters.hourTo != null) {
    if (filters.hourFrom <= filters.hourTo) {
      parts.push(`${tzHour} >= $${i} AND ${tzHour} <= $${i + 1}`);
    } else {
      parts.push(`(${tzHour} >= $${i} OR ${tzHour} <= $${i + 1})`);
    }
    params.push(filters.hourFrom, filters.hourTo);
    i += 2;
  } else if (filters.hourFrom != null) {
    parts.push(`${tzHour} >= $${i++}`);
    params.push(filters.hourFrom);
  } else if (filters.hourTo != null) {
    parts.push(`${tzHour} <= $${i++}`);
    params.push(filters.hourTo);
  }
  return { sql: parts.join(' AND '), params };
}

function aggregateActivityRows(rows) {
  const hourCounts = Array.from({ length: 24 }, (_, h) => ({ hour_vn: h, actions: 0, users: new Set() }));
  const halfCounts = Array.from({ length: 48 }, (_, idx) => ({ slot_idx: idx, actions: 0, users: new Set() }));
  const weekdayCounts = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, actions: 0, users: new Set() }));
  const actionMap = new Map();
  const moduleMap = new Map();
  const userMap = new Map();
  const perUserHours = new Map();

  for (const r of rows || []) {
    const vn = vnPartsFromIso(r.created_at);
    hourCounts[vn.h].actions += 1;
    halfCounts[vn.slotIdx].actions += 1;
    weekdayCounts[vn.weekday - 1].actions += 1;
    if (r.user_id) {
      const uid = String(r.user_id);
      hourCounts[vn.h].users.add(uid);
      halfCounts[vn.slotIdx].users.add(uid);
      weekdayCounts[vn.weekday - 1].users.add(uid);
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          user_id: uid,
          actions: 0,
          modules: {},
          action_types: {},
          last_action_at: r.created_at,
        });
      }
      const u = userMap.get(uid);
      u.actions += 1;
      if (r.created_at > u.last_action_at) u.last_action_at = r.created_at;
      const mod = r.module || '_none_';
      u.modules[mod] = (u.modules[mod] || 0) + 1;
      const act = r.action_type || '_unknown_';
      u.action_types[act] = (u.action_types[act] || 0) + 1;
      if (!perUserHours.has(uid)) perUserHours.set(uid, Array(24).fill(0));
      perUserHours.get(uid)[vn.h] += 1;
    }
    const actKey = r.action_type || '_unknown_';
    actionMap.set(actKey, (actionMap.get(actKey) || 0) + 1);
    const modKey = r.module || '_none_';
    moduleMap.set(modKey, (moduleMap.get(modKey) || 0) + 1);
  }

  return {
    hourly: hourCounts.map((x) => ({ hour_vn: x.hour_vn, actions: x.actions, users: x.users.size })),
    halfHourly: halfCounts.map((x) => ({ slot_idx: x.slot_idx, actions: x.actions, users: x.users.size })),
    byWeekday: weekdayCounts.map((x) => ({ weekday: x.weekday, actions: x.actions, users: x.users.size })),
    byActionType: [...actionMap.entries()]
      .map(([action_type, actions]) => ({ action_type, actions }))
      .sort((a, b) => b.actions - a.actions),
    byModule: [...moduleMap.entries()]
      .map(([module, actions]) => ({ module, actions }))
      .sort((a, b) => b.actions - a.actions),
    perUser: [...userMap.values()].sort((a, b) => b.actions - a.actions).slice(0, 50),
    perUserHours: [...perUserHours.entries()].flatMap(([user_id, hours]) =>
      hours.map((actions, hour_vn) => (actions > 0 ? { user_id, hour_vn, actions } : null)).filter(Boolean),
    ),
  };
}

async function fetchFilterOptions(days) {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const [logsRes, usersRes, deptsRes] = await Promise.all([
    supabase
      .from('user_activity_log')
      .select('module, action_type')
      .gte('created_at', since)
      .gte('importance', 1)
      .limit(8000),
    supabase
      .from('users')
      .select('id, full_name, email, department_id')
      .neq('is_active', false)
      .order('full_name')
      .limit(500),
    supabase.from('departments').select('id, name').order('name').limit(200),
  ]);

  const modules = new Set();
  const actionTypes = new Set();
  for (const r of logsRes.data || []) {
    if (r.module) modules.add(r.module);
    if (r.action_type) actionTypes.add(r.action_type);
  }

  return {
    modules: [...modules].sort(),
    action_types: [...actionTypes].sort(),
    users: (usersRes.data || []).map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      department_id: u.department_id,
    })),
    departments: (deptsRes.data || []).map((d) => ({ id: d.id, name: d.name })),
  };
}

async function resolveDeptUserIds(departmentId) {
  if (!departmentId) return null;
  const { data } = await supabase.from('users').select('id').eq('department_id', departmentId);
  return new Set((data || []).map((u) => String(u.id)));
}

function pgPool() {
  if (process.env.PG_POOL_DISABLED === '1') return null;
  const url = config.supabaseDbDirectUrl || config.supabaseDbUrl || process.env.SUPABASE_DB_DIRECT_URL || process.env.SUPABASE_DB_URL;
  if (!url) return null;
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 4000,
    query_timeout: 20000,
    statement_timeout: 20000,
  });
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

async function queryActivityViaPg(days, filters) {
  const pool = pgPool();
  if (!pool) return null;
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const { sql: filterSql, params: filterParams } = buildActivityFilterSql(filters);
  const baseWhere = `created_at >= $1 AND ${filterSql}`;
  const params = [since, ...filterParams];
  try {
    const hourly = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE '${VN_TZ}')::int AS hour_vn,
        COUNT(*)::int AS actions,
        COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log l
      WHERE ${baseWhere}
      GROUP BY 1
      ORDER BY 1
    `, params);

    const halfHourly = await pool.query(`
      SELECT
        (EXTRACT(HOUR FROM created_at AT TIME ZONE '${VN_TZ}')::int * 2
          + CASE WHEN EXTRACT(MINUTE FROM created_at AT TIME ZONE '${VN_TZ}')::int >= 30 THEN 1 ELSE 0 END) AS slot_idx,
        COUNT(*)::int AS actions,
        COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log l
      WHERE ${baseWhere}
      GROUP BY 1
      ORDER BY 1
    `, params);

    const byWeekday = await pool.query(`
      SELECT
        EXTRACT(ISODOW FROM created_at AT TIME ZONE '${VN_TZ}')::int AS weekday,
        COUNT(*)::int AS actions,
        COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log l
      WHERE ${baseWhere}
      GROUP BY 1
      ORDER BY 1
    `, params);

    const byActionType = await pool.query(`
      SELECT action_type, COUNT(*)::int AS actions, COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log l
      WHERE ${baseWhere}
      GROUP BY 1
      ORDER BY actions DESC
    `, params);

    const byModule = await pool.query(`
      SELECT module, COUNT(*)::int AS actions, COUNT(DISTINCT user_id)::int AS users
      FROM user_activity_log l
      WHERE ${baseWhere}
      GROUP BY 1
      ORDER BY actions DESC
    `, params);

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
      WHERE l.created_at >= $1 AND ${filterSql} AND u.is_active IS DISTINCT FROM false
      GROUP BY u.id, u.full_name, u.email, u.role, d.name
      ORDER BY actions DESC
      LIMIT 50
    `, params);

    const perUserHours = await pool.query(`
      SELECT
        l.user_id,
        EXTRACT(HOUR FROM l.created_at AT TIME ZONE '${VN_TZ}')::int AS hour_vn,
        COUNT(*)::int AS actions
      FROM user_activity_log l
      WHERE ${baseWhere}
      GROUP BY l.user_id, hour_vn
    `, params);

    return {
      hourly: hourly.rows,
      halfHourly: halfHourly.rows,
      byWeekday: byWeekday.rows,
      byActionType: byActionType.rows,
      byModule: byModule.rows,
      perUser: perUser.rows,
      perUserHours: perUserHours.rows,
    };
  } catch (e) {
    if (isPgConnectionError(e)) {
      console.warn('[usage-analytics] pg unavailable, fallback Supabase REST:', e.code || e.message);
      return null;
    }
    throw e;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function queryActivityViaSupabase(days, filters) {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const deptUserIds = filters.departmentId ? await resolveDeptUserIds(filters.departmentId) : null;

  let q = supabase
    .from('user_activity_log')
    .select('user_id, created_at, module, action_type, importance')
    .gte('created_at', since)
    .gte('importance', filters.minImportance);
  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.module) q = q.eq('module', filters.module);
  if (filters.actionType) q = q.eq('action_type', filters.actionType);
  if (deptUserIds?.size) q = q.in('user_id', [...deptUserIds]);

  const { data, error } = await q.limit(15000);
  if (error) throw error;

  const filtered = (data || []).filter((r) => {
    const vn = vnPartsFromIso(r.created_at);
    return matchesActivityFilters(r, filters, vn, deptUserIds);
  });

  return aggregateActivityRows(filtered);
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

async function getSystemUsageAnalytics(days = 14, rawFilters = {}) {
  const safeDays = Math.min(Math.max(parseInt(days, 10) || 14, 1), 90);
  const filters = normalizeFilters(rawFilters);
  let activity = null;
  let source = 'postgres';

  try {
    activity = await queryActivityViaPg(safeDays, filters);
    if (!activity) {
      source = 'supabase';
      activity = await queryActivityViaSupabase(safeDays, filters);
      activity.perUser = await attachUserProfiles(activity.perUser);
    }
  } catch (e) {
    if (/user_activity_log/i.test(e.message || '')) {
      return {
        ok: false,
        error: 'Bảng user_activity_log chưa có — chạy database/235_user_activity_log.sql',
        days: safeDays,
      };
    }
    if (isPgConnectionError(e)) {
      source = 'supabase';
      activity = await queryActivityViaSupabase(safeDays, filters);
      activity.perUser = await attachUserProfiles(activity.perUser);
    } else {
      throw e;
    }
  }

  const filterOptions = await fetchFilterOptions(safeDays);
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
    filters,
    filter_options: filterOptions,
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
    by_action_type: (activity.byActionType || []).map((r) => ({
      action_type: r.action_type,
      actions: Number(r.actions || 0),
      users: Number(r.users || 0),
    })),
    by_module: (activity.byModule || []).map((r) => ({
      module: r.module,
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
