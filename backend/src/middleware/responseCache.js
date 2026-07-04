/**
 * Response cache middleware — L1 in-process + L2 Redis, ETag/304, tag invalidation.
 *
 *   r.get('/x', responseCache({ ttl: 60, scope: 'user', tags: ['notifications'] }), handler);
 *   await invalidateTags(['notifications', `notifications:${userId}`]);
 */

const crypto = require('crypto');
const config = require('../config');
const { getRedisIfReady } = require('../config/redis');

const L1_MAX = 2000;
const L1 = new Map(); // key -> { entry, expires }
const tagIndex = new Map(); // tag -> Set<key>

let _metrics = null;
function _inc(name) {
  if (_metrics === null) {
    try { _metrics = require('../helpers/requestMetrics'); } catch { _metrics = false; }
  }
  if (_metrics && typeof _metrics.incCacheCounter === 'function') {
    _metrics.incCacheCounter(name);
  }
}

function isDisabled() {
  return config.responseCacheDisabled || process.env.RESPONSE_CACHE_DISABLED === '1';
}

function computeEtag(bodyStr) {
  return `"${crypto.createHash('sha1').update(bodyStr).digest('hex')}"`;
}

function resolveScopeKey(req, scope) {
  const u = req.user || {};
  switch (scope) {
    case 'user':
      return u.userId || u.id ? `u:${u.userId || u.id}` : null;
    case 'role':
      return u.role ? `r:${u.role}` : null;
    case 'company':
      if (req.tenantContext?.enforced && u.tenant_id) return `t:${u.tenant_id}`;
      return u.company_id ? `c:${u.company_id}` : (u.userId ? `u:${u.userId}` : null);
    case 'global':
      return 'g';
    default:
      return u.userId || u.id ? `u:${u.userId || u.id}` : 'g';
  }
}

function buildCacheKey(req, scope) {
  const scopeKey = resolveScopeKey(req, scope);
  if (!scopeKey) return null;
  const path = (req.baseUrl || '') + (req.path || '');
  const qs = Object.keys(req.query || {})
    .sort()
    .map((k) => `${k}=${String(req.query[k])}`)
    .join('&');
  return `${scopeKey}:${req.method}:${path}:${qs}`;
}

function l1EvictIfFull() {
  if (L1.size <= L1_MAX) return;
  const overflow = L1.size - L1_MAX;
  let i = 0;
  for (const k of L1.keys()) {
    if (i++ >= overflow) break;
    L1.delete(k);
  }
}

function l1TagAdd(tag, key) {
  if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
  tagIndex.get(tag).add(key);
}

function l1TagRemoveKey(key) {
  for (const [, keys] of tagIndex) {
    keys.delete(key);
  }
}

async function readCache(key) {
  const now = Date.now();
  const l1 = L1.get(key);
  if (l1 && l1.expires > now) {
    _inc('l1_hit');
    _inc('rc_hit');
    return l1.entry;
  }
  if (l1) L1.delete(key);

  const redis = getRedisIfReady();
  if (!redis) return null;
  try {
    const raw = await redis.get(`rc:data:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.expires <= now) {
      await redis.unlink(`rc:data:${key}`);
      return null;
    }
    L1.set(key, { entry: parsed.entry, expires: parsed.expires });
    l1EvictIfFull();
    _inc('l2_hit');
    _inc('rc_hit');
    return parsed.entry;
  } catch {
    _inc('l2_error');
    return null;
  }
}

async function writeCache(key, entry, tags, ttlSec) {
  const expires = Date.now() + ttlSec * 1000;
  L1.set(key, { entry, expires });
  l1EvictIfFull();
  for (const tag of tags) {
    l1TagAdd(tag, key);
  }

  const redis = getRedisIfReady();
  if (!redis) return;
  try {
    await redis.set(`rc:data:${key}`, JSON.stringify({ entry, expires }), 'EX', ttlSec + 60);
    for (const tag of tags) {
      await redis.sadd(`rc:tag:${tag}`, key);
      await redis.expire(`rc:tag:${tag}`, ttlSec + 3600);
    }
  } catch {
    _inc('l2_error');
  }
}

async function deleteCacheKey(key) {
  L1.delete(key);
  l1TagRemoveKey(key);
  const redis = getRedisIfReady();
  if (redis) {
    try { await redis.unlink(`rc:data:${key}`); } catch { _inc('l2_error'); }
  }
}

/**
 * Xoá cache theo tag(s). Hỗ trợ tag scoped per-user: `notifications:${userId}`.
 */
async function invalidateTags(tags) {
  if (!tags || !tags.length) return;
  const keysToDelete = new Set();

  for (const tag of tags) {
    const l1Keys = tagIndex.get(tag);
    if (l1Keys) {
      for (const k of l1Keys) keysToDelete.add(k);
      tagIndex.delete(tag);
    }
    const redis = getRedisIfReady();
    if (redis) {
      try {
        const members = await redis.smembers(`rc:tag:${tag}`);
        for (const k of members) keysToDelete.add(k);
        await redis.unlink(`rc:tag:${tag}`);
      } catch {
        _inc('l2_error');
      }
    }
  }

  await Promise.all([...keysToDelete].map((k) => deleteCacheKey(k)));
}

function cacheControlHeader(scope, ttlSec) {
  return scope === 'global'
    ? `public, max-age=${ttlSec}`
    : `private, max-age=${ttlSec}`;
}

/**
 * Express middleware — cache GET responses.
 * @param {{ ttl?: number, scope?: 'user'|'role'|'company'|'global', tags?: string[] }} opts
 */
function responseCache(opts = {}) {
  const ttlSec = Math.max(1, Number(opts.ttl) || 60);
  const scope = opts.scope || 'user';
  const tags = Array.isArray(opts.tags) ? opts.tags : [];

  return async (req, res, next) => {
    if (isDisabled()) return next();
    if (req.method !== 'GET') return next();
    if (req.headers['x-no-cache']) return next();

    const key = buildCacheKey(req, scope);
    if (!key) return next();

    try {
      const cached = await readCache(key);
      if (cached) {
        res.set('ETag', cached.etag);
        res.set('Cache-Control', cacheControlHeader(scope, ttlSec));
        res.set('X-Cache', 'HIT');
        res.set('Age', String(Math.floor((Date.now() - cached.storedAt) / 1000)));
        if (cached.contentType) res.set('Content-Type', cached.contentType);

        const inm = req.headers['if-none-match'];
        if (inm && inm === cached.etag) {
          _inc('rc_304');
          return res.status(304).end();
        }
        return res.status(cached.status || 200).send(cached.body);
      }
    } catch {
      return next();
    }

    _inc('rc_miss');

    let stored = false;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const tryStore = (body, isJson) => {
      if (stored || res.statusCode >= 400) return;
      stored = true;
      const bodyStr = isJson
        ? JSON.stringify(body)
        : (typeof body === 'string' ? body : JSON.stringify(body));
      const etag = computeEtag(bodyStr);
      const entry = {
        status: res.statusCode || 200,
        body: bodyStr,
        etag,
        contentType: isJson
          ? 'application/json; charset=utf-8'
          : (res.getHeader('Content-Type') || 'text/plain; charset=utf-8'),
        storedAt: Date.now(),
      };
      const scopedTags = [...tags];
      if (scope === 'user') {
        const uid = req.user?.userId || req.user?.id;
        if (uid) scopedTags.push(`user:${uid}`);
      }
      void writeCache(key, entry, scopedTags, ttlSec);
      res.set('ETag', etag);
      res.set('Cache-Control', cacheControlHeader(scope, ttlSec));
      res.set('X-Cache', 'MISS');
    };

    res.json = (body) => {
      tryStore(body, true);
      return originalJson(body);
    };
    res.send = (body) => {
      tryStore(body, false);
      return originalSend(body);
    };

    next();
  };
}

module.exports = { responseCache, invalidateTags, buildCacheKey };
