const LEGACY_STORAGE_KEY = 'supabase_monitor_token';
const LEGACY_EXP_KEY = 'supabase_monitor_exp';
const UNLOCK_EVENT = 'supabase-monitor-unlock';
const LOCK_EVENT = 'supabase-monitor-lock';

/** Token chỉ trong RAM — reload hoặc rời trang giám sát = nhập lại mật khẩu. */
let cachedToken = null;

function tokenExpiresAt(token) {
  const exp = Number(String(token || '').split('.')[0]);
  return Number.isFinite(exp) && exp > 0 ? exp : 0;
}

function isTokenValid(token) {
  if (!token) return false;
  const exp = tokenExpiresAt(token);
  return exp > 0 && Date.now() <= exp;
}

function purgeLegacyStorage() {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_EXP_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch { /* ignore */ }
}

purgeLegacyStorage();

export function getSupabaseMonitorToken() {
  if (isTokenValid(cachedToken)) return cachedToken;
  cachedToken = null;
  return null;
}

export function setSupabaseMonitorToken(token) {
  if (!token || !isTokenValid(token)) return;
  cachedToken = token;
  purgeLegacyStorage();
  try {
    window.dispatchEvent(new Event(UNLOCK_EVENT));
  } catch { /* ignore */ }
}

export function clearSupabaseMonitorToken() {
  cachedToken = null;
  purgeLegacyStorage();
  try {
    window.dispatchEvent(new Event(LOCK_EVENT));
  } catch { /* ignore */ }
}

export function isSupabaseMonitorUnlocked() {
  return !!getSupabaseMonitorToken();
}

export const SUPABASE_MONITOR_UNLOCK_EVENT = UNLOCK_EVENT;
export const SUPABASE_MONITOR_LOCK_EVENT = LOCK_EVENT;
