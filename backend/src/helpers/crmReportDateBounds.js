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

module.exports = {
  sanitizeCrmReportYmd,
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
  crmReportDayKeyVn,
  crmReportTodayYmdVn,
  crmReportAsOfMs,
};
