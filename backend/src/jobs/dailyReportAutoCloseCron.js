/**
 * Cron báo cáo hằng ngày (giờ VN):
 *   - 08:00 → snapshot Phần I (Deadline Quá hạn + Hôm nay)
 *   - 16:45 → snapshot Phần II (KQ CRM đúng ngày phiếu, cắt 16:45)
 * Disable: DAILY_REPORT_AUTO_CLOSE_DISABLED=1
 */
const { runIfLeader } = require('../helpers/cronLeader');
const { crmReportTodayYmdVn } = require('../helpers/crmReportDateBounds');
const { runSnapshotBatch } = require('../helpers/dailyReportSnapshot');
const { notifyAdminsAfterDailyReportBatch } = require('../helpers/dailyReportAdminNotify');

const HOUR_MS = 3600 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;
const RESULT_HOUR_VN = 16;
const RESULT_MINUTE_VN = 45;

function envInt(name, fallback) {
  const n = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function runSlotsVn() {
  const planH = Math.min(23, envInt('DAILY_REPORT_AUTO_PLAN_HOUR', 8));
  const planM = Math.min(59, envInt('DAILY_REPORT_AUTO_PLAN_MINUTE', 0));
  return [
    { h: planH, m: planM, phase: 'plan' },
    { h: RESULT_HOUR_VN, m: RESULT_MINUTE_VN, phase: 'result' },
  ];
}

function nowVN() {
  return new Date(Date.now() + VN_OFFSET_MS);
}

function slotLabel(slot) {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')} (${slot.phase === 'plan' ? 'Phần I' : 'Phần II'})`;
}

function nextRunInfo() {
  const vn = nowVN();
  const hhmm = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const slots = runSlotsVn()
    .map((s) => ({ ...s, mins: s.h * 60 + s.m }))
    .sort((a, b) => a.mins - b.mins);
  for (const slot of slots) {
    if (slot.mins > hhmm) {
      return { slot, delayMs: (slot.mins - hhmm) * 60 * 1000 };
    }
  }
  return {
    slot: slots[0],
    delayMs: (24 * 60 - hhmm + slots[0].mins) * 60 * 1000,
  };
}

let ioRef = null;

async function runOnce(phase = 'result') {
  const startedAt = Date.now();
  const reportDate = crmReportTodayYmdVn();
  const vn = nowVN().toISOString().replace('T', ' ').slice(0, 19);
  const mode = phase === 'plan' ? 'plan' : 'result';
  const label = mode === 'plan' ? 'Phần I snapshot 08:00' : 'Phần II snapshot 16:45';
  console.log(`[daily-report-cron] Bắt đầu ${label} · phiếu=${reportDate} · lúc ${vn} (VN)`);

  try {
    const summary = await runSnapshotBatch({
      reportDate,
      phase: mode,
      onProgress: (row) => {
        if (row.error) console.warn(`[daily-report-cron] Lỗi ${row.name || row.user_id}: ${row.error}`);
        else console.log(`[daily-report-cron] OK ${row.name} [${row.role_key}] ${mode} filled=${row.auto_filled}`);
      },
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[daily-report-cron] Xong ${mode} sau ${elapsed}s · companies=${summary.companies}`
      + ` · ok=${summary.ok} · skipped=${summary.skipped} · errors=${summary.errors}`,
    );
    try {
      await notifyAdminsAfterDailyReportBatch({ summary, phase: mode, io: ioRef });
    } catch (e) {
      console.warn('[daily-report-cron] Gửi admin/Excel lỗi:', e.message || e);
    }
    return summary;
  } catch (err) {
    console.error('[daily-report-cron] Lỗi tổng:', err);
    return null;
  }
}

let started = false;
function start(io) {
  if (started) return;
  if (process.env.DAILY_REPORT_AUTO_CLOSE_DISABLED === '1') {
    console.log('[daily-report-cron] Disabled by env DAILY_REPORT_AUTO_CLOSE_DISABLED=1');
    return;
  }
  started = true;
  if (io) ioRef = io;
  const slots = runSlotsVn();

  function scheduleNext() {
    const { slot, delayMs } = nextRunInfo();
    console.log(`[daily-report-cron] Hẹn ${slotLabel(slot)} · sau ${(delayMs / HOUR_MS).toFixed(2)}h`);
    setTimeout(() => {
      void runIfLeader(`daily-report-snap-${slot.phase}`, () => runOnce(slot.phase), { ttlSec: 7200 })
        .finally(scheduleNext);
    }, delayMs);
  }

  console.log(`[daily-report-cron] Lịch snapshot ${slots.map(slotLabel).join(' · ')} VN`);
  scheduleNext();
}

module.exports = { start, runOnce, runSlotsVn };
