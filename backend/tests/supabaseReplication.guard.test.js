'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/helpers/supabaseReplication.js'), 'utf8');
const PRIMARY = 'https://primary.synthetic.invalid';
const BACKUP = 'https://backup.synthetic.invalid';

function reply(status, body = null, message = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return message || JSON.stringify(body); },
  };
}

function harness() {
  const state = {
    activeTarget: 'primary',
    activeChecks: [],
    calls: [],
    timers: [],
    logs: [],
    redis: null,
    fetch: async () => reply(201),
  };
  const module = { exports: {} };
  const imports = {
    crypto: require('node:crypto'),
    undici: { fetch: async (url, init) => {
      state.calls.push({ url: String(url), init });
      return state.fetch(String(url), init);
    } },
    '../config': {
      supabaseReplicationEnabled: true, supabaseSwitchLogEnabled: false,
      supabaseUrl: PRIMARY, supabaseServiceKey: 'SYNTHETIC_PRIMARY',
      supabaseBackupUrl: BACKUP, supabaseBackupServiceKey: 'SYNTHETIC_BACKUP',
    },
    '../config/httpAgents': { supabaseDispatcher: { synthetic: true } },
    '../config/redis': { getRedisIfReady: () => state.redis },
    './cronLeader': { runIfLeader: async (_key, callback) => callback() },
    '../config/supabaseRouter': { getActiveTarget: () => {
      if (state.activeChecks.length) return state.activeChecks.shift() ? 'primary' : 'backup';
      return state.activeTarget;
    } },
  };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(id) {
      assert.ok(Object.hasOwn(imports, id), `Unexpected infrastructure import ${id}`);
      return imports[id];
    },
    URL, Buffer, Date,
    process: { env: {} },
    console: Object.fromEntries(['log', 'warn', 'error'].map((method) => [
      method, (...args) => state.logs.push({ method, args }),
    ])),
    setTimeout(callback) { state.timers.push(callback); return { unref() {} }; },
    clearTimeout() {},
  }, { filename: 'supabaseReplication.isolated.js', timeout: 1000 });
  state.replication = module.exports;
  state.enqueue = async (method = 'PATCH', pathName = '/rest/v1/users?id=eq.user-1', body = { name: 'New' }) => {
    state.replication.maybeEnqueueRestReplication(`${PRIMARY}${pathName}`, {
      method, body: JSON.stringify(body), headers: { prefer: 'return=minimal' },
    }, { status: 204 });
    await new Promise((resolve) => setImmediate(resolve));
  };
  return state;
}

test('A 2xx PATCH with zero rows is retried after the missing Backup row is restored', async () => {
  const h = harness();
  let backupReads = 0;
  let patchCalls = 0;
  h.fetch = async (url, init = {}) => {
    if (url.startsWith(`${BACKUP}/rest/v1/users?`) && (!init.method || init.method === 'GET')) {
      backupReads += 1;
      return reply(200, backupReads === 1 ? [{ id: 'user-1' }] : []);
    }
    if (url.startsWith(`${PRIMARY}/rest/v1/users?`)) return reply(200, [{ id: 'user-1', name: 'Old' }]);
    if (init.method === 'POST') return reply(201);
    if (init.method === 'PATCH') {
      patchCalls += 1;
      assert.match(init.headers.prefer, /return=representation/);
      return reply(200, patchCalls === 1 ? [] : [{ id: 'user-1' }]);
    }
    throw new Error(`Unexpected request ${url}`);
  };
  await h.enqueue();
  const result = await h.replication.drainReplicationQueue({ maxJobs: 1 });
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.remaining, 0);
  assert.equal(patchCalls, 2);
  assert.equal(h.calls.filter(({ init }) => init.method === 'POST').length, 1);
  assert.equal(h.replication.getReplicationStatus().applied, 1);
});

test('A second zero-row PATCH remains failed and queued, not counted as applied', async () => {
  const h = harness();
  h.fetch = async (url, init = {}) => {
    if (!init.method || init.method === 'GET') return reply(200, [{ id: 'user-1' }]);
    if (init.method === 'PATCH') return reply(200, []);
    throw new Error(`Unexpected request ${url}`);
  };
  await h.enqueue();
  const result = await h.replication.drainReplicationQueue({ maxJobs: 1 });
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(h.replication.getReplicationStatus().applied, 0);
  assert.equal(h.calls.filter(({ init }) => init.method === 'PATCH').length, 2);
});

test('Parent upsert conflict cannot hide a zero-row fallback PATCH', async () => {
  const h = harness();
  h.fetch = async (url, init = {}) => {
    if (url.startsWith(`${BACKUP}/rest/v1/users?`) && (!init.method || init.method === 'GET')) return reply(200, []);
    if (url.startsWith(`${PRIMARY}/rest/v1/users?`)) return reply(200, [{ id: 'user-1', email: 'same@synthetic.invalid' }]);
    if (init.method === 'POST') return reply(409, null, 'duplicate key 23505 on email');
    if (init.method === 'PATCH') {
      assert.match(init.headers.prefer, /return=representation/);
      return reply(200, []);
    }
    throw new Error(`Unexpected request ${url}`);
  };
  await h.enqueue();
  const result = await h.replication.drainReplicationQueue({ maxJobs: 1 });
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(h.replication.getReplicationStatus().applied, 0);
  assert.equal(h.calls.filter(({ init }) => init.method === 'PATCH').length, 1);
});

test('Natural-key duplicate fallback also rejects a 2xx zero-row PATCH', async () => {
  const h = harness();
  h.fetch = async (_url, init = {}) => {
    if (init.method === 'POST') return reply(409, null, 'duplicate key 23505');
    if (init.method === 'PATCH') {
      assert.match(init.headers.prefer, /return=representation/);
      return reply(200, []);
    }
    throw new Error(`Unexpected method ${init.method}`);
  };
  await h.enqueue('POST', '/rest/v1/customers?on_conflict=email', {
    id: 'customer-1', email: 'same@synthetic.invalid',
  });
  const result = await h.replication.drainReplicationQueue({ maxJobs: 1 });
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(h.replication.getReplicationStatus().applied, 0);
});
