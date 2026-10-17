'use strict';
// Isolated PostgreSQL, synthetic fixtures only. No startup/env/network access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {PGlite}=require(process.argv[2]||'@electric-sql/pglite');
const c=require('../scripts/preserve-replication-cutover-20261015');
const sql=fs.readFileSync(path.resolve(__dirname,'../../database/20261015050417_replication_cutover_preservation.sql'),'utf8');
const KEY=Buffer.alloc(32,7).toString('base64'),KEY_ID='77777777-7777-4777-8777-777777777777';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const tests=[],test=(name,fn)=>tests.push({name,fn});
async function setup(){const primary=new PGlite(),backup=new PGlite();for(const db of [primary,backup]){
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE ROLE authenticator;
    CREATE TABLE public.users(id uuid PRIMARY KEY,email text,password text,salary numeric);
    CREATE TABLE public.departments(id uuid PRIMARY KEY,name text);
    CREATE TABLE public.crm_leads(id uuid PRIMARY KEY,company_id uuid,code text,type text,assigned_to uuid REFERENCES public.users(id) ON DELETE CASCADE);
    CREATE TABLE public.project_substage_status(id uuid PRIMARY KEY,project_id uuid NOT NULL,stage_id uuid NOT NULL,value text);
    CREATE TABLE public.trash_items(id uuid PRIMARY KEY,snapshot jsonb);
    CREATE TABLE public.uncovered_module(id uuid PRIMARY KEY,value text);
    CREATE TABLE public.user_last_activity(id uuid PRIMARY KEY,value text);
    CREATE SCHEMA storage;CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text,metadata jsonb);
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.query("INSERT INTO public.users VALUES($1,'fixture@example.invalid','fixture-private-password-hash',123456789012345678901234567890.123456789)",[A]);
  await db.query("INSERT INTO public.crm_leads VALUES($1,$2,'FIXTURE-1','lead',$3)",[B,C,A]);
  await db.query("INSERT INTO public.project_substage_status VALUES($1,$2,$3,'old')",[A,B,C]);
  await db.query("INSERT INTO public.departments VALUES($1,'Synthetic department')",[A]);
  await db.query("INSERT INTO public.trash_items VALUES($1,'{\"synthetic\":true}')",[A]);
  await db.query("INSERT INTO storage.objects VALUES($1,'fixture','file.txt','{\"size\":12}')",[A]);
  await db.exec(sql);
}return {primary,backup};}
async function pair(fn){const p=await setup();try{await fn(p);}finally{await p.primary.close();await p.backup.close();}}
async function arm(p,runId){return c.preserve({...p,mode:'arm',runId});}
async function snap(p,run,phase='baseline'){return c.preserve({...p,mode:'snapshot',runId:run.run_id,phase,secret:KEY,keyId:KEY_ID});}
async function rows(db,table){return (await db.query(`SELECT to_jsonb(t)::text AS raw FROM public.${table} t ORDER BY id`)).rows.map(r=>r.raw);}
async function events(db){return (await db.query(`SELECT * FROM ${c.NS}.events ORDER BY id`)).rows;}
async function artifacts(db,phase,captureId){return (await db.query(`SELECT * FROM ${c.NS}.artifacts ${phase?'WHERE phase=$1':''}${captureId?' AND capture_id=$2':''} ORDER BY stream,part`,phase?(captureId?[phase,captureId]:[phase]):[])).rows;}
function client(db,intercept){const out=new EventEmitter();out.query=async(...args)=>intercept?intercept(db,out,...args):db.query(...args);return out;}

test('migration attaches no public trigger; inventory derives config universe and always reports uncovered/queue uncertainty',()=>pair(async p=>{
  const result=await c.preserve(p);assert.equal(result.mode,'inventory');assert.equal(result.cutover_ready,false);assert.equal(result.queue_inventory_complete,false);
  assert.ok(result.coverage.primary.uncovered_tables.includes('uncovered_module'));assert.ok(result.coverage.primary.excluded_tables.includes('user_last_activity'));
  assert.equal((await p.primary.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname LIKE 'vpt_cutover_%'")).rows[0].n,0);
  assert.equal((await artifacts(p.backup)).length,0);
  assert.ok(c.skipTables({SUPABASE_REPLICATION_LIGHT:'1'}).includes('facebook_webhook_logs'));
  assert.deepEqual(c.skipTables({SUPABASE_REPLICATION_SKIP_TABLES:'crm_leads,users'}),['crm_leads','users']);
}));
test('armed identity journals capture direct/RPC-equivalent DML, rollback, PK changes and cascaded deletes without credential payload',()=>pair(async p=>{
  const before=await rows(p.primary,'users'),run=await arm(p);assert.equal(run.cutover_ready,false);assert.deepEqual(await rows(p.primary,'users'),before);
  await p.primary.query("UPDATE public.users SET password='new-private-fixture-hash' WHERE id=$1",[A]);
  await p.primary.exec('BEGIN');await p.primary.query("UPDATE public.crm_leads SET code='ROLLED-BACK' WHERE id=$1",[B]);await p.primary.exec('ROLLBACK');
  await p.primary.query('UPDATE public.project_substage_status SET id=$1 WHERE id=$2',[C,A]);
  await p.primary.query('DELETE FROM public.users WHERE id=$1',[A]);
  const es=await events(p.primary);assert.equal(es.length,4);
  assert.ok(es.some(e=>e.table_name==='crm_leads'&&e.operation==='DELETE'&&e.old_key.id===B));
  assert.ok(es.some(e=>e.old_key?.id===A&&e.new_key?.id===C));
  assert.ok(es.some(e=>e.touched_columns.includes('password')));
  assert.doesNotMatch(JSON.stringify(es),/new-private-fixture-hash|fixture-private-password-hash|fixture@example/);
  assert.ok(es.every(e=>e.old_digest===null||e.old_digest.length===64));
}));
test('journal insert failure aborts the source mutation and TRUNCATE is explicitly held',()=>pair(async p=>{
  await arm(p);const before=await rows(p.primary,'users');
  await p.primary.exec(`ALTER TABLE ${c.NS}.events ADD CONSTRAINT fixture_fail CHECK(operation<>'UPDATE')`);
  await assert.rejects(()=>p.primary.query("UPDATE public.users SET password='should-not-persist' WHERE id=$1",[A]),e=>e.code==='23514');
  assert.deepEqual(await rows(p.primary,'users'),before);assert.equal((await events(p.primary)).length,0);
  await assert.rejects(()=>p.primary.exec('TRUNCATE public.crm_leads'),e=>e.code==='55000');
  assert.equal((await rows(p.primary,'crm_leads')).length,1);
}));
test('service role can perform existing business DML but cannot read or inject private journal/artifacts',()=>pair(async p=>{
  await arm(p);await p.primary.exec('SET ROLE service_role');
  await p.primary.query("UPDATE public.crm_leads SET code='FIXTURE-2' WHERE id=$1",[B]);
  for(const query of [`SELECT * FROM ${c.NS}.events`,`DELETE FROM ${c.NS}.events`,`SELECT * FROM ${c.NS}.artifacts`])await assert.rejects(()=>p.primary.query(query),e=>e.code==='42501');
  await p.primary.exec('RESET ROLE');assert.equal((await events(p.primary)).length,1);
}));
test('encrypted baseline preserves exact numeric JSON, both sites, manifests, and reports partial scope honestly',()=>pair(async p=>{
  const run=await arm(p),before=await rows(p.primary,'users'),result=await snap(p,run);
  assert.equal(result.cutover_ready,false);assert.equal(result.production_rows_changed,0);assert.ok(result.captured.every(s=>s.storage_manifest_present));
  for(const db of [p.primary,p.backup]){const stored=await artifacts(db);assert.ok(stored.length>=8);
    assert.ok(stored.every(a=>!Buffer.from(a.ciphertext).toString('utf8').includes('fixture-private-password-hash')));
    const users=stored.find(a=>a.stream==='table:users');const payload=JSON.parse(c.decrypt(users,KEY));
    assert.ok(payload.raw_rows[0].includes('123456789012345678901234567890.123456789'));
    assert.ok(payload.raw_rows[0].includes('fixture-private-password-hash'));
    const manifest=JSON.parse(c.decrypt(stored.find(a=>a.stream==='manifest'),KEY));assert.equal(manifest.cutover_ready,false);assert.equal(manifest.commit_order_proven,false);
  }assert.deepEqual(await rows(p.primary,'users'),before);
}));
test('closing capture includes deletes, backup-worker mutations and committed events below a previously observed maximum ID',()=>pair(async p=>{
  const run=await arm(p);await p.primary.query(`INSERT INTO ${c.NS}.events(id,run_id,table_name,operation,transaction_id,old_key,touched_columns) OVERRIDING SYSTEM VALUE VALUES(100,$1,'crm_leads','DELETE',1,'{"id":"${A}"}',ARRAY[]::text[])`,[run.run_id]);
  await snap(p,run);
  await p.primary.query('DELETE FROM public.crm_leads WHERE id=$1',[B]);
  await p.backup.query('UPDATE public.crm_leads SET company_id=$1 WHERE id=$2',[A,B]);
  const result=await snap(p,run,'closing');assert.equal(result.cutover_ready,false);
  const exported=JSON.parse(c.decrypt((await artifacts(p.primary,'closing')).find(a=>a.stream==='identity-events'),KEY)).raw_rows.map(JSON.parse);
  assert.ok(exported.some(e=>String(e.id)==='100'));assert.ok(exported.some(e=>String(e.id)==='1'&&e.operation==='DELETE'));
  assert.ok((await events(p.backup)).some(e=>e.operation==='UPDATE'&&e.new_context.company_id===A));
  const leads=JSON.parse(c.decrypt((await artifacts(p.primary,'closing')).find(a=>a.stream==='table:crm_leads'),KEY));assert.equal(leads.raw_rows.length,0);
}));
test('unknown scope, no PK/composite PK and schema/trigger drift are held before a snapshot is persisted',()=>pair(async p=>{
  await assert.rejects(()=>c.preserve({...p,mode:'arm',tables:['uncovered_module']}),e=>e.cutoverCode==='CUTOVER_SCOPE_UNSUPPORTED');
  await p.primary.exec('ALTER TABLE public.project_substage_status DROP CONSTRAINT project_substage_status_pkey;ALTER TABLE public.project_substage_status ADD PRIMARY KEY(project_id,stage_id)');
  await assert.rejects(()=>arm(p),e=>e.cutoverCode==='CUTOVER_PRIMARY_KEY_UNSUPPORTED');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${c.NS}.runs`)).rows[0].n,0);
}));
test('disabled capture trigger, public ACL drift and wrong key version fail closed',()=>pair(async p=>{
  const run=await arm(p);await p.primary.exec('ALTER TABLE public.users DISABLE TRIGGER vpt_cutover_identity_20261015');
  await assert.rejects(()=>snap(p,run),e=>e.cutoverCode==='CUTOVER_TRIGGER_CHANGED');
  await p.primary.exec('ALTER TABLE public.users ENABLE ALWAYS TRIGGER vpt_cutover_identity_20261015');
  await p.primary.exec(`GRANT USAGE ON SCHEMA ${c.NS} TO authenticated`);
  await assert.rejects(()=>snap(p,run),e=>e.cutoverCode==='CUTOVER_PRIVATE_STORE_REQUIRED');
  assert.equal((await artifacts(p.primary)).length,0);
  await assert.rejects(()=>c.preserve({...p,mode:'snapshot',runId:run.run_id,secret:KEY,keyId:'not-a-version'}),e=>e.cutoverCode==='CUTOVER_KEY_VERSION_REQUIRED');
}));
test('artifact authentication binds run/site/stream/key version and rejects tampering even with recomputed ciphertext digest',()=>{
  const m={run_id:A,capture_id:C,phase:'baseline',site:'primary',stream:'table:users',part:0,row_count:1,key_label:KEY_ID};
  const e=c.encrypt('synthetic raw rows',m,KEY),r={...m,...e,algorithm:c.ALG};assert.equal(c.decrypt(r,KEY),'synthetic raw rows');
  for(const change of [{site:'backup'},{stream:'identity-events'},{run_id:B},{capture_id:B},{key_label:C}])assert.throws(()=>c.decrypt({...r,...change},KEY),/CUTOVER_ARTIFACT_DECRYPT/);
  const corrupt=Buffer.from(e.ciphertext);corrupt[0]^=1;assert.throws(()=>c.decrypt({...r,ciphertext:corrupt,ciphertext_sha256:crypto.createHash('sha256').update(corrupt).digest('hex')},KEY),/CUTOVER_ARTIFACT_DECRYPT/);
});
test('reviewed capture body is pinned before arm and detects bootstrap no-op or later definition drift',()=>pair(async p=>{
  const body=sql.split('AS $$')[1].split('$$')[0].replace(/\r\n/g,'\n');assert.equal(crypto.createHash('sha256').update(body).digest('hex'),c.CAPTURE_BODY_SHA256);
  await p.primary.exec(`CREATE OR REPLACE FUNCTION ${c.NS}.capture_identity_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$BEGIN RETURN NULL; END$$`);
  await assert.rejects(()=>arm(p),e=>e.cutoverCode==='CUTOVER_CAPTURE_FUNCTION_CHANGED');
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${c.NS}.runs`)).rows[0].n,0);
}));
test('freeform contact-like code/type is hashed or omitted from plaintext identity journal',()=>pair(async p=>{
  await arm(p);await p.primary.query("UPDATE public.crm_leads SET code='synthetic-contact@example.invalid',type='+84999999999' WHERE id=$1",[B]);
  const es=await events(p.primary);assert.doesNotMatch(JSON.stringify(es),/synthetic-contact|84999999999/);assert.equal(es[0].new_context.type,undefined);assert.equal(es[0].new_context.code,undefined);
  assert.equal(es[0].new_context.code_sha256,crypto.createHash('sha256').update(JSON.stringify('synthetic-contact@example.invalid')).digest('hex'));
}));
test('all application roles are denied function/sequence/private relations and sequence ACL drift holds snapshots',()=>pair(async p=>{
  const run=await arm(p);
  for(const role of ['anon','authenticated','service_role','authenticator']){
    const allowed=(await p.primary.query(`SELECT has_function_privilege($1,'${c.NS}.capture_identity_change()','EXECUTE') f,has_sequence_privilege($1,'${c.NS}.events_id_seq','USAGE,SELECT,UPDATE') s,has_table_privilege($1,'${c.NS}.events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') t`,[role])).rows[0];assert.deepEqual(allowed,{f:false,s:false,t:false});
  }
  await p.primary.exec(`GRANT SELECT ON SEQUENCE ${c.NS}.events_id_seq TO authenticated`);
  await assert.rejects(()=>snap(p,run),e=>e.cutoverCode==='CUTOVER_PRIVATE_STORE_REQUIRED');
}));
test('post-commit verify authenticates complete artifacts and rejects missing chunks',()=>pair(async p=>{
  const run=await arm(p),capture=await snap(p,run);
  const opts={...p,mode:'verify',runId:run.run_id,captureId:capture.capture_id,phase:'baseline',secret:KEY,keyId:KEY_ID};
  const verified=await c.preserve(opts);assert.ok(verified.verified.every(s=>s.verified));assert.equal(verified.cutover_ready,false);
  await p.backup.query(`DELETE FROM ${c.NS}.artifacts WHERE capture_id=$1 AND stream='table:users'`,[capture.capture_id]);
  await assert.rejects(()=>c.preserve(opts),e=>e.cutoverCode==='CUTOVER_ARTIFACT_SET_REQUIRED');
}));
test('new closing checkpoint re-enumerates every committed event, including late lower IDs',()=>pair(async p=>{
  const run=await arm(p);await p.primary.query(`INSERT INTO ${c.NS}.events(id,run_id,table_name,operation,transaction_id,touched_columns) OVERRIDING SYSTEM VALUE VALUES(100,$1,'users','UPDATE',1,ARRAY[]::text[])`,[run.run_id]);
  const first=await snap(p,run,'closing');await p.primary.query("UPDATE public.users SET password='late-private-fixture' WHERE id=$1",[A]);const second=await snap(p,run,'closing');
  assert.notEqual(first.capture_id,second.capture_id);
  const initial=JSON.parse(c.decrypt((await artifacts(p.primary,'closing',first.capture_id)).find(a=>a.stream==='identity-events'),KEY)).raw_rows.map(JSON.parse);
  const later=JSON.parse(c.decrypt((await artifacts(p.primary,'closing',second.capture_id)).find(a=>a.stream==='identity-events'),KEY)).raw_rows.map(JSON.parse);
  assert.deepEqual(initial.map(e=>String(e.id)),['100']);assert.ok(later.some(e=>String(e.id)==='1'));assert.ok(later.some(e=>String(e.id)==='100'));
}));
test('unknown first COMMIT acknowledgement reports run/site and explicit same-run resume preserves committed capture',()=>pair(async p=>{
  const primary=client(p.primary,async(db,out,statement,...args)=>{const r=await db.query(statement,...args);if(statement==='COMMIT')throw Error('private credential in lost ACK');return r;});let failed;
  try{await c.preserve({primary,backup:p.backup,mode:'arm'});}catch(e){failed=e;}
  assert.equal(failed?.cutoverCode,'CUTOVER_PARTIAL_COMMIT_REVIEW_REQUIRED');assert.equal(failed.commit_site,'primary');assert.match(failed.run_id,/^[a-f0-9-]{36}$/);
  assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${c.NS}.registrations`)).rows[0].n,5);assert.equal((await p.backup.query(`SELECT count(*)::int n FROM ${c.NS}.registrations`)).rows[0].n,0);
  await p.primary.query("UPDATE public.users SET password='between-partial-arm' WHERE id=$1",[A]);const resumed=await arm(p,failed.run_id);
  assert.deepEqual(resumed.armed.map(s=>s.resumed),[true,false]);assert.equal((await events(p.primary)).length,1);
  assert.doesNotMatch(JSON.stringify(c.failureResult(failed)),/credential|lost ACK/);
}));
test('partial snapshot commit resumes immutable checkpoint only after full authenticated readback',()=>pair(async p=>{
  const run=await arm(p);const backup=client(p.backup,async(db,out,statement,...args)=>{if(statement==='COMMIT')throw Error('synthetic before backup commit');return db.query(statement,...args);});let failed;
  try{await c.preserve({primary:p.primary,backup,mode:'snapshot',runId:run.run_id,secret:KEY,keyId:KEY_ID});}catch(e){failed=e;}
  assert.equal(failed?.cutoverCode,'CUTOVER_PARTIAL_COMMIT_REVIEW_REQUIRED');assert.equal(failed.commit_site,'backup');assert.ok(failed.capture_id);assert.ok((await artifacts(p.primary)).length>0);assert.equal((await artifacts(p.backup)).length,0);
  await p.primary.query("UPDATE public.users SET password='after-partial-checkpoint' WHERE id=$1",[A]);
  const resumed=await c.preserve({...p,mode:'snapshot',runId:run.run_id,captureId:failed.capture_id,secret:KEY,keyId:KEY_ID});assert.deepEqual(resumed.captured.map(s=>s.resumed),[true,false]);
  const payload=JSON.parse(c.decrypt((await artifacts(p.primary)).find(a=>a.stream==='table:users'),KEY));assert.doesNotMatch(payload.raw_rows[0],/after-partial-checkpoint/);
  await p.primary.query(`DELETE FROM ${c.NS}.artifacts WHERE capture_id=$1 AND stream='table:users'`,[failed.capture_id]);
  await assert.rejects(()=>c.preserve({...p,mode:'snapshot',runId:run.run_id,captureId:failed.capture_id,secret:KEY,keyId:KEY_ID}),e=>e.cutoverCode==='CUTOVER_ARTIFACT_SET_REQUIRED');
}));
test('idle client failures before commit abort both sites without leaking raw error or acknowledging data',()=>pair(async p=>{
  const run=await arm(p);let injected=false;const backup=client(p.backup,async(db,out,statement,...args)=>{const r=await db.query(statement,...args);if(statement==='SELECT 1'&&!injected){injected=true;out.emit('error',Error('secret URL password'));}return r;});
  await assert.rejects(()=>c.preserve({primary:p.primary,backup,mode:'snapshot',runId:run.run_id,secret:KEY,keyId:KEY_ID}),e=>e.cutoverCode==='CUTOVER_CONNECTION_LOST'&&!JSON.stringify(c.failureResult(e)).includes('secret'));
  assert.equal((await artifacts(p.primary)).length,0);assert.equal((await artifacts(p.backup)).length,0);
}));
test('missing primary key fails independently before trigger registration',()=>pair(async p=>{
  await p.primary.exec('ALTER TABLE public.project_substage_status DROP CONSTRAINT project_substage_status_pkey');
  await assert.rejects(()=>arm(p),e=>e.cutoverCode==='CUTOVER_PRIMARY_KEY_UNSUPPORTED');assert.equal((await p.primary.query(`SELECT count(*)::int n FROM ${c.NS}.runs`)).rows[0].n,0);
}));
test('arguments, fixed project URLs and actual pg TLS configuration reject override shortcuts',()=>{
  assert.equal(c.parseArgs([]).mode,'inventory');assert.throws(()=>c.parseArgs(['--arm','--snapshot']),/CUTOVER_ARGUMENT_INVALID/);
  assert.throws(()=>c.parseArgs(['--tables','users,unknown']),/CUTOVER_SCOPE_UNSUPPORTED/);
  const {Client}=require(process.argv[3]||'pg');const url=c.validateUrl(`postgresql://postgres.${c.PRIMARY}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com/postgres?ssl=0&host=evil.invalid&user=postgres.wrong#secret`,c.PRIMARY);
  const client=new Client({connectionString:url,ssl:{rejectUnauthorized:true}});
  assert.notEqual(client.connectionParameters.host,'evil.invalid');assert.equal(client.connectionParameters.user,`postgres.${c.PRIMARY}`);assert.equal(client.connectionParameters.ssl.rejectUnauthorized,true);
  assert.equal(c.safeCode(Error('private URL credential')),'CUTOVER_FAILED');
});
(async()=>{let passed=0;for(const item of tests){try{await item.fn();passed++;console.log('PASS '+item.name);}catch(e){console.error('FAIL '+item.name);console.error(e.stack);process.exitCode=1;break;}}console.log(`${passed}/${tests.length} isolated PostgreSQL cutover-preservation tests passed.`);})().catch(e=>{console.error(e.stack);process.exitCode=1;});
