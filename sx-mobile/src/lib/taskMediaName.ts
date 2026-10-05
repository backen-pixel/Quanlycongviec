/**
 * Tên file ảnh/video đính kèm vào việc. Tên máy ảnh sinh ra (`IMG_7145.jpg`, `1dee0e96-….jpeg`) không cho biết
 * ảnh của việc nào, nên đặt lại theo mẫu:  `<Mã dự án> - <Tên việc> - <Ảnh|Video> <dd-MM HHhmmPs>.<đuôi>`
 * ví dụ `TB-2026-1008 - Ngày đặt hàng - Ảnh 05-10 10h08m23s.jpg`.
 * File không phải ảnh/video (PDF, Word…) giữ nguyên tên người dùng đặt.
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

const MAX_TITLE = 60;

/** Bỏ ký tự cấm trong tên file, gộp khoảng trắng, cắt độ dài. */
function cleanPart(value: string | null | undefined, max: number): string {
  const s = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max).trim()}…` : s;
}

function extensionOf(originalName: string | null | undefined, mime: string): string {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(String(originalName ?? '').trim());
  if (m) return m[1].toLowerCase();
  return EXT_BY_MIME[mime.toLowerCase()] || (mime.startsWith('video/') ? 'mp4' : 'jpg');
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** `05-10 10h08m23s` (giờ máy). */
export function formatMediaStamp(now: Date): string {
  return `${two(now.getDate())}-${two(now.getMonth() + 1)} ${two(now.getHours())}h${two(now.getMinutes())}m${two(now.getSeconds())}s`;
}

export type TaskMediaNameContext = {
  projectCode?: string | null;
  taskTitle?: string | null;
  now?: Date;
};

/** Trả về tên mới cho ảnh/video; `null` nếu file không phải ảnh/video (giữ nguyên tên gốc). */
export function taskMediaFileName(
  file: { name?: string | null; mime?: string | null },
  ctx: TaskMediaNameContext,
): string | null {
  const mime = String(file.mime || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  if (!isImage && !isVideo) return null;

  const code = cleanPart(ctx.projectCode, 40);
  const title = cleanPart(ctx.taskTitle, MAX_TITLE);
  const kind = isVideo ? 'Video' : 'Ảnh';
  const stamp = formatMediaStamp(ctx.now ?? new Date());
  const head = [code, title].filter(Boolean).join(' - ');
  const base = [head, `${kind} ${stamp}`].filter(Boolean).join(' - ');
  return `${base}.${extensionOf(file.name, mime)}`;
}

/** Áp tên mới cho file ảnh/video; file khác trả về nguyên vẹn. */
export function withTaskMediaName<T extends { name: string; mime: string }>(
  file: T,
  ctx: TaskMediaNameContext,
): T {
  const name = taskMediaFileName(file, ctx);
  return name ? { ...file, name } : file;
}
