'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async(t,{db,peers,query,company,other,admin,sales,region,fresh})=>{
 for(const file of ['684_facebook_batch_journal.sql','686_facebook_batch_stop.sql']){const sql=fs.readFileSync(path.resolve(__dirname,'../../database',file),'utf8');await db.query(sql);await db.query(sql);}
 const fixture=async()=>{const f=await fresh({enrolled:false});f.contact=randomUUID();
  await db.query('UPDATE facebook_pages SET default_region_id=$2,default_lead_owner_id=$3 WHERE page_id=$1',[f.page,region,sales]);
  await db.query('INSERT INTO facebook_contacts(id,page_id,psid,lead_id,customer_id) VALUES($1,$2,$3,$4,$5)',[f.contact,f.page,f.psid,f.lead,f.customer]);return f;};
 const begin=(ids,key=randomUUID(),token=randomUUID(),client=peers[0],who=admin,cid=company)=>query('crm_facebook_batch_begin',[who,cid,key,ids,token],client);
 const read=(key,client=peers[0],who=admin,cid=company)=>query('crm_facebook_batch_read',[who,cid,key],client);
 const step=(key,token,contact,action,result=null,client=peers[0])=>query('crm_facebook_batch_step',[key,token,contact,action,result],client);
 const result=f=>({contact_id:f.contact,status:'linked',lead_id:f.lead});
 const prepared=async()=>{const f=await fixture(),key=randomUUID(),token=randomUUID();await begin([f.contact],key,token);return{...f,key,token};};
 const complete=async f=>{await step(f.key,f.token,f.contact,'START');await step(f.key,f.token,f.contact,'RESULT',result(f));await step(f.key,f.token,null,'FINISH');};
 await t.test('journal private tables and functions are inaccessible to public roles',async()=>{
  const f=await fixture();for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);
   try{await assert.rejects(db.query('SELECT * FROM crm_batch_control.runs'),e=>e.code==='42501');
    if(role!=='service_role')await assert.rejects(begin([f.contact],randomUUID(),randomUUID(),db),e=>e.code==='42501');}
   finally{await db.query('RESET ROLE');}}
  await assert.rejects(begin([f.contact],randomUUID(),randomUUID(),db),e=>e.code==='42501');
 });
 await t.test('journal validates selection and company before taking any claim',async()=>{
  const f=await fixture();for(const ids of [[],[null],[f.contact,f.contact],Array(501).fill(f.contact)])await assert.rejects(begin(ids),e=>e.code==='22023');
  await assert.rejects(begin([f.contact],randomUUID(),randomUUID(),peers[0],admin,other),e=>e.code==='42501');
  await assert.rejects(begin([f.contact,randomUUID()]),e=>e.code==='42501');assert.equal((await begin([f.contact])).execute,true);
 });
 await t.test('one-shot claim survives lost begin response and a different process reads pending without execution',async()=>{
  const f=await prepared();const replay=await begin([f.contact],f.key,randomUUID(),peers[1]);assert.equal(replay.execute,false);
  assert.equal(replay.run.items[0].state,'PENDING');assert.equal((await read(f.key,peers[1])).items[0].contactId,f.contact);
  await assert.rejects(step(f.key,randomUUID(),f.contact,'START'),e=>e.code==='42501');
 });
 await t.test('two replicas using the same UUID dispatch only once',async()=>{
  const f=await fixture(),key=randomUUID(),tokens=[randomUUID(),randomUUID()];
  const rs=await Promise.all(tokens.map((token,n)=>begin([f.contact],key,token,peers[n])));assert.equal(rs.filter(r=>r.execute).length,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_batch_control.runs WHERE request_id=$1',[key])).rows[0].n,1);
 });
 await t.test('different UUID cannot overlap PENDING, RUNNING or UNKNOWN contacts',async()=>{
  const f=await prepared();for(const state of ['PENDING','RUNNING','UNKNOWN']){
   if(state==='RUNNING')await step(f.key,f.token,f.contact,'START');if(state==='UNKNOWN')await step(f.key,f.token,null,'STOP');
   await assert.rejects(begin([f.contact],randomUUID(),randomUUID(),peers[1]),e=>e.code==='23505');
  }
  assert.equal((await read(f.key)).items[0].state,'UNKNOWN');
 });
 await t.test('same request with changed selection or actor is rejected',async()=>{
  const f=await prepared(),g=await fixture();await assert.rejects(begin([g.contact],f.key),e=>e.code==='23505');
  await assert.rejects(begin([f.contact],f.key,randomUUID(),peers[0],sales),e=>e.code==='23505');
 });
 await t.test('completed response can be recovered after reload without another creator or token',async()=>{
  const f=await prepared();await complete(f);const r=await read(f.key,peers[1]);assert.equal(r.state,'COMPLETED');assert.equal(r.items[0].result.lead_id,f.lead);
  assert.equal((await begin([f.contact],f.key)).execute,false);assert.ok(!JSON.stringify(r).includes(f.token));
 });
 await t.test('lost RESULT acknowledgement can repeat only the same result',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');const value=result(f);await step(f.key,f.token,f.contact,'RESULT',value);
  assert.equal(await step(f.key,f.token,f.contact,'RESULT',value),true);
  await assert.rejects(step(f.key,f.token,f.contact,'RESULT',{...value,lead_id:randomUUID()}),e=>e.code==='40001');
  await assert.rejects(step(f.key,f.token,f.contact,'START'),e=>e.code==='40001');await step(f.key,f.token,null,'FINISH');
 });
 await t.test('last confirmed RESULT completes atomically even when FINISH is never dispatched',async()=>{
  const f=await fixture(),g=await fixture(),key=randomUUID(),token=randomUUID();await begin([f.contact,g.contact],key,token);
  await step(key,token,f.contact,'START');await step(key,token,f.contact,'RESULT',result(f));
  assert.equal((await read(key,peers[1])).state,'RUNNING');
  await step(key,token,g.contact,'START');await step(key,token,g.contact,'RESULT',{contact_id:g.contact,status:'skipped',reason:'PHONE_REQUIRED'});
  const r=await read(key,peers[1]);assert.equal(r.state,'COMPLETED');assert.deepEqual(r.items.map(x=>x.state),['LINKED','SKIPPED']);
  const replay=await begin([f.contact,g.contact],key,randomUUID(),peers[1]);assert.equal(replay.execute,false);assert.equal(replay.run.state,'COMPLETED');
  await step(key,token,null,'FINISH');assert.equal((await read(key)).state,'COMPLETED');
 });
 await t.test('STOP atomically preserves UNKNOWN and cancels only never-started items',async()=>{
  const f=await fixture(),g=await fixture(),key=randomUUID(),token=randomUUID();await begin([f.contact,g.contact],key,token);
  await step(key,token,f.contact,'START');await step(key,token,null,'STOP');const r=await read(key);
  assert.deepEqual(r.items.map(x=>x.state),['UNKNOWN','CANCELLED']);assert.equal(r.state,'REVIEW');
  await assert.rejects(step(key,token,f.contact,'RESULT',result(f)),e=>e.code==='40001');
  await assert.rejects(step(key,token,g.contact,'START'),e=>e.code==='40001');assert.equal((await begin([g.contact])).execute,true);
 });
 await t.test('rollback of result storage leaves RUNNING, never a falsely completed item',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');await peers[0].query('BEGIN');await step(f.key,f.token,f.contact,'RESULT',result(f));await peers[0].query('ROLLBACK');
  assert.equal((await read(f.key)).items[0].state,'RUNNING');await assert.rejects(step(f.key,f.token,null,'FINISH'),e=>e.code==='40001');
  await step(f.key,f.token,null,'STOP');assert.equal((await read(f.key)).items[0].state,'UNKNOWN');
 });
 await t.test('actor/company/tenant revocation blocks reads and capability checks but still permits stop audit',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');
  const tenant=(await db.query('SELECT tenant_id FROM companies WHERE id=$1',[company])).rows[0].tenant_id;
  for(const [table,key,value]of[['users','id',admin],['companies','id',company],['tenants','id',tenant]]){
   await db.query(`UPDATE ${table} SET is_active=NULL WHERE ${key}=$1`,[value]);
   try{await assert.rejects(read(f.key),e=>e.code==='42501');await assert.rejects(step(f.key,f.token,f.contact,'CHECK'),e=>e.code==='42501');}
   finally{await db.query(`UPDATE ${table} SET is_active=true WHERE ${key}=$1`,[value]);}
  }
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[admin]);
  try{assert.equal(await step(f.key,f.token,null,'STOP'),true);}finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[admin]);}
 });
 await t.test('current contact Page movement hides details on read and replay',async()=>{
  const f=await prepared();await complete(f);await db.query('UPDATE facebook_pages SET default_company_id=$2 WHERE page_id=$1',[f.page,other]);
  await assert.rejects(read(f.key),e=>e.code==='42501');await assert.rejects(begin([f.contact],f.key),e=>e.code==='42501');
 });
 await t.test('historical Lead movement remains protected after contact mapping is cleared',async()=>{
  const f=await prepared();await complete(f);await db.query('UPDATE facebook_contacts SET lead_id=NULL WHERE id=$1',[f.contact]);
  await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[f.lead,other]);
  await assert.rejects(read(f.key),e=>e.code==='42501');await assert.rejects(begin([f.contact],f.key),e=>e.code==='42501');
 });
 await t.test('staff cannot read a historical Lead reassigned after contact remap',async()=>{
  const f=await fixture(),key=randomUUID(),token=randomUUID();await begin([f.contact],key,token,peers[0],sales);
  await step(key,token,f.contact,'START');await step(key,token,f.contact,'RESULT',result(f));await step(key,token,null,'FINISH');
  await db.query('UPDATE facebook_contacts SET lead_id=NULL WHERE id=$1',[f.contact]);
  await db.query('UPDATE crm_leads SET assigned_to=$2,lead_owner_id=$2 WHERE id=$1',[f.lead,admin]);
  await assert.rejects(read(key,peers[0],sales),e=>e.code==='42501');await assert.rejects(begin([f.contact],key,randomUUID(),peers[0],sales),e=>e.code==='42501');
 });
 await t.test('history discovery uses bounded keyset pages and reveals only own run metadata',async()=>{
  const all=[];let cursor=null;
  do{const r=await query('crm_facebook_batch_list',[admin,company,cursor]);assert.ok(r.runs.length<=20);
   for(const x of r.runs)assert.deepEqual(Object.keys(x).sort(),['createdAt','requestId','state']);
   all.push(...r.runs.map(x=>x.requestId));cursor=r.nextCursor;
  }while(cursor);
  assert.equal(all.length,new Set(all).size);assert.equal(all.length,(await db.query('SELECT count(*)::int n FROM crm_batch_control.runs WHERE actor_id=$1 AND company_id=$2',[admin,company])).rows[0].n);
  await assert.rejects(query('crm_facebook_batch_list',[admin,company,randomUUID()]),e=>e.code==='22023');
 });
 await require('./facebookBatchStop.cases')(t,{db,peers,query,company,other,admin,sales,fixture,begin,read,step,result,prepared,complete});
 await require('./facebookLegacyHold.cases')(t,{db,peers,query,company,admin,prepared,begin,read,step});
 await require('./facebookBatchLinkReconciliation.cases')(t,{db,peers,query,company,other,admin,sales,fixture,begin,read,step,prepared});
};
