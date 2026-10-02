'use strict';
const {createHmac,timingSafeEqual,createHash,randomUUID}=require('node:crypto');
const numeric=x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x);
const fail=code=>Object.assign(new Error(code),{code});
const pagesFromEnv=(env=process.env)=>new Set(String(env.VPT_FB_LEAD_INTAKE_PAGES||'').split(',').map(x=>x.trim()).filter(numeric));
function captureFacebookRawBody(req,_res,buffer){
 if(pagesFromEnv().size&&req.method==='POST'&&String(req.originalUrl||req.url||'').split('?')[0].replace(/\/+$/,'').toLowerCase()==='/api/facebook/webhook')req.facebookRawBody=Buffer.from(buffer);
}
function verifySignature(raw,signature,secret){
 if(!Buffer.isBuffer(raw)||typeof secret!=='string'||secret.length<16||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',secret).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
function extractLeadEvents(body,pages){
 if(body?.object!=='page')return [];
 if(!Array.isArray(body.entry)||body.entry.length>100)throw fail('INVALID_ENVELOPE');
 const rows=[];
 for(const entry of body.entry){
  if(!pages.has(String(entry?.id)))continue;
  if(entry.changes!==undefined&&!Array.isArray(entry.changes))throw fail('INVALID_ENVELOPE');
  for(const change of entry.changes||[]){
   if(change?.field!=='leadgen')continue;
   const v=change.value;
   if(!numeric(entry.id)||!numeric(v?.leadgen_id)||!numeric(v?.form_id)||(v.page_id!==undefined&&v.page_id!==entry.id))throw fail('INVALID_ENVELOPE');
   rows.push({pageId:entry.id,leadgenId:v.leadgen_id,formId:v.form_id});
   if(rows.length>100)throw fail('ENVELOPE_LIMIT');
  }
 }
 return rows;
}
async function readGraph({id,fields,token,version,fetchImpl=fetch}){
 if(!numeric(id)||typeof token!=='string'||!token||!/^v[0-9]{2,3}\.0$/.test(version||''))throw fail('SOURCE_CONFIG');
 const url=new URL(`https://graph.facebook.com/${version}/${id}`);url.searchParams.set('fields',fields);
 let response,data;
 try{response=await fetchImpl(url.toString(),{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});data=await response.json();}
 catch{throw fail('PROVIDER_UNAVAILABLE');}
 if(!response.ok||data?.error||!data||typeof data!=='object'||data.id!==id)throw fail('PROVIDER_UNAVAILABLE');
 return data;
}
function mapContact(fieldData,mapping){
 if(!Array.isArray(fieldData)||fieldData.length>100||!mapping||typeof mapping!=='object')throw fail('INVALID_PROVIDER_FIELDS');
 const byName=new Map();
 for(const f of fieldData){
  if(typeof f?.name!=='string'||!Array.isArray(f.values)||f.values.some(x=>typeof x!=='string'||x.length>4000)||byName.has(f.name))throw fail('INVALID_PROVIDER_FIELDS');
  byName.set(f.name,f.values);
 }
 const take=key=>{const values=byName.get(mapping[key]);if(!values)return '';if(values.length!==1)throw fail('AMBIGUOUS_CONTACT');return values[0].trim();};
 const contact={name:take('name'),phone:take('phone'),email:take('email'),request:take('request')};
 if(contact.name.length>200||contact.phone.length>60||contact.email.length>254||contact.request.length>4000)throw fail('INVALID_CONTACT');
 // Keep blank/unusable contact as pending quality; never manufacture a phone.
 return {...contact,name:contact.name||'Khách từ biểu mẫu Facebook'};
}
async function readVerifiedLead({receipt,context,version,fetchImpl=fetch,now=Date.now()}){
 const query=(id,fields,token)=>readGraph({id,fields,token,version,fetchImpl});
 const lead=await query(receipt.leadgen_id,'id,created_time,form_id,ad_id,adset_id,campaign_id,is_organic,field_data',context.pageToken);
 if(lead.form_id!==receipt.form_id||!Number.isFinite(Date.parse(lead.created_time))||Date.parse(lead.created_time)>now+300000)throw fail('PROVIDER_SCOPE_MISMATCH');
 const form=await query(receipt.form_id,'id,page_id',context.pageToken);
 if(form.page_id!==receipt.page_id)throw fail('PROVIDER_SCOPE_MISMATCH');
 let source='UNKNOWN',ad=null;
 if(lead.is_organic===true){if(lead.ad_id)throw fail('CONFLICTING_PAID_SOURCE');source='ORGANIC';}
 else if(lead.is_organic===false&&numeric(lead.ad_id)){
  ad=await query(lead.ad_id,'id,account_id,adset_id,campaign_id',context.accountToken);
  if('act_'+ad.account_id!==context.accountId||!numeric(ad.adset_id)||!numeric(ad.campaign_id)
    ||(lead.adset_id&&lead.adset_id!==ad.adset_id)||(lead.campaign_id&&lead.campaign_id!==ad.campaign_id))throw fail('PROVIDER_SCOPE_MISMATCH');
  source='PAID';
 }
 const proof={provider:'META_LEAD_ADS_V1',pageId:receipt.page_id,formId:receipt.form_id,leadgenId:receipt.leadgen_id,
  acquiredAt:new Date(lead.created_time).toISOString(),source,accountId:source==='PAID'?context.accountId:null,
  adId:ad?.id||null,adsetId:ad?.adset_id||null,campaignId:ad?.campaign_id||null,
  fetchedAt:new Date(now).toISOString(),graphVersion:version};
 return {proof,contact:mapContact(lead.field_data,context.fieldMap)};
}
function createLeadIntake({db,isPrimary,pages=pagesFromEnv(),secret=()=>process.env.VPT_FACEBOOK_APP_SECRET,version=()=>process.env.VPT_META_GRAPH_VERSION,readSource=readVerifiedLead,onError=()=>{}}){
 let draining=false;
 async function rpc(name,args){
  if(isPrimary()!==true)throw fail('PRIMARY_ONLY_REQUIRED');
  const r=await db.rpc(name,args);if(r?.error||r?.data===null||r?.data===undefined)throw fail('INTAKE_STORAGE_UNAVAILABLE');return r.data;
 }
 async function receive(req){
  if(!pages.size)return {enabled:false};
  if(!verifySignature(req.facebookRawBody,req.headers?.['x-hub-signature-256'],secret()))throw fail('INVALID_SIGNATURE');
  // Trust the bytes just authenticated, not a body another middleware modified.
  let body;try{body=JSON.parse(req.facebookRawBody.toString('utf8'));}catch{throw fail('INVALID_ENVELOPE');}
  req.body=body;
  const events=extractLeadEvents(body,pages);
  if(events.length)await rpc('marketing_fb_lead_enqueue',{p_events:events,p_delivery_hash:createHash('sha256').update(req.facebookRawBody).digest('hex')});
  return {enabled:true,accepted:events.length};
 }
 async function drain(){
  if(draining||!pages.size)return;draining=true;
  try{
   for(let i=0;i<20;i++){
    const token=randomUUID(),rows=await rpc('marketing_fb_lead_claim',{p_pages:[...pages],p_token:token});
    const receipt=Array.isArray(rows)?rows[0]:rows;if(!receipt)break;
    try{
     const context=await rpc('marketing_fb_lead_context',{p_id:receipt.id,p_token:token});
     const result=await readSource({receipt,context,version:version()});
     await rpc('crm_accept_facebook_lead',{p_id:receipt.id,p_token:token,p_context_version:context.contextVersion,p_proof:result.proof,p_contact:result.contact});
    }catch(e){
     const known=new Set(['SOURCE_CONFIG','PROVIDER_UNAVAILABLE','PROVIDER_SCOPE_MISMATCH','CONFLICTING_PAID_SOURCE','INVALID_PROVIDER_FIELDS','AMBIGUOUS_CONTACT','INVALID_CONTACT']);
     const code=known.has(e.code)?e.code:'INTAKE_PROCESSING_UNAVAILABLE';
     try{await rpc('marketing_fb_lead_retry',{p_id:receipt.id,p_token:token,p_code:code});}catch{/* leased receipt recovers after expiry */}
     onError(code);
    }
   }
  }catch{onError('INTAKE_STORAGE_UNAVAILABLE');}finally{draining=false;}
 }
 return {receive,drain,pages};
}
module.exports={pagesFromEnv,captureFacebookRawBody,verifySignature,extractLeadEvents,mapContact,readGraph,readVerifiedLead,createLeadIntake};
