/** Khoảng ngày / lịch CRM theo Việt Nam (Asia/Ho_Chi_Minh) — không phụ thuộc TZ process (Render UTC). */
const VN_TZ = 'Asia/Ho_Chi_Minh';
const { companyDeadlineIsoFromYmd, isHucabiCompany } = require('./companyDeadlineClock');

function sanitizeCrmReportYmd(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function crmReportCreatedAtFromIso(ymd) {
  const d = sanitizeCrmReportYmd(ymd);
  return d ? `${d}T00:00:00+07:00` : null;
}

function crmReportCreatedAtToIso(ymd) {
  const d = sanitizeCrmReportYmd(ymd);
  return d ? `${d}T23:59:59.999+07:00` : null;
}

function crmReportDayKeyVn(isoTimestamp) {
  if (!isoTimestamp) return null;
  const t = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

function crmReportTodayYmdVn() {
  return new Date().toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

/** Cộng/trừ ngày trên lịch (YMD) — arithmetic UTC date parts, không phụ thuộc TZ process. */
function crmReportAddDaysYmd(ymd, deltaDays) {
  const d = sanitizeCrmReportYmd(ymd);
  if (!d) return null;
  const [y, m, day] = d.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Tháng hiện tại theo lịch VN: from = ngày 1, to = ngày cuối tháng. */
function crmReportDefaultMonthRangeVn(refYmd = null) {
  const today = sanitizeCrmReportYmd(refYmd) || crmReportTodayYmdVn();
  const [y, m] = today.split('-').map((x) => Number(x));
  const from = `${y}-${pad2(m)}-01`;
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last of m
  const to = `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`;
  return { from, to, df: from, dt: to };
}

/** Kỳ trước cùng độ dài (ngày lịch) — so sánh BC. */
function crmReportPreviousPeriod(df, dt) {
  const from = sanitizeCrmReportYmd(df);
  const to = sanitizeCrmReportYmd(dt);
  if (!from || !to) return { prevFrom: from, prevTo: to, days: 1 };
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  const days = Math.max(1, Math.round((b - a) / 86400000) + 1);
  const prevTo = crmReportAddDaysYmd(from, -1);
  const prevFrom = crmReportAddDaysYmd(prevTo, -(days - 1));
  return { prevFrom, prevTo, days };
}

/** Mốc tính SLA / tiếp nhận: cuối kỳ báo cáo nếu kỳ đã qua, không thì hiện tại. */
function crmReportAsOfMs(dateToYmd) {
  const to = sanitizeCrmReportYmd(dateToYmd);
  if (!to) return Date.now();
  if (to >= crmReportTodayYmdVn()) return Date.now();
  return new Date(crmReportCreatedAtToIso(to)).getTime();
}

/**
 * Hạn SLA cột = cuối ngày lịch VN sau `slaDays` ngày kể từ ngày vào cột.
 * HCB = 17:30; công ty khác = 23:59:59. Không dùng setHours theo TZ máy chủ.
 */
function endOfCalendarDayAfterEntered(startIso, slaDays, companyOrId) {
  const days = Math.max(1, Number(slaDays) || 1);
  const entered = startIso ? new Date(startIso) : new Date();
  const enteredMs = entered.getTime();
  const ymd = Number.isFinite(enteredMs)
    ? entered.toLocaleDateString('en-CA', { timeZone: VN_TZ })
    : crmReportTodayYmdVn();
  const dueYmd = crmReportAddDaysYmd(ymd, days);
  if (isHucabiCompany(companyOrId)) {
    const iso = companyDeadlineIsoFromYmd(dueYmd, companyOrId);
    if (iso) return new Date(iso);
  }
  return new Date(crmReportCreatedAtToIso(dueYmd));
}

/** Quá hạn theo ngày lịch VN (so sánh YMD, không setHours). */
function crmReportIsYmdBeforeToday(ymdOrIso) {
  const key = sanitizeCrmReportYmd(ymdOrIso) || crmReportDayKeyVn(ymdOrIso);
  if (!key) return false;
  return key < crmReportTodayYmdVn();
}

module.exports = {
  VN_TZ,
  sanitizeCrmReportYmd,
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
  crmReportDayKeyVn,
  crmReportTodayYmdVn,
  crmReportAddDaysYmd,
  crmReportDefaultMonthRangeVn,
  crmReportPreviousPeriod,
  crmReportAsOfMs,
  endOfCalendarDayAfterEntered,
  crmReportIsYmdBeforeToday,
};
