/** Khoảng ngày báo cáo CRM theo lịch Việt Nam (Asia/Ho_Chi_Minh). */
const VN_TZ = 'Asia/Ho_Chi_Minh';

function sanitizeCrmReportYmd(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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

/** Mốc tính SLA / tiếp nhận: cuối kỳ báo cáo nếu kỳ đã qua, không thì hiện tại. */
function crmReportAsOfMs(dateToYmd) {
  const to = sanitizeCrmReportYmd(dateToYmd);
  if (!to) return Date.now();
  if (to >= crmReportTodayYmdVn()) return Date.now();
  return new Date(crmReportCreatedAtToIso(to)).getTime();
}

/**
 * Hạn SLA cột = cuối ngày lịch VN (Asia/Ho_Chi_Minh) sau `slaDays` ngày kể từ ngày vào cột.
 * Không dùng setHours theo TZ máy chủ — tránh lệch Render (UTC) vs máy local (UTC+7)
 * khiến QH SLA Lead/Deal lệch 1 hồ sơ giữa web prod và app local.
 */
function endOfCalendarDayAfterEntered(startIso, slaDays) {
  const days = Math.max(1, Number(slaDays) || 1);
  const entered = startIso ? new Date(startIso) : new Date();
  const enteredMs = entered.getTime();
  const ymd = Number.isFinite(enteredMs)
    ? entered.toLocaleDateString('en-CA', { timeZone: VN_TZ })
    : crmReportTodayYmdVn();
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  // Cộng ngày trên lịch (UTC date parts = calendar arithmetic, không phụ thuộc TZ process).
  const due = new Date(Date.UTC(y, m - 1, d));
  due.setUTCDate(due.getUTCDate() + days);
  const yy = due.getUTCFullYear();
  const mm = String(due.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(due.getUTCDate()).padStart(2, '0');
  return new Date(`${yy}-${mm}-${dd}T23:59:59.999+07:00`);
}

module.exports = {
  VN_TZ,
  sanitizeCrmReportYmd,
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
  crmReportDayKeyVn,
  crmReportTodayYmdVn,
  crmReportAsOfMs,
  endOfCalendarDayAfterEntered,
};
