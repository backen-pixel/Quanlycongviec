'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const only=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const modes=['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'];
const fail=code=>Object.assign(Error('CARE_CONNECTION_UNAVAILABLE'),{code});
function command(c){return only(c,['threadId','leadId','expectedVersion','evidenceMessageId','identityConfirmed','reason'])&&uuid(c.threadId)&&uuid(c.leadId)&&uuid(c.evidenceMessageId)
 &&typeof c.expectedVersion==='string'&&/^[a-f0-9]{32}$/.test(c.expectedVersion)&&c.identityConfirmed===true&&typeof c.reason==='string'&&c.reason.trim().length>=20&&c.reason.length<=2000;}
function projection(x,actor,company,thread,lead,request){
 if(!object(x)||x.policy!=='CARE_CONNECTION_V1'||x.actorId!==actor||x.companyId!==company||x.threadId!==thread||x.leadId!==lead
  ||x.sendAllowed!==false||x.automaticallyVerified!==false||!modes.includes(x.careMode))throw fail('INVALID_RESPONSE');
 const base={policy:x.policy,actorId:actor,companyId:company,threadId:thread,leadId:lead,careMode:x.careMode,sendAllowed:false,automaticallyVerified:false};
 if(request){
  if(x.requestId!==request||!uuid(x.contactId)||typeof x.replayed!=='boolean'||typeof x.currentLink!=='boolean')throw fail('INVALID_RESPONSE');
  return{...base,requestId:request,contactId:x.contactId,replayed:x.replayed,currentLink:x.currentLink};
 }
 if(!/^[a-f0-9]{32}$/.test(x.version||'')||typeof x.canLink!=='boolean'||typeof x.alreadyLinked!=='boolean'||x.requiresIdentityEvidence!==true
  ||x.lead?.id!==lead||typeof x.lead.title!=='string'||typeof x.lead.customerName!=='string'||(x.lead.phone!==null&&typeof x.lead.phone!=='string')||(x.lead.code!==null&&typeof x.lead.code!=='string')
  ||!Array.isArray(x.messages)||x.messages.length>20||new Set(x.messages.map(m=>m?.id)).size!==x.messages.length
  ||x.messages.some(m=>!object(m)||!uuid(m.id)||typeof m.text!=='string'||m.text.length>20000||typeof m.sentAt!=='string'||!Number.isFinite(Date.parse(m.sentAt))))throw fail('INVALID_RESPONSE');
 return{...base,version:x.version,canLink:x.canLink,alreadyLinked:x.alreadyLinked,requiresIdentityEvidence:true,
  lead:{id:lead,code:x.lead.code,title:x.lead.title,customerName:x.lead.customerName,phone:x.lead.phone},
  messages:x.messages.map(m=>({id:m.id,sentAt:m.sentAt,text:m.text}))};
}
function createCareConnections({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_CARE_CONNECTIONS==='1'&&isPrimary()===true;
 async function handle(req,res,operation){
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Liên kết hội thoại với CRM chưa được mở.'});
  const actor=req.user?.userId||req.user?.id,b=operation==='link'?req.body:req.query,company=b?.companyId;
  if(!uuid(actor)||!uuid(company)||(req.user?.id&&req.user?.userId&&req.user.id!==req.user.userId))return res.status(403).json({error:'Không xác định được người và công ty thực hiện.'});
  if((operation==='read'&&(!only(b,['companyId','threadId','leadId'])||!uuid(b.threadId)||!uuid(b.leadId)))
   ||(operation==='link'&&(!only(b,['companyId','requestId','command'])||!uuid(b.requestId)||!command(b.command)))
   ||!['read','link'].includes(operation))return res.status(400).json({reason:'INVALID_INPUT',error:'Cần hồ sơ và bằng chứng đối chiếu hợp lệ.'});
  const thread=operation==='link'?b.command.threadId:b.threadId,lead=operation==='link'?b.command.leadId:b.leadId;
  try{
   if(!enabled())throw fail('UNAVAILABLE');
   const args={p_actor:actor,p_company:company,...(operation==='link'?{p_request:b.requestId,p_command:b.command}:{p_thread:thread,p_lead:lead})};
   const r=await db.rpc(operation==='link'?'crm_care_connection_link':'crm_care_connection_read',args);if(r?.error)throw fail(r.error.code);
   if(!enabled())throw fail('UNAVAILABLE');return res.json(projection(r?.data,actor,company,thread,lead,operation==='link'?b.requestId:null));
  }catch(e){
   const status=e.code==='42501'?403:['40001','23505','40P01'].includes(e.code)?409:['22023','22P02'].includes(e.code)?400:503;
   return res.status(status).json({...(e.code==='40001'?{reason:'CONTEXT_CHANGED'}:['22023','22P02'].includes(e.code)?{reason:'INVALID_INPUT'}:{}),
    error:status===409?'Hồ sơ đã đổi hoặc có liên kết cần rà lại. Tải lại trước khi xác nhận.':'Chưa xác nhận được liên kết trong phạm vi hiện tại.'});
  }
 }
 return{handle};
}
module.exports={createCareConnections,command,projection};
