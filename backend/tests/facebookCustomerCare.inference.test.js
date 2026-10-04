'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {createCareOpenAiInference}=require('../src/modules/marketingAutomation/careOpenAiInference');
const {createCareAdvisor}=require('../src/modules/marketingAutomation/careAdvisor');
const hash=x=>createHash('sha256').update(x).digest('hex');
const authorization={actorId:randomUUID(),companyId:randomUUID(),requestId:randomUUID(),capability:randomUUID()};
const input={messages:[{id:'m0',direction:'inbound',text:'Tôi cần tư vấn.'}],answers:[{id:'a0',text:'Thông tin đã duyệt.'}]};
const raw={action:'ANSWER',answer:'a0',needs:[]},model='approved-snapshot-test';
const output=()=>({id:'resp_synthetic_1',model,status:'completed',error:null,incomplete_details:null,
 usage:{input_tokens:10,output_tokens:7,total_tokens:17},
 output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(raw)}]}]});
function fixture(options={}){
 const policy=randomUUID(),capability=randomUUID(),calls=[],http=[];
 const env={VPT_CARE_ADVISOR_OPENAI:'1',VPT_CARE_ADVISOR_ADMIN:'1',VPT_CARE_ADVISOR_DRAFTS:'1',
  VPT_CARE_ADVISOR_INFERENCE_POLICY:policy,VPT_CARE_ADVISOR_OPENAI_KEY:'synthetic-dedicated-key-only',...options.env};
 const claim={requestId:authorization.requestId,actorId:authorization.actorId,companyId:authorization.companyId,policyId:policy,
  capability,invoke:true,model,maxOutputTokens:512,maxInputBytes:100000,reservedVnd:2000,
  authorizedAt:new Date().toISOString(),dispatchBefore:new Date(Date.now()+5000).toISOString(),...options.claim};
 const controller=new AbortController();
 const db={rpc:async(name,args)=>{calls.push({name,args});if(options.rpc)return options.rpc(name,args,claim);
  return{data:name==='crm_care_inference_claim'?claim:{requestId:args.p_request,state:args.p_receipt.state,replayed:false}};}};
 const infer=createCareOpenAiInference({env,db,isPrimary:options.primary||(()=>true),now:options.now||Date.now,monotonic:options.monotonic||(()=>0),
  fetchImpl:async(...args)=>{http.push(args);return options.fetch?options.fetch(...args):new Response(JSON.stringify(output()),{status:200});}});
 const request={instructions:'Choose an approved answer.',input,schema:{type:'object'},authorization,signal:controller.signal};
 return{env,claim,calls,http,infer,controller,request,run:()=>infer(request)};
}
test('dedicated Responses inference stays off without all explicit controls and never reuses old key',async()=>{
 for(const settings of[{env:{VPT_CARE_ADVISOR_OPENAI:'0'}},{env:{VPT_CARE_ADVISOR_OPENAI_KEY:undefined,OPENAI_API_KEY:'synthetic-existing-key'}},
  {env:{VPT_CARE_ADVISOR_INFERENCE_POLICY:'bad'}},{env:{VPT_CARE_ADVISOR_DRAFTS:'0'}},{env:{VPT_CARE_ADVISOR_OPENAI_KEY:'bad\nkey'}},{primary:()=>false}]){
  const x=fixture(settings);assert.equal(x.infer.isAvailable(),false);await assert.rejects(x.run());assert.equal(x.calls.length,0);assert.equal(x.http.length,0);
 }
});
test('provider is invoked once only after durable permit and stores usage before returning selection',async()=>{
 const x=fixture();assert.deepEqual(await x.run(),raw);
 assert.deepEqual(x.calls.map(r=>r.name),['crm_care_inference_claim','crm_care_inference_record']);assert.equal(x.http.length,1);
 const[url,request]=x.http[0],body=JSON.parse(request.body);assert.equal(url,'https://api.openai.com/v1/responses');
 assert.equal(request.redirect,'error');assert.equal(request.signal,x.controller.signal);assert.equal(request.headers.Authorization,'Bearer '+x.env.VPT_CARE_ADVISOR_OPENAI_KEY);
 assert.equal(body.model,model);assert.equal(body.store,false);assert.equal(body.background,false);assert.equal(body.max_output_tokens,512);
 assert.equal(body.text.format.strict,true);assert.equal(body.text.format.type,'json_schema');assert.deepEqual(JSON.parse(body.input),input);
 for(const secret of Object.values(authorization))assert.equal(request.body.includes(secret),false);
 for(const k of['tools','previous_response_id','conversation','metadata','stream'])assert.equal(Object.hasOwn(body,k),false);
 assert.equal(x.calls[0].args.p_credential,hash(x.env.VPT_CARE_ADVISOR_OPENAI_KEY));assert.equal(x.calls[1].args.p_receipt.state,'USAGE_RECORDED');
});
test('replayed, forged, incomplete and oversized permits never trigger HTTP',async()=>{
 for(const claim of[{invoke:false},{companyId:randomUUID()},{actorId:randomUUID()},{requestId:randomUUID()},{policyId:randomUUID()},
  {capability:'bad'},{maxOutputTokens:9999},{maxInputBytes:1},{model:'https://evil.invalid'}]){
  const x=fixture({claim});await assert.rejects(x.run());assert.equal(x.http.length,0);
 }
 const x=fixture();x.request.input={text:'x'.repeat(160000)};await assert.rejects(x.run());assert.equal(x.calls.length,0);
});
test('clock or elapsed admission expiry is recorded as NOT_SENT without dispatch',async()=>{
 for(const opts of[{now:()=>Date.now()+6000},{now:()=>Date.now()-6000},{monotonic:(()=>{let n=0;return()=>n++?6000:0;})()}]){
  const x=fixture(opts);await assert.rejects(x.run());assert.equal(x.http.length,0);assert.deepEqual(x.calls[1].args.p_receipt,{state:'NOT_SENT',reason:'ADMISSION_EXPIRED'});
 }
});
test('disabled or changed credential after claim never dispatches; primary loss never writes backup',async()=>{
 for(const kind of['flag','key','policy','abort','primary']){
  let primary=true,x;x=fixture({primary:()=>primary,rpc:async(name,args,c)=>{
   if(name==='crm_care_inference_claim'){
    if(kind==='flag')x.env.VPT_CARE_ADVISOR_OPENAI='0';if(kind==='key')x.env.VPT_CARE_ADVISOR_OPENAI_KEY+='changed';
    if(kind==='policy')x.env.VPT_CARE_ADVISOR_INFERENCE_POLICY=randomUUID();if(kind==='abort')x.controller.abort();if(kind==='primary')primary=false;
    return{data:c};
   }return{data:{requestId:args.p_request,state:args.p_receipt.state,replayed:false}};
  }});await assert.rejects(x.run());assert.equal(x.http.length,0);assert.equal(x.calls.length,kind==='primary'?1:2);
 }
});
test('network and abort ambiguity is persisted UNKNOWN and never retried',async()=>{
 const x=fixture({fetch:async()=>{throw Error('SECRET provider error');}});await assert.rejects(x.run(),e=>e.message==='CARE_INFERENCE_UNAVAILABLE');
 assert.equal(x.http.length,1);assert.deepEqual(x.calls[1].args.p_receipt,{state:'UNKNOWN',reason:'TRANSPORT_UNKNOWN'});
});
test('provider timeout respects the caller signal and records uncertainty',async()=>{
 const x=fixture({fetch:async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
 const p=x.run();await new Promise(setImmediate);x.controller.abort();await assert.rejects(p);assert.equal(x.calls[1].args.p_receipt.state,'UNKNOWN');
});
test('untrusted provider errors, missing usage, aliases and inconsistent tokens never look like zero cost',async()=>{
 for(const body of[{error:{message:'KEY SECRET'}},{...output(),usage:null},{...output(),model:'changed-model'},
  {...output(),usage:{input_tokens:10,output_tokens:7,total_tokens:18}},{...output(),usage:{input_tokens:10,output_tokens:513,total_tokens:523}},
  {...output(),usage:{input_tokens:'10',output_tokens:7,total_tokens:17}},{...output(),id:'invalid'}]){
  const x=fixture({fetch:async()=>new Response(JSON.stringify(body),{status:200})});await assert.rejects(x.run());
  assert.deepEqual(x.calls[1].args.p_receipt,{state:'UNKNOWN',reason:'USAGE_UNAVAILABLE'});assert.equal(x.http.length,1);
 }
 const x=fixture({fetch:async()=>new Response(JSON.stringify(output()),{status:429})});await assert.rejects(x.run());assert.equal(x.calls[1].args.p_receipt.state,'UNKNOWN');
});
test('incomplete, refused, malformed and tool-call responses record known usage but do not return selection',async()=>{
 for(const body of[{...output(),status:'incomplete'}, {...output(),output:[{type:'function_call',name:'send'}]},
  {...output(),output:[{type:'message',role:'assistant',status:'completed',content:[{type:'refusal',refusal:'no'}]}]},
  {...output(),output:[...output().output,...output().output]},
  {...output(),output:[{...output().output[0],content:[{type:'output_text',text:'not JSON'}]}]}]){
  const x=fixture({fetch:async()=>new Response(JSON.stringify(body))});await assert.rejects(x.run());assert.equal(x.calls[1].args.p_receipt.state,'USAGE_RECORDED');
 }
});
test('oversized or non-JSON HTTP responses are bounded and retain unknown usage',async()=>{
 for(const body of['x'.repeat(131073),'not json']){
  const x=fixture({fetch:async()=>new Response(body)});await assert.rejects(x.run());assert.equal(x.calls[1].args.p_receipt.state,'UNKNOWN');
 }
});
test('lost usage persistence is not retried and never replays the provider',async()=>{
 const x=fixture({rpc:async(name,args,c)=>name==='crm_care_inference_claim'?{data:c}:{error:{code:'offline'}}});
 await assert.rejects(x.run());assert.equal(x.http.length,1);assert.equal(x.calls.length,2);
});
test('provider port readiness keeps advisor generation unavailable before BEGIN',async()=>{
 const x=fixture({env:{VPT_CARE_ADVISOR_OPENAI:'0'}}),calls=[];
 const service=createCareAdvisor({infer:x.infer,isPrimary:()=>true,env:{VPT_CARE_ADVISOR_ADMIN:'1',VPT_CARE_ADVISOR_DRAFTS:'1'},db:{rpc:async n=>calls.push(n)}});
 let code;await service.handle({user:{id:authorization.actorId},body:{}},{set(){},status(n){code=n;return this;},json(){}},'generate');
 assert.equal(code,503);assert.deepEqual(calls,[]);
});
