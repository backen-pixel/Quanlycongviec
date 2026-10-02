'use strict';
const {Router}=require('express');
const {supabase}=require('../config/supabase');
const state=require('../config/supabaseRouter');
const r=Router(),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
async function handle(req,res,write){
 res.set('Cache-Control','no-store');
 if(process.env.VPT_FB_LEAD_INTAKE_ADMIN!=='1'||state.isFailoverEnabled()||state.getActiveTarget()!=='primary')return res.status(503).json({error:'Quản lý tiếp nhận biểu mẫu chưa được mở.'});
 const actor=req.user?.userId||req.user?.id,company=write?req.body?.companyId:req.query?.companyId;
 if(!uuid(actor)||!uuid(company)||(req.user?.userId&&req.user?.id&&req.user.userId!==req.user.id))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
 if(write&&(!uuid(req.body.requestId)||Object.keys(req.body).some(k=>!['companyId','requestId','configuration'].includes(k))))return res.status(400).json({error:'Yêu cầu cấu hình không hợp lệ.'});
 const args=write?{p_actor:actor,p_company:company,p_request:req.body.requestId,p_command:req.body.configuration}:{p_actor:actor,p_company:company};
 try{
  const {data,error}=await supabase.rpc(write?'marketing_fb_lead_binding_set':'marketing_fb_lead_status',args);
  if(error){const status=error.code==='42501'?403:['40001','23505'].includes(error.code)?409:['22023','22P02'].includes(error.code)?400:503;return res.status(status).json({error:status===409?'Cấu hình đã thay đổi. Hãy tải lại.':'Chưa lưu hoặc đọc được cấu hình trong phạm vi hiện tại.'});}
  return res.json(data);
 }catch{return res.status(503).json({error:'Nguồn tiếp nhận tạm thời chưa sẵn sàng.'});}
}
r.get('/status',(req,res)=>handle(req,res,false));
r.post('/bindings',(req,res)=>handle(req,res,true));
module.exports=r;
