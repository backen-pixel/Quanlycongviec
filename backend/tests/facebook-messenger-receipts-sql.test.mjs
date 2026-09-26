import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const table = 'public.facebook_messenger_webhook_receipts';
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed++; };
const key = n => n.toString(16).padStart(64, '0');
const sql = await readFile(new URL('../../database/637_facebook_messenger_webhook_receipts.sql', import.meta.url), 'utf8');
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
await db.exec(sql);
await db.exec(sql);
passed++;
const add = async (n, page, partner, ts, status = 'pending', attempts = 0) => db.query(
  `INSERT INTO ${table}(receipt_key,page_id,partner_psid,event,event_timestamp_ms,status,attempts)
   VALUES ($1,$2,$3,'{"message":{"text":"synthetic_test"}}',$4,$5,$6)
   ON CONFLICT(receipt_key) DO NOTHING`, [key(n), page, partner, ts, status, attempts]);
const claim = async (pages = ['P1'], limit = 10) => (await db.query(
  'SELECT * FROM public.facebook_messenger_receipts_claim($1,180,$2)', [limit, pages])).rows;
const rpc = async (name, args) => (await db.query(
  `SELECT public.facebook_messenger_receipts_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`, args)).rows[0].result;

await add(2, 'P1', 'A', 200);
await add(1, 'P1', 'A', 100);
await add(3, 'P1', 'B', 150);
await add(4, 'P2', 'C', 50);
await add(1, 'P1', 'A', 100);
check(Number((await db.query(`SELECT COUNT(*) n FROM ${table}`)).rows[0].n) === 4, 'duplicate ignored');
check((await claim([])).length === 0, 'empty Page scope claims nothing');
const initial = await claim();
check(initial.length === 2, 'claims one event per conversation');
check(initial.map(r=>r.receipt_key).join(',') === [key(1),key(3)].join(','), 'timestamp order and Page scope');
check(initial.every(r=>r.attempts === 1 && r.status === 'processing'), 'attempt count and status');
check((await claim()).length === 0, 'active leases block further claims');
const stale = '00000000-0000-0000-0000-000000000000';
for (const [name,args] of [['finish',[key(1),stale]],['fail',[key(1),stale,'test']],['renew',[key(1),stale,180]]]) {
  check(await rpc(name,args) === false, `${name} rejects wrong token`);
}
check(await rpc('renew',[key(1),initial[0].lease_token,180]) === true, 'current token renews');
check(await rpc('finish',[key(1),initial[0].lease_token]) === true, 'current token finishes');
const done = (await db.query(`SELECT * FROM ${table} WHERE receipt_key=$1`,[key(1)])).rows[0];
check(done.status === 'done' && Object.keys(done.event).length === 0 && done.lease_token === null && done.completed_at, 'finish scrubs payload and lease');
check(await rpc('finish',[key(1),initial[0].lease_token]) === false, 'duplicate finish not accepted');
const next = await claim();
check(next.length === 1 && next[0].receipt_key === key(2), 'next event starts after previous done');

await db.query(`UPDATE ${table} SET lease_until=clock_timestamp()-interval '1 second' WHERE receipt_key=$1`,[key(2)]);
for (const [name,args] of [['finish',[key(2),next[0].lease_token]],['fail',[key(2),next[0].lease_token,'test']],['renew',[key(2),next[0].lease_token,180]]]) {
  check(await rpc(name,args) === false, `${name} rejects expired token`);
}
// Late arrival older than the crashed in-flight event must not deadlock recovery.
await add(5, 'P1', 'A', 175);
const reclaimed = await claim();
check(reclaimed.length === 1 && reclaimed[0].receipt_key === key(2) && reclaimed[0].attempts === 2, 'expired receipt reclaimed ahead of late earlier event');
check(reclaimed[0].lease_token !== next[0].lease_token, 'reclaim replaces lease token');
check(await rpc('finish',[key(2),next[0].lease_token]) === false, 'old worker cannot finish reclaimed event');
check(await rpc('fail',[key(2),reclaimed[0].lease_token,'synthetic_failure']) === true, 'current failure accepted');
const backoff = (await db.query(`SELECT *,available_at>clock_timestamp() future FROM ${table} WHERE receipt_key=$1`,[key(2)])).rows[0];
check(backoff.status === 'pending' && backoff.future && backoff.lease_token === null, 'retry backoff applied');
// The late older event is now earliest and may run; after it completes, backoff blocks its successor.
const older = await claim();
check(older.length === 1 && older[0].receipt_key === key(5), 'late older pending event orders before later retry');
await rpc('finish',[key(5),older[0].lease_token]);
await add(6, 'P1', 'A', 300);
check((await claim()).length === 0, 'pending backoff blocks later conversation events');
await db.query(`UPDATE ${table} SET available_at=clock_timestamp()-interval '1 second',attempts=7 WHERE receipt_key=$1`,[key(2)]);
const eighth = await claim();
check(eighth[0].attempts === 8, 'eighth attempt allowed');
await db.query(`UPDATE ${table} SET lease_until=clock_timestamp()-interval '1 second' WHERE receipt_key=$1`,[key(2)]);
const afterCrash = await claim();
check((await db.query(`SELECT status FROM ${table} WHERE receipt_key=$1`,[key(2)])).rows[0].status === 'dead', 'crash after attempt eight becomes dead');
check(afterCrash.length === 1 && afterCrash[0].receipt_key === key(6), 'dead receipt exposes later events while health blocks readiness');
const health = (await db.query('SELECT * FROM public.facebook_messenger_receipts_health($1)',[['P1']])).rows[0];
check(Number(health.dead_count) === 1 && Number(health.processing_count) === 2 && Number(health.pending_count) === 0, 'scoped health truthful');
const otherHealth = (await db.query('SELECT * FROM public.facebook_messenger_receipts_health($1)',[['P2']])).rows[0];
check(Number(otherHealth.pending_count) === 1 && Number(otherHealth.processing_count) === 0, 'health excludes unrelated Pages');

// ACL and RLS check with actual roles, not merely matching migration text.
const acl = (await db.query(`SELECT
  has_table_privilege('anon','${table}','SELECT') AS anon_read,
  has_table_privilege('authenticated','${table}','INSERT') AS user_insert,
  has_function_privilege('anon','public.facebook_messenger_receipts_claim(integer,integer,text[])','EXECUTE') AS anon_claim,
  has_function_privilege('authenticated','public.facebook_messenger_receipts_health(text[])','EXECUTE') AS user_health,
  has_function_privilege('service_role','public.facebook_messenger_receipts_claim(integer,integer,text[])','EXECUTE') AS service_claim,
  (SELECT relrowsecurity FROM pg_class WHERE oid='${table}'::regclass) AS rls`)).rows[0];
check(!acl.anon_read && !acl.user_insert && !acl.anon_claim && !acl.user_health && acl.service_claim && acl.rls, 'role grants and RLS correct');
await db.exec('SET ROLE anon');
await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/); passed++;
await assert.rejects(db.query('SELECT * FROM public.facebook_messenger_receipts_health(NULL)'), /permission denied/); passed++;
await db.exec('RESET ROLE; SET ROLE service_role');
check((await db.query('SELECT * FROM public.facebook_messenger_receipts_health($1)',[['P1']])).rows.length === 1, 'service-role RPC works');
await db.exec('RESET ROLE');
await assert.rejects(db.query('SELECT * FROM public.facebook_messenger_receipts_claim(101,180,NULL)'), /Invalid receipt claim limits/); passed++;
await assert.rejects(db.query(`UPDATE ${table} SET status='processing',completed_at=NULL,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute' WHERE receipt_key=$1`,[key(5)]), /duplicate key/); passed++;
await db.exec(`CREATE TABLE public.facebook_ad_campaign_mappings (
  fb_ad_id text PRIMARY KEY, ad_account_id text NOT NULL, page_id text NOT NULL,
  campaign_id text NOT NULL, campaign_name text, updated_at timestamptz DEFAULT now()
)`);
const mappingSql = await readFile(new URL('../../database/638_vpt_messenger_ab_campaign_mappings.sql', import.meta.url), 'utf8');
await db.exec(mappingSql);
await db.exec(mappingSql);
check(Number((await db.query('SELECT count(*) n FROM public.facebook_ad_campaign_mappings')).rows[0].n) === 3, 'three A/B/control mappings are idempotent');
check(Number((await db.query("SELECT count(*) n FROM public.facebook_ad_campaign_mappings WHERE campaign_id='120251591865910435' AND page_id='409741855550833' AND ad_account_id='835757498658305'")).rows[0].n) === 3, 'all mappings use authorised Page account and campaign');
await db.exec("UPDATE public.facebook_ad_campaign_mappings SET page_id='other-page' WHERE fb_ad_id='120251592173560435'");
await assert.rejects(db.exec(mappingSql), /conflicts with another Page or account/); passed++;
await db.exec('ROLLBACK');
const version = (await db.query('SHOW server_version')).rows[0].server_version;
console.log(JSON.stringify({result:'PASS',assertions:passed,postgres:version,scope:'isolated PGlite; real multi-connection concurrency and production schema not exercised'}));
await db.close();
