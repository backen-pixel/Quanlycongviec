'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,begin,finish,selection})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/690_crm_care_advisor_console.sql'),'utf8');await db.query(sql);await db.query(sql);
 const reason='Operator reconciles and cancels the synthetic request safely';
 const cancel=(c,key=c.key,client=peers[0])=>query('crm_care_advisor_cancel',[admin,company,key,c.thread,reason],client);
 const list=(c,after=null,client=peers[0])=>query('crm_care_advisor_list',[admin,company,c.thread,after],client);
 const observedLock=async pid=>{
  for(let i=0;i<150;i++){
   await db.query('SELECT pg_stat_clear_snapshot()');
   if((await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock'",[pid])).rowCount)return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('expected PostgreSQL lock wait');
 };
 await t.test('advisor console keeps private aliases/tombstones inaccessible to app roles',async()=>{
  for(const role of['anon','authenticated','service_role']){
   await db.query('SET ROLE '+role);try{
    await assert.rejects(db.query('SELECT * FROM crm_care_control.advisor_cancellations'),e=>e.code==='42501');
    await assert.rejects(query('crm_care_control.advisor_begin_before_console',[admin,company,randomUUID(),randomUUID(),'a'.repeat(32)],db),e=>e.code==='42501');
    if(role!=='service_role')await assert.rejects(query('crm_care_advisor_list',[admin,company,randomUUID(),null],db),e=>e.code==='42501');
   }finally{await db.query('RESET ROLE');}
  }
 });
 await t.test('advisor list discovers scoped request metadata without transcript/source/capability',async()=>{
  const c=await fixture(),r=await begin(c);const rows=await list(c);
  assert.equal(rows.companyId,company);assert.equal(rows.threadId,c.thread);assert.equal(rows.version,c.version);
  assert.equal(rows.threadBusy,true);assert.equal(rows.items[0].requestId,c.key);assert.equal(rows.send,false);
  for(const secret of[r.capability,c.psid,'100 triệu'])assert.equal(JSON.stringify(rows).includes(secret),false);
  await assert.rejects(query('crm_care_advisor_list',[sales,company,c.thread,null]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_advisor_list',[admin,other,c.thread,null]),e=>e.code==='42501');await cancel(c);
 });
 await t.test('advisor cancellation before BEGIN is durable, idempotent and rejects late begin',async()=>{
  const c=await fixture();assert.equal((await cancel(c)).outcome,'ABSENT_CANCELLED');
  assert.equal((await cancel(c)).replayed,true);await assert.rejects(begin(c),e=>e.code==='40001');
  assert.equal((await list(c)).items.length,0);
  await assert.rejects(query('crm_care_advisor_cancel',[admin,company,c.key,c.thread,reason+' changed']),e=>e.code==='23505');
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_care_control.advisor_runs WHERE request_id=$1',[c.key])).rows[0].n,0);
 });
 await t.test('advisor cancellation after BEGIN closes the run and fences delayed inference',async()=>{
  const c=await fixture(),r=await begin(c);assert.equal((await cancel(c)).outcome,'CLOSED');
  await assert.rejects(finish(c,r),e=>e.code==='23505');await assert.rejects(begin(c),e=>e.code==='40001');
  const v=await query('crm_care_advisor_read',[admin,company,c.key]);assert.equal(v.state,'REVIEW');assert.equal(v.result.reason,'OPERATOR_CLOSED');
  assert.equal((await list(c)).threadBusy,false);
 });
 await t.test('advisor cancellation preserves results already committed and does not claim no inference ran',async()=>{
  const c=await fixture(),r=await begin(c),done=await finish(c,r);
  assert.equal((await cancel(c)).outcome,'ALREADY_TERMINAL');
  assert.deepEqual((await query('crm_care_advisor_read',[admin,company,c.key])).result,done.result);
  await assert.rejects(begin(c),e=>e.code==='40001');
 });
 await t.test('advisor cancelling a retry key blocks a delayed retry without consuming an attempt',async()=>{
  const c=await fixture(),r=await begin(c);await finish(c,r,{failure:'MODEL_UNAVAILABLE'});
  const key=randomUUID();assert.equal((await cancel(c,key)).outcome,'ABSENT_CANCELLED');
  await assert.rejects(query('crm_care_advisor_retry',[admin,company,key,c.key,c.version,reason]),e=>e.code==='40001');
  assert.equal((await list(c)).items.length,1);
 });
 await t.test('advisor cancel and discovery enforce current actor/company/thread and cursor boundaries',async()=>{
  const c=await fixture(),d=await fixture();await begin(c);
  await assert.rejects(query('crm_care_advisor_cancel',[admin,company,c.key,d.thread,reason]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_advisor_cancel',[sales,company,c.key,c.thread,reason]),e=>e.code==='42501');
  await assert.rejects(list(d,c.key),e=>e.code==='42501');
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{await assert.rejects(cancel(c),e=>e.code==='42501');await assert.rejects(list(c),e=>e.code==='42501');}
  finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
  await cancel(c);
 });
 await t.test('advisor list hides another permitted operator records but retains the thread busy guard',async()=>{
  const c=await fixture(),second=randomUUID();await begin(c);
  await db.query("INSERT INTO users SELECT $1,company_id,tenant_id,'admin',true FROM users WHERE id=$2",[second,admin]);
  const rows=await query('crm_care_advisor_list',[second,company,c.thread,null]);
  assert.deepEqual(rows.items,[]);assert.equal(rows.threadBusy,true);
  await assert.rejects(query('crm_care_advisor_list',[second,company,c.thread,c.key]),e=>e.code==='42501');
  await assert.rejects(query('crm_care_advisor_cancel',[second,company,c.key,c.thread,reason]),e=>e.code==='42501');await cancel(c);
 });
 await t.test('advisor list pages all own records and does not repeat a cursor row',async()=>{
  const c=await fixture();for(let i=0;i<23;i++){
   c.key=randomUUID();c.version=(await query('crm_care_read',[admin,company,c.thread])).version;
   const r=await begin(c);await finish(c,r,{failure:'MODEL_UNAVAILABLE'});
   await c.receive([c.incoming('Synthetic next conversation revision '+i)]);
  }
  const a=await list(c),b=await list(c,a.nextAfter);
  assert.equal(a.items.length,20);assert.equal(b.items.length,3);assert.equal(b.nextAfter,null);
  assert.equal(new Set([...a.items,...b.items].map(x=>x.requestId)).size,23);
 });
 await t.test('advisor cancelled BEGIN waits for cancellation commit and then refuses inference',async()=>{
  const c=await fixture(),pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await peers[0].query('BEGIN');await cancel(c);
  const pending=assert.rejects(begin(c,c.key,peers[1]),e=>e.code==='40001');
  try{await observedLock(pid);await peers[0].query('COMMIT');await pending;}
  finally{await peers[0].query('ROLLBACK');await pending.catch(()=>{});}
 });
 await t.test('advisor cancel waits for BEGIN commit then closes its one existing run',async()=>{
  const c=await fixture(),pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await peers[0].query('BEGIN');const r=await begin(c);
  const pending=cancel(c,c.key,peers[1]);pending.catch(()=>{});
  try{await observedLock(pid);await peers[0].query('COMMIT');assert.equal((await pending).outcome,'CLOSED');}
  finally{await peers[0].query('ROLLBACK');await pending.catch(()=>{});}
  await assert.rejects(finish(c,r),e=>e.code==='23505');
 });
 for(const first of['cancel','retry'])await t.test('advisor observed race '+first+' before the other retry/cancel transaction',async()=>{
  const c=await fixture(),r=await begin(c);await finish(c,r,{failure:'MODEL_UNAVAILABLE'});
  const key=randomUUID(),pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const retry=client=>query('crm_care_advisor_retry',[admin,company,key,c.key,c.version,reason],client);
  await peers[0].query('BEGIN');let pending;
  try{
   if(first==='cancel'){await cancel(c,key);pending=assert.rejects(retry(peers[1]),e=>e.code==='40001');}
   else{await retry(peers[0]);pending=cancel(c,key,peers[1]);pending.catch(()=>{});}
   await observedLock(pid);await peers[0].query('COMMIT');const outcome=await pending;
   if(first==='retry')assert.equal(outcome.outcome,'CLOSED');
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending.catch(()=>{});}
  assert.equal((await list(c)).threadBusy,false);
 });
 for(const first of['cancel','finish'])await t.test('advisor observed race '+first+' before the other finish/cancel transaction',async()=>{
  const c=await fixture(),r=await begin(c),pid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await peers[0].query('BEGIN');let pending;
  try{
   if(first==='cancel'){await cancel(c);pending=assert.rejects(finish(c,r,selection(r),peers[1]),e=>e.code==='23505');}
   else{await finish(c,r);pending=cancel(c,c.key,peers[1]);pending.catch(()=>{});}
   await observedLock(pid);await peers[0].query('COMMIT');const outcome=await pending;
   if(first==='finish')assert.equal(outcome.outcome,'ALREADY_TERMINAL');
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending.catch(()=>{});}
  const result=await query('crm_care_advisor_read',[admin,company,c.key]);
  assert.equal(result.state,first==='cancel'?'REVIEW':'DRAFT');
 });
 await t.test('advisor cancellation rollback restores admission without deleting committed evidence',async()=>{
  const c=await fixture();await peers[0].query('BEGIN');await cancel(c);await peers[0].query('ROLLBACK');
  const r=await begin(c);assert.equal(r.invoke,true);await finish(c,r,selection(r));
 });
};
