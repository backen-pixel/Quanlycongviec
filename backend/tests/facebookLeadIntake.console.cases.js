'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function consoleCases(t,{db,peers,query,enqueue,lease,bind,config,admin,sales,company,other,region,commit,setup,dropQueue}){
 const row=async id=>(await db.query('SELECT r.*,md5(to_jsonb(r)::text) version FROM marketing_fb_lead_receipts r WHERE id=$1',[id])).rows[0];
 const eventCount=async()=>Number((await db.query('SELECT count(*) n FROM marketing_fb_lead_recovery_events')).rows[0].n);
 const make=async()=>{await dropQueue();const x=await setup();await db.query("UPDATE marketing_fb_lead_receipts SET state='REVIEW',failure_code='PROVIDER_UNAVAILABLE',lease_token=NULL,lease_until=NULL WHERE id=$1",[x.r.id]);return row(x.r.id)};
 const command=async r=>({receiptId:r.id,expectedVersion:r.version,bindingRevision:(await db.query("SELECT revision FROM marketing_fb_lead_bindings WHERE page_id='123' AND form_id='456'")).rows[0].revision,reason:'Connection checked in isolated test; retry approved'});
 const recover=(cmd,key=randomUUID(),who=admin,cid=company,c=peers[0])=>query('marketing_fb_lead_recover',[who,cid,key,cmd],c);
 await t.test('console and recovery private ACL, fresh company scope and no secrets',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM marketing_fb_lead_recovery_events'),e=>e.code==='42501');if(role!=='service_role')await assert.rejects(query('marketing_fb_lead_console',[admin,company,null],db),e=>e.code==='42501');await db.query('RESET ROLE');}
  for(const [who,cid] of [[sales,company],[admin,other]])await assert.rejects(query('marketing_fb_lead_console',[who,cid,null]),e=>e.code==='42501');
  const s=await query('marketing_fb_lead_console',[admin,company,null]);assert.equal(s.companyId,company);assert.equal(s.uniquePaidCoverage,'INCOMPLETE');for(const secret of ['page-test-token','ad-test-token','0901234567'])assert.equal(JSON.stringify(s).includes(secret),false);
 });
 await t.test('operator retry validates routing and atomically preserves before/after audit',async()=>{
  const r=await make(),cmd=await command(r),key=randomUUID(),n=await eventCount();assert.equal((await recover(cmd,key)).accepted,true);
  const after=await row(r.id);assert.equal(after.state,'PENDING');assert.equal(after.attempts,r.attempts);assert.equal(after.lease_token,null);assert.equal(after.failure_code,null);
  const audit=(await db.query('SELECT * FROM marketing_fb_lead_recovery_events WHERE request_id=$1',[key])).rows[0];assert.equal(audit.before_state.state,'REVIEW');assert.equal(audit.after_state.state,'PENDING');assert.equal(audit.actor_id,admin);assert.equal(await eventCount(),n+1);
  const claimed=await lease();assert.equal(claimed.r.id,r.id);assert.equal((await recover(cmd,key)).replayed,true);assert.equal((await row(r.id)).state,'LEASED');assert.equal(await eventCount(),n+1);
  await assert.rejects(recover({...cmd,reason:'Changed reason after accepted request'},key),e=>e.code==='23505');await dropQueue();
 });
 await t.test('two fresh requests against same receipt allow one recovery, never two audits',async()=>{
  const r=await make(),cmd=await command(r),n=await eventCount();const rs=await Promise.allSettled([recover(cmd,randomUUID(),admin,company,peers[0]),recover(cmd,randomUUID(),admin,company,peers[1])]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);assert.equal(rs.find(x=>x.status==='rejected').reason.code,'40001');assert.equal(await eventCount(),n+1);await dropQueue();
 });
 await t.test('simultaneous replay of one request has one audit and no second transition',async()=>{
  const r=await make(),cmd=await command(r),key=randomUUID(),n=await eventCount();const rs=await Promise.all([recover(cmd,key,admin,company,peers[0]),recover(cmd,key,admin,company,peers[1])]);assert.equal(rs.filter(x=>x.replayed===false).length,1);assert.equal(await eventCount(),n+1);await dropQueue();
 });
 await t.test('null/old binding revision requires explicit current revision and keeps source identity',async()=>{
  const r=await make();await db.query('UPDATE marketing_fb_lead_receipts SET binding_revision=NULL WHERE id=$1',[r.id]);const before=await row(r.id),cmd=await command(before);
  await assert.rejects(recover({...cmd,bindingRevision:cmd.bindingRevision+1}),e=>e.code==='40001');await recover(cmd);const after=await row(r.id);assert.equal(after.binding_revision,cmd.bindingRevision);for(const key of ['page_id','form_id','leadgen_id','company_id'])assert.equal(after[key],before[key]);await dropQueue();
 });
 await t.test('changed snapshot, worker-owned and already queued rows cannot be recovered',async()=>{
  const r=await make(),cmd=await command(r);await db.query('UPDATE marketing_fb_lead_receipts SET attempts=attempts+1 WHERE id=$1',[r.id]);await assert.rejects(recover(cmd),e=>e.code==='40001');
  for(const state of ['LEASED','DONE','PENDING']){await db.query('UPDATE marketing_fb_lead_receipts SET state=$2,failure_code=NULL WHERE id=$1',[r.id,state]);await assert.rejects(recover(await command(await row(r.id))),e=>e.code==='40001');}await dropQueue();
 });
 await t.test('fresh owner/actor revocation and binding revision changes roll back recovery completely',async()=>{
  const r=await make(),cmd=await command(r),n=await eventCount();await db.query('DELETE FROM user_company_regions WHERE user_id=$1',[sales]);await assert.rejects(recover(cmd),e=>e.code==='42501');assert.equal((await row(r.id)).version,r.version);assert.equal(await eventCount(),n);await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[sales,region]);
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);await assert.rejects(recover(cmd),e=>e.code==='42501');await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);
  await bind({...config,expectedRevision:cmd.bindingRevision});await assert.rejects(recover(cmd),e=>e.code==='40001');await dropQueue();
 });
 await t.test('completed, source-linked and legacy tombstones cannot be retried even after deletion',async()=>{
  const variants=[['lead_id',randomUUID()],['customer_id',randomUUID()],['completed_at',new Date().toISOString()],['failure_code','ENVELOPE_SCOPE_CONFLICT'],['failure_code','LEGACY_RECONCILIATION_REQUIRED']];
  for(const [col,value] of variants){const r=await make();await db.query(`UPDATE marketing_fb_lead_receipts SET ${col}=$2 WHERE id=$1`,[r.id,value]);await assert.rejects(recover(await command(await row(r.id))),e=>e.code==='40001');}
  const r=await make();await db.query("INSERT INTO facebook_contacts VALUES('123',$1,NULL)",['leadad_'+r.leadgen_id]);await assert.rejects(recover(await command(r)),e=>e.code==='40001');
  await dropQueue();const done=await setup(),result=await commit(done);await db.query('DELETE FROM crm_leads WHERE id=$1',[result.leadId]);await db.query("UPDATE marketing_fb_lead_receipts SET state='REVIEW',lead_id=NULL,customer_id=NULL,completed_at=NULL WHERE id=$1",[done.r.id]);await assert.rejects(recover(await command(await row(done.r.id))),e=>e.code==='40001');await dropQueue();
 });
 await t.test('foreign receipt and untrusted command keys are refused without mutation',async()=>{
  const r=await make(),cmd=await command(r);await assert.rejects(recover(cmd,randomUUID(),admin,other),e=>e.code==='42501');await assert.rejects(recover({...cmd,companyId:other}),e=>e.code==='22023');await assert.rejects(recover({...cmd,reason:'short'}),e=>e.code==='22023');assert.equal((await row(r.id)).version,r.version);
 });
 await t.test('cursor pagination covers more than 50 unresolved receipts without exposing other companies',async()=>{
  for(let i=0;i<55;i++)await enqueue();
  let cursor=null,seen=new Set(),pages=0;do{const s=await query('marketing_fb_lead_console',[admin,company,cursor]);assert.ok(s.items.length<=50);for(const r of s.items){assert.equal(seen.has(r.id),false);seen.add(r.id);assert.ok(/^[a-f0-9]{32}$/.test(r.version));}cursor=s.nextCursor;pages++;assert.ok(pages<10);}while(cursor);
  assert.ok(pages>=2);const expected=Number((await db.query("SELECT count(*) n FROM marketing_fb_lead_receipts WHERE company_id=$1 AND state<>'DONE'",[company])).rows[0].n);assert.equal(seen.size,expected);
  await assert.rejects(query('marketing_fb_lead_console',[admin,company,randomUUID()]),e=>e.code==='22023');await dropQueue();
 });
};
