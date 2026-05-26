/** Cảm xúc — đồng bộ backend `internal_social_likes.reaction` */

export const REACTION_OPTIONS = [
  { key: 'like', emoji: '👍', label: 'Thích' },
  { key: 'love', emoji: '❤️', label: 'Yêu thích' },
  { key: 'care', emoji: '🤗', label: 'Thương thương' },
  { key: 'haha', emoji: '😆', label: 'Haha' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'sad', emoji: '😢', label: 'Buồn' },
  { key: 'angry', emoji: '😠', label: 'Phẫn nộ' },
];

export const REACTION_EMOJI = Object.fromEntries(REACTION_OPTIONS.map((o) => [o.key, o.emoji]));

export function totalReactionCount(reactionCounts, fallback = 0) {
  const rc = reactionCounts && typeof reactionCounts === 'object' ? reactionCounts : {};
  const sum = Object.values(rc).reduce((a, n) => a + (Number(n) || 0), 0);
  return sum > 0 ? sum : Number(fallback) || 0;
}

export function topReactionKeys(reactionCounts, limit = 3) {
  const rc = reactionCounts && typeof reactionCounts === 'object' ? reactionCounts : {};
  return Object.keys(rc)
    .filter((k) => rc[k] > 0)
    .sort((a, b) => (rc[b] || 0) - (rc[a] || 0))
    .slice(0, limit);
}

export function reactionLabel(key) {
  return REACTION_OPTIONS.find((o) => o.key === key)?.label || 'Thích';
}
