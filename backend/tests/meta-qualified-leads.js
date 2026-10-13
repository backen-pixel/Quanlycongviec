'use strict';

// Entirely synthetic in-memory tables; no Supabase client, network or write is loaded.
const test = require('node:test'), assert = require('node:assert/strict');
const { buildMetaQualifiedLeads: build, normalizeAccountId } = require('../src/modules/marketingAutomation/metaQualifiedLeads');
const { qualificationContext } = require('../src/modules/marketingAutomation/qualificationContext');
const { rowsFromBody } = require('../src/helpers/facebookPageInbox');
const { receiptKey } = require('../src/helpers/facebookMessengerReceipt');
const U = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const COMPANY = U(900), OTHER = U(901), PAGE = '123456789', ACCOUNT = '835757498658305', AD = '100200300400';
const NOW = Date.parse('2026-10-13T12:00:00Z'), FROM = NOW - 6 * 86400000;
const ACQUIRED = '2026-10-11T10:00:00Z', CREATED = '2026-10-11T10:00:02Z', QUALIFIED = '2026-10-12T10:00:00Z';
const clone = value => JSON.parse(JSON.stringify(value));
function fakeDb(tables, options = {}) {
  const reads = {}, queries = [];
  return { queries, from(table) {
    reads[table] = (reads[table] || 0) + 1;
    const change = options.change?.(table, reads[table], tables);
    let rows = clone(change || tables[table] || []), orders = [], start = 0, end = Infinity;
    const log = { table, columns: null }; queries.push(log);
    const q = {
      select(columns, opts) { assert.equal(opts.count, 'exact'); log.columns = columns; return q; },
      eq(key, value) { if (options.ignore !== table) rows = rows.filter(row => row[key] === value); return q; },
      in(key, values) { if (options.ignore !== table) rows = rows.filter(row => values.includes(row[key])); return q; },
      order(key) { orders.push(key); return q; }, range(a, b) { start = a; end = b; return q; },
      then(resolve, reject) {
        if (options.throw === table) return Promise.reject(Error('private provider details')).then(resolve, reject);
        if (options.fail === table) return Promise.resolve({ data: null, error: { message: 'private details' } }).then(resolve, reject);
        rows.sort((a, b) => {
          for (const key of orders) { const cmp = a[key] === b[key] ? 0 : a[key] < b[key] ? -1 : 1; if (cmp) return cmp; } return 0;
        });
        const selected = rows.slice(start, Math.min(end + 1, start + (options.cap || Infinity)))
          .map(row => Object.fromEntries(log.columns.split(',').map(key => [key, row[key]])));
        return Promise.resolve({ data: selected,
          count: options.noCount ? null : rows.length, error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
}
function fixture({ page = PAGE, organic = false } = {}) {
  const lead = { id: U(1), company_id: COMPANY, type: 'lead', is_test: false, customer_id: U(2),
    facebook_contact_id: U(3), phone: null, created_at: CREATED, intake_attribution: null };
  const customer = { id: U(2), phone: '0901234567', created_at: '2026-10-11T10:00:01Z' };
  const provider = { id: '700001', form_id: '600001', form_page_id: page, ad_id: AD, is_organic: organic,
    created_time: ACQUIRED, platform: 'facebook', field_data: [{ name: 'phone_number', values: ['0901234567'] }] };
  const envelope = rowsFromBody({ object: 'page', entry: [{ id: page, changes: [{ field: 'leadgen',
    value: { leadgen_id: provider.id, form_id: provider.form_id, page_id: page, ad_id: AD } }] }] })[0];
  return {
    crm_leads: [lead], customers: [customer],
    p1_qualification_events: [{ id: U(4), company_id: COMPANY, canonical_lead_id: lead.id, revision: 1,
      status: 'QUALIFIED', contact_usable: true, need_in_scope: true, area_in_service: true,
      evidence_ref: 'recording:synthetic', actor_id: U(5), recorded_at: QUALIFIED,
      context_hash: qualificationContext(lead, customer) }],
    facebook_lead_ads_intake_receipts: [{ id: U(6), company_id: COMPANY, page_id: page, form_id: provider.form_id,
      leadgen_id: provider.id, inbox_id: U(7), lead_id: lead.id, customer_id: customer.id, contact_id: U(3),
      attribution_id: U(8), lead_ad_id: U(9), lead_data: { phone: customer.phone }, provider_data: clone(provider),
      created_at: CREATED }],
    facebook_contacts: [{ id: U(3), page_id: page, psid: 'leadad_' + provider.id, lead_id: lead.id,
      customer_id: customer.id, phone: customer.phone, created_at: CREATED }],
    facebook_lead_ads: [{ id: U(9), page_id: page, form_id: provider.form_id, leadgen_id: provider.id,
      lead_id: lead.id, customer_id: customer.id, processed: true, raw_data: clone(provider) }],
    lead_attribution: [{ id: U(8), company_id: COMPANY, lead_id: lead.id, customer_id: customer.id, contact_id: U(3),
      kenh: 'lead_ads', platform: 'facebook', fb_page_id: page, fb_form_id: provider.form_id,
      fb_leadgen_id: provider.id, fb_ad_id: AD, cham_dau_luc: ACQUIRED, created_at: CREATED,
      raw: { intake_receipt_id: U(6), acquired_time_known: true, provider_data: clone(provider) } }],
    facebook_page_inbox: [{ id: U(7), ...envelope, status: 'done', created_at: CREATED }],
    facebook_pages: [{ page_id: page, default_company_id: COMPANY, is_active: true }],
    fb_ad_accounts: [{ ad_account_id: 'act_' + ACCOUNT, company_id: COMPANY, bat: true,
      lan_dong_bo_cuoi: new Date(NOW - 900000).toISOString(), ket_qua_cuoi: { ok: true } }],
    fb_ad_catalog: [{ ad_id: AD, company_id: COMPANY, ad_account_id: 'act_' + ACCOUNT, page_id: page,
      nguon: 'marketing_api', dong_bo_luc: new Date(NOW - 1800000).toISOString() }],
  };
}
const run = (tables = fixture(), options = {}, args = {}) => build({ db: fakeDb(tables, options),
  companyId: COMPANY, adAccountId: ACCOUNT, pageIds: [PAGE], fromMs: FROM, toMs: NOW, nowMs: NOW, ...args });
function messengerFixture() {
  const t = fixture(), contact = t.facebook_contacts[0], attr = t.lead_attribution[0];
  contact.psid = '777888999'; t.facebook_lead_ads = []; t.facebook_lead_ads_intake_receipts = [];
  const event = { sender: { id: contact.psid }, recipient: { id: PAGE }, timestamp: Date.parse(ACQUIRED),
    message: { mid: 'synthetic-message' }, referral: { source: 'ADS', type: 'OPEN_THREAD', ad_id: AD } };
  attr.kenh = 'messenger'; delete attr.fb_form_id; delete attr.fb_leadgen_id;
  attr.raw = { messenger_first_evidence: { event_key: receiptKey(PAGE, event), ad_id: AD,
    recorded_at: '2026-10-11T10:00:00.500Z' } };
  const envelope = rowsFromBody({ object: 'page', entry: [{ id: PAGE, messaging: [event] }] })[0];
  t.facebook_page_inbox = [{ id: U(7), ...envelope, status: 'done', created_at: CREATED }];
  return t;
}

test('paid form requires immutable receipt/projections and exports actual qualification, stable opaque identity', async () => {
  const t = fixture(), db = fakeDb(t);
  const result = await build({ db, companyId: COMPANY, adAccountId: 'act_' + ACCOUNT,
    pageIds: new Set([PAGE]), fromMs: FROM, toMs: NOW, nowMs: NOW });
  assert.equal(result.rows.length, 1); assert.equal(result.intakeRows.length, 1);
  const row = result.rows[0];
  assert.equal(row.source_kind, 'lead_ads'); assert.equal(row.fb_leadgen_id, '700001'); assert.equal(row.psid, null);
  assert.equal(row.ad_account_id, 'act_' + ACCOUNT); assert.equal(row.qualified_ms, Date.parse(QUALIFIED));
  assert.equal(row.acquired_ms, Date.parse(ACQUIRED)); assert.equal(row.qualification_id, U(4));
  assert.equal(row.qualification_revision, 1); assert.equal(row.source_receipt_id, U(6));
  assert.equal(row.delivery_supported, true); assert.match(row.identity_key, /^[a-f0-9]{64}$/);
  assert.equal(row.identity_key, (await run(t)).rows[0].identity_key);
  assert.equal(result.intakeRows[0].qualified_ms, null);
  assert.doesNotMatch(JSON.stringify(result), /0901234567|recording:synthetic|field_data|access_token/);
  assert.ok(db.queries.every(q => !/access_token|full_name|email|authorization/.test(q.columns)));
});
test('genuine paid form intake does not invent qualification for pending customers', async () => {
  const t = fixture(); t.p1_qualification_events = [];
  const result = await run(t);
  assert.equal(result.rows.length, 0); assert.equal(result.intakeRows.length, 1);
  assert.equal(result.intakeRows[0].qualification_id, null);
});
test('literal fb platform from Graph is accepted only with matching immutable provider/projection', async () => {
  const t = fixture(); t.lead_attribution[0].platform = 'fb';
  for (const p of [t.facebook_lead_ads_intake_receipts[0].provider_data,
    t.lead_attribution[0].raw.provider_data, t.facebook_lead_ads[0].raw_data]) p.platform = 'fb';
  assert.equal((await run(t)).rows.length, 1);
  t.facebook_lead_ads_intake_receipts[0].provider_data.platform = 'facebook';
  assert.equal((await run(t)).rows.length, 0);
});
test('latest revision rejected or revoked excludes previous qualified even if outside selected window', async () => {
  for (const status of ['PENDING', 'REJECTED']) {
    const t = fixture(); t.p1_qualification_events.push({ ...t.p1_qualification_events[0], id: U(40),
      revision: 2, status, recorded_at: '2026-10-14T10:00:00Z' });
    assert.equal((await run(t)).rows.length, 0);
  }
});
test('actor/evidence/three booleans/context v2/time are required, no stage qualification fallback', async () => {
  for (const change of [{ actor_id: null }, { evidence_ref: ' ' }, { contact_usable: false },
    { need_in_scope: false }, { area_in_service: false }, { context_hash: 'old-v1-context' },
    { recorded_at: 'invalid' }, { recorded_at: ACQUIRED }, { recorded_at: '2026-10-14T10:00:00Z' }]) {
    const t = fixture(); Object.assign(t.p1_qualification_events[0], change);
    assert.equal((await run(t)).rows.length, 0);
  }
  const t = fixture(); t.crm_leads[0].type = 'deal'; t.crm_leads[0].stage_id = 'hot';
  assert.equal((await run(t)).rows.length, 1);
  t.customers[0].phone = '0909999999';
  assert.equal((await run(t)).rows.length, 0);
});
test('lifetime lead identity duplicates and unknown/test flags cannot become new Meta customers', async () => {
  const t = fixture();
  t.crm_leads.push({ ...t.crm_leads[0], id: U(10), created_at: '2026-01-01T00:00:00Z' });
  assert.equal((await run(t)).rows.length, 0);
  for (const is_test of [true, null, undefined]) {
    const t = fixture(); t.crm_leads[0].is_test = is_test;
    assert.equal((await run(t)).rows.length, 0); assert.equal((await run(t)).intakeRows.length, 0);
  }
  const ambiguous = fixture();
  ambiguous.crm_leads.push({ ...ambiguous.crm_leads[0], id: U(10), phone: '0909999999' });
  assert.equal((await run(ambiguous)).rows.length, 0);
});
test('shared master collision and old/unknown customer creation are held, without company ownership assumptions', async () => {
  for (const created_at of ['2026-01-01T00:00:00Z', null, '2026-10-11T10:00:03Z']) {
    const t = fixture(); t.customers[0].created_at = created_at;
    const result = await run(t); assert.equal(result.rows.length, 0); assert.equal(result.intakeRows.length, 0);
    assert.equal(result.diagnostics.new_customer_unproven, 1);
  }
  const t = fixture(); t.customers.push({ id: U(20), phone: '+84 901 234 567', created_at: '2026-01-01T00:00:00Z' });
  assert.equal((await run(t)).rows.length, 0);
});
test('0084 aliases in old shared masters and lifetime leads are included in canonical collision proof', async () => {
  const t = fixture(); t.customers.push({ id: U(20), phone: '0084 901 234 567', created_at: '2026-01-01T00:00:00Z' });
  assert.equal((await run(t)).rows.length, 0);
  const other = fixture(); other.crm_leads.push({ id: U(21), company_id: COMPANY, type: 'lead',
    is_test: false, phone: '0084901234567', customer_id: null, facebook_contact_id: null,
    created_at: '2026-01-01T00:00:00Z', intake_attribution: null });
  assert.equal((await run(other)).rows.length, 0);
});
test('organic and paid-status unknown forms cannot enter either list', async () => {
  for (const organic of [true, null, undefined]) {
    const t = fixture({ organic });
    if (organic === undefined) for (const p of [t.facebook_lead_ads_intake_receipts[0].provider_data,
      t.lead_attribution[0].raw.provider_data, t.facebook_lead_ads[0].raw_data]) delete p.is_organic;
    const result = await run(t);
    assert.equal(result.rows.length, 0); assert.equal(result.intakeRows.length, 0);
    assert.equal(result.diagnostics.paid_status_unverified, 1);
  }
});
test('same normalized phone with changed raw master contact still requires a fresh qualification context', async () => {
  const t = fixture(); t.customers[0].phone = '+84901234567';
  const result = await run(t);
  assert.equal(result.rows.length, 0); assert.equal(result.diagnostics.qualification_stale, 1);
  assert.equal(result.intakeRows.length, 1);
});
test('receipt/projection mismatches, moved contacts, raw provider edits and forged inbox hashes are excluded', async () => {
  const cases = [
    t => { t.facebook_lead_ads_intake_receipts[0].customer_id = U(77); },
    t => { t.facebook_contacts[0].lead_id = U(77); },
    t => { t.facebook_contacts[0].psid = '777888999'; },
    t => { t.lead_attribution[0].raw.intake_receipt_id = U(77); },
    t => { t.lead_attribution[0].fb_form_id = '99999'; },
    t => { t.facebook_lead_ads[0].processed = false; },
    t => { t.facebook_lead_ads[0].raw_data.id = '99999'; },
    t => { t.facebook_page_inbox[0].event_key = 'a'.repeat(64); },
    t => { t.facebook_lead_ads_intake_receipts[0].provider_data.form_page_id = '99999'; },
  ];
  for (const change of cases) { const t = fixture(); change(t); assert.equal((await run(t)).rows.length, 0); }
});
test('conflicting/earlier other-channel attributes and source test markers are held', async () => {
  const t = fixture(); t.lead_attribution.push({ id: U(30), company_id: COMPANY, lead_id: U(1),
    customer_id: U(2), kenh: 'website', platform: 'google', created_at: '2026-01-01T00:00:00Z' });
  assert.equal((await run(t)).diagnostics.source_conflict, 1);
  for (const change of [{ platform: 'instagram' }, { gclid: 'real-google-click' }, { utm_source: 'vpt_test' }]) {
    const t = fixture(); Object.assign(t.lead_attribution[0], change);
    assert.equal((await run(t)).rows.length, 0);
  }
});
test('page, company, connected enabled account and fresh Marketing API catalog must prove paid ad membership', async () => {
  assert.equal((await run(fixture({ page: '999888777' }))).rows.length, 0);
  const cases = [
    t => { t.facebook_pages[0].default_company_id = OTHER; },
    t => { t.fb_ad_accounts[0].company_id = OTHER; },
    t => { t.fb_ad_accounts[0].bat = false; },
    t => { t.fb_ad_accounts[0].ket_qua_cuoi = { ok: false }; },
    t => { t.fb_ad_catalog[0].ad_account_id = 'act_999999'; },
    t => { t.fb_ad_catalog[0].nguon = 'thu_cong'; },
    t => { t.fb_ad_catalog[0].dong_bo_luc = new Date(NOW - 2 * 86400000).toISOString(); },
    t => { t.fb_ad_catalog[0].dong_bo_luc = new Date(NOW + 1000).toISOString(); },
  ];
  for (const change of cases) { const t = fixture(); change(t); assert.equal((await run(t)).rows.length, 0); }
});
test('provider time must be known and precede CRM; old acquired event is never refreshed into intake', async () => {
  for (const created_time of [undefined, null, 'invalid', '2026-10-12T00:00:00Z']) {
    const t = fixture(); for (const p of [t.facebook_lead_ads_intake_receipts[0].provider_data,
      t.lead_attribution[0].raw.provider_data, t.facebook_lead_ads[0].raw_data]) p.created_time = created_time;
    assert.equal((await run(t)).rows.length, 0);
  }
  const t = fixture();
  const old = '2026-10-01T00:00:00Z';
  for (const p of [t.facebook_lead_ads_intake_receipts[0].provider_data, t.lead_attribution[0].raw.provider_data,
    t.facebook_lead_ads[0].raw_data]) p.created_time = old;
  t.lead_attribution[0].cham_dau_luc = old; t.crm_leads[0].created_at = '2026-10-01T00:00:02Z';
  t.customers[0].created_at = '2026-10-01T00:00:01Z';
  t.p1_qualification_events[0].context_hash = qualificationContext(t.crm_leads[0], t.customers[0]);
  const result = await run(t, {}, { fromMs: Date.parse(old) });
  assert.equal(result.intakeRows.length, 0); assert.equal(result.diagnostics.intake_too_old, 1);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].qualified_ms, Date.parse(QUALIFIED));
});
test('proven original signed ADS Messenger receipt may be reviewed, but delivery is explicitly held', async () => {
  const result = await run(messengerFixture());
  assert.equal(result.rows.length, 1); assert.equal(result.intakeRows.length, 0);
  assert.equal(result.rows[0].psid, '777888999'); assert.equal(result.rows[0].fb_leadgen_id, null);
  assert.equal(result.rows[0].delivery_supported, false);
  assert.equal(result.rows[0].hold_reason, 'MESSENGER_MAPPING_UNVERIFIED');
  assert.equal(result.diagnostics.messenger_mapping_unverified, 1);
});
test('Messenger does not guess PSID/first touch from projection or older unsigned receipt', async () => {
  const changes = [
    t => { t.facebook_contacts[0].psid = 'leadad_700001'; },
    t => { t.facebook_page_inbox = []; },
    t => { t.facebook_page_inbox[0].payload.event.referral.source = 'SHORTLINK'; },
    t => { t.lead_attribution[0].raw.messenger_first_evidence.event_key = 'a'.repeat(64); },
    t => {
      const event = { sender: { id: '777888999' }, recipient: { id: PAGE }, timestamp: Date.parse(ACQUIRED) - 1000,
        message: { mid: 'older-organic' } };
      const row = rowsFromBody({ object: 'page', entry: [{ id: PAGE, messaging: [event] }] })[0];
      t.facebook_page_inbox.push({ id: U(30), ...row, status: 'done', created_at: ACQUIRED });
    },
  ];
  for (const change of changes) { const t = messengerFixture(); change(t); assert.equal((await run(t)).rows.length, 0); }
});
test('exact pagination detects server caps/missing counts/errors and includes lifetime identity after first page', async () => {
  const t = fixture();
  for (let n = 100; n < 620; n++) t.crm_leads.push({ id: U(n), company_id: COMPANY, type: 'lead',
    is_test: false, customer_id: null, facebook_contact_id: null, phone: null, created_at: CREATED, intake_attribution: null });
  t.crm_leads.push({ ...t.crm_leads[0], id: U(999), created_at: '2026-01-01T00:00:00Z' });
  assert.equal((await run(t)).rows.length, 0);
  for (const options of [{ cap: 200 }, { noCount: true }, { fail: 'customers' }, { throw: 'lead_attribution' }])
    await assert.rejects(run(t, options), error => error.code === 'SOURCE_UNAVAILABLE' && !/private/.test(error.message));
});
test('snapshot recheck catches revocation and source/customer projection changes during read', async () => {
  const mutation = { p1_qualification_events: { status: 'PENDING' }, crm_leads: { phone: '+84901234567' },
    customers: { phone: '0909999999' }, lead_attribution: { fb_ad_id: '99999' },
    fb_ad_catalog: { nguon: 'thu_cong' }, facebook_contacts: { customer_id: U(99) },
    facebook_lead_ads: { processed: false }, facebook_page_inbox: { status: 'pending' } };
  for (const table of ['p1_qualification_events', 'crm_leads', 'customers', 'lead_attribution', 'fb_ad_catalog',
    'facebook_contacts', 'facebook_lead_ads', 'facebook_page_inbox']) {
    const t = fixture();
    await assert.rejects(run(t, { change(name, count, data) {
      if (name !== table || count < 2) return null;
      const changed = clone(data[name]); Object.assign(changed[0], mutation[name]); return changed;
    } }), { code: 'SOURCE_UNAVAILABLE' });
  }
});
test('qualification is rechecked after source reads so a late revoke is not released', async () => {
  const t = fixture();
  await assert.rejects(run(t, { change(table, count, data) {
    if (table === 'facebook_page_inbox' && count === 2)
      data.p1_qualification_events.push({ ...data.p1_qualification_events[0], id: U(40), revision: 2, status: 'REJECTED' });
    return null;
  } }), { code: 'SOURCE_UNAVAILABLE' });
});
test('real source rows feed the outbox payload contract with canonical scoped account and native Form ID', async () => {
  const { prepareMetaFeedback } = require('../src/modules/marketingAutomation/metaFeedbackOutbox');
  const source = await run(fixture()), target = { company_id: COMPANY, dataset_id: '543210',
    ad_account_id: 'act_' + ACCOUNT, page_id: PAGE };
  for (const [event_name, row] of [['initial_lead', source.intakeRows[0]], ['qualified_lead', source.rows[0]]]) {
    const prepared = prepareMetaFeedback({ ...row, event_name }, { target, mode: 'test' });
    assert.equal(prepared.ad_account_id, target.ad_account_id);
    assert.equal(prepared.payload.user_data.lead_id, row.fb_leadgen_id);
    assert.equal(prepared.source_receipt_id, row.source_receipt_id);
    assert.doesNotMatch(JSON.stringify(prepared.payload), /0901234567|recording:synthetic|psid/);
  }
});
test('full-life reconciliation preserves accepted facts after 7/60-day aging without releasing historical delivery rows', async () => {
  const t = fixture(), original = await run(t);
  const agedNow = NOW + 61 * 86400000;
  t.fb_ad_accounts[0].lan_dong_bo_cuoi = new Date(agedNow - 1000).toISOString();
  t.fb_ad_catalog[0].dong_bo_luc = new Date(agedNow - 1000).toISOString();
  const result = await run(t, {}, { fromMs: agedNow - 60 * 86400000, toMs: agedNow, nowMs: agedNow });
  assert.equal(result.rows.length, 0); assert.equal(result.intakeRows.length, 0);
  assert.equal(result.diagnostics.exported, 0); assert.equal(result.diagnostics.intake_eligible, 0);
  assert.equal(result.reconciliationComplete, true);
  assert.deepEqual(result.reconciliationRows, original.rows);
  assert.deepEqual(result.reconciliationIntakeRows, original.intakeRows);
  assert.equal(result.reconciliationRows[0].qualified_ms, Date.parse(QUALIFIED));
  assert.equal(result.reconciliationIntakeRows[0].acquired_ms, Date.parse(ACQUIRED));
});
test('original pending intake remains an audit fact after seven days, never a newly timestamped send', async () => {
  const t = fixture(); t.p1_qualification_events = [];
  const agedNow = NOW + 9 * 86400000;
  t.fb_ad_accounts[0].lan_dong_bo_cuoi = new Date(agedNow - 1000).toISOString();
  t.fb_ad_catalog[0].dong_bo_luc = new Date(agedNow - 1000).toISOString();
  const result = await run(t, {}, { fromMs: agedNow - 60 * 86400000, toMs: agedNow, nowMs: agedNow });
  assert.equal(result.rows.length, 0); assert.equal(result.intakeRows.length, 0);
  assert.equal(result.reconciliationRows.length, 0); assert.equal(result.reconciliationIntakeRows.length, 1);
  assert.equal(result.diagnostics.intake_too_old, 1);
  assert.equal(result.reconciliationIntakeRows[0].acquired_ms, Date.parse(ACQUIRED));
  assert.equal(result.reconciliationIntakeRows[0].qualification_id, null);
});
test('sync aging/failure and temporary account/Page pause block delivery but do not revoke ownership evidence', async () => {
  const changes = [
    t => { t.fb_ad_accounts[0].lan_dong_bo_cuoi = new Date(NOW - 2 * 86400000).toISOString(); },
    t => { t.fb_ad_catalog[0].dong_bo_luc = new Date(NOW - 2 * 86400000).toISOString(); },
    t => { t.fb_ad_accounts[0].ket_qua_cuoi = { ok: false }; },
    t => { t.fb_ad_accounts[0].bat = false; },
    t => { t.facebook_pages[0].is_active = false; },
  ];
  for (const change of changes) {
    const t = fixture(); change(t); const result = await run(t);
    assert.equal(result.rows.length, 0); assert.equal(result.intakeRows.length, 0);
    assert.equal(result.reconciliationRows.length, 1); assert.equal(result.reconciliationIntakeRows.length, 1);
    assert.equal(result.reconciliationComplete, true);
  }
});
test('actual source/ownership invalidation removes both historical sets, while qualification revoke removes only qualified fact', async () => {
  const changes = [
    t => { t.facebook_pages[0].default_company_id = OTHER; },
    t => { t.fb_ad_catalog[0].ad_account_id = 'act_99999'; },
    t => { t.fb_ad_catalog[0].nguon = 'thu_cong'; },
    t => { t.facebook_contacts[0].lead_id = U(99); },
  ];
  for (const change of changes) {
    const t = fixture(); change(t); const result = await run(t);
    assert.equal(result.reconciliationRows.length, 0); assert.equal(result.reconciliationIntakeRows.length, 0);
  }
  const organic = await run(fixture({ organic: true }));
  assert.equal(organic.reconciliationRows.length, 0); assert.equal(organic.reconciliationIntakeRows.length, 0);
  const t = fixture(); t.p1_qualification_events.push({ ...t.p1_qualification_events[0], id: U(40),
    revision: 2, status: 'PENDING' });
  const result = await run(t);
  assert.equal(result.reconciliationRows.length, 0); assert.equal(result.reconciliationIntakeRows.length, 1);
});
test('returned cross-company rows or incomplete ID filters fail closed, scope inputs are normalized strictly', async () => {
  assert.equal(normalizeAccountId('act_' + ACCOUNT), ACCOUNT);
  assert.equal(normalizeAccountId('act_bad'), null);
  const t = fixture(); t.crm_leads.push({ ...t.crm_leads[0], id: U(88), company_id: OTHER });
  await assert.rejects(run(t, { ignore: 'crm_leads' }), { code: 'SOURCE_UNAVAILABLE' });
  await assert.rejects(run(fixture(), {}, { pageIds: [] }), { code: 'INVALID_RANGE' });
  await assert.rejects(run(fixture(), {}, { adAccountId: 'act_bad' }), { code: 'INVALID_RANGE' });
});
