'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async(t,{db,peers,query})=>{
 const tenant=randomUUID(),company=randomUUID(),actor=randomUUID(),trial=randomUUID();
 const date=n=>new Date(Date.now()+7*3600000+n*86400000).toISOString().slice(0,10);
 await db.query('INSERT INTO tenants VALUES($1,true)',[tenant]);
 await db.query('INSERT INTO companies VALUES($1,$2,true)',[company,tenant]);
 await db.query("INSERT INTO users VALUES($1,$2,$3,'admin',true)",[actor,company,tenant]);
 await db.query("INSERT INTO facebook_pages VALUES('987',$1,true,'witness-synthetic-secret')",[company]);
 await db.query("INSERT INTO fb_ad_accounts VALUES('act_871',$1,true,NULL,'witness-ad-secret')",[company]);
 await db.query("INSERT INTO marketing_fb_lead_bindings VALUES('987','876',$1,1,$2,$3)",[company,{active:true,accountId:'act_871'},actor]);
 await query('marketing_lead_trial_set',[actor,company,trial,randomUUID(),{name:'Synthetic page witness',since:date(-1),until:date(28),expectedRevision:0}]);
 const start=()=>query('marketing_fb_census_start',[actor,company,trial,randomUUID(),['987']]);
 const stop=()=>db.query("UPDATE marketing_fb_census_runs SET state='FAILED' WHERE company_id=$1 AND state='RUNNING'",[company]);
 const status=(who=actor,cid=company,c=peers[0])=>query('marketing_fb_census_status',[who,cid,trial],c);
 const claim=async(c=peers[0])=>{const token=randomUUID();return{q:(await c.query('SELECT * FROM marketing_fb_census_claim($1,$2)',[['987'],token])).rows[0],token}};
 const finish=(a,rows=[],next=null,version='v24.0',c=peers[0])=>query('marketing_fb_census_commit',[a.q.id,a.token,{rows,next,graphVersion:version}],c);
 const rowsFor=()=>[{id:'876',status:'ACTIVE',expiredLeads:0}];
 const lead=id=>({id,acquiredAt:'2020-01-01T00:00:00Z'});
 const witnessRows=id=>db.query('SELECT * FROM marketing_measurement.census_pages WHERE run_id=$1 ORDER BY task_id,ordinal',[id]).then(x=>x.rows);
 const reject=code=>e=>e.code===code;
 await t.test('witness tables/helper and public wrappers deny browser roles even after accidental broad grants',async()=>{
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM marketing_measurement.census_pages'),reject('42501'));await assert.rejects(db.query('SELECT marketing_measurement.census_witness($1)',[randomUUID()]),reject('42501'));}finally{await db.query('RESET ROLE');}}
  await db.query('GRANT EXECUTE ON FUNCTION marketing_fb_census_claim(text[],uuid),marketing_fb_census_commit(uuid,uuid,jsonb),marketing_fb_census_status(uuid,uuid,uuid) TO authenticated');
  await db.query('SET ROLE authenticated');try{await assert.rejects(claim(db),reject('42501'));await assert.rejects(query('marketing_fb_census_commit',[randomUUID(),randomUUID(),{}],db),reject('42501'));await assert.rejects(status(actor,company,db),reject('42501'));}finally{await db.query('RESET ROLE');await db.query('REVOKE EXECUTE ON FUNCTION marketing_fb_census_claim(text[],uuid),marketing_fb_census_commit(uuid,uuid,jsonb),marketing_fb_census_status(uuid,uuid,uuid) FROM authenticated');}
 });
 await t.test('terminal traversal retains repeated rows, sanitized metadata, fixed cutoffs and verifiable digests',async()=>{
  const run=await start();assert.equal((await status()).run.witness.status,'MISSING');
  await finish(await claim(),rowsFor());let a=await claim();assert.equal(a.q.kind,'LEADS');
  await finish(a,[{...lead('9751'),field_data:{phone:'private-contact'},access_token:'never-store-me'}],'opaque-private-cursor');
  assert.equal((await status()).run.witness.status,'PARTIAL');
  a=await claim();await finish(a,[lead('9751'),lead('9752')]);
  const s=await status(),w=s.run.witness;assert.equal(s.run.state,'SCANNED');assert.equal(w.status,'TRAVERSED');assert.equal(w.pages,3);assert.equal(w.tasks,2);assert.equal(w.terminalTasks,2);assert.equal(w.leadRows,3);assert.equal(w.uniqueLeadIds,2);assert.equal(w.repeatedLeadRows,1);assert.equal(w.graphVersion,'v24.0');assert.equal(w.providerCoverage,'UNVERIFIED');assert.equal(w.cpqlReady,false);assert.equal(s.allowBudgetExecution,false);
  const records=await witnessRows(run.id);assert.ok(!JSON.stringify(records).includes('private-contact'));assert.ok(!JSON.stringify(records).includes('never-store-me'));assert.ok(!JSON.stringify(records).includes('opaque-private-cursor'));assert.ok(!JSON.stringify(s).includes('witness-synthetic-secret'));assert.ok(!JSON.stringify(s).includes('9751'));
  assert.ok(records.every(x=>Date.parse(x.body.leaseStartedAt)<=Date.parse(x.body.acceptedAt)&&x.body.recoveryUntil===records[0].body.recoveryUntil&&x.body.measurementUntil===records[0].body.measurementUntil));
  assert.equal((await db.query("SELECT bool_and(page_digest=encode(sha256(convert_to(body::text,'UTF8')),'hex')) ok FROM marketing_measurement.census_pages WHERE run_id=$1",[run.id])).rows[0].ok,true);
  const pages=records.filter(x=>x.kind==='LEADS');assert.equal(pages[1].body.previousDigest,pages[0].page_digest);assert.equal(pages[1].body.inputCursorDigest,pages[0].body.outputCursorDigest);assert.equal(pages[1].body.terminal,true);assert.equal(pages[1].body.outputCursorDigest,null);assert.equal((await status()).run.witness.pagesDigest,w.pagesDigest);
 });
 await t.test('parallel commit and lost response replay record a page exactly once',async()=>{
  const run=await start(),a=await claim();const result=await Promise.allSettled([finish(a,[],null,'v24.0',peers[0]),finish(a,[],null,'v24.0',peers[1])]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.code,'40001');assert.equal((await witnessRows(run.id)).length,1);await assert.rejects(finish(a),reject('40001'));assert.equal((await witnessRows(run.id)).length,1);await stop();
 });
 await t.test('reclaim changes lease time and resumes the same cursor without inventing pages',async()=>{
  const run=await start();let a=await claim();await finish(a,[],'restart-cursor');a=await claim();const oldStart=a.q.lease_started_at;
  await db.query("UPDATE marketing_fb_census_tasks SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[a.q.id]);await db.query('SELECT pg_sleep(0.01)');const b=await claim(peers[1]);assert.equal(b.q.id,a.q.id);assert.equal(b.q.cursor_after,'restart-cursor');assert.ok(b.q.lease_started_at>oldStart);await assert.rejects(finish(a),reject('40001'));await finish(b);await finish(await claim());
  const records=await witnessRows(run.id),s=await status();assert.equal(s.run.witness.status,'TRAVERSED');assert.equal(records.length,3);assert.equal(Date.parse(records.find(x=>x.task_id===b.q.id&&x.ordinal===2).body.leaseStartedAt),new Date(b.q.lease_started_at).getTime());
 });
 await t.test('a Graph version change on a different task rolls back disjoint IDs and evidence',async()=>{
  const run=await start();await finish(await claim(),rowsFor());const a=await claim();await assert.rejects(finish(a,[lead('9761')],null,'v25.0'),reject('40001'));assert.equal((await witnessRows(run.id)).length,1);assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.census_observations WHERE run_id=$1',[run.id])).rows[0].n,0);await finish(a,[lead('9761')]);assert.equal((await status()).run.witness.status,'TRAVERSED');
 });
 await t.test('terminal empty pages prove traversal with zero observed IDs, not zero customers or CPQL',async()=>{
  await start();await finish(await claim());await finish(await claim());const w=(await status()).run.witness;assert.equal(w.status,'TRAVERSED');assert.equal(w.pages,2);assert.equal(w.leadRows,0);assert.equal(w.uniqueLeadIds,0);assert.equal(w.providerCoverage,'UNVERIFIED');assert.equal(w.cpqlReady,false);
 });
 await t.test('old unwitnessed lease requires reclaim and missing historical prefix stays partial',async()=>{
  const run=await start();let a=await claim();await db.query('UPDATE marketing_fb_census_tasks SET lease_started_at=NULL WHERE id=$1',[a.q.id]);await assert.rejects(finish(a),reject('40001'));assert.equal((await witnessRows(run.id)).length,0);
  await db.query("UPDATE marketing_fb_census_tasks SET chunks=1,cursor_after='legacy-prefix',cursors='[\"legacy-prefix\"]',lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[a.q.id]);a=await claim();await finish(a);await finish(await claim());assert.equal((await status()).run.state,'SCANNED');assert.equal((await status()).run.witness.status,'PARTIAL');assert.equal((await witnessRows(run.id)).find(x=>x.task_id===a.q.id).ordinal,2);
  await db.query('DELETE FROM marketing_measurement.census_pages WHERE run_id=$1',[run.id]);assert.equal((await status()).run.witness.status,'MISSING');
 });
 await t.test('lease expiry during evidence insert rolls back witness, receipt, observation and cursor together',async()=>{
  const run=await start();await finish(await claim(),rowsFor());const a=await claim();
  await db.query("CREATE FUNCTION public.witness_test_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;CREATE TRIGGER witness_test_delay BEFORE INSERT ON marketing_measurement.census_pages FOR EACH ROW EXECUTE FUNCTION public.witness_test_delay()");
  await db.query("UPDATE marketing_fb_census_tasks SET lease_until=clock_timestamp()+interval '150 milliseconds' WHERE id=$1",[a.q.id]);
  try{await assert.rejects(finish(a,[{id:'9771',acquiredAt:date(-1)+'T08:00:00+07:00'}]),reject('40001'));}finally{await db.query('DROP TRIGGER witness_test_delay ON marketing_measurement.census_pages;DROP FUNCTION public.witness_test_delay()');}
  assert.equal((await witnessRows(run.id)).length,1);assert.equal((await db.query("SELECT count(*)::int n FROM marketing_fb_lead_receipts WHERE page_id='987' AND leadgen_id='9771'")).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.census_observations WHERE run_id=$1',[run.id])).rows[0].n,0);assert.equal((await db.query('SELECT chunks FROM marketing_fb_census_tasks WHERE id=$1',[a.q.id])).rows[0].chunks,0);await stop();
 });
 await t.test('scope change marks completed witness stale and current authority still controls reads',async()=>{
  await start();await finish(await claim());await finish(await claim());const before=(await status()).run.witness;
  await db.query("UPDATE facebook_pages SET access_token='witness-rotated' WHERE page_id='987'");let after=(await status()).run.witness;assert.equal(after.status,'STALE_SCOPE');assert.equal(after.pagesDigest,before.pagesDigest);
  await db.query('UPDATE users SET is_active=false WHERE id=$1',[actor]);await assert.rejects(status(),reject('42501'));await db.query('UPDATE users SET is_active=true WHERE id=$1',[actor]);
  await db.query('UPDATE companies SET is_active=false WHERE id=$1',[company]);await assert.rejects(status(),reject('42501'));await db.query('UPDATE companies SET is_active=true WHERE id=$1',[company]);await assert.rejects(status(actor,randomUUID()),reject('42501'));
 });
};
