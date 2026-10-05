'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,id}=require('./marketingAutomation.trial.fixture');
const {operationsFixture}=require('./marketingAutomation.operations.fixture');
const {reportCohortOperations,createCohortOperations}=require('../src/modules/marketingAutomation/cohortOperations');
function sample(){const facts=fixture(),operations=operationsFixture();operations.identity=facts.identity;return{policy:'MARKETING_COHORT_OPERATIONS_V1',companyId:facts.companyId,actorId:id(50),trialId:facts.trial.id,asOf:facts.asOf,facts,operations};}
test('paid acquisition cohort keeps current appointments and deduplicates overlapping pending work',()=>{
 const r=reportCohortOperations(sample());assert.equal(r.counts.observedPaidGroups,6);assert.equal(r.counts.qualifiedGroups,4);assert.equal(r.counts.pendingQualificationGroups,1);
 assert.equal(r.counts.withoutCareGroups,1);assert.equal(r.counts.waitingGroups,5);assert.equal(r.counts.bookedGroups,4);assert.equal(r.counts.upcoming,2);
 assert.equal(r.appointments.length,4);assert.equal(r.attention.filter(x=>x.groupId===id(5)).length,2);assert.equal(r.allowBudgetExecution,false);assert.equal(r.providerUniverseVerified,false);
});
test('no care at all is visible; rejected needs do not create unsolicited follow-up tasks',()=>{
 const x=sample();x.operations.threads=[];x.operations.bookings=[];const r=reportCohortOperations(x);
 assert.equal(r.counts.withoutCareGroups,5);assert.equal(r.counts.waitingGroups,5);assert.equal(r.counts.bookedGroups,0);assert.ok(!r.attention.some(a=>a.leadId===id(6)));
});
test('appointment after trial end remains attributed to the original acquisition cohort',()=>{
 const x=sample();x.operations.bookings[0].appointment.startsAt='2027-01-01T00:00:00Z';x.operations.bookings[0].appointment.endsAt='2027-01-01T01:00:00Z';
 const r=reportCohortOperations(x);assert.equal(r.appointmentTotal,4);assert.equal(r.appointments.find(a=>a.id===id(301)).status,'UPCOMING');
});
test('verified identity joins care on another member without duplicating customers or bookings',()=>{
 const x=sample();x.facts.identity.edges=[{leftLeadId:id(1),rightLeadId:id(2),active:true,revision:1,evidenceId:id(900),leftContext:'a'.repeat(32),rightContext:'a'.repeat(32)}];
 const r=reportCohortOperations(x);assert.equal(r.counts.observedPaidGroups,5);assert.equal(r.counts.bookedGroups,3);assert.equal(r.counts.waitingGroups,4);assert.equal(r.appointmentTotal,4);
 x.operations.threads=x.operations.threads.filter(t=>t.leadId!==id(1));x.operations.bookings=x.operations.bookings.filter(b=>b.leadId!==id(1));
 assert.equal(reportCohortOperations(x).counts.withoutCareGroups,1);
});
test('old, organic, unknown and ambiguous identity remain outside paid totals with visible exclusions',()=>{
 for(const [mutate,key]of[[x=>x.facts.qualities[0].firstKnownAt='2026-09-01T00:00:00Z','existingGroups'],[x=>x.facts.sources[0].source='ORGANIC','organicGroups'],[x=>x.facts.sources[0].source='UNKNOWN','unknownSourceGroups'],[x=>x.facts.identity.members[0].reviewRequired=true,'unresolvedGroups']]){
  const x=sample();mutate(x);const r=reportCohortOperations(x);assert.equal(r.excluded[key],1);assert.equal(r.counts.observedPaidGroups,5);assert.equal(r.appointmentTotal,3);assert.equal(r.excluded.companyBookingsNotAttributed,1);
 }
});
test('STOP suppresses contact work while preserving confirmed survey obligations; acknowledgement is not completion',()=>{
 const x=sample();x.operations.threads.forEach(t=>{t.mode='OPTED_OUT';});const r=reportCohortOperations(x);
 assert.equal(r.attention.some(a=>a.kind==='CARE'),false);assert.equal(r.counts.optedOut,4);assert.equal(r.counts.bookedGroups,4);assert.equal(r.counts.pastDue,1);assert.equal(r.completedSurveys,undefined);
});
test('opaque mappings are never assigned to a cohort or returned as contact details',()=>{
 const x=sample();x.operations.threads[0]={id:id(201),scopeReady:false,leadId:null,mode:null,ownerReady:false,handlerReady:false,ownerId:null,claimedBy:null,regionId:null,humanDeadline:null,lastInboundAt:null,lastOutboundAt:null};
 x.operations.bookings[0]={id:id(301),scopeReady:false,leadId:null,threadId:null,state:null,assigned:false,unchanged:false,recipientId:null,appointment:null,receipt:null,deliveryConflict:null};
 const r=reportCohortOperations(x);assert.equal(r.excluded.companyThreadsNotAttributed,1);assert.equal(r.excluded.companyBookingsNotAttributed,1);assert.equal(r.counts.withoutCareGroups,2);
 const text=JSON.stringify(r);for(const value of ['090123456','Synthetic location','contacts','psid'])assert.ok(!text.includes(value));
});
test('filtering precedes attention truncation and totals use every obligation',()=>{
 const x=sample();const outside={...x.operations.threads[0],leadId:id(6)};x.facts.sources[5].source='ORGANIC';
 x.operations.threads.push(...Array.from({length:70},(_,i)=>({...outside,id:id(1000+i)})));let r=reportCohortOperations(x);assert.equal(r.counts.threads,4);assert.equal(r.excluded.companyThreadsNotAttributed,70);
 x.operations.threads.push(...Array.from({length:70},(_,i)=>({...x.operations.threads[0],id:id(2000+i)})));r=reportCohortOperations(x);assert.equal(r.counts.threads,74);assert.equal(r.counts.waitingGroups,5);assert.equal(r.attention.length,50);assert.ok(r.attentionTotal>70);
});
test('changed appointment with missing end remains an exception',()=>{const x=sample();x.operations.bookings[0].unchanged=false;x.operations.bookings[0].appointment.endsAt=null;const r=reportCohortOperations(x);assert.equal(r.counts.changedAppointments,1);assert.equal(r.appointments.find(a=>a.id===id(301)).status,'CHANGED');});
for(const [name,mutate]of[
 ['different actor',x=>x.operations.actorId=id(99)],['different company',x=>x.operations.companyId=id(99)],['different trial',x=>x.trialId=id(99)],
 ['mixed read time',x=>x.operations.asOf='2026-10-03T00:00:00Z'],['mixed identity',x=>{x.operations.identity=structuredClone(x.facts.identity);x.operations.identity.graphRevision++;}],
 ['partial care source',x=>x.operations.complete=false],['partial trial source',x=>x.facts.complete=false],['bad unrelated care',x=>x.operations.threads.push({id:id(99)})]
])test('reject '+name,()=>{const x=sample();mutate(x);assert.throws(()=>reportCohortOperations(x),e=>e.status===503);});
const req=()=>({user:{userId:id(50)},query:{company_id:id(100)},params:{trialId:id(101)}}),res=()=>({statusCode:200,set(){return this;},status(s){this.statusCode=s;return this;},json(v){this.body=v;return this;}});
const env={VPT_MARKETING_COHORT_OPERATIONS:'1',VPT_MARKETING_TRIAL_REPORT:'1'};
test('endpoint is default off, primary only and rejects extra date/page/actor filters',async()=>{
 for(const config of [{env:{}},{env,isPrimary:()=>false}]){const r=res();await createCohortOperations({db:{rpc:()=>assert.fail('DB')},isPrimary:()=>true,...config})(req(),r);assert.equal(r.statusCode,503);}
 for(const key of ['since','page_id','actorId']){const q=req();q.query[key]='untrusted';const r=res();await createCohortOperations({db:{rpc:()=>assert.fail('DB')},isPrimary:()=>true,env})(q,r);assert.equal(r.statusCode,400);}
});
test('endpoint derives actor/company/trial from authenticated request and rechecks scope after read',async()=>{
 let args;const r=res();await createCohortOperations({db:{rpc:async(n,a)=>{args={n,a};return{data:sample()};}},isPrimary:()=>true,env})(req(),r);
 assert.equal(r.statusCode,200);assert.deepEqual(args,{n:'marketing_cohort_operations_snapshot',a:{p_actor:id(50),p_company:id(100),p_trial:id(101)}});
 for(const response of [{error:{code:'42501'}},{error:{code:'XX000'}},{error:{code:'P0002'}},{data:{...sample(),actorId:id(99)}}]){const out=res();await createCohortOperations({db:{rpc:async()=>response},isPrimary:()=>true,env})(req(),out);assert.ok([403,404,503].includes(out.statusCode));assert.equal(out.body.counts,undefined);}
});
test('frontend rejects scope mismatch and malformed counts instead of rendering a prior cohort',async()=>{
 const {cohortOperationsResult}=await import('../../frontend/src/components/marketing/cohortOperationsState.mjs');const r=reportCohortOperations(sample());assert.equal(cohortOperationsResult(r,id(100),id(50),id(101)),r);
 for(const mutate of [x=>x.actorId=id(99),x=>x.trialId=id(99),x=>x.counts.waitingGroups=7,x=>x.counts.upcoming++,x=>x.aiMaySend=true,x=>x.attentionTotal++,x=>x.appointments[0].status='COMPLETED']){const x=structuredClone(r);mutate(x);assert.throws(()=>cohortOperationsResult(x,id(100),id(50),id(101)));}
});
module.exports={sample};
