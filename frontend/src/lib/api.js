import axios from 'axios';
import { resolveApiOrigin } from './apiOrigin';
import { disconnectSocket } from './socket';
import { resetClientSessionState } from './sessionReset';
import { getSupabaseMonitorToken, clearSupabaseMonitorToken } from './supabaseMonitorAuth';

const API_URL = resolveApiOrigin();

const api = axios.create({ baseURL: API_URL + '/api' });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  const url = String(c.url || '');
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
  if (err.response?.status === 401) {
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
