'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHmac,createHash}=require('node:crypto');
const {createLeadIntake,readVerifiedLead}=require('../src/modules/marketingAutomation/facebookLeadIntake');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
const {createSurveyDispatch}=require('../src/modules/marketingAutomation/facebookSurveyDispatch');
const {createSurveyAvailability}=require('../src/modules/marketingAutomation/surveyAvailability');
const {createSurveyProposals}=require('../src/modules/marketingAutomation/surveyProposals');
const {reportCohortOperations}=require('../src/modules/marketingAutomation/cohortOperations');
const {reportTrial}=require('../src/modules/marketingAutomation/trialReport');
const {readAccountSpendWithDelivery}=require('../src/modules/marketingAutomation/facebookAccountDelivery');
const {provider}=require('./marketingAutomation.accountDelivery.fixture');
module.exports=async(t,{db,peers,query,company,other,admin,sales,region,config})=>{
 // Match production base columns before installing the actual legacy RPC.
 await db.query(`ALTER TABLE facebook_contacts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
 CREATE UNIQUE INDEX IF NOT EXISTS care_test_contact_id ON facebook_contacts(id);
 ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_module_key text,ADD COLUMN IF NOT EXISTS default_target_type text;
 ALTER TABLE crm_leads ALTER COLUMN id SET DEFAULT gen_random_uuid();
 ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS install_address text,ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;
 ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
 ALTER TABLE customers ALTER COLUMN created_at SET DEFAULT clock_timestamp();
 ALTER TABLE crm_leads ALTER COLUMN created_at SET DEFAULT clock_timestamp();`);
 await db.query(fs.readFileSync(path.resolve(__dirname,'../../database/639_facebook_contact_lead_atomic.sql'),'utf8'));
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/680_crm_care_connection.sql'),'utf8');await db.query(sql);await db.query(sql);
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON facebook_contacts,crm_leads TO service_role');
 const secret='synthetic-connection-webhook-only',day=new Date(Date.now()+7*3600000-86400000).toISOString().slice(0,10);
 let seq=6800000;
 const storage=(client=peers[0])=>({rpc:async(name,args)=>{
  try{const values=Object.entries(args).map(([k,v])=>k==='p_events'?JSON.stringify(v):v);
   if(name==='marketing_fb_lead_claim')return{data:(await client.query('SELECT * FROM marketing_fb_lead_claim($1,$2)',values)).rows};
   return{data:await query(name,values,client)};
  }catch(error){return{error};}
 },from:()=>({select:()=>({eq:(_k,page)=>({maybeSingle:async()=>({data:(await db.query('SELECT * FROM facebook_pages WHERE page_id=$1',[page])).rows[0]})})})})});
 const signed=(page,payload)=>{const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:page,...payload}]}));
  return{facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}};
 };
 const fresh=async({enrolled=true}={})=>{
  const page=String(++seq),form=String(++seq),leadgen=String(++seq),psid=String(++seq),phone='097'+String(seq).padStart(7,'0');
  const env={VPT_FB_CARE_PAGES:page,VPT_FACEBOOK_APP_SECRET:secret,VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_DISPATCH:'1'};
  await db.query("INSERT INTO facebook_pages(page_id,default_company_id,is_active,access_token) VALUES($1,$2,true,'synthetic')",[page,company]);
  await query('marketing_fb_lead_binding_set',[admin,company,randomUUID(),{...config,pageId:page,formId:form,expectedRevision:0}]);
  const errors=[],fetchImpl=async raw=>{
   const id=new URL(raw).pathname.split('/').at(-1);
   const data=id===leadgen?{id,created_time:day+'T12:00:00+07:00',form_id:form,ad_id:'7',adset_id:'8',campaign_id:'9',is_organic:false,
    field_data:[{name:'full_name',values:['Synthetic connection customer']},{name:'phone_number',values:[phone]},{name:'need',values:['Synthetic kitchen survey request']}]}:
    id===form?{id,page_id:page}:id==='7'?{id,account_id:'77',adset_id:'8',campaign_id:'9'}:null;
   assert.ok(data,'unexpected synthetic Graph lookup');return{ok:true,json:async()=>data};
  };
  const intake=createLeadIntake({db:storage(),isPrimary:()=>true,pages:new Set([page]),secret:()=>secret,version:()=> 'v24.0',
   readSource:args=>readVerifiedLead({...args,fetchImpl}),isPaused:()=>false,onError:x=>errors.push(x)});
  const request=signed(page,{changes:[{field:'leadgen',value:{leadgen_id:leadgen,form_id:form}}]});
  await intake.receive(request);await intake.drain();assert.deepEqual(errors,[]);
  const receipt=(await db.query('SELECT * FROM marketing_fb_lead_receipts WHERE leadgen_id=$1',[leadgen])).rows[0];
  assert.equal(receipt.state,'DONE');assert.ok(receipt.lead_id);assert.equal(receipt.company_id,company);
  const lead=receipt.lead_id,customer=receipt.customer_id;
  const stored=(await db.query('SELECT * FROM crm_leads WHERE id=$1',[lead])).rows[0];
  assert.equal(stored.assigned_to,sales);assert.equal(stored.region_id,region);
  const care=createCustomerCare({db:storage(),isPrimary:()=>true,env});
  const incoming=(text,payload)=>({sender:{id:psid},recipient:{id:page},timestamp:Date.now(),message:{mid:randomUUID(),text,...(payload?{quick_reply:{payload}}:{})}});
  const receive=events=>care.receive(signed(page,{messaging:events}));
  const message=incoming('Synthetic customer confirms the form and survey request');await receive([message]);
  const thread=(await db.query('SELECT id FROM crm_care_threads WHERE page_id=$1 AND psid=$2',[page,psid])).rows[0].id;
  const evidence=(await db.query("SELECT id FROM crm_care_messages WHERE thread_id=$1 AND direction='inbound'",[thread])).rows[0].id;
  assert.equal((await query('crm_care_read',[admin,company,thread])).target.routingReady,false);
  assert.equal((await db.query('SELECT count(*)::int n FROM facebook_contacts WHERE page_id=$1 AND psid=$2',[page,psid])).rows[0].n,0);
  if(enrolled)await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,true,$3,'Synthetic isolated connection release only')",[page,company,admin]);
  return{page,form,psid,lead,customer,thread,evidence,env,receive,incoming,intake,request};
 };
 const view=(c,client=peers[0],actor=admin)=>query('crm_care_connection_read',[actor,company,c.thread,c.lead],client);
 const command=async c=>({threadId:c.thread,leadId:c.lead,expectedVersion:(await view(c)).version,evidenceMessageId:c.evidence,identityConfirmed:true,reason:'Synthetic operator checked customer identity against this inbound evidence'});
 const link=(c,cmd,key=randomUUID(),client=peers[0],actor=admin)=>query('crm_care_connection_link',[actor,company,key,cmd],client);
 const count=async(c,table='crm_care_control.connection_events')=>(await db.query('SELECT count(*)::int n FROM '+table+' WHERE thread_id=$1',[c.thread])).rows[0].n;
 const waitLock=async client=>{
  const pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;return pid;
 };
 const blocked=async pid=>{
  for(let i=0;i<150;i++){await db.query('SELECT pg_stat_clear_snapshot()');const r=await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock'",[pid]);if(r.rowCount)return;await new Promise(r=>setTimeout(r,10));}
  assert.fail('expected PostgreSQL lock wait');
 };
 await t.test('connection requires enrolled Page, current actor and company; private capabilities remain inaccessible',async()=>{
  const c=await fresh({enrolled:false});await assert.rejects(view(c),e=>e.code==='42501');
  await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,true,$3,'Synthetic isolated connection release only')",[c.page,company,admin]);
  await assert.rejects(view(c,peers[0],sales),e=>e.code==='42501');
  await assert.rejects(query('crm_care_connection_read',[admin,other,c.thread,c.lead]),e=>e.code==='42501');
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{
   await assert.rejects(db.query('SELECT * FROM crm_care_control.connection_permits'),e=>e.code==='42501');
   await assert.rejects(db.query('SELECT crm_care_control.connection_ready()'),e=>e.code==='42501');
   if(role!=='service_role')await assert.rejects(view(c,db),e=>e.code==='42501');
  }finally{await db.query('RESET ROLE');}}
 });
 await t.test('signed intake and conversation link the original Lead once under concurrent identical requests',async()=>{
  const c=await fresh(),cmd=await command(c),key=randomUUID();
  const r=await Promise.all([link(c,cmd,key),link(c,cmd,key,peers[1])]);assert.equal(r.filter(x=>x.replayed).length,1);
  assert.equal(await count(c),1);const care=await query('crm_care_read',[admin,company,c.thread]);
  assert.equal(care.target.leadId,c.lead);assert.equal(care.target.routingReady,true);
  assert.equal((await query('crm_lead_quality_read',[admin,company,c.lead])).status,'PENDING');
  await c.intake.receive(c.request);await c.intake.drain();
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_lead_source_evidence WHERE lead_id=$1',[c.lead])).rows[0].n,1);
  await assert.rejects(link(c,{...cmd,reason:cmd.reason+' changed'},key),e=>e.code==='23505');
 });
 await t.test('wrong-thread evidence, stale view and crash roll back both mapping and audit',async()=>{
  const c=await fresh(),d=await fresh(),cmd=await command(c);
  await assert.rejects(link(c,{...cmd,evidenceMessageId:d.evidence}),e=>e.code==='22023');assert.equal(await count(c),0);
  await c.receive([c.incoming('Synthetic additional evidence changes the view')]);
  await assert.rejects(link(c,cmd),e=>e.code==='40001');
  const latest=await command(c),key=randomUUID();await peers[0].query('BEGIN');await link(c,latest,key);await peers[0].query('ROLLBACK');
  assert.equal(await count(c),0);assert.equal((await query('crm_care_read',[admin,company,c.thread])).target.routingReady,false);
  assert.equal((await link(c,latest,key)).replayed,false);
 });
 await t.test('connection does not overwrite existing mapping or resume opted-out care',async()=>{
  const c=await fresh(),d=await fresh();await c.receive([c.incoming('STOP')]);await link(c,await command(c));
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'OPTED_OUT');
  const wrong={...c,lead:d.lead};const v=await view(wrong);assert.equal(v.canLink,false);
  await assert.rejects(link(wrong,{...(await command(c)),leadId:d.lead,expectedVersion:v.version}),e=>e.code==='40001');
 });
 await t.test('controlled contacts reject legacy writes, private permit forgery, DELETE and TRUNCATE',async()=>{
  const c=await fresh(),result=await link(c,await command(c));
  for(const sql of ["UPDATE facebook_contacts SET lead_id=NULL WHERE id=$1","UPDATE facebook_contacts SET psid='other' WHERE id=$1","DELETE FROM facebook_contacts WHERE id=$1"])
   await assert.rejects(peers[0].query(sql,[result.contactId]),e=>e.code==='42501');
  await assert.rejects(db.query('TRUNCATE facebook_contacts CASCADE'),e=>e.code==='42501');
  await peers[0].query("SELECT set_config('app.care_connection_permit','true',false)");
  await assert.rejects(peers[0].query('UPDATE facebook_contacts SET customer_id=NULL WHERE id=$1',[result.contactId]),e=>e.code==='42501');
  await assert.rejects(query('create_facebook_contact_lead_once',[result.contactId,c.page,company,{type:'lead',company_id:company},c.lead]),e=>e.code==='42501');
 });
 await t.test('legacy inverse recovery is a conflict, and new inverse writes are refused',async()=>{
  const c=await fresh({enrolled:false}),d=await fresh(),contact=randomUUID();
  await db.query('INSERT INTO facebook_contacts(id,page_id,psid) VALUES($1,$2,$3)',[contact,c.page,c.psid]);
  await db.query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1',[d.lead,contact]);
  await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,true,$3,'Synthetic isolated connection release only')",[c.page,company,admin]);
  const v=await view(c);assert.equal(v.canLink,false);assert.ok(!JSON.stringify(v).includes(d.lead));
  await assert.rejects(link(c,await command(c)),e=>e.code==='40001');assert.equal(await count(c),0);
  await assert.rejects(peers[0].query('UPDATE crm_leads SET facebook_contact_id=NULL WHERE id=$1',[d.lead]),e=>e.code==='42501');
  const otherContact=(await link(d,await command(d))).contactId;
  await assert.rejects(peers[0].query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1',[c.lead,otherContact]),e=>e.code==='42501');
 });
 await t.test('concurrent legacy inverse write and new connection serialize without introducing a second identity',async()=>{
  const c=await fresh(),d=await fresh(),contact=randomUUID();
  await db.query('INSERT INTO facebook_contacts(id,page_id,psid) VALUES($1,$2,$3)',[contact,c.page,c.psid]);
  const cmd=await command(c),pids=await Promise.all([waitLock(peers[1]),waitLock(peers[2])]);
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('crm-care-connection-write-v1',0))");
  const inverse=peers[1].query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1',[d.lead,contact]).then(value=>({value}),error=>({error}));
  const linking=link(c,cmd,randomUUID(),peers[2]).then(value=>({value}),error=>({error}));
  try{await blocked(pids[0]);await blocked(pids[1]);}finally{await db.query('COMMIT');}
  assert.equal((await inverse).error?.code,'42501');const linked=await linking;if(linked.error)throw linked.error;
  assert.equal(linked.value.leadId,c.lead);assert.equal(await count(c),1);
  assert.equal((await db.query('SELECT facebook_contact_id FROM crm_leads WHERE id=$1',[d.lead])).rows[0].facebook_contact_id,null);
 });
 await t.test('revoked release author while linking waits cannot authorize the link',async()=>{
  const c=await fresh(),author=randomUUID();
  await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'admin',true FROM companies WHERE id=$2",[author,company]);
  await db.query('UPDATE crm_care_control.connection_pages SET enrolled_by=$2 WHERE page_id=$1',[c.page,author]);
  const cmd=await command(c),pid=await waitLock(peers[1]);
  await db.query('BEGIN');await db.query('UPDATE users SET is_active=false WHERE id=$1',[author]);
  const pending=link(c,cmd,randomUUID(),peers[1]).then(value=>({value}),error=>({error}));
  try{await blocked(pid);}finally{await db.query('COMMIT');}
  assert.equal((await pending).error?.code,'42501');assert.equal(await count(c),0);
 });
 await t.test('legacy RPC waits at the gate before locking a contact and rejects after enrollment',async()=>{
  const c=await fresh(),r=await link(c,await command(c)),pid=await waitLock(peers[1]);
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('crm-care-connection-write-v1',0))");
  const pending=query('create_facebook_contact_lead_once',[r.contactId,c.page,company,{type:'lead',company_id:company},c.lead],peers[1]).then(value=>({value}),error=>({error}));
  try{await blocked(pid);await db.query('SELECT id FROM facebook_contacts WHERE id=$1 FOR UPDATE NOWAIT',[r.contactId]);}finally{await db.query('COMMIT');}
  assert.equal((await pending).error?.code,'42501');
 });
 await t.test('disabled controls and repeatable-read transactions cannot authorize writes',async()=>{
  const c=await fresh(),cmd=await command(c);
  await db.query('ALTER TABLE crm_leads DISABLE TRIGGER crm_care_inverse_guard');
  try{await assert.rejects(link(c,cmd),e=>e.code==='42501');}finally{await db.query('ALTER TABLE crm_leads ENABLE ALWAYS TRIGGER crm_care_inverse_guard');}
  await peers[0].query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try{await assert.rejects(link(c,cmd),e=>e.code==='0A000');}finally{await peers[0].query('ROLLBACK');}
 });
 await t.test('new paid intake Lead reaches a customer-confirmed survey and cohort without seeded links',async()=>{
  const c=await fresh(),trial=randomUUID(),staff=randomUUID(),start=Date.now()+5*86400000,end=start+3600000;
  const since=new Date(Date.now()+7*3600000-30*86400000).toISOString().slice(0,10);
  await db.query("INSERT INTO fb_ad_accounts(ad_account_id,company_id,bat,access_token) VALUES('act_6800000',$1,true,'synthetic')",[company]);
  await query('marketing_lead_trial_set',[admin,company,trial,randomUUID(),{name:'Synthetic signed intake to survey journey',since,until:day,expectedRevision:0}]);
  // Use the actual collector and publication services for every scoped account,
  // including one with spend but no Lead. This is not scope/census acceptance.
  const accounts=(await db.query('SELECT ad_account_id FROM fb_ad_accounts WHERE company_id=$1',[company])).rows;
  for(const {ad_account_id:account}of accounts){
   const amount=account==='act_77'?200000:account==='act_6800000'?50000:0;
   const fake=provider({account,since,until:day,mutate:body=>{for(const row of body.data)row.spend=String(row.ad_id==='70'?0:amount);return body;}});
   const snapshot=await readAccountSpendWithDelivery({...fake.input,now:new Date().toISOString()});
   const run=await query('marketing_spend_begin',[account,company,since,day]);
   await query('marketing_spend_finish',[run.id,company,snapshot,null]);
  }
  const quality=await query('crm_lead_quality_read',[admin,company,c.lead]);
  await query('crm_lead_quality_record',[admin,company,c.lead,randomUUID(),quality.revision,quality.contextVersion,{status:'QUALIFIED',contactVerified:true,demandMatches:true,serviceAreaVerified:true,evidence:'Synthetic operator attests paid Lead quality for the signed journey'}]);
  const cohort=async()=>reportCohortOperations(await query('marketing_cohort_operations_snapshot',[admin,company,trial]));
  const before=await cohort();assert.ok(before.attention.some(x=>x.leadId===c.lead&&x.reason==='CARE_CONNECTION_NOT_ESTABLISHED'));
  const measured=reportTrial(await query('marketing_lead_trial_snapshot',[admin,company,trial]));
  assert.equal(measured.spend.spendVnd,250000);assert.equal(measured.spend.status,'KNOWN_TO_DATE');
  assert.ok(measured.accountDelivery.accounts.some(x=>x.accountId==='act_6800000'&&x.spendVnd===50000));
  assert.equal(measured.costPerQualifiedLeadVnd,null);assert.equal(measured.targetMetToDate,false);
  await link(c,await command(c));
  await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2",[staff,company]);
  await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[staff,region]);
  await db.query("INSERT INTO crm_survey_control.crm_survey_calendar_staff VALUES($1,$2,$3,'Synthetic complete calendar release only')",[staff,company,admin]);
  await query('crm_survey_roster_change',[admin,company,randomUUID(),{action:'SAVE',staffId:staff,regionId:region,expectedRevision:0,reason:'Synthetic complete calendar for isolated test',
   document:{calendarSource:'CRM_COMPLETE',externalCalendarCoverage:'ALL_BUSY_IN_CRM',sourceReference:'Synthetic complete busy calendar source',validUntil:new Date(end+86400000).toISOString(),bufferMinutes:0,slots:[{startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}]}}]);
  await db.query("INSERT INTO crm_survey_control.ingress_pages VALUES($1,$2,true,'Synthetic signed confirmation enrollment only')",[c.page,company]);
  await db.query("INSERT INTO crm_survey_control.dispatch_pages VALUES($1,$2,'4567','v24.0',true,'Synthetic isolated dispatch enrollment only',$3,'Synthetic credential evidence only')",[c.page,company,createHash('sha256').update('synthetic').digest('hex')]);
  const apiResponse=()=>({code:200,set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  const availabilityResponse=apiResponse();
  await createSurveyAvailability({db:storage(),isPrimary:()=>true,env:{VPT_SURVEY_ADMIN:'1'}}).handle(
   {user:{userId:admin},query:{companyId:company,threadId:c.thread,from:new Date(start).toISOString(),to:new Date(end).toISOString()}},availabilityResponse,'availability');
  assert.equal(availabilityResponse.code,200,JSON.stringify(availabilityResponse.body));
  const state=await import('../../frontend/src/components/facebook/surveyProposalState.mjs');
  const available=state.availableOptions(availabilityResponse.body,company,c.thread);
  const option=available.items.find(x=>x.staffId===staff);assert.ok(option);
  const proposalResponse=apiResponse();
  await createSurveyProposals({db:storage(),isPrimary:()=>true,env:{VPT_SURVEY_PROPOSALS:'1'}}).handle(
   {user:{userId:admin},body:{companyId:company,requestId:randomUUID(),command:{threadId:c.thread,optionId:option.optionId,startsAt:option.startsAt,endsAt:option.endsAt,location:'Synthetic customer-approved location'}}},proposalResponse,'propose');
  assert.equal(proposalResponse.code,200,JSON.stringify(proposalResponse.body));const proposal=proposalResponse.body;
  let sent=0,click;
  const worker=createSurveyDispatch({db:storage(),isPrimary:()=>true,env:c.env,fetchImpl:async(_url,init)=>{
   sent++;const body=JSON.parse(init.body),mid=randomUUID();
   const echo={sender:{id:c.page},recipient:{id:c.psid},timestamp:Date.now(),message:{mid,text:body.message.text,is_echo:true,app_id:4567,metadata:body.message.metadata}};
   click=c.incoming('Xác nhận lịch',body.message.quick_replies[0].payload);await c.receive([echo,click]);
   return{ok:true,json:async()=>({recipient_id:c.psid,message_id:mid})};
  }});
  await worker.drain();assert.equal(sent,1);await c.receive([click]);await worker.drain();assert.equal(sent,1);
  const bookings=(await db.query('SELECT * FROM crm_survey_control.bookings WHERE proposal_id=$1',[proposal.proposalId])).rows;
  assert.equal(bookings.length,1);const result=await cohort();assert.equal(result.counts.bookedGroups,before.counts.bookedGroups+1);
  assert.ok(!result.attention.some(x=>x.leadId===c.lead&&x.reason==='CARE_CONNECTION_NOT_ESTABLISHED'));
  const handoff=await query('crm_survey_handoff_read',[staff,company,proposal.proposalId,null,null]);assert.equal(handoff.lead?.id||handoff.leadId,c.lead);
  await query('crm_survey_handoff_ack',[staff,company,randomUUID(),{proposalId:proposal.proposalId,expectedVersion:handoff.version}]);
  await c.receive([c.incoming('STOP')]);assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'OPTED_OUT');
  assert.equal((await cohort()).counts.bookedGroups,before.counts.bookedGroups+1);
 });
};
