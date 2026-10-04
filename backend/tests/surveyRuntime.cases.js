'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash,createHmac}=require('node:crypto');
const {createCareRuntime}=require('../src/modules/marketingAutomation/careRuntime');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
const {createSurveyDispatch}=require('../src/modules/marketingAutomation/facebookSurveyDispatch');
const {createSurveyOutcomeDispatch}=require('../src/modules/marketingAutomation/facebookSurveyOutcomes');
const sha=x=>createHash('sha256').update(x).digest('hex');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,enroll,begin:plainBegin,finish,lockWait})=>{
 const address='123 Đường Kiểm Thử, Thành phố Hồ Chí Minh',ask='Cho tôi đặt khảo sát';
 const setup=async(options={})=>{
  const c=await fixture(),g=await enroll(c,options.grant||{}),staff=options.staff||randomUUID();
  const region=(await db.query('SELECT region_id FROM crm_leads WHERE id=$1',[c.lead])).rows[0].region_id;
  const a=options.a||Date.now()+4*86400000,b=a+3600000;
  if(!options.staff){
   await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2",[staff,company]);
   await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[staff,region]);
   await db.query("INSERT INTO crm_survey_control.crm_survey_calendar_staff(staff_id,company_id,enrolled_by,release_reference) VALUES($1,$2,$3,'Synthetic runtime calendar enrollment only')",[staff,company,admin]);
   await query('crm_survey_roster_change',[admin,company,randomUUID(),{action:'SAVE',staffId:staff,regionId:region,expectedRevision:0,reason:'Synthetic actual calendar source for runtime acceptance',
    document:{calendarSource:'CRM_COMPLETE',externalCalendarCoverage:'ALL_BUSY_IN_CRM',sourceReference:'Synthetic isolated complete calendar only',validUntil:new Date(a+86400000).toISOString(),bufferMinutes:30,slots:[{startsAt:new Date(a).toISOString(),endsAt:new Date(b).toISOString()}]}}]);
  }
  const p={id:randomUUID(),principal_id:g.agent,grant_id:g.id,company_id:company,page_id:c.page,active:true,
   starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+86400000),region_ids:[region],staff_ids:[staff],horizon_days:7,notice_minutes:60,max_proposals:2,
   approval_reference:'Synthetic isolated Agent proposal send and confirmed booking authority',...options.policy};
  const cols=Object.keys(p);await db.query('INSERT INTO crm_survey_control.runtime_policies('+cols.join(',')+') VALUES('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(p));
  await db.query("INSERT INTO crm_survey_control.ingress_pages VALUES($1,$2,true,'Synthetic survey runtime ingress only')",[c.page,company]);
  await db.query("INSERT INTO crm_survey_control.dispatch_pages VALUES($1,$2,'789','v24.0',true,'Synthetic runtime dispatch only',$3,'Synthetic token evidence only')",[c.page,company,sha('synthetic')]);
  await db.query("INSERT INTO crm_survey_control.outcome_pages VALUES($1,$2,true,'Synthetic runtime outcome only')",[c.page,company]);
  await c.receive([c.incoming(ask+' tại '+address)]);return{c,g,p,staff,region,a,b};
 };
 const begin=(x,client=peers[0],request=x.c.key)=>query('crm_care_runtime_begin_with_survey',[x.g.agent,company,x.g.id,request,x.c.thread,x.g.worker,x.p.id],client);
 const selection=r=>{const m=r.context.messages.findLast(m=>m.direction==='inbound'&&m.content.includes(address));return{action:'SURVEY',entryId:null,
  needs:[{field:'request',messageId:m.id,quote:ask},{field:'location',messageId:m.id,quote:address}]};};
 const prepare=async x=>{x.r=await begin(x);x.response=selection(x.r);x.result=await finish(x.c,x.g,x.r,x.response);x.id=x.result.survey?.proposalId;assert.ok(x.id,JSON.stringify(x.result));return x;};
 const claim=(x,client=peers[0])=>query('crm_survey_dispatch_claim',[x.c.page,x.id,x.g.worker,sha('synthetic')],client);
 const count=async x=>(await db.query('SELECT count(*)::int n FROM crm_survey_control.bookings WHERE thread_id=$1',[x.c.thread])).rows[0].n;
 const storage=client=>({rpc:async(n,a)=>{try{return{data:await query(n,Object.values(a).map(v=>Array.isArray(v)?JSON.stringify(v):v),client)}}catch(error){return{error}}},
  from:()=>({select:()=>({eq:(_k,page)=>({maybeSingle:async()=>({data:(await db.query('SELECT * FROM facebook_pages WHERE page_id=$1',[page])).rows[0]})})})})});
 const env=x=>({VPT_FB_CARE_PAGES:x.c.page,VPT_FACEBOOK_APP_SECRET:'synthetic-runtime-survey-secret',VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_DISPATCH:'1',VPT_SURVEY_OUTCOMES:'1'});
 const stamp=async()=>Number((await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint n')).rows[0].n);
 const incoming=async(x,text='Xác nhận lịch',payload)=>({sender:{id:x.c.psid},recipient:{id:x.c.page},timestamp:await stamp(),message:{mid:randomUUID(),text,...(payload?{quick_reply:{payload}}:{})}});
 const echo=async(x,payload,mid=randomUUID())=>({sender:{id:x.c.page},recipient:{id:x.c.psid},timestamp:await stamp(),message:{mid,text:payload.message.text,is_echo:true,app_id:789,metadata:payload.message.metadata}});
 const receive=async(x,events,client=peers[2])=>{const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:x.c.page,messaging:events}]}));
  await createCustomerCare({db:storage(client),isPrimary:()=>true,env:env(x)}).receive({facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',env(x).VPT_FACEBOOK_APP_SECRET).update(raw).digest('hex')}});};
 const sent=async x=>{const a=await claim(x);assert.equal(a.status,'CLAIMED');const e=await echo(x,a.payload);await receive(x,[e]);
  await query('crm_survey_dispatch_result',[a.attemptId,x.g.worker,{status:'ACK',recipientId:x.c.psid,messageId:e.message.mid}]);return a;};
 const clicked=async(x,a,client=peers[2])=>{const click=await incoming(x,'Xác nhận lịch',a.payload.message.quick_replies[0].payload);await receive(x,[click],client);return click;};

 await t.test('survey runtime installs no live policy and private cores cannot be called by application roles',async()=>{
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.runtime_policies')).rows[0].n,0);
  for(const role of['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{
   for(const table of['runtime_policies','runtime_requests'])await assert.rejects(db.query('SELECT * FROM crm_survey_control.'+table),e=>e.code==='42501');
   await assert.rejects(query('crm_survey_control.context_core',[company,randomUUID()],db),e=>e.code==='42501');
   await assert.rejects(query('crm_survey_control.proposal_authorize',[randomUUID()],db),e=>e.code==='42501');
   if(role!=='service_role')await assert.rejects(query('crm_care_runtime_begin_with_survey',Array(7).fill(randomUUID()),db),e=>e.code==='42501');
  }finally{await db.query('RESET ROLE');}}
 });
 await t.test('actual AI worker proposes from live calendar; signed customer click before ACK books and hands off once',async()=>{
  const x=await setup(),errors=[],calls=[],runtimeEnv={...env(x),VPT_CARE_RUNTIME:'1',VPT_CARE_RUNTIME_PRINCIPAL:x.g.agent,VPT_CARE_RUNTIME_COMPANY:company,
   VPT_CARE_RUNTIME_GRANT:x.g.id,VPT_CARE_RUNTIME_PAGE:x.c.page,VPT_CARE_ADVISOR_INFERENCE_POLICY:x.g.policy,VPT_CARE_RUNTIME_SURVEY:'1',VPT_CARE_RUNTIME_SURVEY_POLICY:x.p.id};
  const run=createCareRuntime({db:storage(peers[0]),isPrimary:()=>true,env:runtimeEnv,workerId:x.g.worker,onError:e=>errors.push(e),infer:async input=>{
   calls.push(input);assert.ok(input.schema.properties.action.enum.includes('SURVEY'));const m=input.input.messages.findLast(m=>m.text.includes(address));
   return{action:'SURVEY',answer:null,needs:[{field:'request',message:m.id,quote:ask},{field:'location',message:m.id,quote:address}]};}});
  await run.drain();await run.drain();assert.deepEqual(errors,[]);assert.equal(calls.length,1);
  const binding=(await db.query('SELECT sr.* FROM crm_survey_control.runtime_requests sr JOIN crm_care_control.runtime_turns rt USING(request_id) WHERE rt.thread_id=$1',[x.c.thread])).rows[0];
  x.id=binding.proposal_id;x.c.key=binding.request_id;assert.ok(x.id);assert.equal(await count(x),0);
  const p=(await db.query('SELECT * FROM crm_survey_control.proposals WHERE id=$1',[x.id])).rows[0];assert.equal(p.actor_id,x.g.agent);assert.equal(p.business.location,address);
  assert.equal(Date.parse(p.business.startsAt),x.a);assert.equal(p.business.staffId,x.staff);assert.equal(p.business.salesOwnerId,sales);
  let posts=0,click,echoEvent;
  const sender=createSurveyDispatch({db:storage(peers[0]),isPrimary:()=>true,env:env(x),workerId:x.g.worker,fetchImpl:async(_,init)=>{
   posts++;const payload=JSON.parse(init.body);assert.match(payload.message.text,/chưa giữ chỗ/);assert.ok(payload.message.text.includes(address));
   echoEvent=await echo(x,payload);click=await incoming(x,'Xác nhận lịch',payload.message.quick_replies[0].payload);await receive(x,[echoEvent,click]);assert.equal(await count(x),0);
   return{ok:true,json:async()=>({recipient_id:x.c.psid,message_id:echoEvent.message.mid})};}});
  await sender.drain();await sender.drain();await receive(x,[echoEvent,click]);assert.equal(posts,1);assert.equal(await count(x),1);
  assert.equal((await query('crm_care_runtime_candidates',[x.g.agent,company,x.g.id,x.c.page,10])).items.length,0);
  assert.equal((await begin(x,peers[0],randomUUID())).invoke,false);
  const b=(await db.query('SELECT * FROM crm_survey_control.bookings WHERE proposal_id=$1',[x.id])).rows[0];
  assert.equal((await db.query('SELECT created_by FROM crm_events WHERE id=$1',[b.event_id])).rows[0].created_by,null);
  let outcomes=0;const outcome=createSurveyOutcomeDispatch({db:storage(peers[0]),isPrimary:()=>true,env:env(x),fetchImpl:async(_,init)=>{
   outcomes++;const payload=JSON.parse(init.body);assert.match(payload.message.text,/^Đã đặt lịch/);const e=await echo(x,payload);await receive(x,[e]);return{ok:true,json:async()=>({recipient_id:x.c.psid,message_id:e.message.mid})};}});
  await outcome.drain();await outcome.drain();assert.equal(outcomes,1);
  const handoff=await query('crm_survey_handoff_read',[x.staff,company,x.id,null,null]);assert.equal(handoff.state,'PENDING');assert.equal(handoff.canAcknowledge,true);
  assert.ok(handoff.messages.some(m=>m.content.includes(address)));assert.equal(handoff.appointment.location,address);
  const ack=await query('crm_survey_handoff_ack',[x.staff,company,randomUUID(),{proposalId:x.id,expectedVersion:handoff.version}]);assert.equal(ack.state,'ACKNOWLEDGED');
 });
 await t.test('ordinary runtime, human facades and foreign policies cannot mint a survey delegation',async()=>{
  const x=await setup(),r=await plainBegin(x.c,x.g);
  await assert.rejects(finish(x.c,x.g,r,selection(r)),e=>e.code==='42501');
  await assert.rejects(query('crm_survey_availability',[x.g.agent,company,x.c.thread,new Date(x.a),new Date(x.b)]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_begin_with_survey',[x.g.agent,other,x.g.id,randomUUID(),x.c.thread,x.g.worker,x.p.id]),e=>e.code==='42501');
  const y=await setup();y.p.id=x.p.id;await assert.rejects(begin(y),e=>e.code==='42501');
 });
 await t.test('model cannot invent location, staff, time, consent or select survey without exact need evidence',async()=>{
  const x=await setup(),r=await begin(x),good=selection(r);
  for(const bad of[{...good,confirmed:true},{...good,startsAt:new Date().toISOString()},{...good,staffId:x.staff},{...good,entryId:r.context.entries[0].entryId},
   {...good,needs:[]},{...good,needs:[good.needs[0],{...good.needs[1],quote:'A location never sent by this customer'}]}])
   await assert.rejects(finish(x.c,x.g,r,bad),e=>e.code==='22023');
  const result=await finish(x.c,x.g,r,good);assert.ok(result.survey.proposalId);assert.equal(await count(x),0);
 });
 await t.test('replayed or concurrent finish creates only one immutable proposal and no booking',async()=>{
  const x=await setup(),r=await begin(x),s=selection(r);
  const results=await Promise.all([finish(x.c,x.g,r,s,peers[0]),finish(x.c,x.g,r,s,peers[1])]);assert.equal(results[0].survey.proposalId,results[1].survey.proposalId);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.proposals WHERE thread_id=$1',[x.c.thread])).rows[0].n,1);assert.equal(await count(x),0);
  assert.equal((await begin(x)).invoke,false);
 });
 await t.test('STOP and human takeover during inference discard the proposed survey',async()=>{
  for(const action of['OPT_OUT','TAKEOVER']){const x=await setup(),r=await begin(x),v=await query('crm_care_read',[admin,company,x.c.thread]);
   await query('crm_care_control',[admin,company,randomUUID(),{threadId:x.c.thread,expectedVersion:v.version,action,reason:'Synthetic user control while survey inference is running'}]);
   const result=await finish(x.c,x.g,r,selection(r));assert.equal(result.stale,true);assert.equal(result.survey,null);assert.equal(await count(x),0);
  }
 });
 await t.test('unavailable calendar, disallowed region/staff and missing usable address enter human queue',async()=>{
  for(const kind of['calendar','region','staff','address']){const x=await setup({policy:kind==='region'?{region_ids:[randomUUID()]}:kind==='staff'?{staff_ids:[randomUUID()]}:{}}),r=await begin(x),s=selection(r);
   if(kind==='calendar')await db.query('UPDATE crm_survey_rosters SET active=false WHERE staff_id=$1',[x.staff]);
   if(kind==='address')s.needs[1].quote='123';
   const result=await finish(x.c,x.g,r,s);assert.equal(result.handoff,true,kind);assert.ok(result.survey.reason);assert.equal(await count(x),0);
   assert.equal((await query('crm_care_read',[admin,company,x.c.thread])).mode,'HUMAN_REQUESTED');
  }
 });
 await t.test('policy or grant revoke-reactivate invalidates proposal dispatch and customer booking',async()=>{
  for(const table of['runtime_policies','runtime_grants'])for(const delivered of[false,true]){
   const x=await prepare(await setup()),a=delivered?await sent(x):null;
   const schema=table==='runtime_policies'?'crm_survey_control':'crm_care_control',id=table==='runtime_policies'?x.p.id:x.g.id;
   await db.query('UPDATE '+schema+'.'+table+' SET active=false WHERE id=$1',[id]);await db.query('UPDATE '+schema+'.'+table+' SET active=true WHERE id=$1',[id]);
   if(delivered)await clicked(x,a);else assert.equal((await claim(x)).status,'BLOCKED');assert.equal(await count(x),0);
  }
 });
 await t.test('a STOP in the same signed batch wins over an otherwise valid customer confirmation',async()=>{
  const x=await prepare(await setup()),a=await sent(x);
  await receive(x,[await incoming(x,'Xác nhận lịch',a.payload.message.quick_replies[0].payload),await incoming(x,'STOP')]);
  assert.equal(await count(x),0);assert.equal((await query('crm_care_read',[admin,company,x.c.thread])).mode,'OPTED_OUT');
 });
 await t.test('two customers may see a proposal but cannot book the same staff time concurrently',async()=>{
  const x=await prepare(await setup()),y=await prepare(await setup({staff:x.staff,a:x.a})),a=await sent(x),b=await sent(y);
  await Promise.all([clicked(x,a,peers[0]),clicked(y,b,peers[1])]);assert.equal(await count(x)+await count(y),1);
  const states=(await db.query('SELECT state FROM crm_survey_control.proposals WHERE id=ANY($1::uuid[])',[[x.id,y.id]])).rows.map(x=>x.state).sort();assert.deepEqual(states,['BOOKED','REJECTED']);
 });
 await t.test('post-proposal source or target changes cannot silently change the confirmed appointment',async()=>{
  for(const kind of['source','target']){const x=await prepare(await setup()),a=await sent(x);
   if(kind==='source')await db.query('UPDATE crm_survey_rosters SET revision=revision+1 WHERE staff_id=$1',[x.staff]);
   else await db.query('UPDATE crm_leads SET assigned_to=$2 WHERE id=$1',[x.c.lead,x.staff]);
   await clicked(x,a);assert.equal(await count(x),0);
  }
 });
 await t.test('lost proposal claim remains uncertain across recovery without resend or customer booking',async()=>{
  const x=await prepare(await setup()),a=await claim(x);assert.equal(a.status,'CLAIMED');assert.equal((await claim(x)).payload,undefined);
  await db.query("UPDATE crm_survey_control.dispatch_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE attempt_id=$1",[a.attemptId]);
  await query('crm_survey_dispatch_recover',[x.c.page,10]);await clicked(x,a);assert.equal(await count(x),0);assert.equal((await claim(x)).payload,undefined);
 });
 await t.test('policy lifetime bounds proposal and send lease, including expiry while waiting on the thread',async()=>{
  const x=await prepare(await setup({policy:{expires_at:new Date(Date.now()+8000)}}));
  const p=(await db.query('SELECT expires_at FROM crm_survey_control.proposals WHERE id=$1',[x.id])).rows[0];assert.ok(+p.expires_at<=+x.p.expires_at);
  await db.query('BEGIN');let pending;try{
   await db.query('SELECT 1 FROM crm_care_threads WHERE id=$1 FOR UPDATE',[x.c.thread]);const pid=(await peers[0].query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=claim(x).then(value=>({value}),error=>({error}));await lockWait(pid);await new Promise(r=>setTimeout(r,Math.max(0,+x.p.expires_at-Date.now()+80)));await db.query('COMMIT');
   const result=await pending;assert.equal(result.error,undefined);assert.equal(result.value.payload,undefined);assert.ok(['BLOCKED','UNAVAILABLE'].includes(result.value.status));
  }finally{await db.query('ROLLBACK');if(pending)await pending;}
 });
 await t.test('human proposal API still books through the same signed path and preserves human attribution',async()=>{
  const x=await setup(),a=await query('crm_survey_availability',[admin,company,x.c.thread,new Date(x.a).toISOString(),new Date(x.b).toISOString()]);
  const option=a.items.find(v=>v.staffId===x.staff),p=await query('crm_survey_propose',[admin,company,randomUUID(),{threadId:x.c.thread,optionId:option.optionId,startsAt:new Date(x.a).toISOString(),endsAt:new Date(x.b).toISOString(),location:address}]);
  x.id=p.proposalId;const delivered=await sent(x);await clicked(x,delivered);assert.equal(await count(x),1);
  assert.equal((await db.query('SELECT actor_id FROM crm_survey_control.proposals WHERE id=$1',[x.id])).rows[0].actor_id,admin);
 });
 await t.test('latest human facade retains safe replay, current actor and unresolved-send guards',async()=>{
  const x=await setup(),a=await query('crm_survey_availability',[admin,company,x.c.thread,new Date(x.a).toISOString(),new Date(x.b).toISOString()]);
  const command={threadId:x.c.thread,optionId:a.items.find(v=>v.staffId===x.staff).optionId,startsAt:new Date(x.a).toISOString(),endsAt:new Date(x.b).toISOString(),location:address},key=randomUUID();
  const p=await query('crm_survey_propose',[admin,company,key,command]);
  await db.query("UPDATE crm_survey_control.deliveries SET state='UNCERTAIN',started_at=clock_timestamp() WHERE proposal_id=$1",[p.proposalId]);
  await assert.rejects(query('crm_survey_propose',[admin,company,randomUUID(),command]),e=>e.code==='40001');
  assert.equal((await query('crm_survey_propose',[admin,company,key,command])).replayed,true);
  await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[x.c.lead,other]);
  try{await assert.rejects(query('crm_survey_propose',[admin,company,key,command]),e=>e.code==='42501');}
  finally{await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[x.c.lead,company]);}
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{await assert.rejects(query('crm_survey_propose',[admin,company,key,command]),e=>e.code==='42501');}
  finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
 });
 await t.test('quota includes expired proposals and cannot be reset by a new inbound turn',async()=>{
  const x=await prepare(await setup({policy:{max_proposals:1}}));
  await db.query("UPDATE crm_survey_control.proposals SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[x.id]);
  await x.c.receive([x.c.incoming(ask+' tại '+address)]);x.c.key=randomUUID();
  const r=await begin(x),result=await finish(x.c,x.g,r,selection(r));assert.equal(result.survey.reason,'SURVEY_ALLOWANCE_EXHAUSTED');assert.equal(result.handoff,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.proposals WHERE thread_id=$1',[x.c.thread])).rows[0].n,1);
 });
 for(const first of['confirmation','finish'])await t.test('observed '+first+' lock order cannot deadlock runtime finish against signed confirmation',async()=>{
  const x=await prepare(await setup()),a=await sent(x);await x.c.receive([x.c.incoming(ask+' tại '+address)]);x.c.key=randomUUID();const r=await begin(x),s=selection(r);
  const run=client=>finish(x.c,x.g,r,s,client),confirm=client=>clicked(x,a,client);
  await peers[0].query('BEGIN');let pending;
  try{await(first==='confirmation'?confirm(peers[0]):run(peers[0]));
   const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=(first==='confirmation'?run(peers[1]):confirm(peers[1])).then(value=>({value}),error=>({error}));await lockWait(pid);await peers[0].query('COMMIT');
   const result=await pending;assert.equal(result.error,undefined);assert.equal(await count(x),first==='confirmation'?1:0);
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending;}
 });
};
