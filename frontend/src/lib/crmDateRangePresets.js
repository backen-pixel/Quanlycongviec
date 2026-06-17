/** Preset khoảng ngày — đồng bộ CRM Dashboard / Events / Lịch nghỉ. YYYY-MM-DD theo local. */
export function getCrmDateRangeFromPreset(preset) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'this_week': {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: iso(monday), to: iso(sunday) };
    }
    case 'last_week': {
      const dow = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const lastMon = new Date(thisMon);
      lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);
      return { from: iso(lastMon), to: iso(lastSun) };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'this_quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      const first = new Date(now.getFullYear(), qm, 1);
      const last = new Date(now.getFullYear(), qm + 3, 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'this_year':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
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
