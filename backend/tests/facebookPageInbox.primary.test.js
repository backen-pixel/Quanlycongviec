'use strict';
// Load only the router source, with every infrastructure import injected.
// No app bootstrap, config loader, environment file, SDK or network is imported.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createFacebookLeadAdsCutoverBackfill } = require('../src/services/facebookLeadAdsCutoverBackfill');

const source = fs.readFileSync(path.join(__dirname, '../src/config/supabaseRouter.js'), 'utf8');
const PRIMARY = 'https://primary.synthetic.invalid';
const BACKUP = 'https://backup.synthetic.invalid';
const denied = error => error?.code === 'FB_INBOX_PRIMARY_REQUIRED';
const response = url => ({ ok: true, status: 200, url });

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(overrides = {}) {
  const state = {
    calls: [], clients: [], delays: [], logs: [], replication: [], failback: [], poolResets: 0,
    fetch: async url => response(url), onDelay: null,
    config: {
      supabaseUrl: PRIMARY, supabaseServiceKey: 'SYNTHETIC_PRIMARY_KEY',
      supabaseBackupUrl: BACKUP, supabaseBackupServiceKey: 'SYNTHETIC_BACKUP_KEY',
      supabaseFailoverEnabled: true, supabaseAutoFailoverEnabled: false,
      supabaseFailThreshold: 1, supabaseHealthIntervalMs: 15000, supabaseAutoFailback: false,
      ...overrides,
    },
  };
  const imports = {
    '@supabase/supabase-js': { createClient(base, key, options) {
      const client = {
        base,
        rpc(name, args = {}) {
          return options.global.fetch(`${base}/rest/v1/rpc/${name}`, {
            method: 'POST', headers: { apikey: key }, body: JSON.stringify(args),
          });
        },
        from(table) {
          // PostgREST builders are thenables; transport can start in a later ALS scope.
          return { then(yes, no) {
            return options.global.fetch(`${base}/rest/v1/${table}`, {
              method: 'GET', headers: { apikey: key },
            }).then(yes, no);
          } };
        },
      };
      state.clients.push(client);
      return client;
    } },
    undici: { fetch: async (url, init) => {
      state.calls.push({ url: String(url), init });
      return state.fetch(String(url), init, state.calls.length);
    } },
    './index': state.config,
    './httpAgents': { supabaseDispatcher: { synthetic: true } },
    './redis': { getRedisIfReady: () => null },
    'node:async_hooks': { AsyncLocalStorage },
    '../helpers/supabaseSwitchSync': { runPreSwitchSync: async () => ({ rounds_run: 0 }) },
    './db': { resetPools: () => { state.poolResets++; } },
    '../helpers/supabaseReplication': { maybeEnqueueRestReplication: (...args) => state.replication.push(args) },
    '../helpers/supabaseFailback': { maybeLogFailbackRest: (...args) => state.failback.push(args) },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(id) {
      assert.ok(Object.hasOwn(imports, id), `Unexpected infrastructure import ${id}`);
      return imports[id];
    },
    process: { env: {} }, URL, Date,
    console: Object.fromEntries(['log', 'warn', 'error'].map(method => [method, (...args) => state.logs.push(args)])),
    setTimeout(callback, milliseconds) {
      state.delays.push(milliseconds);
      state.onDelay?.(milliseconds);
      queueMicrotask(callback); // No real 300/600/900 ms sleeps or long-lived timer.
      return { unref() {} };
    },
    setInterval() { throw new Error('Health scheduler must not start in this isolated test'); },
  }, { filename: 'supabaseRouter.isolated.js', timeout: 1000 });
  state.router = module.exports;
  return state;
}

test('Primary scope selects the Primary client before and after await', async () => {
  const h = harness();
  const result = await h.router.withPrimaryDatabase(async () => {
    assert.equal(h.router.getActiveClient(), h.router.getPrimaryClient());
    await Promise.resolve();
    assert.equal(h.router.getActiveClient(), h.router.getPrimaryClient());
    return h.router.supabase.rpc('facebook_page_inbox_enqueue_v1', { marker: 'pinned' });
  });
  assert.equal(result.url, PRIMARY + '/rest/v1/rpc/facebook_page_inbox_enqueue_v1');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.headers.apikey, 'SYNTHETIC_PRIMARY_KEY');
});

test('cutover backfill awaits lazy database query within production Primary scope', async () => {
  const h = harness();
  const db = { from() {
    const builder = {
      select() { return builder; }, eq() { return builder; },
      maybeSingle() { return { then(resolve, reject) {
        queueMicrotask(async () => {
          try {
            await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
            await h.router.supabase.rpc('synthetic_probe');
            resolve({ data: null });
          } catch (error) { reject(error); }
        });
      } }; },
    };
    return builder;
  } };
  const backfill = createFacebookLeadAdsCutoverBackfill({ db,
    fetchImpl: async () => { throw new Error('Graph must not be reached'); },
    getGraphVersion: () => 'v24.0', getLeadGraphToken: () => 'synthetic-lead-token',
    getLeadAppId: () => '123456', getLeadTokenMetadata: async () => ({
      app_id: '123456', is_valid: true, type: 'PAGE', profile_id: '10001', scopes: ['leads_retrieval'],
    }),
    assertPrimaryObserved: async () => {}, isPrimary: () => h.router.getActiveTarget() === 'primary',
    withPrimary: h.router.withPrimaryDatabase, isWorkerPaused: () => true,
    isLegacyWriterFenced: () => true, pageId: '10001',
  });
  await assert.rejects(backfill({ from: '2026-10-06T08:00:00Z', to: '2026-10-06T09:00:00Z',
    expectedFormIds: ['20001'], expectedLeadCounts: { 20001: 0 } }),
  { code: 'FB_INBOX_BACKFILL_DB_UNAVAILABLE' });
  assert.equal(h.calls.length, 0, 'a lazy read must never escape to Backup');
});

for (const mode of ['backup', 'auto-failover']) {
  test(`Primary scope refuses ${mode} at admission, without invoking callback or transport`, async () => {
    const h = harness();
    if (mode === 'backup') await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
    else h.config.supabaseAutoFailoverEnabled = true;
    let entered = false;
    assert.throws(() => h.router.withPrimaryDatabase(() => { entered = true; }), denied);
    assert.equal(entered, false);
    assert.equal(h.calls.length, 0);
  });
}

test('Cached Primary client is fenced if manual switch happens before its transport', async () => {
  const h = harness();
  await assert.rejects(h.router.withPrimaryDatabase(async () => {
    const cached = h.router.getActiveClient();
    await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
    return cached.rpc('facebook_page_inbox_claim_v1');
  }), denied);
  assert.equal(h.calls.length, 0);
  assert.equal(h.router.getActiveClient().base, BACKUP);
});

test('Manual switch after an in-flight Primary send cannot redirect that send or its next RPC', async () => {
  const h = harness(), entered = deferred(), reply = deferred();
  let firstReply;
  h.fetch = async url => { entered.resolve(); await reply.promise; return response(url); };
  const operation = h.router.withPrimaryDatabase(async () => {
    firstReply = await h.router.supabase.rpc('facebook_page_inbox_enqueue_v1');
    return h.router.supabase.rpc('facebook_page_inbox_health_v1');
  });
  await entered.promise;
  await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
  reply.resolve();
  await assert.rejects(operation, denied);
  assert.equal(firstReply.url, PRIMARY + '/rest/v1/rpc/facebook_page_inbox_enqueue_v1');
  assert.deepEqual(h.calls.map(c => c.url), [firstReply.url]);
  assert.equal(h.replication.length, 1, 'The completed request still belongs to Primary replication');
  assert.equal(h.replication[0][0], firstReply.url);
  assert.equal(h.replication[0][2], firstReply);
  assert.equal(h.failback.length, 0, 'An in-flight Primary response is not a Backup failback write');
});

test('Pinned retryable transport failure exhausts only Primary attempts, never Backup', async () => {
  const h = harness();
  h.fetch = async () => { throw new Error('fetch failed ECONNRESET'); };
  await assert.rejects(h.router.withPrimaryDatabase(() => h.router.supabase.rpc('facebook_page_inbox_enqueue_v1')),
    /ECONNRESET/);
  assert.equal(h.calls.length, 4);
  assert.ok(h.calls.every(c => c.url.startsWith(PRIMARY + '/')));
  assert.deepEqual(h.delays, [300, 600, 900]);
  assert.equal(h.router.getActiveTarget(), 'primary');
});

test('Pinned successful retry preserves Primary target and identical command body', async () => {
  const h = harness();
  h.fetch = async (url, _init, n) => { if (n < 3) throw new Error('ETIMEDOUT'); return response(url); };
  const result = await h.router.withPrimaryDatabase(() => h.router.supabase.rpc('facebook_page_inbox_finish_v1',
    { p_id: 'synthetic', p_token: 'same-attempt', p_success: true }));
  assert.ok(result.url.startsWith(PRIMARY + '/'));
  assert.equal(h.calls.length, 3);
  assert.equal(new Set(h.calls.map(c => c.url)).size, 1);
  assert.equal(new Set(h.calls.map(c => c.init.body)).size, 1);
});

for (const change of ['manual-switch', 'auto-enabled']) {
  test(`Pinned retry checks ${change} again before the next network call`, async () => {
    const h = harness();
    h.fetch = async () => { throw new Error('ECONNRESET'); };
    h.onDelay = () => {
      if (change === 'manual-switch') void h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
      else h.config.supabaseAutoFailoverEnabled = true;
    };
    await assert.rejects(h.router.withPrimaryDatabase(() => h.router.supabase.rpc('facebook_page_inbox_claim_v1')), denied);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, PRIMARY + '/rest/v1/rpc/facebook_page_inbox_claim_v1');
  });
}

test('Pinned permanent fetch error is not retried or failed over', async () => {
  const h = harness();
  h.fetch = async () => { throw new Error('synthetic permanent error'); };
  await assert.rejects(h.router.withPrimaryDatabase(() => h.router.supabase.rpc('facebook_page_inbox_claim_v1')),
    /permanent error/);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.delays, []);
});

test('Normal legacy context retains automatic failover after four Primary failures', async () => {
  const h = harness({ supabaseAutoFailoverEnabled: true });
  h.fetch = async url => {
    if (url.startsWith(PRIMARY + '/')) throw new Error('fetch failed');
    return response(url);
  };
  const result = await h.router.supabase.rpc('legacy_rpc');
  assert.equal(result.url, BACKUP + '/rest/v1/rpc/legacy_rpc');
  assert.equal(h.calls.length, 5);
  assert.equal(h.calls.filter(c => c.url.startsWith(PRIMARY + '/')).length, 4);
  assert.equal(h.router.getActiveClient().base, BACKUP);
});

test('Concurrent legacy context can use Backup without inheriting the suspended Primary scope', async () => {
  const h = harness(), entered = deferred(), resume = deferred();
  const pinned = h.router.withPrimaryDatabase(async () => {
    const cached = h.router.getActiveClient();
    entered.resolve();
    await resume.promise;
    return cached.rpc('pinned_command');
  });
  await entered.promise;
  await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
  const legacy = await h.router.supabase.rpc('legacy_command');
  assert.equal(legacy.url, BACKUP + '/rest/v1/rpc/legacy_command');
  resume.resolve();
  await assert.rejects(pinned, denied);
  assert.equal(h.calls.length, 1, 'Only the unpinned legacy context may send on Backup');
  assert.equal(h.router.getActiveClient().base, BACKUP);
});

test('Rejected and nested Primary scopes do not leak into later legacy operations', async () => {
  const h = harness();
  await assert.rejects(h.router.withPrimaryDatabase(async () => {
    await h.router.withPrimaryDatabase(async () => { await Promise.resolve(); });
    throw new Error('synthetic caller rejected');
  }), /caller rejected/);
  await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
  const result = await h.router.supabase.rpc('legacy_after_rejection');
  assert.equal(result.url, BACKUP + '/rest/v1/rpc/legacy_after_rejection');
});

test('Cached Backup thenable cannot send Backup credentials inside Primary scope', async () => {
  const h = harness();
  await h.router.setActiveTarget('backup', 'synthetic', { skipSync: true });
  const stale = h.router.getActiveClient().from('facebook_page_inbox');
  await h.router.setActiveTarget('primary', 'synthetic', { skipSync: true });
  await assert.rejects(h.router.withPrimaryDatabase(async () => await stale), denied);
  assert.equal(h.calls.length, 0, 'Reject the foreign origin; rewriting it would retain Backup credentials');
});
