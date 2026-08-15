/** Mốc hết hạn trong ngày theo công ty xưởng. HCB (Hucabi) = 17:30 giờ VN. */

const VN_TZ = 'Asia/Ho_Chi_Minh';
export const HUCABI_COMPANY_ID = '18c2563f-3495-498d-8199-23200c9f420e';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isHucabiCompany(companyOrId) {
  if (companyOrId == null || companyOrId === '') return false;
  if (typeof companyOrId === 'string' || typeof companyOrId === 'number') {
    return String(companyOrId) === HUCABI_COMPANY_ID;
  }
  const id = String(companyOrId.id || companyOrId.company_id || '');
  if (id === HUCABI_COMPANY_ID) return true;
  const sn = String(companyOrId.short_name || '').trim().toUpperCase();
  const name = String(companyOrId.name || '').trim().toLowerCase();
  return sn === 'HCB' || name.includes('hucabi');
}

/** Giờ hết hạn trong ngày (VN). Công ty khác: cuối ngày. */
export function companyDeadlineDayEndClock(companyOrId) {
  if (isHucabiCompany(companyOrId)) {
    return { hour: 17, minute: 30, second: 0, ms: 0 };
  }
  return { hour: 23, minute: 59, second: 59, ms: 999 };
}

export function vnYmdFromTs(ts) {
  const n = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!Number.isFinite(n)) return null;
  return new Date(n).toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

export function companyDeadlineIsoFromYmd(ymd, companyOrId) {
  const m = String(ymd || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const c = companyDeadlineDayEndClock(companyOrId);
  return `${m[1]}T${pad2(c.hour)}:${pad2(c.minute)}:${pad2(c.second)}.${String(c.ms).padStart(3, '0')}+07:00`;
}

export function companyWorkEndMsOnYmd(ymd, companyOrId) {
  const iso = companyDeadlineIsoFromYmd(ymd, companyOrId);
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * HCB: hạn ngày hôm nay chuyển sang quá hạn sau 17:30 VN.
 * Công ty khác: giữ so sánh theo ngày lịch (cùng ngày vẫn là «hôm nay»).
 */
export function isHucabiSameDayPastWorkEnd(deadlineRaw, companyOrId, nowMs = Date.now()) {
  if (!isHucabiCompany(companyOrId) || deadlineRaw == null || deadlineRaw === '') return false;
  const ts = new Date(deadlineRaw).getTime();
  if (!Number.isFinite(ts)) return false;
  const dueYmd = vnYmdFromTs(ts);
  const nowYmd = vnYmdFromTs(nowMs);
  if (!dueYmd || dueYmd !== nowYmd) return false;
  const endMs = companyWorkEndMsOnYmd(dueYmd, companyOrId);
  return endMs != null && nowMs > endMs;
}

export function hucabiDeadlineHint(companyOrId) {
  if (!isHucabiCompany(companyOrId)) return '';
  return 'Hạn trong ngày của HCB (Hucabi): 17:30';
}
