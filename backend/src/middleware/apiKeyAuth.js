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

  req.apiKey = { id: found.id, name: found.name, created_at: found.created_at };
  next();
}

module.exports = { apiKeyAuth, loadKeys, KEYS_FILE };
