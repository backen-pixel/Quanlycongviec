import api from './api';
import { publicFileUrl } from './publicFileUrl';

let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/**
 * Cấu hình nhạc chuông mặc định toàn hệ thống (admin upload lên server).
 * @returns {Promise<{ url: string, fileName?: string, mime?: string, updatedAt?: string, playUrl: string } | null>}
 */
export async function fetchGlobalCallRingtoneConfig(force = false) {
  if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached;
  try {
    const { data } = await api.get('/settings/call-ringtone');
    if (!data?.url) {
      cached = null;
      cachedAt = Date.now();
      return null;
    }
    const playUrl = publicFileUrl(data.url);
    const v = data.updatedAt ? `?v=${encodeURIComponent(data.updatedAt)}` : '';
    cached = {
      ...data,
      playUrl: playUrl.includes('?') ? playUrl : `${playUrl}${v}`,
    };
    cachedAt = Date.now();
    return cached;
  } catch {
    return cached;
  }
}

export function getCachedGlobalCallRingtone() {
  return cached;
}

export function invalidateGlobalCallRingtoneCache() {
  cached = null;
  cachedAt = 0;
}
