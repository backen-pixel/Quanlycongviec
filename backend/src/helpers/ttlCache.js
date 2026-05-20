/**
 * Two-tier TTL cache for slow-changing taxonomy / lookup data.
 *
 *   const cache = createTTLCache({ ttlMs: 90_000, redisTtlMs: 10*60_000, redisPrefix: 'lookup:' });
 *   const data = await cache.getOrFetch('all-stages', () => loadStages());
 *
 * - L1: in-process Map (TTL ngắn, single-flight, bounded by maxEntries).
 * - L2: Redis (tuỳ chọn) — chia sẻ giữa các instance, TTL dài hơn.
 *   Khi không có Redis (REDIS_URL trống) → behave y hệt cache cũ chỉ-L1.
 * - Negative caching: lỗi KHÔNG được cache (caller retry ở request kế tiếp).
 * - Lookup flow: L1 → L2 → fetcher; ghi xuôi cả 2 tầng.
 */

const { getRedisIfReady } = require('../config/redis');

let _metrics = null;
function _inc(name) {
  if (_metrics === null) {
    try { _metrics = require('./requestMetrics'); } catch { _metrics = false; }
  }
  if (_metrics && typeof _metrics.incCacheCounter === 'function') {
    _metrics.incCacheCounter(name);
  }
}

function createTTLCache({
  ttlMs = 60_000,
  maxEntries = 200,
  redisTtlMs = 0,
  redisPrefix = '',
} = {}) {
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

  function _redisKey(key) {
    return `${redisPrefix}${key}`;
  }

  async function _readL2(key) {
    if (!redisPrefix || redisTtlMs <= 0) return undefined;
    const redis = getRedisIfReady();
    if (!redis) return undefined;
    try {
      const raw = await redis.get(_redisKey(key));
      if (raw == null) return undefined;
      try { return JSON.parse(raw); } catch { return undefined; }
    } catch (err) {
      _inc('l2_error');
      return undefined;
    }
  }

  async function _writeL2(key, value) {
    if (!redisPrefix || redisTtlMs <= 0) return;
    const redis = getRedisIfReady();
    if (!redis) return;
    try {
      const ttlSec = Math.max(1, Math.floor(redisTtlMs / 1000));
      await redis.set(_redisKey(key), JSON.stringify(value), 'EX', ttlSec);
    } catch (err) {
      _inc('l2_error');
    }
  }

  return {
    async getOrFetch(key, fetcher, ttlOverride) {
      const now = Date.now();
      const hit = store.get(key);
      if (hit && hit.expires > now) {
        _inc('l1_hit');
        return hit.value;
      }
      if (inflight.has(key)) return inflight.get(key);

      const p = (async () => {
        const l2 = await _readL2(key);
        if (l2 !== undefined) {
          _inc('l2_hit');
          store.set(key, { value: l2, expires: Date.now() + (ttlOverride || ttlMs) });
          evictIfFull();
          inflight.delete(key);
          return l2;
        }
        try {
          const value = await fetcher();
          _inc('miss');
          store.set(key, { value, expires: Date.now() + (ttlOverride || ttlMs) });
          evictIfFull();
          _writeL2(key, value).catch(() => {});
          return value;
        } finally {
          inflight.delete(key);
        }
      })().catch((err) => {
        inflight.delete(key);
        throw err;
      });

      inflight.set(key, p);
      return p;
    },

    /**
     * Xoá L1 theo prefix (hoặc tất cả nếu không truyền). KHÔNG đụng Redis.
     * Dùng cho invalidation cục bộ trong cùng instance.
     */
    invalidate(prefix) {
      if (!prefix) { store.clear(); return; }
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    },

    /**
     * Xoá cả L1 + L2 cho 1 key cụ thể (hoặc theo prefix qua SCAN).
     * `keyOrPrefix` không bao gồm `redisPrefix` (cache tự thêm vào).
     * Khi `isPrefix=true` → SCAN + UNLINK theo prefix.
     */
    async invalidateRemote(keyOrPrefix, { isPrefix = false } = {}) {
      if (!keyOrPrefix) {
        store.clear();
      } else if (isPrefix) {
        for (const k of [...store.keys()]) {
          if (k.startsWith(keyOrPrefix)) store.delete(k);
        }
      } else {
        store.delete(keyOrPrefix);
      }

      if (!redisPrefix) return;
      const redis = getRedisIfReady();
      if (!redis) return;
      try {
        if (!keyOrPrefix) {
          // Quét tất cả key có redisPrefix của cache này
          await _scanUnlink(redis, `${redisPrefix}*`);
        } else if (isPrefix) {
          await _scanUnlink(redis, `${redisPrefix}${keyOrPrefix}*`);
        } else {
          await redis.unlink(_redisKey(keyOrPrefix));
        }
      } catch (err) {
        _inc('l2_error');
      }
    },

    size() { return store.size; },
  };
}

async function _scanUnlink(redis, matchPattern) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', 200);
    cursor = next;
    if (keys && keys.length) {
      await redis.unlink(...keys);
    }
  } while (cursor !== '0');
}

const lookupCache = createTTLCache({
  ttlMs: 90_000,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'lookup:',
});

module.exports = { createTTLCache, lookupCache };
