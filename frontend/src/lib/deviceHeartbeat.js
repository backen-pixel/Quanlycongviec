/**
 * Device heartbeat (web): nhận biết user đang đăng nhập trên trình duyệt nào.
 * Gửi POST /devices/ping định kỳ — server giữ bảng `user_devices`.
 */
import api from './api';

const DEVICE_ID_KEY = 'crm_device_id_v1';

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

export function sendDevicePing(opts = {}) {
  const { isLogin = false } = opts;
  const ua = window.navigator?.userAgent || '';
  const payload = {
    device_id: getOrCreateDeviceId(),
    platform: 'web',
    device_name: detectDeviceName(),
    os_name: detectOsName(ua),
    app_version: window.__APP_VERSION__ || undefined,
    is_login: isLogin,
  };
  return api.post('/devices/ping', payload).catch((err) => {
    warnMissingTable(err);
  });
}
