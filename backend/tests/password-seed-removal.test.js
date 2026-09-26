const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const express = require('express');

// Route-only harness: never require server.js, load .env, or open a real DB.
// Every application dependency is explicitly mocked; unknown imports fail closed.
const sourceDir = path.join(__dirname, '..', 'src');
const TEST_USER = 'isolated-user';
const TEST_TOKEN = 'isolated-auth-token';
const TEST_EMAIL = 'fixture-user@example.invalid';

function harness() {
  const calls = {
    reads: [], writes: [], hashes: [], comparisons: [], auth: 0,
    lockChecks: [], loginClears: [], sessionBuilds: [],
  };
  const state = { healthy: true };
  const unexpected = () => { throw new Error('Unexpected dependency call in isolated test'); };
  const supabase = {
    from(table) {
      const query = { table, filters: [] };
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        eq(column, value) { query.filters.push([column, value]); return chain; },
        neq(column, value) {
          assert.equal(column, 'is_active');
          assert.equal(value, false);
          query.excludesInactive = true;
          return chain;
        },
        limit(count) { assert.equal(count, 1); query.limit = count; return chain; },
        single() { return chain; },
        update(values) { query.values = values; return chain; },
        then(resolve, reject) {
          try {
            assert.equal(table, 'users');
            if (query.values) {
              calls.writes.push(query);
              return Promise.resolve({ error: null }).then(resolve, reject);
            }
            calls.reads.push(query);
            const user = { id: TEST_USER, password: 'synthetic-current-hash', email: TEST_EMAIL, role: 'staff' };
            return Promise.resolve({
              data: query.limit === 1 ? [user] : user, error: null,
            }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return chain;
    },
  };
  const bcrypt = {
    async compare(value, hash) {
      calls.comparisons.push({ value, hash });
      return value === 'current-test-only' && hash === 'synthetic-current-hash';
    },
    async hash(value, rounds) {
      calls.hashes.push({ value, rounds });
      return 'synthetic-new-hash';
    },
  };
  const dependencies = {
    express,
    bcryptjs: bcrypt,
    jsonwebtoken: { verify: unexpected },
    '../config/supabase': { supabase },
    '../config': { jwtSecret: 'isolated-test-only' },
    '../middleware/auth': {
      auth(req, res, next) {
        calls.auth += 1;
        if (req.headers.authorization !== `Bearer ${TEST_TOKEN}`) {
          return res.status(401).json({ error: 'Unauthenticated test request' });
        }
        req.user = { userId: TEST_USER, role: 'staff' };
        next();
      },
    },
    '../helpers/authEventLog': { logAuthEvent: async () => {} },
    '../helpers/authSession': {
      async buildAuthSessionForUser(user, options) {
        assert.equal(user.id, TEST_USER);
        calls.sessionBuilds.push({ user, options });
        return { token: 'synthetic-session-token', user: { id: user.id }, sessionId: options.sessionId };
      },
    },
    '../helpers/tenantScope': { assertTenantActive: unexpected },
    '../helpers/hstAdminCompanies': { syncHstAdminUserCompanies: unexpected },
    '../helpers/googleAuth': {
      getGoogleLoginClientId: unexpected, isGoogleLoginEnabled: unexpected,
      verifyGoogleIdToken: unexpected,
    },
    '../helpers/saasProvision': {
      provisionGoogleFreeSignup: unexpected, findBlockingPendingPurchase: unexpected,
      provisionPurchase: unexpected,
    },
    '../helpers/qrLoginSessions': {
      createQrSession: unexpected, parseQrText: unexpected, confirmQrSession: unexpected,
      consumeSessionAuth: unexpected, getSessionPublicInfo: unexpected,
      targetLabel: unexpected, deviceFromReq: unexpected,
    },
    '../helpers/notifications': { createNotification: unexpected },
    '../helpers/loginLockout': {
      assertLoginAllowed(_req, email) {
        assert.equal(email, TEST_EMAIL);
        calls.lockChecks.push(email);
        return { ok: true };
      },
      recordLoginFailure: unexpected,
      clearLoginFailures(_req, email) {
        assert.equal(email, TEST_EMAIL);
        calls.loginClears.push(email);
      },
    },
    '../middleware/permission': { hasPermission: unexpected, getRolePermissions: unexpected },
    './config/redis': { getStatus: () => 'disabled', getRedis: () => null },
    './config/db': { isPgEnabled: () => false },
    './config/supabaseRouter': {
      getHealthStatus: () => ({ primary: state.healthy ? 'healthy' : 'unavailable' }),
      isSystemHealthy: () => state.healthy,
    },
    './helpers/supabaseReplication': {
      getReplicationStatus: () => ({ enabled: false }), getQueueDepth: async () => 0,
    },
    './helpers/supabaseFailback': {
      getFailbackStatus: () => ({ enabled: false }), getPendingCount: async () => 0,
    },
    './helpers/supabaseSwitchSync': {
      getLastSwitchSyncRun: () => null, switchSyncConfig: () => ({ enabled: false }),
    },
  };
  const sandbox = {
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked import: ${name}`);
      return dependencies[name];
    },
    module: { exports: {} },
    console: { error: unexpected, warn: unexpected, log: unexpected },
    process: { env: {}, uptime: () => 10 },
  };
  const authSource = fs.readFileSync(path.join(sourceDir, 'routes', 'auth.js'), 'utf8');
  vm.runInNewContext(authSource, sandbox, { filename: 'isolated-auth.js', timeout: 1000 });
  const router = sandbox.module.exports;
  const app = express();
  app.use(express.json());

  // Include the former root-level seed route, if reintroduced in its old location,
  // while excluding startup, jobs, sockets, DB initialization, and other route mounts.
  const serverSource = fs.readFileSync(path.join(sourceDir, 'server.js'), 'utf8');
  const start = serverSource.indexOf('// Root + Health');
  const end = serverSource.indexOf('\nconst { invalidateProjectsListOnWrite', start);
  assert.ok(start >= 0 && end > start, 'Server route section boundaries must remain explicit');
  vm.runInNewContext(serverSource.slice(start, end), {
    ...sandbox, app, supabase, config: { jwtSecret: 'isolated-test-only' }, io: {},
    getSocketMetricsSnapshot: () => ({}), getSnapshot: () => ({}),
    resetMetrics: unexpected, isAdminLike: unexpected,
  }, { filename: 'isolated-server-routes.js', timeout: 1000 });
  app.use('/api/auth', router);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return { app, router, calls, state };
}

function assertNoDatabaseOrHash(calls) {
  assert.equal(calls.reads.length, 0, 'No database reads');
  assert.equal(calls.writes.length, 0, 'No database writes');
  assert.equal(calls.hashes.length, 0, 'No password hashing');
  assert.equal(calls.comparisons.length, 0, 'No password comparisons');
}

async function localServer(t, app) {
  // Only a disposable route harness binds loopback; the application is never started.
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (url, { method = 'GET', authenticated = false, body = {} } = {}) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request({
      host: '127.0.0.1', port: server.address().port, path: url, method,
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
        ...(authenticated ? { Authorization: `Bearer ${TEST_TOKEN}` } : {}),
      },
    }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(data) }); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    request.setTimeout(2000, () => request.destroy(new Error('Isolated request timed out')));
    request.on('error', reject);
    request.end(payload);
  });
}

for (const alias of ['/api/seed-passwords', '/api/auth/reset-seed-passwords']) {
  test(`removed ${alias} never reaches a password mutation`, async t => {
    const { app, router, calls } = harness();
    const mountedPath = alias.startsWith('/api/auth/') ? alias.slice('/api/auth'.length) : alias;
    const stack = alias.startsWith('/api/auth/') ? router.stack : app.router.stack;
    // Stop before sending a request on a vulnerable baseline: never execute its handler.
    assert.equal(stack.some(layer => layer.route && layer.match(mountedPath)), false,
      'Legacy seed route must be unregistered before any request is sent');
    assertNoDatabaseOrHash(calls);
    const request = await localServer(t, app);
    for (const authenticated of [false, true]) {
      for (const url of [alias, `${alias}/`, `${alias}?probe=1`, alias.toUpperCase()]) {
        const response = await request(url, { method: 'POST', authenticated });
        assert.equal(response.status, 404, `${authenticated ? 'Authenticated' : 'Anonymous'} ${url}`);
      }
    }
    assertNoDatabaseOrHash(calls);
  });
}

test('root and healthy/degraded health responses remain available', async t => {
  const { app, calls, state } = harness();
  const request = await localServer(t, app);
  assert.equal((await request('/')).status, 200);
  const healthy = await request('/api/health');
  assert.equal(healthy.status, 200);
  assert.equal(healthy.body.status, 'ok');
  state.healthy = false;
  const degraded = await request('/api/health');
  assert.equal(degraded.status, 503);
  assert.equal(degraded.body.status, 'degraded');
  assertNoDatabaseOrHash(calls);
});

test('login still rejects missing credentials without a database call', async t => {
  const { app, calls } = harness();
  const request = await localServer(t, app);
  assert.equal((await request('/api/auth/login', { method: 'POST' })).status, 400);
  assertNoDatabaseOrHash(calls);
});

test('valid login preserves its session and updates only that user login time', async t => {
  const { app, calls } = harness();
  const request = await localServer(t, app);
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: 'current-test-only', session_id: 'isolated-session' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    token: 'synthetic-session-token', user: { id: TEST_USER }, sessionId: 'isolated-session',
  });
  assert.deepEqual(calls.lockChecks, [TEST_EMAIL]);
  assert.deepEqual(calls.loginClears, [TEST_EMAIL]);
  assert.equal(calls.sessionBuilds.length, 1);
  assert.equal(calls.sessionBuilds[0].options.sessionId, 'isolated-session');
  assert.equal(calls.reads.length, 1);
  assert.deepEqual(calls.reads[0].filters, [['email', TEST_EMAIL]]);
  assert.equal(calls.reads[0].excludesInactive, true);
  assert.equal(calls.comparisons.length, 1);
  assert.equal(calls.hashes.length, 0);
  assert.equal(calls.writes.length, 1);
  assert.deepEqual(calls.writes[0].filters, [['id', TEST_USER]]);
  assert.deepEqual(Object.keys(calls.writes[0].values), ['last_login_at']);
});

test('normal password change retains the auth and current-password guards', async t => {
  const { app, calls } = harness();
  const request = await localServer(t, app);
  const body = { current_password: 'incorrect-test-only', new_password: 'next-test-only' };
  assert.equal((await request('/api/auth/change-password', { method: 'POST', body })).status, 401);
  assertNoDatabaseOrHash(calls);
  assert.equal((await request('/api/auth/change-password', {
    method: 'POST', authenticated: true, body,
  })).status, 400);
  assert.equal(calls.auth, 2);
  assert.equal(calls.reads.length, 1);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.hashes.length, 0);
  assert.equal(calls.comparisons.length, 1);
});

test('normal password change updates only the authenticated user with a new hash', async t => {
  const { app, calls } = harness();
  const request = await localServer(t, app);
  const response = await request('/api/auth/change-password', {
    method: 'POST', authenticated: true,
    body: {
      current_password: 'current-test-only', new_password: 'next-test-only', userId: 'other-test-user',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(calls.auth, 1);
  assert.equal(calls.reads.length, 1);
  assert.deepEqual(calls.reads[0].filters, [['id', TEST_USER]]);
  assert.equal(calls.comparisons.length, 1);
  assert.deepEqual(calls.hashes, [{ value: 'next-test-only', rounds: 12 }]);
  assert.equal(calls.writes.length, 1);
  assert.deepEqual(calls.writes[0].filters, [['id', TEST_USER]]);
  assert.equal(calls.writes[0].values.password, 'synthetic-new-hash');
  assert.deepEqual(Object.keys(calls.writes[0].values).sort(), ['password', 'updated_at']);
});
