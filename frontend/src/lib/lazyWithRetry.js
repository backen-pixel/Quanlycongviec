import { lazy } from 'react';

const RELOAD_KEY = 'vite_chunk_reload';

/** Xóa cờ sau khi app tải thành công (gọi một lần ở App). */
export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch { /* ignore */ }
}

function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return (
    err?.name === 'ChunkLoadError'
    || msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('Importing a module script failed')
    || msg.includes('error loading dynamically imported module')
  );
}

/**
 * lazy() + tự reload 1 lần khi chunk JS 404 sau deploy mới (hash đổi).
 */
export function lazyWithRetry(importFactory) {
  return lazy(() =>
    importFactory().catch((err) => {
      if (isChunkLoadError(err)) {
        try {
          if (!sessionStorage.getItem(RELOAD_KEY)) {
            sessionStorage.setItem(RELOAD_KEY, '1');
            window.location.reload();
            return new Promise(() => {});
          }
          sessionStorage.removeItem(RELOAD_KEY);
        } catch { /* ignore */ }
      }
      throw err;
    }),
  );
}

export function isChunkLoadErrorMessage(message) {
  return isChunkLoadError({ message });
}
