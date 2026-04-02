const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const config = require('../config');

const r = Router();
r.use(auth);

// ── Memory upload (ảnh, PDF, file nhỏ < 20MB) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|dwg|dxf|zip|rar|mp4|mov|webm|ogg|mp3|wav|avi|mkv/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('application/')) {
      cb(null, true);
    } else {
      cb(new Error('File không được hỗ trợ'));
    }
  }
});

// ── Disk upload (video, file lớn) — ghi ra /tmp trước ──
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB cho video
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/') || file.mimetype.startsWith('application/')) {
      cb(null, true);
    } else {
      cb(new Error('File không được hỗ trợ'));
    }
  }
});

const BUCKET = 'attachments';

// Sanitize filename: giữ tiếng Việt, bỏ ký tự đặc biệt nguy hiểm
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Bỏ ký tự không hợp lệ
    .replace(/\s+/g, '_')         // Spaces → underscore
    .trim();
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
  fixFilename(file); // Fix encoding tiếng Việt
  const ext = path.extname(file.originalname);
  const safeName = sanitizeFilename(path.basename(file.originalname, ext));
  const timestamp = Date.now();
  
  // Phân thư mục: entity_type/entity_id/timestamp_filename.ext
  // VD: lead/abc-123/1711936800_Bao_gia_tu_bep.pdf
  const folder = entityId ? `${entityType || 'general'}/${entityId}` : (entityType || 'general');
  const storagePath = `${folder}/${timestamp}_${safeName}${ext}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    // Fallback: base64 data URL
    const base64 = file.buffer.toString('base64');
    return {
      file_name: file.originalname,
      file_url: `data:${file.mimetype};base64,${base64}`,
      file_size: file.size,
      mime_type: file.mimetype,
      storage_path: null,
    };
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return {
    file_name: file.originalname,
    file_url: urlData.publicUrl,
    file_size: file.size,
    mime_type: file.mimetype,
    storage_path: storagePath,
  };
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

  const ext = path.extname(fixedName);
  const safeName = sanitizeFilename(path.basename(fixedName, ext));
  const timestamp = Date.now();
  const folder = entityId ? `${entityType || 'general'}/${entityId}` : (entityType || 'general');
  const storagePath = `${folder}/${timestamp}_${safeName}${ext}`;

  // Stream read từ disk → upload Supabase
  const fileStream = fs.createReadStream(filePath);
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileStream, {
      contentType: mimetype,
      duplex: 'half',
      upsert: false,
    });

  // Xóa file tạm
  fs.unlink(filePath, () => {});

  if (uploadError) {
    console.error('Storage stream upload error:', uploadError);
    // Fallback: đọc buffer rồi upload lại
    try {
      const buffer = fs.readFileSync(filePath);
      const { error: retryErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mimetype, upsert: false });
      fs.unlink(filePath, () => {});
      if (retryErr) throw retryErr;
    } catch (e2) {
      return { file_name: fixedName, file_url: null, file_size: fileSize, mime_type: mimetype, storage_path: null, error: uploadError.message };
    }
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return {
    file_name: fixedName,
    file_url: urlData.publicUrl,
    file_size: fileSize,
    mime_type: mimetype,
    storage_path: storagePath,
  };
}

// ═══ STREAM UPLOAD — Video/file lớn (disk → Supabase) ═══
// Nhanh hơn memory upload vì không cần buffer toàn bộ vào RAM
r.post('/stream', diskUpload.single('file'), async (req, res) => {
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
    if (result.error) return res.status(500).json({ error: result.error });
    res.status(201).json(result);
  } catch (e) {
    // Cleanup temp file
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('Stream upload error:', e);
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

// Upload single file (cho Facebook chat, etc.)
r.post('/single', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const result = await uploadOneFile(req.file, req.body.entity_type || 'messenger', req.body.entity_id);
    res.status(201).json(result);
  } catch (e) {
    console.error('Upload single error:', e);
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

// Upload files → Supabase Storage (SONG SONG, batch 5)
// Cũng nhận single field 'file' khi gọi từ /api/upload thay vì /api/upload/single
const uploadFlexible = (req, res, next) => {
  // Thử array('files') trước, nếu không có thì thử single('file')
  upload.any()(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    // normalize: nếu gửi field 'file' → req.files = [file]
    if (!req.files?.length && req.file) req.files = [req.file];
    next();
  });
};

r.post('/', uploadFlexible, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.body;

    if (!req.files?.length) return res.status(400).json({ error: 'Không có file' });

    // Upload TẤT CẢ files song song — truyền entity_id cho thư mục
    const results = await Promise.all(
      req.files.map(file => uploadOneFile(file, entity_type, entity_id))
    );

    // Save to DB song song nếu có entity_id
    if (entity_id) {
      await Promise.all(
        results.filter(a => a.file_url).map(attachment =>
          supabase.from('file_attachments').insert({
            entity_type: entity_type || 'task',
            entity_id,
            ...attachment,
            uploaded_by: req.user.userId,
          })
        )
      );
    }

    res.status(201).json({ files: results });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message || 'Lỗi upload' });
  }
});

// Get files for entity
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
      .select('storage_path').eq('id', req.params.id).single();
    if (file?.storage_path) {
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
    }
    await supabase.from('file_attachments').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
