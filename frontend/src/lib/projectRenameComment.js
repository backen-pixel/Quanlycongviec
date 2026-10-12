/** Lệnh bình luận «/đổi tên "tên hiện tại": tên mới». */

export function buildProjectRenameSlashCommand(currentName) {
  const shown = String(currentName || '').trim().replace(/["“”']/g, '') || 'dự án';
  return {
    id: 'rename-project',
    kind: 'compose',
    label: 'Đổi tên',
    emoji: '✏️',
    keywords: 'doi ten doi ten du an rename ten du an',
    hint: `Điền tên mới sau dấu : — đang là «${shown}»`,
    groupLabel: 'Dự án',
    composeText: `/đổi tên "${shown}": `,
  };
}

/**
 * Khớp cả dòng. Phần trong ngoặc kép là tên đang hiển thị; phần sau dấu : là tên mới.
 * Trả null nếu không phải lệnh.
 */
export function parseProjectRenameCommand(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^\/\s*(?:đổi|Đổi|doi|Doi|DOI)\s*(?:tên|Tên|ten|Ten|TEN)\b\s*(?:"([^"]*)"|“([^”]*)”|'([^']*)')?\s*:?\s*([\s\S]*)$/);
  if (!m) return null;
  const quoted = String(m[1] || m[2] || m[3] || '').trim();
  const nextName = String(m[4] || '').trim().replace(/^["“']|["”']$/g, '').replace(/\s+/g, ' ').trim();
  return { quoted, nextName };
}

export function renameNoticeBody(oldName, nextName) {
  const from = String(oldName || '').trim() || 'dự án';
  const to = String(nextName || '').trim();
  return `✏️ Đã đổi tên dự án từ «${from}» thành «${to}»`;
}

export function clipProjectName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}
