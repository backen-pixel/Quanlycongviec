'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {projectReview}=require('../src/modules/crmLeadIdentity/review');
module.exports=async(t,{db,peers,company,other,admin,sales,region,tenant})=>{
 const rpc=(name,args,c=peers[0])=>c.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args).then(x=>x.rows[0].r);
 const snapshot=(who=admin,cid=company,c=peers[0])=>rpc('crm_identity_review_snapshot',[who,cid],c);
 const review=(cmd,key=randomUUID(),who=admin,cid=company,c=peers[0])=>rpc('crm_identity_review_record',[who,cid,key,cmd],c);
 const command=async(action,leadId,peerLeadId=null)=>({action,leadId,peerLeadId,snapshotToken:(await snapshot()).snapshotToken,evidence:'Verified synthetic customer identity and contact ownership for this isolated case.'});
 let sequence=100;
 const newLead=async(phone='090111'+String(sequence++).padStart(4,'0'))=>{const id=randomUUID(),customer=randomUUID();await db.query("INSERT INTO customers VALUES($1,$2,'Synthetic review customer',$3,NULL,'HCM','HCM')",[customer,company,phone]);await db.query("INSERT INTO crm_leads(id,company_id,customer_id,region_id,assigned_to,lead_owner_id,type,title) VALUES($1,$2,$3,$4,$5,$5,'lead','Synthetic review lead')",[id,company,customer,region,admin]);return{id,customer,phone};};
 const group=(s,id)=>projectReview(s).groups.find(g=>g.members.some(m=>m.leadId===id));
 const oldLink=async(a,b,c=peers[0])=>{const left=await rpc('crm_lead_identity_snapshot',[admin,company,a]),right=await rpc('crm_lead_identity_snapshot',[admin,company,b]);return rpc('crm_lead_identity_record',[admin,company,randomUUID(),{action:'LINK',leftLeadId:a,rightLeadId:b,leftToken:left.snapshotToken,rightToken:right.snapshotToken,evidence:'Legacy API explicit synthetic duplicate confirmation.'}],c)};
 const events=async()=>Number((await db.query('SELECT count(*) n FROM crm_identity_review_events')).rows[0].n);
 await t.test('review inventory denies public access and non-admin, wrong tenant/company',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM crm_identity_distinctions'),e=>e.code==='42501');if(role!=='service_role')await assert.rejects(snapshot(admin,company,db),e=>e.code==='42501');await db.query('RESET ROLE');}
  await assert.rejects(snapshot(sales),e=>e.code==='42501');await assert.rejects(snapshot(admin,other),e=>e.code==='42501');const unscoped=randomUUID();await db.query("INSERT INTO users VALUES($1,NULL,NULL,'admin',true)",[unscoped]);await assert.rejects(snapshot(unscoped),e=>e.code==='42501');
 });
 await t.test('actual complete company scan sees a new exact-contact Lead and changes its token',async()=>{
  const a=await newLead(),before=await snapshot();assert.equal(group(before,a.id).deduplicationComplete,true);const b=await newLead(a.phone),after=await snapshot();assert.notEqual(after.snapshotToken,before.snapshotToken);assert.equal(group(after,a.id).deduplicationComplete,false);assert.equal(group(after,b.id).deduplicationComplete,false);
 });
 await t.test('DISTINCT is evidence-bound, resolves shared contact and replay never creates another audit',async()=>{
  const a=await newLead(),b=await newLead(a.phone),cmd=await command('DISTINCT',a.id,b.id),key=randomUUID(),before=await events();const first=await review(cmd,key),second=await review(cmd,key);assert.equal(first.replayed,false);assert.equal(second.replayed,true);assert.equal(await events(),before+1);assert.equal(group(second.snapshot,a.id).deduplicationComplete,true);await assert.rejects(review({...cmd,evidence:'Changed evidence on already accepted request'},key),e=>e.code==='23505');
 });
 await t.test('DISTINCT blocks transitive LINK through the original651 API until explicitly revoked',async()=>{
  const a=await newLead(),b=await newLead(a.phone),c=await newLead(a.phone);await review(await command('DISTINCT',a.id,b.id));await oldLink(a.id,c.id);await assert.rejects(oldLink(b.id,c.id),e=>e.code==='40001');await review(await command('REVOKE_DISTINCT',a.id,b.id));await oldLink(b.id,c.id);assert.equal(group(await snapshot(),a.id).members.length,3);
 });
 await t.test('stale DISTINCT blocks LINK and needs fresh review after contact A-B-A',async()=>{
  const a=await newLead(),b=await newLead(a.phone);await review(await command('DISTINCT',a.id,b.id));await db.query("UPDATE customers SET phone='0909991234' WHERE id=$1",[a.customer]);await db.query('UPDATE customers SET phone=$2 WHERE id=$1',[a.customer,a.phone]);await assert.rejects(oldLink(a.id,b.id),e=>e.code==='40001');assert.equal(group(await snapshot(),a.id).deduplicationComplete,false);await review(await command('RECONFIRM',a.id));assert.equal(group(await snapshot(),a.id).deduplicationComplete,false);await review(await command('DISTINCT',a.id,b.id));assert.equal(group(await snapshot(),a.id).deduplicationComplete,true);
 });
 await t.test('RECONFIRM refreshes every edge/member, keeps generation and old decisions as evidence',async()=>{
  const a=await newLead(),b=await newLead(a.phone),c=await newLead(a.phone);await oldLink(a.id,b.id);await oldLink(b.id,c.id);await db.query("UPDATE customers SET full_name='Changed identity name' WHERE id=$1",[b.customer]);const before=await snapshot();assert.equal(group(before,a.id).deduplicationComplete,false);const gen=before.members.find(m=>m.leadId===b.id).generation;const after=(await review(await command('RECONFIRM',a.id))).snapshot;assert.equal(group(after,a.id).deduplicationComplete,true);assert.equal(after.members.find(m=>m.leadId===b.id).generation,gen);const active=after.edges.filter(e=>e.active&&[a.id,b.id,c.id].includes(e.leftLeadId));assert.ok(active.every(e=>e.revision>=2));
 });
 await t.test('UNLINK alone does not prove distinct; reconfirm and DISTINCT settle separate groups',async()=>{
  const a=await newLead(),b=await newLead(a.phone);await review(await command('LINK',a.id,b.id));await review(await command('UNLINK',a.id,b.id));await review(await command('RECONFIRM',a.id));await review(await command('RECONFIRM',b.id));assert.equal(group(await snapshot(),a.id).deduplicationComplete,false);await review(await command('DISTINCT',a.id,b.id));assert.equal(group(await snapshot(),a.id).deduplicationComplete,true);
 });
 await t.test('concurrent new decisions with same inventory only one wins; retries are current-state reads',async()=>{
  const a=await newLead(),b=await newLead(a.phone),cmd=await command('DISTINCT',a.id,b.id);const n=await events(),rs=await Promise.allSettled([review(cmd,randomUUID(),admin,company,peers[0]),review(cmd,randomUUID(),admin,company,peers[1])]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);assert.equal(rs.find(x=>x.status==='rejected').reason.code,'40001');assert.equal(await events(),n+1);
 });
 await t.test('new Lead insertion invalidates an old command even outside its pair',async()=>{
  const a=await newLead(),b=await newLead(a.phone),cmd=await command('DISTINCT',a.id,b.id);await newLead();await assert.rejects(review(cmd),e=>e.code==='40001');
 });
 await t.test('fresh revocation prevents accepted request replay and mutation rollback preserves audit count',async()=>{
  const a=await newLead(),b=await newLead(a.phone),cmd=await command('DISTINCT',a.id,b.id),key=randomUUID();await review(cmd,key);await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);await assert.rejects(review(cmd,key),e=>e.code==='42501');await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);const n=await events();await assert.rejects(review(await command('DISTINCT',a.id,a.id)),e=>e.code==='22023');assert.equal(await events(),n);
 });
 await t.test('DETACH keeps historical node/evidence; source disposition remains unresolved',async()=>{
  const a=await newLead(),b=await newLead(a.phone);await oldLink(a.id,b.id);await db.query('DELETE FROM crm_leads WHERE id=$1',[b.id]);const s=await snapshot();assert.equal(group(s,a.id).members.length,2);await review(await command('DETACH_UNAVAILABLE',a.id,b.id));const after=await snapshot();assert.equal(group(after,a.id).members.length,1);assert.equal(group(after,b.id).members[0].available,false);assert.equal(projectReview(after).deduplicationComplete,false);await review(await command('RECONFIRM',a.id));assert.equal(group(await snapshot(),a.id).deduplicationComplete,true);
 });
 await t.test('restore of a historical ID invalidates decisions and cannot be detached as unavailable',async()=>{
  const a=await newLead(),b=await newLead(a.phone);await oldLink(a.id,b.id);await db.query('DELETE FROM crm_leads WHERE id=$1',[b.id]);const before=await snapshot(),cmd=await command('DETACH_UNAVAILABLE',a.id,b.id),generation=before.members.find(m=>m.leadId===b.id).generation;
  await db.query("INSERT INTO crm_leads(id,company_id,customer_id,region_id,assigned_to,lead_owner_id,type,title) VALUES($1,$2,$3,$4,$5,$5,'lead','Restored')",[b.id,company,b.customer,region,admin]);await assert.rejects(review(cmd),e=>e.code==='40001');assert.ok((await snapshot()).members.find(m=>m.leadId===b.id).generation>generation);await assert.rejects(review(await command('DETACH_UNAVAILABLE',a.id,b.id)),e=>e.code==='40001');
 });
 await t.test('transfer-back holding the historical row serializes against DETACH and rejects the stale command',async()=>{
  const a=await newLead(),b=await newLead(a.phone);await oldLink(a.id,b.id);await db.query('UPDATE crm_leads SET company_id=$1,customer_id=NULL WHERE id=$2',[other,b.id]);const cmd=await command('DETACH_UNAVAILABLE',a.id,b.id);
  await db.query('BEGIN');await db.query('UPDATE crm_leads SET company_id=$1,customer_id=$2 WHERE id=$3',[company,b.customer,b.id]);let settled=false;const attempt=review(cmd).then(()=>{settled=true;throw Error('detached returned member')},e=>{settled=true;assert.equal(e.code,'40001')});await db.query('SELECT pg_sleep(0.08)');assert.equal(settled,false);await db.query('COMMIT');await attempt;assert.equal(group(await snapshot(),a.id).members.length,2);
 });
};
