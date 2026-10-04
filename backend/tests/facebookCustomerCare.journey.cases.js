'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash,createHmac}=require('node:crypto');
const {createCareRuntime}=require('../src/modules/marketingAutomation/careRuntime');
const {createCareOpenAiInference}=require('../src/modules/marketingAutomation/careOpenAiInference');
const {createCareAnswerDispatch}=require('../src/modules/marketingAutomation/careAnswerDispatch');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
const {createSurveyDispatch}=require('../src/modules/marketingAutomation/facebookSurveyDispatch');
const {createSurveyOutcomeDispatch}=require('../src/modules/marketingAutomation/facebookSurveyOutcomes');
const {createCohortOperations}=require('../src/modules/marketingAutomation/cohortOperations');
const {createCareInferenceCosts}=require('../src/modules/marketingAutomation/careInferenceCosts');
const {reportTrial}=require('../src/modules/marketingAutomation/trialReport');
const {readAccountSpendWithDelivery}=require('../src/modules/marketingAutomation/facebookAccountDelivery');
const {provider}=require('./marketingAutomation.accountDelivery.fixture');
const sha=x=>createHash('sha256').update(x).digest('hex');
const response=()=>({code:200,set(){return this;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
module.exports=async(t,{db,peers,query,other,credential,model})=>{
 // Isolate this journey from hundreds of adversarial source fixtures; retain
 // the production inventory bounds instead of filtering or relaxing them.
 const {company,admin,sales,account,fixture,enroll}=await require('./facebookCustomerCare.journey.fixture')({db,peers,query,credential,model});
 const secret='synthetic-full-journey-only',address='123 Đường Kiểm Thử, Thành phố Hồ Chí Minh',ask='Cho tôi đặt khảo sát';
 const storage=(client=peers[0])=>({
  rpc:async(name,args)=>{try{return{data:await query(name,Object.values(args).map(v=>Array.isArray(v)?JSON.stringify(v):v),client)};}catch(error){return{error};}},
  from:()=>({select:()=>({eq:(_key,page)=>({maybeSingle:async()=>({data:(await db.query('SELECT * FROM facebook_pages WHERE page_id=$1',[page])).rows[0]})})})})
 });
 const stamp=async()=>Number((await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint n')).rows[0].n);
 const settings=(c,g)=>({VPT_FB_CARE_PAGES:c.page,VPT_FACEBOOK_APP_SECRET:secret,VPT_CARE_RUNTIME:'1',VPT_CARE_RUNTIME_OPENAI:'1',
  VPT_CARE_RUNTIME_PRINCIPAL:g.agent,VPT_CARE_RUNTIME_COMPANY:company,VPT_CARE_RUNTIME_GRANT:g.id,VPT_CARE_RUNTIME_PAGE:c.page,
  VPT_CARE_ADVISOR_INFERENCE_POLICY:g.policy,VPT_CARE_ADVISOR_OPENAI_KEY:credential,VPT_CARE_RUNTIME_ECHO:'1',
  VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_DISPATCH:'1',VPT_SURVEY_OUTCOMES:'1'});
 const receive=async(x,events)=>{
  const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:x.c.page,messaging:events}]}));
  await createCustomerCare({db:storage(peers[2]),isPrimary:()=>true,env:x.env}).receive({
   facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}});
 };
 const incoming=async(x,text,payload)=>({sender:{id:x.c.psid},recipient:{id:x.c.page},timestamp:await stamp(),
  message:{mid:randomUUID(),text,...(payload?{quick_reply:{payload}}:{})}});
 const echo=async(x,payload)=>({sender:{id:x.c.page},recipient:{id:x.c.psid},timestamp:await stamp(),
  message:{mid:randomUUID(),text:payload.message.text,is_echo:true,app_id:789,metadata:payload.message.metadata}});
 const turns=async c=>(await db.query('SELECT * FROM crm_care_control.runtime_turns WHERE thread_id=$1 ORDER BY created_at,request_id',[c.thread])).rows;
 const bookings=async c=>(await db.query('SELECT * FROM crm_survey_control.bookings WHERE thread_id=$1',[c.thread])).rows;
 const setup=async()=>{
  // fixture traverses signed Lead Ads intake and signed Messenger ingress, then
  // an explicit operator connection; it does not seed the resulting Lead/link.
  const c=await fixture(),g=await enroll(c),x={c,g,env:settings(c,g),posts:[],errors:[],beforeResponse:null};
  const infer=createCareOpenAiInference({db:storage(),isPrimary:()=>true,env:x.env,authority:'RUNTIME',fetchImpl:async(url,init)=>{
   assert.equal(url,'https://api.openai.com/v1/responses');
   const body=JSON.parse(init.body),input=JSON.parse(body.input);x.posts.push(body);
   assert.equal(body.model,model);
   for(const id of[company,admin,g.agent,g.id,c.thread,c.psid])assert.equal(init.body.includes(id),false);
   const survey=input.messages.findLast(m=>m.direction==='inbound'&&m.text===ask+' tại '+address);
   const result=survey?{action:'SURVEY',answer:null,needs:[{field:'request',message:survey.id,quote:ask},{field:'location',message:survey.id,quote:address}]}:
    {action:'ANSWER',answer:input.answers[0].id,needs:[]};
   if(x.beforeResponse)await x.beforeResponse();
   return new Response(JSON.stringify({id:'resp_journey_'+x.posts.length,model,status:'completed',usage:{input_tokens:20,output_tokens:10,total_tokens:30},
    output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(result)}]}]}));
  }});
  x.worker=()=>createCareRuntime({db:storage(),isPrimary:()=>true,env:x.env,infer,onError:e=>x.errors.push(e)});
  return x;
 };
 const costs=async(x,cid=company)=>{
  const res=response();await createCareInferenceCosts({db:storage(),isPrimary:()=>true,env:{VPT_CARE_COST_ADMIN:'1'}})(
   {user:{id:admin},query:{companyId:cid,policyId:x.g.policy}},res);
  if(cid===company){assert.equal(res.code,200,JSON.stringify(res.body));(await import('../../frontend/src/components/facebook/careInferenceCostState.mjs')).inferenceCosts(res.body,company,x.g.policy,false);}
  return res;
 };
 await t.test('signed paid Lead traverses metered AI advice, confirmed survey, handoff and the same cohort dashboard',async()=>{
  const x=await setup(),{c,g}=x,trial=randomUUID(),zeroAccount='act_6980000';
  const day=new Date(Date.now()+7*3600000-86400000).toISOString().slice(0,10);
  const since=new Date(Date.now()+7*3600000-30*86400000).toISOString().slice(0,10);
  await db.query("INSERT INTO fb_ad_accounts(ad_account_id,company_id,bat,access_token) VALUES($1,$2,true,'synthetic')",[zeroAccount,company]);
  await query('marketing_lead_trial_set',[admin,company,trial,randomUUID(),{name:'Synthetic complete AI journey',since,until:day,expectedRevision:0}]);
  const accounts=(await db.query('SELECT ad_account_id FROM fb_ad_accounts WHERE company_id=$1',[company])).rows;
  assert.deepEqual(accounts.map(x=>x.ad_account_id).sort(),[account,zeroAccount].sort());
  const inventory=(await db.query('SELECT marketing_measurement.source_inventory($1,$2) r',[company,trial])).rows[0].r;
  assert.equal(inventory.complete,true);assert.equal(inventory.accounts.length,2);assert.equal(inventory.pages.length,1);
  for(const {ad_account_id:accountId}of accounts){
   const amount=accountId===account?200000:50000;
   const fake=provider({account:accountId,since,until:day,mutate:body=>{for(const row of body.data)row.spend=String(row.ad_id==='70'?0:amount);return body;}});
   const evidence=await readAccountSpendWithDelivery({...fake.input,now:new Date().toISOString()});
   const run=await query('marketing_spend_begin',[accountId,company,since,day]);
   await query('marketing_spend_finish',[run.id,company,evidence,null]);
  }
  const cohort=async(cid=company)=>{
   const res=response();await createCohortOperations({db:storage(),isPrimary:()=>true,env:{VPT_MARKETING_COHORT_OPERATIONS:'1',VPT_MARKETING_TRIAL_REPORT:'1'}})(
    {user:{userId:admin},params:{trialId:trial},query:{company_id:cid}},res);
   if(cid===company){assert.equal(res.code,200,JSON.stringify(res.body));(await import('../../frontend/src/components/marketing/cohortOperationsState.mjs')).cohortOperationsResult(res.body,company,admin,trial);}
   return res;
  };
  const quality=await query('crm_lead_quality_read',[admin,company,c.lead]);assert.equal(quality.status,'PENDING');
  const before=(await cohort()).body;
  await query('crm_lead_quality_record',[admin,company,c.lead,randomUUID(),quality.revision,quality.contextVersion,{
   status:'QUALIFIED',contactVerified:true,demandMatches:true,serviceAreaVerified:true,evidence:'Synthetic operator verified contact, demand and region in full journey'}]);
  const qualified=(await cohort()).body;
  assert.equal(qualified.counts.qualifiedGroups,before.counts.qualifiedGroups+1);
  const facts=await query('marketing_lead_trial_snapshot',[admin,company,trial]),measured=reportTrial(facts);
  assert.equal(measured.spend.spendVnd,250000);assert.equal(measured.spend.status,'KNOWN_TO_DATE');
  assert.ok(measured.accountDelivery.accounts.some(a=>a.accountId===zeroAccount&&a.spendVnd===50000));
  assert.equal((await db.query("SELECT count(*)::int n FROM crm_lead_source_evidence WHERE proof->>'accountId'=$1",[zeroAccount])).rows[0].n,0);
  assert.ok(measured.items.some(i=>i.acquisitionLeadId===c.lead&&i.status==='QUALIFIED'));
  // Complete business journey does not by itself attest the provider census.
  assert.equal(measured.costPerQualifiedLeadVnd,null);assert.equal(measured.targetMetToDate,false);

  await x.worker().drain();assert.deepEqual(x.errors,[]);assert.equal(x.posts.length,1);
  const first=(await turns(c))[0];assert.ok(first);
  const draft=(await db.query('SELECT state,result FROM crm_care_control.advisor_runs WHERE request_id=$1',[first.request_id])).rows[0];
  assert.equal(draft.state,'DRAFT');assert.equal(draft.result.needsVerified,false);
  const sendPolicy=randomUUID();
  await db.query("INSERT INTO crm_care_control.send_policies(id,principal_id,grant_id,company_id,page_id,active,starts_at,expires_at,app_id,graph_version,credential_hash,allowed_entries,max_messages,approval_reference) VALUES($1,$2,$3,$4,$5,true,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day','789','v24.0',$6,$7,5,'Synthetic source-backed answer authority only')",
   [sendPolicy,g.agent,g.id,company,c.page,sha('synthetic'),{[draft.result.entryId]:draft.result.entryVersion}]);
  x.env.VPT_CARE_RUNTIME_SEND='1';x.env.VPT_CARE_RUNTIME_SEND_POLICY=sendPolicy;
  let sentAnswers=0,answerEcho;
  const answer=()=>createCareAnswerDispatch({db:storage(),isPrimary:()=>true,env:x.env,onError:e=>x.errors.push(e),fetchImpl:async(url,init)=>{
   sentAnswers++;assert.equal(url,'https://graph.facebook.com/v24.0/'+c.page+'/messages');
   const payload=JSON.parse(init.body);assert.equal(payload.message.text,draft.result.text);
   answerEcho=await echo(x,payload);
   return new Response(JSON.stringify({recipient_id:c.psid,message_id:answerEcho.message.mid}));
  }});
  await answer().drain();await answer().drain();assert.equal(sentAnswers,1);assert.deepEqual(x.errors,[]);
  const delivery=(await query('crm_care_runtime_read',[admin,company,first.request_id])).delivery;
  assert.equal(delivery.state,'SENT');assert.equal(delivery.echoObserved,false);

  const staff=randomUUID(),region=(await db.query('SELECT region_id FROM crm_leads WHERE id=$1',[c.lead])).rows[0].region_id;
  const starts=Date.now()+4*86400000,ends=starts+3600000,surveyPolicy=randomUUID();
  await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2",[staff,company]);
  await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[staff,region]);
  await db.query("INSERT INTO crm_survey_control.crm_survey_calendar_staff VALUES($1,$2,$3,'Synthetic full journey calendar enrollment')",[staff,company,admin]);
  await query('crm_survey_roster_change',[admin,company,randomUUID(),{action:'SAVE',staffId:staff,regionId:region,expectedRevision:0,reason:'Synthetic verified complete calendar for full journey',
   document:{calendarSource:'CRM_COMPLETE',externalCalendarCoverage:'ALL_BUSY_IN_CRM',sourceReference:'Synthetic busy time included in CRM',validUntil:new Date(ends+86400000).toISOString(),bufferMinutes:30,
    slots:[{startsAt:new Date(starts).toISOString(),endsAt:new Date(ends).toISOString()}]}}]);
  await db.query("INSERT INTO crm_survey_control.runtime_policies(id,principal_id,grant_id,company_id,page_id,active,starts_at,expires_at,region_ids,staff_ids,horizon_days,notice_minutes,max_proposals,approval_reference) VALUES($1,$2,$3,$4,$5,true,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day',$6,$7,7,60,2,'Synthetic survey delegation only')",
   [surveyPolicy,g.agent,g.id,company,c.page,[region],[staff]]);
  await db.query("INSERT INTO crm_survey_control.ingress_pages VALUES($1,$2,true,'Synthetic full journey confirmation')",[c.page,company]);
  await db.query("INSERT INTO crm_survey_control.dispatch_pages VALUES($1,$2,'789','v24.0',true,'Synthetic full journey dispatch',$3,'Synthetic token evidence only')",[c.page,company,sha('synthetic')]);
  await db.query("INSERT INTO crm_survey_control.outcome_pages VALUES($1,$2,true,'Synthetic full journey outcome')",[c.page,company]);
  x.env.VPT_CARE_RUNTIME_SURVEY='1';x.env.VPT_CARE_RUNTIME_SURVEY_POLICY=surveyPolicy;
  const request=await incoming(x,ask+' tại '+address);await receive(x,[request,request]);
  await x.worker().drain();assert.equal(x.posts.length,1,'ACK without echo must not disclose incomplete history to the next inference');
  assert.equal((await turns(c)).length,1);
  await receive(x,[answerEcho,answerEcho]);
  assert.equal((await query('crm_care_runtime_read',[admin,company,first.request_id])).delivery.echoObserved,true);
  await x.worker().drain();await x.worker().drain();assert.deepEqual(x.errors,[]);assert.equal(x.posts.length,2);
  const allTurns=await turns(c);assert.equal(allTurns.length,2);
  const scheduled=(await db.query('SELECT * FROM crm_survey_control.runtime_requests WHERE request_id=$1',[allTurns[1].request_id])).rows[0];
  assert.ok(scheduled?.proposal_id);const proposalId=scheduled.proposal_id;
  const proposal=(await db.query('SELECT * FROM crm_survey_control.proposals WHERE id=$1',[proposalId])).rows[0];
  assert.equal(proposal.business.staffId,staff);assert.equal(proposal.business.salesOwnerId,sales);assert.equal(proposal.business.location,address);
  assert.equal(Date.parse(proposal.business.startsAt),starts);assert.equal((await bookings(c)).length,0);
  let sentProposals=0,click;
  const sender=()=>createSurveyDispatch({db:storage(),isPrimary:()=>true,env:x.env,onError:e=>x.errors.push(e),fetchImpl:async(_url,init)=>{
   sentProposals++;const payload=JSON.parse(init.body),event=await echo(x,payload);
   click=await incoming(x,'Xác nhận lịch',payload.message.quick_replies[0].payload);
   await receive(x,[event,click]);assert.equal((await bookings(c)).length,0,'customer click before ACK remains pending');
   return new Response(JSON.stringify({recipient_id:c.psid,message_id:event.message.mid}));
  }});
  await sender().drain();await receive(x,[click,click]);await sender().drain();
  assert.equal(sentProposals,1);const canonicalBookings=await bookings(c);assert.equal(canonicalBookings.length,1);
  const eventId=canonicalBookings[0].event_id;
  const events=(await db.query('SELECT * FROM crm_events WHERE lead_id=$1',[c.lead])).rows;assert.equal(events.length,1);
  assert.equal(events[0].id,eventId);assert.equal(events[0].assignee_id,staff);assert.equal(events[0].customer_id,c.customer);assert.equal(events[0].company_id,company);assert.equal(events[0].created_by,null);
  const participants=(await db.query('SELECT user_id,status FROM crm_event_participants WHERE event_id=$1',[eventId])).rows;
  assert.deepEqual(participants,[{user_id:staff,status:'confirmed'}]);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.handoffs WHERE proposal_id=$1',[proposalId])).rows[0].n,1);
  let outcomes=0;
  const outcome=()=>createSurveyOutcomeDispatch({db:storage(),isPrimary:()=>true,env:x.env,onError:e=>x.errors.push(e),fetchImpl:async(_url,init)=>{
   outcomes++;const payload=JSON.parse(init.body);assert.match(payload.message.text,/^Đã đặt lịch/);
   const event=await echo(x,payload);await receive(x,[event]);return new Response(JSON.stringify({recipient_id:c.psid,message_id:event.message.mid}));
  }});
  await outcome().drain();await outcome().drain();assert.equal(outcomes,1);assert.deepEqual(x.errors,[]);
  const booked=(await cohort()).body;
  assert.equal(booked.counts.bookedGroups,qualified.counts.bookedGroups+1);
  assert.equal(booked.counts.pendingHandoffs,qualified.counts.pendingHandoffs+1);
  // API returns the first 50 attention rows; older fixture exceptions can
  // legitimately precede this appointment. Totals and direct scoped read
  // must prove this handoff even when it is outside that projection window.
  if(booked.attentionTotal<=50)assert.ok(booked.attention.some(i=>i.leadId===c.lead&&i.reason==='HANDOFF_PENDING'));
  const handoff=await query('crm_survey_handoff_read',[staff,company,proposalId,null,null]);
  assert.equal(handoff.state,'PENDING');assert.equal(handoff.appointment.location,address);assert.equal(handoff.lead?.id||handoff.leadId,c.lead);
  assert.equal(handoff.companyId,company);
  assert.ok(handoff.messages.some(m=>m.content===draft.result.text));
  assert.ok(handoff.messages.some(m=>m.content===ask+' tại '+address));
  const ackId=randomUUID(),ack={proposalId,expectedVersion:handoff.version};
  await query('crm_survey_handoff_ack',[staff,company,ackId,ack]);await query('crm_survey_handoff_ack',[staff,company,ackId,ack]);
  const handed=(await cohort()).body;
  assert.equal(handed.counts.pendingHandoffs,qualified.counts.pendingHandoffs);
  assert.equal(handed.counts.acknowledgedHandoffs,qualified.counts.acknowledgedHandoffs+1);
  assert.ok(!handed.attention.some(i=>i.leadId===c.lead&&i.reason==='HANDOFF_PENDING'));
  const cost=(await costs(x)).body;assert.equal(cost.summary.usageReceipts,2);assert.equal(cost.summary.totalTokens,60);
  const receipts=(await db.query('SELECT actor_id,state,request_id FROM crm_care_control.inference_receipts WHERE policy_id=$1',[g.policy])).rows;
  assert.equal(receipts.length,2);assert.ok(receipts.every(r=>r.actor_id===g.agent&&r.state==='USAGE_RECORDED'));
  assert.deepEqual(receipts.map(r=>r.request_id).sort(),allTurns.map(r=>r.request_id).sort());
  assert.equal(cost.summary.pendingReceipts,0);assert.equal(cost.summary.reservedVnd,4000);assert.equal(cost.actualCostVnd,null);
  assert.equal((await costs(x,other)).code,403);assert.equal((await cohort(other)).code,403);
  await c.intake.receive(c.request);await c.intake.drain();await x.worker().drain();
  assert.equal(x.posts.length,2);assert.equal((await bookings(c)).length,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_lead_source_evidence WHERE lead_id=$1',[c.lead])).rows[0].n,1);
  await receive(x,[await incoming(x,'STOP')]);await x.worker().drain();await answer().drain();await sender().drain();await outcome().drain();
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'OPTED_OUT');
  assert.equal(x.posts.length,2);assert.equal(sentAnswers,1);assert.equal(sentProposals,1);assert.equal(outcomes,1);
  assert.equal((await cohort()).body.counts.bookedGroups,booked.counts.bookedGroups);
  const failed=await query('marketing_spend_begin',[zeroAccount,company,since,day]);
  await query('marketing_spend_finish',[failed.id,company,null,'SOURCE_UNAVAILABLE']);
  const unavailable=reportTrial(await query('marketing_lead_trial_snapshot',[admin,company,trial]));
  assert.equal(unavailable.spend.status,'UNKNOWN');assert.equal(unavailable.spend.spendVnd,null);
  assert.equal(unavailable.costPerQualifiedLeadVnd,null);assert.equal(unavailable.targetMetToDate,false);
 });
 await t.test('human takeover and signed STOP during provider response preserve usage but suppress an answer',async()=>{
  for(const action of['TAKEOVER','OPT_OUT']){
   const x=await setup();
   x.beforeResponse=async()=>{
    if(action==='OPT_OUT')await receive(x,[await incoming(x,'STOP')]);
    else{const view=await query('crm_care_read',[admin,company,x.c.thread]);await query('crm_care_control',[admin,company,randomUUID(),{
     threadId:x.c.thread,expectedVersion:view.version,action,reason:'Synthetic human takes over while provider response is in flight'}]);}
   };
   await x.worker().drain();await x.worker().drain();assert.deepEqual(x.errors,[]);assert.equal(x.posts.length,1);
   const mode=(await query('crm_care_read',[admin,company,x.c.thread])).mode;
   assert.equal(mode,action==='TAKEOVER'?'HUMAN_ACTIVE':'OPTED_OUT');
   const turn=(await turns(x.c))[0],run=await query('crm_care_runtime_read',[admin,company,turn.request_id]);
   assert.equal(run.result,null);assert.equal((await bookings(x.c)).length,0);
   const cost=(await costs(x)).body;assert.equal(cost.summary.usageReceipts,1);assert.equal(cost.summary.reservedVnd,2000);assert.equal(cost.actualCostVnd,null);
   assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.send_attempts WHERE request_id=$1',[turn.request_id])).rows[0].n,0);
  }
 });
};
