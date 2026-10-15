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
async function main(){
  const base=testUrl(),pgPath=process.argv[2];check(typeof pgPath==='string'&&pgPath.length>0);
  const {Client}=require(pgPath),created=new Set();
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
    const fixture=require('./backup-user-parent-recovery-sql');
    fixture.setTestDatabaseFactory(async site=>{
      const name=names[site];check(Boolean(name)&&!created.has(name));
      // CREATE fails if the allowlisted DB already exists. Do not take it over.
      await admin.query('CREATE DATABASE "'+name+'"');created.add(name);const client=await connect(name);
      let closed=false;
      return {query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),on:(event,fn)=>client.on(event,fn),
        close:async()=>{
          if(closed)return;closed=true;try{await client.query('ROLLBACK');}catch{}
          await client.end();
          if(created.has(name)){await admin.query('DROP DATABASE "'+name+'"');created.delete(name);}
        }};
    },{rolesPrecreated:true});
    const result=await require('./backup-user-parent-recovery-cutover-v2-sql').runCombinedTests();
    check(result.passed===8&&result.total===8);
    console.log(JSON.stringify({ok:true,operation:'combined_parent_repair_postgres17_6',passed:result.passed,databases_remaining:created.size}));
  }finally{
    // Only names successfully created by this invocation are eligible. No FORCE,
    // backend termination, role changes, or original synthetic DB mutation.
    for(const name of [...created]){check(Object.values(names).includes(name));try{await admin.query('DROP DATABASE "'+name+'"');created.delete(name);}catch{}}
    await admin.end();
  }
}
main().catch(()=>{console.error(JSON.stringify({ok:false,reason:'SYNTHETIC_PG17_COMBINED_FAILED'}));process.exitCode=1;});
