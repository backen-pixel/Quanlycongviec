/**
 * Business Hours Service — quy đổi mốc thời gian sang giờ hành chính.
 *
 * Hỗ trợ KPI A1/A2 (phản hồi lead trong giờ HC):
 *   - effectiveStart(createdAt, ctx) → mốc bắt đầu tính SLA (đẩy về 08:00 nếu ngoài giờ).
 *   - responseMinutes(createdAt, firstTouch, ctx) → số phút thực sự (sau khi loại nghỉ trưa, ngày lễ, phép).
 *   - isUserOff(userId, date) → true nếu NV nghỉ phép ngày đó.
 *
 * Cấu hình lấy từ DB (kpi_business_hours_config, kpi_holidays, kpi_user_leaves)
 * có cache 60s/lookup để tránh query lặp khi recompute KPI hàng loạt.
 */

const { supabase } = require('../config/supabase');

// ─── Cache đơn giản (TTL 60s) ────────────────────────────────────────────────
const TTL_MS = 60_000;
const _cache = { config: new Map(), holidays: null, leaves: new Map() };

function _isFresh(entry) { return entry && (Date.now() - entry.at) < TTL_MS; }

// ─── Load cấu hình giờ HC theo company (fallback global khi không có) ────────
async function loadConfig(companyId = null) {
  const key = companyId || '__default__';
  if (_isFresh(_cache.config.get(key))) return _cache.config.get(key).value;

  let row = null;
  if (companyId) {
    const { data } = await supabase
      .from('kpi_business_hours_config')
      .select('*').eq('company_id', companyId).eq('is_active', true)
      .maybeSingle();
    row = data;
  }
  if (!row) {
    const { data } = await supabase
      .from('kpi_business_hours_config')
      .select('*').is('company_id', null).eq('is_active', true)
      .maybeSingle();
    row = data;
  }

  const config = row || {
    start_minute: 480,
    end_minute: 1020,
    lunch_start_minute: 720,
    lunch_end_minute: 780,
    work_days: [1, 2, 3, 4, 5, 6],
    timezone: 'Asia/Ho_Chi_Minh',
  };
  // tz offset (chỉ hỗ trợ Asia/Ho_Chi_Minh = +7; nếu cần đa múi giờ → integrate luxon sau).
  config.tz_offset_hours = config.timezone === 'Asia/Ho_Chi_Minh' ? 7 : 0;

  _cache.config.set(key, { at: Date.now(), value: config });
  return config;
}

async function loadHolidays(companyId = null) {
  if (_isFresh(_cache.holidays)) return _cache.holidays.value;
  let q = supabase.from('kpi_holidays').select('company_id, holiday_date, repeat_yearly');
  const { data } = await q;
  const rows = data || [];
  const fixedSet = new Set();
  const recurring = [];
  for (const r of rows) {
    if (r.company_id && r.company_id !== companyId) continue;
    if (r.repeat_yearly) {
      const d = new Date(r.holiday_date);
      recurring.push({ month: d.getUTCMonth() + 1, day: d.getUTCDate() });
    } else {
      fixedSet.add(r.holiday_date);
    }
  }
  const value = { fixedSet, recurring };
  _cache.holidays = { at: Date.now(), value };
  return value;
}

async function loadUserLeaves(userId) {
  if (!userId) return [];
  if (_isFresh(_cache.leaves.get(userId))) return _cache.leaves.get(userId).value;
  const { data } = await supabase
    .from('kpi_user_leaves')
    .select('start_date, end_date, half_day, leave_type, status')
    .eq('user_id', userId).eq('status', 'approved');
  const value = data || [];
  _cache.leaves.set(userId, { at: Date.now(), value });
  return value;
}

function clearCache() {
  _cache.config.clear();
  _cache.holidays = null;
  _cache.leaves.clear();
}

// ─── Helpers thời gian ───────────────────────────────────────────────────────
function toLocal(d, tzOffset) {
  return new Date(new Date(d).getTime() + tzOffset * 3_600_000);
}
function toUtc(localDate, tzOffset) {
  return new Date(localDate.getTime() - tzOffset * 3_600_000);
}
function ymd(localDate) {
  return localDate.toISOString().slice(0, 10);
}
function isoWeekday(localDate) {
  const w = localDate.getUTCDay();
  return w === 0 ? 7 : w;
}
function localMinutes(localDate) {
  return localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
}

function isHolidayLocal(localDate, holidays) {
  const date = ymd(localDate);
  if (holidays.fixedSet.has(date)) return true;
  const m = localDate.getUTCMonth() + 1;
  const d = localDate.getUTCDate();
  return holidays.recurring.some((h) => h.month === m && h.day === d);
}

function isOnLeaveLocal(localDate, leaves) {
  const date = ymd(localDate);
  return leaves.some((l) => date >= l.start_date && date <= l.end_date && l.half_day === 'full');
}

function isWorkingDay(localDate, config, holidays, leaves) {
  if (!config.work_days.includes(isoWeekday(localDate))) return false;
  if (isHolidayLocal(localDate, holidays)) return false;
  if (isOnLeaveLocal(localDate, leaves)) return false;
  return true;
}

/**
 * Tìm "thời điểm bắt đầu giờ HC kế cận" của createdAt (UTC date).
 * - Trong giờ HC ngày làm: trả về createdAt.
 * - Trước giờ HC sáng (ngày làm): trả về 08:00 cùng ngày.
 * - Sau giờ HC chiều / cuối tuần / lễ / phép: trả về 08:00 ngày làm kế tiếp.
 * Lưu ý: không tự "trừ" giờ nghỉ trưa khỏi mốc bắt đầu (chỉ trừ khi đo khoảng giữa 2 mốc → xem businessMinutesBetween).
 */
async function effectiveStart(createdAt, { companyId = null, userId = null } = {}) {
  const config = await loadConfig(companyId);
  const holidays = await loadHolidays(companyId);
  const leaves = await loadUserLeaves(userId);
  const tz = config.tz_offset_hours;

  let local = toLocal(createdAt, tz);
  for (let i = 0; i < 30; i++) {
    if (isWorkingDay(local, config, holidays, leaves)) {
      const m = localMinutes(local);
      if (m >= config.start_minute && m < config.end_minute) {
        return new Date(createdAt);
      }
      if (m < config.start_minute) {
        const adj = new Date(local);
        adj.setUTCHours(0, config.start_minute, 0, 0);
        return toUtc(adj, tz);
      }
    }
    local = new Date(local.getTime() + 86_400_000);
    local.setUTCHours(0, config.start_minute, 0, 0);
  }
  return toUtc(local, tz);
}

/**
 * Số phút "trong giờ HC" giữa 2 mốc UTC. Đã trừ:
 *   - Giờ ngoài HC, cuối tuần, ngày lễ, phép full-day.
 *   - Khoảng nghỉ trưa nếu config có lunch_start_minute / lunch_end_minute.
 * Min = 0 (không bao giờ âm).
 */
async function businessMinutesBetween(startUtc, endUtc, { companyId = null, userId = null } = {}) {
  if (new Date(endUtc) <= new Date(startUtc)) return 0;
  const config = await loadConfig(companyId);
  const holidays = await loadHolidays(companyId);
  const leaves = await loadUserLeaves(userId);
  const tz = config.tz_offset_hours;

  let cursor = toLocal(startUtc, tz);
  const endLocal = toLocal(endUtc, tz);
  let total = 0;

  while (cursor < endLocal) {
    const dayStart = new Date(cursor); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000);

    if (isWorkingDay(cursor, config, holidays, leaves)) {
      const dayWorkStart = new Date(dayStart); dayWorkStart.setUTCMinutes(config.start_minute);
      const dayWorkEnd   = new Date(dayStart); dayWorkEnd.setUTCMinutes(config.end_minute);

      const segStart = new Date(Math.max(cursor.getTime(), dayWorkStart.getTime()));
      const segEnd   = new Date(Math.min(endLocal.getTime(), dayWorkEnd.getTime()));
      if (segEnd > segStart) {
        let mins = (segEnd - segStart) / 60_000;
        if (config.lunch_start_minute != null && config.lunch_end_minute != null) {
          const lunchStart = new Date(dayStart); lunchStart.setUTCMinutes(config.lunch_start_minute);
          const lunchEnd   = new Date(dayStart); lunchEnd.setUTCMinutes(config.lunch_end_minute);
          const overlap = Math.max(0,
            (Math.min(segEnd.getTime(), lunchEnd.getTime()) - Math.max(segStart.getTime(), lunchStart.getTime())) / 60_000,
          );
          mins -= overlap;
        }
        total += Math.max(0, mins);
      }
    }
    cursor = dayEnd;
  }
  return Math.max(0, total);
}

/**
 * Cộng số phút làm việc vào một mốc UTC.
 * Dùng cùng calendar với businessMinutesBetween: giờ làm, nghỉ trưa, cuối tuần,
 * ngày lễ và nghỉ phép full-day. Đây là phép toán nghịch để tạo deadline SLA.
 */
async function addBusinessMinutes(startUtc, minutes, { companyId = null, userId = null } = {}) {
  let remaining = Math.max(0, Number(minutes) || 0);
  const config = await loadConfig(companyId);
  const holidays = await loadHolidays(companyId);
  const leaves = await loadUserLeaves(userId);
  const tz = config.tz_offset_hours;
  const effective = await effectiveStart(startUtc, { companyId, userId });
  let cursor = toLocal(effective, tz);
  if (remaining <= 0) return toUtc(cursor, tz);

  for (let dayGuard = 0; dayGuard < 730; dayGuard++) {
    const dayStart = new Date(cursor); dayStart.setUTCHours(0, 0, 0, 0);
    if (isWorkingDay(cursor, config, holidays, leaves)) {
      const intervals = [];
      const workStart = new Date(dayStart); workStart.setUTCMinutes(config.start_minute);
      const workEnd = new Date(dayStart); workEnd.setUTCMinutes(config.end_minute);
      if (config.lunch_start_minute != null && config.lunch_end_minute != null) {
        const lunchStart = new Date(dayStart); lunchStart.setUTCMinutes(config.lunch_start_minute);
        const lunchEnd = new Date(dayStart); lunchEnd.setUTCMinutes(config.lunch_end_minute);
        intervals.push([workStart, lunchStart], [lunchEnd, workEnd]);
      } else {
        intervals.push([workStart, workEnd]);
      }

      for (const [intervalStart, intervalEnd] of intervals) {
        const segmentStart = new Date(Math.max(cursor.getTime(), intervalStart.getTime()));
        if (segmentStart >= intervalEnd) continue;
        const available = (intervalEnd.getTime() - segmentStart.getTime()) / 60_000;
        if (remaining <= available) {
          return toUtc(new Date(segmentStart.getTime() + remaining * 60_000), tz);
        }
        remaining -= available;
        cursor = intervalEnd;
      }
    }
    cursor = new Date(dayStart.getTime() + 86_400_000);
    cursor.setUTCMinutes(config.start_minute);
  }
  throw new Error('Không thể tính deadline theo lịch làm việc trong phạm vi 730 ngày.');
}

/** Số phút phản hồi tính theo giờ HC (cho A1/A2). */
async function responseMinutes(createdAt, firstTouchAt, ctx = {}) {
  const start = await effectiveStart(createdAt, ctx);
  if (new Date(firstTouchAt) <= start) return 0;
  return businessMinutesBetween(start, firstTouchAt, ctx);
}

/** Tiện ích: NV nghỉ ngày này không (full-day)? */
async function isUserOff(userId, date) {
  const leaves = await loadUserLeaves(userId);
  const d = typeof date === 'string' ? date : ymd(toLocal(date, 7));
  return leaves.some((l) => d >= l.start_date && d <= l.end_date && l.half_day === 'full');
}

module.exports = {
  effectiveStart,
  responseMinutes,
  businessMinutesBetween,
  addBusinessMinutes,
  isUserOff,
  loadConfig,
  loadHolidays,
  loadUserLeaves,
  clearCache,
};
