/** Hiển thị toast «Đã sao chép» toàn app (CopyToastHost lắng nghe). */
export function showCopyToast(message = 'Đã sao chép') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:copy-toast', { detail: { message } }));
}
