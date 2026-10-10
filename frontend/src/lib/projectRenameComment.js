// Đổi tên dự án xưởng bằng lệnh bình luận: /đổi tên "dự án xưởng": Tên mới
// Dùng chung cho CommentsPanels, LeadDetail, ProductionDetail, WorkUnifiedProjectDetailPage.

export const PROJECT_NAME_MAX = 200;
const COMMAND_PREFIX = '/đổi tên "dự án xưởng": ';

/** Gọn tên dự án: bỏ khoảng trắng thừa, cắt tối đa PROJECT_NAME_MAX ký tự. */
export function clipProjectName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX).trim();
}

/** Lệnh «/» kiểu compose: chọn xong thì chèn mẫu để người dùng gõ tên mới sau dấu «:». */
export function buildProjectRenameSlashCommand(currentName) {
  const current = clipProjectName(currentName);
  return {
    id: 'compose:project-rename',
    kind: 'compose',
    label: 'Đổi tên dự án xưởng',
    emoji: '✏️',
    keywords: 'doi ten đổi tên du an dự án xuong xưởng rename',
    hint: current ? `Tên hiện tại: ${current}` : 'Gõ tên mới sau dấu :',
    groupLabel: 'Dự án',
    composeText: COMMAND_PREFIX,
  };
}

/**
 * Nhận diện bình luận là lệnh đổi tên. Không phải lệnh → null.
 * Là lệnh nhưng chưa có tên mới → { nextName: '' } để màn hình nhắc người dùng.
 */
export function parseProjectRenameCommand(text) {
  const raw = String(text ?? '').trim();
  const head = raw.normalize('NFC').toLowerCase();
  if (!head.startsWith('/đổi tên') && !head.startsWith('/doi ten')) return null;
  const colon = raw.indexOf(':');
  return { nextName: colon >= 0 ? clipProjectName(raw.slice(colon + 1)) : '' };
}

/** Nội dung bình luận ghi lại việc đổi tên (thay cho câu lệnh người dùng gõ). */
export function renameNoticeBody(oldName, nextName) {
  const before = clipProjectName(oldName) || 'dự án';
  return `✏️ Đã đổi tên dự án xưởng: «${before}» → «${clipProjectName(nextName)}»`;
}
