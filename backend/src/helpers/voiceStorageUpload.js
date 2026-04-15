const fs = require('fs');
const path = require('path');

function voiceBucketName() {
  return process.env.SUPABASE_VOICE_BUCKET || 'ghi-am';
}

/**
 * Upload file tạm (disk) lên Supabase Storage — bucket mặc định `ghi-am`, object key: `{userId}/{timestamp}_{rand}.ext`
 * @returns {Promise<{ objectPath: string, bucket: string }>}
 */
async function uploadVoiceFromTempFile(supabase, localFilePath, userId, mimeType, originalName) {
  const bucket = voiceBucketName();
  const ext = path.extname(originalName || '') || '.m4a';
  const objectPath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;

  const stream = fs.createReadStream(localFilePath);
  const { error } = await supabase.storage.from(bucket).upload(objectPath, stream, {
    contentType: mimeType || 'application/octet-stream',
    upsert: false,
    duplex: 'half',
  });

  if (error) {
    try {
      const buf = fs.readFileSync(localFilePath);
      const { error: e2 } = await supabase.storage.from(bucket).upload(objectPath, buf, {
        contentType: mimeType || 'application/octet-stream',
        upsert: false,
      });
      if (e2) throw e2;
    } catch (e3) {
      throw error || e3;
    }
  }

  try {
    fs.unlinkSync(localFilePath);
  } catch {
    /* ignore */
  }

  return { objectPath, bucket };
}

async function removeVoiceObject(supabase, storagePath) {
  if (!storagePath || storagePath.startsWith('uploads/')) return;
  const bucket = voiceBucketName();
  await supabase.storage.from(bucket).remove([storagePath]);
}

function publicUrlForVoiceObject(supabase, storagePath) {
  if (!storagePath || storagePath.startsWith('uploads/')) return null;
  const bucket = voiceBucketName();
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

module.exports = {
  voiceBucketName,
  uploadVoiceFromTempFile,
  removeVoiceObject,
  publicUrlForVoiceObject,
};
