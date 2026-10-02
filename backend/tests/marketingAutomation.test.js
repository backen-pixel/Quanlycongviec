'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { APPROVED_PLAN, evaluateBudgetMove, humanDeadline } = require('../src/modules/marketingAutomation/policy');
const { measureTrial } = require('../src/modules/marketingAutomation/measurement');
const { decideCare, renderApprovedContent } = require('../src/modules/marketingAutomation/customerCare');
const { createCommandService, commandDigest } = require('../src/modules/marketingAutomation/commandService');
const { createCommandRepository } = require('../src/modules/marketingAutomation/commandRepository');
function move() { return { now:'2026-10-10T00:00:00Z',trialStart:'2026-10-01T00:00:00Z',policyVersion:APPROVED_PLAN.version,
  authorized:true,released:true,companyId:'vpt',authorizedCompanyId:'vpt',region:'hcm',destinationRegion:'hcm',sourceChannel:'facebook',destinationChannel:'google',
  currency:'VND',coverage:'COMPLETE',spendFresh:true,intakeHealthy:true,platformCapVerified:true,sourceProductGroup:'kitchen',destinationProductGroup:'kitchen',
  sourceQualifiedLeads:10,destinationQualifiedLeads:10,sourceObservedDays:7,destinationObservedDays:7,basis:'QUALIFIED_SURVEY_EXPERIMENT',destinationImproved:true,
  amountVnd:100000,sourceDailyVnd:1000000,destinationDailyVnd:2000000,totalExposureAfterVnd:100000000,regionExposureAfterVnd:80000000,decreaseConfirmed:true }; }
test('approved trial is one time; exact regional and channel sums',()=>{
  assert.equal(Object.values(APPROVED_PLAN.regionCapsVnd).reduce((a,b)=>a+b),100000000);
  assert.equal(Object.values(APPROVED_PLAN.channelCapsVnd).reduce((a,b)=>a+b),100000000);
  assert.equal(APPROVED_PLAN.automaticRenewal,false);
  assert.equal(APPROVED_PLAN.salesAuthority,'ADVISE_AND_BOOK_SURVEY');
});
test('exact 10% move within trial is an experiment, not proof of 7%',()=>assert.deepEqual(evaluateBudgetMove(move()),{status:'ALLOWED',reason:'QUALIFIED_SURVEY_EXPERIMENT',amountVnd:100000,achievesSevenPercent:false}));
for(const [key,value,reason] of [
  ['released',false,'POLICY_NOT_RELEASED'],['authorizedCompanyId','other','COMPANY_SCOPE'],['destinationRegion','can_tho','REGION_SCOPE'],
  ['destinationChannel','unknown','CHANNEL_SCOPE'],['now','2026-10-07T23:59:59Z','INITIAL_HOLD'],['now','2026-10-31T00:00:00Z','TRIAL_ENDED'],
  ['coverage','UNKNOWN','UNVERIFIED_SOURCE'],['spendFresh',false,'UNVERIFIED_SOURCE'],['currency','USD','UNVERIFIED_SOURCE'],['intakeHealthy',false,'UNVERIFIED_SOURCE'],
  ['platformCapVerified',false,'PLATFORM_CAP_UNVERIFIED'],['sourceProductGroup','accessory','INCOMPARABLE_PRODUCT_GROUPS'],['destinationQualifiedLeads',9,'INSUFFICIENT_EVIDENCE'],
  ['sourceObservedDays',6,'INSUFFICIENT_EVIDENCE'],['sourceQualifiedLeads',NaN,'INVALID_EVIDENCE'],['destinationImproved',false,'NO_VERIFIED_IMPROVEMENT'],
  ['amountVnd',100001,'CHANGE_OVER_TEN_PERCENT'],['amountVnd',-1,'INVALID_MONEY'],['amountVnd','100000','INVALID_MONEY'],
  ['totalExposureAfterVnd',100000001,'BUDGET_CAP'],['regionExposureAfterVnd',80000001,'BUDGET_CAP'],
  ['sourceLastChangedAt','2026-10-08T00:00:01Z','COOLDOWN'],['destinationLastChangedAt','2026-10-12T00:00:00Z','COOLDOWN'],
  ['decreaseConfirmed',false,'CONFIRM_DECREASE_FIRST'],['basis','MODEL_GUESS','INVALID_BASIS'],['basis','RECONCILED_REVENUE','REVENUE_NOT_READY'],
]) test('budget rejects '+key+' '+String(value),()=>assert.equal(evaluateBudgetMove({...move(),[key]:value}).reason,reason));
test('exact 48-hour boundary and confirmed revenue',()=>assert.equal(evaluateBudgetMove({...move(),sourceLastChangedAt:'2026-10-08T00:00:00Z',basis:'RECONCILED_REVENUE',revenueCoverage:'COMPLETE',comparableMaturity:true}).status,'ALLOWED'));
test('human SLA crosses 20h without counting closed hours',()=>assert.equal(humanDeadline('2026-10-01T12:55:00Z'),'2026-10-02T01:10:00.000Z'));
test('after-hours handoff starts next shift',()=>assert.equal(humanDeadline('2026-10-01T14:00:00Z'),'2026-10-02T01:15:00.000Z'));
test('before shift handoff starts 08h',()=>assert.equal(humanDeadline('2026-10-01T00:00:00Z'),'2026-10-01T01:15:00.000Z'));

function snapshot() { return {companyId:'vpt',trialId:'t1',asOf:'2027-02-01T00:00:00Z',start:'2026-10-01T00:00:00Z',end:'2026-10-31T00:00:00Z',currency:'VND',sourceVerified:true,spendFresh:true,
  coverage:{spend:'COMPLETE',recognitions:'COMPLETE',adjustments:'COMPLETE',attribution:'COMPLETE'},accountIds:['a1'],
  attribution:[{companyId:'vpt',trialId:'t1',orderId:'o1',leadId:'l1',evidenceId:'e1',accountId:'a1',policyVersion:'FIRST_VERIFIED_PAID_LEAD_V1',leadCreatedAt:'2026-10-10T00:00:00Z'}],
  spend:[{companyId:'vpt',trialId:'t1',eventId:'s1',accountId:'a1',spentAt:'2026-10-02T00:00:00Z',amountVnd:7000000,currency:'VND'}],
  recognitions:[{companyId:'vpt',sourceSystem:'finance',documentId:'d1',lineId:'1',version:'1',confirmedBy:'accountant',orderId:'o1',recognizedAt:'2027-01-01T00:00:00Z',status:'POSTED',netExVatVnd:100000000,currency:'VND'}]}; }
test('recognized net 7% exactly; delayed recognition retained in acquisition cohort',()=>{
  const r=measureTrial(snapshot());assert.equal(r.adRatio,.07);assert.equal(r.targetMetToDate,true);assert.equal(r.evaluationFinal,false);assert.equal(r.allowRevenueOptimization,false);
});
test('all spend counts including zero-lead ads',()=>{const s=snapshot();s.spend.push({...s.spend[0],eventId:'zero-lead',amountVnd:3000000});assert.equal(measureTrial(s).adRatio,.1);});
test('duplicate receipts/postings/attribution count once',()=>{const s=snapshot();s.spend.push({...s.spend[0]});s.recognitions.push({...s.recognitions[0]});s.attribution.push({...s.attribution[0]});assert.equal(measureTrial(s).adRatio,.07);});
test('credit adjustment is signed and applied once',()=>{const s=snapshot();const credit={...s.recognitions[0],documentId:'credit',netExVatVnd:-20000000,adjustmentOf:'d1/1'};s.recognitions.push(credit,{...credit});assert.equal(measureTrial(s).recognizedRevenueVnd,80000000);});
for(const key of ['spend','recognitions','adjustments','attribution'])test('missing '+key+' coverage is unknown',()=>{const s=snapshot();s.coverage[key]='UNKNOWN';assert.equal(measureTrial(s).status,'UNKNOWN');});
for(const [field,value]of [['status','DRAFT'],['confirmedBy',null],['netExVatVnd','100000000'],['currency','USD'],['companyId','other']])test('untrusted recognition '+field,()=>{const s=snapshot();s.recognitions[0][field]=value;assert.equal(measureTrial(s).status,'UNKNOWN');});
test('estimated deal cannot substitute for posted accounting lines',()=>{const s=snapshot();s.recognitions=[{estimated_value:999999999999,actual_close_date:'2026-10-01'}];assert.equal(measureTrial(s).status,'UNKNOWN');});
test('organic/old unrelated order revenue excluded',()=>{const s=snapshot();s.recognitions.push({...s.recognitions[0],documentId:'old',orderId:'old-order',netExVatVnd:900000000});assert.equal(measureTrial(s).recognizedRevenueVnd,100000000);});
test('conflicting posting versions block instead of double counting',()=>{const s=snapshot();s.recognitions.push({...s.recognitions[0],version:'2'});assert.equal(measureTrial(s).reason,'CONFLICTING_POSTING_VERSION');});
test('conflicting spend receipt blocks',()=>{const s=snapshot();s.spend.push({...s.spend[0],amountVnd:1});assert.equal(measureTrial(s).reason,'CONFLICTING_SPEND');});
test('ambiguous order source blocks',()=>{const s=snapshot();s.attribution.push({...s.attribution[0],leadId:'l2'});assert.equal(measureTrial(s).reason,'CONFLICTING_ORDER_ATTRIBUTION');});
for(const amount of [0,-1])test('nonpositive net does not divide or claim target '+amount,()=>{const s=snapshot();s.recognitions[0].netExVatVnd=amount;if(amount<0)s.recognitions[0].adjustmentOf='prior';const r=measureTrial(s);assert.equal(r.adRatio,null);assert.equal(r.targetMetToDate,false);assert.equal(r.status,'NO_POSITIVE_REVENUE');});
test('one VND above threshold does not round to pass',()=>{const s=snapshot();s.spend[0].amountVnd=7000001;assert.equal(measureTrial(s).targetMetToDate,false);});
test('account outside explicit trial is not included',()=>{const s=snapshot();s.spend[0].accountId='other';assert.equal(measureTrial(s).status,'UNKNOWN');});

function care(){return {now:'2026-10-10T00:00:00Z',companyId:'vpt',authorizedCompanyId:'vpt',delegationActive:true,action:'advise',channelSendAllowed:true,factsVerified:true};}
test('care may advise but cannot quote or close',()=>{assert.equal(decideCare(care()).status,'ALLOWED');for(const action of ['quote','close_order','discount','issue_contract'])assert.equal(decideCare({...care(),action}).reason,'OUTSIDE_SALES_AUTHORITY');});
for(const [field,value]of [['optedOut',true],['humanActive',true],['requestedHuman',true],['factsVerified',false],['channelSendAllowed',false],['delegationActive',false]])test('care stops for '+field,()=>assert.equal(decideCare({...care(),[field]:value}).send,false));
test('booking requires customer confirmation and current slot',()=>{assert.equal(decideCare({...care(),action:'book_survey'}).status,'DENIED');assert.equal(decideCare({...care(),action:'book_survey',customerConfirmed:true,slotAvailable:true,slotVersion:'v1'}).requiresAtomicSlotReservation,true);});
function content(){return {companyId:'vpt',now:'2026-10-10T00:00:00Z',channel:'facebook',template:{companyId:'vpt',status:'APPROVED',version:'1',approvedBy:'founder',expiresAt:'2027-01-01T00:00:00Z',channels:['facebook'],text:'Tư vấn {{product}} tại {{region}}.',factIds:['product','region']},facts:['product','region'].map(id=>({id,companyId:'vpt',status:'APPROVED',version:'1',sourceId:'catalog',expiresAt:'2027-01-01T00:00:00Z',value:id==='product'?'tủ bếp':'TP.HCM'}))};}
test('approved content renders only verified source facts',()=>{const r=renderApprovedContent(content());assert.equal(r.text,'Tư vấn tủ bếp tại TP.HCM.');assert.equal(r.evidence.length,2);});
test('unapproved freeform template is not auto-published',()=>{const c=content();c.template.status='DRAFT';assert.equal(renderApprovedContent(c).status,'PENDING_APPROVAL');});
test('unverified/expired/foreign facts stop publication',()=>{for(const patch of [{status:'DRAFT'},{companyId:'other'},{expiresAt:'2020-01-01T00:00:00Z'},{sourceId:null}]){const c=content();Object.assign(c.facts[0],patch);assert.equal(renderApprovedContent(c).status,'PENDING_APPROVAL');}});
test('unknown or duplicate placeholder facts cannot be guessed',()=>{const c=content();c.template.text='{{warranty}}';assert.equal(renderApprovedContent(c).reason,'UNRESOLVED_FACT');c.facts.push({...c.facts[0]});assert.equal(renderApprovedContent(c).reason,'MISSING_OR_DUPLICATE_FACT');});

test('canonical intent digest ignores key order but binds meaning',()=>{assert.equal(commandDigest({a:1,b:2}),commandDigest({b:2,a:1}));assert.notEqual(commandDigest({a:1}),commandDigest({a:2}));});
function runner({revoked=false,policy='v1',adapter,failCommit=false}={}){
  let claimed=false;let state='QUEUED';let executes=0;
  const cmd={id:'cmd',actorId:'ai',companyId:'vpt',policyVersion:'v1',action:'sales.reply',payload:{text:'verified'}};
  const repo={loadContext:async()=>({policyVersion:policy,authorized:!revoked}),enqueue:async c=>c,claim:async()=>{if(claimed)return null;claimed=true;return cmd;},finish:async(c,s,result)=>{if(failCommit&&s==='SUCCEEDED')throw Error('commit response lost');state=s;return {status:s,...result};}};
  const execute=adapter||(async()=>({providerReceiptId:'p1'}));
  const svc=createCommandService({repository:repo,validate:async c=>({status:c.authorized?'ALLOWED':'DENIED',reason:'REVOKED'}),enabled:true,adapters:{'sales.reply':{idempotent:true,execute:async(...args)=>{executes++;return execute(...args);}}}});
  return {svc,state:()=>state,executes:()=>executes,repo};
}
test('disabled runtime performs no repository reads or writes',async()=>{const svc=createCommandService({repository:{},validate:()=>{throw Error('must not execute');}});assert.equal((await svc.runOne()).status,'DISABLED');assert.equal((await svc.submit({},{})).reason,'AUTOMATION_NOT_RELEASED');});
test('revoked authorization after queue is rechecked before external send',async()=>{const r=runner({revoked:true});assert.equal((await r.svc.runOne()).status,'DENIED');assert.equal(r.executes(),0);});
test('changed policy after approval blocks send',async()=>{const r=runner({policy:'v2'});assert.equal((await r.svc.runOne()).reason,'POLICY_CHANGED');assert.equal(r.executes(),0);});
test('uncertain provider write is not automatically replayed',async()=>{const r=runner({adapter:async()=>{throw Error('timeout');}});assert.equal((await r.svc.runOne()).status,'UNKNOWN');assert.equal((await r.svc.runOne()).status,'IDLE');assert.equal(r.executes(),1);});
test('provider success with commit uncertainty preserves unknown for reconciliation',async()=>{const r=runner({failCommit:true});assert.equal((await r.svc.runOne()).status,'UNKNOWN');assert.equal(r.executes(),1);});
test('missing provider receipt is not success',async()=>{const r=runner({adapter:async()=>({ok:true})});assert.equal((await r.svc.runOne()).status,'UNKNOWN');});
test('successful command has provider receipt',async()=>{const r=runner();assert.equal((await r.svc.runOne()).providerReceiptId,'p1');assert.equal(r.executes(),1);});
test('no writes to failover/backup target',async()=>{let calls=0;const r=createCommandRepository({client:{rpc:async()=>{calls++;}},isPrimary:()=>false,loadTrustedContext:async()=>({})});await assert.rejects(r.claim(),/PRIMARY_WRITER_REQUIRED/);assert.equal(calls,0);});
