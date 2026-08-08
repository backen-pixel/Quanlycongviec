/** Highlight @mention trong nội dung bình luận dự án / deal. */

export const COMMENT_MENTION_ALL_LABEL = 'Tất cả';

export type CommentMentionName = { name: string };

/** Trích tên có thể được nhắc từ danh sách bình luận (tác giả). */
export function mentionNamesFromComments(
  comments: Array<{ user?: { full_name?: string | null } | null }>,
): CommentMentionName[] {
  const seen = new Set<string>();
  const out: CommentMentionName[] = [];
  for (const c of comments || []) {
    const name = String(c.user?.full_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
  }
  return out.sort((a, b) => b.name.length - a.name.length);
}

export type MentionTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string };

/**
 * Tách nội dung thành text thường + token @mention để render nổi bật.
 * Khớp @Tất cả / @all và @Tên (theo danh sách members, ưu tiên tên dài).
 */
export function splitCommentMentionParts(
  text: string,
  members: CommentMentionName[] = [],
): MentionTextPart[] {
  const raw = String(text || '');
  if (!raw) return [];
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const parts: MentionTextPart[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '@') {
      const after = raw.slice(i + 1);
      const allMatch = after.match(/^(tất\s*cả|tat\s*ca|all)\b/i);
      if (allMatch) {
        parts.push({ kind: 'mention', value: `@${COMMENT_MENTION_ALL_LABEL}` });
        i += 1 + allMatch[0].length;
        continue;
      }
      let matched: CommentMentionName | null = null;
      for (const mem of sorted) {
        const n = mem.name;
        if (!n) continue;
        if (
          after.toLowerCase().startsWith(n.toLowerCase())
          && (after.length === n.length || /[\s,.!?;:\n)»」】]/.test(after[n.length] || ''))
        ) {
          matched = mem;
          break;
        }
      }
      if (matched) {
        parts.push({ kind: 'mention', value: `@${matched.name}` });
        i += 1 + matched.name.length;
        continue;
      }
      // Fallback: @Họ Tên (chữ cái + dấu tiếng Việt, tối đa 4 từ)
      const loose = after.match(
        /^[A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ'’.-]*(?:\s+[A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ'’.-]*){0,3}/,
      );
      if (loose && loose[0].trim().length >= 2) {
        const nextChar = after[loose[0].length] || '';
        if (!nextChar || /[\s,.!?;:\n)»」】]/.test(nextChar)) {
          parts.push({ kind: 'mention', value: `@${loose[0].trim()}` });
          i += 1 + loose[0].length;
          continue;
        }
      }
    }
    let j = i + 1;
    while (j < raw.length && raw[j] !== '@') j += 1;
    parts.push({ kind: 'text', value: raw.slice(i, j) });
    i = j;
  }
  return parts;
}
