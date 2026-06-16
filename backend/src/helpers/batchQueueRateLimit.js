/**
 * Rate limit cho system batch queue — giới hạn enqueue theo user/công ty + payload.
 * Redis sliding window khi có REDIS_URL; fallback đếm Supabase.
 */
const { supabase } = require('../config/supabase');
const { getRedisIfReady } = require('../config/redis');

const RL = {
  enqueueWindowMs: Math.max(60_000, parseInt(process.env.BATCH_RL_ENQUEUE_WINDOW_MS || `${15 * 60 * 1000}`, 10)),
  enqueueMaxPerUser: Math.max(1, parseInt(process.env.BATCH_RL_ENQUEUE_MAX || '10', 10)),
  maxPendingPerUser: Math.max(1, parseInt(process.env.BATCH_RL_MAX_PENDING_USER || '5', 10)),
  maxRunningPerUser: Math.max(1, parseInt(process.env.BATCH_RL_MAX_RUNNING_USER || '2', 10)),
  maxPendingPerCompany: Math.max(5, parseInt(process.env.BATCH_RL_MAX_PENDING_COMPANY || '30', 10)),
  maxPendingPerType: Math.max(3, parseInt(process.env.BATCH_RL_MAX_PENDING_TYPE || '10', 10)),
  bulkAssignMaxItems: Math.max(1, parseInt(process.env.BATCH_BULK_ASSIGN_MAX_ITEMS || '200', 10)),
  jobCooldownMs: Math.max(0, parseInt(process.env.BATCH_QUEUE_JOB_COOLDOWN_MS || '500', 10)),
};

const REDIS_RL_PREFIX = 'batch:rl:enqueue:';

function rateLimitError(message, retryAfterSec) {
  const err = new Error(message);
  err.status = 429;
  err.retryAfterSec = retryAfterSec;
  return err;
}

async function countActiveJobs({ userId, companyId, jobType, statuses }) {
  let q = supabase.from('system_batch_jobs').select('id', { count: 'exact', head: true });
  if (statuses?.length === 1) q = q.eq('status', statuses[0]);
  else if (statuses?.length) q = q.in('status', statuses);
  if (userId) q = q.eq('created_by_id', userId);
  if (companyId) q = q.eq('company_id', companyId);
  if (jobType) q = q.eq('job_type', jobType);
  const { count, error } = await q;
  if (error) {
    if (/system_batch_jobs/.test(error.message || '')) return 0;
    throw error;
  }
  return count || 0;
}

async function countRecentEnqueues(userId, windowMs) {
  if (!userId) return 0;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await supabase
    .from('system_batch_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('created_by_id', userId)
    .gte('created_at', since);
  if (error) {
    if (/system_batch_jobs/.test(error.message || '')) return 0;
    throw error;
  }
  return count || 0;
}

async function getEnqueueWindowCount(userId) {
  if (!userId) return 0;
  const redis = getRedisIfReady();
  if (redis) {
    const raw = await redis.get(`${REDIS_RL_PREFIX}${userId}`);
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return countRecentEnqueues(userId, RL.enqueueWindowMs);
}

async function recordEnqueueForRateLimit(userId) {
  if (!userId) return;
  const redis = getRedisIfReady();
  if (!redis) return;
  const key = `${REDIS_RL_PREFIX}${userId}`;
  const ttlSec = Math.max(1, Math.ceil(RL.enqueueWindowMs / 1000));
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, ttlSec);
}

function validatePayloadLimits(type, payload) {
  if (type === 'crm_bulk_assign') {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length > RL.bulkAssignMaxItems) {
      throw rateLimitError(
        `Tối đa ${RL.bulkAssignMaxItems} mục/lần (crm_bulk_assign). Chia nhỏ thành nhiều job.`,
        0
      );
    }
  }
}

/**
 * Kiểm tra trước khi enqueue. Cron (userId null) bỏ qua giới hạn theo user.
 */
async function assertBatchEnqueueAllowed({ type, payload = {}, userId = null, companyId = null }) {
  validatePayloadLimits(type, payload);

  if (userId) {
    const recent = await getEnqueueWindowCount(userId);
    if (recent >= RL.enqueueMaxPerUser) {
      throw rateLimitError(
        `Quá nhiều job batch (${RL.enqueueMaxPerUser}/${Math.round(RL.enqueueWindowMs / 60000)} phút). Thử lại sau.`,
        Math.ceil(RL.enqueueWindowMs / 1000)
      );
    }

    const pendingUser = await countActiveJobs({
      userId,
      statuses: ['pending', 'paused'],
    });
    if (pendingUser >= RL.maxPendingPerUser) {
      throw rateLimitError(
        `Đang có ${pendingUser} job chờ xử lý (tối đa ${RL.maxPendingPerUser}/user). Hủy hoặc đợi job cũ xong.`,
        60
      );
    }

    const runningUser = await countActiveJobs({ userId, statuses: ['running'] });
    if (runningUser >= RL.maxRunningPerUser) {
      throw rateLimitError(
        `Đang chạy ${runningUser} job (tối đa ${RL.maxRunningPerUser}/user). Thử lại sau.`,
        30
      );
    }
  }

  if (companyId) {
    const pendingCo = await countActiveJobs({
      companyId,
      statuses: ['pending', 'paused', 'running'],
    });
    if (pendingCo >= RL.maxPendingPerCompany) {
      throw rateLimitError(
        `Công ty đang có ${pendingCo} job batch (tối đa ${RL.maxPendingPerCompany}). Thử lại sau.`,
        120
      );
    }
  }

  const pendingType = await countActiveJobs({
    jobType: type,
    statuses: ['pending', 'running'],
  });
  if (pendingType >= RL.maxPendingPerType) {
    throw rateLimitError(
      `Loại "${type}" đang có ${pendingType} job hoạt động (tối đa ${RL.maxPendingPerType}). Thử lại sau.`,
      60
    );
  }
}

function getJobCooldownMs() {
  return RL.jobCooldownMs;
}

module.exports = {
  assertBatchEnqueueAllowed,
  validatePayloadLimits,
  recordEnqueueForRateLimit,
  getJobCooldownMs,
  BATCH_RATE_LIMITS: RL,
};
