'use strict';
const {createHash}=require('node:crypto');
const {verifySignature}=require('./facebookLeadIntake');
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail=code=>Object.assign(new Error(code),{code});
const carePages=(env=process.env)=>new Set(String(env.VPT_FB_CARE_PAGES||'').split(',').map(x=>x.trim()).filter(numeric));

// Conservative explicit requests only. This is not an open-ended language model
// or an authorization parser. Unrecognized text remains WAITING, never AI-active.
function explicitIntent(text){
 const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(stop|unsubscribe)$/.test(s)||/\b(dung|ngung|khong) (nhan tin|lien he|goi dien|gui tin|quang cao)\b/.test(s)||/\b(khong muon|khong can) (nhan tin|lien he|quang cao)\b/.test(s))return 'OPT_OUT';
 if(/\b(gap|noi chuyen voi|chuyen cho|goi) (nhan vien|nguoi that|nguoi tu van|tu van vien)\b/.test(s)||/\b(talk to|speak to) (a human|a person|an agent)\b/.test(s))return 'REQUEST_HUMAN';
 return 'MESSAGE';
}
function extractCareEvents(body,pages,now=Date.now(),{surveyConfirmations=false}={}){
 if(body?.object!=='page')return [];
 if(!Array.isArray(body.entry)||body.entry.length>100)throw fail('INVALID_ENVELOPE');
 const rows=[];
 for(const entry of body.entry){
  if(!pages.has(entry?.id))continue;
  if(entry.messaging!==undefined&&!Array.isArray(entry.messaging))throw fail('INVALID_ENVELOPE');
  if((entry.messaging||[]).length>100)throw fail('ENVELOPE_LIMIT');
  for(const event of entry.messaging||[]){
   if(!event?.message)continue; // delivery/read acknowledgements are not messages
   const m=event.message,echo=m.is_echo===true;
   if(m.is_echo!==undefined&&typeof m.is_echo!=='boolean')throw fail('INVALID_ENVELOPE');
   const pageId=entry.id,psid=echo?event.recipient?.id:event.sender?.id;
   if(!numeric(psid)||psid===pageId||(echo?event.sender?.id:event.recipient?.id)!==pageId
    ||typeof m.mid!=='string'||!m.mid.length||m.mid.length>300||!Number.isSafeInteger(event.timestamp)
    ||event.timestamp<Date.UTC(2004,0,1)||event.timestamp>now+300000
    ||(m.text!==undefined&&typeof m.text!=='string')||(m.text||'').length>20000
    ||(m.attachments!==undefined&&!Array.isArray(m.attachments))||(m.attachments||[]).length>20)throw fail('INVALID_ENVELOPE');
   const attachments=(m.attachments||[]).map(a=>{
    if(typeof a?.type!=='string'||a.type.length>100)throw fail('INVALID_ENVELOPE');
    const url=a.payload?.url;
    if(url!==undefined&&(typeof url!=='string'||url.length>4000))throw fail('INVALID_ENVELOPE');
    // Stored evidence only; never fetch or embed a customer-supplied URL.
    return {type:a.type,...(url===undefined?{}:{url})};
   });
   const source={pageId,psid,mid:m.mid,direction:echo?'outbound':'inbound',content:m.text||'',attachments,sentAt:new Date(event.timestamp).toISOString()};
   const row={...source,intent:echo?'OUTBOUND_ECHO':explicitIntent(source.content),payloadHash:createHash('sha256').update(JSON.stringify(source)).digest('hex')};
   // Keep the historical message hash stable across rollout. Confirmation
   // evidence is separate and is accepted only from the signed raw envelope.
   // An arbitrary text message containing this string is never confirmation.
   if(surveyConfirmations&&!echo&&m.quick_reply!==undefined){
    const payload=m.quick_reply?.payload;
    if(typeof payload!=='string'||payload.length>1000)throw fail('INVALID_ENVELOPE');
    const match=/^VPT_SURVEY_V1:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(payload);
    if(match&&uuid(match[1])&&uuid(match[2]))row.confirmationPayload=payload;
   }
   if(surveyConfirmations&&echo){
    const appId=Number.isSafeInteger(m.app_id)?String(m.app_id):m.app_id;
    // Unknown/malformed provider metadata remains an ordinary external echo.
    // Never infer ownership from is_echo or app_id alone.
    if(numeric(appId))row.echoAppId=appId;
    if(typeof m.metadata==='string'&&m.metadata.length<=1000)row.echoMetadata=m.metadata;
   }
   rows.push(row);
   if(rows.length>100)throw fail('ENVELOPE_LIMIT');
  }
 }
 return rows;
}
function redactSurveyConfirmationPayloads(body,pages){
 if(body?.object!=='page'||!Array.isArray(body.entry))return body;
 return {...body,entry:body.entry.map(entry=>!pages.has(entry?.id)||!Array.isArray(entry.messaging)?entry:{...entry,messaging:entry.messaging.map(event=>{
  const original=event?.message;if(!original)return event;
  const confirmation=typeof original.quick_reply?.payload==='string'&&original.quick_reply.payload.startsWith('VPT_SURVEY_V1:');
  const attempt=typeof original.metadata==='string'&&original.metadata.startsWith('VPT_SURVEY_SEND_V1:');
  if(!confirmation&&!attempt)return event;
  const message={...original};if(confirmation)delete message.quick_reply;if(attempt)delete message.metadata;
  return {...event,message};
 })})};
}
function createCustomerCare({db,isPrimary,env=process.env,now=Date.now}){
 const enabled=()=>env.VPT_FB_CARE_ADMIN==='1'&&isPrimary()===true;
 async function rpc(name,args){
  if(isPrimary()!==true)throw fail('PRIMARY_ONLY_REQUIRED');
  const result=await db.rpc(name,args);
  if(result?.error)throw fail(result.error.code);
  if(result?.data===null||result?.data===undefined)throw fail('CARE_STORAGE_UNAVAILABLE');
  return result.data;
 }
 async function receive(req){
  const pages=carePages(env);if(!pages.size)return {enabled:false};
  if(!verifySignature(req.facebookRawBody,req.headers?.['x-hub-signature-256'],env.VPT_FACEBOOK_APP_SECRET))throw fail('INVALID_SIGNATURE');
  let body;try{body=JSON.parse(req.facebookRawBody.toString('utf8'));}catch{throw fail('INVALID_ENVELOPE');}
  const surveyConfirmations=env.VPT_SURVEY_CONFIRMATIONS==='1';
  const events=extractCareEvents(body,pages,now(),{surveyConfirmations});
  if(events.length)await rpc(surveyConfirmations?'crm_survey_receive':'crm_care_receive',{p_events:events});
  req.body=body;
  return {enabled:true,accepted:events.length};
 }
 async function handle(req,res,operation){
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Hộp thư chăm khách chưa được mở.'});
  const actor=req.user?.userId||req.user?.id,body=operation==='control'?req.body:req.query,company=body?.companyId;
  if(!uuid(actor)||!uuid(company)||(req.user?.userId&&req.user?.id&&req.user.userId!==req.user.id))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  const keys={list:['companyId','after'],queue:['companyId','mode','after','afterVersion','queueVersion'],read:['companyId','threadId'],history:['companyId','threadId','before','version'],control:['companyId','requestId','command']}[operation];
  if(!keys||!body||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k))
   ||(operation==='list'&&body.after!==undefined&&!uuid(body.after))||(operation==='read'&&!uuid(body.threadId))
   ||(operation==='queue'&&(!['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'].includes(body.mode)||(body.after===undefined)!==(body.afterVersion===undefined)||(body.after===undefined)!==(body.queueVersion===undefined)||(body.after!==undefined&&(!uuid(body.after)||!/^[a-f0-9]{32}$/.test(body.afterVersion)||!/^[a-f0-9]{32}$/.test(body.queueVersion)))))
   ||(operation==='history'&&(!uuid(body.threadId)||!uuid(body.before)||!/^[a-f0-9]{32}$/.test(body.version||'')))
   ||(operation==='control'&&(!uuid(body.requestId)||!uuid(body.command?.threadId))))return res.status(400).json({error:'Yêu cầu chăm khách không hợp lệ.'});
  const args={p_actor:actor,p_company:company};
  try{
   let result;
   if(operation==='list')result=await rpc('crm_care_list',{...args,p_after:body.after||null});
   else if(operation==='queue')result=await rpc('crm_care_queue',{...args,p_mode:body.mode,p_after:body.after||null,p_after_version:body.afterVersion||null,p_queue_version:body.queueVersion||null});
   else if(operation==='read')result=await rpc('crm_care_read',{...args,p_thread:body.threadId});
   else if(operation==='history')result=await rpc('crm_care_history',{...args,p_thread:body.threadId,p_before:body.before,p_version:body.version});
   else result=await rpc('crm_care_control',{...args,p_request:body.requestId,p_command:body.command});
   if(!enabled()||result?.companyId!==company)throw fail('CARE_STORAGE_UNAVAILABLE');
   if(!['list','queue'].includes(operation)&&result.threadId!==(body.threadId||body.command?.threadId))throw fail('CARE_STORAGE_UNAVAILABLE');
   if(operation==='queue'&&result.mode!==body.mode)throw fail('CARE_STORAGE_UNAVAILABLE');
   return res.json(result);
  }catch(e){
   const status=e.code==='42501'?403:['40001','23505'].includes(e.code)?409:['22023','22P02'].includes(e.code)?400:503;
   return res.status(status).json({error:status===409?'Hội thoại đã thay đổi. Tải lại trước khi tiếp quản hoặc dừng liên hệ.':'Chưa thực hiện được yêu cầu trong phạm vi hiện tại.'});
  }
 }
 // Initial enrolled Pages are receive/review-only. This prevents any legacy
 // auto/manual sender from bypassing consent before controlled dispatch exists.
 function assertLegacySendAllowed(pageId){
  if(carePages(env).has(String(pageId)))throw Object.assign(fail('CARE_SEND_NOT_ENABLED'),{status:409,message:'Page đang thử hộp thư chăm khách; gửi tin từ hệ thống chưa được mở.'});
 }
 return {receive,handle,assertLegacySendAllowed,isEnrolled:pageId=>carePages(env).has(String(pageId)),legacyBody:body=>redactSurveyConfirmationPayloads(body,carePages(env))};
}
module.exports={carePages,explicitIntent,extractCareEvents,redactSurveyConfirmationPayloads,createCustomerCare};
