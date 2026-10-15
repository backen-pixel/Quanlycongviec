'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('../src/modules/marketingAutomation/googleQualifiedConversions');
const { qualificationContext } = require('../src/modules/marketingAutomation/qualificationContext');
const A = '991dc79d-cbf5-49f9-a364-35227cb47635', B = '11111111-1111-4111-8111-111111111111';
const FROM = Date.parse('2026-10-01T00:00:00Z'), NOW = Date.parse('2026-10-13T12:00:00Z');
const GC = 'Cj0KCQ_Real_Synthetic_Click_1234567890';
function fakeDb(tables, options = {}) {
  let eventReads = 0; const reads = {};
  return { from(name) {
    reads[name] = (reads[name] || 0) + 1; options.change?.(name, reads[name], tables);
    let rows = JSON.parse(JSON.stringify(tables[name] || [])), orders = [], start = 0, end = Infinity;
    if (name === 'p1_qualification_events' && ++eventReads > 1 && options.revokeDuringRead)
      rows.push({ ...tables[name][0], id: 'q-revoke', revision: 2, status: 'PENDING' });
    const q = { select() { return q; }, eq(k, v) { if (options.ignoreFilters !== name) rows = rows.filter(r => r[k] === v); return q; },
      in(k, values) { if (options.ignoreFilters !== name) rows = rows.filter(r => values.includes(r[k])); return q; },
      order(k, options = {}) { orders.push([k, options.ascending !== false]); return q; },
      range(a, b) { start = a; end = b; return q; },
      then(resolve, reject) {
        if (name === options.fail) return Promise.resolve({ data: null, error: { message: 'private data' } }).then(resolve, reject);
        const sorted = [...rows].sort((a, b) => {
          for (const [key, asc] of orders) { const cmp = a[key] === b[key] ? 0 : a[key] < b[key] ? -1 : 1;
            if (cmp) return asc ? cmp : -cmp; } return 0;
        });
        return Promise.resolve({ data: sorted.slice(start, Math.min(end + 1, start + (options.cap || Infinity))),
          count: options.noCount ? null : sorted.length, error: null }).then(resolve, reject);
      } };
    return q;
  } };
}
const lead = (id = 'L1', rest = {}) => ({ id, company_id: A, type: 'lead', is_test: false,
  customer_id: 'C1', facebook_contact_id: null, phone: '+84901234567', stage_id: 'S1', created_at: '2026-10-02T01:00:00Z',
  description: `Ghi chú: VPT_V1 | 2026-10-02T00:59:00Z\ngclid: ${GC}`,
  intake_attribution: { kenh: 'website', gclid: GC, utm_source: 'google' }, ...rest });
const context = (row, customer = row.customer_id === 'C1' ? { id: 'C1', phone: '0901234567' } : null) =>
  qualificationContext(row, customer);
const event = (id = 'L1', rest = {}) => ({ id: `Q-${id}`, company_id: A, canonical_lead_id: id,
  revision: 1, status: 'QUALIFIED', contact_usable: true, need_in_scope: true, area_in_service: true,
  evidence_ref: 'recording:synthetic-proof', actor_id: 'admin', recorded_at: '2026-10-03T04:00:00Z',
  context_hash: context(lead(id)), ...rest });
const tables = () => ({ crm_leads: [lead()], p1_qualification_events: [event()], lead_attribution: [],
  customers: [{ id: 'C1', phone: '0901234567', created_at: '2026-10-02T00:59:30Z' }] });
const build = (t, opts) => Q.buildGoogleQualifiedConversions({ db: fakeDb(t, opts), companyId: A, fromMs: FROM, toMs: NOW });
function stagePolicy(t, directDeal = false) {
  const e = t.p1_qualification_events[0], l = t.crm_leads[0];
  l.pipeline_id = 'P1';
  if (directDeal) l.type = 'deal';
  const h = { id: 'H1', lead_id: l.id, pipeline_type: l.type, from_stage_id: 'S0', to_stage_id: l.stage_id,
    to_canonical_slug: directDeal ? 'designing' : 'warm', entered_at: e.recorded_at, changed_by: e.actor_id };
  Object.assign(e, { qualification_method: 'stage_based_v1', stage_history_id: h.id,
    contact_usable: false, need_in_scope: false, area_in_service: false, evidence_ref: null,
    stage_evidence: { policy_version: 'stage_based_v1', from_type: 'lead', to_type: l.type,
      from_stage_id: h.from_stage_id, to_stage_id: h.to_stage_id, to_canonical_slug: h.to_canonical_slug,
      history_id: h.id, qualified_at: h.entered_at, actor_id: h.changed_by, context_hash: e.context_hash } });
  t.crm_lead_stage_history = [h];
  t.crm_pipeline_stages = [{ id: l.stage_id, pipeline_id: l.pipeline_id, canonical_slug: h.to_canonical_slug, is_lost: false, is_active: true }];
  t.crm_pipelines = [{ id: l.pipeline_id, company_id: A }];
  return t;
}

test('explicit Warm/Hot or direct Deal policy exports first time without fabricating manual booleans', async () => {
  for (const directDeal of [false, true]) {
    const t = stagePolicy(tables(), directDeal); const first = (await build(t)).rows[0];
    assert.equal(first.qualification_method, 'stage_based_v1');
    assert.equal(first.conversion_ms, Date.parse(t.p1_qualification_events[0].recorded_at));
    t.crm_leads[0].type = 'deal'; t.crm_pipeline_stages[0].canonical_slug = 'designing';
    assert.equal((await build(t)).rows[0].order_id, first.order_id);
    assert.equal((await build(t)).rows[0].conversion_ms, first.conversion_ms);
  }
});
test('Cold/lost holds and re-entry resumes one Google order/time; manual revocation remains authoritative', async () => {
  const t = stagePolicy(tables()), first = (await build(t)).rows[0];
  for (const change of [() => { t.crm_pipeline_stages[0].canonical_slug = 'cold'; },
    () => { t.crm_pipeline_stages[0].canonical_slug = 'warm'; t.crm_pipeline_stages[0].is_lost = true; }]) {
    change(); assert.equal((await build(t)).diagnostics.stage_policy_held, 1);
  }
  t.crm_pipeline_stages[0].is_lost = false;
  assert.equal((await build(t)).rows[0].order_id, first.order_id);
  t.p1_qualification_events.push(event('L1', { id: 'manual-revoke', revision: 2, status: 'PENDING' }));
  assert.equal((await build(t)).rows.length, 0);
});
test('stage policy cannot bypass source, consent, actual actor/history, context or new-customer gates', async () => {
  for (const change of [t => { t.crm_lead_stage_history[0].changed_by = 'someone-else'; },
    t => { t.p1_qualification_events[0].stage_evidence.qualified_at = '2026-10-04T00:00:00Z'; },
    t => { t.p1_qualification_events[0].contact_usable = true; },
    t => { t.customers[0].phone = '0911234567'; },
    t => { t.customers[0].created_at = '2025-01-01T00:00:00Z'; },
    t => { t.crm_leads[0].website_intake = websiteChoice(false); },
    t => { t.crm_leads[0].intake_attribution.utm_source = 'facebook'; }]) {
    const t = stagePolicy(tables()); change(t); assert.equal((await build(t)).rows.length, 0);
  }
  await assert.rejects(build(stagePolicy(tables()), { fail: 'crm_lead_stage_history' }), /SOURCE_UNAVAILABLE/);
});
test('policy stage config/ownership and a Cold regression during source reads fail closed',async()=>{
  for(const change of [t=>{t.crm_pipeline_stages[0].is_active=false;},
    t=>{t.crm_pipelines[0].company_id=B;},t=>{t.crm_pipeline_stages[0].canonical_slug=null;}]){
    const t=stagePolicy(tables());change(t);assert.equal((await build(t)).diagnostics.stage_policy_held,1);
  }
  await assert.rejects(build(stagePolicy(tables()),{change(name,n,t){
    if(name==='crm_leads' && n===4)t.crm_leads[0].stage_id='COLD';
  }}),/SOURCE_UNAVAILABLE/);
});
test('deleted stage-qualified lead is excluded without blocking another valid customer export',async()=>{
  const t=stagePolicy(tables());
  t.p1_qualification_events.push({...t.p1_qualification_events[0],id:'Q-DELETED',canonical_lead_id:'DELETED',stage_history_id:'H-DELETED'});
  const result=await build(t);assert.deepEqual(result.rows.map(r=>r.lead_id),['L1']);
  assert.equal(result.diagnostics.missing_or_test_lead,1);
});

const websiteChoice = consent => ({ version: 1, request_id: '10000000-0000-4000-8000-000000000001',
  api_key_id: '10000000-0000-4000-8000-000000000002', form_id: '11116', site_host: 'vanphuthanh.net',
  submitted_at: '2026-10-02T00:59:00.000Z', landing_url: 'https://vanphuthanh.net/tu-bep/',
  captured_at: null, fbc: null, fbp: null, measurement_consent: consent, consent_version: 'VPT_ADS_V1' });

test('new website measurement denial excludes an otherwise qualified Google lead', async () => {
  const t = tables();
  assert.equal((await build(t)).rows.length, 1);
  t.crm_leads[0].website_intake = websiteChoice(false);
  const result = await build(t);
  assert.equal(result.rows.length, 0);
  assert.equal(result.diagnostics.exported, 0);
  assert.equal(result.diagnostics.measurement_consent_required, 1);
  assert.equal(Q.toQualifiedGoogleCsv(result.rows), Q.CSV_HEADER + '\r\n');
});

test('explicit true website choice preserves actual Google qualification time and dedup ID', async () => {
  const t = tables(), legacy = (await build(t)).rows[0];
  t.crm_leads[0].website_intake = websiteChoice(true);
  const result = await build(t);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], legacy);
  assert.equal(result.rows[0].conversion_ms, Date.parse(t.p1_qualification_events[0].recorded_at));
});

test('new website metadata with missing or nonboolean consent cannot inherit legacy permission', async () => {
  for (const consent of [undefined, null, 'true', 'false', 1, 0]) {
    const t = tables(); t.crm_leads[0].website_intake = websiteChoice(consent);
    if (consent === undefined) delete t.crm_leads[0].website_intake.measurement_consent;
    const result = await build(t);
    assert.equal(result.rows.length, 0);
    assert.equal(result.diagnostics.measurement_consent_required, 1);
  }
});

test('legacy absent or NULL website metadata retains existing Google export behavior', async () => {
  const absent = tables(), missing = await build(absent);
  const nullable = tables(); nullable.crm_leads[0].website_intake = null;
  const storedNull = await build(nullable);
  assert.equal(missing.rows.length, 1);
  assert.deepEqual(storedNull.rows, missing.rows);
  assert.equal(storedNull.diagnostics.measurement_consent_required || 0, 0);
});

test('exports explicit qualification time, stable opaque order ID, no PII and supports Deal', async () => {
  const t = tables(); t.crm_leads[0].type = 'deal';
  const { rows, diagnostics } = await build(t);
  assert.equal(rows.length, 1); assert.equal(diagnostics.exported, 1);
  assert.equal(rows[0].conversion_ms, Date.parse(t.p1_qualification_events[0].recorded_at));
  assert.match(rows[0].order_id, /^vptq_[a-f0-9]{56}$/); assert.ok(rows[0].order_id.length <= 64);
  assert.equal(rows[0].order_id, (await build(t)).rows[0].order_id);
  const csv = Q.toQualifiedGoogleCsv(rows);
  assert.equal(csv.split('\r\n')[0], Q.CSV_HEADER);
  assert.match(csv, /VPT CRM - Lead hop le da xac minh,2026-10-03 11:00:00\+07:00,,VND,vptq_/);
  assert.doesNotMatch(csv, /recording:|admin|,L1,|,C1,|email|phone|0901234567/i);
  const preview = Q.previewQualifiedRow(rows[0]);
  assert.match(preview.gclid_tail, /^….{6}$/); assert.equal(preview.gclid, undefined);
});

test('latest revision wins: pending revoke and rejected exclude previous qualified, even outside window', async () => {
  for (const status of ['PENDING', 'REJECTED']) {
    const t = tables(); t.p1_qualification_events.push(event('L1', { id: 'later', revision: 2, status,
      recorded_at: '2026-10-14T00:00:00Z' }));
    assert.equal((await build(t)).rows.length, 0);
  }
  const t = tables(); t.p1_qualification_events.push(event('L1', { id: 'later', revision: 2,
    recorded_at: '2026-10-05T00:00:00Z' }));
  assert.equal((await build(t)).rows[0].conversion_ms, Date.parse('2026-10-05T00:00:00Z'));
});

test('qualification requires actor, evidence, all three strict booleans and valid actual time', async () => {
  for (const patch of [{ actor_id: null }, { evidence_ref: ' ' }, { contact_usable: false },
    { need_in_scope: 'true' }, { area_in_service: false }, { recorded_at: 'unknown' }]) {
    const t = tables(); Object.assign(t.p1_qualification_events[0], patch);
    const result = await build(t); assert.equal(result.rows.length, 0); assert.equal(result.diagnostics.invalid_qualification, 1);
  }
});

test('test, missing and cross-company leads/qualifications cannot enter export', async () => {
  for (const patch of [{ is_test: true }, { is_test: null }, { company_id: B }, { type: 'other' }]) {
    const t = tables(); Object.assign(t.crm_leads[0], patch); assert.equal((await build(t)).rows.length, 0);
  }
  const t = tables(); t.p1_qualification_events[0].company_id = B; assert.equal((await build(t)).rows.length, 0);
});

test('deduplicates by linked customer/contact identity, excludes older lifetime identity even outside export period', async () => {
  const t = tables(); t.crm_leads.push(lead('L2', { created_at: '2026-10-04T00:00:00Z' }));
  t.p1_qualification_events.push(event('L2', { recorded_at: '2026-10-05T00:00:00Z' }));
  const result = await build(t); assert.deepEqual(result.rows.map(r => r.lead_id), ['L1']);
  assert.equal(result.diagnostics.duplicate_or_returning, 1);
  // Existing customer from a previous period: neither current duplicate qualifies as a new customer.
  t.crm_leads.push(lead('OLD', { created_at: '2025-01-01T00:00:00Z', intake_attribution: null }));
  assert.equal((await build(t)).rows.length, 0);
  // An older test record does not disqualify a real customer.
  t.crm_leads.at(-1).is_test = true; assert.equal((await build(t)).rows.length, 1);
  t.crm_leads[0].facebook_contact_id = 'FC1'; t.crm_leads[1].customer_id = null; t.crm_leads[1].facebook_contact_id = 'FC1';
  assert.deepEqual((await build(t)).rows.map(r => r.lead_id), ['L1']);
});

test('missing identity and ambiguous historical timestamps fail closed for the affected customer', async () => {
  const t = tables(); t.crm_leads[0].customer_id = null; t.crm_leads[0].phone = null;
  t.p1_qualification_events[0].context_hash = context(t.crm_leads[0]);
  assert.equal((await build(t)).diagnostics.identity_unknown, 1);
  t.crm_leads[0].customer_id = 'C1'; t.p1_qualification_events[0].context_hash = context(t.crm_leads[0]);
  t.crm_leads.push(lead('OLD', { created_at: null }));
  const result = await build(t); assert.equal(result.rows.length, 0); assert.equal(result.diagnostics.identity_ambiguous, 1);
});

test('normalizes mobile and landline phones across separate customer UUIDs and company lead history', async () => {
  for (const [domestic, international] of [['0901234567', '+84901234567'], ['02838212345', '+842838212345']]) {
    assert.equal(Q.normalizePhone(domestic), international);
    assert.equal(Q.normalizePhone(international.slice(1)), international);
    assert.equal(Q.normalizePhone(international), international);
    const t = tables(); t.crm_leads[0].phone = null; t.customers[0].phone = international;
    t.customers[0].company_id = B; // Principal company does not own all customer appearances.
    t.p1_qualification_events[0].context_hash = context(t.crm_leads[0], t.customers[0]);
    t.customers.push({ id: 'C2', phone: domestic, created_at: '2025-01-01T00:00:00Z' });
    t.crm_leads.push(lead('OLD', { customer_id: 'C2', phone: null, created_at: '2025-01-02T00:00:00Z' }));
    const result = await build(t); assert.equal(result.rows.length, 0);
    assert.equal(result.diagnostics.duplicate_or_returning, 1);
  }
  assert.equal(Q.normalizePhone('unusable'), null);
});

test('changed linked master contact or lead phone requires explicit re-verification', async () => {
  for (const change of [t => { t.customers[0].phone = '0911234567'; },
    t => { t.crm_leads[0].phone = '0911234567'; }]) {
    const t = tables(); t.crm_leads[0].phone = null;
    t.p1_qualification_events[0].context_hash = context(t.crm_leads[0], t.customers[0]);
    assert.equal((await build(t)).rows.length, 1);
    change(t);
    const result = await build(t); assert.equal(result.rows.length, 0);
    assert.equal(result.diagnostics.qualification_stale, 1);
  }
  const t = tables(); t.p1_qualification_events[0].context_hash = 'old-context-v1';
  assert.equal((await build(t)).diagnostics.qualification_stale, 1);
});

test('sales stage and Lead to Deal progression do not revoke explicit customer qualification', async () => {
  const t = tables(); const first = (await build(t)).rows[0];
  t.crm_leads[0].stage_id = 'S2'; t.crm_leads[0].type = 'deal';
  const next = (await build(t)).rows[0];
  assert.equal(next.order_id, first.order_id); assert.equal(next.conversion_ms, first.conversion_ms);
});

test('requires timestamped form proof of new CRM customer; does not invent a grace period', async () => {
  for (const change of [t => { t.customers[0].created_at = '2025-01-01T00:00:00Z'; },
    t => { t.customers[0].created_at = '2026-10-02T01:00:01Z'; },
    t => { t.customers[0].created_at = null; },
    t => { t.crm_leads[0].description = ''; },
    t => { t.crm_leads[0].description = `VPT_V1 | unknown\ngclid: ${GC}`; }]) {
    const t = tables(); change(t); const result = await build(t);
    assert.equal(result.rows.length, 0); assert.equal(result.diagnostics.new_customer_unproven, 1);
  }
});

test('only website sources: immutable first, structured fallback, valid marked legacy notes; never calls', async () => {
  const t = tables(); t.crm_leads[0].intake_attribution = null;
  t.lead_attribution = [{ id: 'a1', company_id: A, lead_id: 'L1', customer_id: 'C1', kenh: 'website',
    gclid: GC, cham_dau_luc: '2026-10-02T00:59:00Z' }];
  assert.equal((await build(t)).rows[0].source_kind, 'structured_attribution');
  t.lead_attribution[0].kenh = 'messenger'; assert.equal((await build(t)).rows.length, 0);
  t.lead_attribution = []; t.crm_leads[0].description = `Ghi chú: VPT_V1 | 2026-10-02T00:59:00Z\ngclid: ${GC}`;
  assert.equal((await build(t)).rows[0].source_kind, 'legacy_form_notes');
  t.crm_leads[0].description = `gclid: ${GC}`; assert.equal((await build(t)).rows.length, 0);
  // A bad/test immutable receipt cannot be bypassed with a legacy description or call guess.
  t.crm_leads[0].intake_attribution = { kenh: 'website', gclid: 'VPT_TEST_fake', utm_source: 'vpt_test' };
  t.crm_leads[0].description = `Ghi chú: VPT_V1 | 2026-10-02T00:59:00Z\ngclid: ${GC}`;
  assert.equal((await build(t)).diagnostics.test_source, 1);
});

test('braid-only, missing/invalid gclid, conflicting structured attribution, source temporal order skip', async () => {
  for (const [source, reason] of [[{ gbraid: 'braid' }, 'braid_only'], [{}, 'no_gclid'],
    [{ gclid: '=bad,csv' }, 'invalid_gclid']]) {
    const t = tables(); t.crm_leads[0].intake_attribution = { kenh: 'website', ...source };
    t.crm_leads[0].description = 'VPT_V1 | 2026-10-02T00:59:00Z';
    assert.equal((await build(t)).diagnostics[reason], 1);
  }
  const t = tables(); t.p1_qualification_events[0].recorded_at = t.crm_leads[0].created_at;
  assert.equal((await build(t)).diagnostics.qualification_before_source, 1);
  t.p1_qualification_events[0].recorded_at = '2026-10-03T04:00:00Z'; t.crm_leads[0].intake_attribution = null;
  t.lead_attribution = [{ id: 'a1', company_id: A, lead_id: 'L1', customer_id: 'OTHER', kenh: 'website', gclid: GC,
    cham_dau_luc: '2026-10-02T00:59:00Z' }];
  assert.equal((await build(t)).diagnostics.source_conflict, 1);
});

test('conflicting click receipts and non-Google platform or legacy UTMs are excluded', async () => {
  for (const change of [t => { t.crm_leads[0].intake_attribution.platform = 'facebook'; },
    t => { t.crm_leads[0].intake_attribution.utm_source = 'facebook'; },
    t => { t.crm_leads[0].intake_attribution.fbclid = 'facebook-click'; },
    t => { t.crm_leads[0].description += '\nutm_source: facebook'; },
    t => { t.crm_leads[0].description = `VPT_V1 | 2026-10-02T00:59:00Z\ngclid: Cj0KCQ_Different_Synthetic_Click_1234567890`; },
    t => { t.lead_attribution.push({ id: 'a1', company_id: A, lead_id: 'L1', kenh: 'website',
      gclid: 'Cj0KCQ_Different_Synthetic_Click_1234567890', cham_dau_luc: '2026-10-02T00:59:00Z' }); }]) {
    const t = tables(); change(t); const result = await build(t);
    assert.equal(result.rows.length, 0); assert.equal(result.diagnostics.source_conflict, 1);
  }
  const t = tables(); t.crm_leads[0].intake_attribution = null;
  t.crm_leads[0].description += '\nutm_source: facebook';
  assert.equal((await build(t)).diagnostics.source_conflict, 1);
});

test('ownership is rechecked on returned rows, even when a source fails to apply company/ID filters', async () => {
  for (const name of ['p1_qualification_events', 'crm_leads', 'lead_attribution', 'customers']) {
    const t = tables();
    if (name === 'p1_qualification_events') t[name].push(event('L2', { company_id: B }));
    if (name === 'crm_leads') t[name].push(lead('OTHER', { company_id: B }));
    if (name === 'lead_attribution') t[name].push({ id: 'a-bad', company_id: B, lead_id: 'L1', kenh: 'website', gclid: GC });
    if (name === 'customers') t[name].push({ id: 'NOT-LINKED', phone: 'synthetic' });
    await assert.rejects(build(t, { ignoreFilters: name }), /SOURCE_UNAVAILABLE/);
  }
});

test('missing table/errors, row cap, missing exact count, racing revocation never return partial success', async () => {
  for (const fail of ['crm_leads', 'customers', 'lead_attribution', 'p1_qualification_events'])
    await assert.rejects(build(tables(), { fail }), /SOURCE_UNAVAILABLE/);
  await assert.rejects(build(tables(), { noCount: true }), /SOURCE_UNAVAILABLE/);
  await assert.rejects(build(tables(), { revokeDuringRead: true }), /SOURCE_UNAVAILABLE/);
  const t = tables(); t.crm_leads.push(lead('OLD', { customer_id: 'OTHER' }));
  await assert.rejects(build(t, { cap: 1 }), /SOURCE_UNAVAILABLE/);
});

test('complete pagination includes an older identity beyond the first 500 records', async () => {
  const t = tables(); for (let i = 0; i < 505; i++) t.crm_leads.push(lead(`A${i}`, { customer_id: `OTHER${i}` }));
  t.crm_leads.push(lead('ZZ-OLDER', { created_at: '2025-01-01T00:00:00Z' }));
  assert.equal((await build(t)).rows.length, 0);
});

// Execute actual route handlers with injected dependencies; no config import, network or live DB.
function routeHarness(file, injected) {
  const handlers = new Map(), router = { get: (p, fn) => handlers.set(p, fn), put() {}, use() {} };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, Buffer,
    console: { warn() {} }, process: { env: {} }, require: name => {
      if (name === 'express') return { Router: () => router };
      if (name.includes('/config/supabaseRouter')) return { getActiveTarget: () => 'primary', withPrimaryDatabase: fn => fn() };
      if (name.includes('/config/supabase')) return { supabase: {} };
      if (name.includes('/middleware/auth')) return { auth() {} };
      if (name.includes('/helpers/tenantScope')) return { isTenantScopeEnforced: () => true };
      if (name.endsWith('/webConversions')) return { buildWebConversions() {} };
      return require(name.startsWith('.') ? path.resolve(path.dirname(file), name) : name);
    } });
  const create = module.exports.createGoogleAdsExportRouter || module.exports.createWebConversionsRouter;
  create(injected);
  return async (url, req = {}) => {
    const result = { status: 200, headers: {} };
    const res = { set: (k, v) => { result.headers[k] = v; return res; },
      status: s => { result.status = s; return res; }, type: () => res,
      send: body => { result.body = body; return res; }, json: body => { result.body = body; return res; } };
    await handlers.get(url)({ headers: {}, query: {}, ...req }, res); return result;
  };
}
test('verified CSV route requires Basic auth, configured company and primary source; fail closed', async () => {
  const env = { GOOGLE_ADS_EXPORT_USER: 'test', GOOGLE_ADS_EXPORT_PASSWORD: 'synthetic-only-password', VPT_WEB_EVENTS_COMPANY_ID: A };
  const options = { db: fakeDb(tables()), env, primary: () => 'primary', withPrimary: fn => fn(), now: () => NOW };
  const file = path.resolve(__dirname, '../src/routes/googleAdsExport.js');
  const req = { headers: { authorization: `Basic ${Buffer.from(`test:${env.GOOGLE_ADS_EXPORT_PASSWORD}`).toString('base64')}` } };
  assert.equal((await routeHarness(file, { ...options, env: {} })('/qualified-google.csv', req)).status, 503);
  assert.equal((await routeHarness(file, options)('/qualified-google.csv')).status, 401);
  assert.equal((await routeHarness(file, { ...options, primary: () => 'backup' })('/qualified-google.csv', req)).status, 503);
  const ok = await routeHarness(file, options)('/qualified-google.csv', req);
  assert.equal(ok.status, 200); assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.match(ok.body, /Order ID/);
  const bad = await routeHarness(file, { ...options, db: fakeDb(tables(), { fail: 'p1_qualification_events' }) })('/qualified-google.csv', req);
  assert.equal(bad.status, 503); assert.equal(bad.body, 'Source unavailable');
});
test('verified preview checks company and tenant, masks click IDs and never returns customer/evidence', async () => {
  const file = path.resolve(__dirname, '../src/routes/webConversions.js');
  const options = { db: fakeDb(tables()), primary: () => 'primary', withPrimary: fn => fn(), now: () => NOW };
  const query = { from: '2026-10-01', to: '2026-10-13' };
  const invoke = req => routeHarness(file, options)('/qualified-offline-conversions', { query, ...req });
  assert.equal((await invoke({ user: { role: 'sales', company_id: A } })).status, 403);
  assert.equal((await invoke({ user: { role: 'admin', company_id: A }, tenantCompanyIds: [B] })).status, 403);
  const ok = await invoke({ user: { role: 'admin', company_id: A }, tenantCompanyIds: [A] });
  assert.equal(ok.status, 200); assert.equal(ok.body.counts.qualified_leads, 1);
  assert.doesNotMatch(JSON.stringify(ok.body), /Cj0KCQ|recording:synthetic-proof|customer_id|actor_id|evidence_ref/);
});
