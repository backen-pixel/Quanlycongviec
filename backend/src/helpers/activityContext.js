/**
 * Trích xuất thiết bị + vị trí từ request (body/query/header) và user_devices.
 */
const { supabase } = require('../config/supabase');
const { clientIp } = require('./auditLog');
const { inVietnam } = require('./geoBounds');
const { reverseGeocodeWithTimeout } = require('./reverseGeocode');

function safeFloat(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickDeviceId(req) {
  const body = req?.body || {};
  const q = req?.query || {};
  return String(
    body.device_id || q.device_id || req?.headers?.['x-device-id'] || '',
  ).trim() || null;
}

function pickGeo(req) {
  const body = req?.body || {};
  const q = req?.query || {};
  const lat = safeFloat(body.geo_lat ?? q.geo_lat);
  const lng = safeFloat(body.geo_lng ?? q.geo_lng);
  if (!inVietnam(lat, lng)) return { geo_lat: null, geo_lng: null };
  return { geo_lat: lat, geo_lng: lng };
}

function pickDeviceName(req) {
  const body = req?.body || {};
  const q = req?.query || {};
  return String(body.device_name || q.device_name || '').trim().slice(0, 160) || null;
}

async function lookupUserDevice(userId, deviceId) {
  if (!userId || !deviceId) return null;
  try {
    const { data, error } = await supabase
      .from('user_devices')
      .select('device_id, device_name, platform, os_name, geo_lat, geo_lng, geo_address, ip')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * @param {import('express').Request} req
 * @param {{ userId?: string, requireDevice?: boolean, requireGeo?: boolean, geocode?: boolean }} [opts]
 */
async function resolveActivityContext(req, opts = {}) {
  const userId = opts.userId || req?.user?.userId || req?.user?.id || null;
  let device_id = pickDeviceId(req);
  let device_name = pickDeviceName(req);
  let { geo_lat, geo_lng } = pickGeo(req);
  let geo_address = String(req?.body?.geo_address || req?.query?.geo_address || '').trim().slice(0, 240) || null;
  const ip = clientIp(req);
  const user_agent = req?.headers?.['user-agent']
    ? String(req.headers['user-agent']).slice(0, 500)
    : null;

  const row = device_id ? await lookupUserDevice(userId, device_id) : null;
  if (row) {
    if (!device_name) device_name = row.device_name || null;
    if (!geo_lat && inVietnam(row.geo_lat, row.geo_lng)) {
      geo_lat = row.geo_lat;
      geo_lng = row.geo_lng;
      if (!geo_address) geo_address = row.geo_address || null;
    }
  }

  if (opts.requireDevice && !device_id) {
    return {
      ok: false,
      error: 'Thiếu thiết bị — tải lại trang hoặc đăng nhập lại',
    };
  }
  if (opts.requireGeo && !inVietnam(geo_lat, geo_lng)) {
    return {
      ok: false,
      error: 'Thiếu vị trí — bật quyền GPS/định vị trình duyệt rồi thử lại',
    };
  }

  if (opts.geocode !== false && inVietnam(geo_lat, geo_lng) && !geo_address) {
    try {
      const geocoded = await reverseGeocodeWithTimeout(geo_lat, geo_lng, 1200);
      if (geocoded?.address) geo_address = String(geocoded.address).slice(0, 240);
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    user_id: userId,
    device_id,
    device_name,
    platform: row?.platform || String(req?.body?.platform || 'web').slice(0, 20),
    geo_lat: inVietnam(geo_lat, geo_lng) ? geo_lat : null,
    geo_lng: inVietnam(geo_lat, geo_lng) ? geo_lng : null,
    geo_address,
    ip,
    user_agent,
  };
}

function activityContextFromEntry(raw = {}) {
  const lat = safeFloat(raw.geo_lat);
  const lng = safeFloat(raw.geo_lng);
  const validGeo = inVietnam(lat, lng);
  return {
    device_id: raw.device_id ? String(raw.device_id).slice(0, 120) : null,
    device_name: raw.device_name ? String(raw.device_name).slice(0, 160) : null,
    geo_lat: validGeo ? lat : null,
    geo_lng: validGeo ? lng : null,
    geo_address: raw.geo_address ? String(raw.geo_address).slice(0, 240) : null,
  };
}

function missingDeviceGeoColumns(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('device_id') || msg.includes('geo_lat') || msg.includes('geo_address');
}

module.exports = {
  resolveActivityContext,
  activityContextFromEntry,
  missingDeviceGeoColumns,
};
