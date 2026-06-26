import axios from 'axios';
import { resolveApiOrigin } from './apiOrigin';
import { disconnectSocket } from './socket';
import { resetClientSessionState } from './sessionReset';
import { getSupabaseMonitorToken, clearSupabaseMonitorToken } from './supabaseMonitorAuth';
import { getCachedActivityContext } from './deviceHeartbeat';

const API_URL = resolveApiOrigin();

const api = axios.create({ baseURL: API_URL + '/api' });

function attachActivityContext(config) {
  try {
    if (typeof window === 'undefined') return config;
    const ctx = getCachedActivityContext();
    const method = String(config.method || 'get').toLowerCase();
    if (method === 'get' || method === 'delete') {
      config.params = {
        ...(config.params || {}),
        device_id: ctx.device_id,
        device_name: ctx.device_name,
        ...(ctx.geo_lat != null ? { geo_lat: ctx.geo_lat, geo_lng: ctx.geo_lng } : {}),
      };
      return config;
    }
    const data = config.data;
    if (data instanceof FormData) {
      if (ctx.device_id) data.set('device_id', ctx.device_id);
      if (ctx.device_name) data.set('device_name', ctx.device_name);
      if (ctx.geo_lat != null) {
        data.set('geo_lat', String(ctx.geo_lat));
        data.set('geo_lng', String(ctx.geo_lng));
      }
      return config;
    }
    const body = data && typeof data === 'object' ? { ...data } : {};
    config.data = {
      ...body,
      device_id: ctx.device_id,
      device_name: ctx.device_name,
      ...(ctx.geo_lat != null ? { geo_lat: ctx.geo_lat, geo_lng: ctx.geo_lng } : {}),
    };
  } catch {
    /* không chặn request nếu đọc thiết bị/vị trí lỗi */
  }
  return config;
}

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  const url = String(c.url || '');
  if (url.includes('/production/backup-sync') || url.includes('/user-activity')) {
    attachActivityContext(c);
  }
  if (url.includes('/production/backup-sync') && !url.endsWith('/unlock')) {
    try {
      const mt = getSupabaseMonitorToken();
      if (mt) {
        c.headers['X-Supabase-Monitor-Token'] = mt;
      }
    } catch { /* ignore */ }
  }
  return c;
});

api.interceptors.response.use(r => r, (err) => {
  if (err.response?.status === 403 && err.response?.data?.code === 'MONITOR_LOCKED') {
    const sent = err.config?.headers?.['X-Supabase-Monitor-Token'];
    if (sent) clearSupabaseMonitorToken();
  }
  const url = String(err.config?.url || '');
  const isMonitorUnlock = url.includes('/production/backup-sync/unlock');
  const isMonitorPasswordFail = err.response?.data?.code === 'MONITOR_PASSWORD_INVALID';
  if (err.response?.status === 401 && !isMonitorUnlock && !isMonitorPasswordFail) {
    const code = err.response?.data?.code;
    const isMidnight = code === 'session_expired_midnight'
      || localStorage.getItem('logoutReason') === 'midnight';
    disconnectSocket();
    resetClientSessionState();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('logoutReason');
    window.location.href = isMidnight ? '/login?reason=midnight' : '/login';
  }
  return Promise.reject(err);
});

const inflight = new Map();
const cache = new Map();

function buildKey(url, params) {
  if (!params) return url;
  try {
    const keys = Object.keys(params).sort();
    const norm = keys.map((k) => `${k}=${params[k]}`).join('&');
    return `${url}?${norm}`;
  } catch {
    return url;
  }
}

/**
 * GET with in-memory cache + in-flight dedupe.
 * Use for read-heavy, slow-changing endpoints (lookups, taxonomies, settings).
 *
 *   apiGet('/ecosystem/my-module-access', null, { ttl: 60_000 })
 *
 * Options:
 *  - ttl: cache lifetime in ms (default 30_000). 0 disables cache (still dedupes).
 *  - force: bypass cache (re-fetch).
 */
export function apiGet(url, params, { ttl = 30_000, force = false } = {}) {
  const key = buildKey(url, params);
  const now = Date.now();
  if (!force && ttl > 0) {
    const hit = cache.get(key);
    if (hit && hit.expires > now) return Promise.resolve(hit.value);
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = api.get(url, { params }).then((res) => {
    if (ttl > 0) cache.set(key, { value: res, expires: Date.now() + ttl });
    inflight.delete(key);
    return res;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });
  inflight.set(key, p);
  return p;
}

export function invalidateApiCache(prefix) {
  if (!prefix) { cache.clear(); return; }
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

export default api;
