const path = require('path');
const fs = require('fs');
const {
  findMessengerObjectInSupabase,
  repairMessengerAttachmentUrls,
  downloadMessengerStorageBlob,
} = require('./messengerStorageResolve');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');

/** Thư mục upload local được phép stream qua API (tránh path traversal). */
const ALLOWED_LOCAL_UPLOADS = [
  { urlPrefix: '/uploads/messenger-chat/', dir: path.join(UPLOAD_ROOT, 'messenger-chat') },
  { urlPrefix: '/uploads/lead-chat/', dir: path.join(UPLOAD_ROOT, 'lead-chat') },
];

function decodeUploadPath(raw) {
  const s = String(raw || '').trim().replace(/\+/g, ' ');
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalizeFilenameForMatch(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
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
      return { fullPath: exact, basename, dir, kind: 'local' };
    }

    const normTarget = normalizeFilenameForMatch(basename);
    const parts = basename.split('_');
    const prefix = parts.length >= 2 ? parts.slice(0, 2).join('_') : null;
    try {
      const files = fs.readdirSync(dir);
      const match = files.find((f) => {
        if (prefix && f.startsWith(prefix)) return true;
        return normalizeFilenameForMatch(f) === normTarget;
      });
      if (match) {
        return { fullPath: path.join(dir, match), basename: match, dir, kind: 'local' };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Giải quyết nguồn tải: disk local → Supabase Storage (URL cũ /uploads/messenger-chat/...).
 */
async function resolveUploadDownloadSource(urlPath) {
  const normalized = decodeUploadPath(urlPath);
  const local = resolveLocalUploadFile(normalized);
  if (local) return { ...local, sourcePath: normalized };

  if (normalized.startsWith('/uploads/messenger-chat/')) {
    const basename = path.basename(normalized);
    const storage = await findMessengerObjectInSupabase(basename);
    if (storage?.objectPath) {
      return {
        kind: 'storage',
        storage,
        basename: storage.storageName || basename,
        sourcePath: normalized,
      };
    }
  }
  return null;
}

async function sendUploadDownloadResponse(res, resolved, downloadName) {
  const name = downloadName || resolved.basename || 'download';
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);

  if (resolved.kind === 'storage' && resolved.storage) {
    try {
      const blob = await downloadMessengerStorageBlob(resolved.storage);
      if (!blob) return res.status(404).json({ error: 'File không còn trên Storage' });
      const buf = Buffer.from(await blob.arrayBuffer());
      if (resolved.sourcePath && resolved.storage.publicUrl) {
        void repairMessengerAttachmentUrls(resolved.sourcePath, resolved.storage.publicUrl);
      }
      if (blob.type) res.setHeader('Content-Type', blob.type);
      return res.send(buf);
    } catch (e) {
      console.error('[upload-download] storage:', e.message);
      return res.status(404).json({ error: 'File không còn trên Storage' });
    }
  }

  if (resolved.fullPath) {
    return res.sendFile(resolved.fullPath);
  }
  return res.status(404).json({ error: 'Không tìm thấy file' });
}

module.exports = {
  ALLOWED_LOCAL_UPLOADS,
  decodeUploadPath,
  resolveLocalUploadFile,
  resolveUploadDownloadSource,
  sendUploadDownloadResponse,
};
