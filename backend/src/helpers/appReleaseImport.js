/**
 * Import APK từ file local → Storage (hoặc uploads local nếu quá giới hạn) → app_releases.
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');
const { parseReleaseFilename } = require('./appReleaseFilename');

const BUCKET = 'app-releases';
const LOCAL_UPLOAD_ROOT = path.join(__dirname, '../../uploads/app-releases');

function isStorageSizeLimitError(err) {
  const msg = String(err?.message || err || '');
  return /exceeded the maximum allowed size|maximum allowed size|EntityTooLarge|maximum size exceeded/i.test(msg);
}

async function copyToLocalServe(appKey, sourcePath, filename) {
  const destDir = path.join(LOCAL_UPLOAD_ROOT, appKey);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, filename);
  fs.copyFileSync(sourcePath, dest);
  return dest;
}

/**
 * @param {object} app - mobile_apps row
 * @param {string} filePath - absolute path to APK
 * @param {object} opts - { channel, is_mandatory, release_notes, created_by, publicBaseUrl }
 */
async function importApkFile(app, filePath, opts = {}) {
  const filename = path.basename(filePath);
  const parsed = parseReleaseFilename(filename);
  if (!parsed.ok) throw new Error(parsed.error);

  const version = opts.version || parsed.version;
  const versionCode = opts.version_code != null
    ? parseInt(opts.version_code, 10)
    : parsed.versionCode;
  const channel = opts.channel || 'production';

  const buf = fs.readFileSync(filePath);
  const crypto = require('crypto');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const fileSize = buf.length;

  const safeVersion = String(version).replace(/[^0-9A-Za-z._-]/g, '_');
  const storagePath = `${app.app_key}/${channel}/${safeVersion}_${Date.now()}.apk`;

  let fileUrl = null;
  let externalUrl = null;
  let finalStoragePath = null;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: 'application/vnd.android.package-archive',
    upsert: false,
  });

  if (!upErr) {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    fileUrl = urlData.publicUrl;
    finalStoragePath = storagePath;
  } else if (isStorageSizeLimitError(upErr)) {
    const localName = filename.replace(/[^0-9A-Za-z._-]/g, '_');
    await copyToLocalServe(app.app_key, filePath, localName);
    const base = (opts.publicBaseUrl || '').replace(/\/$/, '');
    fileUrl = `${base}/uploads/app-releases/${app.app_key}/${localName}`;
  } else {
    throw new Error('Upload Storage: ' + upErr.message);
  }

  const { data, error } = await supabase.from('app_releases').insert({
    app_id: app.id,
    channel,
    update_type: 'apk',
    version,
    version_code: Number.isFinite(versionCode) ? versionCode : null,
    storage_path: finalStoragePath,
    file_url: fileUrl,
    external_url: externalUrl,
    file_size: fileSize,
    sha256,
    is_mandatory: opts.is_mandatory === true,
    is_active: opts.is_active !== false,
    release_notes: opts.release_notes || `Tự động import từ ${filename}`,
    created_by: opts.created_by || null,
  }).select('*').single();

  if (error) throw error;
  return data;
}

module.exports = {
  importApkFile,
  parseReleaseFilename,
  LOCAL_UPLOAD_ROOT,
};
