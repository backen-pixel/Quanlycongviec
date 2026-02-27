const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const config = require('../config');

const r = Router();
r.use(auth);

// Use memory storage → upload to Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|dwg|dxf|zip|rar|mp4|mov/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('application/')) {
      cb(null, true);
    } else {
      cb(new Error('File không được hỗ trợ'));
    }
  }
});

const BUCKET = 'attachments';

// Upload files → Supabase Storage
r.post('/', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'Không có file' });

    const { entity_type, entity_id } = req.body;
    const results = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname);
      const storagePath = `${entity_type || 'general'}/${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        // Fallback: if bucket doesn't exist, use base64 data URL
        const base64 = file.buffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64}`;
        results.push({
          file_name: file.originalname,
          file_url: dataUrl,
          file_size: file.size,
          mime_type: file.mimetype,
          storage_path: null,
        });
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

      const attachment = {
        file_name: file.originalname,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.mimetype,
        storage_path: storagePath,
      };

      // Save to DB if entity_id provided
      if (entity_id) {
        await supabase.from('file_attachments').insert({
          entity_type: entity_type || 'task',
          entity_id,
          ...attachment,
          uploaded_by: req.user.userId,
        });
      }

      results.push(attachment);
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
