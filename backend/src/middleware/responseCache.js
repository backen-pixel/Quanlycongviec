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

/**
 * Single-flight: khi cache trống mà nhiều request cùng key ập đến một lúc (ví dụ ngay sau
 * khi cache bị xoá), chỉ request ĐẦU TIÊN chạy handler thật; các request còn lại chờ rồi
 * dùng chung kết quả. Nếu không có, mỗi request đều tự chạy lại toàn bộ truy vấn nặng.
 */
const inflight = new Map(); // key -> { promise, resolve }
const INFLIGHT_MAX_WAIT_MS = 15_000;

function beginFlight(key) {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  inflight.set(key, { promise, resolve });
  return () => {
    const cur = inflight.get(key);
    if (cur && cur.resolve === resolve) inflight.delete(key);
    resolve();
  };
}

/** Chờ request dẫn đầu xong (có trần thời gian để không treo nếu nó chết giữa chừng). */
function waitForFlight(entry) {
  return Promise.race([
    entry.promise,
    new Promise((r) => setTimeout(r, INFLIGHT_MAX_WAIT_MS)),
  ]);
}

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

/**
 * MẶC ĐỊNH `no-cache`: trình duyệt được phép lưu nhưng phải hỏi lại server trước khi dùng.
 *
 * Lý do: cache này xoá theo tag khi có thay đổi (xem `invalidateTags`). Nếu gửi `max-age`,
 * trình duyệt sẽ tự phục vụ bản cũ trong local cache dù server đã xoá — người dùng sửa xong
 * tải lại vẫn thấy dữ liệu cũ tới hết TTL (có route TTL 300s = 5 phút). `no-cache` vẫn rất
 * rẻ vì đi kèm ETag: server trả 304 rỗng và đọc từ L1 trong bộ nhớ (~1ms).
 *
 * Chỉ đặt `revalidate: false` cho dữ liệu KHÔNG bao giờ cần thấy thay đổi ngay lập tức và
 * bị gọi dày hơn TTL — hiện chưa route nào rơi vào trường hợp này.
 */
function cacheControlHeader(scope, ttlSec, revalidate) {
  if (revalidate) return scope === 'global' ? 'public, no-cache' : 'private, no-cache';
  return scope === 'global'
    ? `public, max-age=${ttlSec}`
    : `private, max-age=${ttlSec}`;
}

/**
 * Express middleware — cache GET responses.
 * @param {{ ttl?: number, scope?: 'user'|'role'|'company'|'global', tags?: string[],
 *           revalidate?: boolean }} opts `revalidate` mặc định true — xem cacheControlHeader.
 */
function responseCache(opts = {}) {
  const ttlSec = Math.max(1, Number(opts.ttl) || 60);
  const scope = opts.scope || 'user';
  const tags = Array.isArray(opts.tags) ? opts.tags : [];
  const revalidate = opts.revalidate !== false;

  return async (req, res, next) => {
    if (isDisabled()) return next();
    if (req.method !== 'GET') return next();
    if (req.headers['x-no-cache']) return next();

    const key = buildCacheKey(req, scope);
    if (!key) return next();

    /** Trả response từ entry cache. `hitLabel` để phân biệt HIT thường và HIT nhờ chờ ghép. */
    const serveCached = (cached, hitLabel) => {
      res.set('ETag', cached.etag);
      res.set('Cache-Control', cacheControlHeader(scope, ttlSec, revalidate));
      res.set('X-Cache', hitLabel);
      res.set('Age', String(Math.floor((Date.now() - cached.storedAt) / 1000)));
      if (cached.contentType) res.set('Content-Type', cached.contentType);

      const inm = req.headers['if-none-match'];
      if (inm && inm === cached.etag) {
        _inc('rc_304');
        return res.status(304).end();
      }
      return res.status(cached.status || 200).send(cached.body);
    };

    try {
      const cached = await readCache(key);
      if (cached) return serveCached(cached, 'HIT');
    } catch {
      return next();
    }

    // Cache trống: nếu đã có request khác đang dựng đúng key này thì chờ dùng ké kết quả.
    const leader = inflight.get(key);
    if (leader) {
      await waitForFlight(leader);
      try {
        const cached = await readCache(key);
        if (cached) {
          _inc('rc_coalesced');
          return serveCached(cached, 'HIT-COALESCED');
        }
      } catch { /* rơi xuống chạy thật bên dưới */ }
      // Request dẫn đầu lỗi/hết giờ → tự chạy, không bắt client chờ thêm.
      return next();
    }

    const endFlight = beginFlight(key);
    // Lưới an toàn: giải phóng khi response kết thúc dù thành công hay lỗi/ngắt kết nối,
    // nếu không các request đang chờ sẽ treo tới hết INFLIGHT_MAX_WAIT_MS.
    // (Đường thành công giải phóng sớm hơn, ngay trong tryStore.)
    if (typeof res.on === 'function') {
      res.on('finish', endFlight);
      res.on('close', endFlight);
    }

    _inc('rc_miss');

    let stored = false;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const tryStore = (body, isJson) => {
      if (stored || res.statusCode >= 400) {
        // Lỗi → không cache, nhưng vẫn phải thả các request đang chờ ra ngay.
        if (!stored) endFlight();
        return;
      }
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
      // writeCache đặt L1 đồng bộ trước await đầu tiên → sau dòng này các request đang
      // chờ đọc cache là chắc chắn thấy, nên giải phóng single-flight được ngay tại đây.
      void writeCache(key, entry, scopedTags, ttlSec);
      endFlight();
      res.set('ETag', etag);
      res.set('Cache-Control', cacheControlHeader(scope, ttlSec, revalidate));
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
