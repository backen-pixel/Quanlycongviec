'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHmac}=require('node:crypto');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
module.exports=async(t,{db,peers,query,company,other,admin,setup,finished})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/666_crm_survey_confirmation_ingress.sql'),'utf8');
 await db.query(sql);await db.query(sql);
 await db.query("INSERT INTO crm_survey_control.ingress_pages VALUES('123',$1,true,'Synthetic release for isolated ingress validation only')",[company]);
 const secret='synthetic-ingress-app-secret-only';
 const env={VPT_FB_CARE_PAGES:'123',VPT_FACEBOOK_APP_SECRET:secret,VPT_SURVEY_CONFIRMATIONS:'1'};
 const storage={rpc:async(name,args)=>{try{return{data:await query(name,[JSON.stringify(args.p_events)])}}catch(error){return{error}}}};
 const care=createCustomerCare({db:storage,isPrimary:()=>true,env});
 const signed=events=>{const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:'123',messaging:events}]}));return{facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}}};
 const stamp=async()=>(await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint n')).rows[0].n;
 const prepare=async(c,acked=true)=>{
  await db.query(`UPDATE crm_survey_control.deliveries SET state=$2,started_at=clock_timestamp(),provider_mid=$3,sent_at=CASE WHEN $2='SENT' THEN clock_timestamp() END WHERE proposal_id=$1`,[c.proposal.proposalId,acked?'SENT':'SENDING',acked?randomUUID():null]);
  const d=(await db.query('SELECT confirmation_token FROM crm_survey_control.deliveries WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0];
  return 'VPT_SURVEY_V1:'+c.proposal.proposalId+':'+d.confirmation_token;
 };
 const event=async(c,payload,extra={})=>({sender:{id:c.psid},recipient:{id:'123'},timestamp:Number(await stamp()),message:{mid:randomUUID(),text:'Xác nhận lịch',...(payload?{quick_reply:{payload}}:{})},...extra});
 const outcome=async c=>(await db.query('SELECT * FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0];
 const ingress=async mid=>(await db.query('SELECT i.* FROM crm_survey_control.ingress_results i JOIN crm_care_messages m ON m.id=i.message_id WHERE m.provider_mid=$1',[mid])).rows[0];

 await t.test('signed quick reply flows through the real receiver into one atomic booking and replay',async()=>{
  const c=await setup(),payload=await prepare(c),e=await event(c,payload),req=signed([e]);
  req.body={forged:'ignored'};await care.receive(req);await care.receive(signed([e]));
  const b=await outcome(c);assert.ok(b);assert.equal((await ingress(e.message.mid)).state,'BOOKED');
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.inbound_receipts WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM crm_survey_control.proposal_events WHERE proposal_id=$1 AND action='BOOK'",[c.proposal.proposalId])).rows[0].n,1);
  await finished(c);
 });
 await t.test('invalid signature and prose containing a valid token cannot book',async()=>{
  const c=await setup(),payload=await prepare(c),e=await event(c,payload),req=signed([e]);req.headers['x-hub-signature-256']='sha256='+'0'.repeat(64);
  await assert.rejects(care.receive(req),{code:'INVALID_SIGNATURE'});
  const text=await event(c);text.message.text=payload;await care.receive(signed([text]));
  assert.equal(await outcome(c),undefined);assert.equal(await ingress(text.message.mid),undefined);await finished(c);
 });
 await t.test('all STOP events win before confirmation regardless of provider message sort order',async()=>{
  for(const stopFirst of [true,false]){
   const c=await setup(),payload=await prepare(c),confirm=await event(c,payload),stop=await event(c);
   confirm.message.mid=(stopFirst?'z':'a')+randomUUID();stop.message.mid=(stopFirst?'a':'z')+randomUUID();stop.message.text='Đừng nhắn tin nữa';
   await care.receive(signed([confirm,stop]));assert.equal(await outcome(c),undefined);
   assert.equal((await db.query('SELECT mode FROM crm_care_threads WHERE id=$1',[c.thread])).rows[0].mode,'OPTED_OUT');
   assert.equal((await ingress(confirm.message.mid)).state,'REJECTED');await finished(c);
  }
 });
 await t.test('human requests and unknown outgoing echoes in the same batch prevent booking',async()=>{
  for(const echo of [true,false]){
   const c=await setup(),payload=await prepare(c),confirm=await event(c,payload),control=await event(c);
   control.message.text='Cho tôi gặp nhân viên';
   if(echo){control.sender.id='123';control.recipient.id=c.psid;control.message.is_echo=true;control.message.text='External human reply';}
   await care.receive(signed([confirm,control]));assert.equal(await outcome(c),undefined);
   assert.equal((await db.query('SELECT mode FROM crm_care_threads WHERE id=$1',[c.thread])).rows[0].mode,'HUMAN_REQUESTED');await finished(c);
  }
 });
 await t.test('wrong token and another customer cannot confirm a valid proposal',async()=>{
  const c=await setup(),payload=await prepare(c),stranger=await setup();
  const wrong=await event(c,'VPT_SURVEY_V1:'+c.proposal.proposalId+':'+randomUUID());
  const foreign=await event(stranger,payload);await care.receive(signed([wrong,foreign]));
  assert.equal((await ingress(wrong.message.mid)).result.reason,'CONFIRMATION_MISMATCH');
  assert.equal((await ingress(foreign.message.mid)).result.reason,'CONFIRMATION_MISMATCH');assert.equal(await outcome(c),undefined);
  await finished(c);await finished(stranger);
 });
 await t.test('late ACK reconciliation survives a fresh receiver and never needs webhook redelivery',async()=>{
  const c=await setup(),payload=await prepare(c,false),e=await event(c,payload);await care.receive(signed([e]));
  assert.equal((await ingress(e.message.mid)).state,'WAITING');assert.equal(await outcome(c),undefined);
  await db.query("UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1",[c.proposal.proposalId,randomUUID()]);
  await query('crm_survey_confirmation_reconcile',['123',100],peers[1]);assert.ok(await outcome(c));
  assert.equal((await ingress(e.message.mid)).state,'BOOKED');await finished(c);
 });
 await t.test('late ACK after opt-out is rejected while preserving STOP and the receipt',async()=>{
  const c=await setup(),payload=await prepare(c,false),e=await event(c,payload);await care.receive(signed([e]));
  const stop=await event(c);stop.message.text='STOP';await care.receive(signed([stop]));
  await db.query("UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1",[c.proposal.proposalId,randomUUID()]);
  await query('crm_survey_confirmation_reconcile',['123',100]);assert.equal(await outcome(c),undefined);
  assert.equal((await ingress(e.message.mid)).state,'REJECTED');await finished(c);
 });
 await t.test('changed confirmation payload for an existing message is rejected without changing its booking',async()=>{
  const c=await setup(),payload=await prepare(c),e=await event(c,payload);await care.receive(signed([e]));const before=await outcome(c);
  e.message.quick_reply.payload='VPT_SURVEY_V1:'+c.proposal.proposalId+':'+randomUUID();
  await assert.rejects(care.receive(signed([e])),{code:'23505'});assert.deepEqual(await outcome(c),before);await finished(c);
 });
 await t.test('revoked proposer and disabled or foreign ingress enrollment keep messages without booking',async()=>{
  for(const change of ['actor','disabled','company']){
   const c=await setup(),payload=await prepare(c),e=await event(c,payload);
   if(change==='actor')await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
   else await db.query('UPDATE crm_survey_control.ingress_pages SET active=$1,company_id=$2',[change!=='disabled',change==='company'?other:company]);
   try{await care.receive(signed([e]));assert.equal(await outcome(c),undefined);assert.equal((await ingress(e.message.mid)).state,'BLOCKED');}
   finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);await db.query('UPDATE crm_survey_control.ingress_pages SET active=true,company_id=$1',[company]);await finished(c);}
  }
 });
 await t.test('public roles cannot use ingress or reconciliation even after broad backup function grants',async()=>{
  await db.query('BEGIN');
  try{
   await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated');
   for(const role of ['anon','authenticated']){await db.query('SET LOCAL ROLE '+role);
    // Each expected SQL error uses a savepoint so the transaction stays usable.
    for(const [name,args] of [['crm_survey_receive',['[]']],['crm_survey_confirmation_reconcile',['123',10]]]){
     await db.query('SAVEPOINT denied');await assert.rejects(query(name,args,db),e=>e.code==='42501');await db.query('ROLLBACK TO denied');
    }await db.query('RESET ROLE');
   }
  }finally{await db.query('ROLLBACK');}
 });
 await t.test('simultaneous signed redelivery and recovery produce one booking',async()=>{
  const c=await setup(),payload=await prepare(c,false),e=await event(c,payload);await care.receive(signed([e]));
  await db.query("UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1",[c.proposal.proposalId,randomUUID()]);
  await Promise.all([care.receive(signed([e])),query('crm_survey_confirmation_reconcile',['123',100],peers[1])]);
  assert.ok(await outcome(c));assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.bookings WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0].n,1);await finished(c);
 });
 await t.test('an unacknowledged first receipt cannot starve a later delivered receipt with a bounded recovery limit',async()=>{
  const a=await setup(),b=await setup(),pa=await prepare(a,false),pb=await prepare(b,false);
  await care.receive(signed([await event(a,pa)]));await care.receive(signed([await event(b,pb)]));
  await db.query("UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1",[b.proposal.proposalId,randomUUID()]);
  await query('crm_survey_confirmation_reconcile',['123',1]);assert.ok(await outcome(b));assert.equal(await outcome(a),undefined);
  // Dispose the remaining synthetic pending item so later bounded tests are independent.
  await db.query("UPDATE crm_survey_control.ingress_results SET state='BLOCKED',result='{}' WHERE proposal_id=$1",[a.proposal.proposalId]);
  await finished(a);await finished(b);
 });
 await t.test('a stale waiting worker cannot overwrite a successful booking after enrollment revocation',async()=>{
  const c=await setup(),payload=await prepare(c,false),e=await event(c,payload);await care.receive(signed([e]));
  await db.query("UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1",[c.proposal.proposalId,randomUUID()]);
  await db.query(`CREATE FUNCTION public.test_ingress_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(666991);RETURN NEW;END $$;
   CREATE TRIGGER test_ingress_wait BEFORE INSERT ON crm_survey_control.handoffs FOR EACH ROW EXECUTE FUNCTION public.test_ingress_wait()`);
  const pids=await Promise.all(peers.map(x=>x.query('SELECT pg_backend_pid() id').then(r=>r.rows[0].id)));
  const waitLock=async pid=>{for(let i=0;i<300;i++){const r=await db.query("SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1",[pid]);if(r.rows[0]?.waiting)return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Expected worker lock was not observed');};
  const tasks=[];await db.query('SELECT pg_advisory_lock(666991)');
  try{
   tasks.push(query('crm_survey_confirmation_reconcile',['123',100],peers[0]));await waitLock(pids[0]);
   await peers[2].query('RESET ROLE');
   tasks.push(peers[2].query("UPDATE crm_survey_control.ingress_pages SET active=false WHERE page_id='123'"));await waitLock(pids[2]);
   tasks.push(query('crm_survey_confirmation_reconcile',['123',100],peers[1]));await waitLock(pids[1]);
   await db.query('SELECT pg_advisory_unlock(666991)');await Promise.all(tasks);
   assert.ok(await outcome(c));const receipt=await ingress(e.message.mid);assert.equal(receipt.state,'BOOKED');assert.equal(receipt.result.reservationMade,true);
  }finally{
   await db.query('SELECT pg_advisory_unlock(666991)');await Promise.allSettled(tasks);
   await peers[2].query('SET ROLE service_role');await db.query('DROP TRIGGER test_ingress_wait ON crm_survey_control.handoffs;DROP FUNCTION public.test_ingress_wait()');
   await db.query("UPDATE crm_survey_control.ingress_pages SET active=true WHERE page_id='123'");await finished(c);
  }
 });
 await t.test('unexpected booking failure rolls back message and proof so signed redelivery can recover',async()=>{
  const c=await setup(),payload=await prepare(c),e=await event(c,payload);
  await db.query(`CREATE FUNCTION public.test_ingress_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic handoff failure';END $$;
   CREATE TRIGGER test_ingress_failure BEFORE INSERT ON crm_survey_control.handoffs FOR EACH ROW EXECUTE FUNCTION public.test_ingress_failure()`);
  try{await assert.rejects(care.receive(signed([e])),{code:'P0001'});assert.equal(await ingress(e.message.mid),undefined);assert.equal(await outcome(c),undefined);
   assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_messages WHERE provider_mid=$1',[e.message.mid])).rows[0].n,0);
  }finally{await db.query('DROP TRIGGER test_ingress_failure ON crm_survey_control.handoffs;DROP FUNCTION public.test_ingress_failure()');}
  await care.receive(signed([e]));assert.ok(await outcome(c));await finished(c);
 });
};
