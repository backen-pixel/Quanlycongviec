'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {createCareRuntime}=require('../src/modules/marketingAutomation/careRuntime');
const {createCareOpenAiInference}=require('../src/modules/marketingAutomation/careOpenAiInference');
const sha=x=>createHash('sha256').update(x).digest('hex');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,approve,begin:humanBegin})=>{
 const before=await fixture(),viewBefore=await query('crm_care_read',[admin,company,before.thread]);
 for(const name of['692_crm_care_shared_rules.sql','693_crm_care_runtime.sql','694_crm_care_answer_delivery.sql','695_crm_survey_runtime.sql']){
  const sql=fs.readFileSync(path.resolve(__dirname,'../../database/'+name),'utf8');await db.query(sql);await db.query(sql);
 }
 const credential='synthetic-runtime-key-only',model='runtime-snapshot-test';
 const enroll=async(c,overrides={})=>{
  const g={agent:randomUUID(),id:randomUUID(),policy:randomUUID(),worker:randomUUID(),...overrides};
  await db.query('INSERT INTO crm_care_control.runtime_principals(id,company_id,label,active,approval_reference) VALUES($1,$2,$3,true,$4)',
   [g.agent,company,'Synthetic runtime','Synthetic enrollment in isolated tests only']);
  await db.query("INSERT INTO crm_care_control.inference_policies(id,company_id,actor_id,provider,model,credential_sha256,approval_reference,starts_at,expires_at,active,max_calls,max_input_bytes,max_output_tokens,reserve_per_call_vnd,allowance_vnd) VALUES($1,$2,$3,'OPENAI_RESPONSES',$4,$5,$6,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day',true,10,150000,512,2000,20000)",
   [g.policy,company,g.agent,model,sha(credential),'Synthetic approved runtime budget only']);
  await db.query("INSERT INTO crm_care_control.runtime_grants(id,principal_id,company_id,page_id,delegated_by,inference_policy_id,active,starts_at,expires_at,approval_reference) VALUES($1,$2,$3,$4,$5,$6,true,clock_timestamp()-interval '1 second',$8,$7)",
   [g.id,g.agent,company,c.page,admin,g.policy,'Synthetic runtime delegation for isolated test only',g.expires||new Date(Date.now()+86400000)]);return g;
 };
 const begin=(c,g,client=peers[0],request=c.key)=>query('crm_care_runtime_begin',[g.agent,company,g.id,request,c.thread,g.worker],client);
 const select=r=>({action:'ANSWER',entryId:r.context.entries[0].entryId,needs:[]});
 const finish=(c,g,r,response=select(r),client=peers[0])=>query('crm_care_runtime_finish',[g.agent,company,g.id,c.key,r.capability,response],client);
 const claim=(c,g,r,client=peers[0])=>query('crm_care_runtime_inference_claim',[g.agent,company,c.key,r.capability,g.policy,sha(credential),sha('synthetic-runtime-payload'),1000,g.id],client);
 const read=(c,actor=admin,cid=company)=>query('crm_care_runtime_read',[actor,cid,c.key]);
 const candidates=(c,g)=>query('crm_care_runtime_candidates',[g.agent,company,g.id,c.page,10]);
 const usage=(c,p)=>query('crm_care_inference_record',[c.key,p.capability,{state:'USAGE_RECORDED',responseId:'resp_runtime_test',model,inputTokens:10,outputTokens:10,totalTokens:20}]);
 const lockWait=async pid=>{for(let i=0;i<150;i++){await db.query('SELECT pg_stat_clear_snapshot()');if((await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock'",[pid])).rowCount)return;await new Promise(r=>setTimeout(r,10));}assert.fail('runtime waiter was not observed');};
 function worker(c,g,{action='ANSWER',lost,network=false,receiptFailure}={}){
  const calls=[],posts=[],errors=[],receiptRequests=[],receiptAcks=[];
  const storage={rpc:async(name,args)=>{calls.push(name);try{
   if(name==='crm_care_inference_record'){
    receiptRequests.push(JSON.parse(JSON.stringify(args)));
    if(receiptFailure==='transport-down')throw new TypeError('Synthetic receipt connection failure');
    if(receiptRequests.length===1&&receiptFailure==='rollback'){
     await peers[0].query('BEGIN');try{await query(name,Object.values(args));}finally{await peers[0].query('ROLLBACK');}
     return{error:{code:'40001'}};
    }
    if(receiptRequests.length===1&&receiptFailure==='conflict')await query(name,[args.p_request,args.p_capability,{state:'UNKNOWN',reason:'TRANSPORT_UNKNOWN'}]);
   }
   const data=await query(name,Object.values(args));
   if(name==='crm_care_inference_record'){
    receiptAcks.push(data);
    if(receiptRequests.length===1&&['lost-ack','revoke-after-commit'].includes(receiptFailure)){
     if(receiptFailure==='revoke-after-commit')await db.query('UPDATE crm_care_control.runtime_grants SET active=false WHERE id=$1',[g.id]);
     throw new TypeError('Synthetic lost receipt acknowledgement');
    }
   }
   if(lost===name)return{error:{code:'LOST_ACK'}};return{data};
  }catch(error){return{error};}}};
  const env={VPT_CARE_RUNTIME:'1',VPT_CARE_RUNTIME_OPENAI:'1',VPT_CARE_RUNTIME_PRINCIPAL:g.agent,VPT_CARE_RUNTIME_COMPANY:company,
   VPT_CARE_RUNTIME_GRANT:g.id,VPT_CARE_RUNTIME_PAGE:c.page,VPT_CARE_ADVISOR_INFERENCE_POLICY:g.policy,VPT_CARE_ADVISOR_OPENAI_KEY:credential};
  const infer=createCareOpenAiInference({authority:'RUNTIME',db:storage,isPrimary:()=>true,env,fetchImpl:async(url,request)=>{
   posts.push(request);if(network)throw Error('synthetic timeout');
   const b=JSON.parse(request.body),input=JSON.parse(b.input);
   for(const id of[g.agent,g.id,company,admin,c.thread,c.psid])assert.equal(request.body.includes(id),false);
   return new Response(JSON.stringify({id:'resp_runtime_integration',model,status:'completed',usage:{input_tokens:20,output_tokens:10,total_tokens:30},
    output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({action,answer:action==='ANSWER'?input.answers[0].id:null,needs:[]})}]}]}));
  }});
  return{run:createCareRuntime({db:storage,env,isPrimary:()=>true,infer,onError:x=>errors.push(x),workerId:g.worker}),calls,posts,errors,receiptRequests,receiptAcks};
 }
 await t.test('shared private cores preserve human projection and no Agent enrollment is seeded',async()=>{
  assert.deepEqual(await query('crm_care_read',[admin,company,before.thread]),viewBefore);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.runtime_principals')).rows[0].n,0);
  for(const role of['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{
   await assert.rejects(db.query('SELECT * FROM crm_care_control.runtime_grants'),e=>e.code==='42501');
   for(const [fn,args]of[['thread_view_core',[company,before.thread]],['library_view_core',[company,randomUUID()]],['context_core',[company,before.thread]],
    ['advisor_begin_core',[admin,company,randomUUID(),before.thread,before.version]],['runtime_authorize',[admin,company,randomUUID()]]])
    await assert.rejects(query('crm_care_control.'+fn,args,db),e=>e.code==='42501');
   if(role!=='service_role')await assert.rejects(query('crm_care_runtime_candidates',[randomUUID(),company,randomUUID(),before.page,10],db),e=>e.code==='42501');
  }finally{await db.query('RESET ROLE');}}
 });
 await t.test('real runtime worker calls fake provider under its own identity, records usage and avoids reprocessing',async()=>{
  const c=await fixture(),g=await enroll(c),x=worker(c,g),lead=(await db.query('SELECT to_jsonb(l) j FROM crm_leads l WHERE id=$1',[c.lead])).rows[0].j;
  await x.run.drain();await x.run.drain();assert.deepEqual(x.errors,[]);assert.equal(x.posts.length,1);
  assert.ok(x.calls.includes('crm_care_runtime_inference_claim'));assert.equal(x.calls.includes('crm_care_inference_claim'),false);
  const rt=(await db.query('SELECT * FROM crm_care_control.runtime_turns WHERE thread_id=$1',[c.thread])).rows[0];c.key=rt.request_id;
  const r=(await db.query('SELECT * FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0];
  assert.equal(r.actor_id,g.agent);assert.equal(r.state,'DRAFT');assert.equal(rt.authority_snapshot.delegated_by,admin);
  assert.equal((await read(c)).principalKind,'AGENT');assert.equal((await read(c)).result.needsVerified,false);
  await assert.rejects(query('crm_care_advisor_read',[admin,company,c.key]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_advisor_read',[g.agent,company,c.key]),e=>e.code==='42501');
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'WAITING');
  assert.deepEqual((await db.query('SELECT to_jsonb(l) j FROM crm_leads l WHERE id=$1',[c.lead])).rows[0].j,lead);
  assert.equal((await db.query('SELECT state FROM crm_care_control.inference_receipts WHERE request_id=$1',[c.key])).rows[0].state,'USAGE_RECORDED');
 });
 await t.test('valid model handoff and provider failure enter human queue with attribution and working-hours deadline',async()=>{
  for(const options of[{action:'HANDOFF'},{network:true}]){
   const c=await fixture(),g=await enroll(c),x=worker(c,g,options);await x.run.drain();assert.deepEqual(x.errors,[]);
   const view=await query('crm_care_read',[admin,company,c.thread]);assert.equal(view.mode,'HUMAN_REQUESTED');assert.equal(view.target.ownerId,sales);assert.ok(view.humanDeadline);
   const event=(await db.query("SELECT * FROM crm_care_events WHERE thread_id=$1 AND action='AI_HANDOFF'",[c.thread])).rows[0];
   assert.equal(event.actor_id,g.agent);assert.equal(event.result.principalKind,'AGENT');assert.equal(event.result.delegatedBy,admin);
   assert.equal(event.result.ownerId,sales);assert.equal(event.result.needsVerified,false);
   await x.run.drain();assert.equal(x.posts.length,1);
  }
 });
 await t.test('missing routing and long history route to a durable human exception without inference',async()=>{
  for(const long of[false,true]){
   const c=await fixture(),g=await enroll(c);
   if(long)await c.receive(Array.from({length:51},()=>c.incoming('Synthetic long conversation message')));
   else await db.query('UPDATE crm_leads SET assigned_to=NULL WHERE id=$1',[c.lead]);
   const r=await begin(c,g);assert.equal(r.invoke,false);assert.equal(r.state,'HUMAN_REQUESTED');
   assert.equal((await begin(c,g)).replayed,true);
   assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].n,0);
   assert.equal((await candidates(c,g)).items.length,0);
  }
 });
 await t.test('runtime denies forged, foreign or human identities and human tools cannot act as an Agent',async()=>{
  const c=await fixture(),g=await enroll(c);
  await assert.rejects(query('crm_care_runtime_begin',[randomUUID(),company,g.id,c.key,c.thread,g.worker]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_begin',[g.agent,other,g.id,c.key,c.thread,g.worker]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_candidates',[g.agent,company,g.id,'999999',10]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_library_read',[g.agent,company,randomUUID()]),e=>e.code==='42501');
  const human=await enroll(c,{agent:admin});await assert.rejects(begin(c,human),e=>e.code==='42501');
 });
 await t.test('two workers on the same inbound message can begin only one inference',async()=>{
  const c=await fixture(),g=await enroll(c),otherKey=randomUUID();
  const both=await Promise.all([begin(c,g),begin(c,g,peers[1],otherKey)]);assert.equal(both.filter(x=>x.invoke).length,1);
  const winner=both.find(x=>x.invoke);c.key=winner.requestId;await finish(c,g,winner);
  assert.equal((await candidates(c,g)).items.length,0);assert.equal((await begin(c,g,peers[1])).invoke,false);
 });
 await t.test('human and runtime competing on one context never both get inference capability',async()=>{
  const c=await fixture(),g=await enroll(c),humanKey=randomUUID();
  const rs=await Promise.allSettled([begin(c,g),humanBegin(c,humanKey,peers[1])]);
  assert.equal(rs.filter(x=>x.status==='fulfilled'&&x.value.invoke===true).length,1);
  const win=rs.find(x=>x.status==='fulfilled'&&x.value.invoke===true).value;
  if(win.principalId)await finish(c,g,win);else await query('crm_care_advisor_finish',[admin,company,humanKey,win.capability,select(win)]);
 });
 await t.test('takeover and opt-out during inference discard Agent output and preserve customer control',async()=>{
  for(const action of['TAKEOVER','OPT_OUT']){
   const c=await fixture(),g=await enroll(c),r=await begin(c,g),view=await query('crm_care_read',[admin,company,c.thread]);
   await query('crm_care_control',[admin,company,randomUUID(),{threadId:c.thread,expectedVersion:view.version,action,reason:'Synthetic operator control during isolated inference'}]);
   const result=await finish(c,g,r);assert.equal(result.stale,true);assert.equal(result.handoff,false);
   assert.equal((await read(c)).result,null);assert.equal((await candidates(c,g)).items.length,0);
  }
 });
 await t.test('grant and principal revoke-reactivate cycles invalidate old inference and finish permanently',async()=>{
  for(const table of['runtime_grants','runtime_principals']){
   const c=await fixture(),g=await enroll(c),r=await begin(c,g),id=table==='runtime_grants'?g.id:g.agent;
   await db.query('UPDATE crm_care_control.'+table+' SET active=false WHERE id=$1',[id]);await db.query('UPDATE crm_care_control.'+table+' SET active=true WHERE id=$1',[id]);
   await assert.rejects(claim(c,g,r),e=>e.code==='42501');await assert.rejects(finish(c,g,r),e=>e.code==='42501');assert.equal((await read(c)).authorityCurrent,false);
  }
 });
 await t.test('usage can be recorded after runtime grant revocation without allowing new disclosure',async()=>{
  const c=await fixture(),g=await enroll(c),r=await begin(c,g),p=await claim(c,g,r);
  await db.query('UPDATE crm_care_control.runtime_grants SET active=false WHERE id=$1',[g.id]);
  assert.equal((await usage(c,p)).state,'USAGE_RECORDED');await assert.rejects(finish(c,g,r),e=>e.code==='42501');
  assert.equal((await read(c)).result,null);
 });
 await t.test('changed Page, company or grantor authority cannot be used for model disclosure',async()=>{
  for(const type of['page','company','grantor']){
   const c=await fixture(),g=await enroll(c),r=await begin(c,g);
   if(type==='page')await db.query('UPDATE facebook_pages SET default_company_id=$1 WHERE page_id=$2',[other,c.page]);
   else await db.query('UPDATE '+(type==='company'?'companies':'users')+' SET is_active=false WHERE id=$1',[type==='company'?company:admin]);
   try{await assert.rejects(claim(c,g,r),e=>e.code==='42501');}
   finally{if(type==='page')await db.query('UPDATE facebook_pages SET default_company_id=$1 WHERE page_id=$2',[company,c.page]);
    else await db.query('UPDATE '+(type==='company'?'companies':'users')+' SET is_active=true WHERE id=$1',[type==='company'?company:admin]);}
  }
 });
 await t.test('revoked publisher invalidates an in-flight selection without inventing a fallback answer',async()=>{
  const c=await fixture(),g=await enroll(c),r=await begin(c,g);
  await db.query('UPDATE crm_care_library_publishers SET active=false WHERE company_id=$1 AND user_id=$2',[company,admin]);
  try{const result=await finish(c,g,r);assert.equal(result.stale,true);assert.equal((await read(c)).result,null);}
  finally{await db.query('UPDATE crm_care_library_publishers SET active=true WHERE company_id=$1 AND user_id=$2',[company,admin]);await approve();}
 });
 await t.test('lost BEGIN or FINISH acknowledgements and fresh workers do not repeat model calls',async()=>{
  for(const lost of['crm_care_runtime_begin','crm_care_runtime_finish']){
   const c=await fixture(),g=await enroll(c),x=worker(c,g,{lost});await x.run.drain();assert.equal(x.errors.length,1);
   const y=worker(c,{...g,worker:randomUUID()});await y.run.drain();assert.deepEqual(y.errors,[]);assert.equal(y.posts.length,0);
   assert.equal(x.posts.length,lost.endsWith('begin')?0:1);
  }
 });
 await t.test('runtime BEGIN rollback releases the inbound turn and direct policy edits cannot refill authority',async()=>{
  const c=await fixture(),g=await enroll(c);await peers[0].query('BEGIN');await begin(c,g);await peers[0].query('ROLLBACK');
  assert.equal((await candidates(c,g)).items.includes(c.thread),true);const r=await begin(c,g);await finish(c,g,r);
  await assert.rejects(db.query("UPDATE crm_care_control.runtime_grants SET page_id='999' WHERE id=$1",[g.id]),e=>e.code==='22023');
  await assert.rejects(db.query('UPDATE crm_care_control.runtime_principals SET company_id=$1 WHERE id=$2',[other,g.agent]),e=>e.code==='22023');
  await assert.rejects(read(c,sales),e=>e.code==='42501');await assert.rejects(read(c,admin,other),e=>e.code==='42501');
 });
 await t.test('inference waits on a real grant revocation lock and refuses after commit',async()=>{
  const c=await fixture(),g=await enroll(c),r=await begin(c,g);await db.query('BEGIN');
  await db.query('UPDATE crm_care_control.runtime_grants SET active=false WHERE id=$1',[g.id]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=assert.rejects(claim(c,g,r,peers[1]),e=>e.code==='42501');
  try{await lockWait(pid);await db.query('COMMIT');await pending;}finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
 });
 await t.test('finish waits on customer opt-out and never overwrites it with AI handoff',async()=>{
  const c=await fixture(),g=await enroll(c),r=await begin(c,g);await db.query('BEGIN');
  await db.query("UPDATE crm_care_threads SET mode='OPTED_OUT',revision=revision+1 WHERE id=$1",[c.thread]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=finish(c,g,r,{action:'HANDOFF',entryId:null,needs:[]},peers[1]);
  try{await lockWait(pid);await db.query('COMMIT');assert.equal((await pending).handoff,false);}
  finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'OPTED_OUT');
 });
 await t.test('runtime permit is capped by delegation expiry and expiry while waiting rolls back allocation',async()=>{
  const c=await fixture(),expires=new Date(Date.now()+3500),g=await enroll(c,{expires}),r=await begin(c,g),p=await claim(c,g,r);
  assert.ok(Date.parse(p.dispatchBefore)<=expires.getTime());assert.equal((await usage(c,p)).state,'USAGE_RECORDED');
  const d=await fixture(),h=await enroll(d,{expires:new Date(Date.now()+1500)}),b=await begin(d,h);
  await db.query('BEGIN');await db.query('SELECT 1 FROM crm_care_control.inference_policies WHERE id=$1 FOR UPDATE',[h.policy]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=assert.rejects(claim(d,h,b,peers[1]),e=>e.code==='42501');
  try{await lockWait(pid);await db.query('SELECT pg_sleep(1.6)');await db.query('COMMIT');await pending;}
  finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.inference_receipts WHERE request_id=$1',[d.key])).rows[0].n,0);
 });
 await t.test('grant expiry while BEGIN or FINISH waits cannot create a turn or human handoff',async()=>{
  for(const op of['begin','finish']){
   const c=await fixture(),g=await enroll(c,{expires:new Date(Date.now()+1500)}),r=op==='finish'?await begin(c,g):null;
   await db.query('BEGIN');await db.query('SELECT 1 FROM crm_care_threads WHERE id=$1 FOR UPDATE',[c.thread]);
   const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const pending=assert.rejects(op==='begin'?begin(c,g,peers[1]):finish(c,g,r,{action:'HANDOFF',entryId:null,needs:[]},peers[1]),e=>e.code==='42501');
   try{await lockWait(pid);await db.query('SELECT pg_sleep(1.6)');await db.query('COMMIT');await pending;}
   finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
   assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'WAITING');
   if(op==='begin')assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.runtime_turns WHERE request_id=$1',[c.key])).rows[0].n,0);
   else assert.equal((await db.query('SELECT state FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].state,'RUNNING');
  }
 });
 await t.test('operator runtime discovery is bounded, company scoped and never exposes context or capabilities',async()=>{
  const result=await query('crm_care_runtime_list',[admin,company,null]);assert.ok(result.items.length<=20);assert.equal(result.send,false);
  assert.equal(JSON.stringify(result).includes('capability'),false);assert.equal(JSON.stringify(result).includes(credential),false);
  if(result.nextAfter){const next=await query('crm_care_runtime_list',[admin,company,result.nextAfter]);assert.ok(next.items.every(x=>!result.items.some(y=>x.request_id===y.request_id)));}
  await assert.rejects(query('crm_care_runtime_list',[sales,company,null]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_list',[admin,other,null]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_list',[admin,company,randomUUID()]),e=>e.code==='42501');
 });

 await t.test('ten broken foreign CRM mappings do not starve the next valid conversation',async()=>{
  const c=await fixture(),g=await enroll(c),foreign=randomUUID(),broken=[];
  await db.query("INSERT INTO crm_leads(id,company_id,title,type,customer_id,assigned_to,region_id) SELECT $1,company_id,'FOREIGN PRIVATE TITLE',type,customer_id,assigned_to,region_id FROM crm_leads WHERE id=$2",[foreign,c.lead]);
  for(let i=0;i<10;i++){
   const thread=randomUUID(),psid=String(800000000+i);broken.push(thread);
   await db.query("INSERT INTO crm_care_threads(id,company_id,page_id,psid,last_inbound_at,last_message_at) VALUES($1,$2,$3,$4,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day')",[thread,company,c.page,psid]);
   await db.query("INSERT INTO crm_care_messages(thread_id,page_id,provider_mid,direction,intent,content,attachments,sent_at,payload_hash) VALUES($1,$2,$3,'inbound','MESSAGE','Synthetic scoped inquiry','[]',clock_timestamp()-interval '1 day',$4)",[thread,c.page,randomUUID(),'a'.repeat(64)]);
   const evidence=(await db.query("SELECT id FROM crm_care_messages WHERE thread_id=$1 AND direction='inbound'",[thread])).rows[0].id;
   const view=await query('crm_care_connection_read',[admin,company,thread,foreign]);
   await query('crm_care_connection_link',[admin,company,randomUUID(),{threadId:thread,leadId:foreign,expectedVersion:view.version,
    evidenceMessageId:evidence,identityConfirmed:true,reason:'Synthetic valid connection before ownership drift test'}]);
  }
  await db.query('UPDATE crm_leads SET company_id=$1 WHERE id=$2',[other,foreign]);
  const x=worker(c,g);await x.run.drain();assert.equal(x.posts.length,0);assert.deepEqual(x.errors,[]);
  await x.run.drain();assert.equal(x.posts.length,1);assert.deepEqual(x.errors,[]);
  assert.equal((await db.query("SELECT count(*)::int n FROM crm_care_threads WHERE id=ANY($1::uuid[]) AND mode='HUMAN_REQUESTED'",[broken])).rows[0].n,10);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.advisor_runs WHERE thread_id=ANY($1::uuid[])',[broken])).rows[0].n,0);
  assert.equal(JSON.stringify(x.posts).includes('FOREIGN PRIVATE TITLE'),false);
 });
 await t.test('operator closure recovers an ambiguous runtime turn without refund, late finish or another call',async()=>{
  const c=await fixture(),g=await enroll(c),r=await begin(c,g),p=await claim(c,g,r),key=randomUUID(),reason='Operator closes isolated ambiguous runtime without repeating model';
  await db.query('UPDATE crm_care_control.runtime_grants SET active=false WHERE id=$1',[g.id]);
  const close=()=>query('crm_care_runtime_close',[admin,company,key,c.key,reason]);
  assert.equal((await close()).outcome,'CLOSED');assert.equal((await close()).replayed,true);
  assert.equal((await db.query('SELECT state FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].state,'REVIEW');
  assert.equal((await db.query('SELECT state FROM crm_care_control.inference_receipts WHERE request_id=$1',[c.key])).rows[0].state,'AUTHORIZED');
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'HUMAN_REQUESTED');
  await assert.rejects(query('crm_care_runtime_close',[admin,company,key,c.key,reason+' changed']),e=>e.code==='23505');
  await assert.rejects(query('crm_care_runtime_close',[sales,company,randomUUID(),c.key,reason]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_runtime_close',[admin,other,randomUUID(),c.key,reason]),e=>e.code==='42501');
  await assert.rejects(finish(c,g,r),e=>e.code==='42501');assert.equal((await usage(c,p)).state,'USAGE_RECORDED');
 });
 await t.test('runtime close fences late FINISH and preserves already completed drafts and opt-out',async()=>{
  const reason='Synthetic operator closure with exact runtime scope';
  const c=await fixture(),g=await enroll(c),r=await begin(c,g);await query('crm_care_runtime_close',[admin,company,randomUUID(),c.key,reason]);
  await assert.rejects(finish(c,g,r),e=>e.code==='23505');
  const d=await fixture(),h=await enroll(d),b=await begin(d,h);await finish(d,h,b);
  assert.equal((await query('crm_care_runtime_close',[admin,company,randomUUID(),d.key,reason])).outcome,'ALREADY_TERMINAL');
  assert.equal((await read(d)).state,'DRAFT');assert.equal((await query('crm_care_read',[admin,company,d.thread])).mode,'WAITING');
  const e=await fixture(),j=await enroll(e);await begin(e,j);await db.query("UPDATE crm_care_threads SET mode='OPTED_OUT',revision=revision+1 WHERE id=$1",[e.thread]);
  await query('crm_care_runtime_close',[admin,company,randomUUID(),e.key,reason]);assert.equal((await query('crm_care_read',[admin,company,e.thread])).mode,'OPTED_OUT');
 });

 for(const pair of[['close','finish'],['finish','close'],['close','claim'],['claim','close']])await t.test('observed runtime lock order '+pair.join(' before ')+' preserves committed evidence',async()=>{
  const c=await fixture(),g=await enroll(c),r=await begin(c,g),closeKey=randomUUID();
  const call=(op,client)=>op==='finish'?finish(c,g,r,select(r),client):op==='claim'?claim(c,g,r,client):
   query('crm_care_runtime_close',[admin,company,closeKey,c.key,'Observed isolated operator closure without retry or refund'],client);
  await peers[0].query('BEGIN');const first=await call(pair[0],peers[0]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const pending=call(pair[1],peers[1]).then(value=>({value}),error=>({error}));
  let second;try{await lockWait(pid);await peers[0].query('COMMIT');second=await pending;}
  finally{await peers[0].query('ROLLBACK');await pending;}
  if(pair[0]==='close')assert.equal(second.error?.code,pair[1]==='finish'?'23505':'42501');
  else{assert.equal(second.error,undefined);assert.equal(second.value.outcome,pair[0]==='finish'?'ALREADY_TERMINAL':'CLOSED');}
  const stored=(await db.query('SELECT state FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0];
  assert.equal(stored.state,pair[0]==='finish'?'DRAFT':'REVIEW');
  const receipt=(await db.query('SELECT state FROM crm_care_control.inference_receipts WHERE request_id=$1',[c.key])).rows[0];
  if(pair[0]==='claim'){assert.equal(receipt.state,'AUTHORIZED');assert.equal((await usage(c,first)).state,'USAGE_RECORDED');}
  else assert.equal(receipt,undefined);
 });

 await t.test('runtime receipt recovery handles committed lost ACK and rolled-back write without another inference',async()=>{
  for(const receiptFailure of['lost-ack','rollback']){
   const c=await fixture(),g=await enroll(c),x=worker(c,g,{receiptFailure});await x.run.drain();await x.run.drain();
   assert.deepEqual(x.errors,[]);assert.equal(x.posts.length,1);assert.equal(x.receiptRequests.length,2);
   assert.deepEqual(x.receiptRequests[0],x.receiptRequests[1]);assert.equal(x.receiptAcks.at(-1).replayed,receiptFailure==='lost-ack');
   const rows=(await db.query('SELECT r.state,r.reserved_vnd,a.state run_state FROM crm_care_control.inference_receipts r JOIN crm_care_control.advisor_runs a USING(request_id) WHERE r.policy_id=$1',[g.policy])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].state,'USAGE_RECORDED');assert.equal(rows[0].reserved_vnd,2000);assert.equal(rows[0].run_state,'DRAFT');
   const fresh=worker(c,{...g,worker:randomUUID()});await fresh.run.drain();assert.equal(fresh.posts.length,0);
  }
 });
 await t.test('two failed receipt writes retain the reservation and hand off instead of reinvoking the model',async()=>{
  const c=await fixture(),g=await enroll(c),x=worker(c,g,{receiptFailure:'transport-down'});await x.run.drain();
  assert.deepEqual(x.errors,[]);assert.equal(x.posts.length,1);assert.equal(x.receiptRequests.length,2);
  const receipt=(await db.query('SELECT state,reserved_vnd FROM crm_care_control.inference_receipts WHERE policy_id=$1',[g.policy])).rows[0];
  assert.equal(receipt.state,'AUTHORIZED');assert.equal(receipt.reserved_vnd,2000);assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'HUMAN_REQUESTED');
  const fresh=worker(c,{...g,worker:randomUUID()});await fresh.run.drain();assert.equal(fresh.posts.length,0);
 });
 await t.test('a conflicting terminal receipt is never retried or overwritten by recovered provider usage',async()=>{
  const c=await fixture(),g=await enroll(c),x=worker(c,g,{receiptFailure:'conflict'});await x.run.drain();
  assert.equal(x.posts.length,1);assert.equal(x.receiptRequests.length,1);assert.equal(x.receiptAcks.length,0);
  const receipt=(await db.query('SELECT state,reserved_vnd FROM crm_care_control.inference_receipts WHERE policy_id=$1',[g.policy])).rows[0];
  assert.equal(receipt.state,'UNKNOWN');assert.equal(receipt.reserved_vnd,2000);assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'HUMAN_REQUESTED');
 });
 await t.test('receipt retry after grant revocation accounts for usage without publishing an answer',async()=>{
  const c=await fixture(),g=await enroll(c),x=worker(c,g,{receiptFailure:'revoke-after-commit'});await x.run.drain();
  assert.equal(x.posts.length,1);assert.equal(x.receiptRequests.length,2);assert.equal(x.receiptAcks.at(-1).replayed,true);assert.equal(x.errors.length,1);
  const rows=(await db.query('SELECT r.request_id,r.state,r.reserved_vnd,a.state run_state,a.result FROM crm_care_control.inference_receipts r JOIN crm_care_control.advisor_runs a USING(request_id) WHERE r.policy_id=$1',[g.policy])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].state,'USAGE_RECORDED');assert.equal(rows[0].reserved_vnd,2000);assert.equal(rows[0].run_state,'RUNNING');assert.equal(rows[0].result,null);
  c.key=rows[0].request_id;assert.equal((await read(c)).result,null);
 });

 await require('./careAnswerDispatch.cases')(t,{db,peers,query,company,other,admin,sales,fixture,approve,enroll,begin,finish,select,worker,candidates,lockWait});
 await require('./surveyRuntime.cases')(t,{db,peers,query,company,other,admin,sales,fixture,enroll,begin,finish,lockWait});
 await require('./careInferenceCosts.cases')(t,{db,peers,query,company,other,admin,sales,fixture,enroll,begin,claim,usage,lockWait});
 await require('./facebookCustomerCare.journey.cases')(t,{db,peers,query,company,other,admin,sales,fixture,enroll,credential,model});

};
