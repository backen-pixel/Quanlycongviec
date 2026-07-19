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
const { isAdminLike, isCompanyScopedAdmin } = require('../helpers/adminRole');
const {
  uploadVoiceFromTempFile,
  removeVoiceObject,
  publicUrlForVoiceObject,
} = require('../helpers/voiceStorageUpload');
const {
  resolveVoiceRecordingCompanyId,
  resolveVoiceStaffContext,
  createCrmOpportunityForCustomer,
  ensureVoiceRecordingCrmLink,
} = require('../helpers/voiceRecordingCrmAuto');
const {
  isVoiceRecordingDuplicate,
  groupVoiceRecordingDuplicates,
} = require('../helpers/voiceRecordingDedup');
const {
  fetchCrmLeadsForCustomerScoped,
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
  isCrmSystemAdminUser,
  isCrmCompanyAdminUser,
  isCrmRegionAdminUser,
  isCrmSalesAdminUser,
} = require('../helpers/crmAccessRoles');
const {
  PROSPECT_CLASSES,
  STT_STATUSES,
  classifyVoiceRecordingById,
  classifyVoiceRecordingsBatch,
  enqueueVoiceRecordingStt,
} = require('../helpers/voiceRecordingClassify');

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
  return {
    ...rec,
    file_name: rec.file_name ? normalizeVoiceFileName(rec.file_name) : rec.file_name,
    audio_url: url,
  };
}

/** Android/MediaStore đôi khi gửi tên file URL-encoded — lưu UTF-8 để hiển thị đúng. */
function normalizeVoiceFileName(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().slice(0, 256);
  if (!s) return '';
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* keep */
  }
  return s.slice(0, 256);
}

function voiceFileNameFromUpload(file) {
  return normalizeVoiceFileName(file?.originalname || file?.filename || '');
}

function expandFileNameLookupKeys(raw) {
  const normalized = normalizeVoiceFileName(raw);
  if (!normalized) return [];
  const keys = new Set([normalized]);
  const rawTrim = raw != null ? String(raw).trim().slice(0, 256) : '';
  if (rawTrim) keys.add(rawTrim);
  try {
    keys.add(encodeURIComponent(normalized));
  } catch {
    /* ignore */
  }
  return [...keys];
}

const VOICE_DEDUP_ROW_SELECT =
  'id, user_id, file_name, file_size, duration_sec, phone_number, call_started_at, call_ended_at, created_at, customer_id, lead_id, storage_path';

/** Tìm bản ghi trùng (cùng user) theo tên + size/SĐT/thời gian/thời lượng. */
async function findVoiceRecordingDuplicate(supabaseClient, userId, clientItem, selectFields = VOICE_DEDUP_ROW_SELECT) {
  const names = expandFileNameLookupKeys(clientItem?.file_name);
  if (!userId || !names.length) return null;

  const { data, error } = await supabaseClient
    .from('voice_recordings')
    .select(selectFields)
    .eq('user_id', userId)
    .in('file_name', names)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error || !data?.length) return null;

  const hit = data.find((row) => isVoiceRecordingDuplicate(clientItem, row));
  return hit || null;
}

function parseOptionalIsoTime(v) {
  if (v == null || v === '') return null;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

function parseOptionalDurationSec(v) {
  if (v == null || v === '') return null;
  const d = parseFloat(v);
  if (!Number.isFinite(d) || d < 0 || d >= 86400) return null;
  return d;
}

/** Các trường + join CRM (PostgREST cần FK 63_voice_recordings_crm_link.sql) */
const UPLOADER_SELECT =
  'id, full_name, email, company_id, department:departments!users_department_id_fkey(company_id)';
const RECORDING_SELECT_CORE =
  `id, user_id, company_id, file_name, storage_path, mime_type, file_size, duration_sec, source, device_label, notes, created_at, phone_number, direction, call_started_at, call_ended_at, external_call_id, customer_id, lead_id, crm_auto_skip_create, prospect_class, prospect_classified_at, stt_status, stt_error, stt_attempts, stt_model, transcript_language, transcribed_at, customer:customers(id, full_name, phone), lead:crm_leads(id, code, title, type, company_id), uploader:users!voice_recordings_user_id_fkey(${UPLOADER_SELECT})`;
const RECORDING_SELECT = `${RECORDING_SELECT_CORE}, transcript`;

function recordingSelectForRequest(req, { forceTranscript = false } = {}) {
  const leadQ = req?.query?.lead_id != null ? String(req.query.lead_id).trim() : '';
  const want =
    forceTranscript ||
    req.query.include_transcript === '1' ||
    req.query.include_transcript === 'true' ||
    (!!leadQ &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadQ));
  return want ? RECORDING_SELECT : RECORDING_SELECT_CORE;
}

async function classifyRecordingSafe(recordId, selectFields = RECORDING_SELECT) {
  if (!recordId) return null;
  try {
    return await classifyVoiceRecordingById(supabase, recordId, { select: selectFields });
  } catch (e) {
    console.warn('[voice-recordings] classify (bỏ qua):', e.message);
    return null;
  }
}

/** Công ty NV upload — ưu tiên users.company_id, fallback phòng ban, rồi company_id trên bản ghi. */
function resolveVoiceUploaderCompanyId(rec) {
  const u = rec?.uploader;
  if (u?.company_id != null && String(u.company_id).trim() !== '') return String(u.company_id).trim();
  if (u?.department?.company_id != null && String(u.department.company_id).trim() !== '') {
    return String(u.department.company_id).trim();
  }
  if (rec?.company_id != null && String(rec.company_id).trim() !== '') return String(rec.company_id).trim();
  return '';
}

/** Danh sách user_id thuộc công ty (phòng ban + users.company_id trực tiếp). */
async function resolveVoiceCompanyUserIds(supabaseClient, companyId) {
  if (!companyId) return [];
  const cid = String(companyId).trim();
  const ids = new Set();

  const { data: depts } = await supabaseClient
    .from('departments')
    .select('id')
    .eq('company_id', cid)
    .eq('is_active', true);
  const deptIds = (depts || []).map((d) => d.id).filter(Boolean);
  if (deptIds.length) {
    const { data: deptUsers } = await supabaseClient
      .from('users')
      .select('id')
      .in('department_id', deptIds)
      .neq('is_active', false);
    for (const u of deptUsers || []) {
      if (u?.id) ids.add(String(u.id));
    }
  }

  const { data: directUsers } = await supabaseClient
    .from('users')
    .select('id')
    .eq('company_id', cid)
    .neq('is_active', false);
  for (const u of directUsers || []) {
    if (u?.id) ids.add(String(u.id));
  }

  return [...ids];
}

/** Phạm vi quản lý: chỉ ghi âm do NV thuộc công ty đó upload. */
function voiceRecordingInMgmtScope(rec, mgmtCompanyId) {
  if (!mgmtCompanyId) return true;
  return resolveVoiceUploaderCompanyId(rec) === String(mgmtCompanyId);
}

function voiceRecordingMatchesLeadCompany(rec, leadCompanyId) {
  if (!leadCompanyId) return true;
  return String(rec.lead?.company_id || '') === String(leadCompanyId);
}

/** Lọc tùy chọn theo công ty nhân viên upload (`?company_id=`). */
function voiceRecordingMatchesStaffCompany(rec, staffCompanyId) {
  if (!staffCompanyId) return true;
  return resolveVoiceUploaderCompanyId(rec) === String(staffCompanyId);
}

/** Công ty NV dùng để lọc danh sách (JWT hoặc query admin hệ thống). */
function resolveEffectiveVoiceStaffCompanyId(listFilters) {
  if (!listFilters) return null;
  return listFilters.mgmtCompanyId || listFilters.staffCompanyId || null;
}

function voiceRecordingPassesFilters(rec, { mgmtCompanyId, leadCompanyId, staffCompanyId }) {
  if (mgmtCompanyId && !voiceRecordingInMgmtScope(rec, mgmtCompanyId)) return false;
  if (!voiceRecordingMatchesLeadCompany(rec, leadCompanyId)) return false;
  if (!voiceRecordingMatchesStaffCompany(rec, staffCompanyId)) return false;
  return true;
}

/**
 * Admin hệ thống (`admin` không company_id): không ép phạm vi.
 * Admin/sales_admin/region_admin/NV có company_id: chỉ công ty NV đó.
 */
function resolveVoiceMgmtCompanyId(req) {
  if (isCrmSystemAdminUser(req.user)) return null;
  const userCo = req.user?.company_id ? String(req.user.company_id).trim() : null;
  return userCo || null;
}

/**
 * - mgmtCompanyId: ép theo công ty NV (JWT company_id).
 * - staffCompanyId: lọc thêm theo công ty NV (`?company_id=`).
 * - leadCompanyId: lọc thêm theo công ty Lead/Deal (`?lead_company_id=`).
 */
function resolveVoiceListFilters(req) {
  const qLeadCo = uuidOrNull(req.query.lead_company_id);
  const qStaffCo = uuidOrNull(req.query.company_id);
  if (qLeadCo === false) return { error: 'lead_company_id không hợp lệ', status: 400 };
  if (qStaffCo === false) return { error: 'company_id không hợp lệ', status: 400 };

  const mgmtCompanyId = resolveVoiceMgmtCompanyId(req);
  const leadCompanyId = qLeadCo || null;
  const staffCompanyId = qStaffCo || null;

  if (mgmtCompanyId && staffCompanyId && staffCompanyId !== mgmtCompanyId) {
    return { error: 'Không có quyền lọc công ty nhân viên khác', status: 403 };
  }

  return { mgmtCompanyId, leadCompanyId, staffCompanyId };
}

/** Xem ghi âm mọi NV trong phạm vi (không khóa theo user_id). Admin gắn công ty chỉ NV cùng công ty. */
function canViewAllVoiceInCompany(req) {
  if (isCrmSystemAdminUser(req.user)) return true;
  if (!resolveVoiceMgmtCompanyId(req) && isVoiceRecordingsAdmin(req.user?.role)) return true;
  if (isCrmSalesAdminUser(req.user)) return true;
  if (isCrmCompanyAdminUser(req.user)) return true;
  if (isCrmRegionAdminUser(req.user)) return true;
  if (isCompanyScopedAdmin(req.user)) return true;
  return false;
}

function uuidOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return false;
  return s;
}

/** Quyền sửa / bootstrap / ghép CRM trên một bản ghi (chủ sở hữu hoặc quản lý công ty). */
async function loadVoiceRecordingForManage(req, recordId, selectFields) {
  const fields =
    selectFields ||
    `id, phone_number, customer_id, lead_id, user_id, company_id, lead:crm_leads(company_id), uploader:users!voice_recordings_user_id_fkey(${UPLOADER_SELECT})`;
  const { data: rec, error: re } = await supabase
    .from('voice_recordings')
    .select(fields)
    .eq('id', recordId)
    .single();
  if (re || !rec) return { error: 'Không tìm thấy bản ghi', status: 404 };

  const isOwner = String(rec.user_id || '') === String(req.user?.userId || '');
  if (isOwner) return { rec };

  if (canViewAllVoiceInCompany(req)) {
    const mgmtCompanyId = resolveVoiceMgmtCompanyId(req);
    if (mgmtCompanyId && !voiceRecordingInMgmtScope(rec, mgmtCompanyId)) {
      return { error: 'Không có quyền thao tác ghi âm này', status: 403 };
    }
    return { rec };
  }

  return { error: 'Không có quyền thao tác ghi âm này', status: 403 };
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
 * Trigger sau khi có bản ghi âm mới: quét SĐT (nếu thiếu) → ghép lead/deal có sẵn hoặc tạo Lead mới.
 */
async function enrichVoiceRecordingFromMetadataById(supabaseClient, recordId, actingUserId, actingRole) {
  let { data: row, error } = await supabaseClient
    .from('voice_recordings')
    .select('id, phone_number, notes, file_name, device_label, customer_id, lead_id, user_id, company_id, crm_auto_skip_create')
    .eq('id', recordId)
    .single();
  if (error || !row) return null;
  if (row.lead_id) return null;
  if (row.crm_auto_skip_create === true) return null;

  const origPhone = row.phone_number != null ? String(row.phone_number).replace(/\s+/g, '').trim() : '';
  if (!origPhone) {
    const metaTextBlob = [row.notes, row.file_name, row.device_label].filter(Boolean).join('\n');
    const candidates = extractPhonesFromText(metaTextBlob);
    if (candidates.length) {
      const phoneNum = digitsOnly(candidates[0]).slice(0, 32);
      if (phoneNum.length >= 9) {
        const { data: withPhone, error: pe } = await supabaseClient
          .from('voice_recordings')
          .update({ phone_number: phoneNum })
          .eq('id', recordId)
          .select('id, phone_number, notes, file_name, device_label, customer_id, lead_id, user_id, company_id, crm_auto_skip_create')
          .single();
        if (!pe && withPhone) row = withPhone;
      }
    }
  }

  const result = await ensureVoiceRecordingCrmLink(supabaseClient, row, {
    actingUserId,
    actingRole,
    recordSelect: RECORDING_SELECT,
  });
  if (!result?.recording) return null;
  if (result.createdNew) {
    console.log(
      `[voice-crm-auto] recording ${recordId}: created ${result.lead?.type || 'lead'} ${result.lead?.code || result.lead?.id}`,
    );
  } else if (result.linkedExisting) {
    console.log(
      `[voice-crm-auto] recording ${recordId}: linked ${result.lead?.type || 'crm'} ${result.lead?.code || result.lead?.id}`,
    );
  }
  return attachPlayableUrl(result.recording);
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
    const staff = await resolveVoiceStaffContext(supabase, {
      userId: req.user.userId,
      recordingCompanyId: req.user?.company_id || null,
    });
    const resolved = await resolveCustomerLeadByPhone(
      supabase,
      phone,
      req.user.userId,
      req.user.role,
      staff.companyId,
    );
    res.json({ match: resolved });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/**
 * POST /voice-recordings/bulk-check
 * Body: { items: [{ file_name, file_size?, phone_number?, call_started_at?, duration_sec?, created_at? }, ...] }
 * Trả về: {
 *   existing: [{ file_name, file_size, id, created_at, customer_id, lead_id, phone_number, duration_sec, call_started_at }],
 *   tombstoned: [{ file_name, file_size, deleted_at, original_id }],
 * }
 *
 * Mobile dùng để so danh sách file local với server (1 round-trip thay vì N).
 * Trùng khi: cùng tên + dung lượng (+ SĐT + thời gian cuộc gọi + thời lượng nếu client gửi đủ).
 */
r.post('/bulk-check', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.json({ existing: [], tombstoned: [] });
    const MAX_ITEMS = 500;
    const safe = items.slice(0, MAX_ITEMS);
    const fileNames = Array.from(
      new Set(
        safe.flatMap((it) =>
          it && typeof it.file_name === 'string'
            ? expandFileNameLookupKeys(it.file_name)
            : [],
        ),
      ),
    );
    if (fileNames.length === 0) return res.json({ existing: [], tombstoned: [] });

    const normalizedItems = safe
      .filter((it) => it && typeof it.file_name === 'string')
      .map((it) => ({
        file_name: normalizeVoiceFileName(it.file_name),
        file_size: Number(it.file_size),
        phone_number: it.phone_number != null ? String(it.phone_number).trim() : null,
        call_started_at: parseOptionalIsoTime(it.call_started_at ?? it.created_at),
        duration_sec: parseOptionalDurationSec(it.duration_sec),
      }))
      .filter((it) => it.file_name);

    const matchByNameSize = (rowName, rowSize) => {
      const key = normalizeVoiceFileName(rowName);
      return normalizedItems.some(
        (it) => it.file_name === key && (it.file_size <= 0 || it.file_size === Number(rowSize)),
      );
    };

    const [activeRes, tombRes] = await Promise.all([
      supabase
        .from('voice_recordings')
        .select(
          'id, file_name, file_size, duration_sec, phone_number, call_started_at, created_at, customer_id, lead_id',
        )
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
    if (tombRes.error && tombRes.error.code !== '42P01') throw tombRes.error;

    const serverRows = activeRes.data || [];
    const existing = [];
    const matchedServerIds = new Set();
    for (const it of normalizedItems) {
      const hit = serverRows.find(
        (row) => !matchedServerIds.has(row.id) && isVoiceRecordingDuplicate(it, row),
      );
      if (hit) {
        matchedServerIds.add(hit.id);
        existing.push(hit);
      }
    }

    const activeKeys = new Set(existing.map((r) => `${r.file_name}|${r.file_size ?? -1}`));
    const tombstoned = [];
    for (const row of tombRes.data || []) {
      if (!matchByNameSize(row.file_name, row.file_size)) continue;
      if (activeKeys.has(`${row.file_name}|${row.file_size ?? -1}`)) continue;
      tombstoned.push(row);
    }
    res.json({ existing, tombstoned });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi bulk-check' });
  }
});

/**
 * GET /voice-recordings/exists?file_name=&file_size=&phone_number=&call_started_at=&duration_sec=
 * Background sync gọi trước khi upload để tránh up lại file đã có hoặc đã từng bị xóa.
 */
r.get('/exists', async (req, res) => {
  try {
    const fileName = req.query.file_name != null ? String(req.query.file_name).trim() : '';
    if (!fileName) return res.status(400).json({ error: 'Thiếu file_name' });
    const lookupNames = expandFileNameLookupKeys(fileName);
    if (!lookupNames.length) return res.status(400).json({ error: 'file_name không hợp lệ' });
    const fileSizeRaw = req.query.file_size != null ? String(req.query.file_size).trim() : '';
    let sizeNum = null;
    if (fileSizeRaw) {
      const n = Number(fileSizeRaw);
      if (Number.isFinite(n) && n >= 0) sizeNum = n;
    }

    const clientItem = {
      file_name: normalizeVoiceFileName(fileName),
      file_size: sizeNum,
      phone_number: req.query.phone_number != null ? String(req.query.phone_number).trim() : null,
      call_started_at: parseOptionalIsoTime(req.query.call_started_at ?? req.query.created_at),
      duration_sec: parseOptionalDurationSec(req.query.duration_sec),
    };

    const dup = await findVoiceRecordingDuplicate(supabase, req.user.userId, clientItem, 'id, file_name, file_size, created_at');
    if (dup) {
      return res.json({ exists: true, reason: 'active', id: dup.id, duplicate: true });
    }

    let tombQ = supabase
      .from('voice_recordings_deleted')
      .select('original_id, file_name, file_size, deleted_at')
      .eq('user_id', req.user.userId)
      .in('file_name', lookupNames);
    if (sizeNum != null) tombQ = tombQ.eq('file_size', sizeNum);
    tombQ = tombQ.order('deleted_at', { ascending: false }).limit(1);

    const { data: tombRows, error: tombErr } = await tombQ;
    if (tombErr && tombErr.code !== '42P01') throw tombErr;
    if (tombRows && tombRows[0]) {
      return res.json({ exists: true, reason: 'tombstoned', id: tombRows[0].original_id || null });
    }

    res.json({ exists: false, reason: null, id: null });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi kiểm tra' });
  }
});

/**
 * POST /voice-recordings/scan-duplicates
 * Quét bản ghi trùng trên server: cùng tên + dung lượng (+ SĐT + thời gian + thời lượng khi đủ dữ liệu).
 * Query: admin có thể `user_id=`; `company_id=` lọc theo công ty NV upload.
 */
r.post('/scan-duplicates', async (req, res) => {
  try {
    const companyViewer = canViewAllVoiceInCompany(req);
    const filterUserId = companyViewer && req.query.user_id ? uuidOrNull(req.query.user_id) : null;
    if (companyViewer && req.query.user_id && filterUserId === false) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }
    const listFilters = resolveVoiceListFilters(req);
    if (listFilters.error) {
      return res.status(listFilters.status || 400).json({ error: listFilters.error });
    }
    const effectiveStaffCo = resolveEffectiveVoiceStaffCompanyId(listFilters);
    let companyUserIds = null;
    if (effectiveStaffCo) {
      companyUserIds = await resolveVoiceCompanyUserIds(supabase, effectiveStaffCo);
      if (!companyUserIds.length && companyViewer) {
        return res.json({ ok: true, scanned: 0, duplicate_groups: 0, groups: [] });
      }
    }
    const mgmtCompanyId = listFilters.mgmtCompanyId;

    let q = supabase
      .from('voice_recordings')
      .select(
        `id, user_id, file_name, file_size, duration_sec, phone_number, call_started_at, created_at, customer_id, lead_id, company_id, uploader:users!voice_recordings_user_id_fkey(${UPLOADER_SELECT})`,
      )
      .order('created_at', { ascending: false })
      .limit(companyViewer ? 1500 : 600);

    if (!companyViewer) {
      q = q.eq('user_id', req.user.userId);
    } else if (filterUserId) {
      if (companyUserIds && !companyUserIds.includes(String(filterUserId))) {
        return res.status(403).json({ error: 'Không có quyền quét ghi âm nhân viên khác công ty' });
      }
      q = q.eq('user_id', filterUserId);
    } else if (companyUserIds) {
      q = q.in('user_id', companyUserIds);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    let scoped = rows || [];
    if (mgmtCompanyId) {
      scoped = scoped.filter((r) => voiceRecordingInMgmtScope(r, mgmtCompanyId));
    }

    const groups = groupVoiceRecordingDuplicates(scoped);
    const duplicateRowCount = groups.reduce((sum, g) => sum + g.count, 0);

    res.json({
      ok: true,
      scanned: scoped.length,
      duplicate_groups: groups.length,
      duplicate_rows: duplicateRowCount,
      groups: groups.slice(0, 80),
    });
  } catch (e) {
    console.error('voice-recordings scan-duplicates:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi quét trùng' });
  }
});

/** GET /voice-recordings — mặc định: của user; `?lead_id=` = mọi bản đã ghép lead/deal (nếu có quyền xem CRM). */
r.get('/', async (req, res) => {
  try {
    const leadIdFilter = uuidOrNull(req.query.lead_id);
    if (leadIdFilter === false) {
      return res.status(400).json({ error: 'lead_id không hợp lệ' });
    }
    const selectFields = recordingSelectForRequest(req);
    if (leadIdFilter) {
      try {
        await assertUserCanViewCrmLeadForVoiceList(req, leadIdFilter);
      } catch (e) {
        const st = e.status || 500;
        return res.status(st).json({ error: e.message || 'Lỗi' });
      }
      const { data, error } = await supabase
        .from('voice_recordings')
        .select(selectFields)
        .eq('lead_id', leadIdFilter)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const mgmtCompanyId = resolveVoiceMgmtCompanyId(req);
      let leadRows = data || [];
      if (mgmtCompanyId) {
        leadRows = leadRows.filter((row) => voiceRecordingInMgmtScope(row, mgmtCompanyId));
      }
      return res.json({ recordings: leadRows.map(attachPlayableUrl) });
    }

    const listFilters = resolveVoiceListFilters(req);
    if (listFilters.error) {
      return res.status(listFilters.status || 400).json({ error: listFilters.error });
    }

    const phoneQ = req.query.phone ? String(req.query.phone).replace(/\s+/g, '').trim() : '';
    const unassigned =
      req.query.unassigned === '1' || req.query.unassigned === 'true' || req.query.unassigned === 'yes';
    const linkedOnly =
      req.query.linked_only === '1' || req.query.linked_only === 'true' || req.query.linked_only === 'yes';
    const prospectClassQ = req.query.prospect_class
      ? String(req.query.prospect_class).trim().toLowerCase()
      : '';
    if (prospectClassQ && !PROSPECT_CLASSES.has(prospectClassQ)) {
      return res.status(400).json({ error: 'prospect_class không hợp lệ' });
    }
    const sttStatusQ = req.query.stt_status ? String(req.query.stt_status).trim().toLowerCase() : '';
    if (sttStatusQ && !STT_STATUSES.has(sttStatusQ)) {
      return res.status(400).json({ error: 'stt_status không hợp lệ' });
    }
    const companyViewer = canViewAllVoiceInCompany(req);
    const filterUserId = companyViewer && req.query.user_id ? uuidOrNull(req.query.user_id) : null;
    if (companyViewer && req.query.user_id && filterUserId === false) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }

    const effectiveStaffCo = resolveEffectiveVoiceStaffCompanyId(listFilters);
    let companyUserIds = null;
    if (effectiveStaffCo) {
      companyUserIds = await resolveVoiceCompanyUserIds(supabase, effectiveStaffCo);
      if (!companyUserIds.length) {
        return res.json({ recordings: [] });
      }
    }

    let q = supabase.from('voice_recordings').select(selectFields).order('created_at', { ascending: false });
    if (companyViewer) {
      if (filterUserId) {
        if (companyUserIds && !companyUserIds.includes(String(filterUserId))) {
          return res.status(403).json({ error: 'Không có quyền xem ghi âm nhân viên khác công ty' });
        }
        q = q.eq('user_id', filterUserId);
      } else if (companyUserIds) {
        q = q.in('user_id', companyUserIds);
      }
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
    if (prospectClassQ) q = q.eq('prospect_class', prospectClassQ);
    if (sttStatusQ) q = q.eq('stt_status', sttStatusQ);
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
    rows = rows.filter((r) => voiceRecordingPassesFilters(r, listFilters));
    res.json({ recordings: rows.map(attachPlayableUrl) });
  } catch (e) {
    console.error('voice-recordings list:', e.message);
    res.status(500).json({ error: e.message || 'Không tải được danh sách' });
  }
});

/**
 * POST /voice-recordings/relink-unassigned — quét bản ghi chưa gắn lead/deal: ghép có sẵn hoặc tạo Lead mới.
 */
r.post('/relink-unassigned', async (req, res) => {
  try {
    const companyViewer = canViewAllVoiceInCompany(req);
    const allUsers =
      companyViewer &&
      (req.body?.all_users === true ||
        req.body?.all_users === '1' ||
        req.query?.all_users === '1' ||
        req.query?.all_users === 'true');
    const listFilters = resolveVoiceListFilters(req);
    if (listFilters.error) {
      return res.status(listFilters.status || 400).json({ error: listFilters.error });
    }
    const effectiveStaffCo = resolveEffectiveVoiceStaffCompanyId(listFilters);
    let companyUserIds = null;
    if (effectiveStaffCo) {
      companyUserIds = await resolveVoiceCompanyUserIds(supabase, effectiveStaffCo);
      if (!companyUserIds.length && allUsers) {
        return res.json({ ok: true, scanned: 0, updated: 0, auto_created: 0 });
      }
    }
    const mgmtCompanyId = listFilters.mgmtCompanyId;

    let rq = supabase
      .from('voice_recordings')
      .select(
        `id, phone_number, customer_id, lead_id, user_id, company_id, crm_auto_skip_create, lead:crm_leads(company_id), uploader:users!voice_recordings_user_id_fkey(${UPLOADER_SELECT})`,
      )
      .not('phone_number', 'is', null)
      .neq('phone_number', '')
      .eq('crm_auto_skip_create', false)
      .order('created_at', { ascending: false })
      .limit(allUsers ? 200 : 80);
    if (!allUsers) {
      rq = rq.eq('user_id', req.user.userId);
    } else if (companyUserIds) {
      rq = rq.in('user_id', companyUserIds);
    }
    const { data: rows, error } = await rq;
    if (error) throw error;
    let scoped = rows || [];
    if (mgmtCompanyId) {
      scoped = scoped.filter((r) => voiceRecordingInMgmtScope(r, mgmtCompanyId));
    }
    const pending = scoped.filter((r) => !r.customer_id || !r.lead_id).slice(0, allUsers ? 80 : 50);
    let updated = 0;
    let autoCreated = 0;
    for (const row of pending) {
      const result = await ensureVoiceRecordingCrmLink(supabase, row, {
        actingUserId: row.user_id || req.user.userId,
        actingRole: req.user.role,
        recordSelect: 'id, customer_id, lead_id',
      });
      if (!result?.recording) continue;
      if (result.createdNew || result.linkedExisting) updated += 1;
      if (result.createdNew) autoCreated += 1;
      await classifyRecordingSafe(result.recording.id || row.id, 'id, prospect_class, stt_status');
    }
    res.json({ ok: true, scanned: pending.length, updated, auto_created: autoCreated });
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
    const companyViewer = canViewAllVoiceInCompany(req);
    const filterUserId = companyViewer && req.query.user_id ? uuidOrNull(req.query.user_id) : null;
    if (companyViewer && req.query.user_id && filterUserId === false) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }
    const listFilters = resolveVoiceListFilters(req);
    if (listFilters.error) {
      return res.status(listFilters.status || 400).json({ error: listFilters.error });
    }
    const effectiveStaffCo = resolveEffectiveVoiceStaffCompanyId(listFilters);
    let companyUserIds = null;
    if (effectiveStaffCo) {
      companyUserIds = await resolveVoiceCompanyUserIds(supabase, effectiveStaffCo);
      if (!companyUserIds.length && companyViewer) {
        return res.json({ ok: true, filled_phone: 0, crm_linked: 0, scanned: 0 });
      }
    }
    const mgmtCompanyId = listFilters.mgmtCompanyId;

    let q = supabase
      .from('voice_recordings')
      .select(
        `id, phone_number, notes, file_name, device_label, customer_id, lead_id, user_id, company_id, crm_auto_skip_create, lead:crm_leads(company_id), uploader:users!voice_recordings_user_id_fkey(${UPLOADER_SELECT})`,
      )
      .eq('crm_auto_skip_create', false)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!companyViewer) {
      q = q.eq('user_id', req.user.userId);
    } else if (filterUserId) {
      if (companyUserIds && !companyUserIds.includes(String(filterUserId))) {
        return res.status(403).json({ error: 'Không có quyền quét ghi âm nhân viên khác công ty' });
      }
      q = q.eq('user_id', filterUserId);
    } else if (companyUserIds) {
      q = q.in('user_id', companyUserIds);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const noPhone = (r) => {
      const p = r.phone_number != null ? String(r.phone_number).replace(/\s+/g, '').trim() : '';
      return !p;
    };

    let scoped = (rows || []).filter(noPhone);
    if (mgmtCompanyId) {
      scoped = scoped.filter((r) => voiceRecordingInMgmtScope(r, mgmtCompanyId));
    }
    const pending = scoped;
    const slice = pending.slice(0, 80);

    let filledPhone = 0;
    let crmLinked = 0;

    for (const row of slice) {
      const metaTextBlob = [row.notes, row.file_name, row.device_label].filter(Boolean).join('\n');
      if (!metaTextBlob.trim()) continue;

      const candidates = extractPhonesFromText(metaTextBlob);
      if (!candidates.length) continue;

      const phoneNum = digitsOnly(candidates[0]).slice(0, 32);
      if (!phoneNum || phoneNum.length < 9) continue;

      let workingRow = { ...row, phone_number: phoneNum };
      if (!row.phone_number) {
        const { error: upErr } = await supabase
          .from('voice_recordings')
          .update({ phone_number: phoneNum })
          .eq('id', row.id);
        if (!upErr) filledPhone += 1;
      }

      const result = await ensureVoiceRecordingCrmLink(supabase, workingRow, {
        actingUserId: row.user_id || req.user.userId,
        actingRole: req.user.role,
        recordSelect: 'id, customer_id, lead_id, phone_number',
      });
      if (result?.recording && (result.createdNew || result.linkedExisting)) crmLinked += 1;
    }

    for (const row of slice) {
      await classifyRecordingSafe(row.id, 'id, prospect_class, stt_status');
    }

    res.json({
      ok: true,
      processed: slice.length,
      queue_without_phone: pending.length,
      filled_phone: filledPhone,
      crm_linked: crmLinked,
    });
  } catch (e) {
    console.error('voice-recordings scan-metadata-phones:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi quét tên/ghi chú' });
  }
});

/**
 * POST /voice-recordings/classify-prospects
 * Phân loại lại theo liên kết CRM; chỉ enqueue STT cho Lead tiềm năng (type=lead).
 * Body/query: force=1 để reclassify cả bản đã có prospect_class; limit (mặc định 100).
 */
r.post('/classify-prospects', async (req, res) => {
  try {
    const companyViewer = canViewAllVoiceInCompany(req);
    const filterUserId = companyViewer && req.query.user_id ? uuidOrNull(req.query.user_id) : null;
    if (companyViewer && req.query.user_id && filterUserId === false) {
      return res.status(400).json({ error: 'user_id không hợp lệ' });
    }
    const listFilters = resolveVoiceListFilters(req);
    if (listFilters.error) {
      return res.status(listFilters.status || 400).json({ error: listFilters.error });
    }
    const force =
      req.body?.force === true ||
      req.body?.force === 1 ||
      req.body?.force === '1' ||
      req.query.force === '1' ||
      req.query.force === 'true';
    const limitRaw = req.body?.limit ?? req.query.limit;
    const limit = Math.min(Math.max(parseInt(String(limitRaw || '100'), 10) || 100, 1), 300);

    let userIds = null;
    if (!companyViewer) {
      userIds = [req.user.userId];
    } else if (filterUserId) {
      userIds = [filterUserId];
    } else {
      const effectiveStaffCo = resolveEffectiveVoiceStaffCompanyId(listFilters);
      if (effectiveStaffCo) {
        userIds = await resolveVoiceCompanyUserIds(supabase, effectiveStaffCo);
        if (!userIds.length) {
          return res.json({ ok: true, scanned: 0, classified: 0, pending: 0, skipped: 0 });
        }
      }
    }

    const result = await classifyVoiceRecordingsBatch(supabase, { limit, force, userIds });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('voice-recordings classify-prospects:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi phân loại' });
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

    // Dedup: tên + dung lượng (+ SĐT + thời gian cuộc gọi + thời lượng khi có đủ metadata)
    {
      const baseName = voiceFileNameFromUpload(req.file);
      const fileSize = Number(req.file.size || 0);
      if (baseName) {
        const clientItem = {
          file_name: baseName,
          file_size: fileSize,
          phone_number,
          call_started_at,
          duration_sec,
        };
        const dup = await findVoiceRecordingDuplicate(supabase, req.user.userId, clientItem, RECORDING_SELECT);
        if (dup) {
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

    const fileBaseName = voiceFileNameFromUpload(req.file);
    const metaTextBlob = [notes, fileBaseName, device_label].filter(Boolean).join('\n');

    const uploaderStaff = await resolveVoiceStaffContext(supabase, {
      userId: req.user.userId,
      recordingCompanyId: req.user?.company_id || null,
    });
    const uploaderCompanyId = uploaderStaff.companyId || null;

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
          uploaderCompanyId,
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
        uploaderCompanyId,
      );
      if (resolved) {
        customer_id = resolved.customer_id;
        lead_id = resolved.lead_id;
      }
    }

    let company_id = await resolveVoiceRecordingCompanyId(supabase, {
      lead_id,
      customer_id,
      staffCompanyId: uploaderCompanyId,
    });
    if (!company_id) company_id = uploaderCompanyId;

    const { data, error } = await supabase
      .from('voice_recordings')
      .insert({
        user_id: req.user.userId,
        file_name: voiceFileNameFromUpload(req.file),
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
        company_id,
      })
      .select(RECORDING_SELECT)
      .single();

    if (error) throw error;

    // User chủ động upload file đã từng bị xóa → gỡ tombstone để không hiển thị "deleted_on_server" nữa.
    try {
      const fnameForTomb = voiceFileNameFromUpload(req.file);
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

    /** Mỗi file mới: quét SĐT → ghép lead/deal có sẵn hoặc tạo Lead tự động. */
    let responseRecording = data;
    try {
      const enriched = await enrichVoiceRecordingFromMetadataById(supabase, data.id, req.user.userId, req.user.role);
      if (enriched) responseRecording = enriched;
    } catch (enrErr) {
      console.warn('[voice-recordings] enrich sau insert (bỏ qua):', enrErr.message);
    }

    const classified = await classifyRecordingSafe(responseRecording?.id || data.id, RECORDING_SELECT);
    if (classified) responseRecording = classified;

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
 * Ghi âm chưa gắn lead/deal: tạo (hoặc dùng) khách + lead/deal mới do user hiện tại phụ trách, rồi liên kết.
 * Nếu ghi âm đã gắn KH nhưng chưa có lead/deal — chỉ tạo thêm cơ hội cho khách đó.
 */
r.post('/:id/bootstrap-crm', async (req, res) => {
  try {
    const { full_name, title, type = 'lead', company_id, phone_number: phoneBody, force_new: forceNewBody } =
      req.body || {};
    const name = full_name != null ? String(full_name).trim() : '';
    const forceNew = forceNewBody === true || forceNewBody === '1' || forceNewBody === 1;

    const loaded = await loadVoiceRecordingForManage(req, req.params.id);
    if (loaded.error) return res.status(loaded.status || 403).json({ error: loaded.error });
    const rec = loaded.rec;

    if (rec.lead_id && !forceNew) {
      return res.status(400).json({ error: 'Bản ghi đã gắn lead/deal' });
    }

    let phone = rec.phone_number ? String(rec.phone_number).replace(/\s+/g, '').trim() : '';
    if (!phone && phoneBody) phone = String(phoneBody).replace(/\s+/g, '').trim();

    const dealType = String(type).toLowerCase() === 'deal' ? 'deal' : 'lead';
    const uid = rec.user_id || req.user.userId;
    const uploaderStaff = await resolveVoiceStaffContext(supabase, {
      userId: uid,
      recordingCompanyId: rec.company_id || req.user?.company_id || null,
    });

    let cidBody = uuidOrNull(company_id);
    if (cidBody === false) return res.status(400).json({ error: 'company_id không hợp lệ' });
    const effectiveCompanyId = cidBody || uploaderStaff.companyId || null;
    if (!effectiveCompanyId) {
      return res.status(400).json({ error: 'Không xác định được công ty của nhân viên upload' });
    }

    let customerRow;
    if (rec.customer_id) {
      const { data: cust, error: ce } = await supabase
        .from('customers')
        .select('id, full_name, phone')
        .eq('id', rec.customer_id)
        .single();
      if (ce || !cust) return res.status(400).json({ error: 'Không tìm thấy khách hàng đã gắn' });
      customerRow = cust;
      if (!phone && cust.phone) phone = String(cust.phone).replace(/\s+/g, '').trim();
    } else {
      if (!name) return res.status(400).json({ error: 'Nhập tên khách hàng' });
      if (!phone) return res.status(400).json({ error: 'Bản ghi chưa có số điện thoại' });
      customerRow = await findCustomerByPhoneDigits(supabase, phone);
      if (!customerRow) {
        const { data: ins, error: ce } = await supabase
          .from('customers')
          .insert({
            full_name: name.slice(0, 200),
            phone: phone.slice(0, 32),
            source: 'Ghi âm',
            company_id: effectiveCompanyId,
          })
          .select('id, full_name, phone')
          .single();
        if (ce) throw ce;
        customerRow = ins;
      }
    }

    const titleLabel = phone || customerRow.full_name || 'Ghi âm';
    let leadRow;
    try {
      leadRow = await createCrmOpportunityForCustomer(supabase, {
        customerRow,
        phone,
        staffUserId: uid,
        type: dealType,
        companyId: effectiveCompanyId,
        title:
          (title && String(title).trim()) ||
          (dealType === 'deal' ? `Deal — ${titleLabel}` : `Lead — ${titleLabel}`),
      });
    } catch (createErr) {
      const status = createErr.status || 500;
      return res.status(status).json({ error: createErr.message || 'Tạo CRM thất bại' });
    }

    const bootCompanyId = await resolveVoiceRecordingCompanyId(supabase, {
      lead_id: leadRow.id,
      customer_id: customerRow.id,
      staffCompanyId: effectiveCompanyId,
    });
    const recPatch = {
      customer_id: customerRow.id,
      lead_id: leadRow.id,
      company_id: bootCompanyId || effectiveCompanyId,
      crm_auto_skip_create: true,
    };
    if (phone && !rec.phone_number) recPatch.phone_number = phone.slice(0, 32);
    const { data: updated, error: ue } = await supabase
      .from('voice_recordings')
      .update(recPatch)
      .eq('id', rec.id)
      .select(RECORDING_SELECT)
      .single();
    if (ue) throw ue;

    let responseRecording = updated;
    const classified = await classifyRecordingSafe(updated.id, RECORDING_SELECT);
    if (classified) responseRecording = classified;

    res.status(201).json({
      recording: attachPlayableUrl(responseRecording),
      customer: customerRow,
      lead: leadRow,
    });
  } catch (e) {
    console.error('voice-recordings bootstrap-crm:', e.message);
    res.status(500).json({ error: e.message || 'Tạo CRM thất bại' });
  }
});

/**
 * POST /voice-recordings/:id/transcribe
 * Xếp hàng STT (retry) — chỉ khi gắn Lead tiềm năng (type=lead).
 */
r.post('/:id/transcribe', async (req, res) => {
  try {
    const loaded = await loadVoiceRecordingForManage(req, req.params.id, RECORDING_SELECT);
    if (loaded.error) return res.status(loaded.status || 403).json({ error: loaded.error });

    const force =
      req.body?.force === true || req.body?.force === 1 || req.body?.force === '1';
    const updated = await enqueueVoiceRecordingStt(supabase, loaded.rec.id, {
      force,
      select: RECORDING_SELECT,
    });
    res.json({ recording: attachPlayableUrl(updated), queued: true });
  } catch (e) {
    const st = e.status || 500;
    if (st >= 500) console.error('voice-recordings transcribe:', e.message);
    res.status(st).json({ error: e.message || 'Không xếp hàng STT' });
  }
});

/** PATCH /voice-recordings/:id — gắn / cập nhật CRM hoặc ghép lại theo SĐT */
r.patch('/:id', async (req, res) => {
  try {
    const loaded = await loadVoiceRecordingForManage(
      req,
      req.params.id,
      `id, phone_number, customer_id, lead_id, user_id, notes, file_name, device_label, company_id, lead:crm_leads(company_id), uploader:users!voice_recordings_user_id_fkey(${UPLOADER_SELECT})`,
    );
    if (loaded.error) return res.status(loaded.status || 403).json({ error: loaded.error });
    const row = loaded.rec;
    const rowStaff = await resolveVoiceStaffContext(supabase, {
      userId: row.user_id || req.user.userId,
      recordingCompanyId: row.company_id || resolveVoiceUploaderCompanyId(row) || null,
    });
    const rowCompanyId = rowStaff.companyId || null;

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
            rowCompanyId,
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
          rowCompanyId,
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

      if (lead_id && !isAdminLike(req.user)) {
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
        rowCompanyId,
      );
      if (resolved) {
        customer_id = resolved.customer_id;
        lead_id = resolved.lead_id;
      }
    }

    const company_id = await resolveVoiceRecordingCompanyId(supabase, {
      lead_id,
      customer_id,
      staffCompanyId: rowCompanyId,
    });
    const patch = { customer_id, lead_id, company_id };
    if (req.body.phone_number !== undefined) patch.phone_number = phone_number || null;

    const { data: updated, error: ue } = await supabase
      .from('voice_recordings')
      .update(patch)
      .eq('id', row.id)
      .select(RECORDING_SELECT)
      .single();
    if (ue) throw ue;

    let responseRecording = updated;
    if (!updated.lead_id) {
      const auto = await ensureVoiceRecordingCrmLink(supabase, updated, {
        actingUserId: row.user_id || req.user.userId,
        actingRole: req.user.role,
        recordSelect: RECORDING_SELECT,
      });
      if (auto?.recording) responseRecording = auto.recording;
    }

    const classified = await classifyRecordingSafe(responseRecording.id, RECORDING_SELECT);
    if (classified) responseRecording = classified;

    res.json({ recording: attachPlayableUrl(responseRecording) });
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
