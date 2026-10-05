const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const requireValue=ok=>{if(!ok)throw Error('ADVISOR_RESPONSE_INVALID');};
const states=['RUNNING','DRAFT','REVIEW','FAILED'];
const modes=['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'];
const failures=['MODEL_UNAVAILABLE','INVALID_MODEL_OUTPUT','DISABLED'];
const fields=['product','location','budget','timing','request'];
export const labels={RUNNING:'Đang xử lý hoặc chờ đối soát',DRAFT:'Có bản đề xuất',REVIEW:'Cần kiểm tra',FAILED:'Chưa tạo được đề xuất'};
export const fieldLabels={product:'Sản phẩm',location:'Địa bàn',budget:'Ngân sách',timing:'Thời gian',request:'Nhu cầu'};
export function advisorList(data,companyId,threadId){
 requireValue(data?.companyId===companyId&&data.threadId===threadId&&hash(data.version)&&modes.includes(data.careMode)
  &&['routingReady','historyTruncated','threadBusy','generationAvailable'].every(k=>typeof data[k]==='boolean')
  &&data.send===false&&data.aiMaySend===false&&Array.isArray(data.items)&&data.items.length<=20);
 requireValue(data.items.every(x=>uuid(x?.requestId)&&states.includes(x.state)&&Number.isInteger(x.attempt)&&x.attempt>=1&&x.attempt<=3
  &&(x.retryOf===null||uuid(x.retryOf))&&date(x.createdAt)&&typeof x.needsReconciliation==='boolean'));
 requireValue(new Set(data.items.map(x=>x.requestId)).size===data.items.length);
 requireValue(data.nextAfter===null||(uuid(data.nextAfter)&&data.items.at(-1)?.requestId===data.nextAfter));
 return data;
}
export function advisorDraft(data,companyId,threadId,requestId){
 requireValue(data?.companyId===companyId&&data.threadId===threadId&&data.requestId===requestId
  &&states.includes(data.state)&&['stale','expired','needsReconciliation'].every(k=>typeof data[k]==='boolean')
  &&Number.isInteger(data.attempt)&&data.attempt>=1&&data.attempt<=3&&(data.retryOf===null||uuid(data.retryOf))
  &&data.send===false&&data.aiMaySend===false&&(data.createdAt==null||date(data.createdAt))&&(data.completedAt==null||date(data.completedAt)));
 requireValue(data.needsReconciliation===(data.state==='RUNNING'&&data.expired));
 const r=data.result;
 if(data.stale||data.state==='RUNNING')requireValue(r===null);
 else{
  requireValue(object(r)&&r.send===false);
  if(data.state==='DRAFT'||r.action==='HANDOFF'){
   requireValue(r.action===(data.state==='DRAFT'?'ANSWER':'HANDOFF')&&r.needsVerified===false&&r.requiresReview===true);
   requireValue(data.state==='DRAFT'?(uuid(r.entryId)&&hash(r.entryVersion)&&['ADVICE','QUALIFY','HANDOFF'].includes(r.purpose)
    &&typeof r.text==='string'&&r.text.length<=4000&&typeof r.sourceReference==='string'):
    (r.text===null&&r.entryId===null&&data.state==='REVIEW'));
   requireValue(Array.isArray(r.needs)&&r.needs.length<=5&&new Set(r.needs.map(n=>n.field)).size===r.needs.length
    &&r.needs.every(n=>fields.includes(n.field)&&uuid(n.messageId)&&typeof n.quote==='string'&&n.quote.trim().length>0&&n.quote.length<=1000));
  }else requireValue(r.text===null&&(data.state==='FAILED'?failures.includes(r.reason):['EXPIRED','OPERATOR_CLOSED','CONTEXT_CHANGED'].includes(r.reason)));
 }
 return data;
}
export function canGenerate(view){return !!view&&view.generationAvailable&&view.careMode==='WAITING'&&view.routingReady&&!view.historyTruncated&&!view.threadBusy;}
export function canRetry(draft){return !!draft&&!draft.stale&&draft.attempt<3
 &&(draft.state==='FAILED'||(draft.state==='REVIEW'&&draft.result?.reason==='OPERATOR_CLOSED'));}
function key(actorId,companyId,threadId){requireValue([actorId,companyId,threadId].every(uuid));return `vpt-care-advisor-v1:${actorId}:${companyId}:${threadId}`;}
function validPending(p,actorId,companyId,threadId){
 const b=p?.body;
 return object(p)&&p.actorId===actorId&&p.companyId===companyId&&p.threadId===threadId
  &&['generate','retry','cancel'].includes(p.operation)&&object(b)&&b.companyId===companyId&&uuid(b.requestId)
  &&(p.operation==='retry'?uuid(b.previousRequestId)&&b.previousRequestId!==b.requestId:b.threadId===threadId)
  &&(p.operation==='cancel'||hash(b.version))
  &&(p.operation==='generate'||(typeof b.reason==='string'&&b.reason.trim().length>=20&&b.reason.length<=2000))
  &&Object.keys(b).sort().join(',')===({
   generate:['companyId','requestId','threadId','version'],retry:['companyId','requestId','previousRequestId','version','reason'],
   cancel:['companyId','requestId','threadId','reason']
  }[p.operation].sort().join(','));
}
export function readAdvisorPending(storage,actorId,companyId,threadId){
 const raw=storage.getItem(key(actorId,companyId,threadId));if(raw===null)return null;
 const p=JSON.parse(raw);requireValue(validPending(p,actorId,companyId,threadId));return p;
}
export function saveAdvisorPending(storage,p,previous=null){
 requireValue(validPending(p,p.actorId,p.companyId,p.threadId));
 const k=key(p.actorId,p.companyId,p.threadId),old=storage.getItem(k),raw=JSON.stringify(p);
 if(previous){
  requireValue(old===JSON.stringify(previous)&&validPending(previous,p.actorId,p.companyId,p.threadId)
   &&p.operation==='cancel'&&p.body.requestId===previous.body.requestId);
 }else requireValue(old===null||old===raw);
 storage.setItem(k,raw);requireValue(storage.getItem(k)===raw);return p;
}
export function clearAdvisorPending(storage,p){
 const k=key(p.actorId,p.companyId,p.threadId);requireValue(storage.getItem(k)===JSON.stringify(p));
 storage.removeItem(k);requireValue(storage.getItem(k)===null);
}
export function cancellationAck(data,p){
 requireValue(data?.companyId===p.companyId&&data.threadId===p.threadId&&data.requestId===p.body.requestId
  &&['ABSENT_CANCELLED','CLOSED','ALREADY_TERMINAL'].includes(data.outcome)&&typeof data.replayed==='boolean'&&data.send===false);
 return data;
}
