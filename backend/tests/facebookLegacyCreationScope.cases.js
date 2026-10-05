'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const scope=require('../src/helpers/facebookLegacyCreationScope');
module.exports=async(t,{db,peers,company,other,admin,sales,region,pipeline,stage,source})=>{
 await db.query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS page_name text,
  ADD COLUMN IF NOT EXISTS default_lead_owner_id uuid,ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS default_region_id uuid,ADD COLUMN IF NOT EXISTS default_module_key text,
  ADD COLUMN IF NOT EXISTS default_target_type text,ADD COLUMN IF NOT EXISTS default_pipeline_id uuid,
  ADD COLUMN IF NOT EXISTS default_stage_id uuid,ADD COLUMN IF NOT EXISTS default_source_id uuid,
  ADD COLUMN IF NOT EXISTS default_lead_type_id uuid;
  ALTER TABLE crm_sources ADD COLUMN IF NOT EXISTS name text;
  GRANT SELECT ON facebook_pages,facebook_contacts,crm_leads,customers,users,companies,tenants,
   crm_pipelines,crm_pipeline_stages,crm_sources,company_regions,user_company_regions,facebook_messages TO service_role;
  GRANT UPDATE ON facebook_pages,facebook_contacts TO service_role;`);
 const allowed={facebook_pages:null,facebook_contacts:null,crm_leads:null,customers:null,users:null,companies:null,tenants:null,
  crm_pipelines:null,crm_pipeline_stages:null,crm_sources:null,company_regions:null,user_company_regions:null,facebook_messages:null};
 const name=x=>{assert.match(x,/^[a-z_][a-z0-9_]*$/);return x;};
 const adapter={writes:[],before:null,from(table){assert.ok(Object.hasOwn(allowed,table));let columns='*',single=false,limit=null,payload=null;const filters=[];
  const q={select(s='*'){columns=s==='*'?s:s.split(',').map(x=>name(x.trim())).join(',');return q;},
   eq(k,v){filters.push([name(k),'=',v]);return q;},neq(k,v){filters.push([name(k),'<>',v]);return q;},
   is(k,v){assert.equal(v,null);filters.push([name(k),'IS NULL']);return q;},not(k,op,v){assert.equal(op,'is');assert.equal(v,null);filters.push([name(k),'IS NOT NULL']);return q;},
   ilike(k,v){filters.push([name(k),'ILIKE',v]);return q;},limit(n){assert.ok(Number.isInteger(n)&&n>0);limit=n;return q;},
   maybeSingle(){single=true;return q;},single(){single=true;return q;},update(p){payload=p;return q;},
   insert(){throw Error('PG creator checkpoint uses configured source; unexpected insert');},
   then(resolve,reject){return(async()=>{
    const params=[];const set=payload?Object.entries(payload).map(([k,v])=>{params.push(v);return`${name(k)}=$${params.length}`;}).join(','):null;
    const where=filters.map(([k,op,v])=>{if(op.startsWith('IS'))return`${k} ${op}`;params.push(v);return`${k} ${op} $${params.length}`;}).join(' AND ');
    assert.ok(where);if(payload)adapter.writes.push({table,payload});await adapter.before?.({table,payload});
    try{const r=await peers[0].query(payload?`UPDATE ${table} SET ${set} WHERE ${where} RETURNING ${columns}`:
     `SELECT ${columns} FROM ${table} WHERE ${where}${limit?' LIMIT '+limit:''}`,params);return{data:single?(r.rows[0]||null):r.rows};}catch(error){return{error};}
   })().then(resolve,reject);}
  };return q;
 }};
 const fixture=async()=>{const pageId=String(880000000000000+Math.floor(Math.random()*100000000)),contactId=randomUUID(),customerId=randomUUID(),leadId=randomUUID();
  await db.query(`INSERT INTO facebook_pages(page_id,default_company_id,is_active,page_name,default_lead_owner_id,created_by,default_region_id,
   default_module_key,default_target_type,default_pipeline_id,default_stage_id,default_source_id)
   VALUES($1,$2,true,'Synthetic creator Page',$3,$4,$5,'crm','lead',$6,$7,$8)`,[pageId,company,sales,admin,region,pipeline,stage,source]);
  await db.query('INSERT INTO facebook_contacts(id,page_id,psid) VALUES($1,$2,$3)',[contactId,pageId,randomUUID()]);
  await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic creator customer','0901234999',$2)",[customerId,company]);
  await db.query("INSERT INTO crm_leads(id,title,type,company_id,customer_id) VALUES($1,'Synthetic creator lead','lead',$2,$3)",[leadId,company,customerId]);
  return{pageId,contactId,customerId,leadId};};
 const context=f=>scope.loadFacebookCreationContext(adapter,f);
 await t.test('legacy creator PostgreSQL context rejects current Page transfer and caller company override',async()=>{
  const f=await fixture(),c=await context(f);await assert.rejects(scope.loadFacebookCreationContext(adapter,{...f,requestedCompanyId:other}),{status:409});
  await db.query('UPDATE facebook_pages SET default_company_id=$2 WHERE page_id=$1',[f.pageId,other]);
  await assert.rejects(scope.assertFacebookCreationTargets(adapter,c,{leadId:f.leadId}),{status:409});
 });
 await t.test('legacy creator PostgreSQL target validation rejects foreign Customer and wrong Lead type',async()=>{
  const f=await fixture(),c=await context(f);await scope.assertFacebookCreationTargets(adapter,c,{leadId:f.leadId,createType:'lead'});
  await db.query('UPDATE customers SET company_id=$2 WHERE id=$1',[f.customerId,other]);await assert.rejects(scope.assertFacebookCreationTargets(adapter,c,{leadId:f.leadId}),{status:409});
  await db.query('UPDATE customers SET company_id=$2 WHERE id=$1',[f.customerId,company]);await db.query("UPDATE crm_leads SET type='deal' WHERE id=$1",[f.leadId]);
  await assert.rejects(scope.assertFacebookCreationTargets(adapter,c,{leadId:f.leadId,createType:'lead'}),{status:409});
 });
 await t.test('legacy creator PostgreSQL recipient membership revocation blocks assignment',async()=>{
  const f=await fixture(),c=await context(f);assert.equal(await scope.assertFacebookCreationAssignment(adapter,c,sales),region);
  await db.query('DELETE FROM user_company_regions WHERE user_id=$1 AND region_id=$2',[sales,region]);
  try{await assert.rejects(scope.assertFacebookCreationAssignment(adapter,c,sales),{status:409});}
  finally{await db.query('INSERT INTO user_company_regions(user_id,region_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[sales,region]);}
 });
 await t.test('legacy creator PostgreSQL current actor overrides cached admin claim',async()=>{
  const f=await fixture(),c=await context(f),req={user:{userId:admin,role:'admin',company_id:company,tenant_id:c.tenantId}};await scope.assertFacebookCreationActor(adapter,c,req);
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{await assert.rejects(scope.assertFacebookCreationActor(adapter,c,req),{status:409});}finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
 });
 await t.test('legacy creator PostgreSQL configured foreign source is never reassigned',async()=>{
  const f=await fixture(),c=await context(f),foreign=randomUUID();await db.query('INSERT INTO crm_sources(id,company_id,is_active) VALUES($1,$2,true)',[foreign,other]);
  await db.query('UPDATE facebook_pages SET default_source_id=$2 WHERE page_id=$1',[f.pageId,foreign]);
  await assert.rejects(scope.resolveScopedFacebookSource(adapter,c.page),{status:409});
  assert.equal((await db.query('SELECT company_id FROM crm_sources WHERE id=$1',[foreign])).rows[0].company_id,other);
 });
 await t.test('legacy creator PostgreSQL phone matching never selects foreign Customer',async()=>{
  const phone='0919876543',foreign=randomUUID();await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic foreign phone',$2,$3)",[foreign,phone,other]);
  assert.equal(await scope.findFacebookCreationCustomer(adapter,company,phone),null);
  const own=randomUUID();await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic own phone',$2,$3)",[own,phone,company]);
  assert.equal((await scope.findFacebookCreationCustomer(adapter,company,phone)).id,own);
 });
 await t.test('legacy creator PostgreSQL pipeline and stage must form a current pair',async()=>{
  const f=await fixture(),c=await context(f);await scope.assertFacebookCreationPipeline(adapter,c,{pipelineId:pipeline,stageId:stage,createType:'lead',moduleKey:'crm'});
  const wrong=randomUUID();await db.query("INSERT INTO crm_pipeline_stages(id,pipeline_id,is_active,pipeline_type) VALUES($1,$2,true,'deal')",[wrong,pipeline]);
  await assert.rejects(scope.assertFacebookCreationPipeline(adapter,c,{pipelineId:pipeline,stageId:wrong,createType:'lead',moduleKey:'crm'}),{status:409});
 });
 await t.test('legacy creator PostgreSQL failed read is unavailable rather than missing',async()=>{
  const f=await fixture(),c=await context(f);await db.query('REVOKE SELECT ON crm_leads FROM service_role');
  try{await assert.rejects(scope.assertFacebookCreationTargets(adapter,c,{leadId:f.leadId}),{status:503});}
  finally{await db.query('GRANT SELECT ON crm_leads TO service_role');}
 });
 await t.test('legacy creator PostgreSQL message history cannot be overwritten by another Lead',async()=>{
  const f=await fixture();await db.query("INSERT INTO facebook_messages(contact_id,lead_id,direction,content) VALUES($1,$2,'inbound','Synthetic historical conversation')",[f.contactId,f.leadId]);
  await scope.assertFacebookCreationMessageLinks(adapter,f.contactId,f.leadId);
  await assert.rejects(scope.assertFacebookCreationMessageLinks(adapter,f.contactId,randomUUID()),{status:409});
  await assert.rejects(scope.assertFacebookCreationMessageLinks(adapter,f.contactId),{status:409});
  assert.equal((await db.query('SELECT lead_id FROM facebook_messages WHERE contact_id=$1',[f.contactId])).rows[0].lead_id,f.leadId);
 });
 await t.test('legacy creator PostgreSQL contact CAS preserves a competing committed mapping',async()=>{
  const f=await fixture(),c=await context(f),competing=randomUUID();await db.query("INSERT INTO crm_leads(id,title,type,company_id) VALUES($1,'Synthetic competing lead','lead',$2)",[competing,company]);
  adapter.before=async({table,payload})=>{if(table==='facebook_contacts'&&payload){adapter.before=null;await peers[1].query('UPDATE facebook_contacts SET lead_id=$2 WHERE id=$1',[f.contactId,competing]);}};
  try{await assert.rejects(scope.writeFacebookCreationContact(adapter,c,{lead_id:f.leadId}),{status:409});}
  finally{adapter.before=null;}
  assert.equal((await db.query('SELECT lead_id FROM facebook_contacts WHERE id=$1',[f.contactId])).rows[0].lead_id,competing);
 });
};
