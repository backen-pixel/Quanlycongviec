'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {createCareOpenAiInference}=require('../src/modules/marketingAutomation/careOpenAiInference');
const {createCareAdvisor}=require('../src/modules/marketingAutomation/careAdvisor');
const sha=x=>createHash('sha256').update(x).digest('hex');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,begin})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/691_crm_care_inference_permits.sql'),'utf8');await db.query(sql);await db.query(sql);
 const credential='synthetic-key-for-isolated-tests',model='approved-snapshot-test';
 const policy=async(overrides={})=>{
  const g={id:randomUUID(),company_id:company,actor_id:admin,provider:'OPENAI_RESPONSES',model,credential_sha256:sha(credential),
   approval_reference:'Synthetic policy approved for isolated tests only',starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+86400000),
   active:true,max_calls:3,max_input_bytes:150000,max_output_tokens:512,reserve_per_call_vnd:2000,allowance_vnd:6000,...overrides};
  const columns=Object.keys(g);await db.query('INSERT INTO crm_care_control.inference_policies('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(g));return g;
 };
 const claim=(c,r,g,client=peers[0],overrides={})=>query('crm_care_inference_claim',Object.values({actor:admin,company,request:c.key,capability:r.capability,policy:g.id,credential:sha(credential),payload:sha('synthetic-bounded-input'),bytes:1000,...overrides}),client);
 const record=(c,p,receipt,client=peers[0])=>query('crm_care_inference_record',[c.key,p.capability,receipt],client);
 const usage=()=>({state:'USAGE_RECORDED',responseId:'resp_isolated',model,inputTokens:10,outputTokens:7,totalTokens:17});
 const allowance=(g,actor=admin,cid=company)=>query('crm_care_inference_allowance',[actor,cid,g.id]);
 const close=c=>query('crm_care_advisor_cancel',[admin,company,c.key,c.thread,'Synthetic cancellation preserves provider cost evidence']);
 const lockWait=async pid=>{for(let i=0;i<150;i++){await db.query('SELECT pg_stat_clear_snapshot()');
  if((await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock'",[pid])).rowCount)return;
  await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('expected observed policy lock wait');};

 await t.test('inference enrollment is empty and private; application roles cannot create their own allowance',async()=>{
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.inference_policies')).rows[0].n,0);
  for(const role of['anon','authenticated','service_role']){
   await db.query('SET ROLE '+role);try{
    await assert.rejects(db.query('SELECT * FROM crm_care_control.inference_receipts'),e=>e.code==='42501');
    await assert.rejects(db.query('UPDATE crm_care_control.inference_policies SET active=true'),e=>e.code==='42501');
    if(role!=='service_role')await assert.rejects(query('crm_care_inference_allowance',[admin,company,randomUUID()],db),e=>e.code==='42501');
   }finally{await db.query('RESET ROLE');}
  }
 });
 await t.test('real advisor API traverses SQL permit, fake Responses HTTP, usage receipt then domain draft',async()=>{
  const c=await fixture(),g=await policy(),calls=[],posts=[];
  const storage={rpc:async(name,args)=>{calls.push(name);try{return{data:await query(name,Object.values(args))};}catch(error){return{error};}}};
  const env={VPT_CARE_ADVISOR_ADMIN:'1',VPT_CARE_ADVISOR_DRAFTS:'1',VPT_CARE_ADVISOR_OPENAI:'1',VPT_CARE_ADVISOR_OPENAI_KEY:credential,VPT_CARE_ADVISOR_INFERENCE_POLICY:g.id};
  const infer=createCareOpenAiInference({db:storage,isPrimary:()=>true,env,fetchImpl:async(url,request)=>{
   posts.push(url);const b=JSON.parse(request.body),input=JSON.parse(b.input);
   for(const secret of[c.thread,c.psid,c.lead,admin,company])assert.equal(request.body.includes(secret),false);
   assert.equal(b.store,false);assert.equal(b.tools,undefined);assert.equal(b.model,g.model);
   const selected={action:'ANSWER',answer:input.answers[0].id,needs:[{field:'budget',message:input.messages.find(x=>x.text.includes('100 triệu')).id,quote:'100 triệu'}]};
   return new Response(JSON.stringify({id:'resp_isolated_service',model:g.model,status:'completed',error:null,incomplete_details:null,
    usage:{input_tokens:100,output_tokens:50,total_tokens:150},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(selected)}]}]}));
  }});
  const service=createCareAdvisor({db:storage,isPrimary:()=>true,env,infer}),res={code:200,set(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
  const req={user:{id:admin},body:{companyId:company,requestId:c.key,threadId:c.thread,version:c.version}};
  await service.handle(req,res,'generate');assert.equal(res.code,200);assert.equal(res.body.state,'DRAFT');assert.equal(res.body.send,false);
  assert.deepEqual(calls,['crm_care_advisor_begin','crm_care_inference_claim','crm_care_inference_record','crm_care_advisor_finish']);
  await service.handle(req,res,'generate');assert.equal(posts.length,1);
  const a=await allowance(g);assert.equal(a.attempts,1);assert.equal(a.usageReceipts,1);assert.equal(a.reservedVnd,2000);assert.equal(a.actualCostVnd,null);
 });
 await t.test('inference claim rejects foreign actor/company/key/capability and absent or expired grant',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy();
  for(const override of[{actor:sales},{company:other},{credential:sha('other')},{capability:randomUUID()},{policy:randomUUID()}])
   await assert.rejects(claim(c,r,g,peers[0],override),e=>e.code==='42501');
  for(const overrides of[{active:false},{starts_at:new Date(Date.now()+10000)},{starts_at:new Date(Date.now()-10000),expires_at:new Date(Date.now()-5000)}])
   await assert.rejects(claim(c,r,await policy(overrides)),e=>e.code==='42501');
  assert.equal((await allowance(g)).attempts,0);await close(c);
 });
 await t.test('provider consent and context are checked after BEGIN and before disclosure',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy();await close(c);
  await assert.rejects(claim(c,r,g),e=>e.code==='40001');assert.equal((await allowance(g)).attempts,0);
  const d=await fixture(),s=await begin(d);await d.receive([d.incoming('Khách vừa thay đổi nhu cầu')]);
  await assert.rejects(claim(d,s,g),e=>e.code==='40001');await close(d);
 });
 await t.test('one request grants inference only once and rejects changed input even before usage is settled',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy();const both=await Promise.all([claim(c,r,g),claim(c,r,g,peers[1])]);
  assert.equal(both.filter(x=>x.invoke).length,1);assert.equal(both.find(x=>!x.invoke).capability,undefined);
  await assert.rejects(claim(c,r,g,peers[0],{payload:sha('changed')}),e=>e.code==='23505');
  assert.equal((await allowance(g)).attempts,1);await record(c,both.find(x=>x.invoke),usage());await close(c);
 });
 await t.test('concurrent distinct threads cannot spend twice against one in-flight allowance',async()=>{
  const c=await fixture(),d=await fixture(),r=await begin(c),s=await begin(d),g=await policy();
  const rs=await Promise.allSettled([claim(c,r,g),claim(d,s,g,peers[1])]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(rs.find(x=>x.status==='rejected').reason.code,'40001');assert.equal((await allowance(g)).reservedVnd,2000);
  const n=rs.findIndex(x=>x.status==='fulfilled');await record(n?d:c,rs[n].value,usage());await close(c);await close(d);
 });
 await t.test('call count and monetary reservation ceilings survive completion and new requests',async()=>{
  for(const limits of[{max_calls:1,allowance_vnd:100000},{max_calls:100,allowance_vnd:2000}]){
   const c=await fixture(),r=await begin(c),g=await policy(limits),p=await claim(c,r,g);await record(c,p,usage());await close(c);
   const d=await fixture(),s=await begin(d);await assert.rejects(claim(d,s,g),e=>e.code==='42501');await close(d);
   assert.equal((await allowance(g)).reservedVnd,2000);
  }
 });
 await t.test('unknown usage stops future calls; close/retry cannot refund or clear the hold',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy(),p=await claim(c,r,g);
  await record(c,p,{state:'UNKNOWN',reason:'TRANSPORT_UNKNOWN'});await close(c);
  const d=await fixture(),s=await begin(d);await assert.rejects(claim(d,s,g),e=>e.code==='40001');await close(d);
  const a=await allowance(g);assert.equal(a.unresolved,1);assert.equal(a.reservedVnd,2000);assert.equal(a.actualCostVnd,null);
  await assert.rejects(record(c,p,usage()),e=>e.code==='23505');
 });
 await t.test('usage receipt persists after policy or actor revocation but cannot grant another call',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy(),p=await claim(c,r,g);
  await db.query('UPDATE crm_care_control.inference_policies SET active=false WHERE id=$1',[g.id]);
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{assert.equal((await record(c,p,usage())).state,'USAGE_RECORDED');assert.equal((await record(c,p,usage())).replayed,true);
   await assert.rejects(allowance(g),e=>e.code==='42501');}
  finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
  await assert.rejects(claim(c,r,g),e=>e.code==='42501');await close(c);
 });
 await t.test('wrong receipt capability, NULL, incorrect model or missing tokens cannot clear a reservation',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy(),p=await claim(c,r,g);
  await assert.rejects(record(c,{capability:randomUUID()},usage()),e=>e.code==='42501');
  for(const receipt of[null,{},{state:null},{...usage(),model:'changed'}, {...usage(),outputTokens:513,totalTokens:523},
   {...usage(),inputTokens:'10'},{...usage(),totalTokens:18},{state:'NOT_SENT',reason:'TRANSPORT_UNKNOWN'},
   {state:'UNKNOWN',reason:'DISABLED'},{...usage(),secret:'unrequested'}])
   await assert.rejects(record(c,p,receipt),e=>e.code==='22023');
  assert.equal((await allowance(g)).unresolved,1);
  const d=await fixture(),s=await begin(d);await assert.rejects(claim(d,s,g),e=>e.code==='40001');await close(d);
  await record(c,p,usage());await close(c);
 });
 await t.test('policy history cannot be silently edited to refill allowance or change approved model',async()=>{
  const g=await policy();await assert.rejects(db.query('UPDATE crm_care_control.inference_policies SET allowance_vnd=999999 WHERE id=$1',[g.id]),e=>e.code==='22023');
  await assert.rejects(db.query("UPDATE crm_care_control.inference_policies SET model='other' WHERE id=$1",[g.id]),e=>e.code==='22023');
  await db.query('UPDATE crm_care_control.inference_policies SET active=false WHERE id=$1',[g.id]);assert.equal((await allowance(g)).active,false);
 });
 await t.test('input bound, reader scope and rollback retain exact allowance accounting',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy({max_input_bytes:1000});
  await assert.rejects(claim(c,r,g,peers[0],{bytes:1001}),e=>e.code==='22023');
  await assert.rejects(allowance(g,sales),e=>e.code==='42501');await assert.rejects(allowance(g,admin,other),e=>e.code==='42501');
  await peers[0].query('BEGIN');await claim(c,r,g);await peers[0].query('ROLLBACK');assert.equal((await allowance(g)).attempts,0);
  const p=await claim(c,r,g);await record(c,p,{state:'NOT_SENT',reason:'ABORTED'});assert.equal((await allowance(g)).reservedVnd,2000);await close(c);
 });
 await t.test('claim truly waits for policy revocation and rejects it after commit',async()=>{
  const c=await fixture(),r=await begin(c),g=await policy();await db.query('BEGIN');
  await db.query('UPDATE crm_care_control.inference_policies SET active=false WHERE id=$1',[g.id]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const pending=assert.rejects(claim(c,r,g,peers[1]),e=>e.code==='42501');
  try{await lockWait(pid);await db.query('COMMIT');await pending;}finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
  assert.equal((await allowance(g)).attempts,0);await close(c);
 });
};
