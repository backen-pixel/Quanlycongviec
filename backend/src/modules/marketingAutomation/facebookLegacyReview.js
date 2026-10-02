'use strict';
const {phoneKey,emailKey}=require('../crmLeadIdentity/review');
const {readVerifiedLead,pagesFromEnv}=require('./facebookLeadIntake');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const failure=(code)=>Object.assign(new Error(code),{code});

// Historical IDs alone are not trusted. Match freshly fetched provider contact
// against the current, already linked CRM records; never search/merge by phone.
function matchingFields(contact,crm){
 const result=[];
 for(const [field,normalize,keys] of [['phone',phoneKey,['leadPhone','customerPhone']],['email',emailKey,['leadEmail','customerEmail']]]){
  const raw=contact?.[field],values=keys.map(k=>crm?.[k]).filter(x=>x!==null&&x!==undefined&&x!=='');
  const provided=raw!==null&&raw!==undefined&&raw!=='';
  if((provided&&(typeof raw!=='string'||!normalize(raw)))||values.some(x=>typeof x!=='string'||!normalize(x)))throw failure('CONTACT_UNVERIFIED');
  if(!provided||!values.length)continue;
  if(values.some(x=>normalize(x)!==normalize(raw)))throw failure('CONTACT_CONFLICT');
  result.push(field);
 }
 if(!result.length)throw failure('CONTACT_UNVERIFIED');
 return result;
}

function createLegacyReview({db,isPrimary,env=process.env,readSource=readVerifiedLead}){
 return async function handle(req,res,operation){
  res.set('Cache-Control','no-store');
  const enabled=()=>env.VPT_FB_LEAD_INTAKE_ADMIN==='1'&&env.VPT_FB_LEGACY_REVIEW==='1'&&isPrimary()===true;
  if(!enabled())return res.status(503).json({error:'Đối soát khách cũ chưa được mở.'});
  const actor=req.user?.userId||req.user?.id,body=req.body,company=body?.companyId;
  if(!uuid(actor)||!uuid(company)||(req.user?.userId&&req.user?.id&&req.user.userId!==req.user.id))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  const preview=operation==='preview',allowed=preview?['companyId','receiptId','expectedVersion']:['companyId','requestId','command'];
  if(!['preview','commit'].includes(operation)||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k))
   ||(preview?(!uuid(body.receiptId)||!/^[a-f0-9]{32}$/.test(body.expectedVersion||'')):(!uuid(body.requestId)||!uuid(body.command?.proposalId))))
   return res.status(400).json({error:'Yêu cầu đối soát không hợp lệ.'});
  async function rpc(name,args){
   if(!enabled())throw failure('DISABLED');
   const {data,error}=await db.rpc(name,args);if(error)throw failure(error.code);if(data===null||data===undefined)throw failure('STORAGE');return data;
  }
  try{
   const args={p_actor:actor,p_company:company};
   if(!preview){
    const result=await rpc('marketing_fb_legacy_commit',{...args,p_request:body.requestId,p_command:body.command,p_pages:[...pagesFromEnv(env)]});
    return res.json(result);
   }
   const context=await rpc('marketing_fb_legacy_context',{...args,p_receipt:body.receiptId});
   if(context.companyId!==company||context.receipt?.id!==body.receiptId||context.receiptVersion!==body.expectedVersion)throw failure('40001');
   if(!pagesFromEnv(env).has(context.receipt.page_id))throw failure('42501');
   const verified=await readSource({receipt:context.receipt,context:context.providerContext,version:env.VPT_META_GRAPH_VERSION});
   if(!pagesFromEnv(env).has(context.receipt.page_id))throw failure('42501');
   const matches=matchingFields(verified.contact,context.contacts);
   const result=await rpc('marketing_fb_legacy_prepare',{...args,p_receipt:body.receiptId,p_context_version:context.contextVersion,p_proof:verified.proof,p_matches:matches});
   return res.json(result);
  }catch(error){
   const code=error.code,status=code==='42501'?403:['40001','23505','P0002','CONTACT_CONFLICT','CONTACT_UNVERIFIED'].includes(code)?409:['22023','22P02'].includes(code)?400:503;
   const message=code==='CONTACT_CONFLICT'||code==='CONTACT_UNVERIFIED'?'Liên hệ từ Facebook chưa khớp hồ sơ CRM. Cần đối soát riêng; chưa nối nguồn.':status===409?'Hồ sơ đã thay đổi, hết hạn hoặc còn mâu thuẫn. Hãy tải lại và kiểm tra.':'Chưa thực hiện được đối soát trong phạm vi hiện tại.';
   return res.status(status).json({error:message});
  }
 };
}
module.exports={matchingFields,createLegacyReview};
