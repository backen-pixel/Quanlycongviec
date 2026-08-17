/** Mốc hết hạn trong ngày theo công ty xưởng. Mặc định 17:30 giờ VN (tuỳ chỉnh theo cấu hình). */

const VN_TZ = 'Asia/Ho_Chi_Minh';
const HUCABI_COMPANY_ID = '18c2563f-3495-498d-8199-23200c9f420e';
const DEFAULT_CLOCK = { hour: 17, minute: 30, second: 0, ms: 0 };

const clockByCompany = new Map();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function companyIdOf(companyOrId) {
  if (companyOrId == null || companyOrId === '') return '';
  if (typeof companyOrId === 'string' || typeof companyOrId === 'number') return String(companyOrId);
  return String(companyOrId.id || companyOrId.company_id || '');
}

function isHucabiCompany(companyOrId) {
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

function rememberCompanyDeadlineClock(companyId, clock) {
  const id = String(companyId || '');
  if (!id || !clock) return;
  clockByCompany.set(id, {
    hour: Number(clock.hour) || 17,
    minute: Number(clock.minute) || 0,
    second: Number(clock.second) || 0,
    ms: Number(clock.ms) || 0,
  });
}

function companyDeadlineDayEndClock(companyOrId) {
  if (isHucabiCompany(companyOrId)) {
    return { hour: 17, minute: 30, second: 0, ms: 0 };
  }
  const id = companyIdOf(companyOrId);
  if (id && clockByCompany.has(id)) return clockByCompany.get(id);
  return { ...DEFAULT_CLOCK };
}

function vnYmdFromTs(ts) {
  const n = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!Number.isFinite(n)) return null;
  return new Date(n).toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

function companyDeadlineIsoFromYmd(ymd, companyOrId) {
  const m = String(ymd || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const c = companyDeadlineDayEndClock(companyOrId);
  return `${m[1]}T${pad2(c.hour)}:${pad2(c.minute)}:${pad2(c.second)}.${String(c.ms).padStart(3, '0')}+07:00`;
}

function companyWorkEndMsOnYmd(ymd, companyOrId) {
  const iso = companyDeadlineIsoFromYmd(ymd, companyOrId);
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** HCB: DATE/timestamptz → 17:30 VN cùng ngày lịch. Công ty khác: giữ timestamp gốc. */
function companyWorkEndMsFromRaw(raw, companyOrId) {
  if (raw == null || raw === '') return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  if (!isHucabiCompany(companyOrId)) return t;
  const ymd = vnYmdFromTs(t);
  const snapped = ymd ? companyWorkEndMsOnYmd(ymd, companyOrId) : null;
  return snapped != null ? snapped : t;
}

function isHucabiSameDayPastWorkEnd(deadlineRaw, companyOrId, nowMs = Date.now()) {
  if (deadlineRaw == null || deadlineRaw === '') return false;
  const ts = new Date(deadlineRaw).getTime();
  if (!Number.isFinite(ts)) return false;
  const dueYmd = vnYmdFromTs(ts);
  const nowYmd = vnYmdFromTs(nowMs);
  if (!dueYmd || dueYmd !== nowYmd) return false;
  const endMs = companyWorkEndMsOnYmd(dueYmd, companyOrId);
  return endMs != null && nowMs > endMs;
}

module.exports = {
  HUCABI_COMPANY_ID,
  DEFAULT_CLOCK,
  isHucabiCompany,
  rememberCompanyDeadlineClock,
  companyDeadlineDayEndClock,
  companyDeadlineIsoFromYmd,
  companyWorkEndMsOnYmd,
  companyWorkEndMsFromRaw,
  isHucabiSameDayPastWorkEnd,
  vnYmdFromTs,
};
