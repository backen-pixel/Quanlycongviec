'use strict';

// Actual isolated PostgreSQL tests; provide an external PGlite installation as argv[2].
// No production dependency, network, live database or provider event is used here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { prepareWebsiteFeedback } = require('../src/modules/marketingAutomation/websiteFeedbackOutbox');
const root = path.resolve(__dirname, '../..');
const receiptPath = path.join(root, 'database/20261014005710_website_intake_receipts.sql');
const feedbackPath = path.join(root, 'database/20261014005713_website_feedback_outbox.sql');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const company = '991dc79d-cbf5-49f9-a364-35227cb47635';
const CF7_KEY = '00000000-0000-4000-8000-000000000007';
const CF7_NAME = 'VPT_V1_CF7_CRM_Admin_HCM';
const target = { company_id: company, dataset_id: '1575398160676100',
  ad_account_id: 'act_835757498658305', site_host: 'vanphuthanh.net' };
const tests = [];
const test = (name, run) => tests.push({ name, run });
const json = JSON.stringify;
let db;

function baselineSQL() {
  const keys = read('database/152_external_api_keys.sql');
  const attr = read('database/638_lead_attribution_quality_partner.sql');
  const qualification = read('database/712_p1_qualification.sql');
  const table = qualification.slice(qualification.indexOf('CREATE TABLE IF NOT EXISTS public.p1_qualification_events'),
    qualification.indexOf('-- CREATE IF NOT EXISTS must not silently accept'));
  const index = qualification.slice(qualification.indexOf('CREATE INDEX IF NOT EXISTS p1_qualification_events_latest_idx'),
    qualification.indexOf('DO $$', qualification.indexOf('CREATE INDEX IF NOT EXISTS p1_qualification_events_latest_idx')));
  const permissions = qualification.slice(qualification.indexOf('ALTER TABLE public.p1_qualification_events ENABLE'),
    qualification.indexOf('CREATE OR REPLACE FUNCTION public.p1_qualification_command_v1'));
  // PGlite 0.5.x uses PG18 NOT NULL metadata. The old PG17-only catalog-count
  // assertions are omitted; actual tables, constraints, indexes/RLS/grants remain.
  return `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    CREATE TABLE public.users(id uuid PRIMARY KEY);
    CREATE TABLE public.company_regions(id uuid PRIMARY KEY);
    CREATE TABLE public.crm_lead_types(id uuid PRIMARY KEY);
    CREATE TABLE public.crm_pipelines(id uuid PRIMARY KEY);
    CREATE TABLE public.customers(id uuid PRIMARY KEY,company_id uuid,phone text,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE public.facebook_contacts(id uuid PRIMARY KEY);
    CREATE TABLE public.crm_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,
      customer_id uuid NOT NULL REFERENCES public.customers(id),assigned_to uuid,type text NOT NULL DEFAULT 'lead',
      facebook_contact_id uuid,phone text,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    ${keys}
    ${attr.slice(attr.indexOf('CREATE TABLE IF NOT EXISTS lead_attribution'), attr.indexOf('CREATE TABLE IF NOT EXISTS lead_quality_scores'))}
    ${table}${index}${permissions}
    GRANT SELECT,INSERT,UPDATE ON public.crm_leads TO service_role;
    GRANT SELECT,INSERT ON public.lead_attribution TO service_role;
    GRANT SELECT ON public.external_api_keys,public.customers TO service_role;`;
}
async function admin(sql, args = []) {
  await db.exec('RESET ROLE');
  return db.query(sql, args);
}
async function service(sql, args = []) {
  await db.exec('SET ROLE service_role');
  return db.query(sql, args);
}
async function rpc(name, args) {
  const result = await service(`SELECT public.${name}(${args.map((_, index) => '$' + (index + 1)).join(',')}) AS value`,
    args.map(value => value !== null && typeof value === 'object' ? json(value) : value));
  return result.rows[0].value;
}
async function rejectsCode(run, code, message) {
  await assert.rejects(run, error => error.code === code && (!message || error.message.includes(message)));
}
async function reset() {
  await admin('TRUNCATE public.website_feedback_attempts,public.website_feedback_outbox,' +
    'public.p1_qualification_events,public.website_intake_receipts,public.lead_attribution,' +
    'public.crm_leads,public.external_api_keys,public.customers CASCADE');
}

function makeFixture(ageSeconds = 6, qualificationAgeSeconds = 1) {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const saved = now - ageSeconds * 1000, submitted = saved - 2000, captured = submitted - 2000;
  const lead = randomUUID(), customer = randomUUID(), key = CF7_KEY, request = randomUUID(), qualifier = randomUUID();
  const fbclid = 'synthetic_click_' + hash(request).slice(0, 24);
  const landing = 'https://vanphuthanh.net/tu-bep/';
  const source = { kenh: 'website', platform: 'facebook', utm_source: 'facebook', utm_medium: 'paid_social',
    campaign_id: '100000000000101', adset_id: '100000000000102', ad_id: '100000000000103',
    utm_campaign: '100000000000101', utm_content: '100000000000103', fbclid, landing_url: landing };
  const metadata = { version: 1, request_id: request, form_id: '11116', site_host: 'vanphuthanh.net',
    submitted_at: new Date(submitted).toISOString(), landing_url: landing, captured_at: new Date(captured).toISOString(),
    fbc: `fb.1.${captured}.${fbclid}`, fbp: `fb.1.${captured}.1000000001`,
    measurement_consent: true, consent_version: 'VPT_ADS_V1', api_key_fingerprint: hash(key) };
  const event = { company_id: company, lead_id: lead, source_receipt_id: request, identity_key: hash('identity:' + lead),
    context_hash: hash('context:' + lead), qualification_id: qualifier, qualification_revision: 1,
    source_kind: 'website', delivery_supported: true, ad_account_id: target.ad_account_id,
    landing_url: landing, fbclid, captured_ms: captured, acquired_ms: submitted,
    qualified_ms: now - qualificationAgeSeconds * 1000, measurement_consent: true, consent_version: 'VPT_ADS_V1',
    fbc: metadata.fbc, fbp: metadata.fbp };
  return { lead, customer, key, request, qualifier, saved, submitted, captured, source, metadata, event, company };
}
async function support(fixture, keyOverrides = {}) {
  await admin('INSERT INTO public.companies(id) VALUES($1) ON CONFLICT DO NOTHING', [fixture.company]);
  const keyCompany = keyOverrides.company_id || fixture.company;
  await admin('INSERT INTO public.companies(id) VALUES($1) ON CONFLICT DO NOTHING', [keyCompany]);
  await admin(`INSERT INTO public.external_api_keys(id,name,key,company_id,active) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(id) DO UPDATE SET company_id=EXCLUDED.company_id,active=EXCLUDED.active`,
    [fixture.key, keyOverrides.name || CF7_NAME, 'synthetic_' + fixture.key, keyCompany, keyOverrides.active ?? true]);
  await admin('INSERT INTO public.customers(id,company_id,phone,created_at) VALUES($1,$2,$3,$4)',
    [fixture.customer, fixture.company, '0900000000', new Date(fixture.submitted + 1000).toISOString()]);
}
async function save(fixture) {
  return service(`INSERT INTO public.crm_leads(id,company_id,customer_id,phone,created_at,intake_attribution,website_intake)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [fixture.lead, fixture.company, fixture.customer, '0900000000',
    new Date(fixture.saved).toISOString(), fixture.source == null ? null : json(fixture.source),
    fixture.metadata == null ? null : json(fixture.metadata)]);
}
async function qualify(fixture, revision = 1, status = 'QUALIFIED') {
  const id = revision === 1 ? fixture.qualifier : randomUUID();
  await admin(`INSERT INTO public.p1_qualification_events(id,company_id,canonical_lead_id,revision,status,
    contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,request_id,context_hash,input,recorded_at)
    VALUES($1,$2,$3,$4,$5,$6,$6,$6,$7,$8,$9,$10,'{}',$11)`,
  [id, fixture.company, fixture.lead, revision, status, status === 'QUALIFIED',
    status === 'QUALIFIED' ? 'synthetic-call-evidence' : null, randomUUID(), randomUUID(),
    fixture.event.context_hash, new Date(fixture.event.qualified_ms + (revision - 1) * 100).toISOString()]);
  return id;
}
async function fixture(ageSeconds = 6, qualificationAgeSeconds = 1) {
  const item = makeFixture(ageSeconds, qualificationAgeSeconds);
  await support(item); await save(item); await qualify(item);
  return { ...item, row: prepareWebsiteFeedback(item.event, { target, mode: 'test' }) };
}
const enqueue = row => rpc('web_feedback_enqueue_v1', [row]);
const claim = (scope = target, mode = 'test') => rpc('web_feedback_claim_v1', [scope, mode, randomUUID()]);
const preflight = row => rpc('web_feedback_preflight_v1', [row.id, row.lease_token]);
const guard = (scope = target, mode = 'test') => rpc('web_feedback_guard_v1', [scope, mode]);
const finish = (row, status, receipt = null, reason = null, lease = row.lease_token) =>
  rpc('web_feedback_finish_v1', [row.id, lease, status, receipt, reason]);
const current = row => ({ event_id: row.event_id, context_hash: row.context_hash,
  qualification_id: row.qualification_id, qualification_revision: row.qualification_revision,
  source_receipt_id: row.source_receipt_id, landing_url: row.landing_url, fbclid: row.fbclid,
  captured_ms: row.captured_ms, payload: row.payload });
const reconcile = (rows, complete = false, history = null) =>
  rpc('web_feedback_reconcile_v1', [target, 'test', rows, complete, history]);
async function counts() {
  return (await admin(`SELECT (SELECT count(*)::int FROM public.crm_leads) leads,
    (SELECT count(*)::int FROM public.lead_attribution) attrs,(SELECT count(*)::int FROM public.website_intake_receipts) receipts`)).rows[0];
}
async function insertReceipt(receipt) {
  const columns = Object.keys(receipt);
  return service(`INSERT INTO public.website_intake_receipts(${columns.join(',')})
    VALUES(${columns.map((_, index) => '$' + (index + 1)).join(',')})`,
  Object.values(receipt).map(value => value !== null && typeof value === 'object' ? json(value) : value));
}
function receiptFor(item) {
  return { id: item.request, company_id: item.company, lead_id: item.lead, customer_id: item.customer, api_key_id: item.key,
    form_id: item.metadata.form_id, site_host: item.metadata.site_host, submitted_at: item.metadata.submitted_at,
    saved_at: new Date(item.saved).toISOString(), landing_url: item.metadata.landing_url, source: item.source,
    fbc: item.metadata.fbc, fbp: item.metadata.fbp, captured_at: item.metadata.captured_at,
    measurement_consent: item.metadata.measurement_consent, consent_version: item.metadata.consent_version };
}
async function historicalRow(row, status = 'accepted') {
  const values = { ...row, status, attempts: status === 'pending' ? 0 : 1,
    accepted_at: status === 'accepted' ? new Date(row.payload.event_time * 1000).toISOString() : null,
    fbtrace_id: status === 'accepted' ? 'historical_synthetic_trace' : null };
  const names = Object.keys(values);
  return (await admin(`INSERT INTO public.website_feedback_outbox(${names.join(',')})
    VALUES(${names.map((_, index) => '$' + (index + 1)).join(',')}) RETURNING *`,
  Object.values(values).map(value => value !== null && typeof value === 'object' ? json(value) : value))).rows[0];
}

test('new migrations compile with actual 717 intake and 712 qualification baseline', async () => {
  const tables = await admin(`SELECT relname,relrowsecurity FROM pg_class WHERE oid IN
    ('public.website_intake_receipts'::regclass,'public.website_feedback_outbox'::regclass,'public.website_feedback_attempts'::regclass)`);
  assert.equal(tables.rows.length, 3); assert(tables.rows.every(row => row.relrowsecurity));
  const functions = await admin("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'web_feedback_%' OR proname LIKE 'website_intake_%')");
  assert(functions.rows.length >= 10);
  assert(functions.rows.every(row => row.prosecdef === false && row.proconfig.some(value => /^search_path=/.test(value))));
});
test('anonymous and authenticated roles cannot read matching evidence or invoke feedback', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ['website_intake_receipts', 'website_feedback_outbox', 'website_feedback_attempts']) {
      await rejectsCode(() => db.query(`SELECT * FROM public.${table}`), '42501');
      await rejectsCode(() => db.query(`INSERT INTO public.${table} DEFAULT VALUES`), '42501');
      await rejectsCode(() => db.query(`DELETE FROM public.${table}`), '42501');
    }
    await rejectsCode(() => db.query('SELECT public.web_feedback_guard_v1($1,$2)', [json(target), 'test']), '42501');
    await rejectsCode(() => db.query('SELECT public.website_intake_key_v1($1)', [company]), '42501');
  }
  await rejectsCode(() => admin('SELECT public.web_feedback_guard_v1($1,$2)', [json(target), 'test']), '42501');
});
test('saved Lead creates its immutable matching receipt and attribution atomically', async () => {
  const item = await fixture();
  assert.deepEqual(await counts(), { leads: 1, attrs: 1, receipts: 1 });
  const receipt = (await service('SELECT * FROM public.website_intake_receipts WHERE id=$1', [item.request])).rows[0];
  assert.equal(receipt.lead_id, item.lead); assert.equal(receipt.customer_id, item.customer);
  assert.equal(receipt.fbc, item.metadata.fbc); assert.equal(receipt.measurement_consent, true);
  assert.equal(new Date(receipt.saved_at).getTime(), item.saved);
  assert.equal(new Date(receipt.submitted_at).getTime(), item.submitted);
  assert.deepEqual(receipt.source, item.source);
  await rejectsCode(() => service('UPDATE public.website_intake_receipts SET fbc=NULL WHERE id=$1', [item.request]), '42501');
  await rejectsCode(() => service('DELETE FROM public.website_intake_receipts WHERE id=$1', [item.request]), '42501');
  await rejectsCode(() => admin('DELETE FROM public.website_intake_receipts WHERE id=$1', [item.request]), '22023', 'WEB_RECEIPT_IMMUTABLE');
  await rejectsCode(() => service('UPDATE public.crm_leads SET website_intake=NULL WHERE id=$1', [item.lead]), '22023', 'WEB_INTAKE_IMMUTABLE');
});
test('receipt failure rolls back Lead and attribution rather than leaving a false saved event', async () => {
  const item = makeFixture(); await support(item);
  await admin(`CREATE FUNCTION public.isolated_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'ISOLATED_RECEIPT_FAILURE'; END $$`);
  await admin('CREATE TRIGGER isolated_receipt_failure AFTER INSERT ON public.website_intake_receipts FOR EACH ROW EXECUTE FUNCTION public.isolated_receipt_failure()');
  try { await assert.rejects(() => save(item), /ISOLATED_RECEIPT_FAILURE/); }
  finally { await admin('DROP TRIGGER isolated_receipt_failure ON public.website_intake_receipts'); await admin('DROP FUNCTION public.isolated_receipt_failure()'); }
  assert.deepEqual(await counts(), { leads: 0, attrs: 0, receipts: 0 });
});
test('legacy rows remain NULL and cannot acquire evidence through a later update or direct insert', async () => {
  const item = makeFixture(); await support(item);
  const metadata = item.metadata; item.metadata = null;
  await save(item);
  assert.deepEqual(await counts(), { leads: 1, attrs: 1, receipts: 0 });
  await rejectsCode(() => service('UPDATE public.crm_leads SET website_intake=$1 WHERE id=$2', [json(metadata), item.lead]), '22023', 'WEB_INTAKE_IMMUTABLE');
  item.metadata = metadata;
  await rejectsCode(() => insertReceipt(receiptFor(item)), '22023', 'WEB_RECEIPT_PROJECTION_INVALID');
});
test('existing authenticated legacy writes cannot attach server-bound website measurement proof', async () => {
  const item = makeFixture(); await support(item);
  // Model an existing CRM write grant; the additive website trigger must preserve
  // legacy NULL rows while rejecting first-party API metadata from this role.
  await admin('GRANT INSERT ON public.crm_leads TO authenticated');
  try {
    await db.exec('SET ROLE authenticated');
    await rejectsCode(() => db.query(`INSERT INTO public.crm_leads(id,company_id,customer_id,created_at,intake_attribution,website_intake)
      VALUES($1,$2,$3,$4,$5,$6)`, [item.lead, item.company, item.customer, new Date(item.saved).toISOString(),
      json(item.source), json(item.metadata)]), '42501', 'WEB_SERVICE_ROLE_REQUIRED');
    await db.query('INSERT INTO public.crm_leads(id,company_id,customer_id) VALUES($1,$2,$3)',
      [randomUUID(), item.company, item.customer]);
  } finally { await admin('REVOKE INSERT ON public.crm_leads FROM authenticated'); }
  assert.deepEqual(await counts(), { leads: 1, attrs: 0, receipts: 0 });
});
test('foreign company/site/form/key and missing required metadata are refused without saving Lead', async () => {
  const changes = [item => { item.company = randomUUID(); }, item => { item.metadata.site_host = 'evil.example'; },
    item => { item.metadata.form_id = '11117'; }, item => { item.metadata.api_key_fingerprint = hash('another-key'); },
    item => { delete item.metadata.measurement_consent; }, item => { item.metadata.measurement_consent = null; },
    item => { item.metadata.landing_url = 'https://evil.example/'; },
    item => { item.source.landing_url = 'https://vanphuthanh.net/different/'; }];
  for (const change of changes) {
    await reset(); const item = makeFixture(); change(item); await support(item);
    await assert.rejects(() => save(item));
    assert.deepEqual(await counts(), { leads: 0, attrs: 0, receipts: 0 });
  }
  for (const key of [{ active: false }, { company_id: randomUUID() }]) {
    await reset(); const item = makeFixture(); await support(item, key);
    await rejectsCode(() => save(item), '22023', 'WEB_INTAKE_INVALID');
  }
});
test('another active VPT integration key cannot create new website evidence', async () => {
  const item = makeFixture();
  await support(item);
  const alternate = randomUUID();
  await admin('INSERT INTO public.external_api_keys(id,name,key,company_id,active) VALUES($1,$2,$3,$4,true)',
    [alternate, 'Dashboard integration', 'synthetic_' + alternate, company]);
  item.metadata.api_key_fingerprint = hash(alternate);
  assert.equal((await service('SELECT active FROM public.external_api_keys WHERE id=$1', [alternate])).rows[0].active, true);
  await rejectsCode(() => save(item), '22023', 'WEB_INTAKE_INVALID');
  assert.deepEqual(await counts(), { leads: 0, attrs: 0, receipts: 0 });
});
test('duplicate active integration names and raw credential metadata are refused; Lead contains only fingerprint', async () => {
  const item = makeFixture(); await support(item);
  const duplicate = randomUUID();
  await admin('INSERT INTO public.external_api_keys(id,name,key,company_id,active) VALUES($1,$2,$3,$4,true)',
    [duplicate, CF7_NAME, 'synthetic_' + duplicate, company]);
  await rejectsCode(() => save(item), '22023', 'WEB_INTAKE_INVALID');
  assert.deepEqual(await counts(), { leads: 0, attrs: 0, receipts: 0 });
  await reset(); const raw = makeFixture(); await support(raw);
  raw.metadata.api_key_id = raw.key;
  await rejectsCode(() => save(raw), '22023', 'WEB_INTAKE_INVALID');
  await reset(); const clean = await fixture();
  const publicLead = (await service('SELECT * FROM public.crm_leads WHERE id=$1', [clean.lead])).rows[0];
  assert.equal(publicLead.website_intake.api_key_id, undefined);
  assert.equal(publicLead.website_intake.api_key_fingerprint, hash(clean.key));
  assert.equal(JSON.stringify(publicLead).includes(clean.key), false);
});
test('future, missing or reordered timestamps and nonmatching FBC cannot become receipts', async () => {
  const changes = [item => { item.metadata.submitted_at = new Date(Date.now() + 60000).toISOString(); },
    item => { item.saved = Date.now() + 120000; item.metadata.submitted_at = new Date(item.saved - 1000).toISOString(); },
    item => { item.metadata.submitted_at = null; }, item => { item.metadata.captured_at = new Date(item.submitted + 1000).toISOString(); },
    item => { item.metadata.fbc = item.metadata.fbc.replace(item.source.fbclid, 'another_click_id'); },
    item => { item.metadata.fbc = item.metadata.fbc.replace(String(item.captured), String(item.captured - 1)); },
    item => { item.metadata.fbp = `fb.1.${item.submitted + 10000}.10000001`; }];
  for (const change of changes) {
    await reset(); const item = makeFixture(); change(item); await support(item);
    await assert.rejects(() => save(item));
    assert.deepEqual(await counts(), { leads: 0, attrs: 0, receipts: 0 });
  }
});
test('consent false stores no matching cookies and never defaults to consent true', async () => {
  const item = makeFixture(); item.metadata.measurement_consent = false;
  item.metadata.fbc = null; item.metadata.fbp = null; item.metadata.captured_at = null;
  await support(item); await save(item); await qualify(item);
  const receipt = (await service('SELECT measurement_consent,fbc,fbp,captured_at FROM public.website_intake_receipts')).rows[0];
  assert.deepEqual(receipt, { measurement_consent: false, fbc: null, fbp: null, captured_at: null });
  const row = prepareWebsiteFeedback(item.event, { target, mode: 'test' });
  await assert.rejects(() => enqueue(row));
  await reset(); const invalid = makeFixture(); invalid.metadata.measurement_consent = false; await support(invalid);
  await rejectsCode(() => save(invalid), '22023', 'WEB_INTAKE_CONSENT_INVALID');
});
test('FBC click identifiers enforce the bounded length without invalid PostgreSQL regex ranges', async () => {
  const valid = makeFixture();
  valid.source.fbclid = 'A'.repeat(500); valid.metadata.fbc = `fb.1.${valid.captured}.${valid.source.fbclid}`;
  await support(valid); await save(valid);
  assert.deepEqual(await counts(), { leads: 1, attrs: 1, receipts: 1 });
  await reset(); const tooLong = makeFixture();
  tooLong.source.fbclid = 'A'.repeat(501); tooLong.metadata.fbc = `fb.1.${tooLong.captured}.${tooLong.source.fbclid}`;
  await support(tooLong); await assert.rejects(() => save(tooLong));
  assert.deepEqual(await counts(), { leads: 0, attrs: 0, receipts: 0 });
});
test('duplicate request rolls back the second Lead and changed direct receipt is refused', async () => {
  const first = await fixture(), second = makeFixture(); second.request = first.request; second.metadata.request_id = first.request;
  await support(second); await rejectsCode(() => save(second), '23505');
  assert.deepEqual(await counts(), { leads: 1, attrs: 1, receipts: 1 });
  await rejectsCode(() => insertReceipt({ ...receiptFor(first), id: randomUUID(), customer_id: randomUUID() }), '22023', 'WEB_RECEIPT_PROJECTION_INVALID');
});
test('outbox requires saved original matching proof and actual latest qualification time', async () => {
  const item = await fixture();
  const stored = await enqueue(item.row);
  assert.equal(stored.payload.event_time, Math.floor(item.event.qualified_ms / 1000));
  assert.deepEqual(stored.payload.user_data, { fbc: item.metadata.fbc, fbp: item.metadata.fbp, external_id: [item.event.identity_key] });
  await assert.rejects(() => enqueue({ ...item.row, payload: { ...item.row.payload, event_time: item.row.payload.event_time + 1 } }));
  await assert.rejects(() => enqueue({ ...item.row, payload: { ...item.row.payload,
    user_data: { ...item.row.payload.user_data, fbc: item.metadata.fbc + '_changed' } } }));
  await assert.rejects(() => enqueue({ ...item.row, payload: { ...item.row.payload, user_data: { ...item.row.payload.user_data, ph: hash('0900000000') } } }));
  await qualify(item, 2, 'PENDING');
  await assert.rejects(() => enqueue(item.row));
});
test('stable dedup identity is permanent across test/production and qualification revisions', async () => {
  const item = await fixture(), one = await enqueue(item.row), two = await enqueue(item.row);
  assert.equal(one.id, two.id);
  const nextId = await qualify(item, 2);
  const newer = prepareWebsiteFeedback({ ...item.event, qualification_id: nextId, qualification_revision: 2,
    qualified_ms: item.event.qualified_ms + 100 }, { target, mode: 'test' });
  assert.equal(newer.event_id, item.row.event_id);
  assert.equal((await enqueue(newer)).id, one.id);
  const production = prepareWebsiteFeedback({ ...item.event, qualification_id: nextId, qualification_revision: 2,
    qualified_ms: item.event.qualified_ms + 100 }, { target, mode: 'production' });
  assert.notEqual(production.event_id, newer.event_id);
  assert.notEqual((await enqueue(production)).id, one.id);
});
test('preflight rereads latest qualification and refuses revoked pending claims', async () => {
  const item = await fixture(); await enqueue(item.row); const leased = await claim();
  assert.equal(await preflight(leased), true);
  assert.equal(await preflight({ ...leased, lease_token: randomUUID() }), false);
  await qualify(item, 2, 'PENDING'); assert.equal(await preflight(leased), false);
  await finish(leased, 'cancelled', null, 'META_ELIGIBILITY_CHANGED'); assert.equal(await claim(), null);
  await reset(); const pending = await fixture(); await enqueue(pending.row); await qualify(pending, 2, 'PENDING');
  assert.equal(await claim(), null);
  assert.equal((await service('SELECT attempts FROM public.website_feedback_outbox')).rows[0].attempts, 0);
});
test('lease completion validates provider ACK and wrong lease cannot finish', async () => {
  const item = await fixture(); await enqueue(item.row); const leased = await claim();
  assert.equal(await finish(leased, 'accepted', { events_received: 1, fbtrace_id: 'synthetic_trace' }, null, randomUUID()), false);
  for (const receipt of [{ events_received: 0, fbtrace_id: 'synthetic_trace' },
    { events_received: 1, fbtrace_id: 'bad trace' }, { events_received: 1, fbtrace_id: 'synthetic_trace', token: 'do-not-store' }]) {
    await assert.rejects(() => finish(leased, 'accepted', receipt));
  }
  assert.equal(await finish(leased, 'accepted', { events_received: 1, fbtrace_id: 'synthetic_trace' }), true);
  assert.equal(await claim(), null);
});
test('unconfirmed ACK persistence retains processing then UNKNOWN without another send', async () => {
  const item = await fixture(); await enqueue(item.row); const leased = await claim();
  await admin(`CREATE FUNCTION public.isolated_feedback_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'ISOLATED_FEEDBACK_WRITE_FAILURE'; END $$`);
  await admin('CREATE TRIGGER isolated_feedback_failure BEFORE UPDATE ON public.website_feedback_attempts FOR EACH ROW EXECUTE FUNCTION public.isolated_feedback_failure()');
  try {
    await assert.rejects(() => finish(leased, 'accepted', { events_received: 1, fbtrace_id: 'unpersisted_synthetic_trace' }), /ISOLATED_FEEDBACK_WRITE_FAILURE/);
    await assert.rejects(() => finish(leased, 'unknown', null, 'META_UNCONFIRMED_RECEIPT'), /ISOLATED_FEEDBACK_WRITE_FAILURE/);
  } finally { await admin('DROP TRIGGER isolated_feedback_failure ON public.website_feedback_attempts'); await admin('DROP FUNCTION public.isolated_feedback_failure()'); }
  const stored = (await service('SELECT status,attempts,accepted_at FROM public.website_feedback_outbox')).rows[0];
  assert.deepEqual(stored, { status: 'processing', attempts: 1, accepted_at: null });
  const another = await fixture(); await enqueue(another.row); assert.equal(await claim(), null);
  await admin("UPDATE public.website_feedback_outbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id=$1", [leased.id]);
  assert.equal(await preflight(leased), false); assert.equal(await claim(), null);
  assert.equal((await guard()).unknown, 1); assert.equal((await enqueue(item.row)).status, 'unknown');
});
test('processing serializes one target while other dataset/mode and owning preflight remain independent', async () => {
  const item = await fixture(); await enqueue(item.row); const leased = await claim();
  const another = await fixture(), pending = await enqueue(another.row);
  assert.equal(await claim(), null); assert.equal(await preflight(leased), true);
  const otherDataset = { ...target, dataset_id: '1575398160676199' };
  await enqueue(prepareWebsiteFeedback(another.event, { target: otherDataset, mode: 'test' }));
  await enqueue(prepareWebsiteFeedback(another.event, { target, mode: 'production' }));
  assert.equal(await preflight(await claim(otherDataset)), true);
  assert.equal(await preflight(await claim(target, 'production')), true);
  await finish(leased, 'cancelled', null, 'META_TEST_CANCELLED'); assert.equal((await claim()).id, pending.id);
});
test('lifetime audit preserves old accepted proof without reviving delivery outside seven days', async () => {
  const item = await fixture(90 * 86400, 80 * 86400);
  const old = await historicalRow(item.row);
  await reconcile([], false); assert.equal((await guard()).blocked, false);
  await reconcile([], true, [current(item.row)]);
  const stored = (await service('SELECT status,stale,attempts FROM public.website_feedback_outbox WHERE id=$1', [old.id])).rows[0];
  assert.deepEqual(stored, { status: 'accepted', stale: false, attempts: 1 });
  assert.equal(await claim(), null);
  const fresh = await fixture(), pending = await enqueue(fresh.row); assert.equal((await claim()).id, pending.id);
});
test('true revoke/rekey of accepted proof holds further delivery without resending old event', async () => {
  const item = await fixture(); await enqueue(item.row); const accepted = await claim();
  await finish(accepted, 'accepted', { events_received: 1, fbtrace_id: 'before_rekey_trace' });
  const changed = prepareWebsiteFeedback({ ...item.event, identity_key: hash('merged:' + item.lead) }, { target, mode: 'test' });
  await enqueue(changed); await reconcile([current(changed)], true, [current(changed)]);
  assert.equal((await guard()).accepted_stale, 1); assert.equal(await claim(), null);
  const old = (await service('SELECT status,stale,attempts FROM public.website_feedback_outbox WHERE id=$1', [accepted.id])).rows[0];
  assert.deepEqual(old, { status: 'accepted', stale: true, attempts: 1 });
});

(async () => {
  const receiptMigration = fs.readFileSync(receiptPath, 'utf8'), feedbackMigration = fs.readFileSync(feedbackPath, 'utf8');
  assert(receiptMigration.trim() && feedbackMigration.trim(), 'Reviewed migrations must contain SQL');
  db = new PGlite();
  await db.exec(baselineSQL());
  await db.exec(read('database/717_marketing_intake.sql'));
  await db.exec(receiptMigration); await db.exec(feedbackMigration);
  let passed = 0;
  for (const item of tests) {
    await reset();
    try { await item.run(); passed++; console.log('PASS ' + item.name); }
    catch (error) { console.error('FAIL ' + item.name + '\n' + error.stack); process.exitCode = 1; break; }
  }
  console.log(`${passed}/${tests.length} actual PostgreSQL website tests passed (formal migrations; PGlite).`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (db) await db.close(); });
