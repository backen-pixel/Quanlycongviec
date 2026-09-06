const jwt = require('jsonwebtoken');
const config = require('../config');
const { supabase } = require('../config/supabase');
const { assertTenantActive } = require('../helpers/tenantScope');
const { getTenantCompanyIds } = require('../helpers/tenantScope');
const { isFounderLocalReadOnly } = require('../config/runtimeProfile');
const { founderLocalPort } = require('../config/runtimeProfile');
const { advisoryConfigurationEnabled } = require('../config/founderLocalWriteScope');
const {
  FOUNDER_LOCAL_JWT_AUDIENCE,
  FOUNDER_LOCAL_JWT_PURPOSE,
  FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS,
} = require('../helpers/authSession');

const PUBLIC_REQUESTS = new Set([
  'GET /api/health',
  'HEAD /api/health',
  'GET /api/auth/google-config',
  'POST /api/auth/login',
]);
const SAFE_POST_REQUESTS = new Set([
  'POST /api/auth/logout',
  'POST /api/users/ping',
  'POST /api/devices/ping',
]);
const ADVISORY_CONFIGURATION_REQUESTS = new Set([
  'PUT /api/business-os/configuration',
  'POST /api/business-os/configuration/rollback',
]);
const FOUNDER_LOCAL_SCOPE_HEADER = 'X-Founder-Local-Company-Scope';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOUNDER_LOCAL_SCOPE_FREE_READS = new Set([
  'GET /api/auth/me',
  'HEAD /api/auth/me',
]);
// This is intentionally tiny. Service-role-backed legacy GET routes are not
// safe merely because their HTTP verb is GET; each source drill-down must be
// individually audited before it is added here.
const FOUNDER_LOCAL_APPROVED_SOURCE_READS = new Set([
  'GET /api/crm/web-dashboard-bootstrap',
]);

function requestPath(req) {
  const expressPath = String(req.path || '').trim();
  if (expressPath.startsWith('/')) return expressPath.toLowerCase();
  const raw = String(req.originalUrl || req.url || '').trim();
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname.toLowerCase();
  } catch {
    return '/__founder_local_invalid_request_target__';
  }
  return (raw.split('?')[0] || '/').toLowerCase();
}

function isLoopbackAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function founderLocalAllowedOrigins(env = process.env) {
  const port = founderLocalPort(env);
  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
}

function founderLocalHostBoundary(req, res, next, env = process.env) {
  if (!isFounderLocalReadOnly(env)) return next();
  const port = founderLocalPort(env);
  const host = String(req.headers?.host || '').trim().toLowerCase();
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(host)) {
    return res.status(403).json({
      error: 'Founder-local chỉ chấp nhận Host localhost đã định cấu hình.',
      code: 'FOUNDER_LOCAL_HOST_REQUIRED',
    });
  }
  const origin = String(req.headers?.origin || '').trim().toLowerCase();
  if (origin && !founderLocalAllowedOrigins(env).has(origin)) {
    return res.status(403).json({
      error: 'Founder-local từ chối Origin ngoài localhost.',
      code: 'FOUNDER_LOCAL_ORIGIN_REQUIRED',
    });
  }
  return next();
}

function requestPolicy(method, path, env = process.env) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const normalizedPath = String(path || '/').split('?')[0].toLowerCase();
  const key = `${normalizedMethod} ${normalizedPath}`;
  if (normalizedMethod === 'OPTIONS') return 'preflight';
  if (PUBLIC_REQUESTS.has(key)) return 'public_read_only';
  if (SAFE_POST_REQUESTS.has(key)) return 'authenticated_noop_or_logout';
  if (ADVISORY_CONFIGURATION_REQUESTS.has(key)) {
    return advisoryConfigurationEnabled(env) ? 'advisory_configuration' : 'blocked_write';
  }
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') return 'authenticated_read';
  return 'blocked_write';
}

function isFounderLocalControlPlanePath(path) {
  const normalizedPath = String(path || '/').split('?')[0].toLowerCase();
  return normalizedPath === '/api/business-os'
    || normalizedPath.startsWith('/api/business-os/');
}

function founderLocalSourceReadApproved(method, path) {
  const key = `${String(method || 'GET').toUpperCase()} ${String(path || '/').split('?')[0].toLowerCase()}`;
  return FOUNDER_LOCAL_APPROVED_SOURCE_READS.has(key);
}

function founderLocalScopeFreeRead(method, path) {
  const key = `${String(method || 'GET').toUpperCase()} ${String(path || '/').split('?')[0].toLowerCase()}`;
  return FOUNDER_LOCAL_SCOPE_FREE_READS.has(key);
}

function parseFounderLocalCompanyScope(req) {
  const raw = req.headers?.['x-founder-local-company-scope'];
  if (Array.isArray(raw) || typeof raw !== 'string' || raw.includes(',')) {
    const error = new Error('Thiếu phạm vi công ty Founder-local đã được xác minh.');
    error.status = 400;
    error.code = 'FOUNDER_LOCAL_SCOPE_REQUIRED';
    throw error;
  }
  const scope = raw.trim().toLowerCase();
  if (scope !== 'all' && !UUID_RE.test(scope)) {
    const error = new Error('Phạm vi công ty Founder-local không hợp lệ.');
    error.status = 400;
    error.code = 'FOUNDER_LOCAL_SCOPE_INVALID';
    throw error;
  }
  return scope;
}

function assertFounderLocalCompanyScopeForUser(user, scope) {
  const verifiedCompanyId = String(user?.company_id || '').trim().toLowerCase();
  if (!verifiedCompanyId) return null;
  if (!UUID_RE.test(verifiedCompanyId) || scope !== verifiedCompanyId) {
    const error = new Error('Phạm vi công ty Founder-local không khớp tài khoản đã xác minh.');
    error.status = 403;
    error.code = 'FOUNDER_LOCAL_SCOPE_DENIED';
    throw error;
  }
  return verifiedCompanyId;
}

async function attestFounderLocalCompanyScope(req, user, {
  tenantCompanyIds = getTenantCompanyIds,
} = {}) {
  const scope = parseFounderLocalCompanyScope(req);
  const tenantId = String(user?.tenant_id || '').trim();
  if (!tenantId) {
    const error = new Error('Không xác minh được hệ sinh thái cho phạm vi Founder-local.');
    error.status = 403;
    error.code = 'FOUNDER_LOCAL_TENANT_REQUIRED';
    throw error;
  }
  // A company-bound admin is never allowed to widen or switch the requested
  // company, even when that other company belongs to the same tenant.
  assertFounderLocalCompanyScopeForUser(user, scope);
  if (scope !== 'all') {
    const allowed = await tenantCompanyIds(tenantId);
    const matchedCompanyId = allowed.find((value) => String(value).toLowerCase() === scope);
    if (!matchedCompanyId) {
      const error = new Error('Công ty Founder-local không thuộc hệ sinh thái đã xác minh.');
      error.status = 403;
      error.code = 'FOUNDER_LOCAL_SCOPE_DENIED';
      throw error;
    }
    const requestedCompany = req.query?.company_id;
    if (Array.isArray(requestedCompany)
      || typeof requestedCompany !== 'string'
      || requestedCompany.trim().toLowerCase() !== scope) {
      const error = new Error('Query công ty không khớp phạm vi Founder-local đã xác minh.');
      error.status = 400;
      error.code = 'FOUNDER_LOCAL_SCOPE_QUERY_MISMATCH';
      throw error;
    }
  }
  req.founderLocalScope = {
    key: scope,
    companyId: scope === 'all' ? null : scope,
    tenantId,
    verified: true,
  };
  return req.founderLocalScope;
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function founderLocalTokenPolicyError() {
  const error = new Error('Phiên Founder-local không có phạm vi hoặc thời hạn hợp lệ.');
  error.code = 'FOUNDER_LOCAL_TOKEN_POLICY_INVALID';
  return error;
}

function verifyFounderLocalAccessToken(token, {
  secret = config.jwtSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  let payload;
  try {
    payload = jwt.verify(token, secret, { audience: FOUNDER_LOCAL_JWT_AUDIENCE });
  } catch {
    throw founderLocalTokenPolicyError();
  }
  const issuedAt = payload?.iat;
  const expiresAt = payload?.exp;
  const ttl = expiresAt - issuedAt;
  const valid = payload?.aud === FOUNDER_LOCAL_JWT_AUDIENCE
    && payload?.session_purpose === FOUNDER_LOCAL_JWT_PURPOSE
    && Number.isSafeInteger(issuedAt)
    && issuedAt > 0
    && issuedAt <= nowSeconds + 30
    && Number.isSafeInteger(expiresAt)
    && expiresAt > nowSeconds
    && Number.isSafeInteger(ttl)
    && ttl > 0
    && ttl <= FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS;
  if (!valid) throw founderLocalTokenPolicyError();
  return payload;
}

async function loadVerifiedFounderAdmin(req, {
  verifyToken = verifyFounderLocalAccessToken,
  client = supabase,
  assertActiveTenant = assertTenantActive,
} = {}) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error('Chưa đăng nhập Founder-local.');
    error.status = 401;
    error.code = 'FOUNDER_LOCAL_AUTH_REQUIRED';
    throw error;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    const error = new Error('Phiên Founder-local không hợp lệ.');
    error.status = 401;
    error.code = 'FOUNDER_LOCAL_TOKEN_INVALID';
    throw error;
  }
  if (String(payload?.role || '').trim().toLowerCase() !== 'admin') {
    const error = new Error('Founder-local chỉ cho phép tài khoản admin.');
    error.status = 403;
    error.code = 'FOUNDER_LOCAL_ADMIN_REQUIRED';
    throw error;
  }

  const userId = String(payload.userId || payload.id || '').trim();
  if (!userId) {
    const error = new Error('Token Founder-local thiếu user id.');
    error.status = 401;
    error.code = 'FOUNDER_LOCAL_TOKEN_INVALID';
    throw error;
  }
  const { data: user, error: readError } = await client
    .from('users')
    .select('id,email,full_name,role,company_id,tenant_id,department_id,is_active')
    .eq('id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!user || user.is_active === false) {
    const error = new Error('Tài khoản Founder-local không còn hoạt động.');
    error.status = 401;
    error.code = 'FOUNDER_LOCAL_USER_INACTIVE';
    throw error;
  }
  if (String(user.role || '').trim().toLowerCase() !== 'admin') {
    const error = new Error('Founder-local chỉ cho phép tài khoản admin.');
    error.status = 403;
    error.code = 'FOUNDER_LOCAL_ADMIN_REQUIRED';
    throw error;
  }
  if (!user.tenant_id) {
    const error = new Error('Tài khoản Founder-local phải thuộc một hệ sinh thái cụ thể.');
    error.status = 403;
    error.code = 'FOUNDER_LOCAL_TENANT_REQUIRED';
    throw error;
  }
  if (payload.tenant_id && String(payload.tenant_id) !== String(user.tenant_id)) {
    const error = new Error('Phạm vi hệ sinh thái trong token đã thay đổi; vui lòng đăng nhập lại.');
    error.status = 401;
    error.code = 'FOUNDER_LOCAL_SCOPE_CHANGED';
    throw error;
  }
  if (payload.company_id && String(payload.company_id) !== String(user.company_id || '')) {
    const error = new Error('Phạm vi công ty trong token đã thay đổi; vui lòng đăng nhập lại.');
    error.status = 401;
    error.code = 'FOUNDER_LOCAL_SCOPE_CHANGED';
    throw error;
  }

  const tenant = await assertActiveTenant(user.tenant_id);
  if (!tenant?.ok) {
    const error = new Error(tenant?.error || 'Hệ sinh thái không hoạt động.');
    error.status = 403;
    error.code = tenant?.code || 'FOUNDER_LOCAL_TENANT_INACTIVE';
    throw error;
  }
  return { payload, user };
}

function sendNoWriteHeartbeat(res) {
  return res.json({
    ok: true,
    read_only: true,
    runtime_profile: 'founder-local-read-only',
    ping: { persisted: false, last_ping_at: null },
  });
}

async function applyFounderLocalReadOnlyMiddleware(req, res, next, {
  runtimeEnabled = isFounderLocalReadOnly,
  loadVerifiedAdmin = loadVerifiedFounderAdmin,
  attestCompanyScope = attestFounderLocalCompanyScope,
} = {}) {
  if (!runtimeEnabled()) return next();
  const path = requestPath(req);
  if (!path.startsWith('/api')) return next();

  res.set('Cache-Control', 'no-store');
  res.set('X-Founder-Local-Profile', 'founder-local-read-only');
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    return res.status(403).json({
      error: 'Founder-local chỉ chấp nhận kết nối loopback.',
      code: 'FOUNDER_LOCAL_LOOPBACK_REQUIRED',
    });
  }

  const policy = requestPolicy(req.method, path);
  if (policy === 'preflight' || policy === 'public_read_only') return next();
  if (policy === 'blocked_write') {
    return res.status(405).json({
      error: 'Founder-local đang ở chế độ chỉ đọc; thao tác ghi đã bị chặn.',
      code: 'FOUNDER_LOCAL_WRITE_BLOCKED',
    });
  }

  const sourceRead = policy === 'authenticated_read'
    && !isFounderLocalControlPlanePath(path)
    && !founderLocalScopeFreeRead(req.method, path);
  if (sourceRead && !founderLocalSourceReadApproved(req.method, path)) {
    return res.status(403).json({
      error: 'Founder-local chưa phê duyệt đường đọc nguồn này.',
      code: 'FOUNDER_LOCAL_READ_ROUTE_NOT_APPROVED',
    });
  }

  try {
    const verified = await loadVerifiedAdmin(req);
    req.founderLocalVerifiedUser = verified.user;
    if (sourceRead) {
      const scope = await attestCompanyScope(req, verified.user);
      if (scope.key === 'all') {
        return res.status(400).json({
          error: 'Drill-down Founder-local yêu cầu chọn một công ty đã xác minh.',
          code: 'FOUNDER_LOCAL_EXACT_COMPANY_SCOPE_REQUIRED',
        });
      }
      res.set(FOUNDER_LOCAL_SCOPE_HEADER, scope.key);
    }
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.status ? error.message : 'Không xác minh được quyền Founder-local.',
      code: error.code || 'FOUNDER_LOCAL_AUTH_CHECK_FAILED',
    });
  }

  if (req.method === 'GET' && path === '/api/heartbeat') return sendNoWriteHeartbeat(res);
  if (req.method === 'POST' && (path === '/api/users/ping' || path === '/api/devices/ping')) {
    return sendNoWriteHeartbeat(res);
  }
  return next();
}

function founderLocalReadOnlyMiddleware(req, res, next) {
  return applyFounderLocalReadOnlyMiddleware(req, res, next);
}

function createFounderLocalReadOnlyMiddleware(dependencies = {}) {
  return (req, res, next) => applyFounderLocalReadOnlyMiddleware(req, res, next, dependencies);
}

module.exports = {
  ADVISORY_CONFIGURATION_REQUESTS,
  PUBLIC_REQUESTS,
  SAFE_POST_REQUESTS,
  assertFounderLocalCompanyScopeForUser,
  bearerToken,
  createFounderLocalReadOnlyMiddleware,
  founderLocalAllowedOrigins,
  founderLocalScopeFreeRead,
  founderLocalSourceReadApproved,
  founderLocalHostBoundary,
  founderLocalReadOnlyMiddleware,
  isFounderLocalControlPlanePath,
  isLoopbackAddress,
  loadVerifiedFounderAdmin,
  parseFounderLocalCompanyScope,
  attestFounderLocalCompanyScope,
  requestPath,
  requestPolicy,
  sendNoWriteHeartbeat,
  verifyFounderLocalAccessToken,
};
