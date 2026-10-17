'use strict';
// Actual isolated PostgreSQL. Synthetic data only; no network or production env.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {PGlite}=require(process.argv[2] || '@electric-sql/pglite');
const recovery=require('../scripts/recover-backup-user-parent-20261015');
const {SCOPE:S,recover,STORE}=recovery;
const secret=Buffer.alloc(32,17).toString('base64'); // Synthetic isolated fixture only.
const keyId='99999999-9999-4999-8999-999999999999';
const migration=fs.readFileSync(path.resolve(__dirname,'../../database/20261015041536_vpt_bounded_recovery_private_snapshot.sql'),'utf8');
const keyMigration=fs.readFileSync(path.resolve(__dirname,'../../database/20261015045032_vpt_recovery_dedicated_snapshot_key_v2.sql'),'utf8');
const journalMigration=fs.readFileSync(path.resolve(__dirname,'../../database/20261015050417_replication_cutover_preservation.sql'),'utf8');
const journal=require('../scripts/preserve-replication-cutover-20261015');
const tests=[]; const test=(name,run)=>tests.push({name,run});
let testDatabaseFactory=null,testRolesPrecreated=false;
function setTestDatabaseFactory(factory,{rolesPrecreated=false}={}) {
  assert.equal(typeof factory,'function');testDatabaseFactory=factory;testRolesPrecreated=rolesPrecreated;
}
const extra='77777777-7777-4777-8777-777777777777';
const schema=`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;
  CREATE TABLE public.companies(id uuid PRIMARY KEY);
  CREATE TABLE public.tenants(id uuid PRIMARY KEY);
  CREATE TABLE public.division_units(id uuid PRIMARY KEY);
  CREATE TABLE public.departments(id uuid PRIMARY KEY,name text NOT NULL,slug varchar NOT NULL UNIQUE,description text,
    created_at timestamptz DEFAULT now(),manager_id uuid,parent_id uuid REFERENCES public.departments(id),
    company_id uuid REFERENCES public.companies(id),division_unit_id uuid REFERENCES public.division_units(id));
  CREATE TABLE public.users(id uuid PRIMARY KEY,email varchar NOT NULL UNIQUE,password varchar NOT NULL,full_name text NOT NULL,
    department_id uuid REFERENCES public.departments(id),company_id uuid REFERENCES public.companies(id),
    tenant_id uuid REFERENCES public.tenants(id),salary numeric,role text NOT NULL,is_active boolean NOT NULL,auth_provider text NOT NULL,
    created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
  ALTER TABLE public.departments ADD CONSTRAINT departments_manager_id_fkey FOREIGN KEY(manager_id) REFERENCES public.users(id);
  CREATE TABLE public.crm_leads(id uuid PRIMARY KEY,assigned_to uuid REFERENCES public.users(id),lead_owner_id uuid REFERENCES public.users(id),code text);
  CREATE TABLE public.user_companies(user_id uuid REFERENCES public.users(id),company_id uuid REFERENCES public.companies(id),PRIMARY KEY(user_id,company_id));
  CREATE TABLE public.website_intake_receipts(id uuid PRIMARY KEY,body text);
  ALTER TABLE public.website_intake_receipts ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.website_intake_receipts FROM PUBLIC,anon,authenticated,service_role;
  GRANT SELECT,INSERT ON public.website_intake_receipts TO service_role;
  CREATE TABLE public.website_feedback_outbox(id uuid PRIMARY KEY,body text);
  ALTER TABLE public.website_feedback_outbox ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.website_feedback_outbox FROM PUBLIC,anon,authenticated,service_role;
  GRANT SELECT,INSERT,UPDATE ON public.website_feedback_outbox TO service_role;`;
async function create() {
  const primary=testDatabaseFactory?await testDatabaseFactory('primary'):new PGlite();let backup;
  try {
  backup=testDatabaseFactory?await testDatabaseFactory('backup'):new PGlite();
  for(const db of [primary,backup]) {
    await db.exec(testRolesPrecreated?schema.replace(/^CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;/,''):schema);
    await db.query('INSERT INTO public.companies VALUES($1),($2)',[S.aliasCompany,S.canonicalCompany]);
    await db.query('INSERT INTO public.tenants VALUES($1),($2)',[S.aliasTenant,S.canonicalTenant]);
    await db.query('INSERT INTO public.division_units VALUES($1)',[extra]);
    await db.query(`INSERT INTO public.departments(id,name,slug,description,created_at,company_id,division_unit_id)
      VALUES($1,'Synthetic old department','fixture-old','preserve','2026-01-01T00:00:00.123456Z',$2,$3)`,[S.aliasDepartment,S.aliasCompany,extra]);
    if(db===primary) await db.query(`INSERT INTO public.departments(id,name,slug,description,created_at,company_id,division_unit_id)
      VALUES($1,'Synthetic canonical department','fixture-new','exact source','2026-01-01T00:00:00.654321Z',$2,$3)`,[S.department,S.canonicalCompany,extra]);
    await db.query(`INSERT INTO public.users(id,email,password,full_name,department_id,company_id,tenant_id,role,is_active,auth_provider,created_at,updated_at)
      VALUES($1,$2,$3,'Synthetic old identity',$4,$5,$6,'sales_admin',true,'password','2026-06-12T03:18:05.859251Z','2026-06-13T06:04:27.145Z')`,
      [S.alias,db===primary?'alias@example.invalid':'canonical@example.invalid',db===primary?'fixture-primary-alias-hash':'fixture-backup-alias-hash',S.aliasDepartment,S.aliasCompany,S.aliasTenant]);
    if(db===primary) await db.query(`INSERT INTO public.users(id,email,password,full_name,department_id,company_id,tenant_id,role,is_active,auth_provider,created_at,updated_at)
      VALUES($1,'canonical@example.invalid','fixture-canonical-hash','Synthetic canonical identity',$2,$3,$4,'sales_admin',true,'local','2026-08-21T04:13:46.063724Z','2026-08-21T04:13:46.063724Z')`,
      [S.canonical,S.department,S.canonicalCompany,S.canonicalTenant]);
    await db.query("INSERT INTO public.crm_leads VALUES($1,$2,$2,'FIXTURE-1')",[extra,S.alias]);
    await db.query('INSERT INTO public.user_companies VALUES($1,$2)',[S.alias,S.aliasCompany]);
  }
  await backup.exec('CREATE TABLE public.work_projects(id uuid PRIMARY KEY,owner_id uuid REFERENCES public.users(id));');
  await backup.query('INSERT INTO public.work_projects VALUES($1,$2)',[extra,S.alias]);
  const aclQuery=`SELECT c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`;
  const beforeMigrationAcls=(await backup.query(aclQuery)).rows;
  await backup.exec(migration);
  await backup.exec(keyMigration);
  assert.deepEqual((await backup.query(aclQuery)).rows,beforeMigrationAcls,'private migration must not alter existing public ACL/RLS');
  return {primary,backup};
  }catch(e){await Promise.allSettled([primary.close(),backup?.close()]);throw e;}
}
async function withDB(run) { const pair=await create(); try {await run(pair);} finally {
  const closed=await Promise.allSettled([pair.primary.close(),pair.backup.close()]);
  const failed=closed.find(r=>r.status==='rejected');if(failed)throw failed.reason;
} }
async function state(db) {
  const result={};
  for(const table of ['users','departments','crm_leads','user_companies'])
    result[table]=(await db.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row);
  return result;
}
async function allPublicRows(db) {
  const result={};
  const tables=(await db.query(`SELECT c.relname::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows;
  for(const table of tables) result[table.name]=(await db.query(`SELECT to_jsonb(t) AS row FROM public."${table.name.replaceAll('"','""')}" t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row);
  return result;
}
async function snapshot(pair) {return recover({...pair,mode:'snapshot',secret,keyId});}
async function apply(pair,created,opts={}) {return recover({...pair,mode:'apply',secret,keyId,snapshotId:created.snapshot_id,...opts});}
async function armJournal(pair) {
  for(const db of [pair.primary,pair.backup]) await db.exec(journalMigration);
  return journal.preserve({...pair,mode:'arm',tables:['departments','users']});
}
async function denied(db,sql,role) {
  await db.exec('SET ROLE '+role);
  try {await assert.rejects(()=>db.query(sql),e=>e.code==='42501');} finally {await db.exec('RESET ROLE');}
}
test('default dry run changes neither database nor private snapshot count',()=>withDB(async pair=>{
  const p=await state(pair.primary),b=await state(pair.backup);
  const result=await recover(pair);
  assert.equal(result.mode,'dry-run'); assert.equal(result.production_rows_changed,0);
  assert.deepEqual(await state(pair.primary),p);assert.deepEqual(await state(pair.backup),b);
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,0);
}));
test('snapshot is encrypted, durable, owner-only, verified and does not alter public rows',()=>withDB(async pair=>{
  const p=await state(pair.primary),b=await state(pair.backup),created=await snapshot(pair);
  assert.equal(created.production_rows_changed,0);assert.equal(created.private_snapshot_created,1);
  const stored=(await pair.backup.query(`SELECT * FROM ${STORE}`)).rows[0];
  const raw=Buffer.from(stored.ciphertext).toString('utf8');
  for(const value of ['example.invalid','fixture-canonical-hash','fixture-backup-alias-hash']) assert.equal(raw.includes(value),false);
  assert.equal(recovery.decrypt(stored,secret,keyId).before.alias.password,'fixture-backup-alias-hash');
  assert.equal(stored.algorithm,recovery.ALGORITHM); assert.equal(stored.key_id,keyId);
  assert.equal(stored.ciphertext_sha256,created.ciphertext_sha256);
  for(const role of ['anon','authenticated','service_role','authenticator']) {
    await denied(pair.backup,`SELECT * FROM ${STORE}`,role);
    await denied(pair.backup,`DELETE FROM ${STORE}`,role);
  }
  assert.deepEqual(await state(pair.primary),p);assert.deepEqual(await state(pair.backup),b);
}));
test('apply performs exactly one email update and two source-identical inserts, preserves all alias fields and child owners',()=>withDB(async pair=>{
  const p=await state(pair.primary),b=await state(pair.backup);
  const publicAcls=(await pair.backup.query(`SELECT relname,relacl::text FROM pg_class WHERE oid IN('public.website_intake_receipts'::regclass,'public.website_feedback_outbox'::regclass) ORDER BY relname`)).rows;
  const work=(await pair.backup.query('SELECT * FROM public.work_projects')).rows;
  const created=await snapshot(pair),result=await apply(pair,created),after=await state(pair.backup);
  assert.deepEqual(result.committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});assert.equal(result.failover_ready,false);
  const old=b.users.find(x=>x.id===S.alias),fixed=after.users.find(x=>x.id===S.alias);
  assert.deepEqual(fixed,{...old,email:'alias@example.invalid'});
  assert.deepEqual(after.users.find(x=>x.id===S.canonical),p.users.find(x=>x.id===S.canonical));
  assert.deepEqual(after.departments.find(x=>x.id===S.department),p.departments.find(x=>x.id===S.department));
  assert.deepEqual(after.crm_leads,b.crm_leads);assert.deepEqual(after.user_companies,b.user_companies);
  assert.deepEqual((await pair.backup.query('SELECT * FROM public.work_projects')).rows,work);
  assert.deepEqual(await state(pair.primary),p);
  assert.deepEqual((await pair.backup.query(`SELECT relname,relacl::text FROM pg_class WHERE oid IN('public.website_intake_receipts'::regclass,'public.website_feedback_outbox'::regclass) ORDER BY relname`)).rows,publicAcls);
  for(const table of ['website_intake_receipts','website_feedback_outbox']) assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n,0);
  const marked=(await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0];
  assert.ok(marked.applied_at); assert.deepEqual(marked.result,result.committed);
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_MISSING_OR_APPLIED');
}));
test('apply without existing verified snapshot or with rotated key cannot touch rows',()=>withDB(async pair=>{
  const b=await state(pair.backup);
  await assert.rejects(()=>recover({...pair,mode:'apply',secret,keyId,snapshotId:crypto.randomUUID()}),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_MISSING_OR_APPLIED');
  const created=await snapshot(pair);
  await assert.rejects(()=>apply(pair,created,{secret:Buffer.alloc(32,19).toString('base64')}),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
  assert.deepEqual(await state(pair.backup),b);
}));
test('source or backup complete-row changes are held even if updated_at remains identical',()=>withDB(async pair=>{
  const created=await snapshot(pair);
  await pair.backup.query("UPDATE public.users SET password='fixture-concurrent-change' WHERE id=$1",[S.alias]);
  const b=await state(pair.backup);
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_STATE_CHANGED');
  assert.deepEqual(await state(pair.backup),b);
}));
test('source canonical payload change after snapshot is held without applying a stale password or name',()=>withDB(async pair=>{
  const created=await snapshot(pair),b=await state(pair.backup);
  await pair.primary.query("UPDATE public.users SET full_name='Synthetic changed source' WHERE id=$1",[S.canonical]);
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_STATE_CHANGED');
  assert.deepEqual(await state(pair.backup),b);
}));
test('new unique email collision aborts without renaming or merging',()=>withDB(async pair=>{
  const created=await snapshot(pair);
  await pair.backup.query(`INSERT INTO public.users SELECT $1,email || '.other',password,full_name,department_id,company_id,tenant_id,salary,role,is_active,auth_provider,created_at,updated_at FROM public.users WHERE id=$2`,[extra,S.alias]);
  await pair.backup.query("UPDATE public.users SET email='alias@example.invalid' WHERE id=$1",[extra]);
  const b=await state(pair.backup);
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_EMAIL_COLLISION');
  assert.deepEqual(await state(pair.backup),b);
}));
test('department slug collision aborts without changing the existing department',()=>withDB(async pair=>{
  await pair.backup.query("INSERT INTO public.departments(id,name,slug,company_id) VALUES($1,'Synthetic collision','fixture-new',$2)",[extra,S.aliasCompany]);
  const b=await state(pair.backup);
  await assert.rejects(()=>recover(pair),e=>e.recoveryCode==='RECOVERY_DEPARTMENT_COLLISION');
  assert.deepEqual(await state(pair.backup),b);
}));
test('failure after alias update and department insert rolls back all three writes and snapshot mark',()=>withDB(async pair=>{
  const created=await snapshot(pair),b=await state(pair.backup);
  const real=pair.backup;
  const fault={query:async(sql,values)=>{
    if(sql.startsWith('INSERT INTO public."users"')) {const e=new Error('synthetic SQL error includes private fixture value');e.code='23505';throw e;}
    return real.query(sql,values);
  }};
  await assert.rejects(()=>apply({...pair,backup:fault},created),e=>recovery.safeCode(e)==='RECOVERY_UNIQUE_CONFLICT');
  assert.deepEqual(await state(pair.backup),b);
  assert.equal((await real.query(`SELECT applied_at FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0].applied_at,null);
}));
test('schema/trigger/least-privilege guard rejects changed runtime before any public writes',()=>withDB(async pair=>{
  const created=await snapshot(pair),b=await state(pair.backup);
  await pair.backup.exec(`GRANT USAGE ON SCHEMA vpt_recovery_20261015 TO authenticated`);
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_PRIVATE_STORE_REQUIRED');
  assert.deepEqual(await state(pair.backup),b);
}));
test('new non-internal trigger or schema drift aborts before any mutation',()=>withDB(async pair=>{
  const b=await state(pair.backup);
  await pair.backup.exec(`CREATE FUNCTION fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER fixture_guard BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION fixture_trigger()`);
  await assert.rejects(()=>recover(pair),e=>e.recoveryCode==='RECOVERY_TRIGGER_CHANGED');
  assert.deepEqual(await state(pair.backup),b);
}));
test('metadata ownership drift aborts; no source alias credential overwrite',()=>withDB(async pair=>{
  await pair.backup.query('UPDATE public.users SET company_id=$1 WHERE id=$2',[S.canonicalCompany,S.alias]);
  const b=await state(pair.backup);
  await assert.rejects(()=>recover(pair),e=>e.recoveryCode==='RECOVERY_ALIAS_METADATA_CHANGED');
  assert.deepEqual(await state(pair.backup),b);
}));
test('missing department parent aborts without stripping a non-null FK',()=>withDB(async pair=>{
  const parent='88888888-8888-4888-8888-888888888888';
  await pair.primary.query('INSERT INTO public.division_units VALUES($1)',[parent]);
  await pair.primary.query('UPDATE public.departments SET division_unit_id=$1 WHERE id=$2',[parent,S.department]);
  const b=await state(pair.backup);
  await assert.rejects(()=>recover(pair),e=>e.recoveryCode==='RECOVERY_PARENT_MISSING');
  assert.deepEqual(await state(pair.backup),b);
}));
test('column drift is rejected and private snapshot ciphertext cannot be tampered or swapped',()=>withDB(async pair=>{
  const created=await snapshot(pair),b=await state(pair.backup);
  await pair.backup.exec('ALTER TABLE public.users ADD COLUMN fixture_extra text');
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_SCHEMA_CHANGED');
  await pair.backup.exec('ALTER TABLE public.users DROP COLUMN fixture_extra');
  assert.deepEqual(await state(pair.backup),b);
  await pair.backup.query(`UPDATE ${STORE} SET ciphertext_sha256=$1 WHERE id=$2`,['0'.repeat(64),created.snapshot_id]);
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DIGEST');
  assert.deepEqual(await state(pair.backup),b);
}));
test('more than forty inbound FKs remain bounded and validate both batches with the same exact IDs',()=>withDB(async pair=>{
  const fields=Array.from({length:44},(_,i)=>`fixture_${i} uuid REFERENCES public.users(id)`).join(',');
  await pair.backup.exec(`CREATE TABLE public.fixture_many_inbound(id uuid PRIMARY KEY,${fields})`);
  const created=await snapshot(pair);
  assert.deepEqual((await apply(pair,created)).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
}));
test('DB round-trip guard holds unsafe numeric values before snapshot or apply can round them',()=>withDB(async pair=>{
  const created=await snapshot(pair),b=await state(pair.backup);
  for(const value of ['9007199254740993','0.10000000000000000001']) {
    await pair.primary.query('UPDATE public.users SET salary=$1::numeric WHERE id=$2',[value,S.canonical]);
    await assert.rejects(()=>recover(pair),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
    await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
    await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
    assert.deepEqual(await state(pair.backup),b);
  }
  await pair.primary.query('UPDATE public.users SET salary=NULL WHERE id=$1',[S.canonical]);
  await pair.backup.query('UPDATE public.users SET salary=9007199254740993 WHERE id=$1',[S.alias]);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,1);
}));
test('matching source/backup schemas cannot both lose known email uniqueness and pass preflight',()=>withDB(async pair=>{
  for(const db of [pair.primary,pair.backup]) await db.exec('ALTER TABLE public.users DROP CONSTRAINT users_email_key');
  const b=await state(pair.backup);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_KNOWN_CONSTRAINT_MISSING');
  assert.deepEqual(await state(pair.backup),b);
}));
test('matching wrong critical column types are held rather than accepted by catalog parity',()=>withDB(async pair=>{
  for(const db of [pair.primary,pair.backup]) await db.exec('ALTER TABLE public.users ALTER COLUMN email TYPE text');
  await assert.rejects(()=>recover(pair),e=>e.recoveryCode==='RECOVERY_KNOWN_TYPE_CHANGED');
}));
test('FK metadata survives actual PostgreSQL OIDs and the production pg wire parsers',()=>withDB(async pair=>{
  const pgTypes=require(process.argv[3] || 'pg').types;
  const probe=await pair.primary.query("SELECT ARRAY['id'::name] old_shape,ARRAY['id'::text] supported_shape");
  assert.deepEqual(probe.fields.map(f=>f.dataTypeID),[1003,1009]);
  assert.equal(pgTypes.getTypeParser(1003)('{id}'),'{id}');
  assert.deepEqual(pgTypes.getTypeParser(1009)('{id}'),['id']);
  function wire(client) {return {query:async(...args)=>{
    const result=await client.query(...args);
    const rows=result.rows.map(row=>{
      const parsed={...row};
      for(const field of result.fields || []) if([1003,1009].includes(field.dataTypeID) && Array.isArray(row[field.name])) {
        const encoded='{'+row[field.name].map(value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"').join(',')+'}';
        parsed[field.name]=pgTypes.getTypeParser(field.dataTypeID)(encoded);
      }
      return parsed;
    });return {...result,rows};
  }};}
  const clients={primary:wire(pair.primary),backup:wire(pair.backup)};
  const created=await snapshot(clients);
  assert.deepEqual((await apply(clients,created)).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
}));
test('unsupported composite parent FK remains held after the wire type fix',()=>withDB(async pair=>{
  for(const db of [pair.primary,pair.backup]) await db.exec('ALTER TABLE public.users ADD CONSTRAINT fixture_id_email_unique UNIQUE(id,email)');
  await pair.backup.exec('CREATE TABLE public.fixture_composite_fk(user_id uuid,email varchar,FOREIGN KEY(user_id,email) REFERENCES public.users(id,email))');
  const b=await state(pair.backup);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_FK_UNSUPPORTED');
  assert.deepEqual(await state(pair.backup),b);
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,0);
}));
test('idle source error is consumed without raw logging and aborts before further writes',()=>withDB(async pair=>{
  const created=await snapshot(pair),before=await state(pair.backup);
  const source=new EventEmitter();source.query=(...args)=>pair.primary.query(...args);
  const statements=[];
  const target={query:async(sql,values)=>{
    statements.push(sql);
    const result=await pair.backup.query(sql,values);
    if(sql.startsWith('UPDATE public.users SET email=')) source.emit('error',new Error('DO-NOT-LEAK synthetic PG contact/password details'));
    return result;
  }};
  const original=process.stderr.write,logged=[];
  process.stderr.write=(value)=>{logged.push(String(value));return true;};
  try {await assert.rejects(()=>apply({primary:source,backup:target},created),e=>e.recoveryCode==='RECOVERY_CONNECTION_LOST');}
  finally {process.stderr.write=original;}
  assert.equal(logged.join(''),'');assert.equal(source.listenerCount('error'),1);
  assert.equal(statements.some(s=>s.startsWith('INSERT INTO public.')),false);
  assert.equal(statements.includes('COMMIT'),false);
  assert.deepEqual(await state(pair.backup),before);
}));
test('source idle error after snapshot mark rolls back all repair writes before COMMIT',()=>withDB(async pair=>{
  const created=await snapshot(pair),before=await state(pair.backup);
  const source=new EventEmitter();source.query=(...args)=>pair.primary.query(...args);
  const statements=[];
  const target={query:async(sql,values)=>{
    statements.push(sql);const result=await pair.backup.query(sql,values);
    if(sql.startsWith(`UPDATE ${STORE} SET applied_at=`)) source.emit('error',new Error('DO-NOT-LEAK idle server diagnostic'));
    return result;
  }};
  await assert.rejects(()=>apply({primary:source,backup:target},created),e=>e.recoveryCode==='RECOVERY_CONNECTION_LOST');
  assert.equal(statements.includes('COMMIT'),false);assert.deepEqual(await state(pair.backup),before);
  assert.equal((await pair.backup.query(`SELECT applied_at FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0].applied_at,null);
}));
test('argument handling is explicitly dry-run and errors contain only allowlisted reason codes',async()=>{
  assert.deepEqual(recovery.parseArgs([]),{mode:'dry-run',snapshotId:undefined});
  assert.throws(()=>recovery.parseArgs(['--apply','--snapshot']),/RECOVERY_MODE_INVALID/);
  assert.throws(()=>recovery.parseArgs(['--apply','--snapshot-id','not-a-uuid']),/RECOVERY_ARGUMENT_INVALID/);
  assert.throws(()=>recovery.validateUrl('postgresql://postgres:any@db.wrong.supabase.co/postgres',recovery.PRIMARY),/RECOVERY_PROJECT_PAIR_MISMATCH/);
  const stripped=new URL(recovery.validateUrl(`postgresql://postgres:fixture@db.${recovery.PRIMARY}.supabase.co/postgres?ssl=false&sslmode=disable&options=-c%20search_path%3Devil#ignored`,recovery.PRIMARY));
  assert.equal(stripped.search,''); assert.equal(stripped.hash,'');
  assert.equal(recovery.safeCode(new Error('password=do-not-print@example.invalid')), 'RECOVERY_FAILED');
  assert.equal(recovery.safeCode({code:'23505',message:'private fixture'}),'RECOVERY_UNIQUE_CONFLICT');
});
test('new snapshots reject missing key version, JWT text and noncanonical or wrong-length dedicated keys',()=>withDB(async pair=>{
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret}),e=>e.recoveryCode==='RECOVERY_KEY_ID_REQUIRED');
  for(const bad of ['synthetic-legacy-jwt-text-at-least-32-bytes',Buffer.alloc(31).toString('base64'),Buffer.alloc(33).toString('base64'),secret.replace(/=$/,''),'00'.repeat(32)])
    await assert.rejects(()=>recover({...pair,mode:'snapshot',secret:bad,keyId}),e=>e.recoveryCode==='RECOVERY_KEY_UNAVAILABLE');
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,0);
}));
test('dedicated key version is AAD-bound and retaining the original version permits recovery after rotation',()=>withDB(async pair=>{
  const created=await snapshot(pair),other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const stored=(await pair.backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0];
  await assert.rejects(()=>apply(pair,created,{keyId:other}),e=>e.recoveryCode==='RECOVERY_KEY_ID_MISMATCH');
  assert.throws(()=>recovery.decrypt({...stored,key_id:other},secret,other),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
  assert.deepEqual((await apply(pair,created,{keyId,secret})).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
}));
test('new migration preserves legacy ciphertext and private ACLs, requiring its retained legacy JWT key',async()=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE ROLE authenticator;');
    await db.exec(migration);
    const id=crypto.randomUUID(),salt=crypto.randomBytes(32),nonce=crypto.randomBytes(12);
    const legacySecret='synthetic-legacy-key-retained-only-for-this-isolated-test';
    const payload={operation:recovery.OPERATION,scope:S,fixture:'private rollback fixture'};
    const derived=Buffer.from(crypto.hkdfSync('sha256',Buffer.from(legacySecret),salt,Buffer.from('vpt/backup/20261015/identity-rollback/v1'),32));
    const cipher=crypto.createCipheriv('aes-256-gcm',derived,nonce);
    cipher.setAAD(Buffer.from([recovery.OPERATION,recovery.PRIMARY,recovery.BACKUP,id,recovery.LEGACY_ALGORITHM].join('|')));
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]),tag=cipher.getAuthTag();derived.fill(0);
    await db.query(`INSERT INTO ${STORE}(id,operation,source_project,backup_project,algorithm,salt,nonce,auth_tag,ciphertext,ciphertext_sha256)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,recovery.OPERATION,recovery.PRIMARY,recovery.BACKUP,recovery.LEGACY_ALGORITHM,salt,nonce,tag,ciphertext,crypto.createHash('sha256').update(ciphertext).digest('hex')]);
    const before=(await db.query(`SELECT * FROM ${STORE}`)).rows[0];
    const aclQuery=`SELECT n.nspacl::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid WHERE c.oid=$1::regclass`;
    const beforeAcl=(await db.query(aclQuery,[STORE])).rows;
    await db.exec(keyMigration);
    const after=(await db.query(`SELECT * FROM ${STORE}`)).rows[0],{key_id:added,...unchanged}=after;
    assert.equal(added,null);assert.deepEqual(unchanged,before);
    assert.deepEqual((await db.query(aclQuery,[STORE])).rows,beforeAcl);
    assert.deepEqual(recovery.decrypt(after,undefined,undefined,legacySecret),payload);
    assert.throws(()=>recovery.decrypt(after,secret,keyId),e=>e.recoveryCode==='RECOVERY_LEGACY_KEY_UNAVAILABLE');
    await assert.rejects(()=>db.query(`UPDATE ${STORE} SET algorithm=$1 WHERE id=$2`,[recovery.ALGORITHM,id]),e=>e.code==='23514');
    await assert.rejects(()=>db.query(`UPDATE ${STORE} SET key_id=$1 WHERE id=$2`,[keyId,id]),e=>e.code==='23514');
    for(const role of ['anon','authenticated','service_role','authenticator']) await denied(db,`SELECT * FROM ${STORE}`,role);
  } finally {await db.close();}
});
test('key input arguments never accept a secret value in command-line options',async()=>{
  assert.deepEqual(recovery.parseArgs(['--snapshot','--snapshot-key-stdin','--snapshot-key-id',keyId]),
    {mode:'snapshot',snapshotId:undefined,keyId,keyStdin:true});
  assert.throws(()=>recovery.parseArgs(['--snapshot','--snapshot-key','must-not-be-accepted']),/RECOVERY_ARGUMENT_INVALID/);
  assert.throws(()=>recovery.parseArgs(['--dry-run','--snapshot-key-stdin']),/RECOVERY_ARGUMENT_INVALID/);
});
test('exact armed journals require a fresh snapshot and preserve three repair events without altering source or owner references',()=>withDB(async pair=>{
  for(const db of [pair.primary,pair.backup]) await db.exec('UPDATE public.users SET salary=12.3400');
  const old=await snapshot(pair),p=await state(pair.primary),b=await state(pair.backup);
  const run=await armJournal(pair);
  await assert.rejects(()=>apply(pair,old),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_STATE_CHANGED');
  assert.deepEqual(await state(pair.primary),p);assert.deepEqual(await state(pair.backup),b);
  const fresh=await snapshot(pair),saved=(await pair.backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[fresh.snapshot_id])).rows[0];
  const payload=recovery.decrypt(saved,secret,keyId);
  assert.equal(payload.catalog.users.journal.primary.registration.run_id,run.run_id);
  assert.equal(payload.catalog.departments.journal.backup.registration.run_id,run.run_id);
  assert.deepEqual((await apply(pair,fresh)).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
  const events=(await pair.backup.query(`SELECT * FROM ${journal.NS}.events ORDER BY id`)).rows;
  assert.equal(events.length,3);assert.equal((await pair.primary.query(`SELECT count(*)::int n FROM ${journal.NS}.events`)).rows[0].n,0);
  assert.equal(events.filter(e=>e.table_name==='users' && e.operation==='UPDATE').length,1);
  assert.doesNotMatch(JSON.stringify(events),/fixture-.*hash|example\.invalid/);
  assert.deepEqual(await state(pair.primary),p);assert.deepEqual((await state(pair.backup)).crm_leads,b.crm_leads);
}));
test('journal function body, SECURITY DEFINER, exact settings and owner-only function ACL cannot drift',()=>withDB(async pair=>{
  await armJournal(pair);
  const fn=journal.NS+'.capture_identity_change()';
  const original=(await pair.primary.query('SELECT pg_get_functiondef($1::regprocedure) definition',[fn])).rows[0].definition;
  const before=await state(pair.backup);
  const mutations=[`ALTER FUNCTION ${fn} SECURITY INVOKER`,`ALTER FUNCTION ${fn} STABLE`,`ALTER FUNCTION ${fn} SET search_path=public`,
    `ALTER FUNCTION ${fn} SET timezone='Asia/Ho_Chi_Minh'`,`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated`];
  for(const mutation of mutations) {
    await pair.primary.exec(mutation);
    await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_FUNCTION_CHANGED');
    await pair.primary.exec(original);await pair.primary.exec(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC,anon,authenticated,service_role,authenticator`);
  }
  const run=(await pair.primary.query(`SELECT * FROM ${journal.NS}.runs`)).rows[0];
  await pair.primary.exec(`CREATE OR REPLACE FUNCTION ${fn} RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$ BEGIN RETURN NULL; END $$`);
  const altered=(await pair.primary.query('SELECT prosrc,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid=$1::regprocedure',[fn])).rows[0];
  const definition={...run.definition,capture_body_sha256:crypto.createHash('sha256').update(altered.prosrc.replace(/\r\n/g,'\n')).digest('hex'),
    capture_function_sha256:crypto.createHash('sha256').update(altered.definition).digest('hex')};
  await pair.primary.query(`UPDATE ${journal.NS}.runs SET definition=$1,definition_sha256=$2`,[definition,recovery.fingerprint(definition)]);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_FUNCTION_CHANGED');
  assert.deepEqual(await state(pair.backup),before);
}));
test('journal triggers must be the exact ALWAYS pair with reviewed function, type and no extra trigger',()=>withDB(async pair=>{
  await armJournal(pair);const cap='vpt_cutover_identity_20261015',trunc='vpt_cutover_truncate_20261015';
  for(const mode of ['DISABLE','ENABLE REPLICA','ENABLE']) {
    await pair.backup.exec(`ALTER TABLE public.users ${mode} TRIGGER ${cap}`);
    await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_TRIGGER_CHANGED');
    await pair.backup.exec(`ALTER TABLE public.users ENABLE ALWAYS TRIGGER ${cap}`);
  }
  const original=(await pair.backup.query('SELECT pg_get_triggerdef(oid,true) definition FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname=$2',['public.users',cap])).rows[0].definition;
  await pair.backup.exec(`DROP TRIGGER ${cap} ON public.users;CREATE TRIGGER ${cap} AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION ${journal.NS}.capture_identity_change();ALTER TABLE public.users ENABLE ALWAYS TRIGGER ${cap}`);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_TRIGGER_CHANGED');
  await pair.backup.exec(`DROP TRIGGER ${cap} ON public.users;${original};ALTER TABLE public.users ENABLE ALWAYS TRIGGER ${cap}`);
  await pair.backup.exec(`CREATE FUNCTION public.fixture_extra_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW;END $$;CREATE TRIGGER fixture_extra BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fixture_extra_journal()`);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_TRIGGER_CHANGED');
  await pair.backup.exec(`DROP TRIGGER fixture_extra ON public.users;DROP TRIGGER ${cap} ON public.users;DROP TRIGGER ${trunc} ON public.users`);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_TRIGGER_MISSING');
}));
test('journal registration validates project/site, catalog, sorted scope and one run across both projects',()=>withDB(async pair=>{
  await armJournal(pair);
  const run=(await pair.backup.query(`SELECT * FROM ${journal.NS}.runs`)).rows[0];
  const before=await state(pair.backup);
  for(const change of [{project_ref:recovery.PRIMARY},{site:'primary'},{tables:['users','departments']},{capture_body_sha256:'0'.repeat(64)},{unsupported_contract_version:2}]) {
    const d={...run.definition,...change};
    await pair.backup.query(`UPDATE ${journal.NS}.runs SET definition=$1,definition_sha256=$2`,[d,recovery.fingerprint(d)]);
    await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_REGISTRATION_CHANGED');
  }
  await pair.backup.query(`UPDATE ${journal.NS}.runs SET definition=$1,definition_sha256=$2`,[run.definition,run.definition_sha256]);
  const registered=(await pair.backup.query(`SELECT catalog_sha256 FROM ${journal.NS}.registrations WHERE table_name='users'`)).rows[0];
  await pair.backup.query(`UPDATE ${journal.NS}.registrations SET catalog_sha256=$1 WHERE table_name='users'`,['0'.repeat(64)]);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_REGISTRATION_CHANGED');
  await pair.backup.query(`UPDATE ${journal.NS}.registrations SET catalog_sha256=$1 WHERE table_name='users'`,[registered.catalog_sha256]);
  const otherRun=crypto.randomUUID();
  await pair.backup.query(`INSERT INTO ${journal.NS}.runs(id,operation,site,definition,definition_sha256) VALUES($1,$2,$3,$4,$5)`,
    [otherRun,run.operation,run.site,run.definition,run.definition_sha256]);
  await pair.backup.query(`UPDATE ${journal.NS}.registrations SET run_id=$1`,[otherRun]);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_PAIR_INCOMPLETE');
  assert.deepEqual(await state(pair.backup),before);
}));
test('journal private schema/table or sequence app grants block the repair before a snapshot or business write',()=>withDB(async pair=>{
  await armJournal(pair);
  const before=await state(pair.backup);
  await pair.primary.exec(`GRANT SELECT ON ${journal.NS}.events TO service_role`);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  await pair.primary.exec(`REVOKE ALL ON ${journal.NS}.events FROM service_role;GRANT USAGE ON SEQUENCE ${journal.NS}.events_id_seq TO authenticated`);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  await pair.primary.exec(`REVOKE ALL ON SEQUENCE ${journal.NS}.events_id_seq FROM authenticated;CREATE POLICY fixture_extra ON ${journal.NS}.events TO authenticated USING(true)`);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret,keyId}),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  assert.deepEqual(await state(pair.backup),before);
}));
test('public rewrite rules cannot add hidden writes with or without the exact journal',()=>withDB(async pair=>{
  const before=await state(pair.backup);
  for(const db of [pair.primary,pair.backup]) await db.exec('CREATE TABLE public.fixture_unplanned_sideeffect(id integer)');
  for(const armed of [false,true]) {
    if(armed) await armJournal(pair);
    const created=await snapshot(pair);
    for(const db of [pair.primary,pair.backup]) for(const table of ['users','departments']) {
      const operation=table==='users'?'UPDATE':'INSERT';
      await db.exec(`CREATE RULE fixture_unplanned AS ON ${operation} TO public.${table} DO ALSO INSERT INTO public.fixture_unplanned_sideeffect VALUES(1)`);
      await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PUBLIC_RULE_CHANGED');
      await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_PUBLIC_RULE_CHANGED');
      assert.equal((await db.query('SELECT count(*)::int n FROM public.fixture_unplanned_sideeffect')).rows[0].n,0);
      await db.exec(`DROP RULE fixture_unplanned ON public.${table}`);
    }
  }
  assert.deepEqual(await state(pair.backup),before);
}));
test('private journal rewrite rules are rejected on every table and project before they can discard or redirect events',()=>withDB(async pair=>{
  await armJournal(pair);const before=await state(pair.backup);
  for(const db of [pair.primary,pair.backup]) for(const table of ['runs','registrations','events','artifacts']) {
    await db.exec(`CREATE RULE fixture_discard AS ON INSERT TO ${journal.NS}.${table} DO INSTEAD NOTHING`);
    await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_HOOK_CHANGED');
    await db.exec(`DROP RULE fixture_discard ON ${journal.NS}.${table}`);
  }
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,0);
  assert.deepEqual(await state(pair.backup),before);
}));
test('private journal noninternal triggers cannot introduce writes on any of the four tables',()=>withDB(async pair=>{
  await armJournal(pair);const before=await state(pair.backup);
  for(const db of [pair.primary,pair.backup]) {
    await db.exec(`CREATE TABLE public.fixture_unplanned_sideeffect(id integer);
      CREATE FUNCTION public.fixture_private_hook() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO public.fixture_unplanned_sideeffect VALUES(1);RETURN NEW;END $$`);
    for(const table of ['runs','registrations','events','artifacts']) {
      await db.exec(`CREATE TRIGGER fixture_hook BEFORE INSERT ON ${journal.NS}.${table} FOR EACH ROW EXECUTE FUNCTION public.fixture_private_hook()`);
      await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_HOOK_CHANGED');
      await db.exec(`DROP TRIGGER fixture_hook ON ${journal.NS}.${table}`);
    }
    assert.equal((await db.query('SELECT count(*)::int n FROM public.fixture_unplanned_sideeffect')).rows[0].n,0);
  }
  assert.deepEqual(await state(pair.backup),before);
}));
test('missing, extra or tampered same-transaction journal events roll back all three writes and the snapshot mark',async()=>{
  for(const fault of ['missing','extra','digest']) {
    // A CLI attempt opens fresh connections. Isolate each adversarial DDL fault
    // too, rather than inheriting a PGlite SPI plan from the prior rollback.
    await withDB(async pair=>{
    await armJournal(pair);const created=await snapshot(pair),before=await allPublicRows(pair.backup);
    const snapshotBefore=(await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0];
    let injected=false;
    const backup={query:async(sql,args)=>{
      if(!injected && fault==='missing' && sql.startsWith('UPDATE public.users SET email')) {
        injected=true;await pair.backup.exec(`CREATE RULE fixture_discard_events AS ON INSERT TO ${journal.NS}.events DO INSTEAD NOTHING`);
      }
      const result=await pair.backup.query(sql,args);
      if(!injected && sql.startsWith('INSERT INTO public.\"users\"')) {
        injected=true;
        if(fault==='extra') await pair.backup.exec(`INSERT INTO ${journal.NS}.events(run_id,table_name,operation,transaction_id,old_key,new_key,old_context,new_context,old_digest,new_digest,touched_columns)
          SELECT run_id,table_name,operation,transaction_id,old_key,new_key,old_context,new_context,old_digest,new_digest,touched_columns FROM ${journal.NS}.events ORDER BY id LIMIT 1`);
        else await pair.backup.exec(`UPDATE ${journal.NS}.events SET new_digest=repeat('0',64) WHERE operation='UPDATE'`);
      }
      return result;
    }};
    await assert.rejects(()=>apply({...pair,backup},created),e=>e.recoveryCode==='RECOVERY_JOURNAL_REPAIR_NOT_CONFIRMED');
    assert.equal(injected,true);assert.deepEqual(await allPublicRows(pair.backup),before);
    assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${journal.NS}.events`)).rows[0].n,0);
    assert.deepEqual((await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0],snapshotBefore);
    assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM pg_rewrite WHERE ev_class=$1::regclass`,[journal.NS+'.events'])).rows[0].n,0);
    });
  }
  await withDB(async pair=>{
  await armJournal(pair);const created=await snapshot(pair);
  await pair.backup.exec(`INSERT INTO ${journal.NS}.events(run_id,table_name,operation,transaction_id,new_key,touched_columns)
    SELECT id,'users','INSERT',txid_current(),jsonb_build_object('id','unrelated-previous-transaction'),ARRAY['id'] FROM ${journal.NS}.runs`);
  assert.deepEqual((await apply(pair,created)).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${journal.NS}.events`)).rows[0].n,4);
  });
});
test('private rollback snapshot rules or triggers cannot redirect the snapshot or its applied marker',()=>withDB(async pair=>{
  await pair.backup.exec(`CREATE RULE fixture_snapshot_rule AS ON UPDATE TO ${STORE} DO INSTEAD NOTHING`);
  await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_STORE_HOOK_CHANGED');
  await pair.backup.exec(`DROP RULE fixture_snapshot_rule ON ${STORE};
    CREATE FUNCTION public.fixture_snapshot_hook() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW;END $$;
    CREATE TRIGGER fixture_snapshot_trigger BEFORE INSERT ON ${STORE} FOR EACH ROW EXECUTE FUNCTION public.fixture_snapshot_hook()`);
  await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_STORE_HOOK_CHANGED');
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,0);
}));
test('all five private tables reject added volatile defaults before snapshot and after snapshot without hidden business writes',()=>withDB(async pair=>{
  await armJournal(pair);
  await pair.backup.exec(`CREATE TABLE public.fixture_unplanned_default(id integer);
    CREATE FUNCTION public.fixture_default() RETURNS integer LANGUAGE plpgsql VOLATILE AS $$
    BEGIN INSERT INTO public.fixture_unplanned_default VALUES(1);RETURN 1;END $$`);
  const created=await snapshot(pair);
  for(const table of [STORE,...['runs','registrations','events','artifacts'].map(t=>journal.NS+'.'+t)]) {
    await pair.backup.exec(`ALTER TABLE ${table} ADD COLUMN fixture_extra integer DEFAULT public.fixture_default()`);
    // ADD COLUMN itself evaluates a volatile default for preexisting private
    // rows. Reset that deliberate fixture setup effect before calling the tool.
    await pair.backup.exec('TRUNCATE public.fixture_unplanned_default');
    const before=await allPublicRows(pair.backup),count=(await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n;
    await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
    await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
    assert.deepEqual(await allPublicRows(pair.backup),before);
    assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,count);
    assert.deepEqual((await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0],{applied_at:null,result:null});
    await pair.backup.exec(`ALTER TABLE ${table} DROP COLUMN fixture_extra`);
  }
}));
test('all five private tables reject extra volatile CHECK constraints before snapshot and after snapshot',()=>withDB(async pair=>{
  await armJournal(pair);
  await pair.backup.exec(`CREATE TABLE public.fixture_unplanned_check(id integer);
    CREATE FUNCTION public.fixture_check() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
    BEGIN INSERT INTO public.fixture_unplanned_check VALUES(1);RETURN true;END $$`);
  const created=await snapshot(pair);
  for(const table of [STORE,...['runs','registrations','events','artifacts'].map(t=>journal.NS+'.'+t)]) {
    await pair.backup.exec(`ALTER TABLE ${table} ADD CONSTRAINT fixture_extra_check CHECK(public.fixture_check())`);
    await pair.backup.exec('TRUNCATE public.fixture_unplanned_check');
    const before=await allPublicRows(pair.backup);
    await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
    await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
    assert.deepEqual(await allPublicRows(pair.backup),before);
    assert.deepEqual((await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0],{applied_at:null,result:null});
    await pair.backup.exec(`ALTER TABLE ${table} DROP CONSTRAINT fixture_extra_check`);
  }
}));
test('private column type/null/default/identity, missing columns and expression or partial indexes cannot drift',()=>withDB(async pair=>{
  await armJournal(pair);const created=await snapshot(pair),events=journal.NS+'.events';
  const changes=[
    [`ALTER TABLE ${events} ALTER COLUMN observed_at SET DEFAULT now()`,`ALTER TABLE ${events} ALTER COLUMN observed_at SET DEFAULT clock_timestamp()`],
    [`ALTER TABLE ${STORE} ALTER COLUMN created_at DROP DEFAULT`,`ALTER TABLE ${STORE} ALTER COLUMN created_at SET DEFAULT clock_timestamp()`],
    [`ALTER TABLE ${events} ALTER COLUMN table_name DROP NOT NULL`,`ALTER TABLE ${events} ALTER COLUMN table_name SET NOT NULL`],
    [`ALTER TABLE ${events} ALTER COLUMN new_digest TYPE varchar(64)`,`ALTER TABLE ${events} ALTER COLUMN new_digest TYPE text`],
    [`ALTER TABLE ${events} ALTER COLUMN id SET GENERATED BY DEFAULT`,`ALTER TABLE ${events} ALTER COLUMN id SET GENERATED ALWAYS`],
    [`CREATE INDEX fixture_expr ON ${events} ((lower(table_name)))`,`DROP INDEX ${journal.NS}.fixture_expr`],
    [`CREATE INDEX fixture_partial ON ${events} (table_name) WHERE operation='UPDATE'`,`DROP INDEX ${journal.NS}.fixture_partial`],
  ];
  for(const [change,undo] of changes) {
    await pair.backup.exec(change);
    await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
    await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
    await pair.backup.exec(undo);
  }
  await pair.backup.exec(`ALTER TABLE ${events} DROP COLUMN old_context`);
  await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
  assert.deepEqual((await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0],{applied_at:null,result:null});
}));
test('identity sequence parameters and exact ownership target are pinned while advancing last_value remains valid',()=>withDB(async pair=>{
  await armJournal(pair);const seq=journal.NS+'.events_id_seq',created=await snapshot(pair);
  for(const [change,undo] of [[`INCREMENT BY 2`,`INCREMENT BY 1`],[`CACHE 2`,`CACHE 1`],[`START WITH 2`,`START WITH 1`],[`CYCLE`,`NO CYCLE`]]) {
    await pair.backup.exec(`ALTER SEQUENCE ${seq} ${change}`);
    await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_REQUIRED');
    await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_REQUIRED');
    await pair.backup.exec(`ALTER SEQUENCE ${seq} ${undo}`);
  }
  await pair.backup.exec(`ALTER SEQUENCE ${seq} RENAME TO fixture_identity_sequence`);
  await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  await pair.backup.exec(`ALTER SEQUENCE ${journal.NS}.fixture_identity_sequence RENAME TO events_id_seq`);
  await pair.backup.query('SELECT nextval($1::regclass)',[seq]);
  assert.deepEqual((await apply(pair,created)).committed,{alias_email_updates:1,department_inserts:1,user_inserts:1});
}));
test('PG17 private catalog projection omits only redundant PG18 NOT NULL rows and retains strict column nullability guards',()=>withDB(async pair=>{
  await armJournal(pair);const created=await snapshot(pair);
  const saved=(await pair.backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0];
  const payload=recovery.decrypt(saved,secret,keyId),catalogs=[...payload.private_snapshot_catalog,
    ...payload.catalog.users.journal.backup.private_acl.catalogs];
  assert.equal(catalogs.length,5);
  assert.equal(recovery.fingerprint(payload.private_snapshot_catalog[0].catalog),'175c945b272b12c01ff276b893d7d5eaecbe695fed9a60c5a99fdcb24a09c1f4');
  for(const row of catalogs) {
    assert.ok(row.catalog.constraints.every(c=>c.type!=='n'));
    assert.ok(row.catalog.columns.some(c=>c.not_null===true));
  }
  // PG17 already lacks these rows. On PG18 this assertion proves that the
  // projection actually removed them rather than weakening attnotnull checks.
  const version=Number((await pair.backup.query('SHOW server_version_num')).rows[0].server_version_num);
  const native=(await pair.backup.query(`SELECT count(*)::int n FROM pg_constraint WHERE contype='n' AND conrelid=$1::regclass`,[STORE])).rows[0].n;
  if(version>=180000) assert.ok(native>0);else assert.equal(native,0);
  await pair.backup.exec(`ALTER TABLE ${STORE} ALTER COLUMN source_project DROP NOT NULL`);
  await assert.rejects(()=>snapshot(pair),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
  await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_PRIVATE_CATALOG_CHANGED');
  assert.deepEqual((await pair.backup.query(`SELECT applied_at,result FROM ${STORE} WHERE id=$1`,[created.snapshot_id])).rows[0],{applied_at:null,result:null});
}));
if(require.main===module)(async()=>{let passed=0;for(const item of tests){try{await item.run();passed++;console.log('PASS '+item.name);}catch(e){console.error('FAIL '+item.name);console.error(e.stack);process.exitCode=1;break;}}
console.log(`${passed}/${tests.length} actual PostgreSQL bounded recovery tests passed (PGlite).`);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={withDB,state,allPublicRows,snapshot,apply,armJournal,secret,keyId,S,STORE,setTestDatabaseFactory};
