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
    minute: vn.getUTCMinutes(),
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

/** Cộng N ngày làm việc (bỏ CN + lễ) kể từ ymd. */
function addSxWorkingDaysYmd(ymd, n, holidayIndex = null) {
  const steps = Math.max(0, Math.floor(Number(n) || 0));
  let cur = nextSxWorkingYmd(ymd, holidayIndex);
  if (!cur) return '';
  for (let i = 0; i < steps; i += 1) {
    cur = nextSxWorkingYmd(addCalendarDaysYmd(cur, 1), holidayIndex);
  }
  return cur;
}

function countSxWorkingDaysFromTo(fromYmd, toYmd, holidayIndex = null) {
  const a = String(fromYmd || '').slice(0, 10);
  const b = String(toYmd || '').slice(0, 10);
  if (!parseYmd(a) || !parseYmd(b)) return null;
  if (a === b) return 0;
  const forward = a < b;
  const start = forward ? a : b;
  const end = forward ? b : a;
  let count = 0;
  let cur = addCalendarDaysYmd(start, 1);
  let guard = 0;
  while (cur && cur <= end && guard < 800) {
    if (!isSxNonWorkingYmd(cur, holidayIndex)) count += 1;
    cur = addCalendarDaysYmd(cur, 1);
    guard += 1;
  }
  return forward ? count : -count;
}

function ymdFromUnknownDate(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isFinite(ms)) return vnNowParts(ms).ymd;
    return s.slice(0, 10);
  }
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return '';
  return vnNowParts(ms).ymd;
}

function resolveSxPlanInstallYmd(project) {
  const occ = Array.isArray(project?.install_occurrence_dates)
    ? project.install_occurrence_dates
    : [];
  for (const d of occ) {
    const y = ymdFromUnknownDate(d);
    if (y) return y;
  }
  return ymdFromUnknownDate(project?.install_date)
    || ymdFromUnknownDate(project?.delivery_date)
    || '';
}

/**
 * Số ngày mặc định của từng nhóm công đoạn, khi xưởng chưa đặt `sla_days` trên cột pipeline.
 *
 * Đúng bằng bảng cứng dùng trước đây — lắp D, đóng gói D−1, hoàn thiện D−3..D−2,
 * gia công D−5..D−4, kế hoạch …D−6 — nên công ty chưa cấu hình gì thì lịch không đổi một ngày.
 */
const SX_MAC_DINH_NGAY_NHOM = { packing: 1, finishing: 2, cabinet: 2 };

/** Thứ tự lùi: từ ngày lắp đi ngược lên. `planning` là phần còn lại, không có số ngày cố định. */
const SX_THU_TU_LUI = ['packing', 'finishing', 'cabinet'];

/**
 * Số ngày mỗi nhóm, đọc từ `sla_days` của các cột pipeline của công ty.
 *
 * Lấy MAX trong nhóm chứ không cộng dồn: trang Setup nói rõ «cột nhỏ bên trong chạy song song»,
 * nên thời gian của một cột lớn là cột nhỏ lâu nhất, không phải tổng các cột nhỏ.
 * Cột nào chưa đặt (0/null) thì nhóm đó rơi về mặc định.
 */
function ngayNhomTuCotPipeline(stages) {
  const out = { ...SX_MAC_DINH_NGAY_NHOM };
  if (!Array.isArray(stages) || !stages.length) return out;
  const max = {};
  for (const s of stages) {
    if (s?.is_active === false) continue;
    const g = sxStageDeadlineGroup(s, stages);
    if (!g || !SX_THU_TU_LUI.includes(g)) continue;
    const n = Math.floor(Number(s?.sla_days) || 0);
    if (n > 0) max[g] = Math.max(max[g] || 0, n);
  }
  for (const g of SX_THU_TU_LUI) if (max[g] > 0) out[g] = max[g];
  return out;
}

/**
 * Lịch lùi từ ngày lắp đặt.
 *
 * `ngayNhom` cho phép mỗi xưởng tự đặt số ngày từng công đoạn (xem `ngayNhomTuCotPipeline`).
 * Không truyền thì dùng mặc định — kết quả trùng khít bảng cứng cũ.
 *
 * Cách đi: nhóm cuối kết thúc TRƯỚC ngày lắp một ngày, rồi lùi dần; nhóm trước kết thúc trước
 * ngày bắt đầu của nhóm sau một ngày. `planning` nhận phần còn lại tới ngày tiếp nhận.
 */
function buildSxInstallBackPlan(installYmd, { startYmd = null, slipDays = 0, ngayNhom = null } = {}) {
  const install = String(installYmd || '').slice(0, 10);
  if (!parseYmd(install)) return null;

  const ngay = { ...SX_MAC_DINH_NGAY_NHOM, ...(ngayNhom || {}) };
  const moc = {};
  let ketThuc = addCalendarDaysYmd(install, -1);
  for (const g of SX_THU_TU_LUI) {
    const soNgay = Math.max(1, Math.floor(Number(ngay[g]) || 1));
    const batDau = addCalendarDaysYmd(ketThuc, -(soNgay - 1));
    moc[g] = { startYmd: batDau, endYmd: ketThuc };
    ketThuc = addCalendarDaysYmd(batDau, -1);
  }
  const planEnd = ketThuc;

  const start = startYmd ? String(startYmd).slice(0, 10) : '';
  const hasStart = Boolean(parseYmd(start));
  let planningEnd = planEnd;
  if (hasStart && start > planEnd) planningEnd = null;
  const slip = Math.max(0, Math.floor(Number(slipDays) || 0));
  const shift = (ymd) => (ymd && slip ? addCalendarDaysYmd(ymd, slip) : ymd);
  return {
    installYmd: install,
    productionFinishYmd: shift(moc.finishing.endYmd),
    packing: { endYmd: shift(moc.packing.endYmd), startYmd: shift(moc.packing.startYmd) },
    finishing: { endYmd: shift(moc.finishing.endYmd), startYmd: shift(moc.finishing.startYmd) },
    cabinet: { endYmd: shift(moc.cabinet.endYmd), startYmd: shift(moc.cabinet.startYmd) },
    planning: {
      startYmd: hasStart ? start : null,
      endYmd: hasStart && planningEnd && start <= planEnd ? planningEnd : (hasStart ? null : planEnd),
    },
    ngayNhom: ngay,
  };
}

function endYmdForDeadlineGroup(plan, group) {
  const key = String(group || '').trim();
  if (!plan || !key) return '';
  return String(plan[key]?.endYmd || '').slice(0, 10);
}

const SX_GROUP_KEY_DEADLINE = {
  tiep_nhan: 'planning',
  ke_hoach: 'planning',
  duyet: 'planning',
  gia_cong: 'cabinet',
  hoan_thien: 'finishing',
  dong_goi: 'packing',
  cong_no: null,
};

function sxStageDeadlineGroup(stage, siblingStages = null) {
  const raw = String(stage?.deadline_group || '').trim();
  if (raw) return raw;
  const k = String(stage?.group_key || '').trim();
  if (k && Object.prototype.hasOwnProperty.call(SX_GROUP_KEY_DEADLINE, k)) {
    return SX_GROUP_KEY_DEADLINE[k] || '';
  }
  if (k && Array.isArray(siblingStages)) {
    const sib = siblingStages.find((s) => (
      String(s?.group_key || '').trim() === k && String(s?.deadline_group || '').trim()
    ));
    if (sib) return String(sib.deadline_group).trim();
  }
  return '';
}

module.exports = {
  resolveSxReceptionYmd,
  resolveSxReceptionDateForCompany,
  loadSxHolidayIndex,
  nextSxWorkingYmd,
  isSxNonWorkingYmd,
  addCalendarDaysYmd,
  addSxWorkingDaysYmd,
  countSxWorkingDaysFromTo,
  vnNowParts,
  parseYmd,
  ymdFromUnknownDate,
  resolveSxPlanInstallYmd,
  buildSxInstallBackPlan,
  ngayNhomTuCotPipeline,
  SX_MAC_DINH_NGAY_NHOM,
  endYmdForDeadlineGroup,
  sxStageDeadlineGroup,
  SX_GROUP_KEY_DEADLINE,
};
