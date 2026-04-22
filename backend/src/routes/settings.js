const { Router } = require('express');
const { auth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
let misaService = null;
try { misaService = require('../services/misaService'); } catch (e) { console.warn('⚠️ misaService not loaded:', e.message); }

const r = Router();
r.use(auth);

const DATA_DIR = path.join(__dirname, '../../data');
const COMPANY_FILE = path.join(DATA_DIR, 'company-info.json');
const THEME_DIR = path.join(DATA_DIR, 'themes');

// Ensure theme dir exists
if (!fs.existsSync(THEME_DIR)) fs.mkdirSync(THEME_DIR, { recursive: true });
const defaultCompanyInfo = require('../config/companyInfo');

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
r.get('/company', async (req, res) => {
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

module.exports = r;
module.exports.getCompanyInfo = getCompanyInfo;
