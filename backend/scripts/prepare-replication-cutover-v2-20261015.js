#!/usr/bin/env node
'use strict';

// Local preparation surface: CLI inventory/plan only. No arm, fence, capture,
// restore, replay, pruning or deployment command is exposed here.
const crypto = require('node:crypto');
const v1 = require('./preserve-replication-cutover-20261015');
const NS = 'vpt_cutover_v2_20261015';
const ALG = 'aes-256-gcm/hkdf-sha256/cutover_v2';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY_TYPES = new Set(['uuid','bigint','integer','smallint','text','character varying','date','boolean']);
const V1_TABLES = [...v1.SUPPORTED].sort();
const CAPTURE_TRIGGER = 'vpt_cutover_v2_digest_20261015';
const FENCE_TRIGGER = 'vpt_cutover_v2_fence_20261015';
const CHUNK_BYTES = 8 * 1024 * 1024;
const ROW_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_PARTS = 100000;
const FUNCTIONS = Object.freeze({
  immutable_evidence:['7a7832b7d6060aba3ad1d42ffe0e5ff4e9b01348431cb8f3e7fadf3aba42e931',false,0,'trigger',false],
  capture_digest:['728b713c85b216d91125861e3362ee853dbfed80d856e5455e5168eed98499eb',true,0,'trigger',true],
  initialize_control_audit:['0bc13dea7bc880f9e8c7eebdd61f9471cfe3308e450308da02e7f18cc494f246',true,0,'trigger',false],
  write_fence:['d64905ed2fba3714ddda5142c8cba7daff2cfe1166f9f8ecee0406ec35c90fde',true,0,'trigger',true],
  mint_permit:['d86850c9b4f4067851df603c291ebc63604697f3752a34b4c71b0657c83a1836',false,5,'void',true],
  transition_fence:['8f21297927fc0dbad136026cfd00ae612998ef814a15fa107159e64908fb1e54',false,6,'void',true]
});
// Filled from the reviewed, fresh migration's PostgreSQL catalog descriptors.
const PRIVATE_TABLE_SHA = Object.freeze({
  artifacts:'b757d9ec08a834d2f9613266b19d8da8cb64927d429f2a47a8b8fe429749a622',
  control:'a3117c0bf44c2c569aff05589e0cfd1efc8656063eda579be1b0672eb349dfdd',
  events:'3ef88829eb00e3fff7839d3d4469e63b93a78c1d4195ca83e2fafc93c0c4e63f',
  fence_audit:'d520352d71c836727bf9f6b870fa7248536a832f362b4ab7fc5ff40150cb2e62',
  permits:'c81faf2c1b6bca879a9ad74858546cf2d5a73f2a2dfc26bffdc9d559eb2cbae9',
  receipts:'ac064ad289ba3f5b325cc0603000bb4345ec8c76d0ca3375ecf3d7322654ec75',
  registrations:'6bf28489be5650e4f3e8172b8628b912b478e4f6015f185a384ea38fab64d968',
  runs:'77d9ea981a1d688f005afa81f4c8b465fc87e8c06f0fb8181741891444c04a91'
});
const PRIVATE_SEQUENCE_SHA = Object.freeze({
  events_id_seq:'e58a1bf24f4abe6c42acf65fa9e3fdcc2533d4800bbc3eea24736e1b68fa8a20',
  fence_audit_id_seq:'2ea89eca81e4b5dc93ba250c51b2daa5b7654894bf1469245f4481eb72d53bdc'
});
const health = new WeakMap();

function fail(code) { const e = new Error(code); e.cutoverCode = code; throw e; }
function check(ok, code) { if (!ok) fail(code); }
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function quote(s) { return '"' + String(s).replaceAll('"','""') + '"'; }
function watch(c) {
  if (!health.has(c)) {
    const s = { failed:false }; health.set(c,s);
    if (typeof c.on === 'function') { c.on('error',()=>{s.failed=true;}); c.on('end',()=>{s.failed=true;}); }
  }
}
function healthy(c) { watch(c); check(!health.get(c).failed,'CUTOVER_V2_CONNECTION_LOST'); }
function safeCode(e) {
  if (/^CUTOVER_V2_[A-Z_]+$/.test(e?.cutoverCode || '')) return e.cutoverCode;
  return ({'42501':'CUTOVER_V2_PERMISSION_DENIED','55P03':'CUTOVER_V2_LOCK_UNAVAILABLE','40001':'CUTOVER_V2_CONCURRENT_CHANGE','57014':'CUTOVER_V2_TIMEOUT'})[e?.code] || 'CUTOVER_V2_FAILED';
}

async function privateContract(c) {
  const root=(await c.query(`SELECT n.nspowner=current_user::regrole::oid AS owned,current_user=session_user AS direct_owner,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) AS private,
    NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND has_schema_privilege(r.oid,n.oid,'USAGE')) AS app_denied
    FROM pg_namespace n WHERE n.nspname=$1`,[NS])).rows[0];
  check(root?.owned&&root.direct_owner&&root.private&&root.app_denied,'CUTOVER_V2_PRIVATE_CONTRACT');
  const relations=(await c.query(`SELECT t.relname::text AS name,t.relkind::text AS kind,
    t.relowner=current_user::regrole::oid AS owned,t.relpersistence::text AS persistence,t.relrowsecurity,t.relforcerowsecurity,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault(CASE WHEN t.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,t.relowner))) a WHERE a.grantee<>t.relowner) AS private,
    (SELECT count(*)::int FROM pg_rewrite w WHERE w.ev_class=t.oid) AS rewrite_rules,
    (SELECT count(*)=1 AND bool_and(p.polname='owner_only' AND p.polcmd='*' AND p.polpermissive AND p.polroles=ARRAY[current_user::regrole::oid]::oid[] AND pg_get_expr(p.polqual,p.polrelid)='true' AND pg_get_expr(p.polwithcheck,p.polrelid)='true') FROM pg_policy p WHERE p.polrelid=t.oid) AS policy_ok,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',g.tgname,'type',g.tgtype,'enabled',g.tgenabled,'function',p.proname,'function_schema',pn.nspname,'no_when',g.tgqual IS NULL,'args',g.tgnargs) ORDER BY g.tgname)
      FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),'[]'::jsonb) AS triggers
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 ORDER BY t.relname`,[NS])).rows;
  const names=['runs','registrations','control','fence_audit','permits','events','receipts','artifacts'].sort();
  const tables=relations.filter(r=>r.kind==='r'),sequences=relations.filter(r=>r.kind==='S');
  check(stable(tables.map(t=>t.name).sort())===stable(names)&&sequences.length===2&&relations.every(t=>['r','S','i'].includes(t.kind)),'CUTOVER_V2_PRIVATE_CONTRACT');
  for(const t of [...tables,...sequences])check(t.owned&&t.private&&t.persistence==='p'&&t.rewrite_rules===0,'CUTOVER_V2_PRIVATE_CONTRACT');
  const immutable=new Set(['runs','fence_audit','permits','events','receipts','artifacts']);
  for(const t of tables) {
    check(t.relrowsecurity&&t.relforcerowsecurity&&t.policy_ok,'CUTOVER_V2_PRIVATE_CONTRACT');
    const expected=immutable.has(t.name)?[{name:'immutable_evidence',type:58,enabled:'A',function:'immutable_evidence',function_schema:NS,no_when:true,args:0}]
      :t.name==='control'?[{name:'initialize_control_audit',type:5,enabled:'A',function:'initialize_control_audit',function_schema:NS,no_when:true,args:0}]:[];
    check(stable(t.triggers)===stable(expected),'CUTOVER_V2_PRIVATE_CONTRACT');
  }
  const functions=(await c.query(`SELECT p.proname::text AS name,p.prosrc AS source,p.proowner=current_user::regrole::oid AS owned,p.prosecdef,p.pronargs,p.prorettype::regtype::text AS returns,p.proconfig::text[],l.lanname::text AS language,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS private
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 ORDER BY p.proname`,[NS])).rows;
  check(functions.length===Object.keys(FUNCTIONS).length,'CUTOVER_V2_PRIVATE_CONTRACT');
  for(const f of functions){const expected=FUNCTIONS[f.name];check(expected&&f.owned&&f.private&&f.language==='plpgsql'&&f.prosecdef===expected[1]&&f.pronargs===expected[2]&&f.returns===expected[3]
    &&hash(f.source.replace(/\r\n/g,'\n'))===expected[0]&&stable((f.proconfig||[]).map(s=>s.toLowerCase()).sort())===stable(expected[4]?['search_path=pg_catalog','timezone=utc']:['search_path=pg_catalog']),'CUTOVER_V2_PRIVATE_CONTRACT');}
  const shapes=await privateShapes(c);
  check(stable(shapes.tables)===stable(PRIVATE_TABLE_SHA)&&stable(shapes.sequences)===stable(PRIVATE_SEQUENCE_SHA),'CUTOVER_V2_PRIVATE_CONTRACT');
  healthy(c);
}

async function privateShapes(c) {
  const rows=(await c.query(`SELECT t.relname::text AS name,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid::regtype::text,'typmod',a.atttypmod,'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,
      'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.conname,'kind',p.contype,'validated',p.convalidated,'definition',pg_get_constraintdef(p.oid,true)) ORDER BY p.conname) FROM pg_constraint p WHERE p.conrelid=t.oid),'[]'::jsonb) AS constraints,
    coalesce((SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=t.oid),'[]'::jsonb) AS indexes
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relkind='r' ORDER BY t.relname`,[NS])).rows;
  const sequences=(await c.query(`SELECT c.relname::text AS name,s.seqtypid::regtype::text AS type,s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle,
    ARRAY(SELECT a.attname::text FROM pg_depend d JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i') ORDER BY a.attname)::text[] AS owned_columns,
    ARRAY(SELECT t.relname::text FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i') ORDER BY t.relname)::text[] AS owned_tables
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname`,[NS])).rows;
  return {tables:Object.fromEntries(rows.map(r=>[r.name,hash(stable(r))])),sequences:Object.fromEntries(sequences.map(r=>[r.name,hash(stable(r))]))};
}

async function inventorySite(c, site, env) {
  check(['primary','backup'].includes(site),'CUTOVER_V2_SITE');
  const skip = v1.skipTables(env);
  const relations = (await c.query(`SELECT c.oid::text AS oid,c.relname::text AS name,c.relkind::text AS kind,c.relpersistence::text AS persistence,
    EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS inherited,
    ARRAY(SELECT a.attname::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord)::text[] AS key_columns,
    ARRAY(SELECT a.atttypid::regtype::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord)::text[] AS key_types,
    coalesce((SELECT bool_and(p.convalidated) FROM pg_constraint p WHERE p.conrelid=c.oid),true) AS constraints_valid,
    coalesce((SELECT bool_and(i.indisvalid AND i.indisready) FROM pg_index i WHERE i.indrelid=c.oid),true) AS indexes_valid,
    (SELECT count(*)::int FROM pg_rewrite w WHERE w.ev_class=c.oid AND w.ev_type<>'1') AS write_rewrite_rules,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid::regtype::text,'typmod',a.atttypmod,'not_null',a.attnotnull,
      'generated',a.attgenerated,'identity',a.attidentity,'default_sha256',CASE WHEN d.adbin IS NOT NULL THEN encode(sha256(convert_to(pg_get_expr(d.adbin,d.adrelid),'UTF8')),'hex') END) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns,
    encode(sha256(convert_to(coalesce((SELECT string_agg(pg_get_constraintdef(p.oid,true),E'\\n' ORDER BY p.conname) FROM pg_constraint p WHERE p.conrelid=c.oid),''),'UTF8')),'hex') AS constraints_sha256,
    encode(sha256(convert_to(coalesce((SELECT string_agg(jsonb_build_array(pg_get_triggerdef(t.oid,true),t.tgenabled,t.tgtype,p.proowner::text,p.prosecdef,p.proconfig,
      encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))::text,E'\\n' ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=c.oid AND NOT t.tgisinternal AND t.tgname<>ALL($1::text[])),''),'UTF8')),'hex') AS triggers_sha256,
    c.reltuples::text AS estimated_rows,pg_total_relation_size(c.oid)::text AS relation_bytes,
    CASE WHEN c.relkind='v' THEN encode(sha256(convert_to(pg_get_viewdef(c.oid,true),'UTF8')),'hex') END AS view_sha256,
    CASE WHEN c.relkind='v' THEN pg_relation_is_updatable(c.oid,true) END AS view_updatable_mask,
    coalesce((SELECT jsonb_agg(d ORDER BY d.schema,d.name) FROM (SELECT DISTINCT dn.nspname::text AS schema,dc.relname::text AS name,dc.relkind::text AS kind
      FROM pg_rewrite rw JOIN pg_depend dp ON dp.classid='pg_rewrite'::regclass AND dp.objid=rw.oid AND dp.refclassid='pg_class'::regclass
      JOIN pg_class dc ON dc.oid=dp.refobjid JOIN pg_namespace dn ON dn.oid=dc.relnamespace WHERE rw.ev_class=c.oid AND dc.oid<>c.oid) d),'[]'::jsonb) AS dependencies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname`,[[CAPTURE_TRIGGER,FENCE_TRIGGER]])).rows;
  const tables = [], derived = [], held = [];
  for (const r of relations.filter(r=>!skip.includes(r.name))) {
    const entry = {...r};
    entry.catalog_sha256 = hash(stable({oid:r.oid,name:r.name,kind:r.kind,persistence:r.persistence,inherited:r.inherited,
      key_columns:r.key_columns,key_types:r.key_types,columns:r.columns,constraints_sha256:r.constraints_sha256,triggers_sha256:r.triggers_sha256,write_rewrite_rules:r.write_rewrite_rules,view_sha256:r.view_sha256,dependencies:r.dependencies}));
    if (r.kind==='v' && r.view_updatable_mask===0 && r.write_rewrite_rules===0 && r.dependencies.every(d=>d.schema==='public'&&d.kind==='r'&&!skip.includes(d.name))) { derived.push(entry); continue; }
    const valid = r.kind==='r' && r.persistence==='p' && !r.inherited && r.constraints_valid && r.indexes_valid && r.write_rewrite_rules===0
      && Array.isArray(r.key_columns) && Array.isArray(r.key_types) && r.key_columns.length===r.key_types.length
      && r.key_types.every(t=>KEY_TYPES.has(t))
      && r.key_columns.every(k=>r.columns.some(c=>c.name===k && c.not_null));
    if (!valid) { held.push({name:r.name,reason:'UNSUPPORTED_RELATION_OR_IDENTITY',catalog_sha256:entry.catalog_sha256}); continue; }
    entry.mode = V1_TABLES.includes(r.name) ? 'v1_external' : (r.key_columns.length ? 'pk_digest' : 'row_multiset');
    tables.push(entry);
  }
  healthy(c);
  return {site,project_ref:site==='primary'?v1.PRIMARY:v1.BACKUP,tables,derived,held,excluded:relations.filter(r=>skip.includes(r.name)).map(r=>r.name)};
}

function createPlan(primary, backup, env={}) {
  const p = new Map(primary.tables.map(t=>[t.name,t])), b = new Map(backup.tables.map(t=>[t.name,t]));
  const descriptor = {operation:'current_state_cutover_v2',flags:{light:env.SUPABASE_REPLICATION_LIGHT==='1',skip:v1.skipTables(env),
    storage_enabled:env.SUPABASE_REPLICATION_STORAGE!=='0' && env.SUPABASE_REPLICATION_LIGHT!=='1'},sites:{primary,backup},
    exceptions:{source_only:[...p.keys()].filter(n=>!b.has(n)),target_only:[...b.keys()].filter(n=>!p.has(n)),
      shared_column_drift:[...p.keys()].filter(n=>b.has(n)&&stable(p.get(n).columns)!==stable(b.get(n).columns)),
      no_pk:primary.tables.filter(t=>t.mode==='row_multiset').map(t=>t.name)}};
  return {descriptor,manifest_sha256:hash(stable(descriptor)),readiness:{cutover_ready:false,capacity_proven:false,
    fence_coverage_proven:false,old_process_stopped_proven:false,combined_v1_repair_contract_proven:false,historic_ram_recovered:false}};
}

async function prepare({primary,backup,env={}}) {
  watch(primary); watch(backup); healthy(primary); healthy(backup);
  const sites = [];
  for (const [c,site] of [[primary,'primary'],[backup,'backup']]) {
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await c.query("SET LOCAL statement_timeout='15s'"); await c.query("SET LOCAL lock_timeout='2s'");
      await c.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
      sites.push(await inventorySite(c,site,env)); healthy(c); await c.query('ROLLBACK');
    } catch(e) { try { await c.query('ROLLBACK'); } catch {} healthy(c); throw e; }
  }
  return createPlan(sites[0],sites[1],env);
}

function validatePlan(plan) {
  check(plan && hash(stable(plan.descriptor))===plan.manifest_sha256,'CUTOVER_V2_MANIFEST_CHANGED');
  check(plan.descriptor.operation==='current_state_cutover_v2','CUTOVER_V2_MANIFEST_CHANGED');
  for (const site of ['primary','backup']) {
    const s = plan.descriptor.sites[site];
    check(s.site===site && s.project_ref===(site==='primary'?v1.PRIMARY:v1.BACKUP),'CUTOVER_V2_PROJECT_PAIR');
    check(s.held.length===0,'CUTOVER_V2_UNSUPPORTED_UNIVERSE');
  }
  return plan;
}

function material(secret,keyId) {
  check(UUID.test(keyId||''),'CUTOVER_V2_KEY_ID');
  check(typeof secret==='string' && Buffer.from(secret,'base64').length===32 && Buffer.from(secret,'base64').toString('base64')===secret,'CUTOVER_V2_KEY_UNAVAILABLE');
  return Buffer.from(secret,'base64');
}
function aad(m) {
  return Buffer.from(stable({algorithm:ALG,primary:v1.PRIMARY,backup:v1.BACKUP,run_id:m.run_id,capture_id:m.capture_id,
    site:m.site,phase:m.phase,manifest_sha256:m.manifest_sha256,fence_epoch:m.fence_epoch||null,key_id:m.key_id,stream:m.stream,part:m.part,rows:m.rows}));
}
function encrypt(raw,m,secret) {
  const input=material(secret,m.key_id),salt=crypto.randomBytes(32),nonce=crypto.randomBytes(12); let key;
  try {
    key=Buffer.from(crypto.hkdfSync('sha256',input,salt,Buffer.from('vpt/cutover/20261015/v2'),32));
    const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce); cipher.setAAD(aad(m));
    const ciphertext=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
    return {...m,algorithm:ALG,salt,nonce,tag:cipher.getAuthTag(),ciphertext,ciphertext_sha256:hash(ciphertext)};
  } finally { input.fill(0); key?.fill(0); }
}
function decrypt(r,secret) {
  check(r.algorithm===ALG && hash(Buffer.from(r.ciphertext))===r.ciphertext_sha256,'CUTOVER_V2_ARTIFACT_DIGEST');
  const input=material(secret,r.key_id); let key;
  try {
    key=Buffer.from(crypto.hkdfSync('sha256',input,Buffer.from(r.salt),Buffer.from('vpt/cutover/20261015/v2'),32));
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(r.nonce)); decipher.setAAD(aad(r)); decipher.setAuthTag(Buffer.from(r.tag));
    return Buffer.concat([decipher.update(Buffer.from(r.ciphertext)),decipher.final()]).toString('utf8');
  } catch { fail('CUTOVER_V2_ARTIFACT_DECRYPT'); } finally { input.fill(0); key?.fill(0); }
}

// Caller must own a repeatable-read transaction. No commit or disk write here.
// A same-snapshot sizing scan bounds FETCH memory before plaintext is transferred.
async function streamTable(c, entry, meta, secret, writeChunk) {
  check(entry && /^[a-f0-9]{64}$/.test(entry.catalog_sha256||'') && ['pk_digest','row_multiset','v1_external'].includes(entry.mode),'CUTOVER_V2_TABLE_MANIFEST');
  const tx=(await c.query("SELECT current_setting('transaction_isolation') AS isolation")).rows[0];
  check(['repeatable read','serializable'].includes(tx?.isolation),'CUTOVER_V2_CONSISTENT_TRANSACTION_REQUIRED');
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  const table=quote(entry.name),cursor=quote('cutover_'+crypto.randomUUID().replaceAll('-',''));
  const size=(await c.query(`SELECT count(*)::text AS rows,coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes,
    coalesce(max(octet_length(to_jsonb(t)::text)),0)::text AS max_row_bytes FROM public.${table} t`)).rows[0];
  check(BigInt(size.max_row_bytes)<=BigInt(ROW_BYTES),'CUTOVER_V2_ROW_TOO_LARGE');
  const fetchRows=Math.max(1,Math.min(64,Math.floor(ROW_BYTES/Math.max(1,Number(size.max_row_bytes)))));
  const ordering=entry.key_columns.length ? entry.key_columns.map(quote).join(',') : "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),to_jsonb(t)::text";
  await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS raw FROM public.${table} t ORDER BY ${ordering}`);
  let pending=[],encodedBytes=16,part=0,count=0n; const digest=crypto.createHash('sha256'); const artifacts=[];
  async function flush() {
    const raw=JSON.stringify({raw_rows:pending}); check(Buffer.byteLength(raw)<=CHUNK_BYTES,'CUTOVER_V2_CHUNK_TOO_LARGE');
    const artifact=encrypt(raw,{...meta,stream:'table:'+entry.name,part,rows:pending.length},secret);
    healthy(c); await writeChunk(artifact);
    artifacts.push({stream:artifact.stream,part,rows:pending.length,ciphertext_sha256:artifact.ciphertext_sha256});
    part++; pending=[]; encodedBytes=16;
  }
  try {
    for (;;) {
      healthy(c); const rs=(await c.query(`FETCH FORWARD ${fetchRows} FROM ${cursor}`)).rows;
      for (const row of rs) {
        check(typeof row.raw==='string','CUTOVER_V2_RAW_JSON_REQUIRED');
        const bytes=Buffer.byteLength(JSON.stringify(row.raw))+1;
        check(bytes+16<=CHUNK_BYTES,'CUTOVER_V2_ROW_TOO_LARGE');
        if (pending.length && encodedBytes+bytes>CHUNK_BYTES) await flush();
        pending.push(row.raw); encodedBytes+=bytes; digest.update(row.raw+'\n'); count++;
      }
      if (rs.length<fetchRows) break;
    }
    if (pending.length || part===0) await flush();
  } finally { try { await c.query(`CLOSE ${cursor}`); } catch {} }
  check(count===BigInt(size.rows),'CUTOVER_V2_STREAM_ROW_COUNT');
  return {stream:'table:'+entry.name,rows:count.toString(),raw_bytes:size.bytes,parts:part,sha256:digest.digest('hex'),artifacts};
}

function descriptor(meta) {
  check(UUID.test(meta.run_id||'')&&UUID.test(meta.capture_id||'')&&UUID.test(meta.key_id||''),'CUTOVER_V2_CAPTURE_DESCRIPTOR');
  check(['primary','backup'].includes(meta.site)&&['baseline','closing'].includes(meta.phase)&&/^[a-f0-9]{64}$/.test(meta.manifest_sha256||''),'CUTOVER_V2_CAPTURE_DESCRIPTOR');
  if (meta.phase==='closing') check(UUID.test(meta.fence_epoch||''),'CUTOVER_V2_CLOSING_FENCE_REQUIRED');
  check(Array.isArray(meta.streams)&&meta.streams.length>0&&meta.streams.length<=1000&&meta.streams.every(s=>typeof s==='string'&&s.length>0&&s.length<=256&&s!=='manifest')&&new Set(meta.streams).size===meta.streams.length,'CUTOVER_V2_CAPTURE_STREAMS');
  return {run_id:meta.run_id,capture_id:meta.capture_id,site:meta.site,phase:meta.phase,manifest_sha256:meta.manifest_sha256,fence_epoch:meta.fence_epoch||null,key_id:meta.key_id,streams:[...meta.streams].sort()};
}

// Reserved receipt is committed separately by the future reviewed coordinator.
// A committed receipt is inserted in exactly the artifacts' transaction.
async function checkpointState(c,meta) {
  const d=descriptor(meta),sha=hash(stable(d));
  const rs=(await c.query(`SELECT kind,descriptor_sha256,payload FROM ${NS}.receipts WHERE capture_id=$1 ORDER BY kind`,[d.capture_id])).rows;
  const artifacts=await artifactMetadata(c,d.capture_id);
  check(rs.every(r=>r.descriptor_sha256===sha),'CUTOVER_V2_RECEIPT_MISMATCH');
  const reserved=rs.find(r=>r.kind==='reserved'),committed=rs.find(r=>r.kind==='committed');
  check(!artifacts.length || reserved,'CUTOVER_V2_ORPHAN_ARTIFACTS');
  if (committed) {
    check(reserved && artifacts.length===committed.payload.artifact_count && artifacts.length>0,'CUTOVER_V2_COMMITTED_EVIDENCE_LOST');
    const set=artifacts.map(a=>({stream:a.stream,part:a.part,rows:a.rows,key_id:a.key_id,algorithm:a.algorithm,ciphertext_sha256:a.ciphertext_sha256}));
    check(setDigest(set)===committed.payload.artifact_set_sha256,'CUTOVER_V2_ARTIFACT_SET');
    return {state:'committed',descriptor:d,artifacts};
  }
  check(artifacts.length===0,'CUTOVER_V2_INCOMPLETE_ARTIFACTS');
  return {state:reserved?'reserved':'new',descriptor:d,artifacts:[]};
}
async function reserve(c,meta) {
  await privateContract(c);
  const state=await checkpointState(c,meta); if (state.state!=='new') return state;
  await c.query(`INSERT INTO ${NS}.receipts(capture_id,kind,run_id,phase,descriptor_sha256,payload) VALUES($1,'reserved',$2,$3,$4,$5::jsonb)`,
    [meta.capture_id,meta.run_id,meta.phase,hash(stable(state.descriptor)),JSON.stringify(state.descriptor)]);
  return {state:'reserved',descriptor:state.descriptor};
}
async function writeArtifact(c,artifact) {
  healthy(c);
  await c.query(`INSERT INTO ${NS}.artifacts(capture_id,stream,part,rows,key_id,algorithm,salt,nonce,tag,ciphertext,ciphertext_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[artifact.capture_id,artifact.stream,artifact.part,artifact.rows,artifact.key_id,artifact.algorithm,
    artifact.salt,artifact.nonce,artifact.tag,artifact.ciphertext,artifact.ciphertext_sha256]);
}
async function seal(c,meta,secret) {
  await privateContract(c);
  const d=descriptor(meta),sha=hash(stable(d));
  const reserved=(await c.query(`SELECT descriptor_sha256 FROM ${NS}.receipts WHERE capture_id=$1 AND kind='reserved'`,[meta.capture_id])).rows[0];
  check(reserved?.descriptor_sha256===sha,'CUTOVER_V2_RESERVATION_REQUIRED');
  const rs=await artifactMetadata(c,meta.capture_id);
  await authenticateStore(c,d,rs,secret);
  const set=rs.map(a=>({stream:a.stream,part:a.part,rows:a.rows,key_id:a.key_id,algorithm:a.algorithm,ciphertext_sha256:a.ciphertext_sha256}));
  healthy(c);
  await c.query(`INSERT INTO ${NS}.receipts(capture_id,kind,run_id,phase,descriptor_sha256,payload) VALUES($1,'committed',$2,$3,$4,$5::jsonb)`,
    [meta.capture_id,meta.run_id,meta.phase,sha,JSON.stringify({artifact_count:rs.length,artifact_set_sha256:setDigest(set)})]);
}
async function verifyCheckpoint(c,meta,secret) {
  await privateContract(c);
  const state=await checkpointState(c,meta);check(state.state==='committed','CUTOVER_V2_COMMIT_RECEIPT_REQUIRED');
  await authenticateStore(c,state.descriptor,state.artifacts,secret);
  return {verified:true,artifact_count:state.artifacts.length,cutover_ready:false};
}

async function artifactMetadata(c,id) {
  const rs=(await c.query(`SELECT stream,part,rows,key_id,algorithm,ciphertext_sha256 FROM ${NS}.artifacts WHERE capture_id=$1 ORDER BY stream,part LIMIT $2`,[id,MAX_ARTIFACT_PARTS+1])).rows;
  check(rs.length<=MAX_ARTIFACT_PARTS,'CUTOVER_V2_ARTIFACT_BUDGET');return rs;
}
function setDigest(set) {
  const digest=crypto.createHash('sha256');digest.update('[');
  for(let i=0;i<set.length;i++){if(i)digest.update(',');digest.update(stable(set[i]));}
  digest.update(']');return digest.digest('hex');
}
async function authenticateStore(c,d,rs,secret) {
  check(rs.length>0 && rs.every(r=>r.key_id===d.key_id),'CUTOVER_V2_ARTIFACT_KEY');
  async function read(row) {
    healthy(c);
    const actual=(await c.query(`SELECT * FROM ${NS}.artifacts WHERE capture_id=$1 AND stream=$2 AND part=$3`,[d.capture_id,row.stream,row.part])).rows[0];
    check(actual&&actual.ciphertext_sha256===row.ciphertext_sha256,'CUTOVER_V2_ARTIFACT_SET');
    return JSON.parse(decrypt({...d,...actual},secret));
  }
  const root=rs.filter(r=>r.stream==='manifest');
  check(root.length===1&&root[0].part===0,'CUTOVER_V2_MANIFEST_REQUIRED');
  const manifest=await read(root[0]);
  check(stable(manifest.descriptor)===stable(d)&&Array.isArray(manifest.streams),'CUTOVER_V2_MANIFEST_CHANGED');
  check(stable(manifest.streams.map(s=>s.stream).sort())===stable(d.streams)&&root[0].rows===d.streams.length,'CUTOVER_V2_MANIFEST_STREAMS');
  for(const expected of manifest.streams) {
    check(typeof expected.rows==='string'&&/^\d+$/.test(expected.rows)&&Number.isSafeInteger(expected.parts)&&expected.parts>0,'CUTOVER_V2_MANIFEST_STREAMS');
    const chunks=rs.filter(r=>r.stream===expected.stream).sort((a,b)=>a.part-b.part);
    check(chunks.length===expected.parts,'CUTOVER_V2_INCOMPLETE_ARTIFACTS');
    let count=0n;const digest=crypto.createHash('sha256');
    for(let i=0;i<chunks.length;i++) {
      check(chunks[i].part===i,'CUTOVER_V2_INCOMPLETE_ARTIFACTS');
      const payload=await read(chunks[i]);
      check(Array.isArray(payload.raw_rows)&&payload.raw_rows.length===chunks[i].rows&&payload.raw_rows.every(r=>typeof r==='string'),'CUTOVER_V2_ARTIFACT_ROWS');
      for(const raw of payload.raw_rows)digest.update(raw+'\n');count+=BigInt(payload.raw_rows.length);
    }
    check(count===BigInt(expected.rows)&&digest.digest('hex')===expected.sha256,'CUTOVER_V2_STREAM_DIGEST');
  }
  check(rs.length===1+manifest.streams.reduce((n,s)=>n+s.parts,0),'CUTOVER_V2_EXTRA_ARTIFACTS');
}

async function lockClosingFence(c,meta) {
  await privateContract(c);
  check(meta.phase==='closing','CUTOVER_V2_CLOSING_FENCE_REQUIRED');
  const row=(await c.query(`SELECT run_id,active,epoch,deadline>clock_timestamp() AS within_deadline FROM ${NS}.control WHERE singleton FOR SHARE`)).rows[0];
  check(row?.active && row.run_id===meta.run_id && row.epoch===meta.fence_epoch && row.within_deadline,'CUTOVER_V2_CLOSING_FENCE_REQUIRED');
  // Caller retains this transaction's lock through artifact+receipt COMMIT.
}

async function main() {
  const args=process.argv.slice(2);check(args.length===0 || (args.length===2 && args[0]==='--plan-output'),'CUTOVER_V2_PREPARATION_ONLY');
  require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
  const {Client}=require('pg');
  const primary=new Client({connectionString:v1.validateUrl(process.env.SUPABASE_DB_URL||process.env.SUPABASE_DB_DIRECT_URL,v1.PRIMARY),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  const backup=new Client({connectionString:v1.validateUrl(process.env.SUPABASE_BACKUP_DB_URL||process.env.SUPABASE_BACKUP_DB_DIRECT_URL,v1.BACKUP),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  watch(primary);watch(backup);
  try {
    await primary.connect();await backup.connect();const plan=await prepare({primary,backup,env:process.env});
    if(args.length) require('node:fs').writeFileSync(args[1],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({ok:true,mode:'preparation_plan',manifest_sha256:plan.manifest_sha256,counts:Object.fromEntries(Object.entries(plan.descriptor.sites).map(([s,v])=>[s,{base:v.tables.length,held:v.held.length,derived:v.derived.length}])),...plan.readiness}));
  } finally {await Promise.allSettled([primary.end(),backup.end()]);}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({ok:false,reason:safeCode(e)}));process.exitCode=1;});
module.exports={NS,ALG,V1_TABLES,CAPTURE_TRIGGER,FENCE_TRIGGER,prepare,createPlan,validatePlan,inventorySite,streamTable,encrypt,decrypt,
  checkpointState,reserve,writeArtifact,seal,verifyCheckpoint,lockClosingFence,descriptor,privateContract,privateShapes,FUNCTIONS,hash,stable,safeCode};
