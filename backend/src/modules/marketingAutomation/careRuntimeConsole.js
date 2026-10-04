'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function createCareRuntimeConsole({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_CARE_RUNTIME_ADMIN==='1'&&isPrimary()===true;
 return async(req,res,operation)=>{
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Lịch sử trợ lý tự động chưa được mở.'});
  const b=operation==='close'?req.body:req.query,actor=req.user?.userId||req.user?.id;
  if(!uuid(actor)||(req.user?.id&&req.user?.userId&&req.user.id!==req.user.userId))return res.status(403).json({error:'Không xác định được người truy cập.'});
  const keys=operation==='close'?['companyId','requestId','runtimeRequestId','reason']:operation==='read'?['companyId','requestId']:operation==='list'?['companyId',...(b?.after===undefined?[]:['after'])]:[];
  if(!b||Array.isArray(b)||Object.keys(b).length!==keys.length||!keys.every(k=>Object.hasOwn(b,k))
   ||!uuid(b.companyId)||(['read','close'].includes(operation)&&!uuid(b.requestId))
   ||(operation==='close'&&(!uuid(b.runtimeRequestId)||typeof b.reason!=='string'||b.reason.trim().length<20||b.reason.length>2000))||(b.after!==undefined&&!uuid(b.after)))
   return res.status(400).json({error:'Yêu cầu xem lịch sử không hợp lệ.'});
  try{
   const r=await db.rpc(operation==='close'?'crm_care_runtime_close':operation==='read'?'crm_care_runtime_read':'crm_care_runtime_list',
    {p_actor:actor,p_company:b.companyId,...(operation==='close'?{p_request:b.requestId,p_runtime_request:b.runtimeRequestId,p_reason:b.reason}:operation==='read'?{p_request:b.requestId}:{p_after:b.after||null})});
   if(r?.error){const e=new Error();e.code=r.error.code;throw e;}
   const d=r?.data;
   if(!enabled()||d?.companyId!==b.companyId||d.send!==false
    ||(operation==='read'&&(d.requestId!==b.requestId||d.principalKind!=='AGENT'||!uuid(d.principalId)||!uuid(d.grantId)))
    ||(operation==='close'&&(d.requestId!==b.requestId||d.runtimeRequestId!==b.runtimeRequestId||!['CLOSED','ALREADY_TERMINAL'].includes(d.outcome)||typeof d.replayed!=='boolean'))
    ||(operation==='list'&&(!Array.isArray(d.items)||d.items.length>20||(d.nextAfter!==null&&!uuid(d.nextAfter)))))throw new Error();
   return res.json(d);
  }catch(e){return res.status(e.code==='42501'?403:e.code==='23505'?409:503).json({error:'Chưa đọc được lịch sử trong phạm vi hiện tại.'});}
 };
}
module.exports={createCareRuntimeConsole};
