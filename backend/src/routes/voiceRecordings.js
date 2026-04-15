const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { resolveCustomerLeadByPhone, findCustomerByPhoneDigits } = require('../helpers/phoneCrmLink');
const { nextCrmCode } = require('../helpers/crmNextCode');
const {
  uploadVoiceFromTempFile,
  removeVoiceObject,
  publicUrlForVoiceObject,
} = require('../helpers/voiceStorageUpload');
const { fetchCrmLeadsForCustomerScoped } = require('../helpers/crmAccessRoles');

const r = Router();
r.use(auth);

const UPLOAD_ROOT = path.join(__dirname, '../../uploads/voice_recordings');

function attachPlayableUrl(rec) {
  if (!rec) return rec;
  const url = publicUrlForVoiceObject(supabase, rec.storage_path);
  return { ...rec, audio_url: url };
}

/** Các trường + join CRM (PostgREST cần FK 63_voice_recordings_crm_link.sql) */
const RECORDING_SELECT =
  'id, file_name, storage_path, mime_type, file_size, duration_sec, source, device_label, notes, created_at, phone_number, direction, call_started_at, call_ended_at, external_call_id, customer_id, lead_id, customer:customers(id, full_name, phone), lead:crm_leads(id, code, title, type)';

function uuidOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return false;
  return s;
}

function ensureUserDir(userId) {
  const dir = path.join(UPLOAD_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
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

/** Gợi ý lead/deal theo khách hàng (để gắn tay trên UI) */
r.get('/crm-lead-options', async (req, res) => {
  try {
    const cid = uuidOrNull(req.query.customer_id);
    if (cid === false) return res.status(400).json({ error: 'customer_id không hợp lệ' });
    if (!cid) return res.status(400).json({ error: 'Thiếu customer_id' });

    const data = await fetchCrmLeadsForCustomerScoped(supabase, cid, req.user.userId, req.user.role, 40);
    res.json({ leads: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải lead' });
  }
});

/** Xem trước ghép SĐT → KH + lead (không lưu) */
r.get('/phone-preview', async (req, res) => {
  try {
    const phone = req.query.phone ? String(req.query.phone).trim() : '';
    if (!phone) return res.status(400).json({ error: 'Thiếu phone' });
    const resolved = await resolveCustomerLeadByPhone(supabase, phone, req.user.userId, req.user.role);
    res.json({ match: resolved });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** GET /voice-recordings — danh sách của user đang đăng nhập */
r.get('/', async (req, res) => {
  try {
    const phoneQ = req.query.phone ? String(req.query.phone).replace(/\s+/g, '').trim() : '';
    const unassigned =
      req.query.unassigned === '1' || req.query.unassigned === 'true' || req.query.unassigned === 'yes';
    const linkedOnly =
      req.query.linked_only === '1' || req.query.linked_only === 'true' || req.query.linked_only === 'yes';
    let q = supabase
      .from('voice_recordings')
      .select(RECORDING_SELECT)
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (unassigned) {
      q = q.not('phone_number', 'is', null).neq('phone_number', '').is('customer_id', null);
    }
    if (linkedOnly) {
      q = q.not('lead_id', 'is', null);
    }
    if (phoneQ) q = q.ilike('phone_number', `%${phoneQ.slice(0, 20)}%`);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ recordings: (data || []).map(attachPlayableUrl) });
  } catch (e) {
    console.error('voice-recordings list:', e.message);
    res.status(500).json({ error: e.message || 'Không tải được danh sách' });
  }
});

/**
 * POST /voice-recordings/relink-unassigned — quét lại bản ghi có SĐT nhưng chưa đủ KH/lead, tự ghép CRM (ưu tiên Deal).
 */
r.post('/relink-unassigned', async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('voice_recordings')
      .select('id, phone_number, customer_id, lead_id')
      .eq('user_id', req.user.userId)
      .not('phone_number', 'is', null)
      .neq('phone_number', '')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    const pending = (rows || []).filter((r) => !r.customer_id || !r.lead_id).slice(0, 50);
    let updated = 0;
    for (const row of pending) {
      const resolved = await resolveCustomerLeadByPhone(
        supabase,
        row.phone_number,
        req.user.userId,
        req.user.role,
      );
      if (!resolved) continue;
      const customer_id = resolved.customer_id;
      const lead_id = resolved.lead_id;
      if (customer_id === row.customer_id && lead_id === row.lead_id) continue;
      const { error: upErr } = await supabase
        .from('voice_recordings')
        .update({ customer_id, lead_id })
        .eq('id', row.id);
      if (!upErr) updated += 1;
    }
    res.json({ ok: true, scanned: pending.length, updated });
  } catch (e) {
    console.error('voice-recordings relink-unassigned:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi quét ghép' });
  }
});

/** POST /voice-recordings — upload một file (multipart field name: `audio`) */
r.post('/', upload.single('audio'), async (req, res) => {
  let storage_path;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Thiếu file (field name: audio)' });
    }

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
        .select(RECORDING_SELECT)
        .eq('user_id', req.user.userId)
        .eq('external_call_id', external_call_id.trim())
        .maybeSingle();
      if (!exErr && existing) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
        }
        return res.status(200).json({ recording: attachPlayableUrl(existing), duplicate: true });
      }
    }

    try {
      const { objectPath } = await uploadVoiceFromTempFile(
        supabase,
        req.file.path,
        req.user.userId,
        req.file.mimetype,
        req.file.originalname || req.file.filename,
      );
      storage_path = objectPath;
    } catch (storeErr) {
      console.warn('[voice-recordings] Supabase bucket upload failed, lưu local:', storeErr.message);
      try {
        const destDir = ensureUserDir(req.user.userId);
        const dest = path.join(destDir, path.basename(req.file.path));
        fs.renameSync(req.file.path, dest);
        storage_path = `uploads/voice_recordings/${req.user.userId}/${path.basename(dest)}`;
      } catch (mv) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
        }
        throw mv;
      }
    }

    let customer_id = null;
    let lead_id = null;
    if (phone_number) {
      const resolved = await resolveCustomerLeadByPhone(
        supabase,
        phone_number,
        req.user.userId,
        req.user.role,
      );
      if (resolved) {
        customer_id = resolved.customer_id;
        lead_id = resolved.lead_id;
      }
    }

    const { data, error } = await supabase
      .from('voice_recordings')
      .insert({
        user_id: req.user.userId,
        file_name: req.file.originalname || req.file.filename,
        storage_path,
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
        customer_id,
        lead_id,
      })
      .select(RECORDING_SELECT)
      .single();

    if (error) throw error;

    res.status(201).json({ recording: attachPlayableUrl(data) });
  } catch (e) {
    if (storage_path && !storage_path.startsWith('uploads/')) {
      try {
        await removeVoiceObject(supabase, storage_path);
      } catch {
        /* ignore */
      }
    }
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    console.error('voice-recordings upload:', e.message);
    res.status(500).json({ error: e.message || 'Upload thất bại' });
  }
});

/**
 * POST /voice-recordings/:id/bootstrap-crm
 * Ghi âm có số nhưng chưa gắn KH: tạo (hoặc dùng) khách + lead/deal mới do user hiện tại phụ trách, rồi liên kết.
 */
r.post('/:id/bootstrap-crm', async (req, res) => {
  try {
    const { full_name, title, type = 'lead', company_id } = req.body || {};
    const name = full_name != null ? String(full_name).trim() : '';
    if (!name) return res.status(400).json({ error: 'Nhập tên khách hàng' });

    const { data: rec, error: re } = await supabase
      .from('voice_recordings')
      .select('id, phone_number, customer_id, lead_id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    if (re || !rec) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
    if (rec.customer_id) return res.status(400).json({ error: 'Bản ghi đã gắn khách hàng' });
    const phone = rec.phone_number ? String(rec.phone_number).replace(/\s+/g, '').trim() : '';
    if (!phone) return res.status(400).json({ error: 'Bản ghi chưa có số điện thoại' });

    const dealType = String(type).toLowerCase() === 'deal' ? 'deal' : 'lead';
    const cidBody = uuidOrNull(company_id);
    if (cidBody === false) return res.status(400).json({ error: 'company_id không hợp lệ' });
    if (dealType === 'deal' && !cidBody) {
      return res.status(400).json({ error: 'Tạo Deal cần company_id' });
    }

    let customerRow = await findCustomerByPhoneDigits(supabase, phone);
    if (!customerRow) {
      const { data: ins, error: ce } = await supabase
        .from('customers')
        .insert({ full_name: name.slice(0, 200), phone: phone.slice(0, 32), source: 'Ghi âm' })
        .select('id, full_name, phone')
        .single();
      if (ce) throw ce;
      customerRow = ins;
    }

    const uid = req.user.userId;
    let leadRow;

    if (dealType === 'deal') {
      const { data: firstDealStage, error: fsErr } = await supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_type', 'deal')
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .single();
      if (fsErr || !firstDealStage) return res.status(500).json({ error: 'Không tìm thấy giai đoạn Deal' });

      const dealTitle = (title && String(title).trim()) || `Deal — ${phone}`;
      const code = await nextCrmCode('DEAL');
      const { data: dRow, error: de } = await supabase
        .from('crm_leads')
        .insert({
          code,
          title: dealTitle.slice(0, 500),
          type: 'deal',
          customer_id: customerRow.id,
          company_id: cidBody,
          stage_id: firstDealStage.id,
          assigned_to: uid,
          lead_owner_id: uid,
          created_by: uid,
        })
        .select('id, code, title, type')
        .single();
      if (de) throw de;
      leadRow = dRow;
    } else {
      const { data: firstLeadStage, error: lsErr } = await supabase
        .from('crm_pipeline_stages')
        .select('id')
        .eq('pipeline_type', 'lead')
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .single();
      if (lsErr || !firstLeadStage) return res.status(500).json({ error: 'Không tìm thấy giai đoạn Lead' });

      const leadTitle = (title && String(title).trim()) || `Lead — ${phone}`;
      const code = await nextCrmCode('LEAD');
      const { data: lRow, error: le } = await supabase
        .from('crm_leads')
        .insert({
          code,
          title: leadTitle.slice(0, 500),
          type: 'lead',
          customer_id: customerRow.id,
          stage_id: firstLeadStage.id,
          assigned_to: uid,
          lead_owner_id: uid,
          created_by: uid,
        })
        .select('id, code, title, type')
        .single();
      if (le) throw le;
      leadRow = lRow;
    }

    const { data: updated, error: ue } = await supabase
      .from('voice_recordings')
      .update({ customer_id: customerRow.id, lead_id: leadRow.id })
      .eq('id', rec.id)
      .select(RECORDING_SELECT)
      .single();
    if (ue) throw ue;

    res.status(201).json({
      recording: attachPlayableUrl(updated),
      customer: customerRow,
      lead: leadRow,
    });
  } catch (e) {
    console.error('voice-recordings bootstrap-crm:', e.message);
    res.status(500).json({ error: e.message || 'Tạo CRM thất bại' });
  }
});

/** PATCH /voice-recordings/:id — gắn / cập nhật CRM hoặc ghép lại theo SĐT */
r.patch('/:id', async (req, res) => {
  try {
    const { data: row, error: fe } = await supabase
      .from('voice_recordings')
      .select('id, phone_number, customer_id, lead_id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId)
      .single();
    if (fe || !row) return res.status(404).json({ error: 'Không tìm thấy' });

    let customer_id = row.customer_id;
    let lead_id = row.lead_id;

    if (req.body.action === 'relink_from_phone') {
      const phone = row.phone_number ? String(row.phone_number).trim() : '';
      if (!phone) return res.status(400).json({ error: 'Bản ghi chưa có số điện thoại để ghép' });
      const resolved = await resolveCustomerLeadByPhone(
        supabase,
        phone,
        req.user.userId,
        req.user.role,
      );
      if (!resolved) {
        customer_id = null;
        lead_id = null;
      } else {
        customer_id = resolved.customer_id;
        lead_id = resolved.lead_id;
      }
    } else {
      if (req.body.customer_id !== undefined) {
        const v = uuidOrNull(req.body.customer_id);
        if (v === false) return res.status(400).json({ error: 'customer_id không hợp lệ' });
        customer_id = v;
        if (req.body.lead_id === undefined) lead_id = null;
      }
      if (req.body.lead_id !== undefined) {
        const v = uuidOrNull(req.body.lead_id);
        if (v === false) return res.status(400).json({ error: 'lead_id không hợp lệ' });
        lead_id = v;
      }

      if (lead_id && !customer_id) {
        const { data: lead, error: le } = await supabase
          .from('crm_leads')
          .select('customer_id')
          .eq('id', lead_id)
          .single();
        if (le || !lead?.customer_id) {
          return res.status(400).json({ error: 'Không tìm thấy lead hoặc lead không có khách hàng' });
        }
        customer_id = lead.customer_id;
      }

      if (lead_id && customer_id) {
        const { data: lead, error: le } = await supabase
          .from('crm_leads')
          .select('id, customer_id')
          .eq('id', lead_id)
          .single();
        if (le || !lead) return res.status(400).json({ error: 'Lead không tồn tại' });
        if (lead.customer_id !== customer_id) {
          return res.status(400).json({ error: 'Lead không thuộc khách hàng đã chọn' });
        }
      }

      if (lead_id && req.user.role !== 'admin') {
        const { data: ld, error: lde } = await supabase
          .from('crm_leads')
          .select('id, assigned_to, lead_owner_id')
          .eq('id', lead_id)
          .single();
        if (lde || !ld) return res.status(400).json({ error: 'Lead không tồn tại' });
        const mine = ld.assigned_to === req.user.userId || ld.lead_owner_id === req.user.userId;
        if (!mine) return res.status(403).json({ error: 'Lead/Deal không thuộc phạm vi phụ trách của bạn' });
      }
    }

    const { data: updated, error: ue } = await supabase
      .from('voice_recordings')
      .update({ customer_id, lead_id })
      .eq('id', row.id)
      .select(RECORDING_SELECT)
      .single();
    if (ue) throw ue;
    res.json({ recording: attachPlayableUrl(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Cập nhật thất bại' });
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

    if (row.storage_path && !row.storage_path.startsWith('uploads/')) {
      try {
        await removeVoiceObject(supabase, row.storage_path);
      } catch {
        /* ignore */
      }
    } else {
      const abs = path.resolve(path.join(__dirname, '../../', row.storage_path));
      const rootResolved = path.resolve(UPLOAD_ROOT);
      if (abs.startsWith(rootResolved) && fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
        } catch {
          /* ignore */
        }
      }
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
