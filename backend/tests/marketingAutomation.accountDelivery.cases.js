'use strict';
const assert=require('node:assert/strict');
const {readAccountSpendWithDelivery}=require('../src/modules/marketingAutomation/facebookAccountDelivery');
const {reportTrial}=require('../src/modules/marketingAutomation/trialReport');
const {provider}=require('./marketingAutomation.accountDelivery.fixture');
module.exports=async(t,{db,peers,query,cid,actor,trial,date})=>{
 const since=date(-1),until=date(0),snapshots={};
 const start=(account='act_171',c=peers[0])=>query('marketing_spend_begin',[account,cid,since,until],c);
 const finish=(run,snapshot,c=peers[0])=>query('marketing_spend_finish',[run.id,cid,snapshot,null],c);
 const read=()=>query('marketing_lead_trial_snapshot',[actor,cid,trial]);
 for(const account of ['act_171','act_172']){const f=provider({account,since,until});snapshots[account]=await readAccountSpendWithDelivery({...f.input,now:new Date().toISOString()});}
 await t.test('delivery table and private spend validator remain inaccessible, including broad browser grants',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM marketing_measurement.account_delivery_evidence'),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT USAGE ON SCHEMA marketing_measurement TO authenticated;GRANT EXECUTE ON FUNCTION marketing_measurement.spend_finish_base(bigint,uuid,jsonb,text),public.marketing_spend_finish(bigint,uuid,jsonb,text) TO authenticated');
  await db.query('SET ROLE authenticated');try{for(const name of ['marketing_measurement.spend_finish_base','marketing_spend_finish'])await assert.rejects(query(name,[1,cid,null,'SYNTHETIC'],db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');await db.query('REVOKE USAGE ON SCHEMA marketing_measurement FROM authenticated;REVOKE EXECUTE ON FUNCTION marketing_measurement.spend_finish_base(bigint,uuid,jsonb,text),public.marketing_spend_finish(bigint,uuid,jsonb,text) FROM authenticated');}
 });
 await t.test('provider collector to atomic spend/witness to trial projection includes zero-lead account and source-only ad exception',async()=>{
  for(const account of ['act_171','act_172']){const run=await start(account),r=await finish(run,snapshots[account]);assert.equal(String(r.deliveryEvidence.runId),String(run.id));}
  const raw=await read(),r=reportTrial(raw);assert.equal(raw.accountDelivery.length,2);assert.equal(r.observedMeasurement.costPerQualifiedLeadVnd,250000);assert.equal(r.accountDelivery.accounts[0].zeroSpendWithSignals,1);assert.deepEqual(r.accountDelivery.accounts[0].sourceOnlyAdIds,['888']);assert.equal(r.accountDelivery.accounts[1].spendVnd,500000);assert.equal(r.costPerQualifiedLeadVnd,null);
  const ctx=await query('marketing_measurement_prepare',[actor,cid,trial,null,null]);assert.deepEqual(ctx.facts.accountDelivery,raw.accountDelivery);
 });
 await t.test('concurrent exact delivery replay appends one immutable witness; changed or omitted evidence is refused',async()=>{
  const run=await start(),s=snapshots.act_171;
  const results=await Promise.all([finish(run,s,peers[0]),finish(run,s,peers[1])]);assert.deepEqual(results[0].deliveryEvidence,results[1].deliveryEvidence);
  assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.account_delivery_evidence WHERE run_id=$1',[run.id])).rows[0].n,1);
  const changed=structuredClone(s);changed.delivery.graphVersion='v25.0';await assert.rejects(finish(run,changed),e=>e.code==='22023');const absent={...s};delete absent.delivery;await assert.rejects(finish(run,absent),e=>e.code==='22023');
 });
 await t.test('invalid delivery rolls back spend publication and witness together',async()=>{
  for(const mutate of [s=>s.delivery.adDays.pop(),s=>s.delivery.adDays.push(s.delivery.adDays[0]),s=>s.delivery.accountDays[0].amountVnd++,s=>s.delivery.adDays[0].secret='no-store',s=>s.delivery.witnesses[0].label='AFTER_DAILY',s=>s.delivery.adDays[0].clicks=0.1]){
   const run=await start(),s=structuredClone(snapshots.act_171);mutate(s);await assert.rejects(finish(run,s),e=>e.code==='22023');const state=(await db.query('SELECT state,snapshot FROM marketing_spend_sync_runs WHERE id=$1',[run.id])).rows[0];assert.equal(state.state,'RUNNING');assert.equal(state.snapshot,null);assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.account_delivery_evidence WHERE run_id=$1',[run.id])).rows[0].n,0);
  }
 });
 await t.test('account revoked before commit denies new evidence and old replay; failed latest run cannot show old ad inventory',async()=>{
  const complete=await start();await finish(complete,snapshots.act_171);const pending=await start();
  await db.query("UPDATE fb_ad_accounts SET bat=false WHERE ad_account_id='act_171'");try{await assert.rejects(finish(pending,snapshots.act_171),e=>e.code==='42501');await assert.rejects(finish(complete,snapshots.act_171),e=>e.code==='42501');}finally{await db.query("UPDATE fb_ad_accounts SET bat=true WHERE ad_account_id='act_171'");}
  await query('marketing_spend_finish',[pending.id,cid,null,'DELIVERY_CHANGED_DURING_READ']);const r=reportTrial(await read());assert.equal(r.accountDelivery.accounts[0].status,'UNAVAILABLE');assert.deepEqual(r.accountDelivery.accounts[0].ads,[]);
  await finish(await start(),snapshots.act_171);
 });
 await t.test('late witness insertion failure cannot leave completed spend without its evidence',async()=>{
  const run=await start();await db.query("CREATE FUNCTION public.delivery_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic append failure';END $$;CREATE TRIGGER delivery_test_fail BEFORE INSERT ON marketing_measurement.account_delivery_evidence FOR EACH ROW EXECUTE FUNCTION public.delivery_test_fail()");
  try{await assert.rejects(finish(run,snapshots.act_171));assert.equal((await db.query('SELECT state FROM marketing_spend_sync_runs WHERE id=$1',[run.id])).rows[0].state,'RUNNING');}finally{await db.query('DROP TRIGGER delivery_test_fail ON marketing_measurement.account_delivery_evidence;DROP FUNCTION public.delivery_test_fail()');}
  await finish(run,snapshots.act_171);
 });
 await t.test('report reads spend and delivery in one snapshot while a new complete run commits',async()=>{
  const original=(await db.query("SELECT pg_get_functiondef('marketing_trial_quality_context(jsonb,jsonb,jsonb,jsonb,jsonb,boolean,jsonb)'::regprocedure) d")).rows[0].d;
  await db.query(original.replace(/BEGIN\r?\n/,'BEGIN\n PERFORM pg_sleep(0.08);\n'));
  const reading=query('marketing_lead_trial_snapshot',[actor,cid,trial],peers[1]);
  try{
   let waiting=false;for(let i=0;i<100;i++){const x=await db.query("SELECT 1 FROM pg_stat_activity WHERE state='active' AND wait_event='PgSleep' AND query LIKE 'SELECT marketing_lead_trial_snapshot%'");if(x.rowCount){waiting=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(waiting,true);
   const f=provider({account:'act_171',since,until,mutate:b=>{b.data.forEach(r=>{if(r.spend==='500000')r.spend='600000';});return b;}});
   const changed=await readAccountSpendWithDelivery({...f.input,now:new Date().toISOString()});await finish(await start(),changed);
   const old=reportTrial(await reading);assert.equal(old.accountDelivery.accounts[0].spendVnd,500000);assert.equal(old.spend.spendVnd,1000000);
   const current=reportTrial(await read());assert.equal(current.accountDelivery.accounts[0].spendVnd,600000);assert.equal(current.spend.spendVnd,1100000);
  }finally{await reading.catch(()=>{});await db.query(original);await finish(await start(),snapshots.act_171);}
 });
};
