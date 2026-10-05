'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateRun,journalResponse}=require('../src/helpers/facebookBatchJournal');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),company=id(2),request=id(3),contact=id(4),lead=id(5);
const review=()=>({policy:'FACEBOOK_BATCH_LINK_RECONCILIATION_V1',commandId:id(6),recordedAt:'2026-10-04T00:00:00Z',
 linkVerified:true,claimRetained:true,businessReconciled:false,processesDrained:false});
const view=()=>({policy:'FACEBOOK_BATCH_JOURNAL_V1',actorId:actor,companyId:company,requestId:request,state:'REVIEW',
 createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:01Z',items:[{contactId:contact,state:'RECONCILED_LINKED',
 result:{contact_id:contact,status:'linked',lead_id:lead},reconciliation:review()}]});
const ui=import('../../frontend/src/components/facebook/batchRecoveryState.mjs');
test('observed link is distinct from a successful creator or completed business run',async()=>{
 const r=validateRun(view(),actor,company,request),response=journalResponse(r),m=await ui;
 assert.equal(response.status,202);assert.equal(response.body.reconciliation_required,true);assert.equal(response.body.processed,0);
 assert.equal(response.body.reconciled_links,1);assert.equal(response.body.failed,0);assert.equal(m.journalSettled(m.validateJournal(r,actor,company,request)),false);
});
for(const [key,value]of[['claimRetained',false],['businessReconciled',true],['processesDrained',true],['linkVerified',false],['commandId','bad'],['recordedAt','bad'],['policy','unknown']]){
 test('untrusted link receipt cannot change '+key,async()=>{const r=view();r.items[0].reconciliation[key]=value;
  const m=await ui;assert.throws(()=>validateRun(r,actor,company,request));assert.throws(()=>m.validateJournal(r,actor,company,request));
 });
}
test('backend strips operator references and snapshot from the public response',()=>{
 const r=view();Object.assign(r.items[0].reconciliation,{releaseReference:'PRIVATE',snapshot:'PRIVATE',operatorName:'PRIVATE'});
 assert.ok(!JSON.stringify(validateRun(r,actor,company,request)).includes('PRIVATE'));
});
test('reconciled link requires exact contact and lead and never enters COMPLETED',async()=>{
 const m=await ui;
 for(const mutate of [r=>{r.state='COMPLETED';},r=>{r.items[0].result.lead_id=null;},r=>{r.items[0].result.contact_id=id(99);},r=>{delete r.items[0].reconciliation;}]){
  const r=view();mutate(r);assert.throws(()=>validateRun(r,actor,company,request));assert.throws(()=>m.validateJournal(r,actor,company,request));
 }
});
test('reload only reads the reconciled history and cannot clear pending as fully complete',async()=>{
 const m=await ui,values=new Map(),calls=[],storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const p={actorId:actor,companyId:company,requestId:request,contactIds:[contact]};m.savePending(storage,p);
 const c=m.createRecoveryController({actor,company,storage,isCurrent:()=>true,update:()=>{},newId:()=>id(8),
  send:async method=>{calls.push(method);return{ok:true,data:{journal:view()}};}});
 await c.refresh();c.acknowledge();assert.deepEqual(calls,['GET']);assert.deepEqual(m.readPending(storage,actor,company),p);
});
