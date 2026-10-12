'use strict';
// Synthetic PostgreSQL only. Default: disposable Docker, no network/ports/volumes.
// Without Docker: VPT_SQL_TEST_ENGINE=pglite with @electric-sql/pglite@0.3.14
// supplied via NODE_PATH. PGlite is a local PostgreSQL WASM engine, not production.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const COMPANY = '00000000-0000-4000-8000-000000000722';

async function engine() {
  if (process.env.VPT_SQL_TEST_ENGINE === 'pglite') {
    const { PGlite } = require('@electric-sql/pglite');
    const db = new PGlite();
    return { exec: value => db.exec(value), rows: async value => (await db.query(value)).rows,
      close: () => db.close() };
  }
  const name = `tiktok-attribution-test-${process.pid}`;
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  docker(['run', '--rm', '-d', '--network', 'none', '--name', name,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  const close = async () => docker(['rm', '-f', name]);
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.equal(ready, true);
    const exec = async value => execFileSync('docker', ['exec', '-i', name, 'psql', '-h', '127.0.0.1',
      '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq'], { input: value, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { exec, rows: async query => JSON.parse((await exec(
      `SELECT coalesce(json_agg(row_to_json(r)),'[]'::json) FROM (${query}) r;`)).trim()), close };
  } catch (error) { await close(); throw error; }
}

test('PostgreSQL 722: structured TikTok receipts, bounded IDs, immutable history, replay and lossless rollback',
  { timeout: 60000 }, async () => {
    const db = await engine();
    const scalar = async query => Object.values((await db.rows(query))[0])[0];
    // PGlite retains SET ROLE between statements, unlike separate psql sessions.
    const denied = async sql => {
      try { await assert.rejects(db.exec(sql)); } finally { await db.exec('RESET ROLE; ROLLBACK;'); }
    };
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE companies(id uuid PRIMARY KEY);
        CREATE TABLE customers(id uuid PRIMARY KEY);
        CREATE TABLE facebook_contacts(id uuid PRIMARY KEY);
        CREATE TABLE crm_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text,
          company_id uuid REFERENCES companies, customer_id uuid, assigned_to uuid,
          created_at timestamptz NOT NULL DEFAULT now());
        INSERT INTO companies VALUES('${COMPANY}');`);
      const schema = read('database/638_lead_attribution_quality_partner.sql');
      await db.exec(schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS lead_attribution'),
        schema.indexOf('CREATE TABLE IF NOT EXISTS lead_quality_scores')));
      await db.exec(`ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
        ALTER TABLE lead_attribution ENABLE ROW LEVEL SECURITY;
        GRANT SELECT, INSERT, UPDATE ON crm_leads,lead_attribution TO service_role;`);
      await db.exec(read('database/717_marketing_intake.sql'));
      await db.exec(read('database/718_web_conversion_events.sql'));
      await db.exec(`SET ROLE service_role;
        INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES
        ('legacy','${COMPANY}','{"kenh":"website","platform":"google","gclid":"original"}'); RESET ROLE;`);
      const legacy = await db.rows("SELECT intake_attribution FROM crm_leads WHERE code='legacy'");
      const migration = read('database/722_tiktok_attribution_receipt.sql');
      await db.exec(migration); await db.exec(migration);
      assert.deepEqual(await db.rows("SELECT intake_attribution FROM crm_leads WHERE code='legacy'"), legacy);
      await db.exec(`SET ROLE service_role;
        INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES ('tiktok','${COMPANY}',
          '{"kenh":"website","platform":"tiktok","utm_source":"tiktok","utm_medium":"paid","ttclid":"synthetic-click-722"}');
        RESET ROLE;`);
      const receipt = (await db.rows("SELECT intake_attribution FROM crm_leads WHERE code='tiktok'"))[0].intake_attribution;
      assert.equal(receipt.ttclid, 'synthetic-click-722');
      const projection = (await db.rows("SELECT ttclid,utm_source,utm_medium FROM lead_attribution WHERE ttclid='synthetic-click-722'"))[0];
      assert.deepEqual(projection, { ttclid: 'synthetic-click-722', utm_source: 'tiktok', utm_medium: 'paid' });
      await denied("UPDATE crm_leads SET intake_attribution='{}' WHERE code='tiktok'");
      await denied(`INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES ('bad-id','${COMPANY}',
        jsonb_build_object('kenh','website','ttclid',repeat('x',513)))`);
      await denied(`INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES ('bad-scope','${COMPANY}',
        '{"kenh":"website","company_id":"foreign","ttclid":"x"}')`);
      assert.equal(Number(await scalar("SELECT count(*) FROM crm_leads WHERE code IN ('bad-id','bad-scope')")), 0);
      await db.exec("ALTER TABLE lead_attribution ADD CONSTRAINT reject_test_click CHECK (ttclid IS DISTINCT FROM 'reject-me')");
      await denied(`INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES ('atomic-fail','${COMPANY}',
        '{"kenh":"website","ttclid":"reject-me"}')`);
      assert.equal(Number(await scalar("SELECT count(*) FROM crm_leads WHERE code='atomic-fail'")), 0);
      const click = `INSERT INTO web_conversion_events(company_id,kind,session_key,ttclid,utm_source)
        VALUES('${COMPANY}','zalo','synthetic-session-722','synthetic-click-722','vpt_test')
        ON CONFLICT(company_id,session_key,kind) DO NOTHING;`;
      await db.exec(`SET ROLE service_role; ${click} ${click} RESET ROLE;`);
      assert.deepEqual(await db.rows('SELECT ttclid,utm_source FROM web_conversion_events'),
        [{ ttclid: 'synthetic-click-722', utm_source: 'vpt_test' }]);
      await denied('SET ROLE anon; SELECT ttclid FROM web_conversion_events');
      await denied('SET ROLE authenticated; SELECT ttclid FROM lead_attribution');
      assert.equal(await scalar("SELECT has_function_privilege('anon','public.marketing_intake_guard()','EXECUTE')"), false);
      assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.marketing_intake_project()','EXECUTE')"), false);
      // Roll back writers first. SQL rollback preserves already stored receipts and click IDs.
      const rollback = read('database/722_tiktok_attribution_receipt_rollback.sql');
      await db.exec(rollback); await db.exec(rollback);
      assert.deepEqual((await db.rows("SELECT intake_attribution FROM crm_leads WHERE code='tiktok'"))[0].intake_attribution, receipt);
      assert.equal(await scalar("SELECT ttclid FROM lead_attribution WHERE ttclid='synthetic-click-722'"), 'synthetic-click-722');
      await db.exec(`INSERT INTO crm_leads(code,company_id,intake_attribution)
        VALUES('legacy-after','${COMPANY}','{"kenh":"website","platform":"google","gclid":"legacy-after"}')`);
      assert.equal(Number(await scalar("SELECT count(*) FROM lead_attribution WHERE gclid='legacy-after'")), 1);
      await denied(`INSERT INTO crm_leads(code,company_id,intake_attribution)
        VALUES('disabled-new','${COMPANY}','{"kenh":"website","ttclid":"disabled"}')`);
    } finally { await db.close(); }
  });
