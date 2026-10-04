'use strict';
const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function createCareInferenceCosts({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_CARE_COST_ADMIN==='1'&&isPrimary()===true;
 return async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Theo dõi chi phí AI chưa được mở.'});
  const actor=req.user?.userId||req.user?.id,b=req.query;
  if(!id(actor)||(req.user?.userId&&req.user?.id&&req.user.userId!==req.user.id))return res.status(403).json({error:'Không xác định được người truy cập.'});
  if(!b||Array.isArray(b)||!id(b.companyId)||Object.keys(b).some(k=>!['companyId','policyId','after','queue'].includes(k))
   ||(b.policyId!==undefined&&!id(b.policyId))||(b.after!==undefined&&!id(b.after))||(b.queue!==undefined&&(b.queue!=='unresolved'||!id(b.policyId))))return res.status(400).json({error:'Phạm vi chi phí không hợp lệ.'});
  try{
   const r=await db.rpc('crm_care_inference_costs',{p_actor:actor,p_company:b.companyId,p_policy:b.policyId||null,p_after:b.after||null,p_unresolved:b.queue==='unresolved'});
   if(r?.error){const e=new Error();e.code=r.error.code;throw e;}
   const d=r?.data;
   if(!enabled()||d?.companyId!==b.companyId||d.policyId!==(b.policyId||null)||d.actualCostVnd!==null||d.send!==false||d.canReconcile!==false||d.unresolvedOnly!==(b.queue==='unresolved')
    ||d.scope!=='RECORDED_CARE_POLICIES'||d.costBasis!=='RESERVED_ALLOWANCE_NOT_PROVIDER_INVOICE')throw Error();
   return res.json(d);
  }catch(e){return res.status(e.code==='42501'?403:503).json({error:'Chưa xác minh được số liệu chi phí AI trong phạm vi hiện tại.'});}
 };
}
module.exports={createCareInferenceCosts};
