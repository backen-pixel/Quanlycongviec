'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {readAccountSpendWithDelivery}=require('../src/modules/marketingAutomation/facebookAccountDelivery');
const {provider}=require('./marketingAutomation.accountDelivery.fixture');
const {parseExport}=require('../src/modules/marketingAutomation/sourceExport');
const {parseRequest,evaluate,requirements,publicReceipt,publicView,CLAIMS,keyOf}=require('../src/modules/marketingAutomation/scopeAcceptance');
module.exports=async(t,{db,peers,query,cid,actor,trial,leads,qualify,date})=>{
 const prepare=(request=null,command=null,c=peers[0],who=actor,company=cid)=>query('marketing_scope_prepare',[who,company,trial,request,command],c);
 const record=(r,report,c=peers[0])=>query('marketing_scope_record',[actor,cid,trial,r.requestId,r.command,report,r.artifact],c);
 const count=async key=>(await db.query('SELECT count(*)::int n FROM marketing_measurement.scope_acceptances WHERE request_id=$1',[key])).rows[0].n;
 const wait=async prefix=>{const until=Date.now()+5000;while(Date.now()<until){await db.query('SELECT pg_stat_clear_snapshot()');const x=await db.query("SELECT 1 FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND query LIKE $1",[prefix+'%']);if(x.rowCount)return;await new Promise(r=>setTimeout(r,10));}assert.fail('expected live blocked scope write');};
 const build=c=>parseRequest({requestId:randomUUID(),artifactBase64:Buffer.from('Synthetic full historical destinations; source export filters, time range and retention verified.').toString('base64'),command:{action:'ACCEPT',expectedRevision:c.revision,contextVersion:c.context.contextVersion,
  reference:'Isolated synthetic scope evidence',note:'All historical destinations and full source file provenance checked for this synthetic measurement only.',claims:[...CLAIMS],
  manifest:requirements(c.context).ads.map(ad=>({accountId:ad.accountId,adId:ad.adId,validFrom:c.context.facts.providerReconciliation.run.since,validUntil:c.context.facts.providerReconciliation.run.until,
   destinations:c.context.facts.sourceRegistry.declaration.entries.filter(e=>e.accountId===ad.accountId).map(keyOf)})),
  exportClaims:c.context.exports.map(e=>({requestId:e.requestId,fileSha256:e.fileSha256,normalizedRowsDigest:e.normalizedRowsDigest}))}});
 const accept=async()=>{const c=await prepare(),r=build(c),report=evaluate(c.context,r.command);return{c,r,report,saved:await record(r,report)};};
 const revoke=c=>parseRequest({requestId:randomUUID(),command:{action:'REVOKE',expectedRevision:c.revision,targetRequestId:c.history[0].requestId,reason:'Withdraw the previous synthetic scope measurement acceptance.'}});
 let original;
 await t.test('scope table private; service guard survives accidental broad browser grants',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM marketing_measurement.scope_acceptances'),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT EXECUTE ON FUNCTION marketing_scope_prepare(uuid,uuid,uuid,uuid,jsonb),marketing_scope_record(uuid,uuid,uuid,uuid,jsonb,jsonb,text) TO authenticated');
  await db.query('SET ROLE authenticated');try{await assert.rejects(prepare(null,null,db),e=>e.code==='42501');await assert.rejects(query('marketing_scope_record',[actor,cid,trial,randomUUID(),{},null,null],db),e=>e.code==='42501');}
  finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION marketing_scope_prepare(uuid,uuid,uuid,uuid,jsonb),marketing_scope_record(uuid,uuid,uuid,uuid,jsonb,jsonb,text) FROM authenticated');}
  await assert.rejects(prepare(null,null,peers[0],actor,randomUUID()),e=>e.code==='42501');
 });
 await t.test('real services join ad delivery, registry, parsed source export, qualification and artifact into accepted 1m/4 scope',async()=>{
  for(const account of ['act_171','act_172']){
   const f=provider({account,since:date(-1),until:date(-1),mutate:b=>{b.data.forEach(row=>{if(row.ad_id==='7'){row.ad_id='888';row.adset_id='999';row.campaign_id='111';}});return b;}});
   const snapshot=await readAccountSpendWithDelivery({...f.input,now:new Date().toISOString()}),run=await query('marketing_spend_begin',[account,cid,date(-1),date(-1)]);
   await query('marketing_spend_finish',[run.id,cid,snapshot,null]);
  }
  const reg=await query('marketing_source_registry_read',[actor,cid,trial]);
  await query('marketing_source_registry_set',[actor,cid,trial,randomUUID(),{expectedRevision:reg.declaration?.revision||0,expectedInventoryVersion:reg.inventoryVersion,sourceReference:'Synthetic historical source evidence',sourceDate:date(0),sourceNote:'Full destinations attested by synthetic operator; no provider universe claim.',entries:[
   {accountId:'act_171',kind:'META_LEAD_ADS',pageId:'234',formId:'567',destination:null},{accountId:'act_172',kind:'NO_LEAD_SOURCE',pageId:null,formId:null,destination:'Synthetic awareness-only account with no customer intake.'}]}]);
  const exp=await query('marketing_source_export_read',[actor,cid,trial]),csv='id,created_time,form_id\n'+['9101','9102','9103','9104'].map(id=>id+','+date(-1)+'T12:00:00+07:00,567').join('\n');
  const parsed=parseExport({requestId:randomUUID(),contextVersion:exp.contextVersion,pageId:'234',formId:'567',fileBase64:Buffer.from(csv).toString('base64'),delimiter:',',columns:{id:'id',createdAt:'created_time',formId:'form_id'},exportedAt:new Date().toISOString(),sourceReference:'Synthetic unfiltered source CSV',sourceNote:'Isolated full form export, correct closed-day range and no retention gap.'});
  const exported=await query('marketing_source_export_record',[actor,cid,trial,parsed.requestId,parsed.command]);assert.equal(exported.status,'MATCHED_EXPORTED_IDS');
  original=await accept();assert.equal(original.saved.report.costPerQualifiedLeadVnd,250000);assert.equal(original.saved.report.spendVnd,1000000);assert.equal(original.saved.report.qualifiedLeads,4);assert.equal(original.saved.report.targetStatus,'AT_OR_BELOW_TARGET_IN_SCOPE');
  publicReceipt(original.saved,cid,trial);const current=await prepare();assert.equal(publicView(current,actor,cid,trial).currentStatus,'CURRENT');
  const row=(await db.query('SELECT artifact,command FROM marketing_measurement.scope_acceptances WHERE request_id=$1',[original.r.requestId])).rows[0];assert.equal(row.artifact.toString('base64'),original.r.artifact);assert.equal(row.command.artifactSha256,original.r.command.artifactSha256);assert.ok(!JSON.stringify(original.saved).includes('artifactBase64'));
 });
 await t.test('concurrent identical acceptance appends once; changed request and tampered bytes cannot replace it',async()=>{
  const c=await prepare(),r=build(c),report=evaluate(c.context,r.command),out=await Promise.all([record(r,report,peers[0]),record(r,report,peers[1])]);
  assert.equal(out.filter(x=>x.replayed).length,1);assert.equal(out[0].revision,out[1].revision);assert.equal(await count(r.requestId),1);
  await assert.rejects(prepare(r.requestId,{...r.command,note:r.command.note+'changed'}),e=>e.code==='23505');
  await assert.rejects(record({...r,artifact:Buffer.from('different').toString('base64')},report),e=>e.code==='22023');
 });
 await t.test('concurrent new accept and revoke serialize at expected revision; historical retry cannot reactivate',async()=>{
  const c=await prepare(),a=build(c),r=revoke(c),report=evaluate(c.context,a.command);
  const result=await Promise.allSettled([record(a,report,peers[0]),record(r,null,peers[1])]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.code,'40001');
  let current=await prepare();if(current.currentStatus!=='REVOKED')await record(revoke(current),null);
  const replay=await prepare(original.r.requestId,original.r.command);assert.equal(replay.receipt.replayed,true);assert.deepEqual(replay.receipt.report,original.saved.report);assert.equal((await prepare()).currentStatus,'REVOKED');
  await accept();
 });
 await t.test('qualification change hides current result; old capture cannot be appended and remains immutable',async()=>{
  const c=await prepare(),r=build(c),report=evaluate(c.context,r.command);await qualify(leads[0],'REJECTED');
  try{const current=await prepare();assert.equal(current.currentStatus,'CHANGED_SOURCE');assert.equal(evaluate(current.context,build(current).command).qualifiedLeads,3);await assert.rejects(record(r,report),e=>e.code==='40001');assert.equal(await count(r.requestId),0);}
  finally{await qualify(leads[0]);}
  await accept();
 });
 await t.test('late unknown receipt during append rolls back acceptance and artifact atomically',async()=>{
  const c=await prepare(),r=build(c),report=evaluate(c.context,r.command);
  await db.query("CREATE FUNCTION public.scope_test_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_lock(677011);PERFORM pg_advisory_unlock(677011);RETURN NEW;END $$;CREATE TRIGGER scope_test_barrier BEFORE INSERT ON marketing_measurement.scope_acceptances FOR EACH ROW EXECUTE FUNCTION public.scope_test_barrier()");
  await db.query('SELECT pg_advisory_lock(677011)');const p=record(r,report,peers[1]).then(v=>({v}),e=>({e}));
  try{await wait('SELECT marketing_scope_record');await query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'234',formId:'567',leadgenId:'677001'}]),'c'.repeat(64)],peers[2]);}
  finally{await db.query('SELECT pg_advisory_unlock(677011)');}
  try{assert.equal((await p).e?.code,'40001');assert.equal(await count(r.requestId),0);assert.equal((await prepare()).currentStatus,'CHANGED_SOURCE');}
  finally{await db.query('DROP TRIGGER scope_test_barrier ON marketing_measurement.scope_acceptances;DROP FUNCTION public.scope_test_barrier()');await db.query("DELETE FROM marketing_fb_lead_receipts WHERE leadgen_id='677001'");}
 });
 await t.test('revoke works during source failure; source failure never leaves a current numeric result',async()=>{
  await accept();const originalFn=(await db.query("SELECT pg_get_functiondef('marketing_measurement.scope_context(uuid,uuid)'::regprocedure) d")).rows[0].d;
  await db.query(originalFn.replace(/BEGIN\r?\n/,"BEGIN\n RAISE EXCEPTION 'synthetic source failure';\n"));
  try{const current=await prepare();assert.equal(current.currentStatus,'SOURCE_UNAVAILABLE');assert.equal(current.context,null);const r=await record(revoke(current),null);assert.equal(r.action,'REVOKE');assert.equal((await prepare()).currentStatus,'REVOKED');}
  finally{await db.query(originalFn);}
  await accept();
 });
 await t.test('current rights govern history and retry; another authorized reader sees stale operator authority',async()=>{
  const other=randomUUID(),tenant=(await db.query('SELECT tenant_id FROM companies WHERE id=$1',[cid])).rows[0].tenant_id;
  await db.query("INSERT INTO users VALUES($1,$2,$3,'admin',true)",[other,cid,tenant]);await db.query('UPDATE users SET is_active=false WHERE id=$1',[actor]);
  try{await assert.rejects(prepare(original.r.requestId,original.r.command),e=>e.code==='42501');assert.equal((await prepare(null,null,peers[0],other)).currentStatus,'STALE_AUTHORITY');}
  finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[actor]);}
 });
 await t.test('private service report still rejects forged target, scope, stale capture and cross-period arithmetic',async()=>{
  const c=await prepare(),r=build(c),report=evaluate(c.context,r.command);
  for(const patch of [{targetStatus:'MET'},{allChannelsMeasured:true},{allowBudgetExecution:true},{costPerQualifiedLeadVnd:1},{accountIds:['act_171']},{sinceAt:date(-2)+'T00:00:00+07:00'}])await assert.rejects(record({...r,requestId:randomUUID()},{...report,...patch}),e=>e.code==='22023');
  const old=new Date(Date.now()-61000).toISOString();await assert.rejects(record({...r,requestId:randomUUID()},{...report,asOf:old,qualificationAsOf:old}),e=>e.code==='40001');
 });
 await t.test('GET and both replay paths recheck strict authority after waiting on company locks',async()=>{
  for(const action of ['read','prepareReplay','recordReplay']){
   await db.query('BEGIN');await db.query('UPDATE companies SET is_active=NULL WHERE id=$1',[cid]);
   const pending=(action==='recordReplay'?record(original.r,original.report,peers[1]):prepare(action==='read'?null:original.r.requestId,action==='read'?null:original.r.command,peers[1])).then(v=>({v}),e=>({e}));
   try{
    try{await wait(action==='recordReplay'?'SELECT marketing_scope_record':'SELECT marketing_scope_prepare');}
    finally{await db.query('COMMIT');}
    const r=await pending;assert.equal(r.e?.code,'42501');assert.equal(r.v,undefined);
   }finally{await pending;await db.query('UPDATE companies SET is_active=true WHERE id=$1',[cid]);}
  }
 });
};
