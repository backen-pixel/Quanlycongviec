'use strict';
const {createReviewService}=require('../modules/crmLeadIdentity/reviewService');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=(status,message)=>Object.assign(new Error(message),{status});
async function readFacebookDuplicateReview(db,req,{isPrimary,enabled=()=>process.env.VPT_CRM_IDENTITY_REVIEW==='1'}={}){
 if(!enabled())throw invalid(503,'Chức năng rà khách trùng chưa được mở.');
 const input=req.method==='GET'?req.query:req.body;
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>k!=='company_id')||!UUID.test(input.company_id||''))throw invalid(400,'Chọn một công ty để rà khách trùng.');
 const actor=req.user?.userId||req.user?.id;
 if(!UUID.test(actor||'')||(req.user?.id&&req.user?.userId&&req.user.id.toLowerCase()!==req.user.userId.toLowerCase()))throw invalid(403,'Không xác định được người thực hiện.');
 const service=createReviewService({db,isPrimary});
 try{
  const result=await service.readCompany({actorId:actor.toLowerCase(),companyId:input.company_id.toLowerCase()});
  const members=result.groups.flatMap(g=>g.members);
  return{...result,readOnly:true,merged:0,scannedLeadCount:members.length,
   availableLeadCount:members.filter(m=>m.available).length,
   unresolvedPairCount:result.candidates.filter(c=>!c.resolved).length,
   reviewGroupCount:result.groups.filter(g=>!g.deduplicationComplete).length};
 }catch(e){throw invalid(e.status||503,e.status===403?'Cần quyền quản lý khách hàng của công ty để rà toàn bộ hồ sơ.':'Chưa rà được khách trùng. Giữ kết quả là chưa xác định và đọc lại sau.');}
}
module.exports={readFacebookDuplicateReview};
