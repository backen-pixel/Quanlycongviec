const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const fail=()=>{throw Error('Chưa xác nhận được số liệu hoặc phạm vi. Tải lại để kiểm tra.');};
export const CLAIMS=['HISTORICAL_DESTINATION_SETS_CHECKED','ALL_ACCOUNT_DELIVERY_CHECKED','EXPORT_FILTERS_TIME_AND_RETENTION_CHECKED'];
export function receiptResult(x,company,trial,pending=null,actor=null){
 if(!x||x.policy!=='ACCEPTED_DECLARED_FACEBOOK_SCOPE_V1'||x.companyId!==company||x.trialId!==trial||!uuid(x.requestId)||!uuid(x.actorId)||!Number.isSafeInteger(x.revision)||x.revision<1||!stamp(x.recordedAt)||typeof x.replayed!=='boolean'||x.allowBudgetExecution!==false)fail();
 if(x.action==='ACCEPT'){
  const r=x.report;if(!hash(x.contextVersion)||!hash(x.artifactSha256)||!Number.isSafeInteger(x.artifactBytes)||x.artifactBytes<1||x.artifactBytes>1048576||x.targetRequestId!==null||!r||r.policy!==x.policy||r.measurement!=='QUALIFIED_SCOPE_CPQL'||r.companyId!==company||r.trialId!==trial||r.contextVersion!==x.contextVersion||
   !stamp(r.asOf)||r.qualificationAsOf!==r.asOf||Date.parse(r.asOf)>Date.parse(x.recordedAt)||!stamp(r.sinceAt)||!stamp(r.untilExclusive)||Date.parse(r.sinceAt)>=Date.parse(r.untilExclusive)||Date.parse(r.untilExclusive)>Date.parse(r.asOf)||
   !Array.isArray(r.accountIds)||!r.accountIds.length||r.accountIds.length>100||r.accountIds.some(a=>!/^act_[0-9]{1,32}$/.test(a))||new Set(r.accountIds).size!==r.accountIds.length||
   !Number.isSafeInteger(r.spendVnd)||r.spendVnd<0||!Number.isSafeInteger(r.qualifiedLeads)||r.qualifiedLeads<0||r.costPerQualifiedLeadVnd!==(r.qualifiedLeads?r.spendVnd/r.qualifiedLeads:null)||r.targetVnd!==250000||
   r.status!==(r.qualifiedLeads?'ACCEPTED_SCOPE':'NO_QUALIFIED_LEADS')||r.targetStatus!==(r.qualifiedLeads?(r.costPerQualifiedLeadVnd<=250000?'AT_OR_BELOW_TARGET_IN_SCOPE':'ABOVE_TARGET_IN_SCOPE'):'NOT_EVALUATED')||
   r.basis!=='OPERATOR_ACCEPTED_PROVENANCE_AND_SERVER_RECONCILIATION'||r.providerUniverseVerified!==false||r.allChannelsMeasured!==false||r.allowBudgetExecution!==false)fail();
 }else if(x.action!=='REVOKE'||x.report!==null||x.contextVersion!==null||x.artifactSha256!==null||x.artifactBytes!==null||!uuid(x.targetRequestId))fail();
 if(pending){const c=pending.command;if(x.actorId!==actor||x.requestId!==pending.requestId||x.action!==c.action||x.revision!==c.expectedRevision+1||
  (c.action==='ACCEPT'&&(x.contextVersion!==c.contextVersion||x.artifactSha256!==pending.fileSha256||x.artifactBytes!==pending.fileBytes))||(c.action==='REVOKE'&&x.targetRequestId!==c.targetRequestId))fail();}
 return x;
}
export function scopeResult(x,actor,company,trial){
 if(!x||x.policy!=='ACCEPTED_DECLARED_FACEBOOK_SCOPE_V1'||x.actorId!==actor||x.companyId!==company||x.trialId!==trial||x.allowBudgetExecution!==false||!Number.isSafeInteger(x.revision)||x.revision<0||
  !['MISSING','CURRENT','REVOKED','STALE_AUTHORITY','CHANGED_SOURCE','SOURCE_UNAVAILABLE'].includes(x.currentStatus)||!Array.isArray(x.history)||x.history.length>20||(!x.history.length)!==(x.revision===0)||(x.currentStatus==='MISSING')!==(x.revision===0))fail();
 x.history.forEach((r,i)=>{receiptResult(r,company,trial);if(r.revision!==x.revision-i)fail();});
 const current=x.history[0];if((x.currentStatus==='REVOKED')!==(current?.action==='REVOKE'))fail();
 if(x.requirements!==null){const q=x.requirements;if(!hash(x.contextVersion)||!q||!q.period||!Array.isArray(q.ads)||q.ads.length>500000||!Array.isArray(q.entries)||!Array.isArray(q.exports)||!Array.isArray(q.gaps)||q.allowBudgetExecution!==false||
   q.ads.some(a=>!/^act_[0-9]{1,32}$/.test(a.accountId)||!/^[0-9]{1,32}$/.test(a.adId))||q.entries.some(e=>!hash(e.key))||q.exports.some(e=>!uuid(e.requestId)||!hash(e.fileSha256)||!hash(e.normalizedRowsDigest)))fail();
 }else if(x.contextVersion!==null)fail();
 if(x.currentStatus==='CURRENT'&&(current?.action!=='ACCEPT'||!x.requirements||x.requirements.gaps.length||current.contextVersion!==x.contextVersion))fail();
 return x;
}
export const localTime=x=>stamp(x)?new Date(Date.parse(x)+7*3600000).toISOString().slice(0,19):'';
export function utcTime(x){
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(x))throw Error('Cần giờ Việt Nam hợp lệ.');
 const full=x.length===16?x+':00':x,date=new Date(full+'+07:00');if(!Number.isFinite(date.getTime())||localTime(date.toISOString())!==full)throw Error('Ngày hoặc giờ chưa hợp lệ.');return date.toISOString();
}
export function initialManifest(q){return(q?.ads||[]).map(a=>({accountId:a.accountId,adId:a.adId,from:localTime(q.period.sinceAt),until:localTime(q.period.untilExclusive),destinations:[]}));}
export function manifestCommand(rows){return rows.map(r=>({accountId:r.accountId,adId:r.adId,validFrom:utcTime(r.from),validUntil:utcTime(r.until),destinations:r.destinations}));}
const storageKey=(a,c,t)=>'vpt-scope-acceptance:v1:'+a+':'+c+':'+t;
function valid(p){if(!p||Object.keys(p).length!==4||!uuid(p.requestId)||!p.command||!Number.isSafeInteger(p.command.expectedRevision)||p.command.expectedRevision<0)fail();
 if(p.command.action==='ACCEPT'){if(!hash(p.command.contextVersion)||!hash(p.fileSha256)||!Number.isSafeInteger(p.fileBytes)||p.fileBytes<1||p.fileBytes>1048576||!Array.isArray(p.command.manifest)||!Array.isArray(p.command.exportClaims)||!Array.isArray(p.command.claims))fail();}
 else if(p.command.action!=='REVOKE'||!uuid(p.command.targetRequestId)||typeof p.command.reason!=='string'||p.fileSha256!==null||p.fileBytes!==null)fail();
 if(Object.hasOwn(p,'artifactBase64')||Object.hasOwn(p.command,'artifactBase64'))fail();return p;
}
export function readPending(storage,a,c,t){const s=storage.getItem(storageKey(a,c,t));return s?valid(JSON.parse(s)):null;}
export function savePending(storage,a,c,t,p){valid(p);const value=JSON.stringify(p);storage.setItem(storageKey(a,c,t),value);if(storage.getItem(storageKey(a,c,t))!==value)throw Error('Không giữ được mã yêu cầu; chưa gửi thay đổi.');}
export function clearPending(storage,a,c,t){storage.removeItem(storageKey(a,c,t));}
