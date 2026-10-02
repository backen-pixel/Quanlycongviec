'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function legacyCases(t,{db,peers,query,config,admin,sales,company,other,region,setup,commit,dropQueue}){
 // Upgrade the old fixture to migration42's full mapping and uniqueness shape.
 await db.query('ALTER TABLE facebook_lead_ads ADD COLUMN customer_id uuid; ALTER TABLE facebook_contacts ADD COLUMN customer_id uuid; ALTER TABLE facebook_contacts ADD UNIQUE(page_id,psid)');
 // Older regression cases deliberately left tombstones. NOT VALID preserves
 // those fixtures while enforcing migration42's FKs on all new legacy cases.
 await db.query(`ALTER TABLE facebook_lead_ads ADD FOREIGN KEY(lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL NOT VALID;
  ALTER TABLE facebook_lead_ads ADD FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL NOT VALID;
  ALTER TABLE facebook_contacts ADD FOREIGN KEY(lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL NOT VALID;
  ALTER TABLE facebook_contacts ADD FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL NOT VALID;`);
 const context=id=>query('marketing_fb_legacy_context',[admin,company,id]);
 const row=id=>db.query('SELECT to_jsonb(r) r FROM marketing_fb_lead_receipts r WHERE id=$1',[id]).then(x=>x.rows[0].r);
 const make=async()=>{
  await dropQueue();const item=await setup(),customer=randomUUID(),lead=randomUUID();
  await db.query("INSERT INTO customers(id,full_name,phone,email,company_id,assigned_to,source) VALUES($1,'Khách đã có','0901234567','legacy@example.com',$2,$3,'Facebook')",[customer,company,sales]);
  await db.query("INSERT INTO crm_leads(id,code,title,type,customer_id,company_id,region_id,assigned_to,lead_owner_id,created_by,pipeline_id,stage_id,source_id,lead_type_id,description,first_touch_time) VALUES($1,'OLD-LEAD','Giữ lịch sử','deal',$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,'Trao đổi cũ',clock_timestamp()-interval '180 days')",[lead,customer,company,region,sales,admin,config.pipelineId,config.stageId,config.sourceId,config.leadTypeId]);
  await db.query("INSERT INTO facebook_lead_ads(leadgen_id,page_id,form_id,processed,lead_id,customer_id) VALUES($1,'123','456',true,$2,$3)",[item.r.leadgen_id,lead,customer]);
  await db.query("INSERT INTO facebook_contacts(page_id,psid,lead_id,customer_id) VALUES('123',$1,$2,$3)",['leadad_'+item.r.leadgen_id,lead,customer]);
  assert.equal((await commit(item)).reason,'LEGACY_RECONCILIATION_REQUIRED');
  return{...item,lead,customer};
 };
 const proof=item=>({provider:'META_LEAD_ADS_V1',pageId:'123',formId:'456',leadgenId:item.r.leadgen_id,source:'PAID',accountId:'act_77',adId:'888',adsetId:'999',campaignId:'111',graphVersion:'v24.0',acquiredAt:new Date(Date.now()-180*86400000).toISOString(),fetchedAt:new Date().toISOString()});
 const propose=async(item,p=proof(item))=>{const c=await context(item.r.id);return query('marketing_fb_legacy_prepare',[admin,company,item.r.id,c.contextVersion,p,['phone']]);};
 const command=p=>({proposalId:p.proposalId,reason:'Reviewed the verified source and existing customer history'});
 const apply=(p,key=randomUUID(),client=peers[0],who=admin,cid=company,pages=['123'],cmd=command(p))=>query('marketing_fb_legacy_commit',[who,cid,key,cmd,pages],client);
 const count=table=>db.query('SELECT count(*)::int n FROM '+table).then(x=>x.rows[0].n);
 await t.test('legacy private evidence denies direct writes and public RPC execution',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);for(const table of ['marketing_fb_legacy_proposals','marketing_fb_legacy_events'])await assert.rejects(db.query('SELECT * FROM '+table),e=>e.code==='42501');if(role!=='service_role')await assert.rejects(query('marketing_fb_legacy_context',[admin,company,randomUUID()],db),e=>e.code==='42501');await db.query('RESET ROLE')}
 });
 await t.test('proposal is current and redacted; preview leaves the receipt and CRM unchanged',async()=>{
  const item=await make(),before=await row(item.r.id),p=await propose(item);assert.deepEqual(await row(item.r.id),before);assert.equal(p.target.leadId,item.lead);assert.equal(p.target.customerId,item.customer);assert.equal(p.sourceKind,'PAID');
  const text=JSON.stringify(p);for(const value of ['page-test-token','ad-test-token','0901234567','legacy@example.com'])assert.equal(text.includes(value),false);
  assert.ok(Date.parse(p.expiresAt)>Date.now());assert.ok(Date.parse(p.expiresAt)<=Date.now()+300000);
 });
 await t.test('concurrent same request atomically adopts the old CRM and records one audit, with no historical edits',async()=>{
  const item=await make(),p=await propose(item),key=randomUUID(),leads=await count('crm_leads'),customers=await count('customers'),events=await count('marketing_fb_legacy_events');
  const before=(await db.query('SELECT to_jsonb(l) l,to_jsonb(c) c FROM crm_leads l JOIN customers c ON c.id=l.customer_id WHERE l.id=$1',[item.lead])).rows[0];
  const results=await Promise.all([apply(p,key,peers[0]),apply(p,key,peers[1])]);assert.equal(results.filter(x=>x.replayed===false).length,1);assert.equal(results[0].leadId,item.lead);assert.equal(await count('crm_leads'),leads);assert.equal(await count('customers'),customers);assert.equal(await count('marketing_fb_legacy_events'),events+1);
  assert.deepEqual((await db.query('SELECT to_jsonb(l) l,to_jsonb(c) c FROM crm_leads l JOIN customers c ON c.id=l.customer_id WHERE l.id=$1',[item.lead])).rows[0],before);
  const saved=await row(item.r.id);assert.equal(saved.state,'DONE');assert.equal(saved.lead_id,item.lead);assert.equal(saved.customer_id,item.customer);
  const e=(await db.query('SELECT * FROM crm_lead_source_evidence WHERE receipt_id=$1',[item.r.id])).rows[0];assert.equal(e.routing.kind,'LEGACY_REVIEW_V1');assert.equal(e.routing.reviewedBy,admin);assert.equal(e.acquired_at.toISOString(),p.acquiredAt);
  await assert.rejects(apply(p,key,peers[0],admin,company,['123'],{...command(p),reason:'Different command is not an idempotent retry'}),e=>e.code==='23505');
 });
 await t.test('rollback/crash leaves old records and receipt pending, then retry adopts once',async()=>{
  const item=await make(),p=await propose(item),before=await row(item.r.id),key=randomUUID(),events=await count('marketing_fb_legacy_events');await peers[0].query('BEGIN');await apply(p,key);await peers[0].query('ROLLBACK');assert.deepEqual(await row(item.r.id),before);assert.equal(await count('marketing_fb_legacy_events'),events);assert.equal((await apply(p,key)).accepted,true);
 });
 await t.test('two independently prepared approvals cannot attach a source twice',async()=>{
  const item=await make(),a=await propose(item),b=await propose(item);const result=await Promise.allSettled([apply(a,randomUUID(),peers[0]),apply(b,randomUUID(),peers[1])]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.code,'40001');assert.equal((await db.query('SELECT count(*)::int n FROM crm_lead_source_evidence WHERE receipt_id=$1',[item.r.id])).rows[0].n,1);
 });
 await t.test('missing, partial, conflicting and foreign historical mappings cannot be proposed',async()=>{
  for(const variant of ['missing','partial','conflict','wrongPage','wrongForm','foreign']){const item=await make();
   if(variant==='missing')await db.query('DELETE FROM facebook_contacts WHERE psid=$1',['leadad_'+item.r.leadgen_id]);
   if(variant==='partial')await db.query('UPDATE facebook_lead_ads SET customer_id=NULL WHERE leadgen_id=$1',[item.r.leadgen_id]);
   if(variant==='conflict'){const otherItem=await make();await db.query('UPDATE facebook_contacts SET lead_id=$1 WHERE psid=$2',[otherItem.lead,'leadad_'+item.r.leadgen_id]);}
   if(variant==='wrongPage')await db.query("UPDATE facebook_lead_ads SET page_id='999' WHERE leadgen_id=$1",[item.r.leadgen_id]);
   if(variant==='wrongForm')await db.query("UPDATE facebook_lead_ads SET form_id='999' WHERE leadgen_id=$1",[item.r.leadgen_id]);
   if(variant==='foreign')await db.query('UPDATE customers SET company_id=$1 WHERE id=$2',[other,item.customer]);
   await assert.rejects(propose(item),e=>['40001','42501'].includes(e.code));assert.equal((await row(item.r.id)).state,'REVIEW');
  }
 });
 await t.test('changed contact, history, mapping and ABA edits invalidate prior review',async()=>{
  for(const variant of ['contact','history','legacyABA','crmABA']){const item=await make(),p=await propose(item);
   if(variant==='contact')await db.query("UPDATE customers SET phone='0901234568' WHERE id=$1",[item.customer]);
   if(variant==='history')await db.query("UPDATE crm_leads SET description='New customer requirements' WHERE id=$1",[item.lead]);
   if(variant==='legacyABA'){const otherItem=await make();await db.query('UPDATE facebook_contacts SET lead_id=$1 WHERE psid=$2',[otherItem.lead,'leadad_'+item.r.leadgen_id]);await db.query('UPDATE facebook_contacts SET lead_id=$1 WHERE psid=$2',[item.lead,'leadad_'+item.r.leadgen_id]);}
   if(variant==='crmABA'){await db.query("UPDATE customers SET phone='0901234568' WHERE id=$1",[item.customer]);await db.query("UPDATE customers SET phone='0901234567' WHERE id=$1",[item.customer]);}
   await assert.rejects(apply(p),e=>e.code==='40001');assert.equal((await row(item.r.id)).state,'REVIEW');
  }
 });
 await t.test('actor, scope, Page, owner membership and enablement are rechecked at commit',async()=>{
  for(const variant of ['actor','scope','page','membership','enablement']){const item=await make(),p=await propose(item);
   if(variant==='actor')await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
   if(variant==='page')await db.query("UPDATE facebook_pages SET default_company_id=$1 WHERE page_id='123'",[other]);
   if(variant==='membership')await db.query('DELETE FROM user_company_regions WHERE user_id=$1',[sales]);
   await assert.rejects(apply(p,randomUUID(),peers[0],admin,variant==='scope'?other:company,variant==='enablement'?[]:['123']),e=>['40001','42501'].includes(e.code));
   await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);await db.query("UPDATE facebook_pages SET default_company_id=$1 WHERE page_id='123'",[company]);await db.query('INSERT INTO user_company_regions VALUES($1,$2) ON CONFLICT DO NOTHING',[sales,region]);
  }
 });
 await t.test('another admin cannot use a proposal approved by a different actor',async()=>{
  const item=await make(),p=await propose(item),second=randomUUID();await db.query("INSERT INTO users SELECT $1,company_id,tenant_id,'admin',true FROM users WHERE id=$2",[second,admin]);await assert.rejects(apply(p,randomUUID(),peers[0],second),e=>e.code==='42501');
 });
 await t.test('wrong provider IDs, paid account, stale proof and unverified match fields fail preparation',async()=>{
  const item=await make(),ctx=await context(item.r.id);
  for(const patch of [{formId:'999'},{pageId:'999'},{leadgenId:'999'},{accountId:'act_88'},{fetchedAt:new Date(Date.now()-600000).toISOString()},{source:'ORGANIC'},{source:'OTHER'}])await assert.rejects(query('marketing_fb_legacy_prepare',[admin,company,item.r.id,ctx.contextVersion,{...proof(item),...patch},['phone']]),e=>e.code==='22023');
  for(const fields of [[],['phone','phone'],['arbitrary'],[null]])await assert.rejects(query('marketing_fb_legacy_prepare',[admin,company,item.r.id,ctx.contextVersion,proof(item),fields]),e=>e.code==='22023');
 });
 await t.test('organic adoption does not manufacture paid attribution',async()=>{
  const item=await make(),p=await propose(item,{...proof(item),source:'ORGANIC',accountId:null,adId:null,adsetId:null,campaignId:null});await apply(p);assert.equal((await db.query('SELECT source_kind FROM crm_lead_source_evidence WHERE receipt_id=$1',[item.r.id])).rows[0].source_kind,'ORGANIC');
 });
 await t.test('expiry while waiting for a locked CRM record rolls back source and receipt writes',async()=>{
  const item=await make(),p=await propose(item);await db.query("UPDATE marketing_fb_legacy_proposals SET expires_at=clock_timestamp()+interval '500 milliseconds' WHERE id=$1",[p.proposalId]);
  await db.query('BEGIN');await db.query('SELECT id FROM crm_leads WHERE id=$1 FOR UPDATE',[item.lead]);
  const pending=assert.rejects(apply(p),e=>e.code==='40001');await db.query('SELECT pg_sleep(0.7)');await db.query('COMMIT');await pending;
  assert.equal((await row(item.r.id)).state,'REVIEW');assert.equal((await db.query('SELECT count(*)::int n FROM crm_lead_source_evidence WHERE receipt_id=$1',[item.r.id])).rows[0].n,0);
 });
 await t.test('deleted CRM remains an exception and cannot be recreated by review or intake',async()=>{
  const item=await make(),p=await propose(item),n=await count('crm_leads');await db.query('DELETE FROM crm_leads WHERE id=$1',[item.lead]);await assert.rejects(apply(p),e=>e.code==='40001');assert.equal(await count('crm_leads'),n-1);assert.equal((await row(item.r.id)).state,'REVIEW');
 });
 await dropQueue();
};
