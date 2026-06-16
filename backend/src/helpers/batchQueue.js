/**
 * System batch queue — Redis LPUSH/BRPOP + Supabase persist + in-memory fallback.
 *
 * Tính năng: enqueue, pause, resume, cancel, retry, progress qua Socket.IO.
 * Disable worker: BATCH_QUEUE_DISABLED=1
 */
const { randomUUID } = require('crypto');
const { supabase } = require('../config/supabase');
const { getRedisIfReady } = require('../config/redis');
const { getBatchJobType } = require('./batchJobHandlers');
const { assertBatchEnqueueAllowed, getJobCooldownMs, recordEnqueueForRateLimit } = require('./batchQueueRateLimit');

const REDIS_PENDING = 'batch:queue:pending';
const REDIS_DELAYED = 'batch:queue:delayed'; // sorted set score = run_at ms

const memQueue = [];
let _io = null;
let _workerBusy = false;

function setBatchQueueIO(io) {
  _io = io;
}

function tableMissing(err) {
  return /system_batch_jobs/.test(err?.message || '');
}

async function loadJob(id) {
  const { data, error } = await supabase.from('system_batch_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function patchJob(id, fields) {
  const row = { ...fields, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('system_batch_jobs').update(row).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

function emitJobEvent(event, job, extra = {}) {
  if (!_io) return;
  const payload = {
    id: job.id,
    job_type: job.job_type,
    status: job.status,
    progress_current: job.progress_current,
    progress_total: job.progress_total,
    progress_meta: job.progress_meta,
    ...extra,
  };
  _io.emit(event, payload);
  // Tương thích UI Facebook/Zalo cũ
  if (event === 'batch_job_progress') {
    _io.emit('batch_progress', { type: job.job_type, batch_job_id: job.id, ...extra, ...payload });
  }
  if (event === 'batch_job_done') {
    _io.emit('batch_done', { type: job.job_type, batch_job_id: job.id, result: job.result, ...extra });
  }
}

async function redisEnqueue(id) {
  const redis = getRedisIfReady();
  if (redis) {
    await redis.lpush(REDIS_PENDING, id);
    return true;
  }
  memQueue.push(id);
  return false;
}

async function redisDequeue(timeoutSec = 2) {
  const redis = getRedisIfReady();
  if (redis) {
    const res = await redis.brpop(REDIS_PENDING, timeoutSec);
    return res ? res[1] : null;
  }
  return memQueue.shift() || null;
}

async function promoteDelayedJobs() {
  const redis = getRedisIfReady();
  if (!redis) return;
  const now = Date.now();
  const ids = await redis.zrangebyscore(REDIS_DELAYED, 0, now, 'LIMIT', 0, 20);
  if (!ids.length) return;
  for (const id of ids) {
    await redis.zrem(REDIS_DELAYED, id);
    await redis.lpush(REDIS_PENDING, id);
  }
}

async function scheduleRetry(id, delayMs) {
  const runAt = Date.now() + delayMs;
  const redis = getRedisIfReady();
  if (redis) {
    await redis.zadd(REDIS_DELAYED, runAt, id);
  } else {
    setTimeout(() => {
      memQueue.push(id);
      void pumpMemQueue();
    }, delayMs);
  }
  await patchJob(id, { status: 'pending' });
}

/**
 * @param {{ type: string, payload?: object, userId?: string, companyId?: string, maxRetries?: number }}
 */
async function enqueueBatchJob({ type, payload = {}, userId = null, companyId = null, maxRetries }) {
  const typeDef = getBatchJobType(type);
  if (!typeDef) {
    const err = new Error(`Loại job không hợp lệ: ${type}`);
    err.status = 400;
    throw err;
  }

  await assertBatchEnqueueAllowed({ type, payload, userId, companyId });

  const id = randomUUID();
  const row = {
    id,
    job_type: type,
    status: 'pending',
    payload: payload || {},
    progress_current: 0,
    progress_total: 0,
    created_by_id: userId || null,
    company_id: companyId || null,
    max_retries: maxRetries ?? typeDef.defaultMaxRetries ?? 3,
    retry_count: 0,
  };

  const { data, error } = await supabase.from('system_batch_jobs').insert(row).select('*').single();
  if (error) {
    if (tableMissing(error)) {
      const err = new Error('Database chưa có bảng system_batch_jobs (migration 360).');
      err.status = 503;
      throw err;
    }
    throw error;
  }

  await redisEnqueue(id);
  await recordEnqueueForRateLimit(userId);
  emitJobEvent('batch_job_enqueued', data);
  void pumpMemQueue();
  return data;
}

async function listBatchJobs({ status, jobType, userId, companyId, limit = 50, offset = 0 } = {}) {
  let q = supabase.from('system_batch_jobs').select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + Math.min(200, limit) - 1);

  if (status) q = q.eq('status', status);
  if (jobType) q = q.eq('job_type', jobType);
  if (userId) q = q.eq('created_by_id', userId);
  if (companyId) q = q.eq('company_id', companyId);

  const { data, error, count } = await q;
  if (error) {
    if (tableMissing(error)) return { data: [], count: 0, skipped: true };
    throw error;
  }
  return { data: data || [], count: count || 0 };
}

async function getBatchJob(id) {
  const job = await loadJob(id);
  if (!job) {
    const err = new Error('Không tìm thấy job');
    err.status = 404;
    throw err;
  }
  return job;
}

async function pauseBatchJob(id) {
  const job = await getBatchJob(id);
  if (!['pending', 'running'].includes(job.status)) {
    const err = new Error(`Không thể pause job ở trạng thái ${job.status}`);
    err.status = 400;
    throw err;
  }
  const updated = await patchJob(id, { status: 'paused' });
  emitJobEvent('batch_job_paused', updated);
  return updated;
}

async function resumeBatchJob(id) {
  const job = await getBatchJob(id);
  if (job.status !== 'paused') {
    const err = new Error('Chỉ resume job đang paused');
    err.status = 400;
    throw err;
  }
  const updated = await patchJob(id, { status: 'pending' });
  await redisEnqueue(id);
  emitJobEvent('batch_job_resumed', updated);
  void pumpMemQueue();
  return updated;
}

async function cancelBatchJob(id) {
  const job = await getBatchJob(id);
  if (['completed', 'cancelled'].includes(job.status)) {
    const err = new Error(`Job đã ${job.status}`);
    err.status = 400;
    throw err;
  }
  const updated = await patchJob(id, {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
  });
  emitJobEvent('batch_job_cancelled', updated);
  return updated;
}

async function retryBatchJob(id) {
  const job = await getBatchJob(id);
  if (!['failed', 'cancelled'].includes(job.status)) {
    const err = new Error('Chỉ retry job failed hoặc cancelled');
    err.status = 400;
    throw err;
  }
  const updated = await patchJob(id, {
    status: 'pending',
    error_message: null,
    result: null,
    progress_current: 0,
    progress_total: 0,
    progress_meta: null,
    started_at: null,
    completed_at: null,
    retry_count: 0,
  });
  await redisEnqueue(id);
  emitJobEvent('batch_job_retried', updated);
  void pumpMemQueue();
  return updated;
}

async function checkJobAborted(id) {
  const job = await loadJob(id);
  if (!job) throw new Error('Job không tồn tại');
  if (job.status === 'cancelled') {
    const err = new Error('Job đã bị hủy');
    err.code = 'JOB_CANCELLED';
    throw err;
  }
  if (job.status === 'paused') {
    const err = new Error('Job đang tạm dừng');
    err.code = 'JOB_PAUSED';
    throw err;
  }
  return job;
}

async function processBatchJob(id) {
  let job = await loadJob(id);
  if (!job) return;
  if (!['pending'].includes(job.status)) return;

  const typeDef = getBatchJobType(job.job_type);
  if (!typeDef) {
    await patchJob(id, {
      status: 'failed',
      error_message: `Handler không tồn tại: ${job.job_type}`,
      completed_at: new Date().toISOString(),
    });
    return;
  }

  job = await patchJob(id, {
    status: 'running',
    started_at: job.started_at || new Date().toISOString(),
    error_message: null,
  });
  emitJobEvent('batch_job_started', job);

  const ctx = {
    io: _io,
    updateProgress: async (current, total, meta) => {
      job = await patchJob(id, {
        progress_current: current,
        progress_total: total,
        progress_meta: meta || null,
      });
      emitJobEvent('batch_job_progress', job, meta || {});
    },
    isAborted: () => checkJobAborted(id),
  };

  try {
    const result = await typeDef.run(job, ctx);
    job = await patchJob(id, {
      status: 'completed',
      result: result ?? {},
      completed_at: new Date().toISOString(),
      error_message: null,
    });
    emitJobEvent('batch_job_done', job, { result: job.result });
  } catch (e) {
    if (e.code === 'JOB_PAUSED') {
      await patchJob(id, { status: 'paused' });
      return;
    }
    if (e.code === 'JOB_CANCELLED') {
      return;
    }

    const retryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries ?? 3;

    if (retryCount <= maxRetries) {
      const backoffMs = Math.min(60_000, 2000 * Math.pow(2, retryCount - 1));
      await patchJob(id, {
        status: 'pending',
        retry_count: retryCount,
        error_message: e.message,
      });
      await scheduleRetry(id, backoffMs);
      emitJobEvent('batch_job_retry_scheduled', job, {
        retry_count: retryCount,
        retry_in_ms: backoffMs,
        error: e.message,
      });
    } else {
      job = await patchJob(id, {
        status: 'failed',
        retry_count: retryCount,
        error_message: e.message,
        completed_at: new Date().toISOString(),
      });
      emitJobEvent('batch_job_failed', job, { error: e.message });
    }
  }
}

async function workerTick() {
  if (_workerBusy) return;
  _workerBusy = true;
  try {
    await promoteDelayedJobs();
    const id = await redisDequeue(1);
    if (id) {
      await processBatchJob(id);
      const cooldown = getJobCooldownMs();
      if (cooldown > 0) await new Promise((r) => setTimeout(r, cooldown));
    }
  } catch (e) {
    console.error('[batch-queue] worker tick:', e.message);
  } finally {
    _workerBusy = false;
  }
}

async function pumpMemQueue() {
  if (getRedisIfReady()) return;
  if (_workerBusy) return;
  const id = memQueue.shift();
  if (!id) return;
  _workerBusy = true;
  try {
    await processBatchJob(id);
  } finally {
    _workerBusy = false;
    if (memQueue.length) setImmediate(() => { void pumpMemQueue(); });
  }
}

function startBatchQueueWorker() {
  if (process.env.BATCH_QUEUE_DISABLED === '1') {
    console.log('[batch-queue] Disabled (env BATCH_QUEUE_DISABLED=1)');
    return;
  }
  const intervalMs = Math.min(5000, Math.max(500, parseInt(process.env.BATCH_QUEUE_POLL_MS || '1000', 10) || 1000));
  setTimeout(() => { void workerTick(); }, 30_000);
  setInterval(() => { void workerTick(); }, intervalMs);
  console.log(`[batch-queue] Worker started — poll ${intervalMs}ms (Redis: ${getRedisIfReady() ? 'yes' : 'in-memory fallback'})`);
}

module.exports = {
  setBatchQueueIO,
  enqueueBatchJob,
  listBatchJobs,
  getBatchJob,
  pauseBatchJob,
  resumeBatchJob,
  cancelBatchJob,
  retryBatchJob,
  processBatchJob,
  workerTick,
  startBatchQueueWorker,
};
