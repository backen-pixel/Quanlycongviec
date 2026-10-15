#!/usr/bin/env node
'use strict';

// One reviewed repair, never a generic clone/mapping tool. Default is read-only.
// --snapshot writes ONLY an encrypted rollback snapshot in the private backup
// schema. --apply --snapshot-id UUID requires that durable verified snapshot.
// No rows/SQL errors/URLs/email/password material are printed, even on failure.
const crypto = require('node:crypto');
const PRIMARY = 'kdxypztstbeovyedmvem';
const BACKUP = 'atcfpgxkgbszglrelfgr';
const OPERATION = 'same_uuid_email_department_user_v1';
const ALGORITHM = 'aes-256-gcm/hkdf-sha256/jwt_secret_v1';
const STORE = 'vpt_recovery_20261015.identity_repair_snapshots';
const SCOPE = Object.freeze({
  alias: 'b3da9ac6-b05c-41e6-9a74-0b1defd0a358',
  canonical: '5cc467f8-1394-4f80-8bbc-725953b91df7',
  department: '1e3632ae-ac7f-47a5-a4aa-590e6cde4738',
  aliasCompany: '87479a83-1145-43b7-b090-3e40812cb5a9',
  aliasTenant: '7d42e731-895b-4ba8-99d6-0005c4e23544',
  aliasDepartment: '1bf32541-ef34-4291-b4e1-de650e3c6125',
  canonicalCompany: '842cff41-0f8b-4cee-b7ec-d78ce27e7308',
  canonicalTenant: 'e37fac98-acd2-4675-84f4-285b65e423b1',
});
const COUNTS = Object.freeze({ alias_email_updates: 1, department_inserts: 1, user_inserts: 1 });
const META = ['company_id','tenant_id','department_id','role','is_active','auth_provider','created_at','updated_at'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const connectionStates=new WeakMap();
function fail(code) { const e = new Error(code); e.recoveryCode = code; throw e; }
function check(value, code) { if (!value) fail(code); }
function watchClient(client) {
  if(connectionStates.has(client)) return connectionStates.get(client);
  const state={failed:false}; connectionStates.set(client,state);
  // pg can emit idle/network errors outside a query promise. Consume them
  // without retaining/logging the raw PG detail, and stop subsequent writes.
  if(typeof client.on==='function') {
    client.on('error',()=>{state.failed=true;});
    client.on('end',()=>{state.failed=true;});
  }
  return state;
}
function assertHealthy(...clients) { check(clients.every(c=>!watchClient(c).failed),'RECOVERY_CONNECTION_LOST'); }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function fingerprint(value) { return crypto.createHash('sha256').update(stable(value) ?? 'undefined').digest('hex'); }
function same(a,b) { return fingerprint(a) === fingerprint(b); }
function quote(name) { return '"'+String(name).replaceAll('"','""')+'"'; }
function aad(id) { return Buffer.from([OPERATION,PRIMARY,BACKUP,id,ALGORITHM].join('|')); }
function derive(secret,salt) {
  check(typeof secret === 'string' && Buffer.byteLength(secret) >= 32, 'RECOVERY_KEY_UNAVAILABLE');
  return Buffer.from(crypto.hkdfSync('sha256',Buffer.from(secret),salt,Buffer.from('vpt/backup/20261015/identity-rollback/v1'),32));
}
function encrypt(payload,secret,id) {
  const salt=crypto.randomBytes(32),nonce=crypto.randomBytes(12),key=derive(secret,salt);
  try {
    const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce); cipher.setAAD(aad(id));
    const ciphertext=Buffer.concat([cipher.update(stable(payload),'utf8'),cipher.final()]);
    return {salt,nonce,auth_tag:cipher.getAuthTag(),ciphertext,
      ciphertext_sha256:crypto.createHash('sha256').update(ciphertext).digest('hex')};
  } finally { key.fill(0); }
}
function decrypt(row,secret) {
  check(row.operation===OPERATION && row.source_project===PRIMARY && row.backup_project===BACKUP && row.algorithm===ALGORITHM,'RECOVERY_SNAPSHOT_SCOPE');
  const ciphertext=Buffer.from(row.ciphertext);
  check(crypto.createHash('sha256').update(ciphertext).digest('hex')===row.ciphertext_sha256,'RECOVERY_SNAPSHOT_DIGEST');
  const key=derive(secret,Buffer.from(row.salt));
  try {
    const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.nonce));
    cipher.setAAD(aad(row.id)); cipher.setAuthTag(Buffer.from(row.auth_tag));
    const payload=JSON.parse(Buffer.concat([cipher.update(ciphertext),cipher.final()]).toString('utf8'));
    check(payload.operation===OPERATION && same(payload.scope,SCOPE),'RECOVERY_SNAPSHOT_SCOPE');
    return payload;
  } catch(e) { if(e.recoveryCode) throw e; fail('RECOVERY_SNAPSHOT_DECRYPT'); }
  finally { key.fill(0); }
}
async function row(client,table,id,lock='') {
  const r=await client.query(`SELECT to_jsonb(t) AS row FROM public.${quote(table)} t WHERE id=$1 ${lock}`, [id]);
  check(r.rows.length<=1,'RECOVERY_ROW_AMBIGUOUS'); return r.rows[0]?.row || null;
}
async function assertRoundTrip(client,table,value) {
  // pg's JSON parser uses JS numbers. A numeric salary could otherwise be
  // rounded in BOTH the encrypted snapshot and subsequent equality checks.
  // The database compares its original JSONB against the parsed representation
  // before either snapshot or repair can persist anything.
  const result=await client.query(`SELECT to_jsonb(t)=$2::jsonb AS exact FROM public.${quote(table)} t WHERE id=$1`,
    [value.id,JSON.stringify(value)]);
  check(result.rows.length===1 && result.rows[0].exact===true,'RECOVERY_ROW_ROUND_TRIP_UNSAFE');
}
async function tableCatalog(client,table) {
  const columns=(await client.query(`SELECT a.attname,a.atttypid::regtype::text AS type,a.atttypmod,a.attnotnull,
    a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS default_expr
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, ['public.'+table])).rows;
  check(columns.length && columns.every(c=>!c.attgenerated && !c.attidentity),'RECOVERY_SCHEMA_UNSUPPORTED');
  const constraints=(await client.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid,true) AS definition
    FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, ['public.'+table])).rows;
  const triggers=(await client.query('SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal', ['public.'+table])).rows;
  check(triggers.length===0,'RECOVERY_TRIGGER_CHANGED');
  check(constraints.every(c=>c.convalidated),'RECOVERY_CONSTRAINT_UNVALIDATED');
  const required=table==='users'?['PRIMARY KEY (id)','UNIQUE (email)']:['PRIMARY KEY (id)','UNIQUE (slug)'];
  check(required.every(def=>constraints.some(c=>c.convalidated && c.definition===def)),'RECOVERY_KNOWN_CONSTRAINT_MISSING');
  const requiredTypes=table==='users'
    ? {id:'uuid',email:'character varying',password:'character varying',company_id:'uuid',tenant_id:'uuid',department_id:'uuid',salary:'numeric'}
    : {id:'uuid',slug:'character varying',manager_id:'uuid',parent_id:'uuid',company_id:'uuid',division_unit_id:'uuid'};
  check(Object.entries(requiredTypes).every(([name,type])=>columns.some(c=>c.attname===name && c.type===type)),'RECOVERY_KNOWN_TYPE_CHANGED');
  return {columns,constraints};
}
async function foreignKeys(client,table,inbound=false) {
  // attname is PostgreSQL's `name` type. pg parses text[] (OID1009), while
  // name[] (OID1003) would arrive as a raw string rather than an array.
  return (await client.query(`SELECT con.conname,ns.nspname AS child_schema,c.relname AS child_table,
    pn.nspname AS parent_schema,p.relname AS parent_table,con.convalidated,
    ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) AS child_columns,
    ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=k.num ORDER BY k.ord) AS parent_columns,
    pg_get_constraintdef(con.oid,true) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_class p ON p.oid=con.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace
    WHERE con.contype='f' AND con.${inbound?'confrelid':'conrelid'}=$1::regclass ORDER BY ns.nspname,c.relname,con.conname`, ['public.'+table])).rows;
}
async function inboundCounts(client) {
  const result=[];
  for(const table of ['users','departments']) for(const fk of await foreignKeys(client,table,true)) {
    check(fk.convalidated && Array.isArray(fk.parent_columns) && Array.isArray(fk.child_columns) &&
      fk.parent_columns.length===1 && fk.parent_columns[0]==='id' && fk.child_columns.length===1,'RECOVERY_FK_UNSUPPORTED');
    result.push({definition:fk,counts:[]});
  }
  // Hundreds of individual round trips could outlive the short source lock.
  // Batch bounded index counts; PostgreSQL still checks one snapshot/transaction.
  for(let start=0;start<result.length;start+=40) {
    const batch=result.slice(start,start+40);
    const sql='WITH recovery_scope_ids AS (SELECT $1::uuid[] AS users,$2::uuid[] AS departments) '+batch.map((item,i)=>{
      const fk=item.definition,col=quote(fk.child_columns[0]),param=fk.parent_table==='users'?'$1':'$2';
      return `SELECT ${start+i}::int AS position,coalesce(jsonb_agg(jsonb_build_object('id',s.id,'n',s.n) ORDER BY s.id),'[]'::jsonb) AS counts
        FROM (SELECT ${col}::text AS id,count(*)::int AS n FROM ${quote(fk.child_schema)}.${quote(fk.child_table)}
          WHERE ${col}=ANY(${param}::uuid[]) GROUP BY ${col}) s`;
    }).join(' UNION ALL ');
    for(const item of (await client.query(sql,[[SCOPE.alias,SCOPE.canonical],[SCOPE.department]])).rows)
      result[item.position].counts=item.counts;
  }
  return result;
}
async function parentsExist(client,table,value) {
  for(const fk of await foreignKeys(client,table)) {
    check(fk.convalidated && Array.isArray(fk.child_columns) && Array.isArray(fk.parent_columns) &&
      fk.child_columns.length===fk.parent_columns.length && fk.child_columns.length>0,'RECOVERY_FK_UNSUPPORTED');
    const values=fk.child_columns.map(c=>value[c]);
    if(values.every(v=>v==null)) continue;
    check(values.every(v=>v!=null),'RECOVERY_PARENT_PARTIAL_NULL');
    if(table==='users' && fk.parent_schema==='public' && fk.parent_table==='departments' &&
      fk.parent_columns.length===1 && fk.parent_columns[0]==='id' && values[0]===SCOPE.department) continue;
    const predicate=fk.parent_columns.map((c,i)=>`${quote(c)}=$${i+1}`).join(' AND ');
    check((await client.query(`SELECT 1 FROM ${quote(fk.parent_schema)}.${quote(fk.parent_table)} WHERE ${predicate} LIMIT 2`,values)).rows.length===1,'RECOVERY_PARENT_MISSING');
  }
}
async function assertPrivateStore(client) {
  const {rows}=await client.query(`SELECT n.nspowner=r.oid AS schema_owned,c.relowner=r.oid AS table_owned,
    c.relrowsecurity,c.relforcerowsecurity,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) AS schema_acl_private,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner) AS table_acl_private,
    NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname IN('anon','authenticated','service_role','authenticator')
      AND (has_schema_privilege(p.oid,n.oid,'USAGE') OR has_table_privilege(p.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) AS app_roles_denied
    FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid JOIN pg_roles r ON r.rolname=current_user
    WHERE n.nspname='vpt_recovery_20261015' AND c.relname='identity_repair_snapshots' AND c.relkind='r'`);
  check(rows.length===1 && Object.values(rows[0]).every(v=>v===true),'RECOVERY_PRIVATE_STORE_REQUIRED');
}
function guardScope(alias,canonical,department,backupAlias) {
  check(alias && canonical && department && backupAlias,'RECOVERY_SOURCE_OR_ALIAS_MISSING');
  check(alias.id===SCOPE.alias && canonical.id===SCOPE.canonical && department.id===SCOPE.department && backupAlias.id===SCOPE.alias,'RECOVERY_SCOPE_CHANGED');
  check(alias.company_id===SCOPE.aliasCompany && alias.tenant_id===SCOPE.aliasTenant && alias.department_id===SCOPE.aliasDepartment &&
    canonical.company_id===SCOPE.canonicalCompany && canonical.tenant_id===SCOPE.canonicalTenant && canonical.department_id===SCOPE.department &&
    department.company_id===SCOPE.canonicalCompany && Object.hasOwn(department,'manager_id') && department.manager_id===null &&
    Object.hasOwn(department,'parent_id') && department.parent_id===null,'RECOVERY_SCOPE_CHANGED');
  check(alias.role==='sales_admin' && alias.is_active===true && alias.auth_provider==='password' &&
    canonical.role==='sales_admin' && canonical.is_active===true && canonical.auth_provider==='local','RECOVERY_AUTH_SCOPE_CHANGED');
  check(META.every(k=>same(alias[k],backupAlias[k])),'RECOVERY_ALIAS_METADATA_CHANGED');
  check(typeof alias.email==='string' && alias.email.length>0 && typeof canonical.email==='string' && canonical.email.length>0 &&
    alias.email!==canonical.email && backupAlias.email===canonical.email,'RECOVERY_EMAIL_RELATION_CHANGED');
}
async function capture(primary,backup) {
  // Always lock both source users in stable UUID order, then the one department.
  const users=(await primary.query(`SELECT to_jsonb(t) AS row FROM public.users t
    WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [[SCOPE.alias,SCOPE.canonical]])).rows.map(r=>r.row);
  const alias=users.find(r=>r.id===SCOPE.alias),canonical=users.find(r=>r.id===SCOPE.canonical);
  const department=await row(primary,'departments',SCOPE.department,'FOR SHARE');
  const backupAlias=await row(backup,'users',SCOPE.alias,'FOR UPDATE');
  guardScope(alias,canonical,department,backupAlias);
  await assertRoundTrip(primary,'users',alias); await assertRoundTrip(primary,'users',canonical);
  await assertRoundTrip(primary,'departments',department); await assertRoundTrip(backup,'users',backupAlias);
  check(!await row(backup,'users',SCOPE.canonical),'RECOVERY_CANONICAL_ALREADY_PRESENT');
  check(!await row(backup,'departments',SCOPE.department),'RECOVERY_DEPARTMENT_ALREADY_PRESENT');
  check((await primary.query('SELECT id FROM public.users WHERE email=$1',[alias.email])).rows.length===1,'RECOVERY_SOURCE_EMAIL_AMBIGUOUS');
  check((await backup.query('SELECT id FROM public.users WHERE email=$1',[alias.email])).rows.length===0,'RECOVERY_EMAIL_COLLISION');
  check((await backup.query('SELECT id FROM public.departments WHERE slug=$1',[department.slug])).rows.length===0,'RECOVERY_DEPARTMENT_COLLISION');
  const catalog={};
  for(const table of ['users','departments']) {
    const source=await tableCatalog(primary,table),target=await tableCatalog(backup,table);
    check(same(source,target),'RECOVERY_SCHEMA_CHANGED'); catalog[table]=target;
  }
  await parentsExist(backup,'departments',department); await parentsExist(backup,'users',canonical);
  return {operation:OPERATION,scope:SCOPE,source:{alias,canonical,department},before:{alias:backupAlias,canonical:null,department:null},catalog,
    inbound:await inboundCounts(backup)};
}
async function saveSnapshot(backup,payload,secret,id,healthy) {
  await assertPrivateStore(backup);
  const e=encrypt(payload,secret,id);
  healthy();
  await backup.query(`INSERT INTO ${STORE}(id,operation,source_project,backup_project,algorithm,salt,nonce,auth_tag,ciphertext,ciphertext_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id,OPERATION,PRIMARY,BACKUP,ALGORITHM,e.salt,e.nonce,e.auth_tag,e.ciphertext,e.ciphertext_sha256]);
  const saved=(await backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[id])).rows[0];
  check(saved && same(decrypt(saved,secret),payload),'RECOVERY_SNAPSHOT_READBACK');
  return e.ciphertext_sha256;
}
async function loadSnapshot(backup,secret,id) {
  await assertPrivateStore(backup);
  const saved=(await backup.query(`SELECT * FROM ${STORE} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  check(saved && !saved.applied_at,'RECOVERY_SNAPSHOT_MISSING_OR_APPLIED');
  return {payload:decrypt(saved,secret),sha:saved.ciphertext_sha256};
}
function expectedInbound(payload) {
  const expected=JSON.parse(JSON.stringify(payload.inbound));
  for(const item of expected) {
    const fk=item.definition;
    if(fk.child_schema!=='public' || !['users','departments'].includes(fk.child_table)) continue;
    const child=fk.child_table==='users'?payload.source.canonical:payload.source.department;
    const parentId=child[fk.child_columns[0]];
    const ids=fk.parent_table==='users'?[SCOPE.alias,SCOPE.canonical]:[SCOPE.department];
    if(!ids.includes(parentId)) continue;
    let count=item.counts.find(c=>c.id===parentId);
    if(!count) { count={id:parentId,n:0}; item.counts.push(count); }
    count.n++;
    item.counts.sort((a,b)=>a.id.localeCompare(b.id));
  }
  return expected;
}
async function writeRepair(backup,payload,healthy) {
  const {alias,canonical,department}=payload.source;
  healthy();
  const update=await backup.query(`UPDATE public.users SET email=$1 WHERE id=$2 AND to_jsonb(users)=$3::jsonb RETURNING to_jsonb(users) AS row`,
    [alias.email,SCOPE.alias,JSON.stringify(payload.before.alias)]);
  check(update.rows.length===1,'RECOVERY_ALIAS_WRITE_NOT_CONFIRMED');
  const {email:ignored,...before}=payload.before.alias; const {email:afterEmail,...after}=update.rows[0].row;
  check(afterEmail===alias.email && same(before,after),'RECOVERY_ALIAS_NON_EMAIL_CHANGED');
  for(const [table,value] of [['departments',department],['users',canonical]]) {
    healthy();
    const inserted=await backup.query(`INSERT INTO public.${quote(table)} SELECT (jsonb_populate_record(NULL::public.${quote(table)},$1::jsonb)).* RETURNING to_jsonb(${quote(table)}) AS row`, [JSON.stringify(value)]);
    check(inserted.rows.length===1 && same(inserted.rows[0].row,value),'RECOVERY_INSERT_NOT_CONFIRMED');
  }
  check(same(await row(backup,'users',SCOPE.alias),{...payload.before.alias,email:alias.email}),'RECOVERY_ALIAS_POSTCHECK');
  check(same(await row(backup,'users',SCOPE.canonical),canonical) && same(await row(backup,'departments',SCOPE.department),department),'RECOVERY_INSERT_POSTCHECK');
  // Existing FK references stay intact. Only the newly inserted canonical user
  // adds its one department reference; no existing child row is repointed.
  check(same(await inboundCounts(backup),expectedInbound(payload)),'RECOVERY_INBOUND_CHANGED');
  await assertPrivateStore(backup);
}
async function rollback(client) { try { await client.query('ROLLBACK'); } catch {} }
async function recover({primary,backup,mode='dry-run',secret,snapshotId}) {
  check(['dry-run','snapshot','apply'].includes(mode),'RECOVERY_MODE_INVALID');
  if(mode==='apply') check(UUID.test(snapshotId||''),'RECOVERY_SNAPSHOT_ID_REQUIRED');
  const id=mode==='snapshot'?crypto.randomUUID():snapshotId;
  watchClient(primary); watchClient(backup);
  const healthy=()=>assertHealthy(primary,backup);
  healthy();
  await primary.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await primary.query("SET LOCAL TIME ZONE 'UTC'");
    await primary.query("SET LOCAL lock_timeout='2s'"); await primary.query("SET LOCAL statement_timeout='10s'");
    await primary.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
    await backup.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await backup.query("SET LOCAL TIME ZONE 'UTC'");
    await backup.query("SET LOCAL lock_timeout='2s'"); await backup.query("SET LOCAL statement_timeout='10s'");
    await backup.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
    const saved=mode==='apply'?await loadSnapshot(backup,secret,id):null;
    const payload=await capture(primary,backup);
    healthy();
    if(mode==='dry-run') {
      await rollback(backup); await rollback(primary);
      return {ok:true,mode,eligible:true,planned:COUNTS,production_rows_changed:0};
    }
    if(mode==='snapshot') {
      const sha=await saveSnapshot(backup,payload,secret,id,healthy);
      await primary.query('SELECT 1'); healthy();
      await backup.query('COMMIT'); await rollback(primary);
      return {ok:true,mode,snapshot_id:id,ciphertext_sha256:sha,production_rows_changed:0,private_snapshot_created:1};
    }
    check(same(payload,saved.payload),'RECOVERY_SNAPSHOT_STATE_CHANGED');
    await writeRepair(backup,payload,healthy);
    healthy();
    const marked=await backup.query(`UPDATE ${STORE} SET applied_at=clock_timestamp(),result=$1::jsonb WHERE id=$2 AND applied_at IS NULL RETURNING id`,[JSON.stringify(COUNTS),id]);
    check(marked.rows.length===1,'RECOVERY_SNAPSHOT_MARK_NOT_CONFIRMED');
    // Source row locks remain held through successful backup COMMIT.
    // Refresh the source transaction before the final health check, so an
    // idle-timeout/network failure cannot silently release its FOR SHARE locks.
    await primary.query('SELECT 1'); healthy();
    await backup.query('COMMIT'); await rollback(primary);
    return {ok:true,mode,snapshot_id:id,ciphertext_sha256:saved.sha,committed:COUNTS,failover_ready:false};
  } catch(e) { await rollback(backup); await rollback(primary); healthy(); throw e; }
}
function parseArgs(args) {
  let mode='dry-run',snapshotId; const modes=args.filter(a=>['--dry-run','--snapshot','--apply'].includes(a));
  check(modes.length<=1,'RECOVERY_MODE_INVALID'); if(modes[0]) mode=modes[0].slice(2);
  for(let i=0;i<args.length;i++) {
    if(['--dry-run','--snapshot','--apply'].includes(args[i])) continue;
    if(args[i]==='--snapshot-id') { check(!snapshotId && i+1<args.length,'RECOVERY_ARGUMENT_INVALID'); snapshotId=args[++i]; }
    else fail('RECOVERY_ARGUMENT_INVALID');
  }
  check(!snapshotId || (mode==='apply' && UUID.test(snapshotId)),'RECOVERY_ARGUMENT_INVALID');
  return {mode,snapshotId};
}
function safeCode(e) {
  if(/^RECOVERY_[A-Z_]+$/.test(e?.recoveryCode||'')) return e.recoveryCode;
  return ({'23505':'RECOVERY_UNIQUE_CONFLICT','23503':'RECOVERY_FK_CONFLICT','40001':'RECOVERY_CONCURRENT_CHANGE',
    '40P01':'RECOVERY_CONCURRENT_CHANGE','55P03':'RECOVERY_LOCK_UNAVAILABLE','57014':'RECOVERY_TIMEOUT',
    '42501':'RECOVERY_PERMISSION_DENIED','42P01':'RECOVERY_SCHEMA_REQUIRED'})[e?.code] || 'RECOVERY_FAILED';
}
function validateUrl(raw,ref) {
  let u; try { u=new URL(raw); } catch { fail('RECOVERY_DATABASE_URL_REQUIRED'); }
  check(['postgres:','postgresql:'].includes(u.protocol),'RECOVERY_DATABASE_URL_INVALID');
  const direct=u.hostname===`db.${ref}.supabase.co`;
  const pool=u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username)===`postgres.${ref}`;
  check(direct||pool,'RECOVERY_PROJECT_PAIR_MISMATCH');
  // pg parses query parameters after Client options, so even ?ssl=false could
  // override the explicit verified-TLS setting. No URL query option is needed
  // for this bounded operation; never forward any of them to pg.
  check(u.pathname==='/postgres','RECOVERY_DATABASE_URL_INVALID');
  u.search=''; u.hash='';
  return u.toString();
}
async function main() {
  const opts=parseArgs(process.argv.slice(2));
  require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
  const {Client}=require('pg');
  const pUrl=validateUrl(process.env.SUPABASE_DB_URL||process.env.SUPABASE_DB_DIRECT_URL,PRIMARY);
  const bUrl=validateUrl(process.env.SUPABASE_BACKUP_DB_URL||process.env.SUPABASE_BACKUP_DB_DIRECT_URL,BACKUP);
  const primary=new Client({connectionString:pUrl,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  const backup=new Client({connectionString:bUrl,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  watchClient(primary); watchClient(backup);
  try {
    await primary.connect(); await backup.connect();
    const result=await recover({primary,backup,...opts,secret:process.env.JWT_SECRET});
    console.log(JSON.stringify(result));
  } finally { await Promise.allSettled([primary.end(),backup.end()]); }
}
if(require.main===module) main().catch(e=>{ console.error(JSON.stringify({ok:false,reason:safeCode(e)})); process.exitCode=1; });
module.exports={recover,parseArgs,safeCode,encrypt,decrypt,fingerprint,SCOPE,PRIMARY,BACKUP,STORE,OPERATION,ALGORITHM,validateUrl,watchClient};
