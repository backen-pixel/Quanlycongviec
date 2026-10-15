'use strict';
// Pure mock only: verifies rejection occurs before any CREATE statement.
const assert=require('node:assert/strict'),Module=require('node:module');
const {EventEmitter}=require('node:events');
const adapter=require('./backup-user-parent-recovery-cutover-v2-postgres17');
const token='vpt-pg17-synthetic-guard-mock',sql=[];
class MockClient extends EventEmitter {
  async connect(){}
  async end(){}
  async query(text){
    sql.push(text);
    if(text.startsWith('SET '))return {rows:[]};
    if(text.startsWith("SELECT current_setting('server_version_num')"))return {rows:[{n:'170006'}]};
    if(text.startsWith('SELECT rolname,rolbypassrls'))return {rows:['anon','authenticated','authenticator','service_role'].map(rolname=>({rolname,rolbypassrls:rolname==='service_role'}))};
    throw Error('UNEXPECTED_MOCK_SQL');
  }
}
(async()=>{
  const originalLoad=Module._load,oldFlag=process.env.VPT_CUTOVER_TEST_ONLY,oldUrl=process.env.VPT_CUTOVER_TEST_DATABASE_URL;let factory;
  try{
    Module._load=function(request,...args){return request===token?{Client:MockClient}:originalLoad.call(this,request,...args);};
    process.env.VPT_CUTOVER_TEST_ONLY='1';
    process.env.VPT_CUTOVER_TEST_DATABASE_URL='postgresql://postgres:synthetic-only@127.0.0.1:65432/vpt_cutover_synthetic';
    factory=await adapter.createGuardedSyntheticDatabaseFactory(token);
    for(const site of ['constructor','__proto__','prototype','toString','hasOwnProperty','','PRIMARY','backup ',null,undefined,0,{},[]])
      await assert.rejects(()=>factory.createSite(site),e=>e.message==='SYNTHETIC_PG17_GUARD_REQUIRED');
    assert.equal(sql.filter(s=>/^(CREATE|DROP) DATABASE/.test(s)).length,0);
    assert.equal(factory.remaining(),0);
    console.log('PASS unknown and prototype site keys are rejected before CREATE with no network or database writes');
  }finally{
    if(factory)await factory.close();Module._load=originalLoad;
    if(oldFlag===undefined)delete process.env.VPT_CUTOVER_TEST_ONLY;else process.env.VPT_CUTOVER_TEST_ONLY=oldFlag;
    if(oldUrl===undefined)delete process.env.VPT_CUTOVER_TEST_DATABASE_URL;else process.env.VPT_CUTOVER_TEST_DATABASE_URL=oldUrl;
  }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
