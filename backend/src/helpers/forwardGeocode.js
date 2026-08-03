/**
 * Forward geocode: địa chỉ chữ → { lat, lng, address }.
 * Cache vào bảng `geocode_cache` (key = `fwd:<address-normalize>`).
 *
 * Hỗ trợ:
 *  - Google Geocoding API nếu có GOOGLE_MAPS_API_KEY / GOOGLE_GEOCODING_API_KEY
 *  - Fallback Nominatim (OpenStreetMap)
 *  - Trích lat/lng trực tiếp từ Google Maps URL (?q=lat,lng hoặc @lat,lng)
 */
const { supabase } = require('../config/supabase');
const { inVietnam } = require('./geoBounds');
const { lookupVnPlace } = require('./vnPlaceLookup');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Quanlycongviec/1.0 (branch-geocode)';
const FETCH_TIMEOUT_MS = 4000;

function normalizeAddress(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 240);
}

function cacheKey(address) {
  const n = normalizeAddress(address);
  if (!n) return null;
  return `fwd:${n}`;
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function isValidCoord(lat, lng) {
  // Bộ lọc cứng: chỉ chấp nhận toạ độ trong phạm vi Việt Nam.
  return inVietnam(lat, lng);
}

/**
 * Trích toạ độ từ Google Maps URL theo các format ổn định:
 *   - ?q=lat,lng              → marker query
 *   - ?ll=lat,lng              → legacy
 *   - ?destination=lat,lng     → directions
 *   - @lat,lng,zoom            → center
 *   - !3dLAT!4dLNG             → encoded place data
 *
 * Loại bỏ pattern `/lat,lng/` quá rộng (gây false-positive). Short-link
 * dạng `maps.app.goo.gl/...` KHÔNG trích được — sẽ fallback forwardGeocode(address).
 */
function extractLatLngFromMapUrl(urlRaw) {
  if (!urlRaw) return null;
  const url = String(urlRaw);
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return null;
  const patterns = [
    /[?&](?:q|ll|destination|center)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)(?:,|\?|$)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  }
  return null;
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
      if (error.code === '42P01' || String(error.message || '').includes('geocode_cache')) return null;
      return null;
    }
    if (!data) return null;
    const raw = data.raw || {};
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!isValidCoord(lat, lng)) return null;
    return { lat, lng, address: data.address || raw.formatted_address || null };
  } catch {
    return null;
  }
}

async function saveCache(key, { lat, lng, address, source, raw }) {
  if (!key || !isValidCoord(lat, lng)) return;
  try {
    await supabase.from('geocode_cache').upsert(
      {
        key,
        address: address ? String(address).slice(0, 240) : '',
        raw: { lat, lng, formatted_address: address || null, source: source || null, raw: raw || null },
      },
      { onConflict: 'key' },
    );
  } catch {
    /* ignore */
  }
}

async function geocodeGoogle(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=vi&key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return null;
  const json = await res.json();
  const hit = json?.results?.[0];
  const loc = hit?.geometry?.location;
  if (!loc) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng, address: hit.formatted_address || address, source: 'google', raw: hit };
}

async function geocodeNominatim(address) {
  const params = new URLSearchParams({
    q: String(address).slice(0, 200),
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'vi',
    // Bó cứng phạm vi Việt Nam: ngay cả khi address mơ hồ cũng không chọn
    // địa điểm ngoài VN. Người dùng có thể override bằng GEOCODE_COUNTRY_CODES
    // nhưng kết quả vẫn bị isValidCoord (inVietnam) lọc tiếp.
    countrycodes: process.env.GEOCODE_COUNTRY_CODES || 'vn',
  });
  const res = await fetchWithTimeout(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res?.ok) return null;
  const arr = await res.json().catch(() => null);
  const hit = Array.isArray(arr) ? arr[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng, address: hit.display_name || address, source: 'nominatim', raw: hit };
}

/**
 * @param {{ address?: string|null, map_url?: string|null }} input
 * @returns {Promise<{ lat: number, lng: number, address?: string|null, source: string } | null>}
 */
function buildGeocodeQueries(address) {
  const a = String(address || '').trim();
  if (!a) return [];
  const queries = [a];
  const hasVn = /việt\s*nam|vietnam|\bvn\b/i.test(a);
  if (!hasVn) {
    queries.push(`${a}, Việt Nam`);
    // Địa chỉ ngắn kiểu "Gò Vấp" / "Bình Tân" — bổ sung TP.HCM để Nominatim ổn định hơn
    if (a.length <= 48 && !/hồ chí minh|ho chi minh|hcm|sài gòn|sai gon/i.test(a)) {
      queries.push(`${a}, Thành phố Hồ Chí Minh, Việt Nam`);
    }
  }
  return [...new Set(queries)];
}

async function forwardGeocode(input) {
  if (!input) return null;

  const fromUrl = extractLatLngFromMapUrl(input.map_url);
  if (fromUrl) {
    return { lat: fromUrl.lat, lng: fromUrl.lng, address: input.address || null, source: 'map_url' };
  }

  const address = input.address ? String(input.address).trim() : '';
  if (!address) return null;

  // Alias quận/tỉnh VN — ưu tiên trước API ngoài (nhanh, ổn định)
  const alias = lookupVnPlace(address);
  if (alias && isValidCoord(alias.lat, alias.lng)) {
    return alias;
  }

  const key = cacheKey(address);
  const cached = await lookupCache(key);
  if (cached) return { ...cached, source: 'cache' };

  let hit = null;
  const queries = buildGeocodeQueries(address);
  try {
    for (const q of queries) {
      hit = await geocodeGoogle(q);
      if (hit) break;
      hit = await geocodeNominatim(q);
      if (hit) break;
    }
  } catch {
    hit = null;
  }
  if (!hit) return null;

  await saveCache(key, hit);
  return hit;
}

/** Race với timeout — dùng trong handler để không chặn quá lâu. */
function forwardGeocodeWithTimeout(input, maxMs = 3500) {
  return Promise.race([
    forwardGeocode(input),
    new Promise((resolve) => setTimeout(() => resolve(null), maxMs)),
  ]);
}

module.exports = {
  forwardGeocode,
  forwardGeocodeWithTimeout,
  extractLatLngFromMapUrl,
};
