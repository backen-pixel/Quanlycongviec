/**
 * SLA deadline phát sinh Không gian chung (loại + thời gian cấu hình được).
 */

const {
  vnNowParts,
  addCalendarDaysYmd,
  nextSxWorkingYmd,
  addSxWorkingDaysYmd,
} = require('./sxWorkshopSchedule');
const { companyDeadlineIsoFromYmd, rememberCompanyDeadlineClock } = require('./companyDeadlineClock');
const {
  normalizePhatSinhKindToken,
  cutoffClockFromKind,
  legacyKindRow,
} = require('./sharedWorkspacePhatSinhKinds');

const PHAT_SINH_KINDS = new Set(['tempered_glass', 'glass_unpainted', 'glass_painted']);

function normalizePhatSinhKind(raw) {
  return normalizePhatSinhKindToken(raw) || null;
}

function clockMinutes(clock) {
  return (Number(clock?.hour) || 0) * 60 + (Number(clock?.minute) || 0);
}

function resolveSlaRow(opts = {}) {
  if (opts.kindRow && opts.kindRow.sla_mode) return opts.kindRow;
  return legacyKindRow(opts.kind);
}

/**
 * @param {object} opts
 * @param {string} opts.kind
 * @param {object} [opts.kindRow] — từ shared_workspace_phat_sinh_kinds
 * @param {object} opts.config — từ getSxScheduleConfig
 * @param {object} [opts.holidayIndex]
 * @param {number} [opts.nowMs]
 * @param {string} [opts.companyId]
 */
function resolvePhatSinhDeadlineIso(opts = {}) {
  const kind = normalizePhatSinhKind(opts.kind);
  const sla = resolveSlaRow({ kind, kindRow: opts.kindRow });
  if (!kind || !sla) return null;
  const cfg = opts.config || {};
  const deadlineClock = cfg.deadline_clock || { hour: 17, minute: 30, second: 0, ms: 0 };
  const cutoffClock = cutoffClockFromKind(sla, cfg.cutoff_clock || { hour: 12, minute: 0, second: 0, ms: 0 });
  if (opts.companyId) rememberCompanyDeadlineClock(opts.companyId, deadlineClock);

  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const parts = vnNowParts(nowMs);
  const holidays = opts.holidayIndex || null;
  const nowMin = parts.hour * 60 + (parts.minute || 0);
  let ymd = parts.ymd;
  const mode = sla.sla_mode;

  if (mode === 'working_days') {
    let days = Number(sla.sla_days);
    if (!(days > 0) && String(sla.slug || kind) === 'tempered_glass') {
      days = Number(cfg.tempered_glass_days) > 0 ? Number(cfg.tempered_glass_days) : 3;
    }
    if (!(days > 0)) days = 1;
    ymd = addSxWorkingDaysYmd(ymd, days, holidays);
  } else if (mode === 'noon_cutoff') {
    if (nowMin >= clockMinutes(cutoffClock)) {
      ymd = addCalendarDaysYmd(ymd, 1);
    }
    ymd = nextSxWorkingYmd(ymd, holidays);
  } else if (mode === 'same_day') {
    if (nowMin >= clockMinutes(deadlineClock)) {
      ymd = addCalendarDaysYmd(ymd, 1);
    }
    ymd = nextSxWorkingYmd(ymd, holidays);
  } else {
    return null;
  }

  return companyDeadlineIsoFromYmd(ymd, opts.companyId);
}

module.exports = {
  PHAT_SINH_KINDS,
  normalizePhatSinhKind,
  resolvePhatSinhDeadlineIso,
};
