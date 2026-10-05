'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash,createHmac}=require('node:crypto');
const {createCareAnswerDispatch}=require('../src/modules/marketingAutomation/careAnswerDispatch');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
function fixture(options={}){
 const principal=randomUUID(),company=randomUUID(),grant=randomUUID(),policy=randomUUID(),request=randomUUID(),attempt=randomUUID(),time=Date.now();
 const env={VPT_CARE_RUNTIME_PRINCIPAL:principal,VPT_CARE_RUNTIME_COMPANY:company,VPT_CARE_RUNTIME_GRANT:grant,
  VPT_CARE_RUNTIME_PAGE:'123',VPT_CARE_RUNTIME_SEND_POLICY:policy,VPT_FB_CARE_PAGES:'123',VPT_CARE_RUNTIME_ECHO:'1',VPT_CARE_RUNTIME_SEND:'1',...options.env};
 const state={calls:[],posts:[],results:[],errors:[],claimed:false,now:time,mono:0,primary:true};
 const claim={status:'CLAIMED',attemptId:attempt,requestId:request,companyId:company,principalId:principal,grantId:grant,policyId:policy,
  pageId:'123',psid:'456',appId:'789',graphVersion:'v24.0',authorizedAt:new Date(time).toISOString(),sendBefore:new Date(time+5000).toISOString(),
  payload:{recipient:{id:'456'},messaging_type:'RESPONSE',message:{text:'Nội dung giả đã được duyệt.',metadata:'VPT_CARE_SEND_V1:'+attempt}}};
 const db={rpc:async(n,a)=>{
  state.calls.push({n,a});
  if(n==='crm_care_send_recover')return{data:0};
  if(n==='crm_care_send_candidates')return{data:{companyId:company,principalId:principal,grantId:grant,policyId:policy,send:false,items:state.claimed?[]:[request]}};
  if(n==='crm_care_send_claim'){state.claimed=true;if(options.lostClaim)return{error:{code:'LOST'}};options.afterClaim?.(state,claim,env);return{data:claim};}
  if(n==='crm_care_send_result'){state.results.push(a.p_result);if(state.results.length<=(options.resultFailures||0))return{error:{code:'LOST'}};return{data:{status:'SENT'}};}
  throw Error(n);
 },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{page_id:'123',default_company_id:company,is_active:true,access_token:'synthetic-token',...options.credential}})})})})};
 const make=()=>createCareAnswerDispatch({db,env,isPrimary:()=>state.primary,now:()=>state.now,monotonic:()=>state.mono,onError:x=>state.errors.push(x),
  fetchImpl:async(url,init)=>{state.posts.push({url,init});return options.fetch?options.fetch(state,claim,env):new Response(JSON.stringify({recipient_id:'456',message_id:'mid'}));}});
 return{state,claim,env,worker:make(),restart:make};
}
test('answer transport is off by default, on Backup and without independent echo admission',async()=>{
 for(const options of[{env:{VPT_CARE_RUNTIME_ECHO:'0'}},{env:{VPT_FB_CARE_PAGES:''}},{env:{VPT_CARE_RUNTIME_COMPANY:'bad'}},{primary:false}]){
  const f=fixture(options);if(options.primary===false)f.state.primary=false;await f.worker.drain();assert.equal(f.state.calls.length,0);assert.equal(f.state.posts.length,0);
 }
 const f=fixture({env:{VPT_CARE_RUNTIME_SEND:'0'}});await f.worker.drain();assert.deepEqual(f.state.calls.map(x=>x.n),['crm_care_send_recover']);
});
test('approved answer uses fixed Graph endpoint and immutable exact payload; result persistence alone retries',async()=>{
 const f=fixture({resultFailures:2});await f.worker.drain();await f.restart().drain();assert.equal(f.state.posts.length,1);
 const {url,init}=f.state.posts[0];assert.equal(url,'https://graph.facebook.com/v24.0/123/messages');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer synthetic-token');
 assert.deepEqual(JSON.parse(init.body),f.claim.payload);assert.equal(f.state.results.length,3);assert.deepEqual(f.state.results[0],f.state.results[2]);
 const args=f.state.calls.find(x=>x.n==='crm_care_send_claim').a;assert.equal(args.p_credential,createHash('sha256').update('synthetic-token').digest('hex'));
 assert.equal(args.p_principal,f.claim.principalId);assert.equal(f.state.calls.some(x=>x.n.includes('advisor')),false);
});
test('lost claim acknowledgement never causes POST or payload reissue',async()=>{
 const f=fixture({lostClaim:true});await f.worker.drain();await f.restart().drain();assert.equal(f.state.posts.length,0);assert.equal(f.state.errors.length,1);
});
test('invalid recipient, extra payload, changed scope and oversized answers never reach Meta',async()=>{
 for(const mutate of[c=>{c.payload.recipient.extra='x';},c=>{c.companyId=randomUUID();},c=>{c.payload.message.text='x'.repeat(2001);},c=>{c.payload.message.quick_replies=[];},c=>{c.graphVersion='https://evil';}]){
  const f=fixture({afterClaim:(_,c)=>mutate(c)});await f.worker.drain();assert.equal(f.state.posts.length,0);assert.equal(f.state.errors.length,1);
 }
});
test('stop or scope change after claim records uncertainty without sending',async()=>{
 for(const mutate of[(s,c,e)=>{e.VPT_CARE_RUNTIME_SEND='0';},(s,c,e)=>{e.VPT_CARE_RUNTIME_GRANT=randomUUID();}]){
  const f=fixture({afterClaim:mutate});await f.worker.drain();assert.equal(f.state.posts.length,0);assert.equal(f.state.results[0].reason,'WORKER_STOPPED');
 }
});
test('expired lease, clock regression or monotonic delay never sends',async()=>{
 for(const mutate of[s=>{s.now+=5000;},s=>{s.now-=2000;},s=>{s.mono=5000;}]){
  const f=fixture({afterClaim:mutate});await f.worker.drain();assert.equal(f.state.posts.length,0);assert.equal(f.state.results[0].reason,'SEND_AUTHORITY_EXPIRED');
 }
});
test('timeout, invalid JSON, large receipt and non-OK response remain uncertain and never resend',async()=>{
 for(const fetch of[async()=>{throw Error('sensitive');},async()=>new Response('bad'),async()=>new Response('x'.repeat(16385)),async()=>new Response('{}',{status:500})]){
  const f=fixture({fetch});await f.worker.drain();await f.restart().drain();assert.equal(f.state.posts.length,1);assert.deepEqual(f.state.results[0],{status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'});
 }
});
test('wrong recipient ACK is retained for domain conflict handling instead of being called success',async()=>{
 const f=fixture({fetch:async()=>new Response(JSON.stringify({recipient_id:'999',message_id:'mid'}))});await f.worker.drain();assert.equal(f.state.results[0].recipientId,'999');
});
test('Primary loss after POST never writes receipt to Backup',async()=>{
 const f=fixture({fetch:async s=>{s.primary=false;return new Response(JSON.stringify({recipient_id:'456',message_id:'mid'}));}});await f.worker.drain();
 assert.equal(f.state.posts.length,1);assert.equal(f.state.results.length,0);assert.equal(f.state.errors.length,1);
});
test('parallel ticks share one POST and stop waits for receipt recording',async()=>{
 let release,entered;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
 const f=fixture({fetch:async()=>{entered();await gate;return new Response(JSON.stringify({recipient_id:'456',message_id:'mid'}));}});
 const a=f.worker.drain();await ready;const b=f.worker.drain();f.worker.stop();let done=false;
 const waiting=f.worker.waitForIdle().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);release();await Promise.all([a,b]);await waiting;
 assert.equal(f.state.posts.length,1);assert.equal(f.state.results.length,1);await f.worker.drain();assert.equal(f.state.posts.length,1);
});
test('runtime echo extraction is signed and independent of survey confirmation ingress',async()=>{
 const secret='synthetic-secret',env={VPT_FB_CARE_PAGES:'123',VPT_FACEBOOK_APP_SECRET:secret,VPT_CARE_RUNTIME_ECHO:'1'},calls=[];
 const care=createCustomerCare({env,isPrimary:()=>true,db:{rpc:async(n,a)=>{calls.push({n,a});return{data:1};}}});
 const body={object:'page',entry:[{id:'123',messaging:[{sender:{id:'123'},recipient:{id:'456'},timestamp:Date.now(),message:{mid:'m',text:'answer',is_echo:true,app_id:789,metadata:'VPT_CARE_SEND_V1:'+randomUUID()}}]}]};
 const raw=Buffer.from(JSON.stringify(body)),req={facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}};
 await care.receive(req);assert.equal(calls[0].n,'crm_care_receive');assert.equal(calls[0].a.p_events[0].echoAppId,'789');assert.match(calls[0].a.p_events[0].echoMetadata,/VPT_CARE_SEND/);
 assert.equal(care.legacyBody(body).entry[0].messaging[0].message.metadata,undefined);
 await assert.rejects(care.receive({...req,headers:{}}),/INVALID_SIGNATURE/);assert.equal(calls.length,1);
});
