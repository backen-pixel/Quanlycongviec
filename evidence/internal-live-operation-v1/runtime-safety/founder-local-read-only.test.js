const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Unit tests must never discover or probe a real environment.
process.env.RUNTIME_PROFILE = 'founder-local-read-only';
process.env.SUPABASE_HEALTH_CHECK_DISABLED = '1';
process.env.SUPABASE_URL = 'https://founder-local-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder';
process.env.JWT_SECRET = 'test-only-placeholder';
process.env.DOTENV_CONFIG_QUIET = 'true';

const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const runtimeProfile = require(path.join(repositoryDir, 'backend/src/config/runtimeProfile'));
const {
  buildFounderLocalChildEnvironment,
  loadFounderLocalDataEnvironment,
} = require(path.join(repositoryDir, 'backend/src/config/founderLocalEnv'));
const {
  FOUNDER_LOCAL_PROVENANCE_ENV_KEYS,
  acceptanceOnlyCheckoutValid,
  applyFounderLocalProvenanceEnvironment,
  assertFounderLocalRuntimeProvenance,
  runtimeProvenanceSnapshot,
} = require(path.join(repositoryDir, 'backend/src/config/founderLocalRuntimeProvenance'));
const {
  assertFounderLocalProcessBinding,
  inspectLiveProcess,
} = require(path.join(repositoryDir, 'backend/src/config/founderLocalProcessBinding'));
const {
  installFounderLocalSupabaseGuard,
  READ_ONLY_RPC_NAMES,
} = require(path.join(repositoryDir, 'backend/src/helpers/founderLocalSupabaseGuard'));
const {
  attestFounderLocalCompanyScope,
  founderLocalSourceReadApproved,
  founderLocalHostBoundary,
  founderLocalReadOnlyMiddleware,
  isLoopbackAddress,
  requestPath,
  requestPolicy,
  verifyFounderLocalAccessToken,
} = require(path.join(repositoryDir, 'backend/src/middleware/founderLocalReadOnly'));
const {
  FOUNDER_LOCAL_JWT_AUDIENCE,
  FOUNDER_LOCAL_JWT_PURPOSE,
  FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS,
} = require(path.join(repositoryDir, 'backend/src/helpers/authSession'));
const {
  attachTenantContext,
} = require(path.join(repositoryDir, 'backend/src/middleware/tenantGate'));
const {
  authenticateFounderLocalPassword,
} = require(path.join(repositoryDir, 'backend/src/helpers/founderLocalAuth'));

test('profile forces fail-closed runtime and localhost:4010', () => {
  const env = {
    RUNTIME_PROFILE: 'founder-local-read-only',
    FOUNDER_LOCAL_PORT: '4010',
    REDIS_DISABLED: '0',
    KPI_CRON_DISABLED: '0',
    BACKGROUND_WRITE_JOBS_ENABLED: '1',
    FOUNDER_LOCAL_REALTIME_DISABLED: '0',
    SUPABASE_QUERY_GUARD: '1',
    FOUNDER_ADVISORY_CONFIG_ENABLED: '1',
  };
  const applied = runtimeProfile.applyRuntimeProfile(env);
  assert.equal(applied.host, '127.0.0.1');
  assert.equal(applied.port, 4010);
  assert.equal(env.PORT, '4010');
  assert.equal(env.REDIS_DISABLED, '1');
  assert.equal(env.KPI_CRON_DISABLED, '1');
  assert.equal(env.BACKGROUND_WRITE_JOBS_ENABLED, '0');
  assert.equal(env.FOUNDER_LOCAL_REALTIME_DISABLED, '1');
  assert.equal(env.SUPABASE_QUERY_GUARD, '0');
  assert.equal(env.CORS_ORIGINS, 'http://127.0.0.1:4010,http://localhost:4010');
  assert.doesNotMatch(env.CORS_ORIGINS, /:5173/);
  assert.equal(runtimeProfile.backgroundWritersAllowed(env), false);
  assert.equal(runtimeProfile.canonicalWritesAllowed(env), false);
  assert.deepEqual(runtimeProfile.serverBinding(env), { host: '127.0.0.1', port: 4010 });
  const snapshot = runtimeProfile.runtimeSafetySnapshot(env);
  assert.equal(snapshot.controlled_real_writes_enabled, false);
  assert.equal(snapshot.provisional_advisory_configuration_write_enabled, true);
});

test('profile validation refuses missing real-data credentials and unsafe ports', () => {
  const env = { RUNTIME_PROFILE: 'founder-local-read-only' };
  assert.throws(() => runtimeProfile.assertFounderLocalDataConfig(env), {
    code: 'FOUNDER_LOCAL_CONFIG_MISSING',
  });
  assert.throws(() => runtimeProfile.founderLocalPort({
    RUNTIME_PROFILE: 'founder-local-read-only',
    FOUNDER_LOCAL_PORT: '80',
  }), { code: 'FOUNDER_LOCAL_PORT_INVALID' });
});

test('explicit Founder-local data environment overrides inherited credentials and ignores unrelated keys', () => {
  const env = {
    SUPABASE_URL: 'https://inherited.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'inherited-secret',
    SUPABASE_SECRET_KEY: 'must-be-cleared',
    JWT_SECRET: 'inherited-jwt',
    FOUNDER_ADVISORY_CONFIG_ENABLED: '0',
  };
  const selectedFile = path.resolve(repositoryDir, 'operator-selected.test.env');
  const result = loadFounderLocalDataEnvironment(selectedFile, {
    env,
    readFile: () => Buffer.from([
      'SUPABASE_URL=https://selected.invalid',
      'SUPABASE_SERVICE_ROLE_KEY=selected-test-secret',
      'JWT_SECRET=selected-test-jwt',
      'UNRELATED_INTEGRATION_TOKEN=ignored-test-value',
    ].join('\n')),
  });
  assert.equal(env.SUPABASE_URL, 'https://selected.invalid');
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'selected-test-secret');
  assert.equal(env.JWT_SECRET, 'selected-test-jwt');
  assert.equal(env.SUPABASE_SECRET_KEY, undefined);
  assert.equal(env.UNRELATED_INTEGRATION_TOKEN, undefined);
  assert.equal(env.FOUNDER_ADVISORY_CONFIG_ENABLED, '0');
  assert.equal(result.unrelated_keys_ignored, 1);
});

test('Founder-local child environment excludes inherited integration credentials', () => {
  const isolated = buildFounderLocalChildEnvironment({
    SystemRoot: 'C:\\Windows',
    PATH: 'C:\\Windows\\System32',
    SUPABASE_URL: 'https://selected.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'selected-test-secret',
    JWT_SECRET: 'selected-test-jwt',
    RUNTIME_PROFILE: 'founder-local-read-only',
    GDRIVE_SERVICE_ACCOUNT_JSON: 'must-not-cross-boundary',
    GOOGLE_CLIENT_SECRET: 'must-not-cross-boundary',
    OPENAI_API_KEY: 'must-not-cross-boundary',
  }, { additionalKeys: ['RUNTIME_PROFILE'] });
  assert.equal(isolated.SystemRoot, 'C:\\Windows');
  assert.equal(isolated.SUPABASE_URL, 'https://selected.invalid');
  assert.equal(isolated.RUNTIME_PROFILE, 'founder-local-read-only');
  assert.equal(isolated.GDRIVE_SERVICE_ACCOUNT_JSON, undefined);
  assert.equal(isolated.GOOGLE_CLIENT_SECRET, undefined);
  assert.equal(isolated.OPENAI_API_KEY, undefined);
  const browserEnvironment = buildFounderLocalChildEnvironment(isolated, { includeDataKeys: false });
  assert.equal(browserEnvironment.SUPABASE_URL, undefined);
  assert.equal(browserEnvironment.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(browserEnvironment.JWT_SECRET, undefined);
});

const TEST_CANDIDATE = Object.freeze({
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
});
const TEST_FRONTEND_DIST = Object.freeze({
  sha256: 'c'.repeat(64),
  manifest_sha256: 'd'.repeat(64),
  contract_version: 'business_ai_os_founder_local_dist_v1',
  runtime_profile: 'founder-local-read-only',
  read_only: true,
  entry_path: '/business-os/login',
  api_base_url: '/api',
  api_origin_policy: 'same-origin-only',
  credential_request_policy: 'single-slash-relative-api-path-only',
});
const TEST_RUN_ID = '11111111-1111-4111-8111-111111111111';

test('Founder-local provenance envelope is explicit, isolated, and parent-bound', () => {
  const env = {};
  applyFounderLocalProvenanceEnvironment(env, {
    candidate: TEST_CANDIDATE,
    frontendDist: TEST_FRONTEND_DIST,
    launcherPid: 1200,
    runId: TEST_RUN_ID,
  });
  const snapshot = runtimeProvenanceSnapshot(env, {
    processId: 1300,
    parentProcessId: 1200,
  });
  assert.deepEqual(snapshot.candidate, TEST_CANDIDATE);
  assert.deepEqual(snapshot.frontend_dist, TEST_FRONTEND_DIST);
  assert.equal(snapshot.launcher_owned, true);
  assert.equal(assertFounderLocalRuntimeProvenance(env, {
    processId: 1300,
    parentProcessId: 1200,
  }).run_id, TEST_RUN_ID);

  const isolated = buildFounderLocalChildEnvironment({
    ...env,
    OPENAI_API_KEY: 'must-not-cross-boundary',
  }, { additionalKeys: FOUNDER_LOCAL_PROVENANCE_ENV_KEYS });
  assert.equal(isolated.FOUNDER_LOCAL_CANDIDATE_COMMIT, TEST_CANDIDATE.commit);
  assert.equal(isolated.FOUNDER_LOCAL_FRONTEND_DIST_SHA256, TEST_FRONTEND_DIST.sha256);
  assert.equal(isolated.OPENAI_API_KEY, undefined);
  assert.throws(() => assertFounderLocalRuntimeProvenance(env, {
    processId: 1300,
    parentProcessId: 999,
  }), { code: 'FOUNDER_LOCAL_RUNTIME_PROVENANCE_INVALID' });
});

test('Founder-local C4 restart permits only a non-merge acceptance-record delta from C3', () => {
  const sourceCandidate = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
  const valid = {
    sourceCandidate,
    actualSourceTree: sourceCandidate.tree,
    sourceIsAncestor: true,
    changedFiles: [
      'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json',
      'evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json',
    ],
    mergeCommits: [],
  };
  assert.equal(acceptanceOnlyCheckoutValid(valid), true);
  assert.equal(acceptanceOnlyCheckoutValid({
    ...valid,
    changedFiles: [...valid.changedFiles, 'backend/src/server.js'],
  }), false);
  assert.equal(acceptanceOnlyCheckoutValid({
    ...valid,
    mergeCommits: ['c'.repeat(40)],
  }), false);
  assert.equal(acceptanceOnlyCheckoutValid({
    ...valid,
    actualSourceTree: 'd'.repeat(40),
  }), false);
});

test('Founder-local process binding requires matching records, health, and live launcher ownership', () => {
  const launcherPid = 1200;
  const childPid = 1300;
  const lock = {
    schema_version: '1.0.0',
    run_id: TEST_RUN_ID,
    state: 'starting',
    profile: 'founder-local-read-only',
    host: '127.0.0.1',
    port: 4010,
    launcher_pid: launcherPid,
    started_at: '2026-09-06T00:00:00.000Z',
    candidate: TEST_CANDIDATE,
    checkout: TEST_CANDIDATE,
    acceptance_only_checkout: false,
    frontend_dist: TEST_FRONTEND_DIST,
  };
  const record = { ...lock, state: 'running', pid: childPid };
  const runtime = {
    profile: 'founder-local-read-only',
    bind_host: '127.0.0.1',
    bind_port: 4010,
    instance_id: TEST_RUN_ID,
    process_id: childPid,
    launcher_process_id: launcherPid,
    launcher_owned: true,
    candidate: TEST_CANDIDATE,
    checkout: TEST_CANDIDATE,
    frontend_dist: TEST_FRONTEND_DIST,
  };
  const inspectProcess = (pid) => (pid === childPid
    ? { pid, parent_pid: launcherPid, command_line: 'node src/server.js', alive: true }
    : { pid, parent_pid: 10, command_line: 'node scripts/start-founder-local-read-only.js', alive: true });
  const binding = assertFounderLocalProcessBinding({
    lock,
    record,
    runtime,
    candidate: TEST_CANDIDATE,
    frontendDist: TEST_FRONTEND_DIST,
    inspectProcess,
  });
  assert.equal(binding.launcher_owns_runtime, true);
  assert.throws(() => assertFounderLocalProcessBinding({
    lock,
    record: { ...record, run_id: '22222222-2222-4222-8222-222222222222' },
    runtime,
    candidate: TEST_CANDIDATE,
    frontendDist: TEST_FRONTEND_DIST,
    inspectProcess,
  }), { code: 'FOUNDER_LOCAL_RUNTIME_PROCESS_BINDING_INVALID' });
  assert.throws(() => assertFounderLocalProcessBinding({
    lock,
    record,
    runtime,
    candidate: TEST_CANDIDATE,
    frontendDist: TEST_FRONTEND_DIST,
    inspectProcess: (pid) => (pid === childPid
      ? { pid, parent_pid: 999, command_line: 'node src/server.js', alive: true }
      : inspectProcess(pid)),
  }), { code: 'FOUNDER_LOCAL_RUNTIME_PROCESS_BINDING_INVALID' });
});

test('runtime process inspector resolves the current live process and its parent', () => {
  const inspected = inspectLiveProcess(process.pid);
  assert.equal(inspected.pid, process.pid);
  assert.equal(inspected.alive, true);
  assert.ok(Number.isSafeInteger(inspected.parent_pid) && inspected.parent_pid > 0);
  assert.ok(inspected.command_line || inspected.executable_path);
});

test('HTTP policy is admin-read-only with exact advisory file-write exceptions', () => {
  const enabled = { FOUNDER_ADVISORY_CONFIG_ENABLED: '1' };
  const disabled = { FOUNDER_ADVISORY_CONFIG_ENABLED: '0' };
  assert.equal(requestPath({ originalUrl: '/API/CRM/Leads?x=1' }), '/api/crm/leads');
  assert.equal(requestPath({
    path: '/API/CRM/Leads',
    originalUrl: 'http://127.0.0.1:4010/API/CRM/Leads?x=1',
  }), '/api/crm/leads');
  assert.equal(requestPolicy('GET', '/api/business-os/health', enabled), 'authenticated_read');
  assert.equal(requestPolicy('POST', '/api/crm/leads', enabled), 'blocked_write');
  assert.equal(requestPolicy('POST', '/API/CRM/leads', enabled), 'blocked_write');
  assert.equal(requestPolicy('PUT', '/Api/Users/x', enabled), 'blocked_write');
  assert.equal(requestPolicy('DELETE', '/aPi/users/x', enabled), 'blocked_write');
  assert.equal(requestPolicy('DELETE', '/api/users/x', enabled), 'blocked_write');
  assert.equal(requestPolicy('PUT', '/api/business-os/configuration', enabled), 'advisory_configuration');
  assert.equal(requestPolicy('POST', '/api/business-os/configuration/rollback', enabled), 'advisory_configuration');
  assert.equal(requestPolicy('PUT', '/api/business-os/configuration', disabled), 'blocked_write');
  assert.equal(requestPolicy('POST', '/api/business-os/configuration/rollback/extra', enabled), 'blocked_write');
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.10'), false);
  assert.equal(founderLocalSourceReadApproved('GET', '/api/crm/web-dashboard-bootstrap'), true);
  assert.equal(founderLocalSourceReadApproved('GET', '/api/dashboard/overview'), false);
  assert.equal(founderLocalSourceReadApproved('GET', '/api/ecosystem/units/11111111-1111-4111-8111-111111111111'), false);
  assert.equal(founderLocalSourceReadApproved('GET', '/api/drive/files/11111111-1111-4111-8111-111111111111/preview'), false);
});

test('Founder-local source scope is exact, tenant-attested, and rejects a conflicting query', async () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const req = {
    headers: { 'x-founder-local-company-scope': companyId.toUpperCase() },
    query: { company_id: companyId },
  };
  const scope = await attestFounderLocalCompanyScope(req, { tenant_id: 'tenant-test' }, {
    tenantCompanyIds: async (tenantId) => {
      assert.equal(tenantId, 'tenant-test');
      return [companyId];
    },
  });
  assert.deepEqual(scope, {
    key: companyId,
    companyId,
    tenantId: 'tenant-test',
    verified: true,
  });
  assert.equal(req.query.company_id, companyId);

  for (const query of [
    {},
    { company_id: 'all' },
    { company_id: '22222222-2222-4222-8222-222222222222' },
    { company_id: [companyId, companyId] },
  ]) {
    await assert.rejects(attestFounderLocalCompanyScope({
      headers: { 'x-founder-local-company-scope': companyId },
      query,
    }, { tenant_id: 'tenant-test' }, {
      tenantCompanyIds: async () => [companyId],
    }), { code: 'FOUNDER_LOCAL_SCOPE_QUERY_MISMATCH' });
  }

  await assert.rejects(attestFounderLocalCompanyScope({
    headers: { 'x-founder-local-company-scope': '22222222-2222-4222-8222-222222222222' },
    query: {},
  }, { tenant_id: 'tenant-test' }, {
    tenantCompanyIds: async () => [companyId],
  }), { code: 'FOUNDER_LOCAL_SCOPE_DENIED' });
  await assert.rejects(attestFounderLocalCompanyScope({ headers: {}, query: {} }, {
    tenant_id: 'tenant-test',
  }, { tenantCompanyIds: async () => [companyId] }), { code: 'FOUNDER_LOCAL_SCOPE_REQUIRED' });
});

test('real Express query getter cannot bypass Founder-local header/query parity', async (t) => {
  const express = require(path.join(repositoryDir, 'backend/node_modules/express'));
  const companyId = '11111111-1111-4111-8111-111111111111';
  const app = express();
  app.get('/probe', async (req, res) => {
    try {
      const scope = await attestFounderLocalCompanyScope(req, { tenant_id: 'tenant-test' }, {
        tenantCompanyIds: async () => [companyId],
      });
      return res.json({ scope: scope.key, query_company_id: req.query.company_id });
    } catch (error) {
      return res.status(error.status || 500).json({ code: error.code });
    }
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/probe`;
  const request = (suffix) => fetch(`${base}${suffix}`, {
    headers: { 'X-Founder-Local-Company-Scope': companyId },
  });

  const valid = await request(`?company_id=${companyId}`);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { scope: companyId, query_company_id: companyId });
  for (const suffix of ['', '?company_id=all', '?company_id=22222222-2222-4222-8222-222222222222', `?company_id=${companyId}&company_id=${companyId}`]) {
    const denied = await request(suffix);
    assert.equal(denied.status, 400);
    assert.equal((await denied.json()).code, 'FOUNDER_LOCAL_SCOPE_QUERY_MISMATCH');
  }
});

test('tenant context narrows to the trusted Founder-local company and rejects mismatches', async () => {
  const companyA = '11111111-1111-4111-8111-111111111111';
  const companyB = '22222222-2222-4222-8222-222222222222';
  const dependencies = {
    assertActive: async () => ({ ok: true }),
    tenantCompanyIds: async () => [companyA, companyB],
  };
  const exact = {
    user: { role: 'admin', tenant_id: 'tenant-test' },
    founderLocalScope: {
      key: companyA,
      companyId: companyA,
      tenantId: 'tenant-test',
      verified: true,
    },
  };
  await attachTenantContext(exact, dependencies);
  assert.deepEqual(exact.tenantCompanyIds, [companyA]);
  assert.deepEqual(exact.tenantContext.companyIds, [companyA]);

  const all = {
    user: { role: 'admin', tenant_id: 'tenant-test' },
    founderLocalScope: {
      key: 'all', companyId: null, tenantId: 'tenant-test', verified: true,
    },
  };
  await attachTenantContext(all, dependencies);
  assert.deepEqual(all.tenantCompanyIds, [companyA, companyB]);

  await assert.rejects(attachTenantContext({
    user: { role: 'admin', tenant_id: 'tenant-test' },
    founderLocalScope: {
      key: companyA, companyId: companyA, tenantId: 'other-tenant', verified: true,
    },
  }, dependencies), { code: 'founder_local_scope_tenant_mismatch' });
});

test('Founder-local rejects hostile Host and Origin headers before routing', () => {
  const env = {
    RUNTIME_PROFILE: 'founder-local-read-only',
    FOUNDER_LOCAL_PORT: '4010',
  };
  const invoke = (headers) => {
    const result = { statusCode: null, body: null, next: false };
    const res = {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return body; },
    };
    founderLocalHostBoundary({ headers }, res, () => { result.next = true; }, env);
    return result;
  };
  assert.deepEqual(invoke({ host: 'attacker.example:4010' }), {
    statusCode: 403,
    body: {
      error: 'Founder-local chỉ chấp nhận Host localhost đã định cấu hình.',
      code: 'FOUNDER_LOCAL_HOST_REQUIRED',
    },
    next: false,
  });
  assert.equal(invoke({ host: '127.0.0.1:4010', origin: 'https://attacker.example' }).body.code,
    'FOUNDER_LOCAL_ORIGIN_REQUIRED');
  assert.equal(invoke({ host: '127.0.0.1:4010' }).next, true);
  assert.equal(invoke({ host: 'localhost:4010', origin: 'http://localhost:4010' }).next, true);
  assert.equal(invoke({ host: 'localhost:4010', origin: 'http://localhost:5173' }).body.code,
    'FOUNDER_LOCAL_ORIGIN_REQUIRED');
});

test('Founder-local denies unreviewed GET routes before any route side effect', async () => {
  let nextCalls = 0;
  let routeSideEffects = 0;
  const req = {
    method: 'GET',
    originalUrl: '/api/drive/files/11111111-1111-4111-8111-111111111111/preview',
    headers: { authorization: 'Bearer intentionally-not-inspected' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const result = { statusCode: null, body: null, headers: {} };
  const res = {
    set(name, value) { result.headers[name] = value; return this; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return body; },
  };
  await founderLocalReadOnlyMiddleware(req, res, () => {
    nextCalls += 1;
    routeSideEffects += 1;
  });
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.code, 'FOUNDER_LOCAL_READ_ROUTE_NOT_APPROVED');
  assert.equal(nextCalls, 0);
  assert.equal(routeSideEffects, 0);
});

test('absolute-form mixed-case API writes are blocked before Express routing', async (t) => {
  const http = require('node:http');
  const express = require(path.join(repositoryDir, 'backend/node_modules/express'));
  const app = express();
  let sideEffects = 0;
  app.use(founderLocalReadOnlyMiddleware);
  app.all('/API/write-probe', (_req, res) => {
    sideEffects += 1;
    res.json({ ok: true });
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const send = (method) => new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: `http://127.0.0.1:${port}/API/write-probe`,
      headers: { Host: `127.0.0.1:${port}` },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end();
  });
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await send(method);
    assert.equal(response.status, 405);
    assert.equal(response.body.code, 'FOUNDER_LOCAL_WRITE_BLOCKED');
  }
  assert.equal(sideEffects, 0);
});

test('Supabase guard blocks every mutation and only permits audited read RPC', () => {
  class QueryBuilder {
    insert() { return 'insert'; }
    upsert() { return 'upsert'; }
    update() { return 'update'; }
    delete() { return 'delete'; }
  }
  class Client {
    rpc(name) { return `rpc:${name}`; }
  }
  const result = installFounderLocalSupabaseGuard({
    env: { RUNTIME_PROFILE: 'founder-local-read-only' },
    PostgrestQueryBuilder: QueryBuilder,
    SupabaseClient: Client,
  });
  assert.deepEqual(READ_ONLY_RPC_NAMES, [
    'user_has_permission',
    'crm_leads_page_ids',
    'crm_leads_stage_counts',
    'crm_filter_summary',
  ]);
  assert.equal(result.unknown_rpc_blocked, true);
  for (const method of ['insert', 'upsert', 'update', 'delete']) {
    assert.throws(() => new QueryBuilder()[method]({}), {
      code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
    });
  }
  assert.equal(new Client().rpc('user_has_permission'), 'rpc:user_has_permission');
  for (const rpc of ['crm_leads_page_ids', 'crm_leads_stage_counts', 'crm_filter_summary']) {
    assert.equal(new Client().rpc(rpc, { p_company_ids: [] }), `rpc:${rpc}`);
    assert.equal(new Client().rpc(rpc, {
      p_company_ids: ['11111111-1111-4111-8111-111111111111'],
    }), `rpc:${rpc}`);
    assert.equal(new Client().rpc(rpc, {
      p_company_id: '11111111-1111-4111-8111-111111111111',
    }), `rpc:${rpc}`);
    assert.throws(() => new Client().rpc(rpc, {}), {
      code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
    });
    assert.throws(() => new Client().rpc(rpc, { p_company_id: 'not-a-company-id' }), {
      code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
    });
    assert.throws(() => new Client().rpc(rpc, { p_company_ids: null }), {
      code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
    });
    assert.throws(() => new Client().rpc(rpc, { p_company_ids: ['not-a-company-id'] }), {
      code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
    });
  }
  for (const rpc of [
    'knowledge_next_certificate_number',
    'knowledge_random_verify_code',
    'delete_user_hard',
    'increment_public_share_view',
    'unknown_function',
  ]) {
    assert.throws(() => new Client().rpc(rpc), {
      code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
    });
  }
});

test('Supabase guard patches the installed SDK without issuing network requests', () => {
  const result = installFounderLocalSupabaseGuard({
    env: { RUNTIME_PROFILE: 'founder-local-read-only' },
  });
  assert.equal(result.installed, true);
  const { createClient } = require(path.join(repositoryDir, 'backend/node_modules/@supabase/supabase-js'));
  const client = createClient('https://founder-local-test.invalid', 'test-only-placeholder', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.throws(() => client.from('probe').insert({ value: 1 }), {
    code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
  });
  assert.throws(() => client.rpc('unknown_mutating_or_unreviewed_rpc'), {
    code: 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED',
  });
  assert.ok(client.rpc('user_has_permission'));
});

test('Founder-local CRM drilldown RPC allowlist is backed by SELECT-only scoped SQL', () => {
  const audits = [
    {
      file: 'database/562_crm_leads_page_ids_fast_path.sql',
      functions: ['crm_leads_page_ids', 'crm_leads_stage_counts'],
    },
    {
      file: 'database/559_crm_filter_summary_kanban_tenant_scope.sql',
      functions: ['crm_filter_summary'],
    },
  ];
  for (const audit of audits) {
    const sql = fs.readFileSync(path.join(repositoryDir, audit.file), 'utf8');
    for (const rpc of audit.functions) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${rpc}(`);
    assert.ok(start >= 0, `${rpc} definition is missing`);
    const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 1);
    const definition = sql.slice(start, next >= 0 ? next : undefined);
    const bodyStart = definition.indexOf('AS $$');
    const bodyEnd = definition.indexOf('$$;', bodyStart + 5);
    assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `${rpc} function body is missing`);
    const functionBody = definition.slice(bodyStart + 5, bodyEnd);
    assert.match(definition, /\bSTABLE\b/i);
    assert.match(definition, /SECURITY INVOKER/i);
    assert.match(definition, /p_company_id uuid DEFAULT NULL/i);
    assert.match(definition, /p_company_ids uuid\[\] DEFAULT NULL/i);
    assert.match(definition, /p_company_id IS NULL OR l\.company_id = p_company_id/i);
    assert.match(definition, /p_company_ids IS NULL OR l\.company_id = ANY\(p_company_ids\)/i);
    assert.doesNotMatch(functionBody, /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|EXECUTE)\b/i);
    }
  }
});

function readOnlyUserClient(user) {
  return {
    from(table) {
      assert.equal(table, 'users');
      return {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        async limit() { return { data: user ? [user] : [], error: null }; },
      };
    },
  };
}

test('Founder-local password login verifies credentials, tenant and admin without writes', async () => {
  const user = {
    id: 'admin-test',
    email: 'founder@example.test',
    password: 'stored-hash',
    role: 'admin',
    tenant_id: 'tenant-test',
    is_active: true,
  };
  let sessionOptions;
  const session = await authenticateFounderLocalPassword({
    email: user.email,
    password: 'correct',
    session_id: 'session-test',
  }, {
    client: readOnlyUserClient(user),
    comparePassword: async (plain, hash) => plain === 'correct' && hash === 'stored-hash',
    assertActiveTenant: async (tenantId) => ({ ok: tenantId === 'tenant-test' }),
    buildSession: async (_user, opts) => {
      sessionOptions = opts;
      return { token: 'test-token', session_id: opts.sessionId, user: { role: 'admin' } };
    },
  });
  assert.equal(session.token, 'test-token');
  assert.equal(session.session_id, 'session-test');
  assert.equal(session.read_only, true);
  assert.equal(session.runtime_profile, 'founder-local-read-only');
  assert.equal(sessionOptions.expiresInSeconds, FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS);
  assert.equal(sessionOptions.audience, FOUNDER_LOCAL_JWT_AUDIENCE);
});

test('Founder-local token policy rejects standard, no-expiry and overlong tokens', () => {
  const jwt = require(path.join(repositoryDir, 'backend/node_modules/jsonwebtoken'));
  const secret = 'founder-local-token-policy-test-secret';
  const baseClaims = {
    userId: 'admin-test',
    role: 'admin',
    tenant_id: 'tenant-test',
    session_purpose: FOUNDER_LOCAL_JWT_PURPOSE,
  };
  const standardToken = jwt.sign({ userId: 'admin-test', role: 'admin' }, secret, { expiresIn: 600 });
  const noExpiryToken = jwt.sign(baseClaims, secret, { audience: FOUNDER_LOCAL_JWT_AUDIENCE });
  const overlongToken = jwt.sign(baseClaims, secret, {
    audience: FOUNDER_LOCAL_JWT_AUDIENCE,
    expiresIn: FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS + 60,
  });
  const validFounderToken = jwt.sign(baseClaims, secret, {
    audience: FOUNDER_LOCAL_JWT_AUDIENCE,
    expiresIn: 600,
  });

  for (const token of [standardToken, noExpiryToken, overlongToken]) {
    assert.throws(() => verifyFounderLocalAccessToken(token, { secret }), {
      code: 'FOUNDER_LOCAL_TOKEN_POLICY_INVALID',
    });
  }
  const verified = verifyFounderLocalAccessToken(validFounderToken, { secret });
  assert.equal(verified.userId, 'admin-test');
  assert.equal(verified.aud, FOUNDER_LOCAL_JWT_AUDIENCE);
  assert.equal(verified.session_purpose, FOUNDER_LOCAL_JWT_PURPOSE);
  assert.ok(verified.exp - verified.iat <= FOUNDER_LOCAL_MAX_SESSION_TTL_SECONDS);
});

test('Founder-local login refuses non-admin even with a valid password', async () => {
  const user = {
    id: 'user-test',
    email: 'user@example.test',
    password: 'stored-hash',
    role: 'manager',
    tenant_id: 'tenant-test',
    is_active: true,
  };
  await assert.rejects(authenticateFounderLocalPassword({
    email: user.email,
    password: 'correct',
  }, {
    client: readOnlyUserClient(user),
    comparePassword: async () => true,
  }), { code: 'FOUNDER_LOCAL_ADMIN_REQUIRED' });
});

test('Founder-local CORS excludes public production origin', () => {
  const previous = {
    RUNTIME_PROFILE: process.env.RUNTIME_PROFILE,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };
  process.env.RUNTIME_PROFILE = 'founder-local-read-only';
  process.env.CORS_ORIGINS = 'http://127.0.0.1:4010,http://localhost:4010';
  process.env.FRONTEND_URL = 'http://127.0.0.1:4010';
  const config = require(path.join(repositoryDir, 'backend/src/config'));
  const origins = config.resolveCorsOrigins();
  assert.deepEqual(origins.sort(), ['http://127.0.0.1:4010', 'http://localhost:4010'].sort());
  for (const [key, value] of Object.entries(previous)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

test('static startup wiring skips known writers and denies business uploads', () => {
  const server = fs.readFileSync(path.join(repositoryDir, 'backend/src/server.js'), 'utf8');
  const launcher = fs.readFileSync(path.join(repositoryDir, 'backend/scripts/start-founder-local-read-only.js'), 'utf8');
  const stopper = fs.readFileSync(path.join(repositoryDir, 'backend/scripts/stop-founder-local-read-only.js'), 'utf8');
  const runtimeProvenance = fs.readFileSync(path.join(
    repositoryDir,
    'backend/src/config/founderLocalRuntimeProvenance.js',
  ), 'utf8');
  const runtimeVerifier = fs.readFileSync(path.join(
    repositoryDir,
    'evidence/internal-live-operation-v1/runtime-safety/verify-founder-local-runtime.js',
  ), 'utf8');
  const facebook = fs.readFileSync(path.join(repositoryDir, 'backend/src/routes/facebook.js'), 'utf8');
  const configIndex = fs.readFileSync(path.join(repositoryDir, 'backend/src/config/index.js'), 'utf8');
  const supabaseConfig = fs.readFileSync(path.join(repositoryDir, 'backend/src/config/supabase.js'), 'utf8');
  const guard = fs.readFileSync(path.join(repositoryDir, 'backend/src/helpers/founderLocalSupabaseGuard.js'), 'utf8');
  assert.match(server, /app\.use\('\/uploads',[\s\S]*FOUNDER_LOCAL_UPLOADS_DISABLED/);
  assert.match(server, /if \(!founderRealtimeDisabled\) \{[\s\S]*io\.use\([\s\S]*io\.on\('connection'/);
  assert.match(server, /if \(!backgroundWritersAllowed\(\)\) \{[\s\S]*Startup\/background writers skipped[\s\S]*return;/);
  assert.match(server, /server\.listen\(binding\.port,[\s\S]*binding\.host/);
  assert.match(server, /if \(!runtimeState\.active\) require\('dotenv'\)\.config/);
  assert.match(configIndex, /RUNTIME_PROFILE[\s\S]*founder-local-read-only[\s\S]*require\('dotenv'\)\.config/);
  assert.match(facebook, /backgroundWritersAllowed\(\) && cfg\?\.enabled/);
  assert.match(facebook, /!backgroundWritersAllowed\(\) \|\| !fbToolsResumeOnBoot\(\)/);
  assert.match(supabaseConfig, /SUPABASE_HEALTH_CHECK_DISABLED/);
  assert.doesNotMatch(guard, /founderAdvisoryWriteScopeActive|runInFounderAdvisoryWriteScope/);
  assert.match(runtimeProvenance, /business_ai_os_founder_local_dist_v1/);
  assert.match(runtimeProvenance, /api_origin_policy:\s*'same-origin-only'/);
  assert.match(launcher, /readFounderLocalDistIdentity\(repositoryDir\)/);
  assert.match(launcher, /buildFounderLocalChildEnvironment/);
  assert.match(launcher, /process\.lock\.json/);
  assert.match(launcher, /flag:\s*'wx'/);
  assert.match(runtimeProvenance, /FOUNDER_LOCAL_RUN_ID/);
  assert.match(launcher, /readFounderLocalCandidateBinding/);
  assert.match(launcher, /readFounderLocalDistIdentity/);
  assert.match(runtimeProvenance, /FOUNDER_LOCAL_FRONTEND_DIST_SHA256/);
  assert.match(launcher, /founder-local-ready-v1/);
  assert.match(launcher, /candidateBindingAfter/);
  assert.match(stopper, /assertFounderLocalProcessBinding/);
  assert.match(stopper, /process\.kill\(record\.launcher_pid, 'SIGTERM'\)/);
  assert.match(stopper, /waitForOwnedRuntimeStop/);
  assert.doesNotMatch(stopper, /process\.kill\(record\.pid, 'SIGTERM'\)/);
  assert.match(server, /assertFounderLocalRuntimeFileBinding/);
  assert.match(server, /typeof process\.send !== 'function'[\s\S]*process\.connected !== true/);
  assert.match(server, /process\.send\(\{/);
  assert.match(server, /process\.once\('disconnect', \(\) => process\.exit\(1\)\)/);
  assert.doesNotMatch(server, /http:\/\/(?:127\.0\.0\.1|localhost):5173/);
  assert.match(runtimeVerifier, /chromium\.launch\(\{/);
  assert.match(runtimeVerifier, /browser\.newContext\(\)/);
  assert.doesNotMatch(runtimeVerifier, /launchPersistentContext/);
  assert.match(runtimeVerifier, /window\.sessionStorage\.setItem\('token'/);
  assert.match(runtimeVerifier, /removeStaleAcceptanceProfiles/);
  assert.match(runtimeVerifier, /assertFounderLocalProcessBinding/);
  assert.match(server, /founderLocalHostBoundary/);
  assert.match(server, /app\.set\('trust proxy', runtimeState\.active \? false/);
});
