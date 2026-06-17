/**
 * Lấy thumbnail Google Drive — refresh link + stream proxy.
 */
const { externalAxios } = require('../config/httpAgents');
const gdrive = require('../services/googleDrive');

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function getDriveAuth() {
  const drive = gdrive.getDriveClient();
  return drive.auth || drive.context?._options?.auth || null;
}

async function getAuthHeaders() {
  const auth = getDriveAuth();
  if (!auth) return {};
  if (typeof auth.getRequestHeaders === 'function') {
    try {
      return await auth.getRequestHeaders();
    } catch (_) { /* fall through */ }
  }
  if (typeof auth.getAccessToken === 'function') {
    const raw = await auth.getAccessToken();
    const token = typeof raw === 'string' ? raw : raw?.token;
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function upsizeThumbnailLink(link) {
  if (!link || typeof link !== 'string') return null;
  return link.replace(/=s\d+(?:-c)?(?=$|[&?])/i, '=s800');
}

function okImageContentType(ct) {
  const s = String(ct || '').toLowerCase();
  if (!s || s.includes('text/html') || s.includes('application/json')) return false;
  return s.startsWith('image/') || s.includes('octet-stream');
}

async function fetchUrlStream(url, label) {
  if (!url) return null;
  const auth = getDriveAuth();

  if (auth?.request) {
    try {
      const resp = await auth.request({ url, responseType: 'stream', timeout: 25_000 });
      const ct = resp.headers?.['content-type'] || resp.headers?.['Content-Type'] || '';
      if (okImageContentType(ct)) return { stream: resp.data, contentType: ct || 'image/jpeg' };
    } catch (e) {
      console.warn(`[driveThumbnail] ${label} auth.request:`, e.message);
    }
  }

  try {
    const headers = await getAuthHeaders();
    const resp = await externalAxios.get(url, {
      responseType: 'stream',
      headers,
      maxRedirects: 5,
      timeout: 25_000,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const ct = resp.headers['content-type'] || 'image/jpeg';
    if (okImageContentType(ct)) return { stream: resp.data, contentType: ct };
  } catch (e) {
    console.warn(`[driveThumbnail] ${label} axios:`, e.message);
  }
  return null;
}

/** Lấy thumbnailLink mới từ Google (iconLink fallback). */
async function fetchFreshThumbnailLink(googleFileId) {
  const drive = gdrive.getDriveClient();
  const { data } = await drive.files.get({
    fileId: googleFileId,
    fields: 'thumbnailLink,iconLink,mimeType,hasThumbnail',
    supportsAllDrives: true,
  });
  if (data.mimeType === FOLDER_MIME) return { thumbnail_url: null, mime_type: data.mimeType };
  const thumbnail_url = upsizeThumbnailLink(data.thumbnailLink) || data.iconLink || null;
  return { thumbnail_url, mime_type: data.mimeType };
}

/** Stream thumbnail — thử link mới, drive.thumbnail, ảnh gốc, icon. */
async function getThumbnailStream(googleFileId, { mimeType } = {}) {
  let meta;
  try {
    meta = await fetchFreshThumbnailLink(googleFileId);
  } catch (e) {
    console.warn('[driveThumbnail] meta:', e.message);
    return null;
  }

  const mime = mimeType || meta.mime_type;
  const freshLink = meta.thumbnail_url;

  const urls = [];
  if (freshLink) urls.push(freshLink);
  urls.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(googleFileId)}&sz=w800`);
  if (mime?.startsWith('video/')) {
    urls.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(googleFileId)}&sz=w400-h300`);
    urls.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(googleFileId)}&sz=w200`);
  }

  for (let i = 0; i < urls.length; i++) {
    const hit = await fetchUrlStream(urls[i], i === 0 ? 'link' : 'drive.thumbnail');
    if (hit) return { ...hit, freshThumbnailLink: meta.thumbnail_url };
  }

  if (mime?.startsWith('image/')) {
    try {
      const { stream } = await gdrive.getDownloadStream(googleFileId);
      return { stream, contentType: mime, freshThumbnailLink: freshLink };
    } catch (e) {
      console.warn('[driveThumbnail] download-stream:', e.message);
    }
  }

  return null;
}

module.exports = {
  fetchFreshThumbnailLink,
  getThumbnailStream,
  upsizeThumbnailLink,
};
