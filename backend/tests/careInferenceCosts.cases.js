'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createCareInferenceCosts}=require('../src/modules/marketingAutomation/careInferenceCosts');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,enroll,begin,claim,usage,lockWait})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/696_crm_care_inference_cost_console.sql'),'utf8');await db.query(sql);await db.query(sql);
 const view=(policy=null,after=null,actor=admin,cid=company,unresolved=false)=>query('crm_care_inference_costs',[actor,cid,policy,after,unresolved]);
 const make=async()=>{const c=await fixture(),g=await enroll(c),r=await begin(c,g),permit=await claim(c,g,r);return{c,g,permit};};
 const record=(f,state,reason)=>query('crm_care_inference_record',[f.c.key,f.permit.capability,{state,reason}]);
 const validate=async(data,p=null,unresolved=false)=>(await import('../../frontend/src/components/facebook/careInferenceCostState.mjs')).inferenceCosts(data,company,p,unresolved);
 await t.test('cost console is service-only and denies wrong actor/company/policy/cursor without disclosure',async()=>{
  for(const role of['anon','authenticated']){await db.query('SET ROLE '+role);try{await assert.rejects(query('crm_care_inference_costs',[admin,company,null,null],db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
  const f=await make();await assert.rejects(view(null,null,sales),e=>e.code==='42501');await assert.rejects(view(f.g.policy,null,admin,other),e=>e.code==='42501');
  await assert.rejects(view(randomUUID()),e=>e.code==='42501');await assert.rejects(view(null,randomUUID()),e=>e.code==='42501');await assert.rejects(view(f.g.policy,randomUUID()),e=>e.code==='42501');
  const r=await view(f.g.policy);await validate(r,f.g.policy);const wire=JSON.stringify(r);
  for(const hidden of['capability','credential_sha256','policy_snapshot','payload_sha256','approval_reference','synthetic-runtime-key-only',f.permit.capability])assert.equal(wire.includes(hidden),false);
 });
 await t.test('authorized and UNKNOWN receipts retain reserved money and actual cost remains unknown',async()=>{
  const f=await make();let r=await view(f.g.policy);assert.equal(r.summary.attempts,1);assert.equal(r.summary.pendingReceipts,1);assert.equal(r.summary.reservedVnd,2000);assert.equal(r.actualCostVnd,null);
  await record(f,'UNKNOWN','TRANSPORT_UNKNOWN');r=await view(f.g.policy);await validate(r,f.g.policy);assert.equal(r.summary.pendingReceipts,0);assert.equal(r.summary.unknownReceipts,1);assert.equal(r.summary.usageReceipts,0);assert.equal(r.summary.totalTokens,0);assert.equal(r.actualCostVnd,null);
  assert.equal((await db.query('SELECT state FROM crm_care_control.inference_receipts WHERE request_id=$1',[f.c.key])).rows[0].state,'UNKNOWN');
 });
 await t.test('recorded usage, not-sent and inactive policy remain visible without invoice pricing or refunds',async()=>{
  const known=await make();await usage(known.c,known.permit);await db.query('UPDATE crm_care_control.inference_policies SET active=false WHERE id=$1',[known.g.policy]);
  let r=await view(known.g.policy);await validate(r,known.g.policy);assert.equal(r.policy.active,false);assert.equal(r.summary.usageReceipts,1);assert.equal(r.summary.totalTokens,20);assert.equal(r.actualCostVnd,null);assert.equal(JSON.stringify(r).includes('resp_runtime_test'),false);
  const noSend=await make();await record(noSend,'NOT_SENT','DISABLED');r=await view(noSend.g.policy);await validate(r,noSend.g.policy);assert.equal(r.summary.notSentReceipts,1);assert.equal(r.summary.reservedVnd,2000);assert.equal(r.actualCostVnd,null);
 });
 await t.test('policy pagination includes all registered policies, even unused or disabled, without duplicate records',async()=>{
  const sample=await make();
  for(let n=0;n<23;n++)await db.query('INSERT INTO crm_care_control.inference_policies SELECT $1,company_id,actor_id,provider,model,credential_sha256,approval_reference,starts_at,expires_at,false,max_calls,max_input_bytes,max_output_tokens,reserve_per_call_vnd,allowance_vnd FROM crm_care_control.inference_policies WHERE id=$2',[randomUUID(),sample.g.policy]);
  const ids=[];let cursor=null,expected=(await db.query('SELECT count(*)::int n FROM crm_care_control.inference_policies WHERE company_id=$1',[company])).rows[0].n;
  do{const r=await view(null,cursor);await validate(r);assert.equal(r.summary.policyCount,expected);ids.push(...r.policies.map(x=>x.policyId));cursor=r.nextAfter;}while(cursor);
  assert.equal(ids.length,expected);assert.equal(new Set(ids).size,expected);
 });
 await t.test('receipt pagination uses complete totals and never borrows a cursor from another policy',async()=>{
  const f=await make();await usage(f.c,f.permit);
  // Populate committed receipts through the same private test owner, preserving
  // foreign keys and exact binding; no platform or model is invoked in fixtures.
  for(let n=0;n<23;n++){
   const request=randomUUID();await db.query('INSERT INTO crm_care_control.advisor_runs SELECT (jsonb_populate_record(NULL::crm_care_control.advisor_runs,to_jsonb(x)||jsonb_build_object(\'request_id\',$1::text,\'state\',\'REVIEW\',\'context_hash\',md5($1::text)))).* FROM crm_care_control.advisor_runs x WHERE request_id=$2',[request,f.c.key]);
   await db.query('INSERT INTO crm_care_control.inference_receipts SELECT (jsonb_populate_record(NULL::crm_care_control.inference_receipts,to_jsonb(x)||jsonb_build_object(\'request_id\',$1::text))).* FROM crm_care_control.inference_receipts x WHERE request_id=$2',[request,f.c.key]);
  }
  const target=(await db.query('SELECT request_id FROM crm_care_control.inference_receipts WHERE policy_id=$1 ORDER BY request_id DESC LIMIT 1',[f.g.policy])).rows[0].request_id;
  await db.query("UPDATE crm_care_control.inference_receipts SET state='UNKNOWN',receipt=$2::jsonb WHERE request_id=$1",[target,JSON.stringify({state:'UNKNOWN',reason:'TRANSPORT_UNKNOWN'})]);
  const queue=await view(f.g.policy,null,admin,company,true);await validate(queue,f.g.policy,true);assert.equal(queue.receipts.length,1);assert.equal(queue.receipts[0].requestId,target);assert.equal(queue.summary.attempts,24);
  const first=await view(f.g.policy);await validate(first,f.g.policy);assert.equal(first.receipts.length,20);assert.equal(first.summary.attempts,24);assert.equal(first.summary.reservedVnd,48000);
  const second=await view(f.g.policy,first.nextAfter);await validate(second,f.g.policy);assert.equal(second.receipts.length,4);assert.equal(second.nextAfter,null);assert.equal(second.summary.totalTokens,460);
  assert.equal(new Set([...first.receipts,...second.receipts].map(x=>x.requestId)).size,24);
  const foreign=await make();await assert.rejects(view(f.g.policy,foreign.c.key),e=>e.code==='42501');
 });
 await t.test('cost reader fails closed on corrupt receipt company or actor binding instead of omitting spend',async()=>{
  const f=await make();for(const [column,value]of[['company_id',other],['actor_id',sales]]){
   await db.query('BEGIN');try{await db.query('UPDATE crm_care_control.inference_receipts SET '+column+'=$1 WHERE request_id=$2',[value,f.c.key]);
    await assert.rejects(query('crm_care_inference_costs',[admin,company,null,null],db),e=>e.code==='40001');}finally{await db.query('ROLLBACK');}
  }
 });
 await t.test('company revocation observed during a lock wait denies the cost reader',async()=>{
  const f=await make();await db.query('BEGIN');await db.query('UPDATE companies SET is_active=false WHERE id=$1',[company]);
  const pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const pending=query('crm_care_inference_costs',[admin,company,f.g.policy,null,false],peers[1]).then(value=>({value}),error=>({error}));
  try{await lockWait(pid);await db.query('COMMIT');assert.equal((await pending).error?.code,'42501');}
  finally{await db.query('ROLLBACK');await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);await pending;}
 });
 await t.test('uncommitted then committed usage produces matching totals and rows in each reader snapshot',async()=>{
  const f=await make();await peers[0].query('BEGIN');
  try{
   await query('crm_care_inference_record',[f.c.key,f.permit.capability,{state:'USAGE_RECORDED',responseId:'resp_cost_snapshot',model:f.permit.model,inputTokens:10,outputTokens:10,totalTokens:20}],peers[0]);
   const before=await query('crm_care_inference_costs',[admin,company,f.g.policy,null,false],peers[1]);await validate(before,f.g.policy);
   assert.equal(before.summary.pendingReceipts,1);assert.equal(before.summary.totalTokens,0);assert.equal(before.receipts[0].state,'AUTHORIZED');
   await peers[0].query('COMMIT');const after=await view(f.g.policy);await validate(after,f.g.policy);
   assert.equal(after.summary.pendingReceipts,0);assert.equal(after.summary.totalTokens,20);assert.equal(after.receipts[0].state,'USAGE_RECORDED');
  }finally{await peers[0].query('ROLLBACK');}
 });
 await t.test('actual cost API traverses authenticated SQL and retains UNKNOWN after runtime close',async()=>{
  const f=await make();await record(f,'UNKNOWN','USAGE_UNAVAILABLE');await query('crm_care_runtime_close',[admin,company,randomUUID(),f.c.key,'Synthetic close retains inference receipt for reconciliation']);
  const service=createCareInferenceCosts({env:{VPT_CARE_COST_ADMIN:'1'},isPrimary:()=>true,db:{rpc:async(name,args)=>{try{return{data:await query(name,Object.values(args))};}catch(error){return{error};}}}});
  const res={code:200,set(){},status(n){this.code=n;return this;},json(data){this.body=data;}};await service({user:{id:admin},query:{companyId:company,policyId:f.g.policy}},res);
  assert.equal(res.code,200);await validate(res.body,f.g.policy);assert.equal(res.body.summary.unknownReceipts,1);assert.equal(res.body.summary.reservedVnd,2000);assert.equal(res.body.canReconcile,false);
 });
};
