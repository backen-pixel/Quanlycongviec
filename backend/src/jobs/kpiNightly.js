/**
 * KPI nightly recompute: chạy mỗi 24h vào ~01:00 sáng giờ máy chủ.
 *
 *   - Recompute KPI tháng hiện tại cho user có role trong KPI_RECOMPUTE_USER_ROLES_DEFAULT.
 *   - Trong 3 ngày đầu mỗi tháng, recompute thêm KPI tháng trước (cho phép chốt số trễ).
 *
 * Tích hợp vào server.js bằng require('./jobs/kpiNightly').start().
 * Có thể disable bằng env KPI_CRON_DISABLED=1 (vd. cho môi trường dev).
 */
const { supabase } = require('../config/supabase');
const { computeAndStoreForUser } = require('../services/kpiCalculator');
const { KPI_RECOMPUTE_USER_ROLES_DEFAULT } = require('../services/kpiRoleApplies');
const { runIfLeader } = require('../helpers/cronLeader');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

function firstOfMonthISO(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function firstOfPrevMonthISO(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

function msUntilNext1AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(1, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runOnce() {
  const startedAt = Date.now();
  console.log('[kpi-cron] Bắt đầu recompute KPI lúc', new Date().toISOString());

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, role, company_id')
      .in('role', KPI_RECOMPUTE_USER_ROLES_DEFAULT);
    if (error) throw error;

    const now = new Date();
    const periodStart = firstOfMonthISO(now);
    const dayOfMonth = now.getUTCDate();
    const recomputePrev = dayOfMonth <= 3;
    const prevPeriodStart = recomputePrev ? firstOfPrevMonthISO(now) : null;

    let count = 0;
    let prevCount = 0;
    for (const u of users || []) {
      try {
        await computeAndStoreForUser({
          userId: u.id,
          companyId: u.company_id || null,
          periodType: 'monthly',
          periodStart,
        });
        count += 1;
      } catch (err) {
        console.error(`[kpi-cron] Lỗi user ${u.id}:`, err.message);
      }

      if (prevPeriodStart) {
        try {
          await computeAndStoreForUser({
            userId: u.id,
            companyId: u.company_id || null,
            periodType: 'monthly',
            periodStart: prevPeriodStart,
          });
          prevCount += 1;
        } catch (err) {
          console.error(`[kpi-cron] Lỗi prev period user ${u.id}:`, err.message);
        }
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[kpi-cron] Xong sau ${elapsed}s · current=${count} · prev=${prevCount}`);
  } catch (err) {
    console.error('[kpi-cron] Lỗi tổng:', err);
  }
}

let started = false;
function start() {
  if (started) return;
  if (process.env.KPI_CRON_DISABLED === '1') {
    console.log('[kpi-cron] Disabled by env KPI_CRON_DISABLED=1');
    return;
  }
  started = true;
  const delay = msUntilNext1AM();
  console.log(`[kpi-cron] Lần chạy đầu tiên sau ${(delay / HOUR_MS).toFixed(2)}h`);
  setTimeout(function tick() {
    void runIfLeader('kpi-nightly', () => runOnce(), { ttlSec: 21_600 }).finally(() => {
      setTimeout(tick, DAY_MS);
    });
  }, delay);
}

module.exports = { start, runOnce };
