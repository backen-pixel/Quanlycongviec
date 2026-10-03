'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {createSurveyOutcomeDispatch}=require('../src/modules/marketingAutomation/facebookSurveyOutcomes');
module.exports=async(t,{db,peers,query,company,other,admin,region,setup,booked,finished,receive,incoming})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/669_crm_survey_outcomes.sql'),'utf8');await db.query(sql);await db.query(sql);
 assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.outcomes')).rows[0].n,0,'Migration never backfills old customer messages');
 const pageToken=(await db.query("SELECT access_token FROM facebook_pages WHERE page_id='123'")).rows[0].access_token;
 const hash=createHash('sha256').update(pageToken).digest('hex');
 await db.query("INSERT INTO crm_survey_control.outcome_pages VALUES('123',$1,true,'Synthetic isolated outcome release only')",[company]);
 const state=async c=>(await db.query('SELECT * FROM crm_survey_control.outcomes WHERE proposal_id=$1 ORDER BY created_at',[c.proposal.proposalId])).rows;
 const claim=async(c,w=randomUUID(),client=peers[0])=>query('crm_survey_outcome_claim',['123',(await state(c))[0].id,w,hash],client);
 const ack=(a,w,mid,client=peers[0],recipient=a.psid)=>query('crm_survey_outcome_result',[a.attemptId,w,{status:'ACK',recipientId:recipient,messageId:mid}],client);
 const finish=async c=>{await db.query("UPDATE crm_survey_control.outcomes SET state='HELD',reason='ISOLATED_FIXTURE_FINISHED' WHERE proposal_id=$1 AND state='QUEUED'",[c.proposal.proposalId]);await finished(c);};
 const stamp=async()=>Number((await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint n')).rows[0].n);
 const echo=async(c,payload,mid=randomUUID())=>({sender:{id:'123'},recipient:{id:c.psid},timestamp:await stamp(),message:{mid,text:payload.message.text,is_echo:true,app_id:4567,metadata:payload.message.metadata}});
 const mode=async c=>(await db.query('SELECT mode FROM crm_care_threads WHERE id=$1',[c.thread])).rows[0].mode;
 const storage={rpc:async(name,args)=>{try{return{data:await query(name,Object.values(args))}}catch(error){return{error}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{page_id:'123',default_company_id:company,is_active:true,access_token:pageToken}})})})})};
 const worker=fetchImpl=>createSurveyOutcomeDispatch({db:storage,isPrimary:()=>true,env:{VPT_FB_CARE_PAGES:'123',VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_OUTCOMES:'1'},fetchImpl});
 const dispatched=async c=>{const w=randomUUID(),a=await query('crm_survey_dispatch_claim',['123',c.proposal.proposalId,w,hash]);assert.equal(a.status,'CLAIMED');await query('crm_survey_dispatch_result',[a.attemptId,w,{status:'ACK',recipientId:c.psid,messageId:randomUUID()}]);return a;};

 await t.test('booking creates one atomic outcome and actual worker sends the canonical result once',async()=>{
  const c=await booked();assert.equal((await state(c)).length,1);assert.equal((await state(c))[0].kind,'BOOKED');let sends=0;
  const w=worker(async(url,init)=>{sends++;const p=JSON.parse(init.body);assert.equal(p.recipient.id,c.psid);assert.equal(p.message.quick_replies,undefined);assert.match(p.message.text,/^Đã đặt lịch/);assert.equal(p.message.text.includes('đã nhận'),false);
   const e=await echo(c,p);await receive([e]);assert.equal(await mode(c),'WAITING');return{ok:true,json:async()=>({recipient_id:c.psid,message_id:e.message.mid})};});
  await w.drain();await w.drain();assert.equal(sends,1);assert.equal((await state(c))[0].state,'SENT');
  assert.equal((await db.query('SELECT state FROM crm_survey_control.handoffs WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0].state,'PENDING');await finish(c);
 });
 await t.test('booking and outcome both roll back; signed replay commits exactly one of each',async()=>{
  const c=await setup(),a=await dispatched(c),click=await incoming(c,'Xác nhận lịch',a.payload.message.quick_replies[0].payload);
  await peers[2].query('BEGIN');await receive([click]);await peers[2].query('ROLLBACK');
  assert.equal((await state(c)).length,0);await receive([click]);await receive([click]);assert.equal((await state(c)).length,1);await finish(c);
 });
 await t.test('duplicate clicks and mismatched/blocked receipts cannot negate an existing booking',async()=>{
  const c=await booked(),d=(await db.query('SELECT * FROM crm_survey_control.deliveries WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0];
  await receive([await incoming(c,'Xác nhận lịch','VPT_SURVEY_V1:'+c.proposal.proposalId+':'+d.confirmation_token)]);
  await receive([await incoming(c,'Xác nhận lịch','VPT_SURVEY_V1:'+c.proposal.proposalId+':'+randomUUID())]);
  await db.query("UPDATE crm_survey_control.ingress_pages SET active=false WHERE page_id='123'");
  await receive([await incoming(c,'Xác nhận lịch','VPT_SURVEY_V1:'+c.proposal.proposalId+':'+d.confirmation_token)]);
  await db.query("UPDATE crm_survey_control.ingress_pages SET active=true WHERE page_id='123'");
  assert.deepEqual((await state(c)).map(x=>x.kind),['BOOKED']);assert.equal((await claim(c)).status,'CLAIMED');await finish(c);
 });
 await t.test('expired proposal and roster do not invalidate an already booked customer notification',async()=>{
  const c=await booked();await db.query("UPDATE crm_survey_control.proposals SET expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[c.proposal.proposalId]);
  await db.query("UPDATE crm_survey_rosters SET document=jsonb_set(document,'{validUntil}',to_jsonb((clock_timestamp()-interval '1 hour')::text)) WHERE staff_id=$1",[c.staff]);
  assert.equal((await claim(c)).status,'CLAIMED');await finish(c);
 });
 await t.test('canonical rejected confirmation gets neutral not-booked text; new proposal suppresses stale negative',async()=>{
  for(const superseded of [false,true]){
   const c=await setup(),a=await dispatched(c);await db.query("UPDATE crm_survey_control.proposals SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[c.proposal.proposalId]);
   await receive([await incoming(c,'Xác nhận lịch',a.payload.message.quick_replies[0].payload)]);assert.equal((await state(c))[0].kind,'NOT_BOOKED');
   let next;if(superseded){
    const available=await query('crm_survey_availability',[admin,company,c.thread,new Date(c.a).toISOString(),new Date(c.b).toISOString()]);
    const option=available.items.find(x=>x.staffId===c.staff);assert.ok(option);
    next=await query('crm_survey_propose',[admin,company,randomUUID(),{...c.command,optionId:option.optionId}]);
   }
   const n=await claim(c);assert.equal(n.status,superseded?'HELD':'CLAIMED');if(!superseded)assert.match(n.payload.message.text,/chưa được đặt/);
   if(next)await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1",[next.proposalId]);await finish(c);
  }
 });
 await t.test('STOP, human takeover, changed identity or inactive author holds messages without erasing booking',async()=>{
  for(const change of ['STOP','HUMAN_ACTIVE','mapping','author']){
   const c=await booked();if(change==='STOP')await receive([await incoming(c,'STOP')]);
   if(change==='HUMAN_ACTIVE')await db.query("UPDATE crm_care_threads SET mode='HUMAN_ACTIVE' WHERE id=$1",[c.thread]);
   if(change==='mapping')await db.query('UPDATE facebook_contacts SET customer_id=NULL,lead_id=NULL WHERE page_id=\'123\' AND psid=$1',[c.psid]);
   if(change==='author')await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
   try{assert.equal((await claim(c)).status,'HELD');assert.deepEqual((await db.query('SELECT * FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0],c.booking);}
   finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);await finish(c);}
  }
 });
 await t.test('changed calendar and expired inbound window hold messages, never announce stale appointment',async()=>{
  for(const change of ['calendar','window']){
   const c=await booked();if(change==='calendar'){
    await finished(c);await db.query("UPDATE crm_events SET location='Changed location in isolated test' WHERE id=$1",[c.booking.event_id]);
   }else await db.query("UPDATE crm_care_messages SET sent_at=clock_timestamp()-interval '25 hours' WHERE thread_id=$1 AND direction='inbound'",[c.thread]);
   assert.equal((await claim(c)).status,'HELD');assert.equal((await state(c))[0].state,'HELD');await finish(c);
  }
 });
 await t.test('simultaneous outcome claims grant the payload only once',async()=>{
  const c=await booked();const rs=await Promise.all([claim(c,randomUUID(),peers[0]),claim(c,randomUUID(),peers[1])]);assert.equal(rs.filter(x=>x.status==='CLAIMED').length,1);assert.equal(rs.filter(x=>x.payload).length,1);await finish(c);
 });
 await t.test('lost send and recovery never resend; late exact ACK remains evidence after STOP',async()=>{
  const c=await booked(),w=randomUUID(),a=await claim(c,w);await db.query("UPDATE crm_survey_control.outcome_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE attempt_id=$1",[a.attemptId]);
  await query('crm_survey_outcome_recover',['123',20]);assert.equal((await state(c))[0].state,'UNCERTAIN');assert.equal((await claim(c,w)).payload,undefined);
  await receive([await incoming(c,'STOP')]);const mid=randomUUID();assert.equal((await ack(a,w,mid)).status,'SENT');assert.equal((await ack(a,w,mid)).status,'SENT');assert.equal(await mode(c),'OPTED_OUT');await finish(c);
 });
 await t.test('ACK then own echo and echo then ACK use one proof registry; altered replay is rejected',async()=>{
  for(const order of ['ack-first','echo-first']){
   const c=await booked(),w=randomUUID(),a=await claim(c,w),e=await echo(c,a.payload);
   if(order==='ack-first')await ack(a,w,e.message.mid);await receive([e]);if(order==='echo-first'){assert.equal((await state(c))[0].state,'SENDING');await ack(a,w,e.message.mid);}
   assert.equal(await mode(c),'WAITING');await receive([e]);e.message.metadata='VPT_SURVEY_OUTCOME_V1:'+randomUUID();await assert.rejects(receive([e]),{code:'23505'});await finish(c);
  }
 });
 await t.test('wrong echo identity or conflicting ACK triggers human exception and preserves booking',async()=>{
  for(const kind of ['app','text','mid']){
   const c=await booked(),w=randomUUID(),a=await claim(c,w),e=await echo(c,a.payload);
   if(kind==='app')e.message.app_id=999;if(kind==='text')e.message.text+=' altered';await receive([e]);
   if(kind==='mid')assert.equal((await ack(a,w,'different-'+randomUUID())).status,'CONFLICT');
   assert.equal(await mode(c),'HUMAN_REQUESTED');assert.deepEqual((await db.query('SELECT * FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0],c.booking);await finish(c);
  }
 });
 await t.test('revoked author while claim waits is checked after the lock releases',async()=>{
  const c=await booked();await db.query('BEGIN');await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  const pending=claim(c);await db.query('SELECT pg_sleep(0.1)');await db.query('COMMIT');assert.equal((await pending).status,'HELD');await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);await finish(c);
 });
 await t.test('credential rotation and disabled outcome enrollment never expose a payload',async()=>{
  const c=await booked();await db.query("UPDATE crm_survey_control.outcome_pages SET active=false WHERE page_id='123'");assert.equal((await claim(c)).status,'NOT_ENROLLED');
  await db.query("UPDATE crm_survey_control.outcome_pages SET active=true WHERE page_id='123'");await db.query("UPDATE facebook_pages SET access_token='rotated-synthetic-token' WHERE page_id='123'");
  assert.equal((await claim(c)).status,'CREDENTIAL_CHANGED');await db.query("UPDATE facebook_pages SET access_token=$1 WHERE page_id='123'",[pageToken]);await finish(c);
 });
 await t.test('private outbox and role checks survive broad public execute grants',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM crm_survey_control.outcomes'),{code:'42501'});}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated');
  for(const role of ['anon','authenticated']){await db.query('SET ROLE '+role);try{await assert.rejects(query('crm_survey_outcome_candidates',['123',10],db),{code:'42501'});}finally{await db.query('RESET ROLE');}}
 });
 await t.test('pre-enrollment outcomes remain held after enrollment is activated',async()=>{
  await db.query("UPDATE crm_survey_control.outcome_pages SET active=false WHERE page_id='123'");const c=await booked();
  assert.equal((await state(c))[0].state,'HELD');assert.equal((await state(c))[0].reason,'NOT_ENROLLED_AT_OUTCOME');
  await db.query("UPDATE crm_survey_control.outcome_pages SET active=true WHERE page_id='123'");assert.equal((await claim(c)).payload,undefined);await finish(c);
 });
 const laterProposal=async c=>{
  const otherCase=await setup({start:c.a+86400000});await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1",[otherCase.proposal.proposalId]);
  const available=await query('crm_survey_availability',[admin,company,c.thread,new Date(otherCase.a).toISOString(),new Date(otherCase.b).toISOString()]);
  const option=available.items.find(x=>x.staffId===otherCase.staff);assert.ok(option);
  const p=await query('crm_survey_propose',[admin,company,randomUUID(),{...otherCase.command,threadId:c.thread,optionId:option.optionId}]);return{p,otherCase};
 };
 await t.test('shared uncertainty barrier excludes both outcome and proposal candidates in either direction',async()=>{
  for(const first of ['proposal','outcome']){
   const c=await booked(),{p,otherCase}=await laterProposal(c),w=randomUUID();
   if(first==='proposal'){
    const a=await query('crm_survey_dispatch_claim',['123',p.proposalId,w,hash]);assert.equal(a.status,'CLAIMED');
    await query('crm_survey_dispatch_result',[a.attemptId,w,{status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'}]);
    assert.equal((await claim(c)).status,'PRIOR_DELIVERY_UNCERTAIN');assert.ok(!(await query('crm_survey_outcome_candidates',['123',20])).includes((await state(c))[0].id));
   }else{
    const a=await claim(c,w);assert.equal(a.status,'CLAIMED');await query('crm_survey_outcome_result',[a.attemptId,w,{status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'}]);
    assert.equal((await query('crm_survey_dispatch_claim',['123',p.proposalId,randomUUID(),hash])).status,'PRIOR_DELIVERY_UNCERTAIN');assert.ok(!(await query('crm_survey_dispatch_candidates',['123',20])).includes(p.proposalId));
   }
   await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1 AND state='OPEN'",[p.proposalId]);await finish(otherCase);await finish(c);
  }
 });
 await t.test('simultaneous proposal and outcome claims cannot both acquire send permission',async()=>{
  const c=await booked(),{p,otherCase}=await laterProposal(c);
  const rs=await Promise.all([claim(c,randomUUID(),peers[0]),query('crm_survey_dispatch_claim',['123',p.proposalId,randomUUID(),hash],peers[1])]);
  assert.equal(rs.filter(x=>x.status==='CLAIMED').length,1);assert.equal(rs.filter(x=>x.status==='PRIOR_DELIVERY_UNCERTAIN').length,1);
  await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1 AND state='OPEN'",[p.proposalId]);await finish(otherCase);await finish(c);
 });
 await t.test('STOP in the same confirmation batch prevents booking and sending while retaining the rejection intent',async()=>{
  const c=await setup(),a=await dispatched(c);
  await receive([await incoming(c,'Xác nhận lịch',a.payload.message.quick_replies[0].payload),await incoming(c,'STOP')]);
  assert.deepEqual((await state(c)).map(x=>x.kind),['NOT_BOOKED']);assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0].n,0);
  let sends=0;await worker(async()=>{sends++;throw Error('STOP must not send');}).drain();assert.equal(sends,0);assert.equal((await state(c))[0].state,'HELD');
  assert.equal(await mode(c),'OPTED_OUT');await db.query("UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=$1 AND state='OPEN'",[c.proposal.proposalId]);await finish(c);
 });
 await t.test('recipient membership revoked while outcome claim waits blocks stale appointment text',async()=>{
  const c=await booked();await db.query('BEGIN');await db.query('DELETE FROM user_company_regions WHERE user_id=$1 AND region_id=$2',[c.staff,region]);
  const pending=claim(c);await db.query('SELECT pg_sleep(0.1)');await db.query('COMMIT');assert.equal((await pending).status,'HELD');assert.equal((await state(c))[0].state,'HELD');await finish(c);
 });
 await t.test('an unavailable first candidate is held without starving another customer notification',async()=>{
  const bad=await booked(),good=await booked();await receive([await incoming(bad,'STOP')]);let sends=0;
  await worker(async(_,init)=>{sends++;const p=JSON.parse(init.body);assert.equal(p.recipient.id,good.psid);return{ok:true,json:async()=>({recipient_id:good.psid,message_id:randomUUID()})};}).drain();
  assert.equal(sends,1);assert.equal((await state(bad))[0].state,'HELD');assert.equal((await state(good))[0].state,'SENT');await finish(bad);await finish(good);
 });
};
