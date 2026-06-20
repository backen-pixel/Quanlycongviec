/**
 * Hệ màu cho CRM Mobile v2 — hỗ trợ 2 giao diện: Tối (mặc định) và Sáng.
 * Nền xanh-navy đậm (Tối) / trắng xám dịu (Sáng), accent xanh dương cho dữ liệu,
 * cam cháy (burnt-orange) cho nút Tạo mới và nhóm Deal.
 *
 * Dùng động trong component qua `useColors()` (theme/ThemeContext).
 * `Colors` mặc định = bảng màu Tối, giữ để tương thích code cũ / dùng ngoài component.
 */
export type ThemeColors = {
  bg: string;
  bgElevated: string;
  card: string;
  cardAlt: string;
  surfaceSoft: string;
  border: string;
  borderSoft: string;
  text: string;
  textMuted: string;
  textFaint: string;
  blue: string;
  blueSoft: string;
  cyan: string;
  orange: string;
  orangeDeep: string;
  orangeGlow: string;
  orangeSoft: string;
  green: string;
  greenSoft: string;
  amber: string;
  amberSoft: string;
  red: string;
  redSoft: string;
  purple: string;
  white: string;
  black: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;
};

export type ThemeMode = 'light' | 'dark';

export const DarkColors: ThemeColors = {
  // Nền
  bg: '#0B0F17',
  bgElevated: '#10151F',
  card: '#161C28',
  cardAlt: '#1B2230',
  surfaceSoft: '#1E2636',

  // Viền
  border: '#232C3D',
  borderSoft: '#1C2433',

  // Chữ
  text: '#F1F5F9',
  textMuted: '#9AA7BD',
  textFaint: '#5E6B82',

  // Accent xanh dương (Leads / dữ liệu)
  blue: '#2F6BFF',
  blueSoft: 'rgba(47,107,255,0.16)',
  cyan: '#38BDF8',

  // Cam cháy (Tạo mới / Deals)
  orange: '#F97316',
  orangeDeep: '#EA580C',
  orangeGlow: 'rgba(249,115,22,0.45)',
  orangeSoft: 'rgba(249,115,22,0.16)',

  // Trạng thái
  green: '#22C55E',
  greenSoft: 'rgba(34,197,94,0.16)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245,158,11,0.16)',
  red: '#EF4444',
  redSoft: 'rgba(239,68,68,0.14)',
  purple: '#A855F7',

  white: '#FFFFFF',
  black: '#000000',

  // Tab bar
  tabBarBg: '#0E131D',
  tabBarBorder: '#1B2433',
  tabActive: '#2F6BFF',
  tabInactive: '#647088',
};

export const LightColors: ThemeColors = {
  // Nền
  bg: '#F4F6FB',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F0F3F9',
  surfaceSoft: '#EEF2F8',

  // Viền
  border: '#E2E8F0',
  borderSoft: '#EDF1F6',

  // Chữ
  text: '#0F172A',
  textMuted: '#5A6B85',
  textFaint: '#94A3B8',

  // Accent xanh dương (Leads / dữ liệu)
  blue: '#2563EB',
  blueSoft: 'rgba(37,99,235,0.12)',
  cyan: '#0EA5E9',

  // Cam cháy (Tạo mới / Deals)
  orange: '#F97316',
  orangeDeep: '#EA580C',
  orangeGlow: 'rgba(249,115,22,0.35)',
  orangeSoft: 'rgba(249,115,22,0.12)',

  // Trạng thái
  green: '#16A34A',
  greenSoft: 'rgba(22,163,74,0.12)',
  amber: '#D97706',
  amberSoft: 'rgba(217,119,6,0.12)',
  red: '#DC2626',
  redSoft: 'rgba(220,38,38,0.10)',
  purple: '#9333EA',

  white: '#FFFFFF',
  black: '#000000',

  // Tab bar
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabActive: '#2563EB',
  tabInactive: '#94A3B8',
};

export const Palettes: Record<ThemeMode, ThemeColors> = {
  dark: DarkColors,
  light: LightColors,
};

/** Bảng màu mặc định (Tối) — tương thích code dùng ngoài component. */
export const Colors: ThemeColors = DarkColors;

export { ThemeProvider, useTheme, useColors } from './ThemeContext';

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
  full: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/** Padding ngang chuẩn màn hình CRM (khớp CrmHub). */
export const PAGE_HPAD = 14;

/** Gradient cam cháy đa sắc cho nút Tạo mới. */
export const CreateGradient = ['#FBBF24', '#F97316', '#EA580C', '#DB2777'] as const;

export const STAGE_FALLBACK_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316',
] as const;

export function stageColor(raw: string | null | undefined, index: number): string {
  if (raw && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  return STAGE_FALLBACK_COLORS[index % STAGE_FALLBACK_COLORS.length];
}

export const Shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  fab: {
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 14,
  },
} as const;
