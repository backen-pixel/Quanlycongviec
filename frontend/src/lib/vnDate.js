import { companyDeadlineIsoFromYmd, isHucabiCompany } from './companyDeadlineClock';

/** Lịch Việt Nam (Asia/Ho_Chi_Minh) — dùng cho date_from/date_to gửi API. */
export const VN_TZ = 'Asia/Ho_Chi_Minh';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD theo lịch VN tại thời điểm `at` (mặc định now). */
export function vnTodayYmd(at = new Date()) {
  return new Date(at).toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

/** YYYY-MM-DD lịch VN của một timestamp/ISO. */
export function vnDayKey(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return null;
  const t = new Date(isoOrDate).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

/** Cộng/trừ ngày trên chuỗi YMD (calendar math, không phụ thuộc TZ máy). */
export function vnAddDaysYmd(ymd, deltaDays) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Format Date → YMD bằng local parts (không dùng toISOString — tránh lệch UTC+7). */
export function ymdFromLocalDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Tháng hiện tại theo lịch VN. */
export function vnDefaultMonthRange(ref = new Date()) {
  const today = vnTodayYmd(ref);
  const [y, m] = today.split('-').map(Number);
  const from = `${y}-${pad2(m)}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const to = `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`;
  return { from, to };
}

/**
 * Hạn SLA cột = cuối ngày lịch VN sau slaDays kể từ ngày vào cột.
 * HCB = 17:30; công ty khác = 23:59:59. Khớp backend `endOfCalendarDayAfterEntered`.
 */
export function endOfVnCalendarDayAfterEntered(startIso, slaDays, companyOrId) {
  const days = Math.max(1, Number(slaDays) || 1);
  const enteredYmd = vnDayKey(startIso || new Date()) || vnTodayYmd();
  const dueYmd = vnAddDaysYmd(enteredYmd, days);
  if (isHucabiCompany(companyOrId)) {
    const iso = companyDeadlineIsoFromYmd(dueYmd, companyOrId);
    if (iso) return new Date(iso);
  }
  return new Date(`${dueYmd}T23:59:59.999+07:00`);
}
