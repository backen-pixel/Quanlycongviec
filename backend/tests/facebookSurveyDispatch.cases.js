'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHmac,createHash}=require('node:crypto');
const {createSurveyDispatch}=require('../src/modules/marketingAutomation/facebookSurveyDispatch');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
module.exports=async(t,{db,peers,query,company,other,admin,setup,finished})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/667_crm_survey_dispatch.sql'),'utf8');await db.query(sql);await db.query(sql);
 const pageToken=(await db.query("SELECT access_token FROM facebook_pages WHERE page_id='123'")).rows[0].access_token;
 const credentialHash=createHash('sha256').update(pageToken).digest('hex');
 await db.query("INSERT INTO crm_survey_control.dispatch_pages VALUES('123',$1,'4567','v24.0',true,'Synthetic isolated dispatch enrollment only',$2,'Synthetic Page token and app evidence only')",[company,credentialHash]);
 // Retire old, deliberately incomplete fixtures. Never modify real data.
 await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE state='OPEN'");
 const secret='synthetic-survey-dispatch-secret',env={VPT_FB_CARE_PAGES:'123',VPT_FACEBOOK_APP_SECRET:secret,VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_DISPATCH:'1'};
 const storage=client=>({rpc:async(name,args)=>{try{return{data:await query(name,Object.values(args).map(v=>Array.isArray(v)?JSON.stringify(v):v),client)}}catch(error){return{error}}},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{page_id:'123',default_company_id:company,is_active:true,access_token:pageToken}})})})})});
 const care=createCustomerCare({db:storage(peers[2]),isPrimary:()=>true,env});
 const stamp=async()=>Number((await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint n')).rows[0].n);
 const signed=events=>{const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:'123',messaging:events}]}));return{facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}}};
 const receive=events=>care.receive(signed(events));
 const incoming=async(c,text='Xác nhận lịch',payload)=>({sender:{id:c.psid},recipient:{id:'123'},timestamp:await stamp(),message:{mid:randomUUID(),text,...(payload?{quick_reply:{payload}}:{})}});
 const echo=async(c,payload,mid=randomUUID())=>({sender:{id:'123'},recipient:{id:c.psid},timestamp:await stamp(),message:{mid,text:payload.message.text,is_echo:true,app_id:4567,metadata:payload.message.metadata}});
 const delivery=async c=>(await db.query('SELECT * FROM crm_survey_control.deliveries WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0];
 const mode=async c=>(await db.query('SELECT mode FROM crm_care_threads WHERE id=$1',[c.thread])).rows[0].mode;
 const booking=async c=>(await db.query('SELECT * FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0];
 const finish=async c=>{await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1 AND state='OPEN'",[c.proposal.proposalId]);await finished(c);};
 const claim=(c,worker=randomUUID(),client=peers[0])=>query('crm_survey_dispatch_claim',['123',c.proposal.proposalId,worker,credentialHash],client);
 const ack=(a,worker,mid,client=peers[0],recipient=a.psid)=>query('crm_survey_dispatch_result',[a.attemptId,worker,{status:'ACK',recipientId:recipient,messageId:mid}],client);
 const worker=(fetchImpl,client=peers[0],extra={})=>createSurveyDispatch({db:storage(client),isPrimary:()=>true,env,fetchImpl,...extra});

 await t.test('real worker, signed own echo and customer click before ACK produce one booking',async()=>{
  const c=await setup();let posts=0,request,echoEvent,click;
  const w=worker(async(url,init)=>{
   posts++;assert.equal(url,'https://graph.facebook.com/v24.0/123/messages');request=JSON.parse(init.body);
   assert.equal(request.recipient.id,c.psid);assert.equal(request.messaging_type,'RESPONSE');assert.match(request.message.text,/chưa giữ chỗ/);
   echoEvent=await echo(c,request);click=await incoming(c,'Xác nhận lịch',request.message.quick_replies[0].payload);
   await receive([echoEvent,click]);assert.equal(await mode(c),'WAITING');assert.equal(await booking(c),undefined);
   return{ok:true,json:async()=>({recipient_id:c.psid,message_id:echoEvent.message.mid})};
  });
  await w.drain();assert.equal(posts,1);assert.ok(await booking(c));assert.equal((await delivery(c)).state,'SENT');
  await receive([echoEvent,click]);await w.drain();assert.equal(posts,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0].n,1);
  const legacy=care.legacyBody(JSON.parse(signed([echoEvent]).facebookRawBody.toString('utf8')));
  assert.equal(legacy.entry[0].messaging[0].message.metadata,undefined);
  await finish(c);
 });
 await t.test('ACK then echo and later confirmation survive fresh worker and receiver instances',async()=>{
  const c=await setup();let payload,mid=randomUUID();await worker(async(_,init)=>{payload=JSON.parse(init.body);return{ok:true,json:async()=>({recipient_id:c.psid,message_id:mid})};}).drain();
  await receive([await echo(c,payload,mid)]);assert.equal(await mode(c),'WAITING');
  await receive([await incoming(c,'Xác nhận lịch',payload.message.quick_replies[0].payload)]);assert.ok(await booking(c));await finish(c);
 });
 await t.test('simultaneous claim returns the private send payload only once',async()=>{
  const c=await setup(),w1=randomUUID(),w2=randomUUID();const results=await Promise.all([claim(c,w1,peers[0]),claim(c,w2,peers[1])]);
  assert.equal(results.filter(r=>r.status==='CLAIMED').length,1);assert.equal(results.filter(r=>r.payload).length,1);
  assert.equal((await claim(c,w1)).payload,undefined);assert.equal((await claim(c,w2)).payload,undefined);await finish(c);
 });
 await t.test('lost claim response and crash before POST remain uncertain after bounded recovery, never requeued',async()=>{
  const c=await setup(),a=await claim(c);assert.equal(a.status,'CLAIMED');
  await db.query("UPDATE crm_survey_control.dispatch_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE attempt_id=$1",[a.attemptId]);
  await query('crm_survey_dispatch_recover',['123',10]);assert.equal((await delivery(c)).state,'UNCERTAIN');
  assert.equal((await claim(c)).payload,undefined);assert.ok(!(await query('crm_survey_dispatch_candidates',['123',10])).includes(c.proposal.proposalId));await finish(c);
 });
 await t.test('timeout after provider accepted and emitted an echo does not falsely establish delivery or resend',async()=>{
  const c=await setup();let posts=0;
  const send=async(_,init)=>{posts++;await receive([await echo(c,JSON.parse(init.body))]);throw Error('synthetic timeout after acceptance');};
  await worker(send).drain();await worker(send).drain();assert.equal(posts,1);assert.equal((await delivery(c)).state,'UNCERTAIN');assert.equal(await mode(c),'WAITING');assert.equal(await booking(c),undefined);await finish(c);
 });
 await t.test('lost database ACK response retries only persistence and creates one ACK event',async()=>{
  const c=await setup();let lost=true,posts=0;const s=storage(peers[0]),rpc=s.rpc;
  s.rpc=async(name,args)=>{const r=await rpc(name,args);if(name==='crm_survey_dispatch_result'&&lost&&!r.error){lost=false;return{error:{code:'synthetic-response-lost'}}}return r;};
  await createSurveyDispatch({db:s,isPrimary:()=>true,env,fetchImpl:async()=>{posts++;return{ok:true,json:async()=>({recipient_id:c.psid,message_id:'ack-'+randomUUID()})}}}).drain();
  assert.equal(posts,1);assert.equal((await delivery(c)).state,'SENT');assert.equal((await db.query("SELECT count(*)::int n FROM crm_survey_control.proposal_events WHERE proposal_id=$1 AND action='DISPATCH_ACK'",[c.proposal.proposalId])).rows[0].n,1);await finish(c);
 });
 await t.test('recorded STOP, human takeover and revoked actor forbid claim without leaking payload',async()=>{
  for(const kind of ['stop','human','actor']){
   const c=await setup();if(kind==='actor')await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);else await receive([await incoming(c,kind==='stop'?'STOP':'Cho tôi gặp nhân viên')]);
   try{const a=await claim(c);assert.equal(a.status,'BLOCKED');assert.equal(a.payload,undefined);assert.equal((await delivery(c)).state,'QUEUED');}
   finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);await finish(c);}
  }
 });
 await t.test('whole-batch STOP wins over own echo and confirmation before ACK',async()=>{
  for(const control of ['STOP','Cho tôi gặp nhân viên']){
   const c=await setup();await worker(async(_,init)=>{
    const payload=JSON.parse(init.body),e=await echo(c,payload),click=await incoming(c,'Xác nhận lịch',payload.message.quick_replies[0].payload),stop=await incoming(c,control);
    e.message.mid='a-'+e.message.mid;click.message.mid='b-'+click.message.mid;stop.message.mid='z-'+stop.message.mid;
    await receive([e,click,stop]);return{ok:true,json:async()=>({recipient_id:c.psid,message_id:e.message.mid})};
   }).drain();assert.equal(await booking(c),undefined);assert.equal(await mode(c),control==='STOP'?'OPTED_OUT':'HUMAN_REQUESTED');assert.equal((await delivery(c)).state,'SENT');await finish(c);
  }
 });
 await t.test('own echoes never reopen an existing STOP or human-active thread',async()=>{
  for(const state of ['OPTED_OUT','HUMAN_REQUESTED','HUMAN_ACTIVE']){
   const c=await setup(),a=await claim(c);await db.query('UPDATE crm_care_threads SET mode=$1 WHERE id=$2',[state,c.thread]);
   await receive([await echo(c,a.payload)]);assert.equal(await mode(c),state);await finish(c);
  }
 });
 await t.test('wrong app, altered body or metadata cannot masquerade as an own echo',async()=>{
  for(const variant of ['app','body','metadata','attachment']){
   const c=await setup(),a=await claim(c),e=await echo(c,a.payload);
   if(variant==='app')e.message.app_id=999;if(variant==='body')e.message.text+=' altered';if(variant==='metadata')e.message.metadata='VPT_SURVEY_SEND_V1:'+randomUUID();if(variant==='attachment')e.message.attachments=[{type:'image',payload:{url:'https://example.invalid/synthetic'}}];
   await receive([e]);assert.equal(await mode(c),'HUMAN_REQUESTED');assert.equal((await delivery(c)).state,'SENDING');await finish(c);
  }
 });
 await t.test('echo/ACK MID disagreement is retained as conflict and prevents booking',async()=>{
  const c=await setup(),w=randomUUID(),a=await claim(c,w),e=await echo(c,a.payload);await receive([e]);
  const result={status:'ACK',recipientId:c.psid,messageId:'different-'+randomUUID()};
  assert.equal((await query('crm_survey_dispatch_result',[a.attemptId,w,result])).status,'CONFLICT');
  await query('crm_survey_dispatch_result',[a.attemptId,w,result]);assert.equal(await mode(c),'HUMAN_REQUESTED');
  await receive([await incoming(c,'Xác nhận lịch',a.payload.message.quick_replies[0].payload)]);assert.equal(await booking(c),undefined);
  assert.equal((await db.query("SELECT count(*)::int n FROM crm_survey_control.proposal_events WHERE proposal_id=$1 AND action='DISPATCH_CONFLICT'",[c.proposal.proposalId])).rows[0].n,1);await finish(c);
 });
 await t.test('conflicting echo metadata replay rejects without reopening or changing accepted evidence',async()=>{
  const c=await setup(),a=await claim(c),e=await echo(c,a.payload);await receive([e]);e.message.app_id=999;
  await assert.rejects(receive([e]),{code:'23505'});assert.equal(await mode(c),'WAITING');await finish(c);
 });
 await t.test('24-hour response window uses inbound evidence, never a newer outgoing message',async()=>{
  const c=await setup();await db.query("UPDATE crm_care_messages SET sent_at=clock_timestamp()-interval '25 hours' WHERE thread_id=$1",[c.thread]);
  await db.query('UPDATE crm_care_threads SET last_message_at=clock_timestamp(),last_inbound_at=clock_timestamp() WHERE id=$1',[c.thread]);
  assert.equal((await claim(c)).reason,'RESPONSE_WINDOW_CLOSED');await finish(c);
 });
 await t.test('proposal expiry and changed source prevent dispatch at the final check',async()=>{
  for(const kind of ['expired','source']){
   const c=await setup();if(kind==='expired')await db.query("UPDATE crm_survey_control.proposals SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[c.proposal.proposalId]);
   else await db.query('UPDATE crm_survey_rosters SET revision=revision+1 WHERE staff_id=$1',[c.staff]);
   const a=await claim(c);assert.equal(a.status,'BLOCKED');assert.equal(a.payload,undefined);await finish(c);
  }
 });
 await t.test('late ACK after revocation persists historical delivery but does not authorize booking',async()=>{
  const c=await setup(),w=randomUUID(),a=await claim(c,w);await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{assert.equal((await ack(a,w,randomUUID())).status,'SENT');await receive([await incoming(c,'Xác nhận lịch',a.payload.message.quick_replies[0].payload)]);assert.equal(await booking(c),undefined);}
  finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);await finish(c);}
 });
 await t.test('ACK racing stale recovery never downgrades SENT and wrong executor cannot write a receipt',async()=>{
  const c=await setup(),w=randomUUID(),a=await claim(c,w);await db.query("UPDATE crm_survey_control.dispatch_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE attempt_id=$1",[a.attemptId]);
  await assert.rejects(ack(a,randomUUID(),randomUUID()),e=>e.code==='42501');
  await Promise.all([ack(a,w,randomUUID(),peers[0]),query('crm_survey_dispatch_recover',['123',10],peers[1])]);assert.equal((await delivery(c)).state,'SENT');await finish(c);
 });
 await t.test('company enrollment mismatch cannot claim and old app evidence remains bound to its historical attempt',async()=>{
  const c=await setup();await db.query('UPDATE crm_survey_control.dispatch_pages SET company_id=$1',[other]);
  assert.equal((await claim(c)).status,'NOT_ENROLLED');await db.query('UPDATE crm_survey_control.dispatch_pages SET company_id=$1',[company]);
  const a=await claim(c);await db.query("UPDATE crm_survey_control.dispatch_pages SET app_id='999'");
  try{await receive([await echo(c,a.payload)]);assert.equal(await mode(c),'WAITING');}finally{await db.query("UPDATE crm_survey_control.dispatch_pages SET app_id='4567'");await finish(c);}
 });
 await t.test('private manifests and server dispatch APIs remain unavailable to public roles after backup grants',async()=>{
  const c=await setup();await db.query('BEGIN');
  try{
   await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated');
   for(const role of ['anon','authenticated']){await db.query('SET LOCAL ROLE '+role);
    for(const [name,args] of [['crm_survey_dispatch_candidates',['123',10]],['crm_survey_dispatch_claim',['123',c.proposal.proposalId,randomUUID(),credentialHash]],['crm_survey_dispatch_result',[randomUUID(),randomUUID(),{status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'}]],['crm_survey_dispatch_recover',['123',10]],['crm_care_receive',[JSON.stringify([])]]]){
     await db.query('SAVEPOINT denied');await assert.rejects(query(name,args,db),e=>e.code==='42501');await db.query('ROLLBACK TO denied');
    }await db.query('RESET ROLE');
   }
   for(const role of ['anon','authenticated','service_role']){await db.query('SET LOCAL ROLE '+role);await db.query('SAVEPOINT denied');await assert.rejects(db.query('SELECT * FROM crm_survey_control.dispatch_attempts'),e=>e.code==='42501');await db.query('ROLLBACK TO denied');await db.query('RESET ROLE');}
  }finally{await db.query('ROLLBACK');await finish(c);}
 });
 await t.test('credential rotation before claim rejects the cached token even if it is still valid at Meta',async()=>{
  const c=await setup();await db.query("UPDATE facebook_pages SET access_token='rotated-synthetic-token' WHERE page_id='123'");
  try{assert.equal((await claim(c)).status,'CREDENTIAL_CHANGED');assert.equal((await delivery(c)).state,'QUEUED');}
  finally{await db.query("UPDATE facebook_pages SET access_token=$1 WHERE page_id='123'",[pageToken]);await finish(c);}
 });
 await t.test('superseding a proposal cannot bypass an uncertain delivery on the same thread',async()=>{
  const c=await setup(),w=randomUUID(),a=await claim(c,w);
  await query('crm_survey_dispatch_result',[a.attemptId,w,{status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'}]);
  const available=await query('crm_survey_availability',[admin,company,c.thread,new Date(c.a).toISOString(),new Date(c.b).toISOString()]);
  const next=await query('crm_survey_propose',[admin,company,randomUUID(),{...c.command,optionId:available.items.find(x=>x.staffId===c.staff).optionId}]);
  assert.equal((await claim({...c,proposal:next})).status,'PRIOR_DELIVERY_UNCERTAIN');
  assert.ok(!(await query('crm_survey_dispatch_candidates',['123',10])).includes(next.proposalId));
  await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1",[next.proposalId]);await finish(c);
 });
 await t.test('conflicting late ACK keeps an already booked calendar and the original delivery evidence',async()=>{
  const c=await setup(),w=randomUUID(),a=await claim(c,w),mid=randomUUID();await ack(a,w,mid);
  await receive([await incoming(c,'Xác nhận lịch',a.payload.message.quick_replies[0].payload)]);const b=await booking(c);assert.ok(b);
  assert.equal((await ack(a,w,'conflict-'+randomUUID())).status,'CONFLICT');assert.deepEqual(await booking(c),b);
  assert.equal((await delivery(c)).provider_mid,mid);assert.equal((await delivery(c)).state,'SENT');assert.equal(await mode(c),'HUMAN_REQUESTED');await finish(c);
 });
};
