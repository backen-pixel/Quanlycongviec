'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dsn=process.env.MARKETING_SPEND_TEST_DATABASE_URL;
test('isolated PostgreSQL spend snapshots: scope, concurrent runs and atomic publication',{skip:!dsn},async t=>{
 const u=new URL(dsn);assert.ok(['localhost','127.0.0.1','[::1]'].includes(u.hostname));assert.equal(u.pathname,'/marketing_spend_test');
 const {Client}=require('pg'),db=new Client({connectionString:dsn}),peers=[];
 await db.connect();
 const company='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
 try {
  assert.equal((await db.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n,0,'Requires fresh isolated database');
  await db.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE TABLE public.companies(id uuid PRIMARY KEY); CREATE TABLE public.fb_ad_accounts(ad_account_id text PRIMARY KEY,company_id uuid,bat boolean,token_het_han timestamptz);');
  await db.query('INSERT INTO companies VALUES($1),($2)',[company,other]);
  await db.query("INSERT INTO fb_ad_accounts VALUES('act_123',$1,true,NULL),('act_456',$2,true,NULL)",[company,other]);
  const sql=fs.readFileSync(path.resolve(__dirname,'../../database/649_marketing_spend_evidence.sql'),'utf8');await db.query(sql);await db.query(sql);
  for(let i=0;i<4;i++){const c=new Client({connectionString:dsn});await c.connect();await c.query('SET ROLE service_role');peers.push(c)}
  const start=(c=peers[0],cid=company)=>c.query("SELECT marketing_spend_begin('act_123',$1,'2020-10-01','2020-10-02') AS r",[cid]).then(x=>x.rows[0].r);
  const snapshot={accountId:'act_123',currency:'VND',timezone:'Asia/Ho_Chi_Minh',source:'META_ACCOUNT_INSIGHTS_V1',since:'2020-10-01',until:'2020-10-02',totalVnd:500000,days:[{date:'2020-10-01',amountVnd:500000},{date:'2020-10-02',amountVnd:0}]};
  const finish=(id,s=snapshot,cid=company,c=peers[0])=>c.query('SELECT marketing_spend_finish($1,$2,$3,NULL) AS r',[id,cid,s]).then(x=>x.rows[0].r);
  await t.test('public roles cannot read or write evidence or invoke privileged RPC',async()=>{
   for(const role of ['anon','authenticated']){await db.query('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM marketing_spend_sync_runs'),e=>e.code==='42501');await assert.rejects(start(db),e=>e.code==='42501');await db.query('RESET ROLE');}
   await db.query('GRANT SELECT ON marketing_spend_sync_runs TO authenticated');await db.query('SET ROLE authenticated');assert.equal((await db.query('SELECT * FROM marketing_spend_sync_runs')).rowCount,0);await db.query('RESET ROLE');await db.query('REVOKE SELECT ON marketing_spend_sync_runs FROM authenticated');
  });
  await t.test('wrong or missing company cannot create or publish evidence',async()=>{
   await assert.rejects(start(peers[0],other),e=>e.code==='42501');await assert.rejects(start(peers[0],null),e=>e.code==='22023');
   const r=await start();await assert.rejects(finish(r.id,snapshot,other),e=>e.code==='42501');
  });
  await t.test('atomic validated publication; retries do not duplicate days',async()=>{
   const r=await start();const done=await finish(r.id);assert.equal(done.state,'COMPLETE');assert.deepEqual((await finish(r.id)).snapshot,done.snapshot);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM marketing_spend_sync_runs WHERE id=$1',[r.id])).rows[0].n,1);
  });
  await t.test('missing, repeated, null, fractional or conflicting days cannot publish',async()=>{
   const variants=[{...snapshot,days:snapshot.days.slice(0,1)},{...snapshot,days:[snapshot.days[0],snapshot.days[0]]},{...snapshot,currency:null},{...snapshot,totalVnd:1},{...snapshot,days:[{date:'2020-10-01',amountVnd:null},snapshot.days[1]]},{...snapshot,totalVnd:500000.1},{...snapshot,timezone:null}];
   for(const s of variants){const r=await start();await assert.rejects(finish(r.id,s));assert.equal((await db.query('SELECT state,snapshot FROM marketing_spend_sync_runs WHERE id=$1',[r.id])).rows[0].state,'RUNNING');}
  });
  await t.test('revoked ownership or permission prevents completion',async()=>{
   const r=await start();await db.query("UPDATE fb_ad_accounts SET bat=false WHERE ad_account_id='act_123'");await assert.rejects(finish(r.id),e=>e.code==='42501');await assert.rejects(start(),e=>e.code==='42501');await db.query("UPDATE fb_ad_accounts SET bat=true WHERE ad_account_id='act_123'");
  });
  await t.test('later failed run blocks earlier completed snapshot; no fallback to cheap old value',async()=>{
   const first=await start();await finish(first.id);const second=await start();await peers[0].query("SELECT marketing_spend_finish($1,$2,NULL,'FACEBOOK_READ_FAILED')",[second.id,company]);
   const latest=await peers[0].query('SELECT * FROM marketing_spend_latest($1)',[company]);assert.equal(String(latest.rows[0].id),String(second.id));assert.equal(latest.rows[0].state,'FAILED');
  });
  await t.test('parallel completion order never replaces the most recently started run',async()=>{
   const rs=await Promise.all(peers.map(c=>start(c)));const newest=rs.reduce((a,b)=>Number(a.id)>Number(b.id)?a:b);
   await finish(newest.id);for(const r of rs.filter(x=>x.id!==newest.id))await finish(r.id);
   const latest=await peers[0].query('SELECT * FROM marketing_spend_latest($1)',[company]);assert.equal(String(latest.rows[0].id),String(newest.id));
  });
  await t.test('crash leaves newest run incomplete; readers cannot mistake it for zero',async()=>{
   const r=await start();const latest=await peers[0].query('SELECT * FROM marketing_spend_latest($1)',[company]);assert.equal(String(latest.rows[0].id),String(r.id));assert.equal(latest.rows[0].snapshot,null);assert.equal(latest.rows[0].state,'RUNNING');
  });
  await t.test('read RPC never returns another company evidence',async()=>assert.equal((await peers[0].query('SELECT * FROM marketing_spend_latest($1)',[other])).rows.length,0));
 } finally {await Promise.all(peers.map(c=>c.end()));await db.end();}
});
