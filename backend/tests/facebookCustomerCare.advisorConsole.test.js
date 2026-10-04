'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const state=import('../../frontend/src/components/facebook/careAdvisorState.mjs');
const actor=randomUUID(),company=randomUUID(),thread=randomUUID(),request=randomUUID(),version='a'.repeat(32);
const list=()=>({companyId:company,threadId:thread,version,careMode:'WAITING',routingReady:true,historyTruncated:false,threadBusy:false,generationAvailable:true,items:[],nextAfter:null,send:false,aiMaySend:false});
const draft=()=>({companyId:company,threadId:thread,requestId:request,state:'DRAFT',attempt:1,retryOf:null,stale:false,expired:false,needsReconciliation:false,
 result:{action:'ANSWER',entryId:randomUUID(),entryVersion:version,purpose:'ADVICE',text:'Nguồn đã duyệt <script>không chạy</script>',sourceReference:'Nguồn giả trong kiểm thử',needs:[],needsVerified:false,requiresReview:true,send:false},send:false,aiMaySend:false});
const pending=(operation='generate')=>({actorId:actor,companyId:company,threadId:thread,operation,body:operation==='generate'?{companyId:company,requestId:request,threadId:thread,version}:operation==='retry'?{companyId:company,requestId:request,previousRequestId:randomUUID(),version,reason:'Explicit reason for a synthetic retry request'}:{companyId:company,requestId:request,threadId:thread,reason:'Explicit reason for a synthetic cancellation'}});
function storage(){const data=new Map();return{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
test('advisor UI only generates with complete current readiness',async()=>{
 const m=await state;assert.equal(m.canGenerate(list()),true);
 for(const c of[{generationAvailable:false},{careMode:'OPTED_OUT'},{careMode:'HUMAN_ACTIVE'},{careMode:'HUMAN_REQUESTED'},{routingReady:false},{historyTruncated:true},{threadBusy:true}])assert.equal(m.canGenerate({...list(),...c}),false);
 assert.equal(m.canGenerate(null),false);
});
test('advisor UI list validates company/thread, item/cursor scope and unavailable states',async()=>{
 const m=await state;assert.equal(m.advisorList(list(),company,thread).items.length,0);
 const item={requestId:request,state:'RUNNING',attempt:1,retryOf:null,createdAt:'2026-10-04T00:00:00Z',needsReconciliation:true};
 assert.equal(m.advisorList({...list(),items:[item],nextAfter:request},company,thread).nextAfter,request);
 for(const bad of[{...list(),companyId:randomUUID()},{...list(),threadId:randomUUID()},{...list(),generationAvailable:undefined},{...list(),aiMaySend:true},
  {...list(),items:[item,item]},{...list(),items:[{...item,attempt:4}]},{...list(),items:[item],nextAfter:randomUUID()}])
  assert.throws(()=>m.advisorList(bad,company,thread));
});
test('advisor UI draft rejects wrong request, hidden stale text and fabricated successful results',async()=>{
 const m=await state,c=draft();assert.equal(m.advisorDraft(c,company,thread,request).result.text,c.result.text);
 for(const bad of[{...c,companyId:randomUUID()},{...c,threadId:randomUUID()},{...c,requestId:randomUUID()},{...c,stale:true},
  {...c,result:{...c.result,needsVerified:true}},{...c,result:{...c.result,requiresReview:false}},{...c,state:'RUNNING'},
  {...c,needsReconciliation:true},{...c,result:{...c.result,send:true}},{...c,result:{...c.result,entryVersion:'bad'}}])
  assert.throws(()=>m.advisorDraft(bad,company,thread,request));
});
test('advisor UI accepts minimal stale envelope without historical answer or timestamps',async()=>{
 const m=await state,c={...draft(),state:'REVIEW',stale:true,result:null};
 assert.equal(m.advisorDraft(c,company,thread,request).result,null);
 assert.equal(m.canRetry(c),false);
});
test('advisor UI distinguishes unknown running, failed inference and closed attempt',async()=>{
 const m=await state,c=draft();
 const running={...c,state:'RUNNING',expired:true,needsReconciliation:true,result:null};
 assert.equal(m.advisorDraft(running,company,thread,request).needsReconciliation,true);assert.equal(m.canRetry(running),false);
 for(const kind of['FAILED','REVIEW']){
  const x={...c,state:kind,result:{reason:kind==='FAILED'?'MODEL_UNAVAILABLE':'OPERATOR_CLOSED',text:null,send:false}};
  m.advisorDraft(x,company,thread,request);assert.equal(m.canRetry(x),true);
  assert.equal(m.canRetry({...x,attempt:3}),false);assert.equal(m.canRetry({...x,stale:true,result:null}),false);
 }
 assert.equal(m.canRetry({...c,state:'REVIEW',result:{action:'HANDOFF'}}),false);
});
test('advisor UI needs preserve source messages and remain explicitly unverified',async()=>{
 const m=await state,c=draft(),need={field:'budget',messageId:randomUUID(),quote:'100 triệu'};
 m.advisorDraft({...c,result:{...c.result,needs:[need]}},company,thread,request);
 for(const needs of[[need,need],[{...need,messageId:'bad'}],[{...need,field:'permission'}],[{...need,quote:''}]])
  assert.throws(()=>m.advisorDraft({...c,result:{...c.result,needs}},company,thread,request));
});
test('advisor pending survives reload and stays separate by actor/company/thread',async()=>{
 const m=await state,s=storage(),p=pending();m.saveAdvisorPending(s,p);
 assert.deepEqual(m.readAdvisorPending(s,actor,company,thread),p);
 for(const args of[[randomUUID(),company,thread],[actor,randomUUID(),thread],[actor,company,randomUUID()]])assert.equal(m.readAdvisorPending(s,...args),null);
});
test('advisor cannot overwrite unresolved work; only same-request cancellation can replace its intent',async()=>{
 const m=await state,s=storage(),p=pending(),cancel=pending('cancel');m.saveAdvisorPending(s,p);
 assert.throws(()=>m.saveAdvisorPending(s,pending('retry')));
 assert.throws(()=>m.saveAdvisorPending(s,{...cancel,body:{...cancel.body,requestId:randomUUID()}},p));
 m.saveAdvisorPending(s,cancel,p);assert.deepEqual(m.readAdvisorPending(s,actor,company,thread),cancel);
 assert.throws(()=>m.clearAdvisorPending(s,p));m.clearAdvisorPending(s,cancel);assert.equal(m.readAdvisorPending(s,actor,company,thread),null);
});
test('advisor corrupt/denied/unconfirmed browser storage blocks writes instead of discarding evidence',async()=>{
 const m=await state,s=storage(),p=pending();m.saveAdvisorPending(s,p);
 s.setItem([...s.data.keys()][0],'{broken');assert.throws(()=>m.readAdvisorPending(s,actor,company,thread));
 for(const bad of[{getItem:()=>null,setItem:()=>{throw Error('denied');}},{getItem:()=>null,setItem(){}}])assert.throws(()=>m.saveAdvisorPending(bad,p));
});
test('advisor cancellation acknowledgement must match the original pending request and scope',async()=>{
 const m=await state,p=pending('cancel'),good={companyId:company,threadId:thread,requestId:request,outcome:'ABSENT_CANCELLED',replayed:false,send:false};
 for(const outcome of['ABSENT_CANCELLED','CLOSED','ALREADY_TERMINAL'])assert.equal(m.cancellationAck({...good,outcome},p).outcome,outcome);
 for(const bad of[{...good,threadId:randomUUID()},{...good,requestId:randomUUID()},{...good,companyId:randomUUID()},{...good,outcome:'NEVER_RAN'},{...good,send:true}])assert.throws(()=>m.cancellationAck(bad,p));
});
