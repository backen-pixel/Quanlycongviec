/** Mốc hết hạn trong ngày theo công ty xưởng. Mặc định 17:30 giờ VN (tuỳ chỉnh theo cấu hình). */

const VN_TZ = 'Asia/Ho_Chi_Minh';
export const HUCABI_COMPANY_ID = '18c2563f-3495-498d-8199-23200c9f420e';
export const DEFAULT_DEADLINE_CLOCK = { hour: 17, minute: 30, second: 0, ms: 0 };

const clockByCompany = new Map();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function companyIdOf(companyOrId) {
  if (companyOrId == null || companyOrId === '') return '';
  if (typeof companyOrId === 'string' || typeof companyOrId === 'number') return String(companyOrId);
  return String(companyOrId.id || companyOrId.company_id || '');
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

export function rememberCompanyDeadlineClock(companyId, clock) {
  const id = String(companyId || '');
  if (!id || !clock) return;
  clockByCompany.set(id, {
    hour: Number(clock.hour) || 17,
    minute: Number(clock.minute) || 0,
    second: Number(clock.second) || 0,
    ms: Number(clock.ms) || 0,
  });
}

/** Giờ hết hạn trong ngày (VN). Mặc định 17:30 cho mọi xưởng. */
export function companyDeadlineDayEndClock(companyOrId) {
  if (isHucabiCompany(companyOrId)) {
    return { hour: 17, minute: 30, second: 0, ms: 0 };
  }
  const id = companyIdOf(companyOrId);
  if (id && clockByCompany.has(id)) return clockByCompany.get(id);
  return { ...DEFAULT_DEADLINE_CLOCK };
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
 * Timestamp hết hạn để so sánh quá hạn.
 * HCB: mọi hạn (DATE midnight UTC / timestamptz) → 17:30 VN cùng ngày lịch.
 * Công ty khác: giữ timestamp gốc.
 */
export function companyWorkEndMsFromRaw(raw, companyOrId) {
  if (raw == null || raw === '') return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  if (!isHucabiCompany(companyOrId)) return t;
  const ymd = vnYmdFromTs(t);
  const snapped = ymd ? companyWorkEndMsOnYmd(ymd, companyOrId) : null;
  return snapped != null ? snapped : t;
}

/**
 * Hạn ngày hôm nay chuyển sang quá hạn sau giờ deadline công ty (mặc định 17:30 VN).
 */
export function isHucabiSameDayPastWorkEnd(deadlineRaw, companyOrId, nowMs = Date.now()) {
  if (deadlineRaw == null || deadlineRaw === '') return false;
  const ts = new Date(deadlineRaw).getTime();
  if (!Number.isFinite(ts)) return false;
  const dueYmd = vnYmdFromTs(ts);
  const nowYmd = vnYmdFromTs(nowMs);
  if (!dueYmd || dueYmd !== nowYmd) return false;
  const endMs = companyWorkEndMsOnYmd(dueYmd, companyOrId);
  return endMs != null && nowMs > endMs;
}

export function hucabiDeadlineHint(companyOrId) {
  if (isHucabiCompany(companyOrId)) {
    return 'Hạn trong ngày của HCB (Hucabi): 17:30';
  }
  const c = companyDeadlineDayEndClock(companyOrId);
  return `Hạn trong ngày lưu lúc ${pad2(c.hour)}:${pad2(c.minute)} (đổi ở Pipeline xưởng)`;
}
