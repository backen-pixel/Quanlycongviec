'use strict';
const {reportTrial}=require('./trialReport');
const {summarizeSpend}=require('./spendCoverage');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const fields=(x,names)=>Object.fromEntries(names.filter(k=>x[k]!==undefined).map(k=>[k,x[k]]));
const fail=(status=503)=>{throw Object.assign(Error('MEASUREMENT_UNAVAILABLE'),{status});};
const DEPENDENCIES=['trial','identity','qualification','spend','source','registry','exports','exportContext'];
const COUNT_KEYS=['qualified','pending','rejected','unresolved','existing','organic','unknownSource','observedPaidGroups','unprocessedForms','unlinkedProofs'];
const CODES=['ACCOUNT_DESTINATIONS_UNVERIFIED','SOURCE_REGISTRY_NOT_CURRENT','EXPORT_MISSING','EXPORT_CHANGED','EXPORT_DISCREPANCIES','EXPORT_DUPLICATES','ZERO_SOURCE_UNVERIFIED','EXPORT_PROVENANCE_UNVERIFIED','ENTRYPOINT_NOT_RECONCILED','FORM_ACCOUNT_UNRESOLVED','SPEND_UNAVAILABLE','COHORT_UNRESOLVED','QUALIFICATION_PENDING','CENSUS_NOT_RECONCILED'];
function dependencies(x){if(!object(x)||Object.keys(x).length!==DEPENDENCIES.length||!DEPENDENCIES.every(k=>hash(x[k])))fail();return fields(x,DEPENDENCIES);}
function obligation(x){
 if(!object(x)||!CODES.includes(x.code)||!['ACCOUNT','ENTRYPOINT','CRM','CENSUS'].includes(x.scope)||!Number.isSafeInteger(x.count)||x.count<1||x.count>100000)fail();
 for(const k of ['pageId','formId'])if(x[k]!==null&&(typeof x[k]!=='string'||!/^[0-9]{1,32}$/.test(x[k])))fail();
 if(x.accountId!==null&&(typeof x.accountId!=='string'||!/^act_[0-9]{1,32}$/.test(x.accountId)))fail();
 if(x.evidenceId!==null&&!uuid(x.evidenceId))fail();
 if(x.kind!==null&&!['META_LEAD_ADS','MESSENGER','WEBSITE','PHONE','OTHER','NO_LEAD_SOURCE','UNRESOLVED_FORM'].includes(x.kind))fail();
 return fields(x,['code','scope','accountId','pageId','formId','kind','evidenceId','count']);
}
function calculateSnapshot(context){
 const raw=context?.facts;
 if(!raw||!hash(context.contextVersion)||!Array.isArray(context.exports)||context.exports.length>1000)fail();
 const r=reportTrial(raw),dep=dependencies(context.dependencies),obligations=[];
 const add=(code,scope,x={},count=1)=>obligations.push(obligation({code,scope,accountId:x.accountId??null,pageId:x.pageId??null,formId:x.formId??null,kind:x.kind??null,evidenceId:x.evidenceId??null,count}));
 if(r.sourceRegistry?.status!=='CURRENT')add('SOURCE_REGISTRY_NOT_CURRENT','ENTRYPOINT');
 for(const accountId of raw.trial.account_ids){
  add('ACCOUNT_DESTINATIONS_UNVERIFIED','ACCOUNT',{accountId});
  const s=summarizeSpend({accounts:raw.accounts.filter(a=>a.ad_account_id===accountId),runs:raw.runs.filter(x=>x.ad_account_id===accountId),companyId:raw.companyId,since:r.period.since,until:r.period.until,now:raw.asOf,throughExclusive:r.period.untilExclusive});
  if(s.status!=='KNOWN_TO_DATE')add('SPEND_UNAVAILABLE','ACCOUNT',{accountId});
 }
 for(const e of r.sourceRegistry?.declaration?.entries||[]){
  if(e.kind!=='META_LEAD_ADS'){add(e.kind==='UNRESOLVED_FORM'?'FORM_ACCOUNT_UNRESOLVED':e.kind==='NO_LEAD_SOURCE'?'ZERO_SOURCE_UNVERIFIED':'ENTRYPOINT_NOT_RECONCILED','ENTRYPOINT',e);continue;}
  const found=context.exports.filter(x=>x.pageId===e.pageId&&x.formId===e.formId);
  if(found.length>1)fail();
  const x=found[0];if(!x){add('EXPORT_MISSING','ENTRYPOINT',e);continue;}
  if(!uuid(x.requestId)||!['CURRENT','STALE_CONTEXT','STALE_AUTHORITY'].includes(x.currentStatus)||!['MATCHED_EXPORTED_IDS','DISCREPANCIES','DUPLICATE_ROWS','EMPTY_COMPARISON'].includes(x.status))fail();
  const code=x.currentStatus!=='CURRENT'?'EXPORT_CHANGED':({DISCREPANCIES:'EXPORT_DISCREPANCIES',DUPLICATE_ROWS:'EXPORT_DUPLICATES',EMPTY_COMPARISON:'ZERO_SOURCE_UNVERIFIED',MATCHED_EXPORTED_IDS:'EXPORT_PROVENANCE_UNVERIFIED'})[x.status];
  add(code,'ENTRYPOINT',{...e,evidenceId:x.requestId});
 }
 if(r.reconciliation.recordMatchStatus!=='MATCHED_OBSERVED')add('CENSUS_NOT_RECONCILED','CENSUS',{},1);
 const unresolved=r.observed.unresolved+r.observed.unknownSource+r.observed.unprocessedForms+r.observed.unlinkedProofs;
 if(unresolved)add('COHORT_UNRESOLVED','CRM',{},unresolved);
 if(r.observed.pending)add('QUALIFICATION_PENDING','CRM',{},r.observed.pending);
 return projectReport({calculationVersion:'OBSERVED_TRIAL_REPORT_V1',companyId:raw.companyId,trialId:raw.trial.id,asOf:r.asOf,status:'SAVED_OBSERVED_INCOMPLETE',
  period:r.period,spend:r.spend,counts:fields(r.observed,COUNT_KEYS),observedMeasurement:r.observedMeasurement,dependencies:dep,obligations,
  targetStatus:'NOT_EVALUATED',allowBudgetExecution:false},raw.companyId,raw.trial.id);
}
// Public history contains amounts, counts and evidence IDs only; no contact,
// group/member IDs, raw inventory, source notes, credentials or file bytes.
function projectReport(x,company,trial){
 if(!object(x)||x.calculationVersion!=='OBSERVED_TRIAL_REPORT_V1'||x.companyId!==company||x.trialId!==trial||!stamp(x.asOf)||x.status!=='SAVED_OBSERVED_INCOMPLETE'||x.targetStatus!=='NOT_EVALUATED'||x.allowBudgetExecution!==false)fail();
 const p=x.period,s=x.spend,m=x.observedMeasurement;
 if(!p||p.policy!=='VIETNAM_CLOSED_DAY_V1'||p.timezone!=='Asia/Ho_Chi_Minh'||!['AVAILABLE','NO_CLOSED_DAY','TRIAL_NOT_STARTED'].includes(p.status)||!stamp(p.sinceAt)||p.qualificationAsOf!==x.asOf||(p.untilExclusive!==null&&!stamp(p.untilExclusive))||!object(x.counts)||!COUNT_KEYS.every(k=>Number.isSafeInteger(x.counts[k])&&x.counts[k]>=0)||!Array.isArray(x.obligations)||x.obligations.length>3000||!s||!['KNOWN_TO_DATE','UNKNOWN'].includes(s.status)||s.allowBudgetExecution!==false)fail();
 if(s.status==='KNOWN_TO_DATE'&&(!Number.isSafeInteger(s.spendVnd)||s.spendVnd<0||!Array.isArray(s.sources)||s.sources.length>100||s.sources.some(v=>typeof v.accountId!=='string'||!/^act_[0-9]{1,32}$/.test(v.accountId)||!['string','number'].includes(typeof v.runId)||!Number.isSafeInteger(v.spendVnd)||v.spendVnd<0||!stamp(v.asOf))||s.sources.reduce((n,v)=>n+v.spendVnd,0)!==s.spendVnd))fail();
 if(!m||m.policy!=='OBSERVED_QUALIFIED_PAID_CPQL_V1'||!['AVAILABLE_PROVISIONAL','NO_QUALIFIED_LEADS','UNAVAILABLE'].includes(m.status)||m.asOf!==x.asOf||m.sinceAt!==p.sinceAt||m.untilExclusive!==p.untilExclusive||m.targetStatus!=='NOT_EVALUATED'||m.allowBudgetExecution!==false||m.spendScope!=='ALL_CONFIGURED_FACEBOOK_ACCOUNTS'||m.leadScope!=='RECONCILED_OBSERVED_META_LEAD_ADS'||!Array.isArray(m.reasons)||!Array.isArray(m.limitations)||!m.evidence||!Array.isArray(m.evidence.spendRunIds))fail();
 if(m.status==='UNAVAILABLE'){if(m.spendVnd!==null||m.qualifiedLeads!==null||m.costPerQualifiedLeadVnd!==null)fail();}
 else if(s.status!=='KNOWN_TO_DATE'||m.spendVnd!==s.spendVnd||m.qualifiedLeads!==x.counts.qualified||m.costPerQualifiedLeadVnd!==(m.qualifiedLeads?m.spendVnd/m.qualifiedLeads:null)||(m.status==='NO_QUALIFIED_LEADS')!==(m.qualifiedLeads===0))fail();
 const spend=s.status==='KNOWN_TO_DATE'?{...fields(s,['status','spendVnd','asOf','since','until','currency','timezone','scope','provisionalToday']),sources:s.sources.map(v=>fields(v,['accountId','runId','spendVnd','asOf'])),allowBudgetExecution:false}:{status:'UNKNOWN',reason:s.reason,spendVnd:null,allowBudgetExecution:false};
 return{calculationVersion:x.calculationVersion,companyId:company,trialId:trial,asOf:x.asOf,status:x.status,
  period:fields(p,['status','policy','timezone','since','until','sinceAt','untilExclusive','censusAligned','censusRunId','qualificationAsOf']),spend,counts:fields(x.counts,COUNT_KEYS),
  observedMeasurement:{...fields(m,['policy','status','spendScope','leadScope','asOf','sinceAt','untilExclusive','spendVnd','qualifiedLeads','pendingQualification','costPerQualifiedLeadVnd','reasons','limitations','targetStatus','allowBudgetExecution']),evidence:fields(m.evidence,['censusRunId','censusFinishedAt','spendRunIds'])},
  dependencies:dependencies(x.dependencies),obligations:x.obligations.map(obligation),targetStatus:'NOT_EVALUATED',allowBudgetExecution:false};
}
function projectReceipt(x,company,trial){
 if(!x||x.policy!=='MARKETING_MEASUREMENT_SNAPSHOT_V1'||x.companyId!==company||x.trialId!==trial||!uuid(x.actorId)||!uuid(x.requestId)||!hash(x.contextVersion)||!hash(x.reportDigest)||!stamp(x.capturedAt)||!stamp(x.recordedAt)||Date.parse(x.recordedAt)<Date.parse(x.capturedAt)||x.calculationVersion!=='OBSERVED_TRIAL_REPORT_V1'||typeof x.replayed!=='boolean'||x.allowBudgetExecution!==false)fail();
 const report=projectReport(x.report,company,trial);if(Date.parse(report.asOf)!==Date.parse(x.capturedAt))fail();
 return{...fields(x,['policy','companyId','trialId','actorId','requestId','contextVersion','capturedAt','recordedAt','calculationVersion','reportDigest','replayed','allowBudgetExecution']),report};
}
function createMeasurementSnapshot({db,isPrimary,env=process.env}){
 return async(req,res,write=false)=>{
  res.set('Cache-Control','no-store');
  const enabled=()=>env.VPT_MARKETING_MEASUREMENT_SNAPSHOT==='1'&&env.VPT_MARKETING_TRIAL_REPORT==='1'&&isPrimary()===true;
  if(!enabled())return res.status(503).json({error:'Bản lưu kết quả đo chưa được mở.'});
  const actor=req.user?.userId,company=req.query?.company_id,trial=req.params?.trialId,b=req.body;
  if(!uuid(actor)||!uuid(company)||!uuid(trial)||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được phạm vi.'});
  if(Object.keys(req.query||{}).some(k=>k!=='company_id')||(write&&(!object(b)||Object.keys(b).length!==2||!uuid(b.requestId)||!hash(b.contextVersion))))return res.status(400).json({error:'Chỉ gửi mã yêu cầu và phiên bản báo cáo đã xem.'});
  const rpc=async(name,args)=>{const r=await db.rpc(name,{p_actor:actor,p_company:company,p_trial:trial,...args});if(r.error)fail(({'42501':403,'40001':409,'23505':409,'22023':400})[r.error.code]||503);if(!enabled())fail();return r.data;};
  try{
   const c=await rpc('marketing_measurement_prepare',{p_request:write?b.requestId:null,p_version:write?b.contextVersion:null});
   if(c?.receipt){if(!write)fail();const r=projectReceipt(c.receipt,company,trial);if(r.actorId!==actor||r.requestId!==b.requestId||r.contextVersion!==b.contextVersion||!r.replayed)fail();return res.json(r);}
   if(c?.actorId!==actor||c.companyId!==company||c.trialId!==trial||c.facts?.companyId!==company||c.facts?.trial?.id!==trial)fail();
   const report=calculateSnapshot(c);
   if(write){
    if(c.contextVersion!==b.contextVersion)fail(409);
    const r=projectReceipt(await rpc('marketing_measurement_record',{p_request:b.requestId,p_version:b.contextVersion,p_report:report}),company,trial);
    if(r.actorId!==actor||r.requestId!==b.requestId||r.contextVersion!==b.contextVersion)fail();
    return res.json(r);
   }
   if(!Array.isArray(c.history)||c.history.length>20)fail();
   return res.json({policy:'MARKETING_MEASUREMENT_SNAPSHOT_V1',actorId:actor,companyId:company,trialId:trial,contextVersion:c.contextVersion,preview:report,allowBudgetExecution:false,
    history:c.history.map(x=>{if(!['UNCHANGED_INPUTS','CHANGED_SINCE_CAPTURE','STALE_AUTHORITY'].includes(x.currentStatus))fail();return{currentStatus:x.currentStatus,receipt:projectReceipt(x.receipt,company,trial)};})});
  }catch(e){return res.status(e.status||503).json({error:e.status===409?'Dữ liệu hoặc phạm vi đã đổi. Tải lại trước khi lưu bản mới.':e.status===403?'Không còn quyền trong phạm vi này.':e.status===400?'Yêu cầu lưu chưa hợp lệ.':'Chưa xác nhận được kết quả. Giữ mã yêu cầu để kiểm tra lại.'});}
 };
}
module.exports={calculateSnapshot,projectReport,projectReceipt,createMeasurementSnapshot};

