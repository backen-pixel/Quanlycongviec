'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
const {createCareInferenceCosts}=require('../src/modules/marketingAutomation/careInferenceCosts');
const state=import('../../frontend/src/components/facebook/careInferenceCostState.mjs');
const company=id(),actor=id(),policyId=id(),principal=id(),request=id(),at='2026-10-04T00:00:00Z';
const summary=()=>({policyCount:1,attempts:3,reservedVnd:6000,pendingReceipts:1,unknownReceipts:1,usageReceipts:1,notSentReceipts:0,inputTokens:100,outputTokens:50,totalTokens:150});
const policy=()=>({policyId,principalId:principal,provider:'OPENAI_RESPONSES',model:'synthetic-snapshot',active:false,startsAt:at,expiresAt:'2026-10-05T00:00:00Z',maxCalls:10,allowanceVnd:20000,...summary()});
const overview=()=>({companyId:company,policyId:null,asOf:at,scope:'RECORDED_CARE_POLICIES',costBasis:'RESERVED_ALLOWANCE_NOT_PROVIDER_INVOICE',actualCostVnd:null,send:false,canReconcile:false,unresolvedOnly:false,summary:summary(),policy:null,policies:[policy()],receipts:null,nextAfter:null});
const detail=()=>({...overview(),policyId,policy:policy(),policies:null,receipts:[{requestId:request,policyId,principalId:principal,state:'UNKNOWN',authorizedAt:at,dispatchBefore:at,completedAt:at,reservedVnd:2000,reason:'TRANSPORT_UNKNOWN',usage:null}]});
function fixture(options={}){
 const calls=[],env={VPT_CARE_COST_ADMIN:'1',...options.env};let primary=true;
 const service=createCareInferenceCosts({env,isPrimary:()=>primary,db:{rpc:async(name,args)=>{calls.push({name,args});if(options.primaryLoss)primary=false;return options.result||{data:overview()};}}});
 const run=async(query={companyId:company},user={id:actor})=>{const res={code:200,set(k,v){this.header=[k,v];},status(n){this.code=n;return this;},json(body){this.body=body;}};await service({query,user},res);return res;};return{run,calls};
}
test('cost reader disabled by default and before any database read',async()=>{const f=fixture({env:{VPT_CARE_COST_ADMIN:undefined}});assert.equal((await f.run()).code,503);assert.equal(f.calls.length,0);});
test('cost reader uses authenticated actor and exact query scope without client permission fields',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.code,200);assert.deepEqual(r.header,['Cache-Control','no-store']);assert.deepEqual(f.calls[0],{name:'crm_care_inference_costs',args:{p_actor:actor,p_company:company,p_policy:null,p_after:null,p_unresolved:false}});
 for(const q of[{companyId:company,actorId:id()},{companyId:company,policyId:''},{companyId:company,after:null},{}])assert.equal((await f.run(q)).code,400);
 assert.equal((await f.run({companyId:company},{id:actor,userId:id()})).code,403);assert.equal(f.calls.length,1);
});
test('wrong returned scope, priced tokens, write permission or Primary loss cannot publish a cost report',async()=>{
 for(const data of[{...overview(),companyId:id()},{...overview(),policyId:id()},{...overview(),actualCostVnd:0},{...overview(),canReconcile:true},{...overview(),send:true}])assert.equal((await fixture({result:{data}}).run()).code,503);
 assert.equal((await fixture({primaryLoss:true}).run()).code,503);
 assert.equal((await fixture({result:{error:{code:'42501',message:'SECRET'}}}).run()).code,403);
});
test('overview retains unknown actual spend and keeps incomplete token coverage explicit',async()=>{
 const m=await state,r=m.inferenceCosts(overview(),company);assert.equal(r.actualCostVnd,null);assert.equal(r.summary.unknownReceipts,1);assert.equal(r.summary.totalTokens,150);
 for(const bad of[{...overview(),actualCostVnd:6000},{...overview(),companyId:id()},{...overview(),canReconcile:true},{...overview(),summary:{...summary(),attempts:2}},
  {...overview(),summary:{...summary(),totalTokens:0}},{...overview(),summary:{...summary(),reservedVnd:NaN}},{...overview(),policies:[policy(),policy()]},{...overview(),nextAfter:id()}])assert.throws(()=>m.inferenceCosts(bad,company));
});
test('policy detail rejects foreign receipt, mismatched totals or invented zero token usage',async()=>{
 const m=await state,r=detail();m.inferenceCosts(r,company,policyId);
 for(const change of[{policyId:id()},{principalId:id()},{state:'INVOICE_PAID'},{state:'UNKNOWN',usage:{inputTokens:0,outputTokens:0,totalTokens:0}},{reason:'NO_FEE'}])
  assert.throws(()=>m.inferenceCosts({...r,receipts:[{...r.receipts[0],...change}]},company,policyId));
 assert.throws(()=>m.inferenceCosts({...r,policy:{...policy(),attempts:0}},company,policyId));
});
test('receipt states preserve not-sent reservation and distinguish known usage from provider costs',async()=>{
 const m=await state,r=detail(),base=r.receipts[0];
 for(const x of[{...base,state:'AUTHORIZED',reason:null,completedAt:null},{...base,state:'NOT_SENT',reason:'DISABLED'},
  {...base,state:'USAGE_RECORDED',reason:null,usage:{model:policy().model,inputTokens:20,outputTokens:10,totalTokens:30}}])assert.equal(m.inferenceCosts({...r,receipts:[x]},company,policyId).receipts[0].reservedVnd,2000);
});
test('server queue filter cannot publish completed receipts as unresolved',async()=>{const m=await state,r={...detail(),unresolvedOnly:true};m.inferenceCosts(r,company,policyId,true);assert.throws(()=>m.inferenceCosts(r,company,policyId,false));assert.throws(()=>m.inferenceCosts({...r,receipts:[{...r.receipts[0],state:'NOT_SENT',reason:'ABORTED'}]},company,policyId,true));});
test('pagination cannot duplicate or reverse IDs or falsely publish a foreign cursor',async()=>{
 const m=await state,r=detail(),ids=[id(),id()].sort(),items=ids.map(requestId=>({...r.receipts[0],requestId}));
 m.inferenceCosts({...r,receipts:items,nextAfter:ids[1]},company,policyId);
 for(const receipts of[[items[0],items[0]],[items[1],items[0]]])assert.throws(()=>m.inferenceCosts({...r,receipts},company,policyId));
 assert.throws(()=>m.inferenceCosts({...r,receipts:items,nextAfter:ids[0]},company,policyId));
});
