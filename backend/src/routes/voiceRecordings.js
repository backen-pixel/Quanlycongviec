const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const r = Router();
r.use(auth);

const UPLOAD_ROOT = path.join(__dirname, '../../uploads/voice_recordings');

function ensureUserDir(userId) {
  const dir = path.join(UPLOAD_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      cb(null, ensureUserDir(req.user.userId));
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.webm';
    const safe = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /^audio\//.test(file.mimetype) ||
      /\.(m4a|mp3|wav|webm|ogg|aac|amr|opus|flac)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file âm thanh'));
  },
});

/** GET /voice-recordings — danh sách của user đang đăng nhập */
r.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('voice_recordings')
      .select(
        'id, file_name, storage_path, mime_type, file_size, duration_sec, source, device_label, notes, created_at, phone_number, direction, call_started_at, call_ended_at, external_call_id'
      )
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ recordings: data || [] });
  } catch (e) {
    console.error('voice-recordings list:', e.message);
    res.status(500).json({ error: e.message || 'Không tải được danh sách' });
  }
});

/** POST /voice-recordings — upload một file (multipart field name: `audio`) */
r.post('/', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Thiếu file (field name: audio)' });
    }

    const relPath = `uploads/voice_recordings/${req.user.userId}/${req.file.filename}`;
    const source = (req.body.source || 'web').slice(0, 32);
    const device_label = req.body.device_label ? String(req.body.device_label).slice(0, 200) : null;
    const notes = req.body.notes ? String(req.body.notes).slice(0, 2000) : null;
    let duration_sec = null;
    if (req.body.duration_sec != null && req.body.duration_sec !== '') {
      const d = parseFloat(req.body.duration_sec);
      if (Number.isFinite(d) && d >= 0 && d < 86400) duration_sec = d;
    }

    const phone_number = req.body.phone_number
      ? String(req.body.phone_number).replace(/\s+/g, '').slice(0, 32)
      : null;
    let direction = req.body.direction ? String(req.body.direction).toLowerCase().slice(0, 16) : null;
    if (direction && !['inbound', 'outbound', 'unknown'].includes(direction)) direction = 'unknown';
    const external_call_id = req.body.external_call_id
      ? String(req.body.external_call_id).slice(0, 128)
      : null;

    let call_started_at = null;
    let call_ended_at = null;
    if (req.body.call_started_at) {
      const t = new Date(req.body.call_started_at);
      if (!Number.isNaN(t.getTime())) call_started_at = t.toISOString();
    }
    if (req.body.call_ended_at) {
      const t = new Date(req.body.call_ended_at);
      if (!Number.isNaN(t.getTime())) call_ended_at = t.toISOString();
    }

    if (external_call_id && external_call_id.trim()) {
      const { data: existing, error: exErr } = await supabase
        .from('voice_recordings')
        .select(
          'id, file_name, storage_path, mime_type, file_size, duration_sec, source, device_label, notes, created_at, phone_number, direction, call_started_at, call_ended_at, external_call_id'
        )
        .eq('user_id', req.user.userId)
        .eq('external_call_id', external_call_id.trim())
        .maybeSingle();
      if (!exErr && existing) {
        if (req.file?.path) {
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }
        return res.status(200).json({ recording: existing, duplicate: true });
      }
    }

    const { data, error } = await supabase
      .from('voice_recordings')
      .insert({
        user_id: req.user.userId,
        file_name: req.file.originalname || req.file.filename,
        storage_path: relPath,
        mime_type: req.file.mimetype || null,
        file_size: req.file.size || 0,
        duration_sec,
        source,
        device_label,
        notes,
        phone_number: phone_number || null,
        direction: direction || null,
        call_started_at,
        call_ended_at,
        external_call_id: external_call_id?.trim() || null,
      })
      .select(
        'id, file_name, storage_path, mime_type, file_size, duration_sec, source, device_label, notes, created_at, phone_number, direction, call_started_at, call_ended_at, external_call_id'
      )
      .single();

    if (error) throw error;

    res.status(201).json({ recording: data });
  } catch (e) {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch { /* ignore */ }
    }
    console.error('voice-recordings upload:', e.message);
    res.status(500).json({ error: e.message || 'Upload thất bại' });
  }
});

/** DELETE /voice-recordings/:id */
r.delete('/:id', async (req, res) => {
  try {
    const { data: row, error: fe } = await supabase
      .from('voice_recordings')
      .select('id, storage_path')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    if (fe || !row) return res.status(404).json({ error: 'Không tìm thấy' });

    const abs = path.resolve(path.join(__dirname, '../../', row.storage_path));
    const rootResolved = path.resolve(UPLOAD_ROOT);
    if (abs.startsWith(rootResolved) && fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch { /* ignore */ }
    }

    const { error: de } = await supabase.from('voice_recordings').delete().eq('id', row.id);
    if (de) throw de;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Xóa thất bại' });
  }
});

r.use((err, _req, res, next) => {
  if (!err) return next();
  res.status(400).json({ error: err.message || 'Lỗi upload' });
});

module.exports = r;
