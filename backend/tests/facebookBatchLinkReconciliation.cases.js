'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFacebookBatchJournal,journalResponse}=require('../src/helpers/facebookBatchJournal');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,begin,read,step,prepared})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/688_facebook_batch_link_reconciliation.sql'),'utf8');await db.query(sql);await db.query(sql);
 const inspect=async(c=db)=>(await c.query('SELECT crm_legacy_hold.inspect() r')).rows[0].r;
 const release='Synthetic Founder release reference; isolated tests only',drain='Synthetic complete writer inventory and drain reference',review='Synthetic review of link and remaining external effects';
 const hold=async(active,c=db)=>{const h=await inspect(c);return(await c.query('SELECT crm_legacy_hold.set_hold($1,$2,$3,$4,$5,$6) r',[randomUUID(),h.state.revision,active,h.manifestHash,release,active?null:drain])).rows[0].r;};
 const off=async()=>{if((await inspect()).state.active)await hold(false);};
 const preview=async(f,c=db)=>(await c.query('SELECT crm_batch_control.link_snapshot($1,$2) r',[f.key,f.contact])).rows[0].r;
 const stop=async(f,who=admin)=>query('crm_facebook_batch_stop',[who,company,f.key,[f.contact]]);
 const stopped=async()=>{const f=await prepared();await step(f.key,f.token,f.contact,'START');await stop(f);return f;};
 const args=async(f)=>{const v=await preview(f);return[randomUUID(),f.key,f.contact,v.snapshot.hold.revision,v.snapshot.manifestHash,v.snapshotHash,release,drain,review];};
 const apply=async(a,c=db)=>(await c.query('SELECT crm_batch_control.confirm_link($1,$2,$3,$4,$5,$6,$7,$8,$9) r',a)).rows[0].r;
 const rawItem=async f=>(await db.query('SELECT to_jsonb(x) r FROM crm_batch_control.items x WHERE request_id=$1 AND contact_id=$2',[f.key,f.contact])).rows[0].r;
 const auditCount=async f=>(await db.query('SELECT count(*)::int n FROM crm_batch_control.link_reconciliations WHERE request_id=$1',[f.key])).rows[0].n;
 const graph=async f=>(await db.query(`SELECT jsonb_build_object('contact',(SELECT to_jsonb(x) FROM facebook_contacts x WHERE id=$1),
  'lead',(SELECT to_jsonb(x) FROM crm_leads x WHERE id=$2),'customer',(SELECT to_jsonb(x) FROM customers x WHERE id=$3),
  'messages',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM facebook_messages x WHERE contact_id=$1)) r`,[f.contact,f.lead,f.customer])).rows[0].r;
 const pid=async c=>(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const waitLock=async n=>{for(let i=0;i<100;i++){await db.query('SELECT pg_stat_clear_snapshot()');if((await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[n])).rows[0]?.wait_event_type==='Lock')return;await db.query('SELECT pg_sleep(0.02)');}assert.fail('expected real lock wait');};
 await t.test('link reconciliation is private to the DB operator, not server or browser roles',async()=>{
  const f=await stopped();await hold(true);const a=await args(f);
  try{for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{
   await assert.rejects(preview(f),e=>e.code==='42501');await assert.rejects(apply(a),e=>e.code==='42501');
   await assert.rejects(db.query('SELECT * FROM crm_batch_control.link_reconciliations'),e=>e.code==='42501');
  }finally{await db.query('RESET ROLE');}}}finally{await off();}
 });
 await t.test('confirmed current mapping is audited but never replays or completes the interrupted creator',async()=>{
  const f=await stopped();await db.query("INSERT INTO facebook_messages(contact_id,lead_id,direction,content) VALUES($1,$2,'inbound','PRIVATE synthetic content')",[f.contact,f.lead]);
  const before=await graph(f);await hold(true);
  let a;
  try{const v=await preview(f);assert.equal(v.linkCanBeConfirmed,true);assert.equal(v.processesDrained,false);assert.equal(v.businessReconciled,false);
   assert.ok(!JSON.stringify(v).includes('PRIVATE synthetic content'));assert.ok(!JSON.stringify(v).includes('access_token'));
   assert.equal(v.snapshotHash,(await preview(f)).snapshotHash);a=await args(f);const result=await apply(a);
   assert.equal(result.replayed,false);assert.equal(result.currentRun.state,'REVIEW');assert.equal(result.currentRun.items[0].state,'RECONCILED_LINKED');
   assert.equal(result.claimRetained,true);assert.deepEqual(await graph(f),before);assert.equal((await inspect()).state.active,true);
   const audit=(await db.query('SELECT * FROM crm_batch_control.link_reconciliations WHERE command_id=$1',[a[0]])).rows[0];
   assert.equal(audit.before_item.state,'UNKNOWN');assert.equal(audit.after_item.state,'RECONCILED_LINKED');assert.equal(audit.snapshot_hash,v.snapshotHash);assert.ok(audit.operator_name);
   const service=createFacebookBatchJournal({isPrimary:()=>true,db:{rpc:async(name,p)=>({data:await query(name,Object.values(p))})}});
   const run=await service.read({user:{userId:admin}},company,f.key);assert.equal(journalResponse(run).status,202);
   assert.equal(run.items[0].reconciliation.businessReconciled,false);assert.ok(!JSON.stringify(run).includes(release));
   await assert.rejects(step(f.key,f.token,f.contact,'CHECK'),e=>e.code==='42501');
   await assert.rejects(step(f.key,f.token,null,'FINISH'),e=>e.code==='42501');
   assert.equal((await stop(f)).state,'REVIEW');
   await assert.rejects(db.query("UPDATE crm_batch_control.runs SET state='COMPLETED' WHERE request_id=$1",[f.key]),e=>e.code==='40001');
   await db.query(sql);assert.equal((await rawItem(f)).state,'RECONCILED_LINKED');assert.equal(await auditCount(f),1);
  }finally{await off();}
  await assert.rejects(begin([f.contact]),e=>e.code==='23505');assert.equal((await begin([f.contact],f.key)).execute,false);
  const replay=await apply(a);assert.equal(replay.replayed,true);assert.equal(replay.currentRun.state,'REVIEW');assert.equal(await auditCount(f),1);
 });
 await t.test('no hold or a new maintenance epoch cannot reuse old approval inputs',async()=>{
  const f=await stopped();await assert.rejects(preview(f),e=>e.code==='55000');await hold(true);const a=await args(f);await off();
  await assert.rejects(apply(a),e=>e.code==='55000');await hold(true);
  try{await assert.rejects(apply(a),e=>e.code==='40001');assert.equal(await auditCount(f),0);assert.equal((await rawItem(f)).state,'UNKNOWN');}finally{await off();}
 });
 await t.test('worker STOP without durable capability revocation is insufficient for link reconciliation',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');await step(f.key,f.token,null,'STOP');await hold(true);
  try{assert.deepEqual((await preview(f)).snapshot.issues,['DURABLE_STOP_REQUIRED']);await assert.rejects(apply(await args(f)),e=>e.code==='40001');}finally{await off();}
 });
 await t.test('PENDING and RUNNING are never reclassified from observed mapping alone',async()=>{
  const f=await prepared();await hold(true);try{assert.equal((await preview(f)).linkCanBeConfirmed,false);await assert.rejects(apply(await args(f)),e=>e.code==='40001');}finally{await off();}
  await step(f.key,f.token,f.contact,'START');await hold(true);try{assert.equal((await preview(f)).linkCanBeConfirmed,false);}finally{await off();}
 });
 for(const [label,change,issue]of[
  ['unlinked message',async f=>db.query("INSERT INTO facebook_messages(contact_id,direction) VALUES($1,'inbound')",[f.contact]),'MESSAGE_LINK_INCOMPLETE'],
  ['conflicting message',async f=>{const g=await fixture();await db.query("INSERT INTO facebook_messages(contact_id,lead_id,direction) VALUES($1,$2,'inbound')",[f.contact,g.lead]);},'MESSAGE_LINK_INCOMPLETE'],
  ['missing contact customer',async f=>db.query('UPDATE facebook_contacts SET customer_id=NULL WHERE id=$1',[f.contact]),'LINK_SCOPE_CONFLICT'],
  ['Lead company moved',async f=>db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[f.lead,other]),'LINK_SCOPE_CONFLICT'],
  ['Page company moved',async f=>db.query('UPDATE facebook_pages SET default_company_id=$2 WHERE page_id=$1',[f.page,other]),'PAGE_SCOPE_CONFLICT'],
  ['Customer company moved',async f=>db.query('UPDATE customers SET company_id=$2 WHERE id=$1',[f.customer,other]),'LINK_SCOPE_CONFLICT'],
  ['conflicting inverse Lead',async f=>{const g=await fixture();await db.query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1',[g.lead,f.contact]);},'AMBIGUOUS_CONTACT'],
 ])await t.test('reconciliation rejects '+label+' without changing or repairing business data',async()=>{
  const f=await stopped();await change(f);await hold(true);try{assert.ok((await preview(f)).snapshot.issues.includes(issue));await assert.rejects(apply(await args(f)),e=>e.code==='40001');assert.equal(await auditCount(f),0);}finally{await off();}
 });
 await t.test('duplicate Page identity is rejected by the actual unique constraint before reconciliation',async()=>{
  const f=await stopped(),before=await graph(f);
  await assert.rejects(db.query('INSERT INTO facebook_contacts(id,page_id,psid,lead_id,customer_id) VALUES($1,$2,$3,$4,$5)',
   [randomUUID(),f.page,f.psid,f.lead,f.customer]),e=>e.code==='23505'&&e.constraint==='facebook_contacts_page_id_psid_key');
  assert.deepEqual(await graph(f),before);assert.equal(await auditCount(f),0);await hold(true);
  try{const v=await preview(f);assert.equal(v.snapshot.duplicateContacts,0);assert.equal(v.linkCanBeConfirmed,true);}finally{await off();}
 });
 await t.test('all message rows participate; row1001 cannot be truncated away',async()=>{
  const f=await stopped();await db.query("INSERT INTO facebook_messages(contact_id,lead_id,direction,content) SELECT $1,$2,'inbound','synthetic '||n FROM generate_series(1,1000)n",[f.contact,f.lead]);
  await db.query("INSERT INTO facebook_messages(contact_id,direction) VALUES($1,'inbound')",[f.contact]);await hold(true);
  try{const v=await preview(f);assert.equal(v.snapshot.messages.count,1001);assert.equal(v.snapshot.messages.unlinked,1);assert.equal(v.linkCanBeConfirmed,false);}finally{await off();}
 });
 await t.test('missing references, wrong manifest and changed snapshot leave no reconciliation audit',async()=>{
  const f=await stopped();await hold(true);try{const a=await args(f);for(const n of [6,7,8]){const changed=a.slice();changed[n]=null;await assert.rejects(apply(changed),e=>e.code==='22023');}
   for(const n of [4,5]){const changed=a.slice();changed[n]='0'.repeat(64);await assert.rejects(apply(changed),e=>e.code==='40001');}
   await db.query('UPDATE crm_batch_control.runs SET updated_at=clock_timestamp() WHERE request_id=$1',[f.key]);await assert.rejects(apply(a),e=>e.code==='40001');assert.equal(await auditCount(f),0);
  }finally{await off();}
 });
 await t.test('reconciliation rollback restores UNKNOWN, token, claim and absence of audit',async()=>{
  const f=await stopped();await hold(true);try{const a=await args(f),before=await rawItem(f);await db.query('BEGIN');await apply(a);await db.query('ROLLBACK');
   assert.deepEqual(await rawItem(f),before);assert.equal(await auditCount(f),0);assert.equal((await apply(a)).replayed,false);
  }finally{await db.query('ROLLBACK');await off();}
 });
 await t.test('two operators with same command record once; changing evidence cannot replay it',async()=>{
  const f=await stopped();await hold(true);try{const a=await args(f);await Promise.all(peers.map(c=>c.query('RESET ROLE')));
   const rs=await Promise.all(peers.slice(0,2).map(c=>apply(a,c)));assert.deepEqual(rs.map(x=>x.replayed).sort(),[false,true]);assert.equal(await auditCount(f),1);
   const changed=a.slice();changed[8]+=' changed';await assert.rejects(apply(changed),e=>e.code==='23505');
  }finally{await Promise.all(peers.map(c=>c.query('SET ROLE service_role')));await off();}
 });
 await t.test('different commands competing for one UNKNOWN item cannot both record a result',async()=>{
  const f=await stopped();await hold(true);try{const a=await args(f),b=a.slice();b[0]=randomUUID();await Promise.all(peers.map(c=>c.query('RESET ROLE')));
   const rs=await Promise.allSettled([apply(a,peers[0]),apply(b,peers[1])]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);assert.equal(rs.find(x=>x.status==='rejected').reason.code,'40001');assert.equal(await auditCount(f),1);
  }finally{await Promise.all(peers.map(c=>c.query('SET ROLE service_role')));await off();}
 });
 await t.test('hold cannot be released between reconciliation validation and commit',async()=>{
  const f=await stopped();await hold(true);const a=await args(f),p=peers[0];let pending;await p.query('RESET ROLE');const n=await pid(p);
  await db.query('BEGIN');try{await apply(a);pending=hold(false,p).then(value=>({value}),error=>({error}));await waitLock(n);await db.query('COMMIT');assert.equal((await pending).error,undefined);assert.equal(await auditCount(f),1);
  }finally{await db.query('ROLLBACK');if(pending)await pending;await p.query('SET ROLE service_role');await off();}
 });
 await t.test('a release already in flight makes the waiting reconciliation fail after the lock',async()=>{
  const f=await stopped();await hold(true);const a=await args(f);let pending;await Promise.all(peers.map(c=>c.query('RESET ROLE')));const n=await pid(peers[1]);
  await peers[0].query('BEGIN');try{await hold(false,peers[0]);pending=apply(a,peers[1]).then(value=>({value}),error=>({error}));await waitLock(n);await peers[0].query('COMMIT');assert.equal((await pending).error?.code,'55000');assert.equal(await auditCount(f),0);
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending;await Promise.all(peers.map(c=>c.query('SET ROLE service_role')));await off();}
 });
 await t.test('reconciled historical Lead remains protected after contact clear and company movement',async()=>{
  const f=await stopped();await hold(true);try{await apply(await args(f));}finally{await off();}
  await db.query('UPDATE facebook_contacts SET lead_id=NULL WHERE id=$1',[f.contact]);await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[f.lead,other]);
  await assert.rejects(read(f.key),e=>e.code==='42501');await assert.rejects(begin([f.contact],f.key),e=>e.code==='42501');await assert.rejects(stop(f),e=>e.code==='42501');
 });
 await t.test('staff historical reconciliation cannot reveal a Lead reassigned after Contact clear',async()=>{
  const f=await fixture();f.key=randomUUID();f.token=randomUUID();await begin([f.contact],f.key,f.token,peers[0],sales);await step(f.key,f.token,f.contact,'START');await stop(f,sales);await hold(true);
  try{await apply(await args(f));}finally{await off();}
  await db.query('UPDATE facebook_contacts SET lead_id=NULL WHERE id=$1',[f.contact]);await db.query('UPDATE crm_leads SET assigned_to=$2,lead_owner_id=$2 WHERE id=$1',[f.lead,admin]);
  await assert.rejects(read(f.key,peers[0],sales),e=>e.code==='42501');
 });
 await t.test('repeatable snapshots and changed hold guards cannot confirm a link',async()=>{
  const f=await stopped();await hold(true);try{const a=await args(f);await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await assert.rejects(apply(a),e=>e.code==='0A000');}finally{await db.query('ROLLBACK');}
   await db.query('ALTER TABLE customers DISABLE TRIGGER a_crm_legacy_write_hold');try{await assert.rejects(apply(a),e=>e.code==='55000');}finally{await db.query('ALTER TABLE customers ENABLE ALWAYS TRIGGER a_crm_legacy_write_hold');}
   assert.equal(await auditCount(f),0);
  }finally{await off();}
 });
};
