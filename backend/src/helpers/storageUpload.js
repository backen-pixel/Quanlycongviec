const path = require('path');
const { supabase } = require('../config/supabase');
const { sanitizeStorageFilename, isInvalidStorageKeyError } = require('./storageFilename');

const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'attachments';

function isStorageSizeLimitError(err) {
  const msg = String(err?.message || err || '');
  return /exceeded the maximum allowed size|maximum allowed size|EntityTooLarge|maximum size exceeded|Payload too large|413/i.test(msg);
}

/**
 * Upload buffer lên Supabase Storage — dùng chung CRM / messenger / upload route.
 */
async function uploadBufferToStorage(buffer, {
  originalName,
  mimetype,
  size,
  entityType = 'general',
  entityId = null,
  bucket = DEFAULT_BUCKET,
  folderPrefix = null,
}) {
  const ext = path.extname(originalName || '').toLowerCase() || '';
  const safeName = sanitizeStorageFilename(path.basename(originalName || 'file', path.extname(originalName || '')));
  const timestamp = Date.now();
  const folder = folderPrefix || (entityId ? `${entityType || 'general'}/${entityId}` : (entityType || 'general'));
  let storagePath = `${folder}/${timestamp}_${safeName}${ext}`.replace(/^\//, '');

  let uploadError;
  ({ error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType: mimetype || 'application/octet-stream', upsert: false }));

  if (uploadError && isInvalidStorageKeyError(uploadError)) {
    storagePath = `${folder}/${timestamp}_file${ext || '.bin'}`.replace(/^\//, '');
    ({ error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType: mimetype || 'application/octet-stream', upsert: false }));
  }

  if (uploadError) {
    const err = new Error(uploadError.message || 'Lỗi tải lên Storage');
    if (isStorageSizeLimitError(uploadError)) err.code = 'STORAGE_SIZE_LIMIT';
    throw err;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return {
    file_name: originalName,
    file_url: urlData.publicUrl,
    file_size: size,
    mime_type: mimetype,
    storage_path: storagePath,
    bucket,
  };
}

async function downloadStorageObject(bucket, objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw error;
  return data;
}

module.exports = {
  DEFAULT_BUCKET,
  isStorageSizeLimitError,
  uploadBufferToStorage,
  downloadStorageObject,
};
