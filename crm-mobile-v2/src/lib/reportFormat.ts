import { vnTodayYmd, vnDefaultMonthRange, ymdFromLocalDate } from './vnDate';

/** Số tiền đầy đủ — dùng khi cần chính xác tuyệt đối. */
export function formatVndExact(value?: number | null): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0đ';
  return `${Math.round(num).toLocaleString('vi-VN')}đ`;
}

/** Tiền báo cáo rút gọn — dễ nhìn trên card KPI (vd: 3,9 tỷ · 850 tr). */
export function formatVndShort(value?: number | null): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0đ';
  if (Math.abs(num) >= 1e9) {
    return `${(num / 1e9).toFixed(1).replace('.', ',')} tỷ`;
  }
  if (Math.abs(num) >= 1e6) {
    return `${(num / 1e6).toFixed(1).replace('.', ',')} tr`;
  }
  return formatVndExact(num);
}

export function formatKpiLedgerNet(value?: number | null): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

export function formatViDateIso(iso?: string | null): string {
  if (!iso || typeof iso !== 'string') return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Thời gian tương đối — dùng cho feed hoạt động realtime. */
export function formatRelativeTimeVi(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 45) return 'Vừa xong';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return formatViDateIso(iso);
}

export function defaultMonthRange(): { from: string; to: string } {
  return getReportRangeForPreset('month');
}

export type ReportPeriodPreset = 'day' | 'week' | 'month' | 'year';

export function isoLocalDate(d: Date): string {
  return ymdFromLocalDate(d);
}

export function parseIsoLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Khoảng ngày theo preset — lịch VN (khớp backend +07). */
export function getReportRangeForPreset(
  preset: ReportPeriodPreset,
  ref: Date = new Date(),
): { from: string; to: string } {
  const todayYmd = vnTodayYmd(ref);
  const [y, m, d] = todayYmd.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  switch (preset) {
    case 'day':
      return { from: todayYmd, to: todayYmd };
    case 'week': {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: ymdFromLocalDate(monday), to: ymdFromLocalDate(sunday) };
    }
    case 'month':
      return vnDefaultMonthRange(ref);
    case 'year':
    default:
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

export function shiftReportRange(
  preset: ReportPeriodPreset,
  from: string,
  to: string,
  delta: number,
): { from: string; to: string } {
  if (preset === 'month') {
    return shiftMonthRange(from, to, delta);
  }
  if (preset === 'year') {
    const y = parseIsoLocalDate(from).getFullYear() + delta;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const anchor = parseIsoLocalDate(from);
  if (preset === 'day') {
    anchor.setDate(anchor.getDate() + delta);
    const iso = isoLocalDate(anchor);
    return { from: iso, to: iso };
  }
  anchor.setDate(anchor.getDate() + delta * 7);
  return getReportRangeForPreset('week', anchor);
}

export function formatReportRangeLabel(
  preset: ReportPeriodPreset,
  from: string,
  to: string,
): string {
  if (preset === 'day' || from === to) return formatViDateIso(from);
  if (preset === 'year') return `Năm ${from.slice(0, 4)}`;
  return `${formatViDateIso(from)} – ${formatViDateIso(to)}`;
}

export const REPORT_PERIOD_OPTIONS: { key: ReportPeriodPreset; label: string }[] = [
  { key: 'day', label: 'Ngày' },
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
  { key: 'year', label: 'Năm' },
];

export function shiftMonthRange(from: string, to: string, delta: number): { from: string; to: string } {
  const parse = (s: string) => parseIsoLocalDate(s);
  const fmt = isoLocalDate;
  const start = parse(from);
  start.setMonth(start.getMonth() + delta, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { from: fmt(start), to: fmt(end) };
}
