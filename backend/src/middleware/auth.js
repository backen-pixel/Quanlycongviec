const jwt = require('jsonwebtoken');
const config = require('../config');
const { supabase } = require('../config/supabase');

const COMPANY_CACHE_MS = 60_000;
const _companyCache = new Map(); // userId -> { company_id, at }
const _regionCache = new Map(); // userId -> { crm_region_ids, at }

async function resolveCrmRegionIdsForUser(userId) {
  if (!userId) return [];
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

async function resolveCompanyIdForUser(userId) {
  if (!userId) return null;
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

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(h.slice(7), config.jwtSecret);
    req.user = payload;
    // Một số route (push, preferences) dùng userId; token cũ có thể chỉ có id
    if (req.user.userId == null && req.user.id != null) req.user.userId = req.user.id;
    if (req.user.id == null && req.user.userId != null) req.user.id = req.user.userId;
    const uid = req.user.userId;
    const needCompany = req.user.company_id == null;
    const needRegions = !Array.isArray(req.user.crm_region_ids);
    if (needCompany || needRegions) {
      Promise.resolve()
        .then(async () => {
          if (needCompany) {
            const cid = await resolveCompanyIdForUser(uid);
            if (cid) req.user.company_id = cid;
          }
          if (needRegions) {
            req.user.crm_region_ids = await resolveCrmRegionIdsForUser(uid);
          }
        })
        .then(() => next())
        .catch(() => next());
      return;
    }
    next();
  } catch { res.status(401).json({ error: 'Token hết hạn' }); }
}

module.exports = { auth };
