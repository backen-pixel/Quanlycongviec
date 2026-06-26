/**
 * Chuẩn hoá REDIS_URL — Render/Upstash đôi khi dán cả lệnh CLI thay vì URL thuần.
 */

function normalizeRedisUrl(raw) {
  if (!raw || process.env.REDIS_DISABLED === '1') return '';

  let s = String(raw).trim();
  try {
    s = decodeURIComponent(s);
  } catch { /* ignore */ }

  const match = s.match(/(rediss?:\/\/[^\s'"]+)/i);
  if (match) s = match[1];
  s = s.replace(/\s+/g, '');

  if (!/^rediss?:\/\//i.test(s)) {
    console.warn('[redis] REDIS_URL không hợp lệ (cần redis:// hoặc rediss://) — Redis tắt');
    return '';
  }

  // Upstash bắt buộc TLS
  if (/upstash\.io/i.test(s) && s.startsWith('redis://')) {
    s = `rediss://${s.slice('redis://'.length)}`;
  }

  return s;
}

function resolveRedisUrl() {
  return normalizeRedisUrl(process.env.REDIS_URL);
}

function getRedisClientOptions() {
  const url = resolveRedisUrl();
  const opts = {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
    retryStrategy(times) {
      return Math.min(times * 500, 30_000);
    },
  };
  if (url.startsWith('rediss://')) {
    opts.tls = {};
  }
  return opts;
}

module.exports = {
  normalizeRedisUrl,
  resolveRedisUrl,
  getRedisClientOptions,
};
