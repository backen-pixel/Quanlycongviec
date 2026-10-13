'use strict';

// Isolated PostgreSQL verification. Supply an external PGlite installation as argv[2];
// this test neither connects to the live database nor adds a production dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { prepareMetaFeedback } = require('../src/modules/marketingAutomation/metaFeedbackOutbox');
const root = path.resolve(__dirname, '../..');
const formal = path.join(root, 'database/20261013143556_meta_qualified_feedback.sql');
const migrationPath = formal;
const migration = fs.readFileSync(migrationPath, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const company = '991dc79d-cbf5-49f9-a364-35227cb47635';
const target = { company_id: company, dataset_id: '1575398160676100',
  ad_account_id: 'act_835757498658305', page_id: '100000000000001' };
const tests = [];
const test = (name, run) => tests.push({ name, run });
const json = JSON.stringify;
let db;

function baselineSQL() {
  // Load the actual reviewed receipt definition/immutability trigger and actual
  // qualification definition, constraints, RLS and grants from existing migrations.
  const receiptSQL = fs.readFileSync(path.join(root, 'database/702_facebook_lead_ads_intake.sql'), 'utf8');
  const receipt = receiptSQL.slice(receiptSQL.indexOf('CREATE TABLE IF NOT EXISTS public.facebook_lead_ads_intake_receipts'),
    receiptSQL.indexOf('ALTER TABLE public.facebook_lead_ads_bindings ENABLE'));
  const qualificationSQL = fs.readFileSync(path.join(root, 'database/712_p1_qualification.sql'), 'utf8');
  // PGlite 0.5.x uses PostgreSQL 18, which adds NOT NULL entries to pg_constraint.
  // Omit the old migration's PostgreSQL-17 catalog-count guards only. The table,
  // constraints, index, RLS and grants themselves remain the actual source SQL.
  const qualification = qualificationSQL.slice(qualificationSQL.indexOf('CREATE TABLE IF NOT EXISTS public.p1_qualification_events'),
    qualificationSQL.indexOf('-- CREATE IF NOT EXISTS must not silently accept')) +
    qualificationSQL.slice(qualificationSQL.indexOf('CREATE INDEX IF NOT EXISTS p1_qualification_events_latest_idx'),
      qualificationSQL.indexOf('DO $$', qualificationSQL.indexOf('CREATE INDEX IF NOT EXISTS p1_qualification_events_latest_idx'))) +
    qualificationSQL.slice(qualificationSQL.indexOf('ALTER TABLE public.p1_qualification_events ENABLE'),
      qualificationSQL.indexOf('CREATE OR REPLACE FUNCTION public.p1_qualification_command_v1'));
  assert(receipt.includes('FB_INBOX_RECEIPT_IMMUTABLE'));
  assert(qualification.includes('p1_qualification_events_latest_idx'));
  return `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE TABLE public.crm_leads (id uuid PRIMARY KEY, company_id uuid NOT NULL,
      customer_id uuid NOT NULL, facebook_contact_id uuid NOT NULL,
      type text NOT NULL DEFAULT 'lead', is_test boolean NOT NULL DEFAULT false);
    ${receipt}
    ALTER TABLE public.facebook_lead_ads_intake_receipts ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.facebook_lead_ads_intake_receipts FROM PUBLIC,anon,authenticated,service_role;
    GRANT SELECT ON public.facebook_lead_ads_intake_receipts,public.crm_leads TO service_role;
    ${qualification}`;
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
  const placeholders = args.map((_, index) => '$' + (index + 1)).join(',');
  const result = await service(`SELECT public.${name}(${placeholders}) AS value`,
    args.map(value => value !== null && typeof value === 'object' ? json(value) : value));
  return result.rows[0].value;
}
async function rejectsCode(run, code, message) {
  await assert.rejects(run, error => error.code === code && (!message || error.message.includes(message)));
}
async function reset() {
  await admin('TRUNCATE public.meta_feedback_attempts,public.meta_feedback_outbox,' +
    'public.p1_qualification_events,public.facebook_lead_ads_intake_receipts,public.crm_leads CASCADE');
}
async function fixture(ageSeconds = 600, qualificationAgeSeconds = Math.min(ageSeconds / 2, 300)) {
  const seconds = Math.floor(Date.now() / 1000);
  const lead = randomUUID(), customer = randomUUID(), contact = randomUUID(), receipt = randomUUID();
  const qualifier = randomUUID(), context = hash('context:' + lead), identity = hash('identity:' + lead);
  const acquired = (seconds - ageSeconds) * 1000, qualified = (seconds - qualificationAgeSeconds) * 1000;
  const providerLeadId = String(100000000000000n + BigInt('0x' + hash(lead).slice(0, 12)));
  const provider = { id: providerLeadId, form_id: '100000000000011', form_page_id: target.page_id,
    created_time: new Date(acquired).toISOString(), ad_id: '100000000000012', is_organic: false,
    platform: 'facebook', field_data: [{ name: 'phone_number', values: ['0900000000'] }] };
  await admin('INSERT INTO public.crm_leads(id,company_id,customer_id,facebook_contact_id) VALUES($1,$2,$3,$4)',
    [lead, company, customer, contact]);
  await admin(`INSERT INTO public.facebook_lead_ads_intake_receipts
    (id,page_id,form_id,leadgen_id,inbox_id,binding_version,company_id,recipient_id,pipeline_id,stage_id,
     source_id,lead_id,customer_id,contact_id,attribution_id,lead_ad_id,notification_id,lead_data,provider_data)
    VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
  [receipt, target.page_id, provider.form_id, provider.id, randomUUID(), company, randomUUID(), randomUUID(),
    randomUUID(), randomUUID(), lead, customer, contact, randomUUID(), randomUUID(), randomUUID(),
    json({ phone: '0900000000' }), json(provider)]);
  await admin(`INSERT INTO public.p1_qualification_events(id,company_id,canonical_lead_id,revision,status,
    contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,request_id,context_hash,input,recorded_at)
    VALUES($1,$2,$3,1,'QUALIFIED',true,true,true,'synthetic-call-evidence',$4,$5,$6,'{}',$7)`,
  [qualifier, company, lead, randomUUID(), randomUUID(), context, new Date(qualified).toISOString()]);
  const event = { company_id: company, lead_id: lead, source_receipt_id: receipt,
    identity_key: identity, context_hash: context, qualification_id: qualifier, qualification_revision: 1,
    source_kind: 'lead_ads', delivery_supported: true, fb_leadgen_id: provider.id,
    page_id: target.page_id, ad_account_id: target.ad_account_id, acquired_ms: acquired, qualified_ms: qualified };
  return { event, provider, initial: prepareMetaFeedback({ ...event, event_name: 'initial_lead' }, { target, mode: 'test' }),
    qualified: prepareMetaFeedback({ ...event, event_name: 'qualified_lead' }, { target, mode: 'test' }) };
}
const enqueue = row => rpc('meta_feedback_enqueue_v1', [row]);
const claim = (mode = 'test', lease = randomUUID()) => rpc('meta_feedback_claim_v1', [target, mode, lease]);
const finish = (row, status, receipt = null, reason = null, lease = row.lease_token) =>
  rpc('meta_feedback_finish_v1', [row.id, lease, status, receipt, reason]);
const preflight = row => rpc('meta_feedback_preflight_v1', [row.id, row.lease_token]);
const guard = (scope = target, mode = 'test') => rpc('meta_feedback_guard_v1', [scope, mode]);
const current = row => ({ event_id: row.event_id, context_hash: row.context_hash,
  qualification_id: row.qualification_id, qualification_revision: row.qualification_revision,
  source_receipt_id: row.source_receipt_id, fb_leadgen_id: row.fb_leadgen_id });
const reconcile = (rows, complete = false, history = null) =>
  rpc('meta_feedback_reconcile_v1', [target, 'test', rows, complete, history]);
async function historicalRow(row, status = 'accepted') {
  // Seed an already-existing old ledger entry to exercise time aging without
  // falsifying provider timestamps or shifting a new event into a valid window.
  const values = { ...row, status, attempts: status === 'accepted' ? 1 : 0,
    accepted_at: status === 'accepted' ? new Date(row.payload.event_time * 1000).toISOString() : null,
    fbtrace_id: status === 'accepted' ? 'historical_synthetic_trace' : null };
  const names = Object.keys(values);
  return (await admin(`INSERT INTO public.meta_feedback_outbox(${names.join(',')})
    VALUES(${names.map((_, index) => '$' + (index + 1)).join(',')}) RETURNING *`,
  Object.values(values).map(value => value !== null && typeof value === 'object' ? json(value) : value))).rows[0];
}
async function revoke(row) {
  await admin(`INSERT INTO public.p1_qualification_events(company_id,canonical_lead_id,revision,status,
    contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,request_id,context_hash,input)
    VALUES($1,$2,$3,'PENDING',false,false,false,NULL,$4,$5,$6,'{}')`,
  [company, row.lead_id, row.qualification_revision + 1, randomUUID(), randomUUID(), row.context_hash]);
}

test('migration compiles with real receipt and qualification baselines', async () => {
  const tables = await admin(`SELECT relname,relrowsecurity FROM pg_class
    WHERE oid IN ('public.meta_feedback_outbox'::regclass,'public.meta_feedback_attempts'::regclass)`);
  assert.equal(tables.rows.length, 2);
  assert(tables.rows.every(row => row.relrowsecurity));
  const policies = await admin("SELECT count(*)::int AS n FROM pg_policy WHERE polrelid IN ('public.meta_feedback_outbox'::regclass,'public.meta_feedback_attempts'::regclass)");
  assert.equal(policies.rows[0].n, 0);
  const functions = await admin("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'meta_feedback_%'");
  assert(functions.rows.length >= 7);
  assert(functions.rows.every(row => row.prosecdef === false && row.proconfig.some(value => /^search_path=/.test(value))));
});

test('anon/authenticated cannot read, write, delete or invoke feedback RPCs', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ['meta_feedback_outbox', 'meta_feedback_attempts']) {
      await rejectsCode(() => db.query(`SELECT * FROM public.${table}`), '42501');
      await rejectsCode(() => db.query(`DELETE FROM public.${table}`), '42501');
      await rejectsCode(() => db.query(`INSERT INTO public.${table} DEFAULT VALUES`), '42501');
    }
    await rejectsCode(() => db.query('SELECT public.meta_feedback_list_v1($1,$2,$3)', [json(target), 'test', 10]), '42501');
    await rejectsCode(() => db.query('SELECT public.meta_feedback_preflight_v1($1,$2)', [randomUUID(), randomUUID()]), '42501');
    await rejectsCode(() => db.query('SELECT public.meta_feedback_guard_v1($1,$2)', [json(target), 'test']), '42501');
  }
  await rejectsCode(() => admin('SELECT public.meta_feedback_assert_target_v1($1,$2)', [json(target), 'test']), '42501', 'META_SERVICE_ROLE_REQUIRED');
});

test('service access is narrow and immutable intake receipt cannot change', async () => {
  const source = await fixture();
  await service('SELECT * FROM public.meta_feedback_outbox');
  await service('SELECT * FROM public.meta_feedback_attempts');
  await rejectsCode(() => service('DELETE FROM public.meta_feedback_outbox'), '42501');
  await rejectsCode(() => service('TRUNCATE public.meta_feedback_outbox'), '42501');
  await rejectsCode(() => admin('UPDATE public.facebook_lead_ads_intake_receipts SET provider_data=$1 WHERE id=$2',
    [json({ ...source.provider, created_time: new Date().toISOString() }), source.event.source_receipt_id]), '42501', 'FB_INBOX_RECEIPT_IMMUTABLE');
});

test('only actual provider and qualification times can be enqueued', async () => {
  const source = await fixture();
  assert.equal((await enqueue(source.initial)).payload.event_time, source.event.acquired_ms / 1000);
  assert.equal((await enqueue(source.qualified)).payload.event_time, source.event.qualified_ms / 1000);
  for (const row of [source.initial, source.qualified]) {
    const changed = { ...row, payload: { ...row.payload, event_time: row.payload.event_time + 1 } };
    await assert.rejects(() => enqueue(changed), error => error.code === '22023' || error.code === '40001');
  }
  await rejectsCode(() => enqueue({ ...source.initial, payload: { ...source.initial.payload,
    event_time: Math.floor(Date.now() / 1000) + 60 } }), '22023', 'META_EVENT_TIME_INVALID');
  await rejectsCode(() => enqueue({ ...source.initial, payload: { ...source.initial.payload,
    event_time: Math.floor(Date.now() / 1000) - 604900 } }), '22023', 'META_EVENT_TIME_INVALID');
});

test('invalid source scope, extra payload fields and numeric Lead ID fail closed', async () => {
  const source = await fixture();
  await rejectsCode(() => enqueue({ ...source.initial, page_id: '100000000000099' }), '40001', 'META_SOURCE_CHANGED');
  await rejectsCode(() => enqueue({ ...source.initial, company_id: randomUUID() }), '40001', 'META_SOURCE_CHANGED');
  await rejectsCode(() => enqueue({ ...source.initial, fb_leadgen_id: 100000000000010 }), '22023', 'META_EVENT_INVALID');
  await rejectsCode(() => enqueue({ ...source.initial, payload: { ...source.initial.payload,
    user_data: { ...source.initial.payload.user_data, ph: hash('0900000000') } } }), '22023', 'META_PAYLOAD_INVALID');
  await admin('UPDATE public.crm_leads SET is_test=true WHERE id=$1', [source.event.lead_id]);
  await rejectsCode(() => enqueue(source.initial), '40001', 'META_SOURCE_CHANGED');
});

test('enqueue is idempotent and test/production identities remain isolated', async () => {
  const source = await fixture();
  const one = await enqueue(source.qualified), two = await enqueue(source.qualified);
  assert.equal(one.id, two.id);
  const production = prepareMetaFeedback({ ...source.event, event_name: 'qualified_lead' }, { target, mode: 'production' });
  assert.notEqual(production.event_id, source.qualified.event_id);
  const prod = await enqueue(production);
  assert.notEqual(prod.id, one.id);
  const count = await service('SELECT count(*)::int AS n FROM public.meta_feedback_outbox');
  assert.equal(count.rows[0].n, 2);
  assert.equal((await claim()).id, one.id);
  assert.equal((await claim('production')).id, prod.id);
});

test('latest verified revision preserves stable ID and prevents stale enqueue', async () => {
  const source = await fixture(), old = await enqueue(source.qualified);
  const qualifier = randomUUID(), when = source.event.qualified_ms + 1000, nextContext = hash('new context');
  await admin(`INSERT INTO public.p1_qualification_events(id,company_id,canonical_lead_id,revision,status,
    contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,request_id,context_hash,input,recorded_at)
    VALUES($1,$2,$3,2,'QUALIFIED',true,true,true,'updated-synthetic-evidence',$4,$5,$6,'{}',$7)`,
  [qualifier, company, source.event.lead_id, randomUUID(), randomUUID(), nextContext, new Date(when).toISOString()]);
  await rejectsCode(() => enqueue(source.qualified), '40001', 'META_QUALIFICATION_CHANGED');
  const newer = prepareMetaFeedback({ ...source.event, event_name: 'qualified_lead', qualification_id: qualifier,
    qualification_revision: 2, context_hash: nextContext, qualified_ms: when }, { target, mode: 'test' });
  assert.equal(newer.event_id, source.qualified.event_id);
  const updated = await enqueue(newer);
  assert.equal(updated.id, old.id);
  assert.equal(updated.qualification_revision, 2);
  assert.equal(updated.status, 'pending');
});

test('leased sends require the matching lease and a minimal provider acknowledgement', async () => {
  const source = await fixture();
  await enqueue(source.initial);
  const row = await claim();
  assert.equal(row.status, 'processing');
  assert.equal(row.attempts, 1);
  assert.equal(await preflight(row), true);
  assert.equal(await finish(row, 'accepted', { events_received: 1, fbtrace_id: 'synthetic_trace' }, null, randomUUID()), false);
  for (const receipt of [{ events_received: 0, fbtrace_id: 'synthetic_trace' },
    { events_received: 1, fbtrace_id: 'bad trace' }, { events_received: 1, fbtrace_id: 'synthetic_trace', token: 'must-not-store' }]) {
    await rejectsCode(() => finish(row, 'accepted', receipt), '22023', 'META_RECEIPT_INVALID');
  }
  assert.equal(await finish(row, 'accepted', { events_received: 1, fbtrace_id: 'synthetic_trace' }), true);
  const attempts = await service('SELECT status,receipt,finished_at FROM public.meta_feedback_attempts');
  assert.equal(attempts.rows[0].status, 'accepted');
  assert.deepEqual(attempts.rows[0].receipt, { events_received: 1, fbtrace_id: 'synthetic_trace' });
  assert(attempts.rows[0].finished_at);
  assert.equal(await finish(row, 'accepted', { events_received: 1, fbtrace_id: 'synthetic_trace' }), false);
  assert.equal(await claim(), null);
});

test('expired processing lease becomes unknown and never automatically sends again', async () => {
  const source = await fixture();
  await enqueue(source.initial);
  const row = await claim();
  await admin("UPDATE public.meta_feedback_outbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id=$1", [row.id]);
  assert.deepEqual(await guard(), { blocked: true, reason_code: 'META_HISTORY_REVIEW_REQUIRED',
    unknown: 0, accepted_stale: 0, expired_processing: 1 });
  assert.equal(await preflight(row), false);
  assert.equal(await finish(row, 'accepted', { events_received: 1, fbtrace_id: 'late_trace' }), false);
  assert.equal(await claim(), null);
  const changed = await enqueue(source.initial);
  assert.equal(changed.status, 'unknown');
  assert.equal(changed.reason_code, 'META_LEASE_EXPIRED');
  assert.equal(changed.attempts, 1);
  assert.deepEqual(await guard(), { blocked: true, reason_code: 'META_HISTORY_REVIEW_REQUIRED',
    unknown: 1, accepted_stale: 0, expired_processing: 0 });
  const attempts = await service('SELECT status,reason_code FROM public.meta_feedback_attempts');
  assert.equal(attempts.rows[0].status, 'unknown');
  assert.equal(await claim(), null);
});

test('revocation blocks pending claim and preflight catches a change after claim', async () => {
  const first = await fixture();
  await enqueue(first.qualified);
  await revoke(first.qualified);
  assert.equal(await claim(), null);
  const rows = await service('SELECT status,attempts FROM public.meta_feedback_outbox');
  assert.equal(rows.rows[0].status, 'cancelled');
  assert.equal(rows.rows[0].attempts, 0);
  await reset();
  const second = await fixture();
  await enqueue(second.qualified);
  const claimed = await claim();
  assert.equal(await preflight({ ...claimed, lease_token: randomUUID() }), false);
  assert.equal(await preflight(claimed), true);
  await revoke(second.qualified);
  assert.equal(await preflight(claimed), false);
  assert.equal(await finish(claimed, 'cancelled', null, 'META_ELIGIBILITY_CHANGED'), true);
});

test('source projection changes cancel pending sends and fail preflight', async () => {
  const source = await fixture();
  await enqueue(source.initial);
  const row = await claim();
  await admin('UPDATE public.crm_leads SET facebook_contact_id=$1 WHERE id=$2', [randomUUID(), source.event.lead_id]);
  assert.equal(await preflight(row), false);
  assert.equal(await finish(row, 'cancelled', null, 'META_ELIGIBILITY_CHANGED'), true);
  assert.equal(await claim(), null);
});

test('accepted history survives delivery-window aging but flags actual revocation', async () => {
  const source = await fixture();
  const stored = await enqueue(source.qualified), row = await claim();
  await finish(row, 'accepted', { events_received: 1, fbtrace_id: 'history_trace' });
  // A delivery-window snapshot may contain no old accepted events. Absence alone
  // must not create an operator review or another attempt.
  await reconcile([], false);
  let actual = (await service('SELECT status,stale,attempts FROM public.meta_feedback_outbox WHERE id=$1', [stored.id])).rows[0];
  assert.deepEqual(actual, { status: 'accepted', stale: false, attempts: 1 });
  await reconcile([current(source.qualified)], true);
  actual = (await service('SELECT status,stale FROM public.meta_feedback_outbox WHERE id=$1', [stored.id])).rows[0];
  assert.deepEqual(actual, { status: 'accepted', stale: false });
  await revoke(source.qualified);
  await reconcile([], true);
  actual = (await service('SELECT status,stale,attempts,reason_code FROM public.meta_feedback_outbox WHERE id=$1', [stored.id])).rows[0];
  assert.deepEqual(actual, { status: 'accepted', stale: true, attempts: 1, reason_code: 'META_ACCEPTED_REVIEW_REQUIRED' });
  assert.equal(await claim(), null);
});

test('old accepted events use audit-only history and old pending events are not revived', async () => {
  const source = await fixture(90 * 86400, 80 * 86400);
  const initial = await historicalRow(source.initial), qualified = await historicalRow(source.qualified);
  const history = [current(source.initial), current(source.qualified)];
  for (const row of [initial, qualified]) {
    assert.equal(await rpc('meta_feedback_source_current_v1', [row.id]), true);
  }
  // Events are 80/90 days old, absent from both live delivery windows.
  await reconcile([], true, history);
  const accepted = await service('SELECT status,stale,attempts FROM public.meta_feedback_outbox ORDER BY event_name');
  assert(accepted.rows.every(row => row.status === 'accepted' && row.stale === false && row.attempts === 1));
  assert.deepEqual(await guard(), { blocked: false, reason_code: null,
    unknown: 0, accepted_stale: 0, expired_processing: 0 });
  assert.equal(await claim(), null);
  const fresh = await fixture();
  const freshStored = await enqueue(fresh.qualified);
  const freshClaim = await claim();
  assert.equal(freshClaim.id, freshStored.id);
  assert.equal(await preflight(freshClaim), true);
  await reset();
  const pendingSource = await fixture(90 * 86400, 80 * 86400);
  await historicalRow(pendingSource.initial, 'pending');
  // History is for audit only. It must not keep an old pending send alive.
  await reconcile([], true, [current(pendingSource.initial)]);
  const pending = (await service('SELECT status,attempts FROM public.meta_feedback_outbox')).rows[0];
  assert.deepEqual(pending, { status: 'cancelled', attempts: 0 });
  assert.equal(await claim(), null);
});

test('unknown delivery blocks a new identity key within the same target', async () => {
  const source = await fixture();
  const old = await enqueue(source.qualified), claimed = await claim();
  await finish(claimed, 'unknown', null, 'META_NETWORK_UNKNOWN');
  assert.deepEqual(await guard(), { blocked: true, reason_code: 'META_HISTORY_REVIEW_REQUIRED',
    unknown: 1, accepted_stale: 0, expired_processing: 0 });
  const changedIdentity = prepareMetaFeedback({ ...source.event, identity_key: hash('merged-identity:' + source.event.lead_id),
    event_name: 'qualified_lead' }, { target, mode: 'test' });
  assert.notEqual(changedIdentity.event_id, old.event_id);
  const rekeyed = await enqueue(changedIdentity);
  assert.equal(await claim(), null);
  const actual = (await service('SELECT status,attempts FROM public.meta_feedback_outbox WHERE id=$1', [rekeyed.id])).rows[0];
  assert.deepEqual(actual, { status: 'pending', attempts: 0 });
});

test('stale accepted proof blocks rekeyed identities without resending accepted events', async () => {
  const source = await fixture();
  await enqueue(source.qualified);
  const accepted = await claim();
  await finish(accepted, 'accepted', { events_received: 1, fbtrace_id: 'before_merge_trace' });
  const changedIdentity = prepareMetaFeedback({ ...source.event, identity_key: hash('merged:' + source.event.lead_id),
    event_name: 'qualified_lead' }, { target, mode: 'test' });
  const candidate = await enqueue(changedIdentity);
  await reconcile([current(changedIdentity)], true, [current(changedIdentity)]);
  const old = (await service('SELECT status,stale,attempts FROM public.meta_feedback_outbox WHERE id=$1', [accepted.id])).rows[0];
  assert.deepEqual(old, { status: 'accepted', stale: true, attempts: 1 });
  assert.deepEqual(await guard(), { blocked: true, reason_code: 'META_HISTORY_REVIEW_REQUIRED',
    unknown: 0, accepted_stale: 1, expired_processing: 0 });
  assert.equal(await claim(), null);
  const pending = (await service('SELECT status,attempts FROM public.meta_feedback_outbox WHERE id=$1', [candidate.id])).rows[0];
  assert.deepEqual(pending, { status: 'pending', attempts: 0 });
});

test('preflight blocks an active lease when unknown or stale accepted proof appears', async () => {
  for (const blockedStatus of ['unknown', 'accepted']) {
    await reset();
    const source = await fixture();
    await enqueue(source.initial);
    const earlier = await claim();
    await enqueue(source.qualified);
    const candidate = await claim();
    assert.equal(candidate.event_name, 'qualified_lead');
    assert.equal(await preflight(candidate), true);
    if (blockedStatus === 'unknown') {
      await finish(earlier, 'unknown', null, 'META_NETWORK_UNKNOWN');
    } else {
      await finish(earlier, 'accepted', { events_received: 1, fbtrace_id: 'preflight_trace' });
      await reconcile([current(source.qualified)], true, [current(source.qualified)]);
    }
    assert.equal(await preflight(candidate), false);
  }
});

test('dedup review interlock does not cross datasets or test/production mode', async () => {
  const source = await fixture();
  await enqueue(source.qualified);
  const original = await claim();
  await finish(original, 'unknown', null, 'META_NETWORK_UNKNOWN');
  const otherDataset = { ...target, dataset_id: '1575398160676199' };
  const otherRow = prepareMetaFeedback({ ...source.event, event_name: 'qualified_lead' }, { target: otherDataset, mode: 'test' });
  const productionRow = prepareMetaFeedback({ ...source.event, event_name: 'qualified_lead' }, { target, mode: 'production' });
  await enqueue(otherRow);
  await enqueue(productionRow);
  assert.equal((await guard(otherDataset, 'test')).blocked, false);
  assert.equal((await guard(target, 'production')).blocked, false);
  const otherClaim = await rpc('meta_feedback_claim_v1', [otherDataset, 'test', randomUUID()]);
  const productionClaim = await claim('production');
  assert.equal(otherClaim.dataset_id, otherDataset.dataset_id);
  assert.equal(productionClaim.mode, 'production');
  assert.equal(await preflight(otherClaim), true);
  assert.equal(await preflight(productionClaim), true);
  assert.equal(await claim(), null);
});

test('explicit changed accepted proof requires review without changing accepted status', async () => {
  const source = await fixture();
  await enqueue(source.qualified);
  const row = await claim();
  await finish(row, 'accepted', { events_received: 1, fbtrace_id: 'changed_proof_trace' });
  await reconcile([], false, [{ ...current(source.qualified), qualification_revision: 2 }]);
  const actual = (await service('SELECT status,stale,attempts FROM public.meta_feedback_outbox')).rows[0];
  assert.deepEqual(actual, { status: 'accepted', stale: true, attempts: 1 });
  assert.equal(await claim(), null);
});

test('reconciliation rejects malformed history and unqualified source remains cancelled', async () => {
  const source = await fixture();
  await enqueue(source.qualified);
  await rejectsCode(() => reconcile([{ event_id: source.qualified.event_id, context_hash: 'bad' }], true), '22023', 'META_CURRENT_INVALID');
  await rejectsCode(() => reconcile([current(source.qualified), current(source.qualified)], true), '22023', 'META_CURRENT_INVALID');
  await revoke(source.qualified);
  await reconcile([], true);
  assert.equal(await claim(), null);
  await rejectsCode(() => enqueue(source.qualified), '40001', 'META_QUALIFICATION_CHANGED');
});

(async () => {
  db = new PGlite();
  await db.exec(baselineSQL());
  await db.exec(migration);
  let passed = 0;
  for (const item of tests) {
    await reset();
    try { await item.run(); passed++; console.log('PASS ' + item.name); }
    catch (error) { console.error('FAIL ' + item.name + '\n' + error.stack); process.exitCode = 1; break; }
  }
  console.log(`${passed}/${tests.length} actual PostgreSQL tests passed (${path.relative(root, migrationPath)}; PGlite).`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (db) await db.close();
});
