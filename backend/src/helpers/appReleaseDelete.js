/**
 * Xóa bản phát hành: file trong bucket Supabase + bản ghi DB.
 * Không xóa file APK local (uploads/app-releases trên máy server).
 */
const { supabase } = require('../config/supabase');

const BUCKET = 'app-releases';

function storagePathFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const markers = [`/object/public/${BUCKET}/`, `/object/sign/${BUCKET}/`];
  for (const marker of markers) {
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      return url.slice(idx + marker.length).split('?')[0];
    }
  }
  return null;
}

function collectOtaStoragePaths(manifest) {
  if (!manifest) return [];
  const paths = [];
  const launch = manifest.launchAsset;
  if (launch?.url) {
    const p = storagePathFromPublicUrl(launch.url);
    if (p) paths.push(p);
  }
  for (const asset of manifest.assets || []) {
    const p = storagePathFromPublicUrl(asset.url);
    if (p) paths.push(p);
  }
  return paths;
}

async function listStorageUnderPrefix(prefix) {
  const out = [];
  const norm = prefix.replace(/\/$/, '');
  const { data, error } = await supabase.storage.from(BUCKET).list(norm);
  if (error || !data) return out;

  for (const item of data) {
    const child = `${norm}/${item.name}`;
    if (item.id == null) {
      out.push(...await listStorageUnderPrefix(child));
    } else {
      out.push(child);
    }
  }
  return out;
}

async function deleteStoragePaths(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return { removed: 0, errors: [] };

  const errors = [];
  let removed = 0;
  const batchSize = 100;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) errors.push(error.message);
    else removed += batch.length;
  }
  return { removed, errors };
}

/**
 * @param {object} rel — app_releases row (+ app_key nếu join mobile_apps)
 */
async function deleteAppReleaseBucketFiles(rel) {
  const storagePaths = [];

  if (rel.storage_path) storagePaths.push(rel.storage_path);

  for (const url of [rel.file_url, rel.external_url]) {
    const sp = storagePathFromPublicUrl(url);
    if (sp) storagePaths.push(sp);
  }

  if (rel.update_type === 'jsbundle' && rel.manifest) {
    storagePaths.push(...collectOtaStoragePaths(rel.manifest));

    const updateId = rel.manifest.id;
    const runtime = rel.runtime_version || rel.manifest.runtimeVersion;
    const appKey = rel.app_key;
    if (updateId && runtime && appKey) {
      const prefix = `${appKey}/ota/${runtime}/${updateId}`;
      const under = await listStorageUnderPrefix(prefix);
      storagePaths.push(...under);
    }
  }

  const storageResult = await deleteStoragePaths(storagePaths);

  return {
    storageFilesRemoved: storageResult.removed,
    errors: storageResult.errors,
  };
}

async function deleteAppReleaseById(releaseId) {
  const { data: rel } = await supabase
    .from('app_releases')
    .select('*, mobile_apps(app_key)')
    .eq('id', releaseId)
    .maybeSingle();

  if (!rel) return { found: false };

  const row = { ...rel, app_key: rel.mobile_apps?.app_key };
  const bucket = await deleteAppReleaseBucketFiles(row);

  const { error } = await supabase.from('app_releases').delete().eq('id', releaseId);
  if (error) throw error;

  return { found: true, ...bucket };
}

module.exports = {
  deleteAppReleaseById,
  deleteAppReleaseBucketFiles,
};
