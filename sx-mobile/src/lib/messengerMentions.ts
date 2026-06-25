import type { MessengerGroupMember } from './messengerApi';

export const MESSENGER_MENTION_ALL_LABEL = 'Tất cả';

const MENTION_ALL_RE = /^@(tất\s*cả|tat\s*ca|all)\b/i;

export type MessageContentToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'url'; value: string };

function normalizeMentionSearch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sortedMembersByName(members: MessengerGroupMember[]) {
  return [...members]
    .map((m) => ({ id: m.id, name: (m.name || '').trim() }))
    .filter((m) => m.name)
    .sort((a, b) => b.name.length - a.name.length);
}

function mentionBoundary(text: string, indexAfterName: number): boolean {
  const next = text[indexAfterName];
  return next === undefined || /[\s,.!?;:\n]/.test(next);
}

/** Tìm mention @ đầy đủ tại vị trí `atIndex` (ký tự @). */
function matchMentionAt(
  text: string,
  atIndex: number,
  members: MessengerGroupMember[],
): string | null {
  const tail = text.slice(atIndex);
  const allMatch = tail.match(MENTION_ALL_RE);
  if (allMatch) return allMatch[0];

  const afterAt = text.slice(atIndex + 1);
  for (const mem of sortedMembersByName(members)) {
    if (afterAt.toLowerCase().startsWith(mem.name.toLowerCase())
      && mentionBoundary(text, atIndex + 1 + mem.name.length)) {
      return `@${mem.name}`;
    }
  }
  return null;
}

export function contentHasMentionAll(content: string): boolean {
  return MENTION_ALL_RE.test(String(content || ''));
}

export function resolveMentionIdsFromContent(
  content: string,
  members: MessengerGroupMember[],
  opts?: { excludeUserId?: string },
): string[] {
  const ids: string[] = [];
  if (!content?.trim() || !members?.length) return ids;
  const ex = opts?.excludeUserId != null ? String(opts.excludeUserId) : '';

  if (contentHasMentionAll(content)) {
    for (const mem of members) {
      if (mem.id && String(mem.id) !== ex && !ids.includes(mem.id)) ids.push(mem.id);
    }
  }

  const text = String(content);
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '@') continue;
    const matched = matchMentionAt(text, i, members);
    if (!matched || matched.toLowerCase().includes('tất cả') || matched.toLowerCase().includes('tat ca')) {
      if (matched) i += matched.length - 1;
      continue;
    }
    const name = matched.slice(1);
    const mem = members.find((m) => (m.name || '').trim().toLowerCase() === name.toLowerCase());
    if (mem?.id && String(mem.id) !== ex && !ids.includes(mem.id)) ids.push(mem.id);
    i += matched.length - 1;
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
  | { type: 'member'; key: string; mem: MessengerGroupMember };

export function buildMentionPickerItems(
  draft: string,
  cursor: number,
  members: MessengerGroupMember[],
  myId: string,
): { open: boolean; start: number; items: MentionPickerItem[] } {
  const before = draft.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1) return { open: false, start: 0, items: [] };
  const frag = before.slice(at + 1);
  if (frag.includes('\n')) return { open: false, start: at, items: [] };

  const q = frag.toLowerCase();
  const items: MentionPickerItem[] = [];
  if (mentionAllPickerMatchesQuery(frag)) {
    items.push({ type: 'all', key: '__mention_all__' });
  }
  members
    .filter((mem) => String(mem.id) !== String(myId))
    .filter((mem) => {
      const name = (mem.name || String(mem.id || '')).toLowerCase();
      if (!q) return true;
      return name.includes(q);
    })
    .slice(0, 8)
    .forEach((mem) => items.push({ type: 'member', key: String(mem.id), mem }));

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
      : `@${(item.mem.name || 'Thành viên').trim()} `;
  const text = before + insert + after;
  return { text, cursor: before.length + insert.length };
}

export function isUserMentionedInMessage(
  content: string,
  mentionUserIds: string[] | null | undefined,
  members: MessengerGroupMember[],
  myId: string,
): boolean {
  const ids = [
    ...(Array.isArray(mentionUserIds) ? mentionUserIds : []),
    ...resolveMentionIdsFromContent(content || '', members, { excludeUserId: myId }),
  ];
  return ids.map(String).includes(String(myId));
}

/** Phân đoạn nội dung tin nhắn — highlight @ tên đầy đủ (có dấu cách). */
export function tokenizeMessageContent(
  content: string,
  members: MessengerGroupMember[] = [],
): MessageContentToken[] {
  const text = String(content || '');
  const tokens: MessageContentToken[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '@') {
      const matched = matchMentionAt(text, i, members);
      if (matched) {
        tokens.push({ type: 'mention', value: matched });
        i += matched.length;
        continue;
      }
    }

    let j = i + 1;
    while (j < text.length) {
      if (text[j] === '@' && matchMentionAt(text, j, members)) break;
      j += 1;
    }
    const chunk = text.slice(i, j);
    if (chunk) tokens.push({ type: 'text', value: chunk });
    i = j;
  }
  return tokens;
}

/** @deprecated — dùng tokenizeMessageContent */
export function splitMentionTokens(content: string): string[] {
  return tokenizeMessageContent(content).map((t) => t.value);
}

export function isMentionToken(part: string): boolean {
  return part.startsWith('@');
}
