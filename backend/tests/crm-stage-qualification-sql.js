'use strict';
// Actual isolated PostgreSQL. No network, real customer or provider event.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID,createHash } = require('node:crypto');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { baselineSQL } = require('./website-feedback-sql');
const { qualificationContext } = require('../src/modules/marketingAutomation/qualificationContext');
const { prepareWebsiteFeedback } = require('../src/modules/marketingAutomation/websiteFeedbackOutbox');
const read = name => fs.readFileSync(path.resolve(__dirname, '../../database', name), 'utf8');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635', OTHER = randomUUID();
const actor = randomUUID(), owner = randomUUID(), pipeline = randomUUID();
const stages = { cold: randomUUID(), warm: randomUUID(), hot: randomUUID(), deal: randomUUID(), lost: randomUUID() };
const tests = [], test = (name, run) => tests.push({ name, run });
let db;
async function admin(sql, args = []) { await db.exec('RESET ROLE'); return db.query(sql, args); }
async function service(sql, args = []) { await db.exec('SET ROLE service_role'); return db.query(sql, args); }
async function current(id) { return (await admin('SELECT * FROM public.crm_leads WHERE id=$1', [id])).rows[0]; }
async function events(id) { return (await admin('SELECT * FROM public.p1_qualification_events WHERE canonical_lead_id=$1 ORDER BY revision', [id])).rows; }
async function fixture(initial = 'cold', isTest = false) {
  const id = randomUUID(), customer = randomUUID();
  await admin('INSERT INTO public.customers(id,company_id,phone,created_at) VALUES($1,$2,$3,clock_timestamp()-interval\'1 minute\')',
    [customer, COMPANY, '0901234567']);
  await admin(`INSERT INTO public.crm_leads(id,company_id,customer_id,type,stage_id,pipeline_id,lead_owner_id,is_test)
    VALUES($1,$2,$3,'lead',$4,$5,$6,$7)`, [id, COMPANY, customer, stages[initial], pipeline, owner, isTest]);
  return id;
}
async function write(id, target, patch = {}, overrides = {}) {
  const l = await current(id);
  return service('SELECT public.crm_lead_stage_write_v1($1,$2,$3,$4,$5,$6) AS value',
    [id, overrides.company || COMPANY, overrides.actor || actor, overrides.expectedStage || l.stage_id,
      l.type, JSON.stringify({ stage_id: stages[target], ...patch })]);
}
test('migration is future-only and service-only; no synthetic manual proof is created by adding it', async () => {
  assert.equal((await admin('SELECT count(*)::int n FROM public.p1_qualification_events')).rows[0].n, 0);
  const grants = await admin(`SELECT has_function_privilege('anon','public.crm_lead_stage_write_v1(uuid,uuid,uuid,uuid,text,jsonb)','execute') a,
    has_function_privilege('authenticated','public.crm_lead_stage_write_v1(uuid,uuid,uuid,uuid,text,jsonb)','execute') u,
    has_function_privilege('service_role','public.crm_lead_stage_write_v1(uuid,uuid,uuid,uuid,text,jsonb)','execute') s`);
  assert.deepEqual(grants.rows[0], { a: false, u: false, s: true });
  assert.equal((await admin('SELECT relrowsecurity FROM pg_class WHERE oid=\'public.p1_qualification_events\'::regclass')).rows[0].relrowsecurity, true);
});
test('Cold→Warm atomically records actual actor/history/time/context with all manual booleans false', async () => {
  const id = await fixture(); await write(id, 'warm'); const [e] = await events(id), l = await current(id);
  const h = (await admin('SELECT * FROM public.crm_lead_stage_history WHERE id=$1', [e.stage_history_id])).rows[0];
  const c = (await admin('SELECT * FROM public.customers WHERE id=$1', [l.customer_id])).rows[0];
  assert.equal(e.qualification_method, 'stage_based_v1'); assert.equal(e.actor_id, actor); assert.notEqual(e.actor_id, owner);
  assert.deepEqual([e.contact_usable,e.need_in_scope,e.area_in_service,e.evidence_ref], [false,false,false,null]);
  assert.equal(h.changed_by, actor); assert.equal(h.to_canonical_slug, 'warm');
  assert.equal(Date.parse(e.recorded_at), Date.parse(h.entered_at));
  assert.equal(e.context_hash, qualificationContext(l,c));
  assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [e.id])).rows[0].ok, true);
});
test('direct Cold→Hot and Lead→Deal qualify without Warm or manual sales proof', async () => {
  for (const target of ['hot','deal']) {
    const id = await fixture(); await write(id, target, target === 'deal' ? { type: 'deal' } : {});
    const list = await events(id); assert.equal(list.length, 1);
    assert.equal(list[0].stage_evidence.from_type, 'lead');
    assert.equal(list[0].stage_evidence.to_type, target === 'deal' ? 'deal' : 'lead');
    assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [list[0].id])).rows[0].ok, true);
  }
});
test('Warm→Hot→Deal and no-op/re-entry preserve one event ID and first qualifying timestamp', async () => {
  const id = await fixture(); await write(id, 'warm'); const [first] = await events(id);
  await write(id, 'hot'); await write(id, 'deal', { type: 'deal' }); await write(id, 'deal', { type: 'deal' });
  assert.deepEqual(await events(id), [first]);
  await write(id, 'lost');
  assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [first.id])).rows[0].ok, false);
  await write(id, 'deal'); assert.deepEqual(await events(id), [first]);
  assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [first.id])).rows[0].ok, true);
});
test('Cold regression holds stage-based qualification and valid re-entry resumes the same evidence', async () => {
  const id = await fixture(); await write(id, 'warm'); const [first] = await events(id); await write(id, 'cold');
  assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [first.id])).rows[0].ok, false);
  await write(id, 'hot'); assert.deepEqual(await events(id), [first]);
  assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [first.id])).rows[0].ok, true);
});
test('unknown/inactive or cross-company stage configuration cannot keep policy evidence eligible',async()=>{
  const id=await fixture();await write(id,'warm');const[e]=await events(id);
  for(const patch of ["canonical_slug=NULL","is_active=false","pipeline_id='"+randomUUID()+"'"]){
    await admin('UPDATE public.crm_pipeline_stages SET '+patch+' WHERE id=$1',[stages.warm]);
    assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok',[e.id])).rows[0].ok,false);
    await admin("UPDATE public.crm_pipeline_stages SET canonical_slug='warm',is_active=true,pipeline_id=$1 WHERE id=$2",[pipeline,stages.warm]);
  }
});
test('existing Warm/Hot rows and test customers are not backfilled or qualified by no-op saves', async () => {
  const id = await fixture('warm'); await write(id, 'warm'); assert.equal((await events(id)).length, 0);
  const testId = await fixture('cold', true); await write(testId,'hot'); assert.equal((await events(testId)).length, 0);
});
test('failed stage write or policy insertion rolls back CRM stage and history together', async () => {
  const id = await fixture(); const before = await current(id);
  await assert.rejects(write(id, 'warm', { type: 'lead', customer_id: randomUUID() }), /foreign key/);
  assert.equal((await current(id)).stage_id, before.stage_id); assert.equal((await events(id)).length, 0);
  await admin(`CREATE FUNCTION public.synthetic_policy_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic policy failure'; END $$`);
  await admin('CREATE TRIGGER synthetic_policy_failure BEFORE INSERT ON public.p1_qualification_events FOR EACH ROW EXECUTE FUNCTION public.synthetic_policy_failure()');
  await assert.rejects(write(id, 'warm'), /synthetic policy failure/);
  await admin('DROP TRIGGER synthetic_policy_failure ON public.p1_qualification_events');
  assert.equal((await current(id)).stage_id, before.stage_id); assert.equal((await events(id)).length, 0);
  assert.equal((await admin('SELECT count(*)::int n FROM public.crm_lead_stage_history WHERE lead_id=$1', [id])).rows[0].n, 1);
});
test('invalid actor, company, target and stale old state do not mutate lead or qualification', async () => {
  const id = await fixture();
  for (const run of [() => write(id,'warm',{}, { actor: randomUUID() }),
    () => write(id,'warm',{}, { company: OTHER }), () => write(id,'warm',{}, { expectedStage: stages.hot }),
    () => write(id,'warm',{ company_id: OTHER }), () => write(id,'warm',{ type: 'deal' })]) await assert.rejects(run);
  assert.equal((await current(id)).stage_id, stages.cold); assert.equal((await events(id)).length, 0);
});
test('manual rejection/revoke stays authoritative; contact changes stale stage proof without minting another event', async () => {
  const id = await fixture(); await write(id,'warm'); const [first] = await events(id);
  await admin('UPDATE public.customers SET phone=$1 WHERE id=$2', ['0911234567',(await current(id)).customer_id]);
  assert.equal((await service('SELECT public.crm_qualification_evidence_current_v1($1) ok', [first.id])).rows[0].ok, false);
  await write(id,'hot'); assert.deepEqual(await events(id),[first]);
  const q = read('712_p1_qualification.sql');
  await db.exec('RESET ROLE'); await db.exec(q.slice(q.indexOf('CREATE OR REPLACE FUNCTION public.p1_qualification_command_v1'),q.lastIndexOf('COMMIT;')));
  await service('SELECT public.p1_qualification_command_v1($1,$2,$3,$4,$5,$6,$7)',
    ['revoke',COMPANY,actor,'manual-revoke:'+id,id,1,JSON.stringify({reason:'operator correction',context_hash:first.context_hash})]);
  await write(id,'cold'); await write(id,'warm');
  const all = await events(id); assert.equal(all.length,2); assert.equal(all.at(-1).status,'PENDING'); assert.equal(all.at(-1).qualification_method,'manual_v1');
});
test('real website sender SQL accepts recorded policy evidence and holds Cold/reuses the same outbox after re-entry',async()=>{
  const id=randomUUID(),customer=randomUUID(),request=randomUUID(),key=randomUUID(),now=Date.now();
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const submitted=new Date(now-6000).toISOString(),saved=new Date(now-4000).toISOString(),captured=now-8000;
  const click='Synthetic_Meta_Original_Click',landing='https://vanphuthanh.net/tu-bep/';
  const source={kenh:'website',platform:'facebook',utm_source:'facebook',utm_medium:'paid_social',
    campaign_id:'120000000000001',ad_id:'120000000000002',fbclid:click,landing_url:landing};
  const metadata={version:1,request_id:request,form_id:'11116',site_host:'vanphuthanh.net',submitted_at:submitted,
    landing_url:landing,captured_at:new Date(captured).toISOString(),fbc:`fb.1.${captured}.${click}`,fbp:null,
    measurement_consent:true,consent_version:'VPT_ADS_V1',api_key_fingerprint:hash(key)};
  await admin('INSERT INTO public.companies(id) VALUES($1) ON CONFLICT DO NOTHING',[COMPANY]);
  await admin('INSERT INTO public.external_api_keys(id,name,key,company_id,active) VALUES($1,$2,$3,$4,true)',
    [key,'VPT_V1_CF7_CRM_Admin_HCM','synthetic_'+key,COMPANY]);
  await admin('INSERT INTO public.customers(id,company_id,phone,created_at) VALUES($1,$2,$3,$4)',
    [customer,COMPANY,'0901234567',new Date(now-5000).toISOString()]);
  await service(`INSERT INTO public.crm_leads(id,company_id,customer_id,type,stage_id,pipeline_id,is_test,
    created_at,intake_attribution,website_intake) VALUES($1,$2,$3,'lead',$4,$5,false,$6,$7,$8)`,
    [id,COMPANY,customer,stages.cold,pipeline,saved,JSON.stringify(source),JSON.stringify(metadata)]);
  await write(id,'warm');const[e]=await events(id);
  const target={company_id:COMPANY,ad_account_id:'act_835757498658305',dataset_id:'1000623629782763',site_host:'vanphuthanh.net'};
  const row=prepareWebsiteFeedback({company_id:COMPANY,lead_id:id,source_receipt_id:request,identity_key:hash(COMPANY+'|'+id),
    qualification_id:e.id,qualification_revision:e.revision,context_hash:e.context_hash,source_kind:'website',delivery_supported:true,
    ad_account_id:target.ad_account_id,landing_url:landing,fbclid:click,captured_ms:captured,acquired_ms:Date.parse(submitted),
    qualified_ms:Date.parse(e.recorded_at),measurement_consent:true,consent_version:'VPT_ADS_V1',fbc:metadata.fbc,fbp:null},
    {target,mode:'test'});
  const out=(await service('SELECT public.web_feedback_enqueue_v1($1) value',[JSON.stringify(row)])).rows[0].value;
  assert.equal((await service('SELECT public.web_feedback_source_current_v1($1) ok',[out.id])).rows[0].ok,true);
  await write(id,'cold');
  assert.equal((await service('SELECT public.web_feedback_source_current_v1($1) ok',[out.id])).rows[0].ok,false);
  await write(id,'hot');
  assert.equal((await service('SELECT public.web_feedback_source_current_v1($1) ok',[out.id])).rows[0].ok,true);
  const same=(await service('SELECT public.web_feedback_enqueue_v1($1) value',[JSON.stringify(row)])).rows[0].value;
  assert.equal(same.id,out.id);assert.equal(same.attempts,0);assert.equal((await events(id)).length,1);
});

(async () => {
  db = new PGlite(); await db.exec(baselineSQL()); await db.exec(read('717_marketing_intake.sql'));
  await db.exec(read('20261014005710_website_intake_receipts.sql')); await db.exec(read('20261014005713_website_feedback_outbox.sql'));
  await db.exec(`GRANT UPDATE ON public.customers TO service_role;
    ALTER TABLE public.crm_pipelines ADD COLUMN company_id uuid;
    ALTER TABLE public.crm_leads ADD COLUMN stage_id uuid,ADD COLUMN pipeline_id uuid,ADD COLUMN lead_owner_id uuid,
      ADD COLUMN created_by uuid,ADD COLUMN stage_entered_at timestamptz,ADD COLUMN updated_at timestamptz;
    CREATE TABLE public.crm_pipeline_stages(id uuid PRIMARY KEY,pipeline_id uuid,name text,canonical_slug text,
      pipeline_type text,is_active boolean NOT NULL DEFAULT true,is_lost boolean NOT NULL DEFAULT false);
    INSERT INTO public.users(id) VALUES('${actor}'),('${owner}');
    INSERT INTO public.crm_pipelines(id,company_id) VALUES('${pipeline}','${COMPANY}');`);
  for (const [slug,id] of Object.entries(stages)) await admin(`INSERT INTO public.crm_pipeline_stages(id,pipeline_id,name,canonical_slug,pipeline_type,is_lost)
    VALUES($1,$2,$3,$3,$4,$5)`, [id,pipeline,slug,slug==='deal'?'deal':slug==='lost'?'both':'lead',slug==='lost']);
  await db.exec(read('145_crm_stage_history.sql'));
  await db.exec(read('20261015020200_crm_stage_qualification_policy.sql'));
  let passed=0;
  for (const {name,run} of tests) { await run(); passed++; console.log('PASS '+name); }
  console.log(`${passed}/${tests.length} actual PostgreSQL stage-policy tests passed.`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(db) await db.close();});
