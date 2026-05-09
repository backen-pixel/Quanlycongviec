const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const {
  resolveCustomerLeadByPhone,
  findCustomerByPhoneDigits,
  extractPhonesFromText,
  digitsOnly,
} = require('../helpers/phoneCrmLink');
const { nextCrmCode } = require('../helpers/crmNextCode');
const {
  uploadVoiceFromTempFile,
  removeVoiceObject,
  publicUrlForVoiceObject,
} = require('../helpers/voiceStorageUpload');
const { fetchCrmLeadsForCustomerScoped, userSeesAllCrmDeals, userSeesAllCrmLeads } = require('../helpers/crmAccessRoles');

const r = Router();
r.use(auth);

function isVoiceRecordingsAdmin(role) {
  const r = String(role ?? '').toLowerCase().trim();
  return ['admin', 'superadmin', 'super_admin', 'administrator'].includes(r);
}

const UPLOAD_ROOT = path.join(__dirname, '../../uploads/voice_recordings');

function attachPlayableUrl(rec) {
  if (!rec) return rec;
  const url = publicUrlForVoiceObject(supabase, rec.storage_path);
  return { ...rec, audio_url: url };
}

/** Các trường + join CRM (PostgREST cần FK 63_voice_recordings_crm_link.sql) */
const RECORDING_SELECT =
  'id, user_id, file_name, storage_path, mime_type, file_size, duration_sec, source, device_label, notes, created_at, phone_number, direction, call_started_at, call_ended_at, external_call_id, customer_id, lead_id, customer:customers(id, full_name, phone), lead:crm_leads(id, code, title, type), uploader:users!voice_recordings_user_id_fkey(id, full_name, email)';

function uuidOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return false;
  return s;
}

/** Giống quyền xem chi tiết CRM — mọi ghi âm đã ghép lead_id cho NV có quyền xem lead/deal. */
async function assertUserCanViewCrmLeadForVoiceList(req, leadId) {
  const { data: lead, error } = await supabase
    .from('crm_leads')
    .select('id, type, assigned_to, lead_owner_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  if (!lead) {
    const e = new Error('Không tìm thấy lead/deal');
    e.status = 404;
    throw e;
  }
  const uid = req.user?.userId;
  if (lead.type === 'deal') {
    if (!userSeesAllCrmDeals(req.user?.role)) {
      if (!uid || String(lead.assigned_to || '') !== String(uid)) {
        const e = new Error('Không có quyền xem ghi âm của deal này');
        e.status = 403;
        throw e;
      }
    }
    return lead;
  }
  if (lead.type === 'lead') {
    if (!userSeesAllCrmLeads(req.user?.role)) {
      const owns =
        uid &&
        (String(lead.assigned_to || '') === String(uid) || String(lead.lead_owner_id || '') === String(uid));
      if (!owns) {
        const e = new Error('Không có quyền xem ghi âm của lead này');
        e.status = 403;
        throw e;
      }
    }
    return lead;
  }
  return lead;
}

function ensureUserDir(userId) {
  const dir = path.join(UPLOAD_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Trigger sau khi có bản ghi âm mới: quét SĐT trong tên file / ghi chú / nhãn thiết bị (nếu chưa có SĐT),
 * ghép khách + Lead/Deal — cùng logic nút «Quét SĐT từ tên ghi âm».
 */
async function enrichVoiceRecordingFromMetadataById(supabaseClient, recordId, actingUserId, actingRole) {
  const { data: row, error } = await supabaseClient
    .from('voice_recordings')
    .select('id, phone_number, notes, file_name, device_label, customer_id, lead_id, user_id')
    .eq('id', recordId)
    .single();
  if (error || !row) return null;

  const uid = row.user_id || actingUserId;
  const origPhone = row.phone_number != null ? String(row.phone_number).replace(/\s+/g, '').trim() : '';

  if (origPhone) {
    if (row.customer_id && row.lead_id) return null;
    const resolved = await resolveCustomerLeadByPhone(supabaseClient, origPhone, uid, actingRole);
    if (!resolved?.customer_id) return null;
    if (resolved.customer_id === row.customer_id && resolved.lead_id === row.lead_id) return null;
    const { data: updated, error: upErr } = await supabaseClient
      .from('voice_recordings')
      .update({ customer_id: resolved.customer_id, lead_id: resolved.lead_id })
      .eq('id', recordId)
      .select(RECORDING_SELECT)
      .single();
    return upErr ? null : attachPlayableUrl(updated);
  }

  const metaTextBlob = [row.notes, row.file_name, row.device_label].filter(Boolean).join('\n');
  if (!metaTextBlob.trim()) return null;

  let phoneNum = '';
  let customer_id = row.customer_id;
  let lead_id = row.lead_id;

  const candidates = extractPhonesFromText(metaTextBlob);
  for (const c of candidates) {
    const resolved0 = await resolveCustomerLeadByPhone(supabaseClient, c, uid, actingRole);
    if (resolved0?.customer_id) {
      phoneNum = digitsOnly(c).slice(0, 32);
      customer_id = resolved0.customer_id;
      lead_id = resolved0.lead_id;
      break;
    }
  }
  if (!phoneNum && candidates.length) {
    phoneNum = digitsOnly(candidates[0]).slice(0, 32);
  }
  if (!phoneNum || String(phoneNum).replace(/\D/g, '').length < 9) return null;

  if (customer_id == null && lead_id == null) {
    const resolved = await resolveCustomerLeadByPhone(supabaseClient, phoneNum, uid, actingRole);
    if (resolved?.customer_id) {
      customer_id = resolved.customer_id;
      lead_id = resolved.lead_id;
    }
  }

  const { data: updated, error: upErr } = await supabaseClient
    .from('voice_recordings')
    .update({
      phone_number: phoneNum,
      customer_id,
      lead_id,
    })
    .eq('id', recordId)
    .select(RECORDING_SELECT)
    .single();
  if (upErr || !updated) return null;

  const pn = updated.phone_number ? String(updated.phone_number).replace(/\s+/g, '').trim() : '';
  if (pn && (!updated.customer_id || !updated.lead_id)) {
    try {
      const resolved2 = await resolveCustomerLeadByPhone(supabaseClient, pn, uid, actingRole);
      if (resolved2?.customer_id) {
        const { data: data2, error: e2 } = await supabaseClient
          .from('voice_recordings')
          .update({ customer_id: resolved2.customer_id, lead_id: resolved2.lead_id })
          .eq('id', recordId)
          .select(RECORDING_SELECT)
          .single();
        if (!e2 && data2) return attachPlayableUrl(data2);
      }
    } catch {
      /* ignore */
    }
  }

  return attachPlayableUrl(updated);
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

/**
 * POST /voice-recordings/bulk-check
 * Body: { items: [{ file_name, file_size? }, ...] }
 * Trả về: {
 *   existing: [{ file_name, file_size, id, created_at, customer_id, lead_id, phone_number }],
 *   tombstoned: [{ file_name, file_size, deleted_at, original_id }],
 * }
 *
 * Mobile dùng để so danh sách file local với server (1 round-trip thay vì N).
 * - existing  = bản ghi đang còn trên server (status: synced).
 * - tombstoned = đã từng có nhưng bị xóa → KHÔNG quét up lại (status: deleted_on_server).
 */
r.post('/bulk-check', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.json({ existing: [], tombstoned: [] });
    const MAX_ITEMS = 500;
    const safe = items.slice(0, MAX_ITEMS);
    const fileNames = Array.from(
      new Set(
        safe
          .map((it) => (it && typeof it.file_name === 'string' ? it.file_name.trim().slice(0, 256) : ''))
          .filter((n) => !!n),
      ),
    );
    if (fileNames.length === 0) return res.json({ existing: [], tombstoned: [] });

    // Map theo "name" → mảng size client gửi lên (có thể nhiều size cùng tên).
    const sizeIndex = new Map();
    for (const it of safe) {
      const n = it && typeof it.file_name === 'string' ? it.file_name.trim().slice(0, 256) : '';
      if (!n) continue;
      const sz = Number(it.file_size);
      if (!sizeIndex.has(n)) sizeIndex.set(n, []);
      sizeIndex.get(n).push(Number.isFinite(sz) ? sz : null);
    }
    const matchByName = (rowName, rowSize) => {
      const sizes = sizeIndex.get(rowName);
      if (!sizes) return false;
      const wantsAnySize = sizes.some((s) => s == null || s <= 0);
      return wantsAnySize || sizes.includes(rowSize);
    };

    const [activeRes, tombRes] = await Promise.all([
      supabase
        .from('voice_recordings')
        .select('id, file_name, file_size, created_at, customer_id, lead_id, phone_number')
        .eq('user_id', req.user.userId)
        .in('file_name', fileNames)
        .limit(2000),
      supabase
        .from('voice_recordings_deleted')
        .select('original_id, file_name, file_size, deleted_at')
        .eq('user_id', req.user.userId)
        .in('file_name', fileNames)
        .limit(2000),
    ]);
    if (activeRes.error) throw activeRes.error;
    if (tombRes.error && tombRes.error.code !== '42P01') throw tombRes.error; // 42P01: bảng chưa migrate → bỏ qua tombstone.

    const existing = [];
    for (const row of activeRes.data || []) {
      if (matchByName(row.file_name, row.file_size)) existing.push(row);
    }
    const activeKeys = new Set(existing.map((r) => `${r.file_name}|${r.file_size ?? -1}`));
    const tombstoned = [];
    for (const row of tombRes.data || []) {
      if (!matchByName(row.file_name, row.file_size)) continue;
      // Nếu file đã có active record cùng (name,size) thì coi như đã restore → không gắn tombstone.
      if (activeKeys.has(`${row.file_name}|${row.file_size ?? -1}`)) continue;
      tombstoned.push(row);
    }
    res.json({ existing, tombstoned });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi bulk-check' });
  }
});

/**
 * GET /voice-recordings/exists?file_name=&file_size=
 * Background sync (Android) gọi trước khi upload để tránh up lại file đã có **hoặc đã từng bị xóa** trong tài khoản.
 * Chỉ scope theo user hiện tại (mỗi user có không gian dedup riêng).
 *
 * Trả về:
 *  - exists: true nếu có active record HOẶC tombstone match.
 *  - reason: 'active' | 'tombstoned' | null.
 */
r.get('/exists', async (req, res) => {
  try {
    const fileName = req.query.file_name != null ? String(req.query.file_name).trim() : '';
    if (!fileName) return res.status(400).json({ error: 'Thiếu file_name' });
    const safeName = fileName.slice(0, 256);
    const fileSizeRaw = req.query.file_size != null ? String(req.query.file_size).trim() : '';
    let sizeNum = null;
    if (fileSizeRaw) {
      const n = Number(fileSizeRaw);
      if (Number.isFinite(n) && n >= 0) sizeNum = n;
    }

    let activeQ = supabase
      .from('voice_recordings')
      .select('id, file_name, file_size, created_at')
      .eq('user_id', req.user.userId)
      .eq('file_name', safeName);
    if (sizeNum != null) activeQ = activeQ.eq('file_size', sizeNum);
    activeQ = activeQ.order('created_at', { ascending: false }).limit(1);

    const { data: activeRows, error: activeErr } = await activeQ;
    if (activeErr) throw activeErr;
    if (activeRows && activeRows[0]) {
      return res.json({ exists: true, reason: 'active', id: activeRows[0].id });
    }

    let tombQ = supabase
      .from('voice_recordings_deleted')
      .select('original_id, file_name, file_size, deleted_at')
      .eq('user_id', req.user.userId)
      .eq('file_name', safeName);
    if (sizeNum != null) tombQ = tombQ.eq('file_size', sizeNum);
    tombQ = tombQ.order('deleted_at', { ascending: false }).limit(1);

    const { data: tombRows, error: tombErr } = await tombQ;
    // Nếu bảng chưa migrate (42P01), bỏ qua tombstone — không treo background sync.
    if (tombErr && tombErr.code !== '42P01') throw tombErr;
    if (tombRows && tombRows[0]) {
      return res.json({ exists: true, reason: 'tombstoned', id: tombRows[0].original_id || null });
    }

    res.json({ exists: false, reason: null, id: null });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi kiểm tra' });
  }
});

/** GET /voice-recordings — mặc định: của user; `?lead_id=` = mọi bản đã ghép lead/deal (nếu có quyền xem CRM). */
r.get('/', async (req, res) => {
  try {
    const leadIdFilter = uuidOrNull(req.query.lead_id);
    if (leadIdFilter === false) {
      return res.status(400).json({ error: 'lead_id không hợp lệ' });
    }
    if (leadIdFilter) {
      try {
        await assertUserCanViewCrmLeadForVoiceList(req, leadIdFilter);
      } catch (e) {
        const st = e.status || 500;
        return res.status(st).json({ error: e.message || 'Lỗi' });
      }
      const { data, error } = await supabase
        .from('voice_recordings')
        .select(RECORDING_SELECT)
        .eq('lead_id', leadIdFilter)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json({ recordings: (data || []).map(attachPlayableUrl) });
    }

    const phoneQ = req.query.phone ? String(req.query.phone).replace(/\s+/g, '').trim() : '';
    const unassigned =
      req.query.unassigned === '1' || req.query.unassigned === 'true' || req.query.unassigned === 'yes';
    const linkedOnly =
      req.query.linked_only === '1' || req.query.linked_only === 'true' || req.query.linked_only === 'yes';
    const admin = isVoiceRecordingsAdmin(req.user?.role);
    const filterUserId = admin && req.query.user_id ? uuidOrNull(req.query.user_id) : null;
    if (admin && req.query.user_id && filterUserId === false) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }

    let q = supabase.from('voice_recordings').select(RECORDING_SELECT).order('created_at', { ascending: false });
    if (admin) {
      if (filterUserId) q = q.eq('user_id', filterUserId);
      q = q.limit(filterUserId ? 300 : 500);
    } else {
      q = q.eq('user_id', req.user.userId).limit(200);
    }
    /** Chưa gắn Lead/Deal: có SĐT hoặc đã có KH nhưng lead_id trống (nhiều cơ hội → chỉ gắn KH). */
    if (unassigned) {
      q = q.is('lead_id', null);
    }
    if (linkedOnly) {
      q = q.not('lead_id', 'is', null);
    }
    if (phoneQ) q = q.ilike('phone_number', `%${phoneQ.slice(0, 20)}%`);

    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (unassigned) {
      rows = rows.filter((r) => {
        const hasPhone = r.phone_number && String(r.phone_number).trim() !== '';
        return hasPhone || r.customer_id;
      });
    }
    res.json({ recordings: rows.map(attachPlayableUrl) });
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
    const admin = isVoiceRecordingsAdmin(req.user?.role);
    const allUsers =
      admin &&
      (req.body?.all_users === true ||
        req.body?.all_users === '1' ||
        req.query?.all_users === '1' ||
        req.query?.all_users === 'true');

    let rq = supabase
      .from('voice_recordings')
      .select('id, phone_number, customer_id, lead_id, user_id')
      .not('phone_number', 'is', null)
      .neq('phone_number', '')
      .order('created_at', { ascending: false })
      .limit(allUsers ? 200 : 80);
    if (!allUsers) rq = rq.eq('user_id', req.user.userId);
    const { data: rows, error } = await rq;
    if (error) throw error;
    const pending = (rows || []).filter((r) => !r.customer_id || !r.lead_id).slice(0, allUsers ? 80 : 50);
    let updated = 0;
    for (const row of pending) {
      const resolved = await resolveCustomerLeadByPhone(
        supabase,
        row.phone_number,
        row.user_id || req.user.userId,
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

/**
 * POST /voice-recordings/scan-metadata-phones
 * Quét tên file + ghi chú + nhãn thiết bị để tìm SĐT di động VN, điền phone_number (khi đang trống) và thử ghép CRM.
 * Query: admin có thể truyền user_id để chỉ quét ghi âm của một nhân viên.
 */
r.post('/scan-metadata-phones', async (req, res) => {
  try {
    const admin = isVoiceRecordingsAdmin(req.user?.role);
    const filterUserId = admin && req.query.user_id ? uuidOrNull(req.query.user_id) : null;
    if (admin && req.query.user_id && filterUserId === false) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }

    let q = supabase
      .from('voice_recordings')
      .select('id, phone_number, notes, file_name, device_label, customer_id, lead_id, user_id')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!admin) {
      q = q.eq('user_id', req.user.userId);
    } else if (filterUserId) {
      q = q.eq('user_id', filterUserId);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const noPhone = (r) => {
      const p = r.phone_number != null ? String(r.phone_number).replace(/\s+/g, '').trim() : '';
      return !p;
    };

    const pending = (rows || []).filter(noPhone);
    const slice = pending.slice(0, 80);

    let filledPhone = 0;

    for (const row of slice) {
      const metaTextBlob = [row.notes, row.file_name, row.device_label].filter(Boolean).join('\n');
      if (!metaTextBlob.trim()) continue;

      const candidates = extractPhonesFromText(metaTextBlob);
      if (!candidates.length) continue;

      const phoneNum = digitsOnly(candidates[0]).slice(0, 32);
      if (!phoneNum || phoneNum.length < 9) continue;

      let customer_id = row.customer_id;
      let lead_id = row.lead_id;

      const resolved = await resolveCustomerLeadByPhone(
        supabase,
        phoneNum,
        row.user_id || req.user.userId,
        req.user.role,
      );
      if (resolved?.customer_id) {
        customer_id = resolved.customer_id;
        lead_id = resolved.lead_id;
      }

      const patch = { phone_number: phoneNum, customer_id, lead_id };
      const { error: upErr } = await supabase.from('voice_recordings').update(patch).eq('id', row.id);
      if (!upErr) filledPhone += 1;
    }

    res.json({
      ok: true,
      processed: slice.length,
      queue_without_phone: pending.length,
      filled_phone: filledPhone,
    });
  } catch (e) {
    console.error('voice-recordings scan-metadata-phones:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi quét tên/ghi chú' });
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

    let phone_number = req.body.phone_number
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

    // Dedup theo (user_id, file_name, file_size) — chống up lại file đã có sau khi user logout/login
    // hoặc cài lại app làm reset cache local. Chỉ dedup khi cả tên + size khớp để tránh "false positive"
    // với các file khác cùng tên.
    {
      const baseName = (req.file.originalname || req.file.filename || '').slice(0, 256);
      const fileSize = Number(req.file.size || 0);
      if (baseName && Number.isFinite(fileSize) && fileSize > 0) {
        const { data: dup, error: dupErr } = await supabase
          .from('voice_recordings')
          .select(RECORDING_SELECT)
          .eq('user_id', req.user.userId)
          .eq('file_name', baseName)
          .eq('file_size', fileSize)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!dupErr && dup) {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            try {
              fs.unlinkSync(req.file.path);
            } catch {
              /* ignore */
            }
          }
          return res.status(200).json({ recording: attachPlayableUrl(dup), duplicate: true });
        }
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

    const fileBaseName = req.file.originalname || req.file.filename || '';
    const metaTextBlob = [notes, fileBaseName, device_label].filter(Boolean).join('\n');

    let customer_id = null;
    let lead_id = null;

    /** Quét SĐT trong ghi chú / tên file / nhãn thiết bị khi chưa nhập SĐT tay */
    if (!phone_number && metaTextBlob.trim()) {
      const candidates = extractPhonesFromText(metaTextBlob);
      for (const c of candidates) {
        const resolved = await resolveCustomerLeadByPhone(
          supabase,
          c,
          req.user.userId,
          req.user.role,
        );
        if (resolved?.customer_id) {
          phone_number = digitsOnly(c).slice(0, 32);
          customer_id = resolved.customer_id;
          lead_id = resolved.lead_id;
          break;
        }
      }
      if (!phone_number && candidates.length) {
        phone_number = digitsOnly(candidates[0]).slice(0, 32);
      }
    }

    if (phone_number && customer_id == null && lead_id == null) {
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

    // User chủ động upload file đã từng bị xóa → gỡ tombstone để không hiển thị "deleted_on_server" nữa.
    try {
      const fnameForTomb = (req.file.originalname || req.file.filename || '').slice(0, 256);
      const fsizeForTomb = Number(req.file.size || 0);
      if (fnameForTomb) {
        let delQ = supabase
          .from('voice_recordings_deleted')
          .delete()
          .eq('user_id', req.user.userId)
          .eq('file_name', fnameForTomb);
        if (Number.isFinite(fsizeForTomb) && fsizeForTomb > 0) {
          delQ = delQ.eq('file_size', fsizeForTomb);
        }
        const { error: delErr } = await delQ;
        if (delErr && delErr.code !== '42P01') {
          console.warn('[voice-recordings] gỡ tombstone lỗi (bỏ qua):', delErr.message);
        }
      }
    } catch (e) {
      console.warn('[voice-recordings] gỡ tombstone block lỗi (bỏ qua):', e.message);
    }

    /** Mỗi file mới: quét tên/ghi chú → SĐT + CRM (bắt thêm trường hợp insert đã gán SĐT nhưng chưa kịp ghép đủ). */
    let responseRecording = data;
    try {
      const enriched = await enrichVoiceRecordingFromMetadataById(supabase, data.id, req.user.userId, req.user.role);
      if (enriched) responseRecording = enriched;
    } catch (enrErr) {
      console.warn('[voice-recordings] enrich sau insert (bỏ qua):', enrErr.message);
    }

    res.status(201).json({ recording: attachPlayableUrl(responseRecording) });
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

    const adminBoot = isVoiceRecordingsAdmin(req.user?.role);
    let bootSel = supabase
      .from('voice_recordings')
      .select('id, phone_number, customer_id, lead_id, user_id')
      .eq('id', req.params.id);
    if (!adminBoot) bootSel = bootSel.eq('user_id', req.user.userId);
    const { data: rec, error: re } = await bootSel.single();
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

    const uid = rec.user_id || req.user.userId;
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
    const admin = isVoiceRecordingsAdmin(req.user?.role);
    let sel = supabase
      .from('voice_recordings')
      .select('id, phone_number, customer_id, lead_id, user_id, notes, file_name, device_label')
      .eq('id', req.params.id);
    if (!admin) sel = sel.eq('user_id', req.user.userId);
    const { data: row, error: fe } = await sel.single();
    if (fe || !row) return res.status(404).json({ error: 'Không tìm thấy' });

    const origPhoneNorm = row.phone_number != null ? String(row.phone_number).replace(/\s+/g, '').trim() : '';
    let customer_id = row.customer_id;
    let lead_id = row.lead_id;
    let phone_number =
      row.phone_number != null ? String(row.phone_number).replace(/\s+/g, '').trim().slice(0, 32) : null;
    if (req.body.phone_number !== undefined) {
      const raw = req.body.phone_number != null ? String(req.body.phone_number).replace(/\s+/g, '').trim().slice(0, 32) : '';
      phone_number = raw || null;
    }

    if (req.body.action === 'relink_from_phone') {
      customer_id = null;
      lead_id = null;
      let phoneNum = phone_number ? String(phone_number).trim() : '';
      const metaTextBlob = [row.notes, row.file_name, row.device_label].filter(Boolean).join('\n');
      let candidates = [];
      if (!phoneNum && metaTextBlob.trim()) {
        candidates = extractPhonesFromText(metaTextBlob);
        for (const c of candidates) {
          const resolved0 = await resolveCustomerLeadByPhone(
            supabase,
            c,
            row.user_id || req.user.userId,
            req.user.role,
          );
          if (resolved0?.customer_id) {
            phoneNum = digitsOnly(c).slice(0, 32);
            customer_id = resolved0.customer_id;
            lead_id = resolved0.lead_id;
            break;
          }
        }
        if (!phoneNum && candidates.length) {
          phoneNum = digitsOnly(candidates[0]).slice(0, 32);
        }
      }
      if (!phoneNum) {
        return res.status(400).json({
          error:
            'Bản ghi chưa có số điện thoại để ghép (nhập SĐT hoặc ghi trong ghi chú / tên file / nhãn thiết bị).',
        });
      }
      if (customer_id == null && lead_id == null) {
        const resolved = await resolveCustomerLeadByPhone(
          supabase,
          phoneNum,
          row.user_id || req.user.userId,
          req.user.role,
        );
        if (!resolved) {
          customer_id = null;
          lead_id = null;
        } else {
          customer_id = resolved.customer_id;
          lead_id = resolved.lead_id;
        }
      }
      phone_number = phoneNum;
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

    const nextPhoneNorm = phone_number != null ? String(phone_number).replace(/\s+/g, '').trim() : '';
    if (nextPhoneNorm !== origPhoneNorm && nextPhoneNorm && req.body.action !== 'relink_from_phone') {
      const resolved = await resolveCustomerLeadByPhone(
        supabase,
        nextPhoneNorm,
        row.user_id || req.user.userId,
        req.user.role,
      );
      if (resolved) {
        customer_id = resolved.customer_id;
        lead_id = resolved.lead_id;
      }
    }

    const patch = { customer_id, lead_id };
    if (req.body.phone_number !== undefined) patch.phone_number = phone_number || null;

    const { data: updated, error: ue } = await supabase
      .from('voice_recordings')
      .update(patch)
      .eq('id', row.id)
      .select(RECORDING_SELECT)
      .single();
    if (ue) throw ue;
    res.json({ recording: attachPlayableUrl(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Cập nhật thất bại' });
  }
});

/** DELETE /voice-recordings/:id — xóa bản ghi + ghi tombstone để background sync không upload lại file đó. */
r.delete('/:id', async (req, res) => {
  try {
    const admin = isVoiceRecordingsAdmin(req.user?.role);
    let q = supabase
      .from('voice_recordings')
      .select('id, user_id, file_name, file_size, device_label, storage_path')
      .eq('id', req.params.id);
    if (!admin) q = q.eq('user_id', req.user.userId);
    const { data: row, error: fe } = await q.single();
    if (fe || !row) return res.status(404).json({ error: 'Không tìm thấy' });

    if (row.storage_path && !row.storage_path.startsWith('uploads/')) {
      try {
        await removeVoiceObject(supabase, row.storage_path);
      } catch {
        /* ignore */
      }
    } else if (row.storage_path) {
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

    // Ghi tombstone — KHÔNG fail toàn bộ DELETE nếu lỗi (ví dụ bảng chưa migrate).
    try {
      const fname = (row.file_name || '').slice(0, 256);
      if (fname) {
        const sizeRaw = Number(row.file_size);
        const tombstone = {
          user_id: row.user_id,
          file_name: fname,
          file_size: Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : 0,
          original_id: row.id,
          device_label: row.device_label ? String(row.device_label).slice(0, 200) : null,
        };
        const { error: tErr } = await supabase
          .from('voice_recordings_deleted')
          .upsert(tombstone, { onConflict: 'user_id,file_name,file_size' });
        if (tErr && tErr.code !== '42P01' && tErr.code !== '23505') {
          console.warn('[voice-recordings] tombstone insert lỗi (bỏ qua):', tErr.message);
        }
      }
    } catch (e) {
      console.warn('[voice-recordings] tombstone block lỗi (bỏ qua):', e.message);
    }
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
