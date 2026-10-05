'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {database,harness,load,existing,ids:i,id,scope}=require('./facebookLegacyCreationScope.harness');
const noEffects=(db,h)=>{assert.deepEqual(db.writes,[]);if(h)assert.deepEqual(h.effects,[]);};
for(const [name,change] of [
 ['missing Page company',db=>db.tables.facebook_pages[0].default_company_id=null],
 ['inactive Page',db=>db.tables.facebook_pages[0].is_active=false],
 ['unknown Page active state',db=>db.tables.facebook_pages[0].is_active=null],
 ['inactive company',db=>db.tables.companies[0].is_active=false],
 ['inactive tenant',db=>db.tables.tenants[0].is_active=false],
 ['contact moved Page',db=>db.tables.facebook_contacts[0].page_id='999'],
 ['foreign mapped Lead',db=>{existing(db);db.tables.crm_leads[0].company_id=i.other;}],
 ['foreign mapped Customer',db=>{existing(db);db.tables.customers[0].company_id=i.other;}],
 ['different mapped Customer',db=>{existing(db);db.tables.crm_leads[0].customer_id=id(99);}],
 ['wrong Lead type',db=>{existing(db);db.tables.crm_leads[0].type='deal';}],
 ['missing mapped Lead',db=>db.tables.facebook_contacts[0].lead_id=i.lead],
 ['foreign owner',db=>db.tables.users[0].company_id=i.other],
 ['inactive owner',db=>db.tables.users[0].is_active=false],
 ['revoked region membership',db=>db.tables.user_company_regions=[]],
 ['foreign region',db=>db.tables.company_regions[0].company_id=i.other],
 ['foreign pipeline',db=>db.tables.crm_pipelines[0].company_id=i.other],
 ['stage of another pipeline',db=>db.tables.crm_pipeline_stages[0].pipeline_id=id(99)],
 ['foreign source',db=>db.tables.crm_sources[0].company_id=i.other],
 ['historical message linked elsewhere',db=>db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:i.lead})],
]) {
 test('actual automatic creator rejects '+name+' before writes',async()=>{const db=database(),h=harness(db);change(db);await assert.rejects(h.auto(),{status:409});noEffects(db,h);});
 if(name!=='contact moved Page')test('actual manual creator rejects '+name+' before writes',async()=>{const db=database(),h=harness(db);change(db);const res=await h.manual();assert.equal(res.statusCode,409);noEffects(db,h);});
}
test('manual company override and stale role claims cannot move Customer into another company',async()=>{
 for(const change of [db=>{},db=>db.tables.users[1].company_id=i.other,db=>db.tables.users[1].is_active=false]){
  const db=database(),h=harness(db);change(db);assert.equal((await h.manual({company_id:i.other})).statusCode,409);noEffects(db,h);
 }
 const db=database(),h=harness(db);db.tables.users[1].is_active=false;assert.equal((await h.manual()).statusCode,409);noEffects(db,h);
});
test('automatic creator ignores stale caller Customer and uses current contact mapping',async()=>{
 const db=database();existing(db);const h=harness(db);assert.equal((await h.auto({id:i.contact,customer_id:id(999)})).id,i.lead);noEffects(db,h);
});
for(const table of ['facebook_contacts','facebook_pages','companies','tenants','customers','crm_leads','users','facebook_messages','crm_sources']) {
 test('read failure from '+table+' cannot become absent data or success',async()=>{
  for(const manual of [false,true]){const db=database();if(['customers','crm_leads'].includes(table))existing(db);
   db.fail=q=>q.table===table&&q.action==='read';const h=harness(db);
   if(manual)assert.equal((await h.manual()).statusCode,503);else await assert.rejects(h.auto(),{status:503});noEffects(db,h);}
 });
}
test('automatic creation scopes phone matching and Customer/Lead/recipient to current Page company',async()=>{
 const db=database();db.tables.customers.push({id:id(99),company_id:i.other,phone:'0901234567'});const h=harness(db);const lead=await h.auto();
 assert.equal(lead.company_id,i.company);assert.equal(lead.assigned_to,i.owner);assert.equal(lead.pipeline_id,i.pipeline);assert.equal(lead.stage_id,i.stage);
 assert.notEqual(lead.customer_id,id(99));assert.equal(db.tables.customers.find(x=>x.id===lead.customer_id).company_id,i.company);
 assert.equal(db.tables.facebook_contacts[0].lead_id,lead.id);
 assert.ok(db.reads.filter(x=>x.table==='customers'&&x.filters.some(f=>f[1]==='ilike')).every(x=>x.filters.some(f=>f[0]==='company_id'&&f[2]===i.company)));
 assert.equal(db.tables.notifications[0].user_id,i.owner);
});
test('manual creation sends the validated pipeline/stage pair and only fills unlinked messages',async()=>{
 const db=database();db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:null,direction:'inbound',content:'Xin tư vấn'});
 const h=harness(db),res=await h.manual();assert.equal(res.statusCode,201);const request=h.effects.find(x=>x.type==='crm').payload;
 assert.equal(request.pipeline_id,i.pipeline);assert.equal(request.stage_id,i.stage);assert.equal(request.company_id,i.company);
 assert.equal(db.tables.customers[0].company_id,i.company);assert.equal(db.tables.facebook_messages[0].lead_id,res.body.id);
 assert.ok(db.writes.filter(x=>x.table==='facebook_messages').every(x=>x.filters.some(f=>f[0]==='lead_id'&&f[1]==='is'&&f[2]===null)));
});
test('multiple phone or Lead candidates require review without an arbitrary first match',async()=>{
 for(const entity of ['customers','crm_leads']){const db=database();existing(db,{mapped:false});db.tables[entity].push({...db.tables[entity][0],id:id(90)});
  const h=harness(db);await assert.rejects(h.auto(),{status:409});noEffects(db,h);}
});
test('matching suffix alone is not enough to reuse a Customer',async()=>{
 const db=database();db.tables.customers.push({id:i.customer,company_id:i.company,phone:'012901234567'});
 await assert.rejects(scope.findFacebookCreationCustomer(db,i.company,'0901234567'),{status:409});noEffects(db);
});
test('source resolution never retags a foreign or shared legacy source',async()=>{
 const db=database();db.tables.facebook_pages[0].default_source_id=null;db.tables.crm_sources[0].company_id=i.other;
 db.tables.crm_sources.push({id:id(88),company_id:null,name:'Facebook',is_active:true});
 const source=await scope.resolveScopedFacebookSource(db,db.tables.facebook_pages[0]);assert.notEqual(source,i.source);
 assert.equal(db.tables.crm_sources[0].company_id,i.other);assert.equal(db.tables.crm_sources[1].company_id,null);
 assert.ok(!db.writes.some(x=>x.table==='crm_sources'&&x.action==='update'));
 assert.equal(db.tables.facebook_pages[0].default_source_id,source);
});
test('source compare-and-set cannot replace a concurrent Page selection',async()=>{
 const db=database();db.tables.facebook_pages[0].default_source_id=null;
 db.before=q=>{if(q.table==='facebook_pages'&&q.action==='update')db.tables.facebook_pages[0].default_source_id=id(90);};
 await assert.rejects(scope.resolveScopedFacebookSource(db,db.tables.facebook_pages[0]),{status:409});assert.equal(db.tables.facebook_pages[0].default_source_id,id(90));
});
test('contact compare-and-set retains a concurrent mapping',async()=>{
 const db=database(),context=await load(db);
 db.before=q=>{if(q.table==='facebook_contacts'&&q.action==='update')db.tables.facebook_contacts[0].lead_id=id(90);};
 await assert.rejects(scope.writeFacebookCreationContact(db,context,{lead_id:i.lead}),{status:409});assert.equal(db.tables.facebook_contacts[0].lead_id,id(90));
});
test('fresh Page assignment and source are revalidated after preparation',async()=>{
 const db=database(),context=await load(db);db.tables.facebook_pages[0].default_lead_owner_id=id(90);
 await assert.rejects(scope.assertFacebookCreationAssignment(db,context,i.owner),{status:409});
 db.tables.facebook_pages[0].default_source_id=id(90);await assert.rejects(scope.assertFacebookCreationSource(db,context,i.source),{status:409});noEffects(db);
});
test('revocation before notification prevents delivery of customer PII',async()=>{
 const db=database(),h=harness(db);db.before=q=>{if(q.table==='crm_leads'&&q.action==='insert')db.tables.users[0].is_active=false;};
 await assert.rejects(h.auto(),{status:409});assert.equal(db.tables.notifications.length,0);assert.equal(db.tables.crm_leads.length,1);
});
test('manual retry retains a mapped Lead and repairs only missing message links',async()=>{
 const db=database();existing(db);db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:i.lead},{id:id(91),contact_id:i.contact,lead_id:null});
 const h=harness(db,{atomic:true}),res=await h.manual();assert.equal(res.statusCode,200);assert.equal(res.body.id,i.lead);
 assert.equal(db.tables.crm_leads.length,1);assert.ok(db.tables.facebook_messages.every(x=>x.lead_id===i.lead));
 assert.equal(h.effects.filter(x=>x.type==='crm').length,0);
});
test('failed Lead insertion is explicit and retains partial Customer for reconciliation',async()=>{
 const db=database(),h=harness(db);db.fail=q=>q.table==='crm_leads'&&q.action==='insert';
 await assert.rejects(h.auto(),{status:503});assert.equal(db.tables.crm_leads.length,0);assert.equal(db.tables.customers.length,1);
 assert.equal(db.tables.facebook_contacts[0].customer_id,db.tables.customers[0].id);assert.equal(db.tables.notifications.length,0);
});
test('code allocation lookup failures never reach Lead insertion',async()=>{
 for(const mode of ['max','precheck']){const db=database(),h=harness(db);
  db.fail=q=>q.table==='crm_leads'&&q.action==='read'&&(mode==='max'?q.columns==='code':q.filters.some(f=>f[0]==='code'&&f[1]==='eq'));
  await assert.rejects(h.auto(),{status:503});assert.equal(db.tables.crm_leads.length,0);assert.equal(db.tables.notifications.length,0);
 }
});
test('actual resolver errors never fall back from a configured stage to another stage',async()=>{
 for(const manual of [false,true]){const db=database();db.tables.crm_pipeline_stages.push({...db.tables.crm_pipeline_stages[0],id:id(500)});
  db.fail=q=>q.table==='crm_pipeline_stages'&&q.filters.some(f=>f[0]==='id'&&f[2]===i.stage);const h=harness(db);
  if(manual)assert.equal((await h.manual()).statusCode,503);else await assert.rejects(h.auto(),{status:503});noEffects(db,h);
 }
});
test('actual resolver chooses a same-company default only when no stage was configured',async()=>{
 const db=database();db.tables.facebook_pages[0].default_stage_id=null;const h=harness(db);const lead=await h.auto();assert.equal(lead.stage_id,i.stage);
});
test('stale JWT admin cannot survive an actor downgrade',async()=>{
 const db=database(),h=harness(db);db.tables.users[1].role='sales';assert.equal((await h.manual()).statusCode,409);noEffects(db,h);
});
test('current sales actor cannot silently replace the configured Page owner',async()=>{
 const db=database();db.tables.users[1].role='sales';const h=harness(db,{user:{userId:i.actor,role:'sales',company_id:i.company,tenant_id:i.tenant,crm_region_ids:[i.region]}});
 assert.equal((await h.manual()).statusCode,409);noEffects(db,h);
});
test('current sales actor may create for themselves only in a current assigned region',async()=>{
 for(const member of [false,true]){const db=database();db.tables.users[1].role='sales';db.tables.facebook_pages[0].default_lead_owner_id=i.actor;
  if(member)db.tables.user_company_regions.push({user_id:i.actor,region_id:i.region});
  const h=harness(db,{user:{userId:i.actor,role:'sales',company_id:i.company,tenant_id:i.tenant,crm_region_ids:[i.region]}}),res=await h.manual();
  assert.equal(res.statusCode,member?201:409);if(member)assert.equal(res.body.assigned_to,i.actor);else noEffects(db,h);
 }
});
test('manual endpoint rejects unexpected CRM recipient after insert instead of reporting success',async()=>{
 const db=database(),h=harness(db);db.before=q=>{if(q.table==='crm_leads'&&q.action==='insert')q.payload.assigned_to=i.actor;};
 assert.equal((await h.manual()).statusCode,409);assert.equal(db.tables.facebook_contacts[0].lead_id,null);
});
