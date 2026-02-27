const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// Ensure uploads directory
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|dwg|dxf|zip|rar|mp4|mov/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('application/');
    if (extOk || mimeOk) cb(null, true);
    else cb(new Error('File không được hỗ trợ'));
  }
});

// Upload files (multiple)
r.post('/', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'Không có file' });

    const { entity_type, entity_id } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const attachments = req.files.map(f => ({
      entity_type: entity_type || 'task',
      entity_id: entity_id || null,
      file_name: f.originalname,
      file_url: `${baseUrl}/uploads/${f.filename}`,
      file_size: f.size,
      mime_type: f.mimetype,
      uploaded_by: req.user.userId,
    }));

    // Save to DB if entity_id provided
    if (entity_id) {
      const { data, error } = await supabase.from('file_attachments').insert(attachments).select();
      if (error) throw error;
      return res.status(201).json({ files: data });
    }

    // Return URLs without saving (for inline use)
    res.status(201).json({
      files: attachments.map(a => ({
        file_name: a.file_name,
        file_url: a.file_url,
        file_size: a.file_size,
        mime_type: a.mime_type,
      }))
    });
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
    const { data: file } = await supabase.from('file_attachments').select('file_url').eq('id', req.params.id).single();
    if (file) {
      // Delete physical file
      const fileName = file.file_url.split('/uploads/')[1];
      if (fileName) {
        const filePath = path.join(uploadDir, fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await supabase.from('file_attachments').delete().eq('id', req.params.id);
    }
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
