/** Preset khoảng ngày — đồng bộ CRM Dashboard / Events / Lịch nghỉ. YYYY-MM-DD theo lịch VN. */
import { vnTodayYmd, vnDefaultMonthRange, ymdFromLocalDate, vnAddDaysYmd } from './vnDate';

export function getCrmDateRangeFromPreset(preset) {
  const todayYmd = vnTodayYmd();
  const [y, m] = todayYmd.split('-').map(Number);
  const today = new Date(y, m - 1, Number(todayYmd.slice(8, 10)));
  switch (preset) {
    case 'today':
      return { from: todayYmd, to: todayYmd };
    case 'this_week': {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: ymdFromLocalDate(monday), to: ymdFromLocalDate(sunday) };
    }
    case 'last_week': {
      const dow = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const lastMon = new Date(thisMon);
      lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);
      return { from: ymdFromLocalDate(lastMon), to: ymdFromLocalDate(lastSun) };
    }
    case 'this_month':
      return vnDefaultMonthRange();
    case 'last_month': {
      const firstThis = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastPrev = vnAddDaysYmd(firstThis, -1);
      const [py, pm] = lastPrev.split('-').map(Number);
      return { from: `${py}-${String(pm).padStart(2, '0')}-01`, to: lastPrev };
    }
    case 'this_quarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      const first = `${y}-${String(qm).padStart(2, '0')}-01`;
      const lastM = qm + 2;
      const last = new Date(Date.UTC(y, lastM, 0));
      const to = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
      return { from: first, to };
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: '', to: '' };
  }
}

export const CRM_TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'last_week', label: 'Tuần trước' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'last_month', label: 'Tháng trước' },
  { key: 'this_quarter', label: 'Quý này' },
  { key: 'this_year', label: 'Năm này' },
  { key: 'custom', label: 'Tùy chỉnh…' },
];

/** Đơn nghỉ giao với khoảng [from, to] (YYYY-MM-DD). */
export function leaveOverlapsRange(leave, from, to) {
  if (!from && !to) return true;
  const start = leave.start_date || '';
  const end = leave.end_date || start;
  const f = from || '1970-01-01';
  const t = to || '2099-12-31';
  return end >= f && start <= t;
}
