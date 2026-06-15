/**
 * Quy tắc tên file APK để hệ thống tự đọc phiên bản.
 *
 * Bắt buộc: tên file phải chứa số phiên bản semver (x.y hoặc x.y.z).
 * Khuyến nghị:
 *   {app_key}-{version}[-code{version_code}][-release].apk
 *
 * Ví dụ hợp lệ:
 *   crm-mobile-1.3.35-code51-release.apk
 *   tubep-demo-1.0.0.apk
 *   TuBepDemo-1.0.0-code2-release.apk
 */
const SEMVER_IN_NAME = /(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/g;
const CODE_IN_NAME = /(?:^|[-_])code(\d+)/i;

const FILENAME_RULE_TEXT =
  'Nhập version / version code trong form phát hành (bắt buộc). '
  + 'Tên file APK có thể bất kỳ (.apk); nếu tên chứa số phiên bản thì hệ thống tự điền thêm. '
  + 'Khuyến nghị: {app_key}-{version}[-code{version_code}][-release].apk';

function parseReleaseFilename(filename) {
  const name = String(filename || '').trim();
  if (!name) return { ok: false, error: 'Tên file trống' };
  if (!/\.apk$/i.test(name)) return { ok: false, error: 'File phải có đuôi .apk' };

  const base = name.replace(/\.apk$/i, '');
  const verMatch = [...base.matchAll(SEMVER_IN_NAME)].pop()?.[1] || null;
  if (!verMatch) {
    return {
      ok: false,
      error: 'Không đọc được version từ tên file — nhập version trong form phát hành.',
    };
  }

  const version = verMatch;
  const codeMatch = base.match(CODE_IN_NAME);
  const versionCode = codeMatch ? parseInt(codeMatch[1], 10) : null;

  return {
    ok: true,
    filename: name,
    version,
    versionCode: Number.isFinite(versionCode) ? versionCode : null,
  };
}

/** Tên file chuẩn khi build APK (dùng trong script build). */
function buildStandardApkFilename(appKey, version, versionCode, opts = {}) {
  const safeKey = String(appKey).replace(/[^0-9A-Za-z._-]/g, '-');
  const safeVer = String(version).replace(/[^0-9A-Za-z._-]/g, '_');
  // crm-mobile-v2 + 2.0.23 → crm-mobile-v2.0.23-... (tránh crm-mobile-v2-2.0.23)
  const stem = /-v\d+$/i.test(safeKey)
    ? `${safeKey}.${safeVer}`
    : `${safeKey}-${safeVer}`;
  const parts = [stem];
  if (versionCode != null && versionCode !== '') parts.push(`code${versionCode}`);
  if (opts.release) parts.push('release');
  return `${parts.join('-')}.apk`;
}

module.exports = {
  FILENAME_RULE_TEXT,
  parseReleaseFilename,
  buildStandardApkFilename,
};
