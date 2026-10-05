'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
const moduleState=import('../../frontend/src/components/facebook/careRuntimeState.mjs');
const company=id(),actor=id(),thread=id(),request=id(),principal=id(),grant=id(),stamp='2026-10-04T03:00:00Z';
const item=()=>({request_id:request,thread_id:thread,principal_id:principal,grant_id:grant,created_at:stamp,state:'DRAFT',scope_available:true,needs_reconciliation:false});
const list=()=>({companyId:company,items:[item()],nextAfter:null,send:false});
const turn=()=>({companyId:company,threadId:thread,requestId:request,principalId:principal,grantId:grant,workerId:id(),principalKind:'AGENT',authorityCurrent:true,
 state:'DRAFT',stale:false,expired:false,needsReconciliation:false,attempt:1,retryOf:null,createdAt:stamp,completedAt:stamp,send:false,aiMaySend:false,
 result:{action:'ANSWER',entryId:id(),entryVersion:'a'.repeat(32),purpose:'ADVICE',text:'Câu tư vấn có nguồn',sourceReference:'Thư viện giả',needs:[],needsVerified:false,requiresReview:true,send:false},
 runtimeResult:{companyId:company,threadId:thread,requestId:request,principalId:principal,grantId:grant,state:'DRAFT',handoff:false,humanDeadline:null,stale:false,send:false,replayed:false,survey:null},delivery:null});
const delivery=()=>({attemptId:id(),state:'UNCERTAIN',reason:'NETWORK_UNKNOWN',acknowledged:false,echoObserved:false,startedAt:stamp,sendBefore:stamp});
const pending=()=>({actorId:actor,companyId:company,threadId:thread,body:{companyId:company,requestId:id(),runtimeRequestId:request,reason:'Đóng lượt đang chờ để đối soát trong dữ liệu giả'}});
function storage(){const map=new Map();return{getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
test('runtime UI list checks scope, cursor, duplicate requests and unknown-as-zero',async()=>{
 const m=await moduleState;assert.equal(m.runtimeList(list(),company).items.length,1);
 for(const bad of[{...list(),companyId:id()},{...list(),items:null},{...list(),items:[item(),item()]},{...list(),nextAfter:id()},
  {...list(),items:[{...item(),needs_reconciliation:true}]},{...list(),items:[{...item(),scope_available:undefined}]},{...list(),send:true}])assert.throws(()=>m.runtimeList(bad,company));
 assert.equal(m.runtimeList({...list(),items:[{...item(),scope_available:false}],nextAfter:request},company).nextAfter,request);
});
test('runtime detail binds request/thread/company/principal/grant to selected row',async()=>{
 const m=await moduleState,t=turn();assert.equal(m.runtimeTurn(t,company,item()).result.text,t.result.text);
 for(const k of['companyId','threadId','requestId','principalId','grantId'])assert.throws(()=>m.runtimeTurn({...t,[k]:id()},company,item()));
 for(const k of['companyId','threadId','requestId','principalId','grantId'])assert.throws(()=>m.runtimeTurn({...t,runtimeResult:{...t.runtimeResult,[k]:id()}},company,item()));
 assert.throws(()=>m.runtimeTurn({...t,runtimeResult:{...t.runtimeResult,send:true}},company,item()));
});
test('revoked or stale runtime hides text but preserves independently recorded delivery',async()=>{
 const m=await moduleState,t=turn();
 for(const mask of[{stale:true},{authorityCurrent:false}]){
  assert.throws(()=>m.runtimeTurn({...t,...mask},company,item()));
  const x=m.runtimeTurn({...t,...mask,result:null,delivery:delivery()},company,item());assert.equal(x.delivery.state,'UNCERTAIN');assert.equal(x.result,null);
 }
});
test('AI survey proposal remains unreserved and requires customer confirmation',async()=>{
 const m=await moduleState,t=turn();t.result={...t.result,action:'SURVEY',entryId:null,text:null,needs:[{field:'location',messageId:id(),quote:'Địa điểm giả trên đường thử'},{field:'request',messageId:id(),quote:'Tôi muốn khảo sát'}]};
 t.runtimeResult.survey={proposalId:id(),reservationMade:false,customerConfirmationRequired:true};m.runtimeTurn(t,company,item());
 for(const v of[{reservationMade:true},{customerConfirmationRequired:false},{proposalId:'bad'}])assert.throws(()=>m.runtimeTurn({...t,runtimeResult:{...t.runtimeResult,survey:{...t.runtimeResult.survey,...v}}},company,item()));
 assert.throws(()=>m.runtimeTurn({...t,result:{...t.result,needs:[t.result.needs[0]]}},company,item()));
 assert.throws(()=>m.runtimeTurn({...t,result:{...t.result,text:'Tự nhận đã chốt lịch'}},company,item()));
});
test('survey exception and operator close are historical results, never booking receipts',async()=>{
 const m=await moduleState,t=turn();
 const held={...t,stale:true,result:null,runtimeResult:{...t.runtimeResult,handoff:true,humanDeadline:stamp,survey:{reason:'SURVEY_NO_CONFIRMED_OPTION',reservationMade:false}}};m.runtimeTurn(held,company,item());
 assert.throws(()=>m.runtimeTurn({...held,runtimeResult:{...held.runtimeResult,handoff:false}},company,item()));
 const closed={...t,state:'REVIEW',result:{reason:'OPERATOR_CLOSED',text:null,send:false},runtimeResult:{...t.runtimeResult,state:'REVIEW',operatorClosed:true}};m.runtimeTurn(closed,company,item());
 assert.throws(()=>m.runtimeTurn({...closed,state:'DRAFT'},company,item()));
});
test('runtime running has no terminal result and cannot be mistaken for completed inference',async()=>{
 const m=await moduleState,t={...turn(),state:'RUNNING',result:null,runtimeResult:null,expired:true,needsReconciliation:true};m.runtimeTurn(t,company,item());
 assert.throws(()=>m.runtimeTurn({...t,runtimeResult:turn().runtimeResult},company,item()));
 assert.throws(()=>m.runtimeTurn({...t,needsReconciliation:false},company,item()));
 assert.throws(()=>m.runtimeTurn({...turn(),runtimeResult:null},company,item()));
});
test('runtime delivery shows ACK and echo separately, validates rather than inventing receipt',async()=>{
 const m=await moduleState,t=turn();
 for(const d of[delivery(),{...delivery(),state:'SENT',acknowledged:true},{...delivery(),state:'CONFLICT',echoObserved:true}])assert.deepEqual(m.runtimeTurn({...t,delivery:d},company,item()).delivery,d);
 for(const change of[{state:'READ_BY_CUSTOMER'},{acknowledged:undefined},{echoObserved:'yes'},{attemptId:'bad'},{sendBefore:'not a date'}])assert.throws(()=>m.runtimeTurn({...t,delivery:{...delivery(),...change}},company,item()));
});
test('pending close survives reload, stays separate across actor/company, and cannot be overwritten',async()=>{
 const m=await moduleState,s=storage(),p=pending();m.saveRuntimePending(s,p);assert.deepEqual(m.readRuntimePending(s,actor,company),p);
 assert.equal(m.readRuntimePending(s,id(),company),null);assert.equal(m.readRuntimePending(s,actor,id()),null);
 assert.throws(()=>m.saveRuntimePending(s,pending()));assert.throws(()=>m.clearRuntimePending(s,pending()));
 m.saveRuntimePending(s,p);assert.deepEqual(m.readRuntimePending(s,actor,company).body,p.body);
});
test('unconfirmed write or damaged pending storage blocks additional close requests',async()=>{
 const m=await moduleState,p=pending(),s=storage();m.saveRuntimePending(s,p);s.setItem([...s.map.keys()][0],'{bad');assert.throws(()=>m.readRuntimePending(s,actor,company));
 for(const bad of[{getItem:()=>null,setItem:()=>{}},{getItem:()=>null,setItem:()=>{throw Error('denied');}}])assert.throws(()=>m.saveRuntimePending(bad,p));
 for(const b of[{...p.body,reason:'short'},{...p.body,companyId:id()},{...p.body,requestId:request},{...p.body,send:true}])assert.throws(()=>m.saveRuntimePending(storage(),{...p,body:b}));
});
test('only matching close acknowledgement settles pending intent; reads cannot settle it',async()=>{
 const m=await moduleState,s=storage(),p=pending(),ack={companyId:company,threadId:thread,requestId:p.body.requestId,runtimeRequestId:request,outcome:'CLOSED',replayed:false,send:false};m.saveRuntimePending(s,p);
 m.runtimeTurn(turn(),company,item());assert.deepEqual(m.readRuntimePending(s,actor,company),p);
 for(const change of[{companyId:id()},{threadId:id()},{requestId:id()},{runtimeRequestId:id()},{send:true},{outcome:'CANCELLED_PROVIDER'}])assert.throws(()=>m.runtimeCloseAck({...ack,...change},p));
 for(const outcome of['CLOSED','ALREADY_TERMINAL'])m.runtimeCloseAck({...ack,outcome,replayed:true},p);
 m.clearRuntimePending(s,p);assert.equal(m.readRuntimePending(s,actor,company),null);
});
