/**
 * Data layer — lấy ICE servers (STUN + TURN ephemeral) từ backend.
 * GET /api/turn/credentials → { iceServers, ttl }.
 * Cache theo TTL để không gọi lại mỗi cuộc gọi; fallback STUN nếu lỗi.
 */
import { api } from '../api/client';
import { FALLBACK_ICE_SERVERS } from './types';

type IceServer = { urls: string | string[]; username?: string; credential?: string };

let cache: { iceServers: IceServer[]; expiresAt: number } | null = null;

export async function getIceServers(): Promise<IceServer[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) return cache.iceServers;
  try {
    const { data } = await api.get<{ iceServers: IceServer[]; ttl?: number }>('/turn/credentials');
    const iceServers = Array.isArray(data?.iceServers) && data.iceServers.length
      ? data.iceServers
      : FALLBACK_ICE_SERVERS;
    const ttlMs = Math.max(60_000, Number(data?.ttl || 86400) * 1000);
    cache = { iceServers, expiresAt: now + ttlMs };
    return iceServers;
  } catch {
    // Mất mạng/endpoint lỗi → vẫn cho gọi với STUN (P2P trong cùng mạng vẫn chạy).
    return cache?.iceServers || FALLBACK_ICE_SERVERS;
  }
}

export function clearIceCache() {
  cache = null;
}
