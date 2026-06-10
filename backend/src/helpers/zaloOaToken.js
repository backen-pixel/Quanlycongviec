/**
 * Zalo OA OAuth — refresh access_token (25h) bằng refresh_token (3 tháng, dùng 1 lần → token mới).
 */
const { supabase } = require('../config/supabase');

const ZALO_OAUTH_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const DEFAULT_ACCESS_TTL_SEC = 25 * 3600;
const DEFAULT_REFRESH_TTL_MS = 90 * 24 * 3600 * 1000;
const REFRESH_BEFORE_MS = 3 * 3600 * 1000;
const STALE_ACCESS_MS = 20 * 3600 * 1000;

const TOKEN_EXPIRED_ERRORS = new Set([-124, 3, -216, -220]);

const _refreshTails = new Map();
let _cacheInvalidator = null;

function registerOaConfigCacheInvalidator(fn) {
  _cacheInvalidator = typeof fn === 'function' ? fn : null;
}

function invalidateOaConfigCache(oaId) {
  try {
    _cacheInvalidator?.(oaId);
  } catch (_) { /* ignore */ }
}

function withRefreshLock(key, fn) {
  const prev = _refreshTails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const run = prev.catch(() => {}).then(() => fn()).finally(() => release());
  _refreshTails.set(key, gate);
  return run.finally(() => {
    if (_refreshTails.get(key) === gate) _refreshTails.delete(key);
  });
}

function isZaloTokenExpiredError(code) {
  if (code == null || code === '') return false;
  return TOKEN_EXPIRED_ERRORS.has(Number(code));
}

function computeAccessTokenExpiresAt(expiresInSec) {
  const sec = Number(expiresInSec);
  const ttlMs = Number.isFinite(sec) && sec > 0 ? sec * 1000 : DEFAULT_ACCESS_TTL_SEC * 1000;
  return new Date(Date.now() + ttlMs).toISOString();
}

function computeRefreshTokenExpiresAt(fromMs = Date.now()) {
  return new Date(fromMs + DEFAULT_REFRESH_TTL_MS).toISOString();
}

function shouldProactivelyRefresh(oaRow) {
  if (!oaRow?.refresh_token || !oaRow?.app_id || !oaRow?.secret_key) return false;
  const now = Date.now();
  if (oaRow.access_token_expires_at) {
    const exp = new Date(oaRow.access_token_expires_at).getTime();
    if (exp - now <= REFRESH_BEFORE_MS) return true;
  }
  const refAt = oaRow.token_refreshed_at ? new Date(oaRow.token_refreshed_at).getTime() : 0;
  const updatedAt = oaRow.updated_at ? new Date(oaRow.updated_at).getTime() : 0;
  const base = refAt || updatedAt;
  if (!base) return true;
  return now - base >= STALE_ACCESS_MS;
}

async function loadOaAccountById(accountId) {
  const { data, error } = await supabase.from('zalo_oa_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadOaAccountByOaId(oaId) {
  const { data, error } = await supabase.from('zalo_oa_accounts')
    .select('*')
    .eq('oa_id', String(oaId))
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function refreshZaloOaTokens(oaRow, { reason = 'manual' } = {}) {
  if (!oaRow?.id) return { ok: false, error: 'missing_account' };
  return withRefreshLock(`zalo-oa-token:${oaRow.id}`, async () => {
    const fresh = await loadOaAccountById(oaRow.id);
    if (!fresh) return { ok: false, error: 'account_not_found' };
    if (!fresh.refresh_token) {
      return { ok: false, error: 'missing_refresh_token', message: 'Chưa cấu hình refresh_token' };
    }
    if (!fresh.app_id || !fresh.secret_key) {
      return { ok: false, error: 'missing_app_credentials', message: 'Cần App ID và Secret Key để refresh token' };
    }

    let res;
    try {
      res = await fetch(ZALO_OAUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: String(fresh.secret_key).trim(),
        },
        body: new URLSearchParams({
          app_id: String(fresh.app_id).trim(),
          grant_type: 'refresh_token',
          refresh_token: String(fresh.refresh_token).trim(),
        }),
      });
    } catch (e) {
      const msg = e.message || 'network_error';
      await supabase.from('zalo_oa_accounts').update({
        last_token_error: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', fresh.id);
      return { ok: false, error: 'network', message: msg };
    }

    let data;
    try {
      data = await res.json();
    } catch {
      const msg = `HTTP ${res.status}: không đọc được JSON`;
      await supabase.from('zalo_oa_accounts').update({
        last_token_error: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', fresh.id);
      return { ok: false, error: 'parse', message: msg };
    }

    if (data?.error != null && Number(data.error) !== 0) {
      const msg = data?.error_name || data?.message || `Zalo error ${data.error}`;
      await supabase.from('zalo_oa_accounts').update({
        last_token_error: String(msg).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', fresh.id);
      console.warn(`[Zalo OA] refresh token failed (${reason}):`, msg);
      return { ok: false, error: 'zalo_oauth', zalo_error: data.error, message: msg };
    }

    const accessToken = data?.access_token;
    const refreshToken = data?.refresh_token;
    if (!accessToken || !refreshToken) {
      const msg = 'Zalo không trả access_token hoặc refresh_token mới';
      await supabase.from('zalo_oa_accounts').update({
        last_token_error: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', fresh.id);
      return { ok: false, error: 'incomplete_response', message: msg };
    }

    const nowIso = new Date().toISOString();
    const accessExpiresAt = computeAccessTokenExpiresAt(data.expires_in);
    const refreshExpiresAt = computeRefreshTokenExpiresAt();

    const { data: updated, error: updErr } = await supabase.from('zalo_oa_accounts')
      .update({
        access_token: String(accessToken).trim(),
        refresh_token: String(refreshToken).trim(),
        access_token_expires_at: accessExpiresAt,
        refresh_token_expires_at: refreshExpiresAt,
        token_refreshed_at: nowIso,
        last_token_error: null,
        updated_at: nowIso,
      })
      .eq('id', fresh.id)
      .select('*')
      .single();

    if (updErr) {
      console.error('[Zalo OA] persist refreshed tokens:', updErr.message);
      return { ok: false, error: 'db', message: updErr.message };
    }

    invalidateOaConfigCache(updated.oa_id);
    console.log(`[Zalo OA] Token refreshed (${reason}) OA ${updated.oa_id}`);
    return {
      ok: true,
      oaConfig: updated,
      access_token_expires_at: accessExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
    };
  });
}

async function ensureZaloOaAccessToken(oaRowOrId, { forceRefresh = false } = {}) {
  let oaRow = oaRowOrId;
  if (!oaRow || typeof oaRow === 'string' || typeof oaRow === 'number') {
    oaRow = await loadOaAccountByOaId(oaRowOrId);
  }
  if (!oaRow?.id) return { ok: false, error: 'oa_not_found' };
  if (!oaRow.access_token && !oaRow.refresh_token) {
    return { ok: false, error: 'missing_tokens', message: 'OA chưa có access_token / refresh_token' };
  }

  const needRefresh = forceRefresh || shouldProactivelyRefresh(oaRow);
  if (needRefresh && oaRow.refresh_token) {
    const refreshed = await refreshZaloOaTokens(oaRow, { reason: forceRefresh ? 'forced' : 'proactive' });
    if (refreshed.ok) {
      return { ok: true, accessToken: refreshed.oaConfig.access_token, oaConfig: refreshed.oaConfig };
    }
    if (!oaRow.access_token) {
      return { ok: false, ...refreshed };
    }
    console.warn('[Zalo OA] refresh thất bại — dùng access_token cũ:', refreshed.message || refreshed.error);
  }

  if (!oaRow.access_token) {
    return { ok: false, error: 'missing_access_token' };
  }
  return { ok: true, accessToken: oaRow.access_token, oaConfig: oaRow };
}

async function refreshAllZaloOaTokensDue({ reason = 'cron' } = {}) {
  const { data: rows, error } = await supabase.from('zalo_oa_accounts')
    .select('id, oa_id, oa_name, app_id, secret_key, refresh_token, access_token, access_token_expires_at, token_refreshed_at, updated_at, is_active')
    .eq('is_active', true);
  if (error) throw error;

  const due = (rows || []).filter((r) => r.refresh_token && r.app_id && r.secret_key && shouldProactivelyRefresh(r));
  const results = [];
  for (const row of due) {
    try {
      const r = await refreshZaloOaTokens(row, { reason });
      results.push({ oa_id: row.oa_id, oa_name: row.oa_name, ...r });
    } catch (e) {
      results.push({ oa_id: row.oa_id, ok: false, error: e.message });
    }
  }
  return { total: due.length, refreshed: results.filter((r) => r.ok).length, results };
}

function attachZaloTokenMeta(row) {
  if (!row) return row;
  const now = Date.now();
  const accessExpMs = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : null;
  const refreshExpMs = row.refresh_token_expires_at ? new Date(row.refresh_token_expires_at).getTime() : null;
  return {
    ...row,
    has_refresh_token: !!row.refresh_token,
    access_token_expires_at: row.access_token_expires_at || null,
    refresh_token_expires_at: row.refresh_token_expires_at || null,
    token_refreshed_at: row.token_refreshed_at || null,
    access_token_expired: accessExpMs != null ? accessExpMs <= now : false,
    access_token_expiring_soon: accessExpMs != null ? accessExpMs - now <= REFRESH_BEFORE_MS : null,
    refresh_token_expired: refreshExpMs != null ? refreshExpMs <= now : false,
    needs_token_refresh: shouldProactivelyRefresh(row),
    last_token_error: row.last_token_error || null,
  };
}

module.exports = {
  registerOaConfigCacheInvalidator,
  invalidateOaConfigCache,
  isZaloTokenExpiredError,
  shouldProactivelyRefresh,
  refreshZaloOaTokens,
  ensureZaloOaAccessToken,
  refreshAllZaloOaTokensDue,
  attachZaloTokenMeta,
  computeAccessTokenExpiresAt,
  computeRefreshTokenExpiresAt,
};
