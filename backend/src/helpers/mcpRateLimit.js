/**
 * Rate limit / anti-DDoS cho /api/mcp.
 *
 * Hai tầng:
 *  1. Theo IP (trước auth) — chặn flood + quét UUID
 *  2. Theo API key (sau auth) — chặn lạm dụng tool nặng
 *
 * Env (optional):
 *  MCP_RATE_IP_BURST_MAX / MCP_RATE_IP_BURST_WINDOW_MS
 *  MCP_RATE_IP_MAX / MCP_RATE_IP_WINDOW_MS
 *  MCP_RATE_KEY_MAX / MCP_RATE_KEY_WINDOW_MS
 */
const rateLimit = require('express-rate-limit');

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const IP_BURST_WINDOW_MS = envInt('MCP_RATE_IP_BURST_WINDOW_MS', 10_000);
const IP_BURST_MAX = envInt('MCP_RATE_IP_BURST_MAX', 25);
const IP_WINDOW_MS = envInt('MCP_RATE_IP_WINDOW_MS', 60_000);
const IP_MAX = envInt('MCP_RATE_IP_MAX', 80);
const KEY_WINDOW_MS = envInt('MCP_RATE_KEY_WINDOW_MS', 60_000);
const KEY_MAX = envInt('MCP_RATE_KEY_MAX', 60);

function rateLimitJson(message, retryAfterSec) {
  return {
    error: message,
    code: 'MCP_RATE_LIMIT',
    retry_after_sec: retryAfterSec,
  };
}

/** Burst ngắn — chống flood */
const mcpIpBurstLimiter = rateLimit({
  windowMs: IP_BURST_WINDOW_MS,
  max: IP_BURST_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitJson(
    `Quá nhiều request MCP (burst). Tối đa ${IP_BURST_MAX} request / ${Math.round(IP_BURST_WINDOW_MS / 1000)}s / IP.`,
    Math.ceil(IP_BURST_WINDOW_MS / 1000),
  ),
  handler: (req, res, _next, options) => {
    const retry = Math.ceil(IP_BURST_WINDOW_MS / 1000);
    res.set('Retry-After', String(retry));
    res.status(options.statusCode).json(options.message);
  },
});

/** Cửa sổ 1 phút theo IP */
const mcpIpWindowLimiter = rateLimit({
  windowMs: IP_WINDOW_MS,
  max: IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitJson(
    `Rate limit MCP: tối đa ${IP_MAX} request / phút / IP.`,
    Math.ceil(IP_WINDOW_MS / 1000),
  ),
  handler: (req, res, _next, options) => {
    const retry = Math.ceil(IP_WINDOW_MS / 1000);
    res.set('Retry-After', String(retry));
    res.status(options.statusCode).json(options.message);
  },
});

/** In-memory per-key (+ IP) sau auth */
const _keyBuckets = new Map();
const _CLEAN_EVERY_MS = 5 * 60_000;
let _lastClean = Date.now();

function pruneKeyBuckets(now) {
  if (now - _lastClean < _CLEAN_EVERY_MS) return;
  _lastClean = now;
  for (const [k, v] of _keyBuckets) {
    if (now - v.t > KEY_WINDOW_MS * 2) _keyBuckets.delete(k);
  }
}

function checkKeyRateLimit({ apiKeyId, ip }) {
  const now = Date.now();
  pruneKeyBuckets(now);
  const bucketKey = `${apiKeyId || 'unknown'}:${ip || 'unknown'}`;
  const cur = _keyBuckets.get(bucketKey) || { t: now, c: 0 };
  if (now - cur.t > KEY_WINDOW_MS) {
    _keyBuckets.set(bucketKey, { t: now, c: 1 });
    return { ok: true, remaining: KEY_MAX - 1, resetSec: Math.ceil(KEY_WINDOW_MS / 1000) };
  }
  if (cur.c >= KEY_MAX) {
    const resetSec = Math.max(1, Math.ceil((KEY_WINDOW_MS - (now - cur.t)) / 1000));
    return { ok: false, remaining: 0, resetSec };
  }
  cur.c += 1;
  _keyBuckets.set(bucketKey, cur);
  return { ok: true, remaining: KEY_MAX - cur.c, resetSec: Math.ceil((KEY_WINDOW_MS - (now - cur.t)) / 1000) };
}

function mcpKeyRateLimit(req, res, next) {
  const rl = checkKeyRateLimit({ apiKeyId: req.apiKey?.id, ip: req.ip });
  res.set('X-RateLimit-Limit', String(KEY_MAX));
  res.set('X-RateLimit-Remaining', String(Math.max(0, rl.remaining)));
  res.set('X-RateLimit-Reset', String(rl.resetSec));
  if (!rl.ok) {
    res.set('Retry-After', String(rl.resetSec));
    return res.status(429).json(rateLimitJson(
      `Rate limit MCP key: tối đa ${KEY_MAX} request / phút / key.`,
      rl.resetSec,
    ));
  }
  next();
}

module.exports = {
  mcpIpBurstLimiter,
  mcpIpWindowLimiter,
  mcpKeyRateLimit,
  MCP_RATE_LIMITS: {
    ipBurst: { windowMs: IP_BURST_WINDOW_MS, max: IP_BURST_MAX },
    ipWindow: { windowMs: IP_WINDOW_MS, max: IP_MAX },
    keyWindow: { windowMs: KEY_WINDOW_MS, max: KEY_MAX },
  },
};
