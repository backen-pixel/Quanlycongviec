'use strict';
// Actual isolated PostgreSQL only. The shared fixture substitutes only the
// production base-SHA literal: synthetic catalogs cannot share production OIDs.
// There is no production connection, env load or runtime override in the CLI.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const fixture=require('./backup-user-parent-recovery-sql');
const shared=require('./backup-user-parent-recovery-v3-sql');
const production=require('../scripts/coordinate-replication-cutover-v3-20261016');
const v1=require('../scripts/preserve-replication-cutover-20261015'),v2=require('../scripts/prepare-replication-cutover-v2-20261015');
const NS=v2.NS,REV=production.REVISION_NS,KEY=fixture.secret,KEYID=fixture.keyId;
const tests=[],test=(name,fn)=>tests.push({name,fn}),testPg17=(name,fn)=>tests.push({name,fn,pg17:true});
let multiSessionFactory=false;
function setTestDatabaseFactory(factory,opts){fixture.setTestDatabaseFactory(factory,opts);multiSessionFactory=true;}
async function until(check){const deadline=Date.now()+10000;for(;;){if(await check())return;assert(Date.now()<deadline,'synthetic lock was not observed');await new Promise(r=>setTimeout(r,10));}}
async function pair(fn,options){return fixture.withDB(async raw=>fn(await shared.setup(raw,options)));}
async function action(p,site,name,extra={}){return shared.action(p,p.life,p.plan,site,name,extra);}
async function options(p,site,name,extra={}){return {site,action:name,env:shared.ENV,runId:p.runId,plan:p.plan,approval:shared.review(p,p.life,p.plan,p.life.ACTIONS),capacity:await shared.capacity(p,site,p.plan),...extra};}
function rehash(plan){plan.manifest_sha256=v2.hash(v2.stable(plan.descriptor));return plan;}
function wrap(db,intercept){const c=new EventEmitter();c.query=(...args)=>intercept(db,...args);c.exec=sql=>typeof db.exec==='function'?db.exec(sql):db.query(sql);return c;}
async function unchanged(p,before){assert.deepEqual((await p.primary.query(`SELECT * FROM ${NS}.runs ORDER BY id`)).rows,before);}
async function activate(p,site){const old=(await p[site].query(`SELECT epoch FROM ${NS}.control`)).rows[0].epoch,epoch=crypto.randomUUID();await action(p,site,'activate',{expectedEpoch:old,newEpoch:epoch,deadline:new Date(Date.now()+10*60000).toISOString()});p.context.epochs[site]=epoch;return epoch;}

test('revision accepts only the exact one-table addition and rejects removal, old catalog/derived/flags/exception drift',()=>pair(async p=>{
  p.life.validateRevisionPlan(p.plan,p.basePlan);
  const variants=[
    d=>d.sites.primary.tables.splice(1,1),
    d=>d.sites.primary.tables.find(t=>t.name==='users').columns.push({name:'unreviewed',type:'text'}),
    d=>d.sites.primary.tables.find(t=>t.name==='users').catalog_sha256='0'.repeat(64),
    d=>d.sites.primary.tables.find(t=>t.name===production.ADDITION).name='_another_bulk',
    d=>d.sites.primary.tables.find(t=>t.name===production.ADDITION).mode='row_multiset',
    d=>d.sites.backup.tables.push({...d.sites.primary.tables.find(t=>t.name===production.ADDITION)}),
    d=>d.flags.light=false,
    d=>d.sites.primary.excluded.push('users'),
    d=>d.sites.primary.derived.push({name:'new_view',view_sha256:'0'.repeat(64),dependencies:[]}),
    d=>d.scope_revision.base_manifest_sha256='0'.repeat(64),
    d=>d.scope_revision.additions.primary.push('users'),
    d=>d.exceptions.target_only.push('users'),
    d=>d.unreviewed_metadata=true
  ];
  for(const mutate of variants){const plan=structuredClone(p.plan);mutate(plan.descriptor);rehash(plan);assert.throws(()=>p.life.validateRevisionPlan(plan,p.basePlan));}
  const stats=structuredClone(p.plan);stats.descriptor.sites.primary.tables.find(t=>t.name==='users').estimated_rows='100';stats.descriptor.sites.primary.tables.find(t=>t.name==='users').relation_bytes='100000';rehash(stats);p.life.validateRevisionPlan(stats,p.basePlan);
  assert.throws(()=>production.validateRevisionPlan(p.plan,p.basePlan),e=>e.cutoverCode==='CUTOVER_V3_BASE_MANIFEST_REQUIRED');
},{activate:false,register:false,init:false}));

test('init appends the owner-only immutable revision and leaves every original manifest, registration and control unchanged',()=>pair(async p=>{
  const before=(await p.primary.query(`SELECT * FROM ${NS}.runs ORDER BY id`)).rows;
  const regs=(await p.primary.query(`SELECT * FROM ${NS}.registrations ORDER BY table_name`)).rows;
  const oldRegs=(await p.primary.query(`SELECT * FROM ${v1.NS}.registrations ORDER BY table_name`)).rows;
  const control=(await p.primary.query(`SELECT * FROM ${NS}.control`)).rows;
  const first=await action(p,'primary','init');assert.equal(first.existing,false);const repeat=await action(p,'primary','init');assert.equal(repeat.existing,true);
  await unchanged(p,before);assert.deepEqual((await p.primary.query(`SELECT * FROM ${NS}.registrations ORDER BY table_name`)).rows,regs);
  assert.deepEqual((await p.primary.query(`SELECT * FROM ${v1.NS}.registrations ORDER BY table_name`)).rows,oldRegs);assert.deepEqual((await p.primary.query(`SELECT * FROM ${NS}.control`)).rows,control);
  for(const sql of [`UPDATE ${REV}.revisions SET manifest=manifest`,`DELETE FROM ${REV}.revisions`,`TRUNCATE ${REV}.revisions`])await assert.rejects(()=>p.primary.exec(sql),e=>e.code==='55000');
  for(const role of ['anon','authenticated','service_role','authenticator']){await p.primary.exec('SET ROLE '+role);try{await assert.rejects(()=>p.primary.query(`SELECT * FROM ${REV}.revisions`),e=>e.code==='42501');}finally{await p.primary.exec('RESET ROLE');}}
  await p.life.privateRevisionContract(p.primary);
},{activate:false,register:false,init:false}));

test('register only installs the addition under the original run and rejects attempts to rewrite old or backup registrations',()=>pair(async p=>{
  const before=(await p.primary.query(`SELECT * FROM ${NS}.registrations ORDER BY table_name`)).rows;
  await assert.rejects(()=>action(p,'primary','register',{tables:['users']}),e=>e.cutoverCode==='CUTOVER_V3_ADDITION_ONLY');
  await assert.rejects(()=>action(p,'backup','register',{tables:['users']}),e=>e.cutoverCode==='CUTOVER_V3_ADDITION_ONLY');
  const result=await action(p,'primary','register',{tables:[production.ADDITION]});assert.deepEqual(result.registered,[production.ADDITION]);
  assert.deepEqual((await action(p,'primary','register',{tables:[production.ADDITION]})).registered,[]);
  const regs=(await p.primary.query(`SELECT * FROM ${NS}.registrations ORDER BY table_name`)).rows;assert.deepEqual(regs.filter(r=>r.table_name!==production.ADDITION),before);
  assert.equal(regs.find(r=>r.table_name===production.ADDITION).run_id,p.runId);
  assert.equal((await action(p,'primary','validate')).validated,true);assert.equal((await action(p,'backup','validate')).validated,true);
},{activate:false,register:false}));

test('source approval v2, wrong base/run/source/SQL and old capacity cannot authorize a revision write',()=>pair(async p=>{
  const opts=await options(p,'primary','init');
  for(const mutate of [o=>o.approval.version='cutover_source_review_v1',o=>o.approval.base_manifest_sha256='0'.repeat(64),o=>o.runId=crypto.randomUUID(),o=>o.approval.reviewed_sources.coordinator_v3='0'.repeat(64),o=>o.approval.sql_v3_sha256='0'.repeat(64),o=>o.capacity.manifest_sha256=p.basePlan.manifest_sha256]){
    const changed=structuredClone(opts);mutate(changed);await assert.rejects(()=>p.life.runAction(p.primary,changed));
  }
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${REV}.revisions`)).rows[0].n,0);
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.receipts`)).rows[0].n,0);
},{activate:false,register:false,init:false}));

test('private contract rejects rewrite rules, default/check/index drift and same-name trigger-function shadows',()=>pair(async p=>{
  const db=p.primary;
  const changes=[
    [`CREATE RULE synthetic_discard AS ON INSERT TO ${REV}.revisions DO INSTEAD NOTHING`,`DROP RULE synthetic_discard ON ${REV}.revisions`],
    [`ALTER TABLE ${REV}.revisions ADD COLUMN synthetic_default integer DEFAULT 1`,`ALTER TABLE ${REV}.revisions DROP COLUMN synthetic_default`],
    [`ALTER TABLE ${REV}.revisions ADD CONSTRAINT synthetic_check CHECK(true)`,`ALTER TABLE ${REV}.revisions DROP CONSTRAINT synthetic_check`],
    [`CREATE INDEX synthetic_expression ON ${REV}.revisions ((lower(site)))`,`DROP INDEX ${REV}.synthetic_expression`]
  ];
  for(const [add,remove] of changes){await db.exec(add);await assert.rejects(()=>p.life.privateRevisionContract(db),e=>e.cutoverCode==='CUTOVER_V3_PRIVATE_CONTRACT');await db.exec(remove);await p.life.privateRevisionContract(db);}
  await db.exec(`CREATE FUNCTION public.immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;DROP TRIGGER immutable_revision ON ${REV}.revisions;CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON ${REV}.revisions FOR EACH STATEMENT EXECUTE FUNCTION public.immutable_revision();ALTER TABLE ${REV}.revisions ENABLE ALWAYS TRIGGER immutable_revision`);
  await assert.rejects(()=>p.life.privateRevisionContract(db),e=>e.cutoverCode==='CUTOVER_V3_PRIVATE_CONTRACT');
},{activate:false,register:false,init:false}));

test('COMMIT acknowledgment loss leaves an inspectable immutable revision and never reports a clean rollback',()=>pair(async p=>{
  const opts=await options(p,'primary','init');let committed=false;
  const db=wrap(p.primary,async(c,sql,args)=>{const r=await c.query(sql,args);if(sql==='COMMIT'){committed=true;throw Error('synthetic private lost ACK');}return r;});
  let error;try{await p.life.runAction(db,opts);}catch(e){error=e;}
  assert(committed);assert.equal(error.cutoverCode,'CUTOVER_LIFECYCLE_COMMIT_OUTCOME_UNKNOWN');assert.equal(p.life.failureResult(error).inspect_required,true);
  const state=await p.life.runAction(p.primary,{site:'primary',action:'inspect'});assert.equal(state.revisions.length,1);assert.equal(state.revisions[0].revision_manifest_sha256,p.plan.manifest_sha256);
  assert.equal((await p.primary.query(`SELECT manifest_sha256 FROM ${NS}.runs`)).rows[0].manifest_sha256,p.basePlan.manifest_sha256);
},{activate:false,register:false,init:false}));

test('closing-only captures the full revised scope with new AAD, raw numeric precision and all old journals; no baseline is required',()=>pair(async p=>{
  await p.primary.query(`INSERT INTO public.${production.ADDITION} VALUES($1,$2)`,[crypto.randomUUID(),'Đỗ Việt 漢字 😀\nsynthetic']);
  await p.primary.exec('UPDATE public.users SET salary=12345678901234567890.123456789');
  const epoch=await activate(p,'primary'),captureId=crypto.randomUUID(),opts=await options(p,'primary','capture',{captureId,phase:'closing',expectedEpoch:epoch,secret:KEY,keyId:KEYID});
  assert.equal((await p.life.runAction(p.primary,opts)).committed,true);
  assert.equal((await action(p,'primary','verify',{captureId,phase:'closing',expectedEpoch:epoch,secret:KEY,keyId:KEYID})).verified,true);
  const meta=p.life.captureMeta(opts),artifacts=(await p.primary.query(`SELECT * FROM ${NS}.artifacts WHERE capture_id=$1`,[captureId])).rows;
  const addition=artifacts.find(a=>a.stream==='table:'+production.ADDITION);assert(addition);
  assert.match(JSON.parse(v2.decrypt({...meta,...addition},KEY)).raw_rows[0],/Đỗ Việt/);
  const users=artifacts.find(a=>a.stream==='table:users');assert.match(v2.decrypt({...meta,...users},KEY),/12345678901234567890\.123456789/);
  const schema=artifacts.find(a=>a.stream==='schema-manifest');assert.deepEqual(JSON.parse(JSON.parse(v2.decrypt({...meta,...schema},KEY)).raw_rows[0]),p.plan.descriptor);
  assert.throws(()=>v2.decrypt({...meta,...addition,manifest_sha256:p.basePlan.manifest_sha256},KEY));
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.receipts WHERE kind='committed'`)).rows[0].n,1);
  assert.equal((await p.primary.query(`SELECT manifest_sha256 FROM ${NS}.runs`)).rows[0].manifest_sha256,p.basePlan.manifest_sha256);
},{activate:false}));

test('an exact addition without a primary key uses row-multiset journaling and preserves duplicate rows',()=>pair(async p=>{
  await p.primary.exec(`DROP TABLE public.${production.ADDITION};CREATE TABLE public.${production.ADDITION}(payload text,amount numeric)`);
  p.plan=p.life.createRevisionPlan(p.basePlan,await v2.prepare({...p,env:shared.ENV}));p.context.manifest_sha256=p.plan.manifest_sha256;
  assert.equal(p.plan.descriptor.sites.primary.tables.find(t=>t.name===production.ADDITION).mode,'row_multiset');
  for(const site of ['primary','backup'])await action(p,site,'init');await action(p,'primary','register',{tables:[production.ADDITION]});
  await p.primary.exec(`INSERT INTO public.${production.ADDITION} VALUES('same',12345678901234567890.123456789),('same',12345678901234567890.123456789)`);
  const epoch=await activate(p,'primary'),captureId=crypto.randomUUID(),opts=await options(p,'primary','capture',{captureId,phase:'closing',expectedEpoch:epoch,secret:KEY,keyId:KEYID});
  await p.life.runAction(p.primary,opts);assert.equal((await action(p,'primary','verify',{...opts,action:'verify'})).verified,true);
  const a=(await p.primary.query(`SELECT * FROM ${NS}.artifacts WHERE capture_id=$1 AND stream=$2`,[captureId,'table:'+production.ADDITION])).rows[0];
  const rows=JSON.parse(v2.decrypt({...p.life.captureMeta(opts),...a},KEY)).raw_rows;assert.equal(rows.length,2);assert.equal(rows[0],rows[1]);assert.match(rows[0],/12345678901234567890\.123456789/);
  const events=(await p.primary.query(`SELECT mode,new_key_digest,new_row_digest FROM ${NS}.events WHERE table_name=$1`,[production.ADDITION])).rows;
  assert.equal(events.length,2);assert(events.every(e=>e.mode==='row_multiset'&&e.new_key_digest===null&&/^[a-f0-9]{64}$/.test(e.new_row_digest)));
},{activate:false,register:false,init:false}));

test('future DDL, missing added-table fence or lost original coverage holds before any reservation or artifact',()=>pair(async p=>{
  await p.primary.exec('CREATE TABLE public.synthetic_later_bulk(id integer)');
  const captureId=crypto.randomUUID(),extra={captureId,phase:'closing',expectedEpoch:p.context.epochs.primary,secret:KEY,keyId:KEYID};
  await assert.rejects(()=>action(p,'primary','capture',extra),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_SCOPE_CHANGED');await p.primary.exec('DROP TABLE public.synthetic_later_bulk');
  await p.primary.exec(`ALTER TABLE public.${production.ADDITION} DISABLE TRIGGER ${v2.FENCE_TRIGGER}`);
  await assert.rejects(()=>action(p,'primary','capture',extra),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_TRIGGER_CHANGED');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.receipts`)).rows[0].n,0);
}));

test('explicit release remains available with expired approval/capacity and unrelated current public DDL',()=>pair(async p=>{
  await p.primary.exec('CREATE TABLE public.synthetic_later_bulk(id integer)');
  const opts=await options(p,'primary','release',{capacity:null,env:{},expectedEpoch:p.context.epochs.primary,newEpoch:crypto.randomUUID()});opts.approval.expires_at=new Date(Date.now()-1).toISOString();
  assert.equal((await p.life.runAction(p.primary,opts)).active,false);
  assert.equal((await p.primary.query(`SELECT active FROM ${NS}.control`)).rows[0].active,false);
  assert.equal((await p.primary.query(`SELECT revision_manifest_sha256 FROM ${REV}.revisions`)).rows[0].revision_manifest_sha256,p.plan.manifest_sha256);
}));

test('repair read validator binds both immutable manifests, exact full live scope and the active unexpired per-site epoch',()=>pair(async p=>{
  async function read(context){await p.primary.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await p.primary.query("SET LOCAL TIME ZONE 'UTC'");return await p.life.readRepairSite(p.primary,{site:'primary',context});}finally{await p.primary.query('ROLLBACK');}}
  const a=await read(p.context),b=await read(p.context);assert.deepEqual(a,b);
  assert.equal(typeof a.control.deadline,'string');assert.equal(typeof a.revision.created_at,'string');assert.equal(a.basePlan.manifest_sha256,p.basePlan.manifest_sha256);assert.equal(a.plan.manifest_sha256,p.plan.manifest_sha256);
  await assert.rejects(()=>read({...p.context,cutoverV2:true}),e=>e.cutoverCode==='CUTOVER_V3_REPAIR_CONTEXT_REQUIRED');
  await p.primary.exec(`UPDATE ${NS}.control SET deadline=clock_timestamp()-interval '1 second'`);
  await assert.rejects(()=>read(p.context),e=>e.cutoverCode==='CUTOVER_V3_REPAIR_FENCE_REQUIRED');
}));

test('init/register/activate recheck source and capacity immediately before COMMIT and roll back on timer expiry',()=>pair(async p=>{
  const clock=Date.now;
  for(const name of ['init','register','activate']){
    const beforeRegs=(await p.primary.query(`SELECT * FROM ${NS}.registrations ORDER BY table_name`)).rows,beforeControl=(await p.primary.query(`SELECT * FROM ${NS}.control`)).rows;
    const extra=name==='register'?{tables:[production.ADDITION]}:name==='activate'?{expectedEpoch:beforeControl[0].epoch,newEpoch:crypto.randomUUID(),deadline:new Date(Date.now()+10*60000).toISOString()}:{};
    const opts=await options(p,'primary',name,extra);let advanced=false;
    const db=wrap(p.primary,async(c,sql,args)=>{const r=await c.query(sql,args);if(sql==='SELECT 1'){advanced=true;Date.now=()=>clock()+16*60000;}return r;});
    try{await assert.rejects(()=>p.life.runAction(db,opts),e=>/EXPIRED/.test(e.cutoverCode));}finally{Date.now=clock;}
    assert(advanced);assert.deepEqual((await p.primary.query(`SELECT * FROM ${NS}.registrations ORDER BY table_name`)).rows,beforeRegs);assert.deepEqual((await p.primary.query(`SELECT * FROM ${NS}.control`)).rows,beforeControl);
    if(name==='init'){assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${REV}.revisions`)).rows[0].n,0);await action(p,'primary','init');}
    else if(name==='register')await action(p,'primary','register',extra);
  }
},{activate:false,register:false,init:false}));

test('expired v3 review at journal transfer rolls back artifacts and keeps the durable reservation',()=>pair(async p=>{
  const captureId=crypto.randomUUID(),opts=await options(p,'primary','capture',{captureId,phase:'closing',expectedEpoch:p.context.epochs.primary,secret:KEY,keyId:KEYID});
  const clock=Date.now;let advanced=false;
  const db=wrap(p.primary,async(c,sql,args)=>{const result=await c.query(sql,args);if(sql.startsWith('DECLARE cutover_journal_')){advanced=true;Date.now=()=>clock()+16*60000;}return result;});
  try{await assert.rejects(()=>p.life.runAction(db,opts),e=>/EXPIRED/.test(e.cutoverCode));}finally{Date.now=clock;}
  assert(advanced);assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.artifacts WHERE capture_id=$1`,[captureId])).rows[0].n,0);
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.receipts WHERE kind='reserved' AND capture_id=$1`,[captureId])).rows[0].n,1);
}));

test('reservation expiry before COMMIT consumes no retained capture slot or artifact bytes',()=>pair(async p=>{
  const captureId=crypto.randomUUID(),opts=await options(p,'primary','capture',{captureId,phase:'closing',expectedEpoch:p.context.epochs.primary,secret:KEY,keyId:KEYID});
  const clock=Date.now;let advanced=false;
  const db=wrap(p.primary,async(c,sql,args)=>{const result=await c.query(sql,args);if(sql==='SELECT 1'){advanced=true;Date.now=()=>clock()+16*60000;}return result;});
  try{await assert.rejects(()=>p.life.runAction(db,opts),e=>/EXPIRED/.test(e.cutoverCode));}finally{Date.now=clock;}
  assert(advanced);assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.receipts`)).rows[0].n,0);
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.artifacts`)).rows[0].n,0);
}));

test('production entrypoint has fixed run/base and all five frozen source hashes, with no implicit mutation action',()=>{
  assert.equal(production.RUN_ID,'30a4e894-3d2c-4b7c-a65b-bc70bd047350');assert.equal(production.BASE_MANIFEST_SHA,'097952669c7ef255e89fa1f6c5efb2e2ccda2c7cdbb413e925338a7719397d13');
  assert.equal(v2.hash(fs.readFileSync(path.resolve(__dirname,'../../database',production.SQL_V3_FILE))),production.SQL_V3_SHA);
  const sources=production.sourceHashes();for(const [name,sha] of Object.entries(production.FROZEN))assert.equal(sources[name],sha);
  assert.throws(()=>production.parseArgs([]));assert.throws(()=>production.parseArgs(['--action','release','--site','primary','--plan','x','--run-id',production.RUN_ID]));
  assert.equal(production.safeCode(Error('synthetic-contact@example.invalid')),'CUTOVER_LIFECYCLE_HELD');
});

testPg17('registration waits for concurrent owner DDL, then rejects the changed addition catalog before installing a hook',()=>pair(async p=>{
  const writer=await p.primary.newSession(),registrar=await p.primary.newSession();
  try{
    await writer.query('BEGIN');await writer.query(`ALTER TABLE public.${production.ADDITION} ADD COLUMN synthetic_late text`);
    const pending=p.life.runAction(registrar,await options(p,'primary','register',{tables:[production.ADDITION]}));let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});
    await until(async()=>{assert.equal(settled,false);return (await p.primary.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) blocked',[writer.processID,registrar.processID])).rows[0].blocked;});
    await writer.query('COMMIT');await assert.rejects(()=>pending,e=>e.cutoverCode==='CUTOVER_LIFECYCLE_PUBLIC_CATALOG_CHANGED');
    assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${NS}.registrations WHERE table_name=$1`,[production.ADDITION])).rows[0].n,0);
    assert.equal((await p.primary.query('SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal',['public.'+production.ADDITION])).rows[0].n,0);
  }finally{await Promise.allSettled([writer.close(),registrar.close()]);}
},{activate:false,register:false}));

testPg17('revised closing drains an authorized pending addition writer before its MVCC snapshot and captures that row',()=>pair(async p=>{
  const writer=await p.primary.newSession(),closing=await p.primary.newSession();
  try{
    const oid=p.plan.descriptor.sites.primary.tables.find(t=>t.name===production.ADDITION).oid,epoch=p.context.epochs.primary;
    await writer.query('BEGIN');await writer.query(`SELECT ${NS}.mint_permit($1,$2,$3::oid[],ARRAY['INSERT'],'operator_recovery')`,[p.runId,epoch,[oid]]);
    await writer.query(`INSERT INTO public.${production.ADDITION} VALUES($1,'synthetic late permitted row')`,[crypto.randomUUID()]);
    const captureId=crypto.randomUUID(),opts=await options({...p,primary:writer},'primary','capture',{captureId,phase:'closing',expectedEpoch:epoch,secret:KEY,keyId:KEYID});
    const pending=p.life.runAction(closing,opts);let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});
    await until(async()=>{assert.equal(settled,false);return (await p.primary.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) blocked',[writer.processID,closing.processID])).rows[0].blocked;});
    await writer.query('COMMIT');assert.equal((await pending).committed,true);
    const artifact=(await p.primary.query(`SELECT * FROM ${NS}.artifacts WHERE capture_id=$1 AND stream=$2`,[captureId,'table:'+production.ADDITION])).rows[0];
    const rows=JSON.parse(v2.decrypt({...p.life.captureMeta(opts),...artifact},KEY)).raw_rows;assert.equal(rows.length,1);assert.match(rows[0],/late permitted row/);
  }finally{await Promise.allSettled([writer.close(),closing.close()]);}
}));

testPg17('concurrent first revision init has one immutable winner and preserves the original V2 run',()=>pair(async p=>{
  const a=await p.primary.newSession(),b=await p.primary.newSession();let arrivals=0,release;const barrier=new Promise(r=>{release=r;}),timer=setTimeout(()=>release(),10000);
  try{
    const clients=[a,b].map(db=>wrap(db,async(c,sql,args)=>{if(sql.startsWith(`INSERT INTO ${REV}.revisions`)){arrivals++;if(arrivals===2)release();await barrier;assert.equal(arrivals,2);}return c.query(sql,args);}));
    const inputs=await Promise.all(clients.map(()=>options(p,'primary','init'))),result=await Promise.allSettled(clients.map((c,i)=>p.life.runAction(c,inputs[i])));
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
    assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${REV}.revisions`)).rows[0].n,1);
    assert.equal((await p.primary.query(`SELECT manifest_sha256 FROM ${NS}.runs`)).rows[0].manifest_sha256,p.basePlan.manifest_sha256);
  }finally{clearTimeout(timer);await Promise.allSettled([a.close(),b.close()]);}
},{activate:false,register:false,init:false}));

async function runScopeRevisionTests(){let passed=0;const selected=tests.filter(t=>!t.pg17||multiSessionFactory),skipped=tests.length-selected.length;for(const t of selected){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name);console.error(e.stack);process.exitCode=1;break;}}
  console.log(`${passed}/${selected.length} actual isolated PostgreSQL v3 scope tests passed; ${skipped} genuine multi-session cases deferred.`);return {passed,total:selected.length,skipped,deferred:skipped};}
if(require.main===module)runScopeRevisionTests().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={runScopeRevisionTests,setTestDatabaseFactory};
