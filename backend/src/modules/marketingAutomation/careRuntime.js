'use strict';
const {randomUUID}=require('node:crypto');
const {createWorkerDrain}=require('../../helpers/workerDrain');
const {produceCareSelection}=require('./careAdvisor');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const fail=()=>new Error('CARE_RUNTIME_UNAVAILABLE');

// A runtime identity is not a user session or a Factory agent. DB enrollment
// independently authorizes each step; process flags alone grant no authority.
function createCareRuntime({db,isPrimary,infer,env=process.env,onError=()=>{},workerId=randomUUID(),timeoutMs=30000}){
 if(!uuid(workerId))throw new TypeError('Invalid worker identity');
 const lifecycle=createWorkerDrain(drainOnce);
 const scope=()=>({principal:env.VPT_CARE_RUNTIME_PRINCIPAL,company:env.VPT_CARE_RUNTIME_COMPANY,
  grant:env.VPT_CARE_RUNTIME_GRANT,page:env.VPT_CARE_RUNTIME_PAGE,policy:env.VPT_CARE_ADVISOR_INFERENCE_POLICY,
  survey:env.VPT_CARE_RUNTIME_SURVEY==='1',surveyPolicy:env.VPT_CARE_RUNTIME_SURVEY_POLICY});
 const enabled=s=>!lifecycle.isStopped()&&env.VPT_CARE_RUNTIME==='1'&&isPrimary()===true
  &&[s.principal,s.company,s.grant,s.policy].every(uuid)&&(!s.survey||uuid(s.surveyPolicy))&&numeric(s.page)&&typeof infer==='function'
  &&(infer.isAvailable===undefined||infer.isAvailable()===true)&&Object.entries(s).every(([k,v])=>scope()[k]===v);
 async function rpc(name,args){if(isPrimary()!==true)throw fail();const r=await db.rpc(name,args);if(r?.error||!r?.data)throw fail();return r.data;}
 const base=s=>({p_principal:s.principal,p_company:s.company,p_grant:s.grant});
 function checked(r,s,request,thread){
  if(!r||r.companyId!==s.company||r.principalId!==s.principal||r.grantId!==s.grant||r.send!==false
   ||(request&&r.requestId!==request)||(thread&&r.threadId!==thread))throw fail();return r;
 }
 const report=()=>{try{Promise.resolve(onError('CARE_RUNTIME_UNAVAILABLE')).catch(()=>{});}catch{}};
 async function drainOnce(){
  const s=scope();if(!enabled(s))return;
  let candidates;
  try{candidates=checked(await rpc('crm_care_runtime_candidates',{...base(s),p_page:s.page,p_limit:10}),s);
   if(candidates.pageId!==s.page||!Array.isArray(candidates.items)||candidates.items.length>10
    ||candidates.items.some(x=>!uuid(x))||new Set(candidates.items).size!==candidates.items.length)throw fail();
  }catch{report();return;}
  for(const thread of candidates.items){
   if(!enabled(s))break;
   try{
    const request=randomUUID();
    const begin=checked(await rpc(s.survey?'crm_care_runtime_begin_with_survey':'crm_care_runtime_begin',
     {...base(s),p_request:request,p_thread:thread,p_worker:workerId,...(s.survey?{p_survey_policy:s.surveyPolicy}:{})}),s,request,thread);
    if(begin.invoke===false)continue;
    if(begin.invoke!==true||!uuid(begin.capability)||begin.policyId!==s.policy||begin.context?.companyId!==s.company
     ||begin.context?.threadId!==thread||begin.state!=='RUNNING'||(!s.survey&&begin.context.surveyProposalAllowed===true))throw fail();
    const response=await produceCareSelection({context:begin.context,infer,timeoutMs,isEnabled:()=>enabled(s),
     authorization:{actorId:s.principal,companyId:s.company,grantId:s.grant,requestId:request,capability:begin.capability}});
    // Persist a terminal outcome even after local stop; the database rechecks
    // current delegation/consent. Never retry inference after a lost response.
    checked(await rpc('crm_care_runtime_finish',{...base(s),p_request:request,p_capability:begin.capability,p_response:response}),s,request,thread);
   }catch{report();}
  }
 }
 return lifecycle;
}
module.exports={createCareRuntime};
