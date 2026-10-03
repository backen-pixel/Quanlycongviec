'use strict';
const {context:base,id}=require('./marketingAutomation.measurementSnapshot.fixture');
const {provider}=require('./marketingAutomation.accountDelivery.fixture');
const {readAccountSpendWithDelivery}=require('../src/modules/marketingAutomation/facebookAccountDelivery');
const {POLICY,CLAIMS,keyOf}=require('../src/modules/marketingAutomation/scopeAcceptance');
async function context(){
 const c=base(),f=c.facts;
 f.qualities[4].evidence={...f.qualities[5].evidence,id:id(905)};
 f.providerReconciliation.run.witness={status:'TRAVERSED',pagesDigest:'d'.repeat(64)};
 const entries=[{accountId:'act_1',kind:'META_LEAD_ADS',pageId:'123',formId:'456',destination:null},
  {accountId:'act_2',kind:'NO_LEAD_SOURCE',pageId:null,formId:null,destination:'Synthetic awareness only; no intake destination.'}];
 f.sourceRegistry={version:1,companyId:f.companyId,trialId:f.trial.id,asOf:f.asOf,inventoryVersion:'d'.repeat(64),status:'CURRENT',providerCoverage:'UNVERIFIED',allowBudgetExecution:false,
  inventory:{trial:f.trial,accounts:f.accounts.map(a=>({id:a.ad_account_id,active:true,expiresAt:null})),pages:[{pageId:'123',active:true}],knownForms:[{pageId:'123',formId:'456',accountId:'act_1',bindingActive:true}]},
  declaration:{revision:1,trialRevision:1,accountIds:f.trial.account_ids,entries,sourceReference:'Synthetic evidence bundle',sourceDate:'2026-10-02',sourceNote:'Isolated evidence with no real account data.',declarationDigest:'e'.repeat(64),recordedBy:c.actorId,recordedAt:f.asOf},gaps:[{code:'ENTRYPOINT_COVERAGE_UNVERIFIED'}]};
 f.accountDelivery=[];
 for(const account of f.trial.account_ids){
  const run=f.runs.find(r=>r.ad_account_id===account),snapshot=await readAccountSpendWithDelivery(provider({account}).input);
  run.since=run.until='2026-10-01';run.snapshot=snapshot;
  f.accountDelivery.push({accountId:account,companyId:f.companyId,runId:run.id,recordedAt:f.asOf,payloadDigest:'f'.repeat(64),payload:snapshot.delivery});
 }
 const request=id(920),comparison={rows:6,inPeriodRows:6,outsidePeriodRows:0,uniqueExportIds:6,duplicateRows:0,observedIds:6,matched:6,notInExport:0,notObserved:0,conflicts:0,differences:[]};
 const result={policy:'SOURCE_EXPORT_COMPARISON_V1',requestId:request,companyId:f.companyId,trialId:f.trial.id,pageId:'123',formId:'456',status:'MATCHED_EXPORTED_IDS',fileSha256:'1'.repeat(64),normalizedRowsDigest:'2'.repeat(64),
  censusRunId:f.providerReconciliation.run.id,pagesDigest:'d'.repeat(64),registryDigest:'e'.repeat(64),sinceAt:f.providerReconciliation.run.since,untilExclusive:f.providerReconciliation.run.until,sourceReference:'Synthetic exact source file',exportedAt:f.asOf,comparison};
 c.exports=[{requestId:request,pageId:'123',formId:'456',status:result.status,currentStatus:'CURRENT',fileSha256:result.fileSha256,normalizedRowsDigest:result.normalizedRowsDigest}];
 c.exportDetails=[{requestId:request,result}];
 return c;
}
function request(c,revision=0){return{requestId:id(930),artifactBase64:Buffer.from('Synthetic historical destination and export provenance.').toString('base64'),command:{action:'ACCEPT',expectedRevision:revision,contextVersion:c.contextVersion,
 reference:'Synthetic evidence bundle',note:'Verified historical destinations and all source export filters for this isolated fixture.',claims:[...CLAIMS],
 manifest:c.facts.accountDelivery.flatMap(e=>[...new Set(e.payload.adDays.map(d=>d.adId))].map(adId=>({accountId:e.accountId,adId,validFrom:c.facts.providerReconciliation.run.since,validUntil:c.facts.providerReconciliation.run.until,
  destinations:c.facts.sourceRegistry.declaration.entries.filter(x=>x.accountId===e.accountId).map(keyOf)}))),
 exportClaims:c.exports.map(e=>({requestId:e.requestId,fileSha256:e.fileSha256,normalizedRowsDigest:e.normalizedRowsDigest}))}};}
function receipt(c,parsed,report){const q=parsed.command;return{policy:POLICY,requestId:parsed.requestId,companyId:c.companyId,trialId:c.trialId,actorId:c.actorId,revision:q.expectedRevision+1,action:q.action,contextVersion:q.contextVersion||null,
 recordedAt:'2026-10-02T00:00:01Z',artifactSha256:q.artifactSha256||null,artifactBytes:q.artifactBytes||null,targetRequestId:q.targetRequestId||null,report,replayed:false,allowBudgetExecution:false};}
module.exports={context,request,receipt,id};
