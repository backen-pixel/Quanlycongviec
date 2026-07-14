import type { LeadMember } from './projectDetailApi';

export const COMMENT_MENTION_ALL_LABEL = 'Tất cả';

export type CommentMentionMember = {
  id: string;
  name: string;
  avatar?: string | null;
};

export type CommentMentionPickerItem =
  | { type: 'all'; key: string }
  | { type: 'member'; key: string; mem: CommentMentionMember };

function normalizeMentionSearch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapLeadMembersToMentionMembers(members: LeadMember[]): CommentMentionMember[] {
  return (members || [])
    .map((m) => ({
      id: String(m.user_id || m.user?.id || ''),
      name: String(m.user?.full_name || m.user?.email || '').trim(),
      avatar: m.user?.avatar ?? null,
    }))
    .filter((m) => m.id && m.name);
}

export function buildCommentMentionPickerItems(
  draft: string,
  cursor: number,
  members: CommentMentionMember[],
  myId: string,
): { open: boolean; start: number; items: CommentMentionPickerItem[] } {
  const before = draft.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1) return { open: false, start: 0, items: [] };
  const frag = before.slice(at + 1);
  if (frag.includes('\n')) return { open: false, start: at, items: [] };
  const q = normalizeMentionSearch(frag);
  const items: CommentMentionPickerItem[] = [];
  const allNorm = normalizeMentionSearch(COMMENT_MENTION_ALL_LABEL);
  if (!q || allNorm.includes(q) || q === 'tat' || q === 'all' || q === 'ta') {
    items.push({ type: 'all', key: '__mention_all__' });
  }
  members
    .filter((mem) => String(mem.id) !== String(myId))
    .filter((mem) => {
      if (!q) return true;
      return normalizeMentionSearch(mem.name).includes(q);
    })
    .slice(0, 8)
    .forEach((mem) => items.push({ type: 'member', key: String(mem.id), mem }));

  return { open: items.length > 0, start: at, items };
}

export function applyCommentMentionPick(
  draft: string,
  cursor: number,
  mentionStart: number,
  item: CommentMentionPickerItem,
): { text: string; cursor: number; pickedId?: string } {
  const before = draft.slice(0, mentionStart);
  const after = draft.slice(cursor);
  const insert =
    item.type === 'all'
      ? `@${COMMENT_MENTION_ALL_LABEL} `
      : `@${item.mem.name.trim()} `;
  const text = before + insert + after;
  return {
    text,
    cursor: before.length + insert.length,
    pickedId: item.type === 'member' ? item.mem.id : undefined,
  };
}

export function resolveCommentMentionIds(
  content: string,
  members: CommentMentionMember[],
  opts?: { excludeUserId?: string; pickedIds?: string[] },
): string[] {
  const ex = opts?.excludeUserId != null ? String(opts.excludeUserId) : '';
  const ids = new Set<string>((opts?.pickedIds || []).map(String).filter((id) => id && id !== ex));

  const text = String(content || '');
  if (/@(tất\s*cả|tat\s*ca|all)\b/i.test(text)) {
    for (const mem of members) {
      if (mem.id && String(mem.id) !== ex) ids.add(String(mem.id));
    }
  }

  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '@') continue;
    const after = text.slice(i + 1);
    if (/^(tất\s*cả|tat\s*ca|all)\b/i.test(after)) continue;
    for (const mem of sorted) {
      const name = mem.name;
      if (!name) continue;
      if (
        after.toLowerCase().startsWith(name.toLowerCase())
        && (after.length === name.length || /[\s,.!?;:\n]/.test(after[name.length] || ''))
      ) {
        if (String(mem.id) !== ex) ids.add(String(mem.id));
        i += name.length;
        break;
      }
    }
  }
  return [...ids].slice(0, 500);
}
