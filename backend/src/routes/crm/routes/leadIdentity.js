'use strict';
const {Router}=require('express');
const {supabase}=require('../../../config/supabase');
const routerState=require('../../../config/supabaseRouter');
const {createIdentityService}=require('../../../modules/crmLeadIdentity/service');
const r=Router(),service=createIdentityService({db:supabase,isPrimary:()=>!routerState.isFailoverEnabled()&&routerState.getActiveTarget()==='primary'});
const messages={FORBIDDEN:'Bạn không có quyền kiểm tra toàn bộ nhóm khách này.',NOT_FOUND:'Không tìm thấy hồ sơ khách trong phạm vi hiện tại.',STALE_IDENTITY:'Nhóm khách đã thay đổi hoặc còn liên kết cần xác minh. Hãy tải lại trước khi tiếp tục.',IDEMPOTENCY_CONFLICT:'Yêu cầu đã được sử dụng cho nội dung khác.',INVALID_IDENTITY:'Cần chọn đúng hai hồ sơ và ghi căn cứ xác minh.',IDENTITY_COMPONENT_TOO_LARGE:'Nhóm có quá nhiều hồ sơ; cần người phụ trách kiểm tra.'};
async function handle(req,res,write){
 res.set('Cache-Control','no-store');
 if(process.env.VPT_CRM_LEAD_IDENTITY!=='1')return res.status(503).json({code:'IDENTITY_DISABLED',error:'Chức năng liên kết khách chưa được mở.'});
 const lead=req.crmLeadAccess?.lead;
 if(!lead||lead.id!==req.params.id||!req.user?.userId||(req.user.id&&req.user.id!==req.user.userId))return res.status(403).json({code:'FORBIDDEN',error:messages.FORBIDDEN});
 const c={actorId:req.user.userId,companyId:lead.company_id,leadId:lead.id};
 try{return res.json(await(write?service.record(c,req.body):service.read(c)))}catch(e){return res.status(e.status||503).json({code:e.status?e.code:'IDENTITY_UNAVAILABLE',error:messages[e.code]||'Chưa kiểm tra được liên kết khách. Vui lòng thử lại.'});}
}
r.get('/leads/:id/identity',(req,res)=>handle(req,res,false));
r.post('/leads/:id/identity',(req,res)=>handle(req,res,true));
module.exports=r;
