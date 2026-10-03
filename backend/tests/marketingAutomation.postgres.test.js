'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dsn = process.env.MARKETING_TEST_DATABASE_URL;
test('isolated PostgreSQL: ACL, duplicate concurrency, atomic audit and interrupted commands', { skip: !dsn }, async t => {
  const url = new URL(dsn);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Refuse any non-loopback database');
  assert.equal(url.pathname,'/marketing_automation_test','Refuse a non-test database');
  const { Client } = require('pg');
  const db = new Client({connectionString:dsn});await db.connect();
  const company='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222', actor='33333333-3333-3333-3333-333333333333';
  const peers=[];
  try {
    const existing=await db.query("select count(*)::int as n from pg_tables where schemaname='public'");
    assert.equal(existing.rows[0].n,0,'Test requires a fresh empty PostgreSQL database');
    await db.query("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
    await db.query('CREATE TABLE public.companies(id uuid PRIMARY KEY)');
    await db.query('INSERT INTO public.companies(id) VALUES($1),($2)',[company,other]);
    const sql=fs.readFileSync(path.resolve(__dirname,'../../database/648_marketing_automation_command_queue.sql'),'utf8');
    await db.query(sql);await db.query(sql);
    await db.query("INSERT INTO public.marketing_automation_grants(company_id,actor_id,policy_version,actions,expires_at) VALUES($1,$2,'v1',ARRAY['sales.reply'],now()+interval '1 hour')",[company,actor]);
    const admission='SELECT public.marketing_automation_enqueue($1,$2,$3,$4,$5,$6,$7) AS c';
    const args=(key='same',cid=company,payload={text:'approved'})=>[cid,actor,'v1','sales.reply',key,'a'.repeat(64),payload];
    await t.test('malformed grant cannot turn NULL membership into authorization',async()=>{
      for(const actions of [['sales.reply',null],[],['unknown.action']])
        await assert.rejects(db.query('UPDATE public.marketing_automation_grants SET actions=$1',[actions]),e=>e.code==='23514');
    });
    await t.test('anon/authenticated cannot call privileged RPC or write/read tables',async()=>{
      for(const role of ['anon','authenticated']){
        await db.query('SET ROLE '+role);
        await assert.rejects(db.query(admission,args()),e=>e.code==='42501');
        await assert.rejects(db.query('SELECT * FROM public.marketing_automation_commands'),e=>e.code==='42501');
        await db.query('RESET ROLE');
      }
    });
    await t.test('RLS remains deny-all even if read privilege is accidentally granted',async()=>{
      await db.query('GRANT SELECT ON public.marketing_automation_commands TO authenticated');
      await db.query('SET ROLE authenticated');assert.equal((await db.query('SELECT * FROM public.marketing_automation_commands')).rowCount,0);
      await db.query('RESET ROLE');await db.query('REVOKE SELECT ON public.marketing_automation_commands FROM authenticated');
    });
    await t.test('wrong company, policy and action are rejected',async()=>{
      await db.query('SET ROLE service_role');
      await assert.rejects(db.query(admission,args('wrong',other)),e=>e.code==='42501');
      const a=args();a[2]='v2';await assert.rejects(db.query(admission,a),e=>e.code==='42501');
      a[2]='v1';a[3]='ads.budget_move';await assert.rejects(db.query(admission,a),e=>e.code==='42501');
      await db.query('RESET ROLE');
    });
    for(let i=0;i<12;i++){const c=new Client({connectionString:dsn});await c.connect();await c.query('SET ROLE service_role');peers.push(c);}
    let id;
    await t.test('12 simultaneous copies persist one command and one admission audit',async()=>{
      const results=await Promise.all(peers.map(c=>c.query(admission,args())));
      const ids=results.map(r=>r.rows[0].c.id);assert.equal(new Set(ids).size,1);id=ids[0];
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.marketing_automation_commands')).rows[0].n,1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.marketing_automation_command_audit')).rows[0].n,1);
    });
    await t.test('reusing key with changed content fails without additional write',async()=>{
      await assert.rejects(peers[0].query(admission,args('same',company,{text:'changed'})),e=>e.code==='22023');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.marketing_automation_commands')).rows[0].n,1);
    });
    await t.test('revoked or expired delegation cannot enqueue',async()=>{
      await db.query('UPDATE public.marketing_automation_grants SET revoked_at=now()');
      await assert.rejects(peers[0].query(admission,args('revoked')),e=>e.code==='42501');
      await db.query("UPDATE public.marketing_automation_grants SET revoked_at=NULL,expires_at=now()-interval '1 second'");
      await assert.rejects(peers[0].query(admission,args('expired')),e=>e.code==='42501');
      await db.query("UPDATE public.marketing_automation_grants SET expires_at=now()+interval '1 hour'");
    });
    await t.test('parallel workers never claim the same durable command',async()=>{
      for(let i=0;i<5;i++)await peers[0].query(admission,args('next-'+i));
      const results=await Promise.all(peers.map(c=>c.query('SELECT public.marketing_automation_claim() AS c')));
      const claims=results.map(r=>r.rows[0].c).filter(Boolean);assert.equal(claims.length,6);assert.equal(new Set(claims.map(c=>c.id)).size,6);
    });
    await t.test('wrong company cannot complete a command; terminal result is idempotent',async()=>{
      await assert.rejects(peers[0].query('SELECT public.marketing_automation_finish($1,$2,$3,$4)',[id,other,'SUCCEEDED',{providerReceiptId:'p1'}]));
      for(let i=0;i<2;i++)await peers[0].query('SELECT public.marketing_automation_finish($1,$2,$3,$4)',[id,company,'SUCCEEDED',{providerReceiptId:'p1'}]);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.marketing_automation_command_audit WHERE command_id=$1 AND state='SUCCEEDED'",[id])).rows[0].n,1);
    });
    await t.test('restart recovery marks interrupted sends UNKNOWN and never requeues',async()=>{
      const r=await peers[0].query("SELECT public.marketing_automation_recover(now()+interval '1 minute') AS n");assert.equal(r.rows[0].n,5);
      assert.equal((await peers[0].query('SELECT public.marketing_automation_claim() AS c')).rows[0].c,null);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.marketing_automation_commands WHERE state='UNKNOWN'")).rows[0].n,5);
    });
  } finally {await Promise.all(peers.map(c=>c.end()));await db.end();}
});
