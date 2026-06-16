/**
 * API quản lý system batch jobs — enqueue, pause, resume, cancel, retry.
 */
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const {
  enqueueBatchJob,
  listBatchJobs,
  getBatchJob,
  pauseBatchJob,
  resumeBatchJob,
  cancelBatchJob,
  retryBatchJob,
} = require('../helpers/batchQueue');
const {
  listBatchJobTypes,
  getBatchJobType,
  canUserRunBatchType,
} = require('../helpers/batchJobHandlers');
const { BATCH_RATE_LIMITS } = require('../helpers/batchQueueRateLimit');

const router = Router();

const rlKey = (req) => req.user?.userId || req.ip || 'anon';

const batchReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Math.max(30, parseInt(process.env.BATCH_RL_READ_MAX || '120', 10)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rlKey,
  message: { error: 'Quá nhiều yêu cầu đọc batch job. Thử lại sau.' },
});

const batchEnqueueLimiter = rateLimit({
  windowMs: BATCH_RATE_LIMITS.enqueueWindowMs,
  max: BATCH_RATE_LIMITS.enqueueMaxPerUser,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rlKey,
  message: {
    error: `Quá nhiều lần tạo batch job (${BATCH_RATE_LIMITS.enqueueMaxPerUser}/${Math.round(BATCH_RATE_LIMITS.enqueueWindowMs / 60000)} phút).`,
  },
});

const batchControlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(10, parseInt(process.env.BATCH_RL_CONTROL_MAX || '60', 10)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rlKey,
  message: { error: 'Quá nhiều thao tác pause/resume/cancel/retry. Thử lại sau.' },
});

function sendRouteError(res, e) {
  const status = e.status || 500;
  if (status === 429 && e.retryAfterSec) {
    res.set('Retry-After', String(e.retryAfterSec));
  }
  res.status(status).json({ error: e.message, retry_after_sec: e.retryAfterSec || undefined });
}

function assertCanAccessJob(req, job) {
  if (isAdminLike(req.user)) {
    const cid = req.user?.company_id;
    if (cid && job.company_id && String(job.company_id) !== String(cid)) {
      const err = new Error('Không có quyền xem job công ty khác');
      err.status = 403;
      throw err;
    }
    return;
  }
  if (String(job.created_by_id || '') !== String(req.user?.userId || '')) {
    const err = new Error('Không có quyền');
    err.status = 403;
    throw err;
  }
}

router.get('/types', auth, batchReadLimiter, (req, res) => {
  const types = listBatchJobTypes().filter((t) => {
    const def = getBatchJobType(t.type);
    return canUserRunBatchType(req.user, def);
  });
  res.json({ types });
});

router.get('/', auth, batchReadLimiter, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const filters = {
      status: req.query.status || null,
      jobType: req.query.job_type || null,
      limit,
      offset,
    };
    if (!isAdminLike(req.user)) {
      filters.userId = req.user.userId;
    } else if (req.user?.company_id) {
      filters.companyId = req.user.company_id;
    }
    const result = await listBatchJobs(filters);
    if (result.skipped) {
      return res.status(503).json({
        error: 'Database chưa có bảng system_batch_jobs. Chạy database/360_system_batch_jobs.sql',
      });
    }
    res.json(result);
  } catch (e) {
    sendRouteError(res, e);
  }
});

router.get('/:id', auth, batchReadLimiter, async (req, res) => {
  try {
    const job = await getBatchJob(req.params.id);
    assertCanAccessJob(req, job);
    res.json({ data: job });
  } catch (e) {
    sendRouteError(res, e);
  }
});

router.post('/', auth, batchEnqueueLimiter, async (req, res) => {
  try {
    const { type, payload, max_retries: maxRetries } = req.body || {};
    if (!type) return res.status(400).json({ error: 'Cần type' });

    const typeDef = getBatchJobType(type);
    if (!typeDef) return res.status(400).json({ error: `Loại job không hợp lệ: ${type}` });
    if (!canUserRunBatchType(req.user, typeDef)) {
      return res.status(403).json({ error: 'Không có quyền chạy loại job này' });
    }

    const job = await enqueueBatchJob({
      type,
      payload: payload || {},
      userId: req.user.userId,
      companyId: req.user.company_id || payload?.company_id || null,
      maxRetries: maxRetries != null ? parseInt(maxRetries, 10) : undefined,
    });
    res.status(201).json({ data: job });
  } catch (e) {
    sendRouteError(res, e);
  }
});

router.post('/:id/pause', auth, batchControlLimiter, async (req, res) => {
  try {
    const job = await getBatchJob(req.params.id);
    assertCanAccessJob(req, job);
    const updated = await pauseBatchJob(req.params.id);
    res.json({ data: updated });
  } catch (e) {
    sendRouteError(res, e);
  }
});

router.post('/:id/resume', auth, batchControlLimiter, async (req, res) => {
  try {
    const job = await getBatchJob(req.params.id);
    assertCanAccessJob(req, job);
    const updated = await resumeBatchJob(req.params.id);
    res.json({ data: updated });
  } catch (e) {
    sendRouteError(res, e);
  }
});

router.post('/:id/cancel', auth, batchControlLimiter, async (req, res) => {
  try {
    const job = await getBatchJob(req.params.id);
    assertCanAccessJob(req, job);
    const updated = await cancelBatchJob(req.params.id);
    res.json({ data: updated });
  } catch (e) {
    sendRouteError(res, e);
  }
});

router.post('/:id/retry', auth, batchControlLimiter, async (req, res) => {
  try {
    const job = await getBatchJob(req.params.id);
    assertCanAccessJob(req, job);
    const updated = await retryBatchJob(req.params.id);
    res.json({ data: updated });
  } catch (e) {
    sendRouteError(res, e);
  }
});

module.exports = router;
