/**
 * SLA deadline phát sinh kính (Không gian chung).
 */

const {
  vnNowParts,
  addCalendarDaysYmd,
  nextSxWorkingYmd,
  addSxWorkingDaysYmd,
} = require('./sxWorkshopSchedule');
const { companyDeadlineIsoFromYmd, rememberCompanyDeadlineClock } = require('./companyDeadlineClock');

const PHAT_SINH_KINDS = new Set(['tempered_glass', 'glass_unpainted', 'glass_painted']);

function normalizePhatSinhKind(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return PHAT_SINH_KINDS.has(v) ? v : null;
}

function clockMinutes(clock) {
  return (Number(clock?.hour) || 0) * 60 + (Number(clock?.minute) || 0);
}

/**
 * @param {object} opts
 * @param {string} opts.kind
 * @param {object} opts.config — từ getSxScheduleConfig
 * @param {object} [opts.holidayIndex]
 * @param {number} [opts.nowMs]
 * @param {string} [opts.companyId]
 */
function resolvePhatSinhDeadlineIso(opts = {}) {
  const kind = normalizePhatSinhKind(opts.kind);
  if (!kind) return null;
  const cfg = opts.config || {};
  const deadlineClock = cfg.deadline_clock || { hour: 17, minute: 30, second: 0, ms: 0 };
  const cutoffClock = cfg.cutoff_clock || { hour: 12, minute: 0, second: 0, ms: 0 };
  if (opts.companyId) rememberCompanyDeadlineClock(opts.companyId, deadlineClock);

  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const parts = vnNowParts(nowMs);
  const holidays = opts.holidayIndex || null;
  const nowMin = parts.hour * 60 + (parts.minute || 0);
  let ymd = parts.ymd;

  if (kind === 'tempered_glass') {
    const days = Number(cfg.tempered_glass_days) > 0 ? Number(cfg.tempered_glass_days) : 3;
    ymd = addSxWorkingDaysYmd(ymd, days, holidays);
  } else if (kind === 'glass_unpainted') {
    if (nowMin >= clockMinutes(cutoffClock)) {
      ymd = addCalendarDaysYmd(ymd, 1);
    }
    ymd = nextSxWorkingYmd(ymd, holidays);
  } else if (kind === 'glass_painted') {
    if (nowMin >= clockMinutes(deadlineClock)) {
      ymd = addCalendarDaysYmd(ymd, 1);
    }
    ymd = nextSxWorkingYmd(ymd, holidays);
  }

  return companyDeadlineIsoFromYmd(ymd, opts.companyId);
}

module.exports = {
  PHAT_SINH_KINDS,
  normalizePhatSinhKind,
  resolvePhatSinhDeadlineIso,
};
