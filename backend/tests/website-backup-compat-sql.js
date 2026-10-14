'use strict';

// Replica compatibility only. Actual isolated PostgreSQL, no network or live DB.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const sql = fs.readFileSync(path.resolve(__dirname, '../../database/20261014022725_website_intake_backup_compat.sql'), 'utf8');
const A = '11111111-1111-4111-8111-111111111111';
const oldId = '22222222-2222-4222-8222-222222222222';
const primaryId = '33333333-3333-4333-8333-333333333333';
const metadata = { version: 1, request_id: '44444444-4444-4444-8444-444444444444',
  form_id: '11116', site_host: 'vanphuthanh.net', submitted_at: '2026-10-14T02:00:00.123Z',
  landing_url: 'https://vanphuthanh.net/tu-bep/', captured_at: null, fbc: null, fbp: null,
  measurement_consent: false, consent_version: 'VPT_ADS_V1', api_key_fingerprint: 'a'.repeat(64) };
const tests = [];
const test = (name, run) => tests.push({ name, run });
async function create(extraColumn = '') {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE TABLE public.crm_leads(id uuid PRIMARY KEY,code text UNIQUE,company_id uuid NOT NULL,
      type text NOT NULL DEFAULT 'lead',created_at timestamptz NOT NULL,description text ${extraColumn});
    ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.crm_leads FROM PUBLIC,anon;
    GRANT SELECT,INSERT,UPDATE ON public.crm_leads TO authenticated,service_role;`);
  await db.query(`INSERT INTO public.crm_leads(id,code,company_id,created_at,description)
    VALUES($1,'TEST-REPLICA-1',$2,'2020-01-01T00:00:00Z','existing replica')`, [oldId, A]);
  return db;
}
async function schema(db) {
  await db.exec('RESET ROLE');
  return (await db.query(`SELECT c.relrowsecurity,c.relacl::text AS acl,
    (SELECT count(*)::int FROM pg_policy WHERE polrelid=c.oid) policies,
    (SELECT count(*)::int FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) triggers,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_any,
    has_table_privilege('authenticated',c.oid,'INSERT,UPDATE') authenticated_write,
    has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE') service_write
    FROM pg_class c WHERE c.oid='public.crm_leads'::regclass`)).rows[0];
}
async function noMeasurementObjects(db) {
  const row = (await db.query(`SELECT
    to_regclass('public.website_intake_receipts') IS NULL AS no_receipts,
    to_regclass('public.website_feedback_outbox') IS NULL AS no_outbox,
    to_regclass('public.website_feedback_attempts') IS NULL AS no_attempts,
    (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND (proname LIKE 'web_feedback_%' OR proname LIKE 'website_intake_%')) AS rpc_count`)).rows[0];
  assert.deepEqual(row, { no_receipts: true, no_outbox: true, no_attempts: true, rpc_count: 0 });
}
async function withDB(extraColumn, run) {
  const db = await create(extraColumn);
  try { await run(db); } finally { await db.close(); }
}

test('old replica rows remain NULL with no backfill, new trigger or measuring objects', async () => {
  await withDB('', async db => {
    const before = (await db.query('SELECT * FROM public.crm_leads')).rows;
    await db.exec(sql);
    const after = (await db.query('SELECT * FROM public.crm_leads')).rows;
    assert.deepEqual(after, before.map(row => ({ ...row, website_intake: null })));
    const column = (await db.query(`SELECT data_type,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='crm_leads' AND column_name='website_intake'`)).rows[0];
    assert.deepEqual(column, { data_type: 'jsonb', is_nullable: 'YES', column_default: null });
    assert.equal((await schema(db)).triggers, 0);
    await noMeasurementObjects(db);
  });
});

test('full-row mirror upsert and code-remapped patch preserve original metadata without primary receipt rules', async () => {
  await withDB('', async db => {
    await db.exec(sql); await db.exec('SET ROLE service_role');
    // The existing replica UUID and created_at may differ from primary. The real
    // replicator removes primary id/created_at before this code-matched patch.
    await db.query('UPDATE public.crm_leads SET website_intake=$1,description=$2 WHERE id=$3',
      [JSON.stringify(metadata), 'mirrored primary row', oldId]);
    const patched = (await db.query('SELECT id,created_at,website_intake FROM public.crm_leads WHERE id=$1', [oldId])).rows[0];
    assert.equal(patched.id, oldId);
    assert.equal(new Date(patched.created_at).toISOString(), '2020-01-01T00:00:00.000Z');
    assert.deepEqual(patched.website_intake, metadata);
    await db.query(`INSERT INTO public.crm_leads(id,code,company_id,created_at,website_intake)
      VALUES($1,'TEST-REPLICA-2',$2,'2026-10-14T02:00:01Z',$3)
      ON CONFLICT(id) DO UPDATE SET website_intake=EXCLUDED.website_intake`, [primaryId, A, JSON.stringify(metadata)]);
    await db.query(`INSERT INTO public.crm_leads(id,code,company_id,created_at,website_intake)
      VALUES($1,'TEST-REPLICA-2',$2,'2026-10-14T02:00:01Z',$3)
      ON CONFLICT(id) DO UPDATE SET website_intake=EXCLUDED.website_intake`, [primaryId, A, JSON.stringify(metadata)]);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.crm_leads')).rows[0].n, 2);
    assert.deepEqual((await db.query('SELECT website_intake FROM public.crm_leads WHERE id=$1', [primaryId])).rows[0].website_intake, metadata);
    await db.exec('RESET ROLE'); await noMeasurementObjects(db);
  });
});

test('RLS and ACL remain exactly unchanged; authenticated grant still grants no rows without policies', async () => {
  await withDB('', async db => {
    const before = await schema(db); await db.exec(sql);
    assert.deepEqual(await schema(db), before);
    assert.equal(before.relrowsecurity, true); assert.equal(before.anon_any, false);
    assert.equal(before.authenticated_write, true); assert.equal(before.policies, 0);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.crm_leads')).rows[0].n, 0);
    assert.equal((await db.query('UPDATE public.crm_leads SET website_intake=$1 WHERE id=$2 RETURNING id',
      [JSON.stringify(metadata), oldId])).rows.length, 0);
    await db.exec('SET ROLE anon');
    await assert.rejects(() => db.query('SELECT website_intake FROM public.crm_leads'), error => error.code === '42501');
    await db.exec('SET ROLE service_role');
    assert.equal((await db.query('SELECT website_intake FROM public.crm_leads')).rows[0].website_intake, null);
  });
});

test('migration is idempotent and cannot overwrite an already mirrored snapshot', async () => {
  await withDB('', async db => {
    await db.exec(sql);
    await db.query('UPDATE public.crm_leads SET website_intake=$1 WHERE id=$2', [JSON.stringify(metadata), oldId]);
    const before = (await db.query('SELECT * FROM public.crm_leads')).rows;
    const beforeSchema = await schema(db);
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM public.crm_leads')).rows, before);
    assert.deepEqual(await schema(db), beforeSchema);
    await noMeasurementObjects(db);
  });
});

test('incompatible existing type, NOT NULL or default atomically rejects without casting rows or changing ACL', async () => {
  for (const definition of [",website_intake text DEFAULT 'untouched'",
    ",website_intake jsonb NOT NULL DEFAULT '{}'::jsonb", ",website_intake jsonb DEFAULT '{}'::jsonb"]) {
    await withDB(definition, async db => {
      const before = (await db.query('SELECT * FROM public.crm_leads')).rows, beforeSchema = await schema(db);
      await assert.rejects(() => db.exec(sql), /BACKUP_WEBSITE_INTAKE_SCHEMA_MISMATCH/);
      await db.exec('ROLLBACK');
      assert.deepEqual((await db.query('SELECT * FROM public.crm_leads')).rows, before);
      assert.deepEqual(await schema(db), beforeSchema);
      await noMeasurementObjects(db);
    });
  }
});

(async () => {
  let passed = 0;
  for (const item of tests) {
    try { await item.run(); passed++; console.log('PASS ' + item.name); }
    catch (error) { console.error('FAIL ' + item.name + '\n' + error.stack); process.exitCode = 1; break; }
  }
  console.log(`${passed}/${tests.length} actual PostgreSQL backup compatibility tests passed (PGlite).`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
