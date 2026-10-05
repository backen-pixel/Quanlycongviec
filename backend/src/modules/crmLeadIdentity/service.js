'use strict';
const {projectIdentity,pair}=require('./graph');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure=(code,status)=>Object.assign(new Error(code),{code,status});
function publicSnapshot(raw){
 if(!raw || !/^[a-f0-9]{32}$/.test(raw.snapshotToken || ''))throw failure('IDENTITY_UNAVAILABLE',503);
 const result=projectIdentity(raw);
 // DB owns command concurrency token; domain digest is separate and must not
 // be mistaken for a stable person identifier or provider source receipt.
 return {...result,evidenceDigest:result.snapshotToken,snapshotToken:raw.snapshotToken};
}
function createIdentityService({db,isPrimary}){
 async function call(name,c,args={}){
  if(!isPrimary())throw failure('PRIMARY_REQUIRED',503);
  if(![c?.actorId,c?.companyId,c?.leadId].every(x=>typeof x==='string'&&UUID.test(x)))throw failure('INVALID_CONTEXT',400);
  const {data,error}=await db.rpc(name,{p_actor_id:c.actorId,p_company_id:c.companyId,...args});
  if(error){const map={'42501':['FORBIDDEN',403],'P0002':['NOT_FOUND',404],'40001':['STALE_IDENTITY',409],'23505':['IDEMPOTENCY_CONFLICT',409],'22023':['INVALID_IDENTITY',400],'22P02':['INVALID_IDENTITY',400],'54000':['IDENTITY_COMPONENT_TOO_LARGE',409]};const [code,status]=map[error.code]||['IDENTITY_UNAVAILABLE',503];throw failure(code,status);}
  return data;
 }
 return{
  async read(c){return publicSnapshot(await call('crm_lead_identity_snapshot',c,{p_lead_id:c.leadId}));},
  async record(c,b){
   if(!b || Array.isArray(b) || Object.keys(b).some(k=>!['requestId','peerLeadId','action','leftToken','rightToken','evidence'].includes(k)) || !UUID.test(b.requestId||'') || !['LINK','UNLINK'].includes(b.action) || typeof b.evidence!=='string' || b.evidence.trim().length<20 || b.evidence.length>2000 || ![b.leftToken,b.rightToken].every(x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x)))throw failure('INVALID_IDENTITY',400);
   try{pair(c.leadId,b.peerLeadId)}catch{throw failure('INVALID_IDENTITY',400)}
   const data=await call('crm_lead_identity_record',c,{p_request_id:b.requestId,p_command:{action:b.action,leftLeadId:c.leadId.toLowerCase(),rightLeadId:b.peerLeadId.toLowerCase(),leftToken:b.leftToken,rightToken:b.rightToken,evidence:b.evidence.trim()}});
   if(typeof data?.replayed!=='boolean')throw failure('IDENTITY_UNAVAILABLE',503);
   return{replayed:data.replayed,left:publicSnapshot(data.left),right:publicSnapshot(data.right)};
  },
 };
}
module.exports={createIdentityService,publicSnapshot};
