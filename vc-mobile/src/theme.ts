/**
 * Bảng màu Vận chuyển & Lắp đặt (VC) — Dark / Light.
 */
export type ThemeMode = 'dark' | 'light';

export type AppColors = {
  bg: string;
  bgElevated: string;
  card: string;
  cardAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  white: string;
  /** Khối hiển thị giá trị trên card */
  valueBg: string;
  valueBorder: string;
  valueText: string;
  valueMuted: string;
  shadow: string;
};

export const darkColors: AppColors = {
  bg: '#0E1116',
  bgElevated: '#151A22',
  card: '#1B212C',
  cardAlt: '#202734',
  border: '#2A3342',
  borderStrong: '#39455A',
  text: '#EEF2F8',
  textMuted: '#9AA6BC',
  textFaint: '#6B7689',
  primary: '#EA580C',
  primaryDark: '#C2410C',
  primarySoft: '#3B1F12',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerSoft: '#2A1820',
  white: '#FFFFFF',
  valueBg: '#064E3B28',
  valueBorder: '#10B98155',
  valueText: '#6EE7B7',
  valueMuted: '#9AA6BC',
  shadow: '#000000',
};

export const lightColors: AppColors = {
  bg: '#F1F5F9',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  primary: '#EA580C',
  primaryDark: '#C2410C',
  primarySoft: '#FFF7ED',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  white: '#FFFFFF',
  valueBg: '#ECFDF5',
  valueBorder: '#A7F3D0',
  valueText: '#047857',
  valueMuted: '#64748B',
  shadow: '#64748B',
};

/** @deprecated Dùng `useTheme().colors` — giữ để tương thích tạm. */
export const Colors = darkColors;

export const themes: Record<ThemeMode, AppColors> = {
  dark: darkColors,
  light: lightColors,
};

export const Radii = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const HIT_TARGET = 44;

export const STAGE_FALLBACK_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316',
];

export function stageColor(raw: string | null | undefined, index: number): string {
  if (raw && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  return STAGE_FALLBACK_COLORS[index % STAGE_FALLBACK_COLORS.length];
}

/** Màu thanh tiến độ nhiệm vụ VC — đỏ → vàng → teal → xanh theo % hoàn thành */
export function getTaskProgressColor(percent: number, colors: AppColors): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (p >= 100) return colors.success;
  if (p >= 70) return '#14B8A6';
  if (p >= 35) return colors.warning;
  if (p > 0) return colors.danger;
  return colors.textFaint;
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6 && h.length !== 3) return hex;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/** Định dạng tiền đầy đủ: 35.000.000 (không rút gọn tr/trđ). */
export function formatMoneyAmount(value?: number | null): string | null {
  const n = Number(value || 0);
  if (!n) return null;
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n));
}
