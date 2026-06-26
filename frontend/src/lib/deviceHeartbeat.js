/**
 * Device heartbeat (web): nhận biết user đang đăng nhập trên trình duyệt nào.
 * Gửi POST /devices/ping định kỳ — server giữ bảng `user_devices`.
 */
import api from './api';

const DEVICE_ID_KEY = 'crm_device_id_v1';
const GEO_CACHE_KEY = 'crm_geo_cache_v1';
/**
 * Cache GPS ngắn (90s) để vị trí trên bản đồ luôn tươi mới.
 * Mỗi lần ping (60s) sẽ thử dùng cache; sau 90s sẽ xin lại từ trình duyệt.
 */
const GEO_CACHE_TTL_MS = 90 * 1000;

function randomId() {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `web-${Date.now().toString(36)}-${rand()}${rand()}`;
}

export function getOrCreateDeviceId() {
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.length >= 6) return stored;
    const fresh = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

function detectBrowserName(ua) {
  const u = ua.toLowerCase();
  if (u.includes('edg/')) return 'Edge';
  if (u.includes('opr/') || u.includes('opera')) return 'Opera';
  if (u.includes('chrome/') && !u.includes('chromium/')) return 'Chrome';
  if (u.includes('firefox/')) return 'Firefox';
  if (u.includes('safari/')) return 'Safari';
  return 'Browser';
}

function detectOsName(ua) {
  const u = ua.toLowerCase();
  if (u.includes('windows')) return 'Windows';
  if (u.includes('mac os x') || u.includes('macintosh')) return 'macOS';
  if (u.includes('android')) return 'Android';
  if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) return 'iOS';
  if (u.includes('linux')) return 'Linux';
  return 'Unknown';
}

function detectDeviceName() {
  const ua = window.navigator?.userAgent || '';
  return `${detectBrowserName(ua)} · ${detectOsName(ua)}`;
}

/**
 * Coi (0, 0) và vùng Null Island là toạ độ không hợp lệ — thiết bị mô phỏng
 * hoặc API định vị trả về giá trị mặc định khi không lấy được vị trí thật.
 */
export function isValidCoord(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false;
  return true;
}

function readGeoCache() {
  try {
    const raw = window.localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const x = JSON.parse(raw);
    if (!x || typeof x !== 'object') return null;
    const lat = Number(x.lat);
    const lng = Number(x.lng);
    const at = Number(x.at);
    if (!isValidCoord(lat, lng) || !Number.isFinite(at)) return null;
    return { lat, lng, at };
  } catch {
    return null;
  }
}

function writeGeoCache(lat, lng) {
  try {
    window.localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ lat, lng, at: Date.now() }));
  } catch {
    // ignore
  }
}

function detectWebNetwork() {
  const conn = window.navigator?.connection || window.navigator?.mozConnection || window.navigator?.webkitConnection;
  const type = conn?.type || conn?.effectiveType || null;
  return {
    network_type: type || undefined,
    network_name: conn?.type === 'wifi' ? 'WiFi (web)' : undefined,
  };
}

export async function getGeolocationPermissionState() {
  if (!window.navigator?.permissions?.query) return 'unknown';
  try {
    const p = await window.navigator.permissions.query({ name: 'geolocation' });
    return p.state;
  } catch {
    return 'unknown';
  }
}

/** Gọi getCurrentPosition để kích hoạt prompt trình duyệt (dùng từ banner cấp quyền). */
export function requestBrowserGeolocation() {
  if (!window.navigator?.geolocation) {
    return Promise.reject(new Error('Trình duyệt không hỗ trợ định vị'));
  }
  return new Promise((resolve, reject) => {
    window.navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
    );
  });
}

async function getGeoMeta() {
  if (!window.navigator?.geolocation) return {};
  const cached = readGeoCache();
  if (cached && Date.now() - cached.at < GEO_CACHE_TTL_MS) {
    return { geo_lat: cached.lat, geo_lng: cached.lng };
  }
  try {
    if (window.navigator.permissions?.query) {
      const p = await window.navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'denied') return {};
      if (p.state !== 'granted') return {};
    }
  } catch {
    /* không có Permissions API — vẫn thử getCurrentPosition */
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    window.navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);
        if (!isValidCoord(lat, lng)) return finish({});
        writeGeoCache(lat, lng);
        finish({ geo_lat: lat, geo_lng: lng });
      },
      () => finish({}),
      { enableHighAccuracy: false, timeout: 4500, maximumAge: 60000 },
    );
  });
}

let warned = false;
function warnMissingTable(err) {
  if (warned) return;
  const status = err?.response?.status;
  const msg = err?.response?.data?.error || '';
  if (status === 503 || /user_devices|migration/i.test(msg)) {
    warned = true;
    console.warn('[device-heartbeat] Cần chạy migration database/205_user_devices.sql');
  }
}

export async function getActivityContext(opts = {}) {
  const { forceGeo = false } = opts;
  const ua = window.navigator?.userAgent || '';
  const base = {
    device_id: getOrCreateDeviceId(),
    device_name: detectDeviceName(),
    platform: 'web',
    os_name: detectOsName(ua),
  };
  let geo = readGeoCache();
  if (geo && Date.now() - geo.at < GEO_CACHE_TTL_MS && isValidCoord(geo.lat, geo.lng)) {
    return { ...base, geo_lat: geo.lat, geo_lng: geo.lng };
  }
  if (forceGeo) {
    try {
      const pos = await requestBrowserGeolocation();
      const lat = Number(pos?.coords?.latitude);
      const lng = Number(pos?.coords?.longitude);
      if (isValidCoord(lat, lng)) {
        writeGeoCache(lat, lng);
        return { ...base, geo_lat: lat, geo_lng: lng };
      }
    } catch {
      /* fall through */
    }
  }
  const geoMeta = await getGeoMeta();
  return { ...base, ...geoMeta };
}

/** Đọc nhanh từ cache (không chờ GPS) — dùng cho batch activity log. */
export function getCachedActivityContext() {
  const ua = window.navigator?.userAgent || '';
  const cached = readGeoCache();
  const geo =
    cached && Date.now() - cached.at < GEO_CACHE_TTL_MS && isValidCoord(cached.lat, cached.lng)
      ? { geo_lat: cached.lat, geo_lng: cached.lng }
      : {};
  return {
    device_id: getOrCreateDeviceId(),
    device_name: detectDeviceName(),
    platform: 'web',
    os_name: detectOsName(ua),
    ...geo,
  };
}

export async function sendDevicePing(opts = {}) {
  const { isLogin = false, forceGeo = false } = opts;
  const ua = window.navigator?.userAgent || '';
  let geoMeta = {};
  if (forceGeo) {
    try {
      const pos = await requestBrowserGeolocation();
      const lat = Number(pos?.coords?.latitude);
      const lng = Number(pos?.coords?.longitude);
      if (isValidCoord(lat, lng)) {
        writeGeoCache(lat, lng);
        geoMeta = { geo_lat: lat, geo_lng: lng };
      }
    } catch {
      geoMeta = await getGeoMeta();
    }
  } else {
    geoMeta = await getGeoMeta();
  }
  const networkMeta = detectWebNetwork();
  const payload = {
    device_id: getOrCreateDeviceId(),
    platform: 'web',
    device_name: detectDeviceName(),
    os_name: detectOsName(ua),
    app_version: window.__APP_VERSION__ || undefined,
    network_type: networkMeta.network_type,
    network_name: networkMeta.network_name,
    geo_lat: geoMeta.geo_lat,
    geo_lng: geoMeta.geo_lng,
    is_login: isLogin,
  };
  return api.post('/devices/ping', payload).catch((err) => {
    warnMissingTable(err);
  });
}
