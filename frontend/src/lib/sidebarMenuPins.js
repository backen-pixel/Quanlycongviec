import api from './api';

const LS_KEY_PREFIX = 'sidebar_menu_pins_v1';

function storageKey(userId) {
  return `${LS_KEY_PREFIX}_${userId || 'guest'}`;
}

function normalizePinsMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [mod, arr] of Object.entries(raw)) {
    if (!Array.isArray(arr)) continue;
    const keys = [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))];
    if (keys.length) out[String(mod)] = keys;
  }
  return out;
}

function mapHasPins(map) {
  return Object.values(map || {}).some((arr) => Array.isArray(arr) && arr.length > 0);
}

export function readAllLocalMenuPins(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? normalizePinsMap(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeAllLocalMenuPins(userId, pins) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(normalizePinsMap(pins)));
  } catch { /* ignore */ }
}

export function readModuleLocalMenuPins(moduleScope, userId) {
  const all = readAllLocalMenuPins(userId);
  return Array.isArray(all[moduleScope]) ? all[moduleScope] : [];
}

let putTimer = null;
let pendingPut = null;

function scheduleServerSave(userId, allPins) {
  if (!userId) return;
  pendingPut = { userId, allPins: normalizePinsMap(allPins) };
  if (putTimer) clearTimeout(putTimer);
  putTimer = setTimeout(async () => {
    const payload = pendingPut;
    pendingPut = null;
    putTimer = null;
    if (!payload?.userId) return;
    try {
      await api.put('/users/sidebar-menu-pins', payload.allPins);
    } catch (e) {
      console.warn('[sidebar-menu-pins] sync failed:', e?.response?.data?.error || e.message);
    }
  }, 500);
}

/** Lưu local ngay + đẩy server (debounce) — dùng khi user bấm ghim/bỏ ghim */
export function saveModuleMenuPins(moduleScope, userId, keys) {
  const all = readAllLocalMenuPins(userId);
  const nextKeys = [...new Set((keys || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (nextKeys.length) all[moduleScope] = nextKeys;
  else delete all[moduleScope];
  writeAllLocalMenuPins(userId, all);
  scheduleServerSave(userId, all);
  return nextKeys;
}

/**
 * Tải ghim từ server khi đăng nhập / reload.
 * Nếu server trống mà local có dữ liệu → migrate local lên server (máy cũ).
 */
export async function syncMenuPinsFromServer(userId) {
  if (!userId) return readAllLocalMenuPins(null);
  try {
    const { data } = await api.get('/users/sidebar-menu-pins');
    const server = normalizePinsMap(data);
    const local = normalizePinsMap(readAllLocalMenuPins(userId));

    if (!mapHasPins(server) && mapHasPins(local)) {
      writeAllLocalMenuPins(userId, local);
      try {
        await api.put('/users/sidebar-menu-pins', local);
      } catch (e) {
        console.warn('[sidebar-menu-pins] migrate failed:', e?.response?.data?.error || e.message);
      }
      return local;
    }

    writeAllLocalMenuPins(userId, server);
    return server;
  } catch (e) {
    console.warn('[sidebar-menu-pins] fetch failed:', e?.response?.data?.error || e.message);
    return readAllLocalMenuPins(userId);
  }
}
