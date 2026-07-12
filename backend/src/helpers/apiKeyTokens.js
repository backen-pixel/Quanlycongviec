/**
 * Access + refresh token cho external_api_keys.
 * - access_token: cột `key` (tbp_…) — header X-Api-Key hoặc Authorization Bearer
 * - refresh_token: cột `refresh_token` (tbp_rt_…) — đổi cặp qua POST /api/external/oauth/token
 */
const crypto = require('crypto');
const {
  findKeyByValue,
  findKeyByRefreshToken,
  updateKey,
  invalidateCache,
} = require('../middleware/apiKeyAuth');

function generateAccessToken() {
  return `tbp_${crypto.randomBytes(24).toString('hex')}`;
}

function generateRefreshToken() {
  return `tbp_rt_${crypto.randomBytes(32).toString('hex')}`;
}

function buildTokenPair() {
  return {
    access_token: generateAccessToken(),
    refresh_token: generateRefreshToken(),
  };
}

function attachTokensToKeyRecord(record, { access_token, refresh_token }) {
  return {
    ...record,
    key: access_token,
    access_token,
    refresh_token,
  };
}

function formatOneTimeTokenResponse(record) {
  const access = record.key || record.access_token;
  const refresh = record.refresh_token || null;
  return {
    id: record.id,
    name: record.name,
    key: access,
    access_token: access,
    refresh_token: refresh,
    preview: access ? `${access.slice(0, 8)}••••••••••••••••` : null,
    active: record.active !== false,
    default_assigned_to: record.default_assigned_to || null,
    company_id: record.company_id || null,
    region_id: record.region_id || null,
    default_source_category_id: record.default_source_category_id || null,
    default_lead_type_id: record.default_lead_type_id || null,
    default_pipeline_id: record.default_pipeline_id || null,
    webhook_url: record.webhook_url || null,
    created_at: record.created_at,
    rotated_at: record.rotated_at || null,
    _note: 'Sao chép access_token và refresh_token ngay — chỉ hiển thị 1 lần.',
  };
}

async function refreshAccessToken(refreshToken) {
  const rt = String(refreshToken || '').trim();
  if (!rt) {
    const err = new Error('Thiếu refresh_token');
    err.status = 400;
    throw err;
  }

  const found = await findKeyByRefreshToken(rt);
  if (!found || found.active === false) {
    const err = new Error('Refresh token không hợp lệ hoặc đã bị thu hồi');
    err.status = 401;
    throw err;
  }

  const pair = buildTokenPair();
  const updated = await updateKey(found.id, {
    key: pair.access_token,
    refresh_token: pair.refresh_token,
    rotated_at: new Date().toISOString(),
  });
  invalidateCache(found.key);
  invalidateCache(rt);

  return {
    access_token: pair.access_token,
    refresh_token: pair.refresh_token,
    token_type: 'Bearer',
    expires_in: null,
    key_id: updated.id,
    key_name: updated.name,
  };
}

function mapApiKeyRow(found) {
  return {
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
}

async function resolveApiKeyFromRequest(req) {
  const bearer = String(req.headers.authorization || '').trim();
  if (bearer.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim();
    if (token) {
      const found = await findKeyByValue(token);
      if (found) return { found, via: 'bearer' };
    }
  }

  const headerKey = req.headers['x-api-key'];
  if (headerKey) {
    const found = await findKeyByValue(String(headerKey).trim());
    if (found) return { found, via: 'x-api-key' };
  }

  const q = req.query;
  if (q && typeof q === 'object') {
    const single = q['x-api-key'] ?? q['X-Api-Key'] ?? q.api_key ?? q.apiKey ?? q.access_token;
    if (single != null && String(single).trim() !== '') {
      const found = await findKeyByValue(String(single).trim());
      if (found) return { found, via: 'query' };
    }
  }

  return null;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  buildTokenPair,
  attachTokensToKeyRecord,
  formatOneTimeTokenResponse,
  refreshAccessToken,
  mapApiKeyRow,
  resolveApiKeyFromRequest,
};
