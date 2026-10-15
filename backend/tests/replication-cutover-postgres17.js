'use strict';

// Genuine PostgreSQL 17.6, disposable loopback database ONLY. No dotenv/startup.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {fork}=require('node:child_process');
const pgPath=process.argv[2];
const {Client}=require(pgPath||'pg');
const c=require('../scripts/prepare-replication-cutover-v2-20261015');
const RUN='11111111-1111-4111-8111-111111111111',ITEM='22222222-2222-4222-8222-222222222222';
const KEY=Buffer.alloc(32,23).toString('base64'),KEY_ID='77777777-7777-4777-8777-777777777777';
const tests=[],test=(name,fn)=>tests.push({name,fn});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let site,manifestSha;

function testUrl(){
  assert.equal(process.env.VPT_CUTOVER_TEST_ONLY,'1','Synthetic-only switch required');
  const url=new URL(process.env.VPT_CUTOVER_TEST_DATABASE_URL||'');
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Loopback only');
  assert.equal(url.pathname,'/vpt_cutover_synthetic','Disposable database name required');
  assert.equal(url.username,'postgres');assert.equal(url.search,'');assert.equal(url.hash,'');
  return url;
}
async function connect(port){const url=testUrl();if(port)url.port=String(port);const client=new Client({connectionString:url.toString(),ssl:false,connectionTimeoutMillis:5000,application_name:'vpt-synthetic-cutover-test'});client.on('error',()=>{});await client.connect();await client.query("SET statement_timeout='8s';SET lock_timeout='5s'");return client;}
async function close(client){try{await client.query('ROLLBACK');}catch{}try{await client.end();}catch{}}
async function clients(fn,n=3){const list=[];try{for(let i=0;i<n;i++)list.push(await connect());assert.equal(new Set(list.map(x=>x.processID)).size,n);await fn(...list);}finally{await Promise.all(list.map(close));}}
async function state(client){return (await client.query(`SELECT active,epoch FROM ${c.NS}.control WHERE singleton`)).rows[0];}
async function transition(client,active){const old=await state(client),epoch=crypto.randomUUID();await client.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,$4,CASE WHEN $4 THEN clock_timestamp()+interval '10 minutes' END,'operator_recovery')`,[RUN,old.epoch,epoch,active]);return epoch;}
async function ensureOpen(client){if((await state(client)).active)await transition(client,false);}
async function barrier(predicate,label,timeout=4000){const until=Date.now()+timeout;do{if(await predicate())return;await wait(20);}while(Date.now()<until);throw Error('Barrier timeout: '+label);}
async function blockedBy(observer,blocked,blocker){return (await observer.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS yes',[blocked.processID,blocker.processID])).rows[0].yes;}

async function setup(){await clients(async admin=>{
  assert.equal((await admin.query("SELECT current_setting('server_version_num') AS version,current_database() AS db")).rows[0].version,'170006','Must test exact PostgreSQL17.6');
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='public' AND x.relkind IN('r','p','v','m','f')")).rows[0].n,0,'Fresh disposable DB required');
  await admin.query('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE ROLE authenticator;GRANT service_role TO authenticator');
  await admin.query(`CREATE TABLE public.fence_items(id uuid PRIMARY KEY,value text,amount numeric,instant timestamptz);
    CREATE TABLE public.other_items(id uuid PRIMARY KEY,value text);
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;`);
  await admin.query("INSERT INTO public.fence_items VALUES($1,'fixture',123456789012345678901234567890.123456789,'2026-10-15T12:00:00+07:00')",[ITEM]);
  await admin.query(fs.readFileSync(path.resolve(__dirname,'../../database/20261015051758_replication_cutover_v2_preparation.sql'),'utf8'));
  await c.privateContract(admin); // Actual PG17 catalog compatibility, not a mock.
  site=await c.inventorySite(admin,'primary',{SUPABASE_REPLICATION_LIGHT:'1'});manifestSha=c.hash(c.stable(site));
  await admin.query(`INSERT INTO ${c.NS}.runs(id,site,project_ref,manifest_sha256,manifest) VALUES($1,'primary','kdxypztstbeovyedmvem',$2,$3::jsonb)`,[RUN,manifestSha,JSON.stringify(site)]);
  await admin.query(`INSERT INTO ${c.NS}.control(singleton,run_id,epoch) VALUES(true,$1,$2)`,[RUN,crypto.randomUUID()]);
  for(const t of site.tables){
    await admin.query(`INSERT INTO ${c.NS}.registrations(table_oid,table_name,run_id,key_columns,key_types,mode,catalog_sha256) VALUES($1::oid,$2,$3,$4::text[],$5::text[],$6,$7)`,[t.oid,t.name,RUN,t.key_columns,t.key_types,t.mode,t.catalog_sha256]);
    await admin.query(`CREATE TRIGGER ${c.FENCE_TRIGGER} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public."${t.name}" FOR EACH STATEMENT EXECUTE FUNCTION ${c.NS}.write_fence();ALTER TABLE public."${t.name}" ENABLE ALWAYS TRIGGER ${c.FENCE_TRIGGER};
      CREATE TRIGGER ${c.CAPTURE_TRIGGER} AFTER INSERT OR UPDATE OR DELETE ON public."${t.name}" FOR EACH ROW EXECUTE FUNCTION ${c.NS}.capture_digest();ALTER TABLE public."${t.name}" ENABLE ALWAYS TRIGGER ${c.CAPTURE_TRIGGER}`);
  }
},1);}

function meta(){return {run_id:RUN,capture_id:crypto.randomUUID(),site:'primary',phase:'baseline',manifest_sha256:manifestSha,key_id:KEY_ID,streams:['table:fence_items']};}
async function sealedTransaction(client,m){await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const stream=await c.streamTable(client,site.tables.find(t=>t.name==='fence_items'),m,KEY,a=>c.writeArtifact(client,a));await c.writeArtifact(client,c.encrypt(JSON.stringify({descriptor:c.descriptor(m),streams:[stream]}),{...m,stream:'manifest',part:0,rows:1},KEY));await c.seal(client,m,KEY);}

test('activation demonstrably waits for a pre-fence writer transaction and stays closed afterward',()=>clients(async(writer,operator,observer)=>{
  await ensureOpen(operator);await writer.query('BEGIN');await writer.query("UPDATE public.fence_items SET value='pre-fence writer' WHERE id=$1",[ITEM]);
  const old=await state(operator),epoch=crypto.randomUUID();let settled=false;
  const activation=operator.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,true,clock_timestamp()+interval '10 minutes','closing_capture')`,[RUN,old.epoch,epoch]).finally(()=>{settled=true;});
  await barrier(()=>blockedBy(observer,operator,writer),'activation blocked by existing writer');assert.equal(settled,false);
  await writer.query('COMMIT');await activation;assert.equal((await state(observer)).active,true);
  await assert.rejects(()=>writer.query("UPDATE public.fence_items SET value='must hold'"),e=>e.code==='55000');
}));
test('bounded activation lock timeout retains the previous open state',()=>clients(async(writer,operator,observer)=>{
  await ensureOpen(operator);const before=await state(operator);await writer.query('BEGIN');await writer.query("UPDATE public.fence_items SET value='locking' WHERE id=$1",[ITEM]);
  await operator.query("SET lock_timeout='150ms'");await assert.rejects(()=>operator.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,true,clock_timestamp()+interval '10 minutes','closing_capture')`,[RUN,before.epoch,crypto.randomUUID()]),e=>e.code==='55P03');
  assert.deepEqual(await state(observer),before);await writer.query('ROLLBACK');
}));
for(const isolation of ['REPEATABLE READ','SERIALIZABLE'])test(`old ${isolation} snapshot cannot bypass a newly committed fence`,()=>clients(async(reader,operator,observer)=>{
  await ensureOpen(operator);const before=(await observer.query(`SELECT count(*)::text AS n FROM ${c.NS}.events`)).rows[0].n;
  await reader.query('BEGIN ISOLATION LEVEL '+isolation);await reader.query('SELECT * FROM public.fence_items');await transition(operator,true);
  await assert.rejects(()=>reader.query("UPDATE public.fence_items SET value='old snapshot bypass' WHERE id=$1",[ITEM]),e=>e.code==='40001');await reader.query('ROLLBACK');
  assert.equal((await observer.query(`SELECT count(*)::text AS n FROM ${c.NS}.events`)).rows[0].n,before);
}));
test('closing shared lock demonstrably prevents concurrent release until capture transaction ends',()=>clients(async(capture,operator,observer)=>{
  if(!(await state(operator)).active)await transition(operator,true);const active=await state(operator);
  await capture.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await c.lockClosingFence(capture,{run_id:RUN,phase:'closing',fence_epoch:active.epoch});
  const release=operator.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,false,NULL,'operator_recovery')`,[RUN,active.epoch,crypto.randomUUID()]);
  await barrier(()=>blockedBy(observer,operator,capture),'release blocked by closing transaction');assert.equal((await state(observer)).active,true);
  await capture.query('COMMIT');await release;assert.equal((await state(observer)).active,false);
}));
test('permits cannot cross sessions/transactions and cannot widen relation or operation scope',()=>clients(async(owner,other,observer)=>{
  if(!(await state(owner)).active)await transition(owner,true);const current=await state(owner),oid=(await owner.query("SELECT 'public.fence_items'::regclass::oid AS oid")).rows[0].oid;
  await owner.query('BEGIN');await owner.query(`SELECT ${c.NS}.mint_permit($1,$2,$3::oid[],ARRAY['UPDATE'],'bounded_parent_repair')`,[RUN,current.epoch,[oid]]);
  await assert.rejects(()=>other.query("UPDATE public.fence_items SET value='different session'"),e=>e.code==='55000');
  await owner.query("UPDATE public.fence_items SET value='permitted owner' WHERE id=$1",[ITEM]);await owner.query('COMMIT');
  await assert.rejects(()=>owner.query("UPDATE public.fence_items SET value='next transaction'"),e=>e.code==='55000');
  for(const statement of ['DELETE FROM public.fence_items',"UPDATE public.other_items SET value='widened'"]){await owner.query('BEGIN');await owner.query(`SELECT ${c.NS}.mint_permit($1,$2,$3::oid[],ARRAY['UPDATE'],'bounded_parent_repair')`,[RUN,current.epoch,[oid]]);await assert.rejects(()=>owner.query(statement),e=>e.code==='55000');await owner.query('ROLLBACK');}
  assert.equal((await observer.query('SELECT value FROM public.fence_items WHERE id=$1',[ITEM])).rows[0].value,'permitted owner');
}));
test('authenticator/service and owner-defined RPC remain fenced despite a caller GUC',()=>clients(async(api,operator)=>{
  if(!(await state(operator)).active)await transition(operator,true);
  await operator.query(`CREATE FUNCTION public.fixture_definer() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$UPDATE public.fence_items SET value='RPC bypass'$$`);
  await api.query("SET SESSION AUTHORIZATION authenticator;SET ROLE service_role;SET vpt.fake_bypass='true'");
  try{await assert.rejects(()=>api.query("UPDATE public.fence_items SET value='API bypass'"),e=>e.code==='55000');await assert.rejects(()=>api.query('SELECT public.fixture_definer()'),e=>e.code==='55000');}finally{await api.query('SET SESSION AUTHORIZATION postgres;RESET ROLE');}
},2));

function childMessage(child,kind){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>done(Error('Synthetic child barrier timeout')),6000);function message(m){if(m?.kind===kind)done(null,m);if(m?.kind==='failed')done(Error('Synthetic child failed'));}function exited(){done(Error('Synthetic child exited early'));}function done(err,value){clearTimeout(timeout);child.off('message',message);child.off('exit',exited);err?reject(err):resolve(value);}child.on('message',message);child.on('exit',exited);});}
async function killKnownChild(child){if(child.exitCode!==null||child.signalCode)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await ended;}
test('killing only the isolated child before COMMIT rolls back; killing after COMMIT preserves the durable fence',()=>clients(async(operator,observer)=>{
  for(const pause of ['before_commit','after_commit']){
    await ensureOpen(operator);const old=await state(operator),epoch=crypto.randomUUID();
    const child=fork(__filename,[pgPath,'--synthetic-child'],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:{...process.env}});
    try{const ready=childMessage(child,'ready');await ready;const reached=childMessage(child,pause);child.send({run:RUN,expected:old.epoch,epoch,pause});const result=await reached;await killKnownChild(child);
      await barrier(async()=>!(await observer.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS present',[result.pid])).rows[0].present,'killed child backend exit');
      const actual=await state(observer);assert.equal(actual.active,pause==='after_commit');assert.equal(actual.epoch,pause==='after_commit'?epoch:old.epoch);
    }finally{await killKnownChild(child);}
  }
},2));

// Real protocol fault: drop the successful backend COMMIT response, rather than
// pretending that an exception after an acknowledged COMMIT is network loss.
async function commitAckProxy(){const target=testUrl(),sockets=new Set();let armed=false,observedResolve;const observed=new Promise(resolve=>{observedResolve=resolve;});
  const server=net.createServer(front=>{sockets.add(front);const back=net.connect({host:target.hostname,port:Number(target.port)});sockets.add(back);let fb=Buffer.alloc(0),bb=Buffer.alloc(0),dropping=false;
    const destroy=()=>{front.destroy();back.destroy();};front.on('error',destroy);back.on('error',destroy);front.on('close',()=>{sockets.delete(front);back.destroy();});back.on('close',()=>{sockets.delete(back);front.destroy();});
    front.on('data',data=>{if(!armed){back.write(data);return;}fb=Buffer.concat([fb,data]);while(fb.length>=5){const size=fb.readInt32BE(1)+1;if(size<5||size>1024*1024){destroy();return;}if(fb.length<size)return;const frame=fb.subarray(0,size);fb=fb.subarray(size);if(frame[0]===81&&frame.subarray(5).toString('utf8').replace(/\0$/,'').trim().toUpperCase()==='COMMIT')dropping=true;back.write(frame);}});
    back.on('data',data=>{if(!dropping){front.write(data);return;}bb=Buffer.concat([bb,data]);while(bb.length>=5){const size=bb.readInt32BE(1)+1;if(size<5||size>1024*1024){destroy();return;}if(bb.length<size)return;const frame=bb.subarray(0,size);bb=bb.subarray(size);if(frame[0]===67&&frame.subarray(5).toString('utf8')==='COMMIT\0'){observedResolve(true);destroy();return;}if(frame[0]===69){front.write(frame);return;}/* Hold all other response frames until COMMIT outcome. */}});
  });await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {port:server.address().port,arm(){armed=true;},observed,async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
test('actual lost COMMIT acknowledgment leaves an authenticated immutable receipt visible to a fresh observer',()=>clients(async(observer)=>{
  const proxy=await commitAckProxy();let client;
  try{client=await connect(proxy.port);const m=meta();await c.reserve(client,m);await sealedTransaction(client,m);proxy.arm();await assert.rejects(()=>client.query('COMMIT'));await Promise.race([proxy.observed,wait(4000).then(()=>{throw Error('Successful COMMIT response was not observed');})]);
    assert.equal((await c.verifyCheckpoint(observer,m,KEY)).verified,true);
    assert.equal((await c.checkpointState(observer,m)).state,'committed');
  }finally{if(client)await close(client);await proxy.close();}
},1));

async function childMain(){const client=await connect();process.send?.({kind:'ready'});process.once('message',async m=>{try{await client.query('BEGIN');await client.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,true,clock_timestamp()+interval '10 minutes','closing_capture')`,[m.run,m.expected,m.epoch]);if(m.pause==='before_commit'){process.send?.({kind:'before_commit',pid:client.processID});return;}await client.query('COMMIT');process.send?.({kind:'after_commit',pid:client.processID});}catch{process.send?.({kind:'failed'});}});}
async function main(){await setup();let passed=0;for(const t of tests){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name);throw e;}}console.log(`${passed}/${tests.length} genuine PostgreSQL17.6 multi-session tests passed; synthetic data only.`);}
if(process.argv[3]==='--synthetic-child')childMain().catch(()=>{process.send?.({kind:'failed'});process.exitCode=1;});
else main().catch(e=>{console.error(e.stack);process.exitCode=1;});
