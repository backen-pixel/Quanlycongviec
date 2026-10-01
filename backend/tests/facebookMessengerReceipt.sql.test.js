'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const sql = name => fs.readFileSync(path.resolve(__dirname, '../../database', name), 'utf8');
const page = '409741855550833';
const co = '991dc79d-cbf5-49f9-a364-35227cb47635';
// Sanitized schema-only snapshot provided by the runtime read; no production rows.
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/lead_attribution_runtime_schema.json'), 'utf8'));
const sections = Object.fromEntries(schema.map(section => [section.section, section.data]));
const attributionDDL = `CREATE TABLE public.lead_attribution (${[
  ...sections.columns.map(c => `"${c.name}" ${c.type}${c.default ? ' DEFAULT ' + c.default : ''}${c.nullable === 'NO' ? ' NOT NULL' : ''}`),
  ...sections.constraints.map(c => `CONSTRAINT "${c.name}" ${c.definition}`),
].join(',')});`;
const cid = '10000000-0000-4000-8000-000000000001';
const lid = '20000000-0000-4000-8000-000000000001';

test('receipt SQL and attribution use durable identities, leases and exact mapping', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE customers(id uuid PRIMARY KEY);
    INSERT INTO companies VALUES ('${co}');
    CREATE TABLE facebook_pages(page_id text PRIMARY KEY, default_company_id uuid, is_active boolean);
    CREATE TABLE crm_leads(id uuid PRIMARY KEY, company_id uuid, customer_id uuid);
    CREATE TABLE facebook_contacts(id uuid PRIMARY KEY, page_id text, lead_id uuid, customer_id uuid);
    CREATE TABLE app_settings(key text PRIMARY KEY, value jsonb);
    ${attributionDDL}
    CREATE UNIQUE INDEX lead_one ON lead_attribution(lead_id) WHERE lead_id IS NOT NULL;
    CREATE UNIQUE INDEX contact_pending ON lead_attribution(contact_id) WHERE contact_id IS NOT NULL AND lead_id IS NULL;
    INSERT INTO facebook_pages VALUES ('${page}','${co}',true);
    INSERT INTO facebook_contacts VALUES ('${cid}','${page}',NULL,NULL);
    INSERT INTO crm_leads VALUES ('${lid}','${co}',NULL);
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    -- Reproduce actual broad legacy ACL; the new migration must not widen it.
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON lead_attribution TO anon,authenticated,service_role;`);
  await db.exec(sql('640_facebook_messenger_receipts.sql'));
  await db.exec(sql('641_facebook_referral_attribution.sql'));
  const token1 = '30000000-0000-4000-8000-000000000001';
  const token2 = '30000000-0000-4000-8000-000000000002';
  let receipt;
  await t.test('one durable receipt for replay, active lease not reclaimed, stale completion fenced', async () => {
    await db.query("INSERT INTO facebook_messenger_receipts(event_key,page_id,payload) VALUES($1,$2,'{}') ON CONFLICT(event_key) DO NOTHING", ['event-a',page]);
    await db.query("INSERT INTO facebook_messenger_receipts(event_key,page_id,payload) VALUES($1,$2,'{}') ON CONFLICT(event_key) DO NOTHING", ['event-a',page]);
    assert.equal((await db.query('SELECT count(*)::int n FROM facebook_messenger_receipts')).rows[0].n,1);
    receipt=(await db.query('SELECT * FROM facebook_claim_receipt_v1($1,$2)',[[page],token1])).rows[0];
    assert.equal(receipt.status,'processing');
    assert.equal((await db.query('SELECT * FROM facebook_claim_receipt_v1($1,$2)',[[page],token2])).rows.length,0);
    await db.query("UPDATE facebook_messenger_receipts SET locked_until=now()-interval '1 second' WHERE id=$1",[receipt.id]);
    assert.equal((await db.query('SELECT * FROM facebook_claim_receipt_v1($1,$2)',[[page],token2])).rows[0].attempts,2);
    assert.equal((await db.query('SELECT facebook_finish_receipt_v1($1,$2,true) ok',[receipt.id,token1])).rows[0].ok,false);
    assert.equal((await db.query('SELECT facebook_finish_receipt_v1($1,$2,false) ok',[receipt.id,token2])).rows[0].ok,true);
    assert.equal((await db.query('SELECT * FROM facebook_claim_receipt_v1($1,$2)',[[page],token1])).rows.length,0);
  });
  const capture = (ad, key='a'.repeat(64)) => db.query('SELECT facebook_capture_referral_v1($1,$2,$3,$4)',[page,cid,JSON.stringify({ad_id:ad}),key]);
  await t.test('referral stored before Lead; replay one row and no guessed campaign', async () => {
    await capture('100'); await capture('100');
    const rows=(await db.query('SELECT * FROM lead_attribution')).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].lead_id,null); assert.equal(rows[0].fb_campaign_id,null);
    assert.equal(rows[0].fb_ad_id,'100'); assert.deepEqual(Object.keys(rows[0].raw.messenger_first_evidence).sort(),['ad_id','event_key','recorded_at']);
    assert.equal(rows[0].fb_ref,null);assert.equal(rows[0].fb_source,null);
  });
  await t.test('exact Page/company map fills campaign; different ad cannot overwrite first touch', async () => {
    await db.query('INSERT INTO app_settings VALUES($1,$2)', ['facebook_ad_campaign_mapping_v1',JSON.stringify({100:{page_id:page,company_id:co,campaign_id:'200',adset_id:'300',campaign_name:'Synthetic campaign'},101:{page_id:page,company_id:co,campaign_id:'201'}})]);
    await capture('100'); await capture('101','b'.repeat(64));
    const row=(await db.query('SELECT * FROM lead_attribution')).rows[0];
    assert.equal(row.fb_ad_id,'100'); assert.equal(row.fb_campaign_id,'200'); assert.equal(row.fb_adset_id,'300');
  });
  await t.test('later Lead link keeps one attribution and replay cannot duplicate', async () => {
    await db.query('UPDATE facebook_contacts SET lead_id=$1 WHERE id=$2',[lid,cid]);
    assert.equal((await db.query('SELECT facebook_link_attribution_v1($1,$2) ok',[page,cid])).rows[0].ok,true);
    await capture('100');
    const rows=(await db.query('SELECT * FROM lead_attribution')).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].lead_id,lid);
    await assert.rejects(()=>db.query('SELECT facebook_capture_referral_v1($1,$2,$3,$4)',['wrong-page',cid,'{}','c'.repeat(64)]),/contact\/page mismatch/);
  });
  await t.test('runtime NOT NULL/default/FK rules apply and null event keys fail closed', async () => {
    await assert.rejects(() => db.query('INSERT INTO lead_attribution(company_id) VALUES($1)',[co]), error => error.code === '23502');
    await assert.rejects(() => db.query("INSERT INTO lead_attribution(kenh,contact_id) VALUES('messenger',$1)",['99999999-0000-4000-8000-000000000001']), error => error.code === '23503');
    await assert.rejects(() => capture('100',null), /invalid evidence/);
    const row=(await db.query('SELECT cham_dau_luc,created_at,updated_at FROM lead_attribution WHERE contact_id=$1',[cid])).rows[0];
    assert.ok(row.cham_dau_luc && row.created_at && row.updated_at);
  });
  await t.test('new ad never inherits an unrelated legacy campaign and Lead customer wins stale contact', async () => {
    const c2='10000000-0000-4000-8000-000000000002';
    const l2='20000000-0000-4000-8000-000000000002';
    const customer1='40000000-0000-4000-8000-000000000001';
    const customer2='40000000-0000-4000-8000-000000000002';
    await db.query('INSERT INTO customers VALUES($1),($2)',[customer1,customer2]);
    await db.query('INSERT INTO facebook_contacts VALUES($1,$2,NULL,$3)',[c2,page,customer2]);
    await db.query("INSERT INTO lead_attribution(contact_id,company_id,kenh,fb_page_id,fb_campaign_id,fb_adset_id) VALUES($1,$2,'messenger',$3,'legacy-campaign','legacy-adset')",[c2,co,page]);
    await db.query('SELECT facebook_capture_referral_v1($1,$2,$3,$4)',[page,c2,JSON.stringify({ad_id:'101'}),'d'.repeat(64)]);
    let row=(await db.query('SELECT * FROM lead_attribution WHERE contact_id=$1',[c2])).rows[0];
    assert.equal(row.fb_ad_id,'101');assert.equal(row.fb_campaign_id,'201');assert.equal(row.fb_adset_id,null);
    await db.query('INSERT INTO crm_leads VALUES($1,$2,$3)',[l2,co,customer1]);
    await db.query('UPDATE facebook_contacts SET lead_id=$1 WHERE id=$2',[l2,c2]);
    await db.query('SELECT facebook_link_attribution_v1($1,$2)',[page,c2]);
    row=(await db.query('SELECT * FROM lead_attribution WHERE contact_id=$1',[c2])).rows[0];
    assert.equal(row.customer_id,customer1);
    await db.query('UPDATE crm_leads SET customer_id=$1 WHERE id=$2',[customer2,l2]);
    await db.query('SELECT facebook_capture_referral_v1($1,$2,$3,$4)',[page,c2,JSON.stringify({ad_id:'101'}),'d'.repeat(64)]);
    assert.equal((await db.query('SELECT customer_id FROM lead_attribution WHERE lead_id=$1',[l2])).rows[0].customer_id,customer2);
    await db.query('UPDATE facebook_pages SET is_active=false WHERE page_id=$1',[page]);
    await assert.rejects(()=>db.query('SELECT facebook_link_attribution_v1($1,$2)',[page,c2]),/Page company missing/);
    await db.query('UPDATE facebook_pages SET is_active=true WHERE page_id=$1',[page]);
  });
  await t.test('cross-company existing attribution prevents merge with transaction rollback', async () => {
    const c3='10000000-0000-4000-8000-000000000003';
    const l3='20000000-0000-4000-8000-000000000003';
    const otherCo='50000000-0000-4000-8000-000000000001';
    await db.query('INSERT INTO companies VALUES($1)',[otherCo]);
    await db.query('INSERT INTO crm_leads VALUES($1,$2,NULL)',[l3,co]);
    await db.query('INSERT INTO facebook_contacts VALUES($1,$2,$3,NULL)',[c3,page,l3]);
    await db.query("INSERT INTO lead_attribution(contact_id,lead_id,company_id,kenh,fb_page_id) VALUES($1,$2,$3,'messenger',$4),($1,NULL,$5,'messenger',$4)",[c3,l3,otherCo,page,co]);
    await assert.rejects(()=>db.query('SELECT facebook_link_attribution_v1($1,$2)',[page,c3]),/target company mismatch/);
    assert.equal((await db.query('SELECT count(*)::int n FROM lead_attribution WHERE contact_id=$1',[c3])).rows[0].n,2);
  });
  await t.test('legacy public attribution receives no free-form private referral content', async () => {
    await assert.rejects(()=>db.query('SELECT facebook_capture_referral_v1($1,$2,$3,$4)',[page,cid,JSON.stringify({ad_id:'100',ref:'SYNTHETIC_PRIVATE_REF'}),'e'.repeat(64)]),/numeric ad evidence only/);
    for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_table_privilege($1,'lead_attribution','SELECT') ok",[role])).rows[0].ok,true);
    const stored=JSON.stringify((await db.query('SELECT raw,fb_ref,fb_source FROM lead_attribution WHERE contact_id=$1',[cid])).rows);
    assert.equal(stored.includes('SYNTHETIC_PRIVATE_REF'),false);
  });
  await t.test('functions and raw receipt are not callable/readable by anon/authenticated', async () => {
    for(const role of ['anon','authenticated']) {
      assert.equal((await db.query("SELECT has_function_privilege($1,'facebook_capture_referral_v1(text,uuid,jsonb,text)','EXECUTE') ok",[role])).rows[0].ok,false);
      assert.equal((await db.query("SELECT has_table_privilege($1,'facebook_messenger_receipts','SELECT') ok",[role])).rows[0].ok,false);
    }
  });
});
