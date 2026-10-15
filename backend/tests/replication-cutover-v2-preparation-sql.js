'use strict';
// Synthetic isolated PostgreSQL only. No startup/environment/network access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require(process.argv[2]||'@electric-sql/pglite');
const c=require('../scripts/prepare-replication-cutover-v2-20261015');
const SQL=fs.readFileSync(path.resolve(__dirname,'../../database/20261015051758_replication_cutover_v2_preparation.sql'),'utf8');
const RUN='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const EPOCH='44444444-4444-4444-8444-444444444444',NEXT='55555555-5555-4555-8555-555555555555';
const KEY=Buffer.alloc(32,17).toString('base64'),KEY_ID='77777777-7777-4777-8777-777777777777';
const tests=[],test=(name,fn)=>tests.push({name,fn});
async function setup(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE authenticator;CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE public.uuid_items(id uuid PRIMARY KEY,value text,amount numeric);
  CREATE TABLE public.composite_items(user_id uuid,day date,label text,amount numeric,PRIMARY KEY(user_id,day,label));
  CREATE TABLE public.big_items(id bigint PRIMARY KEY,value text);
  CREATE TABLE public.integer_items(id integer PRIMARY KEY);
  CREATE TABLE public.small_items(id smallint PRIMARY KEY);
  CREATE TABLE public.varchar_items(code varchar(40) PRIMARY KEY);
  CREATE TABLE public.bool_items(flag boolean PRIMARY KEY);
  CREATE TABLE public.plain_rows(value text,amount numeric);
  CREATE TABLE public.user_last_activity(id uuid PRIMARY KEY);
  CREATE VIEW public.derived_count AS SELECT count(*) n FROM public.uuid_items;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT service_role TO authenticator;`);
  await db.query("INSERT INTO public.uuid_items VALUES($1,'synthetic-private-contact@example.invalid',123456789012345678901234567890.123456789)",[A]);
  await db.exec(`INSERT INTO public.composite_items VALUES('${A}','2026-10-15','synthetic-key@example.invalid',99999999999999999999.12345);
    INSERT INTO public.big_items VALUES(9223372036854775806,'fixture');INSERT INTO public.integer_items VALUES(1);
    INSERT INTO public.small_items VALUES(2);INSERT INTO public.varchar_items VALUES('fixture');INSERT INTO public.bool_items VALUES(true);
    INSERT INTO public.plain_rows VALUES('duplicate-private-row',12345678901234567890.1),('duplicate-private-row',12345678901234567890.1);`);
  await db.exec(SQL);return db;}
async function fixture(fn){const db=await setup();try{await fn(db);}finally{await db.close();}}
async function armFixture(db){const site=await c.inventorySite(db,'primary',{SUPABASE_REPLICATION_LIGHT:'1'}),sha=c.hash(c.stable(site));
  await db.query(`INSERT INTO ${c.NS}.runs(id,site,project_ref,manifest_sha256,manifest) VALUES($1,'primary','kdxypztstbeovyedmvem',$2,$3::jsonb)`,[RUN,sha,JSON.stringify(site)]);
  await db.query(`INSERT INTO ${c.NS}.control(singleton,run_id,epoch) VALUES(true,$1,$2)`,[RUN,EPOCH]);
  for(const t of site.tables){await db.query(`INSERT INTO ${c.NS}.registrations(table_oid,table_name,run_id,key_columns,key_types,mode,catalog_sha256) VALUES($1::oid,$2,$3,$4::text[],$5::text[],$6,$7)`,[t.oid,t.name,RUN,t.key_columns,t.key_types,t.mode,t.catalog_sha256]);
    await db.exec(`CREATE TRIGGER ${c.FENCE_TRIGGER} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public."${t.name}" FOR EACH STATEMENT EXECUTE FUNCTION ${c.NS}.write_fence();ALTER TABLE public."${t.name}" ENABLE ALWAYS TRIGGER ${c.FENCE_TRIGGER};
      CREATE TRIGGER ${c.CAPTURE_TRIGGER} AFTER INSERT OR UPDATE OR DELETE ON public."${t.name}" FOR EACH ROW EXECUTE FUNCTION ${c.NS}.capture_digest();ALTER TABLE public."${t.name}" ENABLE ALWAYS TRIGGER ${c.CAPTURE_TRIGGER};`);
  }return {site,sha};}
async function activate(db,expected=EPOCH,next=NEXT,deadline="clock_timestamp()+interval '10 minutes'"){await db.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,true,${deadline},'closing_capture')`,[RUN,expected,next]);}
function meta(sha,phase='baseline'){return {run_id:RUN,capture_id:crypto.randomUUID(),site:'primary',phase,manifest_sha256:sha,key_id:KEY_ID,streams:['table:uuid_items'],...(phase==='closing'?{fence_epoch:NEXT}:{})};}
async function capture(db,site,meta){await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');try{
  if(meta.phase==='closing')await c.lockClosingFence(db,meta);
  const stream=await c.streamTable(db,site.tables.find(t=>t.name==='uuid_items'),meta,KEY,a=>c.writeArtifact(db,a));
  await c.writeArtifact(db,c.encrypt(JSON.stringify({descriptor:c.descriptor(meta),streams:[stream]}),{...meta,stream:'manifest',part:0,rows:1},KEY));
  await c.seal(db,meta,KEY);await db.exec('COMMIT');return stream;
}catch(e){await db.exec('ROLLBACK');throw e;}}

test('migration attaches no public trigger; complete metadata plan classifies keys/views and never claims readiness',()=>fixture(async db=>{
  const site=await c.inventorySite(db,'primary',{SUPABASE_REPLICATION_LIGHT:'1'});
  assert.equal(site.tables.length,8);assert.equal(site.derived.length,1);assert.equal(site.held.length,0);assert.ok(site.excluded.includes('user_last_activity'));
  assert.equal(site.tables.find(t=>t.name==='plain_rows').mode,'row_multiset');assert.equal(site.tables.find(t=>t.name==='composite_items').key_columns.length,3);
  const backup={...site,site:'backup',project_ref:'atcfpgxkgbszglrelfgr'};const plan=c.createPlan(site,backup,{SUPABASE_REPLICATION_LIGHT:'1'});
  assert.equal(plan.readiness.cutover_ready,false);assert.equal(plan.descriptor.flags.storage_enabled,false);c.validatePlan(plan);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname LIKE 'vpt_cutover_v2_%'")).rows[0].n,0);
}));
test('inheritance routing and unsupported identities are explicit held entries, not silently covered',()=>fixture(async db=>{
  await db.exec('CREATE TABLE public.parent_rows(id uuid PRIMARY KEY);CREATE TABLE public.child_rows(extra text) INHERITS(public.parent_rows);');
  const site=await c.inventorySite(db,'primary',{});assert.ok(site.held.some(t=>t.name==='parent_rows'));assert.ok(site.held.some(t=>t.name==='child_rows'));
  const p=c.createPlan(site,{...site,site:'backup',project_ref:'atcfpgxkgbszglrelfgr'});assert.throws(()=>c.validatePlan(p),/CUTOVER_V2_UNSUPPORTED_UNIVERSE/);
}));
test('all standard key types, PK changes and duplicate no-PK deletes produce transactional digests without raw keys or contacts',()=>fixture(async db=>{
  await armFixture(db);
  await db.query('UPDATE public.uuid_items SET id=$1 WHERE id=$2',[B,A]);
  await db.exec("UPDATE public.composite_items SET label='new-private@example.invalid';UPDATE public.big_items SET value='changed';UPDATE public.integer_items SET id=3;UPDATE public.small_items SET id=4;UPDATE public.varchar_items SET code='changed';UPDATE public.bool_items SET flag=false;DELETE FROM public.plain_rows;");
  const rs=(await db.query(`SELECT * FROM ${c.NS}.events ORDER BY id`)).rows;assert.equal(rs.length,9);assert.doesNotMatch(JSON.stringify(rs),/private|example.invalid|duplicate|9223372036854775806/);
  assert.ok(rs[0].old_key_digest&&rs[0].new_key_digest&&rs[0].old_key_digest!==rs[0].new_key_digest);
  const deleted=rs.filter(e=>e.table_name==='plain_rows');assert.equal(deleted.length,2);assert.equal(deleted[0].old_key_digest,null);assert.equal(deleted[0].old_row_digest,deleted[1].old_row_digest);
  await db.exec('BEGIN');await db.exec('DELETE FROM public.uuid_items');await db.exec('ROLLBACK');assert.equal((await db.query(`SELECT count(*)::int n FROM ${c.NS}.events`)).rows[0].n,9);
}));
test('durable closed fence blocks normal owner, service role and definer RPC; custom GUC cannot bypass',()=>fixture(async db=>{
  await armFixture(db);await activate(db);
  await assert.rejects(()=>db.exec("UPDATE public.uuid_items SET value='blocked'"),e=>e.code==='55000');
  await db.exec(`CREATE FUNCTION public.fixture_definer() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$UPDATE public.uuid_items SET value='rpc blocked'$$;
    SET SESSION AUTHORIZATION authenticator;SET ROLE service_role;SET vpt.fake_bypass='true';`);
  await assert.rejects(()=>db.exec("UPDATE public.uuid_items SET value='service blocked'"),e=>e.code==='55000');
  await assert.rejects(()=>db.exec('SELECT public.fixture_definer()'),e=>e.code==='55000');
  await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');assert.equal((await db.query(`SELECT active FROM ${c.NS}.control`)).rows[0].active,true);
}));
test('operator permit is table/operation/transaction scoped and cannot be reused after commit',()=>fixture(async db=>{
  await armFixture(db);await activate(db);const oid=(await db.query("SELECT 'public.uuid_items'::regclass::oid AS oid")).rows[0].oid;
  await db.exec('BEGIN');await db.query(`SELECT ${c.NS}.mint_permit($1,$2,$3::oid[],ARRAY['UPDATE'],'bounded_parent_repair')`,[RUN,NEXT,[oid]]);
  await db.exec("UPDATE public.uuid_items SET value='permitted' WHERE true");await db.exec('COMMIT');
  assert.equal((await db.query('SELECT value FROM public.uuid_items')).rows[0].value,'permitted');
  await assert.rejects(()=>db.exec("UPDATE public.uuid_items SET value='reused'"),e=>e.code==='55000');
  await db.exec('BEGIN');await db.query(`SELECT ${c.NS}.mint_permit($1,$2,$3::oid[],ARRAY['UPDATE'],'bounded_parent_repair')`,[RUN,NEXT,[oid]]);
  await assert.rejects(()=>db.exec('DELETE FROM public.uuid_items'),e=>e.code==='55000');await db.exec('ROLLBACK');
  await db.exec('SET SESSION AUTHORIZATION authenticator;SET ROLE service_role');await assert.rejects(()=>db.query(`SELECT ${c.NS}.mint_permit($1,$2,$3::oid[],ARRAY['UPDATE'],'operator_recovery')`,[RUN,NEXT,[oid]]),e=>e.code==='42501');await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');
}));
test('expiry never opens fence, stale or reused epochs fail and explicit audited release restores writes',()=>fixture(async db=>{
  await armFixture(db);await activate(db);await db.exec(`UPDATE ${c.NS}.control SET deadline=clock_timestamp()-interval '1 second'`);
  await assert.rejects(()=>db.exec("UPDATE public.uuid_items SET value='expired'"),e=>e.code==='55000'&&e.message==='CUTOVER_V2_FENCE_EXPIRED_MANUAL_RECOVERY');
  const released=crypto.randomUUID();await assert.rejects(()=>db.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,false,NULL,'operator_recovery')`,[RUN,EPOCH,released]),e=>e.code==='55000');
  await assert.rejects(()=>db.query(`SELECT ${c.NS}.transition_fence($1,NULL,$2,false,NULL,'operator_recovery')`,[RUN,released]),e=>e.code==='55000');
  await db.query(`SELECT ${c.NS}.transition_fence($1,$2,$3,false,NULL,'operator_recovery')`,[RUN,NEXT,released]);await db.exec("UPDATE public.uuid_items SET value='released'");
  await assert.rejects(()=>activate(db,released,EPOCH),e=>e.code==='23505');
  assert.equal((await db.query(`SELECT active FROM ${c.NS}.control`)).rows[0].active,false);
}));
test('DML rewrite rules are held and trigger enable/body changes alter catalog fingerprints',()=>fixture(async db=>{
  const before=await c.inventorySite(db,'primary',{});await db.exec('CREATE RULE fixture_swallow AS ON UPDATE TO public.uuid_items DO INSTEAD NOTHING');
  const held=await c.inventorySite(db,'primary',{});assert.ok(held.held.some(t=>t.name==='uuid_items'));
  await db.exec('DROP RULE fixture_swallow ON public.uuid_items;CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER fixture_trigger BEFORE UPDATE ON public.uuid_items FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger()');
  const enabled=await c.inventorySite(db,'primary',{});await db.exec('ALTER TABLE public.uuid_items DISABLE TRIGGER fixture_trigger');const disabled=await c.inventorySite(db,'primary',{});
  assert.notEqual(enabled.tables.find(t=>t.name==='uuid_items').catalog_sha256,disabled.tables.find(t=>t.name==='uuid_items').catalog_sha256);
  assert.notEqual(before.tables.find(t=>t.name==='uuid_items').catalog_sha256,enabled.tables.find(t=>t.name==='uuid_items').catalog_sha256);
}));
test('private application roles cannot read/control evidence; normal owner cannot mutate receipts or ACK/prune events',()=>fixture(async db=>{
  await armFixture(db);
  for(const role of ['anon','authenticated','service_role','authenticator']){const rs=(await db.query(`SELECT has_schema_privilege($1,$2,'USAGE') s,has_table_privilege($1,$3,'SELECT,INSERT,UPDATE,DELETE') t,has_function_privilege($1,$4,'EXECUTE') f`,[role,c.NS,c.NS+'.receipts',c.NS+'.transition_fence(uuid,uuid,uuid,boolean,timestamp with time zone,text)'])).rows[0];assert.deepEqual(rs,{s:false,t:false,f:false});}
  await assert.rejects(()=>db.exec(`DELETE FROM ${c.NS}.events`),e=>e.code==='55000');await assert.rejects(()=>db.exec(`TRUNCATE ${c.NS}.receipts CASCADE`),e=>e.code==='55000');
  await assert.rejects(()=>db.exec('TRUNCATE public.uuid_items'),e=>e.code==='55000');
}));
test('streaming encrypted checkpoint preserves raw numeric text and immutable commit receipt detects total artifact loss',()=>fixture(async db=>{
  const {site,sha}=await armFixture(db),m=meta(sha);await c.reserve(db,m);const result=await capture(db,site,m);assert.equal(result.rows,'1');
  assert.equal((await c.verifyCheckpoint(db,m,KEY)).verified,true);
  const a=(await db.query(`SELECT * FROM ${c.NS}.artifacts WHERE stream='table:uuid_items'`)).rows[0];const raw=JSON.parse(c.decrypt({...m,...a},KEY)).raw_rows[0];assert.ok(raw.includes('123456789012345678901234567890.123456789'));
  assert.doesNotMatch(Buffer.from(a.ciphertext).toString('utf8'),/private-contact/);
  await assert.rejects(()=>db.exec(`DELETE FROM ${c.NS}.artifacts`),e=>e.code==='55000');await assert.rejects(()=>db.exec(`DELETE FROM ${c.NS}.receipts`),e=>e.code==='55000');
  await db.exec(`ALTER TABLE ${c.NS}.artifacts DISABLE TRIGGER immutable_evidence;DELETE FROM ${c.NS}.artifacts;ALTER TABLE ${c.NS}.artifacts ENABLE ALWAYS TRIGGER immutable_evidence;`);
  await assert.rejects(()=>c.checkpointState(db,m),e=>e.cutoverCode==='CUTOVER_V2_COMMITTED_EVIDENCE_LOST');await assert.rejects(()=>c.reserve(db,m),e=>e.cutoverCode==='CUTOVER_V2_COMMITTED_EVIDENCE_LOST');
}));
test('closing capture requires active exact fence and committed chunks roll back together with receipt',()=>fixture(async db=>{
  const {site,sha}=await armFixture(db),m=meta(sha,'closing');await c.reserve(db,m);await assert.rejects(()=>capture(db,site,m),e=>e.cutoverCode==='CUTOVER_V2_CLOSING_FENCE_REQUIRED');
  await activate(db);await capture(db,site,m);assert.equal((await c.verifyCheckpoint(db,m,KEY)).verified,true);
  const newMeta=meta(sha);await c.reserve(db,newMeta);await db.exec('BEGIN');await c.writeArtifact(db,c.encrypt(JSON.stringify({raw_rows:['synthetic']}),{...newMeta,stream:'table:uuid_items',part:0,rows:1},KEY));
  await assert.rejects(()=>c.seal(db,newMeta,KEY),e=>e.cutoverCode==='CUTOVER_V2_MANIFEST_REQUIRED');await db.exec('ROLLBACK');assert.equal((await c.checkpointState(db,newMeta)).state,'reserved');
}));
test('adaptive bounded cursor chunks a larger fixture without OFFSET or numeric reserialization',()=>fixture(async db=>{
  const {site,sha}=await armFixture(db),m=meta(sha);await db.exec('DELETE FROM public.uuid_items');
  for(let i=0;i<6;i++)await db.query('INSERT INTO public.uuid_items VALUES($1,$2,1.00000000000000000001)',[crypto.randomUUID(),'fixture'.repeat(900000)]);
  await c.reserve(db,m);const result=await capture(db,site,m);assert.equal(result.rows,'6');assert.ok(result.parts>1);assert.equal((await c.verifyCheckpoint(db,m,KEY)).verified,true);
}));
test('AES authentication binds fence/site/capture/version and rejects tampering with sanitized errors',()=>{
  const m={...meta('a'.repeat(64),'closing'),stream:'table:uuid_items',part:0,rows:1},a=c.encrypt('private fixture',m,KEY);assert.equal(c.decrypt(a,KEY),'private fixture');
  for(const change of [{site:'backup'},{capture_id:B},{fence_epoch:EPOCH},{key_id:A},{manifest_sha256:'b'.repeat(64)}])assert.throws(()=>c.decrypt({...a,...change},KEY),/CUTOVER_V2_ARTIFACT_DECRYPT/);
  assert.equal(c.safeCode(Error('postgresql://private-password')),'CUTOVER_V2_FAILED');
});
test('private contract pins bootstrap functions and rejects journal-swallowing rules or hidden triggers',()=>fixture(async db=>{
  await c.privateContract(db);await db.exec(`CREATE RULE swallow_events AS ON INSERT TO ${c.NS}.events DO INSTEAD NOTHING`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');await db.exec(`DROP RULE swallow_events ON ${c.NS}.events`);
  await db.exec(`CREATE FUNCTION public.immutable_evidence() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;
    DROP TRIGGER immutable_evidence ON ${c.NS}.events;CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE OR TRUNCATE ON ${c.NS}.events FOR EACH STATEMENT EXECUTE FUNCTION public.immutable_evidence();ALTER TABLE ${c.NS}.events ENABLE ALWAYS TRIGGER immutable_evidence`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');
  await db.exec(`DROP TRIGGER immutable_evidence ON ${c.NS}.events;CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE OR TRUNCATE ON ${c.NS}.events FOR EACH STATEMENT EXECUTE FUNCTION ${c.NS}.immutable_evidence();ALTER TABLE ${c.NS}.events ENABLE ALWAYS TRIGGER immutable_evidence`);
  await db.exec(`CREATE FUNCTION ${c.NS}.extra_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER extra_trigger AFTER INSERT ON ${c.NS}.events FOR EACH ROW EXECUTE FUNCTION ${c.NS}.extra_trigger()`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');
  await db.exec(`DROP TRIGGER extra_trigger ON ${c.NS}.events;DROP FUNCTION ${c.NS}.extra_trigger();CREATE OR REPLACE FUNCTION ${c.NS}.capture_digest() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$BEGIN RETURN NULL;END$$`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');
}));
test('stream snapshot normalizes UTC so its raw row digest matches the transactional journal under a nonUTC caller',()=>fixture(async db=>{
  await db.exec("SET TIME ZONE 'Asia/Ho_Chi_Minh';ALTER TABLE public.uuid_items ADD COLUMN instant timestamptz DEFAULT '2026-10-15T12:34:56+07:00'");
  const {site,sha}=await armFixture(db);await db.exec("UPDATE public.uuid_items SET value='time-fixture'");
  const event=(await db.query(`SELECT new_row_digest FROM ${c.NS}.events WHERE table_name='uuid_items' ORDER BY id DESC LIMIT 1`)).rows[0];
  const m=meta(sha);await c.reserve(db,m);await capture(db,site,m);
  const artifact=(await db.query(`SELECT * FROM ${c.NS}.artifacts WHERE capture_id=$1 AND stream='table:uuid_items'`,[m.capture_id])).rows[0];
  const raw=JSON.parse(c.decrypt({...m,...artifact},KEY)).raw_rows[0];assert.equal(c.hash(raw),event.new_row_digest);assert.ok(raw.includes('2026-10-15T05:34:56+00:00'));
}));
test('private columns/defaults/CHECK/index expressions and sequence configuration are pinned before any snapshot write',()=>fixture(async db=>{
  await c.privateContract(db);await db.exec(`CREATE TABLE public.side_effect_fixture(n integer);CREATE FUNCTION public.side_effect_fixture() RETURNS integer LANGUAGE plpgsql VOLATILE AS $$BEGIN INSERT INTO public.side_effect_fixture VALUES(1);RETURN 1;END$$;
    ALTER TABLE ${c.NS}.events ADD COLUMN injected integer DEFAULT public.side_effect_fixture()`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');await db.exec(`ALTER TABLE ${c.NS}.events DROP COLUMN injected`);
  await db.exec(`ALTER TABLE ${c.NS}.receipts ADD CONSTRAINT injected CHECK(public.side_effect_fixture()>0)`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');await db.exec(`ALTER TABLE ${c.NS}.receipts DROP CONSTRAINT injected`);
  await db.exec(`CREATE FUNCTION public.index_fixture(integer) RETURNS integer LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;CREATE INDEX injected ON ${c.NS}.artifacts(public.index_fixture(part)) WHERE public.index_fixture(part)>=0`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');await db.exec(`DROP INDEX ${c.NS}.injected`);
  await db.exec(`ALTER SEQUENCE ${c.NS}.events_id_seq INCREMENT BY 2`);await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');
}));
test('PG18 native NOT NULL constraint metadata is normalized while PG17 attnotnull remains strictly authoritative',()=>fixture(async db=>{
  await c.privateContract(db);const before=await c.privateShapes(db);
  const native=(await db.query(`SELECT conname::text AS name FROM pg_constraint WHERE conrelid='${c.NS}.receipts'::regclass AND contype='n' ORDER BY conname LIMIT 1`)).rows[0];
  if(native){await db.exec(`ALTER TABLE ${c.NS}.receipts RENAME CONSTRAINT "${native.name}" TO fixture_native_notnull_name`);assert.deepEqual(await c.privateShapes(db),before);await c.privateContract(db);}
  await db.exec(`ALTER TABLE ${c.NS}.receipts ALTER COLUMN descriptor_sha256 DROP NOT NULL`);
  await assert.rejects(()=>c.privateContract(db),e=>e.cutoverCode==='CUTOVER_V2_PRIVATE_CONTRACT');
}));
(async()=>{let passed=0;for(const t of tests){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name);console.error(e.stack);process.exitCode=1;break;}}console.log(`${passed}/${tests.length} isolated PostgreSQL v2 preparation tests passed.`);})().catch(e=>{console.error(e.stack);process.exitCode=1;});
