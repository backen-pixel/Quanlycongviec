/**
 * Lịch tiếp nhận / đếm ngày làm việc SX:
 * - Tiếp nhận: trước 12:00 VN = hôm nay; từ 12:00 = ngày mai; bỏ CN + ngày lễ → ngày làm kế.
 * - Đếm ngày LV: bỏ Chủ nhật + kpi_holidays (không bỏ thứ Bảy).
 */

function parseYmd(ymd) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

export function formatYmdUtc(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parts ngày giờ hiện tại theo Asia/Ho_Chi_Minh. */
export function vnNowParts(nowMs = Date.now()) {
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

export function addCalendarDaysYmd(ymd, deltaDays) {
  const p = parseYmd(ymd);
  if (!p) return '';
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return '';
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return formatYmdUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Chuẩn hóa danh sách lễ từ API /kpi/holidays → { fixed, recurring }. */
export function normalizeHolidayIndex(rows) {
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

export function isSxHolidayYmd(ymd, holidayIndex) {
  const p = parseYmd(ymd);
  if (!p) return false;
  const idx = holidayIndex || { fixed: new Set(), recurring: [] };
  if (idx.fixed?.has(ymd)) return true;
  return (idx.recurring || []).some((h) => h.month === p.mo && h.day === p.d);
}

/** Chủ nhật hoặc ngày lễ. */
export function isSxNonWorkingYmd(ymd, holidayIndex) {
  const p = parseYmd(ymd);
  if (!p) return true;
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay(); // 0 = CN
  if (dow === 0) return true;
  return isSxHolidayYmd(ymd, holidayIndex);
}

/** Cộng N ngày làm việc (bỏ CN + lễ) kể từ ymd. */
export function addSxWorkingDaysYmd(ymd, n, holidayIndex = null) {
  const steps = Math.max(0, Math.floor(Number(n) || 0));
  let cur = nextSxWorkingYmd(ymd, holidayIndex);
  if (!cur) return '';
  for (let i = 0; i < steps; i += 1) {
    cur = nextSxWorkingYmd(addCalendarDaysYmd(cur, 1), holidayIndex);
  }
  return cur;
}

export function nextSxWorkingYmd(ymd, holidayIndex, maxSteps = 60) {
  let cur = String(ymd || '').slice(0, 10);
  if (!parseYmd(cur)) return '';
  for (let i = 0; i < maxSteps; i += 1) {
    if (!isSxNonWorkingYmd(cur, holidayIndex)) return cur;
    cur = addCalendarDaysYmd(cur, 1);
  }
  return cur;
}

/**
 * Ngày tiếp nhận xưởng từ mốc setup (Date | ms | ISO).
 * < 12:00 VN → hôm đó; ≥ 12:00 → hôm sau; rồi đẩy tới ngày làm việc.
 */
export function resolveSxReceptionYmd(setupAt = Date.now(), holidayIndex = null) {
  const ms = setupAt instanceof Date ? setupAt.getTime() : new Date(setupAt).getTime();
  if (!Number.isFinite(ms)) return nextSxWorkingYmd(vnNowParts().ymd, holidayIndex);
  const parts = vnNowParts(ms);
  let ymd = parts.ymd;
  if (parts.hour >= 12) {
    ymd = addCalendarDaysYmd(ymd, 1);
  }
  return nextSxWorkingYmd(ymd, holidayIndex);
}

/**
 * Số ngày làm việc từ fromYmd → toYmd (cùng quy ước badge cũ: to − from).
 * Đếm mỗi ngày D với from < D ≤ to và D là ngày làm việc.
 * Âm nếu to < from (quá hạn theo số ngày LV đã qua).
 */
export function countSxWorkingDaysFromTo(fromYmd, toYmd, holidayIndex = null) {
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

/**
 * Badge urgency theo số ngày LV còn lại (từ hôm nay hoặc từ reception nếu chưa tới).
 */
export function sxScheduleLeadDaysBadge(days) {
  if (days == null || !Number.isFinite(days)) return null;
  if (days < 0) {
    return { className: 'bg-red-800 text-white', text: `Quá hạn ${Math.abs(days)} ngày LV` };
  }
  if (days === 0) return { className: 'bg-red-600 text-white', text: 'Hôm nay (LV)' };
  if (days === 1) return { className: 'bg-red-500 text-white', text: 'Còn 1 ngày LV' };
  if (days === 2) return { className: 'bg-orange-500 text-white', text: 'Còn 2 ngày LV' };
  if (days === 3) return { className: 'bg-orange-400 text-orange-950', text: 'Còn 3 ngày LV' };
  if (days === 4) return { className: 'bg-amber-400 text-amber-950', text: 'Còn 4 ngày LV' };
  if (days === 5) return { className: 'bg-yellow-300 text-yellow-950', text: 'Còn 5 ngày LV' };
  if (days === 6) return { className: 'bg-sky-300 text-sky-950', text: 'Còn 6 ngày LV' };
  return { className: 'bg-blue-600 text-white', text: `Còn ${days} ngày LV` };
}

/**
 * Số ngày LV còn lại tới targetYmd.
 * start = max(today, receptionYmd) nếu có reception; không thì today.
 */
export function remainingSxWorkingDaysTo(targetYmd, {
  nowMs = Date.now(),
  receptionYmd = null,
  holidayIndex = null,
} = {}) {
  const today = vnNowParts(nowMs).ymd;
  let start = today;
  const recv = receptionYmd ? String(receptionYmd).slice(0, 10) : '';
  if (recv && parseYmd(recv) && recv > today) start = recv;
  return countSxWorkingDaysFromTo(start, targetYmd, holidayIndex);
}

/**
 * Kế hoạch SX tính ngược từ ngày lắp (ngày lịch, không bỏ CN/lễ):
 * lắp → đóng hàng 1 → hoàn thiện 2 → hoàn thiện thùng 2 → phần còn lại = kế hoạch.
 * Ngày hoàn thiện SX (production_finish) = cuối hoàn thiện = lắp − 2.
 */
export const SX_INSTALL_BACK_PLAN = {
  packingDays: 1,
  finishDays: 2,
  cabinetDays: 2,
  /** Tổng ngày cố định trước ngày lắp (1+2+2). */
  fixedDaysBeforeInstall: 5,
};

export const SX_INSTALL_BACK_PLAN_RULES = [
  'Tính ngược từ ngày lắp đặt (ngày lịch).',
  'Đóng hàng / đóng gói: 1 ngày (ngay trước ngày lắp).',
  'Hoàn thiện: 2 ngày (trước đóng hàng). Ngày hoàn thiện SX = cuối công đoạn này (= lắp − 2).',
  'Hoàn thiện thùng: 2 ngày (trước hoàn thiện).',
  'Kế hoạch sản xuất: toàn bộ ngày còn lại từ ngày tiếp nhận xưởng đến hết ngày trước hoàn thiện thùng.',
];

/** Nhóm deadline cột pipeline SX — khớp kế hoạch lắp (production_pipeline_stages.deadline_group). */
export const SX_DEADLINE_GROUPS = [
  {
    value: 'planning',
    label: 'Kế hoạch SX',
    shortLabel: 'Kế hoạch',
    hint: 'Phần còn lại từ tiếp nhận → trước hoàn thiện thùng',
    className: 'bg-violet-50 text-violet-800 border-violet-200',
    headerClassName: 'bg-violet-100 text-violet-900 border-violet-200',
  },
  {
    value: 'cabinet',
    label: 'Hoàn thiện thùng',
    shortLabel: 'Thùng',
    hint: '2 ngày trước hoàn thiện',
    className: 'bg-amber-50 text-amber-900 border-amber-200',
    headerClassName: 'bg-amber-100 text-amber-950 border-amber-200',
  },
  {
    value: 'finishing',
    label: 'Hoàn thiện',
    shortLabel: 'Hoàn thiện',
    hint: '2 ngày trước đóng hàng (= lắp − 2 là hạn cuối)',
    className: 'bg-teal-50 text-teal-900 border-teal-200',
    headerClassName: 'bg-teal-100 text-teal-950 border-teal-200',
  },
  {
    value: 'packing',
    label: 'Đóng hàng / đóng gói',
    shortLabel: 'Đóng gói',
    hint: '1 ngày ngay trước ngày lắp',
    className: 'bg-orange-50 text-orange-900 border-orange-200',
    headerClassName: 'bg-orange-100 text-orange-950 border-orange-200',
  },
];

export function sxDeadlineGroupMeta(value) {
  const key = String(value || '').trim();
  if (!key) return null;
  return SX_DEADLINE_GROUPS.find((g) => g.value === key) || null;
}

export function normalizeSxDeadlineGroup(value) {
  const key = String(value || '').trim();
  if (!key) return null;
  return SX_DEADLINE_GROUPS.some((g) => g.value === key) ? key : null;
}

function inclusiveCalendarDays(fromYmd, toYmd) {
  const a = String(fromYmd || '').slice(0, 10);
  const b = String(toYmd || '').slice(0, 10);
  if (!parseYmd(a) || !parseYmd(b)) return null;
  if (a > b) return 0;
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000) + 1;
}

/**
 * @param {string} installYmd YYYY-MM-DD ngày lắp
 * @param {{ startYmd?: string|null }} opts startYmd = ngày tiếp nhận / bắt đầu SX
 * @returns {null|{ installYmd, packing, finishing, cabinet, planning, productionFinishYmd }}
 */
export function buildSxInstallBackPlan(installYmd, { startYmd = null, slipDays = 0 } = {}) {
  const install = String(installYmd || '').slice(0, 10);
  if (!parseYmd(install)) return null;

  // Lắp D → đóng D-1 → hoàn thiện D-3..D-2 → thùng D-5..D-4 → kế hoạch …..D-6
  const packingEnd = addCalendarDaysYmd(install, -1);
  const packingStart = packingEnd;
  const finishEnd = addCalendarDaysYmd(install, -2);
  const finishStartYmd = addCalendarDaysYmd(install, -3);
  const cabinetEnd = addCalendarDaysYmd(install, -4);
  const cabinetStart = addCalendarDaysYmd(install, -5);
  const planEnd = addCalendarDaysYmd(install, -6);

  const start = startYmd ? String(startYmd).slice(0, 10) : '';
  const hasStart = Boolean(parseYmd(start));
  let planningStart = hasStart ? start : null;
  let planningEnd = planEnd;
  let planningDays = null;
  if (hasStart && planEnd) {
    if (start > planEnd) {
      planningDays = 0;
      planningEnd = null;
    } else {
      planningDays = inclusiveCalendarDays(start, planEnd);
    }
  }

  const slip = Math.max(0, Math.floor(Number(slipDays) || 0));
  const shift = (ymd) => (ymd && slip ? addCalendarDaysYmd(ymd, slip) : ymd);
  const shiftedFinish = shift(finishEnd);
  const shiftedPackingEnd = shift(packingEnd);
  const installCollision = Boolean(
    install && shiftedFinish && shiftedFinish >= install,
  );

  return {
    installYmd: install,
    productionFinishYmd: shiftedFinish,
    slipDays: slip,
    installCollision,
    packing: {
      key: 'packing',
      label: 'Đóng hàng',
      daysFixed: SX_INSTALL_BACK_PLAN.packingDays,
      startYmd: shift(packingStart),
      endYmd: shiftedPackingEnd,
    },
    finishing: {
      key: 'finishing',
      label: 'Hoàn thiện',
      daysFixed: SX_INSTALL_BACK_PLAN.finishDays,
      startYmd: shift(finishStartYmd),
      endYmd: shiftedFinish,
    },
    cabinet: {
      key: 'cabinet',
      label: 'Hoàn thiện thùng',
      daysFixed: SX_INSTALL_BACK_PLAN.cabinetDays,
      startYmd: shift(cabinetStart),
      endYmd: shift(cabinetEnd),
    },
    planning: {
      key: 'planning',
      label: 'Kế hoạch sản xuất',
      daysFixed: null,
      days: planningDays,
      startYmd: planningStart,
      endYmd: hasStart && planningEnd && start <= planEnd ? planningEnd : (hasStart ? null : planEnd),
      minHintDays: 1,
    },
  };
}
