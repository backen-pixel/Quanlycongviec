const { supabase } = require('../config/supabase');
const { getCurrentLocationsForUserIds } = require('./userCurrentLocation');

/** Bot AI luôn online — không có thật, không ping được, nhưng UX cần thấy bot sẵn sàng. */
const AI_BOT_USER_ID = '00000000-0000-0000-0000-0000000000a1';
function isBotUserId(id) {
  return String(id || '') === AI_BOT_USER_ID;
}

/** Ngưỡng coi online: có ping trong 2 phút gần nhất */
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
/** Ngưỡng coi device đang online: ping trong 90 giây gần nhất */
const DEVICE_ONLINE_THRESHOLD_MS = 90 * 1000;

function normalizeDeviceName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseIpKind(ip) {
  const v = String(ip || '').trim();
  if (!v) return null;
  const ipv4 = v.replace(/^::ffff:/, '');
  const isLocalhost = ipv4 === '127.0.0.1' || ipv4 === '::1';
  if (isLocalhost) return 'localhost';
  if (/^10\./.test(ipv4)) return 'private';
  if (/^192\.168\./.test(ipv4)) return 'private';
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ipv4)) return 'private';
  return 'public';
}

function isMissingDeviceColumn(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('network_name')
    || msg.includes('network_type')
    || msg.includes('geo_lat')
    || msg.includes('geo_lng')
    || msg.includes('geo_address')
  );
}

/** Loại bỏ vị trí (0,0) — thiết bị mô phỏng hoặc không lấy được vị trí thật. */
function isValidGeo(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false;
  return true;
}

function deviceDedupKey(row) {
  const platform = String(row?.platform || '').trim().toLowerCase();
  const name = normalizeDeviceName(row?.device_name);
  if (name) return `${platform}|${name}`;
  const osName = normalizeDeviceName(row?.os_name);
  const osVersion = normalizeDeviceName(row?.os_version);
  const appVersion = normalizeDeviceName(row?.app_version);
  return `${platform}|${osName}|${osVersion}|${appVersion}`;
}

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

  const queryLatest = () => supabase
    .from('user_devices')
    .select('user_id, platform, device_name, os_name, os_version, app_version, ip, network_name, network_type, geo_lat, geo_lng, geo_address, last_ping_at, last_login_at')
    .in('user_id', ids)
    .order('last_ping_at', { ascending: false });
  const queryFallback = () => supabase
    .from('user_devices')
    .select('user_id, platform, device_name, os_name, os_version, app_version, ip, last_ping_at, last_login_at')
    .in('user_id', ids)
    .order('last_ping_at', { ascending: false });
  let { data, error } = await queryLatest();
  if (error && isMissingDeviceColumn(error)) {
    ({ data, error } = await queryFallback());
  }
  if (error) {
    if (error.code === '42P01' || String(error.message || '').includes('user_devices')) {
      return out;
    }
    throw error;
  }
  const threshold = Date.now() - DEVICE_ONLINE_THRESHOLD_MS;
  const dedupMap = {};
  for (const row of data || []) {
    const uid = String(row.user_id);
    if (!out[uid]) out[uid] = [];
    if (!dedupMap[uid]) dedupMap[uid] = new Map();
    const key = deviceDedupKey(row);
    const prev = dedupMap[uid].get(key);
    const ipKind = parseIpKind(row.ip);
    const next = {
      platform: row.platform,
      device_name: row.device_name,
      os_name: row.os_name,
      os_version: row.os_version,
      app_version: row.app_version,
      ip: row.ip || null,
      network_name: row.network_name || null,
      network_type: row.network_type || (ipKind === 'private' || ipKind === 'localhost' ? 'wifi' : (ipKind === 'public' ? 'internet' : null)),
      geo_lat: isValidGeo(row.geo_lat, row.geo_lng) ? row.geo_lat : null,
      geo_lng: isValidGeo(row.geo_lat, row.geo_lng) ? row.geo_lng : null,
      geo_address: isValidGeo(row.geo_lat, row.geo_lng) ? (row.geo_address || null) : null,
      network_label: ipKind === 'private' || ipKind === 'localhost' ? 'Nội bộ / WiFi' : (ipKind === 'public' ? 'Internet / di động' : null),
      last_ping_at: row.last_ping_at,
      last_login_at: row.last_login_at,
      online: row.last_ping_at ? new Date(row.last_ping_at).getTime() >= threshold : false,
      duplicate_count: 1,
    };
    if (!prev) {
      dedupMap[uid].set(key, next);
      out[uid].push(next);
      continue;
    }
    prev.duplicate_count += 1;
    const prevTs = prev.last_ping_at ? new Date(prev.last_ping_at).getTime() : 0;
    const nextTs = next.last_ping_at ? new Date(next.last_ping_at).getTime() : 0;
    if (nextTs > prevTs) {
      prev.device_name = next.device_name;
      prev.os_name = next.os_name;
      prev.os_version = next.os_version;
      prev.app_version = next.app_version;
      prev.ip = next.ip;
      prev.network_name = next.network_name;
      prev.network_type = next.network_type;
      prev.network_label = next.network_label;
      prev.geo_lat = next.geo_lat;
      prev.geo_lng = next.geo_lng;
      prev.geo_address = next.geo_address;
      prev.last_ping_at = next.last_ping_at;
      prev.last_login_at = next.last_login_at;
      prev.online = next.online;
    }
  }
  return out;
}

const MIGRATION_HINT = 'database/67_user_activity_and_messenger_pins.sql';

function isMissingActivityTable(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === '42P01'
    || (msg.includes('user_last_activity') && (msg.includes('does not exist') || msg.includes('relation')))
  );
}

/** Cloudflare 522 / timeout — Supabase origin không phản hồi (project pause, quá tải, mạng). */
function isSupabaseInfraError(error) {
  const msg = String(error?.message || '');
  if (msg.trimStart().startsWith('<!DOCTYPE') || msg.includes('Connection timed out')) return true;
  const lower = msg.toLowerCase();
  return (
    lower.includes('fetch failed')
    || lower.includes('econnreset')
    || lower.includes('etimedout')
    || lower.includes('connection terminated')
    || lower.includes('522')
  );
}

function formatPresenceError(error) {
  if (isSupabaseInfraError(error)) {
    return 'Supabase không phản hồi (timeout/522) — kiểm tra project trên dashboard có bị pause không, thử lại sau vài phút';
  }
  if (isMissingActivityTable(error)) {
    return `Bảng user_last_activity chưa có — chạy migration ${MIGRATION_HINT}`;
  }
  const msg = String(error?.message || 'unknown_error');
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

/** Gắn từ server.js — phát `presence:update` qua Socket.IO khi có ping. */
let presenceBroadcastFn = null;
function setPresenceBroadcast(fn) {
  presenceBroadcastFn = typeof fn === 'function' ? fn : null;
}

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
    const detail = formatPresenceError(error);
    console.warn('[userPresence] recordUserPing:', detail);
    return { ok: false, persisted: false, error: detail };
  }

  if (presenceBroadcastFn) {
    try {
      presenceBroadcastFn(uid, last_ping_at);
    } catch (e) {
      console.warn('[userPresence] presenceBroadcastFn:', e?.message || e);
    }
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
  const nowIso = new Date().toISOString();
  for (const id of filtered) {
    // Bot AI: luôn online (không có ping thật từ thiết bị nào)
    presence[id] = isBotUserId(id)
      ? { online: true, last_ping_at: nowIso }
      : { online: false, last_ping_at: null };
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
    if (isBotUserId(id)) continue; // giữ nguyên trạng thái online cứng cho bot
    const ts = row.last_ping_at ? new Date(row.last_ping_at).getTime() : 0;
    presence[id] = {
      online: ts > threshold,
      last_ping_at: row.last_ping_at,
    };
  }

  return presence;
}

/**
 * Phòng ban thuộc công ty (kể cả inactive — khớp phạm vi bảng tin / tìm thành viên).
 */
async function loadCompanyDepartmentIds(companyId) {
  const { data: depts, error } = await supabase
    .from('departments')
    .select('id')
    .eq('company_id', companyId);
  if (error) throw error;
  return new Set((depts || []).map((d) => String(d.id)));
}

function userMatchesCompany(user, companyId, deptIdsSet) {
  const companyEq = String(companyId);
  if (user?.company_id && String(user.company_id) === companyEq) return true;
  if (user?.department_id && deptIdsSet.has(String(user.department_id))) return true;
  return false;
}

/**
 * Danh sách NV thuộc công ty: users.company_id trực tiếp HOẶC department thuộc công ty.
 */
async function queryUsersInCompany(companyId, { search, userSelect }) {
  const companyEq = String(companyId);
  const deptIdsSet = await loadCompanyDepartmentIds(companyId);
  const deptIds = [...deptIdsSet];

  const byId = new Map();
  const ingest = async (q) => {
    const { data, error } = await q.order('full_name').limit(500);
    if (error) throw error;
    for (const u of data || []) byId.set(String(u.id), u);
  };

  {
    let q = supabase.from('users').select(userSelect).eq('company_id', companyEq).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    await ingest(q);
  }
  if (deptIds.length) {
    let q = supabase.from('users').select(userSelect).in('department_id', deptIds).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    await ingest(q);
  }

  return Array.from(byId.values());
}

/**
 * NV đang online thuộc công ty — lấy từ user_last_activity trước, rồi lọc membership
 * (tránh bỏ sót người online vì không nằm trong danh sách thành viên ban đầu).
 */
async function listOnlineUsersForCompany(companyId) {
  const userSelect =
    'id, full_name, email, phone, avatar, role, position, address, department_id, company_id, department:departments!users_department_id_fkey(id,name,color)';

  const thresholdIso = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
  const { data: activityRows, error: actErr } = await supabase
    .from('user_last_activity')
    .select('user_id, last_ping_at')
    .gte('last_ping_at', thresholdIso);
  if (actErr) throw actErr;

  const lastPingMap = new Map();
  for (const row of activityRows || []) {
    const id = String(row.user_id);
    if (id) lastPingMap.set(id, row.last_ping_at);
  }
  const onlineIds = [...lastPingMap.keys()];
  if (!onlineIds.length) return [];

  const deptIdsSet = await loadCompanyDepartmentIds(companyId);
  const byId = new Map();

  for (let i = 0; i < onlineIds.length; i += 200) {
    const batch = onlineIds.slice(i, i + 200);
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select(userSelect)
      .in('id', batch)
      .neq('is_active', false);
    if (uErr) throw uErr;
    for (const u of users || []) {
      if (!userMatchesCompany(u, companyId, deptIdsSet)) continue;
      const id = String(u.id);
      byId.set(id, {
        ...u,
        online: true,
        last_ping_at: lastPingMap.get(id) || null,
        devices: [],
        online_devices: 0,
        current_location: null,
      });
    }
  }

  return Array.from(byId.values());
}

/**
 * Danh sách NV (theo công ty / phòng ban) kèm online + last_ping_at.
 */
async function listUsersWithActivity({ companyId, departmentId, search, onlineOnly } = {}) {
  const userSelect =
    'id, full_name, email, phone, avatar, role, position, address, department_id, department:departments!users_department_id_fkey(id,name,color)';

  let users = [];

  if (departmentId) {
    let q = supabase.from('users').select(userSelect).eq('department_id', departmentId).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('full_name').limit(500);
    if (error) throw error;
    users = data || [];
  } else if (companyId) {
    users = await queryUsersInCompany(companyId, { search, userSelect });
  } else {
    let q = supabase.from('users').select(userSelect).neq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('full_name').limit(500);
    if (error) throw error;
    users = data || [];
  }

  const userIds = users.map((u) => u.id);
  const [presence, deviceMap, locationMap] = await Promise.all([
    getPresenceForUserIds(userIds),
    getDevicesForUserIds(userIds),
    getCurrentLocationsForUserIds(userIds),
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
      current_location: locationMap[id] || null,
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
  setPresenceBroadcast,
  getPresenceForUserIds,
  getDevicesForUserIds,
  queryUsersInCompany,
  loadCompanyDepartmentIds,
  userMatchesCompany,
  listOnlineUsersForCompany,
  listUsersWithActivity,
};
