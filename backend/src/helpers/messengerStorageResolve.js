const path = require('path');
const config = require('../config');
const { DEFAULT_BUCKET, downloadStorageObject } = require('./storageUpload');

const MESSENGER_STORAGE_BUCKET = process.env.SUPABASE_MESSENGER_BUCKET || DEFAULT_BUCKET;
const MESSENGER_STORAGE_FOLDER = (process.env.SUPABASE_MESSENGER_FOLDER || 'messenger').replace(/^\/+|\/+$/g, '');

function decodePath(raw) {
  const s = String(raw || '').trim().replace(/\+/g, ' ');
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function getSupabase() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null;
  return require('../config/supabase').supabase;
}

/** Prefix `timestamp_hex` từ tên file messenger (local hoặc storage). */
function extractMessengerFilePrefix(basename) {
  const m = String(basename || '').match(/^(\d{10,})_([a-f0-9]{4,16})_/i);
  if (!m) return null;
  return `${m[1]}_${m[2]}`;
}

async function findObjectPathBySql(prefix) {
  const { pgQuery, isPgEnabled } = require('../config/db');
  if (!isPgEnabled() || !prefix) return null;
  const res = await pgQuery(
    `SELECT name FROM storage.objects
     WHERE bucket_id = $1 AND name ILIKE $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [MESSENGER_STORAGE_BUCKET, `%${prefix}%`],
  );
  return res?.rows?.[0]?.name || null;
}

async function findObjectPathByList(prefix) {
  const supabase = getSupabase();
  if (!supabase || !prefix) return null;

  const { data: groups, error } = await supabase.storage.from(MESSENGER_STORAGE_BUCKET).list(MESSENGER_STORAGE_FOLDER, {
    limit: 500,
  });
  if (error) return null;

  for (const g of groups || []) {
    if (!g?.name || g.name.startsWith('.')) continue;
    const groupPath = `${MESSENGER_STORAGE_FOLDER}/${g.name}`;
    const { data: files, error: listErr } = await supabase.storage.from(MESSENGER_STORAGE_BUCKET).list(groupPath, {
      limit: 500,
    });
    if (listErr) continue;
    const match = (files || []).find((f) => f?.name && f.name.startsWith(prefix));
    if (match) return `${groupPath}/${match.name}`;
  }
  return null;
}

/**
 * Tìm object trên Supabase Storage khi DB còn URL /uploads/messenger-chat/... cũ.
 */
async function findMessengerObjectInSupabase(basename) {
  const prefix = extractMessengerFilePrefix(basename);
  const supabase = getSupabase();
  if (!prefix || !supabase) return null;

  let objectPath = await findObjectPathBySql(prefix);
  const { isPgEnabled } = require('../config/db');
  if (!objectPath && !isPgEnabled() && process.env.MESSENGER_STORAGE_LIST_FALLBACK === '1') {
    objectPath = await findObjectPathByList(prefix);
  }
  if (!objectPath) return null;

  const { data: urlData } = supabase.storage.from(MESSENGER_STORAGE_BUCKET).getPublicUrl(objectPath);
  return {
    publicUrl: urlData.publicUrl,
    objectPath,
    bucket: MESSENGER_STORAGE_BUCKET,
    storageName: path.basename(objectPath),
  };
}

/** Cập nhật URL cũ trong DB khi đã tìm thấy bản trên Storage. */
async function repairMessengerAttachmentUrls(oldPath, newUrl) {
  const supabase = getSupabase();
  if (!supabase || !oldPath || !newUrl) return;

  const normalized = decodePath(oldPath);
  const basename = path.basename(normalized);
  const prefix = extractMessengerFilePrefix(basename);

  try {
    await supabase.from('messenger_group_messages').update({ attachment_url: newUrl }).eq('attachment_url', normalized);
    if (prefix) {
      await supabase.from('messenger_group_messages').update({ attachment_url: newUrl }).ilike('attachment_url', `%${prefix}%`);
    }
  } catch (e) {
    console.warn('[messenger] repair attachment_url:', e.message);
  }
}

async function downloadMessengerStorageBlob(storageMeta) {
  if (!storageMeta?.objectPath) return null;
  return downloadStorageObject(storageMeta.bucket || MESSENGER_STORAGE_BUCKET, storageMeta.objectPath);
}

module.exports = {
  MESSENGER_STORAGE_BUCKET,
  MESSENGER_STORAGE_FOLDER,
  extractMessengerFilePrefix,
  findMessengerObjectInSupabase,
  repairMessengerAttachmentUrls,
  downloadMessengerStorageBlob,
};
