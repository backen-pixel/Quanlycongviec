/**
 * In-memory request metrics collector.
 * Tracks counts, latency, and error rates per endpoint.
 * Rolling window: 60 minutes. Granularity: 1-minute buckets.
 */

const BUCKET_COUNT = 60; // 60 phút
const BUCKET_MS = 60 * 1000; // 1 phút/bucket

/** Buckets theo thời gian: mỗi bucket = 1 phút, giữ 60 bucket gần nhất */
const timeBuckets = []; // [{ ts, total, errors }]

/** Tổng hợp theo endpoint (không phân trang): { 'GET /api/crm/leads': { count, errors, totalMs } } */
const endpointMap = new Map();

/** Tổng tích luỹ kể từ khi khởi động */
let globalTotal = 0;
let globalErrors = 0;
let startedAt = Date.now();

function getBucketKey(now = Date.now()) {
  return Math.floor(now / BUCKET_MS) * BUCKET_MS;
}

function ensureBucket(ts) {
  let b = timeBuckets.find((b) => b.ts === ts);
  if (!b) {
    b = { ts, total: 0, errors: 0 };
    timeBuckets.push(b);
    // Giữ tối đa BUCKET_COUNT bucket (xoá cũ)
    while (timeBuckets.length > BUCKET_COUNT) timeBuckets.shift();
  }
  return b;
}

/**
 * Chuẩn hoá path: loại bỏ UUID/số để gom nhóm endpoint.
 * Ví dụ: /api/crm/leads/abc123 → /api/crm/leads/:id
 */
function normalizePath(path) {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d{5,}/g, '/:id')
    .replace(/\?.*$/, '');
}

/**
 * Middleware Express — gọi trước các route.
 * Đếm tất cả request /api/*, bỏ qua static files.
 */
function metricsMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const isError = res.statusCode >= 500;
    const now = Date.now();
    const bucketTs = getBucketKey(now);

    // Bucket
    const bucket = ensureBucket(bucketTs);
    bucket.total += 1;
    if (isError) bucket.errors += 1;

    // Endpoint
    const key = `${req.method} ${normalizePath(req.path)}`;
    if (!endpointMap.has(key)) {
      endpointMap.set(key, { count: 0, errors: 0, totalMs: 0, lastSeen: 0 });
    }
    const ep = endpointMap.get(key);
    ep.count += 1;
    ep.totalMs += durationMs;
    ep.lastSeen = now;
    if (isError) ep.errors += 1;

    // Global
    globalTotal += 1;
    if (isError) globalErrors += 1;
  });

  next();
}

/** Trả về snapshot hiện tại để trả về qua API */
function getSnapshot() {
  const now = Date.now();

  // Đảm bảo có bucket hiện tại
  ensureBucket(getBucketKey(now));

  // Điền các bucket còn thiếu trong 60 phút qua
  const filled = [];
  for (let i = BUCKET_COUNT - 1; i >= 0; i--) {
    const ts = getBucketKey(now) - i * BUCKET_MS;
    const found = timeBuckets.find((b) => b.ts === ts);
    filled.push(found ? { ...found } : { ts, total: 0, errors: 0 });
  }

  // Top 30 endpoint theo count
  const topEndpoints = [...endpointMap.entries()]
    .map(([key, v]) => ({
      endpoint: key,
      count: v.count,
      errors: v.errors,
      avgMs: v.count > 0 ? Math.round(v.totalMs / v.count) : 0,
      errorRate: v.count > 0 ? +((v.errors / v.count) * 100).toFixed(1) : 0,
      lastSeen: v.lastSeen,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // req/min trong 1 phút gần nhất
  const lastBucket = filled[filled.length - 1] || { total: 0 };
  const last5MinTotal = filled.slice(-5).reduce((s, b) => s + b.total, 0);
  const last60MinTotal = filled.reduce((s, b) => s + b.total, 0);

  return {
    startedAt,
    uptimeMs: now - startedAt,
    globalTotal,
    globalErrors,
    reqLastMin: lastBucket.total,
    reqLast5Min: last5MinTotal,
    reqLast60Min: last60MinTotal,
    errorRateGlobal: globalTotal > 0 ? +((globalErrors / globalTotal) * 100).toFixed(1) : 0,
    timeBuckets: filled,
    topEndpoints,
    generatedAt: now,
  };
}

/** Xoá tất cả số liệu */
function resetMetrics() {
  timeBuckets.length = 0;
  endpointMap.clear();
  globalTotal = 0;
  globalErrors = 0;
  startedAt = Date.now();
}

module.exports = { metricsMiddleware, getSnapshot, resetMetrics };
