'use strict';
// Opt-in genuine PG17.6 adapter. Reuses the reviewed loopback-only database
// factory, owns only databases it creates, and performs no work on import.
const {createGuardedSyntheticDatabaseFactory}=require('./backup-user-parent-recovery-cutover-v2-postgres17');
function check(ok){if(!ok)throw Error('SYNTHETIC_PG17_V3_GUARD_REQUIRED');}
async function main(){
  check(process.argv.length===3&&typeof process.argv[2]==='string'&&process.argv[2].length>0);
  const factory=await createGuardedSyntheticDatabaseFactory(process.argv[2]);
  try{
    const baseline=require('./backup-user-parent-recovery-sql');
    baseline.setTestDatabaseFactory(factory.createSite,{rolesPrecreated:true});
    const result=await require('./backup-user-parent-recovery-v3-sql').runV3RecoveryTests();
    check(result.passed===result.total&&result.total===10&&factory.remaining()===0);
    const scopeSuite=require('./replication-cutover-v3-scope-revision-sql');
    check(typeof scopeSuite.setTestDatabaseFactory==='function');
    scopeSuite.setTestDatabaseFactory(factory.createSite,{rolesPrecreated:true,multiSession:true});
    const scope=await scopeSuite.runScopeRevisionTests();
    check(scope.passed===scope.total&&scope.total===18&&scope.skipped===0&&scope.deferred===0&&factory.remaining()===0);
    console.log(JSON.stringify({ok:true,operation:'scope_v3_parent_repair_postgres17_6',passed:result.passed,
      scope_passed:scope.passed,scope_skipped:scope.skipped,scope_deferred:scope.deferred,databases_remaining:factory.remaining()}));
  }finally{await factory.close();}
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({ok:false,reason:'SYNTHETIC_PG17_V3_FAILED'}));process.exitCode=1;});
module.exports={main};
