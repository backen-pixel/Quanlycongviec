'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const enabled=process.env.VPT_RESTORE_REHEARSAL==='1';
const securityBaseline=process.env.FB_INTAKE_SECURITY_BASELINE||'legacy';
const quote=x=>'"'+x.replace(/"/g,'""')+'"';
const scope="n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'";
const hash=x=>createHash('sha256').update(x).digest('hex');
// NULL means the object's default privileges, not an empty grant set.
// pg_dump can canonicalize explicit owner-only grants to NULL on restore.
const acl=(x,defaults)=>`coalesce((SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(${defaults?`coalesce(${x},${defaults})`:x}) a),'[]'::jsonb)`;
async function inventory(db){
 const tables=(await db.query(`SELECT n.nspname s,c.relname n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind='r' ORDER BY 1,2`)).rows;
 const data={};for(const r of tables){const key=r.s+'.'+r.n;data[key]=(await db.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY to_jsonb(x)::text),'')) digest FROM ${quote(r.s)}.${quote(r.n)} x`)).rows[0];}
 const schemas=(await db.query(`SELECT n.nspname,n.nspowner::regrole::text owner,${acl('n.nspacl',"acldefault('n',n.nspowner)")} acl FROM pg_namespace n WHERE ${scope} ORDER BY 1`)).rows;
 const relations=(await db.query(`SELECT n.nspname,c.relname,c.relkind,c.relowner::regrole::text owner,c.relrowsecurity,c.relforcerowsecurity,${acl('c.relacl',"acldefault((CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::\"char\",c.relowner)")} acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind IN('r','S','v','m') ORDER BY 1,2`)).rows;
 const columns=(await db.query(`SELECT n.nspname,c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) default_expr,${acl('a.attacl')} acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE ${scope} AND c.relkind IN('r','v','m') ORDER BY 1,2,a.attnum`)).rows;
 const constraints=(await db.query(`SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} ORDER BY 1,2,3`)).rows;
 const triggers=(await db.query(`SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND NOT t.tgisinternal ORDER BY 1,2,3`)).rows;
 const functions=(await db.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner::regrole::text owner,${acl('p.proacl',"acldefault('f',p.proowner)")} acl,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${scope} AND p.prokind='f' ORDER BY 1,2,3`)).rows;
 const policies=(await db.query("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname NOT LIKE 'pg_%' ORDER BY 1,2,3")).rows;
 const defaultPrivileges=(await db.query(`SELECT pg_get_userbyid(d.defaclrole) owner,coalesce(n.nspname,'<global>') namespace,d.defaclobjtype,${acl('d.defaclacl')} acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3`)).rows;
 const indexes=(await db.query("SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname NOT LIKE 'pg_%' ORDER BY 1,2,3")).rows;
 const sequences={};for(const r of relations.filter(x=>x.relkind==='S'))sequences[r.nspname+'.'+r.relname]=(await db.query(`SELECT last_value::text,is_called FROM ${quote(r.nspname)}.${quote(r.relname)}`)).rows[0];
 const sequenceDefinitions=(await db.query(`SELECT n.nspname,c.relname,format_type(s.seqtypid,NULL) type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} ORDER BY 1,2`)).rows;
 return{data,schema:{schemas,relations,columns,constraints,triggers,functions,policies,defaultPrivileges,indexes,sequenceDefinitions},sequences};
}
test('isolated logical backup restores business state, authority and maintenance control',{skip:!enabled,timeout:240000},async t=>{
 assert.equal(process.env.CI,'true');
 assert.ok(['legacy','700'].includes(securityBaseline));
 const expectedMajor=Number(process.env.VPT_RESTORE_TEST_PG_MAJOR||'16');assert.ok([16,17].includes(expectedMajor));
 const {Client}=require('pg');
 const urls=[process.env.FB_INTAKE_TEST_DATABASE_URL,process.env.FB_RESTORE_TEST_DATABASE_URL].map((value,i)=>{
  const u=new URL(value);assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.username,'postgres');
  assert.equal(u.password,'isolated_test_only');assert.equal(u.pathname,i?'/fb_intake_restore_test':'/fb_intake_test');assert.equal(u.port,i?'5433':'5432');assert.equal(u.search,'');return u.toString();
 });
 const containers=[process.env.VPT_SOURCE_CONTAINER,process.env.VPT_RESTORE_CONTAINER];
 containers.forEach(x=>assert.match(x,/^[a-f0-9]{64}$/));assert.notEqual(...containers);
 const source=new Client({connectionString:urls[0]}),target=new Client({connectionString:urls[1]}),peer=new Client({connectionString:urls[1]});
 await source.connect();await target.connect();await peer.connect();
 const plan=db=>db.query('SELECT crm_legacy_hold.restore_plan() r').then(x=>x.rows[0].r);
 const inspect=db=>db.query('SELECT crm_legacy_hold.inspect() r').then(x=>x.rows[0].r);
 const call=(args,db=target)=>db.query('SELECT crm_legacy_hold.rebind_restored_manifest($1,$2,$3,$4,$5,$6) r',args).then(x=>x.rows[0].r);
 const release='Synthetic approved restore rehearsal, no production operations';
 let before,archive,sourcePlan,sourceCost,operator,command,targetPrepared=false;
 try{
  for(const db of[source,target,peer])await db.query("SET timezone='UTC';SET search_path=pg_catalog,public");
  await t.test(`source and empty target are distinct isolated PostgreSQL${expectedMajor} clusters`,async()=>{
   const identities=await Promise.all([source,target].map(db=>db.query('SELECT system_identifier::text id FROM pg_control_system()')));
   assert.notEqual(identities[0].rows[0].id,identities[1].rows[0].id);
   for(const db of[source,target])assert.equal(Math.floor(Number((await db.query('SHOW server_version_num')).rows[0].server_version_num)/10000),expectedMajor);
   assert.equal(Object.keys((await inventory(target)).data).length,0);
   // Roles are cluster globals, intentionally provisioned as NOLOGIN on the
   // empty test target. This is not a backup of real platform/auth roles.
   const roles=(await source.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') ORDER BY rolname")).rows;
   assert.equal(roles.length,3);for(const r of roles){for(const key of['rolsuper','rolcreaterole','rolcreatedb','rolcanlogin','rolreplication'])assert.equal(r[key],false);assert.equal(r.rolbypassrls,securityBaseline==='700'&&r.rolname==='service_role');}
   await target.query('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN');
   if(securityBaseline==='700')await target.query('ALTER ROLE service_role BYPASSRLS');
   assert.deepEqual((await target.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') ORDER BY rolname")).rows,roles);
   targetPrepared=true;
  });
  if(!targetPrepared)return; // The failed prerequisite already fails the suite; do not restore after it.
  await t.test('dump and reference digests share an exported snapshot with the source held',async()=>{
   const sql=fs.readFileSync(path.resolve(__dirname,'../../database/697_crm_legacy_hold_restore.sql'),'utf8');await source.query(sql);await source.query(sql);
   // Nonempty sequence evidence: UUID-only business fixtures would otherwise
   // allow an empty sequence comparison to pass without exercising restore.
   await source.query("CREATE SCHEMA restore_fixture;CREATE SEQUENCE restore_fixture.called AS bigint INCREMENT 3 START 7 MAXVALUE 99999 CYCLE;CREATE SEQUENCE restore_fixture.uncalled AS bigint INCREMENT 5 START 11 MAXVALUE 99999;SELECT setval('restore_fixture.called',700,true);SELECT setval('restore_fixture.uncalled',901,false);GRANT USAGE ON SEQUENCE restore_fixture.called TO service_role");
   const state=await inspect(source);if(!state.state.active)await source.query('SELECT crm_legacy_hold.set_hold($1,$2,true,$3,$4)',[randomUUID(),state.state.revision,state.manifestHash,release]);
   sourcePlan=await plan(source);assert.equal(sourcePlan.needsRebind,false);assert.equal(sourcePlan.state.active,true);
   operator=(await source.query("SELECT u.id,u.company_id FROM users u JOIN companies c ON c.id=u.company_id JOIN tenants t ON t.id=c.tenant_id WHERE u.role='admin' AND u.is_active AND c.is_active AND t.is_active AND u.tenant_id=c.tenant_id AND EXISTS(SELECT 1 FROM crm_care_control.inference_policies p JOIN crm_care_control.inference_receipts r ON r.policy_id=p.id WHERE p.company_id=c.id AND r.state IN('AUTHORIZED','UNKNOWN')) ORDER BY u.id LIMIT 1")).rows[0];assert.ok(operator);
   sourceCost=(await source.query('SELECT crm_care_inference_costs($1,$2) r',[operator.id,operator.company_id])).rows[0].r;
   await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   try{
    before=await inventory(source);
    assert.ok(Object.keys(before.sequences).length>=2);
    assert.deepEqual(before.sequences['restore_fixture.called'],{last_value:'700',is_called:true});
    assert.deepEqual(before.sequences['restore_fixture.uncalled'],{last_value:'901',is_called:false});
    const snapshot=(await source.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
    assert.match(snapshot,/^[A-F0-9-]+$/);
    archive=execFileSync('docker',['exec',containers[0],'pg_dump','-U','postgres','-d','fb_intake_test','-Fc','--snapshot='+snapshot],{maxBuffer:64*1024*1024,timeout:90000});
   }finally{await source.query('ROLLBACK');}
   assert.equal(archive.subarray(0,5).toString(),'PGDMP');
   for(const table of['public.customers','public.crm_leads','public.crm_care_events','crm_survey_control.bookings','crm_survey_control.handoffs','crm_care_control.inference_receipts'])assert.ok(Number(before.data[table]?.rows)>0,table+' has exercised fixture data');
   t.diagnostic('archive SHA256 '+hash(archive)+'; '+archive.length+' bytes; '+Object.keys(before.data).length+' tables');
  });
  await t.test('full archive restores data, sequences, schema, FK, policies and ACLs without omission',async()=>{
   execFileSync('docker',['exec','-i',containers[1],'pg_restore','-U','postgres','-d','fb_intake_restore_test','--single-transaction','--exit-on-error'],{input:archive,maxBuffer:1024*1024,timeout:90000});
   assert.deepEqual(await inventory(target),before);
   await assert.rejects(inspect(target),e=>e.code==='55000');
   const p=await plan(target);assert.equal(p.sourceHash,sourcePlan.sourceHash);assert.equal(p.needsRebind,true);assert.notEqual(p.targetHash,sourcePlan.targetHash);assert.equal(p.state.active,true);
   command=[randomUUID(),p.state.revision,p.sourceHash,p.targetHash,'Synthetic archive SHA256 '+hash(archive),release];
  });
  await t.test('restored roles cannot read private evidence, rebind or bypass the held business tables',async()=>{
   // Normalizing default ACLs must still detect an actual privilege change.
   await target.query('BEGIN');try{
    await target.query('GRANT SELECT ON crm_care_control.inference_receipts TO PUBLIC');
    assert.notDeepEqual((await inventory(target)).schema.relations,before.schema.relations);
   }finally{await target.query('ROLLBACK');}
   assert.deepEqual(await inventory(target),before);
   for(const role of['anon','authenticated','service_role']){await target.query('SET ROLE '+role);try{
    await assert.rejects(target.query('SELECT * FROM crm_care_control.inference_receipts'),e=>e.code==='42501');
    await assert.rejects(plan(target),e=>e.code==='42501');await assert.rejects(call(command),e=>e.code==='42501');
   }finally{await target.query('RESET ROLE');}}
   await assert.rejects(target.query('DELETE FROM public.customers WHERE false'),e=>e.code==='55000');
  });
  await t.test('wrong hashes, stale revision, missing evidence and a damaged guard cannot rebind',async()=>{
   for(const [index,value,code]of[[1,command[1]+1,'40001'],[2,'0'.repeat(64),'40001'],[3,'0'.repeat(64),'40001'],[4,'short','22023']]){
    const altered=[...command];altered[index]=value;await assert.rejects(call(altered),e=>e.code===code);
   }
   await target.query('BEGIN');try{await target.query('ALTER TABLE public.notifications DISABLE TRIGGER a_crm_legacy_write_hold');await assert.rejects(call(command),e=>e.code==='55000');}finally{await target.query('ROLLBACK');}
   assert.deepEqual(await inventory(target),before);
  });
  await t.test('missing or expanded graphs, changed trigger arguments and inheritance refuse restore binding',async()=>{
   for(const change of[
    "DELETE FROM crm_legacy_hold.manifest WHERE relation_name='public.notifications'",
    'CREATE TABLE public.restore_extra_child(id uuid,customer_id uuid REFERENCES public.customers(id))',
    "DROP TRIGGER a_crm_legacy_write_hold ON public.notifications;CREATE TRIGGER a_crm_legacy_write_hold BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.notifications FOR EACH STATEMENT EXECUTE FUNCTION crm_legacy_hold.guard('unexpected');ALTER TABLE public.notifications ENABLE ALWAYS TRIGGER a_crm_legacy_write_hold",
    'CREATE TABLE public.restore_inherited_child() INHERITS(public.notifications)'
   ]){await target.query('BEGIN');try{await target.query(change);await assert.rejects(call(command),e=>e.code==='55000');}finally{await target.query('ROLLBACK');}}
   assert.deepEqual(await inventory(target),before);
  });
  await t.test('observed table-lock timeout and unsupported isolation leave no partial binding or audit',async()=>{
   await target.query('BEGIN');await target.query('LOCK TABLE public.customers IN ACCESS EXCLUSIVE MODE');
   const pid=(await peer.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const pending=call(command,peer).then(value=>({value}),error=>({error}));
   try{
    let observed=false;for(let i=0;i<150;i++){await target.query('SELECT pg_stat_clear_snapshot()');
     observed=(await target.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock'",[pid])).rowCount>0;
     if(observed)break;await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(observed,true);assert.equal((await pending).error?.code,'55P03');
   }finally{await target.query('ROLLBACK');await pending;}
   await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await assert.rejects(call(command),e=>e.code==='0A000');}finally{await target.query('ROLLBACK');}
   assert.deepEqual(await inventory(target),before);
  });
  await t.test('OID permutation and inactive snapshots rebind atomically, roll back cleanly and always hold',async()=>{
   await target.query('BEGIN');try{
    const mappings=(await target.query('SELECT * FROM crm_legacy_hold.relations() ORDER BY relation_name')).rows;
    // Deliberately collide with other target OIDs; per-row UPDATE would fail
    // immediate UNIQUE(relation_oid). The final permutation remains unique.
    await target.query('DELETE FROM crm_legacy_hold.manifest');
    for(let i=0;i<mappings.length;i++)await target.query('INSERT INTO crm_legacy_hold.manifest VALUES($1,$2)',[mappings[i].relation_name,mappings[(i+1)%mappings.length].relation_oid]);
    await target.query('UPDATE crm_legacy_hold.state SET active=false WHERE singleton');const p=await plan(target);
    const r=await call([randomUUID(),p.state.revision,p.sourceHash,p.targetHash,command[4],release]);assert.equal(r.currentState.active,true);assert.equal((await inspect(target)).state.active,true);
   }finally{await target.query('ROLLBACK');}
   assert.deepEqual(await inventory(target),before);
  });
  await t.test('concurrent identical restore commands have one audited effect and leave every guarded table held',async()=>{
   const results=await Promise.all([call(command),call(command,peer)]);assert.equal(results.filter(x=>x.replayed).length,1);
   const v=await inspect(target);assert.equal(v.state.active,true);assert.equal(v.state.revision,command[1]+1);assert.equal(v.processesDrained,false);
   assert.equal((await target.query('SELECT count(*)::int n FROM crm_legacy_hold.restore_events')).rows[0].n,1);
   for(const row of v.manifest)await assert.rejects(target.query('DELETE FROM '+row.relation+' WHERE false'),e=>e.code==='55000');
   const after=await inventory(target);assert.deepEqual(after.schema,before.schema);assert.deepEqual(after.sequences,before.sequences);
   for(const [name,value]of Object.entries(before.data))if(!['crm_legacy_hold.manifest','crm_legacy_hold.state','crm_legacy_hold.restore_events'].includes(name))assert.deepEqual(after.data[name],value,name);
   const audit=(await target.query('SELECT * FROM crm_legacy_hold.restore_events')).rows[0];assert.equal(audit.command.backupReference,command[4]);assert.deepEqual(audit.source_manifest,sourcePlan.sourceManifest);
   assert.equal((await plan(target)).needsRebind,false);
  });
  await t.test('cost service and unresolved reservations survive restore; replay cannot reactivate after explicit release',async()=>{
   await target.query('SET ROLE service_role');let restoredCost;try{restoredCost=(await target.query('SELECT crm_care_inference_costs($1,$2) r',[operator.id,operator.company_id])).rows[0].r;}finally{await target.query('RESET ROLE');}
   assert.deepEqual(restoredCost.summary,sourceCost.summary);assert.equal(restoredCost.actualCostVnd,null);assert.ok(restoredCost.summary.pendingReceipts+restoredCost.summary.unknownReceipts>0);
   await target.query('BEGIN');try{
    const v=await inspect(target);await target.query('SELECT crm_legacy_hold.set_hold($1,$2,false,$3,$4,$5)',[randomUUID(),v.state.revision,v.manifestHash,release,'Synthetic isolated drain evidence, no worker started']);
    const replay=await call(command);assert.equal(replay.replayed,true);assert.equal(replay.currentState.active,false);assert.equal(replay.recordedState.active,true);assert.equal(replay.mayResume,false);
    await target.query('DELETE FROM public.customers WHERE false');
    const altered=[...command];altered[5]+=' changed';await assert.rejects(call(altered),e=>e.code==='23505');
   }finally{await target.query('ROLLBACK');}
   assert.equal((await inspect(target)).state.active,true);
  });
 }finally{await Promise.allSettled([source,target,peer].map(db=>db.end()));}
});
