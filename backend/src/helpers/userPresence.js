const { supabase } = require('../config/supabase');

/** Ngưỡng coi online: có ping trong 2 phút gần nhất */
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
/** Ngưỡng coi device đang online: ping trong 90 giây gần nhất */
const DEVICE_ONLINE_THRESHOLD_MS = 90 * 1000;

async function getDevicesForUserIds(userIds) {
  const seen = new Set();
  const ids = [];
  for (const id of userIds || []) {
    const s = String(id || '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    ids.push(s);
    if (ids.length >= 200) break;
  }
  const out = {};
  for (const id of ids) out[id] = [];
  if (!ids.length) return out;

  const { data, error } = await supabase
    .from('user_devices')
    .select('user_id, platform, device_name, os_name, os_version, app_version, last_ping_at, last_login_at')
    .in('user_id', ids)
    .order('last_ping_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || String(error.message || '').includes('user_devices')) {
      return out;
    }
    throw error;
  }
  const threshold = Date.now() - DEVICE_ONLINE_THRESHOLD_MS;
  for (const row of data || []) {
    const uid = String(row.user_id);
    if (!out[uid]) out[uid] = [];
    out[uid].push({
      platform: row.platform,
      device_name: row.device_name,
      os_name: row.os_name,
      os_version: row.os_version,
      app_version: row.app_version,
      last_ping_at: row.last_ping_at,
      last_login_at: row.last_login_at,
      online: row.last_ping_at ? new Date(row.last_ping_at).getTime() >= threshold : false,
    });
  }
  return out;
}

const MIGRATION_HINT = 'database/67_user_activity_and_messenger_pins.sql';

/**
 * Ghi nhận user còn hoạt động (HTTP POST /users/ping hoặc socket presence:ping).
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, persisted?: boolean, last_ping_at?: string, error?: string }>}
 */
async function recordUserPing(userId) {
  const uid = userId != null ? String(userId) : '';
  if (!uid) return { ok: false, error: 'missing_user_id' };

  const last_ping_at = new Date().toISOString();
  const { error } = await supabase.from('user_last_activity').upsert(
    { user_id: uid, last_ping_at },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.warn('[userPresence] recordUserPing:', error.message, '- chạy migration', MIGRATION_HINT);
    return { ok: false, persisted: false, error: error.message };
  }

  return { ok: true, persisted: true, last_ping_at };
}

/**
 * @param {string[]} userIds — tối đa 200 id
 * @returns {Promise<Record<string, { online: boolean, last_ping_at: string | null }>>}
 */
async function getPresenceForUserIds(userIds) {
  const seen = new Set();
  const filtered = [];
  for (const id of userIds || []) {
    const s = String(id || '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    filtered.push(s);
    if (filtered.length >= 200) break;
  }

  const presence = {};
  for (const id of filtered) {
    presence[id] = { online: false, last_ping_at: null };
  }
  if (!filtered.length) return presence;

  const { data, error } = await supabase
    .from('user_last_activity')
    .select('user_id, last_ping_at')
    .in('user_id', filtered);

  if (error) throw error;

  const threshold = Date.now() - ONLINE_THRESHOLD_MS;
  for (const row of data || []) {
    const id = String(row.user_id);
    const ts = row.last_ping_at ? new Date(row.last_ping_at).getTime() : 0;
    presence[id] = {
      online: ts > threshold,
      last_ping_at: row.last_ping_at,
    };
  }

  return presence;
}

/**
 * Danh sách NV (theo công ty / phòng ban) kèm online + last_ping_at.
 */
async function listUsersWithActivity({ companyId, departmentId, search, onlineOnly } = {}) {
  const userSelect =
    'id, full_name, email, phone, avatar, role, position, department_id, department:departments!users_department_id_fkey(id,name,color)';

  let users = [];

  if (departmentId) {
    let q = supabase.from('users').select(userSelect).eq('department_id', departmentId).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('full_name').limit(500);
    if (error) throw error;
    users = data || [];
  } else if (companyId) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const deptIds = (depts || []).map((d) => d.id);
    if (!deptIds.length) return { users: [], stats: { online: 0, total: 0 } };

    let q = supabase.from('users').select(userSelect).in('department_id', deptIds).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('full_name').limit(500);
    if (error) throw error;
    users = data || [];
  } else {
    let q = supabase.from('users').select(userSelect).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('full_name').limit(500);
    if (error) throw error;
    users = data || [];
  }

  const userIds = users.map((u) => u.id);
  const [presence, deviceMap] = await Promise.all([
    getPresenceForUserIds(userIds),
    getDevicesForUserIds(userIds),
  ]);
  const enriched = users.map((u) => {
    const id = String(u.id);
    const pres = presence[id] || { online: false, last_ping_at: null };
    const devices = deviceMap[id] || [];
    return {
      ...u,
      online: !!pres.online,
      last_ping_at: pres.last_ping_at,
      devices,
      online_devices: devices.filter((d) => d.online).length,
    };
  });

  const stats = {
    online: enriched.filter((u) => u.online).length,
    total: enriched.length,
  };

  let result = enriched;
  if (onlineOnly) result = enriched.filter((u) => u.online);

  result.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''), 'vi');
  });

  return { users: result, stats };
}

module.exports = {
  ONLINE_THRESHOLD_MS,
  DEVICE_ONLINE_THRESHOLD_MS,
  MIGRATION_HINT,
  recordUserPing,
  getPresenceForUserIds,
  getDevicesForUserIds,
  listUsersWithActivity,
};
