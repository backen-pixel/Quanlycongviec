'use strict';
const {reportTrial}=require('./trialReport');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
function createTrialService({db,isPrimary}){
 async function rpc(name,c,args={}){if(isPrimary()!==true)fail('PRIMARY_REQUIRED',503);if(!uuid(c?.actorId)||!uuid(c?.companyId))fail('INVALID_SCOPE',400);const {data,error}=await db.rpc(name,{p_actor:c.actorId,p_company:c.companyId,...args});if(error)fail('TRIAL_UNAVAILABLE',({'42501':403,'P0002':404,'40001':409,'23505':409,'22023':400,'22007':400,'22008':400})[error.code]||503);return data;}
 return{
  async list(c){const d=await rpc('marketing_lead_trial_list',c);if(d?.companyId!==c.companyId||!Array.isArray(d.trials))fail('TRIAL_UNAVAILABLE',503);return d;},
  async report(c,id){if(!uuid(id))fail('INVALID_TRIAL',400);const d=await rpc('marketing_lead_trial_snapshot',c,{p_trial:id});if(d?.companyId!==c.companyId||d?.trial?.id!==id)fail('TRIAL_UNAVAILABLE',503);return reportTrial(d);},
  async configure(c,b){if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['trialId','requestId','name','since','until','expectedRevision'].includes(k))||!uuid(b.trialId)||!uuid(b.requestId)||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||typeof b.name!=='string'||b.name.trim().length<3||b.name.length>120||![b.since,b.until].every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)))fail('INVALID_CONFIGURATION',400);return rpc('marketing_lead_trial_set',c,{p_trial:b.trialId,p_request:b.requestId,p_command:{name:b.name.trim(),since:b.since,until:b.until,expectedRevision:b.expectedRevision}});}
 };
}
module.exports={createTrialService};
