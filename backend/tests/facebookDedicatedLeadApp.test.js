'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHmac } = require('node:crypto');
const { inboxSettings, createDedicatedLeadAdsReceiver } = require('../src/helpers/facebookPageInbox');

const PAGE = '10001';
const OTHER = '10002';
const LEAD_SECRET = 'synthetic-lead-app-secret';
const MESSENGER_SECRET = 'synthetic-messenger-secret';
const VERIFY = 'synthetic-lead-verify-token';
const TOKEN = 'synthetic-lead-graph-token';
const body = () => ({ object: 'page', entry: [{ id: PAGE, changes: [{ field: 'leadgen', value: {
  page_id: PAGE, form_id: '40001', leadgen_id: '30001', ad_id: '50001',
} }] }] });
const signed = (value = body(), secret = LEAD_SECRET) => {
  const raw = Buffer.from(JSON.stringify(value));
  return { facebookRawBody: raw, body: { object: 'untrusted' }, headers: {
    'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'),
  } };
};
const env = () => ({ VPT_FB_PAGE_INBOX: '1', VPT_FB_LEAD_ADS_INTAKE: '1',
  VPT_FB_LEGACY_SCOPE_GUARD: '1', VPT_FB_MANAGED_PAGE_IDS: PAGE,
  VPT_FB_LEAD_APP_MODE: '1', VPT_FB_LEAD_APP_PAGE_ID: PAGE,
  VPT_FACEBOOK_APP_SECRET: MESSENGER_SECRET, VPT_FB_LEAD_APP_SECRET: LEAD_SECRET,
  VPT_FB_LEAD_APP_VERIFY_TOKEN: VERIFY, VPT_FB_LEAD_APP_ACCESS_TOKEN: TOKEN });

test('dedicated App remains opt-in and needs its own credentials, one managed Page and existing scope gates', () => {
  assert.equal(inboxSettings({}).dedicatedLeadApp, false);
  assert.equal(inboxSettings(env()).dedicatedLeadApp, true);
  assert.equal(inboxSettings({ ...env(), VPT_FACEBOOK_APP_SECRET: undefined }).dedicatedLeadApp, true);
  for (const key of ['VPT_FB_PAGE_INBOX', 'VPT_FB_LEAD_ADS_INTAKE', 'VPT_FB_LEGACY_SCOPE_GUARD',
    'VPT_FB_LEAD_APP_PAGE_ID', 'VPT_FB_LEAD_APP_SECRET',
    'VPT_FB_LEAD_APP_VERIFY_TOKEN', 'VPT_FB_LEAD_APP_ACCESS_TOKEN']) {
    const missing = env(); delete missing[key];
    assert.throws(() => inboxSettings(missing), { code: 'FB_INBOX_INVALID_CONFIG' }, key);
  }
  assert.throws(() => inboxSettings({ ...env(), VPT_FB_MANAGED_PAGE_IDS: `${PAGE},${OTHER}` }), /INVALID_CONFIG/);
  assert.throws(() => inboxSettings({ ...env(), VPT_FB_LEAD_APP_SECRET: MESSENGER_SECRET }), /INVALID_CONFIG/);
  assert.equal(inboxSettings({ ...env(), VPT_FB_LEAD_APP_MODE: 'true' }).dedicatedLeadApp, false);
});

function receiverHarness() {
  const state = { primary: true, status: [], errors: [], calls: [], inbox: new Map(), depth: 0 };
  const db = { async rpc(name, args) {
    assert.equal(name, 'facebook_page_inbox_enqueue_v1');
    assert.ok(state.depth > 0);
    state.calls.push(args.p_rows);
    if (state.rpcHook) return state.rpcHook(args);
    for (const row of args.p_rows) state.inbox.set(row.event_key, row);
    return { data: args.p_rows.length };
  } };
  const receive = createDedicatedLeadAdsReceiver({ db, isPrimary: () => state.primary,
    managedPages: new Set([PAGE]), secret: () => LEAD_SECRET,
    withPrimary: async fn => { state.depth++; try { return await fn(); } finally { state.depth--; } },
    onError: code => state.errors.push(code) });
  return { state, receive: req => receive(req, { sendStatus: code => state.status.push(code) }) };
}

test('lead-only signed callback stores one durable event before ACK and repeated delivery stays one event', async () => {
  const h = receiverHarness();
  let confirm;
  h.state.rpcHook = () => new Promise(resolve => { confirm = resolve; });
  const pending = h.receive(signed());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.state.status, []);
  confirm({ data: 1 }); await pending;
  assert.deepEqual(h.state.status, [200]);
  h.state.rpcHook = null;
  await h.receive(signed()); await h.receive(signed());
  assert.equal(h.state.inbox.size, 1);
  assert.deepEqual(h.state.status, [200, 200, 200]);
});

test('wrong App signature, foreign Page, Messenger, feed and malformed identity never enqueue', async () => {
  for (const request of [
    signed(body(), MESSENGER_SECRET),
    signed({ object: 'page', entry: [{ id: PAGE, changes: [] }] }),
    signed({ object: 'page', entry: [{ id: OTHER, changes: body().entry[0].changes }] }),
    signed({ object: 'page', entry: [{ id: PAGE, messaging: [{ message: { mid: 'm1' } }] }] }),
    signed({ object: 'page', entry: [{ id: PAGE, changes: [{ field: 'feed', value: {} }] }] }),
    signed({ object: 'page', entry: [{ id: PAGE, changes: [body().entry[0].changes[0], { field: 'feed', value: {} }] }] }),
    signed({ object: 'page', entry: [{ id: PAGE, changes: [{ field: 'leadgen', value: { form_id: '40001' } }] }] }),
  ]) {
    const h = receiverHarness(); await h.receive(request);
    assert.ok([400, 403].includes(h.state.status[0]));
    assert.equal(h.state.calls.length, 0);
  }
});

test('lost Primary or partial commit does not ACK a Lead', async () => {
  const h = receiverHarness(); h.state.primary = false;
  await h.receive(signed()); assert.deepEqual(h.state.status, [503]); assert.equal(h.state.calls.length, 0);
  h.state.primary = true; h.state.rpcHook = () => ({ data: 0 });
  await h.receive(signed()); assert.deepEqual(h.state.status, [503, 503]);
});

const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/facebook.js'), 'utf8');
function routeText(method) {
  const start = routeSource.indexOf(`r.${method}('/webhook/lead-ads',`);
  assert.notEqual(start, -1);
  const end = routeSource.indexOf('\n});', start); assert.notEqual(end, -1);
  return routeSource.slice(start, end + 4);
}

test('actual dedicated GET/POST routes remain closed when flag is off and GET never accepts Messenger token', async () => {
  for (const enabled of [false, true]) {
    const handlers = {};
    const context = { r: { get(_path, fn) { handlers.get = fn; }, post(_path, fn) { handlers.post = fn; } },
      PAGE_INBOX: { dedicatedLeadApp: enabled }, process: { env: { VPT_FB_LEAD_APP_VERIFY_TOKEN: VERIFY } },
      receiveDedicatedLeadAds: async (_req, res) => res.sendStatus(200) };
    vm.runInNewContext(routeText('get') + '\n' + routeText('post'), context);
    const result = [];
    const res = { sendStatus: code => result.push(code), status(code) { result.push(code); return res; }, send: value => result.push(value) };
    handlers.get({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': 'synthetic-challenge' } }, res);
    await handlers.post({}, res);
    assert.deepEqual(result, enabled ? [200, 'synthetic-challenge', 200] : [404, 404]);
    if (enabled) {
      handlers.get({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': MESSENGER_SECRET,
        'hub.challenge': 'synthetic-challenge' } }, res);
      assert.equal(result.at(-1), 403);
    }
  }
});
