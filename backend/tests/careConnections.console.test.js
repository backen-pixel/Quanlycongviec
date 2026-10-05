'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCareConnections,choices,closure,projection}=require('../src/modules/marketingAutomation/careConnections');
const {id}=require('./marketingAutomation.trial.fixture');
const actor=id(1),company=id(2),thread=id(3),lead=id(4),request=id(5),message=id(6);
const command=()=>({threadId:thread,leadId:lead,expectedVersion:'a'.repeat(32),evidenceMessageId:message,identityConfirmed:true,reason:'Synthetic operator identity confirmation'});
const pending=()=>({actorId:actor,companyId:company,threadId:thread,requestId:request,intent:'LINK',command:command()});
const list=()=>({policy:'CARE_CONNECTION_CHOICES_V1',actorId:actor,companyId:company,threadId:thread,search:'Khách',observedAt:'2026-10-03T01:00:00Z',careMode:'WAITING',hasMore:false,sendAllowed:false,automaticallyVerified:false,
 items:[{id:lead,code:null,title:'Synthetic Lead',customerName:'Khách giả',phone:null,ownerName:null,regionName:null}]});
const closed=(status='CANCELLED')=>({policy:'CARE_CONNECTION_CLOSURE_V1',actorId:actor,companyId:company,threadId:thread,requestId:request,status,sendAllowed:false,automaticallyVerified:false});
const receipt=()=>({policy:'CARE_CONNECTION_V1',actorId:actor,companyId:company,threadId:thread,requestId:request,leadId:lead,contactId:id(7),currentLink:true,replayed:true,careMode:'OPTED_OUT',sendAllowed:false,automaticallyVerified:false});
const input=()=>({user:{userId:actor},query:{companyId:company,threadId:thread,search:'  Khách  '},body:{companyId:company,requestId:request,command:command()}});
const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(x){this.code=x;return this;},json(x){this.body=x;return this;}});
async function run({operation='choices',req=input(),db={rpc:async()=>({data:list()})},env={VPT_CARE_CONNECTIONS:'1'},isPrimary=()=>true}={}){
 const res=response();await createCareConnections({db,env,isPrimary}).handle(req,res,operation);return res;
}
const state=()=>import('../../frontend/src/components/facebook/careConnectionState.mjs');
function memory(){const map=new Map();return{map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}

test('search uses session actor, exact company/thread and trimmed literal text; performs no write',async()=>{
 let calls=0;const res=await run({db:{rpc:async(name,args)=>{calls++;assert.equal(name,'crm_care_connection_choices');assert.deepEqual(args,{p_actor:actor,p_company:company,p_thread:thread,p_search:'Khách'});return{data:list()};}}});
 assert.equal(res.code,200);assert.equal(calls,1);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.body.automaticallyVerified,false);
});
test('empty, oversized, injected identity and invalid scopes never reach search RPC',async()=>{
 for(const change of [x=>x.query.search=' ',x=>x.query.search='a',x=>x.query.search='a'.repeat(101),x=>x.query.search=['Khách'],x=>x.query.actorId=id(9),x=>x.query.threadId='invalid',x=>x.user={},x=>x.user.id=id(9)]){
  const req=input();change(req);const res=await run({req,db:{rpc:()=>assert.fail('invalid request queried CRM')}});assert.ok([400,403].includes(res.code));
 }
});
test('new search and closure retain default-off/Primary checks, including a midflight switch',async()=>{
 for(const operation of ['choices','close']){
  for(const cfg of [{env:{}},{isPrimary:()=>false}])assert.equal((await run({operation,...cfg,db:{rpc:()=>assert.fail()}})).code,503);
  let primary=true;const res=await run({operation,isPrimary:()=>primary,db:{rpc:async()=>{primary=false;return{data:operation==='close'?closed():list()};}}});
  assert.equal(res.code,503);assert.equal(res.body.items,undefined);assert.equal(res.body.status,undefined);
 }
});
test('candidate projection strips extra private fields and preserves missing phone as unknown',async()=>{
 const x=list();x.token='PRIVATE';x.items[0].source={value:'PRIVATE'};const out=choices(x,actor,company,thread,'Khách');
 assert.ok(!JSON.stringify(out).includes('PRIVATE'));assert.equal(out.items[0].phone,null);
 const s=await state();assert.equal(s.connectionChoices(out,actor,company,thread,'Khách'),out);
});
test('backend and frontend reject wrong scope, partial pages and malformed candidate responses',async()=>{
 const s=await state();
 for(const change of [x=>x.actorId=id(9),x=>x.companyId=id(9),x=>x.threadId=id(9),x=>x.search='Other',x=>x.hasMore=true,x=>x.observedAt='bad',x=>x.sendAllowed=true,x=>x.automaticallyVerified=true,x=>x.items.push(x.items[0]),x=>x.items[0].phone=123,x=>x.items=[null],x=>x.items=Array(21).fill(x.items[0])]){
  const x=list();change(x);assert.throws(()=>choices(x,actor,company,thread,'Khách'));assert.throws(()=>s.connectionChoices(x,actor,company,thread,'Khách'));
 }
 const empty={...list(),items:[]};assert.equal(choices(empty,actor,company,thread,'Khách').items.length,0);
 const full=list();full.items=Array.from({length:20},(_,i)=>({...full.items[0],id:id(30+i)}));full.hasMore=true;assert.equal(choices(full,actor,company,thread,'Khách').items.length,20);
});
test('closure sends the exact original command and never unlinks or reopens contact',async()=>{
 for(const status of ['CANCELLED','ALREADY_RECORDED']){
  let calls=0;const req=input();const res=await run({operation:'close',req,db:{rpc:async(name,args)=>{calls++;assert.equal(name,'crm_care_connection_close');assert.deepEqual(args,{p_actor:actor,p_company:company,p_request:request,p_command:req.body.command});return{data:closed(status)};}}});
  assert.equal(calls,1);assert.equal(res.code,200);assert.equal(res.body.status,status);assert.equal(res.body.sendAllowed,false);
 }
});
test('closure validates identity attestation and receipt scope; uncertain results are not success',async()=>{
 const req=input();req.body.command.identityConfirmed=false;assert.equal((await run({operation:'close',req,db:{rpc:()=>assert.fail()}})).code,400);
 for(const change of [x=>x.actorId=id(9),x=>x.companyId=id(9),x=>x.threadId=id(9),x=>x.requestId=id(9),x=>x.status='UNKNOWN',x=>x.sendAllowed=true,x=>x.automaticallyVerified=true]){
  const x=closed();change(x);assert.throws(()=>closure(x,actor,company,thread,request));const res=await run({operation:'close',db:{rpc:async()=>({data:x})}});assert.equal(res.code,503);assert.equal(res.body.status,undefined);
 }
});
test('cancelled request has a specific conflict reason; stale context is not proof of cancellation',async()=>{
 for(const [code,status,reason]of [['P6801',409,'REQUEST_CANCELLED'],['40001',409,'CONTEXT_CHANGED'],['23505',409,undefined],['42501',403,undefined],['XX000',503,undefined]]){
  const res=await run({operation:'link',db:{rpc:async()=>({error:{code,message:'PRIVATE'}})}});assert.equal(res.code,status);assert.equal(res.body.reason,reason);assert.ok(!JSON.stringify(res.body).includes('PRIVATE'));
 }
});
test('lost closure response retries one immutable request and never falls back to link',async()=>{
 const seen=[];const db={rpc:async(name,args)=>{seen.push({name,args});if(seen.length===1)throw Error('lost acknowledgement');return{data:closed('ALREADY_RECORDED')};}};
 assert.equal((await run({operation:'close',db})).code,503);assert.equal((await run({operation:'close',db})).body.status,'ALREADY_RECORDED');assert.deepEqual(seen[0],seen[1]);assert.equal(seen[0].name,'crm_care_connection_close');
});
test('reload keeps the original request and isolates actor, company and thread',async()=>{
 const s=await state(),storage=memory(),p=pending();const saved=s.saveConnectionPending(storage,p);p.command.reason='Changed locally after persistence';
 assert.notEqual(saved.command.reason,p.command.reason);assert.deepEqual(s.readConnectionPending(storage,actor,company,thread),saved);
 for(const scope of [[id(9),company,thread],[actor,id(9),thread],[actor,company,id(9)]])assert.equal(s.readConnectionPending(storage,...scope),null);
 assert.equal(storage.map.size,1);
});
test('closure intent persists before submission and remains CLOSE after reload or repeated close',async()=>{
 const s=await state(),storage=memory(),p=pending();s.saveConnectionPending(storage,p);const next=s.closeConnectionPending(storage,p);
 assert.equal(next.intent,'CLOSE');assert.deepEqual(next.command,p.command);assert.equal(next.requestId,p.requestId);
 assert.deepEqual(s.readConnectionPending(storage,actor,company,thread),next);assert.deepEqual(s.closeConnectionPending(storage,next),next);
});
test('corrupt, wrong-scope or extended stored commands fail closed without being discarded',async()=>{
 const s=await state();
 for(const change of [x=>x.actorId=id(9),x=>x.command.threadId=id(9),x=>x.command.identityConfirmed=false,x=>x.command.expectedVersion='bad',x=>x.command.actorId=actor,x=>x.intent='RETRY_AS_NEW',x=>x.command.reason='short',x=>x.requestId='bad']){
  const p=pending();change(p);const raw=JSON.stringify(p),storage={getItem:()=>raw,removeItem:()=>assert.fail('must retain unresolved request')};assert.throws(()=>s.readConnectionPending(storage,actor,company,thread));
 }
 assert.throws(()=>s.readConnectionPending({getItem:()=>'{broken'},actor,company,thread));
});
test('mismatched receipts cannot clear pending state; historical STOP receipt grants no send authority',async()=>{
 const s=await state(),storage=memory(),p=s.saveConnectionPending(storage,pending());
 for(const change of [x=>x.actorId=id(9),x=>x.companyId=id(9),x=>x.threadId=id(9),x=>x.requestId=id(9),x=>x.leadId=id(9),x=>x.currentLink=null,x=>x.sendAllowed=true]){
  const x=receipt();change(x);assert.throws(()=>s.connectionReceipt(x,p));assert.deepEqual(s.readConnectionPending(storage,actor,company,thread),p);
 }
 assert.equal(s.connectionReceipt(receipt(),p).careMode,'OPTED_OUT');assert.equal(s.connectionReceipt(receipt(),p).sendAllowed,false);
 for(const change of [x=>x.actorId=id(9),x=>x.companyId=id(9),x=>x.threadId=id(9),x=>x.requestId=id(9),x=>x.status='UNKNOWN',x=>x.automaticallyVerified=true]){const x=closed();change(x);assert.throws(()=>s.connectionClosure(x,p));}
 assert.equal(s.connectionClosure(closed('ALREADY_RECORDED'),p).status,'ALREADY_RECORDED');s.clearConnectionPending(storage,p);assert.equal(s.readConnectionPending(storage,actor,company,thread),null);
});
test('failed storage writes cannot manufacture a saved command or a completed close',async()=>{
 const s=await state(),storage={setItem:()=>{throw Error('storage unavailable');}};assert.throws(()=>s.saveConnectionPending(storage,pending()));assert.throws(()=>s.closeConnectionPending(storage,pending()));
 const p=pending();assert.equal(p.intent,'LINK');assert.throws(()=>s.clearConnectionPending({removeItem:()=>{throw Error('storage unavailable');}},p));
});
test('Lead-only legacy links are not complete; conflicting links cannot claim completion',async()=>{
 const s=await state(),base={...receipt(),version:'a'.repeat(32),canLink:true,alreadyLinked:true,mappingComplete:false,requiresIdentityEvidence:true,
  lead:{id:lead,code:null,title:'Synthetic partial link',customerName:'Synthetic customer',phone:null},messages:[]};
 for(const item of [base,{...base,canLink:false},{...base,mappingComplete:true}]){
  const out=projection(item,actor,company,thread,lead);assert.equal(out.mappingComplete,item.mappingComplete);assert.equal(s.connectionView(out,actor,company,thread,lead).canLink,item.canLink);
 }
 for(const item of [{...base,mappingComplete:undefined},{...base,mappingComplete:true,canLink:false},{...base,mappingComplete:true,alreadyLinked:false}]){
  assert.throws(()=>projection(item,actor,company,thread,lead));assert.throws(()=>s.connectionView(item,actor,company,thread,lead));
 }
});
