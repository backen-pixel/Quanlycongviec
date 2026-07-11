import type { MessengerMessage, MessengerReaction } from '../types/messenger';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export function normalizeReactions(raw: unknown): MessengerReaction[] {
  if (!Array.isArray(raw)) return [];
  const out: MessengerReaction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const emoji = String(row.emoji ?? row.reaction ?? '').trim();
    if (!emoji) continue;
    out.push({
      emoji,
      user_id: row.user_id != null ? String(row.user_id) : null,
      user: row.user as MessengerReaction['user'],
    });
  }
  return out;
}

export type ReactionGroup = { emoji: string; count: number; mine: boolean };

export function groupReactions(
  reactions: MessengerReaction[] | null | undefined,
  myId: string,
): ReactionGroup[] {
  const m = new Map<string, { count: number; mine: boolean }>();
  for (const r of normalizeReactions(reactions)) {
    const e = (r.emoji || '').trim();
    if (!e) continue;
    const prev = m.get(e) || { count: 0, mine: false };
    m.set(e, {
      count: prev.count + 1,
      mine: prev.mine || String(r.user_id) === myId,
    });
  }
  return Array.from(m.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

export function mergeMessengerMessage(
  prev: MessengerMessage,
  incoming: Partial<MessengerMessage>,
): MessengerMessage {
  const recalled_at = incoming.recalled_at ?? prev.recalled_at ?? null;
  const is_recalled = !!(incoming.is_recalled || recalled_at || prev.is_recalled);
  return {
    ...prev,
    ...incoming,
    user: incoming.user ?? prev.user,
    reply_to_message: incoming.reply_to_message ?? prev.reply_to_message,
    recalled_at,
    recalled_by: incoming.recalled_by ?? prev.recalled_by ?? null,
    is_recalled,
    reactions:
      incoming.reactions != null
        ? normalizeReactions(incoming.reactions)
        : prev.reactions,
  };
}
