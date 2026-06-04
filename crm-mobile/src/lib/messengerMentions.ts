import type { MessengerMember } from '../types/messenger';

export const MESSENGER_MENTION_ALL_LABEL = 'Tất cả';

function normalizeMentionSearch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contentHasMentionAll(content: string): boolean {
  return /@(tất\s*cả|tat\s*ca|all)\b/i.test(String(content || ''));
}

export function resolveMentionIdsFromContent(
  content: string,
  members: MessengerMember[],
  opts?: { excludeUserId?: string },
): string[] {
  const ids: string[] = [];
  if (!content?.trim() || !members?.length) return ids;
  const ex = opts?.excludeUserId != null ? String(opts.excludeUserId) : '';

  if (contentHasMentionAll(content)) {
    for (const mem of members) {
      const id = mem.user_id;
      if (id && String(id) !== ex && !ids.includes(id)) ids.push(id);
    }
  }

  const stripped = String(content).replace(/@(tất\s*cả|tat\s*ca|all)\b/gi, ' ');
  const re = /@([^\s\n@]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    const piece = m[1].toLowerCase();
    const pieceCompact = piece.replace(/\s/g, '');
    for (const mem of members) {
      const name = (mem.user?.full_name || mem.user?.email || '').trim();
      if (!name) continue;
      const low = name.toLowerCase();
      const lowCompact = low.replace(/\s/g, '');
      if (low.startsWith(piece) || lowCompact.startsWith(pieceCompact)) {
        const id = mem.user_id;
        if (id && String(id) !== ex && !ids.includes(id)) ids.push(id);
        break;
      }
    }
  }
  return ids;
}

export function mentionAllPickerMatchesQuery(frag: string): boolean {
  const q = normalizeMentionSearch(frag);
  if (!q) return true;
  const all = normalizeMentionSearch(MESSENGER_MENTION_ALL_LABEL);
  return all.startsWith(q) || q.startsWith(all) || q === 'tat' || q === 'ta' || q === 't';
}

export type MentionPickerItem =
  | { type: 'all'; key: string }
  | { type: 'member'; key: string; mem: MessengerMember };

export function buildMentionPickerItems(
  draft: string,
  cursor: number,
  members: MessengerMember[],
  myId: string,
): { open: boolean; start: number; items: MentionPickerItem[] } {
  const before = draft.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1) return { open: false, start: 0, items: [] };
  const frag = before.slice(at + 1);
  if (frag.includes('\n') || frag.includes(' ')) return { open: false, start: at, items: [] };

  const q = frag.toLowerCase();
  const items: MentionPickerItem[] = [];
  if (mentionAllPickerMatchesQuery(frag)) {
    items.push({ type: 'all', key: '__mention_all__' });
  }
  members
    .filter((mem) => String(mem.user_id) !== String(myId))
    .filter((mem) => {
      const name = (mem.user?.full_name || mem.user?.email || String(mem.user_id || '')).toLowerCase();
      if (!q) return true;
      return name.includes(q);
    })
    .slice(0, 8)
    .forEach((mem) => items.push({ type: 'member', key: String(mem.user_id), mem }));

  return { open: items.length > 0, start: at, items };
}

export function applyMentionPickToDraft(
  draft: string,
  cursor: number,
  mentionStart: number,
  item: MentionPickerItem,
): { text: string; cursor: number } {
  const before = draft.slice(0, mentionStart);
  const after = draft.slice(cursor);
  const insert =
    item.type === 'all'
      ? `@${MESSENGER_MENTION_ALL_LABEL} `
      : `@${(item.mem.user?.full_name || item.mem.user?.email || 'Thành viên').trim()} `;
  const text = before + insert + after;
  return { text, cursor: before.length + insert.length };
}

export function isUserMentionedInMessage(
  content: string,
  mentionUserIds: string[] | null | undefined,
  members: MessengerMember[],
  myId: string,
): boolean {
  const ids = [
    ...(Array.isArray(mentionUserIds) ? mentionUserIds : []),
    ...resolveMentionIdsFromContent(content || '', members, { excludeUserId: myId }),
  ];
  return ids.map(String).includes(String(myId));
}
