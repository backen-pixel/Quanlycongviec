'use strict';
const {randomUUID}=require('node:crypto');
const {readGraph}=require('./facebookLeadIntake');
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const fail=code=>Object.assign(new Error(code),{code});
const cursor=x=>typeof x==='string'&&x.length>0&&x.length<=2048&&!/[\r\n]/.test(x);

// Enumerate metadata only. Contact fields remain owned by the verified intake.
// Never follow provider-controlled URLs or forward tokens through a query string.
async function readCensusPage({context,version,fetchImpl=fetch}){
 const {pageId,formId,kind,after,pageToken}=context||{};
 if(!numeric(pageId)||!['FORMS','LEADS'].includes(kind)||(kind==='LEADS'&&!numeric(formId))||!/^v[0-9]{2,3}\.0$/.test(version||'')||typeof pageToken!=='string'||!pageToken||(after!==null&&after!==undefined&&!cursor(after)))throw fail('CENSUS_CONFIG');
 if(kind==='LEADS'){
  let form;try{form=await readGraph({id:formId,fields:'id,page_id',token:pageToken,version,fetchImpl});}catch{throw fail('CENSUS_PROVIDER_UNAVAILABLE');}
  if(form.page_id!==pageId)throw fail('CENSUS_SCOPE_MISMATCH');
 }
 const node=kind==='FORMS'?pageId:formId,edge=kind==='FORMS'?'leadgen_forms':'leads';
 const url=new URL(`https://graph.facebook.com/${version}/${node}/${edge}`);
 url.searchParams.set('fields',kind==='FORMS'?'id,page_id,status,created_time,expired_leads_count':'id,form_id,created_time');url.searchParams.set('limit','100');if(after)url.searchParams.set('after',after);
 let response,data;
 try{response=await fetchImpl(url.toString(),{headers:{Authorization:`Bearer ${pageToken}`},redirect:'error',signal:AbortSignal.timeout(15000)});data=await response.json();}catch{throw fail('CENSUS_PROVIDER_UNAVAILABLE');}
 if(!response.ok||data?.error||!Array.isArray(data?.data)||data.data.length>100)throw fail('CENSUS_PROVIDER_UNAVAILABLE');
 if(data.paging!==undefined&&(!data.paging||typeof data.paging!=='object'||Array.isArray(data.paging)))throw fail('CENSUS_PAGING_INVALID');
 let next=null;
 if(data.paging?.next!==undefined){
  if(typeof data.paging.next!=='string'||!cursor(data.paging?.cursors?.after))throw fail('CENSUS_PAGING_INVALID');
  let u;try{u=new URL(data.paging.next);}catch{throw fail('CENSUS_PAGING_INVALID');}
  if(u.origin!=='https://graph.facebook.com'||u.username||u.password||u.pathname!==url.pathname||u.searchParams.get('after')!==data.paging.cursors.after)throw fail('CENSUS_PAGING_INVALID');
  next=data.paging.cursors.after;if(next===after)throw fail('CENSUS_PAGING_LOOP');
 }
 const ids=new Set(),rows=data.data.map(x=>{
  if(!numeric(x?.id)||ids.has(x.id))throw fail('CENSUS_ROW_INVALID');ids.add(x.id);
  if(kind==='FORMS'){
   if(x.page_id!==pageId||!['ACTIVE','ARCHIVED','DELETED','DRAFT'].includes(x.status))throw fail('CENSUS_SCOPE_MISMATCH');
   if(x.expired_leads_count!==undefined&&(!Number.isSafeInteger(x.expired_leads_count)||x.expired_leads_count<0))throw fail('CENSUS_ROW_INVALID');
   return{id:x.id,status:x.status,expiredLeads:x.expired_leads_count??null};
  }
  if(x.form_id!==formId||typeof x.created_time!=='string'||!Number.isFinite(Date.parse(x.created_time)))throw fail('CENSUS_SCOPE_MISMATCH');
  return{id:x.id,acquiredAt:new Date(x.created_time).toISOString()};
 });
 return{rows,next,graphVersion:version};
}

function createLeadCensus({db,isPrimary,pages,env=process.env,readSource=readCensusPage,onError=()=>{}}){
 let busy=false;
 const enabled=()=>env.VPT_FB_LEAD_CENSUS==='1'&&env.VPT_FB_LEAD_INTAKE_WORKER_PAUSED!=='1'&&pages?.size>0;
 async function rpc(name,args){if(!enabled()||isPrimary()!==true)throw fail('CENSUS_DISABLED');const r=await db.rpc(name,args);if(r?.error||r?.data===null||r?.data===undefined)throw fail('CENSUS_STORAGE_UNAVAILABLE');return r.data;}
 async function drain(){
  if(busy||!enabled()||isPrimary()!==true)return;busy=true;
  try{for(let i=0;i<20;i++){
   if(!enabled()||isPrimary()!==true)break;
   const token=randomUUID(),rows=await rpc('marketing_fb_census_claim',{p_pages:[...pages],p_token:token});const task=Array.isArray(rows)?rows[0]:rows;if(!task)break;
   try{
    const context=await rpc('marketing_fb_census_context',{p_task:task.id,p_token:token});
    if(!enabled()||isPrimary()!==true)break;
    const result=await readSource({context,version:env.VPT_META_GRAPH_VERSION});
    await rpc('marketing_fb_census_commit',{p_task:task.id,p_token:token,p_chunk:result});
   }catch(e){const known=['CENSUS_CONFIG','CENSUS_PROVIDER_UNAVAILABLE','CENSUS_PAGING_INVALID','CENSUS_PAGING_LOOP','CENSUS_ROW_INVALID','CENSUS_SCOPE_MISMATCH'];const code=known.includes(e.code)?e.code:'CENSUS_STORAGE_UNAVAILABLE';try{await rpc('marketing_fb_census_fail',{p_task:task.id,p_token:token,p_code:code});}catch{/* lease expiry permits replay of the same cursor */}onError(code);}
  }}catch{onError('CENSUS_STORAGE_UNAVAILABLE');}finally{busy=false;}
 }
 return{drain};
}
module.exports={readCensusPage,createLeadCensus};
