const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const config = require('../config');

const r = Router();
r.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|dwg|dxf|zip|rar|mp4|mov|webm|ogg|mp3|wav/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('application/')) {
      cb(null, true);
    } else {
      cb(new Error('File không được hỗ trợ'));
    }
  }
});

const BUCKET = 'attachments';

// Upload 1 file → Supabase Storage (helper)
async function uploadOneFile(file, entityType) {
  const ext = path.extname(file.originalname);
  const storagePath = `${entityType || 'general'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

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

// Upload single file (cho Facebook chat, etc.)
r.post('/single', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const result = await uploadOneFile(req.file, req.body.entity_type || 'messenger');
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
    // Nếu chỉ 1 file và không có entity_id → trả format giống /single
    if (req.files?.length === 1 && !req.body.entity_id) {
      const result = await uploadOneFile(req.files[0], req.body.entity_type || 'general');
      return res.status(201).json(result);
    }

    if (!req.files?.length) return res.status(400).json({ error: 'Không có file' });

    const { entity_type, entity_id } = req.body;

    // Upload TẤT CẢ files song song
    const results = await Promise.all(
      req.files.map(file => uploadOneFile(file, entity_type))
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
