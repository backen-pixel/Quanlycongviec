'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {carePages}=require('./facebookCustomerCare');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail=code=>Object.assign(new Error(code),{code});

// This worker sends only immutable domain booking outcomes.
// It is neither an AI tool nor a general-purpose Messenger send endpoint.
function createSurveyOutcomeDispatch({db,isPrimary,env=process.env,fetchImpl=globalThis.fetch,now=Date.now,
 monotonic=()=>performance.now(),workerId=randomUUID(),onError=()=>{}}){
 if(!uuid(workerId))throw fail('INVALID_WORKER_ID');
 const lifecycle=require('../../helpers/workerDrain').createWorkerDrain(drainOnce);
 const receiveEnabled=()=>!lifecycle.isStopped()&&env.VPT_SURVEY_OUTCOMES==='1'&&env.VPT_SURVEY_CONFIRMATIONS==='1'&&isPrimary()===true;
 const sendEnabled=page=>receiveEnabled()&&env.VPT_SURVEY_OUTCOMES==='1'&&carePages(env).has(page);
 async function rpc(name,args){
  if(isPrimary()!==true)throw fail('PRIMARY_ONLY_REQUIRED');
  const r=await db.rpc(name,args);
  if(r?.error||r?.data===null||r?.data===undefined)throw fail('SURVEY_STORAGE_UNAVAILABLE');
  return r.data;
 }
 async function record(attempt,result){
  // Retry only persistence of the SAME receipt. Never retry the Meta POST.
  for(let n=0;n<3;n++){
   try{return await rpc('crm_survey_outcome_result',{p_attempt:attempt,p_worker:workerId,p_result:result});}
   catch{if(isPrimary()!==true||n===2){onError('SURVEY_RESULT_PERSISTENCE_UNCERTAIN');return null;}}
  }
 }
 function validClaim(c,page,company){
  const begin=Date.parse(c.authorizedAt),end=Date.parse(c.sendBefore),m=c.payload?.message;
  return c.status==='CLAIMED'&&uuid(c.attemptId)&&uuid(c.proposalId)&&uuid(c.outcomeId)&&c.pageId===page&&c.companyId===company
   &&typeof c.psid==='string'&&/^[0-9]{1,32}$/.test(c.psid)&&c.psid!==page&&typeof c.appId==='string'&&/^[0-9]{1,32}$/.test(c.appId)
   &&/^v[0-9]{1,3}\.0$/.test(c.graphVersion||'')&&Number.isFinite(begin)&&Number.isFinite(end)&&end>begin&&end-begin<=5001
   &&c.payload?.messaging_type==='RESPONSE'&&c.payload?.recipient?.id===c.psid&&typeof m?.text==='string'&&m.text.length>0&&m.text.length<=2000
   &&m.metadata==='VPT_SURVEY_OUTCOME_V1:'+c.attemptId
   &&Object.keys(c.payload).every(k=>['recipient','messaging_type','message'].includes(k))
   &&Object.keys(m).every(k=>['text','metadata'].includes(k));
 }
 async function dispatch(page,proposal,credential){
  const started=monotonic();
  const c=await rpc('crm_survey_outcome_claim',{p_page:page,p_outcome:proposal,p_worker:workerId,
   p_credential:createHash('sha256').update(credential.access_token,'utf8').digest('hex')});
  if(c.status!=='CLAIMED')return;
  if(!validClaim(c,page,credential.default_company_id)||c.outcomeId!==proposal){onError('SURVEY_CLAIM_INVALID');return;}
  if(!sendEnabled(page)){await record(c.attemptId,{status:'UNCERTAIN',reason:'WORKER_STOPPED'});return;}
  if(now()<Date.parse(c.authorizedAt)-1000||now()>=Date.parse(c.sendBefore)-100
   ||monotonic()-started>=Date.parse(c.sendBefore)-Date.parse(c.authorizedAt)-100){
   await record(c.attemptId,{status:'UNCERTAIN',reason:'SEND_AUTHORITY_EXPIRED'});return;
  }
  let result;
  try{
   const response=await fetchImpl(`https://graph.facebook.com/${c.graphVersion}/${page}/messages`,{
    method:'POST',headers:{Authorization:'Bearer '+credential.access_token,'Content-Type':'application/json'},
    body:JSON.stringify(c.payload),redirect:'error',signal:AbortSignal.timeout(10000),
   });
   const ack=await response.json();
   if(!response.ok||typeof ack?.recipient_id!=='string'||typeof ack?.message_id!=='string'||!ack.message_id.length||ack.message_id.length>300)throw fail('INVALID_PROVIDER_ACK');
   // Recipient disagreement is persisted as a conflict, never success.
   result={status:'ACK',recipientId:ack.recipient_id,messageId:ack.message_id};
  }catch{result={status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'};}
  await record(c.attemptId,result);
 }
 async function drainOnce(){
  if(!receiveEnabled())return;
   for(const page of carePages(env)){
    if(!receiveEnabled())break;
    try{
     await rpc('crm_survey_outcome_recover',{p_page:page,p_limit:10});
     if(!sendEnabled(page))continue;
     const {data:credential,error}=await db.from('facebook_pages').select('page_id,default_company_id,is_active,access_token').eq('page_id',page).maybeSingle();
     if(error||credential?.page_id!==page||credential.is_active!==true||!uuid(credential.default_company_id)
      ||typeof credential.access_token!=='string'||!credential.access_token.trim())throw fail('SURVEY_PAGE_CREDENTIAL_UNAVAILABLE');
     if(!sendEnabled(page))break;
     const candidates=await rpc('crm_survey_outcome_candidates',{p_page:page,p_limit:10});
     if(!Array.isArray(candidates)||candidates.length>10||candidates.some(id=>!uuid(id)))throw fail('SURVEY_CANDIDATES_INVALID');
     for(const proposal of candidates){if(!sendEnabled(page))break;await dispatch(page,proposal,credential);}
    }catch{onError('SURVEY_OUTCOME_UNAVAILABLE');}
   }
 }
 return lifecycle;
}
module.exports={createSurveyOutcomeDispatch};
