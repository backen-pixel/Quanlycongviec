'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const token=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const instant=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const only=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const fail=code=>Object.assign(new Error(code),{code});
function validCommand(c){
 if(!only(c,['action','staffId','regionId','expectedRevision','reason','document'])||!['SAVE','DISABLE'].includes(c.action)||!uuid(c.staffId)||!uuid(c.regionId)
  ||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||typeof c.reason!=='string'||c.reason.trim().length<20||c.reason.trim().length>2000)return false;
 if(c.action==='DISABLE')return !Object.hasOwn(c,'document');
 const d=c.document;
 return only(d,['calendarSource','externalCalendarCoverage','sourceReference','validUntil','bufferMinutes','slots'])&&d.calendarSource==='CRM_COMPLETE'&&d.externalCalendarCoverage==='ALL_BUSY_IN_CRM'
  &&typeof d.sourceReference==='string'&&d.sourceReference.trim().length>=20&&d.sourceReference.trim().length<=2000&&instant(d.validUntil)
  &&Number.isInteger(d.bufferMinutes)&&d.bufferMinutes>=0&&d.bufferMinutes<=180&&Array.isArray(d.slots)&&d.slots.length>0&&d.slots.length<=64
  &&d.slots.every(s=>only(s,['startsAt','endsAt'])&&instant(s.startsAt)&&instant(s.endsAt))&&Buffer.byteLength(JSON.stringify(d),'utf8')<=30000;
}
function validAvailability(r,company,thread,now=Date.now()){
 return object(r)&&r.companyId===company&&r.threadId===thread&&r.reservationMade===false&&r.customerConfirmationRequired===true
  &&['AVAILABLE_SNAPSHOT','NO_CONFIRMED_OPTION','CARE_OR_ROUTING_UNAVAILABLE','NARROW_RANGE_REQUIRED'].includes(r.status)&&Array.isArray(r.items)&&r.items.length<=200
  &&(r.status==='AVAILABLE_SNAPSHOT'?r.items.length>0:r.items.length===0)
  &&r.items.every(x=>object(x)&&uuid(x.staffId)&&uuid(x.regionId)&&token(x.optionId)&&token(x.version)&&Date.parse(x.startsAt)>now&&Date.parse(x.endsAt)>Date.parse(x.startsAt)
   &&Date.parse(x.snapshotExpiresAt)>now&&Date.parse(x.sourceValidUntil)>=Date.parse(x.snapshotExpiresAt));
}
function createSurveyAvailability({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_SURVEY_ADMIN==='1'&&isPrimary()===true;
 async function handle(req,res,operation){
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Chuẩn bị lịch khảo sát chưa được mở.'});
  const actor=req.user?.userId||req.user?.id,b=operation==='change'?req.body:req.query,company=b?.companyId;
  if(!uuid(actor)||!uuid(company)||(req.user?.userId&&req.user?.id&&req.user.userId!==req.user.id))return res.status(403).json({error:'Không xác định được phạm vi lịch khảo sát.'});
  const keys={read:['companyId','staffId','regionId'],change:['companyId','requestId','command'],availability:['companyId','threadId','from','to']}[operation];
  if(!keys||!only(b,keys)||(operation==='read'&&(!uuid(b.staffId)||!uuid(b.regionId)))||(operation==='change'&&(!uuid(b.requestId)||!validCommand(b.command)))
   ||(operation==='availability'&&(!uuid(b.threadId)||!instant(b.from)||!instant(b.to))))return res.status(400).json({error:'Yêu cầu lịch khảo sát không hợp lệ.'});
  const base={p_actor:actor,p_company:company};
  const rpc=operation==='read'?['crm_survey_roster_read',{...base,p_staff:b.staffId,p_region:b.regionId}]:operation==='change'?['crm_survey_roster_change',{...base,p_request:b.requestId,p_command:b.command}]:['crm_survey_availability',{...base,p_thread:b.threadId,p_from:b.from,p_to:b.to}];
  try{
   if(!enabled())throw fail('PRIMARY_ONLY_REQUIRED');
   const result=await db.rpc(...rpc);if(result?.error)throw fail(result.error.code);const data=result?.data;
   if(!enabled()||!object(data)||data.companyId!==company||data.reservationMade!==false)throw fail('SURVEY_STORAGE_UNAVAILABLE');
   if(operation==='availability'&&!validAvailability(data,company,b.threadId))throw fail('SURVEY_STORAGE_UNAVAILABLE');
   if(operation!=='availability'&&(data.staffId!==(b.staffId||b.command.staffId)||data.regionId!==(b.regionId||b.command.regionId)||!Number.isSafeInteger(data.revision)||data.revision<0))throw fail('SURVEY_STORAGE_UNAVAILABLE');
   if(operation==='change'&&(data.requestId!==b.requestId||data.action!==b.command.action||data.accepted!==true))throw fail('SURVEY_STORAGE_UNAVAILABLE');
   return res.json(data);
  }catch(e){const status=e.code==='42501'?403:['40001','23505'].includes(e.code)?409:['22023','22P02','22007','22008'].includes(e.code)?400:503;
   return res.status(status).json({error:status===409?'Nguồn lịch đã thay đổi. Tải lại trước khi sửa.':'Chưa xác nhận được nguồn lịch trong phạm vi hiện tại.'});}
 }
 return {handle};
}
module.exports={createSurveyAvailability,validCommand,validAvailability};
