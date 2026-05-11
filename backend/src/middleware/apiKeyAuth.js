const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, '../../data/api-keys.json');

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return [];
}

/**
 * Middleware: xác thực qua header X-Api-Key.
 * Key hợp lệ → req.apiKey = { id, name, created_at }
 */
function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Thiếu X-Api-Key header' });

  const keys = loadKeys();
  const found = keys.find((k) => k.key === key && k.active !== false);
  if (!found) return res.status(401).json({ error: 'API key không hợp lệ hoặc đã bị thu hồi' });
  if (!found.company_id) return res.status(401).json({ error: 'API key thiếu company_id (cần rotate/tạo lại key)' });

  req.apiKey = {
    id: found.id,
    name: found.name,
    created_at: found.created_at,
    default_assigned_to: found.default_assigned_to || null,
    company_id: found.company_id || null,
    region_id: found.region_id || null,
    default_source_category_id: found.default_source_category_id || null,
    default_lead_type_id: found.default_lead_type_id || null,
    default_pipeline_id: found.default_pipeline_id || null,
    webhook_url: found.webhook_url || null,
  };
  next();
}

module.exports = { apiKeyAuth, loadKeys, KEYS_FILE };
