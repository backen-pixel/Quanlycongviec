/**
 * Cron tự động nộp Phần II (KQ ngày hôm trước từ CRM) của báo cáo hằng ngày.
 * Mặc định chạy 17:00 giờ VN mỗi ngày.
 *
 * Tích hợp: require('./jobs/dailyReportAutoCloseCron').start()
 * Disable: DAILY_REPORT_AUTO_CLOSE_DISABLED=1
 * Giờ chạy: DAILY_REPORT_AUTO_CLOSE_HOUR / _MINUTE (mặc định 17:00 VN)
 * Lọc công ty: DAILY_REPORT_AUTO_CLOSE_COMPANY_IDS=uuid,uuid
 * Chỉ nộp nếu chưa chốt: DAILY_REPORT_AUTO_CLOSE_FORCE=0 (mặc định force=1 — cập nhật lại số CRM)
 */
const { runIfLeader } = require('../helpers/cronLeader');
const { runAutoCloseBatch } = require('../helpers/dailyReportAutoSubmit');
const { crmReportTodayYmdVn } = require('../helpers/crmReportDateBounds');

const HOUR_MS = 3600 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

function envInt(name, fallback) {
  const n = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function runSlotsVn() {
  const h = Math.min(23, envInt('DAILY_REPORT_AUTO_CLOSE_HOUR', 17));
  const m = Math.min(59, envInt('DAILY_REPORT_AUTO_CLOSE_MINUTE', 0));
  return [{ h, m }];
}

function nowVN() {
  return new Date(Date.now() + VN_OFFSET_MS);
}

function msUntilNextRun() {
  const vn = nowVN();
  const hhmm = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const slots = runSlotsVn().map((s) => s.h * 60 + s.m).sort((a, b) => a - b);
  for (const slot of slots) {
    if (slot > hhmm) return (slot - hhmm) * 60 * 1000;
  }
  return (24 * 60 - hhmm + slots[0]) * 60 * 1000;
}

function forceMode() {
  const v = String(process.env.DAILY_REPORT_AUTO_CLOSE_FORCE ?? '1').trim();
  return v !== '0' && v.toLowerCase() !== 'false';
}

async function runOnce() {
  const startedAt = Date.now();
  const reportDate = crmReportTodayYmdVn();
  const vn = nowVN().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[daily-report-cron] Bắt đầu auto-nộp Phần II · phiếu=${reportDate} · lúc ${vn} (VN)`);

  try {
    const summary = await runAutoCloseBatch({
      reportDate,
      force: forceMode(),
      onProgress: (row) => {
        if (row.error) {
          console.warn(`[daily-report-cron] Lỗi ${row.name || row.user_id}: ${row.error}`);
        } else if (row.skipped) {
          console.log(`[daily-report-cron] Bỏ qua ${row.name} (đã nộp)`);
        } else {
          console.log(
            `[daily-report-cron] OK ${row.name} [${row.role_key}] filled=${row.auto_filled} manual=${row.manual_left}`,
          );
        }
      },
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[daily-report-cron] Xong sau ${elapsed}s · companies=${summary.companies}`
      + ` · ok=${summary.ok} · skipped=${summary.skipped} · errors=${summary.errors}`,
    );
    return summary;
  } catch (err) {
    console.error('[daily-report-cron] Lỗi tổng:', err);
    return null;
  }
}

let started = false;
function start() {
  if (started) return;
  if (process.env.DAILY_REPORT_AUTO_CLOSE_DISABLED === '1') {
    console.log('[daily-report-cron] Disabled by env DAILY_REPORT_AUTO_CLOSE_DISABLED=1');
    return;
  }
  started = true;
  const slots = runSlotsVn();
  const delay = msUntilNextRun();
  console.log(
    `[daily-report-cron] Lịch ${slots.map((s) => `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`).join(', ')} VN`
    + ` · lần đầu sau ${(delay / HOUR_MS).toFixed(2)}h`,
  );
  setTimeout(function tick() {
    void runIfLeader('daily-report-auto-close', () => runOnce(), { ttlSec: 7200 }).finally(() => {
      setTimeout(tick, msUntilNextRun());
    });
  }, delay);
}

module.exports = { start, runOnce };
