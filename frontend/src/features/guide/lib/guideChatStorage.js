/**
 * Lưu lịch sử chat của trợ lý hướng dẫn — CHỈ LƯU, không khôi phục lên UI CopilotKit.
 *
 * docs/guide-assistant-current.md §11 ghi lại: khôi phục lịch sử lên UI cần
 * `useCopilotChatInternal` (API nội bộ, không công khai) và "giành" state với vòng đời nội bộ
 * của thư viện → rất mong manh, gây RUN_ERROR khi hai instance chat cùng đọc `messages`.
 * Quyết định ở đây theo đúng bài học đó: v1 chỉ lưu (an toàn, không đụng API nội bộ), mở lại
 * panel thấy khung chat trống là chấp nhận được — đổi lại không vỡ khi nâng version CopilotKit.
 */

const KEY_PREFIX = 'tubep_guide_chat_v1:';
const MAX_MESSAGES = 60;
const MAX_BYTES = 200 * 1024;

function keyFor(userId) {
  return `${KEY_PREFIX}${userId || 'anon'}`;
}

/** Xoá lịch sử chat của MỌI user khác — máy dùng chung ở xưởng/showroom không được lộ chat cũ. */
export function pruneOtherUsers(userId) {
  if (typeof localStorage === 'undefined') return;
  const keep = keyFor(userId);
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(KEY_PREFIX) && k !== keep) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

export function saveChatHistory(userId, messages) {
  if (typeof localStorage === 'undefined') return;
  // KHÔNG xoá khoá khi mảng rỗng — effect khôi phục (nếu có) và effect lưu có thể chạy cùng
  // lúc lúc mở panel; lưu rỗng ngay lúc đó sẽ ghi đè mất dữ liệu vừa đọc. Xoá tường minh qua
  // clearChatHistory() nếu thật sự cần.
  if (!Array.isArray(messages) || messages.length === 0) return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    const json = JSON.stringify(trimmed);
    if (json.length > MAX_BYTES) return;
    localStorage.setItem(keyFor(userId), json);
  } catch { /* quota/private mode — bỏ qua, không chặn UI */ }
}

export function loadChatHistory(userId) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function clearChatHistory(userId) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(keyFor(userId));
}
