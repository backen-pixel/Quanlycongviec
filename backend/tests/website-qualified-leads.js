'use strict';

// In-memory source adapters only. No application configuration, network or real DB.
const test = require('node:test'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { buildWebsiteQualifiedLeads: build, normalizeAccountId, canonicalPhone } =
  require('../src/modules/marketingAutomation/websiteQualifiedLeads');
const { qualificationContext } = require('../src/modules/marketingAutomation/qualificationContext');
const U = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635', OTHER = U(901);
const CF7_KEY = '00000000-0000-4000-8000-000000000007';
const CF7_NAME = 'VPT_V1_CF7_CRM_Admin_HCM';
const ACCOUNT = '835757498658305', AD = '120200300400500', CAMPAIGN = '120200300400000';
const DAY = 86400000, NOW = Date.parse('2026-10-14T03:00:00Z'), FROM = NOW - 60 * DAY;
const CAPTURED = '2026-10-13T10:00:00.123Z', SUBMITTED = '2026-10-13T10:01:00.000Z';
const SAVED = '2026-10-13T10:01:02.000Z', QUALIFIED = '2026-10-13T10:10:00.000Z';
const FBCLID = 'IwAR_Synthetic_Click_1234567890';
const clone = value => JSON.parse(JSON.stringify(value));
function fakeDb(tables, options = {}) {
  const reads = {}, queries = [];
  return { reads, queries, from(table) {
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
        if (options.throw === table) return Promise.reject(Error('private provider body')).then(resolve, reject);
        if (options.fail === table) return Promise.resolve({ data: null, error: { message: 'private details' } }).then(resolve, reject);
        rows.sort((a, b) => {
          for (const key of orders) { const cmp = a[key] === b[key] ? 0 : a[key] < b[key] ? -1 : 1; if (cmp) return cmp; }
          return 0;
        });
        const selected = rows.slice(start, Math.min(end + 1, start + (options.cap || Infinity)))
          .map(row => Object.fromEntries(log.columns.split(',').map(key => [key, row[key]])));
        return Promise.resolve({ data: selected, count: options.noCount ? null : rows.length, error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
}
function syncMetadata(t) {
  const receipt = t.website_intake_receipts[0];
  t.crm_leads[0].website_intake = { version: 1, request_id: receipt.id,
    form_id: receipt.form_id, site_host: receipt.site_host, submitted_at: new Date(receipt.submitted_at).toISOString(),
    landing_url: receipt.landing_url, captured_at: receipt.captured_at == null ? null : new Date(receipt.captured_at).toISOString(),
    fbc: receipt.fbc, fbp: receipt.fbp, measurement_consent: receipt.measurement_consent,
    consent_version: receipt.consent_version, api_key_fingerprint: createHash('sha256').update(receipt.api_key_id).digest('hex') };
}
function sourceChange(t, patch) {
  const source = { ...t.crm_leads[0].intake_attribution, ...patch };
  for (const key of Object.keys(source)) if (source[key] === undefined) delete source[key];
  t.crm_leads[0].intake_attribution = clone(source);
  t.website_intake_receipts[0].source = clone(source);
  const attr = t.lead_attribution[0];
  for (const key of ['kenh', 'platform', 'campaign_id', 'adset_id', 'ad_id', 'utm_source', 'utm_medium',
    'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid', 'landing_url'])
    attr[key] = source[key] || null;
  for (const [key, original] of [['fb_campaign_id', 'campaign_id'], ['fb_adset_id', 'adset_id'], ['fb_ad_id', 'ad_id']])
    attr[key] = ['facebook', 'instagram'].includes(source.platform) ? source[original] || null : null;
}
function fixture() {
  const source = { kenh: 'website', platform: 'facebook', utm_source: 'facebook', utm_medium: 'paid',
    campaign_id: CAMPAIGN, ad_id: AD, utm_campaign: CAMPAIGN, utm_content: AD, fbclid: FBCLID,
    landing_url: 'https://vanphuthanh.net/tu-bep/' };
  const lead = { id: U(1), company_id: COMPANY, type: 'lead', is_test: false,
    customer_id: U(2), facebook_contact_id: null, phone: null, created_at: SAVED, intake_attribution: clone(source) };
  const customer = { id: U(2), phone: '0901234567', created_at: '2026-10-13T10:01:01.000Z' };
  const t = {
    crm_leads: [lead], customers: [customer],
    external_api_keys: [{ id: CF7_KEY, name: CF7_NAME, company_id: COMPANY, active: true }],
    p1_qualification_events: [{ id: U(4), company_id: COMPANY, canonical_lead_id: lead.id, revision: 1,
      status: 'QUALIFIED', contact_usable: true, need_in_scope: true, area_in_service: true,
      evidence_ref: 'recording:synthetic', actor_id: U(5), recorded_at: QUALIFIED,
      context_hash: qualificationContext(lead, customer) }],
    website_intake_receipts: [{ id: U(6), company_id: COMPANY, lead_id: lead.id, customer_id: customer.id,
      api_key_id: CF7_KEY, form_id: '11116', site_host: 'vanphuthanh.net', submitted_at: SUBMITTED, saved_at: SAVED,
      landing_url: source.landing_url, source: clone(source), captured_at: CAPTURED,
      fbc: `fb.1.${Date.parse(CAPTURED)}.${FBCLID}`, fbp: `fb.1.${Date.parse(CAPTURED) - 1000}.1234567890`,
      measurement_consent: true, consent_version: 'VPT_ADS_V1' }],
    lead_attribution: [{ id: U(8), lead_id: lead.id, customer_id: customer.id, contact_id: null,
      company_id: COMPANY, ...clone(source), fb_campaign_id: CAMPAIGN, fb_ad_id: AD,
      cham_dau_luc: SAVED }],
    fb_ad_accounts: [{ ad_account_id: 'act_' + ACCOUNT, company_id: COMPANY, bat: true,
      lan_dong_bo_cuoi: new Date(NOW - 900000).toISOString(), ket_qua_cuoi: { ok: true } }],
    fb_ad_catalog: [{ ad_id: AD, company_id: COMPANY, ad_account_id: 'act_' + ACCOUNT,
      campaign_id: CAMPAIGN, nguon: 'marketing_api', dong_bo_luc: new Date(NOW - 1800000).toISOString() }],
  };
  syncMetadata(t); return t;
}
const run = (tables = fixture(), options = {}, args = {}) => build({ db: fakeDb(tables, options),
  companyId: COMPANY, adAccountId: ACCOUNT, fromMs: FROM, toMs: NOW, nowMs: NOW, ...args });
function requalify(t) {
  t.p1_qualification_events[0].context_hash = qualificationContext(t.crm_leads[0], t.customers[0]);
}
function stagePolicy(t, directDeal = false) {
  const e = t.p1_qualification_events[0], l = t.crm_leads[0]; l.stage_id = U(800);
  l.pipeline_id = U(802);
  if (directDeal) l.type = 'deal';
  const h = { id: U(801), lead_id: l.id, pipeline_type: l.type, from_stage_id: U(799), to_stage_id: l.stage_id,
    to_canonical_slug: directDeal ? 'designing' : 'warm', entered_at: e.recorded_at, changed_by: e.actor_id };
  Object.assign(e, { qualification_method: 'stage_based_v1', stage_history_id: h.id,
    contact_usable: false, need_in_scope: false, area_in_service: false, evidence_ref: null,
    stage_evidence: { policy_version: 'stage_based_v1', from_type: 'lead', to_type: l.type,
      from_stage_id: h.from_stage_id, to_stage_id: h.to_stage_id, to_canonical_slug: h.to_canonical_slug,
      history_id: h.id, qualified_at: h.entered_at, actor_id: h.changed_by, context_hash: e.context_hash } });
  t.crm_lead_stage_history = [h];
  t.crm_pipeline_stages = [{ id: l.stage_id, pipeline_id:l.pipeline_id, canonical_slug: h.to_canonical_slug, is_lost: false, is_active:true }];
  t.crm_pipelines = [{ id:l.pipeline_id,company_id:COMPANY }];
  return t;
}

test('stage-based Warm/Hot and direct Deal use actual first transition time with stable Meta event ID', async () => {
  const { prepareWebsiteFeedback } = require('../src/modules/marketingAutomation/websiteFeedbackOutbox');
  const target = { company_id: COMPANY, ad_account_id: 'act_' + ACCOUNT,
    site_host: 'vanphuthanh.net', dataset_id: '1575398160676100' };
  for (const directDeal of [false, true]) {
    const t = stagePolicy(fixture(), directDeal), first = (await run(t)).rows[0];
    assert.equal(first.delivery_supported, true); assert.equal(first.qualification_method, 'stage_based_v1');
    const prepared = prepareWebsiteFeedback(first, {target,mode:'test'});
    t.crm_leads[0].type = 'deal'; t.crm_pipeline_stages[0].canonical_slug = 'designing';
    const next = (await run(t)).rows[0];
    assert.equal(next.qualified_ms, first.qualified_ms);
    assert.equal(prepareWebsiteFeedback(next, {target,mode:'test'}).event_id,prepared.event_id);
    t.crm_pipeline_stages[0].is_lost = true;
    assert.equal((await run(t)).diagnostics.stage_policy_held,1);
    t.crm_pipeline_stages[0].is_lost = false;
    assert.equal(prepareWebsiteFeedback((await run(t)).rows[0], {target,mode:'test'}).event_id,prepared.event_id);
  }
});
test('stage-based website quality preserves consent, receipt, matching and contact gates', async () => {
  for (const change of [t => { t.crm_lead_stage_history[0].changed_by = U(999); },
    t => { t.customers[0].phone = '0911234567'; }, t => { t.crm_lead_stage_history[0].entered_at = SUBMITTED; }]) {
    const t = stagePolicy(fixture()); change(t); assert.equal((await run(t)).rows.length,0);
  }
  const denied = stagePolicy(fixture()); Object.assign(denied.website_intake_receipts[0],
    {measurement_consent:false,fbc:null,fbp:null,captured_at:null}); syncMetadata(denied);
  assert.equal((await run(denied)).rows[0].delivery_supported,false);
  const noFbc = stagePolicy(fixture()); noFbc.website_intake_receipts[0].fbc = null; syncMetadata(noFbc);
  assert.equal((await run(noFbc)).rows[0].delivery_supported,false);
  await assert.rejects(run(stagePolicy(fixture()), {fail:'crm_lead_stage_history'}),/SOURCE_UNAVAILABLE/);
});
test('deleted stage-qualified lead does not block a valid website customer or enter feedback source',async()=>{
  const t=stagePolicy(fixture());
  t.p1_qualification_events.push({...t.p1_qualification_events[0],id:U(899),canonical_lead_id:U(898),stage_history_id:U(897)});
  const result=await run(t);assert.equal(result.rows.length,1);assert.equal(result.rows[0].lead_id,t.crm_leads[0].id);
});

test('new paid website qualification has original matching, time and stable opaque identity; no native Lead ID or PII', async () => {
  const t = fixture(), db = fakeDb(t), result = await build({ db, companyId: COMPANY,
    adAccountId: 'act_' + ACCOUNT, fromMs: FROM, toMs: NOW, nowMs: NOW });
  assert.equal(result.rows.length, 1); assert.equal(result.reconciliationComplete, true);
  const row = result.rows[0];
  assert.equal(row.source_kind, 'website'); assert.equal(row.source_receipt_id, U(6));
  assert.equal(row.qualified_ms, Date.parse(QUALIFIED)); assert.equal(row.acquired_ms, Date.parse(SUBMITTED));
  assert.equal(row.captured_ms, Date.parse(CAPTURED)); assert.equal(row.ad_account_id, 'act_' + ACCOUNT);
  assert.equal(row.delivery_supported, true); assert.equal(row.hold_reason, null);
  assert.equal(row.identity_key, createHash('sha256').update(COMPANY + '|' + U(1)).digest('hex'));
  assert.equal(row.identity_key, (await run(t)).rows[0].identity_key);
  assert.doesNotMatch(JSON.stringify(result), /0901234567|recording:|leadgen|psid|email|api_key_id/);
  assert.ok(db.queries.every(q => !/access_token|full_name|email|authorization|(^|,)key(,|$)/.test(q.columns)));
});

test('source output satisfies real website qualified sender contract and shares no native/initial event', async () => {
  const { prepareWebsiteFeedback, matchingEligibility } = require('../src/modules/marketingAutomation/websiteFeedbackOutbox');
  const t = fixture(), snapshot = await run(t);
  const target = { company_id: COMPANY, ad_account_id: 'act_' + ACCOUNT,
    site_host: 'vanphuthanh.net', dataset_id: '1575398160676100' };
  const row = prepareWebsiteFeedback(snapshot.rows[0], { target, mode: 'test' });
  assert.equal(row.payload.event_name, 'VPTCRMQualifiedLead'); assert.equal(row.payload.action_source, 'system_generated');
  assert.equal(row.payload.event_time, Math.floor(Date.parse(QUALIFIED) / 1000));
  assert.deepEqual(row.payload.user_data.external_id, [snapshot.rows[0].identity_key]);
  assert.deepEqual(Object.keys(row.payload.user_data).sort(), ['external_id', 'fbc', 'fbp']);
  assert.equal(matchingEligibility(row, snapshot, { target, mode: 'test' }), true);
  assert.doesNotMatch(JSON.stringify(row.payload), /lead_id|phone|email|fbclid|page_id|initial_lead|qualified_lead/);
});

test('root parser metadata and PostgREST timestamp spellings retain the same original evidence', async () => {
  const { websiteIntakeReceipt } = require('../src/domain/websiteIntakeReceipt');
  const t = fixture(), receipt = t.website_intake_receipts[0];
  const input = clone(t.crm_leads[0].website_intake); delete input.api_key_fingerprint;
  t.crm_leads[0].website_intake = websiteIntakeReceipt(input, { companyId: COMPANY,
    apiKeyId: receipt.api_key_id, apiKeyName: CF7_NAME, attribution: receipt.source, nowMs: NOW });
  receipt.submitted_at = SUBMITTED.replace('Z', '+00:00');
  receipt.captured_at = CAPTURED.replace('Z', '+00:00');
  receipt.saved_at = SAVED.replace('Z', '+00:00');
  const r = await run(t); assert.equal(r.rows.length, 1); assert.equal(r.rows[0].captured_ms, Date.parse(CAPTURED));
});

test('pending/stage progression cannot qualify; latest rejected/revoked revision wins beyond window', async () => {
  for (const status of ['PENDING', 'REJECTED']) {
    const t = fixture(); t.p1_qualification_events.push({ ...t.p1_qualification_events[0], id: U(40),
      revision: 2, status, recorded_at: new Date(NOW + DAY).toISOString() });
    assert.equal((await run(t)).rows.length, 0); assert.equal((await run(t)).reconciliationRows.length, 0);
  }
  const t = fixture(); t.p1_qualification_events = []; t.crm_leads[0].stage_id = 'hot';
  assert.equal((await run(t)).rows.length, 0);
});

test('strict actor, evidence, booleans, context v2 and actual qualification time are mandatory', async () => {
  for (const patch of [{ actor_id: null }, { actor_id: 'admin' }, { evidence_ref: ' ' },
    { contact_usable: 'true' }, { need_in_scope: false }, { area_in_service: false },
    { context_hash: 'v1' }, { recorded_at: 'invalid' }, { recorded_at: SAVED },
    { recorded_at: new Date(NOW + 1).toISOString() }]) {
    const t = fixture(); Object.assign(t.p1_qualification_events[0], patch);
    assert.equal((await run(t)).rows.length, 0, JSON.stringify(patch));
  }
  const t = fixture(), id = (await run(t)).rows[0].identity_key;
  t.crm_leads[0].type = 'deal'; t.crm_leads[0].stage_id = 'warm';
  assert.equal((await run(t)).rows[0].identity_key, id);
  t.customers[0].phone = '0911234567'; assert.equal((await run(t)).rows.length, 0);
});

test('explicit non-test, new customer lifetime identity and shared master proof are required', async () => {
  for (const is_test of [true, null]) {
    const t = fixture(); t.crm_leads[0].is_test = is_test; assert.equal((await run(t)).rows.length, 0);
  }
  for (const patch of [{ customer_id: null, phone: null }, { created_at: 'invalid' }]) {
    const t = fixture(); Object.assign(t.crm_leads[0], patch); requalify(t);
    assert.equal((await run(t)).rows.length, 0);
  }
  for (const phone of ['+84901234567', '84901234567', '0084901234567']) {
    const t = fixture(); t.customers.push({ id: U(20), phone, created_at: '2025-01-01T00:00:00Z' });
    assert.equal((await run(t)).diagnostics.new_customer_unproven, 1);
  }
  const t = fixture(); t.customers.push({ id: U(20), phone: '+84901234567', created_at: null });
  assert.equal((await run(t)).rows.length, 0);
});

test('lead/deal phone/customer/contact graph excludes returning identities beyond delivery window', async () => {
  for (const identity of [{ customer_id: U(2), phone: null }, { customer_id: U(20), phone: '+84901234567' },
    { customer_id: U(20), phone: '0084901234567' }]) {
    const t = fixture();
    t.customers.push({ id: U(20), phone: null, created_at: '2025-01-01T00:00:00Z' });
    t.crm_leads.push({ id: U(21), company_id: COMPANY, type: 'deal', is_test: false,
      facebook_contact_id: null, created_at: '2025-01-02T00:00:00Z', ...identity });
    assert.equal((await run(t)).diagnostics.duplicate_or_returning, 1);
    t.crm_leads[1].is_test = null; assert.equal((await run(t)).diagnostics.identity_ambiguous, 1);
    t.crm_leads[1].is_test = true; assert.equal((await run(t)).rows.length, 1);
  }
  assert.equal(canonicalPhone('0084 90 123 4567'), '+84901234567');
  assert.equal(normalizeAccountId('act_' + ACCOUNT), ACCOUNT);
});

test('missing or orphan immutable receipt cannot fall back to mutable notes or stages', async () => {
  const t = fixture(); t.website_intake_receipts = [];
  t.crm_leads[0].description = 'VPT_V1 | ' + SUBMITTED + '\nfbclid: ' + FBCLID;
  assert.equal((await run(t)).diagnostics.no_website_receipt, 1);
  t.website_intake_receipts = fixture().website_intake_receipts; t.website_intake_receipts[0].lead_id = U(50);
  assert.equal((await run(t)).rows.length, 0);
});

test('another integration key is ineligible even when its receipt and Lead metadata agree', async () => {
  const t = fixture(); t.website_intake_receipts[0].api_key_id = U(87); syncMetadata(t);
  const result = await run(t);
  assert.equal(result.rows.length, 0);
  assert.equal(result.reconciliationRows.length, 0);
  assert.equal(result.diagnostics.projection_mismatch, 1);
});

test('dedicated integration name must resolve exactly one active owned key and public metadata contains only its fingerprint', async () => {
  for (const change of [t => { t.external_api_keys = []; },
    t => { t.external_api_keys[0].active = false; },
    t => { t.external_api_keys[0].name = 'Dashboard integration'; },
    t => { t.external_api_keys.push({ ...t.external_api_keys[0], id: U(88) }); },
    t => { t.crm_leads[0].website_intake.api_key_fingerprint = '0'.repeat(64); },
    t => { t.crm_leads[0].website_intake.api_key_id = CF7_KEY; }]) {
    const t = fixture(); change(t);
    assert.equal((await run(t)).rows.length, 0);
  }
  const t = fixture();
  assert.equal(t.crm_leads[0].website_intake.api_key_id, undefined);
  assert.equal(t.crm_leads[0].website_intake.api_key_fingerprint, createHash('sha256').update(CF7_KEY).digest('hex'));
  assert.equal(JSON.stringify(t.crm_leads).includes(CF7_KEY), false);
  const result = await run(t);
  assert.equal(result.rows.length, 1);
  assert.equal(JSON.stringify(result).includes(CF7_KEY), false);
});

test('receipt request/form/site/API key/metadata/source and attribution projections must agree exactly', async () => {
  const changes = [t => { t.crm_leads[0].website_intake.request_id = U(80); },
    t => { t.crm_leads[0].website_intake = null; },
    t => { t.crm_leads[0].website_intake.version = 2; },
    t => { t.website_intake_receipts[0].api_key_id = 'not-a-key'; },
    t => { t.website_intake_receipts[0].customer_id = U(99); },
    t => { t.website_intake_receipts[0].source.fbclid = 'other-click'; },
    t => { t.lead_attribution[0].fb_ad_id = '123'; },
    t => { t.lead_attribution[0].contact_id = U(22); },
    t => { t.lead_attribution[0].cham_dau_luc = SUBMITTED; },
    t => { t.lead_attribution[0].fb_form_id = '1438656288329447'; },
    t => { t.lead_attribution.push({ ...t.lead_attribution[0], id: U(23) }); }];
  for (const change of changes) {
    const t = fixture(); change(t); assert.equal((await run(t)).rows.length, 0);
  }
  for (const patch of [{ form_id: '1438656288329447' }, { site_host: 'evil.test' },
    { landing_url: 'https://vanphuthanh.net/tu-bep/?phone=secret' }, { landing_url: 'https://evil.test/' }]) {
    const t = fixture(); Object.assign(t.website_intake_receipts[0], patch); syncMetadata(t);
    assert.equal((await run(t)).rows.length, 0);
  }
});

test('customer creation must occur between real form submit and saved lead; clock/unknown proof holds', async () => {
  for (const created_at of [null, 'invalid', '2025-01-01T00:00:00Z', '2026-10-13T10:01:03.000Z']) {
    const t = fixture(); t.customers[0].created_at = created_at;
    assert.equal((await run(t)).diagnostics.new_customer_unproven, 1);
  }
  for (const patch of [{ saved_at: SUBMITTED }, { submitted_at: 'invalid' },
    { submitted_at: '2026-10-13T10:01:03Z' }, { saved_at: new Date(NOW + DAY).toISOString() }]) {
    const t = fixture(); Object.assign(t.website_intake_receipts[0], patch);
    assert.equal((await run(t)).diagnostics.source_time_unknown, 1);
  }
});

test('genuine Google/direct/organic website qualification stays visible but is never Meta paid proof', async () => {
  for (const patch of [{ platform: 'google', utm_source: 'google', utm_medium: 'cpc', gclid: 'synthetic-google', fbclid: undefined },
    { platform: 'direct', utm_source: undefined, utm_medium: undefined, fbclid: undefined },
    { utm_medium: 'organic' }]) {
    const t = fixture(); sourceChange(t, patch);
    const r = await run(t); assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].delivery_supported, false); assert.equal(r.rows[0].hold_reason, 'NON_META_PAID_SOURCE');
    assert.equal(r.reconciliationRows.length, 0); assert.equal(r.diagnostics.non_meta_paid_source, 1);
  }
  const t = fixture(); sourceChange(t, { platform: 'instagram', utm_source: 'ig' });
  assert.equal((await run(t)).rows[0].delivery_supported, true);
});

test('mixed channels and explicit test receipts are excluded rather than relabeled paid', async () => {
  for (const patch of [{ gclid: 'synthetic-google' }, { utm_source: 'google' },
    { platform: 'google' }, { utm_source: 'vpt_test' }, { gclid: 'VPT_TEST_SYNTHETIC' }]) {
    const t = fixture(); sourceChange(t, patch); const r = await run(t);
    assert.equal(r.rows.length, 0); assert.equal(r.reconciliationRows.length, 0);
  }
});

test('catalog proves numeric ad/campaign in exactly owned account, allows company-null with exact campaign only', async () => {
  const good = fixture(); good.fb_ad_catalog[0].company_id = null;
  assert.equal((await run(good)).rows[0].delivery_supported, true);
  for (const change of [t => { t.fb_ad_catalog[0].company_id = OTHER; },
    t => { t.fb_ad_catalog[0].campaign_id = '9999999'; },
    t => { t.fb_ad_catalog[0].nguon = 'thu_cong'; },
    t => { t.fb_ad_catalog[0].ad_account_id = 'act_9999999'; },
    t => { t.fb_ad_accounts[0].company_id = OTHER; },
    t => { t.fb_ad_accounts.push({ ...t.fb_ad_accounts[0], ad_account_id: ACCOUNT }); },
    t => { sourceChange(t, { ad_id: 'not-an-id' }); }]) {
    const t = fixture(); change(t); const r = await run(t);
    assert.equal(r.rows.length, 1); assert.equal(r.rows[0].delivery_supported, false);
    assert.equal(r.reconciliationRows.length, 0);
  }
});

test('no measurement consent keeps CRM fact visible without browser cookies or Meta delivery', async () => {
  const t = fixture(); Object.assign(t.website_intake_receipts[0],
    { measurement_consent: false, fbc: null, fbp: null, captured_at: null }); syncMetadata(t);
  const r = await run(t); assert.equal(r.rows.length, 1); assert.equal(r.rows[0].hold_reason, 'META_CONSENT_REQUIRED');
  assert.equal(r.rows[0].delivery_supported, false); assert.equal(r.diagnostics.delivery_held, 1);
  assert.equal(r.reconciliationRows[0].delivery_supported, false);
  t.website_intake_receipts[0].fbc = fixture().website_intake_receipts[0].fbc; syncMetadata(t);
  assert.equal((await run(t)).rows.length, 0, 'denied consent must not retain cookie identifiers');
});

test('fbc must match actual original capture and exact fbclid; optional fbp must be genuine format/time', async () => {
  const missing = fixture(); missing.website_intake_receipts[0].fbp = null; syncMetadata(missing);
  assert.equal((await run(missing)).rows[0].delivery_supported, true);
  for (const patch of [{ fbc: null }, { captured_at: null }, { fbc: 'fb.1.1234567890123.other-click' },
    { captured_at: QUALIFIED }, { fbp: 'invented' },
    { fbp: `fb.1.${NOW}.1234567890` }, { fbc: `fb.1.${Date.parse(QUALIFIED)}.${FBCLID}` }]) {
    const t = fixture(); Object.assign(t.website_intake_receipts[0], patch); syncMetadata(t);
    const r = await run(t); assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].delivery_supported, false); assert.equal(r.rows[0].hold_reason, 'META_MATCHING_UNVERIFIED');
  }
});

test('delivery age/window and freshness never erase valid full-life accepted audit proof', async () => {
  const t = fixture(), future = NOW + 80 * DAY;
  const r = await run(t, {}, { nowMs: future, toMs: future, fromMs: future - 60 * DAY });
  assert.equal(r.rows.length, 0); assert.equal(r.reconciliationRows.length, 1);
  assert.equal(r.reconciliationRows[0].delivery_supported, true);
  assert.equal(r.reconciliationRows[0].qualified_ms, Date.parse(QUALIFIED));
  for (const change of [f => { f.fb_ad_accounts[0].bat = false; },
    f => { f.fb_ad_accounts[0].ket_qua_cuoi = { ok: false }; },
    f => { f.fb_ad_catalog[0].dong_bo_luc = new Date(NOW - 2 * DAY).toISOString(); }]) {
    const f = fixture(); change(f); const current = await run(f);
    assert.equal(current.rows.length, 1); assert.equal(current.rows[0].delivery_supported, false);
    assert.equal(current.reconciliationRows[0].delivery_supported, true);
  }
  const aged = await run(fixture(), {}, { nowMs: NOW + 8 * DAY, toMs: NOW + 8 * DAY });
  assert.equal(aged.rows[0].delivery_supported, false); assert.equal(aged.reconciliationRows.length, 1);
});

test('malformed arguments, duplicate revisions, source errors and missing exact count fail closed', async () => {
  for (const args of [{ companyId: 'invalid' }, { adAccountId: 'unknown' }, { toMs: NOW + 1 },
    { fromMs: NOW + 1 }, { nowMs: NaN }]) await assert.rejects(run(fixture(), {}, args), /INVALID_RANGE/);
  for (const table of ['crm_leads', 'customers', 'lead_attribution', 'website_intake_receipts',
    'p1_qualification_events', 'fb_ad_accounts', 'fb_ad_catalog']) {
    await assert.rejects(run(fixture(), { fail: table }), /SOURCE_UNAVAILABLE/);
    await assert.rejects(run(fixture(), { throw: table }), /SOURCE_UNAVAILABLE/);
  }
  await assert.rejects(run(fixture(), { noCount: true }), /SOURCE_UNAVAILABLE/);
  const t = fixture(); t.p1_qualification_events.push({ ...t.p1_qualification_events[0], id: U(40) });
  await assert.rejects(run(t), /SOURCE_UNAVAILABLE/);
});

test('exact paging includes lifetime history and never accepts a server-capped partial read', async () => {
  const t = fixture();
  for (let i = 0; i < 502; i++) t.crm_leads.push({ id: U(1000 + i), company_id: COMPANY,
    type: 'lead', is_test: true, customer_id: null, phone: null, created_at: SAVED });
  const db = fakeDb(t); const r = await build({ db, companyId: COMPANY, adAccountId: ACCOUNT,
    fromMs: FROM, toMs: NOW, nowMs: NOW });
  assert.equal(r.rows.length, 1); assert.ok(db.reads.crm_leads >= 4);
  await assert.rejects(run(t, { cap: 400 }), /SOURCE_UNAVAILABLE/);
});

test('returned row ownership and duplicate receipt identities are revalidated', async () => {
  for (const table of ['crm_leads', 'lead_attribution', 'website_intake_receipts', 'p1_qualification_events']) {
    const t = fixture(); t[table].push({ ...t[table][0], id: U(700), company_id: OTHER });
    await assert.rejects(run(t, { ignore: table }), /SOURCE_UNAVAILABLE/);
  }
  const t = fixture(); t.website_intake_receipts.push({ ...t.website_intake_receipts[0], id: U(70) });
  await assert.rejects(run(t), /SOURCE_UNAVAILABLE/);
});

test('source changes and qualification revoked during final projection reads invalidate the snapshot', async () => {
  for (const table of ['crm_leads', 'customers', 'lead_attribution', 'website_intake_receipts', 'fb_ad_catalog']) {
    const t = fixture(); await assert.rejects(run(t, { change(name, n, data) {
      if (name === table && n === 2) return data[name].slice(1);
    } }), /SOURCE_UNAVAILABLE/);
  }
  const t = fixture(); await assert.rejects(run(t, { change(name, n, data) {
    if (name === 'fb_ad_catalog' && n === 2)
      data.p1_qualification_events.push({ ...data.p1_qualification_events[0], id: U(60), revision: 2, status: 'PENDING' });
  } }), /SOURCE_UNAVAILABLE/);
});
