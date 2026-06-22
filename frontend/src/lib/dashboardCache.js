/**
 * Cache cho Dashboard chính — stale-while-revalidate.
 * Hiển thị ngay dữ liệu đã lưu khi mở lại tab / chuyển khối, sau đó refresh ngầm.
 */

const STORAGE_KEY = 'main-dashboard-cache:v1';
const HARD_EXPIRY_MS = 30 * 60 * 1000;
const VERY_FRESH_MS = 30 * 1000;

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function pruneExpired(store) {
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(store)) {
    const entry = store[k];
    if (!entry || typeof entry.savedAt !== 'number' || now - entry.savedAt > HARD_EXPIRY_MS) {
      delete store[k];
      changed = true;
    }
  }
  return changed;
}

/** Key: khối + bộ lọc ngày/công ty */
export function buildDashboardCacheKey(opts = {}) {
  const {
    selectedDiv = '',
    dateFrom = '',
    dateTo = '',
    companyId = '',
  } = opts;
  return [
    String(selectedDiv || 'main'),
    String(dateFrom || ''),
    String(dateTo || ''),
    String(companyId || ''),
  ].join('|');
}

export function getDashboardCache(key) {
  if (!key) return null;
  const store = readStore();
  const entry = store[key];
  if (!entry || typeof entry.savedAt !== 'number') return null;
  const age = Date.now() - entry.savedAt;
  if (age > HARD_EXPIRY_MS) {
    delete store[key];
    writeStore(store);
    return null;
  }
  return {
    data: entry.data,
    savedAt: entry.savedAt,
    age,
    isVeryFresh: age < VERY_FRESH_MS,
  };
}

export function saveDashboardCache(key, payload) {
  if (!key || !payload) return;
  try {
    const store = readStore();
    pruneExpired(store);
    const keys = Object.keys(store).sort((a, b) => (store[b].savedAt || 0) - (store[a].savedAt || 0));
    while (keys.length >= 6) {
      const drop = keys.pop();
      delete store[drop];
    }
    store[key] = { savedAt: Date.now(), data: payload };
    writeStore(store);
  } catch {
    /* ignore */
  }
}

export function clearDashboardCache() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
