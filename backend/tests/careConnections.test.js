'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCareConnections,projection,command}=require('../src/modules/marketingAutomation/careConnections');
const {id}=require('./marketingAutomation.trial.fixture');
const actor=id(1),company=id(2),thread=id(3),lead=id(4),request=id(5),message=id(6);
const read=()=>({policy:'CARE_CONNECTION_V1',actorId:actor,companyId:company,threadId:thread,leadId:lead,careMode:'WAITING',
 sendAllowed:false,automaticallyVerified:false,version:'a'.repeat(32),canLink:true,alreadyLinked:false,mappingComplete:false,requiresIdentityEvidence:true,
 lead:{id:lead,code:null,title:'Synthetic Lead',customerName:'Synthetic customer',phone:null},
 messages:[{id:message,sentAt:'2026-10-03T01:00:00Z',text:'Synthetic identity evidence'}]});
const receipt=()=>({...read(),requestId:request,contactId:id(7),replayed:false,currentLink:true});
const cmd=()=>({threadId:thread,leadId:lead,expectedVersion:'a'.repeat(32),evidenceMessageId:message,identityConfirmed:true,reason:'Synthetic operator identity verification'});
const req=(operation='read')=>({user:{userId:actor},query:{companyId:company,threadId:thread,leadId:lead},body:{companyId:company,requestId:request,command:cmd()}});
const res=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(x){this.code=x;return this;},json(x){this.body=x;return this;}});
const run=async({operation='read',input=req(),db={rpc:async()=>({data:read()})},env={VPT_CARE_CONNECTIONS:'1'},isPrimary=()=>true}={})=>{
 const output=res();await createCareConnections({db,env,isPrimary}).handle(input,output,operation);return output;
};
test('connection requires authenticated actor and rejects caller identity override',async()=>{
 for(const input of [{...req(),user:{}},{...req(),user:{id:actor,userId:id(8)}},{...req(),query:{...req().query,actorId:id(8)}}]){
  const r=await run({input,db:{rpc:()=>assert.fail('no RPC for invalid identity')}});assert.ok([400,403].includes(r.code));
 }
 let args;const r=await run({db:{rpc:async(n,a)=>{args={n,a};return{data:read()};}}});
 assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.deepEqual(args,{n:'crm_care_connection_read',a:{p_actor:actor,p_company:company,p_thread:thread,p_lead:lead}});
});
test('connection stays default off and requires Primary',async()=>{
 for(const options of [{env:{}},{isPrimary:()=>false}])assert.equal((await run({...options,db:{rpc:()=>assert.fail()}})).code,503);
 let primary=true;const r=await run({isPrimary:()=>primary,db:{rpc:async()=>{primary=false;return{data:read()};}}});
 assert.equal(r.code,503);assert.equal(r.body.lead,undefined);
});
test('nullable phone is an unverified CRM field, not a source error or empty verified number',()=>{
 const r=projection(read(),actor,company,thread,lead);assert.equal(r.lead.phone,null);assert.equal(r.requiresIdentityEvidence,true);
 assert.equal(r.automaticallyVerified,false);assert.equal(r.sendAllowed,false);
});
test('projection omits provider credentials, source metadata and foreign candidate fields',()=>{
 const x=read();x.token='PRIVATE';x.lead.email='PRIVATE';x.messages[0].rawPayload='PRIVATE';x.otherCustomer={name:'PRIVATE'};
 assert.ok(!JSON.stringify(projection(x,actor,company,thread,lead)).includes('PRIVATE'));
});
test('wrong scope, capabilities, missing evidence and malformed message shapes fail closed',()=>{
 for(const mutate of [x=>x.actorId=id(9),x=>x.companyId=id(9),x=>x.threadId=id(9),x=>x.leadId=id(9),
  x=>x.sendAllowed=true,x=>x.automaticallyVerified=true,x=>x.requiresIdentityEvidence=false,
  x=>x.messages=[null],x=>x.messages.push(x.messages[0]),x=>x.messages[0].sentAt='bad',
  x=>x.lead.phone=123,x=>x.messages=Array(21).fill(x.messages[0]),x=>delete x.mappingComplete,x=>x.mappingComplete=true]){
  const x=read();mutate(x);assert.throws(()=>projection(x,actor,company,thread,lead));
 }
});
test('identity command requires deliberate attestation, current version and exact fields',()=>{
 assert.equal(command(cmd()),true);
 for(const mutate of [x=>x.identityConfirmed=false,x=>x.identityConfirmed='true',x=>x.reason='too short',
  x=>x.expectedVersion=[x.expectedVersion],x=>x.evidenceMessageId='invalid',x=>x.companyId=company,
  x=>x.automaticallyVerified=true,x=>x.reason='x'.repeat(2001)]){
  const x=cmd();mutate(x);assert.equal(Boolean(command(x)),false);
 }
});
test('link dispatches an immutable operator request and no messaging or qualification call',async()=>{
 let calls=0;const input=req();const r=await run({operation:'link',input,db:{rpc:async(n,a)=>{
  calls++;assert.equal(n,'crm_care_connection_link');assert.deepEqual(a,{p_actor:actor,p_company:company,p_request:request,p_command:input.body.command});
  return{data:receipt()};
 }}});
 assert.equal(calls,1);assert.equal(r.code,200);assert.equal(r.body.currentLink,true);assert.equal(r.body.sendAllowed,false);
 assert.equal(r.body.messages,undefined);assert.equal(r.body.lead,undefined);
});
test('link validates receipt request, contact and scope before declaring success',async()=>{
 for(const mutate of [x=>x.requestId=id(8),x=>x.contactId='invalid',x=>x.currentLink=null,x=>x.actorId=id(8)]){
  const x=receipt();mutate(x);const r=await run({operation:'link',db:{rpc:async()=>({data:x})}});
  assert.equal(r.code,503);assert.equal(r.body.currentLink,undefined);
 }
});
test('replay receipt is historical and never resumes STOP or human takeover',()=>{
 for(const careMode of ['OPTED_OUT','HUMAN_ACTIVE','HUMAN_REQUESTED']){
  const x={...receipt(),careMode,replayed:true,currentLink:false};
  const r=projection(x,actor,company,thread,lead,request);
  assert.equal(r.careMode,careMode);assert.equal(r.replayed,true);assert.equal(r.currentLink,false);assert.equal(r.sendAllowed,false);
 }
});
test('permission, concurrent change and database errors do not leak provider or CRM details',async()=>{
 for(const [code,status]of [['42501',403],['40001',409],['23505',409],['40P01',409],['22023',400],['22P02',400],['XX000',503]]){
  const r=await run({db:{rpc:async()=>({error:{code,message:'PRIVATE token and customer'}})}});
  assert.equal(r.code,status);assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));assert.equal(r.body.lead,undefined);
  if(code==='40001')assert.equal(r.body.reason,'CONTEXT_CHANGED');
 }
});
test('lost RPC response does not invent a receipt and accepts the same explicit retry',async()=>{
 let count=0;const seen=[];const db={rpc:async(n,a)=>{seen.push(a);if(++count===1)throw Error('synthetic lost response');return{data:{...receipt(),replayed:true}};}};
 const first=await run({operation:'link',db});assert.equal(first.code,503);
 const retry=await run({operation:'link',db});assert.equal(retry.code,200);assert.equal(retry.body.replayed,true);assert.deepEqual(seen[0],seen[1]);
});
