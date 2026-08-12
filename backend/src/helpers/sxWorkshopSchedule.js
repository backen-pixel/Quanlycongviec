/**
 * Ngày tiếp nhận xưởng + đếm ngày làm việc (bỏ CN + kpi_holidays).
 * Đồng bộ quy tắc với frontend/src/lib/sxWorkshopSchedule.js
 */

const { supabase } = require('../config/supabase');

function formatYmdUtc(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseYmd(ymd) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function vnNowParts(nowMs = Date.now()) {
  const vn = new Date(nowMs + 7 * 60 * 60 * 1000);
  return {
    y: vn.getUTCFullYear(),
    mo: vn.getUTCMonth() + 1,
    d: vn.getUTCDate(),
    hour: vn.getUTCHours(),
    ymd: formatYmdUtc(vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate()),
  };
}

function addCalendarDaysYmd(ymd, deltaDays) {
  const p = parseYmd(ymd);
  if (!p) return '';
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return '';
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return formatYmdUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function normalizeHolidayIndex(rows) {
  const fixed = new Set();
  const recurring = [];
  for (const r of rows || []) {
    const date = String(r.holiday_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (r.repeat_yearly) {
      const p = parseYmd(date);
      if (p) recurring.push({ month: p.mo, day: p.d });
    } else {
      fixed.add(date);
    }
  }
  return { fixed, recurring };
}

function isSxHolidayYmd(ymd, holidayIndex) {
  const p = parseYmd(ymd);
  if (!p) return false;
  const idx = holidayIndex || { fixed: new Set(), recurring: [] };
  if (idx.fixed.has(ymd)) return true;
  return (idx.recurring || []).some((h) => h.month === p.mo && h.day === p.d);
}

function isSxNonWorkingYmd(ymd, holidayIndex) {
  const p = parseYmd(ymd);
  if (!p) return true;
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  if (dow === 0) return true;
  return isSxHolidayYmd(ymd, holidayIndex);
}

function nextSxWorkingYmd(ymd, holidayIndex, maxSteps = 60) {
  let cur = String(ymd || '').slice(0, 10);
  if (!parseYmd(cur)) return '';
  for (let i = 0; i < maxSteps; i += 1) {
    if (!isSxNonWorkingYmd(cur, holidayIndex)) return cur;
    cur = addCalendarDaysYmd(cur, 1);
  }
  return cur;
}

function resolveSxReceptionYmd(setupAt = Date.now(), holidayIndex = null) {
  const ms = setupAt instanceof Date ? setupAt.getTime() : new Date(setupAt).getTime();
  if (!Number.isFinite(ms)) return nextSxWorkingYmd(vnNowParts().ymd, holidayIndex);
  const parts = vnNowParts(ms);
  let ymd = parts.ymd;
  if (parts.hour >= 12) ymd = addCalendarDaysYmd(ymd, 1);
  return nextSxWorkingYmd(ymd, holidayIndex);
}

async function loadSxHolidayIndex(companyId = null) {
  const { data } = await supabase
    .from('kpi_holidays')
    .select('company_id, holiday_date, repeat_yearly');
  const rows = (data || []).filter((r) => {
    if (!r.company_id) return true;
    if (!companyId) return true;
    return String(r.company_id) === String(companyId);
  });
  return normalizeHolidayIndex(rows);
}

/**
 * Tính sx_reception_date khi tạo dự án (setup = now).
 */
async function resolveSxReceptionDateForCompany(companyId, setupAt = Date.now()) {
  const holidays = await loadSxHolidayIndex(companyId);
  return resolveSxReceptionYmd(setupAt, holidays);
}

module.exports = {
  resolveSxReceptionYmd,
  resolveSxReceptionDateForCompany,
  loadSxHolidayIndex,
  nextSxWorkingYmd,
  isSxNonWorkingYmd,
  addCalendarDaysYmd,
  vnNowParts,
};
