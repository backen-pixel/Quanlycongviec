export const modes=['HUMAN_REQUESTED','WAITING','HUMAN_ACTIVE','OPTED_OUT'];
export const labels={HUMAN_REQUESTED:'Cần người phản hồi',WAITING:'Chờ xem nhu cầu',HUMAN_ACTIVE:'Nhân viên đang xử lý',OPTED_OUT:'Ngừng liên hệ'};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const count=x=>Number.isSafeInteger(x)&&x>=0;
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const requireValue=(ok)=>{if(!ok)throw Error('CARE_RESPONSE_INVALID');};
export function messagesValid(rows){return Array.isArray(rows)&&rows.length<=50&&new Set(rows.map(x=>x?.id)).size===rows.length&&rows.every(m=>uuid(m?.id)&&['inbound','outbound'].includes(m.direction)&&typeof m.content==='string'&&date(m.sent_at)&&Array.isArray(m.attachments));}
export function queueView(data,companyId,mode){
 requireValue(data?.companyId===companyId&&data.mode===mode&&modes.includes(mode)&&data.aiMaySend===false&&date(data.observedAt)&&count(data.unavailableCount)&&object(data.counts));
 requireValue(Object.entries(data.counts).every(([k,v])=>modes.includes(k)&&count(v))&&Array.isArray(data.items)&&data.items.length<=50);
 requireValue(data.items.every(x=>uuid(x?.id)&&x.mode===mode&&hash(x.version)&&typeof x.scope_available==='boolean'&&date(x.created_at)&&(x.human_deadline===null||date(x.human_deadline))));
 requireValue(new Set(data.items.map(x=>x.id)).size===data.items.length);
 requireValue(data.nextCursor===null||(uuid(data.nextCursor?.id)&&hash(data.nextCursor.version)&&hash(data.nextCursor.queueVersion)&&data.items.at(-1)?.id===data.nextCursor.id&&data.items.at(-1)?.version===data.nextCursor.version));
 return {...data,counts:Object.fromEntries(modes.map(m=>[m,data.counts[m]??0]))};
}
export function threadView(data,companyId,threadId){
 requireValue(data?.companyId===companyId&&data.threadId===threadId&&modes.includes(data.mode)&&hash(data.version)&&data.aiMaySend===false&&messagesValid(data.messages));
 requireValue(count(data.messageCount)&&data.messageCount>=data.messages.length&&typeof data.historyTruncated==='boolean'&&data.historyTruncated===(data.messageCount>data.messages.length));
 requireValue(object(data.target)&&typeof data.target.routingReady==='boolean'&&(data.humanDeadline===null||date(data.humanDeadline)));
 return data;
}
export function historyView(data,companyId,threadId,version,knownIds){
 requireValue(data?.companyId===companyId&&data.threadId===threadId&&data.version===version&&data.aiMaySend===false&&messagesValid(data.messages)&&count(data.messageCount));
 requireValue(data.messages.every(x=>!knownIds.has(x.id)));
 requireValue(data.nextBefore===null||(uuid(data.nextBefore)&&data.messages[0]?.id===data.nextBefore));
 return data;
}
export function pendingKey(actorId,companyId){requireValue(uuid(actorId)&&uuid(companyId));return `vpt-care-pending-v1:${actorId}:${companyId}`;}
function validPending(x,actorId,companyId){return object(x)&&x.actorId===actorId&&x.companyId===companyId&&uuid(x.requestId)&&uuid(x.command?.threadId)&&hash(x.command?.expectedVersion)&&['TAKEOVER','OPT_OUT'].includes(x.command?.action)&&typeof x.command?.reason==='string'&&x.command.reason.trim().length>=20&&x.command.reason.length<=2000;}
export function readPending(storage,actorId,companyId){const raw=storage.getItem(pendingKey(actorId,companyId));if(raw===null)return null;const saved=JSON.parse(raw);requireValue(validPending(saved,actorId,companyId));return saved;}
export function savePending(storage,saved){requireValue(validPending(saved,saved.actorId,saved.companyId));const key=pendingKey(saved.actorId,saved.companyId),raw=JSON.stringify(saved),old=storage.getItem(key);if(old!==null&&old!==raw)throw Error('CARE_PENDING_EXISTS');storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('CARE_PENDING_UNSAVED');return saved;}
export function clearPending(storage,actorId,companyId){const key=pendingKey(actorId,companyId);storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('CARE_PENDING_UNCLEARED');}
export function controlAck(data,pending){requireValue(data?.accepted===true&&data.companyId===pending.companyId&&data.threadId===pending.command.threadId&&data.mode===(pending.command.action==='TAKEOVER'?'HUMAN_ACTIVE':'OPTED_OUT'));return data;}
export const controlPayload=({companyId,requestId,command})=>({companyId,requestId,command});
