'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),company=id(2),request=id(3),contacts=[id(4),id(5)];
const modulePromise=import('../../frontend/src/components/facebook/batchRecoveryState.mjs');
function memory(){const entries=new Map();return{getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};}
const run=(state='COMPLETED',requestId=request)=>({policy:'FACEBOOK_BATCH_JOURNAL_V1',actorId:actor,companyId:company,requestId,state,
 items:contacts.map(contactId=>({contactId,state:state==='COMPLETED'?'LINKED':'UNKNOWN'}))});
async function setup({storage=memory(),send=async()=>({ok:true,data:{journal:run()}}),current=()=>true,who=actor,cid=company}={}){
 const api=await modulePromise,states=[],calls=[];const controller=api.createRecoveryController({actor:who,company:cid,storage,newId:()=>request,
  send:async(...args)=>{calls.push(args);return send(...args);},isCurrent:current,update:x=>states.push(x)});
 return{api,storage,states,calls,controller};
}
test('UI saves exact immutable selection before POST and keeps request until acknowledgement',async()=>{
 const h=await setup();await h.controller.start(contacts);assert.equal(h.calls[0][0],'POST');
 assert.deepEqual(h.calls[0][1],{actorId:actor,companyId:company,requestId:request,contactIds:contacts});
 assert.ok(h.api.readPending(h.storage,actor,company));assert.equal(h.states.at(-1).run.state,'COMPLETED');
 h.controller.acknowledge();assert.equal(h.api.readPending(h.storage,actor,company),null);
});
test('lost response followed by reload reads the saved request without posting again',async()=>{
 const first=await setup({send:async()=>{throw Error('lost response');}});await first.controller.start(contacts);
 const second=await setup({storage:first.storage});await second.controller.refresh();
 assert.equal(second.calls.length,1);assert.equal(second.calls[0][0],'GET');assert.equal(second.calls[0][1].requestId,request);
 assert.equal(second.states.at(-1).run.state,'COMPLETED');
});
test('explicit resend preserves UUID and IDs; a different visible selection cannot replace it',async()=>{
 const h=await setup({send:async()=>({ok:false,data:{error:'network uncertain'}})});await h.controller.start(contacts);await h.controller.resend();
 assert.deepEqual(h.calls[0],h.calls[1]);await h.controller.start([id(90)]);assert.equal(h.calls.length,2);
});
test('UNKNOWN survives reload and cannot be acknowledged as complete',async()=>{
 const h=await setup({send:async()=>({ok:true,data:{journal:run('REVIEW')}})});await h.controller.start(contacts);h.controller.acknowledge();
 assert.ok(h.api.readPending(h.storage,actor,company));assert.equal(h.states.at(-1).run.state,'REVIEW');
});
test('in-flight request prevents a second dispatch',async()=>{
 let release;const h=await setup({send:()=>new Promise(resolve=>{release=resolve;})});const pending=h.controller.start(contacts);
 await h.controller.resend();await h.controller.start([id(91)]);assert.equal(h.calls.length,1);
 release({ok:true,data:{journal:run()}});await pending;
});
test('old scope results cannot publish or acknowledge',async()=>{
 let live=true,release;const h=await setup({current:()=>live,send:()=>new Promise(resolve=>{release=resolve;})});const pending=h.controller.start(contacts);
 const before=h.states.length;live=false;release({ok:true,data:{journal:run()}});await pending;
 assert.equal(h.states.length,before);h.controller.acknowledge();assert.ok(h.api.readPending(h.storage,actor,company));
});
test('pending storage is isolated by actor and company',async()=>{
 const h=await setup();await h.controller.start(contacts);
 for(const [who,cid]of[[id(10),company],[actor,id(11)]]){const other=await setup({storage:h.storage,who,cid});await other.controller.refresh();assert.equal(other.calls.length,0);}
});
test('storage write failure blocks dispatch',async()=>{
 const storage=memory();storage.setItem=()=>{throw Error('storage blocked');};const h=await setup({storage});
 await assert.rejects(h.controller.start(contacts),/storage blocked/);assert.equal(h.calls.length,0);
});
test('invalid local state blocks writes but permits read-only history inspection',async()=>{
 const storage={getItem:()=>'{bad',setItem:()=>{},removeItem:()=>{}};const h=await setup({storage});
 assert.equal(h.controller.initial().storageFailed,true);await assert.rejects(h.controller.start(contacts));assert.equal(h.calls.length,0);
 await h.controller.inspect(request);assert.equal(h.calls[0][0],'GET');assert.equal(h.states.at(-1).run.state,'COMPLETED');
});
for(const change of ['actor','company','request','selection','premature complete'])test('mismatched response stays unresolved: '+change,async()=>{
 const data=run();if(change==='actor')data.actorId=id(90);if(change==='company')data.companyId=id(90);if(change==='request')data.requestId=id(90);
 if(change==='selection')data.items[0].contactId=id(90);if(change==='premature complete')data.items[0].state='UNKNOWN';
 const h=await setup({send:async()=>({ok:true,data:{journal:data}})});await h.controller.start(contacts);
 assert.equal(h.states.at(-1).run,null);assert.ok(h.states.some(x=>x.error));assert.ok(h.api.readPending(h.storage,actor,company));
});
test('another saved request cannot be overwritten or cleared',async()=>{
 const h=await setup();await h.controller.start(contacts);const existing=h.api.readPending(h.storage,actor,company);
 assert.throws(()=>h.api.savePending(h.storage,{...existing,requestId:id(99)}));assert.throws(()=>h.api.clearPending(h.storage,{...existing,requestId:id(99)}));
});
test('reading another historical run cannot acknowledge the current pending request',async()=>{
 let response=run();const h=await setup({send:async()=>({ok:true,data:{journal:response}})});await h.controller.start(contacts);
 response=run('COMPLETED',id(99));await h.controller.inspect(id(99));h.controller.acknowledge();assert.ok(h.api.readPending(h.storage,actor,company));
});
for(const reason of ['403','503','mismatch'])test('successful old result is removed when revalidation fails: '+reason,async()=>{
 let response={ok:true,data:{journal:run()}};const h=await setup({send:async()=>response});await h.controller.start(contacts);
 response=reason==='mismatch'?{ok:true,data:{journal:{...run(),companyId:id(99)}}}:{ok:false,data:{error:reason}};
 await h.controller.refresh();assert.equal(h.states.at(-1).run,null);h.controller.acknowledge();assert.ok(h.api.readPending(h.storage,actor,company));
});
