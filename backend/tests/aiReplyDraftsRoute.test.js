'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiReplyDrafts.js'), 'utf8');
const leadId = '11111111-1111-4111-8111-111111111111';
const draftId = '44444444-4444-4444-8444-444444444444';
const company = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherCompany = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pilotUser = '22222222-2222-4222-8222-222222222222';
const PAGE = 'synthetic-page';
const adminUser = (over = {}) => ({ userId: pilotUser, role: 'admin', company_id: company, ...over });

function harness({ enabled = true, session = adminUser(), leadCompany = company, page = PAGE,
  target = 'primary', env = {}, storeError = null } = {}) {
  const layers = [], calls = [], generate = [];
  const db = { from(table) {
    calls.push(['from', table]);
    const rows = { crm_leads: { id: leadId, company_id: leadCompany },
      facebook_contacts: { page_id: page },
      ai_reply_draft_events: { draft_id: draftId, revision: 1, kind: 'GENERATED', draft_text: 'Dạ chào anh', policy_reasons: [] } };
    const chain = { select() { return chain; }, eq() { return chain; }, order() { return chain; },
      in(column, values) { calls.push(['in', column, values]); return chain; }, gte() { return chain; },
      limit() { return chain; }, async maybeSingle() { return { data: rows[table], error: null }; },
      then(resolve) { resolve({ data: [rows[table]], error: null }); } };
    return chain;
  } };
  const recorded = [];
  const record = kind => async (_db, input) => {
    recorded.push([kind, input]);
    if (storeError) throw Object.assign(new Error(storeError), { code: storeError });
    return { event: { draft_id: input.draftId, revision: input.expectedRevision + 1, kind: kind.toUpperCase() } };
  };
  const fakeStore = { recordEdited: record('edited'), recordSentByHuman: record('sent'), recordRejected: record('rejected') };
  const router = { use(fn) { layers.push({ method: 'USE', fn }); },
    get(p, fn) { layers.push({ method: 'GET', path: p, fn }); },
    post(p, fn) { layers.push({ method: 'POST', path: p, fn }); } };
  const imports = {
    express: { Router: () => router },
    '../config/supabase': { supabase: db },
    '../config/supabaseRouter': { getActiveTarget: () => target, withPrimaryDatabase: cb => cb() },
    '../middleware/auth': { auth: (req, res, next) => session ? next() : res.status(401).json({ error: 'x' }) },
    '../helpers/adminRole': require('../src/helpers/adminRole'),
    '../modules/aiReplyDraft/store': fakeStore,
    '../modules/aiReplyDraft/service': { createDraftService: () => ({
      async generateForLead(id, opts) { generate.push([id, opts]); return { status: 'GENERATED', draftId: draftId, text: 'Dạ chào anh' }; } }) },
    '../modules/aiReplyDraft/provider': { createOpenAiProvider: () => ({}) },
    '../modules/aiReplyDraft/config': require('../src/modules/aiReplyDraft/config'),
    '../modules/aiReplyDraft/report': require('../src/modules/aiReplyDraft/report'),
  };
  const processEnv = { P2_AI_DRAFTS_ENABLED: enabled ? '1' : '0', P2_AI_DRAFTS_COMPANY_IDS: company,
    P2_AI_DRAFTS_PAGE_IDS: PAGE, P2_AI_DRAFTS_USER_IDS: pilotUser, ...env };
  vm.runInNewContext(`(function(require,module,process){${source}\n})`,
    { Buffer, console, JSON, Object, String, Number, Array, Boolean }).call(null,
    name => imports[name], { exports: {} }, { env: processEnv });
  async function send(method, route, body = undefined) {
    const found = layers.find(l => l.method === method && l.path === route);
    const req = { user: session, params: { leadId, draftId }, body };
    const res = { statusCode: 200, body: undefined,
      status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
    for (const layer of [...layers.filter(l => l.method === 'USE'), found]) {
      let advanced = false;
      await layer.fn(req, res, () => { advanced = true; });
      if (!advanced) break;
    }
    return res;
  }
  return { send, calls, generate, recorded };
}
const GEN = '/leads/:leadId/generate';

test('flag off returns 404 without any DB access', async () => {
  const h = harness({ enabled: false });
  assert.equal((await h.send('POST', GEN, { request_id: 'r1' })).statusCode, 404);
  assert.equal(h.calls.length, 0);
});
test('unauthenticated request is rejected before DB access', async () => {
  const h = harness({ session: null });
  assert.equal((await h.send('POST', GEN, { request_id: 'r1' })).statusCode, 401);
  assert.equal(h.calls.length, 0);
});
for (const [label, session] of [['non-admin role', adminUser({ role: 'sales' })],
  ['admin not in pilot list', adminUser({ userId: '99999999-9999-4999-8999-999999999999' })]]) {
  test(`${label} gets 403 and no service call`, async () => {
    const h = harness({ session });
    assert.equal((await h.send('POST', GEN, { request_id: 'r1' })).statusCode, 403);
    assert.equal((await h.send('GET', '/config')).statusCode, 403);
    assert.equal(h.generate.length, 0);
    assert.equal(h.calls.length, 0);
  });
}
test('empty allow-lists fail closed', async () => {
  const h = harness({ env: { P2_AI_DRAFTS_PAGE_IDS: '' } });
  assert.equal((await h.send('GET', '/config')).statusCode, 403);
  assert.equal((await h.send('POST', GEN, { request_id: 'r1' })).statusCode, 403);
});
test('lead outside pilot company or Page is refused', async () => {
  const wrongCompany = harness({ leadCompany: otherCompany });
  assert.equal((await wrongCompany.send('POST', GEN, { request_id: 'r1' })).statusCode, 403);
  assert.equal(wrongCompany.generate.length, 0);
  const wrongPage = harness({ page: 'other-page' });
  assert.equal((await wrongPage.send('POST', GEN, { request_id: 'r1' })).statusCode, 403);
  assert.equal(wrongPage.generate.length, 0);
});
test('failover (non-primary database) fails closed', async () => {
  const h = harness({ target: 'backup' });
  assert.equal((await h.send('POST', GEN, { request_id: 'r1' })).statusCode, 503);
  assert.equal(h.generate.length, 0);
});
test('generate calls the service exactly once and returns text only for GENERATED', async () => {
  const h = harness();
  const ok = await h.send('POST', GEN, { request_id: 'r1' });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.body)), { status: 'GENERATED', reason: null, draft_id: draftId, text: 'Dạ chào anh' });
  assert.deepEqual(JSON.parse(JSON.stringify(h.generate)), [[leadId, { requestId: 'r1' }]]);
  assert.equal((await h.send('POST', GEN, {})).statusCode, 400);
  assert.equal(h.generate.length, 1);
});
test('latest returns the draft; sent/edited/rejected record with the signed-in actor', async () => {
  const h = harness();
  const latest = await h.send('GET', '/leads/:leadId/latest');
  assert.equal(latest.body.draft.text, 'Dạ chào anh');
  for (const name of ['edited', 'sent']) {
    const done = await h.send('POST', `/drafts/:draftId/${name}`,
      { request_id: `r-${name}`, expected_revision: 1, draft_text: 'Dạ chào anh ạ' });
    assert.equal(done.statusCode, 200);
  }
  assert.equal((await h.send('POST', '/drafts/:draftId/rejected', { request_id: 'r-x', expected_revision: 1 })).statusCode, 200);
  assert.deepEqual(h.recorded.map(r => r[0]), ['edited', 'sent', 'rejected']);
  assert.ok(h.recorded.every(r => r[1].actorId === pilotUser && r[1].companyId === company));
  assert.equal((await h.send('POST', '/drafts/:draftId/sent', { request_id: 'r', expected_revision: 'x' })).statusCode, 400);
});
test('store conflicts map to 409', async () => {
  const h = harness({ storeError: 'DRAFT_CLOSED' });
  const res = await h.send('POST', '/drafts/:draftId/sent', { request_id: 'r', expected_revision: 1, draft_text: 'x' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.reason_code, 'DRAFT_CLOSED');
});
test('router has no send path and never touches Meta', () => {
  assert.doesNotMatch(source, /sendMessengerReply|graph\.facebook\.com|\/reply/);
  assert.doesNotMatch(source, /console\./);
  assert.equal((source.match(/process\.env/g) || []).length, 3);
});
test('frontend lib only calls the draft API, never the send route', () => {
  const lib = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/aiReplyDrafts.js'), 'utf8');
  const bar = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/AiDraftBar.jsx'), 'utf8');
  assert.match(lib, /\/api\/ai-reply-drafts/);
  assert.doesNotMatch(lib + bar, /\/reply|facebook\/contacts|graph\.facebook\.com/);
});
test('report: pilot only, scoped to pilot companies, counts without draft text', async () => {
  assert.equal((await harness({ session: adminUser({ role: 'sales' }) }).send('GET', '/report')).statusCode, 403);
  const h = harness();
  const res = await h.send('GET', '/report');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.days, 7);
  assert.equal(res.body.generated, 1);
  assert.equal(JSON.stringify(res.body).includes('Dạ chào anh'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(c => c[0] === 'in'))), ['in', 'company_id', [company]]);
});
