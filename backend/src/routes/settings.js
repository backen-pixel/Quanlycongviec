const { Router } = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const { supabase } = require('../config/supabase');
const {
  getAppSettingValue,
  invalidateAppSettingKey,
} = require('../helpers/appSettingsCache');
const fs = require('fs');
const path = require('path');
let misaService = null;
try { misaService = require('../services/misaService'); } catch (e) { console.warn('⚠️ misaService not loaded:', e.message); }

const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function settingsInvalidate(body) {
    void invalidateTags(['settings']);
    return origJson(body);
  };
  next();
});

const DATA_DIR = path.join(__dirname, '../../data');
const COMPANY_FILE = path.join(DATA_DIR, 'company-info.json');
const THEME_DIR = path.join(DATA_DIR, 'themes');

// Ensure theme dir exists
if (!fs.existsSync(THEME_DIR)) fs.mkdirSync(THEME_DIR, { recursive: true });
const defaultCompanyInfo = require('../config/companyInfo');
const { responseCache, invalidateTags } = require('../middleware/responseCache');

function getCompanyInfo() {
  try {
    if (fs.existsSync(COMPANY_FILE)) {
      const raw = fs.readFileSync(COMPANY_FILE, 'utf-8');
      return { ...defaultCompanyInfo, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Error reading company-info.json:', e.message);
  }
  return { ...defaultCompanyInfo };
}

function saveCompanyInfo(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(COMPANY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/settings/company
r.get('/company', responseCache({ ttl: 300, scope: 'global', tags: ['settings'] }), async (req, res) => {
  try {
    res.json(getCompanyInfo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings/company
r.put('/company', async (req, res) => {
  try {
    const current = getCompanyInfo();
    const updated = { ...current, ...req.body };
    saveCompanyInfo(updated);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/settings/theme — per-user theme
r.get('/theme', (req, res) => {
  const userId = req.user.userId;
  const file = path.join(THEME_DIR, `${userId}.json`);
  try {
    if (fs.existsSync(file)) {
      const theme = JSON.parse(fs.readFileSync(file, 'utf8'));
      return res.json({ theme });
    }
    res.json({ theme: null });
  } catch { res.json({ theme: null }); }
});

// PUT /api/settings/theme — save per-user theme
r.put('/theme', (req, res) => {
  const userId = req.user.userId;
  const file = path.join(THEME_DIR, `${userId}.json`);
  try {
    // Don't save huge bgImage to file (base64 can be huge)
    const theme = { ...req.body.theme };
    if (theme.bgImage && theme.bgImage.length > 500000) {
      // Save bgImage separately or skip it
      theme.bgImage = null; // Too large for file — user will re-upload
    }
    fs.writeFileSync(file, JSON.stringify(theme, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── MISA meInvoice settings ────────────────────────────────────────────────
const MISA_CONFIG_FILE = path.join(DATA_DIR, 'misa-config.json');

const MISA_DEFAULTS = {
  appId: '',
  taxcode: '',
  username: '',
  invSeries: '1C26TYY',
  signType: 2,
  isProduction: false,
};

function getMisaConfigFromFile() {
  try {
    if (fs.existsSync(MISA_CONFIG_FILE)) {
      return { ...MISA_DEFAULTS, ...JSON.parse(fs.readFileSync(MISA_CONFIG_FILE, 'utf-8')) };
    }
  } catch (e) { console.warn('Error reading misa-config.json:', e.message); }
  return { ...MISA_DEFAULTS };
}

function saveMisaConfig(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MISA_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/settings/misa — trả config (ẩn password)
r.get('/misa', (req, res) => {
  try {
    const cfg = getMisaConfigFromFile();
    res.json({ ...cfg, password: cfg.password ? '••••••••' : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/settings/misa — lưu config
r.put('/misa', (req, res) => {
  try {
    const current = getMisaConfigFromFile();
    const { password, ...rest } = req.body;
    const updated = { ...current, ...rest };
    // Chỉ cập nhật password nếu có gửi lên và không phải placeholder
    if (password && password !== '••••••••') updated.password = password;
    saveMisaConfig(updated);
    res.json({ ...updated, password: updated.password ? '••••••••' : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/misa/test — kiểm tra kết nối MISA
r.post('/misa/test', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'misaService chưa được cấu hình' });
    const cfg = getMisaConfigFromFile();
    if (!cfg.appId || !cfg.taxcode || !cfg.username || !cfg.password) {
      return res.status(400).json({ error: 'Thiếu thông tin cấu hình MISA (appId, taxcode, username, password)' });
    }
    const BASE_URL_TEST = 'https://testapi.meinvoice.vn/api/integration';
    const BASE_URL_PROD = 'https://api.meinvoice.vn/api/integration';
    const testConfig = {
      ...cfg,
      baseUrl: cfg.isProduction ? BASE_URL_PROD : BASE_URL_TEST,
    };
    // Force fresh token (bypass cache) bằng cách gọi trực tiếp
    const axios = require('axios');
    const resp = await axios.post(
      `${testConfig.baseUrl}/auth/token`,
      { appid: testConfig.appId, taxcode: testConfig.taxcode, username: testConfig.username, password: testConfig.password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    if (resp.data?.success) {
      res.json({ success: true, message: 'Kết nối thành công! Token đã lấy được.' });
    } else {
      res.status(400).json({ success: false, error: `${resp.data?.errorCode || ''} — ${resp.data?.descriptionErrorCode || 'Lỗi xác thực'}` });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.response?.data?.descriptionErrorCode || e.message });
  }
});

// ─── API Keys (External Access) — lưu trên Supabase (bền vững) ─────────────
const {
  listKeys, findKeyById, insertKey, updateKey, deleteKey, migrateLegacyFileOnce,
} = require('../middleware/apiKeyAuth');
const { buildTokenPair, formatOneTimeTokenResponse } = require('../helpers/apiKeyTokens');
const crypto = require('crypto');

function previewKey(k) {
  return (k.key || '').slice(0, 8) + '••••••••••••••••';
}

// GET /api/settings/api-keys — list all keys (ẩn giá trị key thật sau khi tạo)
r.get('/api-keys', async (req, res) => {
  try {
    await migrateLegacyFileOnce();
    const rows = await listKeys();
    res.json(rows.map((k) => ({
      id: k.id,
      name: k.name,
      preview: previewKey(k),
      active: k.active !== false,
      default_assigned_to: k.default_assigned_to || null,
      company_id: k.company_id || null,
      region_id: k.region_id || null,
      default_source_category_id: k.default_source_category_id || null,
      default_lead_type_id: k.default_lead_type_id || null,
      default_pipeline_id: k.default_pipeline_id || null,
      webhook_url: k.webhook_url || null,
      created_at: k.created_at,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: kiểm tra region_id thuộc đúng company_id (chống gán nhầm khu vực
// của công ty khác).
async function assertRegionMatchesCompany(region_id, company_id) {
  if (!region_id || !company_id) return { ok: false, error: 'Thiếu khu vực hoặc công ty' };
  const { supabase } = require('../config/supabase');
  const { data, error } = await supabase
    .from('company_regions')
    .select('id, company_id, is_active')
    .eq('id', region_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Khu vực không tồn tại' };
  if (String(data.company_id) !== String(company_id)) {
    return { ok: false, error: 'Khu vực không thuộc công ty đã chọn' };
  }
  if (data.is_active === false) return { ok: false, error: 'Khu vực đã bị tắt' };
  return { ok: true };
}

// POST /api/settings/api-keys — tạo key mới
r.post('/api-keys', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin/manager mới tạo được API key' });
    }
    const {
      name,
      default_assigned_to,
      webhook_url,
      company_id,
      region_id,
      default_source_category_id,
      default_lead_type_id,
      default_pipeline_id,
    } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nhập tên để nhận biết key này (VD: "Website form", "Zap")' });
    }
    if (!company_id) {
      return res.status(400).json({ error: 'Thiếu company_id — mỗi API key phải gắn cố định 1 công ty' });
    }
    if (!region_id) {
      return res.status(400).json({ error: 'Thiếu region_id — phải chọn khu vực mặc định cho key' });
    }
    const chk = await assertRegionMatchesCompany(region_id, company_id);
    if (!chk.ok) return res.status(400).json({ error: chk.error });
    const pair = buildTokenPair();
    const record = await insertKey({
      name: String(name).trim(),
      key: pair.access_token,
      refresh_token: pair.refresh_token,
      active: true,
      default_assigned_to: default_assigned_to || null,
      company_id,
      region_id,
      default_source_category_id: default_source_category_id || null,
      default_lead_type_id: default_lead_type_id || null,
      default_pipeline_id: default_pipeline_id || null,
      webhook_url: webhook_url || null,
      created_by: req.user.userId,
    });
    res.status(201).json(formatOneTimeTokenResponse(record));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/settings/api-keys/:id — cập nhật tên / assigned_to / region / category
r.patch('/api-keys/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin/manager mới sửa được API key' });
    }
    const cur = await findKeyById(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Không tìm thấy key' });
    const {
      name, default_assigned_to, active, webhook_url, company_id,
      region_id, default_source_category_id, default_lead_type_id, default_pipeline_id,
    } = req.body;
    const patch = {};
    if (name != null) patch.name = String(name).trim();
    if (default_assigned_to !== undefined) patch.default_assigned_to = default_assigned_to || null;
    if (active !== undefined) patch.active = !!active;
    if (webhook_url !== undefined) patch.webhook_url = webhook_url || null;
    if (company_id !== undefined) patch.company_id = company_id || null;
    if (region_id !== undefined) patch.region_id = region_id || null;
    if (default_source_category_id !== undefined) patch.default_source_category_id = default_source_category_id || null;
    if (default_lead_type_id !== undefined) patch.default_lead_type_id = default_lead_type_id || null;
    if (default_pipeline_id !== undefined) patch.default_pipeline_id = default_pipeline_id || null;

    // Nếu đổi region hoặc company → kiểm tra khớp (dùng giá trị mới nếu có)
    const effectiveRegion = patch.region_id !== undefined ? patch.region_id : cur.region_id;
    const effectiveCompany = patch.company_id !== undefined ? patch.company_id : cur.company_id;
    if ((patch.region_id !== undefined || patch.company_id !== undefined) && effectiveRegion) {
      const chk = await assertRegionMatchesCompany(effectiveRegion, effectiveCompany);
      if (!chk.ok) return res.status(400).json({ error: chk.error });
    }
    const updated = await updateKey(req.params.id, patch);
    res.json({
      id: updated.id,
      name: updated.name,
      active: updated.active,
      default_assigned_to: updated.default_assigned_to,
      company_id: updated.company_id || null,
      region_id: updated.region_id || null,
      default_source_category_id: updated.default_source_category_id || null,
      default_lead_type_id: updated.default_lead_type_id || null,
      default_pipeline_id: updated.default_pipeline_id || null,
      webhook_url: updated.webhook_url || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/settings/api-keys/:id/rotate — rotate key (trả giá trị đầy đủ 1 lần)
r.post('/api-keys/:id/rotate', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin/manager mới rotate được API key' });
    }
    const cur = await findKeyById(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Không tìm thấy key' });
    const pair = buildTokenPair();
    const updated = await updateKey(req.params.id, {
      key: pair.access_token,
      refresh_token: pair.refresh_token,
      rotated_at: new Date().toISOString(),
      rotated_by: req.user.userId,
    });
    res.json(formatOneTimeTokenResponse(updated));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Nhạc chuông cuộc gọi Messenger (mặc định toàn hệ thống) ─────────────────
const {
  SETTINGS_KEY: CALL_RING_SETTINGS_KEY,
  saveCallRingtoneBuffer,
  resolveCallRingtoneMeta,
  deleteCallRingtoneAssets,
} = require('../helpers/callRingtoneStorage');
const CALL_RING_MAX_BYTES = 8 * 1024 * 1024;

const callRingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CALL_RING_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok = /^audio\//i.test(file.mimetype || '') || /\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(file.originalname || '');
    if (!ok) return cb(new Error('Chỉ chấp nhận file âm thanh (MP3, WAV, OGG…)'));
    cb(null, true);
  },
});

function serializeCallRingtoneResponse(meta) {
  if (!meta) return { url: null, playUrl: null };
  const playUrl = meta.playUrl || meta.publicUrl || meta.url;
  return {
    url: meta.url,
    playUrl,
    publicUrl: meta.publicUrl || (/^https?:\/\//i.test(String(meta.url || '')) ? meta.url : null),
    fileName: meta.fileName || null,
    mime: meta.mime || 'audio/mpeg',
    updatedAt: meta.updatedAt || null,
    source: meta.source || null,
  };
}

// GET /api/settings/call-ringtone — mọi user đăng nhập
r.get('/call-ringtone', responseCache({ ttl: 60, scope: 'global', tags: ['settings'] }), async (req, res) => {
  try {
    const meta = await resolveCallRingtoneMeta();
    res.json(serializeCallRingtoneResponse(meta));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/settings/call-ringtone — admin upload nhạc chuông mặc định (Supabase Storage)
r.post('/call-ringtone', (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới đặt nhạc chuông mặc định' });
  }
  callRingUpload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `File quá lớn (tối đa ${CALL_RING_MAX_BYTES / (1024 * 1024)} MB)`
        : (err.message || 'Upload thất bại');
      return res.status(400).json({ error: msg });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'Thiếu file âm thanh' });
    try {
      const meta = await saveCallRingtoneBuffer(req.file.buffer, {
        mime: req.file.mimetype || 'audio/mpeg',
        originalName: req.file.originalname,
        uploadedBy: req.user.userId || req.user.id || null,
      });
      const { error } = await supabase.from('app_settings').upsert({
        key: CALL_RING_SETTINGS_KEY,
        value: meta,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      invalidateAppSettingKey(CALL_RING_SETTINGS_KEY);
      res.json(serializeCallRingtoneResponse(meta));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// DELETE /api/settings/call-ringtone — admin xóa nhạc mặc định
r.delete('/call-ringtone', async (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới xóa nhạc chuông mặc định' });
  }
  try {
    await deleteCallRingtoneAssets();
    await supabase.from('app_settings').delete().eq('key', CALL_RING_SETTINGS_KEY);
    invalidateAppSettingKey(CALL_RING_SETTINGS_KEY);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/settings/api-keys/:id — xóa / thu hồi key
r.delete('/api-keys/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin/manager mới xóa được API key' });
    }
    const cur = await findKeyById(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Không tìm thấy key' });
    await deleteKey(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
module.exports.getCompanyInfo = getCompanyInfo;
