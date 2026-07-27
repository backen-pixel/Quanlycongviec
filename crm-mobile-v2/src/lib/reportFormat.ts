import { vnTodayYmd, vnDefaultMonthRange, ymdFromLocalDate } from './vnDate';

/** Số tiền đầy đủ — dùng khi cần chính xác tuyệt đối. */
export function formatVndExact(value?: number | null): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0đ';
  return `${Math.round(num).toLocaleString('vi-VN')}đ`;
}

/**
 * Rút gọn tiền báo cáo — luôn cắt xuống (floor), không làm tròn lên.
 * vd: 2.978.814.654đ → «2,978 tỷ» (không thành «2,979 tỷ» / «2 tỷ 979 tr»).
 */
export function formatVndShort(value?: number | null): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0đ';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1e9) {
    // Cắt tới 3 chữ số thập phân của tỷ (theo triệu đồng).
    const milliTy = Math.floor(abs / 1e6);
    const tyWhole = Math.floor(milliTy / 1000);
    const tyFrac = milliTy % 1000;
    if (tyFrac <= 0) return `${sign}${tyWhole.toLocaleString('vi-VN')} tỷ`;
    const fracStr = String(tyFrac).padStart(3, '0').replace(/0+$/, '');
    return `${sign}${tyWhole.toLocaleString('vi-VN')},${fracStr} tỷ`;
  }

  if (abs >= 1e6) {
    const tr = Math.floor(abs / 1e6);
    return `${sign}${tr.toLocaleString('vi-VN')} tr`;
  }

  if (abs >= 1e3) {
    const k = Math.floor(abs / 1e3);
    return `${sign}${k.toLocaleString('vi-VN')} k`;
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
