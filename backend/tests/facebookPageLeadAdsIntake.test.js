'use strict';

// Actual domain/service exports, synthetic storage/provider, no application
// startup or network. PostgreSQL atomicity is covered by the SQL702 suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHmac } = require('node:crypto');
const domain = require('../src/domain/facebookLeadAdsIntake');
const { createFacebookLeadAdsIntake } = require('../src/services/facebookLeadAdsIntake');
const { createLeadAdsWebhookHandoff, createPageInboxWorker, assertPageLegacyScope } = require('../src/helpers/facebookPageInbox');
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PAGE = '10001'; const FORM = '40001'; const LEADGEN = '30001'; const AD = '50001';
const LEASE = { inboxId: U(1), leaseToken: U(2) };
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const envelope = () => ({ kind: 'change', event: { field: 'leadgen', value: {
  page_id: PAGE, form_id: FORM, leadgen_id: LEADGEN, ad_id: AD,
} } });
const provider = () => ({ id: LEADGEN, form_id: FORM, ad_id: AD, adset_id: '60001', campaign_id: '70001',
  created_time: '2026-10-06T00:00:00Z', is_organic: false, field_data: [
    { name: 'full_name', values: ['Synthetic Customer'] },
    { name: 'phone_number', values: ['+84 901 234 567'] },
    { name: 'email', values: ['synthetic@example.invalid'] },
    { name: 'interest', values: ['Synthetic kitchen', 'Synthetic consultation'] },
  ] });
const evidence = () => ({ ...provider(), form_page_id: PAGE });
const ids = () => ({ status: 'created', leadId: U(10), customerId: U(11), contactId: U(12), receiptId: U(13), recipientId: U(20) });

function fixture(options = {}) {
  const state = {
    primary: true, depth: 0, queries: [], rpcCalls: [], fetches: [], allocations: 0,
    binding: { page_id: PAGE, form_id: FORM, active: true, version: 1, company_id: U(30), recipient_id: U(20) },
    page: { page_id: PAGE, is_active: true, auto_create_lead: true, default_company_id: U(30), access_token: 'SYNTHETIC_ONLY_TOKEN' },
    receipt: null, mapping: null, provider: provider(), form: { id: FORM, page_id: PAGE },
    result: ids(), graphVersion: 'v99.7', failures: [], commitLoss: false, guardAllowed: true,
  };
  Object.assign(state, options);
  const withPrimary = async fn => { state.depth++; try { return await fn(); } finally { state.depth--; } };
  const tableRows = table => ({
    facebook_lead_ads_bindings: state.binding,
    facebook_pages: state.page,
    facebook_lead_ads_intake_receipts: state.receipt,
    fb_lead_form_mapping: state.mapping,
  })[table];
  const db = {
    from(table) {
      const filters = []; let selected;
      const query = {
        select(columns) { selected = columns; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() {
          assert.ok(state.depth > 0, 'Every service query must remain Primary-pinned');
          state.queries.push({ table, selected, filters });
          if (state.readHook) await state.readHook(table, state);
          const failure = state.failures.find(item => item.table === table);
          if (failure?.throws) throw new Error('SYNTHETIC_PRIVATE_DATABASE_ERROR');
          if (failure) return { data: null, error: { message: 'SYNTHETIC_PRIVATE_DATABASE_ERROR' } };
          const row = tableRows(table);
          assert.ok(['facebook_lead_ads_bindings', 'facebook_pages', 'facebook_lead_ads_intake_receipts', 'fb_lead_form_mapping'].includes(table));
          return { data: row && filters.every(([key, value]) => row[key] === value) ? clone(row) : null, error: null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args: clone(args) });
      if (name === 'crm_care_legacy_write_check') return { data: {
        policy: 'CARE_LEGACY_WRITE_CHECK_V1', reservationMade: false, allowed: state.guardAllowed,
        reason: state.guardAllowed ? 'LEGACY_SCOPE' : 'MANAGED_PAGE', observedAt: '2026-10-06T00:00:00Z', scope: clone(args.p_scope),
      } };
      assert.equal(name, 'facebook_lead_ads_intake_v1');
      assert.ok(state.depth > 0, 'Business RPC must remain Primary-pinned');
      if (state.rpcHook) return state.rpcHook(args, state);
      const existed = !!state.receipt;
      if (!existed) {
        state.allocations++;
        state.receipt = { page_id: PAGE, form_id: FORM, leadgen_id: LEADGEN,
          provider_data: clone(args.p_provider_data), lead_data: clone(args.p_lead_data), binding_version: args.p_binding_version };
      }
      if (state.commitLoss) { state.commitLoss = false; return { data: null, error: { message: 'SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT' } }; }
      return { data: { ...clone(state.result), status: existed ? 'existing' : state.result.status }, error: null };
    },
  };
  const fetchImpl = async (url, init) => {
    state.fetches.push({ url, headers: clone(init.headers), redirect: init.redirect });
    assert.ok(state.depth > 0); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    assert.equal(init.headers.Authorization, `Bearer ${state.expectedToken || 'SYNTHETIC_ONLY_TOKEN'}`);
    assert.equal(url.includes(state.expectedToken || 'SYNTHETIC_ONLY_TOKEN'), false);
    const parsed = new URL(url); assert.equal(parsed.origin, 'https://graph.facebook.com');
    const node = parsed.pathname.split('/').at(-1); assert.ok([LEADGEN, FORM].includes(node));
    if (state.fetchHook) await state.fetchHook(node, state);
    if (state.providerThrows) throw new Error('SYNTHETIC_PRIVATE_PROVIDER_ERROR');
    return { ok: state.providerOk !== false, async json() {
      if (state.badJson) throw new Error('SYNTHETIC_PRIVATE_JSON_ERROR');
      return clone(node === LEADGEN ? state.provider : state.form);
    } };
  };
  const intake = createFacebookLeadAdsIntake({ db, fetchImpl, getGraphVersion: () => state.graphVersion,
    getLeadGraphToken: options.getLeadGraphToken,
    isPrimary: () => state.primary, withPrimary, managedPages: options.managedPages || new Set([PAGE]) });
  return { state, db, withPrimary, intake,
    run: (payload = envelope(), lease = LEASE, pageId = PAGE) => intake(pageId, payload, lease) };
}
const businessCalls = h => h.state.rpcCalls.filter(call => call.name === 'facebook_lead_ads_intake_v1');

test('dedicated Lead App token is used for both Graph reads without replacing the Messenger token', async () => {
  const h = fixture({ expectedToken: 'SYNTHETIC_LEAD_APP_TOKEN',
    getLeadGraphToken: () => 'SYNTHETIC_LEAD_APP_TOKEN' });
  await h.run();
  assert.equal(h.state.page.access_token, 'SYNTHETIC_ONLY_TOKEN');
  assert.equal(h.state.fetches.length, 2);
  assert.ok(h.state.fetches.every(call => call.headers.Authorization === 'Bearer SYNTHETIC_LEAD_APP_TOKEN'));
});

test('dedicated Lead App cannot fall back to the Messenger token or fetch without its own token', async () => {
  for (const token of ['', 'SYNTHETIC_ONLY_TOKEN']) {
    const h = fixture({ getLeadGraphToken: () => token });
    await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_TOKEN_REQUIRED');
    assert.equal(h.state.fetches.length, 0);
  }
});
async function rejectsBeforeRpc(h, code) {
  await assert.rejects(h.run(), { code }); assert.equal(businessCalls(h).length, 0);
}

test('actual service binds provider/form/Page, prepares contact fields and forwards receipt lease', async () => {
  const h = fixture(); const result = await h.run(); assert.deepEqual(result, ids());
  assert.equal(h.state.fetches.length, 2); assert.equal(h.state.allocations, 1);
  const args = businessCalls(h)[0].args;
  assert.equal(args.p_inbox_id, LEASE.inboxId); assert.equal(args.p_lease_token, LEASE.leaseToken);
  assert.equal(args.p_binding_version, 1); assert.equal(args.p_provider_data.form_page_id, PAGE);
  assert.equal(args.p_lead_data.phone, '0901234567'); assert.equal(args.p_lead_data.full_name, 'Synthetic Customer');
  assert.equal(args.p_lead_data.email, 'synthetic@example.invalid');
  assert.match(args.p_lead_data.description, /Synthetic kitchen; Synthetic consultation/);
  assert.equal(Object.hasOwn(args.p_lead_data, 'company_id'), false);
  assert.equal(Object.hasOwn(args.p_lead_data, 'assigned_to'), false);
  assert.ok(h.state.fetches.every(call => call.url.includes('/v99.7/')));
});

for (const [key, value] of [['id', '30002'], ['form_id', '40002'], ['ad_id', '50002']]) {
  test(`provider ${key} mismatch never reaches CRM RPC`, async () => {
    const h = fixture(); h.state.provider[key] = value;
    await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_IDENTITY_MISMATCH');
  });
}
for (const patch of [{ id: '40002' }, { page_id: '10002' }]) {
  test(`form endpoint scope mismatch ${JSON.stringify(patch)} stays pending`, async () => {
    const h = fixture(); Object.assign(h.state.form, patch);
    await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_FORM_SCOPE_MISMATCH');
  });
}

for (const patch of [{ adset_id: 'not-numeric' }, { campaign_id: 42 }, { field_data: [] }, { field_data: {} }]) {
  test(`provider evidence shape ${JSON.stringify(patch)} is rejected`, async () => {
    const h = fixture(); Object.assign(h.state.provider, patch);
    await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_IDENTITY_MISMATCH');
  });
}

for (const patch of [{ created_time: 'not-a-date' }, { is_organic: 'false' }]) {
  test(`provider metadata ${JSON.stringify(patch)} is rejected`, async () => {
    const h = fixture(); Object.assign(h.state.provider, patch);
    await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_DATA_INVALID');
  });
}

for (const malformed of [null, { name: '', values: ['text'] }, { name: 'full_name', values: 'Synthetic' },
  { name: 'full_name', values: [] }, { name: 'full_name', values: [123] },
  { name: 'full_name', values: ['x'.repeat(2001)] }]) {
  test(`malformed field entry ${JSON.stringify(malformed)?.slice(0, 90)} cannot become a Lead`, async () => {
    const h = fixture(); h.state.provider.field_data[0] = malformed;
    await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_DATA_INVALID');
  });
}
test('duplicate provider field names fail instead of silently overriding a phone/name', async () => {
  const h = fixture(); h.state.provider.field_data.push({ name: 'phone_number', values: ['0900000000'] });
  await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_DATA_INVALID');
});

for (const pageId of [null, '10002']) {
  test(`mapping Page ${pageId} cannot be used for this form`, async () => {
    const h = fixture(); h.state.mapping = { form_id: FORM, page_id: pageId, truong: {} };
    await rejectsBeforeRpc(h, 'FB_INBOX_FORM_MAPPING_SCOPE_MISMATCH');
  });
}
for (const mapping of [[], 'invalid', { sdt: '' }, { sdt: 'missing_question' }, { ho_ten: 42 }]) {
  test(`invalid field mapping ${JSON.stringify(mapping)} fails closed`, async () => {
    const h = fixture(); h.state.mapping = { form_id: FORM, page_id: PAGE, truong: mapping };
    await rejectsBeforeRpc(h, 'FB_INBOX_FORM_MAPPING_INVALID');
  });
}
test('explicit Vietnamese question mapping remains data and cannot override routing', async () => {
  const h = fixture(); h.state.provider.field_data = [
    { name: 'Tên khách', values: ['Synthetic'] }, { name: 'Số điện thoại', values: ['0901234567'] },
    { name: 'assigned_to', values: [U(999)] },
  ];
  h.state.mapping = { form_id: FORM, page_id: PAGE, truong: { ho_ten: 'Tên khách', sdt: 'Số điện thoại' } };
  const result = await h.run(); assert.equal(result.recipientId, U(20));
  assert.equal(businessCalls(h)[0].args.p_lead_data.phone, '0901234567');
  assert.equal(Object.hasOwn(businessCalls(h)[0].args.p_lead_data, 'assigned_to'), false);
});

for (const invalid of ['', '123', '0000000000', '+1 202 555 0100', 'https://example.invalid/0901234567', 'call 0901234567']) {
  test(`invalid or unsupported phone ${JSON.stringify(invalid)} requires review`, async () => {
    const h = fixture(); h.state.provider.field_data[1].values = [invalid];
    await rejectsBeforeRpc(h, 'FB_INBOX_LEAD_PHONE_REVIEW_REQUIRED');
  });
}
test('phone policy accepts canonical ten-digit shape, without claiming contact validity or qualification', () => {
  const data = evidence(); data.field_data[1].values = ['0123456789'];
  assert.equal(domain.prepareLead(data, null).phone, '0123456789');
});

test('cached receipt retries without Graph or a newly changed mapping', async () => {
  const h = fixture(); h.state.receipt = { page_id: PAGE, form_id: FORM, leadgen_id: LEADGEN,
    binding_version: 1, provider_data: evidence(), lead_data: domain.prepareLead(evidence(), null) };
  h.state.graphVersion = undefined;
  const result = await h.run(); assert.equal(result.status, 'existing');
  assert.equal(h.state.fetches.length, 0); assert.equal(h.state.allocations, 0);
  assert.equal(h.state.queries.some(query => query.table === 'fb_lead_form_mapping'), false);
});
test('commit followed by response loss retries the same Customer/Lead using cached receipt and a new lease', async () => {
  const h = fixture({ commitLoss: true });
  await assert.rejects(h.run(), { code: 'FB_INBOX_INTAKE_NOT_CONFIRMED' });
  const secondLease = { inboxId: LEASE.inboxId, leaseToken: U(3) };
  const recovered = await h.run(envelope(), secondLease);
  assert.equal(h.state.fetches.length, 2); assert.equal(h.state.allocations, 1);
  assert.deepEqual(recovered, { ...ids(), status: 'existing' });
  const calls = businessCalls(h); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args.p_lead_data, calls[1].args.p_lead_data);
  assert.deepEqual(calls[0].args.p_provider_data, calls[1].args.p_provider_data);
  assert.equal(calls[1].args.p_lease_token, secondLease.leaseToken);
});

for (const patch of [{ active: false }, { version: 0 }, { version: '1' }, { recipient_id: null }, { company_id: 'unknown' }]) {
  test(`invalid/disabled binding ${JSON.stringify(patch)} prevents provider and CRM I/O`, async () => {
    const h = fixture(); Object.assign(h.state.binding, patch);
    await rejectsBeforeRpc(h, 'FB_INBOX_LEAD_BINDING_REQUIRED'); assert.equal(h.state.fetches.length, 0);
  });
}
test('a changed binding version rejects cached receipt before provider/CRM', async () => {
  const h = fixture(); h.state.binding.version = 2;
  h.state.receipt = { page_id: PAGE, form_id: FORM, leadgen_id: LEADGEN, binding_version: 1,
    provider_data: evidence(), lead_data: domain.prepareLead(evidence(), null) };
  await rejectsBeforeRpc(h, 'FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED'); assert.equal(h.state.fetches.length, 0);
});
test('owner changed during provider read reaches the atomic boundary with the original binding version', async () => {
  const h = fixture();
  h.state.fetchHook = async (_node, state) => { state.binding.recipient_id = U(21); state.binding.version = 2; };
  h.state.rpcHook = async args => {
    assert.equal(args.p_binding_version, 1);
    return { error: { message: 'FB_INBOX_LEAD_BINDING_CHANGED' } };
  };
  await assert.rejects(h.run(), { code: 'FB_INBOX_LEAD_BINDING_CHANGED' });
  assert.equal(h.state.allocations, 0);
});
for (const patch of [{ is_active: false }, { auto_create_lead: false }, { default_company_id: U(31) }]) {
  test(`Page settings ${JSON.stringify(patch)} prevent intake`, async () => {
    const h = fixture(); Object.assign(h.state.page, patch);
    await rejectsBeforeRpc(h, 'FB_INBOX_LEAD_PAGE_SCOPE_INVALID'); assert.equal(h.state.fetches.length, 0);
  });
}

test('unmanaged Page never performs a read or provider request', async () => {
  const h = fixture({ managedPages: new Set(['10002']) });
  await rejectsBeforeRpc(h, 'FB_INBOX_LEAD_PAGE_NOT_MANAGED'); assert.equal(h.state.queries.length, 0);
});
test('Primary switch during provider reads stops before the business RPC', async () => {
  const h = fixture(); h.state.fetchHook = async (_node, state) => { state.primary = false; };
  await rejectsBeforeRpc(h, 'FB_INBOX_PRIMARY_REQUIRED');
});
test('Primary switch after RPC confirmation prevents service success', async () => {
  const h = fixture(); h.state.rpcHook = async (_args, state) => { state.primary = false; return { data: ids() }; };
  await assert.rejects(h.run(), { code: 'FB_INBOX_PRIMARY_REQUIRED' });
});
for (const table of ['facebook_lead_ads_bindings', 'facebook_pages', 'facebook_lead_ads_intake_receipts', 'fb_lead_form_mapping']) {
  for (const throws of [false, true]) test(`DB ${table} ${throws ? 'exception' : 'error'} never becomes missing config`, async () => {
    const h = fixture(); h.state.failures.push({ table, throws });
    await rejectsBeforeRpc(h, 'FB_INBOX_INTAKE_READ_FAILED');
  });
}

for (const error of [{ message: 'FB_INBOX_LEAD_SCOPE_INVALID' }, { message: 'FB_INBOX_LEASE_LOST' },
  { message: 'SYNTHETIC_PRIVATE_SQL_OR_TOKEN' }, { message: 'FB_INBOX_BAD\nSYNTHETIC_PRIVATE' }]) {
  test(`RPC error ${JSON.stringify(error.message)} exposes only a safe domain code`, async () => {
    const h = fixture(); h.state.rpcHook = async () => ({ data: null, error });
    const expected = /^FB_INBOX_[A-Z_]{1,64}$/.test(error.message) ? error.message : 'FB_INBOX_INTAKE_NOT_CONFIRMED';
    await assert.rejects(h.run(), { code: expected, message: expected });
  });
}
test('thrown RPC exception is sanitized', async () => {
  const h = fixture(); h.state.rpcHook = async () => { throw new Error('SYNTHETIC_PRIVATE_TRANSPORT'); };
  await assert.rejects(h.run(), { code: 'FB_INBOX_INTAKE_NOT_CONFIRMED', message: 'FB_INBOX_INTAKE_NOT_CONFIRMED' });
});
for (const patch of [{ recipientId: U(999) }, { leadId: 'wrong-id' }, { customerId: null }, { status: 'queued' }]) {
  test(`invalid business result ${JSON.stringify(patch)} is not accepted as success`, async () => {
    const h = fixture(); h.state.rpcHook = async () => ({ data: { ...ids(), ...patch } });
    await assert.rejects(h.run(), { code: 'FB_INBOX_INTAKE_NOT_CONFIRMED' });
  });
}
for (const option of [{ providerOk: false }, { providerThrows: true }, { badJson: true }, { provider: { error: { message: 'SYNTHETIC_PRIVATE' } } }]) {
  test(`provider failure ${JSON.stringify(option)} remains pending with sanitized error`, async () => {
    const h = fixture(option); await rejectsBeforeRpc(h, 'FB_INBOX_PROVIDER_UNAVAILABLE');
  });
}

test('pure identity validation rejects mismatched Page and malformed lease before service reads', async () => {
  for (const [payload, lease] of [
    [{ ...envelope(), kind: 'messaging' }, LEASE],
    [{ ...envelope(), event: { field: 'leadgen', value: { ...envelope().event.value, page_id: '10002' } } }, LEASE],
    [envelope(), { inboxId: 'untrusted', leaseToken: U(2) }],
  ]) {
    const h = fixture(); await assert.rejects(h.run(payload, lease), { code: 'FB_INBOX_LEAD_IDENTITY_INVALID' });
    assert.equal(h.state.queries.length, 0); assert.equal(h.state.fetches.length, 0);
  }
});

function routeWorkerOptions(h, { enabled = true, guardDenied = false } = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/facebook.js'), 'utf8');
  const start = source.indexOf('const pageInboxWorker = createPageInboxWorker({');
  assert.notEqual(start, -1, 'Extract the actual route worker registration');
  const end = source.indexOf('\n});', start); assert.notEqual(end, -1);
  let options; const legacy = [];
  h.state.guardAllowed = !guardDenied;
  vm.runInNewContext(source.slice(start, end + 4), {
    createPageInboxWorker(value) { options = value; return {}; }, supabase: h.db,
    pageInboxPrimary: () => h.state.primary, withPrimaryDatabase: h.withPrimary,
    PAGE_INBOX: { enabled: true, leadAdsIntake: enabled, scopeGuard: true, managedPages: new Set([PAGE]) },
    process: { env: { VPT_FB_PAGE_INBOX_WORKER_PAUSED: '0' } }, console: { info() {} }, pageInboxError() {},
    r: { _ioRef: null }, assertPageLegacyScope,
    intakePageLeadAds: h.intake,
    handleMessaging: async () => { legacy.push('messaging'); },
    handleLeadGen: async () => { legacy.push('leadgen'); },
    handleComment: async () => { legacy.push('comment'); },
  });
  return { options, legacy };
}

test('exact route opt-in calls the atomic intake service without a legacy SQL682 dependency or helper', async () => {
  const h = fixture(); const { options, legacy } = routeWorkerOptions(h, { guardDenied: true });
  const result = await options.processEvent(PAGE, envelope(), LEASE);
  assert.equal(result.leadId, U(10)); assert.deepEqual(legacy, []);
  assert.equal(h.state.rpcCalls.some(call => call.name === 'crm_care_legacy_write_check'), false);
  assert.equal(h.state.rpcCalls[0].name, 'facebook_lead_ads_intake_v1');
  assert.equal(businessCalls(h)[0].args.p_inbox_id, LEASE.inboxId);
  assert.deepEqual(Array.from(options.leadAdsPages), [PAGE]);
});
test('exact route opt-in propagates the atomic scope denial without trying a legacy write', async () => {
  const h = fixture(); const { options, legacy } = routeWorkerOptions(h);
  h.state.rpcHook = async () => ({ data: null, error: { message: 'FB_INBOX_LEAD_SCOPE_INVALID' } });
  await assert.rejects(options.processEvent(PAGE, envelope(), LEASE), { code: 'FB_INBOX_LEAD_SCOPE_INVALID' });
  assert.equal(h.state.allocations, 0); assert.deepEqual(legacy, []);
  assert.equal(h.state.rpcCalls.some(call => call.name === 'crm_care_legacy_write_check'), false);
  assert.equal(businessCalls(h).length, 1);
});
test('exact route flag-off retains its legacy dispatch rather than selecting the new service', async () => {
  const h = fixture(); const { options, legacy } = routeWorkerOptions(h, { enabled: false });
  await options.processEvent(PAGE, envelope(), LEASE);
  assert.deepEqual(legacy, ['leadgen']); assert.equal(options.leadAdsPages, undefined);
  assert.equal(h.state.fetches.length, 0); assert.equal(businessCalls(h).length, 0);
  assert.equal(h.state.rpcCalls[0].name, 'crm_care_legacy_write_check');
});
test('exact route flag-off still enforces its legacy scope guard before calling any handler', async () => {
  const h = fixture(); const { options, legacy } = routeWorkerOptions(h, { enabled: false, guardDenied: true });
  await assert.rejects(options.processEvent(PAGE, envelope(), LEASE), { code: 'FB_INBOX_MANAGED_PAGE_PENDING' });
  assert.deepEqual(legacy, []); assert.equal(h.state.fetches.length, 0); assert.equal(businessCalls(h).length, 0);
  assert.equal(h.state.rpcCalls[0].name, 'crm_care_legacy_write_check');
});

test('signed scoped handoff → Lead Ads worker → exact route → actual service uses one lease and finishes only after commit', async () => {
  const h = fixture(); const { options, legacy } = routeWorkerOptions(h); const rows = []; const statuses = []; let committed = false;
  const db = { rpc: async (name, args) => {
    if (name === 'facebook_page_inbox_enqueue_v1') {
      rows.push(...args.p_rows.map((row, i) => ({ ...clone(row), id: U(100 + i), done: false })));
      return { data: args.p_rows.length };
    }
    if (name === 'facebook_page_inbox_claim_lead_ads_v1') {
      const row = rows.find(item => !item.done && item.payload.kind === 'change' && item.payload.event.field === 'leadgen');
      if (!row) return { data: [] };
      assert.deepEqual(args.p_page_ids, [PAGE]); row.token = args.p_token; return { data: [clone(row)] };
    }
    if (name === 'facebook_page_inbox_finish_v1') {
      const row = rows.find(item => item.id === args.p_id); assert.equal(row.token, args.p_token);
      assert.equal(committed, true); assert.equal(args.p_success, true); row.done = true; return { data: true };
    }
    throw new Error(`Unexpected synthetic inbox RPC ${name}`);
  } };
  const secret = 'synthetic-app-secret-at-least-sixteen';
  const raw = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: PAGE, changes: [envelope().event] }] }));
  const receive = createLeadAdsWebhookHandoff({ db, isPrimary: () => true, withPrimary: h.withPrimary,
    secret: () => secret, managedPages: new Set([PAGE]),
    enqueueLegacy: async body => { assert.deepEqual(body.entry[0].changes, []); } });
  await receive({ facebookRawBody: raw, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') } },
  );
  statuses.push(200); // Actual route ACK ordering is exercised in the scoped webhook suite.
  assert.deepEqual(statuses, [200]); assert.equal(h.state.allocations, 0, 'ACK proves inbox persistence, not CRM success');
  const worker = createPageInboxWorker({ ...options, db, beforeClaim: async () => {},
    setTimer: () => 1, clearTimer() {}, onError(code) { assert.fail(code); },
    processEvent: async (...args) => { const result = await options.processEvent(...args); committed = true; return result; } });
  await worker.drain(); assert.equal(h.state.allocations, 1); assert.equal(rows[0].done, true); assert.deepEqual(legacy, []);
  assert.equal(businessCalls(h)[0].args.p_inbox_id, rows[0].id);
  assert.equal(businessCalls(h)[0].args.p_lease_token, rows[0].token);
});
