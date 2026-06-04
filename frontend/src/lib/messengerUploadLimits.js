/** Đồng bộ với backend `MESSENGER_MAX_UPLOAD_MB` / `VITE_MESSENGER_MAX_UPLOAD_MB`. */
export const MESSENGER_MAX_FILE_MB = (() => {
  const raw = Number(import.meta.env.VITE_MESSENGER_MAX_UPLOAD_MB);
  if (!Number.isFinite(raw)) return 50;
  return Math.min(256, Math.max(1, Math.floor(raw)));
})();

export const MESSENGER_MAX_FILE_BYTES = MESSENGER_MAX_FILE_MB * 1024 * 1024;

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * @param {FileList|File[]|null} files
 * @returns {{ ok: boolean, valid: File[], error: string|null }}
 */
export function validateMessengerFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return { ok: true, valid: [], error: null };
  const overs = list.filter((f) => f.size > MESSENGER_MAX_FILE_BYTES);
  if (overs.length) {
    const names = overs.map((f) => `${f.name} (${formatFileSize(f.size)})`).join(', ');
    return {
      ok: false,
      valid: list.filter((f) => f.size <= MESSENGER_MAX_FILE_BYTES),
      error: `File vượt quá ${MESSENGER_MAX_FILE_MB} MB: ${names}`,
    };
  }
  return { ok: true, valid: list, error: null };
}

export const MESSENGER_ATTACH_HINT = `Tối đa ${MESSENGER_MAX_FILE_MB} MB / file`;
