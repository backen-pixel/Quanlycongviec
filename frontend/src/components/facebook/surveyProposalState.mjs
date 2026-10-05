const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const fail=()=>{throw Error('SURVEY_PROPOSAL_UNAVAILABLE');};
export function vietnamInstant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail();
 const d=new Date(value+':00+07:00');if(!Number.isFinite(d.getTime())||new Date(d.getTime()+7*3600000).toISOString().slice(0,16)!==value)fail();return d.toISOString();
}
export function proposalList(x,company,actor,thread){
 if(x?.policy!=='SURVEY_PROPOSAL_CONSOLE_V1'||x.companyId!==company||x.actorId!==actor||x.threadId!==thread||![company,actor,thread].every(id)||!date(x.asOf)
  ||!['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'].includes(x.careMode)||typeof x.deliveryBusy!=='boolean'||x.canConfirmCustomer!==false||x.canResend!==false||x.aiMaySend!==false
  ||!Number.isSafeInteger(x.total)||x.total<0||!Array.isArray(x.items)||x.items.length!==Math.min(50,x.total)||new Set(x.items.map(i=>i.proposalId)).size!==x.items.length)fail();
 for(const p of x.items){if(!id(p.proposalId)||!date(p.createdAt)||typeof p.scopeReady!=='boolean')fail();
  if(!p.scopeReady){if(['state','expiresAt','appointment','delivery','booking','outcomes'].some(k=>p[k]!==null))fail();continue;}
  if(!['OPEN','SUPERSEDED','BOOKED','REJECTED'].includes(p.state)||!date(p.expiresAt)||!date(p.appointment?.startsAt)||!date(p.appointment?.endsAt)||p.appointment.timeZone!=='Asia/Ho_Chi_Minh'
   ||typeof p.appointment.location!=='string'||!['QUEUED','SENDING','SENT','UNCERTAIN'].includes(p.delivery?.state)||typeof p.delivery.conflict!=='boolean'
   ||(p.state==='BOOKED')!==(p.booking!==null)||!Array.isArray(p.outcomes)||p.outcomes.some(o=>!['BOOKED','NOT_BOOKED'].includes(o.kind)||!['QUEUED','SENDING','SENT','UNCERTAIN','HELD'].includes(o.state)))fail();
 }
 return x;
}
export function availableOptions(x,company,thread,now=Date.now()){
 if(x?.companyId!==company||x.threadId!==thread||x.reservationMade!==false||x.customerConfirmationRequired!==true||!Array.isArray(x.items)||x.items.length>200
  ||!['AVAILABLE_SNAPSHOT','NO_CONFIRMED_OPTION','CARE_OR_ROUTING_UNAVAILABLE','NARROW_RANGE_REQUIRED'].includes(x.status)
  ||(x.status==='AVAILABLE_SNAPSHOT')!==(x.items.length>0))fail();
 if(x.items.some(o=>!id(o.staffId)||!id(o.regionId)||!/^[a-f0-9]{32}$/.test(o.optionId||'')||!date(o.startsAt)||Date.parse(o.startsAt)<=now||!date(o.endsAt)||Date.parse(o.endsAt)<=Date.parse(o.startsAt)
  ||!date(o.snapshotExpiresAt)||Date.parse(o.snapshotExpiresAt)<=now||!date(o.sourceValidUntil)||Date.parse(o.sourceValidUntil)<Date.parse(o.snapshotExpiresAt)))fail();return x;
}
const key=(actor,company,thread)=>`vpt:survey-proposal:v1:${actor}:${company}:${thread}`;
export function pendingValid(p,actor,company,thread){
 const c=p?.command;if(p?.actorId!==actor||p?.companyId!==company||p?.threadId!==thread||![actor,company,thread,p?.requestId].every(id)||!c||c.threadId!==thread
  ||Object.keys(p).some(k=>!['actorId','companyId','threadId','requestId','command'].includes(k))||Object.keys(c).some(k=>!['threadId','optionId','startsAt','endsAt','location'].includes(k))
  ||!/^[a-f0-9]{32}$/.test(c.optionId||'')||!date(c.startsAt)||!date(c.endsAt)||Date.parse(c.endsAt)<=Date.parse(c.startsAt)||typeof c.location!=='string'||c.location.trim().length<10||c.location.length>1000)fail();return p;
}
export function readPendingProposal(storage,actor,company,thread){const s=storage.getItem(key(actor,company,thread));return s===null?null:pendingValid(JSON.parse(s),actor,company,thread);}
export function savePendingProposal(storage,p){pendingValid(p,p.actorId,p.companyId,p.threadId);storage.setItem(key(p.actorId,p.companyId,p.threadId),JSON.stringify(p));return JSON.parse(JSON.stringify(p));}
export function clearPendingProposal(storage,p){storage.removeItem(key(p.actorId,p.companyId,p.threadId));}
export function proposalReceipt(x,p){
 if(x?.companyId!==p.companyId||x.threadId!==p.threadId||x.requestId!==p.requestId||!id(x.proposalId)||typeof x.replayed!=='boolean'
  ||!['OPEN','SUPERSEDED','BOOKED','REJECTED'].includes(x.state)||x.reservationMade!==(x.state==='BOOKED')||x.customerConfirmationRequired!==(x.state!=='BOOKED')
  ||x.business?.companyId!==p.companyId||x.business.location!==p.command.location.trim()||Date.parse(x.business.startsAt)!==Date.parse(p.command.startsAt)||Date.parse(x.business.endsAt)!==Date.parse(p.command.endsAt))fail();return x;
}
