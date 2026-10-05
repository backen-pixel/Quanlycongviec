'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {database,harness,existing,ids:i,id}=require('./facebookLegacyCreationScope.harness');
const batch=require('../src/helpers/facebookLegacyBatch');
const {assertLegacyFacebookWriteAllowed}=require('../src/helpers/facebookLegacyWriteScope');
const claims=()=>({userId:i.actor,role:'admin',company_id:i.company,tenant_id:i.tenant,crm_region_ids:[]});
const request=(contactIds=[i.contact],user=claims())=>({user,body:{company_id:i.company,contact_ids:contactIds}});
const source=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8');
function setup(db=database(),{user=claims(),createLead=null,atomic=false}={}){
 const h=harness(db,{user,atomic}),calls=[];
 const options={createLead:createLead||((...args)=>{calls.push(args.slice(0,3));return h.context.createLeadFromFacebookInner(...args);}),
  checkWrite:(connection,scope)=>assertLegacyFacebookWriteAllowed(connection,scope,{isPrimary:()=>true})};
 let route;
 vm.runInNewContext(source.slice(source.indexOf("r.post('/batch-create-leads'"),source.indexOf('// ═',source.indexOf("r.post('/batch-create-leads'"))),{
  r:{post(url,...handlers){route=handlers.at(-1);},_ioRef:{emit(){throw Error('No broadcast allowed');}}},authMiddleware(){},supabase:db,
  facebookBatchJournal:null,createLeadFromFacebook:options.createLead,runFacebookLeadBatch:(connection,req)=>batch.runFacebookLeadBatch(connection,req,options),
 });
 return{db,h,calls,options,run:async(req=request([i.contact],user))=>{const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
  await route(req,res);return res;}};
}
function second(db,{company=i.company,page='124'}={}){
 db.tables.facebook_pages.push({...db.tables.facebook_pages[0],page_id:page,default_company_id:company});
 const contact={...db.tables.facebook_contacts[0],id:id(20),page_id:page,psid:'789',phone:'0901234568'};
 db.tables.facebook_contacts.push(contact);return contact;
}
const noWrites=db=>assert.deepEqual(db.writes,[]);

for(const value of [undefined,[],['bad'],Array(501).fill(i.contact)]){
 test('actual route rejects an absent, invalid or oversized selection '+JSON.stringify(value)?.slice(0,30),async()=>{
  const s=setup(),req=request();req.body.contact_ids=value;const r=await s.run(req);assert.equal(r.statusCode,400);noWrites(s.db);
 });
}
test('actual route processes only the explicit visible contacts and sends no PII or broadcast',async()=>{
 const s=setup();second(s.db);const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.processed,1);assert.equal(r.body.total,1);
 assert.equal(r.body.created,undefined);assert.equal(s.calls.length,1);assert.equal(s.calls[0][1].id,i.contact);assert.equal(s.db.tables.facebook_contacts[1].lead_id,null);
 assert.equal(s.db.tables.crm_leads.length,1);assert.ok(!JSON.stringify(r.body).includes('0901234567'));assert.ok(!JSON.stringify(r.body).includes('Synthetic customer'));
});
for(const [name,change] of [
 ['foreign contact',db=>second(db,{company:i.other})],
 ['missing contact',db=>{}],
 ['inactive actor',db=>{second(db);db.tables.users[1].is_active=false;}],
 ['revoked role',db=>{second(db);db.tables.users[1].role='sales';}],
 ['inactive company',db=>{second(db);db.tables.companies[0].is_active=false;}],
 ['inactive tenant',db=>{second(db);db.tables.tenants[0].is_active=false;}],
 ['foreign recipient',db=>{second(db);db.tables.users[0].company_id=i.other;}],
 ['managed second Page',db=>{second(db);db.allow=scope=>!scope.contactIds.includes(id(20));}],
 ['managed indirect customer',db=>{second(db);db.allow=()=>false;}],
]){
 test('whole selection preflight rejects '+name+' before any writes',async()=>{
  const s=setup();change(s.db);const r=await s.run(request([i.contact,id(20)]));assert.ok([403,409].includes(r.statusCode));noWrites(s.db);assert.equal(s.calls.length,0);
 });
}
test('explicit company override cannot use stale admin claims to reach another company',async()=>{
 const s=setup(),req=request();req.body.company_id=i.other;assert.notEqual((await s.run(req)).statusCode,200);noWrites(s.db);
});
test('global admin must choose one company',async()=>{
 const s=setup();Object.assign(s.db.tables.users[1],{company_id:null});const req=request();req.user.company_id=null;delete req.body.company_id;
 assert.equal((await s.run(req)).statusCode,400);noWrites(s.db);
});
for(const table of ['facebook_contacts','facebook_pages','users','companies','tenants','app_settings','facebook_messages']){
 test('failed '+table+' read is not empty success',async()=>{
  const s=setup();s.db.fail=q=>q.table===table&&q.action==='read';const r=await s.run();assert.equal(r.statusCode,503);noWrites(s.db);
 });
}
test('reused CRM Lead is reported as linked, never newly created',async()=>{
 const s=setup();existing(s.db,{mapped:false});const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.processed,1);assert.equal(r.body.created,undefined);
 assert.equal(s.db.tables.crm_leads.length,1);assert.equal(r.body.results[0].status,'linked');
});
test('atomic creator still completes mapping and links messages with the checked actor',async()=>{
 const s=setup(database(),{atomic:true});const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.processed,1);
 assert.equal(s.db.tables.crm_leads.length,1);
});
for(const [name,value] of [['phone','0909999999'],['sync_paused',true],['fb_name','Changed customer']]){
 test('contact '+name+' changed during extraction stops before creating from stale input',async()=>{
  const s=setup();s.db.before=q=>{if(q.table==='facebook_messages'&&q.columns==='content,direction,created_at')s.db.tables.facebook_contacts[0][name]=value;};
  const r=await s.run();assert.equal(r.statusCode,409);assert.equal(r.body.processed,0);noWrites(s.db);
 });
}
test('sync-paused unmapped contacts are explicit skips without invoking creator',async()=>{
 const s=setup();s.db.tables.facebook_contacts[0].sync_paused=true;
 const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.skipped,1);assert.equal(r.body.processed,0);assert.equal(s.calls.length,0);noWrites(s.db);
});
test('manual trigger is respected using fresh tenant config without global fallback',async()=>{
 const s=setup();s.db.tables.app_settings.push({key:'auto_lead_config:'+i.tenant,value:{trigger:'manual'}},{key:'auto_lead_config',value:{trigger:'first_message'}});
 const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.skipped,1);assert.equal(s.calls.length,0);noWrites(s.db);
});
test('phone trigger extracts inbound only; absent phone is a skip',async()=>{
 for(const direction of ['inbound','outbound']){const s=setup();s.db.tables.facebook_contacts[0].phone=null;
  s.db.tables.app_settings.push({key:'auto_lead_config:'+i.tenant,value:{trigger:'has_phone'}});
  s.db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:null,direction,content:'Số điện thoại của tôi 0901234567'});
  const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.processed,direction==='inbound'?1:0);
  assert.equal(r.body.phone_updated,direction==='inbound'?1:0);if(direction==='outbound')noWrites(s.db);
 }
});
test('exact message count controls the threshold',async()=>{
 const s=setup();s.db.tables.app_settings.push({key:'auto_lead_config:'+i.tenant,value:{trigger:'message_count',message_count_threshold:2}});
 s.db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,direction:'inbound',content:'Xin tư vấn',lead_id:null});
 const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.skipped,1);noWrites(s.db);
});
test('null message count is unavailable instead of a threshold skip',async()=>{
 const s=setup();s.db.tables.app_settings.push({key:'auto_lead_config:'+i.tenant,value:{trigger:'message_count'}});
 const from=s.db.from.bind(s.db);
 // Keep the PostgREST chain and only replace the terminal count value.
 s.db.from=table=>{const q=from(table),select=q.select,then=q.then;let count=false;
  q.select=(cols,options)=>{count=!!options?.count;return select(cols,options);};
  q.then=(resolve,reject)=>then(result=>resolve(count?{...result,count:null}:result),reject);return q;};
 const r=await s.run();assert.equal(r.statusCode,503);assert.equal(r.body.skipped,0);noWrites(s.db);
});
test('conflicting historical message is retained before any mutation',async()=>{
 const s=setup();s.db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:id(99),direction:'inbound',content:'Synthetic'});
 const r=await s.run();assert.equal(r.statusCode,409);assert.equal(r.body.failed,1);noWrites(s.db);assert.equal(s.db.tables.facebook_messages[0].lead_id,id(99));
});
test('actor revocation after extraction stops before the first write',async()=>{
 const s=setup();s.db.before=q=>{if(q.table==='facebook_messages'&&q.columns==='content,direction,created_at')s.db.tables.users[1].is_active=false;};
 const r=await s.run();assert.notEqual(r.statusCode,200);assert.equal(r.body.details_withheld,true);assert.deepEqual(r.body.results,[]);noWrites(s.db);
});
test('actor revocation inside creator stops before Customer insert',async()=>{
 const s=setup();s.db.before=q=>{if(q.table==='crm_sources'&&q.action==='read')s.db.tables.users[1].is_active=false;};
 const r=await s.run();assert.notEqual(r.statusCode,200);noWrites(s.db);
});
test('revocation after first Lead write stops later work and second contact; partial results withheld',async()=>{
 const s=setup();second(s.db);s.db.before=q=>{if(q.table==='crm_leads'&&q.action==='insert')s.db.tables.users[1].is_active=false;};
 const r=await s.run(request([i.contact,id(20)]));assert.notEqual(r.statusCode,200);assert.equal(r.body.failed,1);assert.equal(r.body.processed,0);assert.equal(r.body.unprocessed,1);
 assert.equal(r.body.reconciliation_required,true);assert.equal(r.body.details_withheld,true);assert.deepEqual(r.body.results,[]);
 assert.equal(s.db.tables.crm_leads.length,1);assert.equal(s.db.tables.notifications.length,0);assert.equal(s.db.tables.facebook_contacts[1].lead_id,null);
});
test('config switching to manual inside creator stops before source creation',async()=>{
 const s=setup();s.db.tables.facebook_pages[0].default_source_id=null;s.db.tables.crm_sources=[];
 s.db.before=q=>{if(q.table==='crm_sources'&&q.action==='read')s.db.tables.app_settings=[{key:'auto_lead_config:'+i.tenant,value:{trigger:'manual'}}];};
 const r=await s.run();assert.equal(r.statusCode,409);noWrites(s.db);
});
test('message write errors stop with reconciliation, never a false processed count',async()=>{
 const s=setup();second(s.db);s.db.fail=q=>q.table==='facebook_messages'&&q.action==='update';
 const r=await s.run(request([i.contact,id(20)]));assert.equal(r.statusCode,503);assert.equal(r.body.processed,0);assert.equal(r.body.failed,1);assert.equal(r.body.unprocessed,1);
 assert.equal(s.db.tables.crm_leads.length,1);assert.equal(s.db.tables.facebook_contacts[1].lead_id,null);
});
test('retry after message failure repairs links on the existing paused Lead without another insert',async()=>{
 const s=setup();s.db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:null,direction:'inbound',content:'Xin tư vấn'});
 s.db.fail=q=>q.table==='facebook_messages'&&q.action==='update';assert.equal((await s.run()).statusCode,503);
 const leadId=s.db.tables.facebook_contacts[0].lead_id;s.db.tables.facebook_contacts[0].sync_paused=true;s.db.fail=null;
 const r=await s.run();assert.equal(r.statusCode,200);assert.equal(r.body.processed,1);assert.equal(s.db.tables.crm_leads.length,1);
 assert.equal(s.db.tables.facebook_messages[0].lead_id,leadId);
});
test('phone CAS does not replace a phone saved concurrently',async()=>{
 const s=setup();s.db.tables.facebook_contacts[0].phone=null;s.db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:null,direction:'inbound',content:'0901234567'});
 s.db.before=q=>{if(q.table==='facebook_contacts'&&q.payload?.phone)s.db.tables.facebook_contacts[0].phone='0909999999';};
 const r=await s.run();assert.equal(r.statusCode,409);assert.equal(r.body.phone_updated,0);assert.equal(s.db.tables.facebook_contacts[0].phone,'0909999999');
});
test('contact drift after creator returns is held before linking messages',async()=>{
 const db=database(),h=harness(db);db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:null,direction:'inbound',content:'Xin tư vấn'});
 const s=setup(db,{createLead:async(...args)=>{const lead=await h.context.createLeadFromFacebookInner(...args);db.tables.facebook_contacts[0].phone='0909999999';return lead;}});
 const r=await s.run();assert.equal(r.statusCode,409);assert.equal(r.body.processed,0);assert.equal(db.tables.facebook_messages[0].lead_id,null);
});
test('null-only message update preserves a concurrently linked message and reports conflict',async()=>{
 const s=setup();s.db.tables.facebook_messages.push({id:id(90),contact_id:i.contact,lead_id:null,direction:'inbound',content:'Xin tư vấn'});
 s.db.before=q=>{if(q.table==='facebook_messages'&&q.action==='update')s.db.tables.facebook_messages[0].lead_id=id(99);};
 const r=await s.run();assert.equal(r.statusCode,409);assert.equal(r.body.processed,0);assert.equal(s.db.tables.facebook_messages[0].lead_id,id(99));
});
