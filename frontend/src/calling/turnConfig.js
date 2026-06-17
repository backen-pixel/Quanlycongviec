/**
 * Data — lấy ICE servers (STUN + TURN ephemeral) từ backend (GET /api/turn/credentials).
 * Cache theo TTL; fallback STUN nếu lỗi.
 */
import api from '../lib/api';
import { FALLBACK_ICE_SERVERS } from './callState';

let cache = null; // { iceServers, expiresAt }

export async function getIceServers() {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) return cache.iceServers;
  try {
    const { data } = await api.get('/turn/credentials');
    const iceServers = Array.isArray(data?.iceServers) && data.iceServers.length
      ? data.iceServers : FALLBACK_ICE_SERVERS;
    const ttlMs = Math.max(60_000, Number(data?.ttl || 86400) * 1000);
    cache = { iceServers, expiresAt: now + ttlMs };
    return iceServers;
  } catch {
    return cache?.iceServers || FALLBACK_ICE_SERVERS;
  }
}
