import {advisorDraft} from './careAdvisorState.mjs';
const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const check=x=>{if(!x)throw Error('RUNTIME_VIEW_UNAVAILABLE');};
const states=['RUNNING','DRAFT','REVIEW','FAILED'];
export const runLabels={RUNNING:'Đang xử lý',DRAFT:'Đã lưu kết quả AI',REVIEW:'Cần kiểm tra',FAILED:'Xử lý chưa thành công'};
export const deliveryLabels={HELD:'Đang giữ để kiểm tra',SENDING:'Đang chờ kết quả gửi',SENT:'Đã có bằng chứng gửi',UNCERTAIN:'Chưa rõ kết quả gửi',CONFLICT:'Bằng chứng gửi mâu thuẫn'};
export function runtimeList(data,companyId){
 check(id(companyId)&&data?.companyId===companyId&&data.send===false&&Array.isArray(data.items)&&data.items.length<=20);
 check(data.items.every(x=>[x?.request_id,x?.thread_id,x?.principal_id,x?.grant_id].every(id)&&date(x.created_at)&&states.includes(x.state)
  &&typeof x.needs_reconciliation==='boolean'&&typeof x.scope_available==='boolean'&&(!x.needs_reconciliation||x.state==='RUNNING')));
 check(new Set(data.items.map(x=>x.request_id)).size===data.items.length);
 check(data.nextAfter===null||(id(data.nextAfter)&&data.items.at(-1)?.request_id===data.nextAfter));return data;
}
export function runtimeTurn(data,companyId,item){
 check(data?.companyId===companyId&&data.requestId===item.request_id&&data.threadId===item.thread_id&&data.principalId===item.principal_id&&data.grantId===item.grant_id
  &&data.principalKind==='AGENT'&&id(data.workerId)&&typeof data.authorityCurrent==='boolean');
 // The existing reader deliberately hides drafts after context/authority changes.
 const masked=data.stale||!data.authorityCurrent||data.state==='RUNNING';
 if(masked)check(data.result===null);
 if(!masked&&data.result?.action==='SURVEY'){
  const r=data.result;check(data.state==='DRAFT'&&r.text===null&&r.entryId===null&&r.needsVerified===false&&r.requiresReview===true&&r.send===false);
  // Reuse the proven quote validator without treating SURVEY as a human draft.
  advisorDraft({...data,state:'REVIEW',result:{...r,action:'HANDOFF'}},companyId,item.thread_id,item.request_id);
  check(r.needs.some(x=>x.field==='location')&&r.needs.some(x=>x.field==='request'));
 }else advisorDraft({...data,stale:masked||data.stale},companyId,item.thread_id,item.request_id);
 const r=data.runtimeResult;
 check(r===null||object(r));
 if(r){
  check(r.companyId===companyId&&r.requestId===data.requestId&&r.threadId===data.threadId&&r.principalId===data.principalId&&r.grantId===data.grantId&&r.state===data.state&&r.send===false);
  if(r.operatorClosed===true)check(data.state==='REVIEW');
  else check(typeof r.handoff==='boolean'&&typeof r.stale==='boolean'&&(r.humanDeadline===null||date(r.humanDeadline)));
  if(r.survey!=null){check(object(r.survey)&&r.survey.reservationMade===false);
   check(r.survey.proposalId? id(r.survey.proposalId)&&r.survey.customerConfirmationRequired===true&&!r.survey.reason:
    typeof r.survey.reason==='string'&&/^SURVEY_[A-Z_]+$/.test(r.survey.reason)&&r.handoff===true);
  }
 }
 check(data.state==='RUNNING'?r===null:r!==null);
 const d=data.delivery;check(d===null||object(d));
 if(d)check(id(d.attemptId)&&Object.hasOwn(deliveryLabels,d.state)&&typeof d.acknowledged==='boolean'&&typeof d.echoObserved==='boolean'
  &&(d.startedAt===null||date(d.startedAt))&&(d.sendBefore===null||date(d.sendBefore))&&(d.reason===null||typeof d.reason==='string'));
 return data;
}
function key(actor,company){check(id(actor)&&id(company));return `vpt-care-runtime-close-v1:${actor}:${company}`;}
function pendingValid(p,actor,company){
 const b=p?.body;check(object(p)&&p.actorId===actor&&p.companyId===company&&id(p.threadId)&&object(b)&&b.companyId===company
  &&id(b.requestId)&&id(b.runtimeRequestId)&&b.requestId!==b.runtimeRequestId&&typeof b.reason==='string'&&b.reason.trim().length>=20&&b.reason.length<=2000
  &&Object.keys(b).sort().join(',')==='companyId,reason,requestId,runtimeRequestId');return p;
}
export function readRuntimePending(storage,actor,company){const s=storage.getItem(key(actor,company));return s===null?null:pendingValid(JSON.parse(s),actor,company);}
export function saveRuntimePending(storage,p){
 pendingValid(p,p.actorId,p.companyId);const k=key(p.actorId,p.companyId),raw=JSON.stringify(p),old=storage.getItem(k);
 check(old===null||old===raw);storage.setItem(k,raw);check(storage.getItem(k)===raw);return p;
}
export function clearRuntimePending(storage,p){const k=key(p.actorId,p.companyId);check(storage.getItem(k)===JSON.stringify(p));storage.removeItem(k);check(storage.getItem(k)===null);}
export function runtimeCloseAck(data,p){
 check(data?.companyId===p.companyId&&data.threadId===p.threadId&&data.requestId===p.body.requestId&&data.runtimeRequestId===p.body.runtimeRequestId
  &&['CLOSED','ALREADY_TERMINAL'].includes(data.outcome)&&typeof data.replayed==='boolean'&&data.send===false);return data;
}
