'use strict';
const {pagesFromEnv}=require('./facebookLeadIntake');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function createCensusAdmin({db,isPrimary,env=process.env}){
 return async(req,res,start=false)=>{
  res.set('Cache-Control','no-store');
  if(env.VPT_FB_LEAD_CENSUS!=='1'||env.VPT_MARKETING_TRIAL_REPORT!=='1'||isPrimary()!==true||(start&&env.VPT_FB_LEAD_INTAKE_WORKER_PAUSED==='1'))return res.status(503).json({error:'Đối soát nguồn Facebook chưa được mở.'});
  const actor=req.user?.userId,company=req.query?.company_id,trial=req.params?.trialId;
  if(!uuid(actor)||!uuid(company)||!uuid(trial)||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  if(start&&(!uuid(req.body?.requestId)||Object.keys(req.body).some(k=>k!=='requestId')))return res.status(400).json({error:'Yêu cầu đối soát không hợp lệ.'});
  try{
   const {data,error}=await db.rpc(start?'marketing_fb_census_start':'marketing_fb_census_status',{p_actor:actor,p_company:company,p_trial:trial,...(start?{p_request:req.body.requestId,p_pages:[...pagesFromEnv(env)]}:{})});
   if(error){const status=error.code==='42501'?403:['40001','23505'].includes(error.code)?409:['22023','22P02'].includes(error.code)?400:503;return res.status(status).json({error:status===409?'Lượt đối soát hoặc cấu hình đã thay đổi. Hãy kiểm tra trạng thái trước khi gửi lại.':'Chưa đối soát được trong phạm vi hiện tại.'});}
   if(!data||(start?!uuid(data.id):data.companyId!==company||data.trialId!==trial))throw Error('bad result');
   return res.status(start?202:200).json(start?{...data,companyId:company,trialId:trial}:data);
  }catch{return res.status(503).json({error:'Chưa xác nhận được kết quả đối soát. Kiểm tra trạng thái hoặc gửi lại cùng mã yêu cầu.'});}
 };
}
module.exports={createCensusAdmin};
