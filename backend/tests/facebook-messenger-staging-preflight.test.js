'use strict';

// Isolated PostgreSQL catalog integration; never uses an application DB URL.
// PGLITE_TEST_MODULE=/absolute/path/to/@electric-sql/pglite node <this file>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, main, parseTarget, sanitizedError } = require('../scripts/verify-messenger-staging-schema');
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function run() {
  const base = { VPT_MESSENGER_PREFLIGHT_ENV: 'staging', VPT_MESSENGER_PREFLIGHT_TARGET: 'stage.invalid:6543/postgres',
    VPT_MESSENGER_PREFLIGHT_URL: 'postgres://readonly:DO_NOT_PRINT@stage.invalid:6543/postgres?sslmode=verify-full' };
  let connections = 0;
  class NeverConnect { constructor() { connections++; throw new Error('Should not connect'); } }
  for (const patch of [
    { VPT_MESSENGER_PREFLIGHT_ENV: '' },
    { VPT_MESSENGER_PREFLIGHT_TARGET: 'production.invalid:6543/postgres' },
    { VPT_MESSENGER_PREFLIGHT_URL: base.VPT_MESSENGER_PREFLIGHT_URL + '&options=-cdefault_transaction_read_only=off' },
    { VPT_MESSENGER_PREFLIGHT_URL: base.VPT_MESSENGER_PREFLIGHT_URL.replace('verify-full', 'disable') },
    { VPT_MESSENGER_PREFLIGHT_URL: base.VPT_MESSENGER_PREFLIGHT_URL + '&host=production.invalid' },
    { VPT_MESSENGER_PREFLIGHT_URL: base.VPT_MESSENGER_PREFLIGHT_URL.replace('DO_NOT_PRINT', '%E0%A4%A') },
    { VPT_MESSENGER_PREFLIGHT_URL: base.VPT_MESSENGER_PREFLIGHT_URL.replace('/postgres?', '/%E0%A4%A?'),
      VPT_MESSENGER_PREFLIGHT_TARGET: 'stage.invalid:6543/%E0%A4%A' },
  ]) {
    const result = await main({ ...base, ...patch }, NeverConnect);
    check(result.catalog_status === 'unknown' && !/DO_NOT_PRINT|stage\.invalid|%E0%A4%A/.test(JSON.stringify(result)), 'invalid configuration redacted');
  }
  check(connections === 0, 'all refusal paths happen before connecting');
  const parsed = parseTarget(base);
  check(parsed.ssl.rejectUnauthorized && parsed.options.includes('default_transaction_read_only=on'), 'TLS and read-only startup');
  check(JSON.stringify(sanitizedError({ code: '42501', message: base.VPT_MESSENGER_PREFLIGHT_URL,
    detail: 'DO_NOT_PRINT', safeCode: 'DO_NOT_PRINT' })) ===
    '{"scope":"catalog_preflight_only","catalog_status":"unknown","automation_ready":false,"error":"catalog_inspection_failed","sqlstate":"42501"}',
  'server error details, URL, credentials and untrusted safeCode are never emitted');
  const attempted = [];
  await assert.rejects(inspect({ query: async (sql) => { attempted.push(sql); if (sql.includes('SELECT c.relname')) throw { code: '42501' }; return { rows: [] }; } }));
  check(attempted[0] === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' && attempted.at(-1) === 'ROLLBACK',
    'read-only transaction rolls back after catalog read failure');

  const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE facebook_contacts(id UUID PRIMARY KEY, page_id TEXT, lead_id UUID, customer_id UUID);
      CREATE TABLE facebook_messages(id UUID PRIMARY KEY, contact_id UUID, direction TEXT, created_at TIMESTAMPTZ);
      CREATE TABLE crm_leads(id UUID PRIMARY KEY, customer_id UUID, company_id UUID, source_id UUID);
      CREATE TABLE customers(id UUID PRIMARY KEY);`);
    const migration = async (name) => db.exec(fs.readFileSync(path.join(__dirname, '../../database', name), 'utf8'));
    await migration('591_facebook_messenger_campaign_phone_attribution.sql');
    await migration('636_facebook_messenger_campaign_attribution_hardening.sql');
    await migration('637_facebook_messenger_webhook_receipts.sql');
    await migration('639_facebook_messenger_verified_daily_attribution.sql');
    const statements = [];
    const client = { query: async (sql, values) => {
      statements.push(sql);
      if (/^SELECT/.test(sql)) {
        check((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only === 'on', 'every catalog query is read-only');
      }
      return db.query(sql, values);
    } };
    let result = await inspect(client);
    const failed = result.checks.filter((c) => c.status !== 'pass');
    assert.deepEqual(failed, [], JSON.stringify(failed)); passed++;
    check(result.catalog_status === 'pass' && result.automation_ready === false && result.crm_acceptance_verified === false
      && result.staging_acceptance_verified === false, 'catalog pass cannot promote acceptance');
    check(!JSON.stringify(result).includes('DO_NOT_PRINT') && !JSON.stringify(result).includes('BEGIN\n'), 'no function bodies in report');
    check(statements.filter((s) => /^SELECT/.test(s)).every((s) => !/FROM public\./i.test(s)), 'queries only read catalogs');
    const failure = (r, id) => r.checks.some((c) => c.id === id && c.status === 'fail');
    // Detect inherited privileges, not only direct grants.
    await db.exec('CREATE ROLE unintended_reader; GRANT SELECT ON facebook_messenger_webhook_receipts TO unintended_reader; GRANT unintended_reader TO authenticated;');
    result = await inspect(db);
    check(failure(result, 'table:facebook_messenger_webhook_receipts:authenticated:access'), 'inherited table access detected');
    await db.exec('REVOKE unintended_reader FROM authenticated;');
    await db.exec('GRANT EXECUTE ON FUNCTION fb_campaign_phone_attribution_capabilities() TO PUBLIC;');
    result = await inspect(db);
    check(failure(result, 'function:fb_campaign_phone_attribution_capabilities:public_execute'), 'PUBLIC execution detected');
    await db.exec('REVOKE EXECUTE ON FUNCTION fb_campaign_phone_attribution_capabilities() FROM PUBLIC;');
    // An old schema can have a new capability probe. Body fingerprint catches it without executing a probe.
    await migration('636_facebook_messenger_campaign_attribution_hardening.sql');
    result = await inspect(db);
    check(failure(result, 'function:fb_campaign_phone_numbers_in_range:body_sha256'), 'old report implementation cannot pass on a new capability probe');
    await migration('639_facebook_messenger_verified_daily_attribution.sql');
    // A malicious function with a harmless-looking name must never execute.
    await db.exec(`CREATE TABLE do_not_touch(id INTEGER);
      CREATE OR REPLACE FUNCTION fb_campaign_phone_attribution_capabilities() RETURNS JSONB LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO do_not_touch VALUES (1); RETURN '{}'::jsonb; END; $$;`);
    result = await inspect(db);
    check(failure(result, 'function:fb_campaign_phone_attribution_capabilities:body_sha256'), 'changed application RPC is flagged without invoking it');
    check((await db.query('SELECT count(*)::INTEGER AS n FROM do_not_touch')).rows[0].n === 0, 'application RPC never executes');
    await db.exec('ALTER TABLE facebook_messages DISABLE TRIGGER guard_verified_facebook_message_write; DROP INDEX idx_fb_messenger_receipt_one_processing;');
    result = await inspect(db);
    check(failure(result, 'verified_message_trigger') && failure(result, 'one_conversation_lease_index'), 'disabled evidence trigger and missing uniqueness guard detected');
    await db.exec('ALTER TABLE facebook_messenger_webhook_receipts DROP COLUMN last_error;');
    result = await inspect(db);
    check(failure(result, 'column:facebook_messenger_webhook_receipts.last_error'), 'missing required column is fail, not zero or unknown');
    console.log(JSON.stringify({ passed, scope: 'isolated catalog preflight tests; no staging connection' }));
  } finally { await db.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
