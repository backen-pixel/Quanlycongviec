'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createSurveyDispatch}=require('../src/modules/marketingAutomation/facebookSurveyDispatch');
const {extractCareEvents,redactSurveyConfirmationPayloads}=require('../src/modules/marketingAutomation/facebookCustomerCare');
function harness(options={}){
 const time=Date.now(),company=randomUUID(),proposal=randomUUID(),attempt=randomUUID(),token=randomUUID();
 const env={VPT_FB_CARE_PAGES:'123',VPT_SURVEY_CONFIRMATIONS:'1',VPT_SURVEY_DISPATCH:'1',...options.env};
 const state={primary:true,claimed:false,sends:[],results:[],calls:[],errors:[],now:time,mono:0};
 const c={status:'CLAIMED',attemptId:attempt,proposalId:proposal,companyId:company,pageId:'123',psid:'456',appId:'789',graphVersion:'v24.0',
  authorizedAt:new Date(time).toISOString(),sendBefore:new Date(time+5000).toISOString(),
  payload:{recipient:{id:'456'},messaging_type:'RESPONSE',message:{text:'Đề xuất lịch khảo sát',metadata:'VPT_SURVEY_SEND_V1:'+attempt,
   quick_replies:[{content_type:'text',title:'Xác nhận lịch',payload:'VPT_SURVEY_V1:'+proposal+':'+token}]}}};
 const db={rpc:async(name,args)=>{
  state.calls.push(name);
  if(name==='crm_survey_dispatch_candidates')return{data:state.claimed?[]:[proposal]};
  if(name==='crm_survey_dispatch_claim'){
   if(state.claimed)return{data:{status:'UNAVAILABLE'}};state.claimed=true;
   if(options.claimLost)return{error:{code:'lost'}};
   if(options.afterClaim)options.afterClaim(state,c,env);
   return{data:c};
  }
  if(name==='crm_survey_dispatch_result'){
   state.results.push(args.p_result);
   if(state.results.length<=(options.resultFailures||0))return{error:{code:'lost'}};
   return{data:{status:args.p_result.status==='ACK'?'SENT':'UNCERTAIN'}};
  }
  return{data:[]};
 },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{page_id:'123',default_company_id:company,is_active:true,access_token:'synthetic-token',...options.credential}})})})})};
 const fetchImpl=async(url,init)=>{
  state.sends.push({url,init});
  if(options.onSend)return options.onSend(state,c,env);
  return{ok:true,json:async()=>({recipient_id:'456',message_id:'provider-mid'})};
 };
 const worker=()=>createSurveyDispatch({db,isPrimary:()=>state.primary,env,fetchImpl,now:()=>state.now,monotonic:()=>state.mono,onError:code=>state.errors.push(code)});
 return{worker:worker(),restart:worker,state,c,env};
}
test('default-off worker and backup perform no reads or provider calls',async()=>{
 for(const config of [{env:{VPT_SURVEY_CONFIRMATIONS:'0'}},{primary:false}]){
  const h=harness(config);if(config.primary===false)h.state.primary=false;await h.worker.drain();assert.deepEqual(h.state.calls,[]);assert.equal(h.state.sends.length,0);
 }
});
test('dispatch disabled still recovers receipt facts without sending',async()=>{
 const h=harness({env:{VPT_SURVEY_DISPATCH:'0'}});await h.worker.drain();assert.equal(h.state.sends.length,0);assert.deepEqual(h.state.calls,['crm_survey_dispatch_recover','crm_survey_confirmation_reconcile']);
});
test('one immutable send uses fixed Graph host, bearer header, RESPONSE and no redirects',async()=>{
 const h=harness();await h.worker.drain();await h.worker.drain();assert.equal(h.state.sends.length,1);
 const {url,init}=h.state.sends[0];assert.equal(url,'https://graph.facebook.com/v24.0/123/messages');assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
 assert.equal(init.headers.Authorization,'Bearer synthetic-token');assert.deepEqual(JSON.parse(init.body),h.c.payload);
 assert.deepEqual(h.state.results,[{status:'ACK',recipientId:'456',messageId:'provider-mid'}]);assert.ok(init.signal);
});
test('lost claim response never reissues payload after restart',async()=>{
 const h=harness({claimLost:true});await h.worker.drain();await h.restart().drain();assert.equal(h.state.sends.length,0);assert.equal(h.state.claimed,true);
});
test('provider timeout, non-JSON and error ACK never cause another POST',async()=>{
 for(const onSend of [async()=>{throw Error('timeout with sensitive provider body');},async()=>({ok:true,json:async()=>{throw Error('bad json');}}),async()=>({ok:false,json:async()=>({error:{}})})]){
  const h=harness({onSend});await h.worker.drain();await h.restart().drain();assert.equal(h.state.sends.length,1);assert.deepEqual(h.state.results,[{status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'}]);
  assert.equal(JSON.stringify(h.state.errors).includes('sensitive'),false);
 }
});
test('ACK persistence retries the exact result without resending and is bounded',async()=>{
 for(const resultFailures of [2,4]){
  const h=harness({resultFailures});await h.worker.drain();await h.restart().drain();assert.equal(h.state.sends.length,1);assert.equal(h.state.results.length,3);
  assert.ok(h.state.results.every(r=>JSON.stringify(r)===JSON.stringify(h.state.results[0])));
 }
});
test('worker checks fresh enablement, Primary and short deadline immediately before send',async()=>{
 for(const afterClaim of [(s,c,e)=>{e.VPT_SURVEY_DISPATCH='0';},s=>{s.primary=false;},s=>{s.now+=5000;},s=>{s.mono+=5000;},s=>{s.now-=2000;}]){
  const h=harness({afterClaim});await h.worker.drain();assert.equal(h.state.sends.length,0);
 }
});
test('cross-company credentials and malformed or off-host Graph claims cannot send',async()=>{
 for(const afterClaim of [(s,c)=>{c.companyId=randomUUID();},(s,c)=>{c.graphVersion='v24.0@evil.test';},(s,c)=>{c.payload.recipient.id='999';},(s,c)=>{c.payload.message.attachment={type:'template'};}]){
  const h=harness({afterClaim});await h.worker.drain();assert.equal(h.state.sends.length,0);assert.ok(h.state.errors.includes('SURVEY_CLAIM_INVALID'));
 }
});
test('a shortened authorization deadline still expires with a slow local wall clock',async()=>{
 const h=harness({afterClaim:(s,c)=>{c.sendBefore=new Date(Date.parse(c.authorizedAt)+300).toISOString();s.now-=500;s.mono+=500;}});
 await h.worker.drain();assert.equal(h.state.sends.length,0);assert.equal(h.state.results[0].reason,'SEND_AUTHORITY_EXPIRED');
});
test('wrong provider recipient is persisted for conflict handling, never silently accepted',async()=>{
 const h=harness({onSend:async()=>({ok:true,json:async()=>({recipient_id:'999',message_id:'other-mid'})})});await h.worker.drain();assert.equal(h.state.results[0].recipientId,'999');assert.equal(h.state.sends.length,1);
});
test('disabling sending after Meta accepts still preserves historical ACK',async()=>{
 const h=harness({onSend:async(s,c,e)=>{e.VPT_SURVEY_DISPATCH='0';return{ok:true,json:async()=>({recipient_id:'456',message_id:'accepted'})};}});
 await h.worker.drain();assert.equal(h.state.results[0].messageId,'accepted');
});
test('overlapping drains share one worker and cannot duplicate a send',async()=>{
 let release;const pending=new Promise(r=>release=r);const h=harness({onSend:async()=>{await pending;return{ok:true,json:async()=>({recipient_id:'456',message_id:'one'})};}});
 const first=h.worker.drain();assert.equal(h.worker.drain(),first);release();await first;assert.equal(h.state.sends.length,1);
});
test('own-echo fields preserve message hash and reserved metadata is removed from legacy consumers',()=>{
 const body={object:'page',entry:[{id:'123',messaging:[{sender:{id:'123'},recipient:{id:'456'},timestamp:Date.now(),message:{mid:'echo',is_echo:true,app_id:789,text:'proposal',metadata:'VPT_SURVEY_SEND_V1:'+randomUUID()}}]}]};
 const pages=new Set(['123']);const a=extractCareEvents(body,pages),b=extractCareEvents(body,pages,Date.now(),{surveyConfirmations:true});
 assert.equal(a[0].payloadHash,b[0].payloadHash);assert.equal(b[0].echoAppId,'789');assert.equal(b[0].echoMetadata,body.entry[0].messaging[0].message.metadata);
 const clean=redactSurveyConfirmationPayloads(body,pages);assert.equal(clean.entry[0].messaging[0].message.metadata,undefined);assert.ok(body.entry[0].messaging[0].message.metadata);
 body.entry[0].messaging[0].message.app_id=Number.MAX_SAFE_INTEGER+1;assert.equal(extractCareEvents(body,pages,Date.now(),{surveyConfirmations:true})[0].echoAppId,undefined);
});
