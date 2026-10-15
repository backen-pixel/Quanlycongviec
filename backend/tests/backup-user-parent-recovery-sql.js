'use strict';
// Actual isolated PostgreSQL. Synthetic data only; no network or production env.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {PGlite}=require(process.argv[2] || '@electric-sql/pglite');
const recovery=require('../scripts/recover-backup-user-parent-20261015');
const {SCOPE:S,recover,STORE}=recovery;
const secret='synthetic-test-key-not-a-production-secret-20261015';
const migration=fs.readFileSync(path.resolve(__dirname,'../../database/20261015041536_vpt_bounded_recovery_private_snapshot.sql'),'utf8');
const tests=[]; const test=(name,run)=>tests.push({name,run});
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
  const primary=new PGlite(),backup=new PGlite();
  for(const db of [primary,backup]) {
    await db.exec(schema);
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
  assert.deepEqual((await backup.query(aclQuery)).rows,beforeMigrationAcls,'private migration must not alter existing public ACL/RLS');
  return {primary,backup};
}
async function withDB(run) { const pair=await create(); try {await run(pair);} finally {await pair.primary.close();await pair.backup.close();} }
async function state(db) {
  const result={};
  for(const table of ['users','departments','crm_leads','user_companies'])
    result[table]=(await db.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row);
  return result;
}
async function snapshot(pair) {return recover({...pair,mode:'snapshot',secret});}
async function apply(pair,created,opts={}) {return recover({...pair,mode:'apply',secret,snapshotId:created.snapshot_id,...opts});}
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
  assert.equal(recovery.decrypt(stored,secret).before.alias.password,'fixture-backup-alias-hash');
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
  await assert.rejects(()=>recover({...pair,mode:'apply',secret,snapshotId:crypto.randomUUID()}),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_MISSING_OR_APPLIED');
  const created=await snapshot(pair);
  await assert.rejects(()=>apply(pair,created,{secret:secret+'rotated'}),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
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
    await assert.rejects(()=>recover({...pair,mode:'snapshot',secret}),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
    await assert.rejects(()=>apply(pair,created),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
    assert.deepEqual(await state(pair.backup),b);
  }
  await pair.primary.query('UPDATE public.users SET salary=NULL WHERE id=$1',[S.canonical]);
  await pair.backup.query('UPDATE public.users SET salary=9007199254740993 WHERE id=$1',[S.alias]);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret}),e=>e.recoveryCode==='RECOVERY_ROW_ROUND_TRIP_UNSAFE');
  assert.equal((await pair.backup.query(`SELECT count(*)::int n FROM ${STORE}`)).rows[0].n,1);
}));
test('matching source/backup schemas cannot both lose known email uniqueness and pass preflight',()=>withDB(async pair=>{
  for(const db of [pair.primary,pair.backup]) await db.exec('ALTER TABLE public.users DROP CONSTRAINT users_email_key');
  const b=await state(pair.backup);
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret}),e=>e.recoveryCode==='RECOVERY_KNOWN_CONSTRAINT_MISSING');
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
  await assert.rejects(()=>recover({...pair,mode:'snapshot',secret}),e=>e.recoveryCode==='RECOVERY_FK_UNSUPPORTED');
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
(async()=>{let passed=0;for(const item of tests){try{await item.run();passed++;console.log('PASS '+item.name);}catch(e){console.error('FAIL '+item.name);console.error(e.stack);process.exitCode=1;break;}}
console.log(`${passed}/${tests.length} actual PostgreSQL bounded recovery tests passed (PGlite).`);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
