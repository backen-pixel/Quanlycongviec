'use strict';
// Local, synthetic PostgreSQL only. No credentials, ports, volumes, or production connections.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const name = `marketing-intake-test-${process.pid}`;
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const sql = (input, args = []) => execFileSync('docker', ['exec', '-i', name, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
  { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const company = '991dc79d-cbf5-49f9-a364-35227cb47635';
const tenant = '7d42e731-895b-4ba8-99d6-0005c4e23544';
const check = (condition) => sql(`DO $$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION 'assertion failed'; END IF; END $$;`);

test('PostgreSQL: atomic intake, permissions, migration replay, scoped repair and rollback', { timeout: 60000 }, async () => {
  docker(['run', '--rm', '-d', '--network', 'none', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:16-alpine']);
  try {
    let ready = false;
    // The entrypoint's temporary init server uses sockets only; wait for final TCP listener.
    for (let i = 0; i < 60; i++) {
      try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.equal(ready, true, 'Isolated PostgreSQL did not become ready');
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.companies(id uuid PRIMARY KEY, tenant_id uuid);
      CREATE TABLE public.customers(id uuid PRIMARY KEY);
      CREATE TABLE public.facebook_contacts(id uuid PRIMARY KEY);
      CREATE TABLE public.crm_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text,title text,description text,
        company_id uuid REFERENCES companies,customer_id uuid,assigned_to uuid,source_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),first_touch_time timestamptz,type text);
      INSERT INTO companies VALUES('${company}','${tenant}'),('29677f68-967e-4256-92fd-492bb580e888','${tenant}');
      INSERT INTO crm_leads(code,title,description,company_id,first_touch_time,type) VALUES
        ('LEAD-2026-1441','Synthetic TEST record','unchanged','${company}','2026-10-08','lead'),
        ('LEAD-2026-1442','Synthetic','campaign 23976669573 gclid','${company}',NULL,'lead'),
        ('LEAD-2026-1443','Synthetic','campaign 24315831726','${company}',NULL,'lead'),
        ('LEAD-2026-1441','Foreign TEST','unchanged','29677f68-967e-4256-92fd-492bb580e888',NULL,'lead');`);
    // Use the real existing attribution schema and indexes, not a hand-invented replacement.
    const schema = read('database/638_lead_attribution_quality_partner.sql');
    sql(schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS lead_attribution'), schema.indexOf('CREATE TABLE IF NOT EXISTS lead_quality_scores')));
    sql('ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY; ALTER TABLE lead_attribution ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE ON crm_leads,lead_attribution TO service_role;');
    const migration = read('database/714_marketing_intake.sql');
    sql(migration); sql(migration);
    check("(SELECT count(*) FROM crm_leads WHERE assigned_at IS NOT NULL)=0");
    assert.throws(() => sql('SET ROLE anon; SELECT * FROM lead_attribution;'));
    assert.throws(() => sql('SET ROLE authenticated; SELECT * FROM crm_leads;'));
    check("NOT has_function_privilege('anon','public.marketing_intake_guard()','EXECUTE')");
    sql(`SET ROLE service_role; INSERT INTO crm_leads(code,company_id,assigned_to,intake_attribution) VALUES
      ('new','${company}','11111111-1111-4111-8111-111111111111',
       '{"kenh":"website","platform":"google","campaign_id":"23976669573","gclid":"synthetic-click","gbraid":"gb"}');`);
    check("(SELECT count(*) FROM lead_attribution WHERE campaign_id='23976669573' AND fb_campaign_id IS NULL AND gclid='synthetic-click')=1");
    check("(SELECT assigned_at IS NOT NULL AND first_touch_time IS NULL FROM crm_leads WHERE code='new')");
    assert.throws(() => sql("UPDATE crm_leads SET intake_attribution='{}' WHERE code='new'"));
    assert.throws(() => sql(`INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES('invalid','${company}','{"kenh":"website","company_id":"foreign"}')`));
    // A downstream failure must roll back the lead insert too.
    sql("ALTER TABLE lead_attribution ADD CONSTRAINT reject_synthetic CHECK (campaign_id IS DISTINCT FROM 'fail')");
    assert.throws(() => sql(`INSERT INTO crm_leads(code,company_id,intake_attribution) VALUES('must-rollback','${company}','{"kenh":"website","campaign_id":"fail"}')`));
    check("NOT EXISTS(SELECT 1 FROM crm_leads WHERE code='must-rollback')");
    sql("ALTER TABLE lead_attribution DROP CONSTRAINT reject_synthetic");
    const before = sql("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM crm_leads l", ['-tA']).trim();
    const repair = read('database/repairs/marketing_20261008.sql');
    const rollback = read('database/repairs/marketing_20261008_rollback.sql');
    sql(repair); // Default dry-run: no mutations.
    assert.equal(sql("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM crm_leads l", ['-tA']).trim(), before);
    check("to_regclass('marketing_repair_private.repair_20261008') IS NULL");
    sql(repair, ['-v', 'apply=true']); sql(repair, ['-v', 'apply=true']);
    check("(SELECT count(*) FROM crm_leads WHERE is_test)=1");
    check("(SELECT count(*) FROM lead_attribution WHERE raw->>'repair'='marketing_20261008' AND gclid IS NULL)=2");
    check("(SELECT count(*) FROM marketing_repair_private.repair_20261008)=3");
    sql("UPDATE lead_attribution SET campaign_id='changed' WHERE raw->>'repair'='marketing_20261008' AND campaign_id='24315831726'");
    assert.throws(() => sql(rollback)); // Compare-and-set rollback must fail closed on drift.
    sql("UPDATE lead_attribution SET campaign_id='24315831726' WHERE raw->>'repair'='marketing_20261008' AND campaign_id='changed'");
    sql(rollback); sql(rollback);
    assert.equal(sql("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM crm_leads l", ['-tA']).trim(), before);
    sql(`UPDATE companies SET tenant_id='00000000-0000-4000-8000-000000000001' WHERE id='${company}'`);
    assert.throws(() => sql(repair, ['-v', 'apply=true']));
    sql(read('database/714_marketing_intake_rollback.sql'));
    check("(SELECT intake_attribution IS NOT NULL FROM crm_leads WHERE code='new')");
  } finally { docker(['rm', '-f', name]); }
});
