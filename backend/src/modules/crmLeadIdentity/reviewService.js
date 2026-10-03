'use strict';
const {projectReview}=require('./review');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail=(code,status)=>{throw Object.assign(new Error(code),{code,status});};
function createReviewService({db,isPrimary}){
 async function call(name,c,args={}){
  if(isPrimary()!==true)fail('PRIMARY_REQUIRED',503);
  if(![c?.actorId,c?.companyId,c?.leadId].every(uuid))fail('INVALID_CONTEXT',400);
  const {data,error}=await db.rpc(name,{p_actor:c.actorId,p_company:c.companyId,...args});
  if(error){const status={'42501':403,'P0002':404,'40001':409,'23505':409,'22023':400,'22P02':400,'54000':409}[error.code]||503;fail(status===409?'IDENTITY_REVIEW_CHANGED':'IDENTITY_REVIEW_UNAVAILABLE',status);}return data;
 }
 return{
  async read(c){return projectReview(await call('crm_identity_review_snapshot',c));},
  async record(c,b){
   if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['requestId','action','peerLeadId','snapshotToken','evidence'].includes(k))||!uuid(b.requestId)||!['LINK','UNLINK','DISTINCT','REVOKE_DISTINCT','RECONFIRM','DETACH_UNAVAILABLE'].includes(b.action)||!(/^[a-f0-9]{32}$/.test(b.snapshotToken||''))||typeof b.evidence!=='string'||b.evidence.trim().length<20||b.evidence.length>2000)fail('INVALID_IDENTITY_REVIEW',400);
   if(b.action==='RECONFIRM'?b.peerLeadId!==undefined&&b.peerLeadId!==null:!uuid(b.peerLeadId)||b.peerLeadId.toLowerCase()===c.leadId.toLowerCase())fail('INVALID_IDENTITY_REVIEW',400);
   const data=await call('crm_identity_review_record',c,{p_request:b.requestId,p_command:{action:b.action,leadId:c.leadId.toLowerCase(),peerLeadId:b.peerLeadId?.toLowerCase()||null,snapshotToken:b.snapshotToken,evidence:b.evidence.trim()}});
   if(typeof data?.replayed!=='boolean')fail('IDENTITY_REVIEW_UNAVAILABLE',503);return{...projectReview(data.snapshot),replayed:data.replayed};
  }
 };
}
module.exports={createReviewService};
