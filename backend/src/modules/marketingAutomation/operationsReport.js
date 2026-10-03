'use strict';
const {projectReview}=require('../crmLeadIdentity/review');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const fail=()=>{throw Object.assign(new Error('OPERATIONS_UNAVAILABLE'),{status:503});};
const nullableId=x=>x===null||uuid(x),nullableDate=x=>x===null||date(x);
const MODES=['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'];
function reportOperations(raw){
 if(!raw||raw.policy!=='MARKETING_OPERATIONS_V1'||!uuid(raw.companyId)||!uuid(raw.actorId)||!date(raw.asOf)||raw.complete!==true||raw.aiMaySend!==false||raw.allowBudgetExecution!==false)fail();
 for(const k of ['threads','bookings'])if(!Array.isArray(raw[k])||raw[k].length>5000||new Set(raw[k].map(x=>x?.id)).size!==raw[k].length)fail();
 const identity=projectReview(raw.identity);if(identity.companyId!==raw.companyId)fail();
 const now=Date.parse(raw.asOf),members=new Map(),seenThreads=new Set(),waiting=new Set(),booked=new Set(),unresolved=new Set(),attention=[];
 for(const g of identity.groups)for(const m of g.members)members.set(m.leadId,{group:g,member:m});
 const counts={threads:raw.threads.length,awaitingReply:0,humanRequested:0,humanActive:0,optedOut:0,overdueHumanRequests:0,
  unavailableThreads:0,unavailableOwners:0,unavailableHandlers:0,ambiguousMessageOrder:0,
  bookedAppointments:raw.bookings.length,upcoming:0,inProgress:0,pastDue:0,pendingHandoffs:0,acknowledgedHandoffs:0,changedAppointments:0,unavailableBookings:0,deliveryConflicts:0};
 function groupFor(leadId){const x=members.get(leadId);if(!x||!x.member.available||!x.group.deduplicationComplete){unresolved.add(x?.group.groupId||leadId);return null;}return x.group.groupId;}
 const title=leadId=>members.get(leadId)?.member.available?members.get(leadId).member.title:null;
 function item(kind,id,leadId,reason,dueAt=null){attention.push({kind,id,leadId,title:leadId?title(leadId):null,reason,dueAt});}
 for(const t of raw.threads){
  if(!uuid(t.id)||typeof t.scopeReady!=='boolean'||![t.ownerReady,t.handlerReady].every(x=>typeof x==='boolean'))fail();seenThreads.add(t.id);
  if(!t.scopeReady){if([t.leadId,t.mode,t.ownerId,t.claimedBy,t.regionId,t.humanDeadline,t.lastInboundAt,t.lastOutboundAt].some(x=>x!==null)||t.ownerReady||t.handlerReady)fail();counts.unavailableThreads++;item('CARE',t.id,null,'MAPPING_UNAVAILABLE');continue;}
  if(!uuid(t.leadId)||!MODES.includes(t.mode)||![t.ownerId,t.claimedBy,t.regionId].every(nullableId)||![t.humanDeadline,t.lastInboundAt,t.lastOutboundAt].every(nullableDate)||t.ownerReady!==!!t.ownerId||(t.ownerReady&&!t.regionId)||(t.handlerReady&&!t.claimedBy))fail();
  const group=groupFor(t.leadId),inbound=t.lastInboundAt?Date.parse(t.lastInboundAt):null,outbound=t.lastOutboundAt?Date.parse(t.lastOutboundAt):null;
  const ambiguous=(inbound!==null&&inbound>now)||(outbound!==null&&outbound>now)||(inbound!==null&&inbound===outbound);
  if(ambiguous)counts.ambiguousMessageOrder++;
  if(t.mode==='OPTED_OUT'){counts.optedOut++;continue;}
  const noReply=inbound!==null&&(outbound===null||outbound<inbound);
  if(noReply&&!ambiguous)counts.awaitingReply++;
  if(t.mode==='HUMAN_ACTIVE')counts.humanActive++;
  if(t.mode==='HUMAN_REQUESTED'){counts.humanRequested++;if(t.humanDeadline&&Date.parse(t.humanDeadline)<now)counts.overdueHumanRequests++;}
  if(!t.ownerReady)counts.unavailableOwners++;
  if(t.mode==='HUMAN_ACTIVE'&&!t.handlerReady)counts.unavailableHandlers++;
  const reason=!t.ownerReady?'OWNER_UNAVAILABLE':t.mode==='HUMAN_ACTIVE'&&!t.handlerReady?'HANDLER_UNAVAILABLE':t.mode==='HUMAN_REQUESTED'?'HUMAN_REQUESTED':ambiguous?'MESSAGE_ORDER_UNCERTAIN':noReply?'AWAITING_REPLY':null;
  if(reason){if(group)waiting.add(group);item('CARE',t.id,t.leadId,reason,t.mode==='HUMAN_REQUESTED'?t.humanDeadline:null);}
 }
 for(const b of raw.bookings){
  if(!uuid(b.id)||typeof b.scopeReady!=='boolean'||![b.assigned,b.unchanged].every(x=>typeof x==='boolean'))fail();
  if(!b.scopeReady){if([b.leadId,b.threadId,b.state,b.recipientId,b.appointment,b.receipt,b.deliveryConflict].some(x=>x!==null)||b.assigned||b.unchanged)fail();counts.unavailableBookings++;item('SURVEY',b.id,null,'BOOKING_SCOPE_UNAVAILABLE');continue;}
  const a=b.appointment,r=b.receipt;
  if(!uuid(b.leadId)||!uuid(b.threadId)||!seenThreads.has(b.threadId)||!['PENDING','ACKNOWLEDGED'].includes(b.state)||!nullableId(b.recipientId)||(b.assigned&&!b.recipientId)||typeof b.deliveryConflict!=='boolean'||!a||!date(a.startsAt)||!date(a.endsAt)||Date.parse(a.endsAt)<=Date.parse(a.startsAt)||a.timeZone!=='Asia/Ho_Chi_Minh'||!(a.status===null||typeof a.status==='string'))fail();
  if((b.state==='ACKNOWLEDGED')!==(r!==null)||(r!==null&&(!uuid(r.actorId)||r.companyId!==raw.companyId||r.proposalId!==b.id||r.state!=='ACKNOWLEDGED'||!date(r.receivedAt)||Date.parse(r.receivedAt)>now||(b.assigned&&r.actorId!==b.recipientId))))fail();
  const group=groupFor(b.leadId);if(group)booked.add(group);
  if(b.deliveryConflict)counts.deliveryConflicts++;
  if(!b.assigned||!b.unchanged||a.status!=='planned'){counts.changedAppointments++;item('SURVEY',b.id,b.leadId,'APPOINTMENT_CHANGED');continue;}
  if(b.state==='PENDING'){counts.pendingHandoffs++;item('SURVEY',b.id,b.leadId,'HANDOFF_PENDING',a.startsAt);}else counts.acknowledgedHandoffs++;
  if(Date.parse(a.endsAt)<=now){counts.pastDue++;item('SURVEY',b.id,b.leadId,'RESULT_NOT_RECORDED',a.endsAt);}
  else if(Date.parse(a.startsAt)<=now)counts.inProgress++;else counts.upcoming++;
  if(b.deliveryConflict)item('SURVEY',b.id,b.leadId,'DELIVERY_CONFLICT');
 }
 // Missing/ambiguous identity prevents a total unique-customer claim. Thread
 // and appointment facts remain available, with their own units and exceptions.
 const uniqueAvailable=unresolved.size===0&&counts.unavailableThreads===0&&counts.unavailableBookings===0;
 attention.sort((a,b)=>(a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity)||a.id.localeCompare(b.id)||a.reason.localeCompare(b.reason));
 return{policy:raw.policy,companyId:raw.companyId,actorId:raw.actorId,asOf:raw.asOf,scope:'COMPANY_MESSENGER_AND_CONFIRMED_SURVEYS',
  counts,customers:{status:uniqueAvailable?'AVAILABLE':'UNRESOLVED',waiting:uniqueAvailable?waiting.size:null,booked:uniqueAvailable?booked.size:null,unresolvedGroups:unresolved.size},
  attention:attention.slice(0,50),attentionTotal:attention.length,aiMaySend:false,allowBudgetExecution:false,adCohortAttribution:false};
}
function createOperationsReport({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_MARKETING_OPERATIONS_REPORT==='1'&&isPrimary()===true;
 return async(req,res)=>{
  res.set('Cache-Control','no-store');if(!enabled())return res.status(503).json({error:'Bảng theo dõi tư vấn và khảo sát chưa được mở.'});
  const actor=req.user?.userId,company=req.query?.company_id;
  if(!uuid(actor)||!uuid(company)||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  if(Object.keys(req.query).some(k=>k!=='company_id'))return res.status(400).json({error:'Bảng vận hành dùng phạm vi công ty, không dùng khoảng ngày quảng cáo.'});
  try{const r=await db.rpc('marketing_operations_snapshot',{p_actor:actor,p_company:company});if(r.error)throw Object.assign(Error('read failed'),{code:r.error.code});
   if(!enabled()||r.data?.companyId!==company||r.data?.actorId!==actor)fail();return res.json(reportOperations(r.data));
  }catch(e){return res.status(e.code==='42501'?403:503).json({error:'Chưa đọc được dữ liệu vận hành trong phạm vi hiện tại. Số liệu cũ đã được ẩn.'});}
 };
}
module.exports={reportOperations,createOperationsReport};
