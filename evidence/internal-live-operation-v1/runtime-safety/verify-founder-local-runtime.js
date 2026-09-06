#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { readCandidateBinding } = require('./candidate-binding');
const { buildFounderLocalChildEnvironment } = require('../../../backend/src/config/founderLocalEnv');
const {
  readFounderLocalCandidateBinding,
  readFounderLocalDistIdentity,
} = require('../../../backend/src/config/founderLocalRuntimeProvenance');
const {
  assertFounderLocalProcessBinding,
} = require('../../../backend/src/config/founderLocalProcessBinding');
const {
  awaitFounderCockpitReady,
  closeBrowserResources,
  confineProcessTempDirectory,
  removeStaleAcceptanceProfiles,
} = require('./browser-runtime-readiness');

const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const outputDir = path.join(__dirname, 'runtime', 'candidates', 'c3-r2');
const outputFile = path.join(outputDir, 'runtime-acceptance-summary.json');
const browserOutputFile = path.join(outputDir, 'browser-runtime-verification.json');
const staticVerificationFile = path.join(outputDir, 'static-verification.json');
const runtimeStateDir = path.join(repositoryDir, 'backend', '.runtime', 'founder-local-v1');
const processFile = path.join(runtimeStateDir, 'process.json');
const processLockFile = path.join(runtimeStateDir, 'process.lock.json');

fs.mkdirSync(outputDir, { recursive: true });
// Failed reruns must not leave a prior PASS available to the acceptance gate.
fs.rmSync(outputFile, { force: true });
fs.rmSync(browserOutputFile, { force: true });

function writeEvidenceAtomically(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// The verifier may read protected runtime configuration only from an operator-
// selected file. It never searches another checkout or prints that file path.
process.env.RUNTIME_PROFILE = 'founder-local-read-only';
process.env.FOUNDER_LOCAL_READ_ONLY = '1';
process.env.FOUNDER_LOCAL_PORT = '4010';
const port = 4010;
const baseUrl = `http://127.0.0.1:${port}`;
const founderEnvFile = String(process.env.FOUNDER_LOCAL_ENV_FILE || '').trim();
let setupError = null;
let supabase = null;
let buildAuthSessionForUser = null;
let founderLocalJwtAudience = null;
let founderLocalJwtPurpose = null;
let founderLocalMaxSessionTtlSeconds = null;

try {
  if (!founderEnvFile || !path.isAbsolute(founderEnvFile)) {
    const error = new Error('FOUNDER_LOCAL_ENV_FILE_REQUIRED');
    error.code = 'FOUNDER_LOCAL_ENV_FILE_REQUIRED';
    throw error;
  }
  require(path.join(repositoryDir, 'backend/src/config/founderLocalEnv'))
    .loadFounderLocalDataEnvironment(founderEnvFile);
  process.env.RUNTIME_PROFILE = 'founder-local-read-only';
  process.env.FOUNDER_LOCAL_READ_ONLY = '1';
  process.env.FOUNDER_LOCAL_PORT = '4010';
  const runtimeProfile = require(path.join(repositoryDir, 'backend/src/config/runtimeProfile'));
  runtimeProfile.applyRuntimeProfile();
  runtimeProfile.assertFounderLocalDataConfig();
  require(path.join(repositoryDir, 'backend/src/helpers/founderLocalSupabaseGuard'))
    .installFounderLocalSupabaseGuard();
  ({ supabase } = require(path.join(repositoryDir, 'backend/src/config/supabase')));
  ({
    FOUNDER_LOCAL_JWT_AUDIENCE: founderLocalJwtAudience,
    FOUNDER_LOCAL_JWT_PURPOSE: founderLocalJwtPurpose,
    FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS: founderLocalMaxSessionTtlSeconds,
    buildAuthSessionForUser,
  } = require(path.join(repositoryDir, 'backend/src/helpers/authSession')));
} catch (error) {
  setupError = String(error?.code || 'FOUNDER_LOCAL_VERIFIER_SETUP_FAILED').slice(0, 80);
}

const summary = {
  schema_version: '1.0.0',
  evidence_type: 'FOUNDER_LOCAL_RUNTIME_ACCEPTANCE',
  profile: 'founder-local-read-only',
  checked_at: new Date().toISOString(),
  target: `127.0.0.1:${port}`,
  result: 'FAIL',
  checks: {},
  security: {
    identities_recorded: false,
    credentials_recorded: false,
    environment_file_path_recorded: false,
    raw_business_values_recorded: false,
  },
};

function pass(name, detail = {}) {
  summary.checks[name] = { status: 'PASS', ...detail };
}

function fail(name, code) {
  summary.checks[name] = { status: 'FAIL', code: String(code || 'CHECK_FAILED').slice(0, 80) };
}

function safeCode(error, fallback = 'BROWSER_RUNTIME_VERIFICATION_FAILED') {
  const candidate = String(error?.code || error?.name || '').trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(candidate) ? candidate : fallback;
}

function readJson(file, code) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

function readStaticDistBinding(candidate, frontendDist) {
  const artifact = readJson(staticVerificationFile, 'FOUNDER_LOCAL_STATIC_VERIFICATION_REQUIRED');
  const checkedAt = Date.parse(String(artifact?.checked_at || ''));
  const attestedAt = Date.parse(String(candidate?.attested_at || ''));
  const current = Date.now();
  const valid = artifact?.schema_version === '1.0.0'
    && artifact?.evidence_type === 'FOUNDER_LOCAL_STATIC_VERIFICATION'
    && artifact?.result === 'PASS'
    && artifact?.candidate?.commit === candidate.commit
    && artifact?.candidate?.tree === candidate.tree
    && artifact?.candidate?.candidate_attestation_sha256 === candidate.candidate_attestation_sha256
    && artifact?.candidate?.attested_at === candidate.attested_at
    && artifact?.candidate?.clean_before === true
    && artifact?.candidate?.clean_after === true
    && artifact?.candidate?.head_and_tree_unchanged === true
    && artifact?.candidate?.attestation_unchanged === true
    && artifact?.checks?.find?.((check) => check?.id === 'frontend_founder_local_build')?.status === 'PASS'
    && artifact?.supply_chain?.frontend_dist_sha256 === frontendDist.sha256
    && Number.isFinite(checkedAt)
    && Number.isFinite(attestedAt)
    && checkedAt >= attestedAt
    && checkedAt <= current
    && checkedAt >= current - (24 * 60 * 60 * 1000);
  if (!valid) {
    const error = new Error('FOUNDER_LOCAL_STATIC_DIST_BINDING_INVALID');
    error.code = 'FOUNDER_LOCAL_STATIC_DIST_BINDING_INVALID';
    throw error;
  }
  return { frontend_dist_sha256: frontendDist.sha256 };
}

function browserExecutable() {
  const explicit = String(process.env.FOUNDER_LOCAL_BROWSER_EXECUTABLE || '').trim();
  const candidates = explicit ? [explicit] : [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => path.isAbsolute(candidate) && fs.existsSync(candidate)) || '';
}

async function verifyBrowserRuntime({ token, user, candidate }) {
  const checkedAt = new Date().toISOString();
  const evidence = {
    schema_version: '1.0.0',
    evidence_type: 'FOUNDER_LOCAL_BROWSER_RUNTIME_VERIFICATION',
    checked_at: checkedAt,
    result: 'FAIL',
    candidate,
    controls: {
      same_origin_only: false,
      loopback_only: false,
      admin_authenticated: false,
      business_os_rendered: false,
      crm_drilldown_loaded: false,
      company_scope_persisted: false,
      drilldown_scope_enforced: false,
      partial_read_disclosed: false,
      crm_partial_totals_disclosed: false,
      ephemeral_browser_context: false,
      stale_acceptance_profiles_removed: false,
      parent_temp_confined: false,
      unapproved_ui_route_denied: false,
      no_write_observed: false,
      secrets_recorded: false,
    },
  };
  const executablePath = browserExecutable();
  const browserRoot = path.join(repositoryDir, 'backend', '.runtime', 'founder-local-v1', 'browser');
  let staleProfilesRemoved = false;
  let parentTempConfined = false;
  let restoreProcessTemp = () => {};
  let browser;
  let context;
  const externalOrigins = new Set();
  const writeMethods = new Set();
  try {
    if (!executablePath) {
      const error = new Error('FOUNDER_LOCAL_BROWSER_NOT_FOUND');
      error.code = 'FOUNDER_LOCAL_BROWSER_NOT_FOUND';
      throw error;
    }
    restoreProcessTemp = confineProcessTempDirectory(browserRoot, {
      allowedRoot: repositoryDir,
    });
    parentTempConfined = true;
    staleProfilesRemoved = removeStaleAcceptanceProfiles(browserRoot, {
      allowedRoot: repositoryDir,
    });
    const { chromium } = require(path.join(repositoryDir, 'backend', 'node_modules', 'playwright'));
    let scopeCompanyId = String(user?.company_id || '').trim();
    if (!scopeCompanyId) {
      const companyResult = await supabase
        .from('companies')
        .select('id')
        .eq('tenant_id', user?.tenant_id)
        .or('is_active.eq.true,is_active.is.null')
        .limit(1);
      if (companyResult.error || !companyResult.data?.[0]?.id) {
        const error = new Error('FOUNDER_LOCAL_BROWSER_COMPANY_SCOPE_NOT_FOUND');
        error.code = 'FOUNDER_LOCAL_BROWSER_COMPANY_SCOPE_NOT_FOUND';
        throw error;
      }
      scopeCompanyId = String(companyResult.data[0].id);
    }
    browser = await chromium.launch({
      executablePath,
      headless: true,
      env: {
        ...buildFounderLocalChildEnvironment(process.env, { includeDataKeys: false }),
        TEMP: browserRoot,
        TMP: browserRoot,
      },
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-crash-reporter',
        '--metrics-recording-only',
        '--no-first-run',
      ],
    });
    context = await browser.newContext();
    await context.addInitScript(({ ephemeralToken, ephemeralUser }) => {
      window.sessionStorage.setItem('founder_local_read_only_v1', '1');
      window.sessionStorage.setItem('token', ephemeralToken);
      window.sessionStorage.setItem('user', JSON.stringify(ephemeralUser));
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('user');
    }, { ephemeralToken: token, ephemeralUser: user });
    const page = await context.newPage();
    await page.route('**/*', async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) writeMethods.add(method);
      let parsed;
      try { parsed = new URL(request.url()); } catch { parsed = null; }
      if (parsed && !['data:', 'blob:'].includes(parsed.protocol) && parsed.origin !== baseUrl) {
        externalOrigins.add(parsed.origin);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.goto(new URL('/drive', baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForURL((value) => {
      try { return new URL(value).pathname === '/business-os'; } catch { return false; }
    }, { timeout: 30_000 });
    if (new URL(page.url()).pathname !== '/business-os' || externalOrigins.size || writeMethods.size) {
      const error = new Error('FOUNDER_LOCAL_UNAPPROVED_UI_ROUTE_NOT_DENIED');
      error.code = 'FOUNDER_LOCAL_UNAPPROVED_UI_ROUTE_NOT_DENIED';
      throw error;
    }
    const cockpitUrl = new URL('/business-os', baseUrl);
    cockpitUrl.searchParams.set('ecosystem_id', String(user?.tenant_id || ''));
    cockpitUrl.searchParams.set('company_id', scopeCompanyId);
    const cockpitReadiness = await awaitFounderCockpitReady({
      page,
      cockpitUrl: cockpitUrl.toString(),
      baseUrl,
      ecosystemId: String(user?.tenant_id || ''),
      companyId: scopeCompanyId,
    });
    if (externalOrigins.size || writeMethods.size) {
      const error = new Error('FOUNDER_LOCAL_BROWSER_NETWORK_BOUNDARY_FAILED');
      error.code = 'FOUNDER_LOCAL_BROWSER_NETWORK_BOUNDARY_FAILED';
      throw error;
    }
    const crmLink = page.locator(`a[href^="/crm/dashboard?company_id=${scopeCompanyId}"]`).first();
    if (await crmLink.count() !== 1) {
      const error = new Error('FOUNDER_LOCAL_CRM_DRILLDOWN_LINK_MISSING');
      error.code = 'FOUNDER_LOCAL_CRM_DRILLDOWN_LINK_MISSING';
      throw error;
    }
    const crmBootstrapPromise = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return url.origin === baseUrl
          && url.pathname === '/api/crm/web-dashboard-bootstrap'
          && url.searchParams.get('company_id') === scopeCompanyId
          && response.request().method().toUpperCase() === 'GET';
      } catch {
        return false;
      }
    }, { timeout: 60_000 });
    void crmBootstrapPromise.catch(() => {});
    const [, crmBootstrap] = await Promise.all([
      crmLink.click(),
      crmBootstrapPromise,
    ]);
    if (!crmBootstrap.ok()) {
      const error = new Error('FOUNDER_LOCAL_CRM_DRILLDOWN_FAILED');
      error.code = 'FOUNDER_LOCAL_CRM_DRILLDOWN_FAILED';
      throw error;
    }
    const disclosure = page.locator('[data-testid="founder-local-drilldown-disclosure"]');
    await disclosure.waitFor({ state: 'visible', timeout: 30_000 });
    const crmPartialTotalsDisclosure = page.locator(
      '[data-testid="founder-local-crm-partial-totals-disclosure"]',
    );
    await crmPartialTotalsDisclosure.waitFor({ state: 'visible', timeout: 30_000 });
    const navigated = new URL(page.url());
    const disclosedScope = await disclosure.getAttribute('data-company-scope');
    const disclosureText = await disclosure.textContent();
    const crmPartialTotalsText = await crmPartialTotalsDisclosure.textContent();
    const bootstrapUrl = new URL(crmBootstrap.request().url());
    const bootstrapHeaders = crmBootstrap.request().headers();
    const bootstrapResponseScope = String(
      crmBootstrap.headers()['x-founder-local-company-scope'] || '',
    ).trim().toLowerCase();
    if (
      navigated.pathname !== '/crm/dashboard'
      || navigated.searchParams.get('company_id') !== scopeCompanyId
      || bootstrapUrl.searchParams.get('company_id') !== scopeCompanyId
      || bootstrapHeaders['x-founder-local-company-scope'] !== scopeCompanyId
      || bootstrapResponseScope !== scopeCompanyId
      || disclosedScope !== scopeCompanyId
    ) {
      const error = new Error('FOUNDER_LOCAL_COMPANY_SCOPE_NOT_PERSISTED');
      error.code = 'FOUNDER_LOCAL_COMPANY_SCOPE_NOT_PERSISTED';
      throw error;
    }
    if (!String(disclosureText || '').includes('KHÔNG ĐẦY ĐỦ')) {
      const error = new Error('FOUNDER_LOCAL_PARTIAL_READ_NOT_DISCLOSED');
      error.code = 'FOUNDER_LOCAL_PARTIAL_READ_NOT_DISCLOSED';
      throw error;
    }
    if (
      !String(crmPartialTotalsText || '').includes('KHÔNG ĐẦY ĐỦ')
      || !String(crmPartialTotalsText || '').includes('≥ N')
      || !String(crmPartialTotalsText || '').includes('—')
    ) {
      const error = new Error('FOUNDER_LOCAL_CRM_PARTIAL_TOTALS_NOT_DISCLOSED');
      error.code = 'FOUNDER_LOCAL_CRM_PARTIAL_TOTALS_NOT_DISCLOSED';
      throw error;
    }
    if (externalOrigins.size || writeMethods.size) {
      const error = new Error('FOUNDER_LOCAL_BROWSER_NETWORK_BOUNDARY_FAILED');
      error.code = 'FOUNDER_LOCAL_BROWSER_NETWORK_BOUNDARY_FAILED';
      throw error;
    }
    evidence.result = 'PASS';
    evidence.rendered_contract = cockpitReadiness;
    evidence.controls = {
      same_origin_only: true,
      loopback_only: true,
      admin_authenticated: true,
      business_os_rendered: true,
      crm_drilldown_loaded: true,
      company_scope_persisted: true,
      drilldown_scope_enforced: true,
      partial_read_disclosed: true,
      crm_partial_totals_disclosed: true,
      ephemeral_browser_context: true,
      stale_acceptance_profiles_removed: staleProfilesRemoved,
      parent_temp_confined: parentTempConfined,
      unapproved_ui_route_denied: true,
      no_write_observed: true,
      secrets_recorded: false,
    };
  } catch (error) {
    evidence.failure_code = safeCode(error);
  } finally {
    try {
      await closeBrowserResources({ context, browser });
    } catch (error) {
      evidence.controls.ephemeral_browser_context = false;
      if (evidence.result === 'PASS') {
        evidence.result = 'FAIL';
        evidence.failure_code = safeCode(error);
      } else {
        evidence.cleanup_failure_code = safeCode(error);
      }
    }
    restoreProcessTemp();
    writeEvidenceAtomically(browserOutputFile, evidence);
  }
  if (evidence.result !== 'PASS') {
    throw Object.assign(new Error(evidence.failure_code), { check: 'browser_runtime' });
  }
  pass('browser_runtime', { artifact: path.relative(repositoryDir, browserOutputFile).replace(/\\/g, '/') });
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
}

async function json(response) {
  const value = await response.json();
  return value && typeof value === 'object' ? value : {};
}

async function discoverRuntimeIdentities() {
  const select = 'id, email, full_name, role, company_id, tenant_id, department_id, is_active';
  const [adminResult, nonAdminResult] = await Promise.all([
    supabase
      .from('users')
      .select(select)
      .eq('role', 'admin')
      .not('tenant_id', 'is', null)
      .or('is_active.eq.true,is_active.is.null')
      .limit(1),
    supabase
      .from('users')
      .select(select)
      .neq('role', 'admin')
      .not('tenant_id', 'is', null)
      .or('is_active.eq.true,is_active.is.null')
      .limit(1),
  ]);
  if (adminResult.error || nonAdminResult.error) {
    const discoveryError = new Error('ACCEPTANCE_IDENTITY_DISCOVERY_FAILED');
    discoveryError.code = 'ACCEPTANCE_IDENTITY_DISCOVERY_FAILED';
    throw discoveryError;
  }
  const admin = Array.isArray(adminResult.data) ? adminResult.data[0] : null;
  const nonAdmin = Array.isArray(nonAdminResult.data) ? nonAdminResult.data[0] : null;
  return { admin, nonAdmin };
}

async function mintEphemeralToken(user) {
  const session = await buildAuthSessionForUser(user, {
    expiresInSeconds: 600,
    audience: founderLocalJwtAudience,
  });
  if (!session?.token) {
    const error = new Error('EPHEMERAL_ACCEPTANCE_SESSION_FAILED');
    error.code = 'EPHEMERAL_ACCEPTANCE_SESSION_FAILED';
    throw error;
  }
  return session.token;
}

async function main() {
  if (setupError) {
    throw Object.assign(new Error(setupError), { check: 'verifier_setup' });
  }
  summary.candidate = readCandidateBinding();
  const checkoutBinding = readFounderLocalCandidateBinding(repositoryDir);
  if (
    checkoutBinding.source_candidate.commit !== summary.candidate.commit
    || checkoutBinding.source_candidate.tree !== summary.candidate.tree
  ) {
    throw Object.assign(new Error('candidate_checkout_binding'), { check: 'runtime_posture' });
  }
  const frontendDist = readFounderLocalDistIdentity(repositoryDir);
  readStaticDistBinding(summary.candidate, frontendDist);
  const healthResponse = await request('/api/health');
  const health = await json(healthResponse);
  const runtime = health.runtime || {};
  const processBinding = assertFounderLocalProcessBinding({
    lock: readJson(processLockFile, 'FOUNDER_LOCAL_PROCESS_LOCK_REQUIRED'),
    record: readJson(processFile, 'FOUNDER_LOCAL_PROCESS_RECORD_REQUIRED'),
    runtime,
    candidate: summary.candidate,
    checkout: checkoutBinding.checkout,
    frontendDist,
    expectedHost: '127.0.0.1',
    expectedPort: port,
  });
  if (
    !healthResponse.ok
    || runtime.profile !== 'founder-local-read-only'
    || runtime.bind_host !== '127.0.0.1'
    || runtime.bind_port !== port
    || runtime.controlled_real_writes_enabled !== false
    || runtime.background_writers_enabled !== false
    || runtime.realtime_writes_enabled !== false
    || runtime.public_binding_enabled !== false
    || !runtime.instance_id
    || !Number.isInteger(runtime.process_id)
    || runtime.launcher_owned !== true
  ) throw Object.assign(new Error('runtime_posture'), { check: 'runtime_posture' });
  pass('runtime_posture', {
    http_status: healthResponse.status,
    bind_host: runtime.bind_host,
    controlled_real_writes_enabled: false,
    background_writers_enabled: false,
    realtime_writes_enabled: false,
    public_binding_enabled: false,
    process_identity_attested: true,
    candidate_identity_attested: true,
    frontend_manifest_identity_attested: true,
    static_frontend_dist_attested: true,
    process_record_attested: processBinding.process_record_attested,
    launcher_process_alive: processBinding.launcher_process_alive,
    launcher_owns_runtime: processBinding.launcher_owns_runtime,
  });

  const page = await request('/business-os/login');
  const contentType = String(page.headers.get('content-type') || '').toLowerCase();
  if (!page.ok || !contentType.includes('text/html')) {
    throw Object.assign(new Error('login_page'), { check: 'login_page' });
  }
  await page.arrayBuffer();
  pass('login_page', { http_status: page.status, content_type: 'text/html' });

  const cors = await request('/api/health', { headers: { Origin: 'https://not-loopback.invalid' } });
  if (cors.headers.get('access-control-allow-origin')) {
    throw Object.assign(new Error('cors'), { check: 'cors' });
  }
  await cors.arrayBuffer();
  pass('non_loopback_origin_denied', { allow_origin_header_present: false });

  const realtime = await request('/socket.io/?EIO=4&transport=polling');
  if (realtime.status < 400) {
    throw Object.assign(new Error('realtime'), { check: 'realtime' });
  }
  await realtime.arrayBuffer();
  pass('realtime_handshake_denied', { http_status: realtime.status });

  const uploads = await request('/uploads/private-probe');
  if (uploads.status !== 403) throw Object.assign(new Error('uploads'), { check: 'uploads' });
  await uploads.arrayBuffer();
  pass('business_uploads_denied', { http_status: uploads.status });

  const unauthenticated = await request('/api/business-os/health');
  if (unauthenticated.status !== 401) {
    throw Object.assign(new Error('admin_boundary'), { check: 'admin_boundary' });
  }
  await unauthenticated.arrayBuffer();
  pass('admin_boundary', { unauthenticated_http_status: unauthenticated.status });

  const blocked = await request('/api/crm/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (blocked.status !== 405) throw Object.assign(new Error('write_boundary'), { check: 'write_boundary' });
  const blockedBody = await json(blocked);
  if (blockedBody.code !== 'FOUNDER_LOCAL_WRITE_BLOCKED') {
    throw Object.assign(new Error('write_boundary'), { check: 'write_boundary' });
  }
  pass('domain_http_write_denied', { http_status: blocked.status, code: blockedBody.code });

  let identities = null;
  let authenticationSource = 'provided_token';
  let token = String(process.env.FOUNDER_LOCAL_ACCEPTANCE_TOKEN || '').trim();
  if (!token) {
    const email = String(process.env.FOUNDER_LOCAL_ACCEPTANCE_EMAIL || '').trim();
    const password = String(process.env.FOUNDER_LOCAL_ACCEPTANCE_PASSWORD || '');
    if (email && password) {
      const login = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await json(login);
      if (!login.ok || !loginBody.token || loginBody.read_only !== true) {
        throw Object.assign(new Error('read_only_login'), { check: 'authenticated_health' });
      }
      token = loginBody.token;
      authenticationSource = 'password_login';
    } else {
      identities = await discoverRuntimeIdentities();
      if (!identities.admin) {
        throw Object.assign(new Error('active_tenant_admin_not_found'), { check: 'authenticated_health' });
      }
      token = await mintEphemeralToken(identities.admin);
      authenticationSource = 'ephemeral_founder_session';
    }
  }

  const jwt = require(path.join(repositoryDir, 'backend', 'node_modules', 'jsonwebtoken'));
  let founderClaims;
  try {
    founderClaims = jwt.verify(token, process.env.JWT_SECRET, { audience: founderLocalJwtAudience });
  } catch {
    throw Object.assign(new Error('founder_token_claims'), { check: 'bounded_founder_token' });
  }
  const founderTokenTtl = Number(founderClaims?.exp) - Number(founderClaims?.iat);
  if (
    founderClaims?.aud !== founderLocalJwtAudience
    || founderClaims?.session_purpose !== founderLocalJwtPurpose
    || !Number.isSafeInteger(founderClaims?.iat)
    || !Number.isSafeInteger(founderClaims?.exp)
    || !Number.isSafeInteger(founderTokenTtl)
    || founderTokenTtl <= 0
    || founderTokenTtl > founderLocalMaxSessionTtlSeconds
  ) {
    throw Object.assign(new Error('founder_token_claims'), { check: 'bounded_founder_token' });
  }
  pass('bounded_founder_token', {
    audience: founderLocalJwtAudience,
    purpose: founderLocalJwtPurpose,
    issued_at_present: true,
    expires_at_present: true,
    ttl_at_most_seconds: 3600,
  });

  const cockpitHealthResponse = await request('/api/business-os/health', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cockpitHealth = await json(cockpitHealthResponse);
  const contract = cockpitHealthResponse.headers.get('x-business-os-health-contract');
  if (contract !== 'founder_cockpit_health_v1' || cockpitHealth.contract_version !== contract) {
    throw Object.assign(new Error('cockpit_health_contract'), { check: 'authenticated_health' });
  }
  pass('authenticated_health', {
    http_status: cockpitHealthResponse.status,
    contract_version: contract,
    ready: cockpitHealth.ready === true,
    authentication_source: authenticationSource,
  });

  if (!identities) identities = await discoverRuntimeIdentities();
  if (!identities.admin) {
    throw Object.assign(new Error('active_tenant_admin_not_found'), { check: 'expired_token_denied' });
  }
  const expiredToken = jwt.sign({
    userId: identities.admin.id,
    role: 'admin',
    tenant_id: identities.admin.tenant_id,
    company_id: identities.admin.company_id || null,
    session_purpose: founderLocalJwtPurpose,
  }, process.env.JWT_SECRET, { audience: founderLocalJwtAudience, expiresIn: -60 });
  const expiredResponse = await request('/api/business-os/health', {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  const expiredBody = await json(expiredResponse);
  if (
    expiredResponse.status !== 401
    || expiredBody.code !== 'FOUNDER_LOCAL_TOKEN_INVALID'
    || Array.isArray(expiredBody.modules)
    || Array.isArray(expiredBody.systems)
    || expiredBody.scope
  ) {
    throw Object.assign(new Error('expired_token_boundary'), { check: 'expired_token_denied' });
  }
  pass('expired_token_denied', {
    http_status: expiredResponse.status,
    code: expiredBody.code,
    business_payload_present: false,
  });
  const legacyToken = jwt.sign({
    userId: identities.admin.id,
    role: 'admin',
    tenant_id: identities.admin.tenant_id,
    company_id: identities.admin.company_id || null,
    session_purpose: founderLocalJwtPurpose,
  }, process.env.JWT_SECRET, { audience: founderLocalJwtAudience, noTimestamp: true });
  const legacyResponse = await request('/api/business-os/health', {
    headers: { Authorization: `Bearer ${legacyToken}` },
  });
  const legacyBody = await json(legacyResponse);
  if (
    legacyResponse.status !== 401
    || legacyBody.code !== 'FOUNDER_LOCAL_TOKEN_INVALID'
    || Array.isArray(legacyBody.modules)
    || Array.isArray(legacyBody.systems)
    || legacyBody.scope
  ) {
    throw Object.assign(new Error('legacy_token_boundary'), { check: 'legacy_token_denied' });
  }
  pass('legacy_token_denied', {
    http_status: legacyResponse.status,
    code: legacyBody.code,
    business_payload_present: false,
  });
  if (identities.nonAdmin) {
    const nonAdminToken = await mintEphemeralToken(identities.nonAdmin);
    const deniedResponse = await request('/api/business-os/health', {
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    });
    const deniedBody = await json(deniedResponse);
    if (
      deniedResponse.status !== 403
      || deniedBody.code !== 'FOUNDER_LOCAL_ADMIN_REQUIRED'
      || Array.isArray(deniedBody.modules)
      || Array.isArray(deniedBody.systems)
      || deniedBody.scope
    ) {
      throw Object.assign(new Error('non_admin_boundary'), { check: 'non_admin_boundary' });
    }
    pass('non_admin_boundary', {
      identity_available: true,
      http_status: deniedResponse.status,
      code: deniedBody.code,
      business_payload_present: false,
    });
  } else {
    pass('non_admin_boundary', {
      identity_available: false,
      check_result: 'NOT_APPLICABLE_NO_ACTIVE_TENANT_BOUND_NON_ADMIN',
    });
  }

  const authenticatedWrite = await request('/api/crm/leads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const authenticatedWriteBody = await json(authenticatedWrite);
  if (authenticatedWrite.status !== 405 || authenticatedWriteBody.code !== 'FOUNDER_LOCAL_WRITE_BLOCKED') {
    throw Object.assign(new Error('authenticated_write_boundary'), { check: 'authenticated_write_boundary' });
  }
  pass('authenticated_domain_write_denied', {
    http_status: authenticatedWrite.status,
    code: authenticatedWriteBody.code,
  });

  for (const pathname of [
    '/api/dashboard/overview',
    '/api/drive/files/11111111-1111-4111-8111-111111111111/preview',
  ]) {
    const deniedRead = await request(pathname, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const deniedReadBody = await json(deniedRead);
    if (deniedRead.status !== 403 || deniedReadBody.code !== 'FOUNDER_LOCAL_READ_ROUTE_NOT_APPROVED') {
      throw Object.assign(new Error('unapproved_read_boundary'), { check: 'unapproved_read_boundary' });
    }
  }
  pass('unapproved_source_reads_denied', {
    route_count: 2,
    http_status: 403,
    code: 'FOUNDER_LOCAL_READ_ROUTE_NOT_APPROVED',
  });

  const missingScopeRead = await request('/api/crm/web-dashboard-bootstrap?type=lead&limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const missingScopeBody = await json(missingScopeRead);
  if (missingScopeRead.status !== 400 || missingScopeBody.code !== 'FOUNDER_LOCAL_SCOPE_REQUIRED') {
    throw Object.assign(new Error('source_scope_boundary'), { check: 'source_scope_boundary' });
  }
  pass('source_scope_required', {
    http_status: 400,
    code: 'FOUNDER_LOCAL_SCOPE_REQUIRED',
  });

  await verifyBrowserRuntime({
    token,
    user: identities.admin,
    candidate: summary.candidate,
  });

  summary.result = cockpitHealthResponse.ok && cockpitHealth.ready === true ? 'PASS' : 'FAIL';
  if (summary.result !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  fail(error?.check || 'runtime_verification', error?.message || error?.code);
  process.exitCode = 1;
}).finally(() => {
  writeEvidenceAtomically(outputFile, summary);
  console.log(JSON.stringify({
    result: summary.result,
    artifact: path.relative(repositoryDir, outputFile).replace(/\\/g, '/'),
  }));
});
