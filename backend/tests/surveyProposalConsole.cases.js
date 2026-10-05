'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {proposalConsoleView}=require('../src/modules/marketingAutomation/surveyProposalConsole');
module.exports=async(t,{db,peers,query,company,other,admin,sales,setup,booked,finished,receive,incoming})=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/679_survey_proposal_console.sql'),'utf8');await db.query(sql);await db.query(sql);
 const b=await booked(),a=await setup(),read=(c=a,actor=admin,cid=company,client=peers[0])=>query('crm_survey_proposal_console',[actor,cid,c.thread],client);
 try{
  await t.test('proposal console, legacy read/replay and private proposer reject unintended roles even after grants',async()=>{
   const funcs='crm_survey_proposal_console(uuid,uuid,uuid),crm_survey_propose(uuid,uuid,uuid,jsonb),crm_survey_proposal_read(uuid,uuid,uuid)';
   for(const role of ['anon','authenticated']){await db.query('GRANT EXECUTE ON FUNCTION '+funcs+' TO '+role);await db.query('SET ROLE '+role);
   try{for(const op of [()=>read(a,admin,company,db),()=>query('crm_survey_propose',[admin,company,a.request,a.command],db),()=>query('crm_survey_proposal_read',[admin,company,a.proposal.proposalId],db)])await assert.rejects(op(),e=>e.code==='42501');}
   finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION '+funcs+' FROM '+role);}}
   for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT crm_survey_control.propose_before_console($1,$2,$3,$4)',[admin,company,a.request,a.command]),e=>e.code==='42501');}finally{await db.query('RESET ROLE');}}
   await assert.rejects(read(a,sales),e=>e.code==='42501');await assert.rejects(read(a,admin,other),e=>e.code==='42501');
  });
  await t.test('real proposal and confirmed booking expose separated delivery/outcome state without private transport',async()=>{
   const open=proposalConsoleView(await read()),book=proposalConsoleView(await read(b));assert.equal(open.items.length,1);assert.equal(open.items[0].state,'OPEN');assert.equal(open.items[0].delivery.state,'QUEUED');
   assert.equal(book.items[0].state,'BOOKED');assert.equal(book.items[0].delivery.state,'SENT');assert.ok(book.items[0].booking);assert.equal(book.items[0].outcomes[0].kind,'BOOKED');
   const token=(await db.query('SELECT confirmation_token FROM crm_survey_control.deliveries WHERE proposal_id=$1',[a.proposal.proposalId])).rows[0].confirmation_token;
   for(const secret of [token,'confirmation_token','payload','credential_hash','psid'])assert.ok(!JSON.stringify(open).includes(secret));
  });
  await t.test('scope drift masks history and denies legacy details and exact replay, then recovers when corrected',async()=>{
   for(const [table,key,col,value]of[['crm_leads',a.lead,'company_id',other],['customers',a.customer,'company_id',other]]){
    await db.query(`UPDATE ${table} SET ${col}=$2 WHERE id=$1`,[key,value]);
    try{const r=proposalConsoleView(await read());assert.equal(r.items[0].scopeReady,false);assert.equal(r.items[0].appointment,null);assert.ok(!JSON.stringify(r).includes(a.command.location));
     await assert.rejects(query('crm_survey_proposal_read',[admin,company,a.proposal.proposalId]),e=>e.code==='42501');await assert.rejects(query('crm_survey_propose',[admin,company,a.request,a.command]),e=>e.code==='42501');}
    finally{await db.query(`UPDATE ${table} SET ${col}=$2 WHERE id=$1`,[key,company]);}
   }
   assert.equal((await query('crm_survey_propose',[admin,company,a.request,a.command])).replayed,true);
  });
  await t.test('contact and Page changes hide historical details and deny read or replay',async()=>{
   const changes=[
    {sql:'UPDATE facebook_contacts SET lead_id=$2 WHERE page_id=\'123\' AND psid=$1',key:a.psid,changed:b.lead,original:a.lead},
    {sql:'UPDATE facebook_contacts SET customer_id=$2 WHERE page_id=\'123\' AND psid=$1',key:a.psid,changed:b.customer,original:a.customer},
    {sql:'UPDATE facebook_pages SET default_company_id=$2 WHERE page_id=$1',key:'123',changed:other,original:company,page:true},
   ];
   for(const x of changes){await db.query(x.sql,[x.key,x.changed]);try{
    if(x.page)await assert.rejects(read(),e=>e.code==='42501');else{const r=proposalConsoleView(await read());assert.equal(r.items[0].scopeReady,false);assert.equal(r.items[0].appointment,null);}
    await assert.rejects(query('crm_survey_proposal_read',[admin,company,a.proposal.proposalId]),e=>e.code==='42501');
    await assert.rejects(query('crm_survey_propose',[admin,company,a.request,a.command]),e=>e.code==='42501');
   }finally{await db.query(x.sql,[x.key,x.original]);}}
  });
  await t.test('STOP preserves visible history and exact replay but forbids new proposal',async()=>{
   await receive([await incoming(a,'STOP')]);const r=proposalConsoleView(await read());assert.equal(r.careMode,'OPTED_OUT');assert.equal(r.items[0].scopeReady,true);
   assert.equal((await query('crm_survey_propose',[admin,company,a.request,a.command])).replayed,true);
   await assert.rejects(query('crm_survey_propose',[admin,company,randomUUID(),a.command]),e=>e.code==='42501');
  });
  await t.test('uncertain delivery barrier prevents a fresh command, but never resends an exact replay',async()=>{
   const c=await setup();try{
    await db.query("UPDATE crm_survey_control.deliveries SET state='UNCERTAIN',started_at=clock_timestamp() WHERE proposal_id=$1",[c.proposal.proposalId]);
    assert.equal((await read(c)).deliveryBusy,true);const before=(await db.query('SELECT count(*)::int n FROM crm_survey_control.proposals WHERE thread_id=$1',[c.thread])).rows[0].n;
    await assert.rejects(query('crm_survey_propose',[admin,company,randomUUID(),c.command]),e=>e.code==='40001');
    assert.equal((await query('crm_survey_propose',[admin,company,c.request,c.command])).replayed,true);
    assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.proposals WHERE thread_id=$1',[c.thread])).rows[0].n,before);
    assert.equal((await db.query('SELECT state FROM crm_survey_control.deliveries WHERE proposal_id=$1',[c.proposal.proposalId])).rows[0].state,'UNCERTAIN');
   }finally{await finished(c);}
  });
  await t.test('console uses one snapshot while the Lead company changes during history projection',async()=>{
   const original=(await db.query("SELECT pg_get_functiondef('crm_survey_control.console_inventory(uuid,uuid)'::regprocedure) d")).rows[0].d;
   const marker='FROM crm_survey_control.proposals p';assert.ok(original.includes(marker));await db.query(original.replace(marker,marker+' CROSS JOIN (SELECT pg_advisory_lock(679027),pg_advisory_unlock(679027)) barrier'));
   await db.query('SELECT pg_advisory_lock(679027)');const pending=read(b,admin,company,peers[1]).then(value=>({value}),error=>({error}));
   try{
    try{let blocked=false;for(let i=0;i<100;i++){const q=await db.query("SELECT 1 FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT crm_survey_proposal_console%'");if(q.rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[b.lead,other]);}
    finally{await db.query('SELECT pg_advisory_unlock(679027)');}
    const r=await pending;if(r.error)throw r.error;assert.equal(proposalConsoleView(r.value).items[0].scopeReady,true);
   }finally{await pending;await db.query(original);}
   try{assert.equal(proposalConsoleView(await read(b)).items[0].scopeReady,false);}finally{await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[b.lead,company]);}
  });
  await t.test('revoked operator or inactive company cannot use list, read or replay',async()=>{
   for(const [table,key]of[['users',admin],['companies',company]]){await db.query(`UPDATE ${table} SET is_active=NULL WHERE id=$1`,[key]);
    try{for(const op of [()=>read(),()=>query('crm_survey_proposal_read',[admin,company,a.proposal.proposalId]),()=>query('crm_survey_propose',[admin,company,a.request,a.command])])await assert.rejects(op(),e=>e.code==='42501');}
    finally{await db.query(`UPDATE ${table} SET is_active=true WHERE id=$1`,[key]);}}
  });
 }finally{await finished(a);await finished(b);}
};
