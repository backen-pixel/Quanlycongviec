import api from './api';
import { publicFileUrl } from './publicFileUrl';
import { resolveApiOrigin } from './apiOrigin';

/** File cố định trong build (`frontend/public/call-ringtone.wav`) — fallback khi server chưa có. */
export const BUNDLED_CALL_RING_URL = '/call-ringtone.wav';

let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

function buildPlayUrl(data) {
  if (!data) return null;
  if (data.playUrl) {
    const u = String(data.playUrl);
    const v = data.updatedAt ? `?v=${encodeURIComponent(data.updatedAt)}` : '';
    return u.includes('?') ? u : `${u}${v}`;
  }
  const raw = data.publicUrl || data.url;
  if (!raw) return null;
  if (/^https?:\/\//i.test(String(raw))) {
    const u = String(raw);
    const v = data.updatedAt ? `?v=${encodeURIComponent(data.updatedAt)}` : '';
    return u.includes('?') ? u : `${u}${v}`;
  }
  const base = resolveApiOrigin()
    || (typeof window !== 'undefined' ? window.location.origin : '');
  const path = String(raw).startsWith('/') ? raw : `/${raw}`;
  const full = base ? `${base.replace(/\/$/, '')}${path}` : publicFileUrl(path);
  const v = data.updatedAt ? `?v=${encodeURIComponent(data.updatedAt)}` : '';
  return full.includes('?') ? full : `${full}${v}`;
}

/**
 * Cấu hình nhạc chuông mặc định toàn hệ thống (admin upload lên server).
 * @returns {Promise<{ url: string, fileName?: string, mime?: string, updatedAt?: string, playUrl: string } | null>}
 */
export async function fetchGlobalCallRingtoneConfig(force = false) {
  if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached;
  try {
    const { data } = await api.get('/settings/call-ringtone');
    const playUrl = buildPlayUrl(data);
    if (!playUrl) {
      cached = null;
      cachedAt = Date.now();
      return null;
    }
    cached = { ...data, playUrl };
    cachedAt = Date.now();
    return cached;
  } catch {
    return cached;
  }
}

/** URL phát cuối cùng: server → file bundled trong app. */
export async function resolveSystemCallRingtonePlayUrl() {
  const g = await fetchGlobalCallRingtoneConfig();
  if (g?.playUrl) return g.playUrl;
  if (typeof window !== 'undefined') return BUNDLED_CALL_RING_URL;
  return null;
}

export function getCachedGlobalCallRingtone() {
  return cached;
}

export function invalidateGlobalCallRingtoneCache() {
  cached = null;
  cachedAt = 0;
}
