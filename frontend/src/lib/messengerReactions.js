/** Emoji phản ứng nhanh — đồng bộ với mobile QUICK_REACTIONS */
export const MESSENGER_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function normalizeMessengerReactions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const emoji = String(item.emoji ?? item.reaction ?? '').trim();
    if (!emoji) continue;
    out.push({
      emoji,
      user_id: item.user_id != null ? String(item.user_id) : null,
      user: item.user || null,
    });
  }
  return out;
}

/** @returns {{ emoji: string, count: number, mine: boolean }[]} */
export function groupMessengerReactions(reactions, myId) {
  const m = new Map();
  for (const r of normalizeMessengerReactions(reactions)) {
    const e = (r.emoji || '').trim();
    if (!e) continue;
    const prev = m.get(e) || { count: 0, mine: false };
    m.set(e, {
      count: prev.count + 1,
      mine: prev.mine || String(r.user_id) === String(myId),
    });
  }
  return [...m.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

export function mergeMessengerMessage(prev, incoming) {
  const recalled_at = incoming.recalled_at ?? prev.recalled_at ?? null;
  const is_recalled = !!(incoming.is_recalled || recalled_at || prev.is_recalled);
  return {
    ...prev,
    ...incoming,
    user: incoming.user ?? prev.user,
    recalled_at,
    recalled_by: incoming.recalled_by ?? prev.recalled_by ?? null,
    is_recalled,
    reactions:
      incoming.reactions != null
        ? normalizeMessengerReactions(incoming.reactions)
        : prev.reactions,
  };
}

export function isMessengerMessageRecalled(m) {
  return !!(m?.recalled_at || m?.is_recalled);
}
