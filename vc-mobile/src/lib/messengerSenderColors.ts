/** Màu tên người gửi trong nhóm — mỗi thành viên một màu ổn định. */
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

export function senderNameColor(userId: string | null | undefined, fallbackName = ''): string {
  const key = String(userId || fallbackName || '?');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h + key.charCodeAt(i) * 13) % SENDER_NAME_PALETTE.length;
  return SENDER_NAME_PALETTE[h]!;
}
