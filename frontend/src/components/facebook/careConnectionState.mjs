const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const modes=['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'];
const fail=()=>{throw Error('CARE_CONNECTION_UNAVAILABLE');};
function scope(x,actor,company,thread){
 if(!object(x)||![actor,company,thread].every(uuid)||x.actorId!==actor||x.companyId!==company||x.threadId!==thread
  ||x.sendAllowed!==false||x.automaticallyVerified!==false)fail();
}
export function connectionChoices(x,actor,company,thread,search){
 scope(x,actor,company,thread);
 if(x.policy!=='CARE_CONNECTION_CHOICES_V1'||x.search!==search||!time(x.observedAt)||!modes.includes(x.careMode)||typeof x.hasMore!=='boolean'
  ||!Array.isArray(x.items)||x.items.length>20||(x.hasMore&&x.items.length!==20)||new Set(x.items.map(i=>i?.id)).size!==x.items.length
  ||x.items.some(i=>!object(i)||!uuid(i.id)||typeof i.title!=='string'||typeof i.customerName!=='string'
   ||['code','phone','ownerName','regionName'].some(k=>i[k]!==null&&typeof i[k]!=='string')))fail();
 return x;
}
export function connectionView(x,actor,company,thread,lead){
 scope(x,actor,company,thread);
 if(x.policy!=='CARE_CONNECTION_V1'||x.leadId!==lead||!uuid(lead)||x.lead?.id!==lead||!/^[a-f0-9]{32}$/.test(x.version||'')
  ||!modes.includes(x.careMode)||typeof x.canLink!=='boolean'||typeof x.alreadyLinked!=='boolean'||typeof x.mappingComplete!=='boolean'
  ||(x.mappingComplete&&(!x.canLink||!x.alreadyLinked))||x.requiresIdentityEvidence!==true
  ||typeof x.lead.title!=='string'||typeof x.lead.customerName!=='string'||(x.lead.phone!==null&&typeof x.lead.phone!=='string')
  ||!Array.isArray(x.messages)||x.messages.length>20||new Set(x.messages.map(m=>m?.id)).size!==x.messages.length
  ||x.messages.some(m=>!object(m)||!uuid(m.id)||!time(m.sentAt)||typeof m.text!=='string'||m.text.length>20000))fail();
 return x;
}
const key=(actor,company,thread)=>`vpt:care-connection:v1:${actor}:${company}:${thread}`;
export function connectionPending(p,actor,company,thread){
 const c=p?.command;
 if(!object(p)||![actor,company,thread,p.requestId].every(uuid)||p.actorId!==actor||p.companyId!==company||p.threadId!==thread
  ||!['LINK','CLOSE'].includes(p.intent)||Object.keys(p).some(k=>!['actorId','companyId','threadId','requestId','command','intent'].includes(k))
  ||!object(c)||c.threadId!==thread||!uuid(c.leadId)||!uuid(c.evidenceMessageId)||c.identityConfirmed!==true
  ||typeof c.expectedVersion!=='string'||!/^[a-f0-9]{32}$/.test(c.expectedVersion)||typeof c.reason!=='string'||c.reason.trim().length<20||c.reason.length>2000
  ||Object.keys(c).some(k=>!['threadId','leadId','evidenceMessageId','identityConfirmed','expectedVersion','reason'].includes(k)))fail();
 return p;
}
export function readConnectionPending(storage,actor,company,thread){const s=storage.getItem(key(actor,company,thread));return s===null?null:connectionPending(JSON.parse(s),actor,company,thread);}
export function saveConnectionPending(storage,p){connectionPending(p,p.actorId,p.companyId,p.threadId);const encoded=JSON.stringify(p);storage.setItem(key(p.actorId,p.companyId,p.threadId),encoded);return JSON.parse(encoded);}
export function closeConnectionPending(storage,p){return saveConnectionPending(storage,{...p,intent:'CLOSE'});}
export function clearConnectionPending(storage,p){storage.removeItem(key(p.actorId,p.companyId,p.threadId));}
export function connectionReceipt(x,p){
 scope(x,p.actorId,p.companyId,p.threadId);
 if(x.policy!=='CARE_CONNECTION_V1'||x.requestId!==p.requestId||x.leadId!==p.command.leadId||!uuid(x.contactId)
  ||typeof x.currentLink!=='boolean'||typeof x.replayed!=='boolean'||!modes.includes(x.careMode))fail();
 return x;
}
export function connectionClosure(x,p){
 scope(x,p.actorId,p.companyId,p.threadId);
 if(x.policy!=='CARE_CONNECTION_CLOSURE_V1'||x.requestId!==p.requestId||!['CANCELLED','ALREADY_RECORDED'].includes(x.status))fail();
 return x;
}
