'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {calculateSnapshot}=require('../src/modules/marketingAutomation/measurementSnapshot');
module.exports=async(t,{db,peers,query,cid,actor,trial,leads,qualify,date})=>{
 const prepare=(request=null,version=null,c=peers[0],who=actor,company=cid)=>query('marketing_measurement_prepare',[who,company,trial,request,version],c);
 const save=(c,request=randomUUID(),client=peers[0],report=calculateSnapshot(c))=>query('marketing_measurement_record',[actor,cid,trial,request,c.contextVersion,report],client);
 const count=async key=>(await db.query('SELECT count(*)::int n FROM marketing_measurement.measurement_snapshots WHERE request_id=$1',[key])).rows[0].n;
 const wait=async prefix=>{for(let i=0;i<100;i++){const x=await db.query("SELECT 1 FROM pg_stat_activity WHERE state='active' AND (wait_event_type='Lock' OR wait_event='PgSleep') AND query LIKE $1",[prefix+'%']);if(x.rowCount)return;await new Promise(r=>setTimeout(r,5));}assert.fail('expected live blocked query');};
 let first,baseline,key;
 await t.test('measurement private evidence and wrappers reject direct/browser roles even after a broad grant',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM marketing_measurement.measurement_snapshots'),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT EXECUTE ON FUNCTION marketing_measurement_prepare(uuid,uuid,uuid,uuid,text),marketing_measurement_record(uuid,uuid,uuid,uuid,text,jsonb) TO authenticated');
  await db.query('SET ROLE authenticated');try{await assert.rejects(prepare(null,null,db),e=>e.code==='42501');await assert.rejects(query('marketing_measurement_record',[actor,cid,trial,randomUUID(),'a'.repeat(64),{}],db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION marketing_measurement_prepare(uuid,uuid,uuid,uuid,text),marketing_measurement_record(uuid,uuid,uuid,uuid,text,jsonb) FROM authenticated');}
  await assert.rejects(prepare(null,null,peers[0],actor,randomUUID()),e=>e.code==='42501');
 });
 await t.test('snapshot records 1m/4=250k with both accounts and immutable evidence, without contact PII or completeness',async()=>{
  baseline=await prepare();key=randomUUID();first=await save(baseline,key);assert.equal(first.report.observedMeasurement.costPerQualifiedLeadVnd,250000);assert.equal(first.report.spend.sources.length,2);assert.equal(first.report.status,'SAVED_OBSERVED_INCOMPLETE');assert.equal(first.report.targetStatus,'NOT_EVALUATED');assert.equal(first.allowBudgetExecution,false);assert.equal(first.report.dependencies.qualification,baseline.dependencies.qualification);
  const stored=(await db.query('SELECT * FROM marketing_measurement.measurement_snapshots WHERE request_id=$1',[key])).rows[0];assert.ok(!JSON.stringify(stored).includes('090124'));assert.ok(!JSON.stringify(stored).includes('contacts'));assert.equal((await prepare()).history[0].currentStatus,'UNCHANGED_INPUTS');
 });
 await t.test('concurrent exact request produces one receipt and retry ignores newly recomputed asOf',async()=>{
  const c=await prepare(),k=randomUUID(),report=calculateSnapshot(c);
  const rs=await Promise.all([save(c,k,peers[0],report),save(c,k,peers[1],report)]);
  assert.equal(rs.filter(x=>x.replayed).length,1);assert.equal(rs[0].recordedAt,rs[1].recordedAt);assert.equal(await count(k),1);
  const retry=await prepare(k,c.contextVersion);assert.equal(retry.receipt.replayed,true);assert.deepEqual(retry.receipt.report,report);
  await assert.rejects(prepare(k,'f'.repeat(64)),e=>e.code==='23505');
 });
 await t.test('qualification change changes current fingerprint, keeps old receipt and serves exact historical replay',async()=>{
  await qualify(leads[0],'REJECTED');
  try{const current=await prepare();assert.notEqual(current.contextVersion,baseline.contextVersion);assert.equal(calculateSnapshot(current).observedMeasurement.qualifiedLeads,3);assert.equal(current.history.find(h=>h.receipt.requestId===key).currentStatus,'CHANGED_SINCE_CAPTURE');assert.deepEqual((await prepare(key,baseline.contextVersion)).receipt.report,first.report);await assert.rejects(save(baseline),e=>e.code==='40001');}
  finally{await qualify(leads[0]);}
 });
 await t.test('raw facts and export evidence share one MVCC snapshot while account availability changes',async()=>{
  const before=await prepare(),original=(await db.query("SELECT pg_get_functiondef('marketing_trial_quality_context(jsonb,jsonb,jsonb,jsonb,jsonb,boolean,jsonb)'::regprocedure) d")).rows[0].d;
  await db.query(original.replace(/BEGIN\r?\n/,'BEGIN\n PERFORM pg_sleep(0.08);\n'));
  const reading=prepare(null,null,peers[1]);try{await wait('SELECT marketing_measurement_prepare');await db.query("UPDATE fb_ad_accounts SET bat=false WHERE ad_account_id='act_172'");const r=await reading;assert.equal(calculateSnapshot(r).observedMeasurement.costPerQualifiedLeadVnd,250000);assert.equal(r.dependencies.exportContext,before.dependencies.exportContext);assert.equal(r.contextVersion,before.contextVersion);assert.notEqual((await prepare()).contextVersion,before.contextVersion);}
  finally{await db.query(original);await db.query("UPDATE fb_ad_accounts SET bat=true WHERE ad_account_id='act_172'");}
 });
 await t.test('unknown late receipt is a dependency, but lease/retry noise is not',async()=>{
  const before=await prepare();await query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'234',formId:'567',leadgenId:'675001'}]),'a'.repeat(64)]);
  try{const after=await prepare();assert.notEqual(before.contextVersion,after.contextVersion);assert.equal(calculateSnapshot(after).observedMeasurement.status,'UNAVAILABLE');
   await db.query("UPDATE marketing_fb_lead_receipts SET state='LEASED',attempts=attempts+1,lease_token=$1,lease_until=clock_timestamp()+interval '60 seconds',next_attempt_at=clock_timestamp(),failure_code='SOURCE_TEMPORARY' WHERE leadgen_id='675001'",[randomUUID()]);
   const noisy=await prepare();assert.equal(noisy.contextVersion,after.contextVersion);assert.equal(noisy.dependencies.exportContext,after.dependencies.exportContext);
  }finally{await db.query("DELETE FROM marketing_fb_lead_receipts WHERE leadgen_id='675001'");}
 });
 await t.test('proven outside-period receipt state changes do not stale the saved measurement',async()=>{
  const run=(await prepare()).facts.providerReconciliation.run.id;
  await query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'234',formId:'567',leadgenId:'675002'}]),'b'.repeat(64)]);
  await db.query("INSERT INTO marketing_measurement.census_observations(run_id,page_id,form_id,leadgen_id,acquired_at,observed_at,graph_version) VALUES($1,'234','567','675002',$2,clock_timestamp(),'v24.0')",[run,date(0)+'T00:00:00+07:00']);
  try{const before=await prepare();await db.query("UPDATE marketing_fb_lead_receipts SET state='REVIEW',failure_code='SYNTHETIC',attempts=10 WHERE leadgen_id='675002'");const after=await prepare();assert.equal(before.contextVersion,after.contextVersion);assert.equal(calculateSnapshot(after).observedMeasurement.costPerQualifiedLeadVnd,250000);}
  finally{await db.query("DELETE FROM marketing_measurement.census_observations WHERE run_id=$1 AND leadgen_id='675002'",[run]);await db.query("DELETE FROM marketing_fb_lead_receipts WHERE leadgen_id='675002'");}
 });
 await t.test('late receipt after initial compare but before append rolls back the entire measurement',async()=>{
  const c=await prepare(),k=randomUUID();
  await db.query("CREATE FUNCTION public.snapshot_test_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_lock(675011);PERFORM pg_advisory_unlock(675011);RETURN NEW;END $$;CREATE TRIGGER snapshot_test_barrier BEFORE INSERT ON marketing_measurement.measurement_snapshots FOR EACH ROW EXECUTE FUNCTION public.snapshot_test_barrier()");
  await db.query('SELECT pg_advisory_lock(675011)');const p=save(c,k,peers[1]).then(v=>({v}),e=>({e}));
  try{await wait('SELECT marketing_measurement_record');await query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'234',formId:'567',leadgenId:'675003'}]),'c'.repeat(64)],peers[2]);}
  finally{await db.query('SELECT pg_advisory_unlock(675011)');}
  try{assert.equal((await p).e?.code,'40001');assert.equal(await count(k),0);}
  finally{await db.query('DROP TRIGGER snapshot_test_barrier ON marketing_measurement.measurement_snapshots;DROP FUNCTION public.snapshot_test_barrier()');await db.query("DELETE FROM marketing_fb_lead_receipts WHERE leadgen_id='675003'");}
 });
 await t.test('new whole-account spend invalidates a preview even when no new customer is received',async()=>{
  const c=await prepare(),before=calculateSnapshot(c);const row=(await db.query("SELECT id,snapshot FROM marketing_spend_sync_runs WHERE company_id=$1 AND ad_account_id='act_172' ORDER BY id DESC LIMIT 1",[cid])).rows[0],changed=structuredClone(row.snapshot);
  changed.days[0].amountVnd+=250000;changed.totalVnd+=250000;await db.query('UPDATE marketing_spend_sync_runs SET snapshot=$2 WHERE id=$1',[row.id,changed]);
  try{const current=await prepare();assert.notEqual(current.dependencies.spend,c.dependencies.spend);assert.equal(calculateSnapshot(current).counts.qualified,before.counts.qualified);assert.equal(calculateSnapshot(current).observedMeasurement.costPerQualifiedLeadVnd,312500);await assert.rejects(save(c),e=>e.code==='40001');}
  finally{await db.query('UPDATE marketing_spend_sync_runs SET snapshot=$2 WHERE id=$1',[row.id,row.snapshot]);}
 });
 await t.test('expired capture, client completeness and dependency substitution cannot be appended',async()=>{
  const c=await prepare(),r=calculateSnapshot(c);
  for(const patch of [{targetStatus:'MET'},{allowBudgetExecution:true},{dependencies:{...r.dependencies,spend:'f'.repeat(64)}}])await assert.rejects(save(c,randomUUID(),peers[0],{...r,...patch}),e=>e.code==='22023');
  const old={...r,asOf:new Date(Date.now()-61000).toISOString()};old.period={...r.period,qualificationAsOf:old.asOf};await assert.rejects(save(c,randomUUID(),peers[0],old),e=>e.code==='40001');
 });
 await t.test('revoked actor cannot read history or replay; changed actor cannot reuse request',async()=>{
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[actor]);try{await assert.rejects(prepare(key,baseline.contextVersion),e=>e.code==='42501');await assert.rejects(prepare(),e=>e.code==='42501');}finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[actor]);}
  const user=randomUUID(),tenant=(await db.query('SELECT tenant_id FROM companies WHERE id=$1',[cid])).rows[0].tenant_id;await db.query("INSERT INTO users VALUES($1,$2,$3,'admin',true)",[user,cid,tenant]);
  await assert.rejects(prepare(key,baseline.contextVersion,peers[0],user),e=>e.code==='23505');
 });
};

