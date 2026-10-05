'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async(t,{db,peers,query,company,other,admin,sales,fixture,begin,read,step,result,prepared,complete})=>{
 const stop=(f,client=peers[0],who=admin,cid=company,ids=[f.contact])=>query('crm_facebook_batch_stop',[who,cid,f.key,ids],client);
 const audit=key=>db.query('SELECT * FROM crm_batch_control.stops WHERE request_id=$1',[key]).then(r=>r.rows);
 const business=f=>db.query('SELECT (SELECT to_jsonb(l) FROM crm_leads l WHERE id=$1) lead,(SELECT to_jsonb(c) FROM customers c WHERE id=$2) customer,(SELECT to_jsonb(x) FROM facebook_contacts x WHERE id=$3) contact',[f.lead,f.customer,f.contact]).then(r=>r.rows[0]);
 const contenderPid=(await peers[1].query('SELECT pg_backend_pid() pid')).rows[0].pid;
 async function race(first,second){
  await peers[0].query('BEGIN');let pending;
  try{
   const firstResult=await first();pending=second().then(value=>({value}),error=>({error}));
   let locked=false;
   for(let i=0;i<100;i++){await db.query('SELECT pg_stat_clear_snapshot()');const r=await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[contenderPid]);if(r.rows[0]?.wait_event_type==='Lock'){locked=true;break;}await db.query('SELECT pg_sleep(0.02)');}
   assert.ok(locked,'Contender reaches actual request/row lock');await peers[0].query('COMMIT');return{first:firstResult,second:await pending};
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending;}
 }
 await t.test('stop RPC and audit are private; invalid scope or selection creates no tombstone',async()=>{
  const f={...await fixture(),key:randomUUID()};
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM crm_batch_control.stops'),e=>e.code==='42501');if(role!=='service_role')await assert.rejects(stop(f,db),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
  await assert.rejects(stop(f,db),e=>e.code==='42501');await assert.rejects(stop(f,peers[0],admin,other),e=>e.code==='42501');
  for(const ids of [[],[null],[f.contact,f.contact],Array(501).fill(f.contact)])await assert.rejects(stop(f,peers[0],admin,company,ids),e=>e.code==='22023');
  assert.equal((await audit(f.key)).length,0);assert.equal((await begin([f.contact],f.key)).execute,true);
 });
 await t.test('STOP before BEGIN commits exact tombstone; delayed BEGIN never executes and CRM stays intact',async()=>{
  const f={...await fixture(),key:randomUUID(),token:randomUUID()},before=await business(f);
  const r=await race(()=>stop(f),()=>begin([f.contact],f.key,f.token,peers[1]));assert.equal(r.second.error,undefined);assert.equal(r.second.value.execute,false);assert.equal(r.second.value.run.items[0].state,'CANCELLED');
  assert.equal((await audit(f.key))[0].before_run,null);assert.deepEqual(await business(f),before);assert.equal((await begin([f.contact])).execute,true);
 });
 await t.test('BEGIN before STOP with no START frees only never-started claim and revokes old capability',async()=>{
  const f={...await fixture(),key:randomUUID(),token:randomUUID()};
  const r=await race(()=>begin([f.contact],f.key,f.token),()=>stop(f,peers[1]));assert.equal(r.first.execute,true);assert.equal(r.second.error,undefined);assert.equal(r.second.value.items[0].state,'CANCELLED');
  for(const action of ['START','CHECK','STOP','FINISH'])await assert.rejects(step(f.key,f.token,['START','CHECK'].includes(action)?f.contact:null,action),e=>e.code==='42501');
  assert.equal((await begin([f.contact],f.key)).execute,false);assert.equal((await begin([f.contact])).execute,true);
 });
 await t.test('START before STOP remains UNKNOWN and keeps claim despite existing complete CRM mapping',async()=>{
  const f=await prepared(),before=await business(f),r=await race(()=>step(f.key,f.token,f.contact,'START'),()=>stop(f,peers[1]));
  assert.equal(r.second.error,undefined);assert.equal(r.second.value.items[0].state,'UNKNOWN');assert.equal(r.second.value.state,'REVIEW');
  await assert.rejects(begin([f.contact]),e=>e.code==='23505');assert.deepEqual(await business(f),before);
 });
 await t.test('STOP before START fences the worker before it can enter creator',async()=>{
  const f=await prepared(),r=await race(()=>stop(f),()=>step(f.key,f.token,f.contact,'START',null,peers[1]));
  assert.equal(r.second.error?.code,'42501');assert.equal((await read(f.key)).items[0].state,'CANCELLED');
 });
 await t.test('RESULT before STOP preserves committed linkage and completed run',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');const before=await business(f);
  const r=await race(()=>step(f.key,f.token,f.contact,'RESULT',result(f)),()=>stop(f,peers[1]));
  assert.equal(r.second.error,undefined);assert.equal(r.second.value.state,'COMPLETED');assert.deepEqual(r.second.value.items[0].result,result(f));assert.deepEqual(await business(f),before);
 });
 await t.test('STOP before RESULT rejects late success and retains UNKNOWN claim and CRM evidence',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');const before=await business(f);
  const r=await race(()=>stop(f),()=>step(f.key,f.token,f.contact,'RESULT',result(f),peers[1]));
  assert.equal(r.second.error?.code,'42501');assert.equal((await read(f.key)).items[0].state,'UNKNOWN');await assert.rejects(begin([f.contact]),e=>e.code==='23505');assert.deepEqual(await business(f),before);
 });
 await t.test('mixed stop preserves known results, retains running claim and releases pending claim',async()=>{
  const f=await fixture(),g=await fixture(),h=await fixture(),key=randomUUID(),token=randomUUID(),ids=[f.contact,g.contact,h.contact];
  await begin(ids,key,token);await step(key,token,f.contact,'START');await step(key,token,f.contact,'RESULT',result(f));await step(key,token,g.contact,'START');
  const r=await stop({...f,key},peers[0],admin,company,ids);assert.deepEqual(r.items.map(i=>i.state),['LINKED','UNKNOWN','CANCELLED']);
  await assert.rejects(begin([g.contact]),e=>e.code==='23505');assert.equal((await begin([h.contact])).execute,true);assert.deepEqual(r.items[0].result,result(f));
 });
 await t.test('stop replay keeps one immutable audit and rejects another actor or changed ordered selection',async()=>{
  const f=await prepared(),g=await fixture();await stop(f);const before=await audit(f.key);await stop(f,peers[1]);assert.deepEqual(await audit(f.key),before);
  await assert.rejects(stop(f,peers[0],sales),e=>e.code==='23505');await assert.rejects(stop(f,peers[0],admin,company,[g.contact]),e=>e.code==='23505');
  const key=randomUUID();await stop({...f,key},peers[0],admin,company,[f.contact,g.contact]);
  await assert.rejects(begin([g.contact,f.contact],key),e=>e.code==='23505');
 });
 await t.test('stop replay validates current actor, company and historical Lead even after contact remap',async()=>{
  const f=await prepared();await complete(f);await stop(f);
  for(const [table,value]of [['users',admin],['companies',company]]){await db.query('UPDATE '+table+' SET is_active=NULL WHERE id=$1',[value]);try{await assert.rejects(stop(f),e=>e.code==='42501');}finally{await db.query('UPDATE '+table+' SET is_active=true WHERE id=$1',[value]);}}
  await db.query('UPDATE facebook_contacts SET lead_id=NULL WHERE id=$1',[f.contact]);await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[f.lead,other]);await assert.rejects(stop(f),e=>e.code==='42501');assert.equal((await audit(f.key)).length,1);
 });
 await t.test('rollback of STOP keeps original capability and claim; no false cancellation receipt',async()=>{
  const f=await prepared();await peers[0].query('BEGIN');await stop(f);await peers[0].query('ROLLBACK');
  assert.equal((await audit(f.key)).length,0);assert.equal((await read(f.key)).items[0].state,'PENDING');await assert.rejects(begin([f.contact]),e=>e.code==='23505');
  await step(f.key,f.token,f.contact,'START');assert.equal((await read(f.key)).items[0].state,'RUNNING');
 });
 await t.test('late worker STOP cannot alter operator cancellation audit or results',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');await stop(f);const before=await audit(f.key),run=await read(f.key);
  await assert.rejects(step(f.key,f.token,null,'STOP'),e=>e.code==='42501');await assert.rejects(step(f.key,f.token,null,'FINISH'),e=>e.code==='42501');
  assert.deepEqual(await audit(f.key),before);assert.deepEqual(await read(f.key),run);
 });
};
