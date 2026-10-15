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
const ALGORITHM = 'aes-256-gcm/hkdf-sha256/dedicated_key_v2';
const LEGACY_ALGORITHM = 'aes-256-gcm/hkdf-sha256/jwt_secret_v1';
const STORE = 'vpt_recovery_20261015.identity_repair_snapshots';
const JOURNAL_NS='vpt_cutover_20261015',JOURNAL_OP='current_state_cutover_v1';
const JOURNAL_CAPTURE='vpt_cutover_identity_20261015',JOURNAL_TRUNCATE='vpt_cutover_truncate_20261015';
// Frozen reviewed trigger function; normalize CRLF only, never arbitrary SQL.
const JOURNAL_BODY_SHA256='8c9db9d44ac94d5c1b31b5601b7df78cfb4d8dde0f5b2b1a3c2c984b022777eb';
const JOURNAL_TABLES=Object.freeze(['crm_leads','project_substage_status','users','departments','trash_items']);
// OID-independent catalog fingerprints from the two applied private snapshot
// migrations and the frozen cutover migration. No runtime-discovered baseline.
// PostgreSQL 18 adds contype='n' rows; attnotnull is pinned in every version,
// so omit only those redundant rows to retain the PostgreSQL 17 contract.
const PRIVATE_TABLE_SHA256=Object.freeze({
  'vpt_recovery_20261015.identity_repair_snapshots':'175c945b272b12c01ff276b893d7d5eaecbe695fed9a60c5a99fdcb24a09c1f4',
  'vpt_cutover_20261015.artifacts':'a29d671e372d550b7314f206b3168ae33a26fe5f01b5b4f3d828ff669b4d6337',
  'vpt_cutover_20261015.events':'faf8a8ae4fd16d677a7f4c1940607ed68a5ccad52509ea73fdf4a039440ad784',
  'vpt_cutover_20261015.registrations':'4e7b1544f8031b9f4486de0645233a798b730718503137e28ddd1a962dd708d1',
  'vpt_cutover_20261015.runs':'0c9d9a038e0b07ea31b51dd1381292b5c6e581c4ddebf20316a15996e915bc31',
});
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
function aad(id,algorithm,keyId) {
  const parts=[OPERATION,PRIMARY,BACKUP,id,algorithm];
  if(algorithm===ALGORITHM) parts.push(keyId);
  return Buffer.from(parts.join('|'));
}
function keyVersion(keyId) {
  check(typeof keyId==='string' && UUID.test(keyId),'RECOVERY_KEY_ID_REQUIRED');
  return keyId.toLowerCase();
}
function derive(secret,salt,keyId) {
  check(typeof secret==='string' && /^[A-Za-z0-9+/]{43}=$/.test(secret),'RECOVERY_KEY_UNAVAILABLE');
  const raw=Buffer.from(secret,'base64');
  try {
    check(raw.length===32 && raw.toString('base64')===secret,'RECOVERY_KEY_UNAVAILABLE');
    return Buffer.from(crypto.hkdfSync('sha256',raw,salt,
      Buffer.from('vpt/backup/20261015/identity-rollback/dedicated/v2/'+keyVersion(keyId)),32));
  } finally {raw.fill(0);}
}
function deriveLegacy(secret,salt) {
  check(typeof secret==='string' && Buffer.byteLength(secret)>=32,'RECOVERY_LEGACY_KEY_UNAVAILABLE');
  return Buffer.from(crypto.hkdfSync('sha256',Buffer.from(secret),salt,Buffer.from('vpt/backup/20261015/identity-rollback/v1'),32));
}
function encrypt(payload,secret,id,keyId) {
  keyId=keyVersion(keyId);
  const salt=crypto.randomBytes(32),nonce=crypto.randomBytes(12),key=derive(secret,salt,keyId);
  try {
    const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce); cipher.setAAD(aad(id,ALGORITHM,keyId));
    const ciphertext=Buffer.concat([cipher.update(stable(payload),'utf8'),cipher.final()]);
    return {salt,nonce,auth_tag:cipher.getAuthTag(),ciphertext,
      ciphertext_sha256:crypto.createHash('sha256').update(ciphertext).digest('hex')};
  } finally { key.fill(0); }
}
function decrypt(row,secret,keyId,legacySecret) {
  check(row.operation===OPERATION && row.source_project===PRIMARY && row.backup_project===BACKUP &&
    [ALGORITHM,LEGACY_ALGORITHM].includes(row.algorithm),'RECOVERY_SNAPSHOT_SCOPE');
  const ciphertext=Buffer.from(row.ciphertext);
  check(crypto.createHash('sha256').update(ciphertext).digest('hex')===row.ciphertext_sha256,'RECOVERY_SNAPSHOT_DIGEST');
  const legacy=row.algorithm===LEGACY_ALGORITHM;
  if(legacy) check(row.key_id==null,'RECOVERY_SNAPSHOT_SCOPE');
  else check(row.key_id===keyVersion(keyId),'RECOVERY_KEY_ID_MISMATCH');
  const key=legacy?deriveLegacy(legacySecret,Buffer.from(row.salt)):derive(secret,Buffer.from(row.salt),row.key_id);
  try {
    const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.nonce));
    cipher.setAAD(aad(row.id,row.algorithm,row.key_id)); cipher.setAuthTag(Buffer.from(row.auth_tag));
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
async function rewriteRules(client,relation) {
  return (await client.query(`SELECT rulename::text,ev_type::text,is_instead,pg_get_ruledef(oid,true) AS definition
    FROM pg_rewrite WHERE ev_class=$1::regclass ORDER BY rulename`,[relation])).rows;
}
async function privateTableCatalogs(client,namespace) {
  return (await client.query(`SELECT c.relname::text AS table_name,jsonb_build_object(
    'kind',c.relkind::text,'persistence',c.relpersistence::text,
    'columns',coalesce((SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname::text,
      'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated::text,'identity',a.attidentity::text,
      'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation<>0 THEN cn.nspname||'.'||co.collname END,
      'only_builtin_default',NOT EXISTS(SELECT 1 FROM pg_depend dep WHERE dep.classid='pg_attrdef'::regclass AND dep.objid=d.oid
        AND dep.refclassid='pg_proc'::regclass AND dep.refobjid<>'pg_catalog.clock_timestamp()'::regprocedure)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
    'constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('name',con.conname::text,'type',con.contype::text,
      'validated',con.convalidated,'definition',pg_get_constraintdef(con.oid,true)) ORDER BY con.conname)
      FROM pg_constraint con WHERE con.conrelid=c.oid AND con.contype<>'n'),'[]'::jsonb),
    'indexes',coalesce((SELECT jsonb_agg(jsonb_build_object('name',ic.relname::text,'definition',pg_get_indexdef(i.indexrelid),
      'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'plain',i.indexprs IS NULL AND i.indpred IS NULL) ORDER BY ic.relname)
      FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),'[]'::jsonb)) AS catalog
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind IN('r','p','f','v','m') ORDER BY c.relname`,[namespace])).rows;
}
async function assertPrivateTableCatalogs(client,namespace) {
  const rows=await privateTableCatalogs(client,namespace);
  const expected=Object.keys(PRIVATE_TABLE_SHA256).filter(k=>k.startsWith(namespace+'.'));
  check(rows.length===expected.length && rows.every(r=>fingerprint(r.catalog)===PRIVATE_TABLE_SHA256[namespace+'.'+r.table_name]),
    'RECOVERY_PRIVATE_CATALOG_CHANGED');
  return rows;
}
async function journalPrivateStore(client) {
  const rows=(await client.query(`SELECT n.nspowner=r.oid AND r.rolname='postgres' AS owned,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) AS schema_private,
    count(t.oid)::int AS tables,bool_and(t.relname=ANY($2::text[]) AND t.relowner=r.oid AND t.relrowsecurity AND t.relforcerowsecurity AND t.relpersistence='p') AS protected,
    bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner)) AS table_private,
    bool_and(NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname IN('anon','authenticated','service_role','authenticator') AND
      (has_schema_privilege(p.oid,n.oid,'USAGE') OR has_table_privilege(p.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))) AS app_denied,
    n.nspacl::text AS schema_acl,jsonb_agg(jsonb_build_object('name',t.relname,'acl',t.relacl::text,'rls',t.relrowsecurity,'force',t.relforcerowsecurity) ORDER BY t.relname) AS table_acls
    FROM pg_namespace n JOIN pg_roles r ON r.rolname=current_user JOIN pg_class t ON t.relnamespace=n.oid AND t.relkind='r'
    WHERE n.nspname=$1 GROUP BY n.oid,r.oid,r.rolname`,[JOURNAL_NS,['runs','registrations','events','artifacts']])).rows;
  check(rows.length===1 && rows[0].tables===4 && ['owned','schema_private','protected','table_private','app_denied'].every(k=>rows[0][k]===true),'RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  const catalogs=await assertPrivateTableCatalogs(client,JOURNAL_NS);
  const rules=(await client.query(`SELECT c.relname::text AS table_name,r.rulename::text,r.ev_type::text,r.is_instead,pg_get_ruledef(r.oid,true) AS definition
    FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 ORDER BY c.relname,r.rulename`,[JOURNAL_NS])).rows;
  const triggers=(await client.query(`SELECT c.relname::text AS table_name,t.tgname::text,pg_get_triggerdef(t.oid,true) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,[JOURNAL_NS])).rows;
  check(rules.length===0 && triggers.length===0,'RECOVERY_JOURNAL_PRIVATE_HOOK_CHANGED');
  const policies=(await client.query(`SELECT t.relname::text AS table_name,p.polname::text AS name,p.polpermissive,p.polcmd::text AS command,
    p.polroles=ARRAY[r.oid]::oid[] AS owner_role,pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_namespace n JOIN pg_class t ON t.relnamespace=n.oid AND t.relkind='r'
    JOIN pg_policy p ON p.polrelid=t.oid JOIN pg_roles r ON r.rolname=current_user
    WHERE n.nspname=$1 ORDER BY t.relname,p.polname`,[JOURNAL_NS])).rows;
  check(policies.length===4 && new Set(policies.map(p=>p.table_name)).size===4 &&
    policies.every(p=>p.name==='owner_only' && p.polpermissive && p.command==='*' && p.owner_role && p.using_expr==='true' && p.check_expr==='true'),
    'RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  const sequences=(await client.query(`SELECT count(*)::int AS n,bool_and(s.relname='events_id_seq' AND s.relowner=r.oid AND s.relpersistence='p' AND
    q.seqtypid='bigint'::regtype AND q.seqstart=1 AND q.seqincrement=1 AND q.seqmin=1 AND q.seqmax=9223372036854775807 AND q.seqcache=1 AND NOT q.seqcycle AND
    s.oid=to_regclass(pg_get_serial_sequence($2,'id')) AND
    (SELECT count(*) FROM pg_depend dep WHERE dep.classid='pg_class'::regclass AND dep.objid=s.oid AND dep.refclassid='pg_class'::regclass AND dep.deptype IN('a','i'))=1 AND
    EXISTS(SELECT 1 FROM pg_depend dep JOIN pg_attribute a ON a.attrelid=dep.refobjid AND a.attnum=dep.refobjsubid
      WHERE dep.classid='pg_class'::regclass AND dep.objid=s.oid AND dep.refclassid='pg_class'::regclass AND dep.deptype='i' AND dep.refobjid=$2::regclass AND a.attname='id') AND
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(s.relacl,acldefault('S',s.relowner))) a WHERE a.grantee<>s.relowner) AND
    NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname IN('anon','authenticated','service_role','authenticator') AND has_sequence_privilege(p.oid,s.oid,'USAGE,SELECT,UPDATE'))) AS private,
    jsonb_agg(jsonb_build_object('name',s.relname,'acl',s.relacl::text,'start',q.seqstart::text,'increment',q.seqincrement::text,
      'min',q.seqmin::text,'max',q.seqmax::text,'cache',q.seqcache::text,'cycle',q.seqcycle,'owned_identity',true) ORDER BY s.relname) AS acls
    FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace JOIN pg_sequence q ON q.seqrelid=s.oid
    JOIN pg_roles r ON r.rolname=current_user WHERE n.nspname=$1 AND s.relkind='S'`,[JOURNAL_NS,JOURNAL_NS+'.events'])).rows[0];
  check(sequences?.n===1 && sequences.private===true,'RECOVERY_JOURNAL_PRIVATE_REQUIRED');
  return {schema_acl:rows[0].schema_acl,table_acls:rows[0].table_acls,catalogs,rules,triggers,policies,sequence_acls:sequences.acls};
}
function sortedStrings(value) {
  return Array.isArray(value) && value.every(v=>typeof v==='string') && new Set(value).size===value.length && same(value,[...value].sort());
}
async function journalContract(client,table,site,catalog,triggers) {
  const installed=(await client.query('SELECT to_regnamespace($1) IS NOT NULL AS present',[JOURNAL_NS])).rows[0]?.present;
  if(!installed) {check(triggers.length===0,'RECOVERY_TRIGGER_CHANGED');return null;}
  const privateAcl=await journalPrivateStore(client);
  const registrations=(await client.query(`SELECT r.id::text AS run_id,r.operation,r.site,r.definition,r.definition_sha256,
    g.table_name,g.table_oid::text AS table_oid,g.pk_columns::text[],g.catalog_sha256
    FROM ${JOURNAL_NS}.registrations g JOIN ${JOURNAL_NS}.runs r ON r.id=g.run_id
    WHERE g.table_name=$1 FOR SHARE OF g,r`,[table])).rows;
  if(!triggers.length) {check(registrations.length===0,'RECOVERY_JOURNAL_TRIGGER_MISSING');return null;}
  check(triggers.length===2 && triggers.every(t=>[JOURNAL_CAPTURE,JOURNAL_TRUNCATE].includes(t.tgname)),'RECOVERY_TRIGGER_CHANGED');
  const functions=(await client.query(`SELECT p.oid::text AS oid,p.prosecdef,p.proowner=r.oid AND r.rolname='postgres' AS owned,
    p.proconfig::text[],pg_get_functiondef(p.oid) AS definition,p.prosrc AS source,
    p.prorettype='trigger'::regtype AND p.pronargs=0 AND l.lanname='plpgsql' AND p.prokind='f' AND p.provolatile='v' AND
      p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND NOT p.proretset AS correct_type,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS private,
    p.proacl::text AS acl
    FROM pg_proc p JOIN pg_roles r ON r.rolname=current_user JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure($1)`,[JOURNAL_NS+'.capture_identity_change()'])).rows;
  const fn=functions[0],settings=fn?.proconfig;
  check(functions.length===1 && fn.owned && fn.prosecdef && fn.private && fn.correct_type && Array.isArray(settings) &&
    same(settings.map(s=>s.toLowerCase()).sort(),['search_path=pg_catalog','timezone=utc']) &&
    crypto.createHash('sha256').update(String(fn.source).replace(/\r\n/g,'\n')).digest('hex')===JOURNAL_BODY_SHA256,'RECOVERY_JOURNAL_FUNCTION_CHANGED');
  for(const trigger of triggers) check(trigger.tgenabled==='A' && trigger.function_oid===fn.oid && trigger.tgnargs===0 && trigger.args_empty && trigger.no_when &&
    trigger.unconstrained && !trigger.tgdeferrable && !trigger.tginitdeferred && trigger.no_transition_tables &&
    trigger.tgtype===(trigger.tgname===JOURNAL_CAPTURE?29:34),'RECOVERY_JOURNAL_TRIGGER_CHANGED');
  check(registrations.length===1,'RECOVERY_JOURNAL_REGISTRATION_CHANGED');
  const registration=registrations[0],d=registration.definition;
  const relation=(await client.query("SELECT oid::text AS oid,relkind='r' AND relpersistence='p' AS permanent_table FROM pg_class WHERE oid=$1::regclass",['public.'+table])).rows[0];
  const registeredCatalog={columns:catalog.columns.map(c=>({name:c.attname,type:c.type,atttypmod:c.atttypmod,attnotnull:c.attnotnull,attgenerated:c.attgenerated,attidentity:c.attidentity})),
    constraints:catalog.constraints,triggers:[],pk:['id']};
  const definitionSha=crypto.createHash('sha256').update(fn.definition).digest('hex');
  check(UUID.test(registration.run_id) && registration.operation===JOURNAL_OP && registration.site===site &&
    d?.operation===JOURNAL_OP && same(Object.keys(d).sort(),['capture_body_sha256','capture_function_sha256','eligible','operation','project_ref','site','skip','tables']) &&
    d.site===site && d.project_ref===(site==='primary'?PRIMARY:BACKUP) &&
    sortedStrings(d.tables) && ['users','departments'].every(t=>d.tables.includes(t)) && d.tables.every(t=>JOURNAL_TABLES.includes(t)) &&
    sortedStrings(d.eligible) && sortedStrings(d.skip) && d.tables.every(t=>d.eligible.includes(t)) && d.eligible.every(t=>!d.skip.includes(t)) &&
    d.capture_body_sha256===JOURNAL_BODY_SHA256 && d.capture_function_sha256===definitionSha && fingerprint(d)===registration.definition_sha256 &&
    relation.permanent_table && registration.table_oid===relation.oid && same(registration.pk_columns,['id']) && registration.catalog_sha256===fingerprint(registeredCatalog),
    'RECOVERY_JOURNAL_REGISTRATION_CHANGED');
  return {registration,private_acl:privateAcl,function:{oid:fn.oid,acl:fn.acl,body_sha256:JOURNAL_BODY_SHA256,definition_sha256:definitionSha,settings},triggers};
}
async function tableCatalog(client,table,site) {
  const rules=await rewriteRules(client,'public.'+table);
  check(rules.every(r=>r.ev_type==='1'),'RECOVERY_PUBLIC_RULE_CHANGED');
  const columns=(await client.query(`SELECT a.attname,a.atttypid::regtype::text AS type,a.atttypmod,a.attnotnull,
    a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS default_expr
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, ['public.'+table])).rows;
  check(columns.length && columns.every(c=>!c.attgenerated && !c.attidentity),'RECOVERY_SCHEMA_UNSUPPORTED');
  const constraints=(await client.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid,true) AS definition
    FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, ['public.'+table])).rows;
  const triggers=(await client.query(`SELECT tgname::text,tgenabled::text,tgtype,tgfoid::text AS function_oid,tgnargs,
    octet_length(tgargs)=0 AS args_empty,tgqual IS NULL AS no_when,tgconstraint=0 AS unconstrained,
    tgdeferrable,tginitdeferred,(tgoldtable IS NULL AND tgnewtable IS NULL) AS no_transition_tables,
    pg_get_triggerdef(oid,true) AS definition FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname`, ['public.'+table])).rows;
  check(constraints.every(c=>c.convalidated),'RECOVERY_CONSTRAINT_UNVALIDATED');
  const required=table==='users'?['PRIMARY KEY (id)','UNIQUE (email)']:['PRIMARY KEY (id)','UNIQUE (slug)'];
  check(required.every(def=>constraints.some(c=>c.convalidated && c.definition===def)),'RECOVERY_KNOWN_CONSTRAINT_MISSING');
  const requiredTypes=table==='users'
    ? {id:'uuid',email:'character varying',password:'character varying',company_id:'uuid',tenant_id:'uuid',department_id:'uuid',salary:'numeric'}
    : {id:'uuid',slug:'character varying',manager_id:'uuid',parent_id:'uuid',company_id:'uuid',division_unit_id:'uuid'};
  check(Object.entries(requiredTypes).every(([name,type])=>columns.some(c=>c.attname===name && c.type===type)),'RECOVERY_KNOWN_TYPE_CHANGED');
  const value={columns,constraints,rules},journal=await journalContract(client,table,site,value,triggers);
  return {...value,...(journal?{journal}:{})};
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
  const version=(await client.query(`SELECT a.atttypid='uuid'::regtype AS uuid_key_id FROM pg_attribute a
    WHERE a.attrelid=$1::regclass AND a.attname='key_id' AND NOT a.attisdropped`,[STORE])).rows;
  check(version.length===1 && version[0].uuid_key_id===true,'RECOVERY_KEY_SCHEMA_REQUIRED');
  check((await rewriteRules(client,STORE)).length===0 && (await client.query(
    'SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal',[STORE])).rows.length===0,'RECOVERY_PRIVATE_STORE_HOOK_CHANGED');
  return assertPrivateTableCatalogs(client,'vpt_recovery_20261015');
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
    const source=await tableCatalog(primary,table,'primary'),target=await tableCatalog(backup,table,'backup');
    const sourcePublic={columns:source.columns,constraints:source.constraints,rules:source.rules},targetPublic={columns:target.columns,constraints:target.constraints,rules:target.rules};
    check(same(sourcePublic,targetPublic),'RECOVERY_SCHEMA_CHANGED');
    check(!!source.journal===!!target.journal,'RECOVERY_JOURNAL_PAIR_INCOMPLETE');
    catalog[table]={...targetPublic,...(source.journal?{journal:{primary:source.journal,backup:target.journal}}:{})};
  }
  const journals=Object.values(catalog).flatMap(c=>c.journal?[c.journal.primary,c.journal.backup]:[]);
  check(!journals.length || (journals.length===4 && new Set(journals.map(j=>j.registration.run_id)).size===1 &&
    journals.every(j=>same(j.registration.definition.tables,journals[0].registration.definition.tables))),'RECOVERY_JOURNAL_PAIR_INCOMPLETE');
  await parentsExist(backup,'departments',department); await parentsExist(backup,'users',canonical);
  return {operation:OPERATION,scope:SCOPE,source:{alias,canonical,department},before:{alias:backupAlias,canonical:null,department:null},catalog,
    inbound:await inboundCounts(backup)};
}
async function saveSnapshot(backup,payload,secret,id,keyId,healthy) {
  await assertPrivateStore(backup);
  const e=encrypt(payload,secret,id,keyId);
  healthy();
  await backup.query(`INSERT INTO ${STORE}(id,operation,source_project,backup_project,algorithm,key_id,salt,nonce,auth_tag,ciphertext,ciphertext_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,OPERATION,PRIMARY,BACKUP,ALGORITHM,keyId,e.salt,e.nonce,e.auth_tag,e.ciphertext,e.ciphertext_sha256]);
  const saved=(await backup.query(`SELECT * FROM ${STORE} WHERE id=$1`,[id])).rows[0];
  check(saved && same(decrypt(saved,secret,keyId),payload),'RECOVERY_SNAPSHOT_READBACK');
  return e.ciphertext_sha256;
}
async function loadSnapshot(backup,secret,id,keyId,legacySecret) {
  await assertPrivateStore(backup);
  const saved=(await backup.query(`SELECT * FROM ${STORE} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  check(saved && !saved.applied_at,'RECOVERY_SNAPSHOT_MISSING_OR_APPLIED');
  return {payload:decrypt(saved,secret,keyId,legacySecret),sha:saved.ciphertext_sha256,keyId:saved.key_id,algorithm:saved.algorithm};
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
async function assertRepairJournal(backup,payload,runId,beforeDigest) {
  const actual=(await backup.query(`SELECT run_id::text,table_name,operation,old_key,new_key,old_digest,new_digest,touched_columns::text[]
    FROM ${JOURNAL_NS}.events WHERE transaction_id=txid_current() ORDER BY id`)).rows;
  if(beforeDigest===undefined) {
    check(actual.length===0,'RECOVERY_JOURNAL_TRANSACTION_NOT_EMPTY');
    return (await backup.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest
      FROM public.users t WHERE id=$1`,[SCOPE.alias])).rows[0]?.digest;
  }
  const writes=[{table:'users',operation:'UPDATE',before:payload.before.alias,after:{...payload.before.alias,email:payload.source.alias.email},touched:['email']},
    {table:'departments',operation:'INSERT',before:null,after:payload.source.department,touched:Object.keys(payload.source.department).sort()},
    {table:'users',operation:'INSERT',before:null,after:payload.source.canonical,touched:Object.keys(payload.source.canonical).sort()}];
  // Hash actual typed PG rows, including numeric scale and timestamp precision.
  // Full-row postchecks already bound their values to the reviewed source.
  const digests=(await backup.query(`SELECT 0 AS position,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM public.users t WHERE id=$1
    UNION ALL SELECT 1,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM public.departments t WHERE id=$2
    UNION ALL SELECT 2,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM public.users t WHERE id=$3 ORDER BY position`,
    [SCOPE.alias,SCOPE.department,SCOPE.canonical])).rows;
  check(typeof beforeDigest==='string' && digests.length===3,'RECOVERY_JOURNAL_REPAIR_NOT_CONFIRMED');
  const expected=writes.map((w,i)=>({run_id:runId,table_name:w.table,operation:w.operation,old_key:w.before?{id:w.before.id}:null,
    new_key:{id:w.after.id},old_digest:i===0?beforeDigest:null,new_digest:digests[i].digest,touched_columns:w.touched}));
  const ordered=rows=>rows.map(v=>({v,key:fingerprint(v)})).sort((a,b)=>a.key.localeCompare(b.key)).map(x=>x.v);
  check(actual.length===3 && same(ordered(actual),ordered(expected)),'RECOVERY_JOURNAL_REPAIR_NOT_CONFIRMED');
}
async function rollback(client) { try { await client.query('ROLLBACK'); } catch {} }
async function recover({primary,backup,mode='dry-run',secret,keyId,legacySecret,snapshotId}) {
  check(['dry-run','snapshot','apply'].includes(mode),'RECOVERY_MODE_INVALID');
  if(mode==='apply') check(UUID.test(snapshotId||''),'RECOVERY_SNAPSHOT_ID_REQUIRED');
  if(mode==='snapshot' || keyId!=null) keyId=keyVersion(keyId);
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
    const saved=mode==='apply'?await loadSnapshot(backup,secret,id,keyId,legacySecret):null;
    const payload=await capture(primary,backup);
    if(mode!=='dry-run') payload.private_snapshot_catalog=await assertPrivateStore(backup);
    healthy();
    if(mode==='dry-run') {
      await rollback(backup); await rollback(primary);
      return {ok:true,mode,eligible:true,planned:COUNTS,production_rows_changed:0};
    }
    if(mode==='snapshot') {
      const sha=await saveSnapshot(backup,payload,secret,id,keyId,healthy);
      await primary.query('SELECT 1'); healthy();
      await backup.query('COMMIT'); await rollback(primary);
      return {ok:true,mode,snapshot_id:id,key_id:keyId,algorithm:ALGORITHM,ciphertext_sha256:sha,production_rows_changed:0,private_snapshot_created:1};
    }
    check(same(payload,saved.payload),'RECOVERY_SNAPSHOT_STATE_CHANGED');
    const journalRun=payload.catalog.users.journal?.backup.registration.run_id;
    const journalBefore=journalRun?await assertRepairJournal(backup,payload,journalRun):undefined;
    await writeRepair(backup,payload,healthy);
    if(journalRun) await assertRepairJournal(backup,payload,journalRun,journalBefore);
    healthy();
    const marked=await backup.query(`UPDATE ${STORE} SET applied_at=clock_timestamp(),result=$1::jsonb WHERE id=$2 AND applied_at IS NULL RETURNING id`,[JSON.stringify(COUNTS),id]);
    check(marked.rows.length===1,'RECOVERY_SNAPSHOT_MARK_NOT_CONFIRMED');
    // Source row locks remain held through successful backup COMMIT.
    // Refresh the source transaction before the final health check, so an
    // idle-timeout/network failure cannot silently release its FOR SHARE locks.
    await primary.query('SELECT 1'); healthy();
    await backup.query('COMMIT'); await rollback(primary);
    return {ok:true,mode,snapshot_id:id,key_id:saved.keyId,algorithm:saved.algorithm,ciphertext_sha256:saved.sha,committed:COUNTS,failover_ready:false};
  } catch(e) { await rollback(backup); await rollback(primary); healthy(); throw e; }
}
function parseArgs(args) {
  let mode='dry-run',snapshotId,keyId,keyStdin=false; const modes=args.filter(a=>['--dry-run','--snapshot','--apply'].includes(a));
  check(modes.length<=1,'RECOVERY_MODE_INVALID'); if(modes[0]) mode=modes[0].slice(2);
  for(let i=0;i<args.length;i++) {
    if(['--dry-run','--snapshot','--apply'].includes(args[i])) continue;
    if(args[i]==='--snapshot-id') { check(!snapshotId && i+1<args.length,'RECOVERY_ARGUMENT_INVALID'); snapshotId=args[++i]; }
    else if(args[i]==='--snapshot-key-id') {check(!keyId && i+1<args.length,'RECOVERY_ARGUMENT_INVALID');keyId=keyVersion(args[++i]);}
    else if(args[i]==='--snapshot-key-stdin') {check(!keyStdin,'RECOVERY_ARGUMENT_INVALID');keyStdin=true;}
    else fail('RECOVERY_ARGUMENT_INVALID');
  }
  check(!snapshotId || (mode==='apply' && UUID.test(snapshotId)),'RECOVERY_ARGUMENT_INVALID');
  check(!(mode==='dry-run' && (keyStdin || keyId)),'RECOVERY_ARGUMENT_INVALID');
  return {mode,snapshotId,...(keyId?{keyId}:{}),...(keyStdin?{keyStdin}: {})};
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
  let secret=process.env.VPT_RECOVERY_SNAPSHOT_KEY;
  if(opts.keyStdin) {
    check(!process.stdin.isTTY,'RECOVERY_KEY_STDIN_PIPE_REQUIRED');
    secret=require('node:fs').readFileSync(0,'utf8').trim();
  }
  const keyId=opts.keyId || process.env.VPT_RECOVERY_SNAPSHOT_KEY_ID;
  const {Client}=require('pg');
  const pUrl=validateUrl(process.env.SUPABASE_DB_URL||process.env.SUPABASE_DB_DIRECT_URL,PRIMARY);
  const bUrl=validateUrl(process.env.SUPABASE_BACKUP_DB_URL||process.env.SUPABASE_BACKUP_DB_DIRECT_URL,BACKUP);
  const primary=new Client({connectionString:pUrl,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  const backup=new Client({connectionString:bUrl,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  watchClient(primary); watchClient(backup);
  try {
    await primary.connect(); await backup.connect();
    const result=await recover({primary,backup,...opts,secret,keyId,legacySecret:process.env.JWT_SECRET});
    console.log(JSON.stringify(result));
  } finally { await Promise.allSettled([primary.end(),backup.end()]); }
}
if(require.main===module) main().catch(e=>{ console.error(JSON.stringify({ok:false,reason:safeCode(e)})); process.exitCode=1; });
module.exports={recover,parseArgs,safeCode,encrypt,decrypt,fingerprint,SCOPE,PRIMARY,BACKUP,STORE,OPERATION,ALGORITHM,LEGACY_ALGORITHM,validateUrl,watchClient};
