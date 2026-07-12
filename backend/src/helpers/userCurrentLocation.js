const { supabase } = require('../config/supabase');
const { inVietnam } = require('./geoBounds');

function tableMissing(error) {
  if (!error) return false;
  return error.code === '42P01' || String(error.message || '').includes('user_current_location');
}

/** Chỉ chấp nhận vị trí trong phạm vi Việt Nam. */
function isValidCoord(lat, lng) {
  return inVietnam(lat, lng);
}

/**
 * @param {string} userId
 * @param {{ lat: number, lng: number, address?: string|null, accuracy_m?: number|null, source?: string, device_id?: string }} loc
 */
async function upsertUserCurrentLocation(userId, loc) {
  const uid = userId != null ? String(userId) : '';
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!uid || !isValidCoord(lat, lng)) {
    return { ok: false, error: 'invalid_location' };
  }

  const now = new Date().toISOString();
  const row = {
    user_id: uid,
    lat,
    lng,
    address: loc.address ? String(loc.address).slice(0, 240) : null,
    accuracy_m: loc.accuracy_m != null && Number.isFinite(Number(loc.accuracy_m)) ? Number(loc.accuracy_m) : null,
    source: loc.source ? String(loc.source).slice(0, 40) : null,
    device_id: loc.device_id ? String(loc.device_id).slice(0, 120) : null,
    captured_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('user_current_location')
    .upsert(row, { onConflict: 'user_id' })
    .select('user_id, lat, lng, address, accuracy_m, source, device_id, captured_at, updated_at')
    .single();

  if (error) {
    if (tableMissing(error)) return { ok: false, missingTable: true, error: error.message };
    throw error;
  }
  return { ok: true, location: data };
}

/**
 * @param {string[]} userIds
 * @returns {Promise<Record<string, object>>}
 */
async function getCurrentLocationsForUserIds(userIds) {
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
  for (const id of ids) out[id] = null;
  if (!ids.length) return out;

  const { data, error } = await supabase
    .from('user_current_location')
    .select('user_id, lat, lng, address, accuracy_m, source, device_id, captured_at, updated_at')
    .in('user_id', ids);

  if (error) {
    if (tableMissing(error)) return out;
    throw error;
  }

  for (const row of data || []) {
    const id = String(row.user_id);
    if (!isValidCoord(Number(row.lat), Number(row.lng))) continue;
    out[id] = {
      lat: row.lat,
      lng: row.lng,
      address: row.address || null,
      accuracy_m: row.accuracy_m ?? null,
      source: row.source || null,
      device_id: row.device_id || null,
      captured_at: row.captured_at,
      updated_at: row.updated_at,
    };
  }
  return out;
}

async function getCurrentLocationForUser(userId) {
  const map = await getCurrentLocationsForUserIds([userId]);
  return map[String(userId)] || null;
}

module.exports = {
  upsertUserCurrentLocation,
  getCurrentLocationsForUserIds,
  getCurrentLocationForUser,
};
