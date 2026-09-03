const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_IMAGES = 24;
const EXPIRE_DAYS = 30;
const TITLE_MAX = 80;
const EXPIRE_PRESET_HOURS = {
  '1h': 1,
  '6h': 6,
  '1d': 24,
  '7d': 168,
  '30d': 24 * 30,
};
const MAX_EXPIRE_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function newShareToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function isValidShareToken(token) {
  return TOKEN_RE.test(String(token || ''));
}

function toLocalUploadPath(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const strip = s.split('?')[0].split('#')[0];
  if (strip.startsWith('/uploads/lead-chat/') || strip.startsWith('/uploads/messenger-chat/')) {
    if (strip.includes('..')) return null;
    return strip;
  }
  try {
    const u = new URL(s);
    const p = u.pathname;
    if (p.startsWith('/uploads/lead-chat/') || p.startsWith('/uploads/messenger-chat/')) {
      if (p.includes('..')) return null;
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isAllowedShareImageUrl(url) {
  const s = String(url || '').trim();
  if (!s || s.length > 4000) return false;
  if (/^(data:|blob:|javascript:|file:)/i.test(s)) return false;
  if (toLocalUploadPath(s)) return true;
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}

function looksLikeImage(name, mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(String(name || ''));
}

function sanitizeShareImages(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const a of arr) {
    if (out.length >= MAX_IMAGES) break;
    if (!a || typeof a !== 'object') continue;
    const url = String(a.url || a.file_url || '').trim();
    if (!isAllowedShareImageUrl(url) || seen.has(url)) continue;
    const name = String(a.name != null ? a.name : (a.file_name != null ? a.file_name : 'anh')).slice(0, 200);
    const mime = String(a.mime != null ? a.mime : (a.type != null ? a.type : (a.mime_type != null ? a.mime_type : ''))).slice(0, 120);
    if (!looksLikeImage(name, mime) && !/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(url.split('?')[0])) {
      continue;
    }
    seen.add(url);
    out.push({ url: url.slice(0, 4000), name: name || 'anh', mime: mime || 'image/jpeg' });
  }
  return out;
}

function sanitizeShareTitle(raw, imageCount) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
  if (t) return t;
  const n = Number(imageCount) || 0;
  return n > 1 ? `Ảnh chia sẻ (${n} ảnh)` : 'Ảnh chia sẻ';
}

function resolveExpiresAtFromBody(body, { required = false } = {}) {
  const rawPreset = body?.expire_preset != null ? body.expire_preset : body?.expirePreset;
  const preset = String(rawPreset || '').trim();
  const unlimited = body?.unlimited === true || preset === 'unlimited' || preset === 'never';
  if (unlimited) return { expiresAt: null };

  const customRaw = body?.expires_at || body?.expiresAt;
  if (preset === 'custom' || (customRaw && !preset)) {
    const d = new Date(customRaw);
    if (!Number.isFinite(d.getTime())) {
      const err = new Error('Thời điểm hết hạn không hợp lệ');
      err.status = 400;
      throw err;
    }
    if (d.getTime() < Date.now() + 30_000) {
      const err = new Error('Thời điểm hết hạn phải ở tương lai');
      err.status = 400;
      throw err;
    }
    if (d.getTime() - Date.now() > MAX_EXPIRE_MS) {
      const err = new Error('Hạn xem tối đa 5 năm');
      err.status = 400;
      throw err;
    }
    return { expiresAt: d.toISOString() };
  }

  let hours = EXPIRE_PRESET_HOURS[preset];
  if (hours == null) {
    const n = Number(body?.expire_hours != null ? body.expire_hours : body?.expireHours);
    if (Number.isFinite(n) && n > 0) hours = n;
  }
  if (hours == null) {
    if (required) return { expiresAt: new Date(Date.now() + EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString() };
    return { skip: true };
  }
  if (hours > 24 * 365 * 5) {
    const err = new Error('Hạn xem tối đa 5 năm');
    err.status = 400;
    throw err;
  }
  return { expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() };
}

async function loadShareByToken(token) {
  const t = String(token || '').trim();
  if (!isValidShareToken(t)) return { error: 'not_found' };
  const { data, error } = await supabase
    .from('public_share_links')
    .select('id, token, kind, title, payload, expires_at, revoked_at, view_count, created_by, company_id')
    .eq('token', t)
    .maybeSingle();
  if (error) return { error: 'db', detail: error.message };
  if (!data) return { error: 'not_found' };
  return { row: data };
}

async function loadActiveShare(token) {
  const loaded = await loadShareByToken(token);
  if (loaded.error || !loaded.row) return loaded;
  if (loaded.row.revoked_at) return { error: 'revoked' };
  if (loaded.row.expires_at && new Date(loaded.row.expires_at).getTime() < Date.now()) {
    return { error: 'expired' };
  }
  return loaded;
}

function publicImageSrc(token, index, storedUrl) {
  if (toLocalUploadPath(storedUrl)) {
    return `/api/public/share/${encodeURIComponent(token)}/file/${index}`;
  }
  return storedUrl;
}

function bumpViewCount(id) {
  if (!id) return;
  void supabase.rpc('increment_public_share_view', { p_id: id }).then(({ error }) => {
    if (!error) return;
    void supabase.from('public_share_links').select('view_count').eq('id', id).maybeSingle()
      .then(({ data }) => {
        const next = (Number(data?.view_count) || 0) + 1;
        void supabase.from('public_share_links').update({ view_count: next }).eq('id', id);
      });
  });
}

module.exports = {
  TOKEN_RE,
  MAX_IMAGES,
  EXPIRE_DAYS,
  EXPIRE_PRESET_HOURS,
  newShareToken,
  isValidShareToken,
  toLocalUploadPath,
  isAllowedShareImageUrl,
  sanitizeShareImages,
  sanitizeShareTitle,
  resolveExpiresAtFromBody,
  loadShareByToken,
  loadActiveShare,
  publicImageSrc,
  bumpViewCount,
};
