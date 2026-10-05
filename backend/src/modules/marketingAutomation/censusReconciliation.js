'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const time=x=>typeof x==='string'?Date.parse(x):NaN;
const fail=()=>{throw Object.assign(new Error('TRIAL_RECONCILIATION_UNAVAILABLE'),{status:503});};

// Pure projection of the same PostgreSQL snapshot as the trial report. A
// matching enumerated subset never certifies provider permissions/retention.
function reconcileCensus(raw,identity,cohort,period,receiptPeriod){
 const census=raw.providerReconciliation;
 if(!census||census.status==='MISSING')return{status:'MISSING',matchStatus:'NOT_CHECKED',recordMatchStatus:'NOT_CHECKED',coverage:'UNVERIFIED',run:null,counts:null,issues:[],coverageIssues:[],exceptions:[],cpqlReady:false};
 if(![1,2].includes(census.version)||census.companyId!==raw.companyId||census.trialId!==raw.trial.id||census.complete!==true)fail();
 const r=census.run,now=time(raw.asOf),start=time(raw.trial.since+'T00:00:00+07:00'),end=time(raw.trial.until+'T00:00:00+07:00')+86400000;
 if(!r||!uuid(r.id)||!['RUNNING','SCANNED','FAILED'].includes(r.state)||!Number.isSafeInteger(r.trialRevision)||r.trialRevision<1||typeof r.scopeCurrent!=='boolean'||!Number.isSafeInteger(r.tasksPending)||r.tasksPending<0||!Number.isFinite(time(r.startedAt))||time(r.startedAt)>now||!Number.isFinite(time(r.since))||!Number.isFinite(time(r.until))||(time(r.until)<time(r.since)||(time(r.until)===time(r.since)&&(census.version!==2||r.measurementPolicy!=='VIETNAM_CLOSED_DAY_V1')))||time(r.until)>now||!Array.isArray(census.items)||census.items.length>5000||!Array.isArray(census.forms)||census.forms.length>5000)fail();
 if(r.state==='SCANNED'&&(!Number.isFinite(time(r.finishedAt))||time(r.finishedAt)<time(r.startedAt)||time(r.finishedAt)>now||r.tasksPending!==0))fail();
 const counts={enumerated:census.items.length,receivedCrm:0,awaitingIntake:0,reviewRequired:0,missingReceipt:0,proofConflict:0,missingCrm:0,notEnumerated:0,unknownAcquiredTime:0,outsidePeriod:0,unlinkedProofs:0,undiscoveredForms:0,expiredForms:0,retentionUnknownForms:0};
 const issues=new Map(),exceptions=[];
 function issue(code,receiptId=null){issues.set(code,(issues.get(code)||0)+1);if(exceptions.length<50)exceptions.push({code,receiptId});}
 const forms=new Set();for(const f of census.forms){const key=f.pageId+':'+f.formId;if(!numeric(f.pageId)||!numeric(f.formId)||forms.has(key)||typeof f.discovered!=='boolean'||(f.expiredLeads!==null&&(!Number.isSafeInteger(f.expiredLeads)||f.expiredLeads<0)))fail();forms.add(key);if(!f.discovered)counts.undiscoveredForms++;if(f.expiredLeads===null)counts.retentionUnknownForms++;else if(f.expiredLeads>0)counts.expiredForms++;}
 const receipts=new Map(raw.receipts.map(x=>[x.id,x])),sources=new Map(),members=new Map();
 for(const s of raw.sources){if(sources.has(s.receiptId))fail();sources.set(s.receiptId,s);}
 for(const g of identity.groups)for(const m of g.members)members.set(m.leadId,{group:g,member:m});
 const states=new Map(cohort.map(x=>[x.groupId,x.status])),seenIds=new Set(),seenReceipts=new Set();
 const inRange=stamp=>Number.isFinite(stamp)&&stamp>=time(r.since)&&stamp<time(r.until);
 const sourceMatches=(s,x)=>s&&s.companyId===raw.companyId&&s.provider==='META_LEAD_ADS_V1'&&s.proof?.pageId===x.pageId&&s.proof?.formId===x.formId&&s.proof?.leadgenId===x.leadgenId&&time(s.proof?.acquiredAt)===time(s.acquiredAt)&&['PAID','ORGANIC','UNKNOWN'].includes(s.source)&&s.proof?.source===s.source;
 for(const item of census.items){
  const key=item.pageId+':'+item.leadgenId;
  if(!numeric(item.pageId)||!numeric(item.formId)||!numeric(item.leadgenId)||!uuid(item.receiptId)||!inRange(time(item.acquiredAt))||seenIds.has(key)||seenReceipts.has(item.receiptId)||!forms.has(item.pageId+':'+item.formId))fail();
  seenIds.add(key);seenReceipts.add(item.receiptId);
  const receipt=receipts.get(item.receiptId),s=sources.get(item.receiptId);
  if(!receipt){counts.missingReceipt++;issue('CENSUS_RECEIPT_MISSING',item.receiptId);continue;}
  if(receiptPeriod.get(receipt.id)==='CONFLICT'){counts.proofConflict++;issue('CENSUS_ACQUISITION_CONFLICT',receipt.id);continue;}
  if(receipt.pageId!==item.pageId||receipt.formId!==item.formId||receipt.leadgenId!==item.leadgenId){counts.proofConflict++;issue('CENSUS_RECEIPT_CONFLICT',item.receiptId);continue;}
  if(receipt.state!=='DONE'){const review=receipt.state==='REVIEW';counts[review?'reviewRequired':'awaitingIntake']++;issue(review?'CENSUS_REVIEW_REQUIRED':'CENSUS_INTAKE_PENDING',item.receiptId);continue;}
  if(!sourceMatches(s,item)||s.leadId!==receipt.leadId||time(s.acquiredAt)!==time(item.acquiredAt)){counts.proofConflict++;issue('CENSUS_PROOF_CONFLICT',item.receiptId);continue;}
  const member=members.get(s.leadId);
  const measured=period.status==='AVAILABLE'&&time(item.acquiredAt)>=time(period.sinceAt)&&time(item.acquiredAt)<time(period.untilExclusive);
  if(!member?.member.available||(measured&&!states.has(member.group.groupId))){counts.missingCrm++;issue('CENSUS_CRM_MISSING',item.receiptId);continue;}
  counts.receivedCrm++;
 }
 // Reverse comparison is essential: a terminated API edge is not enough if
 // a known in-period receipt or proof was omitted from that edge.
 for(const receipt of raw.receipts){
  if(seenReceipts.has(receipt.id))continue;
  if(receiptPeriod.get(receipt.id)==='CONFLICT'){counts.proofConflict++;issue('CENSUS_ACQUISITION_CONFLICT',receipt.id);continue;}
  if(receiptPeriod.get(receipt.id)==='OUTSIDE'&&period.censusAligned){counts.outsidePeriod++;continue;}
  const s=sources.get(receipt.id);
  if(!sourceMatches(s,receipt)||receipt.state!=='DONE'||s.leadId!==receipt.leadId){counts.unknownAcquiredTime++;issue('CENSUS_ACQUISITION_UNPROVEN',receipt.id);}
  else if(inRange(time(s.acquiredAt))){counts.notEnumerated++;issue('CENSUS_KNOWN_ID_NOT_ENUMERATED',receipt.id);}
 }
 for(const s of raw.sources)if(!receipts.has(s.receiptId)&&inRange(time(s.acquiredAt))){counts.unlinkedProofs++;issue('CENSUS_SOURCE_WITHOUT_RECEIPT');}
 if(counts.undiscoveredForms)issue('CENSUS_FORM_NOT_DISCOVERED');
 if(counts.expiredForms)issue('CENSUS_EXPIRED_LEADS');
 if(counts.retentionUnknownForms)issue('CENSUS_RETENTION_UNVERIFIED');
 const stale=!r.scopeCurrent||r.trialRevision!==raw.trial.revision||time(r.since)!==start||time(r.until)>end;
 if(stale)issue('CENSUS_SCOPE_CHANGED');
 if(period.status==='NO_CLOSED_DAY')issue('CENSUS_NO_CLOSED_DAY');
 else if(!period.censusAligned)issue('CENSUS_PERIOD_MISMATCH');
 const status=stale?'STALE':r.state;
 const matchStatus=status==='SCANNED'?(issues.size?'DISCREPANCIES':'MATCHED_ENUMERATED'):'NOT_CHECKED';
 // Matching known records and proving the provider universe are distinct.
 // Retention/undiscovered forms remain full-coverage gaps, but do not erase a
 // factual quotient over the reconciled records that have actually arrived.
 const coverageCodes=new Set(['CENSUS_FORM_NOT_DISCOVERED','CENSUS_EXPIRED_LEADS','CENSUS_RETENTION_UNVERIFIED']);
 const coverageIssues=[...issues].filter(([code])=>coverageCodes.has(code)).map(([code,count])=>({code,count}));
 const recordMatchStatus=status!=='SCANNED'?'NOT_CHECKED':[...issues.keys()].some(code=>!coverageCodes.has(code))?'DISCREPANCIES':'MATCHED_OBSERVED';
 return{status,matchStatus,recordMatchStatus,coverage:'API_ENUMERATION_ONLY',run:{id:r.id,since:r.since,until:r.until,startedAt:r.startedAt,finishedAt:r.finishedAt,recoveryUntil:r.recoveryUntil||r.until,state:r.state,tasksPending:r.tasksPending},counts,issues:[...issues].map(([code,count])=>({code,count})),coverageIssues,exceptions,exceptionsTruncated:issues.size>0&&[...issues.values()].reduce((a,b)=>a+b,0)>exceptions.length,cpqlReady:false};
}
module.exports={reconcileCensus};
