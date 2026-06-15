/**
 * Import / thay file APK → Storage (hoặc uploads local nếu quá giới hạn) → app_releases.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { parseReleaseFilename, buildStandardApkFilename } = require('./appReleaseFilename');
const { deleteAppReleaseBucketFiles } = require('./appReleaseDelete');

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
 * Upload APK từ đường dẫn file — không tạo bản ghi DB.
 * @returns {{ storage_path, file_url, sha256, file_size, suggestedVersion, suggestedVersionCode }}
 */
async function uploadApkFromPath(app, filePath, opts = {}) {
  const filename = opts.originalFilename || path.basename(filePath);
  const parsed = parseReleaseFilename(filename);
  const channel = opts.channel || 'production';
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const fileSize = buf.length;

  const version = opts.version || (parsed.ok ? parsed.version : null);
  if (!version) {
    throw new Error('Thiếu version — nhập version trong form phát hành (tên file APK không bắt buộc chứa số phiên bản).');
  }
  const safeVersion = String(version).replace(/[^0-9A-Za-z._-]/g, '_');
  const storagePath = `${app.app_key}/${channel}/${safeVersion}_${Date.now()}.apk`;

  let fileUrl = null;
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
    const versionCode = opts.version_code != null
      ? parseInt(opts.version_code, 10)
      : (parsed.ok ? parsed.versionCode : null);
    const localName = buildStandardApkFilename(app.app_key, version, versionCode, { release: true });
    await copyToLocalServe(app.app_key, filePath, localName);
    const base = (opts.publicBaseUrl || '').replace(/\/$/, '');
    fileUrl = `${base}/uploads/app-releases/${app.app_key}/${localName}`;
  } else {
    throw new Error('Upload Storage: ' + upErr.message);
  }

  const versionCode = opts.version_code != null
    ? parseInt(opts.version_code, 10)
    : (parsed.ok ? parsed.versionCode : null);

  return {
    storage_path: finalStoragePath,
    file_url: fileUrl,
    sha256,
    file_size: fileSize,
    suggestedVersion: version,
    suggestedVersionCode: Number.isFinite(versionCode) ? versionCode : null,
  };
}

/**
 * @param {object} app - mobile_apps row
 * @param {string} filePath - absolute path to APK
 * @param {object} opts - { channel, is_mandatory, release_notes, created_by, publicBaseUrl }
 */
async function importApkFile(app, filePath, opts = {}) {
  const uploaded = await uploadApkFromPath(app, filePath, opts);
  const version = opts.version || uploaded.suggestedVersion;
  const versionCode = opts.version_code != null
    ? parseInt(opts.version_code, 10)
    : uploaded.suggestedVersionCode;

  const { data, error } = await supabase.from('app_releases').insert({
    app_id: app.id,
    channel: opts.channel || 'production',
    update_type: 'apk',
    version,
    version_code: Number.isFinite(versionCode) ? versionCode : null,
    storage_path: uploaded.storage_path,
    file_url: uploaded.file_url,
    external_url: null,
    file_size: uploaded.file_size,
    sha256: uploaded.sha256,
    is_mandatory: opts.is_mandatory === true,
    is_active: opts.is_active !== false,
    release_notes: opts.release_notes || `Tự động import từ ${path.basename(filePath)}`,
    created_by: opts.created_by || null,
  }).select('*').single();

  if (error) throw error;
  return data;
}

/**
 * Thay file APK của bản phát hành — xóa file cũ trên bucket, upload file mới, cập nhật DB.
 * Không xóa file local uploads cũ.
 */
async function replaceReleaseApkFile(release, app, filePath, opts = {}) {
  if (release.update_type !== 'apk') {
    throw new Error('Chỉ thay file cho bản phát hành APK');
  }

  await deleteAppReleaseBucketFiles({ ...release, app_key: app.app_key });

  const channel = opts.channel || release.channel || 'production';
  const uploaded = await uploadApkFromPath(app, filePath, {
    channel,
    version: opts.version || release.version,
    version_code: opts.version_code ?? release.version_code,
    originalFilename: opts.originalFilename,
    publicBaseUrl: opts.publicBaseUrl,
  });

  const patch = {
    storage_path: uploaded.storage_path,
    file_url: uploaded.file_url,
    sha256: uploaded.sha256,
    file_size: uploaded.file_size,
    external_url: null,
    updated_at: new Date().toISOString(),
  };

  if (!opts.version && uploaded.suggestedVersion) patch.version = uploaded.suggestedVersion;
  if (opts.version_code != null && opts.version_code !== '') {
    const n = parseInt(opts.version_code, 10);
    if (Number.isFinite(n)) patch.version_code = n;
  } else if (uploaded.suggestedVersionCode != null) {
    patch.version_code = uploaded.suggestedVersionCode;
  }

  const { data, error } = await supabase.from('app_releases')
    .update(patch)
    .eq('id', release.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function sha256Base64Url(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Thay bundle OTA (jsbundle) — xóa file cũ trên bucket, upload bundle mới, cập nhật manifest.
 */
async function replaceReleaseOtaFile(release, app, filePath, opts = {}) {
  if (release.update_type !== 'jsbundle') {
    throw new Error('Chỉ thay file cho bản phát hành OTA (jsbundle)');
  }

  await deleteAppReleaseBucketFiles({ ...release, app_key: app.app_key });

  const buf = fs.readFileSync(filePath);
  const runtime = opts.runtime_version || release.runtime_version || release.manifest?.runtimeVersion;
  if (!runtime) throw new Error('Thiếu runtime_version');

  const updateId = release.manifest?.id || crypto.randomUUID();
  const bundleKey = md5Hex(buf);
  const basePath = `${app.app_key}/ota/${runtime}/${updateId}`;
  const storagePath = `${basePath}/${bundleKey}.bundle`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: 'application/javascript',
    upsert: true,
  });
  if (upErr) throw new Error('Upload bundle: ' + upErr.message);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const launchAsset = {
    hash: sha256Base64Url(buf),
    key: bundleKey,
    contentType: 'application/javascript',
    fileExtension: '.bundle',
    url: urlData.publicUrl,
  };

  const manifest = {
    ...(release.manifest || {}),
    id: updateId,
    createdAt: new Date().toISOString(),
    runtimeVersion: runtime,
    launchAsset,
    assets: release.manifest?.assets || [],
    metadata: release.manifest?.metadata || {},
    extra: release.manifest?.extra || { expoClient: { name: app.display_name } },
  };

  const patch = {
    manifest,
    runtime_version: runtime,
    file_size: buf.length,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('app_releases')
    .update(patch)
    .eq('id', release.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Liệt kê đệ quy một thư mục trong bucket và cộng dồn dung lượng (bytes).
 */
async function sumBucketFolderSize(prefix) {
  let total = 0;
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return 0;
  for (const item of data) {
    // Thư mục con: id == null (Supabase trả entry không có metadata)
    if (item.id == null && (item.metadata == null || item.metadata.size == null)) {
      total += await sumBucketFolderSize(`${prefix}/${item.name}`);
    } else {
      total += Number(item.metadata?.size) || 0;
    }
  }
  return total;
}

/**
 * Tính dung lượng thực tế của một bản OTA dựa trên các file đã upload lên bucket.
 * Folder: <app_key>/ota/<runtime>/<updateId>
 */
async function computeOtaBucketSize(release, appKey) {
  const updateId = release.manifest?.id;
  const runtime = release.runtime_version || release.manifest?.runtimeVersion;
  if (!updateId || !runtime || !appKey) return null;
  const prefix = `${appKey}/ota/${runtime}/${updateId}`;
  const size = await sumBucketFolderSize(prefix);
  return size > 0 ? size : null;
}

/**
 * Bổ sung file_size cho các bản OTA còn thiếu bằng cách đo dung lượng trên bucket,
 * rồi ghi lại vào DB. Mutates các phần tử trong mảng releases.
 */
async function backfillOtaSizes(app, releases) {
  if (!app?.app_key) return;
  const pending = (releases || []).filter(
    (r) => r.update_type === 'jsbundle' && (!Number.isFinite(Number(r.file_size)) || Number(r.file_size) <= 0),
  );
  await Promise.all(
    pending.map(async (r) => {
      try {
        const size = await computeOtaBucketSize(r, app.app_key);
        if (size && size > 0) {
          r.file_size = size;
          await supabase
            .from('app_releases')
            .update({ file_size: size })
            .eq('id', r.id);
        }
      } catch (_) { /* bỏ qua lỗi đo dung lượng */ }
    }),
  );
}

module.exports = {
  importApkFile,
  uploadApkFromPath,
  replaceReleaseApkFile,
  replaceReleaseOtaFile,
  computeOtaBucketSize,
  backfillOtaSizes,
  parseReleaseFilename,
  LOCAL_UPLOAD_ROOT,
};
