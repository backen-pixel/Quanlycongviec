'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scope=require('../src/helpers/facebookLegacyCreationScope');
const checked=require('../src/helpers/facebookLegacyContactWrites');
const phone=require('../src/helpers/facebookPhoneExtract');
const {assertLegacyFacebookWriteAllowed}=require('../src/helpers/facebookLegacyWriteScope');
const {userSeesAllCrmLeadsForScope,userSeesAllCrmDealsForScope}=require('../src/helpers/crmAccessRoles');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids={company:id(1),other:id(2),tenant:id(3),owner:id(4),actor:id(5),region:id(6),pipeline:id(7),stage:id(8),source:id(9),contact:id(10),customer:id(11),lead:id(12)};
const copy=x=>JSON.parse(JSON.stringify(x));
function database() {
 const i=ids,tables={
  tenants:[{id:i.tenant,is_active:true}],companies:[{id:i.company,tenant_id:i.tenant,is_active:true},{id:i.other,tenant_id:i.tenant,is_active:true}],
  users:[{id:i.owner,company_id:i.company,tenant_id:i.tenant,role:'sales',is_active:true},{id:i.actor,company_id:i.company,tenant_id:i.tenant,role:'admin',is_active:true}],
  company_regions:[{id:i.region,company_id:i.company,is_active:true}],user_company_regions:[{user_id:i.owner,region_id:i.region}],
  facebook_pages:[{page_id:'123',default_company_id:i.company,is_active:true,page_name:'Synthetic Page',default_lead_owner_id:i.owner,created_by:i.owner,
   default_region_id:i.region,default_module_key:'crm',default_target_type:'lead',default_pipeline_id:i.pipeline,default_stage_id:i.stage,default_source_id:i.source}],
  crm_pipelines:[{id:i.pipeline,company_id:i.company,is_active:true}],crm_pipeline_stages:[{id:i.stage,pipeline_id:i.pipeline,pipeline_type:'lead',is_active:true}],
  crm_sources:[{id:i.source,company_id:i.company,name:'[FB:123] Synthetic Page',is_active:true}],
  facebook_contacts:[{id:i.contact,page_id:'123',psid:'456',lead_id:null,customer_id:null,fb_name:'Synthetic customer',phone:'0901234567'}],
  customers:[],crm_leads:[],facebook_messages:[],notifications:[],crm_lead_types:[],production_pipeline_stages:[],app_settings:[],
 };
 let next=1000;const db={tables,reads:[],writes:[],requests:[],before:null,fail:null,allow:()=>true,
  async rpc(name,{p_scope}){return{data:{policy:'CARE_LEGACY_WRITE_CHECK_V1',scope:p_scope,allowed:db.allow(p_scope),reason:db.allow(p_scope)?'LEGACY_SCOPE':'MANAGED_PAGE',observedAt:new Date().toISOString(),reservationMade:false}};},
  from(table){
   const item={table,action:'read',filters:[],payload:null,columns:'*'};let single=false,maximum=Infinity,countRequested=false;
   const q={select(columns='*',options={}){item.columns=columns;countRequested=options.count==='exact';return q;},eq(k,v){item.filters.push([k,'eq',v]);return q;},neq(k,v){item.filters.push([k,'neq',v]);return q;},
    is(k,v){item.filters.push([k,'is',v]);return q;},not(k,op,v){if(op!=='is')throw Error(op);item.filters.push([k,'not',v]);return q;},
    ilike(k,v){item.filters.push([k,'ilike',v]);return q;},like(k,v){return q.ilike(k,v);},in(k,v){item.filters.push([k,'in',v]);return q;},
    order(){return q;},limit(n){maximum=n;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},
    insert(payload){item.action='insert';item.payload=payload;return q;},update(payload){item.action='update';item.payload=payload;return q;},
    then(resolve,reject){return(async()=>{
     db.requests.push(copy(item));await db.before?.(item);
     if(db.fail?.(item))return{error:{message:'synthetic unavailable',code:'XX000'}};
     const rows=tables[table];if(!rows)throw Error('Unexpected table '+table);
     const matches=row=>item.filters.every(([k,op,v])=>{
      if(op==='eq')return row[k]===v;if(op==='neq')return row[k]!=null&&row[k]!==v;if(op==='is')return(row[k]??null)===v;
      if(op==='not')return(row[k]??null)!==v;if(op==='in')return v.includes(row[k]);
      const pattern=String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*');return new RegExp('^'+pattern+'$','i').test(String(row[k]||''));
     });
     let result;
     if(item.action==='read'){db.reads.push(copy(item));result=rows.filter(matches).slice(0,maximum);}
     else{db.writes.push(copy(item));if(item.action==='insert'){const row={id:id(next++),...copy(item.payload)};rows.push(row);result=[row];}
      else{result=rows.filter(matches);for(const row of result)Object.assign(row,copy(item.payload));}}
     return{data:copy(single?(result[0]||null):result),...(countRequested?{count:rows.filter(matches).length}:{})};
    })().then(resolve,reject);},
   };return q;
  },
 };
 return db;
}
const text=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8');
function harness(db,{atomic=false,user=null}={}) {
 const claims=user||{userId:ids.actor,role:'admin',company_id:ids.company,tenant_id:ids.tenant,crm_region_ids:[]};
 let manual;const effects=[];const context={...scope,...checked,...phone,supabase:db,console:{log(){},warn(){},error(){}},process:{env:{}},
  assertLegacyFacebookWriteAllowed:(connection,requested)=>assertLegacyFacebookWriteAllowed(connection,requested,{isPrimary:()=>true}),
  loadAutoLeadConfig:async()=>({default_company_id:ids.other}),getPageConfig:async()=>{throw Error('Creator must read current Page');},
  resolveFacebookModuleKeyForPage:p=>p.default_module_key,resolveFacebookCreateType:p=>p.default_target_type,
  DURABLE_MESSENGER_PAGES:new Set(atomic?['123']:[]),isFacebookAtomicLeadScope:()=>atomic,
  isPhoneBlockedForFacebookAutoLead:async()=>false,hasSyncPausedColumnSync:()=>false,
  ganLeadVaoQuyKet:async(...args)=>effects.push({type:'attribution',args}),linkMessengerAttribution:async()=>effects.push({type:'attribution'}),
  require:name=>{if(name!=='../helpers/autoGenCrmTasks')throw Error(name);return{autoGenCrmTasksForNewLead:async()=>0};},
  resolveFacebookPageScope:async()=>({}),contactAllowedByFacebookScope:()=>true,authMiddleware(){},
  r:{post(url,...handlers){manual=handlers.at(-1);},_app:null},
  axios:{post:async(url,payload)=>{effects.push({type:'crm',url,payload});const type=url.endsWith('/deals')?'deal':'lead';
   // Use the same assignment policy as leadLifecycle. The transport is synthetic.
   const canAssign=type==='lead'?userSeesAllCrmLeadsForScope(claims):userSeesAllCrmDealsForScope(claims);
   const assigned=canAssign?payload.assigned_to:claims.userId;
   return db.from('crm_leads').insert({type,...payload,assigned_to:assigned,lead_owner_id:assigned}).select().single();}},
  createFacebookLeadOnce:async(_db,{existingLeadId,leadData})=>{effects.push({type:'atomic'});if(existingLeadId)return{lead:{id:existingLeadId}};
   const r=await db.from('crm_leads').insert(leadData).select().single();db.tables.facebook_contacts[0].lead_id=r.data.id;return{lead:r.data,created:true};},
 };
 vm.runInNewContext(text.slice(text.indexOf('async function resolveFacebookCrmPipelineAndStage('),text.indexOf('async function getPageConfig(')),context);
 vm.runInNewContext(text.slice(text.indexOf('async function fetchContactLeadId('),text.indexOf('async function createLeadFromFacebook('))+
  '\n'+text.slice(text.indexOf('async function createLeadFromFacebookInner('),text.indexOf('async function sendMessengerReply(')),context);
 context.resolveFacebookSourceId=(page,options)=>scope.resolveScopedFacebookSource(db,page,options);
 vm.runInNewContext(text.slice(text.indexOf("r.post('/contacts/:id/create-lead'"),text.indexOf("r.post('/contacts/:id/reconcile-inbound-phone'")),context);
 return{effects,auto:(input={id:ids.contact},extra={})=>context.createLeadFromFacebookInner('123',input,'synthetic',extra),
  manual:async(body={})=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
   await manual({params:{id:ids.contact},body,user:claims,headers:{}},res);return res;},context};
}
const load=db=>scope.loadFacebookCreationContext(db,{pageId:'123',contactId:ids.contact});
function existing(db,{mapped=true}={}){db.tables.customers.push({id:ids.customer,company_id:ids.company,phone:'0901234567'});
 db.tables.crm_leads.push({id:ids.lead,company_id:ids.company,customer_id:ids.customer,type:'lead'});
 if(mapped)Object.assign(db.tables.facebook_contacts[0],{lead_id:ids.lead,customer_id:ids.customer});}
module.exports={database,harness,load,existing,ids,id,scope};
