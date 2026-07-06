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

/**
 * Giữ lock dài hạn (pipeline, worker nền). Trả true nếu acquire mới hoặc instance này đã giữ lock.
 * Không có Redis → luôn true (single-instance).
 */
async function tryAcquireLeader(jobName, ttlSec = 120) {
  const redis = getRedisIfReady();
  if (!redis) return true;

  const key = `cron:leader:${jobName}`;
  const token = _instanceId;
  const ttl = Math.max(10, ttlSec);

  try {
    const res = await redis.set(key, token, 'EX', ttl, 'NX');
    if (res === 'OK') return true;
    const current = await redis.get(key);
    return current === token;
  } catch {
    return true;
  }
}

/** Gia hạn lock nếu instance này vẫn là leader. */
async function renewLeader(jobName, ttlSec = 120) {
  const redis = getRedisIfReady();
  if (!redis) return true;

  const key = `cron:leader:${jobName}`;
  const token = _instanceId;
  const ttl = Math.max(10, ttlSec);

  try {
    const current = await redis.get(key);
    if (current !== token) return false;
    await redis.expire(key, ttl);
    return true;
  } catch {
    return true;
  }
}

/** Thả lock khi dừng job dài hạn. */
async function releaseLeader(jobName) {
  const redis = getRedisIfReady();
  if (!redis) return;

  const key = `cron:leader:${jobName}`;
  const token = _instanceId;
  try {
    const current = await redis.get(key);
    if (current === token) await redis.del(key);
  } catch { /* ignore */ }
}

module.exports = { runIfLeader, tryAcquireLeader, renewLeader, releaseLeader };
