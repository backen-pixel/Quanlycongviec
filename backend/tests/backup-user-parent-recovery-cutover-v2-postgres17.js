'use strict';
// Genuine 17.6, synthetic loopback cluster only. Never loads dotenv or any
// application/production connection variable, and never drops preexisting DBs.
const names=Object.freeze({primary:'vpt_recovery_synthetic_primary',backup:'vpt_recovery_synthetic_backup'});
function check(ok){if(!ok)throw Error('SYNTHETIC_PG17_GUARD_REQUIRED');}
function testUrl(){
  check(process.env.VPT_CUTOVER_TEST_ONLY==='1');let url;
  try{url=new URL(process.env.VPT_CUTOVER_TEST_DATABASE_URL||'');}catch{check(false);}
  check(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  check(['/vpt_cutover_synthetic',...Object.values(names).map(n=>'/'+n)].includes(url.pathname));
  check(url.username==='postgres'&&!url.search&&!url.hash);return url;
}
async function createGuardedSyntheticDatabaseFactory(pgPath){
  const base=testUrl();check(typeof pgPath==='string'&&pgPath.length>0);
  const {Client}=require(pgPath),created=new Set(),ownedClients=new Map();
  async function connect(database){
    check(['postgres',...Object.values(names)].includes(database));const url=new URL(base);url.pathname='/'+database;
    const c=new Client({connectionString:url.toString(),ssl:false,connectionTimeoutMillis:5000,application_name:'vpt-combined-recovery-synthetic'});
    c.on('error',()=>{});try{await c.connect();await c.query("SET statement_timeout='10s';SET lock_timeout='2s'");return c;}catch(e){try{await c.end();}catch{}throw e;}
  }
  const admin=await connect('postgres');
  try{
    check((await admin.query("SELECT current_setting('server_version_num') AS n")).rows[0].n==='170006');
    const roles=(await admin.query("SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname=ANY(ARRAY['anon','authenticated','service_role','authenticator']) ORDER BY rolname")).rows;
    check(roles.length===4&&roles.find(r=>r.rolname==='service_role')?.rolbypassrls===true);
    const createSite=async site=>{
      check(typeof site==='string'&&Object.hasOwn(names,site));
      const name=names[site];check(Boolean(name)&&!created.has(name));
      // CREATE fails if the allowlisted DB already exists. Do not take it over.
      await admin.query('CREATE DATABASE "'+name+'"');created.add(name);const client=await connect(name);
      let closed=false;const sessions=new Set();
      const database={query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),on:(event,fn)=>client.on(event,fn),
        processID:client.processID,
        newSession:async()=>{
          check(!closed&&created.has(name)&&ownedClients.get(name)===database);
          const secondary=await connect(name);
          try{check(!closed&&created.has(name)&&ownedClients.get(name)===database);}catch(e){await secondary.end();throw e;}
          let ended=false;
          const session={query:(sql,args)=>secondary.query(sql,args),exec:sql=>secondary.query(sql),on:(event,fn)=>secondary.on(event,fn),
            processID:secondary.processID,close:async()=>{
              if(ended)return;ended=true;try{await secondary.query('ROLLBACK');}catch{}
              try{await secondary.end();}finally{sessions.delete(session);}
            }};
          sessions.add(session);return session;
        },
        close:async()=>{
          if(!closed){closed=true;await Promise.allSettled([...sessions].map(s=>s.close()));try{await client.query('ROLLBACK');}catch{}await client.end();}
          if(created.has(name)){await admin.query('DROP DATABASE "'+name+'"');created.delete(name);}
          ownedClients.delete(name);
        }};
      ownedClients.set(name,database);return database;
    };
    const createPair=async()=>{
      const primary=await createSite('primary');
      try{return {primary,backup:await createSite('backup')};}catch(e){await primary.close();throw e;}
    };
    const close=async()=>{
      try{
        await Promise.allSettled([...ownedClients.values()].map(c=>c.close()));
        // Only names successfully created by this invocation are eligible.
        // No FORCE, backend termination or original synthetic DB mutation.
        for(const name of [...created]){check(Object.values(names).includes(name));await admin.query('DROP DATABASE "'+name+'"');created.delete(name);}
      }finally{await admin.end();}
    };
    return {createSite,createPair,close,remaining:()=>created.size};
  }catch(e){await admin.end();throw e;}
}
async function main(){
  const flags=process.argv.slice(3);check(flags.length===0||(flags.length===1&&flags[0]==='--lifecycle'));
  const includeLifecycle=flags.length===1;
  const factory=await createGuardedSyntheticDatabaseFactory(process.argv[2]);
  try{
    const fixture=require('./backup-user-parent-recovery-sql');
    fixture.setTestDatabaseFactory(factory.createSite,{rolesPrecreated:true});
    const result=await require('./backup-user-parent-recovery-cutover-v2-sql').runCombinedTests();
    check(result.passed===8&&result.total===8&&factory.remaining()===0);
    let lifecycleResult;
    if(includeLifecycle){
      const lifecycle=require('./replication-cutover-v2-lifecycle-sql');
      lifecycle.setDatabaseFactoryForSyntheticTests(factory.createPair);
      lifecycleResult=await lifecycle.runLifecycleTests();
      check(lifecycleResult.passed===lifecycleResult.total&&lifecycleResult.total>=9&&factory.remaining()===0);
    }
    console.log(JSON.stringify({ok:true,operation:'combined_parent_repair_postgres17_6',passed:result.passed,
      ...(lifecycleResult?{lifecycle_passed:lifecycleResult.passed}:{}),databases_remaining:factory.remaining()}));
  }finally{
    await factory.close();
  }
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({ok:false,reason:'SYNTHETIC_PG17_COMBINED_FAILED'}));process.exitCode=1;});
module.exports={createGuardedSyntheticDatabaseFactory};
