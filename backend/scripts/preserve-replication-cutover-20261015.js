#!/usr/bin/env node
'use strict';

// Preparation only: no business-row restore, replay, mapping, clone or pruning.
// Default inventory is read-only. Arm and encrypted snapshots are separate modes.
const crypto = require('node:crypto');
const PRIMARY='kdxypztstbeovyedmvem', BACKUP='atcfpgxkgbszglrelfgr';
const NS='vpt_cutover_20261015', OP='current_state_cutover_v1';
const ALG='aes-256-gcm/hkdf-sha256/cutover_v1';
const SUPPORTED=Object.freeze(['crm_leads','project_substage_status','users','departments','trash_items']);
const CAPTURE='vpt_cutover_identity_20261015', TRUNCATE='vpt_cutover_truncate_20261015';
// SHA256 of the reviewed migration's exact prosrc, normalizing CRLF only.
const CAPTURE_BODY_SHA256='8c9db9d44ac94d5c1b31b5601b7df78cfb4d8dde0f5b2b1a3c2c984b022777eb';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const states=new WeakMap();
function fail(code){const e=new Error(code);e.cutoverCode=code;throw e;}
function check(ok,code){if(!ok)fail(code);}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
function quote(s){return '"'+String(s).replaceAll('"','""')+'"';}
function watch(c){if(states.has(c))return states.get(c);const s={failed:false};states.set(c,s);if(typeof c.on==='function'){c.on('error',()=>{s.failed=true;});c.on('end',()=>{s.failed=true;});}return s;}
function healthy(...cs){check(cs.every(c=>!watch(c).failed),'CUTOVER_CONNECTION_LOST');}
function safeCode(e){return /^CUTOVER_[A-Z_]+$/.test(e?.cutoverCode||'')?e.cutoverCode:({'40001':'CUTOVER_CONCURRENT_CHANGE','55P03':'CUTOVER_LOCK_UNAVAILABLE','57014':'CUTOVER_TIMEOUT','42501':'CUTOVER_PERMISSION_DENIED','23505':'CUTOVER_ALREADY_EXISTS'})[e?.code]||'CUTOVER_FAILED';}
function validateUrl(raw,ref){let u;try{u=new URL(raw);}catch{fail('CUTOVER_DATABASE_URL_REQUIRED');}check(['postgres:','postgresql:'].includes(u.protocol),'CUTOVER_DATABASE_URL_INVALID');check(u.hostname===`db.${ref}.supabase.co`||(u.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(u.username)===`postgres.${ref}`),'CUTOVER_PROJECT_PAIR_MISMATCH');check(u.pathname==='/postgres','CUTOVER_DATABASE_URL_INVALID');u.search='';u.hash='';return u.toString();}
function scopeTables(tables){check(Array.isArray(tables)&&tables.length>0&&tables.length<=SUPPORTED.length,'CUTOVER_SCOPE_REQUIRED');const out=[...new Set(tables)].sort();check(out.length===tables.length&&out.every(t=>SUPPORTED.includes(t)),'CUTOVER_SCOPE_UNSUPPORTED');return out;}
function skipTables(env={}){const light=env.SUPABASE_REPLICATION_LIGHT==='1';const base='supabase_failback_log,user_last_activity,user_devices,user_current_location,app_heartbeat';const defaults=light?base+',notifications,auth_event_log,facebook_webhook_logs,user_activity_log,audit_logs':base;return [...new Set(String(env.SUPABASE_REPLICATION_SKIP_TABLES||defaults).split(',').map(s=>s.trim()).filter(Boolean))].sort();}
async function inventory(client,env={}){const skip=skipTables(env);const rows=(await client.query(`SELECT c.relname::text AS name,c.relkind::text AS kind,c.relpersistence::text AS persistence,
  ARRAY(SELECT a.attname::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord)::text[] AS pk_columns,
  ARRAY(SELECT a.atttypid::regtype::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord)::text[] AS pk_types
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') ORDER BY c.relname`)).rows;return {eligible:rows.filter(r=>!skip.includes(r.name)),excluded:rows.filter(r=>skip.includes(r.name)).map(r=>r.name),skip};}
async function catalog(client,table){
  const rows=(await client.query(`SELECT c.oid::text AS oid,c.relkind::text AS kind,c.relpersistence::text AS persistence,
    ARRAY(SELECT a.attname::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord)::text[] AS pk
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1`,[table])).rows;
  check(rows.length===1&&rows[0].kind==='r'&&rows[0].persistence==='p','CUTOVER_TABLE_UNSUPPORTED');
  check(Array.isArray(rows[0].pk)&&stable(rows[0].pk)==='["id"]','CUTOVER_PRIMARY_KEY_UNSUPPORTED');
  const columns=(await client.query(`SELECT attname::text AS name,atttypid::regtype::text AS type,atttypmod,attnotnull,attgenerated::text,attidentity::text
    FROM pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped ORDER BY attnum`,[rows[0].oid])).rows;
  check(columns.some(c=>c.name==='id'&&c.type==='uuid'&&c.attnotnull),'CUTOVER_PRIMARY_KEY_UNSUPPORTED');
  const constraints=(await client.query('SELECT conname::text,contype::text,convalidated,pg_get_constraintdef(oid,true) AS definition FROM pg_constraint WHERE conrelid=$1::oid ORDER BY conname',[rows[0].oid])).rows;
  check(constraints.every(c=>c.convalidated),'CUTOVER_CONSTRAINT_UNVALIDATED');
  const triggers=(await client.query(`SELECT tgname::text,pg_get_triggerdef(oid,true) AS definition FROM pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal AND tgname<>ALL($2::text[]) ORDER BY tgname`,[rows[0].oid,[CAPTURE,TRUNCATE]])).rows;
  const value={columns,constraints,triggers,pk:rows[0].pk};return {oid:rows[0].oid,sha:hash(stable(value)),value};
}
async function privateStore(c){
  const r=(await c.query(`SELECT n.nspowner=r.oid AS owned,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) AS schema_private,
    count(t.oid)::int AS tables,
    bool_and(t.relowner=r.oid AND t.relrowsecurity AND t.relforcerowsecurity AND t.relpersistence='p') AS protected,
    bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner)) AS table_private,
    bool_and(NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname IN('anon','authenticated','service_role','authenticator') AND
      (has_schema_privilege(p.oid,n.oid,'USAGE') OR has_table_privilege(p.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))) AS app_denied
    FROM pg_namespace n JOIN pg_roles r ON r.rolname=current_user JOIN pg_class t ON t.relnamespace=n.oid AND t.relkind='r'
    WHERE n.nspname=$1 GROUP BY n.oid,r.oid`,[NS])).rows;
  check(r.length===1&&r[0].tables===4&&['owned','schema_private','protected','table_private','app_denied'].every(k=>r[0][k]===true),'CUTOVER_PRIVATE_STORE_REQUIRED');
  const sequences=(await c.query(`SELECT count(*)::int AS n,bool_and(s.relowner=r.oid AND
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(s.relacl,acldefault('S',s.relowner))) a WHERE a.grantee<>s.relowner) AND
    NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname IN('anon','authenticated','service_role','authenticator') AND has_sequence_privilege(p.oid,s.oid,'USAGE,SELECT,UPDATE'))) AS private
    FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace JOIN pg_roles r ON r.rolname=current_user WHERE n.nspname=$1 AND s.relkind='S'`,[NS])).rows[0];
  check(sequences?.n===1&&sequences.private===true,'CUTOVER_PRIVATE_STORE_REQUIRED');
}
async function captureFunction(c){const rows=(await c.query(`SELECT p.prosecdef,p.proowner=r.oid AS owned,p.proconfig::text[],pg_get_functiondef(p.oid) AS definition,p.prosrc AS source,
  p.prorettype='trigger'::regtype AND p.pronargs=0 AND l.lanname='plpgsql' AS correct_type,
  NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS private
  FROM pg_proc p JOIN pg_roles r ON r.rolname=current_user JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='${NS}.capture_identity_change()'::regprocedure`)).rows;
  const f=rows[0],settings=f?.proconfig||[];check(rows.length===1&&f.owned&&f.prosecdef&&f.private&&f.correct_type&&Array.isArray(settings)
    &&stable(settings.map(s=>s.toLowerCase()).sort())==='["search_path=pg_catalog","timezone=utc"]'
    &&hash(String(f.source).replace(/\r\n/g,'\n'))===CAPTURE_BODY_SHA256,'CUTOVER_CAPTURE_FUNCTION_CHANGED');return hash(f.definition);}
async function begin(c,level='REPEATABLE READ'){await c.query('BEGIN ISOLATION LEVEL '+level);await c.query("SET LOCAL TIME ZONE 'UTC'");await c.query("SET LOCAL lock_timeout='2s'");await c.query("SET LOCAL statement_timeout='15s'");await c.query("SET LOCAL idle_in_transaction_session_timeout='120s'");}
async function rollback(c){try{await c.query('ROLLBACK');}catch{}}
async function armSite(c,site,id,tables,all){
  await privateStore(c);const definition={operation:OP,site,project_ref:site==='primary'?PRIMARY:BACKUP,tables,eligible:all.eligible.map(r=>r.name),skip:all.skip,capture_function_sha256:await captureFunction(c),capture_body_sha256:CAPTURE_BODY_SHA256};
  const existing=(await c.query(`SELECT definition FROM ${NS}.runs WHERE id=$1`,[id])).rows[0];
  if(existing){check(stable(existing.definition)===stable(definition),'CUTOVER_REGISTRATION_MISMATCH');await registration(c,site,id,tables);return {site,resumed:true};}
  const catalogs={};for(const t of tables)catalogs[t]=await catalog(c,t);
  healthy(c);
  await c.query(`INSERT INTO ${NS}.runs(id,operation,site,definition,definition_sha256) VALUES($1,$2,$3,$4::jsonb,$5)`,[id,OP,site,JSON.stringify(definition),hash(stable(definition))]);
  for(const t of tables){const cat=catalogs[t];healthy(c);
    await c.query(`LOCK TABLE public.${quote(t)} IN SHARE ROW EXCLUSIVE MODE`);
    check((await catalog(c,t)).sha===cat.sha,'CUTOVER_SCHEMA_CHANGED');
    await c.query(`INSERT INTO ${NS}.registrations(run_id,table_name,table_oid,pk_columns,catalog_sha256) VALUES($1,$2,$3::oid,$4::text[],$5)`,[id,t,cat.oid,['id'],cat.sha]);
    await c.query(`CREATE TRIGGER ${quote(CAPTURE)} AFTER INSERT OR UPDATE OR DELETE ON public.${quote(t)} FOR EACH ROW EXECUTE FUNCTION ${NS}.capture_identity_change()`);
    await c.query(`CREATE TRIGGER ${quote(TRUNCATE)} BEFORE TRUNCATE ON public.${quote(t)} FOR EACH STATEMENT EXECUTE FUNCTION ${NS}.capture_identity_change()`);
    await c.query(`ALTER TABLE public.${quote(t)} ENABLE ALWAYS TRIGGER ${quote(CAPTURE)}`);
    await c.query(`ALTER TABLE public.${quote(t)} ENABLE ALWAYS TRIGGER ${quote(TRUNCATE)}`);
  }
  return {site,resumed:false};
}
async function registration(c,site,id,tables){
  await privateStore(c);
  const run=(await c.query(`SELECT operation,site,definition,definition_sha256 FROM ${NS}.runs WHERE id=$1`,[id])).rows[0];
  check(run&&run.operation===OP&&run.site===site&&run.definition.project_ref===(site==='primary'?PRIMARY:BACKUP)&&hash(stable(run.definition))===run.definition_sha256&&stable(run.definition.tables)===stable(tables)&&run.definition.capture_body_sha256===CAPTURE_BODY_SHA256,'CUTOVER_REGISTRATION_MISMATCH');
  check(run.definition.capture_function_sha256===await captureFunction(c),'CUTOVER_CAPTURE_FUNCTION_CHANGED');
  for(const t of tables){const r=(await c.query(`SELECT table_oid::text AS oid,pk_columns::text[],catalog_sha256 FROM ${NS}.registrations WHERE run_id=$1 AND table_name=$2`,[id,t])).rows[0];const cat=await catalog(c,t);
    check(r&&r.oid===cat.oid&&Array.isArray(r.pk_columns)&&stable(r.pk_columns)==='["id"]'&&r.catalog_sha256===cat.sha,'CUTOVER_SCHEMA_CHANGED');
    const triggers=(await c.query(`SELECT tgname::text,tgenabled::text,tgtype,tgfoid='${NS}.capture_identity_change()'::regprocedure AS correct_function FROM pg_trigger WHERE tgrelid=$1::oid AND tgname=ANY($2::text[]) ORDER BY tgname`,[cat.oid,[CAPTURE,TRUNCATE]])).rows;
    check(triggers.length===2&&triggers.every(r=>r.tgenabled==='A'&&r.correct_function)&&triggers.find(r=>r.tgname===CAPTURE)?.tgtype===29&&triggers.find(r=>r.tgname===TRUNCATE)?.tgtype===34,'CUTOVER_TRIGGER_CHANGED');
  }
}
function material(secret,keyId){check(UUID.test(keyId||''),'CUTOVER_KEY_VERSION_REQUIRED');check(typeof secret==='string'&&Buffer.from(secret,'base64').length===32&&Buffer.from(secret,'base64').toString('base64')===secret,'CUTOVER_KEY_UNAVAILABLE');return Buffer.from(secret,'base64');}
function aad(m){return Buffer.from(stable({operation:OP,algorithm:ALG,primary:PRIMARY,backup:BACKUP,run_id:m.run_id,capture_id:m.capture_id,phase:m.phase,site:m.site,stream:m.stream,part:m.part,row_count:m.row_count,key_label:m.key_label}));}
function encrypt(raw,m,secret){const input=material(secret,m.key_label),salt=crypto.randomBytes(32),nonce=crypto.randomBytes(12);let key;
  try{key=Buffer.from(crypto.hkdfSync('sha256',input,salt,Buffer.from('vpt/cutover/20261015/v1'),32));const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad(m));const ciphertext=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);return {salt,nonce,auth_tag:cipher.getAuthTag(),ciphertext,ciphertext_sha256:hash(ciphertext)};}finally{input.fill(0);key?.fill(0);}}
function decrypt(r,secret){check(r.algorithm===ALG&&hash(Buffer.from(r.ciphertext))===r.ciphertext_sha256,'CUTOVER_ARTIFACT_DIGEST');const input=material(secret,r.key_label);let key;
  try{key=Buffer.from(crypto.hkdfSync('sha256',input,Buffer.from(r.salt),Buffer.from('vpt/cutover/20261015/v1'),32));const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(r.nonce));d.setAAD(aad(r));d.setAuthTag(Buffer.from(r.auth_tag));return Buffer.concat([d.update(Buffer.from(r.ciphertext)),d.final()]).toString('utf8');}catch{fail('CUTOVER_ARTIFACT_DECRYPT');}finally{input.fill(0);key?.fill(0);}}
async function save(c,meta,raw,secret){healthy(c);const e=encrypt(raw,meta,secret);await c.query(`INSERT INTO ${NS}.artifacts(run_id,capture_id,phase,site,stream,part,row_count,algorithm,key_label,salt,nonce,auth_tag,ciphertext,ciphertext_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[meta.run_id,meta.capture_id,meta.phase,meta.site,meta.stream,meta.part,meta.row_count,ALG,meta.key_label,e.salt,e.nonce,e.auth_tag,e.ciphertext,e.ciphertext_sha256]);const r=(await c.query(`SELECT * FROM ${NS}.artifacts WHERE run_id=$1 AND capture_id=$2 AND phase=$3 AND site=$4 AND stream=$5 AND part=$6`,[meta.run_id,meta.capture_id,meta.phase,meta.site,meta.stream,meta.part])).rows[0];check(r&&decrypt(r,secret)===raw,'CUTOVER_ARTIFACT_READBACK');return e.ciphertext_sha256;}
async function captureSite(c,site,id,captureId,tables,phase,keyId,secret){
  await registration(c,site,id,tables);
  const existing=(await c.query(`SELECT count(*)::int AS n FROM ${NS}.artifacts WHERE run_id=$1 AND capture_id=$2`,[id,captureId])).rows[0].n;
  if(existing){const verified=await verifySite(c,site,id,captureId,tables,phase,keyId,secret);return {...verified,resumed:true};}
  const manifest=[];
  const streams=tables.map(t=>({name:'table:'+t,sql:`SELECT to_jsonb(t)::text AS raw FROM public.${quote(t)} t ORDER BY id`}));
  streams.push({name:'identity-events',sql:`SELECT to_jsonb(t)::text AS raw FROM ${NS}.events t WHERE run_id='${id}'::uuid ORDER BY id`});
  // Storage bytes are not copied. Missing storage schema is reported explicitly.
  const storage=(await c.query("SELECT to_regclass('storage.objects') IS NOT NULL AS present")).rows[0]?.present===true;
  if(storage)streams.push({name:'storage-manifest',sql:'SELECT to_jsonb(t)::text AS raw FROM storage.objects t ORDER BY bucket_id,name,id'});
  for(const stream of streams){
    const digest=crypto.createHash('sha256');let offset=0,part=0,total=0;
    do{healthy(c);const rows=(await c.query(stream.sql+' LIMIT $1 OFFSET $2',[100,offset])).rows.map(r=>r.raw);check(rows.every(r=>typeof r==='string'),'CUTOVER_RAW_JSON_REQUIRED');const raw=JSON.stringify({raw_rows:rows});check(Buffer.byteLength(raw)<=8*1024*1024,'CUTOVER_CHUNK_TOO_LARGE');for(const r of rows)digest.update(r+'\n');
      await save(c,{run_id:id,capture_id:captureId,phase,site,stream:stream.name,part,row_count:rows.length,key_label:keyId},raw,secret);total+=rows.length;offset+=rows.length;part++;if(rows.length<100)break;
    }while(true);
    manifest.push({stream:stream.name,rows:total,parts:part,sha256:digest.digest('hex')});
  }
  await save(c,{run_id:id,capture_id:captureId,phase,site,stream:'manifest',part:0,row_count:manifest.length,key_label:keyId},JSON.stringify({operation:OP,run_id:id,capture_id:captureId,phase,site,tables,manifest,storage_manifest_present:storage,queue_inventory_complete:false,cutover_ready:false,commit_order_proven:false}),secret);
  return {site,streams:manifest.length,rows:manifest.reduce((n,s)=>n+s.rows,0),storage_manifest_present:storage,resumed:false};
}
async function verifySite(c,site,id,captureId,tables,phase,keyId,secret){await privateStore(c);
  const rs=(await c.query(`SELECT * FROM ${NS}.artifacts WHERE run_id=$1 AND capture_id=$2 ORDER BY stream,part`,[id,captureId])).rows;
  check(rs.length>0&&rs.every(r=>r.key_label===keyId&&r.site===site&&r.phase===phase),'CUTOVER_ARTIFACT_SET_REQUIRED');
  const manifests=rs.filter(r=>r.stream==='manifest');check(manifests.length===1&&manifests[0].part===0,'CUTOVER_ARTIFACT_SET_REQUIRED');
  const manifest=JSON.parse(decrypt(manifests[0],secret));check(manifest.operation===OP&&manifest.run_id===id&&manifest.capture_id===captureId&&manifest.phase===phase&&manifest.site===site&&stable(manifest.tables)===stable(tables)&&manifest.cutover_ready===false,'CUTOVER_MANIFEST_INVALID');
  const required=[...tables.map(t=>'table:'+t),'identity-events',...(manifest.storage_manifest_present?['storage-manifest']:[])].sort();
  check(stable(manifest.manifest.map(s=>s.stream).sort())===stable(required)&&manifests[0].row_count===required.length,'CUTOVER_MANIFEST_INVALID');
  for(const expected of manifest.manifest){const parts=rs.filter(r=>r.stream===expected.stream);check(parts.length===expected.parts,'CUTOVER_ARTIFACT_SET_REQUIRED');let count=0;const digest=crypto.createHash('sha256');
    for(let i=0;i<parts.length;i++){check(parts[i].part===i,'CUTOVER_ARTIFACT_SET_REQUIRED');const payload=JSON.parse(decrypt(parts[i],secret));check(Array.isArray(payload.raw_rows)&&payload.raw_rows.length===parts[i].row_count&&payload.raw_rows.every(r=>typeof r==='string'),'CUTOVER_ARTIFACT_ROWS_INVALID');for(const raw of payload.raw_rows)digest.update(raw+'\n');count+=payload.raw_rows.length;}
    check(count===expected.rows&&digest.digest('hex')===expected.sha256,'CUTOVER_STREAM_DIGEST');
  }
  check(rs.length===1+manifest.manifest.reduce((n,s)=>n+s.parts,0),'CUTOVER_ARTIFACT_SET_REQUIRED');return {site,phase,streams:required.length,verified:true};
}
async function preserve({primary,backup,mode='inventory',tables=SUPPORTED,runId,captureId,phase='baseline',secret,keyId,env={}}){
  check(['inventory','arm','snapshot','verify'].includes(mode),'CUTOVER_MODE_INVALID');tables=scopeTables([...tables]);watch(primary);watch(backup);healthy(primary,backup);
  if(mode!=='inventory')check(mode==='arm'?!runId||UUID.test(runId):UUID.test(runId||''),'CUTOVER_RUN_ID_INVALID');
  if(captureId)check(['snapshot','verify'].includes(mode)&&UUID.test(captureId),'CUTOVER_CAPTURE_ID_INVALID');
  if(mode==='verify')check(UUID.test(captureId||''),'CUTOVER_CAPTURE_ID_INVALID');
  if(['snapshot','verify'].includes(mode)){check(['baseline','closing'].includes(phase),'CUTOVER_PHASE_INVALID');material(secret,keyId).fill(0);}
  if(mode==='verify'){const verified=[await verifySite(primary,'primary',runId,captureId,tables,phase,keyId,secret),await verifySite(backup,'backup',runId,captureId,tables,phase,keyId,secret)];healthy(primary,backup);return {ok:true,mode,run_id:runId,capture_id:captureId,verified,queue_inventory_complete:false,cutover_ready:false,production_rows_changed:0};}
  const inventories={primary:await inventory(primary,env),backup:await inventory(backup,env)};
  const coverage=Object.fromEntries(Object.entries(inventories).map(([site,value])=>[site,{eligible_tables:value.eligible.map(r=>r.name),uncovered_tables:value.eligible.filter(r=>!tables.includes(r.name)).map(r=>r.name),uncovered_catalog:value.eligible.filter(r=>!tables.includes(r.name)),excluded_tables:value.excluded}]));
  check(tables.every(t=>inventories.primary.eligible.some(r=>r.name===t)&&inventories.backup.eligible.some(r=>r.name===t)),'CUTOVER_SCOPE_NOT_ELIGIBLE');
  if(mode==='inventory'){for(const c of [primary,backup])for(const t of tables)await catalog(c,t);return {ok:true,mode,tables,coverage,queue_inventory_complete:false,cutover_ready:false,production_rows_changed:0};}
  const id=runId||crypto.randomUUID(),checkpoint=mode==='snapshot'?(captureId||crypto.randomUUID()):undefined;let commitDispatched;
  try{
    await begin(primary);await begin(backup);
    let armed;
    if(mode==='arm')armed=[await armSite(primary,'primary',id,tables,inventories.primary),await armSite(backup,'backup',id,tables,inventories.backup)];
    let captured;
    if(mode==='snapshot')captured=[await captureSite(primary,'primary',id,checkpoint,tables,phase,keyId,secret),await captureSite(backup,'backup',id,checkpoint,tables,phase,keyId,secret)];
    await primary.query('SELECT 1');await backup.query('SELECT 1');healthy(primary,backup);
    commitDispatched='primary';await primary.query('COMMIT');healthy(primary,backup);commitDispatched='backup';await backup.query('COMMIT');healthy(primary,backup);
    return {ok:true,mode,run_id:id,...(armed&&{armed}),...(captured&&{phase,capture_id:checkpoint,captured}),tables,coverage,queue_inventory_complete:false,cutover_ready:false,production_rows_changed:0,partial_commit_possible:true};
  }catch(e){await rollback(primary);await rollback(backup);if(commitDispatched){const outcome=new Error('CUTOVER_PARTIAL_COMMIT_REVIEW_REQUIRED');Object.assign(outcome,{cutoverCode:'CUTOVER_PARTIAL_COMMIT_REVIEW_REQUIRED',run_id:id,capture_id:checkpoint,commit_site:commitDispatched});throw outcome;}healthy(primary,backup);throw e;}
}
function parseArgs(args){
  let mode='inventory',tables=SUPPORTED,runId,captureId,phase='baseline',keyId,keyStdin=false;
  const modes=args.filter(a=>['--inventory','--arm','--snapshot','--verify'].includes(a));
  check(modes.length<=1,'CUTOVER_ARGUMENT_INVALID');if(modes[0])mode=modes[0].slice(2);
  const seen=new Set();
  for(let i=0;i<args.length;i++){
    const a=args[i];if(['--inventory','--arm','--snapshot','--verify'].includes(a))continue;
    check(!seen.has(a),'CUTOVER_ARGUMENT_INVALID');seen.add(a);
    if(a==='--key-stdin'){keyStdin=true;continue;}
    check(['--tables','--run-id','--capture-id','--phase','--key-id'].includes(a)&&i+1<args.length,'CUTOVER_ARGUMENT_INVALID');
    const value=args[++i];if(a==='--tables')tables=value.split(',');if(a==='--run-id')runId=value;if(a==='--capture-id')captureId=value;if(a==='--phase')phase=value;if(a==='--key-id')keyId=value;
  }
  check(!runId||(mode!=='inventory'&&UUID.test(runId)),'CUTOVER_ARGUMENT_INVALID');
  check(!captureId||(['snapshot','verify'].includes(mode)&&UUID.test(captureId)),'CUTOVER_ARGUMENT_INVALID');
  check(!keyStdin||['snapshot','verify'].includes(mode),'CUTOVER_ARGUMENT_INVALID');
  check(!seen.has('--phase')||(['snapshot','verify'].includes(mode)&&['baseline','closing'].includes(phase)),'CUTOVER_ARGUMENT_INVALID');
  return {mode,tables:scopeTables([...tables]),runId,captureId,phase,keyId,keyStdin};
}
async function main(){const opts=parseArgs(process.argv.slice(2));require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});const {Client}=require('pg');const primary=new Client({connectionString:validateUrl(process.env.SUPABASE_DB_URL||process.env.SUPABASE_DB_DIRECT_URL,PRIMARY),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});const backup=new Client({connectionString:validateUrl(process.env.SUPABASE_BACKUP_DB_URL||process.env.SUPABASE_BACKUP_DB_DIRECT_URL,BACKUP),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});watch(primary);watch(backup);try{await primary.connect();await backup.connect();const secret=opts.keyStdin?require('node:fs').readFileSync(0,'utf8').trim():process.env.VPT_RECOVERY_SNAPSHOT_KEY;console.log(JSON.stringify(await preserve({primary,backup,...opts,secret,keyId:opts.keyId||process.env.VPT_RECOVERY_SNAPSHOT_KEY_ID,env:process.env})));}finally{await Promise.allSettled([primary.end(),backup.end()]);}}
function failureResult(e){const result={ok:false,reason:safeCode(e)};if(result.reason==='CUTOVER_PARTIAL_COMMIT_REVIEW_REQUIRED'){if(UUID.test(e.run_id||''))result.run_id=e.run_id;if(UUID.test(e.capture_id||''))result.capture_id=e.capture_id;if(['primary','backup'].includes(e.commit_site))result.commit_site=e.commit_site;}return result;}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify(failureResult(e)));process.exitCode=1;});
module.exports={preserve,parseArgs,validateUrl,skipTables,encrypt,decrypt,safeCode,failureResult,SUPPORTED,NS,OP,ALG,PRIMARY,BACKUP,CAPTURE_BODY_SHA256};
