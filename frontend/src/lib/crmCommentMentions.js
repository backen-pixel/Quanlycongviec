/** @mention trong bình luận lead/deal — đồng bộ với backend crmLeadCommentMentions.js */

export const CRM_MENTION_ALL_LABEL = 'Tất cả';
/** Không dùng \\b — chữ Việt (ả) không phải word-char ASCII nên @Tất cả sẽ không khớp. */
const MENTION_ALL_RE = /@(tất\s*cả|tat\s*ca|all)(?=$|[\s.,!?;:…])/i;

export function normalizeMentionSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function memberDisplayName(mem) {
  return (mem?.user?.full_name || mem?.user?.email || '').trim();
}

export function contentHasMentionAll(content) {
  return MENTION_ALL_RE.test(String(content || ''));
}

export function memberMatchesQuery(mem, queryRaw) {
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

export function resolveMentionIdsFromContent(content, members, { excludeUserId } = {}) {
  const ids = [];
  if (!content?.trim() || !members?.length) return ids;
  const ex = excludeUserId != null ? String(excludeUserId) : '';

  if (contentHasMentionAll(content)) {
    for (const mem of members) {
      const id = mem.user_id;
      if (String(mem.role || '') === 'viewer') continue;
      if (id && String(id) !== ex && !ids.includes(id)) ids.push(id);
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
    const allMatch = rest.match(/^(tất\s*cả|tat\s*ca|all)(?=$|[\s.,!?;:…])/i);
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
      if (id && String(id) !== ex && !ids.includes(id)) ids.push(id);
      i += 1 + name.length;
      matched = true;
      break;
    }
    if (!matched) i += 1;
  }
  return ids;
}

export function mentionAllPickerMatchesQuery(frag) {
  const q = normalizeMentionSearch(frag);
  if (!q) return true;
  const all = normalizeMentionSearch(CRM_MENTION_ALL_LABEL);
  return all.startsWith(q) || q.startsWith(all) || q === 'tat' || q === 'ta' || q === 't';
}

/** Trạng thái @ đang gõ — mở picker khi gõ @ + lọc theo tên (không dấu). */
export function getActiveMentionState(text, cursorPos) {
  const pos = cursorPos ?? text.length;
  const before = text.slice(0, pos);
  const at = before.lastIndexOf('@');
  if (at === -1) return { active: false, start: 0, query: '' };
  const between = before.slice(at + 1);
  if (between.includes('\n')) return { active: false, start: at, query: '' };
  return { active: true, start: at, query: between };
}

export function buildMentionPickerItems({ text, cursorPos, members, currentUserId }) {
  const { active, start, query } = getActiveMentionState(text, cursorPos);
  if (!active) return { open: false, start: 0, items: [], query: '' };

  const items = [];
  if (mentionAllPickerMatchesQuery(query)) {
    items.push({ type: 'all', key: '__mention_all__' });
  }

  const q = normalizeMentionSearch(query);
  const candidates = (members || [])
    .filter((mem) => String(mem.user_id || mem?.user?.id || '') !== String(currentUserId || ''))
    .filter((mem) => memberMatchesQuery(mem, query));

  // Có query: ưu tiên khớp tên. Không query: ưu tiên người vừa bình luận (recentCommenter).
  candidates.sort((a, b) => {
    if (!q) {
      const ar = a?.recentCommenter ? 1 : 0;
      const br = b?.recentCommenter ? 1 : 0;
      if (br !== ar) return br - ar;
    }
    return memberDisplayName(a).localeCompare(memberDisplayName(b), 'vi');
  });

  candidates
    .slice(0, q ? 15 : 20)
    .forEach((mem) => {
      const uid = String(mem.user_id || mem?.user?.id || '');
      if (!uid) return;
      items.push({ type: 'member', key: uid, mem: { ...mem, user_id: uid } });
    });

  return { open: true, start, items, query };
}

export function applyMentionPickToText({ text, mentionStart, cursorPos, item }) {
  const pos = cursorPos ?? text.length;
  const before = text.slice(0, mentionStart);
  const after = text.slice(pos);
  let insert = '';
  if (item?.type === 'all') {
    insert = `@${CRM_MENTION_ALL_LABEL} `;
  } else {
    const mem = item?.mem;
    const name = memberDisplayName(mem) || `Thành viên ${String(mem?.user_id || '').slice(0, 8)}`;
    insert = `@${name} `;
  }
  const next = before + insert + after;
  const caret = before.length + insert.length;
  const pickedId = item?.type === 'member' ? String(item.mem?.user_id || '') : null;
  return { text: next, caret, pickedId };
}

/** Tin mẫu nhanh — tab Bình luận chi tiết deal (NV SX cập nhật tiến độ). */
export const CRM_DEAL_COMMENT_QUICK_REPLIES = [
  'Đã nhận deal',
  'Đang lên bảng vẽ',
];
