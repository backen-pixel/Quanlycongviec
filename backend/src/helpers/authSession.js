const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const config = require('../config');

async function resolveCompanyId(user) {
  let company_id = user.company_id || null;
  if (!company_id && user.department_id) {
    try {
      const { data: dept } = await supabase.from('departments').select('company_id').eq('id', user.department_id).single();
      company_id = dept?.company_id || null;
    } catch { /* noop */ }
  }
  return company_id;
}

async function resolveCrmRegionIds(userId) {
  try {
    const { data: ur } = await supabase.from('user_company_regions').select('region_id').eq('user_id', userId);
    return (ur || []).map((r) => r.region_id).filter(Boolean);
  } catch {
    return [];
  }
}

function formatUserPayload(user, company_id, crm_region_ids) {
  return {
    id: user.id,
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    full_name: user.full_name,
    role: user.role,
    avatar: user.avatar,
    phone: user.phone,
    department_id: user.department_id || null,
    company_id,
    crm_region_ids,
    position: user.position || null,
  };
}

/**
 * Tạo JWT + payload user giống POST /auth/login (dùng cho QR login, v.v.).
 */
async function buildAuthSessionForUser(user, opts = {}) {
  const sessionId = opts.sessionId
    || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const company_id = await resolveCompanyId(user);
  const crm_region_ids = await resolveCrmRegionIds(user.id);
  const token = jwt.sign({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    company_id,
    department_id: user.department_id || null,
    crm_region_ids,
  }, config.jwtSecret);
  return {
    token,
    session_id: sessionId,
    user: formatUserPayload(user, company_id, crm_region_ids),
  };
}

module.exports = {
  buildAuthSessionForUser,
  formatUserPayload,
  resolveCompanyId,
  resolveCrmRegionIds,
};
