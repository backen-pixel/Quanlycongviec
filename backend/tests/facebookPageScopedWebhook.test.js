'use strict';

// Real signed handoff, legacy enqueue, exact route/functions; synthetic DB only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHmac } = require('node:crypto');
const { createLeadAdsWebhookHandoff, createPageInboxWorker, isManagedLeadAdsContact, safeCode } = require('../src/helpers/facebookPageInbox');
const { enqueueMessengerEvents } = require('../src/helpers/facebookMessengerReceipt');
const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/facebook.js'), 'utf8');
const SECRET = 'synthetic-only-secret-for-scoped-tests';
const PAGE = '10001'; const OTHER = '10002';
const clone = value => JSON.parse(JSON.stringify(value));
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const mixedBody = () => ({ object: 'page', entry: [
  { id: PAGE, time: 1, messaging: [{ message: { mid: 'm1', text: 'synthetic' } }], changes: [
    { field: 'leadgen', value: { leadgen_id: '30001', form_id: '40001' } },
    { field: 'feed', value: { item: 'comment', comment_id: '50001' } },
  ] },
  { id: OTHER, messaging: [{ message: { mid: 'm2' } }], changes: [
    { field: 'leadgen', value: { leadgen_id: '30002', form_id: '40002' } },
  ] },
] });
function request(body = mixedBody()) {
  const raw = Buffer.from(JSON.stringify(body));
  return { body: clone(body), facebookRawBody: raw,
    headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', SECRET).update(raw).digest('hex') } };
}
function routeText(method, route) {
  const start = source.indexOf("r." + method + "('" + route + "',");
  assert.notEqual(start, -1, 'Actual route must exist: ' + route);
  const end = source.indexOf('\n});', start); assert.notEqual(end, -1);
  return source.slice(start, end + 4);
}
function functionText(name, text = source) {
  const found = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(text);
  assert.ok(found, 'Actual function must exist: ' + name);
  const closing = /^}\r?$/mg; closing.lastIndex = found.index;
  const end = closing.exec(text); assert.ok(end);
  return text.slice(found.index, end.index + 1);
}

function webhookHarness({ scoped = true, generic = false, dedicated = false } = {}) {
  const state = { primary: true, depth: 0, events: [], statuses: [], errors: [],
    inbox: new Map(), messenger: new Map(), inline: [], generic: 0 };
  const withPrimary = async fn => { state.depth++; try { return await fn(); } finally { state.depth--; } };
  const db = {
    async rpc(name, args) {
      assert.equal(name, 'facebook_page_inbox_enqueue_v1'); assert.ok(state.depth > 0);
      state.events.push('inbox');
      if (state.inboxHook) return state.inboxHook(args);
      for (const row of args.p_rows) state.inbox.set(row.event_key, clone(row));
      return { data: args.p_rows.length };
    },
    from(table) {
      assert.equal(table, 'facebook_messenger_receipts');
      return { async upsert(rows, options) {
        state.events.push('messenger'); assert.equal(options.ignoreDuplicates, true);
        if (state.messengerHook) return state.messengerHook(rows);
        for (const row of rows) state.messenger.set(row.event_key, clone(row));
        return { error: null };
      } };
    },
  };
  const pages = new Set([PAGE]);
  const handoff = createLeadAdsWebhookHandoff({ db, isPrimary: () => state.primary, withPrimary,
    secret: () => SECRET, managedPages: pages,
    dedicatedLeadApp: dedicated,
    enqueueLegacy: body => enqueueMessengerEvents(db, body.entry, pages) });
  let handler;
  vm.runInNewContext(routeText('post', '/webhook'), {
    r: { post(_route, fn) { handler = fn; } }, supabase: db,
    PAGE_INBOX: { enabled: scoped || generic, leadAdsIntake: scoped, dedicatedLeadApp: dedicated,
      scopeGuard: scoped, managedPages: scoped ? pages : new Set() },
    DURABLE_MESSENGER_PAGES: pages, enqueueMessengerEvents, handoffLeadAdsWebhook: handoff,
    pageInboxError: code => state.errors.push(code), safeCode, FB_DISABLE_WEBHOOK_LOGS: true, console: quiet,
    receivePageInbox: async (_req, res) => { state.generic++; return res.sendStatus(200); },
    messengerReceiptWorker: { drain() { state.events.push('drain-messenger'); } },
    handleMessaging: async (pageId, event) => state.inline.push(['messaging', pageId, event]),
    handleLeadGen: async (pageId, value) => state.inline.push(['leadgen', pageId, value]),
    handleComment: async (pageId, value) => state.inline.push(['comment', pageId, value]),
  });
  return { state, handoff, pages, db, async receive(req = request()) {
    await handler(req, { sendStatus(code) { state.events.push('ack-' + code); state.statuses.push(code); } });
  } };
}

test('separate App mode strips managed leadgen from old unsigned callback without touching Messenger', async () => {
  const h = webhookHarness({ dedicated: true });
  const unsigned = request(); unsigned.headers = {}; unsigned.facebookRawBody = undefined;
  await h.receive(unsigned);
  assert.deepEqual(h.state.statuses, [200]);
  assert.equal(h.state.inbox.size, 0);
  assert.equal(h.state.messenger.size, 1);
  assert.ok(h.state.inline.some(([kind, pageId]) => kind === 'comment' && pageId === PAGE));
  assert.ok(h.state.inline.some(([kind, pageId]) => kind === 'leadgen' && pageId === OTHER));
  assert.equal(h.state.inline.some(([kind, pageId]) => kind === 'leadgen' && pageId === PAGE), false);
});

test('separate App mode preserves old callback behavior for non-Page and large Messenger batches', async () => {
  const nonPage = webhookHarness({ dedicated: true });
  await nonPage.receive({ body: { object: 'instagram', entry: [] }, headers: {} });
  assert.deepEqual(nonPage.state.statuses, [200]);

  const large = webhookHarness({ dedicated: true });
  const batch = { object: 'page', entry: Array.from({ length: 101 }, (_, index) => ({
    id: PAGE, messaging: [{ message: { mid: `m${index}` } }],
  })) };
  await large.receive({ body: batch, headers: {} });
  assert.deepEqual(large.state.statuses, [200]);
  assert.equal(large.state.messenger.size, 101);
});

test('scoped signed mixed delivery enqueues only managed leadgen and preserves legacy Messenger/comment/other Page', async () => {
  const h = webhookHarness(); const req = request();
  req.body = { object: 'untrusted replacement' };
  await h.receive(req);
  assert.deepEqual(h.state.statuses, [200]);
  assert.deepEqual(h.state.events.slice(0, 3), ['inbox', 'messenger', 'ack-200']);
  assert.equal(h.state.inbox.size, 1); assert.equal(h.state.messenger.size, 1);
  assert.deepEqual([...h.state.inbox.values()].map(row => [row.page_id, row.payload.kind, row.payload.event.field]),
    [[PAGE, 'change', 'leadgen']]);
  assert.deepEqual(h.state.inline.map(([kind, pageId]) => [kind, pageId]),
    [['comment', PAGE], ['messaging', OTHER], ['leadgen', OTHER]]);
});
test('every form on a managed Page is owned by intake even when binding is not yet known', async () => {
  const h = webhookHarness(); const body = mixedBody();
  body.entry[0].changes.push({ field: 'leadgen', value: { form_id: 'unbound', leadgen_id: '30003' } });
  await h.receive(request(body));
  assert.equal(h.state.inbox.size, 2);
  assert.equal(h.state.inline.filter(([kind, pageId]) => kind === 'leadgen' && pageId === PAGE).length, 0);
});
test('constructor snapshots managed Pages so later mutation cannot widen the split', async () => {
  const h = webhookHarness(); h.pages.add(OTHER);
  await h.receive();
  assert.equal(h.state.inbox.size, 1);
  assert.ok(h.state.inline.some(([kind, pageId]) => kind === 'leadgen' && pageId === OTHER));
});
test('Messenger-only signed delivery keeps its existing queue while new intake Primary is unavailable', async () => {
  const h = webhookHarness(); h.state.primary = false;
  const body = mixedBody(); body.entry = [{ id: PAGE, messaging: body.entry[0].messaging }];
  await h.receive(request(body));
  assert.deepEqual(h.state.statuses, [200]); assert.equal(h.state.inbox.size, 0);
  assert.equal(h.state.messenger.size, 1); assert.ok(h.state.events.includes('drain-messenger'));
});
test('no ACK or legacy dispatch occurs before both required queues confirm', async () => {
  const h = webhookHarness(); let confirm;
  h.state.messengerHook = () => new Promise(resolve => { confirm = resolve; });
  const pending = h.receive(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.inbox.size, 1); assert.deepEqual(h.state.statuses, []); assert.deepEqual(h.state.inline, []);
  confirm({ error: null }); await pending; assert.deepEqual(h.state.statuses, [200]);
});
test('second queue failure causes retry and preserves exactly one committed Lead Ads event', async () => {
  const h = webhookHarness(); h.state.messengerHook = async () => ({ error: { message: 'synthetic-private' } });
  await h.receive(); assert.deepEqual(h.state.statuses, [503]); assert.equal(h.state.inbox.size, 1);
  assert.deepEqual(h.state.inline, []); assert.deepEqual(h.state.errors, ['FB_INBOX_LEGACY_ENQUEUE_FAILED']);
  delete h.state.messengerHook; await h.receive();
  assert.deepEqual(h.state.statuses, [503, 200]); assert.equal(h.state.inbox.size, 1); assert.equal(h.state.messenger.size, 1);
  assert.equal(h.state.inline.filter(([kind]) => kind === 'comment').length, 1);
});
for (const result of [{ error: {} }, { data: 0 }, null]) {
  test('failed or partial selected enqueue stops ACK and all legacy paths: ' + JSON.stringify(result), async () => {
    const h = webhookHarness(); h.state.inboxHook = async () => result;
    await h.receive(); assert.deepEqual(h.state.statuses, [503]);
    assert.equal(h.state.events.includes('messenger'), false); assert.deepEqual(h.state.inline, []);
  });
}
test('Primary changes before or after mixed handoff prevent success', async () => {
  for (const at of ['before', 'after-lead', 'after-messenger']) {
    const h = webhookHarness();
    if (at === 'before') h.state.primary = false;
    if (at === 'after-lead') h.state.inboxHook = async args => { h.state.primary = false; return { data: args.p_rows.length }; };
    if (at === 'after-messenger') h.state.messengerHook = async () => { h.state.primary = false; return { error: null }; };
    await h.receive(); assert.deepEqual(h.state.statuses, [503]); assert.deepEqual(h.state.inline, []);
  }
});
test('invalid signature, mismatched raw body and malformed envelopes have no queue or inline side effects', async () => {
  const requests = [request(), request(), request({ object: 'page', entry: [{ id: PAGE, messaging: {} }] })];
  requests[0].headers = {};
  requests[1].facebookRawBody = Buffer.concat([requests[1].facebookRawBody, Buffer.from(' ')]);
  for (const req of requests) {
    const h = webhookHarness(); await h.receive(req);
    assert.ok([400, 403].includes(h.state.statuses[0])); assert.equal(h.state.inbox.size, 0);
    assert.equal(h.state.messenger.size, 0); assert.deepEqual(h.state.inline, []);
  }
});
test('flag-off keeps old dispatch; generic H1 remains a full-endpoint handoff', async () => {
  const old = webhookHarness({ scoped: false }); await old.receive();
  assert.equal(old.state.inbox.size, 0); assert.equal(old.state.messenger.size, 1);
  assert.ok(old.state.inline.some(([kind, pageId]) => kind === 'leadgen' && pageId === PAGE));
  const h1 = webhookHarness({ scoped: false, generic: true }); await h1.receive();
  assert.equal(h1.state.generic, 1); assert.equal(h1.state.inbox.size, 0);
  assert.equal(h1.state.messenger.size, 0); assert.deepEqual(h1.state.inline, []);
});

test('actual Messenger timer runs in scoped mode; generic H1 keeps its prior scope stop', async () => {
  const start = source.indexOf('if (DURABLE_MESSENGER_PAGES.size &&');
  assert.notEqual(start, -1); const end = source.indexOf('\n}', start);
  for (const [scoped, guarded, expected] of [[true, true, 2], [false, true, 0], [false, false, 2]]) {
    let started = 0;
    vm.runInNewContext(source.slice(start, end + 2), {
      DURABLE_MESSENGER_PAGES: new Set([PAGE]),
      PAGE_INBOX: { leadAdsIntake: scoped, scopeGuard: guarded, managedPages: guarded ? new Set([PAGE]) : new Set() },
      setInterval() { started++; return { unref() {} }; }, setImmediate() { started++; },
      messengerReceiptWorker: { drain() {} },
    });
    assert.equal(started, expected);
  }
});
test('actual scoped worker can claim with Messenger backlog while generic H1 retains the drain prerequisite', async () => {
  const start = source.indexOf('const pageInboxWorker = createPageInboxWorker({');
  const end = source.indexOf('\n});', start);
  for (const scoped of [true, false]) {
    let options; let checks = 0; const rpcCalls = []; const errors = [];
    const db = {
      from() { checks++; return { select() { return { neq: async () => ({ count: 1 }) }; } }; },
      rpc: async name => { rpcCalls.push(name); return { data: [] }; },
    };
    vm.runInNewContext(source.slice(start, end + 4), {
      createPageInboxWorker(value) { options = value; }, supabase: db,
      pageInboxPrimary: () => true, withPrimaryDatabase: fn => fn(),
      PAGE_INBOX: { enabled: true, leadAdsIntake: scoped, managedPages: new Set([PAGE]) },
      process: { env: { VPT_FB_PAGE_INBOX_WORKER_PAUSED: '0' } },
      console: quiet, pageInboxError: code => errors.push(code),
    });
    await createPageInboxWorker(options).drain();
    if (scoped) { assert.equal(checks, 0); assert.deepEqual(rpcCalls, ['facebook_page_inbox_claim_lead_ads_v1']); }
    else { assert.equal(checks, 1); assert.deepEqual(rpcCalls, []); assert.deepEqual(errors, ['FB_INBOX_LEGACY_QUEUE_PENDING']); }
  }
});

function guardHarness({ enabled = true, contact = { id: 'c1', page_id: PAGE, psid: 'leadad_30001' },
  receipt = null, errorTable = null } = {}) {
  const state = { queries: [], writes: 0, inner: 0 };
  const db = { from(table) {
    const query = { select() { return query; }, eq() { return query; },
      or() { return query; }, order() { return query; }, limit() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: [contact] }).then(resolve, reject); },
      async maybeSingle() {
        state.queries.push(table);
        if (errorTable === table) return { data: null, error: { message: 'synthetic-private' } };
        return { data: table === 'facebook_contacts' ? contact : receipt };
      },
      async single() { return query.maybeSingle(); },
      update() { state.writes++; throw new Error('Unexpected write'); },
      delete() { state.writes++; throw new Error('Unexpected write'); },
    }; return query;
  } };
  const context = vm.createContext({
    PAGE_INBOX: { leadAdsIntake: enabled, managedPages: new Set([PAGE]) },
    isManagedLeadAdsContact, supabase: db, console: quiet,
    withAsyncLock: async (_key, fn) => fn(), createLeadFromFacebookInner: async () => { state.inner++; return { id: 'legacy' }; },
  });
  for (const name of ['requireFacebookResult', 'assertLegacyLeadAdsWrite', 'isLegacyContactProtected',
    'assertLegacyContactWrite', 'assertLegacyMaintenanceAllowed', 'createLeadFromFacebook']) {
    vm.runInContext(functionText(name), context);
  }
  return { state, context, db };
}
test('common creator rejects managed Lead Ads even when caller omitted psid or spoofed another Page', async () => {
  const h = guardHarness();
  await assert.rejects(h.context.createLeadFromFacebook(OTHER, { id: 'c1' }, 'Messenger (batch)'),
    { code: 'FB_INBOX_LEAD_ADS_LEGACY_WRITE_BLOCKED' });
  assert.equal(h.state.inner, 0); assert.equal(h.state.writes, 0);
});
test('receipt ownership still prevents legacy writes after contact identity changed', async () => {
  const h = guardHarness({ contact: { id: 'c1', page_id: OTHER, psid: '20001' }, receipt: { page_id: PAGE, contact_id: 'c1' } });
  await assert.rejects(h.context.assertLegacyContactWrite('c1'), { code: 'FB_INBOX_LEAD_ADS_LEGACY_WRITE_BLOCKED' });
  assert.deepEqual(h.state.queries, ['facebook_contacts', 'facebook_lead_ads_intake_receipts']);
});
test('ownership read failures fail closed, while flag-off needs no SQL702 table', async () => {
  for (const errorTable of ['facebook_contacts', 'facebook_lead_ads_intake_receipts']) {
    const h = guardHarness({ contact: { id: 'c1', page_id: PAGE, psid: '20001' }, errorTable });
    await assert.rejects(h.context.createLeadFromFacebook(PAGE, { id: 'c1' }, 'Messenger'),
      { code: 'FB_INBOX_LEGACY_CONTACT_SCOPE_UNAVAILABLE' });
    assert.equal(h.state.inner, 0);
  }
  const old = guardHarness({ enabled: false, errorTable: 'facebook_contacts' });
  await old.context.createLeadFromFacebook(PAGE, { id: 'c1', psid: 'leadad_30001' }, 'Lead Ads');
  assert.equal(old.state.inner, 1); assert.deepEqual(old.state.queries, []);
});
test('ordinary Messenger and unmanaged Lead Ads retain the common creation path', async () => {
  for (const contact of [{ id: 'c1', page_id: PAGE, psid: '20001' }, { id: 'c1', page_id: OTHER, psid: 'leadad_30001' }]) {
    const h = guardHarness({ contact });
    await h.context.createLeadFromFacebook(contact.page_id, contact, 'Messenger');
    assert.equal(h.state.inner, 1);
  }
});
test('both direct legacy Lead Ads handlers reject before provider/database I/O', async () => {
  const h = guardHarness();
  for (const name of ['handleLeadGen', 'handleDurableFacebookLeadGen']) {
    vm.runInContext(functionText(name), h.context);
    await assert.rejects(h.context[name](PAGE, { form_id: '40001', leadgen_id: '30001' }),
      { code: 'FB_INBOX_LEAD_ADS_LEGACY_WRITE_BLOCKED' });
  }
  assert.deepEqual(h.state.queries, []); assert.equal(h.state.writes, 0);
});
for (const [method, route] of [['put', '/contacts/:id/link-lead'], ['put', '/contacts/:id'],
  ['delete', '/contacts/:id'], ['post', '/contacts/:id/create-lead'],
  ['post', '/contacts/:id/reconcile-inbound-phone'], ['post', '/contacts/:id/sync-history']]) {
  test('actual ' + method + ' ' + route + ' rejects managed contact before mutation', async () => {
    const h = guardHarness(); let handler; let result;
    Object.assign(h.context, {
      r: { [method](_route, _auth, fn) { handler = fn; } }, authMiddleware() {},
      resolveFacebookPageScope: async () => ({ mode: 'all' }), contactAllowedByFacebookScope: () => true,
    });
    vm.runInContext(routeText(method, route), h.context);
    const res = { status() { return res; }, json(value) { result = value; } };
    await handler({ params: { id: 'c1' }, body: {} }, res);
    assert.equal(result.error, 'FB_INBOX_LEAD_ADS_LEGACY_WRITE_BLOCKED'); assert.equal(h.state.writes, 0);
  });
}
test('single-contact GET cannot silently erase a managed receipt link when Lead join is unavailable', async () => {
  const h = guardHarness({ contact: { id: 'c1', page_id: PAGE, psid: 'leadad_30001', lead_id: 'lead-1', lead: null } });
  let handler; let result;
  Object.assign(h.context, {
    r: { get(_route, _auth, fn) { handler = fn; } }, authMiddleware() {},
    resolveFacebookPageScope: async () => ({ mode: 'all' }), enrichContactActivityFields: () => ({}),
  });
  vm.runInContext(routeText('get', '/contacts/:id'), h.context);
  const res = { status() { return res; }, json(value) { result = value; } };
  await handler({ params: { id: 'c1' } }, res);
  assert.equal(result.lead_id, 'lead-1'); assert.equal(h.state.writes, 0);
});
for (const route of ['/dedup-leads', '/sync-source-ids', '/sync-contact-phones', '/batch-extract-phones', '/tools/link-only-phones/execute']) {
  test('broad maintenance ' + route + ' is locked before legacy side effects', async () => {
    const h = guardHarness(); let handler; let result;
    Object.assign(h.context, { r: { post(_route, _auth, fn) { handler = fn; } }, authMiddleware() {} });
    vm.runInContext(routeText('post', route), h.context);
    const res = { status() { return res; }, json(value) { result = value; } };
    await handler({ body: {}, user: {} }, res);
    assert.match(result.error, /tạm khóa/); assert.deepEqual(h.state.queries, []); assert.equal(h.state.writes, 0);
  });
}
for (const name of ['runExtractPhonesFinalLeadDescriptionSync', 'runRescanPhonesBatch', 'runLeadScanByDateBatch', 'applyPhoneQualityActions']) {
  test('background maintenance ' + name + ' cannot bypass the scoped intake lock', async () => {
    const h = guardHarness(); vm.runInContext(functionText(name), h.context);
    await assert.rejects(h.context[name]({}), { code: 'FB_INBOX_LEGACY_MAINTENANCE_BLOCKED' });
    assert.deepEqual(h.state.queries, []); assert.equal(h.state.writes, 0);
  });
}
test('shared Graph sync and phone extraction skip protected contacts before any provider/write', async () => {
  const h = guardHarness();
  for (const name of ['graphSyncMessagesForContactRow', 'applyExtractFromDbMessagesForContact']) {
    vm.runInContext(functionText(name), h.context);
    const result = await h.context[name]({ id: 'c1' }, {});
    assert.ok([result.status, result.outcome].includes('lead_ads_managed_skip'));
  }
  assert.equal(h.state.writes, 0);
});
test('Auto Tool checks fresh ownership before even its legacy Graph/extract/update branch', async () => {
  const text = fs.readFileSync(path.resolve(__dirname, '../src/helpers/autoTool.js'), 'utf8');
  let checks = 0;
  const context = vm.createContext({
    _coreFns: { isLegacyContactProtected: async id => { assert.equal(id, 'c1'); checks++; return true; } },
    state: { config: { limit: 20, delayMs: 0 }, offset: 0, processedTotal: 0 },
    loadContacts: async () => [{ id: 'c1', page_id: PAGE, psid: 'leadad_30001' }],
    pushLog() {}, emit() {},
  });
  vm.runInContext(functionText('runOneBatch', text), context);
  await context.runOneBatch(); assert.equal(checks, 1); assert.equal(context.state.offset, 1);
});
test('Pipeline skips protected contacts in both normal processing and destructive cleanup', async () => {
  const h = guardHarness();
  Object.assign(h.context, {
    loadAutoLeadConfig: async () => ({ trigger: 'first_message' }),
    loadContactsForPipelineV2: async () => [{ id: 'c1' }],
    loadContactsWithLeadForCleanup: async () => [{ id: 'c1' }],
  });
  vm.runInContext(functionText('runPipelineV2OnePass'), h.context);
  const result = await h.context.runPipelineV2OnePass({ clearPhoneWhenNoNewInbound: true, cleanupContactsWithLead: true,
    deleteLeadWhenNoPhoneAfterClear: true });
  assert.equal(result.details[0].lead_status, 'lead_ads_managed_skip');
  assert.equal(result.cleanup_details[0].reconcile, 'lead_ads_managed_skip');
  assert.equal(result.leadsCreated, 0); assert.equal(result.leadsDeletedAfterClear, 0); assert.equal(h.state.writes, 0);
});
test('legacy server scanner skips a managed Lead Ads contact before message reads or Customer/Lead writes', async () => {
  const text = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
  const start = text.indexOf('  const scanMissingLeads = async () => {');
  assert.notEqual(start, -1); const end = text.indexOf('\n  };', start); assert.notEqual(end, -1);
  const tables = [];
  const db = { from(table) {
    tables.push(table); assert.equal(table, 'facebook_contacts');
    const q = { select() { return q; }, limit() { return q; }, is() { return q; }, neq() { return q; },
      then(resolve, reject) { return Promise.resolve({ data: [{ id: 'c1', page_id: PAGE, psid: 'leadad_30001' }] }).then(resolve, reject); } };
    return q;
  } };
  const context = vm.createContext({
    console: quiet, require(name) {
      if (name === './config/supabase') return { supabase: db };
      if (name === './config/autoLeadConfig') return { getConfig: () => ({ trigger: 'first_message' }) };
      if (name === './helpers/facebookContactActivity') return { sortFacebookContactsNewestFirst: rows => rows };
      if (name === './helpers/facebookPageInbox') return { inboxSettings: () => ({ leadAdsIntake: true, managedPages: new Set([PAGE]) }), isManagedLeadAdsContact };
      throw new Error('Unexpected scanner dependency: ' + name);
    },
  });
  vm.runInContext(text.slice(start, end + 5) + '\nthis.scan = scanMissingLeads;', context);
  await context.scan(); assert.deepEqual(tables, ['facebook_contacts', 'facebook_contacts']);
});
test('malformed ownership rows cannot authorize a legacy write', async () => {
  for (const options of [
    { contact: { id: 'c1', page_id: PAGE } },
    { contact: { id: 'another', page_id: PAGE, psid: '20001' } },
    { contact: { id: 'c1', page_id: PAGE, psid: '20001' }, receipt: {} },
  ]) {
    const h = guardHarness(options);
    await assert.rejects(h.context.assertLegacyContactWrite('c1'), { code: 'FB_INBOX_LEGACY_CONTACT_SCOPE_UNAVAILABLE' });
    assert.equal(h.state.writes, 0);
  }
});
for (const route of ['/batch-sync-messages', '/refresh-names']) {
  for (const mode of ['protected', 'ordinary', 'read-error']) {
    test('actual ' + route + ' checks fresh identity before Graph or writes: ' + mode, async () => {
      const contact = { id: 'c1', page_id: PAGE, psid: mode === 'ordinary' ? '20001' : 'leadad_30001', fb_name: 'Synthetic' };
      const h = guardHarness({ contact, errorTable: mode === 'read-error' ? 'facebook_contacts' : null });
      let handler; let body; let status = 200; let graphs = 0;
      Object.assign(h.context, {
        r: { post(_route, _auth, fn) { handler = fn; } }, authMiddleware() {},
        resolvePageIdsForCompanyScoped: async () => [PAGE], applyPageIdsFilter: query => query,
        loadFacebookContactsForBatchPipeline: async () => ({ contacts: [contact], excludedStaleNoContact: 0, rawFetched: 1 }),
        sortFacebookContactsNewestFirst: rows => rows, getFbPipelineConfigSync: () => ({}),
        FB_SYNC_BATCH_GRAPH_MAX_PAGES: 1, AUTO_PIPELINE_RECENT_HOURS: 1, FB_FETCH_PROFILE_PIC: false,
        getPageConfig: async () => ({ access_token: 'SYNTHETIC_ONLY_TOKEN' }),
        graphResolveConversationIdForPsid: async () => { graphs++; return { convId: null }; },
        fetchProfileViaConversations: async () => { graphs++; return {}; },
      });
      vm.runInContext(routeText('post', route), h.context);
      const res = { status(code) { status = code; return res; }, json(value) { body = value; } };
      await handler({ body: { mode: 'all' } }, res);
      assert.equal(h.state.writes, 0);
      if (mode === 'read-error') {
        assert.equal(status, 500); assert.equal(body.error, 'FB_INBOX_LEGACY_CONTACT_SCOPE_UNAVAILABLE'); assert.equal(graphs, 0);
      } else {
        assert.equal(status, 200); assert.equal(graphs, mode === 'ordinary' ? 1 : 0);
        if (mode === 'protected') {
          const rows = body.details || body.log_lines;
          assert.ok(rows.some(row => row.sync_status === 'lead_ads_managed_skip' || row.status === 'lead_ads_managed_skip'));
        }
      }
    });
  }
}
