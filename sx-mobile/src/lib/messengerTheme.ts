import type { AppColors } from '../theme';

/** Bảng màu messenger — tím như mockup Tin nhắn */
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

export function getMessengerColors(colors: AppColors, isDark: boolean): MessengerColors {
  return {
    accent: '#6C5CE7',
    accentSoft: isDark ? 'rgba(108, 92, 231, 0.18)' : 'rgba(108, 92, 231, 0.12)',
    bubbleOut: '#6C5CE7',
    bubbleIn: isDark ? '#252830' : '#F1F5F9',
    bubbleInBorder: isDark ? colors.border : '#E2E8F0',
    online: '#22C55E',
    searchBg: isDark ? '#1A1F28' : '#F1F5F9',
    inputBg: isDark ? '#1A1F28' : '#F8FAFC',
    unreadBadge: '#6C5CE7',
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
