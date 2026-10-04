'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {carePages}=require('./facebookCustomerCare');
const {createWorkerDrain}=require('../../helpers/workerDrain');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const fail=()=>new Error('CARE_ANSWER_DELIVERY_UNAVAILABLE');

// The model never calls this transport or supplies its payload. A separate
// private policy authorizes an immutable source-backed answer at claim time.
function createCareAnswerDispatch({db,isPrimary,env=process.env,fetchImpl=globalThis.fetch,workerId=randomUUID(),
 now=Date.now,monotonic=()=>performance.now(),onError=()=>{}}){
 if(!uuid(workerId))throw new TypeError('Invalid worker identity');
 const lifecycle=createWorkerDrain(drainOnce);
 const scope=()=>({principal:env.VPT_CARE_RUNTIME_PRINCIPAL,company:env.VPT_CARE_RUNTIME_COMPANY,
  grant:env.VPT_CARE_RUNTIME_GRANT,page:env.VPT_CARE_RUNTIME_PAGE,policy:env.VPT_CARE_RUNTIME_SEND_POLICY});
 const receive=s=>!lifecycle.isStopped()&&isPrimary()===true&&env.VPT_CARE_RUNTIME_ECHO==='1'
  &&uuid(s.company)&&numeric(s.page)&&carePages(env).has(s.page)&&Object.entries(s).every(([k,v])=>scope()[k]===v);
 const enabled=s=>receive(s)&&env.VPT_CARE_RUNTIME_SEND==='1'&&[s.principal,s.grant,s.policy].every(uuid);
 const base=s=>({p_principal:s.principal,p_company:s.company,p_grant:s.grant,p_policy:s.policy});
 const matches=(d,s)=>d?.companyId===s.company&&d.principalId===s.principal&&d.grantId===s.grant&&d.policyId===s.policy;
 const report=()=>{try{Promise.resolve(onError('CARE_ANSWER_DELIVERY_UNAVAILABLE')).catch(()=>{});}catch{}};
 async function rpc(name,args){if(isPrimary()!==true)throw fail();const r=await db.rpc(name,args);if(r?.error||r?.data==null)throw fail();return r.data;}
 async function record(attempt,result){
  // Retry persistence of the same evidence only. Never retry a provider POST.
  for(let i=0;i<3;i++)try{return await rpc('crm_care_send_result',{p_attempt:attempt,p_worker:workerId,p_result:result});}
  catch{if(isPrimary()!==true||i===2){report();return null;}}
 }
 function valid(c,s,request){
  const start=Date.parse(c.authorizedAt),end=Date.parse(c.sendBefore),p=c.payload,m=p?.message;
  return matches(c,s)&&c.requestId===request&&uuid(c.attemptId)&&c.pageId===s.page&&numeric(c.psid)&&c.psid!==s.page
   &&numeric(c.appId)&&/^v[0-9]{1,3}\.0$/.test(c.graphVersion||'')&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=5001
   &&exact(p,['recipient','messaging_type','message'])&&exact(p.recipient,['id'])&&p.recipient.id===c.psid&&p.messaging_type==='RESPONSE'
   &&exact(m,['text','metadata'])&&typeof m.text==='string'&&m.text.length>0&&m.text.length<=2000&&m.metadata==='VPT_CARE_SEND_V1:'+c.attemptId;
 }
 async function ackBody(response){
  if(!response.ok||!response.body?.getReader)throw fail();
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
    if(bytes>16384)throw fail();chunks.push(Buffer.from(part.value));}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{await reader.cancel().catch(()=>{});}
 }
 async function dispatch(s,request,token){
  const started=monotonic();
  const c=await rpc('crm_care_send_claim',{...base(s),p_request:request,p_worker:workerId,p_credential:createHash('sha256').update(token).digest('hex')});
  if(c.status!=='CLAIMED')return;
  if(!valid(c,s,request))throw fail();
  if(!enabled(s)){await record(c.attemptId,{status:'UNCERTAIN',reason:'WORKER_STOPPED'});return;}
  if(now()<Date.parse(c.authorizedAt)-1000||now()>=Date.parse(c.sendBefore)-100
   ||monotonic()-started>=Date.parse(c.sendBefore)-Date.parse(c.authorizedAt)-100){
   await record(c.attemptId,{status:'UNCERTAIN',reason:'SEND_AUTHORITY_EXPIRED'});return;
  }
  let result;
  try{
   const res=await fetchImpl(`https://graph.facebook.com/${c.graphVersion}/${s.page}/messages`,{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(c.payload),
    redirect:'error',signal:AbortSignal.timeout(10000)});
   const ack=await ackBody(res);
   if(typeof ack?.recipient_id!=='string'||typeof ack?.message_id!=='string'||!ack.message_id.length||ack.message_id.length>300)throw fail();
   result={status:'ACK',recipientId:ack.recipient_id,messageId:ack.message_id};
  }catch{result={status:'UNCERTAIN',reason:'TRANSPORT_UNKNOWN'};}
  await record(c.attemptId,result);
 }
 async function drainOnce(){
  const s=scope();if(!receive(s))return;
  try{
   await rpc('crm_care_send_recover',{p_company:s.company,p_page:s.page});
   if(!enabled(s))return;
   const {data:c,error}=await db.from('facebook_pages').select('page_id,default_company_id,is_active,access_token').eq('page_id',s.page).maybeSingle();
   if(error||c?.page_id!==s.page||c.default_company_id!==s.company||c.is_active!==true||typeof c.access_token!=='string'||!c.access_token.trim())throw fail();
   if(!enabled(s))return;
   const d=await rpc('crm_care_send_candidates',base(s));
   if(!matches(d,s)||d.send!==false||!Array.isArray(d.items)||d.items.length>10||d.items.some(x=>!uuid(x))||new Set(d.items).size!==d.items.length)throw fail();
   for(const request of d.items){if(!enabled(s))break;await dispatch(s,request,c.access_token);}
  }catch{report();}
 }
 return lifecycle;
}
module.exports={createCareAnswerDispatch};
