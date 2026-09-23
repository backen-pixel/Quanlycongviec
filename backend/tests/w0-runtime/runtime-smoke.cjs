'use strict';

// Bounded integration harness: actual HTTP/JWT/SDK + actual candidate source.
// Persistence is an explicit in-memory PostgREST simulator, NOT PostgreSQL/RLS.
// Run: node runtime-smoke.cjs --repo ABS_REPO --deps ABS_BACKEND --output ABS_DIR
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const args = Object.create(null);
for (let i = 2; i < process.argv.length; i += 2) {
  assert.ok(['--repo', '--deps', '--output'].includes(process.argv[i]), 'Unsupported argument');
  assert.ok(process.argv[i + 1], 'Missing argument value');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
for (const key of ['repo', 'deps', 'output']) assert.ok(path.isAbsolute(args[key] || ''), `${key} must be absolute`);
const expectedVersions = { express: '5.2.1', jsonwebtoken: '9.0.3', '@supabase/supabase-js': '2.98.0' };
const lockBytes = fs.readFileSync(path.join(args.repo, 'backend', 'package-lock.json'));
const lock = JSON.parse(lockBytes.toString('utf8'));
const lockHash = crypto.createHash('sha256').update(lockBytes).digest('hex');
const runnerHash = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
for (const [name, expected] of Object.entries(expectedVersions)) {
  assert.equal(lock.packages?.[`node_modules/${name}`]?.version, expected, `Candidate lock version mismatch: ${name}`);
}
const depRequire = createRequire(path.join(args.deps, 'package.json'));
const versions = {};
for (const [name, expected] of Object.entries(expectedVersions)) {
  let dir = path.dirname(depRequire.resolve(name));
  for (;;) {
    const filename = path.join(dir, 'package.json');
    if (fs.existsSync(filename)) {
      const pkg = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (pkg.name === name) { versions[name] = pkg.version; break; }
    }
    const parent = path.dirname(dir);
    assert.notEqual(parent, dir, `Package metadata missing: ${name}`);
    dir = parent;
  }
  assert.equal(versions[name], expected, `Unexpected ${name} version`);
}
const express = depRequire('express');
const jwt = depRequire('jsonwebtoken');
const { createClient } = depRequire('@supabase/supabase-js');
const nativeFetch = globalThis.fetch;
assert.equal(typeof nativeFetch, 'function', 'Node native fetch required');

const I = Object.freeze({
  tenant: '11111111-1111-4111-8111-111111111111',
  otherTenant: '22222222-2222-4222-8222-222222222222',
  inactiveTenant: '33333333-3333-4333-8333-333333333333',
  emptyTenant: '77777777-7777-4777-8777-777777777777',
  companyA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  companyB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  companyC: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  manager: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  employee: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  admin: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  emptyAdmin: '88888888-8888-4888-8888-888888888888',
  platformAdmin: '12121212-1212-4212-8212-121212121212',
  legacyAdmin: '13131313-1313-4313-8313-131313131313',
  lead: '44444444-4444-4444-8444-444444444444',
  leadB: '55555555-5555-4555-8555-555555555555',
  foreignLead: '66666666-6666-4666-8666-666666666666',
});
const sourceHashes = {};
const reads = [];
const fixtureRejections = [];
const transportRejections = [];
const forbiddenCalls = [];
const authEvents = [];
const routeErrors = [];
const tests = [];
const servers = [];
let stopping = false;
const secrets = { jwt: crypto.randomBytes(48).toString('hex') };
const startedAt = new Date().toISOString();
const uuid = (n) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
function row(status, n, extra = {}) {
  return { unified_id: `task:${uuid(n)}`, source: 'task', task_kind: 'SX', status,
    deadline: '2099-01-15', title: 'Fixture task', company_id: I.companyA,
    assignee_id: I.employee, created_by_id: I.manager, lead_id: I.lead, ...extra };
}
function baseline() {
  return [row('done', 1), row('completed', 2, { assignee_id: I.manager }),
    row('cancelled', 3), row('pending', 4),
    row('pending', 5, { company_id: I.companyB, lead_id: I.leadB }),
    row('pending', 6, { company_id: I.companyC, lead_id: I.foreignLead, title: 'Outside tenant synthetic sentinel' })];
}
let taskRows = baseline();
const tables = {
  tenants: [
    { id: I.tenant, tier: 'test', max_users: 10, max_companies: 2, subscription_start: null, subscription_end: null, is_active: true },
    { id: I.inactiveTenant, tier: 'test', max_users: 10, max_companies: 1, subscription_start: null, subscription_end: null, is_active: false },
    { id: I.emptyTenant, tier: 'test', max_users: 10, max_companies: 2, subscription_start: null, subscription_end: null, is_active: true },
  ],
  companies: [{ id: I.companyA, tenant_id: I.tenant }, { id: I.companyB, tenant_id: I.tenant }, { id: I.companyC, tenant_id: I.otherTenant }],
  users: [{ id: I.manager, tenant_id: I.tenant, company_id: I.companyA, department_id: null },
    { id: I.employee, tenant_id: I.tenant, company_id: I.companyA, department_id: null },
    { id: I.admin, tenant_id: I.tenant, company_id: null, department_id: null },
    { id: I.emptyAdmin, tenant_id: I.emptyTenant, company_id: null, department_id: null },
    { id: I.platformAdmin, tenant_id: null, company_id: null, department_id: null },
    { id: I.legacyAdmin, tenant_id: null, company_id: null, department_id: null }],
  user_company_regions: [],
  crm_leads: [
    { id: I.lead, company_id: I.companyA, assigned_to: I.employee, lead_owner_id: I.manager },
    { id: I.leadB, company_id: I.companyB, assigned_to: I.employee, lead_owner_id: I.manager },
    { id: I.foreignLead, company_id: I.companyC, assigned_to: I.employee, lead_owner_id: I.manager },
  ],
};
const columns = {
  tenants: new Set(['id', 'tier', 'max_users', 'max_companies', 'subscription_start', 'subscription_end', 'is_active']),
  companies: new Set(['id', 'tenant_id']),
  users: new Set(['id', 'tenant_id', 'company_id', 'department_id']),
  user_company_regions: new Set(['user_id', 'region_id']),
  crm_leads: new Set(['id', 'company_id', 'assigned_to', 'lead_owner_id']),
  unified_tasks_v: new Set(Object.keys(row('pending', 1))),
};
function splitTop(text) {
  let depth = 0, start = 0;
  const parts = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    assert.ok(depth >= 0, 'Malformed filter');
    if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  assert.equal(depth, 0, 'Malformed filter');
  parts.push(text.slice(start));
  return parts;
}
function predicate(table, column, expression) {
  assert.ok(columns[table].has(column), 'Unsupported filter column');
  if (expression.startsWith('eq.')) return (r) => String(r[column]) === expression.slice(3);
  if (expression.startsWith('in.(') && expression.endsWith(')')) {
    const values = splitTop(expression.slice(4, -1));
    return (r) => values.includes(String(r[column]));
  }
  if (expression.startsWith('not.in.(') && expression.endsWith(')')) {
    const values = splitTop(expression.slice(8, -1));
    return (r) => r[column] != null && !values.includes(String(r[column]));
  }
  for (const op of ['gte', 'lte', 'lt']) {
    if (expression.startsWith(`${op}.`)) {
      const value = expression.slice(op.length + 1);
      return (r) => r[column] != null && (op === 'gte' ? String(r[column]) >= value : op === 'lte' ? String(r[column]) <= value : String(r[column]) < value);
    }
  }
  if (expression.startsWith('ilike.')) {
    const pattern = expression.slice(6);
    assert.ok(pattern.startsWith('%') && pattern.endsWith('%') && !/[%_*]/.test(pattern.slice(1, -1)), 'Unsupported ilike pattern');
    return (r) => String(r[column] || '').toLowerCase().includes(pattern.slice(1, -1).toLowerCase());
  }
  throw new Error('Unsupported filter operation');
}
function fixtureHandler(req, res) {
  try {
    assert.equal(req.method, 'GET', 'Fixture permits GET only');
    const url = new URL(req.url, 'http://127.0.0.1');
    const match = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    assert.ok(match && Object.hasOwn(columns, match[1]), 'Unsupported fixture resource');
    const table = match[1];
    let data = (table === 'unified_tasks_v' ? taskRows : tables[table]).slice();
    let selected = null, limit = Infinity;
    for (const [key, value] of url.searchParams) {
      if (key === 'select') {
        selected = value.split(',').map((x) => x.trim());
        assert.ok(selected.length && selected.every((x) => columns[table].has(x)), 'Unsupported select');
      } else if (key === 'limit') {
        assert.match(value, /^\d+$/);
        limit = Number(value);
        assert.ok(limit <= 5000, 'Excessive fixture limit');
      } else if (key === 'or') {
        assert.ok(value.startsWith('(') && value.endsWith(')'), 'Malformed or');
        const alternatives = splitTop(value.slice(1, -1)).map((part) => {
          const at = part.indexOf('.');
          assert.ok(at > 0, 'Malformed or term');
          return predicate(table, part.slice(0, at), part.slice(at + 1));
        });
        data = data.filter((r) => alternatives.some((fn) => fn(r)));
      } else data = data.filter(predicate(table, key, value));
    }
    assert.ok(selected, 'Select must be explicit');
    const count = data.length;
    const sliced = data.slice(0, limit).map((r) => Object.fromEntries(selected.map((key) => [key, r[key] ?? null])));
    const countRequested = String(req.headers.prefer || '').split(',').some((x) => x.trim() === 'count=exact');
    reads.push({ table, query: [...url.searchParams], count_requested: countRequested, matched: count, returned: sliced.length });
    res.setHeader('Content-Type', 'application/json');
    if (countRequested) res.setHeader('Content-Range', sliced.length ? `0-${sliced.length - 1}/${count}` : `*/${count}`);
    if (String(req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
      assert.ok(sliced.length <= 1, 'Multiple rows for singular response');
      res.end(JSON.stringify(sliced[0] || null));
    } else res.end(JSON.stringify(sliced));
  } catch (err) {
    fixtureRejections.push({ method: req.method, reason: err.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'FIXTURE_UNSUPPORTED', message: 'Fixture request rejected' }));
  }
}
async function listen(server) {
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const record = { server, sockets, port: server.address().port };
  servers.push(record);
  return `http://127.0.0.1:${record.port}`;
}
function deny(name) {
  return () => { forbiddenCalls.push(name); throw new Error(`Forbidden side effect: ${name}`); };
}
function deniedExports(names) { return Object.fromEntries(names.map((name) => [name, deny(name)])); }
function load(relative, imports) {
  const filename = path.join(args.repo, 'backend', relative);
  const bytes = fs.readFileSync(filename);
  sourceHashes[relative] = crypto.createHash('sha256').update(bytes).digest('hex');
  const module = { exports: {} };
  vm.runInNewContext(bytes.toString('utf8'), {
    module, exports: module.exports,
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unapproved import in ${relative}: ${name}`); return imports[name]; },
    process: { env: Object.freeze({ AUTO_LOGOUT_AT_MIDNIGHT: '0' }) },
    console: { error: () => routeErrors.push('route_logged_error'), warn: () => routeErrors.push('route_logged_warning') },
  }, { filename, timeout: 1500 });
  return module.exports;
}
async function runTest(name, action) {
  if (stopping && !name.startsWith('Both owned')) throw new Error('Harness cancelled');
  const start = performance.now();
  try { await action(); tests.push({ name, result: 'PASS', duration_ms: Math.round(performance.now() - start) }); }
  catch (err) { tests.push({ name, result: 'FAIL', duration_ms: Math.round(performance.now() - start), error: String(err.message).slice(0, 1500) }); }
}
async function closedPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', (err) => { socket.destroy(); resolve(err.code === 'ECONNREFUSED'); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
async function main() {
  let fixtureOrigin, appOrigin;
  let fatal = null;
  let timer;
  try {
    fixtureOrigin = await listen(http.createServer(fixtureHandler));
    const guardedFetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      if (url.origin !== fixtureOrigin || url.username || url.password || !url.pathname.startsWith('/rest/v1/')) {
        transportRejections.push('non_fixture_destination');
        throw new Error('Transport destination outside assigned fixture');
      }
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      if (method !== 'GET') { transportRejections.push('non_read_method'); throw new Error('Transport permits GET only'); }
      return nativeFetch(input, { ...init, method, redirect: 'error', signal: AbortSignal.timeout(5000) });
    };
    const supabase = createClient(fixtureOrigin, 'synthetic-local-key-not-a-credential', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: guardedFetch },
    });
    const adminRole = load('src/helpers/adminRole.js', {});
    const memoryCache = { createTTLCache: () => {
      const cache = new Map();
      return { async getOrFetch(k, f) { if (!cache.has(k)) cache.set(k, await f()); return cache.get(k); },
        async invalidateRemote(k) { if (k == null) cache.clear(); else cache.delete(k); } };
    } };
    const tenantScope = load('src/helpers/tenantScope.js', {
      '../config/supabase': { supabase }, './ttlCache': memoryCache, './adminRole': adminRole,
    });
    const tenantGate = load('src/middleware/tenantGate.js', { '../helpers/tenantScope': tenantScope });
    const authModule = load('src/middleware/auth.js', {
      jsonwebtoken: jwt, '../config': { jwtSecret: secrets.jwt }, '../config/supabase': { supabase },
      '../helpers/authEventLog': { logAuthEvent: async (event) => { authEvents.push({ event: event.event, reason: event.reason }); } },
      './tenantGate': tenantGate,
    });
    const helper = load('src/helpers/unifiedTasksQuery.js', { '../config/supabase': { supabase }, './adminRole': adminRole });
    const router = load('src/routes/workTasks.js', {
      express, '../middleware/auth': authModule, '../config/supabase': { supabase }, '../helpers/adminRole': adminRole,
      '../helpers/projectTaskMutations': deniedExports(['createProjectTask', 'updateProjectTask', 'deleteProjectTask', 'addProjectTaskComment', 'toggleProjectTaskChecklist']),
      '../helpers/crmLeadTaskMutations': deniedExports(['createCrmLeadTask', 'updateCrmLeadTask', 'deleteCrmLeadTask', 'getCrmTaskLeadId']),
      '../helpers/crmAssignmentMutations': deniedExports(['createCrmAssignment', 'updateCrmAssignment', 'deleteCrmAssignment', 'addCrmAssignmentComment']),
      '../helpers/crmTaskLeadAccess': deniedExports(['assertCrmTaskLeadAccess', 'loadLeadForTaskAccess']),
      '../helpers/notifications': deniedExports(['createNotification']),
      '../helpers/crmKanbanDeadlineHistory': deniedExports(['mergeDeadlineHistoryIntoUnified']),
      '../helpers/crmTaskAttachmentCounts': deniedExports(['enrichUnifiedCrmTasks']),
      '../helpers/unifiedTasksQuery': helper,
    });
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
      if (req.method !== 'GET') return res.status(405).json({ code: 'TEST_READ_ONLY' });
      if (req.path !== '/api/work-tasks/summary') return res.status(404).json({ code: 'TEST_ROUTE_NOT_ALLOWED' });
      return next();
    });
    app.use('/api/work-tasks', router);
    app.use((err, req, res, next) => res.status(500).json({ code: 'TEST_UNEXPECTED_SERVER_ERROR' }));
    appOrigin = await listen(http.createServer(app));
    const claims = (overrides = {}) => ({ userId: I.manager, role: 'manager', tenant_id: I.tenant, company_id: I.companyA, crm_region_ids: [], ...overrides });
    const token = (payload = claims(), opts = {}) => jwt.sign(payload, secrets.jwt, { algorithm: 'HS256', expiresIn: '10m', ...opts });
    const tenantAdminClaims = () => claims({ userId: I.admin, role: 'admin', company_id: null });
    const tenantCompanyFilter = `in.(${I.companyA},${I.companyB})`;
    function assertTenantCompanyFilter(read) {
      assert.ok(read, 'Expected an actual fixture read');
      assert.ok(new URLSearchParams(read.query).getAll('company_id').includes(tenantCompanyFilter), 'Verified tenant companies must be serialized as an additional IN filter');
    }
    async function request({ query = {}, bearer = token(), method = 'GET', route = '/api/work-tasks/summary' } = {}) {
      assert.equal(stopping, false, 'Harness cancelled');
      const url = new URL(route, appOrigin);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const response = await nativeFetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(5000), headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
      return { status: response.status, body: await response.json() };
    }
    const scenario = async () => {
      await runTest('HTTP rejects unauthenticated request before fixture reads', async () => {
        const before = reads.length; const r = await request({ bearer: null }); assert.equal(r.status, 401); assert.equal(reads.length, before);
      });
      await runTest('Actual JWT verification rejects wrong-signature token', async () => {
        const before = reads.length; const bad = jwt.sign(claims(), 'unrelated-test-signing-secret', { expiresIn: '10m' });
        assert.equal((await request({ bearer: bad })).status, 401); assert.equal(reads.length, before);
      });
      await runTest('Actual JWT verification rejects expired token', async () => {
        const before = reads.length; assert.equal((await request({ bearer: token(claims(), { expiresIn: -10 }) })).status, 401); assert.equal(reads.length, before);
      });
      await runTest('Real auth tenant lookup rejects inactive tenant', async () => {
        const before = reads.filter((r) => r.table === 'unified_tasks_v').length;
        const r = await request({ bearer: token(claims({ tenant_id: I.inactiveTenant })) });
        assert.equal(r.status, 403); assert.equal(r.body.code, 'tenant_inactive');
        assert.equal(reads.filter((x) => x.table === 'unified_tasks_v').length, before);
      });
      await runTest('Real tenant gate rejects explicit company outside tenant', async () => {
        const before = reads.filter((r) => r.table === 'unified_tasks_v').length;
        const r = await request({ query: { company_id: I.companyC } });
        assert.equal(r.status, 403); assert.equal(r.body.code, 'tenant_company_denied');
        assert.equal(reads.filter((x) => x.table === 'unified_tasks_v').length, before);
      });
      await runTest('Real HTTP route and SDK return separate completion and cancellation counts', async () => {
        const r = await request(); assert.equal(r.status, 200);
        assert.deepEqual(Object.fromEntries(['total', 'done', 'cancelled', 'closed', 'open'].map((k) => [k, r.body[k]])), { total: 4, done: 2, cancelled: 1, closed: 3, open: 1 });
        assert.equal(r.body.coverage, 'EXACT'); assert.equal(r.body.source_total_rows, 4);
        const read = reads.at(-1); assert.equal(read.count_requested, true); assert.equal(read.matched, 4);
        assertTenantCompanyFilter(read);
        assert.ok(new URLSearchParams(read.query).getAll('company_id').includes(`eq.${I.companyA}`), 'Manager company filter must remain in addition to tenant scope');
      });
      await runTest('Company lookup through SDK fills a signed token missing company claim', async () => {
        const payload = claims(); delete payload.company_id;
        const before = reads.length; const r = await request({ bearer: token(payload) });
        assert.equal(r.status, 200); assert.equal(r.body.total, 4);
        assert.ok(reads.slice(before).some((x) => x.table === 'users'));
      });
      await runTest('Actual employee role filters by assignee or creator', async () => {
        const r = await request({ bearer: token(claims({ userId: I.employee, role: 'employee' })) });
        assert.equal(r.status, 200); assert.equal(r.body.total, 3); assert.equal(r.body.done, 1); assert.equal(r.body.cancelled, 1);
      });
      await runTest('SDK serializes count and all requested filters over real HTTP', async () => {
        const r = await request({ query: { status: 'pending', task_kind: 'SX', q: 'Fixture', date_from: '2099-01-01', date_to: '2099-02-01', open_only: 'true' } });
        assert.equal(r.status, 200); assert.equal(r.body.total, 1); assert.equal(r.body.source_total_rows, 1);
        const read = reads.at(-1); const query = new URLSearchParams(read.query);
        for (const [key, value] of [['company_id', `eq.${I.companyA}`], ['status', 'eq.pending'], ['task_kind', 'eq.SX'], ['title', 'ilike.%Fixture%'], ['deadline', 'gte.2099-01-01']]) assert.ok(query.getAll(key).includes(value));
        assert.ok(query.getAll('deadline').includes('lte.2099-02-01')); assert.ok(query.getAll('status').includes('not.in.(done,completed,cancelled)'));
        assert.equal(read.count_requested, true); assert.equal(read.matched, 1);
      });
      await runTest('SDK exact count preserves PARTIAL for 3001 matching fixture rows', async () => {
        taskRows = Array.from({ length: 3001 }, (_, n) => row('pending', n + 1));
        try { const r = await request(); assert.equal(r.status, 200); assert.equal(r.body.total, 3000); assert.equal(r.body.source_total_rows, 3001); assert.equal(r.body.coverage, 'PARTIAL'); assert.equal(r.body.count_relation, 'gte'); }
        finally { taskRows = baseline(); }
      });
      await runTest('Assignee lead lookup remains UNKNOWN despite exact scoped count', async () => {
        const r = await request({ query: { assignee_id: I.employee } }); assert.equal(r.status, 200); assert.equal(r.body.total, 4); assert.equal(r.body.coverage, 'UNKNOWN'); assert.equal(r.body.assignee_scope_complete, null);
      });
      await runTest('Explicit lead bypasses uncertain assignee lookup', async () => {
        const before = reads.length; const r = await request({ query: { lead_id: I.lead, assignee_id: I.employee } });
        assert.equal(r.status, 200); assert.equal(r.body.coverage, 'EXACT'); assert.equal(reads.slice(before).some((x) => x.table === 'crm_leads'), false);
      });
      await runTest('Tenant administrator without company filter excludes other tenant rows', async () => {
        const payload = claims({ userId: I.admin, role: 'admin' }); delete payload.company_id;
        const r = await request({ bearer: token(payload) }); assert.equal(r.status, 200);
        assert.equal(r.body.total, 5, 'Expected only 5 rows in the verified tenant; foreign-tenant synthetic sentinel must be excluded');
        assert.equal(r.body.source_total_rows, 5); assert.equal(r.body.coverage, 'EXACT');
        const read = reads.at(-1); assert.equal(read.table, 'unified_tasks_v');
        assert.equal(read.count_requested, true); assert.equal(read.matched, 5); assertTenantCompanyFilter(read);
      });
      await runTest('Tenant administrator can select company B within verified tenant', async () => {
        const r = await request({ bearer: token(tenantAdminClaims()), query: { company_id: I.companyB } });
        assert.equal(r.status, 200); assert.equal(r.body.total, 1); assert.equal(r.body.source_total_rows, 1);
        const read = reads.at(-1); assertTenantCompanyFilter(read);
        assert.ok(new URLSearchParams(read.query).getAll('company_id').includes(`eq.${I.companyB}`));
        assert.equal(read.count_requested, true); assert.equal(read.matched, 1);
      });
      await runTest('Tenant administrator assignee lookup scopes both leads and task count over HTTP', async () => {
        const before = reads.length;
        const r = await request({ bearer: token(tenantAdminClaims()), query: { assignee_id: I.employee } });
        assert.equal(r.status, 200); assert.equal(r.body.total, 5); assert.equal(r.body.source_total_rows, 5); assert.equal(r.body.coverage, 'UNKNOWN');
        const newReads = reads.slice(before);
        const leadReads = newReads.filter((x) => x.table === 'crm_leads');
        const taskReads = newReads.filter((x) => x.table === 'unified_tasks_v');
        assert.equal(leadReads.length, 1); assert.equal(taskReads.length, 1);
        assertTenantCompanyFilter(leadReads[0]); assertTenantCompanyFilter(taskReads[0]);
        assert.equal(leadReads[0].matched, 2, 'Foreign assignee lead must be excluded before task lookup');
        assert.equal(taskReads[0].count_requested, true); assert.equal(taskReads[0].matched, 5);
        const leadQuery = new URLSearchParams(leadReads[0].query);
        assert.equal(leadQuery.get('or'), `(assigned_to.eq.${I.employee},lead_owner_id.eq.${I.employee})`);
        const taskQuery = new URLSearchParams(taskReads[0].query);
        assert.equal(taskQuery.get('or'), `(assignee_id.eq.${I.employee},lead_id.in.(${I.lead},${I.leadB}))`);
      });
      await runTest('Active tenant with no companies returns empty summary without lead or task reads', async () => {
        const bearer = token(claims({ userId: I.emptyAdmin, role: 'admin', tenant_id: I.emptyTenant, company_id: null }));
        for (const query of [{}, { assignee_id: I.employee }]) {
          const before = reads.length;
          const r = await request({ bearer, query });
          assert.equal(r.status, 200);
          for (const key of ['total', 'done', 'cancelled', 'closed', 'open', 'source_total_rows']) assert.equal(r.body[key], 0, `${key} must be zero for empty verified tenant`);
          assert.equal(reads.slice(before).some((x) => x.table === 'crm_leads' || x.table === 'unified_tasks_v'), false);
        }
      });
      await runTest('Forged query tenantContext and companyIds cannot broaden trusted tenant scope', async () => {
        const forged = { enforced: true, tenantId: I.otherTenant, companyIds: [I.companyC] };
        const r = await request({ bearer: token(tenantAdminClaims()), query: {
          companyIds: [I.companyA, I.companyB, I.companyC].join(','),
          tenantCompanyIds: I.companyC,
          tenantContext: JSON.stringify(forged),
          trustedTenantContext: JSON.stringify(forged),
        } });
        assert.equal(r.status, 200); assert.equal(r.body.total, 5); assert.equal(r.body.source_total_rows, 5);
        const read = reads.at(-1); assertTenantCompanyFilter(read);
        assert.deepEqual(new URLSearchParams(read.query).getAll('company_id'), [tenantCompanyFilter]);
      });
      await runTest('Explicit foreign lead intersects verified companies and returns zero rows', async () => {
        const before = reads.length;
        const r = await request({ bearer: token(tenantAdminClaims()), query: { lead_id: I.foreignLead, assignee_id: I.employee } });
        assert.equal(r.status, 200); assert.equal(r.body.total, 0); assert.equal(r.body.source_total_rows, 0); assert.equal(r.body.coverage, 'EXACT');
        assert.equal(reads.slice(before).some((x) => x.table === 'crm_leads'), false);
        const read = reads.at(-1); assertTenantCompanyFilter(read);
        assert.equal(new URLSearchParams(read.query).get('lead_id'), `eq.${I.foreignLead}`);
        assert.equal(read.count_requested, true); assert.equal(read.matched, 0);
      });
      await runTest('Platform legacy and system roles preserve their existing access behavior', async () => {
        for (const { payload, expectedCount, companyFilter } of [
          { payload: claims({ userId: I.platformAdmin, role: 'platform_admin', tenant_id: null, company_id: null }), expectedCount: 6, companyFilter: [] },
          { payload: claims({ userId: I.legacyAdmin, role: 'admin', tenant_id: null, company_id: null }), expectedCount: 6, companyFilter: [] },
          { payload: claims({ role: 'system' }), expectedCount: 4, companyFilter: [`eq.${I.companyA}`] },
        ]) {
          const r = await request({ bearer: token(payload) });
          assert.equal(r.status, 200); assert.equal(r.body.total, expectedCount); assert.equal(r.body.source_total_rows, expectedCount); assert.equal(r.body.coverage, 'EXACT');
          const read = reads.at(-1); assert.equal(read.count_requested, true); assert.equal(read.matched, expectedCount);
          assert.deepEqual(new URLSearchParams(read.query).getAll('company_id'), companyFilter);
        }
      });
      await runTest('Test-only request boundary rejects write methods and unrelated routes', async () => {
        const before = reads.length;
        for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request({ method })).status, 405);
        assert.equal((await request({ route: '/api/work-tasks' })).status, 404); assert.equal(reads.length, before);
      });
      await runTest('SDK transport rejects external destination and write before network', async () => {
        const before = reads.length;
        await assert.rejects(guardedFetch('https://blocked.invalid/rest/v1/unified_tasks_v'), /outside assigned fixture/);
        await assert.rejects(guardedFetch(`${fixtureOrigin}/rest/v1/unified_tasks_v`, { method: 'POST' }), /GET only/);
        assert.equal(reads.length, before);
      });
      await runTest('No mutation, notification, unsupported fixture operation or route error occurred', async () => {
        assert.deepEqual(forbiddenCalls, []); assert.deepEqual(fixtureRejections, []); assert.deepEqual(routeErrors, []);
      });
    };
    await Promise.race([scenario(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Harness exceeded 60-second limit')), 60_000); })]);
  } catch (err) { stopping = true; fatal = String(err.message).slice(0, 1500); }
  finally {
    clearTimeout(timer);
    for (const entry of [...servers].reverse()) {
      // server.close's callback may precede the destroyed sockets' close events.
      // Attach listeners before destroying; retain the live set until those
      // actual events remove its entries. A timeout remains a cleanup failure.
      const pendingSockets = [...entry.sockets];
      const socketCloses = pendingSockets.map((socket) => new Promise((resolve) => socket.once('close', resolve)));
      const serverClose = new Promise((resolve) => {
        entry.server.close((err) => { entry.close_error = err ? String(err.code || 'SERVER_CLOSE_ERROR') : null; resolve(); });
      });
      entry.server.closeAllConnections?.();
      for (const socket of pendingSockets) socket.destroy();
      let cleanupTimer;
      entry.close_events_drained = await Promise.race([
        Promise.all([serverClose, ...socketCloses]).then(() => true),
        new Promise((resolve) => { cleanupTimer = setTimeout(() => resolve(false), 2000); }),
      ]);
      clearTimeout(cleanupTimer);
      entry.closed = await closedPort(entry.port);
    }
    await runTest('Both owned loopback servers stopped and their ports refuse connections', async () => {
      assert.equal(servers.length, 2); assert.ok(servers.every((x) => x.closed && x.close_events_drained && !x.close_error && !x.server.listening && x.sockets.size === 0));
    });
    secrets.jwt = null;
    const failed = tests.filter((x) => x.result === 'FAIL').length;
    const evidence = {
      schema_version: '1.0.0', evidence_type: 'w0_http_sdk_synthetic_smoke', started_at: startedAt, completed_at: new Date().toISOString(),
      result: fatal || failed ? 'FAIL' : 'PASS', fatal, tests_passed: tests.length - failed, tests_failed: failed,
      scope: { http: 'REAL_LOOPBACK', jwt: 'REAL_JSONWEBTOKEN', sdk: 'REAL_SUPABASE_JS', auth_and_tenant_middleware: 'CANDIDATE_SOURCE', persistence: 'SIMULATED_IN_MEMORY_POSTGREST', sql_rls: 'NOT_TESTED', production: 'NOT_CONNECTED', frontend: 'NOT_TESTED' },
      substitutions: ['explicit in-memory config jwtSecret', 'in-memory TTL cache without Redis', 'auth event log in memory', 'mutation and notification imports fail closed', 'synthetic persistence endpoint'],
      limitations: ['Harness mounts only summary route behind an additional test boundary; full application bootstrap is not exercised.', 'Fixture is a bounded query interpreter, not PostgreSQL, PostgREST or Supabase Auth.', 'Token verification uses an ephemeral test signing key; existing users, sessions and credential configuration are not exercised.', 'Network restriction applies to the SDK custom fetch and the explicit harness clients, not an operating-system firewall.'],
      source_sha256: sourceHashes, runner_sha256: runnerHash, candidate_backend_lock_sha256: lockHash, dependencies: versions, node_version: process.version,
      source_repo: args.repo, dependency_root: args.deps, tests, fixture_reads: reads,
      auth_events: authEvents, forbidden_calls: forbiddenCalls, fixture_rejections: fixtureRejections, transport_rejections: transportRejections,
      cleanup: servers.map((entry, n) => ({ kind: n === 0 ? 'fixture' : 'app', port: entry.port, stopped: entry.closed, close_events_drained: entry.close_events_drained, close_error: entry.close_error, sockets_remaining: entry.sockets.size })),
    };
    fs.mkdirSync(args.output, { recursive: true });
    const filename = path.join(args.output, 'runtime-smoke.json');
    fs.writeFileSync(filename, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ result: evidence.result, passed: evidence.tests_passed, failed: evidence.tests_failed, evidence: filename, cleanup_passed: servers.length === 2 && servers.every((x) => x.closed && x.close_events_drained && !x.close_error && !x.server.listening && x.sockets.size === 0) }));
    process.exitCode = fatal || failed ? 1 : 0;
  }
}
main().catch((err) => { console.error(`Harness failed: ${String(err.message).slice(0, 500)}`); process.exitCode = 2; });
