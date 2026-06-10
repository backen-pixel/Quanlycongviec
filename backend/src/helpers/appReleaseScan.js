/**
 * Quét thư mục APK local, đọc phiên bản từ tên file, so với bản đã phát hành trong DB.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { parseReleaseFilename, FILENAME_RULE_TEXT } = require('./appReleaseFilename');

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** app_key trên server ≠ tên thư mục project (vd: tubep-demo → demo-mobile). */
const FOLDER_ALIASES = {
  'tubep-demo': 'demo-mobile',
};

/** Tách chuỗi đường dẫn tùy chỉnh (cho phép nhiều thư mục, ngăn bằng xuống dòng | ; hoặc ,). */
function parseCustomDirs(customDir) {
  if (!customDir) return [];
  return String(customDir)
    .split(/[\r\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((d) => (path.isAbsolute(d) ? d : path.join(REPO_ROOT, d)));
}

/**
 * @param {string} appKey
 * @param {string} [customDir] - đường dẫn tùy chỉnh (mobile_apps.apk_scan_dir), được ưu tiên.
 */
function getScanDirs(appKey, customDir) {
  const dirs = [];

  // Thư mục cấu hình riêng cho app được ưu tiên trước.
  dirs.push(...parseCustomDirs(customDir));

  const folderNames = [appKey, FOLDER_ALIASES[appKey]].filter(Boolean);
  const envRoot = process.env.APP_RELEASES_SCAN_ROOT;
  for (const folder of folderNames) {
    if (envRoot) dirs.push(path.join(envRoot, folder));
    dirs.push(path.join(REPO_ROOT, folder, 'dist'));
    dirs.push(path.join(REPO_ROOT, 'app-releases-staging', folder));
    dirs.push(path.join(REPO_ROOT, 'backend', 'uploads', 'app-releases', folder));
  }

  const seen = new Set();
  const out = [];
  for (const d of dirs) {
    const norm = path.normalize(d);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (fs.existsSync(norm) && fs.statSync(norm).isDirectory()) out.push(norm);
  }
  return out;
}

function sha256FileSync(filePath) {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return { sha256: hash.digest('hex'), size: buf.length };
}

async function listApkFilesInDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile() || !/\.apk$/i.test(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const stat = fs.statSync(full);
    files.push({
      path: full,
      name: ent.name,
      dir,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    });
  }
  return files;
}

/**
 * Quét tất cả thư mục của app, phân loại: importable / skipped / already_imported.
 */
/**
 * @param {object} app - mobile_apps row
 * @param {object} [opts] - { userScanDir } thư mục quét riêng của nhân viên hiện tại (ưu tiên cao nhất)
 */
async function scanAppReleaseFiles(app, opts = {}) {
  const combinedCustom = [opts.userScanDir, app.apk_scan_dir]
    .filter(Boolean)
    .join('\n');
  const dirs = getScanDirs(app.app_key, combinedCustom);
  const rawFiles = [];
  for (const dir of dirs) {
    const list = await listApkFilesInDir(dir);
    rawFiles.push(...list);
  }

  const { data: existing } = await supabase
    .from('app_releases')
    .select('id, version, version_code, sha256, storage_path, file_url')
    .eq('app_id', app.id)
    .eq('update_type', 'apk');

  const bySha = new Map((existing || []).filter((r) => r.sha256).map((r) => [r.sha256, r]));
  const byVersion = new Map(
    (existing || []).map((r) => [`${r.version}|${r.version_code ?? ''}`, r]),
  );

  const importable = [];
  const skipped = [];
  const alreadyImported = [];

  for (const f of rawFiles) {
    const parsed = parseReleaseFilename(f.name);
    if (!parsed.ok) {
      skipped.push({ ...f, reason: parsed.error });
      continue;
    }

    let sha256 = null;
    let size = f.size;
    try {
      const h = sha256FileSync(f.path);
      sha256 = h.sha256;
      size = h.size;
    } catch (e) {
      skipped.push({ ...f, reason: 'Không đọc được file: ' + e.message });
      continue;
    }

    if (sha256 && bySha.has(sha256)) {
      alreadyImported.push({
        ...f,
        version: parsed.version,
        version_code: parsed.versionCode,
        release_id: bySha.get(sha256).id,
        reason: 'Đã phát hành (trùng sha256)',
      });
      continue;
    }

    const vk = `${parsed.version}|${parsed.versionCode ?? ''}`;
    if (byVersion.has(vk)) {
      alreadyImported.push({
        ...f,
        version: parsed.version,
        version_code: parsed.versionCode,
        release_id: byVersion.get(vk).id,
        reason: 'Đã phát hành (trùng version)',
      });
      continue;
    }

    importable.push({
      path: f.path,
      name: f.name,
      dir: f.dir,
      size,
      mtime: f.mtime,
      version: parsed.version,
      version_code: parsed.versionCode,
      sha256,
    });
  }

  const configuredDirs = parseCustomDirs(combinedCustom).map((d) => ({
    path: path.normalize(d),
    exists: fs.existsSync(d) && fs.statSync(d).isDirectory(),
  }));

  return {
    rule: FILENAME_RULE_TEXT,
    scan_dirs: dirs,
    configured_dirs: configuredDirs,
    my_scan_dir: opts.userScanDir || '',
    app_scan_dir: app.apk_scan_dir || '',
    importable,
    skipped,
    already_imported: alreadyImported,
  };
}

module.exports = {
  getScanDirs,
  scanAppReleaseFiles,
  REPO_ROOT,
};
