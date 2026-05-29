/**
 * Tự phát hiện phiên bản mới (chống browser cache HTML/JS cũ).
 *
 * Cơ chế:
 *  1. Vite inject `__APP_VERSION__` (timestamp build) vào bundle JS.
 *  2. Vite plugin emit `dist/version.json` chứa version tương ứng.
 *  3. Frontend poll `/version.json` mỗi POLL_MS — nếu khác `__APP_VERSION__`
 *     đã build → có phiên bản mới đang được serve.
 *
 * Khi phát hiện:
 *  - Lần đầu: chỉ trả `true` (caller hiện banner).
 *  - User bấm cập nhật: gọi `forceReload()` xoá Service Worker, Cache Storage,
 *    rồi `location.reload()` — bypass cache HTML cứng đầu trên Firefox/Safari.
 */

const POLL_MS = 60_000;
const VERSION_URL = '/version.json';

const CURRENT_VERSION = (() => {
  try {
    if (typeof __APP_VERSION__ !== 'undefined') return String(__APP_VERSION__);
  } catch { /* noop */ }
  if (typeof window !== 'undefined' && window.__APP_VERSION__) return String(window.__APP_VERSION__);
  return '';
})();

if (typeof window !== 'undefined') {
  window.__APP_VERSION__ = CURRENT_VERSION;
}

let timer = null;
let lastRemoteVersion = CURRENT_VERSION;
const listeners = new Set();

async function fetchRemoteVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?_=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return String(json?.version || '');
  } catch {
    return null;
  }
}

function notify(remote) {
  listeners.forEach((cb) => {
    try { cb({ current: CURRENT_VERSION, remote }); } catch { /* noop */ }
  });
}

async function tick() {
  const remote = await fetchRemoteVersion();
  if (!remote) return;
  if (!CURRENT_VERSION) return; // dev mode — bỏ qua
  if (remote !== CURRENT_VERSION && remote !== lastRemoteVersion) {
    lastRemoteVersion = remote;
    notify(remote);
  }
}

export function startAppVersionWatcher() {
  if (timer != null) return;
  if (typeof window === 'undefined') return;
  // Lần đầu sau 5s, sau đó chu kỳ POLL_MS.
  setTimeout(tick, 5_000);
  timer = setInterval(tick, POLL_MS);
  window.addEventListener('focus', tick);
}

export function stopAppVersionWatcher() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

export function onNewAppVersion(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Force reload — xoá toàn bộ Service Worker + Cache Storage rồi reload trang.
 * Bypass cả các trình duyệt vẫn giữ HTML cũ (Firefox aggressive cache, Safari ITP).
 */
export async function forceReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => null)));
    }
  } catch { /* noop */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => null)));
    }
  } catch { /* noop */ }
  // Cache busting query param — buộc CDN/browser fetch lại HTML.
  const url = new URL(window.location.href);
  url.searchParams.set('_v', String(Date.now()));
  window.location.replace(url.toString());
}

export { CURRENT_VERSION };
