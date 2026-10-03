'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {reportOperations}=require('../src/modules/marketingAutomation/operationsReport');
module.exports=async(t,{db,peers,query,company,other,admin,sales,booked,finished,receive,incoming})=>{
 for(const file of ['649_marketing_spend_evidence.sql','655_marketing_lead_trial.sql','656_facebook_lead_census.sql','657_marketing_census_reconciliation.sql','670_marketing_measurement_period.sql','671_marketing_source_registry.sql','672_marketing_census_witness.sql','673_marketing_operations_dashboard.sql']){const sql=fs.readFileSync(path.resolve(__dirname,'../../database',file),'utf8');await db.query(sql);await db.query(sql);}
 // Prior survey fixtures intentionally shared a phone. Give independent fake
 // customers distinct fake phones so this suite does not hit the unrelated
 // quadratic identity-candidate cap. No business data or assertions are erased.
 await db.query("WITH numbered AS(SELECT id,row_number() OVER(ORDER BY id) n FROM customers WHERE company_id=$1) UPDATE customers c SET phone='090'||lpad(n.n::text,7,'0') FROM numbered n WHERE c.id=n.id",[company]);
 const read=(actor=admin,cid=company,client=peers[0])=>query('marketing_operations_snapshot',[actor,cid],client);
 const thread=(raw,c)=>raw.threads.find(x=>x.id===c.thread),booking=(raw,c)=>raw.bookings.find(x=>x.id===c.proposal.proposalId);
 let contactSequence=0;
 const fresh=async()=>{const c=await booked();await db.query('UPDATE crm_leads SET type=$2 WHERE id=$1',[c.lead,'lead']);await db.query('UPDATE customers SET phone=$2 WHERE id=$1',[c.customer,'091'+String(++contactSequence).padStart(7,'0')]);return c;};
 await t.test('operations read requires current service role and company admin, including accidental grants',async()=>{
  for(const role of ['anon','authenticated']){await db.query('SET ROLE '+role);try{await assert.rejects(read(admin,company,db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT EXECUTE ON FUNCTION marketing_operations_snapshot(uuid,uuid) TO authenticated');await db.query('SET ROLE authenticated');try{await assert.rejects(read(admin,company,db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION marketing_operations_snapshot(uuid,uuid) FROM authenticated');}
  await assert.rejects(read(sales),e=>e.code==='42501');await assert.rejects(read(admin,other),e=>e.code==='42501');
  for(const [table,id]of[['users',admin],['companies',company],['tenants',(await db.query('SELECT tenant_id FROM companies WHERE id=$1',[company])).rows[0].tenant_id]]){await db.query(`UPDATE ${table} SET is_active=false WHERE id=$1`,[id]);try{await assert.rejects(read(),e=>e.code==='42501');}finally{await db.query(`UPDATE ${table} SET is_active=true WHERE id=$1`,[id]);}}
 });
 await t.test('same-day real synthetic booking and pending handoff appear without a trial',async()=>{
  const before=reportOperations(await read()),c=await fresh(),raw=await read(),r=reportOperations(raw);assert.equal((await db.query('SELECT count(*)::int n FROM marketing_lead_trials')).rows[0].n,0);assert.equal(thread(raw,c).scopeReady,true);assert.equal(booking(raw,c).scopeReady,true);assert.equal(booking(raw,c).state,'PENDING');assert.equal(r.counts.pendingHandoffs,before.counts.pendingHandoffs+1);assert.equal(r.counts.upcoming,before.counts.upcoming+1);assert.equal(r.attention.length,Math.min(50,r.attentionTotal));assert.equal(r.adCohortAttribution,false);assert.equal(r.aiMaySend,false);await finished(c);
 });
 await t.test('staff acknowledgement changes only receipt counts and STOP preserves the booking',async()=>{
  const c=await fresh(),before=reportOperations(await read());const v=await query('crm_survey_handoff_read',[c.staff,company,c.proposal.proposalId,null,null]);await query('crm_survey_handoff_ack',[c.staff,company,randomUUID(),{proposalId:c.proposal.proposalId,expectedVersion:v.version}]);
  const after=reportOperations(await read());assert.equal(after.counts.pendingHandoffs,before.counts.pendingHandoffs-1);assert.equal(after.counts.acknowledgedHandoffs,before.counts.acknowledgedHandoffs+1);assert.equal(after.counts.upcoming,before.counts.upcoming);
  await receive([await incoming(c,'STOP')]);const raw=await read();assert.equal(thread(raw,c).mode,'OPTED_OUT');assert.equal(booking(raw,c).scopeReady,true);assert.ok(!reportOperations(raw).attention.some(x=>x.kind==='CARE'&&x.id===c.thread));await finished(c);
 });
 await t.test('Page, Lead and Customer company drift mask identifiers and details while retaining opaque counts',async()=>{
  const c=await fresh();for(const [table,col,key,id]of[['facebook_pages','default_company_id','page_id','123'],['crm_leads','company_id','id',c.lead],['customers','company_id','id',c.customer]]){await db.query(`UPDATE ${table} SET ${col}=$2 WHERE ${key}=$1`,[id,other]);try{const raw=await read();assert.equal(thread(raw,c).scopeReady,false);assert.equal(thread(raw,c).leadId,null);assert.equal(thread(raw,c).mode,null);assert.equal(booking(raw,c).scopeReady,false);assert.equal(booking(raw,c).leadId,null);const r=reportOperations(raw);assert.ok(r.counts.unavailableThreads>0);assert.ok(r.counts.unavailableBookings>0);assert.equal(r.customers.waiting,null);}finally{await db.query(`UPDATE ${table} SET ${col}=$2 WHERE ${key}=$1`,[id,company]);}}await finished(c);
 });
 await t.test('conflicting contact customer and recipient revocation do not become valid assignments',async()=>{
  const c=await fresh(),foreign=randomUUID();await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'PRIVATE FOREIGN CUSTOMER','000',$2)",[foreign,other]);await db.query('UPDATE facebook_contacts SET customer_id=$2 WHERE lead_id=$1',[c.lead,foreign]);let raw=await read();assert.equal(thread(raw,c).scopeReady,false);assert.equal(booking(raw,c).scopeReady,false);assert.ok(!JSON.stringify(raw.threads).includes('PRIVATE FOREIGN CUSTOMER'));
  await db.query('UPDATE facebook_contacts SET customer_id=$2 WHERE lead_id=$1',[c.lead,c.customer]);const before=reportOperations(await read());await db.query('DELETE FROM user_company_regions WHERE user_id=$1',[c.staff]);raw=await read();assert.equal(booking(raw,c).assigned,false);assert.equal(booking(raw,c).recipientId,null);const after=reportOperations(raw);assert.equal(after.counts.changedAppointments,before.counts.changedAppointments+1);assert.equal(after.counts.upcoming,before.counts.upcoming-1);assert.equal(after.counts.pendingHandoffs,before.counts.pendingHandoffs-1);await finished(c);
 });
 await t.test('edited or elapsed appointment is not silently treated as completed survey',async()=>{
  const c=await fresh(),before=reportOperations(await read());await finished(c);await db.query("UPDATE crm_events SET start_time=start_time+interval '5 minutes' WHERE id=$1",[c.booking.event_id]);const raw=await read();assert.equal(booking(raw,c).unchanged,false);const r=reportOperations(raw);assert.equal(r.counts.changedAppointments,before.counts.changedAppointments+1);assert.equal(r.counts.upcoming,before.counts.upcoming-1);assert.equal(r.completedSurveys,undefined);await db.query('UPDATE crm_events SET end_time=NULL,all_day=true WHERE id=$1',[c.booking.event_id]);assert.equal(reportOperations(await read()).counts.changedAppointments,r.counts.changedAppointments);await db.query("UPDATE crm_events SET end_time='infinity'::timestamptz WHERE id=$1",[c.booking.event_id]);assert.equal(reportOperations(await read()).counts.changedAppointments,r.counts.changedAppointments);
 });
 await t.test('last directional timestamps use message time, not out-of-order delivery order',async()=>{
  const c=await fresh();const late=await incoming(c,'Synthetic latest customer question');await receive([late]);const before=thread(await read(),c);const old=await incoming(c,'Synthetic older late delivery');old.timestamp-=3600000;await receive([old]);const after=thread(await read(),c);assert.equal(Date.parse(after.lastInboundAt),Date.parse(before.lastInboundAt));await finished(c);
 });
 await t.test('one statement snapshot stays coherent while STOP arrives during the read',async()=>{
  const c=await fresh(),original=(await db.query("SELECT pg_get_functiondef('marketing_operations_snapshot(uuid,uuid)'::regprocedure) d")).rows[0].d;
  const marker='threads AS MATERIALIZED(SELECT * FROM public.crm_care_threads';assert.ok(original.includes(marker));
  const altered=original.replace(marker,()=>"threads AS MATERIALIZED(SELECT t.* FROM public.crm_care_threads t CROSS JOIN (SELECT pg_advisory_lock(673027),pg_advisory_unlock(673027)) barrier");
  await db.query(altered);await db.query('SELECT pg_advisory_lock(673027)');const pending=read().then(value=>({value}),error=>({error}));
  try{
   try{let blocked=false;for(let i=0;i<100;i++){const q=await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT marketing_operations_snapshot%' AND pid<>pg_backend_pid()");if(q.rows[0].n){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await query('crm_care_control',[admin,company,randomUUID(),{threadId:c.thread,action:'OPT_OUT',expectedVersion:(await query('crm_care_read',[admin,company,c.thread],peers[1])).version,reason:'Synthetic concurrent STOP'}],peers[1]);}
   finally{await db.query('SELECT pg_advisory_unlock(673027)');}
   const result=await pending;if(result.error)throw result.error;assert.notEqual(thread(result.value,c).mode,'OPTED_OUT');assert.equal(thread(await read(),c).mode,'OPTED_OUT');
  }finally{await pending;await db.query(original);await finished(c);}
 });
 await t.test('bounded snapshot reports unavailable instead of publishing truncated zero or partial totals',async()=>{
  await db.query("INSERT INTO crm_care_threads(company_id,page_id,psid) SELECT $1,'123','673CAP'||n FROM generate_series(1,5001) n",[company]);try{const raw=await read();assert.equal(raw.complete,false);assert.equal(raw.threads.length,5001);assert.throws(()=>reportOperations(raw),e=>e.status===503);}finally{await db.query("DELETE FROM crm_care_threads WHERE company_id=$1 AND psid LIKE '673CAP%'",[company]);}
 });
};
