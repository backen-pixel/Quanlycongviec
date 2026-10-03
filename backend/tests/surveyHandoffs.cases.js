'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {validView,validQueue,receipt}=require('../src/modules/marketingAutomation/surveyHandoffs');
module.exports=async(t,{db,peers,query,company,other,admin,sales,region,booked,finished,receive,incoming})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/668_crm_survey_handoffs.sql'),'utf8');await db.query(sql);await db.query(sql);
 const read=(c,actor=c.staff,before=null,version=null,client=peers[0])=>query('crm_survey_handoff_read',[actor,company,c.proposal.proposalId,before,version],client);
 const queue=(actor,state='PENDING',after=null,version=null)=>query('crm_survey_handoff_queue',[actor,company,state,after,version]);
 const ack=(c,view,request=randomUUID(),actor=c.staff,client=peers[0])=>query('crm_survey_handoff_ack',[actor,company,request,{proposalId:c.proposal.proposalId,expectedVersion:view.version}],client);
 const stranger=randomUUID();await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2",[stranger,company]);await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[stranger,region]);
 await t.test('staff receives full handoff after real worker and signed synthetic confirmation; RSVP is not staff receipt',async()=>{
  const c=await booked(),v=await read(c);assert.equal(validView(v,company),true,JSON.stringify(v));assert.equal(v.state,'PENDING');assert.equal(v.receipt,null);assert.equal(v.canAcknowledge,true);
  assert.equal(Date.parse(v.appointment.startsAt),c.a);
  await finished(c);
 });
 await t.test('only current recipient acknowledges; manager/owner can monitor and immutable booking result stays pending',async()=>{
  const c=await booked(),v=await read(c),key=randomUUID();
  for(const actor of [admin,sales]){const monitor=await read(c,actor);assert.equal(monitor.canAcknowledge,false);await assert.rejects(ack(c,monitor,randomUUID(),actor),e=>e.code==='42501');}
  const before=(await db.query('SELECT * FROM crm_events WHERE id=$1',[c.booking.event_id])).rows[0];
  const r=await ack(c,v,key);assert.equal(receipt(r,company),true);assert.equal(r.replayed,false);assert.equal((await ack(c,v,key)).replayed,true);
  const after=await read(c);assert.equal(after.state,'ACKNOWLEDGED');assert.equal(after.bookingStatus,'BOOKED_HANDOFF_PENDING');assert.equal(after.canAcknowledge,false);
  assert.deepEqual((await db.query('SELECT * FROM crm_events WHERE id=$1',[c.booking.event_id])).rows[0],before);
  assert.equal((await db.query('SELECT mode FROM crm_care_threads WHERE id=$1',[c.thread])).rows[0].mode,'WAITING');
  await assert.rejects(ack(c,after),e=>e.code==='40001');
  assert.equal((await db.query("SELECT count(*)::int n FROM crm_survey_control.proposal_events WHERE proposal_id=$1 AND action='HANDOFF_ACK'",[c.proposal.proposalId])).rows[0].n,1);await finished(c);
 });
 await t.test('unassigned Lead does not let an unrelated member read customer history',async()=>{
  const c=await booked();await db.query('UPDATE crm_leads SET assigned_to=NULL WHERE id=$1',[c.lead]);
  await assert.rejects(read(c,stranger),e=>e.code==='42501');assert.equal((await queue(stranger)).items.some(x=>x.proposalId===c.proposal.proposalId),false);
  const v=await read(c);assert.equal(v.canAcknowledge,true);await ack(c,v);await finished(c);
 });
 await t.test('current Sales owner replaces historic owner; revocation blocks detail, history and replay',async()=>{
  const c=await booked(),v=await read(c),key=randomUUID();await ack(c,v,key);
  await db.query('UPDATE crm_leads SET assigned_to=$2 WHERE id=$1',[c.lead,stranger]);await assert.rejects(read(c,sales),e=>e.code==='42501');assert.equal((await read(c,stranger)).ownerId,stranger);
  await db.query('DELETE FROM user_company_regions WHERE user_id=$1',[c.staff]);
  await assert.rejects(read(c),e=>e.code==='42501');await assert.rejects(ack(c,v,key),e=>e.code==='42501');assert.equal((await queue(c.staff)).items.length,0);await finished(c);
 });
 await t.test('inactive user, company and tenant deny current access',async()=>{
  const c=await booked(),tenant=(await db.query('SELECT tenant_id FROM companies WHERE id=$1',[company])).rows[0].tenant_id;
  for(const [table,id] of [['users',c.staff],['companies',company],['tenants',tenant]]){
   await db.query(`UPDATE ${table} SET is_active=false WHERE id=$1`,[id]);try{await assert.rejects(read(c),e=>e.code==='42501');await assert.rejects(queue(c.staff),e=>e.code==='42501');}finally{await db.query(`UPDATE ${table} SET is_active=true WHERE id=$1`,[id]);}
  }await finished(c);
 });
 await t.test('Lead, Customer or Page moving company cannot expose foreign details; manager sees opaque exception',async()=>{
  const c=await booked();for(const [table,col,id,key] of [['crm_leads','company_id',c.lead,'id'],['customers','company_id',c.customer,'id'],['facebook_pages','default_company_id','123','page_id']]){
   await db.query(`UPDATE ${table} SET ${col}=$2 WHERE ${key}=$1`,[id,other]);try{
    await assert.rejects(read(c,admin),e=>e.code==='42501');await assert.rejects(read(c),e=>e.code==='42501');
    const q=await queue(admin);assert.equal(validQueue(q,company,'PENDING'),true);const item=q.items.find(x=>x.proposalId===c.proposal.proposalId);assert.ok(item);assert.equal(item.scopeReady,false);assert.equal(item.title,null);assert.equal(item.appointment,null);
   }finally{await db.query(`UPDATE ${table} SET ${col}=$2 WHERE ${key}=$1`,[id,company]);}
  }await finished(c);
 });
 await t.test('duplicate contact mapping and changed customer cannot reveal an unrelated conversation',async()=>{
  const c=await booked();await assert.rejects(db.query("INSERT INTO facebook_contacts(page_id,psid,lead_id,customer_id) VALUES('123',$1,$2,$3)",[c.psid,c.lead,c.customer]),e=>e.code==='23505');
  assert.equal((await read(c)).state,'PENDING');
  const foreign=randomUUID();await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Another private customer','000',$2)",[foreign,company]);await db.query('UPDATE crm_leads SET customer_id=$2 WHERE id=$1',[c.lead,foreign]);await assert.rejects(read(c),e=>e.code==='42501');await finished(c);
 });
 await t.test('changed appointment invalidates old view and cannot be acknowledged as original customer consent',async()=>{
  const c=await booked(),v=await read(c);await finished(c);
  await db.query("UPDATE crm_events SET start_time=start_time+interval '5 minutes' WHERE id=$1",[c.booking.event_id]);
  const changed=await read(c);assert.equal(changed.appointmentUnchanged,false);assert.equal(changed.canAcknowledge,false);assert.notEqual(changed.version,v.version);await assert.rejects(ack(c,changed),e=>e.code==='40001');
  await db.query('UPDATE crm_events SET company_id=$2 WHERE id=$1',[c.booking.event_id,other]);await assert.rejects(read(c,admin),e=>e.code==='42501');
 });
 await t.test('former recipient loses access after event reassignment; foreign live name is not returned',async()=>{
  const c=await booked();await finished(c);await db.query('UPDATE crm_events SET assignee_id=$2 WHERE id=$1',[c.booking.event_id,stranger]);await assert.rejects(read(c),e=>e.code==='42501');assert.equal((await read(c,admin)).assignmentCurrent,false);
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text');await db.query("UPDATE users SET company_id=$2,full_name='PRIVATE NEW COMPANY STAFF' WHERE id=$1",[c.staff,other]);
  assert.equal(JSON.stringify(await read(c,admin)).includes('PRIVATE NEW COMPANY STAFF'),false);
 });
 await t.test('booking remains visible after proposer or roster expiry; STOP stays sticky after acknowledgement',async()=>{
  const c=await booked();await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{assert.equal((await read(c)).state,'PENDING');}finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
  await db.query("UPDATE crm_survey_rosters SET active=false,document=jsonb_set(document,'{validUntil}',to_jsonb((clock_timestamp()-interval '1 day')::text)) WHERE staff_id=$1",[c.staff]);
  await receive([await incoming(c,'STOP')]);const v=await read(c);assert.equal(v.careMode,'OPTED_OUT');await ack(c,v);assert.equal((await read(c)).careMode,'OPTED_OUT');await finished(c);
 });
 await t.test('full transcript pagination preserves attachments inertly and new messages invalidate the cursor/ack',async()=>{
  const c=await booked();for(let i=0;i<55;i++)await receive([await incoming(c,'Synthetic history '+i)]);
  const v=await read(c);assert.equal(v.messages.length,50);assert.ok(v.nextBefore);const older=await read(c,c.staff,v.nextBefore,v.version);assert.equal(validView(older,company),true);assert.equal(older.messages.length+v.messages.length,v.messageCount);assert.equal(new Set([...older.messages,...v.messages].map(x=>x.id)).size,v.messageCount);
  await receive([await incoming(c,'New demand')]);await assert.rejects(read(c,c.staff,v.nextBefore,v.version),e=>e.code==='40001');await assert.rejects(ack(c,v),e=>e.code==='40001');await finished(c);
 });
 await t.test('two simultaneous acknowledgements produce one durable receipt; exact lost-response replay succeeds',async()=>{
  const c=await booked(),v=await read(c),key=randomUUID();const rs=await Promise.all([ack(c,v,key,c.staff,peers[0]),ack(c,v,key,c.staff,peers[1])]);assert.equal(rs.filter(x=>x.replayed===false).length,1);
  const another=await booked(),next=await read(another);await assert.rejects(ack(another,next,key),e=>e.code==='23505');await assert.rejects(ack(c,{...v,version:'f'.repeat(32)},key),e=>e.code==='23505');await finished(c);await finished(another);
 });
 await t.test('ack transaction rollback leaves no partial handoff receipt or audit',async()=>{
  const c=await booked(),v=await read(c),key=randomUUID();await peers[0].query('BEGIN');try{await ack(c,v,key);await peers[0].query('ROLLBACK');}catch(e){await peers[0].query('ROLLBACK');throw e;}
  assert.equal((await read(c)).state,'PENDING');assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.handoff_receipts WHERE request_id=$1',[key])).rows[0].n,0);await ack(c,v,key);await finished(c);
 });
 await t.test('queued cursor cannot skip changed handoffs; list counts cover the same authorized membership',async()=>{
  const c=await booked(),q=await queue(c.staff);assert.equal(validQueue(q,company,'PENDING'),true);assert.equal(q.counts.PENDING,1);assert.equal(q.counts.ACKNOWLEDGED,0);
  await ack(c,await read(c));await assert.rejects(queue(c.staff,'PENDING',c.proposal.proposalId,q.version),e=>e.code==='40001');const next=await queue(c.staff,'ACKNOWLEDGED');assert.equal(next.counts.PENDING,0);assert.equal(next.counts.ACKNOWLEDGED,1);await finished(c);
 });
 await t.test('public roles cannot call scoped handoff APIs even after broad backup grants',async()=>{
  const c=await booked();await db.query('BEGIN');try{await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated');
   for(const role of ['anon','authenticated','service_role']){await db.query('SET LOCAL ROLE '+role);await db.query('SAVEPOINT denied');await assert.rejects(db.query('SELECT * FROM crm_survey_control.handoff_receipts'),e=>e.code==='42501');await db.query('ROLLBACK TO denied');
    if(role!=='service_role'){await db.query('SAVEPOINT denied');await assert.rejects(read(c,c.staff,null,null,db),e=>e.code==='42501');await db.query('ROLLBACK TO denied');}await db.query('RESET ROLE');}
  }finally{await db.query('ROLLBACK');await finished(c);}
 });
 const waitBlocked=async pid=>{for(let i=0;i<100;i++){if((await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.wait_event_type==='Lock')return;await db.query('SELECT pg_sleep(0.01)')}throw Error('Expected request to wait on current authorization/calendar lock')};
 await t.test('company revocation while ACK waits on authority cannot commit receipt',async()=>{
  const c=await booked(),v=await read(c),pid=(await peers[1].query('SELECT pg_backend_pid() p')).rows[0].p;
  await db.query('BEGIN');await db.query('UPDATE companies SET is_active=false WHERE id=$1',[company]);
  const pending=assert.rejects(ack(c,v,randomUUID(),c.staff,peers[1]),e=>e.code==='42501');
  try{await waitBlocked(pid);}finally{await db.query('COMMIT')}await pending;
  await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);assert.equal((await read(c)).state,'PENDING');await finished(c);
 });
 await t.test('participant inserted while ACK waits on calendar gate invalidates the old handoff',async()=>{
  const c=await booked(),v=await read(c),pid=(await peers[1].query('SELECT pg_backend_pid() p')).rows[0].p;await finished(c);
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('crm-survey-calendar-write-gate-v1',0))");
  const pending=assert.rejects(ack(c,v,randomUUID(),c.staff,peers[1]),e=>e.code==='40001');
  try{await waitBlocked(pid);await db.query("INSERT INTO crm_event_participants(event_id,user_id,status) VALUES($1,$2,'confirmed')",[c.booking.event_id,stranger]);}finally{await db.query('COMMIT')}await pending;
  assert.equal((await read(c)).canAcknowledge,false);
 });
 await t.test('more than fifty handoffs have complete stable pagination and identical scoped counts',async()=>{
  const owner=randomUUID();await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2",[owner,company]);await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[owner,region]);
  const ids=[];for(let i=0;i<53;i++){const c=await booked();await db.query('UPDATE crm_leads SET assigned_to=$2 WHERE id=$1',[c.lead,owner]);ids.push(c.proposal.proposalId);await finished(c);}
  const first=await queue(owner),next=await queue(owner,'PENDING',first.nextAfter,first.version);assert.equal(first.items.length,50);assert.equal(next.items.length,3);assert.equal(next.nextAfter,null);assert.equal(first.counts.PENDING,53);assert.deepEqual(next.counts,first.counts);assert.equal(new Set([...first.items,...next.items].map(x=>x.proposalId)).size,53);assert.ok(ids.every(id=>[...first.items,...next.items].some(x=>x.proposalId===id)));
 });
};
