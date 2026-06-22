/** Cache phiên — duyệt lại thư mục Drive trong Messenger gần như tức thì. */
const locationCache = new Map();
const rootsCache = new Map();
const TTL_MS = 8 * 60 * 1000;

function isFresh(entry) {
  return entry && Date.now() - entry.ts < TTL_MS;
}

export function locationCacheKey(rootId, folderId) {
  return `${rootId}:${folderId || 'root'}`;
}

export function getCachedLocation(key) {
  const entry = locationCache.get(key);
  return isFresh(entry) ? entry.data : null;
}

export function setCachedLocation(key, data) {
  locationCache.set(key, { data, ts: Date.now() });
}

export function invalidateLocation(key) {
  locationCache.delete(key);
}

export function getCachedRoots(companyId) {
  const key = companyId || '_all';
  const entry = rootsCache.get(key);
  return isFresh(entry) ? entry.data : null;
}

export function setCachedRoots(companyId, data) {
  const key = companyId || '_all';
  rootsCache.set(key, { data, ts: Date.now() });
}

export function clearMessengerDriveCache() {
  locationCache.clear();
  rootsCache.clear();
}
