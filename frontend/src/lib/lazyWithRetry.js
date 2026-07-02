import { lazy } from 'react';

const RELOAD_KEY = 'vite_chunk_reload';
const RELOAD_COOLDOWN_MS = 30_000;

/** Xóa cờ sau khi lazy chunk tải thành công (gọi từ lazyWithRetry). */
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
    || msg.includes('Failed to parse source for import analysis')
  );
}

/**
 * lazy() + tự reload tối đa 1 lần / 30s khi chunk JS lỗi sau deploy hoặc lỗi biên dịch dev.
 */
export function lazyWithRetry(importFactory) {
  return lazy(() =>
    importFactory()
      .then((mod) => {
        clearChunkReloadFlag();
        return mod;
      })
      .catch((err) => {
        if (isChunkLoadError(err)) {
          try {
            const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
            const now = Date.now();
            if (!last || now - last > RELOAD_COOLDOWN_MS) {
              sessionStorage.setItem(RELOAD_KEY, String(now));
              window.location.reload();
              return new Promise(() => {});
            }
          } catch { /* ignore */ }
        }
        throw err;
      }),
  );
}

export function isChunkLoadErrorMessage(message) {
  return isChunkLoadError({ message });
}
