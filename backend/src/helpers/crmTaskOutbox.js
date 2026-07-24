/**
 * Outbox nhẹ cho side-effect SAU-COMMIT của crm_tasks.
 *
 * Transaction boundary (create/update task):
 *   [DB-CORE bắt buộc atomic] insert/update crm_tasks + crm_task_assignees
 *     → có compensation (xóa task) nếu ghi assignees thất bại.
 *   [SAU COMMIT — qua outbox] assignment sync → notification → realtime emit.
 *
 * Quy tắc:
 *  - Side-effect chỉ chạy SAU khi DB-core đã commit (route/mutation gọi drain sau core).
 *  - Thất bại side-effect KHÔNG làm hỏng request chính (fail-open cho side-effect),
 *    NHƯNG được ghi nhận (report + optional Redis retry-record) — không mất âm thầm.
 *  - Dedupe theo key → retry không phát side-effect trùng.
 *  - Không bao giờ emit realtime cho core thất bại (core fail → return trước khi tới đây).
 *
 * Cờ CRM_TASK_OUTBOX=1: bật ghi retry-record bền (Redis) để consumer nền retry sau.
 * Mặc định (tắt): hành vi quan sát được GIỐNG code cũ — chạy tuần tự, nuốt lỗi, log cảnh báo;
 * chỉ khác là trả thêm `report` in-memory (additive, không đổi contract thành công).
 */
const { getRedisIfReady } = require('../config/redis');

const OUTBOX_RETRY_TTL_MS = 24 * 60 * 60 * 1000;
const outboxLocal = new Map(); // dedupeKey -> { status, attempts, at }

function outboxPersistEnabled() {
  return process.env.CRM_TASK_OUTBOX === '1';
}

function getOutboxRecord(key) {
  return key ? (outboxLocal.get(key) || null) : null;
}

function markOutboxRecord(key, status, attempts) {
  if (!key) return;
  const rec = { status, attempts, at: Date.now() };
  outboxLocal.set(key, rec);
  if (outboxLocal.size > 5000) {
    const first = outboxLocal.keys().next().value;
    if (first) outboxLocal.delete(first);
  }
  if (outboxPersistEnabled()) {
    const redis = getRedisIfReady();
    if (redis) {
      try {
        void redis.set(
          `crm_task_outbox:${key}`,
          JSON.stringify(rec),
          'EX',
          Math.floor(OUTBOX_RETRY_TTL_MS / 1000),
        );
      } catch (_) { /* ignore */ }
    }
  }
}

/**
 * @param {object} context — { taskId, leadId, ... } để log/audit.
 * @returns outbox instance: enqueue(name, run, {dedupeKey}) + drain()
 */
function createCrmTaskOutbox(context = {}) {
  const entries = [];
  return {
    context,
    enqueue(name, run, { dedupeKey = null } = {}) {
      entries.push({ name, run, dedupeKey });
      return this;
    },
    /**
     * Chạy tuần tự các entry SAU commit. Không ném lỗi ra ngoài — lỗi được gom vào report.
     * @returns {{ context, done: [], failed: [], skipped: [] }}
     */
    async drain() {
      const report = { context, done: [], failed: [], skipped: [] };
      for (const e of entries) {
        const prior = getOutboxRecord(e.dedupeKey);
        if (prior?.status === 'done') {
          report.skipped.push({ name: e.name, reason: 'already_done' });
          continue;
        }
        const attempts = (prior?.attempts || 0) + 1;
        try {
          await e.run();
          markOutboxRecord(e.dedupeKey, 'done', attempts);
          report.done.push({ name: e.name });
        } catch (err) {
          markOutboxRecord(e.dedupeKey, 'failed', attempts);
          report.failed.push({ name: e.name, error: err.message, attempts });
          console.warn(`[crm_task_outbox] ${e.name} thất bại (lần ${attempts}):`, err.message);
        }
      }
      return report;
    },
  };
}

module.exports = {
  createCrmTaskOutbox,
  outboxPersistEnabled,
  getOutboxRecord,
  markOutboxRecord,
};
