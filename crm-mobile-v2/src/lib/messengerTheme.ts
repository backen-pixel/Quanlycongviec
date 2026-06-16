import type { ThemeColors } from '../theme';

/** Bảng màu messenger — đồng bộ từ sx-mobile, accent theo CRM blue. */
export type MessengerColors = {
  accent: string;
  accentSoft: string;
  bubbleOut: string;
  bubbleIn: string;
  bubbleInBorder: string;
  online: string;
  searchBg: string;
  inputBg: string;
  unreadBadge: string;
};

export function getMessengerColors(colors: ThemeColors, isDark: boolean): MessengerColors {
  return {
    accent: colors.blue,
    accentSoft: colors.blueSoft,
    bubbleOut: colors.blue,
    bubbleIn: isDark ? colors.card : colors.surfaceSoft,
    bubbleInBorder: colors.border,
    online: colors.green,
    searchBg: isDark ? colors.card : colors.surfaceSoft,
    inputBg: isDark ? colors.card : colors.bgElevated,
    unreadBadge: colors.blue,
  };
}

export const AVATAR_PALETTE = [
  '#EC4899',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
];

export function avatarColorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * 17) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h]!;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] || ''}${parts[parts.length - 1]![0] || ''}`.toUpperCase();
}
