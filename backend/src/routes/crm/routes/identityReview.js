'use strict';
const {Router}=require('express');
const {supabase}=require('../../../config/supabase');
const state=require('../../../config/supabaseRouter');
const {createReviewService}=require('../../../modules/crmLeadIdentity/reviewService');
const service=createReviewService({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'}),r=Router();
async function handle(req,res,write){
 res.set('Cache-Control','no-store');
 if(process.env.VPT_CRM_IDENTITY_REVIEW!=='1')return res.status(503).json({error:'Chức năng rà khách trùng chưa được mở.'});
 const lead=req.crmLeadAccess?.lead,actor=req.user?.userId;
 if(!lead||lead.id!==req.params.id||!actor||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được quyền trên hồ sơ.'});
 try{const c={actorId:actor,companyId:lead.company_id,leadId:lead.id};return res.json(await(write?service.record(c,req.body):service.read(c)));}
 catch(e){return res.status(e.status||503).json({error:e.status===409?'Hồ sơ hoặc quyết định đã thay đổi; cần tải lại và kiểm tra.':e.status===403?'Cần quyền quản lý khách hàng của công ty để rà toàn bộ hồ sơ.':'Chưa rà được khách trùng trong phạm vi hiện tại.'});}
}
r.get('/leads/:id/identity-review',(req,res)=>handle(req,res,false));
r.post('/leads/:id/identity-review',(req,res)=>handle(req,res,true));
module.exports=r;
