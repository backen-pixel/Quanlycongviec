/**
 * Hệ màu tối cho CRM Mobile v2.
 * Nền xanh-navy đậm, card nổi nhẹ, accent xanh dương cho dữ liệu,
 * cam cháy (burnt-orange) cho nút Tạo mới và nhóm Deal.
 */
export const Colors = {
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
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

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
