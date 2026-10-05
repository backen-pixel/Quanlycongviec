'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash,createHmac}=require('node:crypto');
const {createLeadIntake,readVerifiedLead}=require('../src/modules/marketingAutomation/facebookLeadIntake');
const {createCustomerCare}=require('../src/modules/marketingAutomation/facebookCustomerCare');
const sha=x=>createHash('sha256').update(x).digest('hex');
module.exports=async({db,peers,query,credential,model})=>{
 const company=randomUUID(),tenant=randomUUID(),admin=randomUUID(),sales=randomUUID(),region=randomUUID();
 const pipeline=randomUUID(),stage=randomUUID(),source=randomUUID(),kind=randomUUID(),product=randomUUID(),entry=randomUUID(),account='act_69877';
 await db.query('INSERT INTO tenants VALUES($1,true)',[tenant]);await db.query('INSERT INTO companies VALUES($1,$2,true)',[company,tenant]);
 await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) VALUES($1,$3,$4,'admin',true),($2,$3,$4,'sales',true)",[admin,sales,company,tenant]);
 await db.query('INSERT INTO company_regions(id,company_id,is_active) VALUES($1,$2,true)',[region,company]);
 await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[sales,region]);
 await db.query("INSERT INTO fb_ad_accounts(ad_account_id,company_id,bat,access_token) VALUES($1,$2,true,'synthetic')",[account,company]);
 await db.query('INSERT INTO crm_pipelines(id,company_id,is_active,region_id) VALUES($1,$2,true,$3)',[pipeline,company,region]);
 await db.query("INSERT INTO crm_pipeline_stages(id,pipeline_id,is_active,pipeline_type,is_won,is_lost) VALUES($1,$2,true,'lead',false,false)",[stage,pipeline]);
 await db.query('INSERT INTO crm_sources(id,company_id,is_active) VALUES($1,$2,true)',[source,company]);
 await db.query("INSERT INTO crm_lead_types(id,company_id,is_active,applies_to) VALUES($1,$2,true,'lead')",[kind,company]);
 await db.query("INSERT INTO products(id,company_id,name,status,cost_price,updated_at) VALUES($1,$2,'Journey synthetic kitchen','active',987654321,clock_timestamp())",[product,company]);
 await db.query("INSERT INTO crm_care_library_publishers(company_id,user_id,active,expires_at,approval_reference) VALUES($1,$2,true,clock_timestamp()+interval '1 day','Synthetic isolated journey publisher')",[company,admin]);
 const document={title:'Journey response',purpose:'ADVICE',question:'Tư vấn tủ bếp',answer:'Thông tin tủ bếp giả đã được duyệt cho kiểm thử.',
  sourceReference:'Synthetic product specification for integrated journey',productId:product,regionIds:[region],channels:['facebook'],validUntil:new Date(Date.now()+86400000).toISOString()};
 const saved=await query('crm_care_library_change',[admin,company,randomUUID(),{entryId:entry,action:'SAVE',expectedVersion:null,document,reason:'Synthetic source-backed content for journey'}]);
 await query('crm_care_library_change',[admin,company,randomUUID(),{entryId:entry,action:'APPROVE',expectedVersion:saved.entry.version,reason:'Synthetic explicit approval for journey'}]);
 const secret='synthetic-journey-intake-secret',day=new Date(Date.now()+7*3600000-86400000).toISOString().slice(0,10);
 let seq=6981000;
 const storage={rpc:async(name,args)=>{try{
  const values=Object.entries(args).map(([k,v])=>k==='p_events'?JSON.stringify(v):v);
  if(name==='marketing_fb_lead_claim')return{data:(await peers[0].query('SELECT * FROM marketing_fb_lead_claim($1,$2)',values)).rows};
  return{data:await query(name,values)};
 }catch(error){return{error};}}};
 const signed=(page,body)=>{const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:page,...body}]}));
  return{facebookRawBody:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}};};
 const fixture=async()=>{
  const page=String(++seq),form=String(++seq),leadgen=String(++seq),psid=String(++seq),phone='098'+String(seq).padStart(7,'0');
  await db.query("INSERT INTO facebook_pages(page_id,default_company_id,is_active,access_token) VALUES($1,$2,true,'synthetic')",[page,company]);
  await query('marketing_fb_lead_binding_set',[admin,company,randomUUID(),{pageId:page,formId:form,accountId:account,expectedRevision:0,active:true,
   approvalReference:'Synthetic isolated intake routing only',fieldMap:{name:'full_name',phone:'phone_number',request:'need'},
   regionId:region,ownerId:sales,pipelineId:pipeline,stageId:stage,sourceId:source,leadTypeId:kind}]);
  const errors=[],fetchImpl=async url=>{
   const id=new URL(url).pathname.split('/').at(-1),body=id===leadgen?{id,created_time:day+'T12:00:00+07:00',form_id:form,ad_id:'7',adset_id:'8',campaign_id:'9',is_organic:false,
    field_data:[{name:'full_name',values:['Synthetic journey customer']},{name:'phone_number',values:[phone]},{name:'need',values:['Tư vấn tủ bếp']}]}:
    id===form?{id,page_id:page}:id==='7'?{id,account_id:account.replace('act_',''),adset_id:'8',campaign_id:'9'}:null;
   assert.ok(body,'unexpected synthetic Graph resource');return new Response(JSON.stringify(body));
  };
  const intake=createLeadIntake({db:storage,isPrimary:()=>true,pages:new Set([page]),secret:()=>secret,version:()=> 'v24.0',
   readSource:args=>readVerifiedLead({...args,fetchImpl}),isPaused:()=>false,onError:e=>errors.push(e)});
  const request=signed(page,{changes:[{field:'leadgen',value:{leadgen_id:leadgen,form_id:form}}]});
  await intake.receive(request);await intake.drain();assert.deepEqual(errors,[]);
  const receipt=(await db.query('SELECT * FROM marketing_fb_lead_receipts WHERE leadgen_id=$1',[leadgen])).rows[0];
  assert.equal(receipt.state,'DONE');assert.equal(receipt.company_id,company);
  const lead=receipt.lead_id,customer=receipt.customer_id;
  const record=(await db.query('SELECT * FROM crm_leads WHERE id=$1',[lead])).rows[0];
  assert.equal(record.assigned_to,sales);assert.equal(record.region_id,region);assert.equal(record.customer_id,customer);
  const care=createCustomerCare({db:storage,isPrimary:()=>true,env:{VPT_FB_CARE_PAGES:page,VPT_FACEBOOK_APP_SECRET:secret}});
  const incoming=text=>({sender:{id:psid},recipient:{id:page},timestamp:Date.now(),message:{mid:randomUUID(),text}});
  const message=incoming('Tôi xác nhận yêu cầu tủ bếp, dự kiến 100 triệu trong ba tháng.');
  await care.receive(signed(page,{messaging:[message]}));
  const thread=(await db.query('SELECT id FROM crm_care_threads WHERE page_id=$1 AND psid=$2',[page,psid])).rows[0].id;
  assert.equal((await query('crm_care_read',[admin,company,thread])).target.routingReady,false);
  const evidence=(await db.query('SELECT id FROM crm_care_messages WHERE thread_id=$1 AND provider_mid=$2',[thread,message.message.mid])).rows[0].id;
  await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,true,$3,'Synthetic operator connection authority only')",[page,company,admin]);
  const view=await query('crm_care_connection_read',[admin,company,thread,lead]);
  await query('crm_care_connection_link',[admin,company,randomUUID(),{threadId:thread,leadId:lead,expectedVersion:view.version,evidenceMessageId:evidence,
   identityConfirmed:true,reason:'Synthetic operator checked this customer against the form and inbound message'}]);
  assert.equal((await query('crm_care_read',[admin,company,thread])).target.leadId,lead);
  return{page,form,psid,lead,customer,thread,evidence,intake,request,key:randomUUID()};
 };
 const enroll=async c=>{
  const g={agent:randomUUID(),id:randomUUID(),policy:randomUUID(),worker:randomUUID()};
  await db.query("INSERT INTO crm_care_control.runtime_principals(id,company_id,label,active,approval_reference) VALUES($1,$2,'Synthetic journey Agent',true,'Synthetic runtime enrollment only')",[g.agent,company]);
  await db.query("INSERT INTO crm_care_control.inference_policies(id,company_id,actor_id,provider,model,credential_sha256,approval_reference,starts_at,expires_at,active,max_calls,max_input_bytes,max_output_tokens,reserve_per_call_vnd,allowance_vnd) VALUES($1,$2,$3,'OPENAI_RESPONSES',$4,$5,'Synthetic journey inference budget',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day',true,10,150000,512,2000,20000)",[g.policy,company,g.agent,model,sha(credential)]);
  await db.query("INSERT INTO crm_care_control.runtime_grants(id,principal_id,company_id,page_id,delegated_by,inference_policy_id,active,starts_at,expires_at,approval_reference) VALUES($1,$2,$3,$4,$5,$6,true,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 day','Synthetic delegated runtime only')",[g.id,g.agent,company,c.page,admin,g.policy]);
  return g;
 };
 return{company,admin,sales,region,account,fixture,enroll};
};
