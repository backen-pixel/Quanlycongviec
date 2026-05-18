/**
 * In-process TTL cache for slow-changing taxonomy / lookup data.
 *
 *   const cache = createTTLCache({ ttlMs: 90_000 });
 *   const data = await cache.getOrFetch('all-stages', () => loadStages());
 *
 * - Single-flight: concurrent misses share one Promise.
 * - Negative caching: errors are NOT cached (caller retries on next request).
 * - LRU-ish: caps `maxEntries` to bound memory in case of dynamic keys.
 */
function createTTLCache({ ttlMs = 60_000, maxEntries = 200 } = {}) {
  const store = new Map();
  const inflight = new Map();

  function evictIfFull() {
    if (store.size <= maxEntries) return;
    const overflow = store.size - maxEntries;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= overflow) break;
      store.delete(k);
    }
  }

  return {
    async getOrFetch(key, fetcher, ttlOverride) {
      const now = Date.now();
      const hit = store.get(key);
      if (hit && hit.expires > now) return hit.value;
      if (inflight.has(key)) return inflight.get(key);

      const p = Promise.resolve().then(fetcher).then((value) => {
        store.set(key, { value, expires: Date.now() + (ttlOverride || ttlMs) });
        evictIfFull();
        inflight.delete(key);
        return value;
      }).catch((err) => {
        inflight.delete(key);
        throw err;
      });
      inflight.set(key, p);
      return p;
    },
    invalidate(prefix) {
      if (!prefix) { store.clear(); return; }
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    },
    size() { return store.size; },
  };
}

const lookupCache = createTTLCache({ ttlMs: 90_000 });

module.exports = { createTTLCache, lookupCache };
