'use strict';
// Isolated synthetic PostgreSQL only. This module never loads an env file or
// opens a network connection; a separately guarded adapter may supply clients.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const v1=require('../scripts/preserve-replication-cutover-20261015');
const v2=require('../scripts/prepare-replication-cutover-v2-20261015');
const life=require('../scripts/coordinate-replication-cutover-v2-20261015');
const SQL1=fs.readFileSync(path.resolve(__dirname,'../../database/20261015050417_replication_cutover_preservation.sql'),'utf8');
const SQL2=fs.readFileSync(path.resolve(__dirname,'../../database/20261015051758_replication_cutover_v2_preparation.sql'),'utf8');
const ENV={SUPABASE_REPLICATION_LIGHT:'1'},KEY=Buffer.alloc(32,19).toString('base64'),KEYID='77777777-7777-4777-8777-777777777777';
const ID='11111111-1111-4111-8111-111111111111';
let databaseFactory;
function setDatabaseFactoryForSyntheticTests(factory){assert.equal(typeof factory,'function');databaseFactory=factory;}
async function fixture(){let p;if(databaseFactory)p=await databaseFactory();else{const {PGlite}=require(process.argv[2]||'@electric-sql/pglite');p={primary:new PGlite(),backup:new PGlite()};}
  for(const db of [p.primary,p.backup]){
    // Roles are cluster-wide in real PG; the adapter creates them once. PGlite
    // isolates each instance, so create only names not present in its catalog.
    for(const role of ['anon','authenticated','service_role','authenticator'])if(!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)await db.exec('CREATE ROLE '+role+(role==='service_role'?' BYPASSRLS':''));
    await db.exec(`CREATE TABLE public.users(id uuid PRIMARY KEY,email text,salary numeric);
      CREATE TABLE public.departments(id uuid PRIMARY KEY,name text);
      CREATE TABLE public.crm_leads(id uuid PRIMARY KEY,company_id uuid,code text,type text);
      CREATE TABLE public.project_substage_status(id uuid PRIMARY KEY,value text);
      CREATE TABLE public.trash_items(id uuid PRIMARY KEY,snapshot jsonb);
      CREATE TABLE public.synthetic_bigint(id bigint PRIMARY KEY,amount numeric,at timestamptz);
      CREATE TABLE public.synthetic_multiset(payload text);
      CREATE TABLE public.user_last_activity(id uuid PRIMARY KEY);
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
      INSERT INTO public.users VALUES('${ID}','synthetic-private@example.invalid',12345678901234567890.123456789);
      INSERT INTO public.departments VALUES('${ID}','Synthetic');
      INSERT INTO public.crm_leads VALUES('${ID}','${ID}','SYNTHETIC-1','lead');
      INSERT INTO public.project_substage_status VALUES('${ID}','before');
      INSERT INTO public.trash_items VALUES('${ID}','{}');
      INSERT INTO public.synthetic_bigint VALUES(9223372036854775806,12345678901234567890.123456789,'2026-10-15T01:00:00Z');
      INSERT INTO public.synthetic_multiset VALUES('same'),('same');`);
    await db.exec(SQL1);await db.exec(SQL2);
  }
  const arm=await v1.preserve({...p,mode:'arm',env:ENV});
  const plan=await v2.prepare({...p,env:ENV});return {...p,runId:arm.run_id,plan};
}
async function pair(fn){const p=await fixture();try{return await fn(p);}finally{await p.primary.close();await p.backup.close();}}
function approval(p){const now=Date.now();return {version:'cutover_source_review_v1',review_id:crypto.randomUUID(),run_id:p.runId,manifest_sha256:p.plan.manifest_sha256,sql_v2_sha256:v2.hash(Buffer.from(SQL2)),reviewed_sources:life.sourceHashes(),actions:[...life.ACTIONS],reviewed_at:new Date(now-1000).toISOString(),expires_at:new Date(now+14*60000).toISOString()};}
async function capacity(p,site,version=1){const c=p[site],now=new Date().toISOString(),measurements=[];
  for(const entry of p.plan.descriptor.sites[site].tables){const s=(await c.query(`SELECT count(*)::text AS rows,coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS raw_bytes,coalesce(sum(octet_length(to_jsonb(to_jsonb(t)::text)::text)),0)::text AS encoded_bytes,coalesce(max(octet_length(to_jsonb(t)::text)),0)::text AS max_row_bytes FROM public."${entry.name}" t`)).rows[0];if(version===1)delete s.encoded_bytes;measurements.push({table:entry.name,measured_at:now,basis:'postgres_to_jsonb_text_utf8',...s});}
  return {version,site,project_ref:site==='primary'?v1.PRIMARY:v1.BACKUP,run_id:p.runId,manifest_sha256:p.plan.manifest_sha256,issued_at:now,expires_at:new Date(Date.now()+14*60000).toISOString(),ui:{measured_at:now,allocated_bytes:'8589934592',used_bytes:'2147483648',free_bytes:'6442450944',wal_included_in_used:true},reserves:{wal_bytes:'1073741824',temp_bytes:'268435456',safety_bytes:'268435456',journal_bytes:'67108864'},retained_capture_count:2,metadata_raw_bytes:String(Buffer.byteLength(v2.stable(p.plan.descriptor))+65536),measurements};
}
async function opts(p,site,action,extra={}){return {env:ENV,plan:p.plan,runId:p.runId,site,action,approval:approval(p),capacity:await capacity(p,site),...extra};}
async function action(p,site,name,extra={}){return life.runAction(p[site],await opts(p,site,name,extra));}
async function initialize(p,site){await action(p,site,'init',{newEpoch:crypto.randomUUID()});}
async function registerAll(p,site){await initialize(p,site);const names=p.plan.descriptor.sites[site].tables.map(t=>t.name);for(let i=0;i<names.length;i+=5)await action(p,site,'register',{tables:names.slice(i,i+5)});}
async function activate(p,site){const previous=(await p[site].query(`SELECT epoch FROM ${v2.NS}.control`)).rows[0].epoch,newEpoch=crypto.randomUUID();await action(p,site,'activate',{expectedEpoch:previous,newEpoch,deadline:new Date(Date.now()+10*60000).toISOString()});return newEpoch;}
function wrap(db,intercept){const client=new EventEmitter();client.query=(...args)=>intercept(db,...args);return client;}
const tests=[],test=(name,fn)=>tests.push({name,fn});
const testPg17=(name,fn)=>tests.push({name,fn,pg17:true});
async function until(check){const deadline=Date.now()+10000;for(;;){if(await check())return;assert.ok(Date.now()<deadline,'expected synthetic PostgreSQL lock was not observed');await new Promise(resolve=>setTimeout(resolve,10));}}

test('finite lifecycle validates complete metadata, registers in batches and preserves the original v1 registration',()=>pair(async p=>{
  const before=(await p.primary.query(`SELECT table_name,catalog_sha256 FROM ${v1.NS}.registrations ORDER BY table_name`)).rows;
  await registerAll(p,'primary');const check=await action(p,'primary','validate');assert.equal(check.validated,true);
  const after=(await p.primary.query(`SELECT table_name,catalog_sha256 FROM ${v1.NS}.registrations ORDER BY table_name`)).rows;assert.deepEqual(after,before);
  const regs=(await p.primary.query(`SELECT mode,count(*)::int n FROM ${v2.NS}.registrations GROUP BY mode ORDER BY mode`)).rows;assert.deepEqual(regs,[{mode:'pk_digest',n:1},{mode:'row_multiset',n:1},{mode:'v1_external',n:5}]);
  const again=await action(p,'primary','register',{tables:['users']});assert.deepEqual(again.registered,[]);assert.equal(again.cutover_ready,false);
  const queries=[],client=wrap(p.primary,async(db,sql,args)=>{queries.push(sql);return db.query(sql,args);});
  await life.runAction(client,await opts(p,'primary','validate'));
  assert.equal(queries.filter(sql=>sql.includes('AS correct_fence')).length,1,'v2 hook metadata uses one bulk query, independent of table count');
  assert.equal(queries.filter(sql=>sql.includes("'attnotnull',a.attnotnull")).length,1,'original v1 catalogs use one bulk query');
  assert.equal(queries.filter(sql=>sql.includes('AS correct_function')).length,1,'v1 journal hooks use one bulk query');
}));
test('bulk hook comparison rejects orphan hooks on excluded tables and argument drift without ignoring unknown objects',()=>pair(async p=>{
  await registerAll(p,'primary');
  await p.primary.exec(`CREATE TRIGGER ${v2.FENCE_TRIGGER} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.user_last_activity FOR EACH STATEMENT EXECUTE FUNCTION ${v2.NS}.write_fence();ALTER TABLE public.user_last_activity ENABLE ALWAYS TRIGGER ${v2.FENCE_TRIGGER}`);
  await assert.rejects(()=>action(p,'primary','validate'),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_ORPHAN_TRIGGER');
  await p.primary.exec(`DROP TRIGGER ${v2.FENCE_TRIGGER} ON public.user_last_activity;DROP TRIGGER ${v2.FENCE_TRIGGER} ON public.users;CREATE TRIGGER ${v2.FENCE_TRIGGER} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.users FOR EACH STATEMENT EXECUTE FUNCTION ${v2.NS}.write_fence('unexpected');ALTER TABLE public.users ENABLE ALWAYS TRIGGER ${v2.FENCE_TRIGGER}`);
  await assert.rejects(()=>action(p,'primary','validate'),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_TRIGGER_CHANGED');
}));
test('PostgreSQL encoded-byte scalar equals Node UTF8 JSON string encoding for controls, Unicode and raw numeric JSON',()=>pair(async p=>{
  const samples=(await p.primary.query(`WITH s AS (SELECT jsonb_build_object('controls',chr(1)||chr(8)||chr(9)||chr(10)||chr(12)||chr(13),'quotes',chr(34)||chr(92)||'/','unicode','Đỗ Việt 漢字 😀'||chr(8232)||chr(8233),'number',12345678901234567890.123456789)::text AS raw)
    SELECT raw,octet_length(raw)::text raw_bytes,octet_length(to_jsonb(raw)::text)::text encoded_bytes FROM s`)).rows;
  for(const r of samples){assert.equal(String(Buffer.byteLength(r.raw)),r.raw_bytes);assert.equal(String(Buffer.byteLength(JSON.stringify(r.raw))),r.encoded_bytes);assert.match(r.raw,/12345678901234567890\.123456789/);}
  const measured=await action(p,'primary','measure',{tables:['synthetic_bigint']});
  const row=(await p.primary.query('SELECT to_jsonb(t)::text raw FROM public.synthetic_bigint t')).rows[0];
  assert.equal(measured.measurements[0].encoded_bytes,String(Buffer.byteLength(JSON.stringify(row.raw))));
}));
test('missing scope, source-review changes, flag mismatch and stale capacity fail before private or public writes',()=>pair(async p=>{
  const base=await opts(p,'primary','init',{newEpoch:crypto.randomUUID()});
  for(const mutate of [o=>o.approval.reviewed_sources.coordinator='0'.repeat(64),o=>o.capacity.expires_at='2020-01-01T00:00:00.000Z',o=>o.env={SUPABASE_REPLICATION_LIGHT:'0'}]){
    const o=structuredClone(base);mutate(o);await assert.rejects(()=>life.runAction(p.primary,o));
  }
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.runs`)).rows[0].n,0);
  await initialize(p,'primary');await assert.rejects(()=>action(p,'primary','activate',{expectedEpoch:crypto.randomUUID(),newEpoch:crypto.randomUUID(),deadline:new Date(Date.now()+60000).toISOString()}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_COVERAGE_INCOMPLETE');
}));
test('baseline and closing captures preserve raw numeric text, no-PK multiplicity and all committed low-sequence delete events',()=>pair(async p=>{
  await registerAll(p,'primary');const baseline=crypto.randomUUID();
  await action(p,'primary','capture',{captureId:baseline,phase:'baseline',keyId:KEYID,secret:KEY});
  await action(p,'primary','verify',{captureId:baseline,phase:'baseline',keyId:KEYID,secret:KEY});
  await p.primary.query(`INSERT INTO ${v2.NS}.events(id,run_id,table_name,mode,operation,transaction_id,old_key_digest,old_row_digest) OVERRIDING SYSTEM VALUE VALUES(100,$1,'synthetic_bigint','pk_digest','DELETE',1,repeat('a',64),repeat('b',64))`,[p.runId]);
  await p.primary.exec('DELETE FROM public.synthetic_bigint');await p.primary.exec("DELETE FROM public.synthetic_multiset WHERE ctid=(SELECT ctid FROM public.synthetic_multiset LIMIT 1)");
  const epoch=await activate(p,'primary'),closing=crypto.randomUUID();
  const capture=await action(p,'primary','capture',{captureId:closing,phase:'closing',expectedEpoch:epoch,keyId:KEYID,secret:KEY});assert.equal(capture.committed,true);assert.equal(capture.fresh_verification_required,true);
  const verified=await action(p,'primary','verify',{captureId:closing,phase:'closing',expectedEpoch:epoch,keyId:KEYID,secret:KEY});assert.equal(verified.verified,true);
  const meta=life.captureMeta({runId:p.runId,plan:p.plan,site:'primary',captureId:baseline,phase:'baseline',keyId:KEYID});
  const artifacts=(await p.primary.query(`SELECT * FROM ${v2.NS}.artifacts WHERE capture_id=$1`,[baseline])).rows;
  const data=JSON.parse(v2.decrypt({...meta,...artifacts.find(a=>a.stream==='table:synthetic_bigint')},KEY));assert.match(data.raw_rows[0],/9223372036854775806/);assert.match(data.raw_rows[0],/12345678901234567890\.123456789/);
  const multi=JSON.parse(v2.decrypt({...meta,...artifacts.find(a=>a.stream==='table:synthetic_multiset')},KEY));assert.equal(multi.raw_rows.length,2);
  const cm=life.captureMeta({runId:p.runId,plan:p.plan,site:'primary',captureId:closing,phase:'closing',expectedEpoch:epoch,keyId:KEYID});
  const j=(await p.primary.query(`SELECT * FROM ${v2.NS}.artifacts WHERE capture_id=$1 AND stream='identity-events:v2'`,[closing])).rows[0];
  const journal=JSON.parse(v2.decrypt({...cm,...j},KEY)).raw_rows.map(JSON.parse);assert.ok(journal.some(e=>String(e.id)==='100'));assert.ok(journal.some(e=>String(e.id)==='1'&&e.operation==='DELETE'));
  await assert.rejects(()=>p.primary.exec('DELETE FROM public.users'),e=>e.code==='55000');
}));
test('schema/function/trigger drift holds register and closing before artifacts; release remains explicit under expired capacity',()=>pair(async p=>{
  await registerAll(p,'primary');const epoch=await activate(p,'primary');
  await p.primary.exec(`ALTER TABLE public.users DISABLE TRIGGER ${v2.FENCE_TRIGGER}`);
  const captureId=crypto.randomUUID();await assert.rejects(()=>action(p,'primary','capture',{captureId,phase:'closing',expectedEpoch:epoch,keyId:KEYID,secret:KEY}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_TRIGGER_CHANGED');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts`)).rows[0].n,0);
  const context=await opts(p,'primary','release',{expectedEpoch:epoch,newEpoch:crypto.randomUUID(),capacity:null,env:{}});context.approval.expires_at=new Date(Date.now()-1).toISOString();
  const released=await life.runAction(p.primary,context);assert.equal(released.active,false);assert.equal(released.cutover_ready,false);
}));
test('same-snapshot growth fails before plaintext and reserved checkpoints count against retained budget',()=>pair(async p=>{
  await registerAll(p,'primary');const stale=await opts(p,'primary','capture',{captureId:crypto.randomUUID(),phase:'baseline',keyId:KEYID,secret:KEY});
  await p.primary.exec("INSERT INTO public.synthetic_multiset VALUES('new larger synthetic row')");
  await assert.rejects(()=>life.runAction(p.primary,stale),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_SIZING_CHANGED');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.artifacts`)).rows[0].n,0);
  await action(p,'primary','capture',{captureId:crypto.randomUUID(),phase:'baseline',keyId:KEYID,secret:KEY});
  await assert.rejects(()=>action(p,'primary','capture',{captureId:crypto.randomUUID(),phase:'baseline',keyId:KEYID,secret:KEY}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_RETAINED_CAPTURE_BUDGET');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts WHERE kind='reserved'`)).rows[0].n,2);
}));
test('exact-encoded v2 budget detects extra escaping with unchanged raw bytes and safely resumes the same reserved capture',()=>pair(async p=>{
  await registerAll(p,'primary');const captureId=crypto.randomUUID(),context=await opts(p,'primary','capture',{captureId,phase:'baseline',keyId:KEYID,secret:KEY,capacity:await capacity(p,'primary',2)});
  const before=context.capacity.measurements.find(m=>m.table==='synthetic_multiset');
  await p.primary.exec('UPDATE public.synthetic_multiset SET payload=repeat(chr(92),2)');
  const fresh=await capacity(p,'primary',2),after=fresh.measurements.find(m=>m.table==='synthetic_multiset');
  assert.equal(before.rows,after.rows);assert.equal(before.raw_bytes,after.raw_bytes);assert.equal(before.max_row_bytes,after.max_row_bytes);assert.ok(BigInt(after.encoded_bytes)>BigInt(before.encoded_bytes));
  await assert.rejects(()=>life.runAction(p.primary,context),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_SIZING_CHANGED');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.artifacts`)).rows[0].n,0);
  const done=await life.runAction(p.primary,{...context,capacity:fresh});assert.equal(done.committed,true);
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts WHERE kind='reserved'`)).rows[0].n,1);
}));
test('COMMIT response loss is reported as unknown and never called a clean rollback; fresh inspect proves the durable result',()=>pair(async p=>{
  const context=await opts(p,'primary','init',{newEpoch:crypto.randomUUID()});let committed=false;
  const client=wrap(p.primary,async(db,sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'){committed=true;throw new Error('synthetic-private-do-not-log');}return result;});
  let error;try{await life.runAction(client,context);}catch(e){error=e;}
  assert.ok(committed);assert.equal(error.cutoverCode,'CUTOVER_LIFECYCLE_COMMIT_OUTCOME_UNKNOWN');assert.equal(life.failureResult(error).inspect_required,true);assert.doesNotMatch(JSON.stringify(life.failureResult(error)),/private/);
  const inspect=await life.runAction(p.primary,{action:'inspect',site:'primary'});assert.equal(inspect.runs.length,1);assert.equal(inspect.control.epoch,context.newEpoch);
}));
test('capacity and source-review expiry at table FETCH, journal FETCH or final COMMIT rolls back all artifacts but retains reservation',()=>pair(async p=>{
  await registerAll(p,'primary');const captureId=crypto.randomUUID();
  for(const boundary of ['table','table_after_fetch','journal','precommit']){
    const context=await opts(p,'primary','capture',{captureId,phase:'baseline',keyId:KEYID,secret:KEY}),clock=Date.now;let advanced=false,sealed=false,fetchAfterExpiry=0,artifactAfterExpiry=0;
    const client=wrap(p.primary,async(db,sql,args)=>{if(advanced&&sql.startsWith('FETCH FORWARD '))fetchAfterExpiry++;if(advanced&&sql.startsWith(`INSERT INTO ${v2.NS}.artifacts`))artifactAfterExpiry++;
      const result=await db.query(sql,args);
      if(sql.startsWith(`INSERT INTO ${v2.NS}.receipts`)&&sql.includes("'committed'"))sealed=true;
      if((boundary==='table'&&sql.startsWith('DECLARE "cutover_'))||(boundary==='table_after_fetch'&&sql.startsWith('FETCH FORWARD '))||(boundary==='journal'&&sql.startsWith('DECLARE cutover_journal_'))||(boundary==='precommit'&&sealed&&sql==='SELECT 1')){advanced=true;Date.now=()=>clock()+16*60000;}
      return result;
    });
    try{await assert.rejects(()=>life.runAction(client,context),e=>/EXPIRED/.test(e.cutoverCode));}finally{Date.now=clock;}
    assert.ok(advanced);assert.equal(fetchAfterExpiry,0);assert.equal(artifactAfterExpiry,0);assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.artifacts WHERE capture_id=$1`,[context.captureId])).rows[0].n,0);
    assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts WHERE capture_id=$1 AND kind='reserved'`,[context.captureId])).rows[0].n,1);
    assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts WHERE capture_id=$1 AND kind='committed'`,[context.captureId])).rows[0].n,0);
  }
}));
test('explicit capture descriptor is immutable, committed artifacts cannot be silently re-created, and CLI has no default mutation',()=>pair(async p=>{
  await registerAll(p,'primary');const captureId=crypto.randomUUID(),args={captureId,phase:'baseline',keyId:KEYID,secret:KEY};
  await action(p,'primary','capture',args);const count=(await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.artifacts`)).rows[0].n;
  const repeat=await action(p,'primary','capture',args);assert.equal(repeat.existing,true);assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.artifacts`)).rows[0].n,count);
  await assert.rejects(()=>action(p,'primary','verify',{...args,phase:'closing',expectedEpoch:crypto.randomUUID()}),e=>e.cutoverCode==='CUTOVER_V2_RECEIPT_MISMATCH');
  assert.throws(()=>life.parseArgs([]));assert.throws(()=>life.parseArgs(['--action','release','--site','primary','--plan','x','--run-id',p.runId]));
  assert.throws(()=>life.parseArgs(['--action','inspect','--site','primary','--action','capture']));assert.equal(life.safeCode(new Error('private@example.invalid')),'CUTOVER_LIFECYCLE_HELD');
}));
test('an output-path failure preserves the acknowledged operation and immutable identifiers',()=>{
  const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'vpt-cutover-synthetic-')),file=path.join(dir,'result.json');
  try{fs.writeFileSync(file,'existing synthetic metadata');const result={ok:true,action:'activate',site:'primary',run_id:crypto.randomUUID(),epoch:crypto.randomUUID(),active:true,cutover_ready:false};
    const report=life.persistResult(result,file);assert.equal(report.ok,true);assert.equal(report.output_saved,false);assert.equal(report.output_warning,'CUTOVER_LIFECYCLE_OUTPUT_NOT_SAVED');assert.equal(report.epoch,result.epoch);assert.equal(fs.readFileSync(file,'utf8'),'existing synthetic metadata');
  }finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
testPg17('concurrent SERIALIZABLE reservations cannot over-allocate one remaining retained-capture slot',()=>pair(async p=>{
  assert.equal(typeof p.primary.newSession,'function');await registerAll(p,'primary');await action(p,'primary','capture',{captureId:crypto.randomUUID(),phase:'baseline',keyId:KEYID,secret:KEY});
  const a=await p.primary.newSession(),b=await p.primary.newSession();let arrivals=0,release;const barrier=new Promise(resolve=>{release=resolve;});
  const timer=setTimeout(()=>release(),10000);
  try{
    const clients=[a,b].map(db=>wrap(db,async(client,sql,args)=>{
      if(sql.startsWith(`INSERT INTO ${v2.NS}.receipts`)&&sql.includes("'reserved'")){arrivals++;if(arrivals===2)release();await barrier;assert.equal(arrivals,2,'both SSI transactions must read the same available slot');}
      return client.query(sql,args);
    }));
    const contexts=await Promise.all(clients.map(()=>opts(p,'primary','capture',{captureId:crypto.randomUUID(),phase:'baseline',keyId:KEYID,secret:KEY})));
    const results=await Promise.allSettled(clients.map((client,i)=>life.runAction(client,contexts[i])));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
    assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts WHERE kind='reserved'`)).rows[0].n,2);
    assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${v2.NS}.receipts WHERE kind='committed'`)).rows[0].n,2);
  }finally{clearTimeout(timer);await Promise.allSettled([a.close(),b.close()]);}
}));
testPg17('closing SHARE locks drain a permitted writer before the MVCC snapshot and include its committed row',()=>pair(async p=>{
  assert.equal(typeof p.primary.newSession,'function');await registerAll(p,'primary');const epoch=await activate(p,'primary');
  const writer=await p.primary.newSession(),closing=await p.primary.newSession();
  try{
    const oid=(await p.primary.query("SELECT 'public.synthetic_multiset'::regclass::oid::text oid")).rows[0].oid;
    await writer.query('BEGIN');await writer.query(`SELECT ${v2.NS}.mint_permit($1,$2,$3::oid[],ARRAY['INSERT'],'operator_recovery')`,[p.runId,epoch,[oid]]);
    await writer.query("INSERT INTO public.synthetic_multiset VALUES('late owner permit row')");
    // The synthetic budget explicitly includes the writer's pending row, read
    // through its own session, so the test isolates snapshot/lock ordering.
    const captureId=crypto.randomUUID(),context=await opts({...p,primary:writer},'primary','capture',{captureId,phase:'closing',expectedEpoch:epoch,keyId:KEYID,secret:KEY});
    const pending=life.runAction(closing,context);let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});
    await until(async()=>{assert.equal(settled,false);return (await p.primary.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) blocked',[writer.processID,closing.processID])).rows[0].blocked;});
    await writer.query('COMMIT');const result=await pending;assert.equal(result.committed,true);
    const artifact=(await p.primary.query(`SELECT * FROM ${v2.NS}.artifacts WHERE capture_id=$1 AND stream='table:synthetic_multiset'`,[captureId])).rows[0];
    const data=JSON.parse(v2.decrypt({...life.captureMeta(context),...artifact},KEY));assert.equal(data.raw_rows.length,3);assert.ok(data.raw_rows.some(r=>r.includes('late owner permit row')));
  }finally{await Promise.allSettled([writer.close(),closing.close()]);}
}));
testPg17('row_security=off rejects a filtered public table instead of measuring an apparently complete empty subset',()=>pair(async p=>{
  const session=await p.primary.newSession();try{
    await p.primary.exec('ALTER TABLE public.synthetic_multiset ENABLE ROW LEVEL SECURITY;ALTER TABLE public.synthetic_multiset FORCE ROW LEVEL SECURITY;GRANT SELECT ON public.synthetic_multiset TO authenticated;CREATE POLICY synthetic_deny ON public.synthetic_multiset TO authenticated USING(false)');
    await session.query('SET SESSION AUTHORIZATION authenticated');
    assert.equal((await session.query('SELECT count(*)::int n FROM public.synthetic_multiset')).rows[0].n,0);
    await assert.rejects(()=>life.runAction(session,{action:'measure',site:'primary',runId:p.runId,plan:p.plan,env:ENV,tables:['synthetic_multiset']}),e=>e.code==='42501');
    await session.query('RESET SESSION AUTHORIZATION');
  }finally{await session.close();}
}));
async function runLifecycleTests(){let passed=0;const selected=tests.filter(t=>!t.pg17||databaseFactory),skipped=tests.length-selected.length;for(const t of selected){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name);console.error(e.stack);process.exitCode=1;break;}}console.log(`${passed}/${selected.length} isolated PostgreSQL lifecycle tests passed; ${skipped} genuine multi-session cases deferred.`);return {passed,total:selected.length,skipped};}
if(require.main===module)runLifecycleTests().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={runLifecycleTests,setDatabaseFactoryForSyntheticTests};
