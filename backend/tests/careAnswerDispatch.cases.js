'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash,createHmac}=require('node:crypto');
const {createCareAnswerDispatch}=require('../src/modules/marketingAutomation/careAnswerDispatch');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
const sha=x=>createHash('sha256').update(x).digest('hex');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,approve,enroll,begin,finish,select,worker,candidates,lockWait})=>{
 const policy=async(c,g,options={})=>{
  const r=(await db.query('SELECT result FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].result;
  const p={id:randomUUID(),principal_id:g.agent,grant_id:g.id,company_id:company,page_id:c.page,active:true,
   starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+86400000),app_id:'789',graph_version:'v24.0',credential_hash:sha('synthetic'),
   allowed_entries:{[r.entryId]:r.entryVersion},max_messages:5,approval_reference:'Synthetic approved answer policy in isolated tests only',...options};
  const cols=Object.keys(p);await db.query('INSERT INTO crm_care_control.send_policies('+cols.join(',')+') VALUES('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(p));return p;
 };
 const ready=async(options={})=>{const c=await fixture(),g=await enroll(c),r=await begin(c,g);await finish(c,g,r);const p=await policy(c,g,options);return{c,g,r,p};};
 const claim=(x,client=peers[0],w=x.g.worker)=>query('crm_care_send_claim',[x.g.agent,company,x.g.id,x.p.id,x.c.key,w,sha('synthetic')],client);
 const ack=(a,w,mid,recipient=a.psid,client=peers[0])=>query('crm_care_send_result',[a.attemptId,w,{status:'ACK',recipientId:recipient,messageId:mid}],client);
 const state=async c=>(await db.query('SELECT * FROM crm_care_control.send_attempts WHERE request_id=$1',[c.key])).rows[0];
 const mode=async c=>(await db.query('SELECT mode FROM crm_care_threads WHERE id=$1',[c.thread])).rows[0].mode;
 const stamp=async()=>Number((await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint n')).rows[0].n);
 const storage=client=>({rpc:async(n,a)=>{try{return{data:await query(n,Object.values(a).map(v=>Array.isArray(v)?JSON.stringify(v):v),client)}}catch(error){return{error}}},
  from:()=>({select:()=>({eq:(_k,page)=>({maybeSingle:async()=>({data:(await db.query('SELECT * FROM facebook_pages WHERE page_id=$1',[page])).rows[0]})})})})});
 const env=x=>({VPT_CARE_RUNTIME_PRINCIPAL:x.g.agent,VPT_CARE_RUNTIME_COMPANY:company,VPT_CARE_RUNTIME_GRANT:x.g.id,
  VPT_CARE_RUNTIME_PAGE:x.c.page,VPT_CARE_RUNTIME_SEND_POLICY:x.p.id,VPT_CARE_RUNTIME_ECHO:'1',VPT_CARE_RUNTIME_SEND:'1',VPT_FB_CARE_PAGES:x.c.page});
 const receive=async(c,events,client=peers[2])=>{
  const secret='synthetic-answer-echo-secret',raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:c.page,messaging:events}]}));
  const care=createCustomerCare({db:storage(client),isPrimary:()=>true,env:{VPT_CARE_RUNTIME_ECHO:'1',VPT_FB_CARE_PAGES:c.page,VPT_FACEBOOK_APP_SECRET:secret}});
  await care.receive({facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}});
 };
 const echo=async(c,a,mid=randomUUID(),overrides={})=>({sender:{id:c.page},recipient:{id:c.psid},timestamp:await stamp(),
  message:{mid,text:a.payload.message.text,is_echo:true,app_id:789,metadata:a.payload.message.metadata,...overrides}});
 const dispatch=(x,fetchImpl,options={})=>{const errors=[],s=storage(peers[0]);
  if(options.lost){const rpc=s.rpc;s.rpc=async(n,a)=>{const r=await rpc(n,a);return n===options.lost&&!r.error?{error:{code:'LOST'}}:r;};}
  const run=createCareAnswerDispatch({db:s,env:{...env(x),...options.env},isPrimary:()=>true,workerId:x.g.worker,fetchImpl,onError:e=>errors.push(e)});return{run,errors};};
 const newTurn=async x=>{await x.c.receive([x.c.incoming('Tôi cần tư vấn thêm về tủ bếp.')]);x.c.key=randomUUID();
  const r=await begin(x.c,x.g);assert.equal(r.invoke,true);await finish(x.c,x.g,r);return r;};

 await t.test('answer migration enrolls no send permission and all private policy/payload paths reject application roles',async()=>{
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.send_policies')).rows[0].n,0);
  for(const role of['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{
   for(const table of['send_policies','send_attempts','send_results'])await assert.rejects(db.query('SELECT * FROM crm_care_control.'+table),e=>e.code==='42501');
   await assert.rejects(query('crm_care_control.answer_context_busy',[randomUUID()],db),e=>e.code==='42501');
   if(role!=='service_role')await assert.rejects(query('crm_care_send_recover',[company,'123'],db),e=>e.code==='42501');
  }finally{await db.query('RESET ROLE');}}
 });
 await t.test('actual runtime and answer workers produce one approved message, signed echo and immutable receipt',async()=>{
  const c=await fixture(),g=await enroll(c),model=worker(c,g);await model.run.drain();assert.equal(model.posts.length,1);
  c.key=(await db.query('SELECT request_id FROM crm_care_control.runtime_turns WHERE thread_id=$1',[c.thread])).rows[0].request_id;
  const x={c,g,p:await policy(c,g)};let posts=0;
  const sender=dispatch(x,async(url,init)=>{posts++;assert.equal(url,'https://graph.facebook.com/v24.0/'+c.page+'/messages');
   const payload=JSON.parse(init.body);assert.equal(payload.recipient.id,c.psid);const event=await echo(c,{payload});await receive(c,[event]);
   return new Response(JSON.stringify({recipient_id:c.psid,message_id:event.message.mid}));});
  await sender.run.drain();await sender.run.drain();assert.deepEqual(sender.errors,[]);assert.equal(posts,1);
  const a=await state(c);assert.equal(a.state,'SENT');assert.equal(a.ack_mid,a.echo_mid);assert.equal(a.principal_id,g.agent);assert.equal(await mode(c),'WAITING');
  assert.equal((await db.query("SELECT action FROM crm_care_events WHERE source_message_id=(SELECT id FROM crm_care_messages WHERE provider_mid=$1)",[a.echo_mid])).rows[0].action,'CARE_OWN_ECHO');
  const read=await query('crm_care_runtime_read',[admin,company,c.key]);assert.equal(read.stale,true);assert.equal(read.delivery.state,'SENT');assert.equal(read.delivery.echoObserved,true);
  assert.equal(JSON.stringify(read.delivery).includes('payload'),false);
  await newTurn(x);assert.equal((await claim(x)).status,'CLAIMED');
 });
 await t.test('ACK without echo holds the next inference until signed transcript evidence arrives',async()=>{
  const x=await ready(),a=await claim(x),mid=randomUUID();await ack(a,x.g.worker,mid);
  await x.c.receive([x.c.incoming('Khách hỏi tiếp sau khi tin đã được Meta nhận.')]);x.c.key=randomUUID();
  assert.equal((await candidates(x.c,x.g)).items.length,0);assert.equal((await begin(x.c,x.g)).state,'DELIVERY_PENDING');
  await receive(x.c,[await echo(x.c,a,mid)]);assert.ok((await candidates(x.c,x.g)).items.includes(x.c.thread));
  assert.equal((await begin(x.c,x.g)).invoke,true);
 });
 await t.test('two send claimants return exactly one payload and one policy reservation',async()=>{
  const x=await ready(),rs=await Promise.all([claim(x,peers[0]),claim(x,peers[1],randomUUID())]);
  assert.equal(rs.filter(r=>r.status==='CLAIMED').length,1);assert.equal(rs.filter(r=>r.payload).length,1);
  assert.equal((await claim(x)).payload,undefined);assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.send_attempts WHERE policy_id=$1',[x.p.id])).rows[0].n,1);
 });
 await t.test('STOP, takeover, new inbound and revoked source prevent a pending draft from sending',async()=>{
  for(const kind of['stop','takeover','message','source']){
   const x=await ready();
   if(kind==='stop')await x.c.receive([x.c.incoming('STOP')]);
   if(kind==='takeover'){const v=await query('crm_care_read',[admin,company,x.c.thread]);await query('crm_care_control',[admin,company,randomUUID(),{threadId:x.c.thread,expectedVersion:v.version,action:'TAKEOVER',reason:'Synthetic human takes control before answer claim'}]);}
   if(kind==='message')await x.c.receive([x.c.incoming('Tôi thay đổi yêu cầu trước khi gửi.')]);
   if(kind==='source')await db.query('UPDATE crm_care_library_publishers SET active=false WHERE company_id=$1 AND user_id=$2',[company,admin]);
   try{const a=await claim(x);assert.equal(a.status,'HELD');assert.equal(a.payload,undefined);assert.equal(await mode(x.c),kind==='stop'?'OPTED_OUT':kind==='takeover'?'HUMAN_ACTIVE':'HUMAN_REQUESTED');}
   finally{if(kind==='source'){await db.query('UPDATE crm_care_library_publishers SET active=true WHERE company_id=$1 AND user_id=$2',[company,admin]);await approve();}}
  }
 });
 await t.test('independent policy, entry version, credential and grant revocation cannot be replaced by a model draft',async()=>{
  for(const kind of['version','credential','policy','grant','grantABA']){
   const x=await ready(kind==='version'?{allowed_entries:{[randomUUID()]:'a'.repeat(32)}}:kind==='credential'?{credential_hash:'0'.repeat(64)}:{});
   if(kind==='policy')await db.query('UPDATE crm_care_control.send_policies SET active=false WHERE id=$1',[x.p.id]);
   if(kind.startsWith('grant')){await db.query('UPDATE crm_care_control.runtime_grants SET active=false WHERE id=$1',[x.g.id]);if(kind==='grantABA')await db.query('UPDATE crm_care_control.runtime_grants SET active=true WHERE id=$1',[x.g.id]);}
   if(['policy','grant'].includes(kind))await assert.rejects(claim(x),e=>e.code==='42501');else assert.equal((await claim(x)).status,'HELD');
  }
 });
 await t.test('latest future, blank or attachment input and long approved answers are held without truncation',async()=>{
  for(const kind of['future','blank','attachment','long']){
   const c=await fixture();let restore;
   if(kind!=='long')await db.query("UPDATE crm_care_messages SET sent_at=CASE WHEN $2='future' THEN clock_timestamp()+interval '1 minute' ELSE sent_at END,content=CASE WHEN $2='blank' THEN '' ELSE content END,attachments=CASE WHEN $2='attachment' THEN '[{\"type\":\"image\"}]'::jsonb ELSE attachments END WHERE id=(SELECT id FROM crm_care_messages WHERE thread_id=$1 AND direction='inbound' ORDER BY sent_at DESC,id DESC LIMIT 1)",[c.thread,kind]);
   if(kind==='long'){
    const context=await query('crm_care_control.context_core',[company,c.thread],db),entry=context.entries[0];
    const save=async document=>{const current=await query('crm_care_library_read',[admin,company,entry.entryId]);
     const saved=await query('crm_care_library_change',[admin,company,randomUUID(),{entryId:entry.entryId,action:'SAVE',expectedVersion:current.version,document,reason:'Synthetic source-backed answer length acceptance'}]);
     await query('crm_care_library_change',[admin,company,randomUUID(),{entryId:entry.entryId,action:'APPROVE',expectedVersion:saved.entry.version,reason:'Synthetic approval for answer transport length test'}]);};
    restore=()=>save(entry.document);await save({...entry.document,answer:'x'.repeat(2001)});
   }
   try{const g=await enroll(c),r=await begin(c,g);assert.equal(r.invoke,true,kind);
    if(kind==='long')assert.equal(r.context.entries[0].document.answer.length,2001);
    await finish(c,g,r);const x={c,g,p:await policy(c,g)};assert.equal((await claim(x)).status,'HELD',kind);}
   finally{if(restore)await restore();}
  }
 });
 await t.test('lost send claim and restart never expose a second payload; recovery enters human queue',async()=>{
  const x=await ready();let posts=0;const sender=dispatch(x,async()=>{posts++;throw Error('should not send');},{lost:'crm_care_send_claim'});
  await sender.run.drain();await dispatch(x,async()=>{posts++;}).run.drain();assert.equal(posts,0);assert.equal((await state(x.c)).state,'SENDING');
  await db.query("UPDATE crm_care_control.send_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE request_id=$1",[x.c.key]);
  await query('crm_care_send_recover',[company,x.c.page]);assert.equal((await state(x.c)).state,'UNCERTAIN');assert.equal(await mode(x.c),'HUMAN_REQUESTED');assert.equal((await claim(x)).payload,undefined);
 });
 await t.test('echo before transport timeout is evidence only, never success or automatic resend',async()=>{
  const x=await ready();let posts=0;const sender=dispatch(x,async(_,init)=>{posts++;await receive(x.c,[await echo(x.c,{payload:JSON.parse(init.body)})]);throw Error('synthetic lost provider ACK');});
  await sender.run.drain();await sender.run.drain();const a=await state(x.c);assert.equal(posts,1);assert.equal(a.state,'UNCERTAIN');assert.ok(a.echo_mid);assert.equal(a.ack_mid,null);assert.equal(await mode(x.c),'HUMAN_REQUESTED');
  await db.query('UPDATE crm_care_control.runtime_grants SET active=false WHERE id=$1',[x.g.id]);
  await ack({attemptId:a.attempt_id,psid:a.psid},x.g.worker,a.echo_mid);assert.equal((await state(x.c)).state,'SENT');assert.equal(await mode(x.c),'HUMAN_REQUESTED');
 });
 await t.test('wrong recipient and conflicting echo or ACK remain conflicts and retain receipt history',async()=>{
  for(const kind of['recipient','echo','ack']){
   const x=await ready(),a=await claim(x),mid=randomUUID();await ack(a,x.g.worker,mid,kind==='recipient'?'999':a.psid);
   if(kind==='echo')await receive(x.c,[await echo(x.c,a,randomUUID())]);
   if(kind==='ack')await ack(a,x.g.worker,randomUUID());
   assert.equal((await state(x.c)).state,'CONFLICT');assert.equal(await mode(x.c),'HUMAN_REQUESTED');
   await ack(a,x.g.worker,mid);assert.equal((await state(x.c)).state,'CONFLICT');assert.equal((await claim(x)).payload,undefined);
  }
 });
 await t.test('whole-batch STOP wins over own echo and receipt metadata cannot be replayed differently',async()=>{
  const x=await ready(),a=await claim(x),e=await echo(x.c,a);await receive(x.c,[e,x.c.incoming('STOP')]);await ack(a,x.g.worker,e.message.mid);
  assert.equal(await mode(x.c),'OPTED_OUT');await receive(x.c,[e]);
  await assert.rejects(receive(x.c,[{...e,message:{...e.message,metadata:'VPT_CARE_SEND_V1:'+randomUUID()}}]));
  assert.equal((await state(x.c)).state,'SENT');assert.equal(await mode(x.c),'OPTED_OUT');
 });
 await t.test('missing echo timeout retains SENT proof while requesting human reconciliation',async()=>{
  const x=await ready(),a=await claim(x),mid=randomUUID();await ack(a,x.g.worker,mid);
  await db.query("UPDATE crm_care_control.send_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE request_id=$1",[x.c.key]);
  await query('crm_care_send_recover',[company,x.c.page]);await query('crm_care_send_recover',[company,x.c.page]);
  assert.equal((await state(x.c)).state,'SENT');assert.equal((await state(x.c)).reason,'ECHO_MISSING');assert.equal(await mode(x.c),'HUMAN_REQUESTED');
  await receive(x.c,[await echo(x.c,a,mid)]);assert.equal((await state(x.c)).echo_mid,mid);assert.equal(await mode(x.c),'HUMAN_REQUESTED');
 });
 await t.test('message policy cap is consumed by claimed attempts and cannot be refilled through update',async()=>{
  const x=await ready({max_messages:1}),a=await claim(x),mid=randomUUID();await receive(x.c,[await echo(x.c,a,mid)]);await ack(a,x.g.worker,mid);
  await newTurn(x);assert.equal((await claim(x)).reason,'POLICY_LIMIT');
  await assert.rejects(db.query('UPDATE crm_care_control.send_policies SET max_messages=100 WHERE id=$1',[x.p.id]),e=>e.code==='22023');
 });
 await t.test('send lease clamps to policy and waiting past expiry returns no authority',async()=>{
  const x=await ready({expires_at:new Date(Date.now()+3500)}),a=await claim(x);assert.ok(Date.parse(a.sendBefore)<=x.p.expires_at.getTime());
  const y=await ready({expires_at:new Date(Date.now()+1500)});await db.query('BEGIN');await db.query('SELECT id FROM crm_care_threads WHERE id=$1 FOR UPDATE',[y.c.thread]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=assert.rejects(claim(y,peers[1]),e=>e.code==='42501');
  try{await lockWait(pid);await db.query('SELECT pg_sleep(1.6)');await db.query('COMMIT');await pending;}finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
  assert.equal(await state(y.c),undefined);
 });
 await t.test('observed customer opt-out lock prevents a waiting send claim',async()=>{
  const x=await ready();await db.query('BEGIN');await db.query("UPDATE crm_care_threads SET mode='OPTED_OUT',revision=revision+1 WHERE id=$1",[x.c.thread]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=claim(x,peers[1]);
  try{await lockWait(pid);await db.query('COMMIT');assert.equal((await pending).status,'HELD');}finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
  assert.equal(await mode(x.c),'OPTED_OUT');
 });
 await t.test('lease cannot outlive the named source publisher approval',async()=>{
  const expires=new Date(Date.now()+3500);
  await db.query('UPDATE crm_care_library_publishers SET expires_at=$1 WHERE company_id=$2 AND user_id=$3',[expires,company,admin]);
  try{await approve();const x=await ready(),a=await claim(x);assert.equal(a.status,'CLAIMED');assert.ok(Date.parse(a.sendBefore)<=expires.getTime());}
  finally{await db.query("UPDATE crm_care_library_publishers SET expires_at=clock_timestamp()+interval '1 day' WHERE company_id=$1 AND user_id=$2",[company,admin]);await approve();}
 });
 await t.test('foreign policy or runtime scope cannot expose payload or operator delivery records',async()=>{
  const x=await ready();await assert.rejects(query('crm_care_send_claim',[x.g.agent,other,x.g.id,x.p.id,x.c.key,x.g.worker,sha('synthetic')]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_send_claim',[admin,company,x.g.id,x.p.id,x.c.key,x.g.worker,sha('synthetic')]),e=>e.code==='42501');
  await claim(x);await assert.rejects(query('crm_care_runtime_read',[admin,other,x.c.key]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_read',[sales,company,x.c.key]),e=>e.code==='42501');
 });
 await t.test('multi-thread recovery uses the same Page and PSID lock order as a signed inbound batch',async()=>{
  const base=await fixture(),g=await enroll(base),threads=[];
  for(let i=0;i<2;i++){
   const c={...base,thread:(i===0?'f':'a')+randomUUID().slice(1),psid:String(710000001+i),key:randomUUID()};
   await db.query('INSERT INTO crm_care_threads(id,company_id,page_id,psid) VALUES($1,$2,$3,$4)',[c.thread,company,c.page,c.psid]);
   const event={sender:{id:c.psid},recipient:{id:c.page},timestamp:await stamp(),message:{mid:randomUUID(),text:'Synthetic request for two-thread recovery'}};
   await receive(c,[event]);const evidence=(await db.query('SELECT id FROM crm_care_messages WHERE provider_mid=$1',[event.message.mid])).rows[0].id;
   const v=await query('crm_care_connection_read',[admin,company,c.thread,c.lead]);
   await query('crm_care_connection_link',[admin,company,randomUUID(),{threadId:c.thread,leadId:c.lead,expectedVersion:v.version,evidenceMessageId:evidence,identityConfirmed:true,reason:'Synthetic identity link for concurrency acceptance'}]);
   const r=await begin(c,g);await finish(c,g,r);const x={c,g,p:await policy(c,g)};await claim(x);threads.push(c);
  }
  await db.query("UPDATE crm_care_control.send_attempts SET started_at=clock_timestamp()-interval '2 minutes' WHERE page_id=$1",[base.page]);
  const events=await Promise.all(threads.map(async c=>({sender:{id:c.psid},recipient:{id:c.page},timestamp:await stamp(),message:{mid:randomUUID(),text:'Synthetic next inbound batch'}})));
  await db.query('BEGIN');await db.query('SELECT id FROM crm_care_threads WHERE id=$1 FOR UPDATE',[threads[1].thread]);
  const pid0=(await peers[0].query('SELECT pg_backend_pid() pid')).rows[0].pid,pid1=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const recovery=query('crm_care_send_recover',[company,base.page],peers[0]).then(value=>({value}),error=>({error}));let inbound;
  try{await lockWait(pid0);inbound=receive(base,events,peers[1]).then(value=>({value}),error=>({error}));await lockWait(pid1);await db.query('COMMIT');
   assert.equal((await recovery).error,undefined);assert.equal((await inbound).error,undefined);
  }finally{await db.query('ROLLBACK');await recovery;if(inbound)await inbound;}
  for(const c of threads){assert.equal((await state(c)).state,'UNCERTAIN');assert.equal(await mode(c),'HUMAN_REQUESTED');}
 });

 // Real proposal service plus actual survey claim, sharing the same conversation.
 const proposal=async x=>{
  const staff=randomUUID(),a=Date.now()+4*86400000,b=a+3600000,region=(await db.query('SELECT region_id FROM crm_leads WHERE id=$1',[x.c.lead])).rows[0].region_id;
  await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2",[staff,company]);
  await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[staff,region]);
  await db.query("INSERT INTO crm_survey_control.crm_survey_calendar_staff(staff_id,company_id,enrolled_by,release_reference) VALUES($1,$2,$3,'Synthetic isolated calendar enrollment only')",[staff,company,admin]);
  await query('crm_survey_roster_change',[admin,company,randomUUID(),{action:'SAVE',staffId:staff,regionId:region,expectedRevision:0,reason:'Synthetic source verified for shared delivery acceptance',
   document:{calendarSource:'CRM_COMPLETE',externalCalendarCoverage:'ALL_BUSY_IN_CRM',sourceReference:'Synthetic complete calendar for isolated shared delivery',validUntil:new Date(a+86400000).toISOString(),bufferMinutes:0,slots:[{startsAt:new Date(a).toISOString(),endsAt:new Date(b).toISOString()}]}}]);
  const available=await query('crm_survey_availability',[admin,company,x.c.thread,new Date(a).toISOString(),new Date(b).toISOString()]);const option=available.items.find(o=>o.staffId===staff);assert.ok(option);
  const p=await query('crm_survey_propose',[admin,company,randomUUID(),{threadId:x.c.thread,optionId:option.optionId,startsAt:new Date(a).toISOString(),endsAt:new Date(b).toISOString(),location:'Synthetic survey location'}]);
  await db.query("INSERT INTO crm_survey_control.ingress_pages VALUES($1,$2,true,'Synthetic survey ingress only')",[x.c.page,company]);
  await db.query("INSERT INTO crm_survey_control.dispatch_pages VALUES($1,$2,'789','v24.0',true,'Synthetic shared dispatch only',$3,'Synthetic Page credential evidence only')",[x.c.page,company,sha('synthetic')]);
  return{p,staff};
 };
 for(const first of['answer','survey'])await t.test('observed '+first+' claim blocks the other transport on the same thread',async()=>{
  const x=await ready(),{p,staff}=await proposal(x),survey=client=>query('crm_survey_dispatch_claim',[x.c.page,p.proposalId,randomUUID(),sha('synthetic')],client);
  await peers[0].query('BEGIN');let pending;
  try{const a=await(first==='answer'?claim(x,peers[0]):survey(peers[0]));assert.equal(a.status,'CLAIMED');
   const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;pending=(first==='answer'?survey(peers[1]):claim(x,peers[1])).then(value=>({value}),error=>({error}));
   await lockWait(pid);await peers[0].query('COMMIT');const result=await pending;assert.equal(result.error,undefined);assert.equal(result.value.status,first==='answer'?'PRIOR_DELIVERY_UNCERTAIN':'DELIVERY_PENDING');}
  finally{await peers[0].query('ROLLBACK');if(pending)await pending;await db.query('DELETE FROM crm_survey_control.crm_survey_calendar_staff WHERE staff_id=$1',[staff]);}
 });
 await t.test('answer receipt barrier also blocks a queued booking outcome',async()=>{
  const x=await ready(),{p,staff}=await proposal(x);await claim(x);const outcome=randomUUID();
  await db.query("INSERT INTO crm_survey_control.outcomes(id,proposal_id,kind,company_id,thread_id,state) VALUES($1,$2,'NOT_BOOKED',$3,$4,'QUEUED')",[outcome,p.proposalId,company,x.c.thread]);
  const r=await query('crm_survey_outcome_claim',[x.c.page,outcome,randomUUID(),sha('synthetic')]);assert.equal(r.status,'PRIOR_DELIVERY_UNCERTAIN');
  await db.query('DELETE FROM crm_survey_control.crm_survey_calendar_staff WHERE staff_id=$1',[staff]);
 });
};
