'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {reportCohortOperations}=require('../src/modules/marketingAutomation/cohortOperations');
module.exports=async(t,{db,peers,query,company,other,admin,sales,booked,finished})=>{
 const trial=randomUUID(),day=n=>new Date(Date.now()+7*3600000+n*86400000).toISOString().slice(0,10);
 const acquired=new Date(day(-2)+'T12:00:00+07:00').toISOString();
 await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at timestamptz;ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS created_at timestamptz');
 const configured=await query('marketing_lead_trial_set',[admin,company,trial,randomUUID(),{name:'Synthetic closed cohort and current surveys',since:day(-30),until:day(-1),expectedRevision:0}]);
 const account=configured.account_ids[0];let sequence=0;
 const qualify=async(lead,status='QUALIFIED',client=peers[0])=>{
  const c=await query('crm_lead_quality_read',[admin,company,lead],client);
  return query('crm_lead_quality_record',[admin,company,lead,randomUUID(),c.revision,c.contextVersion,{status,contactVerified:true,demandMatches:true,serviceAreaVerified:true,evidence:'Synthetic paid customer for cohort survey acceptance only.'}],client);
 };
 const fresh=async()=>{
  const c=await booked(),receipt=randomUUID(),leadgen='678'+String(++sequence).padStart(7,'0');
  await db.query("UPDATE customers SET phone=$2,created_at=$3 WHERE id=$1",[c.customer,'093'+String(sequence).padStart(7,'0'),acquired]);
  await db.query("UPDATE crm_leads SET type='lead',created_at=$2,first_touch_time=$2 WHERE id=$1",[c.lead,acquired]);
  const proof={pageId:'123',formId:'456',leadgenId:leadgen,source:'PAID',accountId:account,adId:'6781',adsetId:'6782',campaignId:'6783',acquiredAt:acquired};
  await db.query("INSERT INTO marketing_fb_lead_receipts(id,page_id,form_id,leadgen_id,company_id,delivery_hash,state,lead_id,customer_id,received_at) VALUES($1,'123','456',$2,$3,$4,'DONE',$5,$6,$7)",[receipt,leadgen,company,'a'.repeat(64),c.lead,c.customer,acquired]);
  await db.query("INSERT INTO crm_lead_source_evidence(receipt_id,company_id,lead_id,customer_id,provider,source_kind,acquired_at,proof,routing) VALUES($1,$2,$3,$4,'META_LEAD_ADS_V1','PAID',$5,$6,'{}')",[receipt,company,c.lead,c.customer,acquired,proof]);
  await qualify(c.lead);return c;
 };
 const read=(actor=admin,cid=company,tid=trial,client=peers[0])=>query('marketing_cohort_operations_snapshot',[actor,cid,tid],client);
 const a=await fresh(),b=await fresh();
 try{
  await t.test('cohort read rejects wrong role, company, actor, missing trial and private helper grants',async()=>{
   for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT marketing_measurement.operations_facts($1,$2,NULL)',[admin,company]),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
   await db.query('GRANT EXECUTE ON FUNCTION marketing_cohort_operations_snapshot(uuid,uuid,uuid) TO authenticated');await db.query('SET ROLE authenticated');
   try{await assert.rejects(read(admin,company,trial,db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION marketing_cohort_operations_snapshot(uuid,uuid,uuid) FROM authenticated');}
   await assert.rejects(read(sales),e=>e.code==='42501');await assert.rejects(read(admin,other),e=>e.code==='42501');await assert.rejects(read(admin,company,randomUUID()),e=>e.code==='P0002');
  });
  await t.test('actual confirmed bookings after cohort end join paid Leads in the same snapshot',async()=>{
   const raw=await read(),r=reportCohortOperations(raw);assert.equal(r.counts.qualifiedGroups,2);assert.equal(r.counts.bookedGroups,2);assert.equal(r.appointmentTotal,2);
   assert.equal(r.counts.pendingHandoffs,2);assert.equal(r.counts.waitingGroups,2);assert.equal(r.counts.withoutCareGroups,0);assert.ok(r.excluded.companyBookingsNotAttributed>0);
   assert.ok(r.appointments.every(x=>Date.parse(x.startsAt)>Date.parse(r.period.untilExclusive)));assert.equal(raw.asOf,raw.facts.asOf);assert.equal(raw.asOf,raw.operations.asOf);assert.deepEqual(raw.facts.identity,raw.operations.identity);
   assert.ok(!JSON.stringify(r).includes('0930000001'));assert.ok(!JSON.stringify(r).includes('Synthetic address'));assert.equal(r.aiMaySend,false);
  });
  await t.test('lost contact mapping becomes attribution gap plus care connection review, not zero workload',async()=>{
   await db.query("UPDATE facebook_contacts SET lead_id=NULL WHERE page_id='123' AND psid=$1",[b.psid]);
   try{const r=reportCohortOperations(await read());assert.equal(r.counts.bookedGroups,1);assert.equal(r.counts.withoutCareGroups,1);assert.equal(r.counts.waitingGroups,2);assert.ok(r.attention.some(x=>x.leadId===b.lead&&x.reason==='CARE_CONNECTION_NOT_ESTABLISHED'));}
   finally{await db.query("UPDATE facebook_contacts SET lead_id=$2 WHERE page_id='123' AND psid=$1",[b.psid,b.lead]);}
  });
  await t.test('foreign Lead mapping hides foreign title and removes it from paid attribution',async()=>{
   await db.query("UPDATE crm_leads SET company_id=$2,title='PRIVATE CROSS COMPANY' WHERE id=$1",[b.lead,other]);
   try{const r=reportCohortOperations(await read());assert.equal(r.counts.bookedGroups,1);assert.equal(r.counts.observedPaidGroups,1);assert.ok(!JSON.stringify(r).includes('PRIVATE CROSS COMPANY'));assert.equal(r.excluded.unlinkedProofs,1);}
   finally{await db.query("UPDATE crm_leads SET company_id=$2,title='Synthetic survey' WHERE id=$1",[b.lead,company]);await qualify(b.lead);}
  });
  await t.test('one MVCC snapshot does not mix a concurrent qualification change and STOP with prior cohort facts',async()=>{
   const original=(await db.query("SELECT pg_get_functiondef('marketing_measurement.operations_facts(uuid,uuid,jsonb)'::regprocedure) d")).rows[0].d;
   const marker='threads AS MATERIALIZED(SELECT * FROM public.crm_care_threads';assert.ok(original.includes(marker));
   await db.query(original.replace(marker,"threads AS MATERIALIZED(SELECT t.* FROM public.crm_care_threads t CROSS JOIN (SELECT pg_advisory_lock(678027),pg_advisory_unlock(678027)) barrier"));
   await db.query('SELECT pg_advisory_lock(678027)');const pending=read(admin,company,trial,peers[1]).then(value=>({value}),error=>({error}));
   try{
    try{
     let blocked=false;for(let i=0;i<100;i++){const q=await db.query("SELECT 1 FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT marketing_cohort_operations_snapshot%'");if(q.rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);
     await qualify(a.lead,'REJECTED');const care=await query('crm_care_read',[admin,company,a.thread]);
     await query('crm_care_control',[admin,company,randomUUID(),{threadId:a.thread,action:'OPT_OUT',expectedVersion:care.version,reason:'Synthetic simultaneous STOP and qualification change'}]);
    }finally{await db.query('SELECT pg_advisory_unlock(678027)');}
    const result=await pending;if(result.error)throw result.error;const old=reportCohortOperations(result.value);assert.equal(old.counts.qualifiedGroups,2);assert.equal(old.counts.optedOut,0);
   }finally{await pending;await db.query(original);}
   const current=reportCohortOperations(await read());assert.equal(current.counts.qualifiedGroups,1);assert.equal(current.counts.rejectedGroups,1);assert.equal(current.counts.optedOut,1);assert.equal(current.counts.bookedGroups,2);assert.ok(!current.attention.some(x=>x.kind==='CARE'&&x.leadId===a.lead));
  });
  await t.test('authority is checked after waiting for company lock; NULL active is denied',async()=>{
   const pid=(await peers[1].query('SELECT pg_backend_pid() p')).rows[0].p;await db.query('BEGIN');await db.query('UPDATE companies SET is_active=NULL WHERE id=$1',[company]);
   const pending=read(admin,company,trial,peers[1]).then(value=>({value}),error=>({error}));
   try{let blocked=false;for(let i=0;i<100;i++){await db.query('SELECT pg_stat_clear_snapshot()');const q=await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[pid]);if(q.rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);}
   finally{await db.query('COMMIT');}
   try{const result=await pending;assert.equal(result.error?.code,'42501');}finally{await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);}
  });
 }finally{await finished(a);await finished(b);}
};
