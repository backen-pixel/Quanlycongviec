'use strict';
const {createHash}=require('node:crypto');
const {TextDecoder}=require('node:util');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const fail=(message='SOURCE_EXPORT_UNAVAILABLE',status=503)=>{throw Object.assign(Error(message),{status});};
const keys=(x,allowed)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k));
// No locale or machine-timezone interpretation. Preserve provider IDs as text.
function stamp(x){
 if(typeof x!=='string')fail('INVALID_TIMESTAMP',400);
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/.exec(x);
 if(!m||+m[1]<1970||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+m[6]>59)fail('INVALID_TIMESTAMP',400);
 if(m[8]!=='Z'){const offset=m[8].replace(':','');if(+offset.slice(1,3)>14||+offset.slice(3)>59||(+offset.slice(1,3)===14&&+offset.slice(3)!==0))fail('INVALID_TIMESTAMP',400);}
 const n=Date.parse(x);if(!Number.isFinite(n))fail('INVALID_TIMESTAMP',400);return new Date(n).toISOString();
}
function csvRows(text,delimiter){
 const records=[];let record=[],cell='',quoted=false,closed=false,start=true;
 const field=()=>{record.push(cell);if(record.length>200)fail('CSV_TOO_WIDE',400);cell='';closed=false;start=true;};
 const line=()=>{field();records.push(record);record=[];if(records.length>5001)fail('TOO_MANY_ROWS',400);};
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='\0')fail('INVALID_CSV',400);
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c===delimiter){field();continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue;}
  if(c==='"'&&start){quoted=true;start=false;continue;}
  if(closed||c==='"')fail('INVALID_CSV',400);cell+=c;start=false;
 }
 if(quoted)fail('INVALID_CSV',400);if(cell!==''||record.length||closed)line();
 if(!records.length)fail('HEADER_REQUIRED',400);return records;
}
function parseExport(body){
 if(!keys(body,['requestId','contextVersion','pageId','formId','fileBase64','delimiter','columns','exportedAt','sourceReference','sourceNote'])||!uuid(body.requestId)||!hash(body.contextVersion)||!numeric(body.pageId)||!numeric(body.formId)||
  ![',',';','\t'].includes(body.delimiter)||!keys(body.columns,['id','createdAt','formId'])||!['id','createdAt'].every(k=>typeof body.columns[k]==='string'&&body.columns[k].length>0&&body.columns[k].length<=120)||
  (body.columns.formId!==null&&(typeof body.columns.formId!=='string'||!body.columns.formId||body.columns.formId.length>120))||new Set(Object.values(body.columns).filter(x=>x!==null)).size!==Object.values(body.columns).filter(x=>x!==null).length||
  typeof body.sourceReference!=='string'||body.sourceReference.trim().length<8||body.sourceReference.length>500||typeof body.sourceNote!=='string'||body.sourceNote.trim().length<20||body.sourceNote.length>2000)fail('INVALID_EXPORT',400);
 const encoded=body.fileBase64;if(typeof encoded!=='string'||!encoded.length||encoded.length>1398104||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('INVALID_FILE',400);
 const bytes=Buffer.from(encoded,'base64');if(bytes.length>1048576||bytes.toString('base64')!==encoded)fail('INVALID_FILE',400);
 let text,encoding='UTF-8';try{if(bytes[0]===255&&bytes[1]===254){encoding='UTF-16LE';text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes);}else text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_ENCODING',400);}
 const parsed=csvRows(text,body.delimiter),headers=parsed.shift().map(x=>x.trim());
 if(headers.some(x=>!x)||new Set(headers).size!==headers.length)fail('AMBIGUOUS_HEADERS',400);
 const positions=Object.fromEntries(Object.entries(body.columns).map(([k,v])=>[k,v===null?null:headers.indexOf(v)]));if(Object.values(positions).includes(-1))fail('COLUMN_NOT_FOUND',400);
 const rows=parsed.map(r=>{if(r.length!==headers.length)fail('ROW_WIDTH_MISMATCH',400);const id=r[positions.id].trim(),form=positions.formId===null?body.formId:r[positions.formId].trim();if(!numeric(id)||!numeric(form))fail('INVALID_PROVIDER_ID',400);return{leadgenId:id,formId:form,acquiredAt:stamp(r[positions.createdAt].trim())};});
 return{requestId:body.requestId,command:{contextVersion:body.contextVersion,pageId:body.pageId,formId:body.formId,rows,
  fileSha256:createHash('sha256').update(bytes).digest('hex'),fileBytes:bytes.length,encoding,parser:'DELIMITED_SOURCE_IDS_V1',delimiter:body.delimiter,columns:body.columns,
  exportedAt:stamp(body.exportedAt),sourceReference:body.sourceReference.trim(),sourceNote:body.sourceNote.trim()}};
}
function projectExport(x,actor,company,trial){
 if(!x||x.policy!=='SOURCE_EXPORT_COMPARISON_V1'||x.actorId!==actor||x.companyId!==company||x.trialId!==trial||x.providerCoverage!=='UNVERIFIED'||x.allowBudgetExecution!==false)fail();
 const base={policy:x.policy,actorId:actor,companyId:company,trialId:trial,providerCoverage:'UNVERIFIED',allowBudgetExecution:false};
 if(x.requestId){
  const c=x.comparison;
  if(!uuid(x.requestId)||!hash(x.contextVersion)||!hash(x.fileSha256)||!hash(x.normalizedRowsDigest)||!hash(x.registryDigest)||!hash(x.pagesDigest)||!uuid(x.censusRunId)||!numeric(x.pageId)||!numeric(x.formId)||typeof x.replayed!=='boolean'||
   !['recordedAt','sinceAt','untilExclusive','exportedAt'].every(k=>typeof x[k]==='string'&&Number.isFinite(Date.parse(x[k])))||Date.parse(x.untilExclusive)<=Date.parse(x.sinceAt)||!Number.isSafeInteger(x.fileBytes)||x.fileBytes<1||x.fileBytes>1048576||
   typeof x.sourceReference!=='string'||typeof x.sourceNote!=='string'||!['MATCHED_EXPORTED_IDS','DISCREPANCIES','DUPLICATE_ROWS','EMPTY_COMPARISON'].includes(x.status)||!c||
   !['rows','inPeriodRows','outsidePeriodRows','uniqueExportIds','duplicateRows','observedIds','matched','notInExport','notObserved','conflicts'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0&&c[k]<=10000)||c.rows!==c.inPeriodRows+c.outsidePeriodRows||c.uniqueExportIds>c.inPeriodRows||c.rows>5000||
   !Array.isArray(c.differences)||c.differences.length>100||c.differences.some(d=>!numeric(d.id)||!['NOT_IN_EXPORT','NOT_OBSERVED','EXPORT_CONFLICT','SOURCE_CONFLICT'].includes(d.reason)))fail();
  const discrepancy=c.notInExport+c.notObserved+c.conflicts;
  const expected=discrepancy?'DISCREPANCIES':c.duplicateRows?'DUPLICATE_ROWS':!c.uniqueExportIds?'EMPTY_COMPARISON':'MATCHED_EXPORTED_IDS';if(x.status!==expected||c.differences.length!==Math.min(100,discrepancy))fail();
  return{...base,...Object.fromEntries(['requestId','contextVersion','pageId','formId','recordedAt','replayed','censusRunId','registryDigest','pagesDigest','sinceAt','untilExclusive','fileSha256','fileBytes','normalizedRowsDigest','exportedAt','sourceReference','sourceNote','status'].map(k=>[k,x[k]])),
   comparison:{...Object.fromEntries(['rows','inPeriodRows','outsidePeriodRows','uniqueExportIds','duplicateRows','observedIds','matched','notInExport','notObserved','conflicts'].map(k=>[k,c[k]])),differences:c.differences.map(d=>({id:d.id,reason:d.reason,exportedForm:d.exportedForm,observedForm:d.observedForm,exportedEpoch:d.exportedEpoch,observedEpoch:d.observedEpoch}))}};
 }
 const reg=x.registry,run=x.census?.run,m=x.census?.measuredEvidence;
 if(!hash(x.contextVersion)||!Number.isFinite(Date.parse(x.asOf))||!reg||!['MISSING','CURRENT','STALE_AUTHORITY','STALE_CONFIGURATION'].includes(reg.status)||!Array.isArray(x.exports)||x.exports.length>1000)fail();
 const forms=reg.declaration?.entries?.filter(e=>e.kind==='META_LEAD_ADS').map(e=>({pageId:e.pageId,formId:e.formId}))||[];
 if(forms.some(f=>!numeric(f.pageId)||!numeric(f.formId)))fail();
 if(run&&(!uuid(run.id)||!['SCANNED','RUNNING','FAILED'].includes(run.state)||!Number.isFinite(Date.parse(run.since))||!Number.isFinite(Date.parse(run.until))||!run.witness||!['MISSING','PARTIAL','TRAVERSED','FAILED','STALE_SCOPE'].includes(run.witness.status)||!hash(run.witness.pagesDigest)||!m||!hash(m.digest)||!Number.isSafeInteger(m.count)))fail();
 return{...base,asOf:x.asOf,contextVersion:x.contextVersion,registryStatus:reg.status,forms:forms.filter((f,i)=>forms.findIndex(z=>z.pageId===f.pageId&&z.formId===f.formId)===i),
  census:run?{id:run.id,state:run.state,sinceAt:run.since,untilExclusive:run.until,scopeCurrent:run.scopeCurrent,witnessStatus:run.witness.status,pagesDigest:run.witness.pagesDigest,measuredCount:m.count,measuredDigest:m.digest}:null,
  exports:x.exports.map(e=>{if(!['CURRENT','STALE_AUTHORITY','STALE_CONTEXT'].includes(e.currentStatus)||!uuid(e.receipt?.actorId))fail();return{currentStatus:e.currentStatus,receipt:projectExport(e.receipt,e.receipt.actorId,company,trial)};})};
}
function createSourceExport({db,isPrimary,env=process.env}){
 return async(req,res,write=false)=>{
  res.set('Cache-Control','no-store');const enabled=()=>env.VPT_MARKETING_SOURCE_EXPORT==='1'&&env.VPT_MARKETING_TRIAL_REPORT==='1'&&isPrimary()===true;
  if(!enabled())return res.status(503).json({error:'Đối soát bản xuất nguồn chưa được mở.'});
  const actor=req.user?.userId,company=req.query?.company_id,trial=req.params?.trialId;
  if(!uuid(actor)||!uuid(company)||!uuid(trial)||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  if(Object.keys(req.query||{}).some(k=>k!=='company_id'))return res.status(400).json({error:'Bản xuất dùng phạm vi của kỳ đo.'});
  try{
   const request=write?parseExport(req.body):null;
   const r=await db.rpc(write?'marketing_source_export_record':'marketing_source_export_read',{p_actor:actor,p_company:company,p_trial:trial,...(write?{p_request:request.requestId,p_command:request.command}:{})});
   if(r.error)fail('SOURCE_EXPORT_UNAVAILABLE',({'42501':403,'40001':409,'23505':409,'22023':400,'22007':400,'22008':400,'22P02':400})[r.error.code]||503);
   if(!enabled())fail();const out=projectExport(r.data,actor,company,trial);
   if(write&&(out.requestId!==request.requestId||out.fileSha256!==request.command.fileSha256||typeof out.replayed!=='boolean'))fail();
   return res.json(out);
  }catch(e){return res.status(e.status||503).json({error:e.status===400?'Bản xuất không hợp lệ: kiểm tra cột mã, thời điểm có múi giờ, định dạng CSV và giới hạn 5.000 dòng/1 MB.':e.status===409?'Nguồn hoặc kỳ đo đã thay đổi, hoặc mã yêu cầu đã được dùng cho nội dung khác. Tải lại để đối soát.':e.status===403?'Không còn quyền trong phạm vi này.':'Chưa xác nhận được kết quả đối soát. Giữ nguyên tệp và mã yêu cầu để kiểm tra lại.'});}
 };
}
module.exports={parseExport,csvRows,stamp,createSourceExport,projectExport};
