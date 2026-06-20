import { formatVnd } from './format';

export function formatVndShort(value?: number | null): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0đ';
  if (Math.abs(num) >= 1e9) {
    return `${(num / 1e9).toFixed(1).replace('.', ',')} tỷ`;
  }
  if (Math.abs(num) >= 1e6) {
    return `${(num / 1e6).toFixed(1).replace('.', ',')} tr`;
  }
  return formatVnd(num);
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

export function defaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { from, to };
}

export function shiftMonthRange(from: string, to: string, delta: number): { from: string; to: string } {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = parse(from);
  start.setMonth(start.getMonth() + delta, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { from: fmt(start), to: fmt(end) };
}
