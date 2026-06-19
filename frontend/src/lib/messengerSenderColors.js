/** Màu tên người gửi trong nhóm — mỗi thành viên một chủ đề ổn định (theo user_id). */
export const SENDER_NAME_PALETTE = [
  '#DB2777',
  '#D97706',
  '#2563EB',
  '#7C3AED',
  '#059669',
  '#DC2626',
  '#0891B2',
  '#CA8A04',
  '#9333EA',
  '#EA580C',
];

/** Chữ đậm vừa + radial gradient mờ — dễ phân biệt, không chói. */
export const SENDER_BADGE_THEMES = [
  { text: '#9D174D', center: 'rgba(190, 24, 93, 0.19)', mid: 'rgba(190, 24, 93, 0.07)' },
  { text: '#B45309', center: 'rgba(180, 83, 9, 0.17)', mid: 'rgba(180, 83, 9, 0.06)' },
  { text: '#1D4ED8', center: 'rgba(37, 99, 235, 0.17)', mid: 'rgba(37, 99, 235, 0.06)' },
  { text: '#6D28D9', center: 'rgba(109, 40, 217, 0.17)', mid: 'rgba(109, 40, 217, 0.06)' },
  { text: '#047857', center: 'rgba(4, 120, 87, 0.17)', mid: 'rgba(4, 120, 87, 0.06)' },
  { text: '#B91C1C', center: 'rgba(185, 28, 28, 0.15)', mid: 'rgba(185, 28, 28, 0.05)' },
  { text: '#0E7490', center: 'rgba(14, 116, 144, 0.17)', mid: 'rgba(14, 116, 144, 0.06)' },
  { text: '#A16207', center: 'rgba(161, 98, 7, 0.16)', mid: 'rgba(161, 98, 7, 0.05)' },
  { text: '#7E22CE', center: 'rgba(126, 34, 206, 0.16)', mid: 'rgba(126, 34, 206, 0.05)' },
  { text: '#C2410C', center: 'rgba(194, 65, 12, 0.16)', mid: 'rgba(194, 65, 12, 0.05)' },
];

function senderThemeIndex(userId, fallbackName = '') {
  const key = String(userId || fallbackName || '?');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h + key.charCodeAt(i) * 13) % SENDER_BADGE_THEMES.length;
  return h;
}

export function getSenderBadgeTheme(userId, fallbackName = '') {
  return SENDER_BADGE_THEMES[senderThemeIndex(userId, fallbackName)];
}

export function senderNameColor(userId, fallbackName = '') {
  return getSenderBadgeTheme(userId, fallbackName).text;
}

export function buildSenderNameBadgeStyle(userId, fallbackName = '') {
  const theme = getSenderBadgeTheme(userId, fallbackName);
  return {
    color: theme.text,
    background: `radial-gradient(ellipse 110% 175% at 8% 50%, ${theme.center} 0%, ${theme.mid} 46%, transparent 70%)`,
  };
}

/** className + style cho badge tên người gửi trong chat nhóm. */
export function groupSenderNameProps(userId, name, { isBot = false, isGroupChat = true } = {}) {
  if (isBot) {
    return {
      className:
        'inline-block max-w-full truncate rounded-md px-1.5 py-px text-[length:inherit] font-semibold text-indigo-700 bg-indigo-50/90',
      style: undefined,
    };
  }
  if (!isGroupChat) {
    return {
      className: 'inline-block max-w-full truncate font-semibold text-violet-600',
      style: undefined,
    };
  }
  return {
    className: 'inline-block max-w-full truncate rounded-md px-1.5 py-px text-[length:inherit] font-semibold',
    style: buildSenderNameBadgeStyle(userId, name),
  };
}
