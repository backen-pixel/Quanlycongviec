'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const fail=()=>{throw Error('PROPOSAL_CONSOLE_UNAVAILABLE');};
const reasons=new Set(['CONTEXT_CHANGED','SLOT_UNAVAILABLE','RESPONSE_WINDOW_CLOSED','PROPOSAL_EXPIRED','CURRENT_AUTHORITY_UNAVAILABLE']);
function proposalConsoleView(raw){
 if(raw?.policy!=='SURVEY_PROPOSAL_CONSOLE_V1'||![raw.companyId,raw.actorId,raw.threadId].every(uuid)||!date(raw.asOf)
  ||!['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'].includes(raw.careMode)||typeof raw.deliveryBusy!=='boolean'
  ||!Number.isSafeInteger(raw.total)||raw.total<0||!Array.isArray(raw.items)||raw.items.length!==Math.min(50,raw.total)
  ||raw.canConfirmCustomer!==false||raw.canResend!==false||raw.aiMaySend!==false||new Set(raw.items.map(x=>x?.proposalId)).size!==raw.items.length)fail();
 const items=raw.items.map(x=>{
  if(!uuid(x.proposalId)||!date(x.createdAt)||typeof x.scopeReady!=='boolean')fail();
  if(!x.scopeReady){if(['state','expiresAt','appointment','delivery','booking','outcomes'].some(k=>x[k]!==null))fail();return{proposalId:x.proposalId,createdAt:x.createdAt,scopeReady:false,state:null,expiresAt:null,appointment:null,delivery:null,booking:null,outcomes:null};}
  const a=x.appointment,d=x.delivery,b=x.booking;
  if(!['OPEN','SUPERSEDED','BOOKED','REJECTED'].includes(x.state)||!date(x.expiresAt)||!a||!date(a.startsAt)||!date(a.endsAt)||Date.parse(a.endsAt)<=Date.parse(a.startsAt)
   ||a.timeZone!=='Asia/Ho_Chi_Minh'||!(a.staffName===null||typeof a.staffName==='string')||typeof a.location!=='string'||a.location.length>1000
   ||!d||!['QUEUED','SENDING','SENT','UNCERTAIN'].includes(d.state)||typeof d.conflict!=='boolean'||typeof d.hasProblem!=='boolean'||!(d.blockedReason===null||typeof d.blockedReason==='string')
   ||(b!==null&&(!uuid(b.eventId)||b.status!=='BOOKED_HANDOFF_PENDING'))||(x.state==='BOOKED')!==(b!==null)
   ||!Array.isArray(x.outcomes)||x.outcomes.length>2||new Set(x.outcomes.map(o=>o.kind)).size!==x.outcomes.length
   ||x.outcomes.some(o=>!['BOOKED','NOT_BOOKED'].includes(o.kind)||!['QUEUED','SENDING','SENT','UNCERTAIN','HELD'].includes(o.state)||typeof o.conflict!=='boolean'))fail();
  return{proposalId:x.proposalId,createdAt:x.createdAt,scopeReady:true,state:x.state,expiresAt:x.expiresAt,
   appointment:{startsAt:a.startsAt,endsAt:a.endsAt,staffName:a.staffName,location:a.location,timeZone:a.timeZone},
   delivery:{state:d.state,conflict:d.conflict,hasProblem:d.hasProblem,blockedReason:d.blockedReason===null?null:reasons.has(d.blockedReason)?d.blockedReason:'OTHER'},
   booking:b===null?null:{eventId:b.eventId,status:b.status},outcomes:x.outcomes.map(o=>({kind:o.kind,state:o.state,conflict:o.conflict}))};
 });
 return{policy:raw.policy,companyId:raw.companyId,actorId:raw.actorId,threadId:raw.threadId,asOf:raw.asOf,careMode:raw.careMode,deliveryBusy:raw.deliveryBusy,total:raw.total,items,canConfirmCustomer:false,canResend:false,aiMaySend:false};
}
function createProposalConsole({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_SURVEY_PROPOSAL_CONSOLE==='1'&&isPrimary()===true;
 return async(req,res)=>{
  res.set('Cache-Control','no-store');if(!enabled())return res.status(503).json({error:'Theo dõi đề xuất khảo sát chưa được mở.'});
  const actor=req.user?.userId||req.user?.id,company=req.query?.companyId,thread=req.query?.threadId;
  if(!uuid(actor)||!uuid(company)||(req.user?.id&&req.user?.userId&&req.user.id!==req.user.userId))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  if(!uuid(thread)||Object.keys(req.query).some(k=>!['companyId','threadId'].includes(k)))return res.status(400).json({error:'Cần chọn một hội thoại để xem lịch đề xuất.'});
  try{const r=await db.rpc('crm_survey_proposal_console',{p_actor:actor,p_company:company,p_thread:thread});if(r.error)throw Object.assign(Error('read failed'),{code:r.error.code});
   if(!enabled()||r.data?.companyId!==company||r.data?.actorId!==actor||r.data?.threadId!==thread)fail();
   return res.json(proposalConsoleView(r.data));
  }catch(e){return res.status(e.code==='42501'?403:503).json({error:'Chưa đọc được lịch đề xuất trong phạm vi hiện tại. Dữ liệu cũ đã được ẩn.'});}
 };
}
module.exports={proposalConsoleView,createProposalConsole};
