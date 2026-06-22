/**
 * Bộ ảnh Facebook Messenger — nguồn từ thư mục Drive.
 */
const path = require('path');
const { supabase } = require('../config/supabase');
const driveAcl = require('./drivePermissions');
const gdrive = require('../services/googleDrive');
const { sanitizeStorageFilename, isInvalidStorageKeyError } = require('./storageFilename');

const BUCKET = 'attachments';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES_PER_SEND = 30;
/** Tải Drive → gửi FB pipeline song song (mỗi ảnh = 1 tin Messenger). */
const PIPELINE_CONCURRENCY = 6;

const DRIVE_FILE_SEND_SELECT = 'id, name, mime_type, size_bytes, google_file_id, folder_id, root_id, md5';

/** Worker pool — giới hạn số tác vụ song song. */
async function runWithConcurrency(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const results = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      try {
        results[index] = { ok: true, value: await worker(list[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/** URL Messenger đã publish gần đây — tránh tải lại Drive nếu file chưa đổi. */
async function buildDriveMessengerUrlCache(files) {
  const want = new Set((files || []).map((f) => String(f.id)));
  const md5ById = new Map((files || []).map((f) => [String(f.id), f.md5 || null]));
  const cache = new Map();
  if (!want.size) return cache;

  const ids = [...want];
  let data = null;
  try {
    const res = await supabase
      .from('facebook_messages')
      .select('attachment_url, metadata')
      .eq('message_type', 'image')
      .not('attachment_url', 'is', null)
      .in('metadata->>drive_file_id', ids)
      .order('created_at', { ascending: false })
      .limit(Math.max(ids.length * 2, 40));
    if (!res.error) data = res.data;
  } catch {
    /* fallback below */
  }
  if (!data) {
    const res = await supabase
      .from('facebook_messages')
      .select('attachment_url, metadata')
      .eq('message_type', 'image')
      .not('attachment_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(800);
    data = res.data;
  }

  for (const row of data || []) {
    const fid = row.metadata?.drive_file_id;
    if (!fid || !want.has(String(fid)) || cache.has(String(fid))) continue;
    const cachedMd5 = row.metadata?.drive_file_md5 || null;
    const currentMd5 = md5ById.get(String(fid));
    if (currentMd5 && cachedMd5 && cachedMd5 !== currentMd5) continue;
    cache.set(String(fid), row.attachment_url);
  }
  return cache;
}

function isImageMime(mime, filename) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return true;
  if (filename && /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i.test(filename)) return true;
  return false;
}

async function streamToBuffer(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) {
      throw Object.assign(new Error('Ảnh vượt quá 25MB — không gửi được qua Messenger'), { status: 400 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function uploadBufferToMessengerStorage(buffer, { originalName, mimetype, contactId }) {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const safeName = sanitizeStorageFilename(path.basename(originalName, path.extname(originalName)));
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const folder = contactId ? `messenger/${contactId}` : 'messenger';
  let storagePath = `${folder}/${stamp}_${safeName}${ext}`;

  let uploadError;
  ({ error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimetype, upsert: false }));

  if (uploadError && isInvalidStorageKeyError(uploadError)) {
    storagePath = `${folder}/${stamp}_image${ext}`;
    ({ error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimetype, upsert: false }));
  }

  if (uploadError) {
    throw Object.assign(new Error(uploadError.message || 'Lỗi tải ảnh lên Storage'), { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function downloadDriveImageBuffer(file) {
  if (!file?.google_file_id) {
    throw Object.assign(new Error('File Drive chưa có google_file_id'), { status: 400 });
  }
  const { stream } = await gdrive.getDownloadStream(file.google_file_id);
  return streamToBuffer(stream, MAX_IMAGE_BYTES);
}

async function assertDriveImageSendable(user, file, { skipAcl = false } = {}) {
  if (!file?.id) throw Object.assign(new Error('File không tồn tại'), { status: 404 });
  if (!skipAcl) {
    const access = await driveAcl.canAccess({ user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) throw Object.assign(new Error('Không có quyền file Drive'), { status: 403 });
  }
  if (!isImageMime(file.mime_type, file.name)) {
    throw Object.assign(new Error('Chỉ gửi được file ảnh'), { status: 400 });
  }
  if (file.size_bytes && file.size_bytes > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('Ảnh vượt quá 25MB'), { status: 400 });
  }
}

async function publishDriveImageFromFile(user, file, contactId, cachedUrl = null, { skipAcl = false } = {}) {
  await assertDriveImageSendable(user, file, { skipAcl });

  const mimetype = file.mime_type || 'image/jpeg';
  if (cachedUrl) {
    return { file_url: cachedUrl, mime_type: mimetype, name: file.name, from_cache: true };
  }

  const buffer = await downloadDriveImageBuffer(file);
  const fileUrl = await uploadBufferToMessengerStorage(buffer, {
    originalName: file.name || 'image.jpg',
    mimetype,
    contactId,
  });
  return { file_url: fileUrl, mime_type: mimetype, name: file.name, from_cache: false };
}

async function publishDriveImageForMessenger(user, driveFileId, contactId) {
  const { data: file } = await supabase
    .from('drive_files')
    .select(DRIVE_FILE_SEND_SELECT)
    .eq('id', driveFileId)
    .is('trashed_at', null)
    .maybeSingle();
  if (!file) throw Object.assign(new Error('File không tồn tại'), { status: 404 });
  return publishDriveImageFromFile(user, file, contactId);
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function formatFacebookSendError(msg) {
  const s = String(msg || '');
  if (s.includes('outside the allowed window') || s.includes('2018278')) {
    return 'Khách chưa nhắn trong 24h — Facebook không cho gửi ảnh chủ động. Nhờ khách nhắn lại hoặc dùng tin nhắn mẫo được phép.';
  }
  return s || 'Lỗi gửi ảnh';
}

/** Đồng bộ metadata folder/file ảnh từ Google Drive vào DB (1 cấp). */
async function syncGoogleChildrenToDb({ rootId, parentFolderId, googleParentId, userId }) {
  if (!googleParentId || !rootId) return;
  const items = await gdrive.listChildren(googleParentId);
  const now = new Date().toISOString();

  for (const item of items) {
    if (item.mimeType === FOLDER_MIME) {
      const { data: existing } = await supabase
        .from('drive_folders')
        .select('id')
        .eq('google_folder_id', item.id)
        .maybeSingle();
      if (existing) {
        await supabase.from('drive_folders').update({ name: item.name, updated_at: now }).eq('id', existing.id);
      } else {
        await supabase.from('drive_folders').insert({
          root_id: rootId,
          parent_id: parentFolderId || null,
          name: item.name,
          google_folder_id: item.id,
          created_by: userId || null,
        });
      }
      continue;
    }
    if (!isImageMime(item.mimeType, item.name)) continue;

    const { data: existing } = await supabase
      .from('drive_files')
      .select('id')
      .eq('google_file_id', item.id)
      .maybeSingle();
    const patch = {
      name: item.name,
      mime_type: item.mimeType,
      size_bytes: parseInt(item.size || 0, 10) || 0,
      google_view_url: item.webViewLink || null,
      thumbnail_url: item.thumbnailLink || null,
      md5: item.md5Checksum || null,
      updated_at: now,
    };
    if (existing) {
      await supabase.from('drive_files').update(patch).eq('id', existing.id);
    } else {
      await supabase.from('drive_files').insert({
        root_id: rootId,
        folder_id: parentFolderId || null,
        google_file_id: item.id,
        uploaded_by: userId || null,
        version: 1,
        ...patch,
      });
    }
  }
}

async function syncRootFromGoogle(user, rootId) {
  const { data: root } = await supabase.from('drive_roots').select('id, google_folder_id').eq('id', rootId).maybeSingle();
  if (!root?.google_folder_id) return;
  await syncGoogleChildrenToDb({
    rootId: root.id,
    parentFolderId: null,
    googleParentId: root.google_folder_id,
    userId: user?.userId || user?.id || null,
  });
  const { data: subfolders } = await supabase
    .from('drive_folders')
    .select('id, google_folder_id')
    .eq('root_id', rootId)
    .is('parent_id', null)
    .is('trashed_at', null);
  for (const sf of subfolders || []) {
    if (!sf.google_folder_id) continue;
    await syncGoogleChildrenToDb({
      rootId: root.id,
      parentFolderId: sf.id,
      googleParentId: sf.google_folder_id,
      userId: user?.userId || user?.id || null,
    });
  }
}

async function syncFolderFromGoogle(user, folderId) {
  const { data: folder } = await supabase
    .from('drive_folders')
    .select('id, root_id, google_folder_id')
    .eq('id', folderId)
    .maybeSingle();
  if (!folder?.google_folder_id) return;
  await syncGoogleChildrenToDb({
    rootId: folder.root_id,
    parentFolderId: folder.id,
    googleParentId: folder.google_folder_id,
    userId: user?.userId || user?.id || null,
  });
}

async function listFolderImages(user, folderId, limit = MAX_IMAGES_PER_SEND, { syncGoogle = true } = {}) {
  if (syncGoogle) await syncFolderFromGoogle(user, folderId);
  const access = await driveAcl.canAccess({ user, targetType: 'folder', targetId: folderId, requiredRole: 'viewer' });
  if (!access.ok) throw Object.assign(new Error('Không có quyền thư mục Drive'), { status: 403 });

  const { data: files, error } = await supabase
    .from('drive_files')
    .select(DRIVE_FILE_SEND_SELECT)
    .eq('folder_id', folderId)
    .is('trashed_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw error;

  return (files || []).filter((f) => isImageMime(f.mime_type, f.name)).slice(0, limit);
}

function imageSetSelect() {
  return 'id, name, description, drive_folder_id, company_id, sort_index, is_active, created_at, updated_at, drive_folder:drive_folders(id, name), company:companies(id, name, short_name)';
}

async function listImageSets(companyId = null) {
  let q = supabase
    .from('facebook_image_sets')
    .select(imageSetSelect())
    .eq('is_active', true)
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: false });
  if (companyId) {
    q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function listAllImageSetsAdmin() {
  const { data, error } = await supabase
    .from('facebook_image_sets')
    .select(imageSetSelect())
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getImageSet(id) {
  const { data, error } = await supabase
    .from('facebook_image_sets')
    .select(imageSetSelect())
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createImageSet(user, body) {
  const name = String(body?.name || '').trim();
  const driveFolderId = String(body?.drive_folder_id || '').trim();
  if (!name || !driveFolderId) {
    throw Object.assign(new Error('Cần tên bộ và thư mục Drive'), { status: 400 });
  }
  const access = await driveAcl.canAccess({ user, targetType: 'folder', targetId: driveFolderId, requiredRole: 'viewer' });
  if (!access.ok) throw Object.assign(new Error('Không có quyền thư mục Drive đã chọn'), { status: 403 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('facebook_image_sets')
    .insert({
      name,
      description: String(body?.description || '').trim() || null,
      drive_folder_id: driveFolderId,
      company_id: body?.company_id || null,
      sort_index: Number(body?.sort_index) || 0,
      is_active: body?.is_active !== false,
      created_by: user?.userId || user?.id || null,
      updated_at: now,
    })
    .select(imageSetSelect())
    .single();
  if (error) throw error;
  return data;
}

async function updateImageSet(id, body) {
  const patch = { updated_at: new Date().toISOString() };
  if (body?.name != null) patch.name = String(body.name).trim();
  if (body?.description != null) patch.description = String(body.description).trim() || null;
  if (body?.drive_folder_id != null) patch.drive_folder_id = body.drive_folder_id;
  if (body?.company_id !== undefined) patch.company_id = body.company_id || null;
  if (body?.sort_index != null) patch.sort_index = Number(body.sort_index) || 0;
  if (body?.is_active != null) patch.is_active = !!body.is_active;

  const { data, error } = await supabase
    .from('facebook_image_sets')
    .update(patch)
    .eq('id', id)
    .select(imageSetSelect())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Không tìm thấy bộ ảnh'), { status: 404 });
  return data;
}

async function deleteImageSet(id) {
  const { error } = await supabase.from('facebook_image_sets').delete().eq('id', id);
  if (error) throw error;
}

async function enrichSetWithImageCount(user, setRow) {
  if (!setRow?.drive_folder_id) return { ...setRow, image_count: 0, preview_images: [] };
  try {
    const images = await listFolderImages(user, setRow.drive_folder_id, 6);
    const all = await listFolderImages(user, setRow.drive_folder_id, MAX_IMAGES_PER_SEND);
    return {
      ...setRow,
      image_count: all.length,
      preview_images: images.map((f) => ({
        id: f.id,
        name: f.name,
        thumbnail_url: f.thumbnail_url,
      })),
    };
  } catch {
    return { ...setRow, image_count: 0, preview_images: [] };
  }
}

function mapPreviewImages(files, limit = 6) {
  return (files || []).slice(0, limit).map((f) => ({
    id: f.id,
    name: f.name,
    thumbnail_url: f.thumbnail_url,
  }));
}

async function enrichFolderSendItem(user, folderRow, { source = 'kho' } = {}) {
  if (!folderRow?.id) return { folder_id: null, name: '', source, image_count: 0, preview_images: [] };
  try {
    const preview = await listFolderImages(user, folderRow.id, 6);
    const all = await listFolderImages(user, folderRow.id, MAX_IMAGES_PER_SEND);
    return {
      folder_id: folderRow.id,
      name: folderRow.name,
      source,
      image_count: all.length,
      preview_images: mapPreviewImages(preview),
    };
  } catch {
    return {
      folder_id: folderRow.id,
      name: folderRow.name,
      source,
      image_count: 0,
      preview_images: [],
    };
  }
}

async function listRootLevelImages(user, rootId, limit = MAX_IMAGES_PER_SEND, { syncGoogle = true } = {}) {
  if (syncGoogle) await syncRootFromGoogle(user, rootId);
  const access = await driveAcl.canAccess({ user, targetType: 'root', targetId: rootId, requiredRole: 'viewer' });
  if (!access.ok) throw Object.assign(new Error('Không có quyền Drive'), { status: 403 });

  const { data: files, error } = await supabase
    .from('drive_files')
    .select(DRIVE_FILE_SEND_SELECT)
    .eq('root_id', rootId)
    .is('folder_id', null)
    .is('trashed_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (files || []).filter((f) => isImageMime(f.mime_type, f.name)).slice(0, limit);
}

async function buildImageSendSources(user, companyId = null) {
  const cid = companyId || user?.company_id || null;
  const allRoots = await driveAcl.listAccessibleRoots(user);
  const companyRoots = cid
    ? allRoots.filter((r) => !r.company_id || String(r.company_id) === String(cid))
    : allRoots;

  let khoRoot = companyRoots.find(
    (r) => r.shared_kind === 'company_images' && (!cid || String(r.company_id) === String(cid)),
  );
  if (!khoRoot && cid) {
    const { data } = await supabase
      .from('drive_roots')
      .select('*')
      .eq('shared_kind', 'company_images')
      .eq('company_id', cid)
      .maybeSingle();
    if (data) khoRoot = data;
  }

  let khoFolders = [];
  let khoRootImageCount = 0;
  let khoRootPreview = [];
  if (khoRoot?.id) {
    try {
      await syncRootFromGoogle(user, khoRoot.id);
      const { data: folders } = await supabase
        .from('drive_folders')
        .select('id, name')
        .eq('root_id', khoRoot.id)
        .is('parent_id', null)
        .is('trashed_at', null)
        .order('name');
      khoFolders = await Promise.all((folders || []).map((f) => enrichFolderSendItem(user, f, { source: 'kho' })));
      const rootImages = await listRootLevelImages(user, khoRoot.id, MAX_IMAGES_PER_SEND);
      khoRootImageCount = rootImages.length;
      khoRootPreview = mapPreviewImages(rootImages);
    } catch {
      /* kho chưa sẵn sàng */
    }
  }

  const configuredRows = await listImageSets(cid);
  const configured_sets = await Promise.all(configuredRows.map((row) => enrichSetWithImageCount(user, row)));

  return {
    company_id: cid,
    kho_root: khoRoot ? { id: khoRoot.id, name: khoRoot.name } : null,
    kho_folders: khoFolders,
    kho_root_image_count: khoRootImageCount,
    kho_root_preview_images: khoRootPreview,
    configured_sets,
    company_roots: companyRoots.map((r) => ({
      id: r.id,
      name: r.name,
      shared_kind: r.shared_kind,
      scope: r.scope,
      module_key: r.module_key,
    })),
  };
}

/** Xem trước ảnh trong thư mục / gốc kho — sync Google tùy chọn (mặc định bật). */
async function getDriveFolderImagesPreview(user, {
  folderId = null,
  rootId = null,
  limit = MAX_IMAGES_PER_SEND,
  syncGoogle = true,
} = {}) {
  let images = [];
  let label = 'Drive';
  const syncOpts = { syncGoogle };

  if (folderId) {
    const { data: folder } = await supabase.from('drive_folders').select('id, name').eq('id', folderId).maybeSingle();
    label = folder?.name || label;
    images = await listFolderImages(user, folderId, limit, syncOpts);
  } else if (rootId) {
    const { data: root } = await supabase.from('drive_roots').select('id, name').eq('id', rootId).maybeSingle();
    label = root?.name || label;
    images = await listRootLevelImages(user, rootId, limit, syncOpts);
  }

  return {
    label,
    folder_id: folderId,
    root_id: rootId,
    image_count: images.length,
    images: images.map((f) => ({
      id: f.id,
      name: f.name,
      mime_type: f.mime_type,
      thumbnail_url: f.thumbnail_url,
    })),
  };
}

async function listImagesByIds(user, fileIds, limit = MAX_IMAGES_PER_SEND) {
  const ids = [...new Set((fileIds || []).map(String).filter(Boolean))].slice(0, limit);
  if (!ids.length) {
    throw Object.assign(new Error('Chưa chọn ảnh nào'), { status: 400 });
  }
  const { data: files } = await supabase
    .from('drive_files')
    .select(DRIVE_FILE_SEND_SELECT)
    .in('id', ids)
    .is('trashed_at', null);
  const byId = new Map((files || []).map((f) => [String(f.id), f]));

  const accessResults = await Promise.all(ids.map(async (id) => {
    const file = byId.get(id);
    if (!file || !isImageMime(file.mime_type, file.name)) return null;
    const access = await driveAcl.canAccess({ user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    return access.ok ? file : null;
  }));

  const images = accessResults.filter(Boolean);
  if (!images.length) {
    throw Object.assign(new Error('Không có ảnh hợp lệ để gửi'), { status: 400 });
  }
  return images;
}

/**
 * Gửi ảnh trong thư mục Drive (hoặc danh sách file đã chọn) qua Messenger.
 */
async function processOneDriveImageSend({
  img,
  index,
  user,
  contact,
  uid,
  label,
  imageSetId,
  folderId,
  rootId,
  urlCache,
  skipPerFileAcl,
  messengerImageSender,
  ioRef,
}) {
  await assertDriveImageSendable(user, img, { skipAcl: skipPerFileAcl });

  const cachedUrl = urlCache.get(String(img.id)) || null;
  const mimetype = img.mime_type || 'image/jpeg';
  const filename = img.name || 'image.jpg';
  let fileUrl;
  let fromCache = false;
  let fbResult;

  if (cachedUrl) {
    fileUrl = cachedUrl;
    fromCache = true;
    fbResult = await messengerImageSender.sendByUrl(contact.psid, fileUrl);
  } else {
    const buffer = await downloadDriveImageBuffer(img);
    const storagePromise = uploadBufferToMessengerStorage(buffer, {
      originalName: filename,
      mimetype,
      contactId: contact.id,
    });
    const fbPromise = messengerImageSender.sendByBuffer
      ? messengerImageSender.sendByBuffer(contact.psid, buffer, { mimetype, filename })
      : storagePromise.then((url) => messengerImageSender.sendByUrl(contact.psid, url));

    const [url, sendRes] = await Promise.all([storagePromise, fbPromise]);
    fileUrl = url;
    fbResult = sendRes;
  }

  if (fbResult?.error) {
    return {
      index,
      success: false,
      name: img.name,
      error: formatFacebookSendError(fbResult.error.message || 'Facebook API lỗi'),
    };
  }

  const { data: saved } = await supabase.from('facebook_messages').insert({
    contact_id: contact.id,
    lead_id: contact.lead_id,
    fb_message_id: fbResult?.message_id,
    direction: 'outbound',
    message_type: 'image',
    content: `[image] ${label}`,
    attachment_url: fileUrl,
    attachment_type: 'image',
    sent_by: uid,
    metadata: {
      image_set_id: imageSetId || null,
      drive_file_id: img.id,
      drive_file_md5: img.md5 || null,
      drive_folder_id: folderId || null,
      drive_root_id: rootId || null,
      messenger_url_from_cache: fromCache,
      messenger_fb_direct_upload: !fromCache && !!messengerImageSender.sendByBuffer,
    },
  }).select().single();

  if (saved && ioRef) ioRef.emit('fb_message', { contact_id: contact.id, message: saved });
  return { index, success: true, saved, name: img.name };
}

async function sendFolderImagesToContact({
  user,
  contact,
  folderId = null,
  rootId = null,
  label = 'Drive',
  imageSetId = null,
  fileIds = null,
  sendMessengerAttachment,
  messengerImageSender = null,
  ioRef = null,
}) {
  let images = [];
  if (fileIds?.length) {
    images = await listImagesByIds(user, fileIds, MAX_IMAGES_PER_SEND);
  } else if (folderId) {
    images = await listFolderImages(user, folderId, MAX_IMAGES_PER_SEND, { syncGoogle: false });
    if (!images.length) {
      images = await listFolderImages(user, folderId, MAX_IMAGES_PER_SEND, { syncGoogle: true });
    }
  } else if (rootId) {
    images = await listRootLevelImages(user, rootId, MAX_IMAGES_PER_SEND, { syncGoogle: false });
    if (!images.length) {
      images = await listRootLevelImages(user, rootId, MAX_IMAGES_PER_SEND, { syncGoogle: true });
    }
  }
  if (!images.length) {
    throw Object.assign(new Error('Thư mục Drive không có ảnh nào'), { status: 400 });
  }

  const sender = messengerImageSender || {
    sendByUrl: (psid, url) => sendMessengerAttachment(contact.page_id, psid, 'image', url),
    sendByBuffer: null,
  };

  const messages = [];
  const failed = [];
  const uid = user.userId || user.id;
  const urlCache = await buildDriveMessengerUrlCache(images);
  const skipPerFileAcl = !!fileIds?.length;

  const pipelineItems = images.map((img, index) => ({ img, index }));
  const outcomes = await runWithConcurrency(pipelineItems, PIPELINE_CONCURRENCY, async ({ img, index }) => {
    try {
      return await processOneDriveImageSend({
        img,
        index,
        user,
        contact,
        uid,
        label,
        imageSetId,
        folderId,
        rootId,
        urlCache,
        skipPerFileAcl,
        messengerImageSender: sender,
        ioRef,
      });
    } catch (err) {
      return {
        index,
        success: false,
        name: img.name,
        error: formatFacebookSendError(err.message || 'Lỗi gửi'),
      };
    }
  });

  const messageRows = [];
  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    const fallbackName = pipelineItems[i]?.img?.name;
    if (!outcome?.ok) {
      failed.push({
        name: fallbackName,
        error: formatFacebookSendError(outcome?.error?.message || 'Lỗi gửi'),
      });
      continue;
    }
    const r = outcome.value;
    if (r.success && r.saved) messageRows.push({ index: r.index, saved: r.saved });
    else failed.push({ name: r.name || fallbackName, error: r.error || 'Lỗi gửi' });
  }

  messageRows.sort((a, b) => a.index - b.index);
  messages.push(...messageRows.map((row) => row.saved));

  if (messages.length) {
    const preview = `Bạn: [${label}] ${messages.length} ảnh`;
    await supabase.from('facebook_contacts').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
    }).eq('id', contact.id);
  }

  if (!messages.length) {
    const hint = failed[0]?.error || 'Không gửi được ảnh nào';
    throw Object.assign(new Error(hint), { status: 400, failed });
  }

  return { sent: messages.length, failed, messages, label };
}

module.exports = {
  isImageMime,
  MAX_IMAGES_PER_SEND,
  publishDriveImageForMessenger,
  listFolderImages,
  listImageSets,
  listAllImageSetsAdmin,
  getImageSet,
  createImageSet,
  updateImageSet,
  deleteImageSet,
  enrichSetWithImageCount,
  enrichFolderSendItem,
  buildImageSendSources,
  getDriveFolderImagesPreview,
  sendFolderImagesToContact,
  listRootLevelImages,
  listImagesByIds,
  formatFacebookSendError,
};
