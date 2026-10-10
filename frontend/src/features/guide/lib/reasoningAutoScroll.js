/**
 * Khung suy luận (💭 "Thought for...") của `CopilotChatReasoningMessage` (v2) không có prop
 * hay data-testid nào để chèn logic tự cuộn — component chỉ export slot `header`/`contentView`/
 * `toggle` (xem CopilotChatReasoningMessage.tsx trong package), không có cách công khai nào
 * để hook một scrollTop tuỳ biến vào đúng div nội dung. Nên xử lý bằng DOM thuần bên ngoài,
 * giống cách tiếp cận của uiSpotlight.js — không phụ thuộc API nội bộ của thư viện.
 *
 * Cơ chế: mọi lượt suy luận stream text vào div nội dung (khớp REASONING_CONTENT_SELECTOR,
 * xem appGuideCopilot.css cho phần CSS max-height + overflow tương ứng). MutationObserver bắt
 * mọi lần nội dung đổi rồi ép `scrollTop = scrollHeight` — nội dung mới luôn hiện ở đáy, phần
 * cũ tự trôi lên trên và khuất dần, đúng cảm giác "tail -f".
 *
 * Khi lượt suy luận kết thúc, `isStreaming` chuyển `false` → thư viện tự đặt lại `isOpen =
 * false` và thu gọn về dòng tiêu đề — hành vi đó đã có sẵn trong package, không cần code thêm.
 */

// Escape `:` trong tên class Tailwind (cpk:pb-2) khi dùng làm CSS selector.
const REASONING_CONTENT_SELECTOR = '[data-copilot-popup] [data-message-id] .cpk\\:pb-2.cpk\\:pt-1';

/**
 * Gắn quan sát toàn panel trợ lý — tự tìm và cuộn mọi khối nội dung suy luận đang đổi.
 * @returns {() => void} hàm huỷ quan sát
 */
export function attachReasoningAutoScroll() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};

  const scrollBoxToBottom = (box) => {
    box.scrollTop = box.scrollHeight;
  };

  const observer = new MutationObserver((mutations) => {
    const handled = new Set();
    for (const m of mutations) {
      const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!target || typeof target.closest !== 'function') continue;
      const box = target.closest(REASONING_CONTENT_SELECTOR);
      if (box && !handled.has(box)) {
        handled.add(box);
        scrollBoxToBottom(box);
      }
    }
  });

  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}
