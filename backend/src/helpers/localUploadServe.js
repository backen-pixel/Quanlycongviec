const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');

/** Thư mục upload local được phép stream qua API (tránh path traversal). */
const ALLOWED_LOCAL_UPLOADS = [
  { urlPrefix: '/uploads/messenger-chat/', dir: path.join(UPLOAD_ROOT, 'messenger-chat') },
  { urlPrefix: '/uploads/lead-chat/', dir: path.join(UPLOAD_ROOT, 'lead-chat') },
];

function decodeUploadPath(raw) {
  try {
    return decodeURIComponent(String(raw || '').trim());
  } catch {
    return String(raw || '').trim();
  }
}

/**
 * Tìm file local từ đường dẫn /uploads/... — khớp tên chính xác hoặc theo prefix timestamp_hash.
 */
function resolveLocalUploadFile(urlPath) {
  const normalized = decodeUploadPath(urlPath);
  if (!normalized.startsWith('/uploads/')) return null;

  for (const { urlPrefix, dir } of ALLOWED_LOCAL_UPLOADS) {
    if (!normalized.startsWith(urlPrefix)) continue;
    const basename = path.basename(normalized);
    if (!basename || basename.includes('..')) return null;

    const exact = path.join(dir, basename);
    if (fs.existsSync(exact)) {
      return { fullPath: exact, basename, dir };
    }

    const parts = basename.split('_');
    if (parts.length >= 2) {
      const prefix = parts.slice(0, 2).join('_');
      try {
        const files = fs.readdirSync(dir);
        const match = files.find((f) => f.startsWith(prefix));
        if (match) {
          return { fullPath: path.join(dir, match), basename: match, dir };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

module.exports = {
  ALLOWED_LOCAL_UPLOADS,
  resolveLocalUploadFile,
};
