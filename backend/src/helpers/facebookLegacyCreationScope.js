'use strict';
const { checkedLegacyFacebookResult, checkedLegacyFacebookRows } = require('./facebookLegacyContactWrites');
const { normalizePhoneForLeadCreation } = require('./facebookPhoneExtract');
const { userSeesAllCrmLeadsForScope, userSeesAllCrmDealsForScope, isCrmSystemAdminUser, isCrmCompanyAdminUser, isCrmSalesAdminUser } = require('./crmAccessRoles');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const conflict=()=>Object.assign(new Error('Cấu hình Page hoặc liên kết khách chưa đúng phạm vi. Đã dừng tạo hồ sơ để đối soát.'),{status:409,code:'FACEBOOK_CREATION_SCOPE_CONFLICT'});
async function row(query) {
  const {data}=await checkedLegacyFacebookResult(query);
  if(!data||Array.isArray(data)||typeof data!=='object')throw conflict();
  return data;
}
async function creationPage(db,pageId,expectedCompanyId=null) {
  const page=await row(db.from('facebook_pages').select('*').eq('page_id',String(pageId)).maybeSingle());
  if(String(page.page_id)!==String(pageId)||page.is_active!==true||!UUID.test(page.default_company_id||'')
    ||(expectedCompanyId&&page.default_company_id!==expectedCompanyId))throw conflict();
  return page;
}
async function loadFacebookCreationContext(db,{pageId,contactId,requestedCompanyId=null}) {
  const contact=await row(db.from('facebook_contacts').select('*').eq('id',contactId).maybeSingle());
  if(contact.id!==contactId||String(contact.page_id)!==String(pageId))throw conflict();
  const page=await creationPage(db,pageId);
  const companyId=page.default_company_id;
  if(requestedCompanyId&&String(requestedCompanyId).toLowerCase()!==companyId.toLowerCase())throw conflict();
  const company=await row(db.from('companies').select('id,tenant_id,is_active').eq('id',companyId).maybeSingle());
  if(company.id!==companyId||company.is_active!==true)throw conflict();
  if(company.tenant_id) {
    const tenant=await row(db.from('tenants').select('id,is_active').eq('id',company.tenant_id).maybeSingle());
    if(tenant.id!==company.tenant_id||tenant.is_active!==true)throw conflict();
  }
  return {page,contact,companyId,tenantId:company.tenant_id||null};
}
async function assertCurrentCompany(db,context) {
  const company=await row(db.from('companies').select('id,tenant_id,is_active').eq('id',context.companyId).maybeSingle());
  if(company.id!==context.companyId||company.is_active!==true||(company.tenant_id||null)!==context.tenantId)throw conflict();
  if(company.tenant_id) {
    const tenant=await row(db.from('tenants').select('id,is_active').eq('id',company.tenant_id).maybeSingle());
    if(tenant.id!==company.tenant_id||tenant.is_active!==true)throw conflict();
  }
}
async function assertFacebookCreationTargets(db,context,{leadId=null,customerId=null,createType=null,ownerId=null,regionId=undefined}={}) {
  // Refresh the Page owner for each discovered target; no display cache/global default.
  await creationPage(db,context.page.page_id,context.companyId);
  await assertCurrentCompany(db,context);
  const current=await row(db.from('facebook_contacts').select('id,page_id,lead_id,customer_id').eq('id',context.contact.id).maybeSingle());
  if(current.id!==context.contact.id||String(current.page_id)!==String(context.page.page_id))throw conflict();
  if(current.lead_id && current.lead_id!==leadId)throw conflict();
  if(current.customer_id && customerId && current.customer_id!==customerId)throw conflict();
  let lead=null;
  const customers=new Set([customerId,current.customer_id].filter(Boolean));
  if(leadId) {
    lead=await row(db.from('crm_leads').select('id,company_id,customer_id,type,assigned_to,lead_owner_id,region_id').eq('id',leadId).maybeSingle());
    if(lead.id!==leadId||lead.company_id!==context.companyId||(createType&&lead.type!==createType))throw conflict();
    if(customerId&&lead.customer_id!==customerId)throw conflict();
    if(current.customer_id&&lead.customer_id!==current.customer_id)throw conflict();
    if(ownerId&&(lead.assigned_to!==ownerId||lead.lead_owner_id!==ownerId))throw conflict();
    if(regionId!==undefined&&(lead.region_id||null)!==regionId)throw conflict();
    if(lead.customer_id)customers.add(lead.customer_id);
  }
  for(const id of customers) {
    const customer=await row(db.from('customers').select('id,company_id').eq('id',id).maybeSingle());
    if(customer.id!==id||customer.company_id!==context.companyId)throw conflict();
  }
  return lead;
}
async function assertFacebookCreationMessageLinks(db,contactId,leadId=null) {
  let query=db.from('facebook_messages').select('id,lead_id').eq('contact_id',contactId).not('lead_id','is',null);
  if(leadId)query=query.neq('lead_id',leadId);
  const {data}=await checkedLegacyFacebookRows(query.limit(1));
  if(data.length)throw conflict();
}
async function writeFacebookCreationContact(db,context,patch) {
  await creationPage(db,context.page.page_id,context.companyId);
  const current=await row(db.from('facebook_contacts').select('id,page_id,lead_id,customer_id').eq('id',context.contact.id).maybeSingle());
  if(String(current.page_id)!==String(context.page.page_id)
    ||(patch.lead_id&&current.lead_id&&patch.lead_id!==current.lead_id)
    ||(patch.customer_id&&current.customer_id&&patch.customer_id!==current.customer_id))throw conflict();
  let query=db.from('facebook_contacts').update(patch).eq('id',context.contact.id).eq('page_id',String(context.page.page_id));
  for(const key of ['lead_id','customer_id'])query=current[key]?query.eq(key,current[key]):query.is(key,null);
  const {data}=await checkedLegacyFacebookRows(query.select('id'));
  if(data.length!==1||data[0].id!==context.contact.id)throw conflict();
  Object.assign(context.contact,patch);
}
async function assertFacebookCreationAssignment(db,context,ownerId) {
  const currentPage=await creationPage(db,context.page.page_id,context.companyId);
  await assertCurrentCompany(db,context);
  for(const key of ['default_lead_owner_id','created_by','default_region_id','default_module_key','default_target_type','default_pipeline_id','default_stage_id','default_lead_type_id']) {
    if((currentPage[key]||null)!==(context.page[key]||null))throw conflict();
  }
  if(!UUID.test(ownerId||''))throw conflict();
  const owner=await row(db.from('users').select('id,company_id,tenant_id,is_active').eq('id',ownerId).maybeSingle());
  if(owner.id!==ownerId||owner.company_id!==context.companyId||owner.is_active!==true
    ||(owner.tenant_id||null)!==context.tenantId)throw conflict();
  const regionId=context.page.default_region_id;
  if(regionId) {
    const region=await row(db.from('company_regions').select('id,company_id,is_active').eq('id',regionId).maybeSingle());
    if(region.id!==regionId||region.company_id!==context.companyId||region.is_active!==true)throw conflict();
    const {data:membership}=await checkedLegacyFacebookRows(db.from('user_company_regions').select('region_id').eq('user_id',ownerId).eq('region_id',regionId));
    if(!membership.some(x=>x.region_id===regionId))throw conflict();
  }
  return regionId||null;
}
async function assertFacebookCreationActor(db,context,req,{ownerId=null,regionId=null,createType='lead'}={}) {
  await assertCurrentCompany(db,context);
  const id=req?.user?.userId||req?.user?.id;
  if(!UUID.test(id||''))throw conflict();
  const actor=await row(db.from('users').select('id,role,company_id,tenant_id,is_active').eq('id',id).maybeSingle());
  const role=String(actor.role||'').trim().toLowerCase();
  if(actor.id!==id||actor.is_active!==true||!role)throw conflict();
  // The legacy localhost CRM endpoint still consumes this JWT. Reject stale
  // claims instead of forwarding authority that current DB rows no longer grant.
  if(String(req.user.role||'').trim().toLowerCase()!==role
    ||(req.user.company_id||null)!==(actor.company_id||null)
    ||(req.user.tenant_id||null)!==(actor.tenant_id||null))throw conflict();
  if(role==='ecosystem_admin'||(role==='admin'&&!actor.company_id)) {
    if(!actor.tenant_id||actor.tenant_id!==context.tenantId)throw conflict();
  } else if(role!=='platform_admin'&&(actor.company_id!==context.companyId||(actor.tenant_id||null)!==context.tenantId))throw conflict();
  if(ownerId) {
    const canAssign=createType==='deal'?userSeesAllCrmDealsForScope(actor):userSeesAllCrmLeadsForScope(actor);
    if(!canAssign&&ownerId!==id)throw conflict();
    // A missing region lets the old CRM endpoint silently select a default.
    if(!regionId)throw conflict();
    if(!isCrmSystemAdminUser(actor)&&!isCrmCompanyAdminUser(actor)&&!isCrmSalesAdminUser(actor)) {
      const {data}=await checkedLegacyFacebookRows(db.from('user_company_regions').select('region_id').eq('user_id',id).eq('region_id',regionId));
      if(!data.some(x=>x.region_id===regionId))throw conflict();
      if(!Array.isArray(req.user.crm_region_ids)||!req.user.crm_region_ids.includes(regionId))throw conflict();
    }
  }
  return actor;
}
async function assertFacebookCreationPipeline(db,context,{pipelineId,stageId,createType,moduleKey}) {
  if(moduleKey==='production')return;
  if(!UUID.test(pipelineId||'')||!UUID.test(stageId||''))throw conflict();
  const pipeline=await row(db.from('crm_pipelines').select('id,company_id,is_active').eq('id',pipelineId).maybeSingle());
  const stage=await row(db.from('crm_pipeline_stages').select('id,pipeline_id,pipeline_type,is_active').eq('id',stageId).maybeSingle());
  if(pipeline.id!==pipelineId||pipeline.company_id!==context.companyId||pipeline.is_active!==true
    ||stage.id!==stageId||stage.pipeline_id!==pipelineId||stage.pipeline_type!==createType||stage.is_active!==true)throw conflict();
}
async function findFacebookCreationCustomer(db,companyId,phone) {
  const digits=String(phone||'').replace(/\D/g,'');
  if(digits.length<9)return null;
  const {data:rows}=await checkedLegacyFacebookRows(db.from('customers').select('id,company_id,phone')
    .eq('company_id',companyId).ilike('phone',`%${digits.slice(-9)}`).limit(2));
  if(rows.length>1||rows.some(x=>!UUID.test(x.id||'')||x.company_id!==companyId))throw conflict();
  // A shared suffix is only a candidate, never sufficient identity evidence.
  const expected=normalizePhoneForLeadCreation(phone).normalized;
  if(rows.length&&(!expected||normalizePhoneForLeadCreation(rows[0].phone).normalized!==expected))throw conflict();
  return rows[0]||null;
}
async function resolveScopedFacebookSource(db,inputPage,{beforeWrite}={}) {
  const page=await creationPage(db,inputPage?.page_id,inputPage?.default_company_id);
  const companyId=page.default_company_id;
  if(page.default_source_id) {
    const source=await row(db.from('crm_sources').select('id,company_id,is_active').eq('id',page.default_source_id).maybeSingle());
    if(source.id!==page.default_source_id||source.company_id!==companyId||source.is_active!==true)throw conflict();
    return source.id;
  }
  const canonicalName=`[FB:${page.page_id}] ${String(page.page_name||page.page_id).trim()}`;
  const {data:matches}=await checkedLegacyFacebookRows(db.from('crm_sources').select('id,company_id,is_active')
    .eq('company_id',companyId).eq('name',canonicalName).limit(2));
  if(matches.length>1||matches.some(x=>x.company_id!==companyId||x.is_active!==true))throw conflict();
  // Do not retag a source belonging to another company or a shared legacy name.
  if(!matches.length&&beforeWrite)await beforeWrite();
  const source=matches[0]||await row(db.from('crm_sources').insert({name:canonicalName,company_id:companyId,is_active:true}).select('id,company_id,is_active').single());
  if(!UUID.test(source.id||'')||source.company_id!==companyId)throw conflict();
  await creationPage(db,page.page_id,companyId);
  if(beforeWrite)await beforeWrite();
  // Compare-and-set: never replace a concurrent explicit Page configuration.
  const {data:updated}=await checkedLegacyFacebookRows(db.from('facebook_pages').update({default_source_id:source.id})
    .eq('page_id',String(page.page_id)).eq('default_company_id',companyId).is('default_source_id',null).select('page_id'));
  if(updated.length!==1) {
    const current=await creationPage(db,page.page_id,companyId);
    if(current.default_source_id!==source.id)throw conflict();
  }
  return source.id;
}
async function assertFacebookCreationSource(db,context,sourceId) {
  const page=await creationPage(db,context.page.page_id,context.companyId);
  if(page.default_source_id!==sourceId)throw conflict();
  const source=await row(db.from('crm_sources').select('id,company_id,is_active').eq('id',sourceId).maybeSingle());
  if(source.id!==sourceId||source.company_id!==context.companyId||source.is_active!==true)throw conflict();
}
module.exports={loadFacebookCreationContext,assertFacebookCreationTargets,assertFacebookCreationAssignment,
  assertFacebookCreationActor,assertFacebookCreationPipeline,assertFacebookCreationMessageLinks,writeFacebookCreationContact,
  assertFacebookCreationSource,findFacebookCreationCustomer,resolveScopedFacebookSource,facebookCreationScopeConflict:conflict};
