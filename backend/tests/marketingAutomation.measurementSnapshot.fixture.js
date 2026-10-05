'use strict';
const {fixture,id}=require('./marketingAutomation.trial.fixture');
function context(){
 const f=fixture();f.runs.forEach(r=>r.snapshot.days[0].amountVnd=500000);
 f.providerReconciliation={version:2,companyId:f.companyId,trialId:f.trial.id,status:'AVAILABLE',complete:true,run:{id:id(801),state:'SCANNED',trialRevision:1,scopeCurrent:true,tasksPending:0,since:'2026-09-30T17:00:00Z',until:'2026-10-01T17:00:00Z',recoveryUntil:'2026-10-01T18:00:00Z',startedAt:'2026-10-01T18:00:00Z',finishedAt:'2026-10-01T19:00:00Z',measurementPolicy:'VIETNAM_CLOSED_DAY_V1'},forms:[{pageId:'123',formId:'456',discovered:true,expiredLeads:0}],observations:[],items:f.sources.map(s=>({...s.proof,receiptId:s.receiptId}))};
 return{actorId:id(800),companyId:f.companyId,trialId:f.trial.id,contextVersion:'a'.repeat(64),facts:f,exports:[],dependencies:Object.fromEntries(['trial','identity','qualification','spend','source','registry','exports','exportContext'].map(k=>[k,'b'.repeat(64)])),history:[]};
}
function receipt(c,report,request=id(900)){return{policy:'MARKETING_MEASUREMENT_SNAPSHOT_V1',companyId:c.companyId,trialId:c.trialId,actorId:c.actorId,requestId:request,contextVersion:c.contextVersion,capturedAt:report.asOf,recordedAt:'2026-10-02T00:00:01Z',calculationVersion:'OBSERVED_TRIAL_REPORT_V1',reportDigest:'c'.repeat(64),report,replayed:false,allowBudgetExecution:false};}
module.exports={context,receipt,id};

