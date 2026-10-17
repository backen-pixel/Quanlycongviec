'use strict';
// Actual isolated PostgreSQL. The only runtime substitution is the fixed base
// manifest literal, because synthetic catalogs cannot have production OIDs/hash.
// No production connection/env, dotenv, RPC or data is used by this fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const fixture=require('./backup-user-parent-recovery-sql');
const oldRepair=require('../scripts/recover-backup-user-parent-20261015');
const v1=require('../scripts/preserve-replication-cutover-20261015'),v2=require('../scripts/prepare-replication-cutover-v2-20261015');
const oldLife=require('../scripts/coordinate-replication-cutover-v2-20261015');
const productionRepair=require('../scripts/recover-backup-user-parent-v3-20261016');
const SQL1=fs.readFileSync(path.resolve(__dirname,'../../database/20261015050417_replication_cutover_preservation.sql'),'utf8');
const SQL2=fs.readFileSync(path.resolve(__dirname,'../../database/20261015051758_replication_cutover_v2_preparation.sql'),'utf8');
const SQL3=fs.readFileSync(path.resolve(__dirname,'../../database/20261016135104_replication_cutover_scope_revision.sql'),'utf8');
const ENV={SUPABASE_REPLICATION_LIGHT:'1'},NS=v2.NS,REV='vpt_cutover_scope_v3_20261016';
const {withDB,state,allPublicRows,secret,keyId,S,STORE}=fixture;
const tests=[],test=(name,fn)=>tests.push({name,fn});
function compilePair(baseSha){
  let life,repair;
  function load(name){const filename=path.resolve(__dirname,'../scripts',name+'.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
    const original=m.require.bind(m);m.require=request=>request==='./coordinate-replication-cutover-v3-20261016'?life:request==='./recover-backup-user-parent-v3-20261016'?repair:original(request);
    const source=fs.readFileSync(filename,'utf8');assert.equal(source.split(productionRepair.BASE_MANIFEST_SHA).length,2,'only the hardcoded base literal is substituted');
    m._compile(source.replace(productionRepair.BASE_MANIFEST_SHA,baseSha),filename);return m.exports;}
  life=load('coordinate-replication-cutover-v3-20261016');repair=load('recover-backup-user-parent-v3-20261016');return {life,repair};
}
function review(p,life,plan,actions){const now=Date.now();return {version:life===oldLife?'cutover_source_review_v1':'cutover_source_review_v3',review_id:crypto.randomUUID(),
  run_id:p.runId,manifest_sha256:plan.manifest_sha256,...(life===oldLife?{}:{base_manifest_sha256:p.basePlan.manifest_sha256,sql_v3_sha256:v2.hash(Buffer.from(SQL3))}),
  sql_v2_sha256:v2.hash(Buffer.from(SQL2)),reviewed_sources:life.sourceHashes(),actions,
  reviewed_at:new Date(now-1000).toISOString(),expires_at:new Date(now+12*60000).toISOString()};}
async function capacity(p,site,plan){const now=new Date().toISOString(),measurements=[];
  for(const e of plan.descriptor.sites[site].tables){const scalar=(await p[site].query(`SELECT count(*)::text rows,coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text raw_bytes,coalesce(sum(octet_length(to_jsonb(to_jsonb(t)::text)::text)),0)::text encoded_bytes,coalesce(max(octet_length(to_jsonb(t)::text)),0)::text max_row_bytes FROM public."${e.name}" t`)).rows[0];measurements.push({table:e.name,measured_at:now,basis:'postgres_to_jsonb_text_utf8',...scalar});}
  return {version:2,site,project_ref:site==='primary'?oldRepair.PRIMARY:oldRepair.BACKUP,run_id:p.runId,manifest_sha256:plan.manifest_sha256,
    issued_at:now,expires_at:new Date(Date.now()+12*60000).toISOString(),ui:{measured_at:now,allocated_bytes:'12000000000',used_bytes:'2000000000',free_bytes:'10000000000',wal_included_in_used:true},
    reserves:{wal_bytes:'1073741824',temp_bytes:'268435456',safety_bytes:'536870912',journal_bytes:'134217728'},
    retained_capture_count:2,metadata_raw_bytes:String(Buffer.byteLength(v2.stable(plan.descriptor))+65536),measurements};}
async function action(p,life,plan,site,kind,extra={}){return life.runAction(p[site],{site,action:kind,env:ENV,runId:p.runId,plan,
  approval:review(p,life,plan,life.ACTIONS),capacity:await capacity(p,site,plan),...extra});}
async function setup(pair,{activate=true,register=true,init=true}={}){
  const p={...pair,runId:productionRepair.V3_RUN};
  for(const db of [p.primary,p.backup]){await db.exec('CREATE TABLE public.project_substage_status(id uuid PRIMARY KEY,value text);CREATE TABLE public.trash_items(id uuid PRIMARY KEY,snapshot jsonb);');await db.exec(SQL1);await db.exec(SQL2);}
  await v1.preserve({...p,mode:'arm',runId:p.runId,env:ENV});p.basePlan=await v2.prepare({...p,env:ENV});
  for(const site of ['primary','backup']){await action(p,oldLife,p.basePlan,site,'init',{newEpoch:crypto.randomUUID()});
    const names=p.basePlan.descriptor.sites[site].tables.map(t=>t.name);for(let i=0;i<names.length;i+=5)await action(p,oldLife,p.basePlan,site,'register',{tables:names.slice(i,i+5)});
    await p[site].exec(SQL3);}
  await p.primary.exec('CREATE TABLE public._bulk_hoanthanh_sx_20261016(id uuid PRIMARY KEY,value text);');
  Object.assign(p,compilePair(p.basePlan.manifest_sha256));p.plan=p.life.createRevisionPlan(p.basePlan,await v2.prepare({...p,env:ENV}));
  if(init)for(const site of ['primary','backup'])await action(p,p.life,p.plan,site,'init');
  if(register)await action(p,p.life,p.plan,'primary','register',{tables:['_bulk_hoanthanh_sx_20261016']});
  const epochs={};for(const site of ['primary','backup']){const expectedEpoch=(await p[site].query(`SELECT epoch FROM ${NS}.control`)).rows[0].epoch;
    epochs[site]=activate?crypto.randomUUID():expectedEpoch;
    if(activate)await action(p,p.life,p.plan,site,'activate',{expectedEpoch,newEpoch:epochs[site],deadline:new Date(Date.now()+10*60000).toISOString()});}
  p.context={run_id:p.runId,base_manifest_sha256:p.basePlan.manifest_sha256,manifest_sha256:p.plan.manifest_sha256,epochs};return p;
}
function approval(p,actions=['repair-snapshot','repair-apply']){return review(p,p.life,p.plan,actions);}
function run(p,mode='dry-run',extra={}){return p.repair.recover({primary:p.primary,backup:p.backup,cutoverV3:p.context,mode,secret,keyId,approval:approval(p),...extra});}
async function pair(fn){return withDB(async raw=>fn(await setup(raw)));}
async function pristine(p,before,saved){assert.deepEqual(await allPublicRows(p.backup),before);
  if(saved)assert.deepEqual((await p.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[saved.snapshot_id])).rows[0],{applied_at:null,result:null});
  assert.equal((await p.backup.query(`SELECT count(*)::int n FROM ${NS}.permits`)).rows[0].n,0);}

test('v3 scoped snapshot/apply preserves old manifests, exact3 rows and authenticated revision/epochs',()=>pair(async p=>{
  const oldRegs=(await p.backup.query('SELECT * FROM vpt_cutover_20261015.registrations ORDER BY table_name')).rows;
  const oldRun=(await p.backup.query(`SELECT * FROM ${NS}.runs`)).rows,primaryBefore=await state(p.primary);
  assert.equal((await run(p)).production_rows_changed,0);const saved=await run(p,'snapshot'),r=(await p.backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[saved.snapshot_id])).rows[0];
  const clear=p.repair.decrypt(r,secret,keyId,p.context);assert.deepEqual(clear.cutover_v3.input,p.context);assert.equal(clear.cutover_v3.primary.plan.manifest_sha256,p.plan.manifest_sha256);
  assert.deepEqual((await run(p,'apply',{snapshotId:saved.snapshot_id})).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
  assert.deepEqual(await state(p.primary),primaryBefore);assert.deepEqual((await p.backup.query(`SELECT * FROM ${NS}.runs`)).rows,oldRun);
  assert.deepEqual((await p.backup.query('SELECT * FROM vpt_cutover_20261015.registrations ORDER BY table_name')).rows,oldRegs);
  const journal=(await p.backup.query('SELECT table_name,operation,transaction_id::text FROM vpt_cutover_20261015.events ORDER BY id')).rows;
  assert.equal(journal.length,3);assert.equal(new Set(journal.map(e=>e.transaction_id)).size,1);
  assert.deepEqual(journal.map(e=>e.table_name+':'+e.operation),['users:UPDATE','departments:INSERT','users:INSERT']);
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.permits`)).rows[0].n,0);
  await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id}),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_MISSING_OR_APPLIED');
  assert.equal((await p.backup.query('SELECT count(*)::int n FROM vpt_cutover_20261015.events')).rows[0].n,3);
}));
test('wrong revision/base/epoch or old approval cannot change rows or mark snapshot',()=>pair(async p=>{
  const saved=await run(p,'snapshot'),before=await allPublicRows(p.backup);
  for(const cutoverV3 of [{...p.context,manifest_sha256:'0'.repeat(64)},{...p.context,base_manifest_sha256:'0'.repeat(64)},
    {...p.context,epochs:{...p.context.epochs,backup:crypto.randomUUID()}},{...p.context,epochs:{...p.context.epochs,primary:crypto.randomUUID()}}])
    await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,cutoverV3}));
  await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,approval:{...approval(p),version:'cutover_source_review_v1'}}));
  await pristine(p,before,saved);
}));
test('altered preexisting catalog and missing addition hooks fail before any repair/snapshot write',()=>pair(async p=>{
  const before=await allPublicRows(p.backup);await p.backup.exec('ALTER TABLE public.crm_leads ADD COLUMN synthetic_drift text');
  await assert.rejects(()=>run(p,'snapshot'));await p.backup.exec('ALTER TABLE public.crm_leads DROP COLUMN synthetic_drift');
  await p.primary.exec(`ALTER TABLE public._bulk_hoanthanh_sx_20261016 DISABLE TRIGGER ${v2.FENCE_TRIGGER}`);
  await assert.rejects(()=>run(p,'snapshot'));await p.primary.exec(`ALTER TABLE public._bulk_hoanthanh_sx_20261016 ENABLE ALWAYS TRIGGER ${v2.FENCE_TRIGGER}`);
  assert.equal((await p.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,0);await pristine(p,before);
}));
test('fault during third write atomically rolls back permit/journal/snapshot marker and all rows',()=>pair(async p=>{
  const saved=await run(p,'snapshot'),before=await allPublicRows(p.backup);let hit=false;
  const backup={query:async(sql,args)=>{if(!hit&&sql.startsWith('INSERT INTO public."users"')){hit=true;throw Object.assign(Error('synthetic private'),{code:'23505'});}return p.backup.query(sql,args);}};
  await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,backup}),e=>e.code==='23505');assert(hit);await pristine(p,before,saved);
  assert.equal((await p.backup.query('SELECT count(*)::int n FROM vpt_cutover_20261015.events')).rows[0].n,0);
}));
test('fence expiry after repair writes rolls back before COMMIT',()=>pair(async p=>{
  const saved=await run(p,'snapshot'),before=await allPublicRows(p.backup);let hit=false;
  const backup={query:async(sql,args)=>{const result=await p.backup.query(sql,args);if(!hit&&sql.startsWith(`UPDATE ${STORE} SET applied_at`)){
    hit=true;await p.backup.exec(`UPDATE ${NS}.control SET deadline=clock_timestamp()-interval '1 second'`);}return result;}};
  await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,backup}),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_FENCE_REQUIRED');assert(hit);await pristine(p,before,saved);
}));
test('source approval expires after repair writes and the complete transaction rolls back',()=>pair(async p=>{
  const saved=await run(p,'snapshot'),before=await allPublicRows(p.backup),currentReview=approval(p);let hit=false;
  const backup={query:async(sql,args)=>{const r=await p.backup.query(sql,args);if(!hit&&sql.startsWith(`UPDATE ${STORE} SET applied_at`)){
    hit=true;currentReview.expires_at=new Date(Date.now()-1000).toISOString();}return r;}};
  await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,backup,approval:currentReview}),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_APPROVAL_REQUIRED');
  assert(hit);await pristine(p,before,saved);assert.equal((await p.backup.query('SELECT count(*)::int n FROM vpt_cutover_20261015.events')).rows[0].n,0);
}));
test('old v2 snapshot is not adoptable even with the same current v2 fences and base run',()=>pair(async p=>{
  const oldSnapshot=await oldRepair.recover({primary:p.primary,backup:p.backup,secret,keyId,mode:'snapshot',
    cutoverV2:{run_id:p.runId,manifest_sha256:p.basePlan.manifest_sha256,epochs:p.context.epochs}}),before=await allPublicRows(p.backup);
  await assert.rejects(()=>run(p,'apply',{snapshotId:oldSnapshot.snapshot_id}),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');await pristine(p,before,oldSnapshot);
}));
test('permit cannot widen operations or omit either exact repair table',()=>pair(async p=>{
  const saved=await run(p,'snapshot'),before=await allPublicRows(p.backup);
  for(const fault of ['operation','relation']){let hit=false;const backup={query:async(sql,args)=>{
    if(sql.startsWith(`SELECT ${NS}.mint_permit(`)){hit=true;return fault==='operation'
      ?p.backup.query(sql.replace("ARRAY['INSERT','UPDATE']::text[]","ARRAY['DELETE']::text[]"),args)
      :p.backup.query(sql,[args[0],args[1],args[2].slice(0,1)]);}return p.backup.query(sql,args);}};
    await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,backup}),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_PERMIT_CHANGED');assert(hit);await pristine(p,before,saved);}
}));
test('lost snapshot COMMIT ACK reports unknown with recoverable ID; no repair rows changed',()=>pair(async p=>{
  const before=await allPublicRows(p.backup);let snapshotId;
  const backup={query:async(sql,args)=>{const r=await p.backup.query(sql,args);if(sql==='COMMIT')throw Error('synthetic lost snapshot ACK');return r;}};
  await assert.rejects(()=>run(p,'snapshot',{backup}),e=>{snapshotId=e.snapshotId;return e.recoveryCode==='RECOVERY_COMMIT_OUTCOME_UNKNOWN'&&e.mode==='snapshot';});
  assert.deepEqual(await allPublicRows(p.backup),before);const row=(await p.backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[snapshotId])).rows[0];
  assert(row&&!row.applied_at);assert.deepEqual(p.repair.decrypt(row,secret,keyId,p.context).cutover_v3.input,p.context);
}));
test('lost COMMIT ACK reports unknown and fresh state proves one durable exact3 repair',()=>pair(async p=>{
  const saved=await run(p,'snapshot');let committed=false;
  const backup={query:async(sql,args)=>{const r=await p.backup.query(sql,args);if(sql==='COMMIT'){committed=true;throw Error('synthetic lost ACK');}return r;}};
  await assert.rejects(()=>run(p,'apply',{snapshotId:saved.snapshot_id,backup}),e=>e.recoveryCode==='RECOVERY_COMMIT_OUTCOME_UNKNOWN'&&e.snapshotId===saved.snapshot_id);assert(committed);
  assert((await p.backup.query(`SELECT applied_at FROM ${STORE} WHERE id=$1`,[saved.snapshot_id])).rows[0].applied_at);
  assert.equal((await p.backup.query('SELECT count(*)::int n FROM vpt_cutover_20261015.events')).rows[0].n,3);
  assert((await p.backup.query('SELECT id FROM public.users WHERE id=$1',[S.canonical])).rows.length===1);
}));
async function runV3RecoveryTests(){let passed=0;for(const t of tests){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name);console.error(e.stack);process.exitCode=1;break;}}
  console.log(`${passed}/${tests.length} actual isolated PostgreSQL v3 repair tests passed.`);return {passed,total:tests.length};}
if(require.main===module)runV3RecoveryTests().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={runV3RecoveryTests,compilePair,setup,approval,run,capacity,action,review,ENV};
