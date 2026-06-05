/**
 * Nhạc chuông cuộc gọi mặc định — lưu Supabase Storage (bền trên Render),
 * fallback thư mục uploads khi chưa cấu hình Storage.
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');
const config = require('../config');
const { getAppSettingValue } = require('./appSettingsCache');

const SETTINGS_KEY = 'messenger_call_ringtone';
const BUCKET = process.env.SUPABASE_CALL_RING_BUCKET || process.env.SUPABASE_MESSENGER_BUCKET || 'attachments';
const FOLDER = (process.env.SUPABASE_CALL_RING_FOLDER || 'system/call-ringtone').replace(/^\/+|\/+$/g, '');
const LOCAL_DIR = path.join(__dirname, '../../uploads/call-ringtone');

function storageEnabled() {
  return !!(config.supabaseUrl && config.supabaseServiceKey);
}

function safeExt(originalName, mime) {
  const ext = path.extname(originalName || '').toLowerCase();
  const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac'];
  if (allowed.includes(ext)) return ext;
  if ((mime || '').includes('mpeg') || (mime || '').includes('mp3')) return '.mp3';
  if ((mime || '').includes('wav')) return '.wav';
  return '.mp3';
}

/**
 * @param {Buffer} buffer
 * @param {{ mime?: string, originalName?: string, uploadedBy?: string }} meta
 */
async function saveCallRingtoneBuffer(buffer, meta = {}) {
  const mime = meta.mime || 'audio/mpeg';
  const ext = safeExt(meta.originalName, mime);
  const fileName = meta.originalName || `default${ext}`;
  const updatedAt = new Date().toISOString();

  if (storageEnabled()) {
    const objectPath = `${FOLDER}/default${ext}`.replace(/\/+/g, '/');
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
      contentType: mime,
      upsert: true,
    });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = urlData?.publicUrl || null;
    if (!publicUrl) throw new Error('Không lấy được URL public từ Storage');
    return {
      url: publicUrl,
      publicUrl,
      storageBucket: BUCKET,
      storagePath: objectPath,
      fileName,
      mime,
      size: buffer.length,
      updatedAt,
      uploadedBy: meta.uploadedBy || null,
      source: 'supabase',
    };
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  try {
    for (const name of fs.readdirSync(LOCAL_DIR)) {
      if (name.startsWith('default.')) {
        fs.unlinkSync(path.join(LOCAL_DIR, name));
      }
    }
  } catch { /* ignore */ }
  const localName = `default${ext}`;
  fs.writeFileSync(path.join(LOCAL_DIR, localName), buffer);
  const rel = `/uploads/call-ringtone/${localName}`;
  return {
    url: rel,
    publicUrl: null,
    fileName,
    mime,
    size: buffer.length,
    updatedAt,
    uploadedBy: meta.uploadedBy || null,
    source: 'local',
  };
}

/** Metadata hợp lệ để phát (HTTPS Storage hoặc file local còn tồn tại). */
async function resolveCallRingtoneMeta() {
  const value = await getAppSettingValue(SETTINGS_KEY, null);
  if (!value || typeof value !== 'object') return null;

  const publicUrl = value.publicUrl || ( /^https?:\/\//i.test(String(value.url || '')) ? value.url : null);
  if (publicUrl) {
    return { ...value, publicUrl, playUrl: publicUrl };
  }

  const rel = String(value.url || '').replace(/^\//, '');
  if (!rel) return null;
  const diskPath = path.join(__dirname, '../..', rel);
  if (fs.existsSync(diskPath)) {
    return { ...value, playUrl: value.url };
  }

  return null;
}

async function deleteCallRingtoneAssets() {
  const value = await getAppSettingValue(SETTINGS_KEY, null);
  if (value?.storagePath && value?.storageBucket && storageEnabled()) {
    try {
      await supabase.storage.from(value.storageBucket).remove([value.storagePath]);
    } catch { /* ignore */ }
  }
  try {
    if (fs.existsSync(LOCAL_DIR)) {
      for (const name of fs.readdirSync(LOCAL_DIR)) {
        if (name.startsWith('default.')) {
          fs.unlinkSync(path.join(LOCAL_DIR, name));
        }
      }
    }
  } catch { /* ignore */ }
}

module.exports = {
  SETTINGS_KEY,
  saveCallRingtoneBuffer,
  resolveCallRingtoneMeta,
  deleteCallRingtoneAssets,
};
