'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createCareAdvisor}=require('../src/modules/marketingAutomation/careAdvisor');
module.exports=async(t,{db,peers,query,company,other,admin,sales,region,fresh})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/689_crm_care_advisor_drafts.sql'),'utf8');
 await db.query(sql);await db.query(sql);
 const product=randomUUID(),entry=randomUUID();
 await db.query("INSERT INTO products(id,company_id,name,status,cost_price,updated_at) VALUES($1,$2,'Advisor synthetic kitchen','active',987654321,clock_timestamp())",[product,company]);
 await db.query("INSERT INTO crm_care_library_publishers(company_id,user_id,active,expires_at,approval_reference) VALUES($1,$2,true,clock_timestamp()+interval '1 day','Advisor isolated test enrollment only') ON CONFLICT(company_id,user_id) DO UPDATE SET active=true,expires_at=excluded.expires_at",[company,admin]);
 const document={title:'Advisor synthetic response',purpose:'ADVICE',question:'Tư vấn tủ bếp',answer:'Thông tin tủ bếp giả đã duyệt.',
  sourceReference:'Synthetic kitchen specification for isolated advisor acceptance',productId:product,regionIds:[region],channels:['facebook'],validUntil:new Date(Date.now()+86400000).toISOString()};
 const change=cmd=>query('crm_care_library_change',[admin,company,randomUUID(),cmd]);
 const approve=async()=>{
  const exists=(await db.query('SELECT 1 FROM crm_care_library_entries WHERE id=$1',[entry])).rowCount;
  const before=exists?await query('crm_care_library_read',[admin,company,entry]):null;
  const saved=await change({entryId:entry,action:'SAVE',expectedVersion:before?.version||null,document,reason:'Synthetic source-backed edit for isolated advisor testing'});
  return change({entryId:entry,action:'APPROVE',expectedVersion:saved.entry.version,reason:'Synthetic approval for isolated advisor testing only'});
 };
 await approve();
 const fixture=async()=>{
  const c=await fresh();
  const connection=await query('crm_care_connection_read',[admin,company,c.thread,c.lead]);
  await query('crm_care_connection_link',[admin,company,randomUUID(),{threadId:c.thread,leadId:c.lead,expectedVersion:connection.version,evidenceMessageId:c.evidence,identityConfirmed:true,reason:'Synthetic explicit identity check for isolated advisor test'}]);
  await c.receive([c.incoming('Tôi cần tủ bếp, dự kiến 100 triệu trong ba tháng.')]);
  c.version=(await query('crm_care_read',[admin,company,c.thread])).version;c.key=randomUUID();return c;
 };
 const begin=(c,key=c.key,client=peers[0])=>query('crm_care_advisor_begin',[admin,company,key,c.thread,c.version],client);
 const read=(c,client=peers[0])=>query('crm_care_advisor_read',[admin,company,c.key],client);
 const selection=r=>({action:'ANSWER',entryId:entry,needs:[{field:'budget',messageId:r.context.messages.find(m=>m.content.includes('100 triệu')).id,quote:'100 triệu'}]});
 const finish=(c,r,response=selection(r),client=peers[0])=>query('crm_care_advisor_finish',[admin,company,c.key,r.capability,response],client);
 const close=(c,client=peers[0])=>query('crm_care_advisor_close',[admin,company,c.key,'Operator closes the ambiguous synthetic inference; no replay authorized'],client);
 await t.test('advisor schema and context deny direct service/browser access',async()=>{
  for(const role of['anon','authenticated','service_role']){
   await db.query('SET ROLE '+role);try{
    await assert.rejects(db.query('SELECT * FROM crm_care_control.advisor_runs'),e=>e.code==='42501');
    await assert.rejects(query('crm_care_control.advisor_context',[admin,company,randomUUID()],db),e=>e.code==='42501');
    if(role!=='service_role')await assert.rejects(query('crm_care_advisor_read',[admin,company,randomUUID()],db),e=>e.code==='42501');
   }finally{await db.query('RESET ROLE');}
  }
 });
 await t.test('advisor application traverses real SQL begin/inference/finish and preserves CRM/thread state',async()=>{
  const c=await fixture(),before=(await db.query('SELECT to_jsonb(l) row FROM crm_leads l WHERE id=$1',[c.lead])).rows[0].row;
  let calls=0;const storage={rpc:async(name,args)=>{try{return{data:await query(name,Object.values(args))};}catch(error){return{error};}}};
  const service=createCareAdvisor({db:storage,isPrimary:()=>true,env:{VPT_CARE_ADVISOR_ADMIN:'1',VPT_CARE_ADVISOR_DRAFTS:'1'},
   infer:async({input})=>{calls++;assert.equal(JSON.stringify(input).includes('987654321'),false);assert.equal(JSON.stringify(input).includes(c.psid),false);
    return{action:'ANSWER',answer:input.answers.find(a=>a.text===document.answer).id,needs:[{field:'budget',message:input.messages.find(m=>m.text.includes('100 triệu')).id,quote:'100 triệu'}]};}});
  const res={code:200,set(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
  const request={user:{id:admin},body:{companyId:company,requestId:c.key,threadId:c.thread,version:c.version}};
  await service.handle(request,res,'generate');assert.equal(res.code,200);assert.equal(res.body.state,'DRAFT');assert.equal(res.body.result.text,document.answer);
  assert.equal(res.body.result.needsVerified,false);assert.equal(res.body.send,false);assert.equal(res.body.capability,undefined);
  await service.handle(request,res,'generate');assert.equal(calls,1);
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,'WAITING');
  assert.deepEqual((await db.query('SELECT to_jsonb(l) row FROM crm_leads l WHERE id=$1',[c.lead])).rows[0].row,before);
 });
 await t.test('advisor exact concurrent begin allows only one inference capability',async()=>{
  const c=await fixture(),r=await Promise.all([begin(c),begin(c,c.key,peers[1])]);
  assert.equal(r.filter(x=>x.invoke===true).length,1);const replay=r.find(x=>!x.invoke);
  assert.equal(replay.capability,undefined);assert.equal(replay.context,undefined);
  await finish(c,r.find(x=>x.invoke));
 });
 await t.test('advisor distinct keys cannot duplicate a running or already completed context',async()=>{
  const c=await fixture(),r=await begin(c);
  await assert.rejects(begin(c,randomUUID()),e=>e.code==='40001');await finish(c,r);
  await assert.rejects(begin(c,randomUUID()),e=>e.code==='23505');
  await assert.rejects(query('crm_care_advisor_begin',[admin,company,c.key,c.thread,'b'.repeat(32)]),e=>e.code==='23505');
 });
 await t.test('advisor blocks wrong company, unprivileged/revoked actors and inactive/NULL company',async()=>{
  const c=await fixture();
  for(const args of[[sales,company],[admin,other]])await assert.rejects(query('crm_care_advisor_begin',[...args,c.key,c.thread,c.version]),e=>e.code==='42501');
  for(const active of[false,null]){
   await db.query('UPDATE companies SET is_active=$1 WHERE id=$2',[active,company]);
   try{await assert.rejects(begin(c),e=>e.code==='42501');}finally{await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);}
  }
  const r=await begin(c);await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{await assert.rejects(finish(c,r),e=>e.code==='42501');await assert.rejects(read(c),e=>e.code==='42501');}
  finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
  await close(c);
 });
 await t.test('advisor capability and SQL selection validation cannot be bypassed by a service caller',async()=>{
  const c=await fixture(),r=await begin(c),good=selection(r);
  await assert.rejects(query('crm_care_advisor_finish',[admin,company,c.key,randomUUID(),good]),e=>e.code==='42501');
  for(const bad of[{...good,text:'Made-up price'},{...good,entryId:randomUUID()},{...good,action:'SEND'},
   {...good,needs:[{...good.needs[0],quote:'invented claim'}]},{...good,needs:[good.needs[0],good.needs[0]]},
   {...good,needs:[{...good.needs[0],messageId:randomUUID()}]},{action:'HANDOFF',entryId:entry,needs:[]},
   {failure:'MODEL_UNAVAILABLE',secret:'extra'}])await assert.rejects(finish(c,r,bad),e=>e.code==='22023');
  assert.equal((await finish(c,r)).state,'DRAFT');
 });
 await t.test('advisor inbound STOP, human request and takeover all prevent generation',async()=>{
  for(const action of['OPT_OUT','TAKEOVER','REQUEST_HUMAN']){
   const c=await fixture();
   if(action==='REQUEST_HUMAN')await c.receive([c.incoming('Tôi muốn gặp nhân viên')]);
   else await query('crm_care_control',[admin,company,randomUUID(),{threadId:c.thread,expectedVersion:c.version,action,reason:'Synthetic customer control before AI draft generation'}]);
   // Explicit signed intent wording is tested separately by ingress; ensure this fixture exercises mode.
   if(action==='REQUEST_HUMAN')await db.query("UPDATE crm_care_threads SET mode='HUMAN_REQUESTED',revision=revision+1 WHERE id=$1",[c.thread]);
   c.version=(await query('crm_care_read',[admin,company,c.thread])).version;
   await assert.rejects(begin(c),e=>e.code==='42501');
  }
 });
 await t.test('advisor takeover/opt-out during inference invalidates draft without changing the chosen human state',async()=>{
  for(const action of['TAKEOVER','OPT_OUT']){
   const c=await fixture(),r=await begin(c);
   await query('crm_care_control',[admin,company,randomUUID(),{threadId:c.thread,expectedVersion:c.version,action,reason:'Synthetic customer control while advisor inference runs'}]);
   const done=await finish(c,r);assert.equal(done.state,'REVIEW');assert.equal(done.stale,true);assert.equal(done.result,null);
   assert.equal((await query('crm_care_read',[admin,company,c.thread])).mode,action==='TAKEOVER'?'HUMAN_ACTIVE':'OPTED_OUT');
  }
 });
 await t.test('advisor incoming message or reassigned recipient invalidates the in-flight context',async()=>{
  for(const mode of['message','recipient']){
   const c=await fixture(),r=await begin(c);
   if(mode==='message')await c.receive([c.incoming('Nhu cầu của tôi đã thay đổi')]);
   else await db.query('UPDATE crm_leads SET assigned_to=$1 WHERE id=$2',[admin,c.lead]);
   const done=await finish(c,r);assert.equal(done.state,'REVIEW');assert.equal(done.result,null);
  }
 });
 await t.test('advisor source product mutation invalidates inference and old draft views',async()=>{
  const c=await fixture(),r=await begin(c);await finish(c,r);
  const d=await fixture(),s=await begin(d);
  await db.query('UPDATE products SET updated_at=clock_timestamp() WHERE id=$1',[product]);
  assert.equal((await read(c)).result,null);assert.equal((await read(c)).stale,true);
  assert.equal((await finish(d,s)).state,'REVIEW');await approve();
 });
 await t.test('advisor revoked library approval cannot be used for a result or replay',async()=>{
  const c=await fixture(),r=await begin(c);
  const e=await query('crm_care_library_read',[admin,company,entry]);
  await change({entryId:entry,action:'REVOKE',expectedVersion:e.version,reason:'Synthetic source revocation while inference is in flight'});
  const x=await finish(c,r);assert.equal(x.state,'REVIEW');assert.equal(x.result,null);await approve();
 });
 await t.test('advisor model failure is durable and exact finish replay never repeats inference',async()=>{
  const c=await fixture(),r=await begin(c),failure={failure:'MODEL_UNAVAILABLE'};
  assert.equal((await finish(c,r,failure)).state,'FAILED');assert.equal((await finish(c,r,failure)).replayed,true);
  await assert.rejects(finish(c,r),e=>e.code==='23505');
  assert.equal((await begin(c)).invoke,false);
 });
 await t.test('advisor timeout and lost capability stay reconcilable, close preserves evidence and rejects late inference',async()=>{
  const c=await fixture(),r=await begin(c);await db.query("UPDATE crm_care_control.advisor_runs SET expires_at=clock_timestamp()-interval '1 second' WHERE request_id=$1",[c.key]);
  let v=await read(c);assert.equal(v.state,'RUNNING');assert.equal(v.needsReconciliation,true);
  assert.equal((await begin(c)).invoke,false);v=await close(c);assert.equal(v.state,'REVIEW');assert.equal(v.result.reason,'OPERATOR_CLOSED');
  await assert.rejects(finish(c,r),e=>e.code==='23505');
  await assert.rejects(begin(c,randomUUID()),e=>e.code==='23505');
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].n,1);
 });
 await t.test('advisor expired inference records review, not a ready answer',async()=>{
  const c=await fixture(),r=await begin(c);await db.query("UPDATE crm_care_control.advisor_runs SET expires_at=clock_timestamp()-interval '1 second' WHERE request_id=$1",[c.key]);
  const x=await finish(c,r);assert.equal(x.state,'REVIEW');assert.equal(x.result.reason,'EXPIRED');assert.equal(x.result.text,null);
 });
 await t.test('advisor truncated conversation cannot silently become a complete model context',async()=>{
  const c=await fixture();for(let i=0;i<50;i++)await c.receive([c.incoming('Synthetic additional history '+i)]);
  c.version=(await query('crm_care_read',[admin,company,c.thread])).version;await assert.rejects(begin(c),e=>e.code==='42501');
 });
 await t.test('advisor moved Page records terminal review without returning old conversation data',async()=>{
  const c=await fixture(),r=await begin(c);
  await db.query('UPDATE facebook_pages SET default_company_id=$1 WHERE page_id=$2',[other,c.page]);
  try{
   const x=await finish(c,r);assert.equal(x.state,'REVIEW');assert.equal(x.result,null);
   assert.equal((await db.query('SELECT state FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].state,'REVIEW');
   await assert.rejects(read(c),e=>e.code==='42501');
  }finally{await db.query('UPDATE facebook_pages SET default_company_id=$1 WHERE page_id=$2',[company,c.page]);}
 });
 await t.test('advisor explicit retry recovers a known failure, fences branches and caps the full chain',async()=>{
  const c=await fixture(),r=await begin(c),reason='Operator verified the interrupted synthetic attempt before an explicit retry';
  const retry=(parent,key=randomUUID(),client=peers[0])=>query('crm_care_advisor_retry',[admin,company,key,parent,c.version,reason],client);
  await assert.rejects(retry(c.key),e=>e.code==='42501');
  await finish(c,r,{failure:'MODEL_UNAVAILABLE'});
  const secondKey=randomUUID(),second=await retry(c.key,secondKey);
  assert.equal(second.invoke,true);assert.equal((await retry(c.key,secondKey)).invoke,false);
  await query('crm_care_advisor_finish',[admin,company,secondKey,second.capability,{failure:'MODEL_UNAVAILABLE'}]);
  await assert.rejects(retry(c.key),e=>e.code==='23505');
  const thirdKey=randomUUID(),third=await retry(secondKey,thirdKey);
  await query('crm_care_advisor_finish',[admin,company,thirdKey,third.capability,{failure:'MODEL_UNAVAILABLE'}]);
  await assert.rejects(retry(thirdKey),e=>e.code==='42501');
  assert.deepEqual((await db.query('SELECT attempt FROM crm_care_control.advisor_runs WHERE thread_id=$1 ORDER BY attempt',[c.thread])).rows.map(x=>x.attempt),[1,2,3]);
 });
 await t.test('advisor closed unknown permits explicit retry but late old result remains fenced',async()=>{
  const c=await fixture(),old=await begin(c);await close(c);
  const key=randomUUID(),reason='Operator explicitly authorizes one retry after closing uncertain local work';
  const r=await query('crm_care_advisor_retry',[admin,company,key,c.key,c.version,reason]);
  await assert.rejects(finish(c,old),e=>e.code==='23505');
  assert.equal((await query('crm_care_advisor_finish',[admin,company,key,r.capability,selection(r)])).state,'DRAFT');
 });
 await t.test('advisor HANDOFF without an operator close reason cannot authorize another model attempt',async()=>{
  const c=await fixture(),r=await begin(c);
  assert.equal((await finish(c,r,{action:'HANDOFF',entryId:null,needs:[]})).state,'REVIEW');
  await assert.rejects(query('crm_care_advisor_retry',[admin,company,randomUUID(),c.key,c.version,'Do not infer retry permission from a missing reason field']),e=>e.code==='42501');
 });
 await t.test('advisor begin/finish roll back atomically with their evidence',async()=>{
  const c=await fixture();await peers[0].query('BEGIN');await begin(c);await peers[0].query('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].n,0);
  const r=await begin(c);await peers[0].query('BEGIN');await finish(c,r);await peers[0].query('ROLLBACK');
  assert.equal((await read(c)).state,'RUNNING');assert.equal((await finish(c,r)).state,'DRAFT');
 });
 await t.test('advisor commit waits for thread controls and observes committed opt-out',async()=>{
  const c=await fixture(),r=await begin(c);
  await db.query('BEGIN');await db.query("UPDATE crm_care_threads SET mode='OPTED_OUT',revision=revision+1 WHERE id=$1",[c.thread]);
  const pending=finish(c,r);await db.query('COMMIT');
  const x=await pending;assert.equal(x.state,'REVIEW');assert.equal(x.result,null);
 });
 await t.test('advisor unsupported transaction isolation fails before granting inference',async()=>{
  const c=await fixture();await peers[0].query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try{await assert.rejects(begin(c),e=>e.code==='0A000');}finally{await peers[0].query('ROLLBACK');}
 });
};
