'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const batch=require('../src/helpers/facebookLegacyBatch'),creation=require('../src/helpers/facebookLegacyCreationScope');
const {assertLegacyFacebookWriteAllowed}=require('../src/helpers/facebookLegacyWriteScope');
module.exports=async(t,{db,peers,company,other,admin,sales,region,pipeline,stage,source})=>{
 await db.query(`ALTER TABLE facebook_contacts ADD COLUMN IF NOT EXISTS fb_name text, ADD COLUMN IF NOT EXISTS sync_paused boolean;
  CREATE TABLE IF NOT EXISTS app_settings(key text PRIMARY KEY,value jsonb);
  GRANT SELECT ON app_settings TO service_role;
  GRANT UPDATE ON facebook_contacts,facebook_messages TO service_role;`);
 const allowed=new Set(['users','companies','tenants','facebook_pages','facebook_contacts','crm_leads','customers','company_regions','user_company_regions','facebook_messages','app_settings']);
 const name=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/);return value;};
 const adapter={writes:[],before:null,async rpc(rpcName,{p_scope}){
  assert.equal(rpcName,'crm_care_legacy_write_check');
  try{return{data:(await peers[0].query('SELECT public.crm_care_legacy_write_check($1::jsonb) value',[JSON.stringify(p_scope)])).rows[0].value};}
  catch(error){return{error};}
 },from(table){assert.ok(allowed.has(table));let columns='*',single=false,payload=null,limit=null,count=false,order='';const filters=[];
  const q={select(s='*',options={}){columns=s==='*'?s:s.split(',').map(x=>name(x.trim())).join(',');count=options.count==='exact';return q;},
   eq(k,v){filters.push([name(k),'=',v]);return q;},neq(k,v){filters.push([name(k),'<>',v]);return q;},
   is(k,v){assert.equal(v,null);filters.push([name(k),'IS NULL']);return q;},not(k,op,v){assert.equal(op,'is');assert.equal(v,null);filters.push([name(k),'IS NOT NULL']);return q;},
   in(k,v){filters.push([name(k),'IN',v]);return q;},order(k,{ascending=true}={}){order=' ORDER BY '+name(k)+(ascending?' ASC':' DESC');return q;},
   limit(n){assert.ok(Number.isInteger(n)&&n>0);limit=n;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},
   update(p){payload=p;return q;},then(resolve,reject){return(async()=>{
    const params=[],set=payload?Object.entries(payload).map(([k,v])=>{params.push(v);return name(k)+'=$'+params.length;}).join(','):null;
    const where=filters.map(([k,op,v])=>{if(op.startsWith('IS'))return k+' '+op;if(op==='IN')return k+' IN ('+v.map(value=>{params.push(value);return'$'+params.length;}).join(',')+')';
     params.push(v);return k+' '+op+' $'+params.length;}).join(' AND ');assert.ok(where);
    await adapter.before?.({table,payload,columns,count});if(payload)adapter.writes.push({table,payload});
    try{const result=await peers[0].query(payload?`UPDATE ${table} SET ${set} WHERE ${where} RETURNING ${columns}`:
     `SELECT ${count?'count(*)::int AS n':columns} FROM ${table} WHERE ${where}${count?'':order}${!count&&limit?' LIMIT '+limit:''}`,params);
     return count?{data:null,count:result.rows[0].n}:{data:single?(result.rows[0]||null):result.rows};}catch(error){return{error};}
   })().then(resolve,reject);}
  };return q;
 }};
 const tenant=(await db.query('SELECT tenant_id FROM companies WHERE id=$1',[company])).rows[0].tenant_id;
 const req=ids=>({user:{userId:admin,role:'admin',company_id:company,tenant_id:tenant},body:{company_id:company,contact_ids:ids}});
 const fixture=async()=>{const pageId=String(890000000000000+Math.floor(Math.random()*100000000)),contactId=randomUUID(),customerId=randomUUID(),leadId=randomUUID();
  await db.query(`INSERT INTO facebook_pages(page_id,default_company_id,is_active,page_name,default_lead_owner_id,created_by,default_region_id,
   default_module_key,default_target_type,default_pipeline_id,default_stage_id,default_source_id)
   VALUES($1,$2,true,'Synthetic batch Page',$3,$4,$5,'crm','lead',$6,$7,$8)`,[pageId,company,sales,admin,region,pipeline,stage,source]);
  await db.query("INSERT INTO facebook_contacts(id,page_id,psid,fb_name,phone) VALUES($1,$2,$3,'Synthetic batch contact',NULL)",[contactId,pageId,randomUUID()]);
  await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic batch customer','0901234999',$2)",[customerId,company]);
  await db.query("INSERT INTO crm_leads(id,title,type,company_id,customer_id,region_id,assigned_to,lead_owner_id) VALUES($1,'Synthetic batch lead','lead',$2,$3,$4,$5,$5)",[leadId,company,customerId,region,sales]);
  await db.query("INSERT INTO facebook_messages(contact_id,direction,content) VALUES($1,'inbound','Xin tư vấn 0901234999')",[contactId]);
  return{pageId,contactId,customerId,leadId};
 };
 const run=async(f,request=req([f.contactId]))=>batch.runFacebookLeadBatch(adapter,request,{
  checkWrite:(connection,scope)=>assertLegacyFacebookWriteAllowed(connection,scope,{isPrimary:()=>true}),
  createLead:async(pageId,contact,_source,_extra,options)=>{
   const context=await creation.loadFacebookCreationContext(adapter,{pageId,contactId:contact.id});
   const target=await creation.assertFacebookCreationTargets(adapter,context,{leadId:f.leadId,customerId:f.customerId});
   await options.authorize(context,target);
   await creation.writeFacebookCreationContact(adapter,context,{lead_id:f.leadId,customer_id:f.customerId});
   return{id:f.leadId};
  },
 });
 await t.test('legacy batch PostgreSQL explicit selection leaves unselected contact untouched',async()=>{
  const f=await fixture(),untouched=await fixture(),result=await run(f);assert.equal(result.status,200);assert.equal(result.body.processed,1);
  assert.equal((await db.query('SELECT lead_id FROM facebook_contacts WHERE id=$1',[untouched.contactId])).rows[0].lead_id,null);
  assert.equal((await db.query('SELECT lead_id FROM facebook_messages WHERE contact_id=$1',[f.contactId])).rows[0].lead_id,f.leadId);
 });
 await t.test('legacy batch PostgreSQL mixed company selection is rejected before the first write',async()=>{
  const f=await fixture(),foreign=await fixture();await db.query('UPDATE facebook_pages SET default_company_id=$2 WHERE page_id=$1',[foreign.pageId,other]);
  const before=adapter.writes.length;await assert.rejects(run(f,req([f.contactId,foreign.contactId])),{status:403});assert.equal(adapter.writes.length,before);
 });
 await t.test('legacy batch PostgreSQL inactive enrollment is still protected by actual SQL graph',async()=>{
  const f=await fixture();await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,false,$3,'Synthetic batch isolated test only')",[f.pageId,company,admin]);
  const before=adapter.writes.length;await assert.rejects(run(f),{status:409});assert.equal(adapter.writes.length,before);
 });
 await t.test('legacy batch PostgreSQL actor revoked after extraction cannot mutate or see details',async()=>{
  const f=await fixture(),before=adapter.writes.length;adapter.before=async q=>{if(q.columns==='content,direction,created_at'){adapter.before=null;await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);}};
  try{const result=await run(f);assert.notEqual(result.status,200);assert.equal(result.body.details_withheld,true);assert.deepEqual(result.body.results,[]);assert.equal(adapter.writes.length,before);}
  finally{adapter.before=null;await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
 });
 await t.test('legacy batch PostgreSQL changed contact input is held before mapping',async()=>{
  const f=await fixture(),before=adapter.writes.length;adapter.before=async q=>{if(q.columns==='content,direction,created_at'){adapter.before=null;await peers[1].query("UPDATE facebook_contacts SET phone='0909999999' WHERE id=$1",[f.contactId]);}};
  try{const result=await run(f);assert.equal(result.status,409);assert.equal(result.body.processed,0);assert.equal(adapter.writes.length,before);}
  finally{adapter.before=null;}
 });
 await t.test('legacy batch PostgreSQL retry repairs only NULL messages for an existing paused Lead',async()=>{
  const f=await fixture();await db.query('UPDATE facebook_contacts SET lead_id=$2,customer_id=$3,sync_paused=true WHERE id=$1',[f.contactId,f.leadId,f.customerId]);
  const result=await run(f);assert.equal(result.status,200);assert.equal(result.body.processed,1);
  assert.equal((await db.query('SELECT lead_id FROM facebook_messages WHERE contact_id=$1',[f.contactId])).rows[0].lead_id,f.leadId);
 });
 await t.test('legacy batch PostgreSQL message CAS keeps a competing committed Lead and reports conflict',async()=>{
  const f=await fixture(),competing=await fixture();adapter.before=async q=>{if(q.table==='facebook_messages'&&q.payload){adapter.before=null;await peers[1].query('UPDATE facebook_messages SET lead_id=$2 WHERE contact_id=$1',[f.contactId,competing.leadId]);}};
  try{const result=await run(f);assert.equal(result.status,409);assert.equal(result.body.processed,0);assert.equal(result.body.failed,1);
   assert.equal((await db.query('SELECT lead_id FROM facebook_messages WHERE contact_id=$1',[f.contactId])).rows[0].lead_id,competing.leadId);}
  finally{adapter.before=null;}
 });
 await t.test('legacy batch PostgreSQL phone CAS preserves a concurrently committed phone',async()=>{
  const f=await fixture();adapter.before=async q=>{if(q.table==='facebook_contacts'&&q.payload?.phone){adapter.before=null;await peers[1].query("UPDATE facebook_contacts SET phone='0908888888' WHERE id=$1",[f.contactId]);}};
  try{const result=await run(f);assert.equal(result.status,409);assert.equal(result.body.phone_updated,0);
   assert.equal((await db.query('SELECT phone FROM facebook_contacts WHERE id=$1',[f.contactId])).rows[0].phone,'0908888888');}
  finally{adapter.before=null;}
 });
 await t.test('legacy batch PostgreSQL denied message write returns partial error and can be repaired',async()=>{
  const f=await fixture();await db.query('REVOKE UPDATE ON facebook_messages FROM service_role');
  try{const result=await run(f);assert.equal(result.status,503);assert.equal(result.body.processed,0);assert.equal(result.body.reconciliation_required,true);}
  finally{await db.query('GRANT UPDATE ON facebook_messages TO service_role');}
  assert.equal((await run(f)).status,200);
 });
};
