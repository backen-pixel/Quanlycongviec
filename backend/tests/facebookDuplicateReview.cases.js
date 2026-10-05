'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {readFacebookDuplicateReview}=require('../src/helpers/facebookDuplicateReview');
module.exports=async(t,{db,peers,company,other,admin,sales,region,tenant})=>{
 const snapshot=()=>peers[0].query('SELECT crm_identity_review_snapshot($1,$2) r',[admin,company]).then(x=>x.rows[0].r);
 const record=(command,key=randomUUID())=>peers[0].query('SELECT crm_identity_review_record($1,$2,$3,$4) r',[admin,company,key,command]).then(x=>x.rows[0].r);
 const adapter={async rpc(name,args){assert.equal(name,'crm_identity_review_snapshot');try{return{data:(await peers[0].query('SELECT crm_identity_review_snapshot($1,$2) r',[args.p_actor,args.p_company])).rows[0].r,error:null};}catch(error){return{data:null,error};}}};
 const read=(who=admin,cid=company,method='GET')=>readFacebookDuplicateReview(adapter,{method,user:{userId:who},[method==='GET'?'query':'body']:{company_id:cid}},{isPrimary:()=>true,enabled:()=>true});
 const a=randomUUID(),b=randomUUID(),customers=[randomUUID(),randomUUID()];
 for(const [i,id]of [a,b].entries()){
  await db.query("INSERT INTO customers VALUES($1,$2,'Synthetic duplicate review',$3,NULL,'HCM','HCM')",[customers[i],company,'0998881234']);
  await db.query("INSERT INTO crm_leads(id,company_id,customer_id,region_id,assigned_to,lead_owner_id,type,title) VALUES($1,$2,$3,$4,$5,$5,$6,'Synthetic shared contact')",[id,company,customers[i],region,admin,i?'deal':'lead']);
 }
 const command=async()=>({action:'DISTINCT',leadId:a,peerLeadId:b,snapshotToken:(await snapshot()).snapshotToken,evidence:'Verified different synthetic people sharing a contact number.'});
 const rows=async()=>(await db.query('SELECT (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM crm_leads l) leads,(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM customers c) customers,(SELECT count(*)::int FROM crm_identity_review_events) events')).rows[0];
 let accepted,key;
 await t.test('Facebook company reader covers Lead and Deal without changing customer, lead or audit rows',async()=>{
  const before=await rows(),r=await read(),ids=r.groups.flatMap(g=>g.members).filter(m=>m.available).map(m=>m.leadId);
  assert.ok(ids.includes(a)&&ids.includes(b));assert.ok(r.candidates.some(c=>c.leftGroupId===[a,b].sort()[0]&&c.rightGroupId===[a,b].sort()[1]&&!c.resolved));
  assert.equal(r.readOnly,true);assert.equal(r.merged,0);assert.ok(!JSON.stringify(r).includes('0998881234'));assert.deepEqual(await rows(),before);
 });
 await t.test('readonly GET and POST deny current foreign company, non-admin and suspended tenant',async()=>{
  for(const method of ['GET','POST']){await assert.rejects(read(admin,other,method),e=>e.status===403);await assert.rejects(read(sales,company,method),e=>e.status===403);}
  await db.query('UPDATE tenants SET is_active=false WHERE id=$1',[tenant]);
  try{await assert.rejects(read(),e=>e.status===403);}finally{await db.query('UPDATE tenants SET is_active=true WHERE id=$1',[tenant]);}
 });
 await t.test('Facebook reader consumes canonical DISTINCT evidence without deleting either record',async()=>{
  const before=await rows();accepted=await command();key=randomUUID();await record(accepted,key);const r=await read();
  assert.ok(r.groups.find(g=>g.members.some(m=>m.leadId===a)).deduplicationComplete);assert.ok(r.groups.find(g=>g.members.some(m=>m.leadId===b)).deduplicationComplete);
  const after=await rows();assert.deepEqual(after.leads,before.leads);assert.deepEqual(after.customers,before.customers);assert.equal(after.events,before.events+1);
 });
 for(const value of [null,false])await t.test('inactive company '+value+' denies snapshot, new decision and accepted replay',async()=>{
  const cmd=await command(),before=await rows();await db.query('UPDATE companies SET is_active=$2 WHERE id=$1',[company,value]);
  try{await assert.rejects(read(),e=>e.status===403);await assert.rejects(record(cmd),e=>e.code==='42501');await assert.rejects(record(accepted,key),e=>e.code==='42501');assert.deepEqual(await rows(),before);}
  finally{await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);}
 });
 for(const operation of ['snapshot','new decision','accepted replay'])await t.test('company true to NULL while '+operation+' waits for lock denies after wakeup',async()=>{
  const cmd=await command(),before=await rows(),pid=(await peers[0].query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await db.query('BEGIN');await db.query('UPDATE companies SET is_active=NULL WHERE id=$1',[company]);
  const attempt=(operation==='snapshot'?read():record(operation==='accepted replay'?accepted:cmd,operation==='accepted replay'?key:randomUUID())).then(()=>({ok:true}),error=>({error}));
  try{
   let locked=false;
   for(let i=0;i<100;i++){await db.query('SELECT pg_stat_clear_snapshot()');const r=await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);if(r.rows[0]?.wait_event_type==='Lock'){locked=true;break;}await db.query('SELECT pg_sleep(0.02)');}
   assert.ok(locked,'Actual request must reach the held company lock');await db.query('COMMIT');
   const result=await attempt;assert.equal(result.ok,undefined);assert.equal(operation==='snapshot'?result.error?.status:result.error?.code,operation==='snapshot'?403:'42501');assert.deepEqual(await rows(),before);
  }finally{await db.query('ROLLBACK');await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);await attempt;}
 });
};
