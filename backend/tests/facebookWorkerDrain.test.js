'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createWorkerDrain,createWorkerGroup}=require('../src/helpers/workerDrain');
const {createMessengerReceiptWorker}=require('../src/helpers/facebookMessengerReceipt');
const {createLeadIntake}=require('../src/modules/marketingAutomation/facebookLeadIntake');
const {createLeadCensus}=require('../src/modules/marketingAutomation/facebookLeadCensus');
const {createSurveyDispatch}=require('../src/modules/marketingAutomation/facebookSurveyDispatch');
const {createSurveyOutcomeDispatch}=require('../src/modules/marketingAutomation/facebookSurveyOutcomes');
const gate=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};

test('stop before scheduled work executes admits nothing and cannot be reversed',async()=>{
 let n=0;const w=createWorkerDrain(()=>{n++;});const scheduled=w.drain();assert.equal(w.stop().state,'STOPPING');await scheduled;await w.drain();
 assert.equal(n,0);assert.equal(w.status().state,'STOPPED');assert.equal(w.status().locallyDrained,true);assert.equal(w.status().businessReconciled,false);
});
test('overlap joins the same promise; stop waits for work and timeout never clears active work',async()=>{
 const entered=gate(),pending=gate();const w=createWorkerDrain(async()=>{entered.resolve();await pending.promise;});
 const first=w.drain();await entered.promise;assert.equal(w.drain(),first);w.stop();
 const timeout=await w.waitForIdle({timeoutMs:1});assert.equal(timeout.timedOut,true);assert.equal(timeout.locallyDrained,false);assert.equal(w.status().active,true);
 const completion=w.waitForIdle({timeoutMs:1000});pending.resolve();assert.equal((await completion).locallyDrained,true);assert.equal((await completion).timedOut,false);
});
test('failure is observable on drain but releases local work without asserting business reconciliation',async()=>{
 const entered=gate(),pending=gate();const w=createWorkerDrain(async()=>{entered.resolve();await pending.promise;});
 const run=w.drain();const rejection=assert.rejects(run,/synthetic/);await entered.promise;w.stop();const idle=w.waitForIdle({timeoutMs:1000});pending.reject(Error('synthetic'));await rejection;
 assert.equal((await idle).locallyDrained,true);assert.equal((await idle).businessReconciled,false);
});
test('wait is bounded and read-only; a group stops all members before awaiting any',async()=>{
 let n=0;const a=createWorkerDrain(()=>{n++;}),b=createWorkerDrain(()=>{n++;});
 for(const value of [-1,60001,NaN,1.2,'10'])await assert.rejects(a.waitForIdle({timeoutMs:value}),TypeError);
 assert.equal((await a.waitForIdle()).locallyDrained,false);assert.equal(n,0);
 const group=createWorkerGroup({a,b});group.stop();assert.equal(a.isStopped(),true);assert.equal(b.isStopped(),true);
 const r=await group.waitForIdle({timeoutMs:0});assert.equal(r.locallyDrained,true);assert.equal(r.processesDrained,false);await a.drain();assert.equal(n,0);
});

function messenger({claimGate,processGate,finishGate,claimError=false}={}){
 const calls=[],errors=[];let n=0,processed=0;const entered={claim:gate(),process:gate(),finish:gate()};
 const db={async rpc(name,args){calls.push({name,args});if(name==='facebook_claim_receipt_v1'){
  entered.claim.resolve();if(claimGate)await claimGate.promise;if(claimError)throw Error('private');return{data:n++?[]:[{id:'receipt',page_id:'123',payload:{}}]};}
  entered.finish.resolve();if(finishGate)await finishGate.promise;return{data:true};}};
 const w=createMessengerReceiptWorker({db,pageIds:new Set(['123']),onError:c=>errors.push(c),processEvent:async()=>{processed++;entered.process.resolve();if(processGate)await processGate.promise;}});
 return{w,calls,errors,entered,processed:()=>processed};
}
test('Messenger stop during claim never dispatches the event and returns only its own lease',async()=>{
 const block=gate(),h=messenger({claimGate:block}),run=h.w.drain();await h.entered.claim.promise;h.w.stop();block.resolve();await run;
 assert.equal(h.processed(),0);assert.deepEqual(h.calls.map(x=>x.name),['facebook_claim_receipt_v1','facebook_finish_receipt_v1']);
 assert.equal(h.calls[1].args.p_success,false);assert.equal(h.calls[1].args.p_token,h.calls[0].args.p_token);assert.equal(h.w.status().locallyDrained,true);
});
test('Messenger stop waits for started processing and result persistence; no next receipt is claimed',async()=>{
 const processing=gate(),finishing=gate(),h=messenger({processGate:processing,finishGate:finishing}),run=h.w.drain();await h.entered.process.promise;h.w.stop();
 assert.equal((await h.w.waitForIdle({timeoutMs:0})).timedOut,true);processing.resolve();await h.entered.finish.promise;
 assert.equal(h.w.status().active,true);assert.equal(h.calls[1].args.p_success,true);finishing.resolve();await run;
 assert.equal(h.calls.filter(x=>x.name==='facebook_claim_receipt_v1').length,1);assert.equal(h.w.status().locallyDrained,true);
});
test('Messenger lost claim response stays an error, not a fabricated completed receipt',async()=>{
 const block=gate(),h=messenger({claimGate:block,claimError:true}),run=h.w.drain();await h.entered.claim.promise;h.w.stop();block.resolve();await run;
 assert.equal(h.processed(),0);assert.equal(h.calls.length,1);assert.equal(h.errors.length,1);assert.ok(!JSON.stringify(h.errors).includes('private'));
});

for(const kind of ['intake','census']){
 const prefix=kind==='intake'?'marketing_fb_lead':'marketing_fb_census';
 function create({stopAt}={}){
  const block=gate(),entered=gate(),calls=[];let n=0;const db={async rpc(name,args){calls.push({name,args});
   if(name===prefix+'_claim'){if(stopAt==='claim'){entered.resolve();await block.promise;}return{data:n++?[]:[{id:'synthetic'}]};}
   if(name===prefix+'_context')return{data:{contextVersion:'v'}};
   if(stopAt==='commit'&&(name==='crm_accept_facebook_lead'||name===prefix+'_commit')){entered.resolve();await block.promise;}
   return{data:true};}};
  const readSource=async()=>{calls.push({name:'provider'});if(stopAt==='provider'){entered.resolve();await block.promise;}return{proof:{},contact:{},rows:[],next:null};};
  const args={db,isPrimary:()=>true,pages:new Set(['123']),readSource,onError:()=>{}};
  const w=kind==='intake'?createLeadIntake(args):createLeadCensus({...args,env:{VPT_FB_LEAD_CENSUS:'1'}});
  return{w,block,entered,calls};
 }
 for(const stopAt of ['claim','provider','commit'])test(`${kind}: stop during ${stopAt} joins in-flight work without claiming another`,async()=>{
  const h=create({stopAt}),run=h.w.drain();await h.entered.promise;h.w.stop();assert.equal(h.w.status().locallyDrained,false);h.block.resolve();await run;
  assert.equal(h.calls.filter(x=>x.name===prefix+'_claim').length,1);assert.equal(h.w.status().locallyDrained,true);
  if(stopAt==='claim')assert.deepEqual(h.calls.map(x=>x.name),[prefix+'_claim']);
  if(stopAt==='provider')assert.ok(!h.calls.some(x=>x.name==='crm_accept_facebook_lead'||x.name===prefix+'_commit'));
 });
}

for(const kind of ['proposal','outcome']){
 function create(stopAt){
  const prefix=kind==='proposal'?'crm_survey_dispatch':'crm_survey_outcome',block=gate(),entered=gate(),calls=[],results=[];
  const time=Date.now(),company=randomUUID(),proposal=randomUUID(),attempt=randomUUID(),token=randomUUID();
  const c={status:'CLAIMED',attemptId:attempt,proposalId:proposal,outcomeId:proposal,companyId:company,pageId:'123',psid:'456',appId:'789',graphVersion:'v24.0',authorizedAt:new Date(time).toISOString(),sendBefore:new Date(time+5000).toISOString(),payload:{messaging_type:'RESPONSE',recipient:{id:'456'},message:{text:'Synthetic survey',metadata:(kind==='proposal'?'VPT_SURVEY_SEND_V1:':'VPT_SURVEY_OUTCOME_V1:')+attempt}}};
  if(kind==='proposal')c.payload.message.quick_replies=[{content_type:'text',title:'Xác nhận lịch',payload:'VPT_SURVEY_V1:'+proposal+':'+token}];
  let sends=0;const db={async rpc(name,args){calls.push(name);
   if(name===prefix+'_candidates')return{data:[proposal,randomUUID()]};
   if(name===prefix+'_claim'){if(stopAt==='claim'){entered.resolve();await block.promise;}return{data:c};}
   if(name===prefix+'_result'){results.push(args.p_result);if(stopAt==='result'){entered.resolve();await block.promise;}return{data:{status:'RECORDED'}};}
   return{data:[]};
  },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{page_id:'123',default_company_id:company,is_active:true,access_token:'fake-token'}})})})})};
  const fetchImpl=async()=>{sends++;if(stopAt==='send'){entered.resolve();await block.promise;}return{ok:true,json:async()=>({recipient_id:'456',message_id:'fake-mid'})};};
  const args={db,isPrimary:()=>true,env:{VPT_FB_CARE_PAGES:'123',VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_DISPATCH:'1',VPT_SURVEY_OUTCOMES:'1',VPT_SURVEY_OUTCOMES_SEND:'1'},fetchImpl,now:()=>time,monotonic:()=>0};
  return{w:kind==='proposal'?createSurveyDispatch(args):createSurveyOutcomeDispatch(args),block,entered,calls,results,sends:()=>sends,prefix};
 }
 for(const stopAt of ['claim','send','result'])test(`${kind}: stop during ${stopAt} preserves ACK/UNCERTAIN and does not send the next item`,async()=>{
  const h=create(stopAt),run=h.w.drain();await h.entered.promise;h.w.stop();assert.equal((await h.w.waitForIdle({timeoutMs:0})).timedOut,true);h.block.resolve();await run;
  assert.equal(h.calls.filter(n=>n===h.prefix+'_claim').length,1);assert.equal(h.sends(),stopAt==='claim'?0:1);assert.equal(h.results.length,1);
  assert.equal(h.results[0].status,stopAt==='claim'?'UNCERTAIN':'ACK');if(stopAt==='claim')assert.equal(h.results[0].reason,'WORKER_STOPPED');
  assert.equal(h.w.status().locallyDrained,true);assert.equal(h.w.status().businessReconciled,false);
 });
}
