/**
 * Spawn nhiệm vụ CRM/SX từ crm_assignment_schedules — đưa vào batch queue khi có thể.
 * Fallback: xử lý trực tiếp nếu queue chưa migrate hoặc BATCH_QUEUE_DISABLED=1.
 *
 * Tích hợp: require('./jobs/crmAssignmentScheduleRunner').start(io)
 */
const { processDueCrmAssignmentSchedules } = require('../helpers/crmAssignmentSchedule');
const { enqueueBatchJob, listBatchJobs } = require('../helpers/batchQueue');
const { runIfLeader } = require('../helpers/cronLeader');

const RUN_INTERVAL_MS = 60 * 1000;
const USE_QUEUE = process.env.CRM_ASSIGNMENT_SCHEDULE_USE_QUEUE !== '0';

async function runOnce(io) {
  try {
    if (USE_QUEUE && process.env.BATCH_QUEUE_DISABLED !== '1') {
      const { data: pending } = await listBatchJobs({
        status: 'pending',
        jobType: 'crm_assignment_schedule_due',
        limit: 5,
      });
      const { data: running } = await listBatchJobs({
        status: 'running',
        jobType: 'crm_assignment_schedule_due',
        limit: 1,
      });
      if ((running || []).length || (pending || []).length >= 3) {
        return;
      }
      await enqueueBatchJob({
        type: 'crm_assignment_schedule_due',
        payload: { limit: 50, source: 'cron' },
        userId: null,
        companyId: null,
      });
      return;
    }

    const { processed, skipped } = await processDueCrmAssignmentSchedules(io);
    if (skipped) {
      console.log('[crm-assignment-schedule] Bảng lịch chưa có (migration 357)');
      return;
    }
    if (processed > 0) {
      console.log(`[crm-assignment-schedule] Đã spawn ${processed} nhiệm vụ từ lịch (direct)`);
    }
  } catch (e) {
    if (/system_batch_jobs|migration 360/.test(e.message || '')) {
      try {
        const { processed, skipped } = await processDueCrmAssignmentSchedules(io);
        if (!skipped && processed > 0) {
          console.log(`[crm-assignment-schedule] Fallback direct: ${processed} nhiệm vụ`);
        }
      } catch (inner) {
        console.error('[crm-assignment-schedule]', inner.message);
      }
      return;
    }
    console.error('[crm-assignment-schedule]', e.message);
  }
}

function start(io) {
  if (process.env.CRM_ASSIGNMENT_SCHEDULE_DISABLED === '1') {
    console.log('[crm-assignment-schedule] Disabled (env)');
    return;
  }
  setTimeout(() => { void runIfLeader('crm-assignment-schedule', () => runOnce(io), { ttlSec: 55 }); }, 45 * 1000);
  setInterval(() => { void runIfLeader('crm-assignment-schedule', () => runOnce(io), { ttlSec: 55 }); }, RUN_INTERVAL_MS);
  const mode = USE_QUEUE && process.env.BATCH_QUEUE_DISABLED !== '1' ? 'batch-queue' : 'direct';
  console.log(`[crm-assignment-schedule] Started — interval 1 phút (${mode})`);
}

module.exports = { start, runOnce };
