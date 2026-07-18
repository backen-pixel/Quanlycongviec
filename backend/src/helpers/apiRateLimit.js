/**
 * Rate-limit API toàn cục + upload (chống flood nhẹ / abuse).
 * Env (optional):
 *   API_RATE_WINDOW_MS / API_RATE_MAX
 *   API_BURST_WINDOW_MS / API_BURST_MAX
 *   UPLOAD_RATE_WINDOW_MS / UPLOAD_RATE_MAX
 */
const rateLimit = require('express-rate-limit');

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const skipInDev = () => process.env.NODE_ENV !== 'production'
  && process.env.API_RATE_LIMIT_FORCE !== '1';

const API_WINDOW_MS = envInt('API_RATE_WINDOW_MS', 60_000);
const API_MAX = envInt('API_RATE_MAX', 600);
const BURST_WINDOW_MS = envInt('API_BURST_WINDOW_MS', 10_000);
const BURST_MAX = envInt('API_BURST_MAX', 120);
const UPLOAD_WINDOW_MS = envInt('UPLOAD_RATE_WINDOW_MS', 60_000);
const UPLOAD_MAX = envInt('UPLOAD_RATE_MAX', 40);

function skipHealth(req) {
  const p = req.path || '';
  return p === '/api/health' || p === '/health' || req.method === 'OPTIONS';
}

const apiBurstLimiter = rateLimit({
  windowMs: BURST_WINDOW_MS,
  max: BURST_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInDev() || skipHealth(req),
  message: {
    error: 'Quá nhiều yêu cầu (burst). Vui lòng thử lại sau.',
    code: 'API_BURST_LIMIT',
  },
});

const apiWindowLimiter = rateLimit({
  windowMs: API_WINDOW_MS,
  max: API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInDev() || skipHealth(req),
  message: {
    error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
    code: 'API_RATE_LIMIT',
  },
});

const uploadLimiter = rateLimit({
  windowMs: UPLOAD_WINDOW_MS,
  max: UPLOAD_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: {
    error: 'Quá nhiều upload. Vui lòng thử lại sau.',
    code: 'UPLOAD_RATE_LIMIT',
  },
});

module.exports = {
  apiBurstLimiter,
  apiWindowLimiter,
  uploadLimiter,
  API_RATE_LIMITS: {
    burst: { windowMs: BURST_WINDOW_MS, max: BURST_MAX },
    window: { windowMs: API_WINDOW_MS, max: API_MAX },
    upload: { windowMs: UPLOAD_WINDOW_MS, max: UPLOAD_MAX },
  },
};
