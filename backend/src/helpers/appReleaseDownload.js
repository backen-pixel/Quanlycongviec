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

function downloadUrlForRelease(release, publicBase) {
  return release.external_url || release.file_url || buildPublicDownloadUrl(publicBase, release.id);
}

module.exports = {
  apkFilenameForRelease,
  resolveLocalApkPath,
  buildPublicDownloadUrl,
  downloadUrlForRelease,
};
