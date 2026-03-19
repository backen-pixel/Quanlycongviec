const { Router } = require('express');
const { auth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const r = Router();
r.use(auth);

const DATA_DIR = path.join(__dirname, '../../data');
const COMPANY_FILE = path.join(DATA_DIR, 'company-info.json');
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

module.exports = r;
module.exports.getCompanyInfo = getCompanyInfo;
