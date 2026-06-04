/** Giới hạn 1 file đính kèm Messenger (MB). Có thể set `MESSENGER_MAX_UPLOAD_MB` trong .env */
function parseMessengerMaxUploadMb() {
  const raw = parseInt(String(process.env.MESSENGER_MAX_UPLOAD_MB || '50'), 10);
  if (!Number.isFinite(raw)) return 50;
  return Math.min(256, Math.max(1, raw));
}

const MESSENGER_MAX_UPLOAD_MB = parseMessengerMaxUploadMb();
const MESSENGER_MAX_FILE_BYTES = MESSENGER_MAX_UPLOAD_MB * 1024 * 1024;

module.exports = {
  MESSENGER_MAX_UPLOAD_MB,
  MESSENGER_MAX_FILE_BYTES,
};
