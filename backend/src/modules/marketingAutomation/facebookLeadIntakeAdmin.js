'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function createIntakeAdmin({db,isPrimary,env=process.env}){
 return async function handle(req,res,operation){
  res.set('Cache-Control','no-store');
  if(env.VPT_FB_LEAD_INTAKE_ADMIN!=='1'||isPrimary()!==true||(operation==='recover'&&env.VPT_FB_LEAD_RECOVERY!=='1'))
   return res.status(503).json({error:'Quản lý tiếp nhận biểu mẫu chưa được mở.'});
  const write=['bindings','recover'].includes(operation),actor=req.user?.userId||req.user?.id;
  const company=write?req.body?.companyId:req.query?.companyId;
  if(!uuid(actor)||!uuid(company)||(req.user?.userId&&req.user?.id&&req.user.userId!==req.user.id))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  const allowed=operation==='recover'?['companyId','requestId','command']:['companyId','requestId','configuration'];
  if(write&&(!uuid(req.body?.requestId)||Object.keys(req.body).some(k=>!allowed.includes(k))))return res.status(400).json({error:'Yêu cầu không hợp lệ.'});
  const cursor=req.query?.cursor;
  if(operation==='console'&&cursor!==undefined&&!uuid(cursor))return res.status(400).json({error:'Trang dữ liệu không hợp lệ.'});
  const rpc={status:'marketing_fb_lead_status',console:'marketing_fb_lead_console',bindings:'marketing_fb_lead_binding_set',recover:'marketing_fb_lead_recover'}[operation];
  if(!rpc)return res.status(400).json({error:'Thao tác không hợp lệ.'});
  const args={p_actor:actor,p_company:company,...(write?{p_request:req.body.requestId,p_command:operation==='recover'?req.body.command:req.body.configuration}:{}),...(operation==='console'?{p_after:cursor||null}:{})};
  try{
   const {data,error}=await db.rpc(rpc,args);
   if(error){const status=error.code==='42501'?403:['40001','23505'].includes(error.code)?409:['22023','22P02'].includes(error.code)?400:503;
    return res.status(status).json({error:status===409?'Hồ sơ hoặc cấu hình đã thay đổi, hoặc cần đối soát riêng. Hãy tải lại.':'Chưa thực hiện được trong phạm vi hiện tại.'});}
   if(data===null||data===undefined)throw Error('missing result');
   return res.json(operation==='console'?{...data,recoveryEnabled:env.VPT_FB_LEAD_RECOVERY==='1'}:data);
  }catch{return res.status(503).json({error:'Nguồn tiếp nhận tạm thời chưa sẵn sàng.'});}
 };
}
module.exports={createIntakeAdmin};
