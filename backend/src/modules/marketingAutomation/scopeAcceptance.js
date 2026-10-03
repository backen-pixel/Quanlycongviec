'use strict';
const { createHash } = require('node:crypto');
const { reportTrial } = require('./trialReport');
const { stamp } = require('./sourceExport');
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const fields = (x, keys) => Object.fromEntries(keys.map(k => [k, x[k]]));
const timestamp = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const text = (x, min, max) => typeof x === 'string' && x.trim().length >= min && x.length <= max;
const fail = (status = 503, issues) => { throw Object.assign(Error('SCOPE_ACCEPTANCE_UNAVAILABLE'), { status, issues }); };
const POLICY = 'ACCEPTED_DECLARED_FACEBOOK_SCOPE_V1';
const CLAIMS = ['HISTORICAL_DESTINATION_SETS_CHECKED', 'ALL_ACCOUNT_DELIVERY_CHECKED', 'EXPORT_FILTERS_TIME_AND_RETENTION_CHECKED'];
const keyOf = e => createHash('sha256').update(JSON.stringify([e.accountId,e.kind,e.pageId,e.formId,e.destination])).digest('hex');
function parseRequest(body) {
 if (!object(body) || !uuid(body.requestId) || !object(body.command)) fail(400);
 const c = body.command;
 if (!Number.isSafeInteger(c.expectedRevision) || c.expectedRevision < 0 || c.expectedRevision > 999999999) fail(400);
 if (c.action === 'REVOKE') {
  if (!exact(body,['requestId','command']) || !exact(c,['action','expectedRevision','targetRequestId','reason']) || !uuid(c.targetRequestId) || !text(c.reason,20,2000)) fail(400);
  return { requestId: body.requestId, command: c, artifact: null };
 }
 if (!exact(body,['requestId','command','artifactBase64']) || !exact(c,['action','expectedRevision','contextVersion','reference','note','claims','manifest','exportClaims']) || c.action !== 'ACCEPT' || !hash(c.contextVersion) || !text(c.reference,8,500) || !text(c.note,20,2000) ||
  !Array.isArray(c.claims) || c.claims.length !== CLAIMS.length || !CLAIMS.every(k=>c.claims.includes(k)) ||
  !Array.isArray(c.manifest) || c.manifest.length > 1000 || !Array.isArray(c.exportClaims) || c.exportClaims.length > 1000) fail(400);
 for (const row of c.manifest) {
  if (!exact(row,['accountId','adId','validFrom','validUntil','destinations']) || !/^act_[0-9]{1,32}$/.test(row.accountId||'') || !/^[0-9]{1,32}$/.test(row.adId||'') || !Array.isArray(row.destinations) || !row.destinations.length || row.destinations.length>300 || !row.destinations.every(hash) || new Set(row.destinations).size!==row.destinations.length) fail(400);
  if (Date.parse(stamp(row.validFrom))>=Date.parse(stamp(row.validUntil))) fail(400);
 }
 for (const e of c.exportClaims) if (!exact(e,['requestId','fileSha256','normalizedRowsDigest']) || !uuid(e.requestId) || !hash(e.fileSha256) || !hash(e.normalizedRowsDigest)) fail(400);
 if (new Set(c.exportClaims.map(e=>e.requestId)).size!==c.exportClaims.length) fail(400);
 const value=body.artifactBase64;
 if (typeof value!=='string'||!value.length||value.length>1398104||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail(400);
 const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value||bytes.length<1||bytes.length>1048576)fail(400);
 return { requestId:body.requestId, command:{...c,artifactSha256:createHash('sha256').update(bytes).digest('hex'),artifactBytes:bytes.length},artifact:value };
}
function requirements(ctx) {
 if (!hash(ctx?.contextVersion) || !ctx.facts || !Array.isArray(ctx.exports) || !Array.isArray(ctx.exportDetails)) fail();
 const report=reportTrial(ctx.facts),entries=(report.sourceRegistry?.declaration?.entries||[]).map(e=>({...e,key:keyOf(e)}));
 const ads=report.accountDelivery.accounts.flatMap(a=>a.ads.map(ad=>({accountId:a.accountId,...fields(ad,['adId','adsetId','campaignId'])}))),gaps=[];
 const add=(code,scope=null)=>gaps.push({code,scope});
 if(report.period.status!=='AVAILABLE')add('PERIOD_UNAVAILABLE');
 if(report.sourceRegistry?.status!=='CURRENT')add('REGISTRY_NOT_CURRENT');
 for(const gap of report.sourceRegistry?.gaps||[])if(gap.code!=='ENTRYPOINT_COVERAGE_UNVERIFIED')add(gap.code,gap.accountId||gap.formId||null);
 if(report.spend.status!=='KNOWN_TO_DATE')add('SPEND_UNAVAILABLE');
 for(const a of report.accountDelivery.accounts)if(a.status!=='RECONCILED_DELIVERY')add(a.status==='SOURCE_AD_GAPS'?'SOURCE_AD_GAPS':'DELIVERY_UNAVAILABLE',a.accountId);
 for(const e of entries)if(!['META_LEAD_ADS','NO_LEAD_SOURCE'].includes(e.kind))add('ENTRYPOINT_NOT_SUPPORTED',e.key);
 if(report.reconciliation.recordMatchStatus!=='MATCHED_OBSERVED'||ctx.facts.providerReconciliation?.run?.witness?.status!=='TRAVERSED')add('CENSUS_NOT_RECONCILED');
 if(report.reconciliation.coverageIssues.some(e=>e.code==='CENSUS_FORM_NOT_DISCOVERED'))add('FORM_NOT_DISCOVERED');
 if(report.observedMeasurement.status==='UNAVAILABLE')for(const code of report.observedMeasurement.reasons)add(code);
 if(report.observed.pending)add('QUALIFICATION_PENDING');
 if(report.observed.unresolved||report.observed.unknownSource||report.observed.unprocessedForms||report.observed.unlinkedProofs)add('CRM_UNRESOLVED');
 const forms=new Map(entries.filter(e=>e.kind==='META_LEAD_ADS').map(e=>[e.pageId+':'+e.formId,e]));
 const exports=[];
 for(const entry of forms.values()){
  const matches=ctx.exports.filter(e=>e.pageId===entry.pageId&&e.formId===entry.formId),e=matches[0];
  const details=e?ctx.exportDetails.filter(d=>d.requestId===e.requestId):[],r=details[0]?.result,c=r?.comparison,run=ctx.facts.providerReconciliation?.run;
  if(matches.length!==1||details.length!==1||!r||r.requestId!==e.requestId||r.policy!=='SOURCE_EXPORT_COMPARISON_V1'||e.currentStatus!=='CURRENT'||!['MATCHED_EXPORTED_IDS','EMPTY_COMPARISON'].includes(e.status)||r.status!==e.status||
   r.fileSha256!==e.fileSha256||r.normalizedRowsDigest!==e.normalizedRowsDigest||r.pageId!==entry.pageId||r.formId!==entry.formId||r.companyId!==ctx.facts.companyId||r.trialId!==ctx.facts.trial.id||
   r.censusRunId!==run?.id||r.pagesDigest!==run?.witness?.pagesDigest||r.registryDigest!==report.sourceRegistry?.declaration?.declarationDigest||
   !text(r.sourceReference,8,500)||!timestamp(r.exportedAt)||Date.parse(r.exportedAt)<Date.parse(report.period.untilExclusive)||Date.parse(r.exportedAt)>Date.parse(report.asOf)||
   Date.parse(r.sinceAt)!==Date.parse(report.period.sinceAt)||Date.parse(r.untilExclusive)!==Date.parse(report.period.untilExclusive)||!c||
   !['rows','inPeriodRows','outsidePeriodRows','uniqueExportIds','duplicateRows','observedIds','matched','notInExport','notObserved','conflicts'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||
   c.rows!==c.inPeriodRows+c.outsidePeriodRows||c.inPeriodRows!==c.uniqueExportIds||
   (e.status==='EMPTY_COMPARISON')!==(c.uniqueExportIds===0)||
   c.notInExport||c.notObserved||c.conflicts||c.duplicateRows||c.uniqueExportIds!==c.observedIds||c.matched!==c.observedIds){add('EXPORT_NOT_RECONCILED',entry.key);continue;}
  exports.push({requestId:e.requestId,fileSha256:e.fileSha256,normalizedRowsDigest:e.normalizedRowsDigest,pageId:entry.pageId,formId:entry.formId,sourceReference:r.sourceReference,exportedAt:r.exportedAt,empty:e.status==='EMPTY_COMPARISON'});
 }
 return {report,entries,ads,exports,gaps};
}
function evaluate(ctx,command) {
 const req=requirements(ctx),{report,entries,ads,exports}=req,gaps=[...req.gaps];
 const add=(code,scope=null)=>gaps.push({code,scope});
 if(command.contextVersion!==ctx.contextVersion)fail(409);
 const start=Date.parse(report.period.sinceAt),end=Date.parse(report.period.untilExclusive),entryMap=new Map(entries.map(e=>[e.key,e])),adMap=new Map(ads.map(a=>[a.accountId+':'+a.adId,[]]));
 for(const row of command.manifest){
  const id=row.accountId+':'+row.adId,from=Date.parse(row.validFrom),until=Date.parse(row.validUntil);
  if(!adMap.has(id)||from<start||until>end||from>=until||row.destinations.some(k=>!entryMap.has(k)||entryMap.get(k).accountId!==row.accountId)){add('INVALID_DESTINATION_INTERVAL',id);continue;}
  adMap.get(id).push({...row,from,until});
 }
 for(const [id,rows]of adMap){rows.sort((a,b)=>a.from-b.from);if(rows.some((r,i)=>i&&r.from<rows[i-1].until))add('OVERLAPPING_DESTINATION_INTERVALS',id);}
 const covers=(rows,from,until)=>{let cursor=from;for(const r of rows){if(r.until<=cursor)continue;if(r.from>cursor)break;cursor=Math.max(cursor,r.until);if(cursor>=until)return true;}return false;};
 for(const evidence of ctx.facts.accountDelivery||[])for(const day of evidence.payload.adDays){
  if(day.date<report.period.since||day.date>report.period.until)continue;
  const id=evidence.accountId+':'+day.adId,from=Date.parse(day.date+'T00:00:00+07:00');if(!covers(adMap.get(id)||[],from,from+86400000))add('DESTINATION_HISTORY_MISSING',id);
 }
 for(const s of ctx.facts.sources){
  const acquired=Date.parse(s.acquiredAt);if(s.source!=='PAID'||acquired<start||acquired>=end)continue;
  const p=s.proof,id=p?.accountId+':'+p?.adId,rows=adMap.get(id)||[],ad=ads.find(a=>a.accountId===p?.accountId&&a.adId===p?.adId);
  if(ad&&(ad.adsetId!==p.adsetId||ad.campaignId!==p.campaignId))add('PROOF_DELIVERY_METADATA_CONFLICT',id);
  if(!rows.some(row=>row.from<=acquired&&acquired<row.until&&row.destinations.some(k=>{const e=entryMap.get(k);return e?.kind==='META_LEAD_ADS'&&e.pageId===p.pageId&&e.formId===p.formId;})))add('PROOF_DESTINATION_MISMATCH',id);
 }
 if(command.exportClaims.length!==exports.length||exports.some(e=>!command.exportClaims.some(c=>c.requestId===e.requestId&&c.fileSha256===e.fileSha256&&c.normalizedRowsDigest===e.normalizedRowsDigest)))add('EXPORT_ATTESTATION_MISMATCH');
 if(gaps.length)fail(409,gaps.slice(0,100));
 const qualified=report.observed.qualified,spend=report.spend.spendVnd,cost=qualified?spend/qualified:null;
 return {policy:POLICY,measurement:'QUALIFIED_SCOPE_CPQL',companyId:ctx.facts.companyId,trialId:ctx.facts.trial.id,contextVersion:ctx.contextVersion,asOf:report.asOf,qualificationAsOf:report.asOf,
  sinceAt:report.period.sinceAt,untilExclusive:report.period.untilExclusive,accountIds:ctx.facts.trial.account_ids,
  status:qualified?'ACCEPTED_SCOPE':'NO_QUALIFIED_LEADS',spendVnd:spend,qualifiedLeads:qualified,costPerQualifiedLeadVnd:cost,targetVnd:250000,
  targetStatus:qualified?(cost<=250000?'AT_OR_BELOW_TARGET_IN_SCOPE':'ABOVE_TARGET_IN_SCOPE'):'NOT_EVALUATED',
  basis:'OPERATOR_ACCEPTED_PROVENANCE_AND_SERVER_RECONCILIATION',providerUniverseVerified:false,allChannelsMeasured:false,allowBudgetExecution:false};
}
function publicRequirements(ctx){
 const r=requirements(ctx);return{period:r.report.period,ads:r.ads,entries:r.entries,exports:r.exports,gaps:r.gaps,
  reference:r.report.sourceRegistry?.declaration?.sourceReference||'',allowBudgetExecution:false};
}
function publicReceipt(x,company,trial){
 if(!x||x.policy!==POLICY||x.companyId!==company||x.trialId!==trial||!uuid(x.requestId)||!uuid(x.actorId)||!Number.isSafeInteger(x.revision)||x.revision<1||!timestamp(x.recordedAt)||!['ACCEPT','REVOKE'].includes(x.action)||typeof x.replayed!=='boolean'||x.allowBudgetExecution!==false)fail();
 let report=null;
 if(x.action==='ACCEPT'){
  const r=x.report;if(!r||r.policy!==POLICY||r.measurement!=='QUALIFIED_SCOPE_CPQL'||r.companyId!==company||r.trialId!==trial||!hash(r.contextVersion)||r.contextVersion!==x.contextVersion||
   !hash(x.artifactSha256)||!Number.isSafeInteger(x.artifactBytes)||x.artifactBytes<1||x.artifactBytes>1048576||x.targetRequestId!==null||
   !timestamp(r.asOf)||r.qualificationAsOf!==r.asOf||Date.parse(r.asOf)>Date.parse(x.recordedAt)||!timestamp(r.sinceAt)||!timestamp(r.untilExclusive)||Date.parse(r.sinceAt)>=Date.parse(r.untilExclusive)||Date.parse(r.untilExclusive)>Date.parse(r.asOf)||
   !Array.isArray(r.accountIds)||!r.accountIds.length||r.accountIds.length>100||!r.accountIds.every(a=>typeof a==='string'&&/^act_[0-9]{1,32}$/.test(a))||new Set(r.accountIds).size!==r.accountIds.length||
   !Number.isSafeInteger(r.spendVnd)||r.spendVnd<0||!Number.isSafeInteger(r.qualifiedLeads)||r.qualifiedLeads<0||r.costPerQualifiedLeadVnd!==(r.qualifiedLeads?r.spendVnd/r.qualifiedLeads:null)||
   r.targetVnd!==250000||r.targetStatus!==(r.qualifiedLeads?(r.costPerQualifiedLeadVnd<=250000?'AT_OR_BELOW_TARGET_IN_SCOPE':'ABOVE_TARGET_IN_SCOPE'):'NOT_EVALUATED')||
   r.basis!=='OPERATOR_ACCEPTED_PROVENANCE_AND_SERVER_RECONCILIATION'||r.status!==(r.qualifiedLeads?'ACCEPTED_SCOPE':'NO_QUALIFIED_LEADS')||r.allowBudgetExecution!==false||r.providerUniverseVerified!==false||r.allChannelsMeasured!==false)fail();
  report=fields(r,['policy','measurement','companyId','trialId','contextVersion','asOf','qualificationAsOf','sinceAt','untilExclusive','accountIds','status','spendVnd','qualifiedLeads','costPerQualifiedLeadVnd','targetVnd','targetStatus','basis','providerUniverseVerified','allChannelsMeasured','allowBudgetExecution']);
 }else if(x.contextVersion!==null||x.report!==null||x.artifactSha256!==null||x.artifactBytes!==null||!uuid(x.targetRequestId))fail();
 return {...fields(x,['policy','companyId','trialId','actorId','requestId','revision','action','contextVersion','recordedAt','artifactSha256','artifactBytes','targetRequestId','replayed','allowBudgetExecution']),report};
}
function matchesRequest(receipt,request,actor){
 const c=request.command;
 if(receipt.actorId!==actor||receipt.requestId!==request.requestId||receipt.action!==c.action||receipt.revision!==c.expectedRevision+1||
  (c.action==='ACCEPT'&&(receipt.contextVersion!==c.contextVersion||receipt.artifactSha256!==c.artifactSha256||receipt.artifactBytes!==c.artifactBytes))||
  (c.action==='REVOKE'&&receipt.targetRequestId!==c.targetRequestId))fail();
 return receipt;
}
function publicView(c,actor,company,trial){
 if(c?.actorId!==actor||c.companyId!==company||c.trialId!==trial||!Number.isSafeInteger(c.revision)||c.revision<0||
  !Array.isArray(c.history)||c.history.length>20||!['MISSING','CURRENT','REVOKED','STALE_AUTHORITY','CHANGED_SOURCE','SOURCE_UNAVAILABLE'].includes(c.currentStatus))fail();
 const history=c.history.map(x=>publicReceipt(x,company,trial));
 if((!history.length)!==(c.revision===0)||(c.currentStatus==='MISSING')!==(c.revision===0)||history.some((x,i)=>x.revision!==c.revision-i))fail();
 if(c.context&&(c.context.facts?.companyId!==company||c.context.facts?.trial?.id!==trial||!hash(c.context.contextVersion)))fail();
 const current=history[0];
 if((c.currentStatus==='REVOKED')!==(current?.action==='REVOKE'))fail();
 if(c.currentStatus==='CURRENT'&&(!c.context||current?.action!=='ACCEPT'||current.contextVersion!==c.context.contextVersion))fail();
 // Re-evaluate prerequisites at read time: an accepted receipt is historical;
 // a malformed/expired source can never be displayed as a current result.
 const required=c.context?publicRequirements(c.context):null;
 if(c.currentStatus==='CURRENT'&&required.gaps.length)fail();
 return {policy:POLICY,actorId:actor,companyId:company,trialId:trial,revision:c.revision,currentStatus:c.currentStatus,contextVersion:c.context?.contextVersion||null,
  requirements:required,history,allowBudgetExecution:false};
}
function createScopeAcceptance({db,isPrimary,env=process.env}){
 return async(req,res,write=false)=>{
  res.set('Cache-Control','no-store');const enabled=()=>env.VPT_MARKETING_SCOPE_ACCEPTANCE==='1'&&env.VPT_MARKETING_TRIAL_REPORT==='1'&&isPrimary()===true;
  if(!enabled())return res.status(503).json({error:'Xác nhận phạm vi đo chưa được mở.'});
  const actor=req.user?.userId,company=req.query?.company_id,trial=req.params?.trialId;
  if(!uuid(actor)||!uuid(company)||!uuid(trial)||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được phạm vi.'});
  if(Object.keys(req.query||{}).some(k=>k!=='company_id'))return res.status(400).json({error:'Dùng phạm vi kỳ đo đã chọn.'});
  const rpc=async(name,args)=>{const r=await db.rpc(name,{p_actor:actor,p_company:company,p_trial:trial,...args});if(r.error)fail(({'42501':403,'40001':409,'23505':409,'22023':400})[r.error.code]||503);if(!enabled())fail();return r.data;};
  try{
   const request=write?parseRequest(req.body):null,c=await rpc('marketing_scope_prepare',{p_request:request?.requestId||null,p_command:request?.command||null});
   if(c?.receipt){if(!write||c.receipt.replayed!==true)fail();return res.json({receipt:matchesRequest(publicReceipt(c.receipt,company,trial),request,actor),currentStatus:'HISTORICAL_REPLAY'});}
   if(c?.actorId!==actor||c.companyId!==company||c.trialId!==trial)fail();
   if(write){
    if(request.command.expectedRevision!==c.revision)fail(409);
    if(request.command.action==='ACCEPT'&&(c.context?.facts?.companyId!==company||c.context?.facts?.trial?.id!==trial))fail();
    const report=request.command.action==='ACCEPT'?evaluate(c.context,request.command):null;
    const out=await rpc('marketing_scope_record',{p_request:request.requestId,p_command:request.command,p_report:report,p_artifact:request.artifact});
    return res.json({receipt:matchesRequest(publicReceipt(out,company,trial),request,actor),currentStatus:out.replayed?'HISTORICAL_REPLAY':'RECORDED_AT_RESPONSE'});
   }
   return res.json(publicView(c,actor,company,trial));
  }catch(e){return res.status(e.status||503).json({error:e.status===400?'Hồ sơ chưa hợp lệ; kiểm tra tài liệu, khoảng thời gian và các nguồn đã chọn.':e.status===403?'Không còn quyền trong phạm vi này.':e.status===409?'Chưa đủ bằng chứng hoặc dữ liệu đã đổi. Tải lại để đối chiếu.':'Chưa xác nhận được kết quả. Giữ nguyên mã yêu cầu để kiểm tra lại.',...(e.issues?{issues:e.issues}:{} )});}
 };
}
module.exports={POLICY,CLAIMS,keyOf,parseRequest,requirements,evaluate,publicReceipt,publicView,createScopeAcceptance};
