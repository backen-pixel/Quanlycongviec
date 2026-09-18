/**
 * Đối chiếu path với bản đồ màn hình đã sinh — dùng để (1) mô tả trang đang xem trong ngữ
 * cảnh gửi lên model, và (2) validate điều hướng: model chỉ được điều hướng tới path THẬT
 * SỰ tồn tại trong registry, không phải path nó tự bịa.
 */
import { SCREEN_REGISTRY } from '../data/screenRegistry';

const BY_EXACT_PATH = new Map(SCREEN_REGISTRY.map((s) => [s.path, s]));

// Registry có path dạng "/crm/leads/:id" — build regex để khớp path thật "/crm/leads/abc123".
const DYNAMIC_ENTRIES = SCREEN_REGISTRY
  .filter((s) => s.path.includes(':'))
  .map((s) => ({
    entry: s,
    re: new RegExp(`^${s.path.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')}$`),
  }));

/** Tìm entry registry khớp một pathname thật (có thể có tham số động). */
export function matchScreen(pathname) {
  if (!pathname) return null;
  const clean = String(pathname).split('?')[0].split('#')[0];
  if (BY_EXACT_PATH.has(clean)) return BY_EXACT_PATH.get(clean);
  for (const { entry, re } of DYNAMIC_ENTRIES) {
    if (re.test(clean)) return entry;
  }
  return null;
}

/** Mô tả ngắn màn hình đang xem — dùng cho readable "Màn hình đang xem". */
export function describeScreen(pathname) {
  const s = matchScreen(pathname);
  if (!s) return { path: pathname, label: pathname, menu: '', known: false };
  return { path: s.path, label: s.label, menu: s.menu, known: true };
}

/**
 * Có phải path model muốn điều hướng tới THẬT SỰ tồn tại trong app không.
 * Chặn model bịa đường dẫn — chỉ cho qua path có trong registry (kể cả path động).
 */
export function isNavigablePath(pathname) {
  if (typeof pathname !== 'string') return false;
  if (!pathname.startsWith('/')) return false;
  if (pathname.startsWith('//') || pathname.includes('://')) return false;
  return matchScreen(pathname) != null;
}
