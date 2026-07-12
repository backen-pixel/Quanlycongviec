/**
 * Reverse geocode lat/lng → địa chỉ chữ (cache DB + Nominatim / Google).
 */
const { supabase } = require('../config/supabase');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'Quanlycongviec/1.0 (employee-location-sync)';
const FETCH_TIMEOUT_MS = 3000;

function coordKey(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return `${la.toFixed(5)},${ln.toFixed(5)}`;
}

function formatNominatimAddress(data) {
  if (!data) return null;
  if (data.display_name) return String(data.display_name).slice(0, 240);
  const a = data.address || {};
  const parts = [
    a.house_number,
    a.road || a.pedestrian,
    a.suburb || a.neighbourhood,
    a.city || a.town || a.village,
    a.state,
    a.country,
  ].filter(Boolean);
  return parts.length ? parts.join(', ').slice(0, 240) : null;
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function lookupCache(key) {
  if (!key) return null;
  try {
    const { data, error } = await supabase
      .from('geocode_cache')
      .select('address, raw')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01' || String(error.message || '').includes('geocode_cache')) {
        return null;
      }
      throw error;
    }
    if (!data?.address) return null;
    return { address: data.address, raw: data.raw };
  } catch {
    return null;
  }
}

async function saveCache(key, address, raw) {
  if (!key || !address) return;
  try {
    await supabase.from('geocode_cache').upsert(
      { key, address: String(address).slice(0, 240), raw: raw || null },
      { onConflict: 'key' },
    );
  } catch {
    /* ignore cache write failures */
  }
}

async function geocodeGoogle(lat, lng) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=vi&key=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return null;
  const json = await res.json();
  const addr = json?.results?.[0]?.formatted_address;
  if (!addr) return null;
  return { address: String(addr).slice(0, 240), raw: json?.results?.[0] || null };
}

async function geocodeNominatim(lat, lng) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    'accept-language': 'vi',
  });
  const res = await fetchWithTimeout(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res?.ok) return null;
  const json = await res.json();
  const address = formatNominatimAddress(json);
  if (!address) return null;
  return { address, raw: json };
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ address: string, raw?: object } | null>}
 */
async function reverseGeocode(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;

  const key = coordKey(la, ln);
  const cached = await lookupCache(key);
  if (cached?.address) return cached;

  try {
    let result = await geocodeGoogle(la, ln);
    if (!result?.address) result = await geocodeNominatim(la, ln);
    if (!result?.address) return null;
    if (key) await saveCache(key, result.address, result.raw);
    return result;
  } catch {
    return null;
  }
}

/**
 * Race reverse geocode — dùng trong /devices/ping để không chặn quá lâu.
 * @param {number} maxMs
 */
function reverseGeocodeWithTimeout(lat, lng, maxMs = 1500) {
  return Promise.race([
    reverseGeocode(lat, lng),
    new Promise((resolve) => setTimeout(() => resolve(null), maxMs)),
  ]);
}

module.exports = {
  coordKey,
  reverseGeocode,
  reverseGeocodeWithTimeout,
};
