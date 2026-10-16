#!/usr/bin/env node
'use strict';

// Finite additions-only extension of the existing run. No old manifest/row is
// rewritten. No installation, deployment, repair, replay or auto release.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const v2=require('./prepare-replication-cutover-v2-20261015');
const v1=require('./preserve-replication-cutover-20261015');
const prior=require('./coordinate-replication-cutover-v2-20261015');
const NS=v2.NS,V1_NS='vpt_cutover_20261015';
const REVISION_NS='vpt_cutover_scope_v3_20261016';
const RUN_ID='30a4e894-3d2c-4b7c-a65b-bc70bd047350';
const BASE_MANIFEST_SHA='097952669c7ef255e89fa1f6c5efb2e2ccda2c7cdbb413e925338a7719397d13';
const ADDITION='_bulk_hoanthanh_sx_20261016';
const SQL_V3_FILE='20261016135104_replication_cutover_scope_revision.sql';
const SQL_V3_SHA='11230afb0fac01e4df28e805dbee32bda8f7ba8a6241f0a4898ef9bcbc2144bc';
const REVISION_SHAPE_SHA='603e2a89d8ee06161fb65219e068d6cac49f0ad50dc0783fcee1aa30e4dbdab5';
const IMMUTABLE_BODY_SHA='0d51defe228a9b9bb8e8fdde863428d749ee2fdefad8c76e6346543d68877633';
const FROZEN=Object.freeze({coordinator_v2:'9fd1363a1bee2e49e1f64eef02291e2946ee7c91e2d7db6516900b1e1ef87f7e',capacity:'75be38cd81465a2428231d3072c86e8c29626db8f49edc328616293285168940',helper_v2:'a51117d2082f2f7ad522cae38912433946c7d6a3d7d9625b2cf8bbbbf56fd7f3',helper_v1:'e47e7c734bcccf03a36c29ded8071543ea75ece55bf4ef52852821dd06e311d1',repair_v2:'362101c1b3516fb4e22197afdd9896382e9bd64db9bf07f74cdac843c02364e3'});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const ACTIONS=['inspect','measure','validate','init','register','activate','capture','verify','release'];
const READ_ONLY=new Set(['inspect','measure','validate','verify']);
const V1_CAPTURE='vpt_cutover_identity_20261015',V1_TRUNCATE='vpt_cutover_truncate_20261015';
const EXPECTED_SQL_SHA='2ea5ae2c26128cf9974d8cb59050336c523bcf7c4735a62c581f4d16adc8e61c';
const health=new WeakMap();
function fail(code){const e=new Error(code);e.cutoverCode=code;throw e;}
function check(ok,code){if(!ok)fail(code);}
function same(a,b){return v2.stable(a)===v2.stable(b);}
function quote(s){return '"'+String(s).replaceAll('"','""')+'"';}
function watch(c){if(!health.has(c)){const s={failed:false};health.set(c,s);c.on?.('error',()=>{s.failed=true;});c.on?.('end',()=>{s.failed=true;});}}
function healthy(...cs){for(const c of cs){watch(c);check(!health.get(c).failed,'CUTOVER_LIFECYCLE_CONNECTION_LOST');}}
function safeCode(e){if(/^CUTOVER_(?:LIFECYCLE|V2|V3)_[A-Z_]+$/.test(e?.cutoverCode||''))return e.cutoverCode;if(/^RECOVERY_[A-Z_]+$/.test(e?.recoveryCode||''))return e.recoveryCode;return ({'40001':'CUTOVER_LIFECYCLE_CONCURRENT_CHANGE','40P01':'CUTOVER_LIFECYCLE_CONCURRENT_CHANGE','55P03':'CUTOVER_LIFECYCLE_LOCK_UNAVAILABLE','57014':'CUTOVER_LIFECYCLE_TIMEOUT','42501':'CUTOVER_LIFECYCLE_PERMISSION_DENIED','23505':'CUTOVER_LIFECYCLE_CONFLICT'})[e?.code]||'CUTOVER_LIFECYCLE_HELD';}
async function rollback(c){try{await c.query('ROLLBACK');}catch{}}
async function begin(c,readOnly=false,isolation='REPEATABLE READ'){check(['REPEATABLE READ','SERIALIZABLE'].includes(isolation),'CUTOVER_LIFECYCLE_ISOLATION_INVALID');await c.query('BEGIN ISOLATION LEVEL '+isolation+(readOnly?' READ ONLY':''));for(const sql of ["SET LOCAL TIME ZONE 'UTC'","SET LOCAL row_security=off","SET LOCAL lock_timeout='2s'","SET LOCAL statement_timeout='15s'","SET LOCAL idle_in_transaction_session_timeout='120s'"])await c.query(sql);}
async function transaction(c,context,fn,isolation='REPEATABLE READ',precommit){let dispatched=false;try{await begin(c,false,isolation);const result=await fn();healthy(c);await c.query('SELECT 1');healthy(c);if(precommit)await precommit();dispatched=true;await c.query('COMMIT');healthy(c);return result;}catch(e){await rollback(c);if(dispatched){const outcome=new Error('CUTOVER_LIFECYCLE_COMMIT_OUTCOME_UNKNOWN');Object.assign(outcome,{cutoverCode:'CUTOVER_LIFECYCLE_COMMIT_OUTCOME_UNKNOWN',...context});throw outcome;}healthy(c);throw e;}}
function recheckMutationEvidence(ctx){validateApproval(ctx.approval,{...ctx,action:ctx.action});ctx.capacityResult=require('./replication-cutover-capacity-20261015').validateCapacity(ctx.capacity,{...ctx,action:ctx.action});}
async function mutationTransaction(c,ctx,context,fn){return transaction(c,context,fn,'REPEATABLE READ',()=>recheckMutationEvidence(ctx));}

function immutableEntry(entry){const copy={...entry};delete copy.estimated_rows;delete copy.relation_bytes;return copy;}
function validateRevisionPlan(plan,basePlan){
  v2.validatePlan(basePlan);v2.validatePlan(plan);
  check(basePlan.manifest_sha256===BASE_MANIFEST_SHA&&!basePlan.descriptor.scope_revision,'CUTOVER_V3_BASE_MANIFEST_REQUIRED');
  const revision={version:1,run_id:RUN_ID,base_manifest_sha256:BASE_MANIFEST_SHA,additions:{primary:[ADDITION],backup:[]}};
  check(same(plan.descriptor.scope_revision,revision),'CUTOVER_V3_REVISION_REQUIRED');
  check(same(plan.descriptor.flags,basePlan.descriptor.flags),'CUTOVER_V3_BASE_CHANGED');
  for(const site of ['primary','backup']){
    const base=basePlan.descriptor.sites[site],next=plan.descriptor.sites[site];
    check(same(base.excluded,next.excluded)&&same(base.derived.map(immutableEntry),next.derived.map(immutableEntry))&&same(base.held,next.held),'CUTOVER_V3_BASE_CHANGED');
    check(new Set(next.tables.map(t=>t.name)).size===next.tables.length&&next.tables.length===base.tables.length+(site==='primary'?1:0),'CUTOVER_V3_ADDITION_REQUIRED');
    for(const entry of base.tables)check(same(immutableEntry(entry),immutableEntry(next.tables.find(t=>t.name===entry.name))),'CUTOVER_V3_BASE_CHANGED');
    const additions=next.tables.filter(t=>!base.tables.some(b=>b.name===t.name));
    check(same(additions.map(t=>t.name),revision.additions[site])&&additions.every(t=>t.kind==='r'&&t.persistence==='p'&&!t.inherited&&Array.isArray(t.key_columns)&&t.mode===(t.key_columns.length?'pk_digest':'row_multiset')),'CUTOVER_V3_ADDITION_REQUIRED');
  }
  // Recompute exceptions and all descriptor fields rather than trusting a
  // rehashed hand-edited exception list or newly introduced metadata fields.
  const rebuilt=v2.createPlan(plan.descriptor.sites.primary,plan.descriptor.sites.backup,{SUPABASE_REPLICATION_LIGHT:plan.descriptor.flags.light?'1':'0',SUPABASE_REPLICATION_SKIP_TABLES:plan.descriptor.flags.skip.join(','),SUPABASE_REPLICATION_STORAGE:plan.descriptor.flags.storage_enabled?'1':'0'});
  check(same({...rebuilt.descriptor,scope_revision:revision},plan.descriptor),'CUTOVER_V3_REVISION_REQUIRED');
  return plan;
}
function createRevisionPlan(basePlan,currentPlan){const descriptor={...currentPlan.descriptor,scope_revision:{version:1,run_id:RUN_ID,base_manifest_sha256:BASE_MANIFEST_SHA,additions:{primary:[ADDITION],backup:[]}}};
  const plan={descriptor,manifest_sha256:v2.hash(v2.stable(descriptor)),readiness:{cutover_ready:false}};return validateRevisionPlan(plan,basePlan);}
async function privateRevisionShape(c){const rows=(await c.query(`SELECT t.relname::text AS name,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid::regtype::text,'typmod',a.atttypmod,'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.conname,'kind',p.contype,'validated',p.convalidated,'definition',pg_get_constraintdef(p.oid,true)) ORDER BY p.conname) FROM pg_constraint p WHERE p.conrelid=t.oid AND p.contype<>'n'),'[]'::jsonb) AS constraints,
    coalesce((SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=t.oid),'[]'::jsonb) AS indexes
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relkind='r' ORDER BY t.relname`,[REVISION_NS])).rows;
  return v2.hash(v2.stable(rows));}
async function privateRevisionContract(c){
  const root=(await c.query(`SELECT n.nspowner=current_user::regrole::oid AS owned,current_user=session_user AS direct_owner,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) AS private,
    NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND has_schema_privilege(r.oid,n.oid,'USAGE')) AS app_denied FROM pg_namespace n WHERE n.nspname=$1`,[REVISION_NS])).rows[0];
  check(root?.owned&&root.direct_owner&&root.private&&root.app_denied,'CUTOVER_V3_PRIVATE_CONTRACT');
  const relations=(await c.query(`SELECT t.relname::text AS name,t.relkind::text AS kind,t.relowner=current_user::regrole::oid AS owned,t.relpersistence::text AS persistence,t.relrowsecurity,t.relforcerowsecurity,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r'::"char",t.relowner))) a WHERE a.grantee<>t.relowner) AS private,
    NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND (has_table_privilege(r.oid,t.oid,'SELECT') OR has_table_privilege(r.oid,t.oid,'INSERT') OR has_table_privilege(r.oid,t.oid,'UPDATE') OR has_table_privilege(r.oid,t.oid,'DELETE') OR has_table_privilege(r.oid,t.oid,'TRUNCATE') OR has_table_privilege(r.oid,t.oid,'REFERENCES') OR has_table_privilege(r.oid,t.oid,'TRIGGER'))) AS app_denied,
    (SELECT count(*)::int FROM pg_rewrite w WHERE w.ev_class=t.oid) AS rules,
    (SELECT count(*)=1 AND bool_and(p.polname='owner_only' AND p.polcmd='*' AND p.polpermissive AND p.polroles=ARRAY[current_user::regrole::oid]::oid[] AND pg_get_expr(p.polqual,p.polrelid)='true' AND pg_get_expr(p.polwithcheck,p.polrelid)='true') FROM pg_policy p WHERE p.polrelid=t.oid) AS policy_ok,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',g.tgname,'type',g.tgtype,'enabled',g.tgenabled,'function_schema',pn.nspname,'function',p.proname,'no_when',g.tgqual IS NULL,'args',g.tgnargs,'attributes',g.tgattr::text) ORDER BY g.tgname) FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),'[]'::jsonb) AS triggers
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 ORDER BY t.relname`,[REVISION_NS])).rows;
  const tables=relations.filter(r=>r.kind==='r');check(tables.length===1&&tables[0].name==='revisions'&&relations.every(r=>['r','i'].includes(r.kind)),'CUTOVER_V3_PRIVATE_CONTRACT');
  const t=tables[0];check(t.owned&&t.private&&t.app_denied&&t.persistence==='p'&&t.relrowsecurity&&t.relforcerowsecurity&&t.rules===0&&t.policy_ok&&same(t.triggers,[{name:'immutable_revision',type:58,enabled:'A',function_schema:REVISION_NS,function:'immutable_revision',no_when:true,args:0,attributes:''}]),'CUTOVER_V3_PRIVATE_CONTRACT');
  const functions=(await c.query(`SELECT p.proname::text AS name,p.prosrc AS source,p.proowner=current_user::regrole::oid AS owned,p.prosecdef,p.pronargs,p.prorettype::regtype::text AS returns,p.proconfig::text[],l.lanname::text AS language,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS private FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1`,[REVISION_NS])).rows;
  const f=functions[0];check(functions.length===1&&f.name==='immutable_revision'&&f.owned&&f.private&&!f.prosecdef&&f.pronargs===0&&f.returns==='trigger'&&f.language==='plpgsql'&&same(f.proconfig,['search_path=pg_catalog'])&&v2.hash(f.source.replace(/\r\n/g,'\n'))===IMMUTABLE_BODY_SHA&&await privateRevisionShape(c)===REVISION_SHAPE_SHA,'CUTOVER_V3_PRIVATE_CONTRACT');healthy(c);
}
async function baseRecord(c,site,runId){check(runId===RUN_ID,'CUTOVER_V3_RUN_REQUIRED');const rows=(await c.query(`SELECT id,site,project_ref,manifest_sha256,manifest,owner_oid=current_user::regrole::oid AS owned FROM ${NS}.runs ORDER BY id`)).rows;
  const row=rows[0];check(rows.length===1&&row.id===runId&&row.owned&&row.site===site&&row.manifest_sha256===BASE_MANIFEST_SHA&&row.project_ref===(site==='primary'?v1.PRIMARY:v1.BACKUP),'CUTOVER_V3_BASE_MANIFEST_REQUIRED');
  const basePlan={descriptor:row.manifest,manifest_sha256:row.manifest_sha256};v2.validatePlan(basePlan);check(!basePlan.descriptor.scope_revision,'CUTOVER_V3_BASE_MANIFEST_REQUIRED');return basePlan;}
async function revisionRecord(c,site,runId,plan){await privateRevisionContract(c);const basePlan=await baseRecord(c,site,runId);validateRevisionPlan(plan,basePlan);
  const rows=(await c.query(`SELECT run_id,site,project_ref,base_manifest_sha256,revision_manifest_sha256,manifest,owner_oid,created_at::text,owner_oid=current_user::regrole::oid AS owned FROM ${REVISION_NS}.revisions ORDER BY run_id,site`)).rows;
  const row=rows[0];check(rows.length===1&&row.run_id===runId&&row.site===site&&row.owned&&row.project_ref===plan.descriptor.sites[site].project_ref&&row.base_manifest_sha256===BASE_MANIFEST_SHA&&row.revision_manifest_sha256===plan.manifest_sha256&&same(row.manifest,plan.descriptor),'CUTOVER_V3_REVISION_RECORD_REQUIRED');return row;}
function expectedRepairMarker(){return {version:'cutover_v3_parent_repair_v1',namespace:REVISION_NS,base_manifest_sha256:BASE_MANIFEST_SHA,run_id:RUN_ID,fence_namespace:NS,fence_function_sha256:v2.FUNCTIONS.write_fence[0],dependency_helper_sha256:FROZEN.helper_v2,fence_trigger_name:v2.FENCE_TRIGGER,fence_trigger_type:62,fence_trigger_enabled:'A',permit_signature:NS+'.mint_permit(uuid,uuid,oid[],text[],text)',fingerprint_includes_v3:true};}
function repairModule(){const repair=require('./recover-backup-user-parent-20261015');check(typeof repair.journalPrivateStore==='function','CUTOVER_LIFECYCLE_V1_VALIDATOR_REQUIRED');return repair;}
function combinedRepairRequired(){const repair=require('./recover-backup-user-parent-v3-20261016');check(same(repair.CUTOVER_V3_REPAIR_CONTRACT,expectedRepairMarker()),'CUTOVER_LIFECYCLE_COMBINED_REPAIR_REQUIRED');return repair;}
function sourceHashes(){return Object.fromEntries([['coordinator_v3',__filename],['coordinator_v2',require.resolve('./coordinate-replication-cutover-v2-20261015')],['capacity',require.resolve('./replication-cutover-capacity-20261015')],['helper_v2',require.resolve('./prepare-replication-cutover-v2-20261015')],['helper_v1',require.resolve('./preserve-replication-cutover-20261015')],['repair_v2',require.resolve('./recover-backup-user-parent-20261015')],['repair_v3',require.resolve('./recover-backup-user-parent-v3-20261016')]].map(([name,file])=>[name,v2.hash(fs.readFileSync(file))]));}
function assertFrozenSources(){const files={coordinator_v2:'./coordinate-replication-cutover-v2-20261015',capacity:'./replication-cutover-capacity-20261015',helper_v2:'./prepare-replication-cutover-v2-20261015',helper_v1:'./preserve-replication-cutover-20261015',repair_v2:'./recover-backup-user-parent-20261015'};check(Object.entries(files).every(([key,file])=>v2.hash(fs.readFileSync(require.resolve(file)))===FROZEN[key]),'CUTOVER_V3_FROZEN_SOURCE_CHANGED');}
function validateApproval(approval,{plan,runId,action,now=Date.now(),hashes=sourceHashes()}){
  assertFrozenSources();check(runId===RUN_ID&&approval?.version==='cutover_source_review_v3'&&UUID.test(approval.review_id||'')&&approval.run_id===runId&&approval.base_manifest_sha256===BASE_MANIFEST_SHA&&approval.manifest_sha256===plan.manifest_sha256,'CUTOVER_LIFECYCLE_REVIEW_REQUIRED');
  check(approval.sql_v2_sha256===EXPECTED_SQL_SHA&&approval.sql_v3_sha256===SQL_V3_SHA&&same(approval.reviewed_sources,hashes)&&Array.isArray(approval.actions)&&approval.actions.includes(action),'CUTOVER_LIFECYCLE_SOURCE_CHANGED');
  const reviewed=Date.parse(approval.reviewed_at),expires=Date.parse(approval.expires_at);
  check(Number.isFinite(reviewed)&&Number.isFinite(expires)&&reviewed<=now+60000&&expires>reviewed,'CUTOVER_LIFECYCLE_REVIEW_REQUIRED');
  // Emergency abort never depends on an unexpired capacity/review timer.
  if(action!=='release')check(expires>=now,'CUTOVER_LIFECYCLE_REVIEW_EXPIRED');
}

async function inspectSite(c,site){healthy(c);const present=(await c.query('SELECT to_regnamespace($1) IS NOT NULL AS present',[NS])).rows[0]?.present;
  if(!present)return {site,installed:false,cutover_ready:false};
  await v2.privateContract(c);
  const runs=(await c.query(`SELECT id,site,project_ref,manifest_sha256 FROM ${NS}.runs ORDER BY created_at`)).rows;
  const control=(await c.query(`SELECT run_id,active,epoch,deadline,deadline>clock_timestamp() AS within_deadline FROM ${NS}.control WHERE singleton`)).rows[0]||null;
  const registrations=(await c.query(`SELECT run_id,table_name,mode FROM ${NS}.registrations ORDER BY table_name`)).rows;
  const receipts=(await c.query(`SELECT capture_id,kind,run_id,phase,descriptor_sha256,created_at FROM ${NS}.receipts ORDER BY created_at DESC LIMIT 100`)).rows;
  const revisionPresent=(await c.query('SELECT to_regnamespace($1) IS NOT NULL AS present',[REVISION_NS])).rows[0]?.present;let revisions=[];
  if(revisionPresent){await privateRevisionContract(c);revisions=(await c.query(`SELECT run_id,site,project_ref,base_manifest_sha256,revision_manifest_sha256,created_at FROM ${REVISION_NS}.revisions ORDER BY run_id,site`)).rows;}
  return {site,installed:true,revision_installed:revisionPresent,revisions,runs,control,registrations,receipts,receipt_listing_capped:true,cutover_ready:false};
}
async function lockPrivate(c){await c.query(`LOCK TABLE ${['runs','registrations','control','fence_audit','permits','events','receipts','artifacts'].map(t=>NS+'.'+quote(t)).concat(REVISION_NS+'.revisions').join(',')} IN ACCESS SHARE MODE`);}
async function lockPublic(c,sitePlan,closing=false){await c.query(`LOCK TABLE ${sitePlan.tables.map(t=>'public.'+quote(t.name)).join(',')} IN ${closing?'SHARE':'ACCESS SHARE'} MODE`);}
async function runRecord(c,site,runId,plan){return revisionRecord(c,site,runId,plan);}
async function validatePublicPlan(c,site,plan,env){
  const actual=await v2.inventorySite(c,site,env),expected=plan.descriptor.sites[site];
  check(actual.held.length===0&&same(actual.tables.map(t=>t.name),expected.tables.map(t=>t.name))&&same(actual.derived.map(t=>[t.name,t.view_sha256,t.dependencies]),expected.derived.map(t=>[t.name,t.view_sha256,t.dependencies]))&&same(actual.excluded,expected.excluded),'CUTOVER_LIFECYCLE_SCOPE_CHANGED');
  check(same(actual.tables.map(immutableEntry),expected.tables.map(immutableEntry))&&same(actual.derived.map(immutableEntry),expected.derived.map(immutableEntry)),'CUTOVER_LIFECYCLE_PUBLIC_CATALOG_CHANGED');
}
async function registrations(c,runId){return (await c.query(`SELECT table_oid::text AS oid,table_name,run_id,key_columns::text[],key_types::text[],mode,catalog_sha256 FROM ${NS}.registrations ORDER BY table_name`)).rows;}
async function hookMetadata(c){return (await c.query(`SELECT t.tgrelid::text AS oid,t.tgname::text AS name,t.tgtype,t.tgenabled::text AS enabled,t.tgnargs,t.tgqual IS NULL AS no_when,t.tgattr::text AS attributes,
    t.tgfoid=to_regprocedure($1) AS correct_fence,t.tgfoid=to_regprocedure($2) AS correct_capture
    FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname=ANY($3::text[]) ORDER BY t.tgrelid,t.tgname`,[NS+'.write_fence()',NS+'.capture_digest()',[v2.FENCE_TRIGGER,v2.CAPTURE_TRIGGER]])).rows;}
function hooks(entry,registered,runId,metadata){
  const rows=metadata.filter(r=>r.oid===entry.oid);
  if(!registered){check(rows.length===0,'CUTOVER_LIFECYCLE_ORPHAN_TRIGGER');return;}
  check(registered.run_id===runId&&registered.oid===entry.oid&&registered.table_name===entry.name&&registered.mode===entry.mode&&registered.catalog_sha256===entry.catalog_sha256&&same(registered.key_columns,entry.key_columns)&&same(registered.key_types,entry.key_types),'CUTOVER_LIFECYCLE_REGISTRATION_CHANGED');
  const count=entry.mode==='v1_external'?1:2;
  check(rows.length===count&&rows.every(t=>t.enabled==='A'&&t.tgnargs===0&&t.no_when&&t.attributes===''),'CUTOVER_LIFECYCLE_TRIGGER_CHANGED');
  check(rows.find(t=>t.name===v2.FENCE_TRIGGER)?.correct_fence&&rows.find(t=>t.name===v2.FENCE_TRIGGER)?.tgtype===62,'CUTOVER_LIFECYCLE_TRIGGER_CHANGED');
  if(entry.mode!=='v1_external')check(rows.find(t=>t.name===v2.CAPTURE_TRIGGER)?.correct_capture&&rows.find(t=>t.name===v2.CAPTURE_TRIGGER)?.tgtype===29,'CUTOVER_LIFECYCLE_TRIGGER_CHANGED');
}

async function v1Catalogs(c,regs){
  const rows=(await c.query(`SELECT c.oid::text AS oid,c.relname::text AS name,
    ARRAY(SELECT a.attname::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord)::text[] AS pk,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',a.attname::text,'type',a.atttypid::regtype::text,'atttypmod',a.atttypmod,'attnotnull',a.attnotnull,'attgenerated',a.attgenerated::text,'attidentity',a.attidentity::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns,
    coalesce((SELECT jsonb_agg(jsonb_build_object('conname',p.conname::text,'contype',p.contype::text,'convalidated',p.convalidated,'definition',pg_get_constraintdef(p.oid,true)) ORDER BY p.conname) FROM pg_constraint p WHERE p.conrelid=c.oid),'[]'::jsonb) AS constraints,
    coalesce((SELECT jsonb_agg(jsonb_build_object('tgname',t.tgname::text,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal AND t.tgname<>ALL($2::text[]) AND NOT(t.tgname=$3 AND c.oid=ANY($4::oid[]))),'[]'::jsonb) AS triggers
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r' AND c.relpersistence='p' ORDER BY c.relname`,[v2.V1_TABLES,[V1_CAPTURE,V1_TRUNCATE],v2.FENCE_TRIGGER,regs.map(r=>r.oid)])).rows;
  check(rows.length===v2.V1_TABLES.length&&rows.every(r=>same(r.pk,['id'])&&r.columns.some(a=>a.name==='id'&&a.type==='uuid'&&a.attnotnull)&&r.constraints.every(p=>p.convalidated)),'CUTOVER_LIFECYCLE_V1_CATALOG_CHANGED');
  return rows.map(({oid,name,columns,constraints,triggers,pk})=>({oid,name,sha:v2.hash(v2.stable({columns,constraints,triggers,pk}))}));
}
async function validateV1Site(c,site,runId,plan,regs,hookRows){
  await repairModule().journalPrivateStore(c);
  const fn=(await c.query(`SELECT p.oid::text AS oid,p.prosrc AS source,pg_get_functiondef(p.oid) AS definition,p.proowner=current_user::regrole::oid AS owned,p.prosecdef,p.proconfig::text[],p.pronargs,p.prorettype='trigger'::regtype AS trigger_return,l.lanname::text AS language,
    NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS private FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure($1)`,[V1_NS+'.capture_identity_change()'])).rows[0];
  check(fn&&fn.owned&&fn.private&&fn.prosecdef&&fn.pronargs===0&&fn.trigger_return&&fn.language==='plpgsql'&&v2.hash(fn.source.replace(/\r\n/g,'\n'))===v1.CAPTURE_BODY_SHA256&&same((fn.proconfig||[]).map(s=>s.toLowerCase()).sort(),['search_path=pg_catalog','timezone=utc']),'CUTOVER_LIFECYCLE_V1_FUNCTION_CHANGED');
  const expectedSite=plan.descriptor.sites[site],catalogs=await v1Catalogs(c,regs);
  const oldRegs=(await c.query(`SELECT g.table_name,g.table_oid::text AS oid,g.pk_columns::text[],g.catalog_sha256,g.run_id,r.operation,r.site,r.definition,r.definition_sha256 FROM ${V1_NS}.registrations g JOIN ${V1_NS}.runs r ON r.id=g.run_id WHERE g.table_name=ANY($1::text[]) ORDER BY g.table_name`,[v2.V1_TABLES])).rows;
  check(oldRegs.length===v2.V1_TABLES.length,'CUTOVER_LIFECYCLE_V1_REGISTRATION_CHANGED');
  const allTriggers=(await c.query(`SELECT tgrelid::text AS oid,tgname::text AS name,tgtype,tgenabled::text AS enabled,tgnargs,tgqual IS NULL AS no_when,tgattr::text AS attributes,tgfoid=$2::oid AS correct_function FROM pg_trigger WHERE tgrelid=ANY($1::oid[]) AND NOT tgisinternal AND tgname=ANY($3::text[]) ORDER BY tgrelid,tgname`,[catalogs.map(r=>r.oid),fn.oid,[V1_CAPTURE,V1_TRUNCATE]])).rows;
  for(const table of v2.V1_TABLES){const entry=expectedSite.tables.find(t=>t.name===table);check(entry?.mode==='v1_external','CUTOVER_LIFECYCLE_V1_SCOPE_REQUIRED');
    const reg=regs.find(r=>r.table_name===table);hooks(entry,reg,runId,hookRows);
    const old=oldRegs.find(r=>r.table_name===table),d=old?.definition,cat=catalogs.find(r=>r.name===table);
    check(old&&old.run_id===runId&&old.oid===entry.oid&&same(old.pk_columns,['id'])&&old.catalog_sha256===cat.sha&&old.operation==='current_state_cutover_v1'&&old.site===site&&d?.operation===old.operation&&d.site===site&&d.project_ref===expectedSite.project_ref&&same(d.tables,v2.V1_TABLES)&&same(d.skip,plan.descriptor.flags.skip)&&d.capture_body_sha256===v1.CAPTURE_BODY_SHA256&&d.capture_function_sha256===v2.hash(fn.definition)&&v2.hash(v2.stable(d))===old.definition_sha256,'CUTOVER_LIFECYCLE_V1_REGISTRATION_CHANGED');
    const ts=allTriggers.filter(t=>t.oid===entry.oid);
    check(ts.length===2&&ts.every(t=>t.enabled==='A'&&t.correct_function&&t.tgnargs===0&&t.no_when&&t.attributes==='')&&ts.find(t=>t.name===V1_CAPTURE)?.tgtype===29&&ts.find(t=>t.name===V1_TRUNCATE)?.tgtype===34,'CUTOVER_LIFECYCLE_V1_TRIGGER_CHANGED');
  }
}
async function validateSite(c,{site,runId,plan,env,requireRun=true,requireFull=false}){
  await v2.privateContract(c);await privateRevisionContract(c);await lockPrivate(c);await validatePublicPlan(c,site,plan,env);
  const basePlan=await baseRecord(c,site,runId);validateRevisionPlan(plan,basePlan);
  if(requireRun)await runRecord(c,site,runId,plan);
  const regs=await registrations(c,runId),expected=plan.descriptor.sites[site].tables,hookRows=await hookMetadata(c);
  check(regs.every(r=>r.run_id===runId&&expected.some(t=>t.name===r.table_name)),'CUTOVER_LIFECYCLE_REGISTRATION_CHANGED');
  check(basePlan.descriptor.sites[site].tables.every(t=>regs.some(r=>r.table_name===t.name)),'CUTOVER_V3_BASE_COVERAGE_REQUIRED');
  check(hookRows.every(r=>expected.some(t=>t.oid===r.oid)),'CUTOVER_LIFECYCLE_ORPHAN_TRIGGER');
  for(const entry of expected)hooks(entry,regs.find(r=>r.table_name===entry.name),runId,hookRows);
  await validateV1Site(c,site,runId,plan,regs,hookRows);
  if(requireFull){check(regs.length===expected.length,'CUTOVER_LIFECYCLE_COVERAGE_INCOMPLETE');combinedRepairRequired();}
  return regs;
}
async function validateRepairSite(c,{site,runId,plan,expectedEpoch}){
  assertFrozenSources();
  check(runId===RUN_ID&&['primary','backup'].includes(site)&&UUID.test(expectedEpoch||''),'CUTOVER_V3_REPAIR_CONTEXT_REQUIRED');
  const basePlan=await baseRecord(c,site,runId);validateRevisionPlan(plan,basePlan);
  const f=basePlan.descriptor.flags,env={SUPABASE_REPLICATION_LIGHT:f.light?'1':'0',SUPABASE_REPLICATION_SKIP_TABLES:f.skip.join(','),SUPABASE_REPLICATION_STORAGE:f.storage_enabled?'1':'0'};
  await validateSite(c,{site,runId,plan,env,requireFull:true});
  const control=(await c.query(`SELECT run_id,epoch,active,deadline::text,changed_at::text,deadline>clock_timestamp() AS within_deadline FROM ${NS}.control WHERE singleton FOR SHARE`)).rows[0];
  check(control?.run_id===runId&&control.epoch===expectedEpoch&&control.active&&control.within_deadline,'CUTOVER_V3_REPAIR_FENCE_REQUIRED');
  const revision=await revisionRecord(c,site,runId,plan);return {control,revision,basePlan,plan};
}
async function readRepairSite(c,{site,context}){
  check(context&&same(Object.keys(context).sort(),['base_manifest_sha256','epochs','manifest_sha256','run_id'])&&context.run_id===RUN_ID&&context.base_manifest_sha256===BASE_MANIFEST_SHA&&HEX.test(context.manifest_sha256||'')&&context.epochs&&same(Object.keys(context.epochs).sort(),['backup','primary'])&&Object.values(context.epochs).every(x=>UUID.test(x||'')),'CUTOVER_V3_REPAIR_CONTEXT_REQUIRED');
  await v2.privateContract(c);await privateRevisionContract(c);
  const row=(await c.query(`SELECT manifest FROM ${REVISION_NS}.revisions WHERE run_id=$1 AND site=$2 AND revision_manifest_sha256=$3`,[context.run_id,site,context.manifest_sha256])).rows[0];
  check(row,'CUTOVER_V3_REVISION_RECORD_REQUIRED');const plan={descriptor:row.manifest,manifest_sha256:context.manifest_sha256};
  return validateRepairSite(c,{site,runId:context.run_id,plan,expectedEpoch:context.epochs[site]});
}

async function measure(c,site,plan,tables,env){check(Array.isArray(tables)&&tables.length>0&&tables.length<=5&&new Set(tables).size===tables.length&&tables.every(t=>plan.descriptor.sites[site].tables.some(e=>e.name===t)),'CUTOVER_LIFECYCLE_BATCH_REQUIRED');
  try{await begin(c,true);validateRevisionPlan(plan,await baseRecord(c,site,RUN_ID));await validatePublicPlan(c,site,plan,env);const measurements=[];
    for(const name of [...tables].sort()){const row=await measureTable(c,name);measurements.push({table:name,measured_at:new Date().toISOString(),basis:'postgres_to_jsonb_text_utf8',...row});}
    healthy(c);await c.query('ROLLBACK');return {site,manifest_sha256:plan.manifest_sha256,measured_at:new Date().toISOString(),measurements,production_rows_changed:0,cutover_ready:false};
  }catch(e){await rollback(c);throw e;}}

function validateInputs({action,site,plan,runId,env}){
  assertFrozenSources();
  check(ACTIONS.includes(action)&&['primary','backup'].includes(site),'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');
  if(action==='inspect')return;
  v2.validatePlan(plan);check(runId===RUN_ID&&plan.descriptor.scope_revision?.run_id===RUN_ID&&plan.descriptor.scope_revision?.base_manifest_sha256===BASE_MANIFEST_SHA,'CUTOVER_V3_RUN_REQUIRED');
  if(action==='release')return;
  check(plan.descriptor.flags.light===(env.SUPABASE_REPLICATION_LIGHT==='1')&&same(plan.descriptor.flags.skip,v1.skipTables(env))&&plan.descriptor.flags.storage_enabled===(env.SUPABASE_REPLICATION_LIGHT!=='1'&&env.SUPABASE_REPLICATION_STORAGE!=='0'),'CUTOVER_LIFECYCLE_FLAGS_CHANGED');
  check(!plan.descriptor.flags.storage_enabled,'CUTOVER_LIFECYCLE_STORAGE_COVERAGE_REQUIRED');
  const sitePlan=plan.descriptor.sites[site];
  check(sitePlan.tables.length>0&&sitePlan.tables.length<=900&&new Set(sitePlan.tables.map(t=>t.name)).size===sitePlan.tables.length,'CUTOVER_LIFECYCLE_SCOPE_INVALID');
}
function batchTables(sitePlan,names){
  check(Array.isArray(names)&&names.length>0&&names.length<=5&&new Set(names).size===names.length,'CUTOVER_LIFECYCLE_BATCH_REQUIRED');
  const entries=[...names].sort().map(n=>sitePlan.tables.find(t=>t.name===n));check(entries.every(Boolean),'CUTOVER_LIFECYCLE_SCOPE_INVALID');return entries;
}
async function measureTable(c,name){return (await c.query(`SELECT count(*)::text AS rows,coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS raw_bytes,coalesce(sum(octet_length(to_jsonb(to_jsonb(t)::text)::text)),0)::text AS encoded_bytes,coalesce(max(octet_length(to_jsonb(t)::text)),0)::text AS max_row_bytes FROM public.${quote(name)} t`)).rows[0];}
async function initSite(c,ctx){return mutationTransaction(c,ctx,{action:'init',site:ctx.site,run_id:ctx.runId},async()=>{
  await lockPublic(c,ctx.plan.descriptor.sites[ctx.site]);await validateSite(c,{...ctx,requireRun:false});
  const control=(await c.query(`SELECT run_id,epoch,active FROM ${NS}.control WHERE singleton FOR SHARE`)).rows[0];
  check(control?.run_id===ctx.runId&&!control.active,'CUTOVER_LIFECYCLE_REGISTER_WHILE_FENCED');
  const present=(await c.query(`SELECT run_id FROM ${REVISION_NS}.revisions`)).rows;
  if(present.length){await runRecord(c,ctx.site,ctx.runId,ctx.plan);return {initialized:true,existing:true,epoch:control.epoch,active:false};}
  await c.query(`INSERT INTO ${REVISION_NS}.revisions(run_id,site,project_ref,base_manifest_sha256,revision_manifest_sha256,manifest) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[ctx.runId,ctx.site,ctx.plan.descriptor.sites[ctx.site].project_ref,BASE_MANIFEST_SHA,ctx.plan.manifest_sha256,JSON.stringify(ctx.plan.descriptor)]);
  await runRecord(c,ctx.site,ctx.runId,ctx.plan);
  return {initialized:true,existing:false,epoch:control.epoch,active:false,base_manifest_sha256:BASE_MANIFEST_SHA,manifest_sha256:ctx.plan.manifest_sha256};
});}
async function registerSite(c,ctx){const entries=batchTables(ctx.plan.descriptor.sites[ctx.site],ctx.tables);combinedRepairRequired();
  check(ctx.site==='primary'&&same(entries.map(e=>e.name),[ADDITION]),'CUTOVER_V3_ADDITION_ONLY');
  return mutationTransaction(c,ctx,{action:'register',site:ctx.site,run_id:ctx.runId,tables:entries.map(e=>e.name)},async()=>{
    // Lock before the first MVCC read: all old writers finish before the
    // repeatable-read registration/catalog snapshot is established.
    await c.query(`LOCK TABLE ${entries.map(e=>'public.'+quote(e.name)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    const regs=await validateSite(c,ctx),installed=[];
    const control=(await c.query(`SELECT run_id,active FROM ${NS}.control WHERE singleton FOR SHARE`)).rows[0];
    check(control?.run_id===ctx.runId&&!control.active,'CUTOVER_LIFECYCLE_REGISTER_WHILE_FENCED');
    const fresh=entries.filter(entry=>!regs.some(r=>r.table_name===entry.name)),ddl=[];
    if(fresh.length)await c.query(`INSERT INTO ${NS}.registrations(table_oid,table_name,run_id,key_columns,key_types,mode,catalog_sha256)
      SELECT table_oid::oid,table_name,run_id::uuid,key_columns,key_types,mode,catalog_sha256 FROM jsonb_to_recordset($1::jsonb)
      AS x(table_oid text,table_name text,run_id text,key_columns text[],key_types text[],mode text,catalog_sha256 text)`,[JSON.stringify(fresh.map(e=>({table_oid:e.oid,table_name:e.name,run_id:ctx.runId,key_columns:e.key_columns,key_types:e.key_types,mode:e.mode,catalog_sha256:e.catalog_sha256})))]);
    for(const entry of fresh){
      ddl.push(`CREATE TRIGGER ${quote(v2.FENCE_TRIGGER)} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.${quote(entry.name)} FOR EACH STATEMENT EXECUTE FUNCTION ${NS}.write_fence()`);
      ddl.push(`ALTER TABLE public.${quote(entry.name)} ENABLE ALWAYS TRIGGER ${quote(v2.FENCE_TRIGGER)}`);
      if(entry.mode!=='v1_external'){
        ddl.push(`CREATE TRIGGER ${quote(v2.CAPTURE_TRIGGER)} AFTER INSERT OR UPDATE OR DELETE ON public.${quote(entry.name)} FOR EACH ROW EXECUTE FUNCTION ${NS}.capture_digest()`);
        ddl.push(`ALTER TABLE public.${quote(entry.name)} ENABLE ALWAYS TRIGGER ${quote(v2.CAPTURE_TRIGGER)}`);
      }installed.push(entry.name);
    }
    if(ddl.length){const sql=ddl.join(';');if(typeof c.exec==='function')await c.exec(sql);else await c.query(sql);}
    const after=await validateSite(c,ctx);return {registered:installed,registered_total:after.length,expected_total:ctx.plan.descriptor.sites[ctx.site].tables.length};
  });
}
async function transition(c,ctx,active){check(UUID.test(ctx.expectedEpoch||'')&&UUID.test(ctx.newEpoch||'')&&ctx.expectedEpoch!==ctx.newEpoch,'CUTOVER_LIFECYCLE_EPOCH_REQUIRED');
  if(active){const deadline=Date.parse(ctx.deadline);check(Number.isFinite(deadline)&&deadline>Date.now()&&deadline<=Date.now()+15*60000,'CUTOVER_LIFECYCLE_DEADLINE_REQUIRED');}
  return mutationTransaction(c,ctx,{action:active?'activate':'release',site:ctx.site,run_id:ctx.runId,expected_epoch:ctx.expectedEpoch,new_epoch:ctx.newEpoch},async()=>{
    if(active){await lockPublic(c,ctx.plan.descriptor.sites[ctx.site]);await validateSite(c,{...ctx,requireFull:true});}
    else {await v2.privateContract(c);await lockPrivate(c);await runRecord(c,ctx.site,ctx.runId,ctx.plan);}
    await c.query(`SELECT ${NS}.transition_fence($1::uuid,$2::uuid,$3::uuid,$4::boolean,$5::timestamptz,$6::text)`,[ctx.runId,ctx.expectedEpoch,ctx.newEpoch,active,active?ctx.deadline:null,active?'closing_capture':'operator_recovery']);
    return {active,epoch:ctx.newEpoch,deadline:active?ctx.deadline:null,manual_release_required:active};
  });
}

const JOURNAL_STREAMS=['identity-events:v1','identity-events:v2'];
function captureMeta(ctx){return v2.descriptor({run_id:ctx.runId,capture_id:ctx.captureId,site:ctx.site,phase:ctx.phase,manifest_sha256:ctx.plan.manifest_sha256,key_id:ctx.keyId,fence_epoch:ctx.phase==='closing'?ctx.expectedEpoch:null,
  streams:[...ctx.plan.descriptor.sites[ctx.site].tables.map(t=>'table:'+t.name),'schema-manifest',...JOURNAL_STREAMS]});}
function validateSecret(secret){check(typeof secret==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(secret)&&Buffer.from(secret,'base64').length===32&&Buffer.from(secret,'base64').toString('base64')===secret,'CUTOVER_LIFECYCLE_KEY_UNAVAILABLE');}
async function scalarStream(c,namespace,runId){return (await c.query(`SELECT count(*)::text AS rows,coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS raw_bytes,coalesce(max(octet_length(to_jsonb(t)::text)),0)::text AS max_row_bytes FROM ${namespace}.events t WHERE run_id=$1`,[runId])).rows[0];}
async function captureSizing(c,ctx){
  const measurements=ctx.capacity.measurements;
  for(const entry of ctx.plan.descriptor.sites[ctx.site].tables){const current=await measureTable(c,entry.name),reviewed=measurements.find(m=>m.table===entry.name);
    check(reviewed&&['rows','raw_bytes','max_row_bytes',...(ctx.capacity.version===2?['encoded_bytes']:[])].every(k=>BigInt(current[k])<=BigInt(reviewed[k]))&&BigInt(current.max_row_bytes)<=BigInt(v2.ROW_BYTES),'CUTOVER_LIFECYCLE_SIZING_CHANGED');}
  const journalSizes=[];for(const namespace of [V1_NS,NS])journalSizes.push(await scalarStream(c,namespace,ctx.runId));
  const capacity=require('./replication-cutover-capacity-20261015');
  capacity.validateJournalCapacity({rows:journalSizes.reduce((n,s)=>n+BigInt(s.rows),0n).toString(),raw_bytes:journalSizes.reduce((n,s)=>n+BigInt(s.raw_bytes),0n).toString(),max_row_bytes:journalSizes.reduce((n,s)=>BigInt(s.max_row_bytes)>n?BigInt(s.max_row_bytes):n,0n).toString(),stream_count:2},ctx.capacityResult);
  check(BigInt(Buffer.byteLength(v2.stable(ctx.plan.descriptor)))<=BigInt(ctx.capacity.metadata_raw_bytes),'CUTOVER_LIFECYCLE_METADATA_BUDGET');
  return journalSizes;
}
function recheckCaptureEvidence(ctx,sizes){
  validateApproval(ctx.approval,{...ctx,action:'capture'});
  const capacity=require('./replication-cutover-capacity-20261015');
  ctx.capacityResult=capacity.validateCapacity(ctx.capacity,{...ctx,action:'capture'});
  if(sizes)capacity.validateJournalCapacity({rows:sizes.reduce((n,s)=>n+BigInt(s.rows),0n).toString(),raw_bytes:sizes.reduce((n,s)=>n+BigInt(s.raw_bytes),0n).toString(),max_row_bytes:sizes.reduce((n,s)=>BigInt(s.max_row_bytes)>n?BigInt(s.max_row_bytes):n,0n).toString(),stream_count:2},ctx.capacityResult);
}
function guardedStreamClient(c,ctx){return {query:async(sql,args)=>{
  const fetch=/^FETCH FORWARD /.test(sql);if(fetch)recheckCaptureEvidence(ctx);healthy(c);
  const result=await c.query(sql,args);healthy(c);if(fetch)recheckCaptureEvidence(ctx);return result;
}};}
async function writeRawStream(c,ctx,meta,stream,rawRows){
  const raw=JSON.stringify({raw_rows:rawRows});check(Buffer.byteLength(raw)<=v2.CHUNK_BYTES,'CUTOVER_LIFECYCLE_METADATA_TOO_LARGE');
  await v2.writeArtifact(c,v2.encrypt(raw,{...meta,stream,part:0,rows:rawRows.length},ctx.secret));
  const digest=crypto.createHash('sha256');for(const r of rawRows)digest.update(r+'\n');
  return {stream,rows:String(rawRows.length),parts:1,sha256:digest.digest('hex')};
}
async function streamJournal(c,ctx,meta,namespace,stream,size){
  const cursor='cutover_journal_'+crypto.randomBytes(6).toString('hex');
  // Re-enumerate all committed events in this snapshot. Sequence order is not
  // commit order, and no max-sequence watermark ever acknowledges an event.
  await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS raw FROM ${namespace}.events t WHERE run_id='${ctx.runId}'::uuid ORDER BY id`);
  let part=0,count=0n,pending=[],bytes=16;const digest=crypto.createHash('sha256');
  async function flush(){await v2.writeArtifact(c,v2.encrypt(JSON.stringify({raw_rows:pending}),{...meta,stream,part,rows:pending.length},ctx.secret));part++;pending=[];bytes=16;}
  try{const fetchRows=Math.max(1,Math.min(v2.FETCH_MAX_ROWS,Math.floor(v2.FETCH_RAW_BUDGET/Math.max(1,Number(size.max_row_bytes)))));
    for(;;){recheckCaptureEvidence(ctx);const rows=(await c.query(`FETCH FORWARD ${fetchRows} FROM ${cursor}`)).rows;
      for(const row of rows){check(typeof row.raw==='string'&&Buffer.byteLength(row.raw)<=v2.ROW_BYTES,'CUTOVER_LIFECYCLE_ROW_TOO_LARGE');const extra=Buffer.byteLength(JSON.stringify(row.raw))+1;
        check(extra+16<=v2.CHUNK_BYTES,'CUTOVER_LIFECYCLE_ROW_TOO_LARGE');if(pending.length&&bytes+extra>v2.CHUNK_BYTES)await flush();pending.push(row.raw);bytes+=extra;count++;digest.update(row.raw+'\n');}
      if(rows.length<fetchRows)break;
    }if(pending.length||part===0)await flush();
  }finally{try{await c.query(`CLOSE ${cursor}`);}catch{}}
  check(count===BigInt(size.rows),'CUTOVER_LIFECYCLE_STREAM_COUNT');return {stream,rows:count.toString(),parts:part,sha256:digest.digest('hex')};
}
async function capture(c,ctx){validateSecret(ctx.secret);const meta=captureMeta(ctx),context={action:'capture',site:ctx.site,run_id:ctx.runId,capture_id:ctx.captureId,phase:ctx.phase};
  const reservation=await transaction(c,{...context,receipt:'reserved'},async()=>{
    await lockPublic(c,ctx.plan.descriptor.sites[ctx.site]);await validateSite(c,{...ctx,requireFull:true});
    const leases=(await c.query(`SELECT capture_id FROM ${NS}.receipts WHERE kind='reserved' ORDER BY capture_id`)).rows;
    const proposed=leases.some(r=>r.capture_id===ctx.captureId)?0:1;
    check(BigInt(leases.length+proposed)<=BigInt(ctx.capacity.retained_capture_count),'CUTOVER_LIFECYCLE_RETAINED_CAPTURE_BUDGET');
    return v2.reserve(c,meta);
  },'SERIALIZABLE',()=>recheckCaptureEvidence(ctx));
  if(reservation.state==='committed')return {capture_id:ctx.captureId,...await verify(c,ctx),existing:true};
  let journalSizes;
  await transaction(c,{...context,receipt:'committed'},async()=>{
    // Closing locks are taken before the first MVCC query. They drain even
    // reviewed owner-permit writers, then hold them until the capture commits.
    await lockPublic(c,ctx.plan.descriptor.sites[ctx.site],ctx.phase==='closing');
    await validateSite(c,{...ctx,requireFull:true});
    if(ctx.phase==='closing')await v2.lockClosingFence(c,meta);
    const state=await v2.checkpointState(c,meta);check(state.state==='reserved','CUTOVER_LIFECYCLE_RESERVATION_CHANGED');
    const sizes=await captureSizing(c,ctx),streams=[],streamClient=guardedStreamClient(c,ctx);journalSizes=sizes;
    for(const entry of ctx.plan.descriptor.sites[ctx.site].tables){recheckCaptureEvidence(ctx);const s=await v2.streamTable(streamClient,entry,meta,ctx.secret,a=>v2.writeArtifact(c,a));streams.push({stream:s.stream,rows:s.rows,parts:s.parts,sha256:s.sha256});}
    streams.push(await writeRawStream(c,ctx,meta,'schema-manifest',[v2.stable(ctx.plan.descriptor)]));
    for(let i=0;i<2;i++){recheckCaptureEvidence(ctx,sizes);streams.push(await streamJournal(c,ctx,meta,[V1_NS,NS][i],JOURNAL_STREAMS[i],sizes[i]));}
    const root=JSON.stringify({descriptor:meta,streams});check(Buffer.byteLength(root)<=v2.CHUNK_BYTES,'CUTOVER_LIFECYCLE_METADATA_TOO_LARGE');
    await v2.writeArtifact(c,v2.encrypt(root,{...meta,stream:'manifest',part:0,rows:meta.streams.length},ctx.secret));
    await v2.seal(c,meta,ctx.secret);
    if(ctx.phase==='closing')await v2.lockClosingFence(c,meta);
    recheckCaptureEvidence(ctx,sizes);
    return {sealed:true};
  },'REPEATABLE READ',()=>recheckCaptureEvidence(ctx,journalSizes));
  return {capture_id:ctx.captureId,phase:ctx.phase,committed:true,fresh_verification_required:true};
}
async function verify(c,ctx){validateSecret(ctx.secret);const meta=captureMeta(ctx);
  try{await begin(c,true);await runRecord(c,ctx.site,ctx.runId,ctx.plan);const result=await v2.verifyCheckpoint(c,meta,ctx.secret);healthy(c);await c.query('ROLLBACK');return {...result,capture_id:ctx.captureId,phase:ctx.phase};}catch(e){await rollback(c);throw e;}
}
async function runAction(c,options){const ctx={env:{},...options};watch(c);healthy(c);validateInputs(ctx);
  if(ctx.action==='inspect')return inspectSite(c,ctx.site);
  if(ctx.action==='measure')return measure(c,ctx.site,ctx.plan,ctx.tables,ctx.env);
  if(ctx.action==='verify')return verify(c,ctx);
  if(ctx.action==='validate'){try{await begin(c,true);await validateSite(c,ctx);await c.query('ROLLBACK');return {validated:true,production_rows_changed:0,cutover_ready:false};}catch(e){await rollback(c);throw e;}}
  validateApproval(ctx.approval,{...ctx,action:ctx.action});
  ctx.capacityResult=require('./replication-cutover-capacity-20261015').validateCapacity(ctx.capacity,{...ctx,action:ctx.action});
  let result;
  if(ctx.action==='init')result=await initSite(c,ctx);
  else if(ctx.action==='register')result=await registerSite(c,ctx);
  else if(ctx.action==='activate')result=await transition(c,ctx,true);
  else if(ctx.action==='release')result=await transition(c,ctx,false);
  else if(ctx.action==='capture')result=await capture(c,ctx);
  return {site:ctx.site,run_id:ctx.runId,action:ctx.action,...result,cutover_ready:false,old_process_stopped_proven:false,historic_ram_recovered:false};
}

function parseArgs(args){const out={},names={'--action':'action','--site':'site','--plan':'planFile','--approval':'approvalFile','--capacity':'capacityFile','--run-id':'runId','--tables':'tables','--new-epoch':'newEpoch','--expected-epoch':'expectedEpoch','--deadline':'deadline','--capture-id':'captureId','--phase':'phase','--key-id':'keyId','--output':'outputFile'};
  for(let i=0;i<args.length;i++){const flag=args[i];if(flag==='--key-stdin'){check(out.keyStdin===undefined,'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');out.keyStdin=true;continue;}
    const key=names[flag];check(key&&out[key]===undefined&&typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');out[key]=args[++i];}
  check(ACTIONS.includes(out.action)&&['primary','backup'].includes(out.site),'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');
  if(out.action!=='inspect')check(out.planFile&&UUID.test(out.runId||''),'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');
  if(!READ_ONLY.has(out.action))check(out.approvalFile,'CUTOVER_LIFECYCLE_REVIEW_REQUIRED');
  if(!READ_ONLY.has(out.action)&&out.action!=='release')check(out.capacityFile,'CUTOVER_LIFECYCLE_CAPACITY_REQUIRED');
  if(['measure','register'].includes(out.action)){out.tables=out.tables?.split(',');check(out.tables?.length&&out.tables.every(t=>t.length>0),'CUTOVER_LIFECYCLE_BATCH_REQUIRED');}else check(out.tables===undefined,'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');
  if(['capture','verify'].includes(out.action))check(out.keyStdin&&UUID.test(out.captureId||'')&&UUID.test(out.keyId||'')&&['baseline','closing'].includes(out.phase),'CUTOVER_LIFECYCLE_CAPTURE_ARGUMENT_REQUIRED');
  else check(!out.keyStdin&&out.captureId===undefined&&out.keyId===undefined&&out.phase===undefined,'CUTOVER_LIFECYCLE_ARGUMENT_INVALID');
  return out;
}
function readMetadata(file){const stat=fs.statSync(file);check(stat.isFile()&&stat.size>0&&stat.size<=16777216,'CUTOVER_LIFECYCLE_METADATA_FILE_REQUIRED');try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{fail('CUTOVER_LIFECYCLE_METADATA_FILE_REQUIRED');}}
function failureResult(e,ctx={}){const out={ok:false,reason:safeCode(e),cutover_ready:false};
  if(e?.cutoverCode==='CUTOVER_LIFECYCLE_COMMIT_OUTCOME_UNKNOWN'){
    out.inspect_required=true;for(const key of ['action','site','run_id','capture_id','phase','receipt','expected_epoch','new_epoch'])if(typeof e[key]==='string')out[key]=e[key];
  }else{if(ACTIONS.includes(ctx.action))out.action=ctx.action;if(['primary','backup'].includes(ctx.site))out.site=ctx.site;}
  return out;
}
function persistResult(output,file){if(!file)return output;try{fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});return {...output,output_saved:true};}
  catch{return {...output,output_saved:false,output_warning:'CUTOVER_LIFECYCLE_OUTPUT_NOT_SAVED'};}}
async function main(){const opts=parseArgs(process.argv.slice(2));
  require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
  const context={...opts,env:process.env,plan:opts.planFile?readMetadata(opts.planFile):undefined,approval:opts.approvalFile?readMetadata(opts.approvalFile):undefined,capacity:opts.capacityFile?readMetadata(opts.capacityFile):undefined};
  validateInputs(context);
  if(opts.keyStdin){const input=fs.readFileSync(0);try{check(input.length<=128,'CUTOVER_LIFECYCLE_KEY_UNAVAILABLE');context.secret=input.toString('utf8').trim();validateSecret(context.secret);}finally{input.fill(0);}}
  const {Client}=require('pg'),connectionString=v1.validateUrl(opts.site==='primary'?(process.env.SUPABASE_DB_URL||process.env.SUPABASE_DB_DIRECT_URL):(process.env.SUPABASE_BACKUP_DB_URL||process.env.SUPABASE_BACKUP_DB_DIRECT_URL),opts.site==='primary'?v1.PRIMARY:v1.BACKUP);
  const c=new Client({connectionString,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});watch(c);
  try{await c.connect();const result=await runAction(c,context),output=persistResult({ok:true,...result},opts.outputFile);
    console.log(JSON.stringify(output));
  }finally{context.secret=undefined;await c.end().catch(()=>{});}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify(failureResult(e)));process.exitCode=1;});
module.exports={ACTIONS,runAction,runRecord,validateApproval,validateInputs,validateSite,validateV1Site,validatePublicPlan,inspectSite,measure,sourceHashes,expectedRepairMarker,transaction,safeCode,captureMeta,streamJournal,validateSecret,parseArgs,failureResult,persistResult,
  RUN_ID,BASE_MANIFEST_SHA,ADDITION,REVISION_NS,SQL_V3_FILE,SQL_V3_SHA,FROZEN,createRevisionPlan,validateRevisionPlan,privateRevisionShape,privateRevisionContract,baseRecord,revisionRecord,readRepairSite,validateRepairSite};
