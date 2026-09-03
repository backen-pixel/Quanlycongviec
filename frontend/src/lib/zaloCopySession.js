/** Phiên copy lần lượt từng ảnh để dán Zalo (mỗi Ctrl+V = 1 ảnh). */

export function startZaloCopySession(urls, nextIndex = 1) {
  const list = (urls || []).map((u) => String(u || '').trim()).filter(Boolean);
  if (list.length < 2) return;
  window.dispatchEvent(new CustomEvent('app:zalo-copy-session', {
    detail: { urls: list, nextIndex: Math.min(Math.max(0, nextIndex), list.length) },
  }));
}

export function endZaloCopySession() {
  window.dispatchEvent(new CustomEvent('app:zalo-copy-session', { detail: null }));
}
