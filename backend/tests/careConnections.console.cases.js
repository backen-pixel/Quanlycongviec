'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createCareConnections}=require('../src/modules/marketingAutomation/careConnections');
module.exports=async(t,{db,peers,query,company,other,admin,sales,region,fresh,view,command,link,count,storage,waitLock,blocked})=>{
 const before=await fresh(),pending=await command(before);
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/681_crm_care_connection_choices.sql'),'utf8');await db.query(sql);await db.query(sql);
 const search=(c,text,client=peers[0],actor=admin,cid=company)=>query('crm_care_connection_choices',[actor,cid,c.thread,text],client);
 const close=(c,cmd,key,client=peers[0],actor=admin)=>query('crm_care_connection_close',[actor,company,key,cmd],client);
 const cancelCount=c=>count(c,'crm_care_control.connection_cancellations');
 await t.test('search migration is repeatable and preserves the exact version of a pending SQL680 command',async()=>{
  assert.equal((await view(before)).version,pending.expectedVersion);const r=await link(before,pending);assert.equal(r.leadId,before.lead);assert.equal(await count(before),1);
 });
 await t.test('search is bounded, literal, scoped and never an identity decision',async()=>{
  const c=await fresh(),needle='literal_%_'+randomUUID();await db.query('UPDATE crm_leads SET title=$2 WHERE id=$1',[c.lead,needle]);
  const found=await search(c,needle.toUpperCase());assert.deepEqual(found.items.map(x=>x.id),[c.lead]);assert.equal(found.automaticallyVerified,false);assert.equal(found.sendAllowed,false);assert.equal(found.hasMore,false);
  assert.equal((await search(c,'missing_'+randomUUID())).items.length,0);
  await assert.rejects(search(c,needle,peers[0],admin,other),e=>e.code==='42501');await assert.rejects(search(c,'missing',peers[0],sales),e=>e.code==='42501');
  for(const term of ['', 'a','x'.repeat(101)])await assert.rejects(search(c,term),e=>e.code==='22023');
  await db.query('DELETE FROM user_company_regions WHERE user_id=$1 AND region_id=$2',[sales,region]);
  try{assert.equal((await search(c,needle)).items.length,0);}finally{await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[sales,region]);}
  assert.equal(await count(c),0);assert.equal(await cancelCount(c),0);
 });
 await t.test('candidate limit reports more without duplicate rows or unbounded disclosure',async()=>{
  const c=await fresh(),needle='candidate_'+randomUUID();await db.query('UPDATE crm_leads SET title=$2 WHERE id=$1',[c.lead,needle]);
  for(let i=0;i<21;i++)await db.query(`INSERT INTO crm_leads SELECT (jsonb_populate_record(NULL::crm_leads,to_jsonb(l)||jsonb_build_object('id',$2::uuid,'code',$3::text,'title',$4::text))).* FROM crm_leads l WHERE id=$1`,[c.lead,randomUUID(),'SYNTHETIC_'+randomUUID(),needle]);
  const found=await search(c,needle);assert.equal(found.items.length,20);assert.equal(new Set(found.items.map(x=>x.id)).size,20);assert.equal(found.hasMore,true);
 });
 await t.test('Lead-only mapping can be completed with evidence; conflicting Customer or inverse is never reported complete',async()=>{
  const partial=await fresh({enrolled:false}),conflict=await fresh({enrolled:false}),inverse=await fresh({enrolled:false}),otherLead=await fresh();
  for(const [c,customer]of [[partial,null],[conflict,otherLead.customer],[inverse,inverse.customer]]){
   const contact=randomUUID();await db.query('INSERT INTO facebook_contacts(id,page_id,psid,lead_id,customer_id) VALUES($1,$2,$3,$4,$5)',[contact,c.page,c.psid,c.lead,customer]);
   if(c===inverse)await db.query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1',[otherLead.lead,contact]);
   await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,true,$3,'Synthetic isolated legacy mapping review')",[c.page,company,admin]);
  }
  const initial=await view(partial);assert.equal(initial.alreadyLinked,true);assert.equal(initial.canLink,true);assert.equal(initial.mappingComplete,false);
  await link(partial,await command(partial));assert.equal((await view(partial)).mappingComplete,true);
  for(const c of [conflict,inverse]){const v=await view(c);assert.equal(v.alreadyLinked,true);assert.equal(v.canLink,false);assert.equal(v.mappingComplete,false);await assert.rejects(link(c,await command(c)),e=>e.code==='40001');}
 });
 await t.test('legacy company and recipient with both tenant IDs null remain searchable; one-sided mismatch is hidden',async()=>{
  const c=await fresh(),needle='legacy_'+randomUUID();await db.query('UPDATE crm_leads SET title=$2 WHERE id=$1',[c.lead,needle]);
  await db.query('BEGIN');
  try{
   await db.query('UPDATE companies SET tenant_id=NULL WHERE id=$1',[company]);await db.query('UPDATE users SET tenant_id=NULL WHERE id=ANY($1::uuid[])',[[admin,sales]]);
   await db.query('SET LOCAL ROLE service_role');assert.deepEqual((await search(c,needle,db)).items.map(x=>x.id),[c.lead]);assert.equal((await view(c,db)).leadId,c.lead);
   await db.query('RESET ROLE');await db.query('UPDATE users SET tenant_id=$2 WHERE id=$1',[sales,randomUUID()]);await db.query('SET LOCAL ROLE service_role');assert.equal((await search(c,needle,db)).items.length,0);
  }finally{await db.query('ROLLBACK');}
 });
 await t.test('private cancellation and helpers deny app roles; current Page authority is checked even for zero search results',async()=>{
  const c=await fresh(),cmd=await command(c);
  for(const role of ['anon','authenticated','service_role']){
   await db.query('SET ROLE '+role);try{
    await assert.rejects(db.query('SELECT * FROM crm_care_control.connection_cancellations'),e=>e.code==='42501');
    await assert.rejects(db.query('SELECT crm_care_control.connection_base($1,$2,$3)',[admin,company,c.thread]),e=>e.code==='42501');
    await assert.rejects(db.query('SELECT crm_care_control.link_before_console($1,$2,$3,$4)',[admin,company,randomUUID(),cmd]),e=>e.code==='42501');
    if(role!=='service_role'){await assert.rejects(search(c,'missing',db),e=>e.code==='42501');await assert.rejects(close(c,cmd,randomUUID(),db),e=>e.code==='42501');}
   }finally{await db.query('RESET ROLE');}
  }
  await db.query('UPDATE crm_care_control.connection_pages SET active=false WHERE page_id=$1',[c.page]);
  await assert.rejects(search(c,'missing'),e=>e.code==='42501');await assert.rejects(close(c,cmd,randomUUID()),e=>e.code==='42501');
 });
 await t.test('concurrent close persists once, rejects altered commands and blocks a late original link',async()=>{
  const c=await fresh(),cmd=await command(c),key=randomUUID();const results=await Promise.all([close(c,cmd,key),close(c,cmd,key,peers[1])]);
  assert.ok(results.every(x=>x.status==='CANCELLED'));assert.equal(await cancelCount(c),1);assert.equal(await count(c),0);
  await assert.rejects(link(c,cmd,key),e=>e.code==='P6801');await assert.rejects(close(c,{...cmd,reason:cmd.reason+' changed'},key),e=>e.code==='23505');await assert.rejects(link(c,{...cmd,reason:cmd.reason+' changed'},key),e=>e.code==='23505');
  assert.equal((await query('crm_care_read',[admin,company,c.thread])).target.routingReady,false);
 });
 await t.test('closure survives stale CRM context; rollback does not leave an invented cancellation',async()=>{
  const c=await fresh(),cmd=await command(c),key=randomUUID();await c.receive([c.incoming('Synthetic later customer evidence')]);
  await assert.rejects(link(c,cmd,key),e=>e.code==='40001');
  await peers[0].query('BEGIN');try{assert.equal((await close(c,cmd,key)).status,'CANCELLED');}finally{await peers[0].query('ROLLBACK');}
  assert.equal(await cancelCount(c),0);assert.equal((await close(c,cmd,key)).status,'CANCELLED');await assert.rejects(link(c,cmd,key),e=>e.code==='P6801');
 });
 await t.test('close winning the transaction race blocks link after the lock releases',async()=>{
  const c=await fresh(),cmd=await command(c),key=randomUUID(),pid=await waitLock(peers[2]);await peers[1].query('BEGIN');let delayed;
  try{
   assert.equal((await close(c,cmd,key,peers[1])).status,'CANCELLED');delayed=link(c,cmd,key,peers[2]).then(value=>({value}),error=>({error}));await blocked(pid);
  }finally{await peers[1].query('COMMIT');}
  assert.equal((await delayed).error?.code,'P6801');assert.equal(await count(c),0);assert.equal(await cancelCount(c),1);
 });
 await t.test('link winning the transaction race remains linked; close reports recorded and preserves STOP',async()=>{
  const c=await fresh();await c.receive([c.incoming('STOP')]);const cmd=await command(c),key=randomUUID(),pid=await waitLock(peers[2]);await peers[1].query('BEGIN');let delayed;
  try{await link(c,cmd,key,peers[1]);delayed=close(c,cmd,key,peers[2]).then(value=>({value}),error=>({error}));await blocked(pid);}finally{await peers[1].query('COMMIT');}
  const result=await delayed;if(result.error)throw result.error;assert.equal(result.value.status,'ALREADY_RECORDED');assert.equal(await cancelCount(c),0);assert.equal(await count(c),1);
  const current=await query('crm_care_read',[admin,company,c.thread]);assert.equal(current.mode,'OPTED_OUT');assert.equal(current.target.leadId,c.lead);assert.equal((await link(c,cmd,key)).replayed,true);
 });
 await t.test('API search to selection to persisted command to close uses actual SQL and scope contracts',async()=>{
  const c=await fresh(),needle='api_'+randomUUID();await db.query('UPDATE crm_leads SET title=$2 WHERE id=$1',[c.lead,needle]);
  const service=createCareConnections({db:storage(),isPrimary:()=>true,env:{VPT_CARE_CONNECTIONS:'1'}}),s=await import('../../frontend/src/components/facebook/careConnectionState.mjs');
  const run=async(operation,fields)=>{const res={code:200,set(){return this;},status(x){this.code=x;return this;},json(x){this.body=x;return this;}};await service.handle({user:{userId:admin},...fields},res,operation);assert.equal(res.code,200,JSON.stringify(res.body));return res.body;};
  const found=s.connectionChoices(await run('choices',{query:{companyId:company,threadId:c.thread,search:needle}}),admin,company,c.thread,needle);assert.deepEqual(found.items.map(x=>x.id),[c.lead]);
  const selected=s.connectionView(await run('read',{query:{companyId:company,threadId:c.thread,leadId:c.lead}}),admin,company,c.thread,c.lead);
  const map=new Map(),session={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const p=s.saveConnectionPending(session,{actorId:admin,companyId:company,threadId:c.thread,requestId:randomUUID(),intent:'LINK',command:{...(await command(c)),expectedVersion:selected.version}});
  const linked=s.connectionReceipt(await run('link',{body:{companyId:company,requestId:p.requestId,command:p.command}}),p);assert.equal(linked.currentLink,true);
  const closing=s.closeConnectionPending(session,s.readConnectionPending(session,admin,company,c.thread));assert.equal(closing.intent,'CLOSE');
  const result=s.connectionClosure(await run('close',{body:{companyId:company,requestId:closing.requestId,command:closing.command}}),closing);assert.equal(result.status,'ALREADY_RECORDED');assert.equal((await view(c)).alreadyLinked,true);
 });
};
