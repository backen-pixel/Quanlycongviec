const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const config = require('../config');

const FOUNDER_LOCAL_JWT_AUDIENCE = 'founder-local-read-only';
const FOUNDER_LOCAL_JWT_PURPOSE = 'founder-local-read-only';
const FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS = 60 * 60;

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
    tenant_id: user.tenant_id || null,
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
  const expiresInSeconds = opts.expiresInSeconds;
  if (expiresInSeconds !== undefined
    && (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 86_400)) {
    const error = new Error('Thời hạn phiên đăng nhập phải từ 60 giây đến 24 giờ.');
    error.code = 'AUTH_SESSION_TTL_INVALID';
    throw error;
  }
  const audience = opts.audience;
  if (audience !== undefined && audience !== FOUNDER_LOCAL_JWT_AUDIENCE) {
    const error = new Error('Audience phiên đăng nhập không được hỗ trợ.');
    error.code = 'AUTH_SESSION_AUDIENCE_INVALID';
    throw error;
  }
  const founderLocalSession = audience === FOUNDER_LOCAL_JWT_AUDIENCE;
  if (founderLocalSession
    && (!Number.isSafeInteger(expiresInSeconds)
      || expiresInSeconds > FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS)) {
    const error = new Error('Phiên Founder-local phải có hạn tối đa một giờ.');
    error.code = 'FOUNDER_LOCAL_SESSION_TTL_INVALID';
    throw error;
  }
  const company_id = await resolveCompanyId(user);
  const crm_region_ids = await resolveCrmRegionIds(user.id);
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    company_id,
    tenant_id: user.tenant_id || null,
    department_id: user.department_id || null,
    crm_region_ids,
    ...(founderLocalSession ? { session_purpose: FOUNDER_LOCAL_JWT_PURPOSE } : {}),
  };
  const signOptions = {};
  if (expiresInSeconds !== undefined) signOptions.expiresIn = expiresInSeconds;
  if (founderLocalSession) signOptions.audience = FOUNDER_LOCAL_JWT_AUDIENCE;
  const token = jwt.sign(payload, config.jwtSecret, signOptions);
  return {
    token,
    session_id: sessionId,
    user: formatUserPayload(user, company_id, crm_region_ids),
  };
}

module.exports = {
  FOUNDER_LOCAL_JWT_AUDIENCE,
  FOUNDER_LOCAL_JWT_PURPOSE,
  FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS,
  buildAuthSessionForUser,
  formatUserPayload,
  resolveCompanyId,
  resolveCrmRegionIds,
};
