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

// Cổng Zalo: 15 tài khoản tiêu khoảng 383 request/phút theo nhịp cố định.
// Để rộng gấp bốn cho lúc gửi bù sau khi mất mạng.
const ZALO_BRIDGE_WINDOW_MS = envInt('ZALO_BRIDGE_RATE_WINDOW_MS', 60_000);
const ZALO_BRIDGE_MAX = envInt('ZALO_BRIDGE_RATE_MAX', 1500);

function skipHealth(req) {
  const p = req.path || '';
  return p === '/api/health' || p === '/health' || req.method === 'OPTIONS';
}

/**
 * Đường có limiter riêng thì bỏ qua limiter chung, nếu không một request bị
 * đếm hai lần và rổ riêng trở thành vô nghĩa.
 *
 * req.path ở đây có thể còn hoặc mất tiền tố '/api' tuỳ chỗ mount, nên nhận cả hai.
 */
function hasOwnLimiter(req) {
  const p = req.path || '';
  return p.startsWith('/zalo-bridge') || p.startsWith('/api/zalo-bridge');
}

const apiBurstLimiter = rateLimit({
  windowMs: BURST_WINDOW_MS,
  max: BURST_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInDev() || skipHealth(req) || hasOwnLimiter(req),
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
  skip: (req) => skipInDev() || skipHealth(req) || hasOwnLimiter(req),
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

/**
 * Rổ đếm riêng cho cổng Zalo ở máy văn phòng. Vẫn tính theo IP như các limiter
 * khác, nhưng là bộ đếm tách biệt — lưu lượng của máy không ăn vào phần của
 * nhân viên ngồi cùng văn phòng, dù hai bên ra Internet chung một IP.
 */
const zaloBridgeLimiter = rateLimit({
  windowMs: ZALO_BRIDGE_WINDOW_MS,
  max: ZALO_BRIDGE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: {
    error: 'Cổng Zalo gọi quá dày. Giảm nhịp hoặc nâng ZALO_BRIDGE_RATE_MAX.',
    code: 'ZALO_BRIDGE_RATE_LIMIT',
  },
});

module.exports = {
  apiBurstLimiter,
  zaloBridgeLimiter,
  apiWindowLimiter,
  uploadLimiter,
  API_RATE_LIMITS: {
    burst: { windowMs: BURST_WINDOW_MS, max: BURST_MAX },
    window: { windowMs: API_WINDOW_MS, max: API_MAX },
    upload: { windowMs: UPLOAD_WINDOW_MS, max: UPLOAD_MAX },
    zaloBridge: { windowMs: ZALO_BRIDGE_WINDOW_MS, max: ZALO_BRIDGE_MAX },
  },
};
