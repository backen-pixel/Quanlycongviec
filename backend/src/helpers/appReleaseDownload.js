/**
 * Phục vụ tải APK — ưu tiên file local uploads, fallback redirect URL Storage/external.
 */
const fs = require('fs');
const path = require('path');
const { LOCAL_UPLOAD_ROOT } = require('./appReleaseImport');
const { buildStandardApkFilename } = require('./appReleaseFilename');

function apkFilenameForRelease(release, appKey) {
  if (release.version && appKey) {
    return buildStandardApkFilename(appKey, release.version, release.version_code, { release: true });
  }
  return `${appKey || 'app'}-${release.version || 'release'}.apk`;
}

/** Đường dẫn tuyệt đối tới APK trong uploads/app-releases nếu có trên disk. */
function resolveLocalApkPath(release, appKey) {
  if (!appKey || !release) return null;
  const dir = path.join(LOCAL_UPLOAD_ROOT, appKey);
  if (!fs.existsSync(dir)) return null;

  const fromUrl = String(release.file_url || '').match(
    /\/uploads\/app-releases\/[^/]+\/([^/?#]+)/i,
  );
  if (fromUrl?.[1]) {
    const direct = path.join(dir, fromUrl[1]);
    if (fs.existsSync(direct)) return direct;
  }

  if (release.version) {
    const preferred = apkFilenameForRelease(release, appKey);
    const preferredPath = path.join(dir, preferred);
    if (fs.existsSync(preferredPath)) return preferredPath;

    const ver = String(release.version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const code = release.version_code != null ? String(release.version_code) : null;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.apk$/i.test(name)) continue;
      if (!new RegExp(ver).test(name)) continue;
      if (code != null && !new RegExp(`code${code}`, 'i').test(name)) continue;
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function buildPublicDownloadUrl(baseUrl, releaseId) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base || !releaseId) return null;
  return `${base}/api/app-updates/download/${releaseId}`;
}

/** Trích đường dẫn uploads local từ file_url (tương đối hoặc URL đầy đủ cùng host). */
function resolveDiskPathFromFileUrl(fileUrl) {
  if (!fileUrl) return null;
  const raw = String(fileUrl).trim();
  if (!raw) return null;

  let rel = null;
  if (raw.startsWith('/uploads/')) {
    rel = raw.replace(/^\//, '');
  } else {
    const m = raw.match(/\/uploads\/app-releases\/[^?#]+/i);
    if (m) rel = m[0].replace(/^\//, '');
  }
  if (!rel) return null;

  const diskPath = path.join(__dirname, '../..', rel);
  return fs.existsSync(diskPath) ? diskPath : null;
}

function statFileSizeSafe(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function downloadUrlForRelease(release, publicBase) {
  return buildPublicDownloadUrl(publicBase, release.id)
    || release.external_url
    || release.file_url
    || null;
}

/** APK có thể tải được (file local, Supabase Storage, hoặc URL ngoài — không tin file_url /uploads khi chưa có trên disk). */
function isReleaseApkAvailable(release, appKey) {
  if (!release) return false;
  if (release.update_type && release.update_type !== 'apk') return false;

  const diskPath = resolveLocalApkPath(release, appKey) || resolveDiskPathFromFileUrl(release.file_url);
  if (diskPath) return true;

  if (release.storage_path && String(release.storage_path).trim()) return true;

  const ext = String(release.external_url || '').trim();
  if (ext && /^https?:\/\//i.test(ext)) return true;

  const fileUrl = String(release.file_url || '').trim();
  if (fileUrl && /^https?:\/\//i.test(fileUrl) && !/\/uploads\/app-releases\//i.test(fileUrl)) {
    return true;
  }

  return false;
}

module.exports = {
  apkFilenameForRelease,
  resolveLocalApkPath,
  resolveDiskPathFromFileUrl,
  statFileSizeSafe,
  buildPublicDownloadUrl,
  downloadUrlForRelease,
  isReleaseApkAvailable,
};
