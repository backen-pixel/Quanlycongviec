const jwt = require('jsonwebtoken');
const config = require('../config');
const { supabase } = require('../config/supabase');
const { logAuthEvent } = require('../helpers/authEventLog');
const { attachTenantContext, guardTenantCompanyParams } = require('./tenantGate');

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Mốc 00:00 VN HÔM NAY (ms). Token có iat < mốc này → coi như hết hạn. */
function midnightVnTodayMs() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const todayVn = fmt.format(new Date());
  return new Date(`${todayVn}T00:00:00+07:00`).getTime();
}

/** Kiểm token có "qua đêm" chưa. Chỉ bật khi env AUTO_LOGOUT_AT_MIDNIGHT=1. */
function isStaleAcrossMidnight(payload) {
  if (process.env.AUTO_LOGOUT_AT_MIDNIGHT !== '1') return false;
  if (payload?.role === 'system') return false;
  const iatMs = payload?.iat ? payload.iat * 1000 : 0;
  if (!iatMs) return true;
  return iatMs < midnightVnTodayMs();
}

const COMPANY_CACHE_MS = 60_000;
const _companyCache = new Map(); // userId -> { company_id, at }
const _regionCache = new Map(); // userId -> { crm_region_ids, at }
const _tenantCache = new Map(); // userId -> { tenant_id, at }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(v) {
  return UUID_RE.test(String(v || '').trim());
}

async function resolveCrmRegionIdsForUser(userId) {
  if (!userId || !isUuidLike(userId)) return [];
  const key = String(userId);
  const hit = _regionCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < COMPANY_CACHE_MS) return hit.crm_region_ids || [];
  try {
    const { data: ur } = await supabase
      .from('user_company_regions')
      .select('region_id')
      .eq('user_id', userId);
    const crm_region_ids = (ur || []).map((r) => r.region_id).filter(Boolean);
    _regionCache.set(key, { crm_region_ids, at: now });
    return crm_region_ids;
  } catch {
    _regionCache.set(key, { crm_region_ids: [], at: now });
    return [];
  }
}

async function resolveTenantIdForUser(userId) {
  if (!userId || !isUuidLike(userId)) return null;
  const key = String(userId);
  const hit = _tenantCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < COMPANY_CACHE_MS) return hit.tenant_id || null;
  try {
    const { data: u } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle();
    const tenant_id = u?.tenant_id || null;
    _tenantCache.set(key, { tenant_id, at: now });
    return tenant_id;
  } catch {
    _tenantCache.set(key, { tenant_id: null, at: now });
    return null;
  }
}

async function resolveCompanyIdForUser(userId) {
  if (!userId || !isUuidLike(userId)) return null;
  const key = String(userId);
  const hit = _companyCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < COMPANY_CACHE_MS) return hit.company_id || null;
  try {
    const { data: u } = await supabase
      .from('users')
      .select('company_id, department_id')
      .eq('id', userId)
      .maybeSingle();
    let company_id = u?.company_id || null;
    if (!company_id && u?.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('company_id')
        .eq('id', u.department_id)
        .maybeSingle();
      company_id = dept?.company_id || null;
    }
    _companyCache.set(key, { company_id, at: now });
    return company_id;
  } catch {
    _companyCache.set(key, { company_id: null, at: now });
    return null;
  }
}

function completeAuth(req, res, next) {
  attachTenantContext(req)
    .then(() => guardTenantCompanyParams(req, res, next))
    .catch((err) => {
      if (err?.statusCode === 403) {
        return res.status(403).json({ error: err.message, code: err.code || 'tenant_inactive' });
      }
      return next(err);
    });
}

function auth(req, res, next) {
  let h = req.headers.authorization;
  if ((!h || !h.startsWith('Bearer ')) && req.query?.bearer) {
    h = `Bearer ${String(req.query.bearer).trim()}`;
  }
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(h.slice(7), config.jwtSecret);
    if (isStaleAcrossMidnight(payload)) {
      void logAuthEvent({
        event: 'auto_logout_midnight',
        user_id: payload.userId || payload.id || null,
        email: payload.email || null,
        reason: 'session_expired_midnight',
        req,
      });
      return res.status(401).json({ error: 'Phiên đăng nhập đã qua đêm — vui lòng đăng nhập lại', code: 'session_expired_midnight' });
    }
    req.user = payload;
    // Một số route (push, preferences) dùng userId; token cũ có thể chỉ có id
    if (req.user.userId == null && req.user.id != null) req.user.userId = req.user.id;
    if (req.user.id == null && req.user.userId != null) req.user.id = req.user.userId;
    const uid = req.user.userId;
    const isSystemToken = req.user.role === 'system';
    const needCompany = req.user.company_id == null;
    const needRegions = !Array.isArray(req.user.crm_region_ids);
    const needTenant = req.user.tenant_id == null && req.user.role !== 'platform_admin';
    if (isSystemToken) {
      if (needRegions) req.user.crm_region_ids = [];
      completeAuth(req, res, next);
      return;
    }
    if (needCompany || needRegions || needTenant) {
      if (!isUuidLike(uid)) {
        if (needRegions) req.user.crm_region_ids = [];
        completeAuth(req, res, next);
        return;
      }
      Promise.resolve()
        .then(async () => {
          if (needCompany) {
            const cid = await resolveCompanyIdForUser(uid);
            if (cid) req.user.company_id = cid;
          }
          if (needRegions) {
            req.user.crm_region_ids = await resolveCrmRegionIdsForUser(uid);
          }
          if (needTenant) {
            const tid = await resolveTenantIdForUser(uid);
            if (tid) req.user.tenant_id = tid;
          }
        })
        .then(() => completeAuth(req, res, next))
        .catch(() => completeAuth(req, res, next));
      return;
    }
    completeAuth(req, res, next);
  } catch {
    let partial = null;
    try {
      partial = jwt.decode(h.slice(7));
    } catch (_) {}
    void logAuthEvent({
      event: 'token_invalid',
      user_id: partial?.userId || partial?.id || null,
      email: partial?.email || null,
      reason: 'jwt_verify_failed',
      req,
    });
    res.status(401).json({ error: 'Token hết hạn' });
  }
}

/** Cho `<img src>` — JWT từ query `access_token` khi không có Authorization header. */
function authWithQueryToken(req, res, next) {
  if (!req.headers.authorization && req.query?.access_token) {
    const t = String(req.query.access_token).trim();
    if (t) req.headers.authorization = `Bearer ${t}`;
  }
  return auth(req, res, next);
}

module.exports = {
  auth,
  authWithQueryToken,
  midnightVnTodayMs,
  isStaleAcrossMidnight,
  isUuidLike,
  resolveCompanyIdForUser,
};
