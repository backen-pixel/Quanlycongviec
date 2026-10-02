'use strict';
const {renderApprovedContent}=require('./customerCare');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const version=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const channels=new Set(['facebook','website','google','tiktok','zalo','chatgpt']);
const fail=code=>Object.assign(new Error(code),{code});
function createCareLibrary({db,isPrimary,env=process.env,now=()=>new Date().toISOString()}){
 const enabled=()=>env.VPT_CARE_LIBRARY_ADMIN==='1'&&isPrimary()===true;
 async function handle(req,res,operation){
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Thư viện tư vấn chưa được mở.'});
  const body=['change','preview'].includes(operation)?req.body:req.query,actor=req.user?.userId||req.user?.id,company=body?.companyId;
  if(!uuid(actor)||!uuid(company)||(req.user?.id&&req.user?.userId&&req.user.id!==req.user.userId))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  const allowed={list:['companyId','after'],read:['companyId','entryId'],choices:['companyId','kind','search','after'],history:['companyId','entryId','version','before'],change:['companyId','requestId','command'],preview:['companyId','entryId','version','channel','regionId']}[operation];
  if(!allowed||!body||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k))
   ||(['list','choices'].includes(operation)&&body.after!==undefined&&!uuid(body.after))
   ||(['read','preview','history'].includes(operation)&&!uuid(body.entryId))
   ||(operation==='choices'&&(!['product','region'].includes(body.kind)||(body.search!==undefined&&(typeof body.search!=='string'||body.search.length>100))))
   ||(operation==='history'&&(!version(body.version)||(body.before!==undefined&&!uuid(body.before))))
   ||(operation==='change'&&(!uuid(body.requestId)||!uuid(body.command?.entryId)))
   ||(operation==='preview'&&(!version(body.version)||!uuid(body.regionId)||!channels.has(body.channel))))return res.status(400).json({error:'Yêu cầu thư viện không hợp lệ.'});
  const args={p_actor:actor,p_company:company};
  try{
   let rpc,argsExtra;
   if(operation==='list'){rpc='crm_care_library_list';argsExtra={p_after:body.after||null};}
   else if(operation==='choices'){rpc='crm_care_library_choices';argsExtra={p_kind:body.kind,p_search:body.search||'',p_after:body.after||null};}
   else if(operation==='history'){rpc='crm_care_library_history';argsExtra={p_entry:body.entryId,p_version:body.version,p_before:body.before||null};}
   else if(operation==='change'){rpc='crm_care_library_change';argsExtra={p_request:body.requestId,p_command:body.command};}
   else {rpc='crm_care_library_read';argsExtra={p_entry:body.entryId};}
   const {data,error}=await db.rpc(rpc,{...args,...argsExtra});
   if(error)throw fail(error.code);
   if(!enabled()||data?.companyId!==company||(!['list','choices'].includes(operation)&&data.entryId!==(body.entryId||body.command?.entryId)))throw fail('UNAVAILABLE');
   if(operation==='choices'&&(data.kind!==body.kind||data.search!==(body.search||'')))throw fail('UNAVAILABLE');
   if(operation==='history'&&(data.version!==body.version||data.historical!==true))throw fail('UNAVAILABLE');
   if(operation==='change'&&(data.requestId!==body.requestId||data.action!==body.command.action||data.entry?.companyId!==company||data.entry?.entryId!==body.command.entryId))throw fail('UNAVAILABLE');
   if(operation!=='preview')return res.json(data);
   if(data.version!==body.version)throw fail('40001');
   const doc=data.document;
   if(data.approvedReady!==true||data.state!=='APPROVED'||data.sourceReady!==true||!doc?.regionIds?.includes(body.regionId)||!['ADVICE','QUALIFY','HANDOFF'].includes(doc.purpose))throw fail('42501');
   const rendered=renderApprovedContent({companyId:company,channel:body.channel,now:now(),facts:[],template:{companyId:company,status:data.state,version:data.revision,approvedBy:data.approvedBy,expiresAt:doc.validUntil,channels:doc.channels,text:doc.answer,factIds:[]}});
   if(rendered.status!=='READY')throw fail('42501');
   // This is an operator preview, never a dispatch grant. Runtime must re-read
   // current approval, audience, conversation/consent and delegation before send.
   return res.json({companyId:company,entryId:data.entryId,version:data.version,purpose:doc.purpose,text:rendered.text,sourceReference:doc.sourceReference,validUntil:doc.validUntil,send:false});
  }catch(e){
   const status=e.code==='42501'?403:['40001','23505'].includes(e.code)?409:['22023','22P02','22007','22008'].includes(e.code)?400:503;
   return res.status(status).json({error:status===409?'Nội dung đã thay đổi. Tải lại bản hiện hành trước khi tiếp tục.':'Chưa thực hiện được yêu cầu thư viện trong phạm vi hiện tại.'});
  }
 }
 return {handle};
}
module.exports={createCareLibrary};
