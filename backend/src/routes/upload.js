const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { assertFileAttachmentMutation } = require('../helpers/projectFileActivity');
const { sanitizeStorageFilename, isInvalidStorageKeyError } = require('../helpers/storageFilename');

const MB = 1024 * 1024;
/** Giới hạn file gửi lên server (multer). Supabase Storage có giới hạn riêng — Dashboard → Storage. Mặc định 1024MB; env MAX_UPLOAD_VIDEO_MB (MB), tối đa 5120. */
const MAX_DISK_UPLOAD_BYTES = (() => {
  const raw = parseInt(process.env.MAX_UPLOAD_VIDEO_MB || '1024', 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : 1024;
  return Math.min(mb * MB, 5120 * MB);
})();
/** Upload RAM: ảnh/file nhỏ; không dùng cho video lớn (frontend dùng internal-social-stream). */
const MAX_MEMORY_UPLOAD_BYTES = Math.min(256 * MB, MAX_DISK_UPLOAD_BYTES);

function isStorageSizeLimitError(err) {
  const msg = String(err?.message || err || '');
  return /exceeded the maximum allowed size|maximum allowed size|EntityTooLarge|maximum size exceeded|Payload too large|413/i.test(msg);
}

function mapUploadFailure(err) {
  if (isStorageSizeLimitError(err)) {
    return {
      status: 413,
      error:
        'File vượt quá giới hạn trên Supabase Storage. Vào Supabase Dashboard → Project Settings → Storage và tăng giới hạn kích thước upload (global / bucket). Gói miễn phí thường ~50MB; video lớn cần nén, dùng URL video ngoài, hoặc nâng gói. Riêng giới hạn nhận file trên Node: biến môi trường MAX_UPLOAD_VIDEO_MB (MB).',
    };
  }
  return { status: 500, error: String(err?.message || err || 'Lỗi upload') };
}

const r = Router();
r.use(auth);

// ── Memory upload (ảnh, PDF, file nhỏ) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEMORY_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|dwg|dxf|skp|skb|skm|zip|rar|mp4|mov|webm|ogg|mp3|wav|avi|mkv/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('application/')) {
      cb(null, true);
    } else {
      cb(new Error('File không được hỗ trợ'));
    }
  }
});

function memoryUploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File vượt quá ${Math.round(MAX_MEMORY_UPLOAD_BYTES / MB)}MB (upload RAM). Video/file lớn hãy dùng upload stream hoặc đặt MAX_UPLOAD_VIDEO_MB / giảm kích thước.`,
      });
    }
    return res.status(400).json({ error: err.message || 'Lỗi upload' });
  });
}

// ── Disk upload (video, file lớn) — ghi ra /tmp trước ──
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_DISK_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/') || file.mimetype.startsWith('application/')) {
      cb(null, true);
    } else {
      cb(new Error('File không được hỗ trợ'));
    }
  }
});

function diskUploadSingle(req, res, next) {
  diskUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File vượt quá ${Math.round(MAX_DISK_UPLOAD_BYTES / MB)}MB (giới hạn server). Đặt biến môi trường MAX_UPLOAD_VIDEO_MB (đơn vị MB, tối đa 5120) rồi khởi động lại backend.`,
      });
    }
    return res.status(400).json({ error: err.message || 'Lỗi upload' });
  });
}

const BUCKET = 'attachments';

function uploadFileFailure(originalName, size, mimetype, message, code) {
  return {
    file_name: originalName,
    file_url: null,
    file_size: size,
    mime_type: mimetype,
    storage_path: null,
    error: message || 'Lỗi tải lên Storage',
    ...(code ? { code } : {}),
  };
}

async function uploadBufferToStorage(buffer, { originalName, mimetype, size, entityType, entityId }) {
  const ext = path.extname(originalName).toLowerCase() || '';
  const safeName = sanitizeStorageFilename(path.basename(originalName, path.extname(originalName)));
  const timestamp = Date.now();
  // Suffix ngẫu nhiên: tránh 2 file (vd. a.png vs a_.png) trùng key khi sanitize + Date.now() cùng ms
  const uniq = Math.random().toString(36).slice(2, 8);
  const folder = entityId ? `${entityType || 'general'}/${entityId}` : (entityType || 'general');
  let storagePath = `${folder}/${timestamp}_${uniq}_${safeName}${ext}`;

  let uploadError;
  ({ error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimetype, upsert: false }));

  if (uploadError && isInvalidStorageKeyError(uploadError)) {
    storagePath = `${folder}/${timestamp}_${uniq}_file${ext || '.bin'}`;
    ({ error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimetype, upsert: false }));
  }

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    if (isStorageSizeLimitError(uploadError)) {
      return uploadFileFailure(originalName, size, mimetype, uploadError.message, 'STORAGE_SIZE_LIMIT');
    }
    return uploadFileFailure(originalName, size, mimetype, uploadError.message || 'Lỗi tải lên Storage');
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return {
    file_name: originalName,
    file_url: urlData.publicUrl,
    file_size: size,
    mime_type: mimetype,
    storage_path: storagePath,
  };
}

// Sanitize filename: giữ tiếng Việt cho hiển thị — object key dùng sanitizeStorageFilename (ASCII)
function sanitizeFilename(name) {
  return sanitizeStorageFilename(name);
}

// Fix multer Latin-1 encoding → UTF-8
function fixFilename(file) {
  try {
    // Multer decode filename as Latin-1, cần convert lại UTF-8
    const buf = Buffer.from(file.originalname, 'latin1');
    const utf8Name = buf.toString('utf8');
    // Check xem có phải UTF-8 hợp lệ không (không chứa ký tự lỗi)
    if (utf8Name && !utf8Name.includes('�') && utf8Name !== file.originalname) {
      file.originalname = utf8Name;
    }
  } catch (e) { /* giữ nguyên */ }
  return file;
}

// Upload 1 file → Supabase Storage (helper)
// entity_type: 'lead', 'deal', 'messenger', 'task', 'general'
// entity_id: lead_id, customer_id, etc. → làm thư mục
async function uploadOneFile(file, entityType, entityId) {
  fixFilename(file);
  return uploadBufferToStorage(file.buffer, {
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    entityType,
    entityId,
  });
}

// Upload 1 file từ disk (stream) → Supabase Storage — NHANH cho video lớn
async function uploadOneFileFromDisk(filePath, originalName, mimetype, fileSize, entityType, entityId) {
  // Fix tiếng Việt
  let fixedName = originalName;
  try {
    const buf = Buffer.from(originalName, 'latin1');
    const utf8Name = buf.toString('utf8');
    if (utf8Name && !utf8Name.includes('�') && utf8Name !== originalName) fixedName = utf8Name;
  } catch (e) {}

  const ext = path.extname(fixedName).toLowerCase() || '';
  const safeName = sanitizeStorageFilename(path.basename(fixedName, path.extname(fixedName)));
  const timestamp = Date.now();
  const uniq = Math.random().toString(36).slice(2, 8);
  const folder = entityId ? `${entityType || 'general'}/${entityId}` : (entityType || 'general');
  let storagePath = `${folder}/${timestamp}_${uniq}_${safeName}${ext}`;

  const fileStream = fs.createReadStream(filePath);
  const tryUpload = async (objectPath, body) => {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, body, { contentType: mimetype, upsert: false, ...(body.readable ? { duplex: 'half' } : {}) });
    return error;
  };

  let uploadError = await tryUpload(storagePath, fileStream);
  if (uploadError && isInvalidStorageKeyError(uploadError)) {
    storagePath = `${folder}/${timestamp}_${uniq}_file${ext || '.bin'}`;
    uploadError = await tryUpload(storagePath, fs.createReadStream(filePath));
  }

  if (!uploadError) {
    fs.unlink(filePath, () => {});
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return {
      file_name: fixedName,
      file_url: urlData.publicUrl,
      file_size: fileSize,
      mime_type: mimetype,
      storage_path: storagePath,
    };
  }

  console.error('Storage stream upload error:', uploadError);
  if (isStorageSizeLimitError(uploadError)) {
    fs.unlink(filePath, () => {});
    return uploadFileFailure(fixedName, fileSize, mimetype, uploadError.message, 'STORAGE_SIZE_LIMIT');
  }

  // Fallback: đọc buffer rồi upload lại (một số lỗi stream)
  try {
    const buffer = fs.readFileSync(filePath);
    fs.unlink(filePath, () => {});
    return uploadBufferToStorage(buffer, {
      originalName: fixedName,
      mimetype,
      size: fileSize,
      entityType,
      entityId,
    });
  } catch (e2) {
    fs.unlink(filePath, () => {});
    return uploadFileFailure(fixedName, fileSize, mimetype, uploadError.message || e2.message);
  }
}

// ═══ STREAM UPLOAD — Video/file lớn (disk → Supabase) ═══
// Nhanh hơn memory upload vì không cần buffer toàn bộ vào RAM
r.post('/stream', diskUploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const result = await uploadOneFileFromDisk(
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      req.body.entity_type || 'general',
      req.body.entity_id
    );
    if (result.error) {
      const mapped = result.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeLimitError(result.error)
        ? mapUploadFailure(result.error)
        : { status: 500, error: result.error };
      return res.status(mapped.status).json({ error: mapped.error });
    }
    res.status(201).json(result);
  } catch (e) {
    // Cleanup temp file
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('Stream upload error:', e);
    if (e?.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeLimitError(e)) {
      const m = mapUploadFailure(e);
      return res.status(m.status).json({ error: m.error });
    }
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

// Upload single file (cho Facebook chat, etc.)
r.post('/single', memoryUploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const result = await uploadOneFile(req.file, req.body.entity_type || 'messenger', req.body.entity_id);
    if (result.error || !result.file_url || String(result.file_url).startsWith('data:')) {
      const mapped = result.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeLimitError(result.error)
        ? mapUploadFailure(result.error)
        : { status: 500, error: result.error || 'Upload thất bại' };
      return res.status(mapped.status).json({ error: mapped.error });
    }
    res.status(201).json(result);
  } catch (e) {
    console.error('Upload single error:', e);
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

/** Bảng tin nội bộ — upload RAM (theo MAX_MEMORY_UPLOAD_BYTES). Thư mục: internal_social/<userId>/ */
r.post('/internal-social', memoryUploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const uid = req.user.userId || req.user.id;
    const result = await uploadOneFile(req.file, 'internal_social', uid);
    res.status(201).json(result);
  } catch (e) {
    console.error('Upload internal-social error:', e);
    if (e?.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeLimitError(e)) {
      const m = mapUploadFailure(e);
      return res.status(m.status).json({ error: m.error });
    }
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

/** Bảng tin nội bộ — video/file lớn (ghi disk tạm → Storage). */
r.post('/internal-social-stream', diskUploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const uid = req.user.userId || req.user.id;
    const result = await uploadOneFileFromDisk(
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      'internal_social',
      uid,
    );
    if (result.error) {
      const mapped = result.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeLimitError(result.error)
        ? mapUploadFailure(result.error)
        : { status: 500, error: result.error };
      return res.status(mapped.status).json({ error: mapped.error });
    }
    res.status(201).json(result);
  } catch (e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('Upload internal-social-stream error:', e);
    if (e?.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeLimitError(e)) {
      const m = mapUploadFailure(e);
      return res.status(m.status).json({ error: m.error });
    }
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

// Upload files → Supabase Storage (SONG SONG, batch 5)
// Cũng nhận single field 'file' khi gọi từ /api/upload thay vì /api/upload/single
const uploadFlexible = (req, res, next) => {
  // Thử array('files') trước, nếu không có thì thử single('file')
  upload.any()(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `File vượt quá ${Math.round(MAX_MEMORY_UPLOAD_BYTES / MB)}MB. Video lớn dùng endpoint upload stream (disk) hoặc chia nhỏ file.`,
        });
      }
      return res.status(400).json({ error: err.message });
    }
    // normalize: nếu gửi field 'file' → req.files = [file]
    if (!req.files?.length && req.file) req.files = [req.file];
    next();
  });
};

r.post('/', uploadFlexible, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.body;

    if (!req.files?.length) return res.status(400).json({ error: 'Không có file' });

    const results = await Promise.all(
      req.files.map(file => uploadOneFile(file, entity_type, entity_id))
    );

    const ok = results.filter((a) => a.file_url && !String(a.file_url).startsWith('data:'));
    const failed = results.filter((a) => a.error || !a.file_url || String(a.file_url).startsWith('data:'));

    if (!ok.length) {
      return res.status(500).json({
        error: failed[0]?.error || 'Upload thất bại — không lưu được lên Storage',
        files: results,
      });
    }

    // Save to DB song song nếu có entity_id
    if (entity_id) {
      await Promise.all(
        ok.map(attachment =>
          supabase.from('file_attachments').insert({
            entity_type: entity_type || 'task',
            entity_id,
            ...attachment,
            uploaded_by: req.user.userId,
          })
        )
      );
    }

    res.status(201).json({ files: results, uploaded: ok, failed });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

// Get files for entity
r.get('/serve-local', async (req, res) => {
  try {
    const { resolveUploadDownloadSource, sendUploadDownloadResponse } = require('../helpers/localUploadServe');
    const rawPath = String(req.query.path || '').trim();
    if (!rawPath) return res.status(400).json({ error: 'Thiếu path' });
    const resolved = await resolveUploadDownloadSource(rawPath);
    if (!resolved) {
      return res.status(404).json({
        error: 'Không tìm thấy file — file có thể đã mất sau deploy (chưa lưu Storage). Hãy gửi lại file.',
      });
    }
    const downloadName = String(req.query.name || '').trim() || resolved.basename;
    return sendUploadDownloadResponse(res, resolved, downloadName);
  } catch (e) {
    console.error('GET /upload/serve-local:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi tải file' });
  }
});

r.get('/:entity_type/:entity_id', async (req, res) => {
  try {
    const { data } = await supabase.from('file_attachments')
      .select('*, uploader:users(id,full_name)')
      .eq('entity_type', req.params.entity_type)
      .eq('entity_id', req.params.entity_id)
      .order('created_at', { ascending: false });
    res.json({ files: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Delete file
r.delete('/:id', async (req, res) => {
  try {
    const { data: file } = await supabase.from('file_attachments')
      .select('id, storage_path, uploaded_by, entity_type, entity_id')
      .eq('id', req.params.id).single();
    if (!file) return res.status(404).json({ error: 'Không tìm thấy file' });
    if (!await assertFileAttachmentMutation(req, res, file)) return;
    if (file?.storage_path) {
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
    }
    await supabase.from('file_attachments').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
