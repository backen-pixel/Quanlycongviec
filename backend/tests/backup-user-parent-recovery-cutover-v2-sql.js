'use strict';
// Explicit combined-mode regressions; default 42-test script remains separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const recovery=require('../scripts/recover-backup-user-parent-20261015');
const v2=require('../scripts/prepare-replication-cutover-v2-20261015');
const {withDB,state,allPublicRows,snapshot,apply,armJournal,secret,keyId,S,STORE}=require('./backup-user-parent-recovery-sql');
const SQL=fs.readFileSync(path.resolve(__dirname,'../../database/20261015051758_replication_cutover_v2_preparation.sql'),'utf8');
const tests=[],test=(name,fn)=>tests.push({name,fn});
async function setup(pair) {
  const v1=await armJournal(pair);
  for(const db of [pair.primary,pair.backup]) await db.exec(SQL);
  const plan=await v2.prepare({...pair,env:{}}),epochs={primary:crypto.randomUUID(),backup:crypto.randomUUID()};
  const input={run_id:v1.run_id,manifest_sha256:plan.manifest_sha256,epochs};
  for(const [site,db] of [['primary',pair.primary],['backup',pair.backup]]) {
    await db.query(`INSERT INTO ${v2.NS}.runs(id,site,project_ref,manifest_sha256,manifest) VALUES($1,$2,$3,$4,$5::jsonb)`,
      [input.run_id,site,site==='primary'?recovery.PRIMARY:recovery.BACKUP,input.manifest_sha256,JSON.stringify(plan.descriptor)]);
    const initial=crypto.randomUUID();await db.query(`INSERT INTO ${v2.NS}.control(singleton,run_id,epoch) VALUES(true,$1,$2)`,[input.run_id,initial]);
    for(const t of plan.descriptor.sites[site].tables.filter(t=>['users','departments'].includes(t.name))) {
      await db.query(`INSERT INTO ${v2.NS}.registrations(table_oid,table_name,run_id,key_columns,key_types,mode,catalog_sha256) VALUES($1::oid,$2,$3,$4::text[],$5::text[],$6,$7)`,
        [t.oid,t.name,input.run_id,t.key_columns,t.key_types,t.mode,t.catalog_sha256]);
      await db.exec(`CREATE TRIGGER ${v2.FENCE_TRIGGER} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.${t.name} FOR EACH STATEMENT EXECUTE FUNCTION ${v2.NS}.write_fence();
        ALTER TABLE public.${t.name} ENABLE ALWAYS TRIGGER ${v2.FENCE_TRIGGER}`);
    }
    await db.query(`SELECT ${v2.NS}.transition_fence($1,$2,$3,true,clock_timestamp()+interval '10 minutes','closing_capture')`,[input.run_id,initial,epochs[site]]);
  }
  return input;
}
const snap=(pair,input)=>recovery.recover({...pair,mode:'snapshot',secret,keyId,cutoverV2:input});
const commit=(pair,input,saved)=>recovery.recover({...pair,mode:'apply',secret,keyId,cutoverV2:input,snapshotId:saved.snapshot_id});
async function unchanged(pair,before,saved) {
  assert.deepEqual(await allPublicRows(pair.backup),before);
  assert.deepEqual((await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[saved.snapshot_id])).rows[0],{applied_at:null,result:null});
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${v2.NS}.permits`)).rows[0].n,0);
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${v2.NS}.fence_audit WHERE action='permit'`)).rows[0].n,0);
}

test('explicit combined context admits exact fences, preserves v1 hashes and uses one backup transaction permit for exactly three journaled writes',()=>withDB(async pair=>{
  const input=await setup(pair),before=await state(pair.primary);
  const registrations=(await pair.backup.query('SELECT * FROM vpt_cutover_20261015.registrations ORDER BY table_name')).rows;
  await assert.rejects(()=>recovery.recover(pair),e=>e.recoveryCode==='RECOVERY_TRIGGER_CHANGED');
  const dry=await recovery.recover({...pair,cutoverV2:input});assert.equal(dry.production_rows_changed,0);
  const saved=await snap(pair,input),raw=(await pair.backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[saved.snapshot_id])).rows[0],payload=recovery.decrypt(raw,secret,keyId);
  assert.deepEqual(payload.cutover_v2.input,input);
  assert.equal(payload.catalog.users.cutover_v2_fences.backup.tgtype,62);
  assert.notEqual(input.epochs.primary,input.epochs.backup);
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${v2.NS}.permits`)).rows[0].n,0);
  assert.deepEqual((await commit(pair,input,saved)).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
  assert.deepEqual((await pair.backup.query('SELECT * FROM vpt_cutover_20261015.registrations ORDER BY table_name')).rows,registrations);
  assert.deepEqual(await state(pair.primary),before);
  const permits=(await pair.backup.query(`SELECT operations,cardinality(table_oids) n,transaction_id::text FROM ${v2.NS}.permits`)).rows;
  assert.equal(permits.length,1);assert.deepEqual(permits[0].operations,['INSERT','UPDATE']);assert.equal(permits[0].n,2);
  assert.equal((await pair.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.permits`)).rows[0].n,0);
  const events=(await pair.backup.query('SELECT transaction_id::text FROM vpt_cutover_20261015.events')).rows;
  assert.equal(events.length,3);assert.ok(events.every(e=>e.transaction_id===permits[0].transaction_id));
  await assert.rejects(()=>pair.backup.query('UPDATE public.users SET full_name=full_name WHERE id=$1',[S.alias]),e=>e.code==='55000');
  await assert.rejects(()=>pair.backup.query('DELETE FROM public.users WHERE id=$1',[S.canonical]),e=>e.code==='55000');
}));

test('combined mode requires the same supplied run/manifest and each actual active unexpired site epoch',()=>withDB(async pair=>{
  const input=await setup(pair),saved=await snap(pair,input),before=await allPublicRows(pair.backup);
  for(const changed of [{...input,run_id:crypto.randomUUID()},{...input,manifest_sha256:'0'.repeat(64)},
    {...input,epochs:{...input.epochs,primary:input.epochs.backup}},{...input,epochs:{...input.epochs,backup:crypto.randomUUID()}}])
    await assert.rejects(()=>commit(pair,changed,saved),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_FENCE_REQUIRED');
  for(const [site,db] of [['primary',pair.primary],['backup',pair.backup]]) {
    await db.exec(`UPDATE ${v2.NS}.control SET deadline=clock_timestamp()-interval '1 second'`);
    await assert.rejects(()=>commit(pair,input,saved),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_FENCE_REQUIRED');
    await db.exec(`UPDATE ${v2.NS}.control SET deadline=clock_timestamp()+interval '10 minutes'`);
  }
  await unchanged(pair,before,saved);
}));

test('combined trigger and private function drift, generic capture or unknown triggers remain held',()=>withDB(async pair=>{
  const input=await setup(pair);
  const fn=v2.NS+'.write_fence()',original=(await pair.backup.query('SELECT pg_get_functiondef($1::regprocedure) d',[fn])).rows[0].d;
  await pair.backup.exec(`ALTER TABLE public.users DISABLE TRIGGER ${v2.FENCE_TRIGGER}`);
  await assert.rejects(()=>snap(pair,input),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_TRIGGER_CHANGED');
  await pair.backup.exec(`ALTER TABLE public.users ENABLE ALWAYS TRIGGER ${v2.FENCE_TRIGGER};ALTER FUNCTION ${fn} SECURITY INVOKER`);
  await assert.rejects(()=>snap(pair,input),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_PRIVATE_CONTRACT');
  await pair.backup.exec(original);
  await pair.backup.exec(`CREATE TRIGGER ${v2.CAPTURE_TRIGGER} AFTER INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION ${v2.NS}.capture_digest();ALTER TABLE public.users ENABLE ALWAYS TRIGGER ${v2.CAPTURE_TRIGGER}`);
  await assert.rejects(()=>snap(pair,input),e=>e.recoveryCode==='RECOVERY_TRIGGER_CHANGED');
}));

test('combined registration/catalog drift or old pre-fence snapshot cannot be silently adopted',()=>withDB(async pair=>{
  const old=await snapshot(pair),input=await setup(pair);
  await assert.rejects(()=>commit(pair,input,old),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_STATE_CHANGED');
  await pair.backup.exec(`UPDATE ${v2.NS}.registrations SET catalog_sha256=repeat('0',64) WHERE table_name='users'`);
  await assert.rejects(()=>snap(pair,input),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_REGISTRATION_CHANGED');
}));

test('combined repair fault rolls back permit/audit, all public rows, v1 journal and snapshot marker',()=>withDB(async pair=>{
  const input=await setup(pair),saved=await snap(pair,input),before=await allPublicRows(pair.backup);let fired=false;
  const backup={query:async(sql,args)=>{if(!fired && sql.startsWith('INSERT INTO public.\"users\"')){fired=true;throw Object.assign(new Error('synthetic private detail'),{code:'23505'});}return pair.backup.query(sql,args);}};
  await assert.rejects(()=>commit({...pair,backup},input,saved),e=>e.code==='23505');
  assert.ok(fired);await unchanged(pair,before,saved);
  assert.equal((await pair.backup.query('SELECT count(*)::int n FROM vpt_cutover_20261015.events')).rows[0].n,0);
}));

test('combined permit relation/operation scope is verified before any repair write',()=>withDB(async pair=>{
  const input=await setup(pair),saved=await snap(pair,input),before=await allPublicRows(pair.backup);
  for(const fault of ['relation','operation']) {
    let fired=false;
    const backup={query:async(sql,args)=>{
      if(sql.startsWith(`SELECT ${v2.NS}.mint_permit(`)) {
        fired=true;
        if(fault==='relation') return pair.backup.query(sql,[args[0],args[1],args[2].slice(0,1)]);
        return pair.backup.query(sql.replace("ARRAY['INSERT','UPDATE']::text[]","ARRAY['DELETE']::text[]"),args);
      }
      return pair.backup.query(sql,args);
    }};
    await assert.rejects(()=>commit({...pair,backup},input,saved),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_PERMIT_CHANGED');
    assert.ok(fired);await unchanged(pair,before,saved);
  }
}));

test('expired control after repair writes aborts before COMMIT and rolls back the full transaction',()=>withDB(async pair=>{
  const input=await setup(pair),saved=await snap(pair,input),before=await allPublicRows(pair.backup);let fired=false;
  const backup={query:async(sql,args)=>{
    const result=await pair.backup.query(sql,args);
    if(!fired && sql.startsWith(`UPDATE ${STORE} SET applied_at`)) {
      fired=true;await pair.backup.exec(`UPDATE ${v2.NS}.control SET deadline=clock_timestamp()-interval '1 second'`);
    }
    return result;
  }};
  await assert.rejects(()=>commit({...pair,backup},input,saved),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_FENCE_REQUIRED');
  assert.ok(fired);await unchanged(pair,before,saved);
  assert.equal((await pair.backup.query('SELECT count(*)::int n FROM vpt_cutover_20261015.events')).rows[0].n,0);
}));

test('combined CLI/API context is explicit and malformed or partial scopes cannot enable the mode',async()=>{
  assert.deepEqual(recovery.parseArgs(['--dry-run','--cutover-v2-context','reviewed.json']),{mode:'dry-run',snapshotId:undefined,cutoverV2ContextFile:'reviewed.json'});
  assert.throws(()=>recovery.parseArgs(['--cutover-v2-context']),/RECOVERY_ARGUMENT_INVALID/);
  await assert.rejects(()=>recovery.recover({cutoverV2:{run_id:crypto.randomUUID()}}),e=>e.recoveryCode==='RECOVERY_CUTOVER_V2_CONTEXT_INVALID');
  assert.equal(Object.isFrozen(recovery.CUTOVER_V2_REPAIR_CONTRACT),true);
  assert.equal(recovery.CUTOVER_V2_REPAIR_CONTRACT.version,'cutover_v2_parent_repair_v1');
  assert.equal(typeof recovery.journalPrivateStore,'function');
});

async function runCombinedTests(){let passed=0;for(const t of tests){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name);console.error(e.stack);process.exitCode=1;break;}}
 console.log(`${passed}/${tests.length} actual PostgreSQL combined cutover recovery tests passed.`);
 return {passed,total:tests.length};
}
if(require.main===module)runCombinedTests().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={runCombinedTests};
