'use strict';
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const fail=()=>Object.assign(new Error('CARE_INFERENCE_UNAVAILABLE'),{code:'CARE_INFERENCE_UNAVAILABLE'});
const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<=999999999;

// Deliberately no fallback to the existing internal reporting bot's API key.
// No model default: an explicitly enrolled policy selects the approved model.
function createCareOpenAiInference({db,isPrimary,env=process.env,fetchImpl=globalThis.fetch,now=Date.now,monotonic=()=>performance.now(),authority='HUMAN'}){
 if (!['HUMAN','RUNTIME'].includes(authority)) throw new TypeError('Invalid inference authority');
 const runtimeScope=authorization=>authorization?.actorId===env.VPT_CARE_RUNTIME_PRINCIPAL
  &&authorization?.companyId===env.VPT_CARE_RUNTIME_COMPANY&&authorization?.grantId===env.VPT_CARE_RUNTIME_GRANT;
 const key=()=>env.VPT_CARE_ADVISOR_OPENAI_KEY;
 const available=()=>(authority==='HUMAN' ? env.VPT_CARE_ADVISOR_OPENAI==='1'&&env.VPT_CARE_ADVISOR_ADMIN==='1'
  &&env.VPT_CARE_ADVISOR_DRAFTS==='1' : env.VPT_CARE_RUNTIME==='1'&&env.VPT_CARE_RUNTIME_OPENAI==='1'
   &&[env.VPT_CARE_RUNTIME_PRINCIPAL,env.VPT_CARE_RUNTIME_COMPANY,env.VPT_CARE_RUNTIME_GRANT].every(uuid))&&isPrimary()===true&&uuid(env.VPT_CARE_ADVISOR_INFERENCE_POLICY)
  &&typeof key()==='string'&&key().length>=20&&key().length<=500&&!/\s/.test(key())&&typeof fetchImpl==='function';
 async function rpc(name,args){
  if(isPrimary()!==true)throw fail();const r=await db.rpc(name,args);if(r?.error||!r?.data)throw fail();return r.data;
 }
 async function boundedJson(response){
  const length=Number(response.headers?.get('content-length'));
  if(Number.isFinite(length)&&length>131072)throw fail();
  if(!response.body?.getReader)throw fail();const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw fail();chunks.push(Buffer.from(value));}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 const infer=async({instructions,input,schema,authorization,signal})=>{
  if(!available()||signal?.aborted||!signal||![authorization?.actorId,authorization?.companyId,authorization?.requestId,authorization?.capability].every(uuid))throw fail();
  if(authority==='RUNTIME'&&!runtimeScope(authorization))throw fail();
  if(typeof instructions!=='string'||!input||!schema)throw fail();
  const prepared=JSON.stringify({instructions,input,schema});if(Buffer.byteLength(prepared)>150000)throw fail();
  const credential=key(),policy=env.VPT_CARE_ADVISOR_INFERENCE_POLICY,start=monotonic();
  const claim=await rpc(authority==='RUNTIME'?'crm_care_runtime_inference_claim':'crm_care_inference_claim',{p_actor:authorization.actorId,p_company:authorization.companyId,
   p_request:authorization.requestId,p_advisor_capability:authorization.capability,p_policy:policy,
   p_credential:digest(credential),p_payload:digest(prepared),p_input_bytes:Buffer.byteLength(prepared),...(authority==='RUNTIME'?{p_grant:authorization.grantId}:{})});
  // No provider retry/recovery from a repeated or lost admission receipt.
  if(claim.invoke!==true||claim.requestId!==authorization.requestId||claim.companyId!==authorization.companyId
   ||claim.actorId!==authorization.actorId||claim.policyId!==policy||!uuid(claim.capability)
   ||typeof claim.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(claim.model)
   ||!Number.isInteger(claim.maxOutputTokens)||claim.maxOutputTokens<256||claim.maxOutputTokens>4096
   ||!Number.isInteger(claim.maxInputBytes)||claim.maxInputBytes<Buffer.byteLength(prepared)||claim.maxInputBytes>150000
   ||!Number.isInteger(claim.reservedVnd)||claim.reservedVnd<1)throw fail();
  const from=Date.parse(claim.authorizedAt),until=Date.parse(claim.dispatchBefore);
  async function record(receipt){
   // Only retry this idempotent receipt write, never admission or provider HTTP.
   // Keep the same capability and exact evidence even after stop/revocation;
   // SQL691 permits late accounting but rejects a conflicting terminal receipt.
   const args=Object.freeze({p_request:claim.requestId,p_capability:claim.capability,p_receipt:Object.freeze({...receipt})});
   const transient=e=>e?.code==null||e.code===''||['40001','40P01','55P03','57014','08000','08003','08006'].includes(e.code);
   for(let attempt=0;attempt<2;attempt++){
    if(isPrimary()!==true)throw fail();
    let response;
    try{response=await db.rpc('crm_care_inference_record',args);}
    catch(e){if(attempt===0&&transient(e))continue;throw fail();}
    if(response?.error){if(attempt===0&&transient(response.error))continue;throw fail();}
    if(!response?.data){if(attempt===0)continue;throw fail();}
    const ack=response.data;
    if(ack.requestId!==args.p_request||ack.state!==args.p_receipt.state||typeof ack.replayed!=='boolean')throw fail();
    return;
   }
   throw fail();
  }
  let notSent=null;
  if(!available()||key()!==credential||env.VPT_CARE_ADVISOR_INFERENCE_POLICY!==policy||(authority==='RUNTIME'&&!runtimeScope(authorization)))notSent='DISABLED';
  else if(signal.aborted)notSent='ABORTED';
  else if(!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>5001||now()<from-1000||now()>=until-100
   ||monotonic()-start>=until-from-100)notSent='ADMISSION_EXPIRED';
  if(notSent){await record({state:'NOT_SENT',reason:notSent});throw fail();}
  let body,httpOk;
  try{
   const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal,
    headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json','X-Client-Request-Id':authorization.requestId},
    body:JSON.stringify({model:claim.model,instructions,input:JSON.stringify(input),
     max_output_tokens:claim.maxOutputTokens,store:false,background:false,
     text:{format:{type:'json_schema',name:'vpt_care_selection',strict:true,schema}}})});
   httpOk=response.ok;body=await boundedJson(response);
  }catch{await record({state:'UNKNOWN',reason:'TRANSPORT_UNKNOWN'});throw fail();}
  const usage=body?.usage;
  if(!httpOk||!/^resp_[a-zA-Z0-9_-]{1,150}$/.test(body?.id||'')||body.model!==claim.model
   ||![usage?.input_tokens,usage?.output_tokens,usage?.total_tokens].every(integer)
   ||usage.total_tokens!==usage.input_tokens+usage.output_tokens||usage.output_tokens>claim.maxOutputTokens){
   await record({state:'UNKNOWN',reason:'USAGE_UNAVAILABLE'});throw fail();
  }
  await record({state:'USAGE_RECORDED',responseId:body.id,model:body.model,inputTokens:usage.input_tokens,
   outputTokens:usage.output_tokens,totalTokens:usage.total_tokens});
  if(signal.aborted||body.status!=='completed'||body.error!=null||body.incomplete_details!=null||!Array.isArray(body.output))throw fail();
  // Reasoning metadata can accompany one assistant message; tool calls, refusals,
  // multiple messages and non-text media are never interpreted as care commands.
  if(body.output.some(x=>!['reasoning','message'].includes(x?.type)))throw fail();
  const messages=body.output.filter(x=>x.type==='message');
  if(messages.length!==1||messages[0].role!=='assistant'||messages[0].status!=='completed'
   ||!Array.isArray(messages[0].content)||messages[0].content.length!==1
   ||messages[0].content[0].type!=='output_text'||typeof messages[0].content[0].text!=='string'
   ||Buffer.byteLength(messages[0].content[0].text)>12000)throw fail();
  try{return JSON.parse(messages[0].content[0].text);}catch{throw fail();}
 };
 infer.isAvailable=available;
 return infer;
}
module.exports={createCareOpenAiInference};
