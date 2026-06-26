/**
 * Cron leader election qua Redis — tránh chạy trùng job khi scale nhiều instance Render.
 * Không có Redis → chạy như single-instance (backward compatible).
 */

const { randomUUID } = require('crypto');
const { getRedisIfReady } = require('../config/redis');

const _instanceId = `${process.pid}-${randomUUID().slice(0, 8)}`;

/**
 * Chạy fn chỉ khi instance này giữ lock. TTL nên > interval job.
 * @param {string} jobName
 * @param {() => Promise<void>|void} fn
 * @param {{ ttlSec?: number }} [opts]
 */
async function runIfLeader(jobName, fn, opts = {}) {
  const redis = getRedisIfReady();
  if (!redis) {
    await fn();
    return true;
  }

  const key = `cron:leader:${jobName}`;
  const ttlSec = Math.max(10, opts.ttlSec || 55);
  const token = _instanceId;

  let acquired = false;
  try {
    const res = await redis.set(key, token, 'EX', ttlSec, 'NX');
    acquired = res === 'OK';
  } catch {
    await fn();
    return true;
  }

  if (!acquired) return false;

  try {
    await fn();
    return true;
  } finally {
    try {
      const current = await redis.get(key);
      if (current === token) await redis.del(key);
    } catch { /* ignore */ }
  }
}

module.exports = { runIfLeader };
