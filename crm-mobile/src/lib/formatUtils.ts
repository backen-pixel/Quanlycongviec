export function formatVND(v: number | null | undefined): string {
  const n = Number(v) || 0;
  if (n <= 0) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('vi-VN');
  } catch {
    return '—';
  }
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('vi-VN');
  } catch {
    return '—';
  }
}

export function calculateDays(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/** Giống web: màu nền stage = màu + alpha hex (vd #2563eb20) */
export function stageTintBg(hex: string | undefined, fallback = '#94a3b8'): string {
  const raw = (hex || fallback).trim();
  if (!raw.startsWith('#') || (raw.length !== 7 && raw.length !== 4)) {
    return `${fallback}20`;
  }
  const expand = raw.length === 4 ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` : raw;
  return `${expand}20`;
}
