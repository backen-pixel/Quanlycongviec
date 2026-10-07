'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { inboxSettings, rowsFromBody, signedRows, safeCode, createPageInboxReceiver, createPageInboxWorker, assertLegacyQueueDrained, assertPageLegacyScope } = require('../src/helpers/facebookPageInbox');
const SECRET = 'synthetic-only-app-secret';
const body = () => ({ object: 'page', entry: [{ id: '10001', time: 10, messaging: [{ sender: { id: '20001' }, message: { mid: 'test-mid', text: 'synthetic' } }], changes: [{ field: 'leadgen', value: { leadgen_id: '30001' } }] }] });
const signed = (value = body()) => {
  const raw = Buffer.from(JSON.stringify(value));
  return { facebookRawBody: raw, body: value, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', SECRET).update(raw).digest('hex') } };
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('rollout flags are OFF / paused by default; invalid managed Page config fails closed', () => {
  const value = inboxSettings({});
  assert.equal(value.enabled, false); assert.equal(value.paused, true); assert.equal(value.scopeGuard, false);
  assert.equal(value.leadAdsIntake, false);
  assert.equal(inboxSettings({ VPT_FB_PAGE_INBOX: '1', VPT_FB_PAGE_INBOX_WORKER_PAUSED: '0' }).paused, false);
  assert.throws(() => inboxSettings({ VPT_FB_MANAGED_PAGE_IDS: '123,not-a-page' }), /INVALID_CONFIG/);
});

test('Lead Ads opt-in requires the durable receiver, scope guard and explicit managed Pages', () => {
  const valid = { VPT_FB_LEAD_ADS_INTAKE: '1', VPT_FB_PAGE_INBOX: '1',
    VPT_FB_LEGACY_SCOPE_GUARD: '1', VPT_FB_MANAGED_PAGE_IDS: '10001,10002' };
  const settings = inboxSettings(valid);
  assert.equal(settings.leadAdsIntake, true); assert.equal(settings.paused, true);
  assert.deepEqual([...settings.managedPages], ['10001', '10002']);
  for (const missing of ['VPT_FB_PAGE_INBOX', 'VPT_FB_LEGACY_SCOPE_GUARD', 'VPT_FB_MANAGED_PAGE_IDS']) {
    const env = { ...valid }; delete env[missing];
    assert.throws(() => inboxSettings(env), { code: 'FB_INBOX_INVALID_CONFIG' });
  }
  for (const ids of ['', ' , ', '10001,not-a-page']) {
    assert.throws(() => inboxSettings({ ...valid, VPT_FB_MANAGED_PAGE_IDS: ids }), { code: 'FB_INBOX_INVALID_CONFIG' });
  }
  // The feature cannot be enabled by a merely truthy string.
  assert.equal(inboxSettings({ VPT_FB_LEAD_ADS_INTAKE: 'true' }).leadAdsIntake, false);
});

test('all Pages, changes, messages and unknown entry envelopes are retained', () => {
  const value = body();
  value.entry.push({ id: '99999', unknown: { future: true } });
  const rows = rowsFromBody(value);
  assert.deepEqual(rows.map(x => x.payload.kind), ['messaging', 'change', 'entry']);
  assert.equal(rows[2].page_id, '99999');
  assert.deepEqual(rows[2].payload.event, { unknown: { future: true } });
});

test('event keys survive property-order and known-event envelope-time changes, remain Page scoped', () => {
  const one = rowsFromBody(body());
  const value = body(); value.entry[0].time = 50;
  value.entry[0].messaging[0] = { message: { text: 'synthetic', mid: 'test-mid' }, sender: { id: '20001' } };
  assert.deepEqual(rowsFromBody(value), one);
  value.entry[0].id = '10002';
  assert.notEqual(rowsFromBody(value)[0].event_key, one[0].event_key);
});

test('raw signature is required and exact; body object cannot substitute different signed content', () => {
  const req = signed();
  assert.equal(signedRows(req.facebookRawBody, req.headers['x-hub-signature-256'], SECRET).length, 2);
  assert.throws(() => signedRows(Buffer.concat([req.facebookRawBody, Buffer.from(' ')]), req.headers['x-hub-signature-256'], SECRET), /INVALID_SIGNATURE/);
  for (const signature of [null, '', 'sha256=123', 'sha256=' + '0'.repeat(64)]) {
    assert.throws(() => signedRows(req.facebookRawBody, signature, SECRET), /INVALID_SIGNATURE/);
  }
  assert.throws(() => signedRows(req.facebookRawBody, req.headers['x-hub-signature-256'], ''), /SECRET_UNAVAILABLE/);
  assert.throws(() => signedRows(Buffer.alloc(2 * 1024 * 1024 + 1), 'irrelevant', SECRET), /INVALID_BODY/);
});

test('invalid/oversized batch fails as a whole before DB; no silent truncation', () => {
  for (const value of [{}, { object: 'page', entry: [] }, { object: 'page', entry: [{ id: 10001 }] }, { object: 'page', entry: [{ id: '10001', messaging: {} }] }]) {
    assert.throws(() => rowsFromBody(value), /INVALID_ENVELOPE/);
  }
  const value = body(); value.entry[0].messaging = Array.from({ length: 100 }, () => ({}));
  assert.throws(() => rowsFromBody(value), /TOO_MANY_EVENTS/);
  let deep = {}; for (let i = 0; i < 45; i++) deep = { child: deep };
  value.entry[0].messaging = [deep]; assert.throws(() => rowsFromBody(value), /INVALID_ENVELOPE/);
});

test('ACK waits for whole enqueue commit; parsed req.body is not trusted over signed bytes', async () => {
  const commit = deferred(); const calls = []; const status = [];
  const receive = createPageInboxReceiver({ db: { rpc: async (name, args) => { calls.push({ name, args }); return commit.promise; } }, isPrimary: () => true, secret: () => SECRET });
  const req = signed(); req.body = { object: 'untrusted replacement' };
  const pending = receive(req, { sendStatus: code => status.push(code) });
  await tick(); assert.deepEqual(status, []); assert.equal(calls.length, 1); assert.equal(calls[0].args.p_rows.length, 2);
  commit.resolve({ data: 2, error: null }); await pending;
  assert.deepEqual(status, [200]);
});

test('missing RPC/partial confirmation/failover cause 503; invalid signature never calls DB', async () => {
  for (const result of [{ error: { code: 'PGRST202' } }, { data: 1 }, null]) {
    let status; const receive = createPageInboxReceiver({ db: { rpc: async () => result }, isPrimary: () => true, secret: () => SECRET });
    await receive(signed(), { sendStatus: code => { status = code; } }); assert.equal(status, 503);
  }
  let calls = 0; let status;
  const receive = createPageInboxReceiver({ db: { rpc: async () => { calls++; return { data: 2 }; } }, isPrimary: () => false, secret: () => SECRET });
  await receive(signed(), { sendStatus: code => { status = code; } }); assert.equal(status, 503); assert.equal(calls, 0);
  const bad = signed(); bad.headers = {};
  await receive(bad, { sendStatus: code => { status = code; } }); assert.equal(status, 403); assert.equal(calls, 0);
});

function workerHarness(overrides = {}) {
  const calls = []; const errors = []; const metrics = []; let once = false; let renewCallback;
  const db = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'facebook_page_inbox_claim_v1' || name === 'facebook_page_inbox_claim_lead_ads_v1') {
      if (once) return { data: [] }; once = true;
      return { data: [{ id: 'synthetic-id', page_id: '10001', payload: { kind: 'messaging', event: {} }, ...(overrides.claimRow || {}) }] };
    }
    if (name.endsWith('health_v1')) return { data: { pendingCount: 2, processingCount: 0, oldestPendingSeconds: 301, secret: 'must not log' } };
    if (name.endsWith('renew_v1')) return { data: overrides.renewResult ?? true };
    return { data: true };
  } };
  const worker = createPageInboxWorker({ db, isPrimary: () => true, processEvent: async () => {}, isPaused: () => false,
    beforeClaim: async () => {}, onError: code => errors.push(code), onHealth: counts => metrics.push(counts),
    setTimer: fn => { renewCallback = fn; return 1; }, clearTimer: () => {}, ...overrides });
  return { worker, calls, errors, metrics, renew: () => renewCallback() };
}

test('paused worker does not claim; old queue failure does not claim', async () => {
  const paused = workerHarness({ isPaused: () => true }); await paused.worker.drain(); assert.equal(paused.calls.length, 0);
  const old = workerHarness({ beforeClaim: async () => { throw Object.assign(new Error(), { code: 'FB_INBOX_LEGACY_QUEUE_PENDING' }); } });
  await old.worker.drain(); assert.equal(old.calls.length, 0); assert.deepEqual(old.errors, ['FB_INBOX_LEGACY_QUEUE_PENDING']);
  for (const result of [{ count: 1 }, { count: null }, { error: {} }]) {
    await assert.rejects(assertLegacyQueueDrained({ from: () => ({ select: () => ({ neq: async () => result }) }) }), /LEGACY_QUEUE_PENDING/);
  }
});

test('only completed processor marks done; errors return to pending with safe code', async () => {
  const good = workerHarness(); await good.worker.drain(); assert.equal(good.calls.find(x => x.name.endsWith('finish_v1')).args.p_success, true);
  const bad = workerHarness({ processEvent: async () => { throw Object.assign(new Error('secret customer content'), { code: 'untrusted@example.test' }); } });
  await bad.worker.drain(); const finish = bad.calls.find(x => x.name.endsWith('finish_v1'));
  assert.equal(finish.args.p_success, false); assert.equal(finish.args.p_error_code, 'FB_INBOX_OPERATION_FAILED');
  assert.equal(JSON.stringify(bad.calls).includes('secret'), false);
});

test('lost heartbeat cannot complete or release the new owner lease', async () => {
  const gate = deferred(); const h = workerHarness({ renewResult: false, processEvent: () => gate.promise });
  const pending = h.worker.drain(); await tick(); h.renew(); await tick(); gate.resolve(); await pending;
  assert.equal(h.calls.some(x => x.name.endsWith('finish_v1')), false); assert.ok(h.errors.includes('FB_INBOX_LEASE_LOST'));
});

test('concurrent drains share one loop; stop waits for in-flight processor and prevents next claim', async () => {
  const gate = deferred(); const h = workerHarness({ processEvent: () => gate.promise });
  const first = h.worker.drain(); assert.equal(h.worker.drain(), first); await tick();
  let stopped = false; const stopping = h.worker.stop().then(() => { stopped = true; }); await tick(); assert.equal(stopped, false);
  gate.resolve(); await first; await stopping; await h.worker.drain();
  assert.equal(h.calls.filter(x => x.name.endsWith('claim_v1')).length, 1); assert.equal(stopped, true);
});

test('backlog alarm works while paused and emits only operational metrics', async () => {
  const h = workerHarness({ isPaused: () => true }); await h.worker.health();
  assert.deepEqual(h.metrics, [{ pendingCount: 2, processingCount: 0, oldestPendingSeconds: 301 }]); assert.ok(h.errors.includes('FB_INBOX_BACKLOG'));
  assert.equal(h.calls.some(x => x.name.endsWith('claim_v1')), false);
});

test('managed Page cannot bypass absent/unknown/denied scope contract', async () => {
  const settings = { managedPages: new Set(['10001']), scopeGuard: false };
  let called = false; const db = { rpc: async () => { called = true; return { error: { code: 'PGRST202' } }; } };
  await assertPageLegacyScope(db, 'other-page', settings); assert.equal(called, false);
  await assert.rejects(assertPageLegacyScope(db, '10001', settings), /SCOPE_GUARD_REQUIRED/);
  settings.scopeGuard = true; await assert.rejects(assertPageLegacyScope(db, '10001', settings), /DATABASE_UNAVAILABLE/);
  const response = { policy: 'CARE_LEGACY_WRITE_CHECK_V1', reservationMade: false, allowed: false, reason: 'MANAGED_PAGE', observedAt: new Date(0).toISOString(), scope: { pageIds: ['10001'], contactIds: [], leadIds: [], customerIds: [] } };
  db.rpc = async () => ({ data: response }); await assert.rejects(assertPageLegacyScope(db, '10001', settings), /MANAGED_PAGE_PENDING/);
  response.allowed = true; response.reason = 'LEGACY_SCOPE'; response.scope.pageIds = ['not-requested'];
  await assert.rejects(assertPageLegacyScope(db, '10001', settings), /SCOPE_UNAVAILABLE/);
});

test('error labels never accept provider text', () => {
  assert.equal(safeCode({ code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' }), 'FB_INBOX_LEAD_CONTRACT_REQUIRED');
  assert.equal(safeCode({ code: 'https://token.example.test' }), 'FB_INBOX_OPERATION_FAILED');
});

const leadAdsRow = () => ({ id: 'synthetic-lead-ad-inbox', page_id: '10001', payload: {
  kind: 'change', event: { field: 'leadgen', value: { leadgen_id: '30001', form_id: '40001' } },
} });

test('explicit Lead Ads lane selects only its claim RPC and passes the matching lease context', async () => {
  const seen = []; const pages = ['10001', '10002'];
  const h = workerHarness({ leadAdsPages: pages, claimRow: leadAdsRow(),
    processEvent: async (...args) => { seen.push(args); } });
  // Changing the caller's array after construction must not enroll a new Page.
  pages.push('99999'); await h.worker.drain();
  assert.equal(h.calls.some(call => call.name === 'facebook_page_inbox_claim_v1'), false);
  const claim = h.calls.find(call => call.name === 'facebook_page_inbox_claim_lead_ads_v1');
  assert.deepEqual(claim.args.p_page_ids, ['10001', '10002']);
  assert.equal(seen.length, 1); assert.equal(seen[0][0], '10001');
  assert.deepEqual(seen[0][1], leadAdsRow().payload);
  assert.deepEqual(seen[0][2], { inboxId: 'synthetic-lead-ad-inbox', leaseToken: claim.args.p_token });
  assert.equal(Object.isFrozen(seen[0][2]), true);
  const finish = h.calls.find(call => call.name === 'facebook_page_inbox_finish_v1');
  assert.equal(finish.args.p_id, seen[0][2].inboxId);
  assert.equal(finish.args.p_token, seen[0][2].leaseToken); assert.equal(finish.args.p_success, true);
});

test('default generic lane retains the H1 claim RPC without a Page filter', async () => {
  let context;
  const h = workerHarness({ processEvent: async (_pageId, _payload, lease) => { context = lease; } });
  await h.worker.drain();
  const claim = h.calls.find(call => call.name === 'facebook_page_inbox_claim_v1');
  assert.equal(Object.hasOwn(claim.args, 'p_page_ids'), false);
  assert.equal(h.calls.some(call => call.name === 'facebook_page_inbox_claim_lead_ads_v1'), false);
  assert.deepEqual(context, { inboxId: 'synthetic-id', leaseToken: claim.args.p_token });
});

test('empty or malformed explicit Lead Ads lane cannot silently fall back to generic processing', () => {
  for (const pages of [null, [], '', new Set(['10001']), [10001], [''], [' 10001'], ['1'.repeat(33)], ['10001', '10001']]) {
    assert.throws(() => workerHarness({ leadAdsPages: pages }), { code: 'FB_INBOX_INVALID_CONFIG' });
  }
});

test('missing Lead Ads claim RPC fails closed without retrying the generic lane', async () => {
  const names = []; let processed = 0;
  const h = workerHarness({ leadAdsPages: ['10001'],
    db: { rpc: async name => { names.push(name); return { data: null, error: { code: 'PGRST202' } }; } },
    processEvent: async () => { processed++; } });
  await h.worker.drain();
  assert.deepEqual(names, ['facebook_page_inbox_claim_lead_ads_v1']);
  assert.equal(processed, 0); assert.deepEqual(h.errors, ['FB_INBOX_DATABASE_UNAVAILABLE']);
});

for (const [description, patch] of [
  ['foreign Page', { page_id: '99999' }],
  ['Messenger', { payload: { kind: 'messaging', event: {} } }],
  ['entry event', { payload: { kind: 'entry', event: { field: 'leadgen' } } }],
  ['feed comment', { payload: { kind: 'change', event: { field: 'feed', value: { item: 'comment' } } } }],
  ['missing event', { payload: { kind: 'change' } }],
  ['array event', { payload: { kind: 'change', event: [] } }],
]) test(`Lead Ads lane rejects an unexpected claimed ${description} before processing or finishing`, async () => {
  let processed = 0;
  const h = workerHarness({ leadAdsPages: ['10001'], claimRow: { ...leadAdsRow(), ...patch },
    processEvent: async () => { processed++; } });
  await h.worker.drain();
  assert.equal(processed, 0); assert.deepEqual(h.errors, ['FB_INBOX_INVALID_CLAIM']);
  assert.equal(h.calls.some(call => /finish|renew/.test(call.name)), false);
});

test('Lead Ads lane preserves pause, Primary and old-queue-drained gates', async () => {
  for (const override of [
    { isPaused: () => true }, { isPrimary: () => false },
    { beforeClaim: async () => { throw Object.assign(new Error(), { code: 'FB_INBOX_LEGACY_QUEUE_PENDING' }); } },
  ]) {
    let processed = 0;
    const h = workerHarness({ leadAdsPages: ['10001'], claimRow: leadAdsRow(), ...override,
      processEvent: async () => { processed++; } });
    await h.worker.drain(); assert.equal(h.calls.length, 0); assert.equal(processed, 0);
  }
});

test('Lead Ads processor remains Primary-pinned and a scope denial returns its receipt to pending', async () => {
  let primaryDepth = 0; let processedInsidePrimary = false;
  const h = workerHarness({ leadAdsPages: ['10001'], claimRow: leadAdsRow(),
    withPrimary: async fn => { primaryDepth++; try { return await fn(); } finally { primaryDepth--; } },
    processEvent: async () => {
      processedInsidePrimary = primaryDepth > 0;
      throw Object.assign(new Error(), { code: 'FB_INBOX_MANAGED_PAGE_PENDING' });
    } });
  await h.worker.drain(); assert.equal(processedInsidePrimary, true);
  const finish = h.calls.find(call => call.name === 'facebook_page_inbox_finish_v1');
  assert.equal(finish.args.p_success, false); assert.equal(finish.args.p_error_code, 'FB_INBOX_MANAGED_PAGE_PENDING');
});

test('Lead Ads heartbeat uses the processor lease and a lost lease cannot finish', async () => {
  const gate = deferred(); let context;
  const h = workerHarness({ leadAdsPages: ['10001'], claimRow: leadAdsRow(), renewResult: false,
    processEvent: async (_pageId, _payload, lease) => { context = lease; await gate.promise; } });
  const pending = h.worker.drain(); await tick(); h.renew(); await tick(); gate.resolve(); await pending;
  const renewed = h.calls.find(call => call.name === 'facebook_page_inbox_renew_v1');
  assert.equal(renewed.args.p_id, context.inboxId); assert.equal(renewed.args.p_token, context.leaseToken);
  assert.equal(h.calls.some(call => call.name === 'facebook_page_inbox_finish_v1'), false);
  assert.ok(h.errors.includes('FB_INBOX_LEASE_LOST'));
});
