import { safeBusinessOsHref } from './businessOsContract.js';

export const FOUNDER_LOCAL_ROOT = '/business-os';
export const FOUNDER_LOCAL_LOGIN_PATH = '/business-os/login';
export const FOUNDER_LOCAL_READ_ONLY_CONTRACT = 'founder_local_read_only_v1';
export const FOUNDER_LOCAL_SESSION_KEY = 'founder_local_read_only_v1';
export const FOUNDER_LOCAL_COMPANY_SCOPE_KEY = 'founder_local_company_scope_v1';
export const FOUNDER_LOCAL_RUNTIME_PROFILE = 'founder-local-read-only';
export const FOUNDER_LOCAL_PROFILE_HEADER = 'x-founder-local-profile';
export const FOUNDER_LOCAL_SCOPE_HEADER = 'X-Founder-Local-Company-Scope';
export const FOUNDER_LOCAL_API_BASE_URL = '/api';

const SAFE_NOOP_POST_ENDPOINTS = new Set(['/auth/logout', '/users/ping', '/devices/ping']);
const SCOPE_FREE_ENDPOINTS = new Set([
  '/health',
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/auth/google-config',
  '/users/ping',
  '/devices/ping',
]);
const FOUNDER_LOCAL_APPROVED_SOURCE_READ = '/crm/web-dashboard-bootstrap';
const ADVISORY_WRITE_ENDPOINTS = new Map([
  ['/business-os/configuration', 'put'],
  ['/business-os/configuration/rollback', 'post'],
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOUNDER_LOCAL_BUILD = typeof __FOUNDER_LOCAL_BUILD__ !== 'undefined'
  ? __FOUNDER_LOCAL_BUILD__ === true
  : String(import.meta.env?.VITE_FOUNDER_LOCAL_READ_ONLY || '').trim() === '1';

// A URL or browser-storage value is user-controlled and therefore cannot
// authorize the restricted runtime. Only the dedicated Vite build may turn
// this profile on; the session marker is informational continuity only.
let founderLocalReadOnlyActive = FOUNDER_LOCAL_BUILD;

export class FounderLocalReadOnlyError extends Error {
  constructor(message = 'Founder-local read-only đã chặn yêu cầu ngoài phạm vi đọc được phê duyệt.') {
    super(message);
    this.name = 'FounderLocalReadOnlyError';
    this.code = 'FOUNDER_LOCAL_READ_ONLY_BLOCKED';
  }
}

export function isFounderLocalPathname(pathname) {
  const path = String(pathname || '').trim();
  return path === FOUNDER_LOCAL_ROOT || path.startsWith(`${FOUNDER_LOCAL_ROOT}/`);
}

/** The frozen Founder UI exposes only its control plane and one audited source screen. */
export function founderLocalUiPathAllowed(pathname) {
  const path = String(pathname || '').trim().replace(/\/+$/, '') || '/';
  return isFounderLocalPathname(path) || path === '/crm/dashboard';
}

function founderLocalStorage(storage) {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage || null; } catch { return null; }
}

export function normalizeFounderLocalCompanyScope(value) {
  const scope = String(value || '').trim().toLowerCase();
  if (scope === 'all') return scope;
  return UUID_RE.test(scope) ? scope : '';
}

function founderLocalAuthBinding(storage) {
  try {
    const token = String(storage?.getItem('token') || '').trim().replace(/^Bearer\s+/i, '');
    const user = JSON.parse(storage?.getItem('user') || 'null');
    const userId = String(user?.id || user?.userId || '').trim();
    const sessionId = String(storage?.getItem('session_id') || '').trim();
    if (!token || !userId) return '';

    // This is an identity-change detector, not a credential. A short stable
    // digest avoids duplicating the bearer token in the scope record.
    const input = `${userId}\u0000${sessionId}\u0000${token}`;
    let digest = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      digest ^= input.charCodeAt(index);
      digest = Math.imul(digest, 16777619);
    }
    return `v1:${userId}:${(digest >>> 0).toString(16).padStart(8, '0')}`;
  } catch {
    return '';
  }
}

/** Read only a scope previously committed by the verified Cockpit navigation. */
export function readFounderLocalCompanyScopeLock({ storage } = {}) {
  const targetStorage = founderLocalStorage(storage);
  try {
    const raw = targetStorage?.getItem(FOUNDER_LOCAL_COMPANY_SCOPE_KEY);
    const record = JSON.parse(raw || 'null');
    const scope = normalizeFounderLocalCompanyScope(record?.company_id);
    const binding = founderLocalAuthBinding(targetStorage);
    return scope && binding && record?.auth_binding === binding ? scope : '';
  } catch {
    return '';
  }
}

export function clearFounderLocalCompanyScopeLock({ storage } = {}) {
  const targetStorage = founderLocalStorage(storage);
  try { targetStorage?.removeItem(FOUNDER_LOCAL_COMPANY_SCOPE_KEY); } catch { /* already fail closed */ }
}

/** A source drill-down must carry exactly one explicit company scope. */
export function founderLocalCompanyScopeFromHref(value) {
  const href = safeBusinessOsHref(value);
  if (!href) return '';
  try {
    const parsed = new URL(href, 'https://founder-local.invalid');
    const values = parsed.searchParams.getAll('company_id');
    if (values.length !== 1) return '';
    return normalizeFounderLocalCompanyScope(values[0]);
  } catch {
    return '';
  }
}

/**
 * Commit only a server-attested drill-down already accepted by the verified
 * Business OS snapshot. Merely typing a company_id into a source URL can never
 * change this tab's lock.
 */
export function commitFounderLocalCompanyScopeFromVerifiedDrilldown(
  drilldown,
  { expectedCompanyScope, storage } = {},
) {
  const expected = normalizeFounderLocalCompanyScope(expectedCompanyScope);
  const href = safeFounderLocalDrilldownHref(drilldown, { expectedCompanyScope: expected });
  if (!expected || expected === 'all' || !href) {
    throw new FounderLocalReadOnlyError('Drill-down không mang phạm vi công ty đã được Cockpit xác minh.');
  }
  const targetStorage = founderLocalStorage(storage);
  if (!targetStorage || typeof targetStorage.setItem !== 'function') {
    throw new FounderLocalReadOnlyError('Không thể khóa phạm vi Founder-local trong tab hiện tại.');
  }
  try {
    const authBinding = founderLocalAuthBinding(targetStorage);
    if (!authBinding) throw new Error('auth_binding_missing');
    targetStorage.setItem(FOUNDER_LOCAL_COMPANY_SCOPE_KEY, JSON.stringify({
      company_id: expected,
      auth_binding: authBinding,
    }));
    if (readFounderLocalCompanyScopeLock({ storage: targetStorage }) !== expected) {
      throw new Error('scope_not_persisted');
    }
  } catch {
    throw new FounderLocalReadOnlyError('Không thể khóa phạm vi Founder-local trong tab hiện tại.');
  }
  return expected;
}

function setFounderLocalScopeHeader(config, scope) {
  if (typeof config.headers?.set === 'function') config.headers.set(FOUNDER_LOCAL_SCOPE_HEADER, scope);
  else config.headers = { ...(config.headers || {}), [FOUNDER_LOCAL_SCOPE_HEADER]: scope };
}

/** Enforce the Cockpit company selection on every same-origin Axios read. */
export function applyFounderLocalCompanyScopeLock(config = {}, options = {}) {
  if (!isFounderLocalReadOnlyActive()) return config;
  const method = String(config.method || 'get').trim().toLowerCase();
  if (method !== 'get' && method !== 'head') return config;
  const rawUrl = String(config.url || '').trim();
  const apiPath = normalizeApiPath(rawUrl);
  if (SCOPE_FREE_ENDPOINTS.has(apiPath)
    || apiPath === '/business-os'
    || apiPath.startsWith('/business-os/')) return config;
  const scope = readFounderLocalCompanyScopeLock(options);
  if (!scope) {
    throw new FounderLocalReadOnlyError('Chưa có phạm vi công ty Founder-local đã xác minh.');
  }
  if (scope === 'all') {
    throw new FounderLocalReadOnlyError('Drill-down Founder-local yêu cầu chọn một công ty đã xác minh.');
  }

  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(rawUrl)) {
    const parsed = new URL(rawUrl, 'https://founder-local.invalid');
    parsed.searchParams.delete('company_id');
    config.url = `${parsed.pathname}${parsed.search}`;
  }

  if (config.params instanceof URLSearchParams) {
    const nextParams = new URLSearchParams(config.params);
    if (scope === 'all') nextParams.delete('company_id');
    else nextParams.set('company_id', scope);
    config.params = nextParams;
  } else {
    const nextParams = { ...(config.params || {}) };
    if (scope === 'all') delete nextParams.company_id;
    else nextParams.company_id = scope;
    config.params = nextParams;
  }
  setFounderLocalScopeHeader(config, scope);
  return config;
}

/**
 * The URL is routing input, not runtime authority. The dedicated local build
 * makes the profile unconditional through Vite and writes an informational
 * marker for diagnostics; a standard build always remains standard.
 */
export function activateFounderLocalReadOnlyForPath(_pathname) {
  if (FOUNDER_LOCAL_BUILD && typeof window !== 'undefined') {
    try { window.sessionStorage?.setItem(FOUNDER_LOCAL_SESSION_KEY, '1'); } catch { /* fail closed in memory */ }
  }
  founderLocalReadOnlyActive = FOUNDER_LOCAL_BUILD;
  return founderLocalReadOnlyActive;
}

/** Set during route render, before child effects can start automatic traffic. */
export function setFounderLocalReadOnlyActive(active) {
  founderLocalReadOnlyActive = active === true;
}

export function isFounderLocalReadOnlyActive() {
  return founderLocalReadOnlyActive;
}

function normalizeApiPath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')
    || /[\\\u0000-\u001f\u007f]/.test(raw)
    || /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(raw)) return '';
  try {
    const parsed = new URL(raw, 'https://founder-local.invalid/api/');
    const withoutApiPrefix = parsed.pathname.replace(/^\/api(?=\/|$)/i, '');
    const path = withoutApiPrefix.length > 1
      ? withoutApiPrefix.replace(/\/+$/, '')
      : withoutApiPrefix;
    return path || '/';
  } catch {
    return '';
  }
}

function responseHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '').trim();
  const expected = String(name || '').toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === expected);
  return String(entry?.[1] || '').trim();
}

function founderLocalApiTarget(config, expectedBaseURL) {
  const rawUrl = String(config.url || '').trim();
  const path = normalizeApiPath(rawUrl);
  if (!rawUrl.startsWith('/') || rawUrl.startsWith('//') || !path) {
    return { allowed: false, reason: 'invalid_or_external_api_target', path: '' };
  }

  const actualBaseURL = String(config.baseURL || '');
  // Founder-local credentials may only travel through the relative /api base.
  // Even an exact configured production URL is external to the local runtime.
  if (actualBaseURL !== FOUNDER_LOCAL_API_BASE_URL) {
    return { allowed: false, reason: 'founder_local_api_base_must_be_same_origin', path };
  }
  if (expectedBaseURL !== undefined) {
    if (String(expectedBaseURL) !== FOUNDER_LOCAL_API_BASE_URL
      || actualBaseURL !== String(expectedBaseURL)) {
      return { allowed: false, reason: 'unexpected_api_base_url', path };
    }
  } else if (actualBaseURL) {
    // A standalone policy call cannot prove a caller-supplied base URL. The
    // Axios interceptor always supplies the configured expectedBaseURL.
    return { allowed: false, reason: 'unattested_api_base_url', path };
  }
  return { allowed: true, path };
}

export function founderLocalRequestDecision(config = {}, { expectedBaseURL } = {}) {
  if (!isFounderLocalReadOnlyActive()) return { allowed: true, reason: 'profile_inactive' };

  const method = String(config.method || 'get').trim().toLowerCase();
  const target = founderLocalApiTarget(config, expectedBaseURL);
  if (!target.allowed) return { ...target, method };
  const { path } = target;

  // Password authentication is the only explicit write needed to enter this profile.
  if (config.founderLocalAuth === true && method === 'post' && path === '/auth/login') {
    return { allowed: true, reason: 'explicit_local_auth' };
  }
  // The source-read surface mirrors the backend's deliberately tiny audited
  // allowlist. A GET is not considered safe merely because of its HTTP verb.
  if (method === 'get' || method === 'head') {
    if (SCOPE_FREE_ENDPOINTS.has(path)
      || path === '/business-os'
      || path.startsWith('/business-os/')) {
      return { allowed: true, reason: 'founder_local_control_plane_read' };
    }
    if (method === 'get' && path === FOUNDER_LOCAL_APPROVED_SOURCE_READ) {
      const scope = normalizeFounderLocalCompanyScope(
        responseHeader(config.headers, FOUNDER_LOCAL_SCOPE_HEADER),
      );
      if (scope && scope !== 'all') {
        return { allowed: true, reason: 'audited_exact_company_source_read' };
      }
      return { allowed: false, reason: 'exact_company_scope_required', method, path };
    }
    return { allowed: false, reason: 'source_read_route_not_approved', method, path };
  }
  if (method === 'post' && SAFE_NOOP_POST_ENDPOINTS.has(path)) {
    return { allowed: true, reason: 'server_attested_noop_or_logout' };
  }
  if (config.founderLocalControlledAction === true
    && ADVISORY_WRITE_ENDPOINTS.get(path) === method) {
    const headers = config.headers || {};
    const idempotencyKey = typeof headers.get === 'function'
      ? headers.get('Idempotency-Key')
      : headers['Idempotency-Key'] || headers['idempotency-key'];
    if (UUID_RE.test(String(idempotencyKey || '').trim())) {
      return { allowed: true, reason: 'explicit_provisional_configuration' };
    }
    return { allowed: false, reason: 'invalid_or_missing_idempotency_key', method, path };
  }
  return { allowed: false, reason: 'not_in_founder_local_read_contract', method, path };
}

export function assertFounderLocalRequestAllowed(config = {}, options = {}) {
  const decision = founderLocalRequestDecision(config, options);
  if (!decision.allowed) throw new FounderLocalReadOnlyError();
  return config;
}

/** Every successful API response in this profile must be emitted by the guarded runtime. */
export function assertFounderLocalResponseAttested(response = {}) {
  if (!isFounderLocalReadOnlyActive()) return response;
  const profile = responseHeader(response.headers, FOUNDER_LOCAL_PROFILE_HEADER);
  if (profile !== FOUNDER_LOCAL_RUNTIME_PROFILE) {
    throw new FounderLocalReadOnlyError(
      'Backend chưa chứng thực runtime Founder-local read-only; phản hồi đã bị khóa.',
    );
  }
  const requestScope = normalizeFounderLocalCompanyScope(
    responseHeader(response.config?.headers, FOUNDER_LOCAL_SCOPE_HEADER),
  );
  if (requestScope) {
    const responseScope = normalizeFounderLocalCompanyScope(
      responseHeader(response.headers, FOUNDER_LOCAL_SCOPE_HEADER),
    );
    if (responseScope !== requestScope) {
      throw new FounderLocalReadOnlyError(
        'Backend chưa chứng thực đúng phạm vi công ty Founder-local; phản hồi đã bị khóa.',
      );
    }
  }
  return response;
}

/** Password login also carries a body attestation so a standard login cannot seed this session. */
export function assertFounderLocalLoginAttested(payload = {}) {
  if (!isFounderLocalReadOnlyActive()) return payload;
  const ttlSeconds = Number(payload?.session_expires_in_seconds);
  if (payload?.read_only !== true
    || payload?.runtime_profile !== FOUNDER_LOCAL_RUNTIME_PROFILE
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 60
    || ttlSeconds > 60 * 60) {
    throw new FounderLocalReadOnlyError(
      'Phiên đăng nhập không thuộc runtime Founder-local read-only có thời hạn; thông tin xác thực không được lưu.',
    );
  }
  return payload;
}

/** Accept only server-attested, enabled, same-origin read-only drilldowns. */
export function safeFounderLocalDrilldownHref(drilldown, { expectedCompanyScope } = {}) {
  if (!drilldown || typeof drilldown !== 'object') return '';
  if (drilldown.enabled === false
    || drilldown.read_only !== true
    || drilldown.read_only_contract !== FOUNDER_LOCAL_READ_ONLY_CONTRACT
    || drilldown.write_capability !== 'DISABLED_IN_FOUNDER_LOCAL') return '';
  const href = safeBusinessOsHref(drilldown.href || drilldown.to || drilldown.path);
  if (!href) return '';
  const actualScope = founderLocalCompanyScopeFromHref(href);
  if (!actualScope || actualScope === 'all') return '';
  const parsed = new URL(href, 'https://founder-local.invalid');
  if (parsed.pathname !== '/crm/dashboard') return '';
  const expected = expectedCompanyScope == null
    ? ''
    : normalizeFounderLocalCompanyScope(expectedCompanyScope);
  if (expectedCompanyScope != null && (!expected || actualScope !== expected)) return '';
  return href;
}
