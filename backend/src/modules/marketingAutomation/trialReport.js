'use strict';
const {projectReview}=require('../crmLeadIdentity/review');
const {summarizeSpend}=require('./spendCoverage');
const {reconcileCensus}=require('./censusReconciliation');
const {measurementPeriod}=require('./measurementPeriod');
const {receiptPeriods}=require('./receiptPeriod');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=()=>{throw Object.assign(new Error('TRIAL_SNAPSHOT_UNAVAILABLE'),{status:503});};
const time=x=>typeof x==='string'?Date.parse(x):NaN;
function reportTrial(raw){
 const t=raw?.trial;
 if(!raw||raw.complete!==true||!UUID.test(raw.companyId||'')||!t||t.company_id!==raw.companyId||!UUID.test(t.id||'')||!Number.isFinite(time(raw.asOf))||!Array.isArray(t.account_ids)||!t.account_ids.length||new Set(t.account_ids).size!==t.account_ids.length||!Number.isSafeInteger(t.revision)||t.revision<1)fail();
 for(const key of ['qualities','sources','receipts','accounts','runs'])if(!Array.isArray(raw[key])||raw[key].length>5000)fail();
 const period=measurementPeriod(raw),start=time(period.sinceAt),end=period.untilExclusive?time(period.untilExclusive):start,now=time(raw.asOf);
 const identity=projectReview(raw.identity);if(identity.companyId!==raw.companyId)fail();
 const members=new Map();for(const g of identity.groups)for(const m of g.members)members.set(m.leadId,g);
 const qualities=new Map();for(const q of raw.qualities){if(!UUID.test(q.leadId||'')||q.companyId!==raw.companyId||qualities.has(q.leadId))fail();qualities.set(q.leadId,q);}
 const receipts=new Map();for(const r of raw.receipts){if(!UUID.test(r.id||'')||receipts.has(r.id)||!['PENDING','LEASED','DONE','REVIEW'].includes(r.state))fail();receipts.set(r.id,r);}
 const sources=new Map(),byGroup=new Map(),sourceReceipts=new Set();
 const counts={qualified:0,pending:0,rejected:0,unresolved:0,existing:0,organic:0,unknownSource:0,observedPaidGroups:0,receivedForms:raw.receipts.length,outsidePeriodForms:0,unprocessedForms:0,unlinkedProofs:0};
 const issues=new Map(),items=[];const issue=k=>issues.set(k,(issues.get(k)||0)+1);
 for(const s of raw.sources){
  if(!UUID.test(s.id||'')||sources.has(s.id)||s.companyId!==raw.companyId||!Number.isFinite(time(s.acquiredAt))||sourceReceipts.has(s.receiptId))fail();
  sources.set(s.id,s);sourceReceipts.add(s.receiptId);
  const g=members.get(s.leadId);
  if(!g){if(time(s.acquiredAt)>=start&&time(s.acquiredAt)<end){counts.unlinkedProofs++;issue('SOURCE_WITHOUT_IDENTITY');}continue;}
  if(!byGroup.has(g.groupId))byGroup.set(g.groupId,[]);byGroup.get(g.groupId).push(s);
 }
 // Unknown acquired time cannot be filtered by delivery time or assumed outside
 // the period. Retained receipt/source history is not discarded by DETACH.
 const receiptPeriod=receiptPeriods(raw,period);
 for(const r of receipts.values()){
  if(receiptPeriod.get(r.id)==='CONFLICT'){counts.unprocessedForms++;issue('RECEIPT_ACQUISITION_CONFLICT');continue;}
  if(receiptPeriod.get(r.id)==='OUTSIDE'){counts.outsidePeriodForms++;continue;}
  if(r.state!=='DONE'||!sourceReceipts.has(r.id)){counts.unprocessedForms++;issue('RECEIPT_NOT_RECONCILED');}
 }
 const inWindow=s=>time(s.acquiredAt)>=start&&time(s.acquiredAt)<end&&time(s.acquiredAt)<=now;
 const quality=q=>{
  const e=q?.evidence;
  if(!e||e.contextVersion!==q.contextVersion||!UUID.test(e.id||'')||!UUID.test(e.recordedBy||'')||!Number.isFinite(time(e.recordedAt))||time(e.recordedAt)>now)return'PENDING';
  if(e.status==='QUALIFIED'&&q.routingReady===true&&e.contactVerified===true&&e.demandMatches===true&&e.serviceAreaVerified===true)return'QUALIFIED';
  return e.status==='REJECTED'?'REJECTED':'PENDING';
 };
 for(const [id,all]of byGroup){
  if(!all.some(inWindow))continue;
  const g=identity.groups.find(x=>x.groupId===id);let state,reason,acquisition;
  all.sort((a,b)=>time(a.acquiredAt)-time(b.acquiredAt)||a.id.localeCompare(b.id));
  const first=all[0];acquisition=first;
  const historic=g.members.map(m=>qualities.get(m.leadId));
  if(time(first.acquiredAt)<start||historic.some(q=>Number.isFinite(time(q?.firstKnownAt))&&time(q.firstKnownAt)<start))state='EXISTING';
  else if(!g.deduplicationComplete){state='UNRESOLVED';reason='IDENTITY_UNRESOLVED';}
  else if(historic.some(q=>!q||q.historyComplete!==true||!Number.isFinite(time(q.firstKnownAt)))||historic.some(q=>time(q.firstKnownAt)<time(first.acquiredAt)&&!all.some(s=>s.leadId===q.leadId&&time(s.acquiredAt)<=time(q.firstKnownAt)))){state='UNRESOLVED';reason='EARLIER_HISTORY_UNVERIFIED';}
  else if(all.some(s=>time(s.acquiredAt)===time(first.acquiredAt)&&s.id!==first.id&&(s.leadId!==first.leadId||s.proof?.accountId!==first.proof?.accountId||s.source!==first.source))){state='UNRESOLVED';reason='FIRST_SOURCE_AMBIGUOUS';}
  else if(first.source==='ORGANIC')state='ORGANIC';
  else if(first.source!=='PAID'){state='UNKNOWN_SOURCE';reason='PAID_SOURCE_UNVERIFIED';}
  else if(!t.account_ids.includes(first.proof?.accountId)){state='UNRESOLVED';reason='FIRST_SOURCE_OUTSIDE_ACCOUNTS';}
  else {
   const r=receipts.get(first.receiptId),p=first.proof;
   if(!r||r.state!=='DONE'||r.leadId!==first.leadId||first.provider!=='META_LEAD_ADS_V1'||p?.source!=='PAID'||p.pageId!==r.pageId||p.formId!==r.formId||p.leadgenId!==r.leadgenId||time(p.acquiredAt)!==time(first.acquiredAt)||!['adId','adsetId','campaignId'].every(k=>/^[0-9]{1,32}$/.test(p[k]||''))){state='UNRESOLVED';reason='RECEIPT_PROOF_CONFLICT';}
   else {
    counts.observedPaidGroups++;
    const statuses=new Set(g.members.map(m=>quality(qualities.get(m.leadId))).filter(s=>s!=='PENDING'));
    if(statuses.size>1){state='PENDING';reason='QUALIFICATION_CONFLICT';}
    else {state=quality(qualities.get(first.leadId));if(state==='PENDING')reason='QUALIFICATION_PENDING';}
   }
  }
  const key={QUALIFIED:'qualified',PENDING:'pending',REJECTED:'rejected',UNRESOLVED:'unresolved',EXISTING:'existing',ORGANIC:'organic',UNKNOWN_SOURCE:'unknownSource'}[state];counts[key]++;
  if(reason)issue(reason);
  const q=qualities.get(acquisition.leadId);
  items.push({groupId:id,acquisitionLeadId:g.members.find(m=>m.leadId===acquisition.leadId)?.available?acquisition.leadId:null,status:state,reason:reason||null,regionId:q?.regionId||null,ownerId:q?.ownerId||null,acquiredAt:acquisition.acquiredAt,memberCount:g.members.length});
 }
 const registered=new Set(t.account_ids),current=new Set(raw.accounts.filter(a=>a.company_id===raw.companyId).map(a=>a.ad_account_id));
 const rosterMatches=registered.size===current.size&&[...registered].every(a=>current.has(a));
 const spend=period.status!=='AVAILABLE'?{status:'UNKNOWN',reason:period.status,spendVnd:null,allowBudgetExecution:false}:!rosterMatches?{status:'UNKNOWN',reason:'TRIAL_ACCOUNT_ROSTER_CHANGED',spendVnd:null,allowBudgetExecution:false}:summarizeSpend({accounts:raw.accounts,runs:raw.runs,companyId:raw.companyId,since:period.since,until:period.until,now:raw.asOf,throughExclusive:period.untilExclusive});
 // These are current observed records, not an exhaustive provider census.
 // A later reconciliation service must supply verifiable coverage before CPQL
 // can be published. Callers cannot flip a completeness flag in this API.
 const reconciliation=reconcileCensus(raw,identity,items,period,receiptPeriod);
 return{companyId:raw.companyId,trial:{id:t.id,name:t.name,revision:t.revision,since:t.since,until:t.until,accountCount:t.account_ids.length},asOf:raw.asOf,
  scope:'CONFIGURED_FACEBOOK_ACCOUNTS',period,spend,observed:{status:'OBSERVED_ONLY',...counts},items,
  issues:[...issues].map(([code,count])=>({code,count})),
  reconciliation,
  coverage:{provider:reconciliation.status==='MISSING'?'MISSING':'PARTIAL',identityPolicy:identity.policy,identityComplete:identity.deduplicationComplete,qualification:'CURRENT_OBSERVED_RECORDS',surveys:'NOT_CONNECTED'},
  costPerQualifiedLeadVnd:null,targetVnd:250000,targetMetToDate:false,measurementStatus:'INCOMPLETE',
  reasons:[reconciliation.status==='MISSING'?'PROVIDER_CENSUS_NOT_CONNECTED':'PROVIDER_COVERAGE_UNVERIFIED',...(counts.unprocessedForms?['RECEIPT_NOT_RECONCILED']:[]),...(counts.unresolved||counts.unlinkedProofs?['COHORT_UNRESOLVED']:[]),...(spend.status!=='KNOWN_TO_DATE'?['SPEND_UNAVAILABLE']:[])],
  surveyCount:null,allowBudgetExecution:false,revenueTargetEvaluated:false};
}
module.exports={reportTrial};
