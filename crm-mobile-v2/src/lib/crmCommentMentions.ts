import type { LeadMember } from '../api/leadDetail';

export const CRM_MENTION_ALL_LABEL = 'Tất cả';
const MENTION_ALL_RE = /@(tất\s*cả|tat\s*ca|all)\b/gi;

export function normalizeMentionSearch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function memberDisplayName(mem: LeadMember): string {
  return (mem?.user?.full_name || mem?.user?.email || '').trim();
}

export function contentHasMentionAll(content: string): boolean {
  return MENTION_ALL_RE.test(String(content || ''));
}

export function memberMatchesQuery(mem: LeadMember, queryRaw: string): boolean {
  const q = normalizeMentionSearch(queryRaw);
  if (!q) return true;
  const name = memberDisplayName(mem);
  if (!name) return false;
  const nNorm = normalizeMentionSearch(name);
  if (nNorm.includes(q)) return true;
  return name
    .split(/\s+/)
    .some((part) => {
      const p = normalizeMentionSearch(part);
      return p.startsWith(q) || p.includes(q);
    });
}

export function resolveMentionIdsFromContent(
  content: string,
  members: LeadMember[],
  opts: { excludeUserId?: string | null } = {},
): string[] {
  const ids: string[] = [];
  if (!content?.trim() || !members?.length) return ids;
  const ex = opts.excludeUserId != null ? String(opts.excludeUserId) : '';

  if (contentHasMentionAll(content)) {
    for (const mem of members) {
      const id = mem.user_id;
      if (id && String(id) !== ex && !ids.includes(String(id))) ids.push(String(id));
    }
  }

  const sorted = [...members].sort(
    (a, b) => memberDisplayName(b).length - memberDisplayName(a).length,
  );

  const text = String(content);
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    const rest = text.slice(i + 1);
    const allMatch = rest.match(/^(tất\s*cả|tat\s*ca|all)\b/i);
    if (allMatch) {
      i += 1 + allMatch[0].length;
      continue;
    }

    let matched = false;
    for (const mem of sorted) {
      const name = memberDisplayName(mem);
      if (!name) continue;
      const restNorm = normalizeMentionSearch(rest);
      const nameNorm = normalizeMentionSearch(name);
      if (!restNorm.startsWith(nameNorm)) continue;
      const after = rest.slice(name.length);
      if (after.length > 0 && after[0] !== ' ' && after[0] !== '\n') continue;
      const id = mem.user_id;
      if (id && String(id) !== ex && !ids.includes(String(id))) ids.push(String(id));
      i += 1 + name.length;
      matched = true;
      break;
    }
    if (!matched) i += 1;
  }
  return ids;
}

export function mentionAllPickerMatchesQuery(frag: string): boolean {
  const q = normalizeMentionSearch(frag);
  if (!q) return true;
  const all = normalizeMentionSearch(CRM_MENTION_ALL_LABEL);
  return all.startsWith(q) || q.startsWith(all) || q === 'tat' || q === 'ta' || q === 't';
}

export function getActiveMentionState(text: string, cursorPos: number) {
  const pos = cursorPos ?? text.length;
  const before = text.slice(0, pos);
  const at = before.lastIndexOf('@');
  if (at === -1) return { active: false, start: 0, query: '' };
  const between = before.slice(at + 1);
  if (between.includes('\n')) return { active: false, start: at, query: '' };
  return { active: true, start: at, query: between };
}

export type MentionPickerItem =
  | { type: 'all'; key: string }
  | { type: 'member'; key: string; mem: LeadMember };

export function buildMentionPickerItems(opts: {
  text: string;
  cursorPos: number;
  members: LeadMember[];
  currentUserId?: string | null;
}) {
  const { text, cursorPos, members, currentUserId } = opts;
  const { active, start, query } = getActiveMentionState(text, cursorPos);
  if (!active) return { open: false, start: 0, items: [] as MentionPickerItem[], query: '' };

  const items: MentionPickerItem[] = [];
  if (mentionAllPickerMatchesQuery(query)) {
    items.push({ type: 'all', key: '__mention_all__' });
  }

  (members || [])
    .filter((mem) => String(mem.user_id) !== String(currentUserId))
    .filter((mem) => memberMatchesQuery(mem, query))
    .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b), 'vi'))
    .slice(0, 10)
    .forEach((mem) => items.push({ type: 'member', key: String(mem.user_id), mem }));

  return { open: true, start, items, query };
}

export function applyMentionPickToText(opts: {
  text: string;
  mentionStart: number;
  cursorPos: number;
  item: MentionPickerItem;
}) {
  const { text, mentionStart, cursorPos, item } = opts;
  const pos = cursorPos ?? text.length;
  const before = text.slice(0, mentionStart);
  const after = text.slice(pos);
  let insert = '';
  if (item?.type === 'all') {
    insert = `@${CRM_MENTION_ALL_LABEL} `;
  } else {
    const mem = item.mem;
    const name = memberDisplayName(mem) || `Thành viên ${String(mem?.user_id || '').slice(0, 8)}`;
    insert = `@${name} `;
  }
  const next = before + insert + after;
  const caret = before.length + insert.length;
  const pickedId = item?.type === 'member' ? String(item.mem?.user_id || '') : null;
  return { text: next, caret, pickedId };
}
