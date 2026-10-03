'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async(t,{db,peers,query})=>{
 const tenant=randomUUID(),company=randomUUID(),actor=randomUUID(),trial=randomUUID(),second=randomUUID();
 const date=n=>new Date(Date.now()+7*3600000+n*86400000).toISOString().slice(0,10),startAt=date(-1)+'T00:00:00+07:00',endAt=date(0)+'T00:00:00+07:00',iso=x=>new Date(x).toISOString();
 await db.query('INSERT INTO tenants VALUES($1,true)',[tenant]);await db.query('INSERT INTO companies VALUES($1,$2,true)',[company,tenant]);await db.query("INSERT INTO users VALUES($1,$3,$4,'admin',true),($2,$3,$4,'sales_admin',true)",[actor,second,company,tenant]);
 await db.query("INSERT INTO facebook_pages VALUES('674',$1,true,'export-synthetic-private-token')",[company]);await db.query("INSERT INTO fb_ad_accounts VALUES('act_674',$1,true,NULL,'export-synthetic-private-account')",[company]);await db.query("INSERT INTO marketing_fb_lead_bindings VALUES('674','675',$1,1,$2,$3)",[company,{active:true,accountId:'act_674'},actor]);
 await query('marketing_lead_trial_set',[actor,company,trial,randomUUID(),{name:'Synthetic export evidence',since:date(-1),until:date(28),expectedRevision:0}]);
 const scan=()=>query('marketing_fb_census_start',[actor,company,trial,randomUUID(),['674']]);
 const claim=async()=>{const token=randomUUID();return{q:(await peers[0].query('SELECT * FROM marketing_fb_census_claim($1,$2)',[['674'],token])).rows[0],token}};
 const finish=(a,rows)=>query('marketing_fb_census_commit',[a.q.id,a.token,{rows,next:null,graphVersion:'v24.0'}]);
 let run=await scan();await finish(await claim(),[{id:'675',status:'ACTIVE',expiredLeads:0}]);await finish(await claim(),[{id:'100',acquiredAt:startAt},{id:'101',acquiredAt:date(-1)+'T08:00:00+07:00'},{id:'102',acquiredAt:endAt}]);
 const reg=await query('marketing_source_registry_read',[actor,company,trial]);await query('marketing_source_registry_set',[actor,company,trial,randomUUID(),{expectedRevision:0,expectedInventoryVersion:reg.inventoryVersion,sourceReference:'Synthetic registered form export',sourceDate:date(0),sourceNote:'Only synthetic data; this declaration is not provider completeness.',entries:[{accountId:'act_674',kind:'META_LEAD_ADS',pageId:'674',formId:'675',destination:null}]}]);
 const read=(who=actor,cid=company,c=peers[0])=>query('marketing_source_export_read',[who,cid,trial],c);
 const command=async(rows=[{leadgenId:'100',formId:'675',acquiredAt:iso(startAt)},{leadgenId:'101',formId:'675',acquiredAt:iso(date(-1)+'T08:00:00+07:00')},{leadgenId:'102',formId:'675',acquiredAt:iso(endAt)}])=>({contextVersion:(await read()).contextVersion,pageId:'674',formId:'675',rows,fileSha256:'a'.repeat(64),fileBytes:120,encoding:'UTF-8',parser:'DELIMITED_SOURCE_IDS_V1',delimiter:',',columns:{id:'id',createdAt:'created_time',formId:'form_id'},exportedAt:new Date().toISOString(),sourceReference:'Synthetic source export',sourceNote:'Synthetic full test form export; no provider completeness claim.'});
 const save=(cmd,key=randomUUID(),who=actor,c=peers[0])=>query('marketing_source_export_record',[who,company,trial,key,cmd],c);
 const denied=code=>e=>e.code===code;let saved,request,cmd;
 await t.test('source export wrappers/private evidence deny direct roles, wrong company and revoked actor',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM marketing_measurement.source_exports'),denied('42501'));}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT EXECUTE ON FUNCTION marketing_source_export_read(uuid,uuid,uuid),marketing_source_export_record(uuid,uuid,uuid,uuid,jsonb) TO authenticated');await db.query('SET ROLE authenticated');try{await assert.rejects(read(actor,company,db),denied('42501'));await assert.rejects(save({},randomUUID(),actor,db),denied('42501'));}finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION marketing_source_export_read(uuid,uuid,uuid),marketing_source_export_record(uuid,uuid,uuid,uuid,jsonb) FROM authenticated');}
  await assert.rejects(read(actor,randomUUID()),denied('42501'));
 });
 await t.test('same snapshot exposes measured tuple digest/witness/registry; outside cutoff is not a measured lead',async()=>{
  const before=await read();assert.equal(before.census.run.witness.status,'TRAVERSED');assert.equal(before.census.measuredEvidence.count,2);assert.equal(before.census.run.witness.uniqueLeadIds,3);assert.equal(before.registry.status,'CURRENT');assert.ok(!JSON.stringify(before).includes('private-token'));
  cmd=await command();request=randomUUID();saved=await save(cmd,request);assert.equal(saved.status,'MATCHED_EXPORTED_IDS');assert.equal(saved.comparison.matched,2);assert.equal(saved.comparison.outsidePeriodRows,1);assert.equal(saved.comparison.uniqueExportIds,2);assert.equal(saved.providerCoverage,'UNVERIFIED');assert.equal(saved.allowBudgetExecution,false);assert.equal((await read()).exports[0].currentStatus,'CURRENT');
 });
 await t.test('same count different IDs, timestamp and form conflicts are explicit; no count-only matching',async()=>{
  const c=await command();c.rows[0].leadgenId='999';let r=await save(c);assert.equal(r.status,'DISCREPANCIES');assert.equal(r.comparison.notInExport,1);assert.equal(r.comparison.notObserved,1);
  const d=await command();d.rows[0].acquiredAt=iso(date(-1)+'T01:00:00+07:00');r=await save(d);assert.equal(r.comparison.conflicts,1);assert.equal(r.comparison.notInExport,0);assert.equal(r.comparison.notObserved,0);
  const f=await command();f.rows[0].formId='999';r=await save(f);assert.equal(r.comparison.conflicts,1);assert.equal(r.comparison.differences[0].reason,'EXPORT_CONFLICT');
  const boundary=await command();boundary.rows[0].acquiredAt=iso(endAt);r=await save(boundary);assert.equal(r.comparison.conflicts,1);assert.equal(r.comparison.notInExport,0);assert.equal(r.comparison.differences[0].reason,'SOURCE_CONFLICT');
 });
 await t.test('duplicates remain explicit and a duplicated ID across cutoff cannot hide a timestamp conflict',async()=>{
  const c=await command();c.rows.push({...c.rows[0]});let r=await save(c);assert.equal(r.status,'DUPLICATE_ROWS');assert.equal(r.comparison.duplicateRows,1);
  c.rows[c.rows.length-1].acquiredAt=iso(endAt);r=await save(c);assert.equal(r.status,'DISCREPANCIES');assert.equal(r.comparison.conflicts,1);
 });
 await t.test('empty export with observed data is discrepancies; truly empty comparison is not proof of zero leads',async()=>{
  let r=await save(await command([]));assert.equal(r.comparison.notInExport,2);assert.equal(r.status,'DISCREPANCIES');
  const original=(await db.query('SELECT acquired_at FROM marketing_measurement.census_observations WHERE run_id=$1 ORDER BY leadgen_id',[run.id])).rows;
  await db.query('UPDATE marketing_measurement.census_observations SET acquired_at=$2 WHERE run_id=$1',[run.id,endAt]);try{r=await save(await command([]));assert.equal(r.status,'EMPTY_COMPARISON');assert.equal(r.providerCoverage,'UNVERIFIED');}finally{for(let i=0;i<3;i++)await db.query('UPDATE marketing_measurement.census_observations SET acquired_at=$3 WHERE run_id=$1 AND leadgen_id=$2',[run.id,String(100+i),original[i].acquired_at]);}
 });
 await t.test('exact concurrent replay preserves evidence; changed content/actor denied, stale context cannot create new evidence',async()=>{
  const c=await command(),key=randomUUID();const results=await Promise.all([save(c,key,actor,peers[0]),save(c,key,actor,peers[1])]);assert.equal(results.filter(x=>x.replayed).length,1);assert.equal(results[0].recordedAt,results[1].recordedAt);await assert.rejects(save({...c,sourceNote:c.sourceNote+' changed'},key),denied('23505'));await assert.rejects(save(c,key,second),denied('23505'));
  await db.query("UPDATE facebook_pages SET access_token='rotated-export' WHERE page_id='674'");try{await assert.rejects(save(c),denied('40001'));const replay=await save(cmd,request);assert.equal(replay.recordedAt,saved.recordedAt);assert.equal((await read()).exports[0].currentStatus,'STALE_CONTEXT');}finally{await db.query("UPDATE facebook_pages SET access_token='export-synthetic-private-token' WHERE page_id='674'");}
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[actor]);try{await assert.rejects(save(cmd,request),denied('42501'));}finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[actor]);}
 });
 await t.test('invalid command/rows, extra fields, future export and missing timezone are rejected by database',async()=>{
  const c=await command();for(const patch of [{providerCoverage:'COMPLETE'},{pageId:674},{rows:[{leadgenId:100,formId:'675',acquiredAt:iso(startAt)}]},{rows:[{leadgenId:'100',formId:'675',acquiredAt:iso(startAt),phone:'not-stored'}]},{rows:[{leadgenId:'100',formId:'675',acquiredAt:'2026-10-01T00:00:00'}]},{exportedAt:'2099-01-01T00:00:00.000Z'},{fileBytes:1048577},{columns:{id:'id',createdAt:'id',formId:null}}])await assert.rejects(save({...c,...patch}),denied('22023'));
 });
 await t.test('late receipt for an already declared form invalidates current evidence without modifying historical receipt',async()=>{
  const c=await command(),key=randomUUID(),before=await save(c,key);await query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'674',formId:'675',leadgenId:'674999'}]),'a'.repeat(64)]);
  const current=await read();assert.notEqual(current.contextVersion,c.contextVersion);assert.equal(current.exports[0].currentStatus,'STALE_CONTEXT');await assert.rejects(save(c),denied('40001'));const replay=await save(c,key);assert.equal(replay.recordedAt,before.recordedAt);assert.deepEqual(replay.comparison,before.comparison);
 });
 await t.test('scope change while save waits for audit append rolls back evidence rather than publishing stale comparison',async()=>{
  const c=await command(),key=randomUUID();await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('marketing-export-request:'||$1::text,0))",[key]);const pending=save(c,key,actor,peers[1]).then(v=>({v}),e=>({e}));
  try{let blocked=false;for(let n=0;n<100;n++){const result=await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT marketing_source_export_record%' ");if(result.rows[0].n){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(blocked);await db.query("UPDATE facebook_pages SET access_token='changed-during-export' WHERE page_id='674'");}finally{await db.query('COMMIT');}
  try{assert.equal((await pending).e?.code,'40001');assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.source_exports WHERE request_id=$1',[key])).rows[0].n,0);}finally{await db.query("UPDATE facebook_pages SET access_token='export-synthetic-private-token' WHERE page_id='674'");}
 });
 await t.test('late receipt committed after comparison but before evidence append aborts the whole save',async()=>{
  const c=await command(),key=randomUUID();await db.query("CREATE FUNCTION public.export_test_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_lock(674012);PERFORM pg_advisory_unlock(674012);RETURN NEW;END $$;CREATE TRIGGER export_test_barrier BEFORE INSERT ON marketing_measurement.source_exports FOR EACH ROW EXECUTE FUNCTION public.export_test_barrier()");
  await db.query('SELECT pg_advisory_lock(674012)');const pending=save(c,key,actor,peers[1]).then(v=>({v}),e=>({e}));
  try{let blocked=false;for(let n=0;n<100;n++){if((await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT marketing_source_export_record%' ")).rows[0].n){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(blocked);await query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'674',formId:'675',leadgenId:'674998'}]),'b'.repeat(64)],peers[2]);}
  finally{await db.query('SELECT pg_advisory_unlock(674012)');}
  try{assert.equal((await pending).e?.code,'40001');assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.source_exports WHERE request_id=$1',[key])).rows[0].n,0);}finally{await db.query('DROP TRIGGER export_test_barrier ON marketing_measurement.source_exports;DROP FUNCTION public.export_test_barrier()');}
 });
};
