'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFacebookLeadAdsCutoverBackfill } = require('../src/services/facebookLeadAdsCutoverBackfill');
const { rowsFromBody } = require('../src/helpers/facebookPageInbox');
const { optionsFromArgs, debugLeadToken, createPrimaryObserver } = require('../scripts/reconcile-facebook-lead-cutover');

const PAGE = '409741855550833';
const F1 = '10001';
const F2 = '10002';
const FROM = '2026-10-06T08:00:00Z';
const TO = '2026-10-06T09:00:00Z';
const TOKEN = 'synthetic-dedicated-lead-app-token';
const APP_ID = '1018343553916673';
const IDS = { receipt: '00000000-0000-4000-8000-000000000001', ad: '00000000-0000-4000-8000-000000000002',
  lead: '00000000-0000-4000-8000-000000000003', customer: '00000000-0000-4000-8000-000000000004',
  contact: '00000000-0000-4000-8000-000000000005', notice: '00000000-0000-4000-8000-000000000006',
  company: '00000000-0000-4000-8000-000000000007', recipient: '00000000-0000-4000-8000-000000000008',
  attribution: '00000000-0000-4000-8000-000000000013',
  ad2: '00000000-0000-4000-8000-000000000009', lead2: '00000000-0000-4000-8000-000000000010',
  customer2: '00000000-0000-4000-8000-000000000011', contact2: '00000000-0000-4000-8000-000000000012' };
const path = (node, edge, after = '') => `${node}/${edge}${after ? `:${after}` : ''}`;
const lead = (id, formId, createdTime, adId = '30001') => ({ id, form_id: formId, created_time: createdTime, ad_id: adId });
const defaultGraph = () => ({
  [path(PAGE, 'leadgen_forms')]: { data: [{ id: F1, page_id: PAGE }], paging: { next: 'opaque-sensitive-url', cursors: { after: 'forms-2' } }, summary: { total_count: 2 } },
  [path(PAGE, 'leadgen_forms', 'forms-2')]: { data: [{ id: F2, page_id: PAGE }] },
  [path(F1, 'leads')]: { data: [lead('20001', F1, FROM), lead('20002', F1, TO)],
    paging: { next: 'opaque-sensitive-url', cursors: { after: 'f1-2' } }, summary: { total_count: 3 } },
  [path(F1, 'leads', 'f1-2')]: { data: [lead('20003', F1, '2026-10-06T07:59:59Z')] },
  [path(F2, 'leads')]: { data: [lead('20004', F2, '2026-10-06T09:00:01Z')] },
});

function harness(patch = {}) {
  const state = { graph: defaultGraph(), rows: new Map(), requests: [], rpcCalls: [], bindings: new Map(),
    receipts: new Map(), ads: new Map(), leads: new Map(), contacts: new Map(),
    customers: new Map(), notices: new Map(), attributions: new Map(),
    primary: true, paused: true, fenced: true, depth: 0, readbackLoss: false, rpcCount: null,
    graphFailure: null, tokenInfo: { is_valid: true, app_id: APP_ID, type: 'PAGE',
      profile_id: PAGE, scopes: ['leads_retrieval'] }, readbackStatus: null, sharedPrimary: true };
  Object.assign(state, patch);
  const db = {
    from(table) {
      const params = { table, filters: {} };
      const query = {
        select() { return query; },
        eq(key, value) { params.filters[key] = value; return query; },
        in(key, value) { params.filters[key] = value; return query; },
        async maybeSingle() {
          assert.ok(state.depth > 0);
          if (table === 'facebook_pages') return { data: { page_id: PAGE, is_active: true, access_token: 'synthetic-messenger-token' } };
          if (table === 'facebook_lead_ads_bindings') {
            return { data: state.bindings.get(params.filters.form_id) ?? null };
          }
          if (table === 'facebook_lead_ads_intake_receipts') return { data: state.receipts.get(params.filters.leadgen_id) ?? null };
          if (table === 'facebook_lead_ads') return { data: state.ads.get(params.filters.leadgen_id) ?? null };
          if (table === 'crm_leads') return { data: state.leads.get(params.filters.id) ?? null };
          if (table === 'facebook_contacts') return { data: state.contacts.get(params.filters.id) ?? null };
          if (table === 'customers') return { data: state.customers.get(params.filters.id) ?? null };
          if (table === 'notifications') return { data: state.notices.get(params.filters.id) ?? null };
          if (table === 'lead_attribution') return { data: state.attributions.get(params.filters.id) ?? null };
          throw new Error('unexpected table');
        },
        then(resolve, reject) {
          assert.ok(state.depth > 0);
          if (table !== 'facebook_page_inbox') return Promise.reject(new Error('unexpected table')).then(resolve, reject);
          const keys = params.filters.event_key;
          let data = keys.map(key => state.rows.get(key)).filter(Boolean);
          if (state.readbackLoss) data = data.slice(0, -1);
          data = data.map(row => ({ ...row, status: state.readbackStatus || row.status }));
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, { p_rows }) {
      assert.ok(state.depth > 0);
      assert.equal(name, 'facebook_page_inbox_enqueue_v1');
      state.rpcCalls.push(p_rows);
      for (const row of p_rows) {
        if (!state.rows.has(row.event_key)) state.rows.set(row.event_key, { ...row, status: 'pending' });
      }
      return { data: state.rpcCount ?? p_rows.length };
    },
  };
  const fetchImpl = async (rawUrl, options) => {
    const url = new URL(rawUrl);
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(url.searchParams.has('access_token'), false);
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.redirect, 'error');
    state.requests.push(url);
    const [version, node, edge] = url.pathname.slice(1).split('/');
    assert.equal(version, 'v24.0');
    const key = path(node, edge, url.searchParams.get('after') || '');
    if (state.graphFailure === key) return { ok: false, text: async () => '{}' };
    const body = state.graph[key];
    assert.ok(body, `unexpected Graph edge ${key}`);
    return { ok: true, text: async () => JSON.stringify(body) };
  };
  const backfill = createFacebookLeadAdsCutoverBackfill({ db, fetchImpl,
    getGraphVersion: () => 'v24.0', getLeadGraphToken: () => TOKEN,
    getLeadAppId: () => APP_ID, getLeadTokenMetadata: async () => state.tokenInfo,
    isPrimary: () => state.primary, isWorkerPaused: () => state.paused,
    assertPrimaryObserved: async () => { if (!state.sharedPrimary) throw new Error('shared state unavailable'); },
    isLegacyWriterFenced: () => state.fenced, pageId: PAGE,
    withPrimary: async fn => { state.depth++; try { return await fn(); } finally { state.depth--; } },
  });
  const run = options => backfill({ from: FROM, to: TO, expectedFormIds: [F1, F2],
    expectedLeadCounts: { [F1]: 2, [F2]: 0 }, ...options });
  return { state, backfill, run };
}

test('dry run enumerates every form and cursor, includes both time boundaries, and never writes', async () => {
  const h = harness();
  const result = await h.run();
  assert.deepEqual(result, { pageId: PAGE, from: FROM, to: TO, formCount: 2,
    graphLeadCount: 2, receiptCount: 0, legacyLinkedCount: 0, inboxConfirmedCount: 0,
    requiresLegacyReview: false, applied: false });
  assert.equal(h.state.rpcCalls.length, 0);
  assert.equal(h.state.requests.length, 5);
  assert.equal(h.state.requests[1].searchParams.get('after'), 'forms-2');
  assert.equal(h.state.requests[3].searchParams.get('after'), 'f1-2');
});

test('apply writes only interval leads to Primary inbox, confirms readback, and retry is idempotent', async () => {
  const h = harness();
  const result = await h.run({ apply: true });
  assert.equal(result.applied, true);
  assert.equal(result.graphLeadCount, 2);
  assert.equal(result.inboxConfirmedCount, 2);
  assert.equal(h.state.rows.size, 2);
  assert.equal(h.state.rpcCalls.length, 1);
  for (const row of h.state.rpcCalls[0]) {
    assert.equal(row.page_id, PAGE);
    assert.equal(row.payload.kind, 'change');
    assert.equal(row.payload.event.field, 'leadgen');
    assert.equal(row.payload.event.value.recovery_source, 'graph_cutover_v1');
    assert.ok(['20001', '20002'].includes(row.payload.event.value.leadgen_id));
  }
  await h.run({ apply: true });
  assert.equal(h.state.rows.size, 2);
  // A signed webhook may already have an independent event key for this same
  // provider Lead. SQL702's unique immutable receipt remains the CRM dedupe.
  const webhook = rowsFromBody({ object: 'page', entry: [{ id: PAGE, changes: [{ field: 'leadgen',
    value: { page_id: PAGE, form_id: F1, leadgen_id: '20001' } }] }] })[0];
  assert.notEqual(webhook.event_key, h.state.rpcCalls[0][0].event_key);
});

test('unknown or omitted Page form, foreign form scope and provider Lead identity stop before DB write', async () => {
  for (const edit of [
    h => { h.state.graph[path(PAGE, 'leadgen_forms', 'forms-2')].data[0].id = '99999'; },
    h => { h.state.graph[path(PAGE, 'leadgen_forms', 'forms-2')].data[0].page_id = '99999'; },
    h => { h.state.graph[path(F1, 'leads')].data[0].form_id = F2; },
    h => { h.state.graph[path(F1, 'leads', 'f1-2')].data[0].id = '20001'; },
  ]) {
    const h = harness(); edit(h);
    await assert.rejects(h.run({ apply: true }), { code: /FB_INBOX_BACKFILL_(FORM_INVENTORY|LEAD_IDENTITY)/ });
    assert.equal(h.state.rpcCalls.length, 0);
  }
});

test('Graph error, broken pagination, and inconsistent Graph summary never write partial rows', async () => {
  for (const edit of [
    h => { h.state.graphFailure = path(F1, 'leads', 'f1-2'); },
    h => { h.state.graph[path(F1, 'leads')].paging.cursors.after = ''; },
    h => { h.state.graph[path(F1, 'leads')].summary.total_count = 4; },
  ]) {
    const h = harness(); edit(h);
    await assert.rejects(h.run({ apply: true }), { code: /FB_INBOX_BACKFILL_GRAPH_/ });
    assert.equal(h.state.rpcCalls.length, 0);
  }
});

test('independent per-form count mismatch refuses even a complete-looking Graph response', async () => {
  const h = harness();
  await assert.rejects(h.run({ apply: true, expectedLeadCounts: { [F1]: 1, [F2]: 1 } }),
    { code: 'FB_INBOX_BACKFILL_GRAPH_COUNT_MISMATCH' });
  assert.equal(h.state.rpcCalls.length, 0);
});

test('worker, Primary, binding and token scope gates prevent reads or enqueue when unsafe', async () => {
  const inactive = harness({ paused: false });
  await assert.rejects(inactive.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_WORKER_NOT_PAUSED' });
  assert.equal(inactive.state.requests.length, 0);
  const standby = harness({ primary: false });
  await assert.rejects(standby.run({ apply: true }), { code: 'FB_INBOX_PRIMARY_REQUIRED' });
  assert.equal(standby.state.requests.length, 0);
  const sharedUncertain = harness({ sharedPrimary: false });
  await assert.rejects(sharedUncertain.run({ apply: true }), { code: 'FB_INBOX_PRIMARY_REQUIRED' });
  assert.equal(sharedUncertain.state.requests.length, 0);
  const activeBinding = harness({ bindings: new Map([[F1, { form_id: F1, active: true }]]) });
  await assert.rejects(activeBinding.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_BINDING_ACTIVE' });
  assert.equal(activeBinding.state.rpcCalls.length, 0);
  const writer = harness({ fenced: false });
  await assert.rejects(writer.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_LEGACY_WRITER_ACTIVE' });
  assert.equal(writer.state.rpcCalls.length, 0);
  const sameToken = harness();
  // The Page's Messenger token may not become a Lead Graph fallback.
  const runSameToken = createFacebookLeadAdsCutoverBackfill({
    db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      page_id: PAGE, is_active: true, access_token: TOKEN } }) }) }) }) },
    fetchImpl: async () => { throw new Error('must not fetch'); }, getGraphVersion: () => 'v24.0',
    getLeadGraphToken: () => TOKEN, getLeadAppId: () => APP_ID,
    getLeadTokenMetadata: async () => ({ is_valid: true, app_id: APP_ID, type: 'PAGE',
      profile_id: PAGE, scopes: ['leads_retrieval'] }),
    assertPrimaryObserved: async () => {}, isPrimary: () => true, isWorkerPaused: () => true,
    isLegacyWriterFenced: () => true,
    pageId: PAGE, withPrimary: fn => fn(),
  });
  await assert.rejects(runSameToken({ from: FROM, to: TO, expectedFormIds: [F1, F2],
    expectedLeadCounts: { [F1]: 2, [F2]: 0 } }),
    { code: 'FB_INBOX_BACKFILL_PAGE_SCOPE_INVALID' });
  assert.equal(sameToken.state.rpcCalls.length, 0);
});

test('wrong App, Page, type, validity or scope reject the token before form reads', async () => {
  for (const tokenInfo of [
    { is_valid: true, app_id: '99999', type: 'PAGE', profile_id: PAGE, scopes: ['leads_retrieval'] },
    { is_valid: true, app_id: APP_ID, type: 'PAGE', profile_id: '99999', scopes: ['leads_retrieval'] },
    { is_valid: true, app_id: APP_ID, type: 'USER', profile_id: PAGE, scopes: ['leads_retrieval'] },
    { is_valid: false, app_id: APP_ID, type: 'PAGE', profile_id: PAGE, scopes: ['leads_retrieval'] },
    { is_valid: true, app_id: APP_ID, type: 'PAGE', profile_id: PAGE, scopes: [] },
  ]) {
    const h = harness({ tokenInfo });
    await assert.rejects(h.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_TOKEN_PROVENANCE_INVALID' });
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.rpcCalls.length, 0);
  }
});

test('token debugger keeps both credentials out of URL and rejects HTTP failure', async () => {
  const secret = 'synthetic-app-secret-12345';
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://graph.facebook.com/v24.0/debug_token');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${APP_ID}|${secret}`);
    assert.equal(new URLSearchParams(options.body).get('input_token'), TOKEN);
    return { ok: true, text: async () => JSON.stringify({ data: {
      is_valid: true, app_id: APP_ID, type: 'PAGE', profile_id: PAGE, scopes: ['leads_retrieval'],
    } }) };
  };
  assert.equal((await debugLeadToken({ version: 'v24.0', token: TOKEN, appId: APP_ID,
    appSecret: secret, fetchImpl })).app_id, APP_ID);
  await assert.rejects(debugLeadToken({ version: 'v24.0', token: TOKEN, appId: APP_ID,
    appSecret: secret, fetchImpl: async () => ({ ok: false }) }));
});

test('one-off process requires shared Primary state and healthy Primary before backfill', async () => {
  let shared = 'primary', ready = true, local = 'primary', healthy = true, probes = 0;
  const observer = createPrimaryObserver({
    getActiveTarget: () => local, isAutoFailoverEnabled: () => false,
    getRedisIfReady: () => ready ? { get: async () => shared } : null,
    probeTarget: async () => { probes++; return { healthy }; },
    config: { supabaseUrl: 'https://primary.synthetic.invalid', supabaseServiceKey: 'synthetic' },
    initialRedisWaitMs: 0,
  });
  ready = false;
  await assert.rejects(observer(), /shared Primary state unavailable/);
  ready = true; shared = null;
  await assert.rejects(observer(), /shared Primary state unavailable/);
  shared = 'backup';
  await assert.rejects(observer(), /shared Primary state unavailable/);
  shared = 'primary'; healthy = false;
  await assert.rejects(observer(), /Primary health unconfirmed/);
  healthy = true;
  await observer();
  assert.equal(probes, 2);
  local = 'backup';
  await assert.rejects(observer(), /not Primary/);
  local = 'primary'; shared = 'backup';
  await assert.rejects(observer(), /shared Primary state unavailable/);
});

test('fresh CLI allows bounded lazy Redis connect, then observes shared Primary', async () => {
  let calls = 0;
  const observer = createPrimaryObserver({ getActiveTarget: () => 'primary',
    isAutoFailoverEnabled: () => false,
    getRedisIfReady: () => ++calls >= 2 ? { get: async () => 'primary' } : null,
    probeTarget: async () => ({ healthy: true }),
    config: { supabaseUrl: 'https://primary.synthetic.invalid', supabaseServiceKey: 'synthetic' },
    initialRedisWaitMs: 200,
  });
  await observer();
  assert.ok(calls >= 2);
});

test('partial enqueue or missing readback fails closed; persisted rows survive safe retry', async () => {
  const partial = harness({ rpcCount: 1 });
  await assert.rejects(partial.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_ENQUEUE_UNCONFIRMED' });
  assert.equal(partial.state.rows.size, 2);
  partial.state.rpcCount = null;
  assert.equal((await partial.run({ apply: true })).inboxConfirmedCount, 2);
  const lost = harness({ readbackLoss: true });
  await assert.rejects(lost.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_COUNT_MISMATCH' });
  assert.equal(lost.state.rows.size, 2);
  const done = harness({ readbackStatus: 'done' });
  await assert.rejects(done.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_COUNT_MISMATCH' });
  assert.equal(done.state.rows.size, 2);
});

test('window and independent form inventory are mandatory', async () => {
  const h = harness();
  for (const options of [
    { from: '2026-10-06', to: TO }, { from: '2026-10-06T15:00:00+07:00', to: TO },
    { from: TO, to: FROM },
    { from: FROM, to: '2026-10-08T09:00:00Z' },
    { expectedFormIds: [] }, { expectedFormIds: [F1, F1] },
  ]) await assert.rejects(h.run(options), { code: /FB_INBOX_BACKFILL_(WINDOW|FORM_INVENTORY)_INVALID/ });
  await assert.rejects(h.run({ expectedLeadCounts: { [F1]: 2 } }),
    { code: 'FB_INBOX_BACKFILL_EXPECTED_COUNTS_INVALID' });
  assert.equal(h.state.requests.length, 0);
});

test('one-off command requires exact Page confirmation for any write', () => {
  const basic = [`--page=${PAGE}`, `--from=${FROM}`, `--to=${TO}`, `--forms=${F1},${F2}`, `--counts=${F1}:2,${F2}:0`];
  assert.equal(optionsFromArgs(basic).apply, false);
  assert.equal(optionsFromArgs([...basic, '--apply', `--confirm-page=${PAGE}`]).apply, true);
  for (const extra of [['--apply'], ['--apply', '--confirm-page=99999'], ['--bogus=value'],
    [`--confirm-page=${PAGE}`], [`--page=${PAGE}`]]) {
    assert.throws(() => optionsFromArgs([...basic, ...extra]));
  }
});

test('existing immutable receipt and linked legacy Lead are classified, not replayed', async () => {
  const h = harness();
  h.state.ads.set('20001', { id: IDS.ad, page_id: PAGE, form_id: F1, leadgen_id: '20001',
    lead_id: IDS.lead, customer_id: IDS.customer, processed: true });
  h.state.receipts.set('20001', { id: IDS.receipt, page_id: PAGE, form_id: F1, leadgen_id: '20001',
    lead_id: IDS.lead, customer_id: IDS.customer, contact_id: IDS.contact, lead_ad_id: IDS.ad,
    attribution_id: IDS.attribution, notification_id: IDS.notice,
    company_id: IDS.company, recipient_id: IDS.recipient });
  h.state.leads.set(IDS.lead, { id: IDS.lead, customer_id: IDS.customer, facebook_contact_id: IDS.contact,
    company_id: IDS.company, assigned_to: IDS.recipient, lead_owner_id: IDS.recipient, type: 'lead' });
  h.state.contacts.set(IDS.contact, { id: IDS.contact, page_id: PAGE, psid: 'leadad_20001',
    lead_id: IDS.lead, customer_id: IDS.customer });
  h.state.customers.set(IDS.customer, { id: IDS.customer, company_id: IDS.company });
  h.state.attributions.set(IDS.attribution, { id: IDS.attribution, lead_id: IDS.lead,
    company_id: IDS.company, contact_id: IDS.contact, customer_id: IDS.customer,
    fb_page_id: PAGE, fb_form_id: F1, fb_leadgen_id: '20001' });
  h.state.notices.set(IDS.notice, { id: IDS.notice, user_id: IDS.recipient,
    entity_id: IDS.lead, entity_type: 'crm_lead', type: 'system',
    metadata: { receiptId: IDS.receipt, companyId: IDS.company } });
  h.state.ads.set('20002', { id: IDS.ad2, page_id: PAGE, form_id: F1, leadgen_id: '20002',
    lead_id: IDS.lead2, customer_id: IDS.customer2, processed: true });
  h.state.leads.set(IDS.lead2, { id: IDS.lead2, customer_id: IDS.customer2,
    facebook_contact_id: IDS.contact2, company_id: IDS.company, assigned_to: IDS.recipient, type: 'lead' });
  h.state.contacts.set(IDS.contact2, { id: IDS.contact2, page_id: PAGE, psid: 'leadad_20002',
    lead_id: IDS.lead2, customer_id: IDS.customer2 });
  h.state.customers.set(IDS.customer2, { id: IDS.customer2, company_id: IDS.company });
  const result = await h.run({ apply: true });
  assert.equal(result.graphLeadCount, 2);
  assert.equal(result.receiptCount, 1);
  assert.equal(result.legacyLinkedCount, 1);
  assert.equal(result.inboxConfirmedCount, 0);
  assert.equal(result.requiresLegacyReview, true);
  assert.equal(h.state.rpcCalls.length, 0);
  h.state.leads.get(IDS.lead).lead_owner_id = IDS.lead2;
  await assert.rejects(h.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_EXISTING_CONFLICT' });
  h.state.leads.get(IDS.lead).lead_owner_id = IDS.recipient;
  h.state.attributions.get(IDS.attribution).fb_form_id = F2;
  await assert.rejects(h.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_EXISTING_CONFLICT' });
  h.state.attributions.get(IDS.attribution).fb_form_id = F1;
  h.state.notices.get(IDS.notice).metadata.receiptId = IDS.ad;
  await assert.rejects(h.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_EXISTING_CONFLICT' });
});

test('legacy or receipt identity conflict holds the cutover before enqueuing missing Leads', async () => {
  for (const edit of [
    h => h.state.ads.set('20001', { id: IDS.ad, page_id: 'wrong', form_id: F1, leadgen_id: '20001',
      lead_id: IDS.lead, customer_id: IDS.customer, processed: true }),
    h => h.state.receipts.set('20001', { id: IDS.receipt, page_id: PAGE, form_id: F1, leadgen_id: '20001',
      lead_id: IDS.lead, customer_id: IDS.customer, lead_ad_id: IDS.ad }),
  ]) {
    const h = harness(); edit(h);
    await assert.rejects(h.run({ apply: true }), { code: 'FB_INBOX_BACKFILL_EXISTING_CONFLICT' });
    assert.equal(h.state.rpcCalls.length, 0);
  }
});
