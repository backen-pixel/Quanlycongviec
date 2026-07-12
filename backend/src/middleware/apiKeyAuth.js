/**
 * Xác thực qua API key — đọc/ghi vào bảng Supabase `external_api_keys`.
 * Ưu tiên header `X-Api-Key`; nếu thiếu thì nhận từ query (Postman Params, iframe, …).
 * Lưu ý: key trên URL dễ lọt access log — nên dùng header khi có thể.
 *
 * Trước đây dùng file `backend/data/api-keys.json`, không bền trên Render
 * (filesystem ephemeral, mỗi lần deploy/restart sẽ mất). Đã chuyển sang DB.
 *
 * Có cache 30s trong RAM để giảm số lần query lên Supabase.
 */
const { supabase } = require('../config/supabase');
const fs = require('fs');
const path = require('path');

const LEGACY_KEYS_FILE = path.join(__dirname, '../../data/api-keys.json');

// ── In-memory cache (TTL 30s) ───────────────────────────────────────────────
const _cache = new Map(); // key → { row, exp }
const CACHE_TTL_MS = 30_000;

function _setCache(key, row) {
  _cache.set(key, { row, exp: Date.now() + CACHE_TTL_MS });
}
function _getCache(key) {
  const hit = _cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.exp) { _cache.delete(key); return undefined; }
  return hit.row;
}
function invalidateCache(key) {
  if (key) _cache.delete(key);
  else _cache.clear();
}

// ── CRUD helpers (Supabase-backed) ──────────────────────────────────────────
const SELECT_COLS = `id, name, key, refresh_token, active, default_assigned_to, company_id, region_id,
  default_source_category_id, default_lead_type_id, default_pipeline_id,
  webhook_url, created_by, created_at, rotated_at, rotated_by`;

async function listKeys() {
  const { data, error } = await supabase
    .from('external_api_keys')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function findKeyByValue(keyValue) {
  const cached = _getCache(keyValue);
  if (cached !== undefined) return cached;
  const { data, error } = await supabase
    .from('external_api_keys')
    .select(SELECT_COLS)
    .eq('key', keyValue)
    .maybeSingle();
  if (error) throw error;
  _setCache(keyValue, data || null);
  return data || null;
}

async function findKeyByRefreshToken(refreshToken) {
  const rt = String(refreshToken || '').trim();
  if (!rt) return null;
  const cached = _getCache(`rt:${rt}`);
  if (cached !== undefined) return cached;
  const { data, error } = await supabase
    .from('external_api_keys')
    .select(SELECT_COLS)
    .eq('refresh_token', rt)
    .maybeSingle();
  if (error) throw error;
  _setCache(`rt:${rt}`, data || null);
  return data || null;
}

async function findKeyById(id) {
  const { data, error } = await supabase
    .from('external_api_keys')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertKey(record) {
  const { data, error } = await supabase
    .from('external_api_keys')
    .insert(record)
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  invalidateCache();
  return data;
}

async function updateKey(id, patch) {
  const { data, error } = await supabase
    .from('external_api_keys')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  invalidateCache();
  return data;
}

async function deleteKey(id) {
  const { error } = await supabase.from('external_api_keys').delete().eq('id', id);
  if (error) throw error;
  invalidateCache();
}

// ── One-time migration from legacy JSON file → DB ───────────────────────────
// Chạy 1 lần khi backend start: nếu DB chưa có key nào và file JSON cũ tồn tại,
// import toàn bộ vào DB. Sau đó đổi tên file để không import lại.
let _migrationDone = false;
async function migrateLegacyFileOnce() {
  if (_migrationDone) return;
  _migrationDone = true;
  try {
    if (!fs.existsSync(LEGACY_KEYS_FILE)) return;
    const raw = fs.readFileSync(LEGACY_KEYS_FILE, 'utf-8');
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return;

    const { count } = await supabase
      .from('external_api_keys')
      .select('id', { count: 'exact', head: true });
    if ((count || 0) > 0) return; // DB đã có data, bỏ qua

    const payload = items.map((k) => ({
      id: k.id,
      name: k.name,
      key: k.key,
      active: k.active !== false,
      default_assigned_to: k.default_assigned_to || null,
      company_id: k.company_id || null,
      region_id: k.region_id || null,
      default_source_category_id: k.default_source_category_id || null,
      default_lead_type_id: k.default_lead_type_id || null,
      default_pipeline_id: k.default_pipeline_id || null,
      webhook_url: k.webhook_url || null,
      created_by: k.created_by || null,
      created_at: k.created_at || new Date().toISOString(),
      rotated_at: k.rotated_at || null,
      rotated_by: k.rotated_by || null,
    })).filter((k) => k.key && k.company_id);

    if (payload.length === 0) return;

    const { error } = await supabase.from('external_api_keys').insert(payload);
    if (error) {
      console.warn('[apiKeyAuth] Migrate legacy api-keys.json failed:', error.message);
      return;
    }
    console.log(`[apiKeyAuth] ✅ Migrated ${payload.length} api-key(s) từ file JSON → Supabase`);
    try { fs.renameSync(LEGACY_KEYS_FILE, LEGACY_KEYS_FILE + '.migrated'); } catch (_) {}
  } catch (e) {
    console.warn('[apiKeyAuth] Migration error:', e.message);
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

/** Header X-Api-Key, Authorization Bearer, hoặc query api_key / access_token */
function extractApiKey(req) {
  const bearer = String(req.headers.authorization || '').trim();
  if (bearer.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }

  const h = req.headers['x-api-key'];
  if (h) return String(h).trim();

  const q = req.query;
  if (!q || typeof q !== 'object') return null;

  const single = q['x-api-key'] ?? q['X-Api-Key'] ?? q.api_key ?? q.apiKey ?? q.access_token;
  if (single != null && String(single).trim() !== '') return String(single).trim();

  for (const name of Object.keys(q)) {
    const lower = String(name).toLowerCase();
    if (lower === 'x-api-key' || lower === 'api_key' || lower === 'apikey') {
      const v = q[name];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return null;
}

async function apiKeyAuth(req, res, next) {
  const key = extractApiKey(req);
  if (!key) {
    return res.status(401).json({
      error: 'Thiếu access token: header X-Api-Key, Authorization Bearer, hoặc query ?api_key= / ?access_token=',
    });
  }

  try {
    await migrateLegacyFileOnce();
    const found = await findKeyByValue(String(key).trim());
    if (!found || found.active === false) {
      return res.status(401).json({ error: 'API key không hợp lệ hoặc đã bị thu hồi' });
    }
    if (!found.company_id) {
      return res.status(401).json({ error: 'API key thiếu company_id (cần rotate/tạo lại key)' });
    }

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
  } catch (e) {
    console.error('[apiKeyAuth] DB error:', e.message);
    res.status(500).json({ error: 'Lỗi xác thực API key: ' + e.message });
  }
}

module.exports = {
  apiKeyAuth,
  listKeys,
  findKeyById,
  findKeyByValue,
  findKeyByRefreshToken,
  insertKey,
  updateKey,
  deleteKey,
  invalidateCache,
  migrateLegacyFileOnce,
};
