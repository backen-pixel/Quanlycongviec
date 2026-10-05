'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createCareRuntime}=require('../src/modules/marketingAutomation/careRuntime');
const {createCareOpenAiInference}=require('../src/modules/marketingAutomation/careOpenAiInference');
const {createCareRuntimeConsole}=require('../src/modules/marketingAutomation/careRuntimeConsole');
const scope=()=>({principal:randomUUID(),company:randomUUID(),grant:randomUUID(),policy:randomUUID(),page:'123'});
test('operator close uses authenticated identity, exact scoped command and durable acknowledgement',async()=>{
 const s=scope(),request=randomUUID(),target=randomUUID(),actor=randomUUID(),calls=[],res={code:200,set(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
 const body={companyId:s.company,requestId:request,runtimeRequestId:target,reason:'Operator closes a synthetic ambiguous turn'};
 const api=createCareRuntimeConsole({env:{VPT_CARE_RUNTIME_ADMIN:'1'},isPrimary:()=>true,db:{rpc:async(n,a)=>{calls.push({n,a});return{data:{companyId:s.company,requestId:request,runtimeRequestId:target,outcome:'CLOSED',replayed:false,send:false}};}}});
 await api({user:{id:actor},body},res,'close');assert.equal(res.code,200);assert.equal(calls[0].n,'crm_care_runtime_close');assert.equal(calls[0].a.p_actor,actor);assert.equal(calls[0].a.p_runtime_request,target);
 await api({user:{id:actor},body:{...body,reason:'short'}},res,'close');assert.equal(res.code,400);
 await api({user:{id:actor},body:{...body,actorId:s.principal}},res,'close');assert.equal(res.code,400);assert.equal(calls.length,1);
});
test('operator runtime reader remains authenticated and scoped without a provider or runtime enable flag',async()=>{
 const s=scope(),request=randomUUID(),actor=randomUUID(),calls=[],res={code:200,set(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
 const reader=createCareRuntimeConsole({env:{VPT_CARE_RUNTIME_ADMIN:'1'},isPrimary:()=>true,db:{rpc:async(n,a)=>{calls.push({n,a});
  return{data:n==='crm_care_runtime_read'?{companyId:s.company,requestId:request,principalKind:'AGENT',principalId:s.principal,grantId:s.grant,send:false}:
   {companyId:s.company,items:[],nextAfter:null,send:false}};}}});
 await reader({user:{id:actor},query:{companyId:s.company,requestId:request}},res,'read');assert.equal(res.code,200);assert.equal(calls[0].a.p_actor,actor);
 await reader({user:{id:actor},query:{companyId:s.company}},res,'list');assert.equal(calls[1].n,'crm_care_runtime_list');
 await reader({user:{id:actor,userId:randomUUID()},query:{companyId:s.company}},res,'list');assert.equal(res.code,403);
 await reader({user:{id:actor},query:{companyId:s.company,principalId:s.principal}},res,'list');assert.equal(res.code,400);assert.equal(calls.length,2);
});
test('operator runtime reader rejects wrong returned scope and remains off by default',async()=>{
 const s=scope(),res={code:200,set(){},status(n){this.code=n;return this;},json(){return this;}},req={user:{id:randomUUID()},query:{companyId:s.company}};
 let calls=0;const db={rpc:async()=>{calls++;return{data:{companyId:randomUUID(),items:[],nextAfter:null,send:false}};}};
 await createCareRuntimeConsole({db,isPrimary:()=>true,env:{}})(req,res,'list');assert.equal(res.code,503);assert.equal(calls,0);
 await createCareRuntimeConsole({db,isPrimary:()=>true,env:{VPT_CARE_RUNTIME_ADMIN:'1'}})(req,res,'list');assert.equal(res.code,503);assert.equal(calls,1);
});
function fixture(options={}){
 const s=scope(),thread=randomUUID(),entry=randomUUID(),region=randomUUID(),calls=[],models=[],errors=[];
 const env={VPT_CARE_RUNTIME:'1',VPT_CARE_RUNTIME_PRINCIPAL:s.principal,VPT_CARE_RUNTIME_COMPANY:s.company,
  VPT_CARE_RUNTIME_GRANT:s.grant,VPT_CARE_RUNTIME_PAGE:s.page,VPT_CARE_ADVISOR_INFERENCE_POLICY:s.policy,...options.env};
 const context={companyId:s.company,threadId:thread,version:'a'.repeat(32),mode:'WAITING',target:{routingReady:true,regionId:region},
  messages:[{id:randomUUID(),direction:'inbound',content:'Tôi cần tư vấn.'}],
  entries:[{companyId:s.company,entryId:entry,version:'b'.repeat(32),state:'APPROVED',approvedReady:true,sourceReady:true,
   document:{purpose:'ADVICE',question:'Tư vấn',answer:'Nội dung giả đã duyệt.',channels:['facebook'],regionIds:[region]}}]};
 const base={companyId:s.company,principalId:s.principal,grantId:s.grant,send:false};
 let worker;
 const infer=async p=>{models.push(p);return options.infer?options.infer(p,worker):{action:'ANSWER',answer:'a0',needs:[]};};
 if(options.available!==undefined)infer.isAvailable=()=>options.available;
 const db={rpc:async(name,args)=>{
  calls.push({name,args});
  const data=name==='crm_care_runtime_candidates'?{...base,pageId:s.page,items:[thread]}:
   ['crm_care_runtime_begin','crm_care_runtime_begin_with_survey'].includes(name)?{...base,threadId:thread,requestId:args.p_request,invoke:true,state:'RUNNING',policyId:s.policy,capability:randomUUID(),context}:
   {...base,threadId:thread,requestId:args.p_request,state:'DRAFT',handoff:false,stale:false};
  return options.rpc?options.rpc(name,args,data,worker):{data};
 }};
 worker=createCareRuntime({db,env,isPrimary:options.primary||(()=>true),infer,onError:x=>errors.push(x),timeoutMs:options.timeoutMs});
 return {s,env,thread,context,calls,models,errors,worker,entry};
}
test('runtime is dormant without valid independent enrollment scope, provider readiness and Primary',async()=>{
 for(const options of[{env:{VPT_CARE_RUNTIME:'0'}},{env:{VPT_CARE_RUNTIME_PRINCIPAL:'human'}},{env:{VPT_CARE_RUNTIME_PAGE:'bad'}},{available:false},{primary:()=>false}]){
  const x=fixture(options);await x.worker.drain();assert.equal(x.calls.length,0);assert.equal(x.models.length,0);
 }
});
test('runtime uses its own identity in ordered domain calls and never sends a message',async()=>{
 const x=fixture();await x.worker.drain();
 assert.deepEqual(x.calls.map(c=>c.name),['crm_care_runtime_candidates','crm_care_runtime_begin','crm_care_runtime_finish']);
 assert.equal(x.models.length,1);assert.equal(x.models[0].authorization.actorId,x.s.principal);assert.equal(x.models[0].authorization.grantId,x.s.grant);
 assert.deepEqual(x.calls[2].args.p_response,{action:'ANSWER',entryId:x.entry,needs:[]});assert.deepEqual(x.errors,[]);
 for(const id of[x.s.principal,x.s.grant,x.s.company,x.thread])assert.equal(JSON.stringify(x.models[0].input).includes(id),false);
});
test('survey runtime is separately enabled and never accepts an unsolicited survey capability',async()=>{
 const policy=randomUUID(),x=fixture({env:{VPT_CARE_RUNTIME_SURVEY:'1',VPT_CARE_RUNTIME_SURVEY_POLICY:policy}});
 x.context.surveyProposalAllowed=true;await x.worker.drain();assert.deepEqual(x.errors,[]);
 assert.equal(x.calls[1].name,'crm_care_runtime_begin_with_survey');assert.equal(x.calls[1].args.p_survey_policy,policy);
 assert.ok(x.models[0].schema.properties.action.enum.includes('SURVEY'));
 const invalid=fixture({env:{VPT_CARE_RUNTIME_SURVEY:'1'}});await invalid.worker.drain();assert.equal(invalid.calls.length,0);
 const unsolicited=fixture();unsolicited.context.surveyProposalAllowed=true;await unsolicited.worker.drain();assert.equal(unsolicited.models.length,0);
});
test('survey scope change during inference records a disabled result without continuing to propose',async()=>{
 const x=fixture({env:{VPT_CARE_RUNTIME_SURVEY:'1',VPT_CARE_RUNTIME_SURVEY_POLICY:randomUUID()},infer:async()=>{
  x.env.VPT_CARE_RUNTIME_SURVEY_POLICY=randomUUID();return{action:'ANSWER',answer:'a0',needs:[]};}});
 x.context.surveyProposalAllowed=true;await x.worker.drain();assert.deepEqual(x.calls[2].args.p_response,{failure:'DISABLED'});
});
test('invalid candidate scope, duplicates, excessive candidates and malformed BEGIN never reach inference',async()=>{
 for(const mutation of[d=>({...d,companyId:randomUUID()}),d=>({...d,items:[...d.items,...d.items]}),d=>({...d,items:Array(11).fill(randomUUID())})]){
  const x=fixture({rpc:async(n,a,d)=>({data:n==='crm_care_runtime_candidates'?mutation(d):d})});await x.worker.drain();assert.equal(x.models.length,0);
 }
 for(const mutation of[d=>({...d,invoke:'true'}),d=>({...d,policyId:randomUUID()}),d=>({...d,capability:'bad'}),d=>({...d,context:{}})]){
  const x=fixture({rpc:async(n,a,d)=>({data:n==='crm_care_runtime_begin'?mutation(d):d})});await x.worker.drain();assert.equal(x.models.length,0);
 }
});
test('replayed BEGIN, preflight handoff and already handled input never invoke a model',async()=>{
 for(const state of['RUNNING','DRAFT','ALREADY_HANDLED','HUMAN_REQUESTED']){
  const x=fixture({rpc:async(n,a,d)=>({data:n==='crm_care_runtime_begin'?{...d,state,invoke:false}:d})});
  await x.worker.drain();assert.equal(x.models.length,0);assert.equal(x.calls.length,2);
 }
});
test('stop after BEGIN saves disabled outcome without inference and prevents later admission',async()=>{
 const x=fixture({rpc:async(n,a,d,w)=>{if(n==='crm_care_runtime_begin')w.stop();return{data:d};}});
 await x.worker.drain();assert.equal(x.models.length,0);assert.equal(x.calls.at(-1).args.p_response.failure,'DISABLED');
 assert.equal((await x.worker.waitForIdle()).locallyDrained,true);await x.worker.drain();assert.equal(x.calls.length,3);
});
test('scope changes while inference runs discard output before persisting the bounded outcome',async()=>{
 const x=fixture({infer:async()=>{x.env.VPT_CARE_RUNTIME_GRANT=randomUUID();return{action:'ANSWER',answer:'a0',needs:[]};}});
 await x.worker.drain();assert.equal(x.calls.at(-1).args.p_response.failure,'DISABLED');assert.equal(x.calls.at(-1).args.p_grant,x.s.grant);
});
test('malformed model selection cannot become a send or final quote',async()=>{
 const x=fixture({infer:async()=>({action:'SEND',answer:'Giá cuối cùng',needs:[]})});await x.worker.drain();
 assert.equal(x.calls.at(-1).args.p_response.failure,'INVALID_MODEL_OUTPUT');assert.deepEqual(x.errors,[]);
});
test('lost finish is not repeated and Primary loss cannot write a failure on Backup',async()=>{
 const x=fixture({rpc:async(n,a,d)=>n==='crm_care_runtime_finish'?{error:{code:'NETWORK'}}:{data:d}});
 await x.worker.drain();assert.equal(x.models.length,1);assert.equal(x.calls.filter(c=>c.name==='crm_care_runtime_finish').length,1);assert.equal(x.errors.length,1);
 let primary=true;const y=fixture({primary:()=>primary,infer:async()=>{primary=false;return{action:'HANDOFF',answer:null,needs:[]};}});
 await y.worker.drain();assert.equal(y.calls.length,2);assert.equal(y.errors.length,1);
});
test('overlapping ticks use one local run and drain waits for inference settlement',async()=>{
 let settle;const x=fixture({infer:()=>new Promise(resolve=>{settle=resolve;})});
 const a=x.worker.drain(),b=x.worker.drain();assert.equal(a,b);await new Promise(r=>setImmediate(r));x.worker.stop();
 assert.equal((await x.worker.waitForIdle({timeoutMs:0})).locallyDrained,false);
 settle({action:'HANDOFF',answer:null,needs:[]});await a;assert.equal(x.models.length,1);assert.equal(x.worker.status().locallyDrained,true);
});
test('runtime provider uses separate RPC and cannot borrow the human path or another principal',async()=>{
 const s=scope(),request=randomUUID(),cap=randomUUID(),calls=[],posts=[];
 const env={VPT_CARE_RUNTIME:'1',VPT_CARE_RUNTIME_OPENAI:'1',VPT_CARE_RUNTIME_PRINCIPAL:s.principal,VPT_CARE_RUNTIME_COMPANY:s.company,
  VPT_CARE_RUNTIME_GRANT:s.grant,VPT_CARE_ADVISOR_INFERENCE_POLICY:s.policy,VPT_CARE_ADVISOR_OPENAI_KEY:'synthetic-runtime-dedicated-key'};
 const port=createCareOpenAiInference({authority:'RUNTIME',env,isPrimary:()=>true,db:{rpc:async(n,a)=>{calls.push({n,a});
  return{data:n==='crm_care_runtime_inference_claim'?{invoke:true,requestId:request,companyId:s.company,actorId:s.principal,policyId:s.policy,
   capability:cap,model:'test-snapshot',maxOutputTokens:512,maxInputBytes:150000,reservedVnd:1000,
   authorizedAt:new Date().toISOString(),dispatchBefore:new Date(Date.now()+5000).toISOString()}:{requestId:request,state:a.p_receipt.state,replayed:false}};
 }},fetchImpl:async(url,args)=>{posts.push(args);return new Response(JSON.stringify({id:'resp_runtime',model:'test-snapshot',status:'completed',
  usage:{input_tokens:1,output_tokens:1,total_tokens:2},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{}'}]}]}));}});
 const params={instructions:'Select.',input:{},schema:{},authorization:{actorId:s.principal,companyId:s.company,grantId:s.grant,requestId:request,capability:randomUUID()},signal:new AbortController().signal};
 assert.equal(port.isAvailable(),true);await assert.rejects(port({...params,authorization:{...params.authorization,actorId:randomUUID()}}));
 assert.equal(calls.length,0);await port(params);assert.equal(calls[0].n,'crm_care_runtime_inference_claim');assert.equal(calls[0].a.p_grant,s.grant);
 assert.equal(calls[1].n,'crm_care_inference_record');assert.equal(posts.length,1);assert.equal(posts[0].body.includes(s.principal),false);
});
