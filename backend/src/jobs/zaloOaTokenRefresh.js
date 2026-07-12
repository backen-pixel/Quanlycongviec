/**
 * Cron làm mới Zalo OA access_token hàng ngày (access ~25h, refresh rotate mỗi lần gọi).
 * Disable: ZALO_OA_TOKEN_CRON_DISABLED=1
 */
const { refreshAllZaloOaTokensDue } = require('../helpers/zaloOaToken');
const { runIfLeader } = require('../helpers/cronLeader');

const HOUR_MS = 3600 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;
const RUN_HOUR_VN = 6;
const RUN_MINUTE_VN = 0;

function nowVN() {
  return new Date(Date.now() + VN_OFFSET_MS);
}

function msUntilNextRun() {
  const vn = nowVN();
  const hhmm = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const slot = RUN_HOUR_VN * 60 + RUN_MINUTE_VN;
  if (slot > hhmm) return (slot - hhmm) * 60 * 1000;
  return (24 * 60 - hhmm + slot) * 60 * 1000;
}

async function runOnce() {
  const vnTime = nowVN().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[zalo-token-cron] Bắt đầu refresh token lúc ${vnTime} (VN)`);
  try {
    const summary = await refreshAllZaloOaTokensDue({ reason: 'daily_cron' });
    console.log(`[zalo-token-cron] Xong: ${summary.refreshed}/${summary.total} OA`);
    summary.results?.filter((r) => !r.ok).forEach((r) => {
      console.warn(`[zalo-token-cron] ${r.oa_id}: ${r.message || r.error}`);
    });
  } catch (e) {
    console.error('[zalo-token-cron] Lỗi:', e.message);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun();
  setTimeout(() => {
    void runIfLeader('zalo-oa-token-refresh', () => runOnce(), { ttlSec: 1800 }).finally(scheduleNext);
  }, delay);
}

function start() {
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.ZALO_OA_TOKEN_CRON_DISABLED || '').toLowerCase())) {
    console.log('[zalo-token-cron] Disabled (ZALO_OA_TOKEN_CRON_DISABLED)');
    return;
  }
  const delayMin = Math.round(msUntilNextRun() / 60000);
  console.log(`[zalo-token-cron] Scheduled daily ${RUN_HOUR_VN}:${String(RUN_MINUTE_VN).padStart(2, '0')} VN (~${delayMin} phút nữa)`);
  scheduleNext();
}

module.exports = { start, runOnce };
