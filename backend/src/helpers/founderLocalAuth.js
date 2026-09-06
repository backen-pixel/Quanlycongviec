const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { assertTenantActive } = require('./tenantScope');
const {
  FOUNDER_LOCAL_JWT_AUDIENCE,
  FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS,
  buildAuthSessionForUser,
} = require('./authSession');

const FOUNDER_LOCAL_SESSION_TTL_SECONDS = FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS;

function founderLoginError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Password login for the localhost Founder Cockpit.
 *
 * This deliberately has no auth audit, last_login_at, or lockout mutation.
 * It verifies the same stored password, issues the standard JWT payload, and
 * accepts only an active tenant-bound admin account.
 */
async function authenticateFounderLocalPassword(body, {
  client = supabase,
  comparePassword = bcrypt.compare,
  assertActiveTenant = assertTenantActive,
  buildSession = buildAuthSessionForUser,
} = {}) {
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '');
  const clientSessionId = body?.session_id
    ? String(body.session_id).slice(0, 80)
    : null;
  if (!email || !password) {
    throw founderLoginError(400, 'FOUNDER_LOCAL_CREDENTIALS_REQUIRED', 'Thiếu email/mật khẩu');
  }

  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('email', email)
    .neq('is_active', false)
    .limit(1);
  if (error) throw error;
  const user = data?.[0] || null;
  if (!user || !user.password || !(await comparePassword(password, user.password))) {
    throw founderLoginError(401, 'FOUNDER_LOCAL_LOGIN_FAILED', 'Sai email hoặc mật khẩu');
  }
  if (String(user.role || '').trim().toLowerCase() !== 'admin') {
    throw founderLoginError(403, 'FOUNDER_LOCAL_ADMIN_REQUIRED', 'Founder-local chỉ cho phép tài khoản admin.');
  }
  if (!user.tenant_id) {
    throw founderLoginError(403, 'FOUNDER_LOCAL_TENANT_REQUIRED', 'Tài khoản admin chưa thuộc tenant hoạt động.');
  }
  const tenant = await assertActiveTenant(user.tenant_id);
  if (!tenant?.ok) {
    throw founderLoginError(403, 'FOUNDER_LOCAL_TENANT_INACTIVE', tenant?.error || 'Tenant không hoạt động.');
  }

  const sessionId = clientSessionId
    || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const session = await buildSession(user, {
    sessionId,
    expiresInSeconds: FOUNDER_LOCAL_SESSION_TTL_SECONDS,
    audience: FOUNDER_LOCAL_JWT_AUDIENCE,
  });
  return {
    ...session,
    read_only: true,
    runtime_profile: 'founder-local-read-only',
    session_expires_in_seconds: FOUNDER_LOCAL_SESSION_TTL_SECONDS,
  };
}

async function handleFounderLocalPasswordLogin(req, res) {
  try {
    return res.json(await authenticateFounderLocalPassword(req.body));
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error('[founder-local/auth] read-only login failed:', error?.code || error?.name || 'Error');
    return res.status(503).json({
      error: 'Không xác minh được tài khoản Founder-local.',
      code: 'FOUNDER_LOCAL_LOGIN_UNAVAILABLE',
    });
  }
}

module.exports = {
  FOUNDER_LOCAL_SESSION_TTL_SECONDS,
  authenticateFounderLocalPassword,
  founderLoginError,
  handleFounderLocalPasswordLogin,
};
