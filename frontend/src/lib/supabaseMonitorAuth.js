const STORAGE_KEY = 'supabase_monitor_token';
const STORAGE_EXP_KEY = 'supabase_monitor_exp';

export function getSupabaseMonitorToken() {
  try {
    const token = sessionStorage.getItem(STORAGE_KEY);
    const exp = Number(sessionStorage.getItem(STORAGE_EXP_KEY) || 0);
    if (!token || !exp || Date.now() > exp) {
      clearSupabaseMonitorToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setSupabaseMonitorToken(token, expiresInMs = 12 * 60 * 60 * 1000) {
  sessionStorage.setItem(STORAGE_KEY, token);
  sessionStorage.setItem(STORAGE_EXP_KEY, String(Date.now() + expiresInMs));
}

export function clearSupabaseMonitorToken() {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_EXP_KEY);
}

export function isSupabaseMonitorUnlocked() {
  return !!getSupabaseMonitorToken();
}
