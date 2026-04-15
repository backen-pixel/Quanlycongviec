/**
 * Blue-Corporate · Flat Design 2.0
 * Nền phẳng, card trắng, viền tinh, bóng rất nhẹ — bám UX web CRM (TuBep Pro).
 * Bo góc chuẩn card: 12px (CrmRadii.card / xl).
 */
export const CrmColors = {
  pageBg: '#EEF2F8',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFD',

  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',

  /** Corporate primary */
  blue50: '#EFF6FF',
  blue100: '#DBEAFE',
  blue500: '#3B82F6',
  blue600: '#1D5BD7',
  blue700: '#164FC4',
  blue800: '#133E99',
  blue900: '#0F2F6D',

  emerald100: '#D1FAE5',
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald700: '#047857',
  purple100: '#F3E8FF',
  purple700: '#6B21A8',
  rose500: '#F43F5E',
  red50: '#FEF2F2',
  red200: '#FECACA',
  red500: '#EF4444',
  red700: '#B91C1C',
  red800: '#991B1B',
  amber50: '#FFFBEB',
  amber100: '#FEF3C7',
  amber500: '#F59E0B',
  amber600: '#D97706',
  teal100: '#CCFBF1',
  teal800: '#115E59',
  indigo600: '#4F46E5',

  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabActive: '#1D5BD7',
  tabInactive: '#94A3B8',

  /** Sidebar / login accent (web TuBep) */
  sidebar: '#1B2A4A',
  sidebarText: '#94A3C6',
} as const;

/** Bo tròn chuẩn: card & khối lớn = 12px */
export const CrmRadii = {
  sm: 8,
  md: 10,
  lg: 12,
  card: 12,
  xl: 12,
  full: 9999,
} as const;

/** Flat 2.0: bóng rất nhẹ, không “nổi” */
export const CrmShadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
