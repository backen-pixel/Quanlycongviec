/** Đồng bộ với backend `MESSENGER_MAX_UPLOAD_MB` / `VITE_MESSENGER_MAX_UPLOAD_MB`. */
export const MESSENGER_MAX_FILE_MB = (() => {
  const raw = Number(import.meta.env.VITE_MESSENGER_MAX_UPLOAD_MB);
  if (!Number.isFinite(raw)) return 50;
  return Math.min(256, Math.max(1, Math.floor(raw)));
})();

export const MESSENGER_MAX_FILE_BYTES = MESSENGER_MAX_FILE_MB * 1024 * 1024;

/** Ngưỡng nhắc nên gửi qua Drive (MB). Có thể cấu hình `VITE_CHAT_DRIVE_REMIND_MB`. */
export const CHAT_DRIVE_REMIND_MB = (() => {
  const raw = Number(import.meta.env.VITE_CHAT_DRIVE_REMIND_MB);
  if (!Number.isFinite(raw)) return 10;
  return Math.min(MESSENGER_MAX_FILE_MB, Math.max(1, Math.floor(raw)));
})();

export const CHAT_DRIVE_REMIND_BYTES = CHAT_DRIVE_REMIND_MB * 1024 * 1024;

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * @param {FileList|File[]|null} files
 * @returns {File[]}
 */
export function getLargeChatFilesForDriveReminder(files) {
  return Array.from(files || []).filter((f) => f && f.size >= CHAT_DRIVE_REMIND_BYTES);
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
      error: `File vượt quá ${MESSENGER_MAX_FILE_MB} MB: ${names}. Hãy tải lên Google Drive (nút ☁️) rồi chia sẻ link.`,
    };
  }
  return { ok: true, valid: list, error: null };
}

/** @alias validateMessengerFiles — dùng chung lead chat & messenger */
export const validateChatUploadFiles = validateMessengerFiles;

export const MESSENGER_ATTACH_HINT = `Tối đa ${MESSENGER_MAX_FILE_MB} MB / file`;

export const CHAT_DRIVE_REMIND_HINT = `File từ ${CHAT_DRIVE_REMIND_MB} MB nên gửi qua Google Drive (☁️)`;

