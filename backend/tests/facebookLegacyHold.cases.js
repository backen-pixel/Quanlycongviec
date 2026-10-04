'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async(t,{db,peers,prepared,read,begin,step,query,admin,company})=>{
 const roots=['customers','crm_leads','facebook_contacts','facebook_messages','facebook_comments','facebook_lead_ads','facebook_pages','crm_sources','lead_attribution','crm_tasks','crm_task_assignees','notifications','crm_assignment_columns','crm_assignments','crm_assignment_assignees','crm_assignment_files','crm_task_attachments','customer_interactions'];
 // Existing intake fixtures exercise the actual graph/migrations 650--686. The
 // extra side-effect tables need only a key here: this guard is statement-level
 // and never depends on their business columns. Also test real FK descendants.
 for(const name of roots)if(!(await db.query('SELECT to_regclass($1) r',['public.'+name])).rows[0].r)await db.query(`CREATE TABLE public.${name}(id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);
 await db.query('CREATE TABLE hold_child(id uuid PRIMARY KEY,customer_id uuid REFERENCES customers(id));CREATE TABLE hold_grandchild(id uuid PRIMARY KEY,child_id uuid REFERENCES hold_child(id))');
 await db.query('CREATE SCHEMA hold_cross;GRANT USAGE ON SCHEMA hold_cross TO service_role;CREATE TABLE hold_outside_parent(id uuid PRIMARY KEY);CREATE TABLE hold_cross.child(id uuid PRIMARY KEY,customer_id uuid REFERENCES customers(id),cascade_id uuid REFERENCES hold_outside_parent(id) ON DELETE CASCADE,null_id uuid REFERENCES hold_outside_parent(id) ON DELETE SET NULL)');
 const sql=fs.readFileSync(path.resolve(__dirname,'../../database/687_crm_legacy_write_hold.sql'),'utf8');
 await db.query(sql);await db.query(sql);
 const inspect=(c=db)=>c.query('SELECT crm_legacy_hold.inspect() r').then(x=>x.rows[0].r);
 const ref='Synthetic Founder maintenance release for isolated acceptance only';
 const drain='Synthetic process inventory and drain evidence for isolated acceptance only';
 const call=(args,c=db)=>c.query('SELECT crm_legacy_hold.set_hold($1,$2,$3,$4,$5,$6) r',args).then(x=>x.rows[0].r);
 const command=async(active,c=db)=>{const x=await inspect(c);return[randomUUID(),x.state.revision,active,x.manifestHash,ref,active?null:drain];};
 const set=async(active,c=db)=>call(await command(active,c),c);
 const off=async()=>{if((await inspect()).state.active)await set(false);};
 async function waitLock(c){const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;return pid;}
 const pids=await Promise.all(peers.map(waitLock));
 async function locked(pid){for(let i=0;i<100;i++){await db.query('SELECT pg_stat_clear_snapshot()');const x=await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);if(x.rows[0]?.wait_event_type==='Lock')return;await db.query('SELECT pg_sleep(0.02)');}assert.fail('contender must reach a real PostgreSQL lock');}
 await t.test('maintenance installs inactive, includes observed roots and FK descendants, and survives repeated installation',async()=>{
  const x=await inspect();assert.equal(x.state.active,false);assert.equal(x.state.revision,0);assert.equal(x.processesDrained,false);assert.match(x.manifestHash,/^[a-f0-9]{64}$/);
  for(const name of [...roots,'hold_child','hold_grandchild'])assert.ok(x.manifest.some(r=>r.relation==='public.'+name),name);
  assert.ok(x.manifest.some(r=>r.relation==='hold_cross.child'));assert.ok(!x.manifest.some(r=>r.relation==='public.hold_outside_parent'));
  const f=await prepared();await db.query('UPDATE customers SET full_name=full_name WHERE id=$1',[f.customer]);assert.equal((await read(f.key)).state,'RUNNING');
 });
 await t.test('no application role can inspect, enable, disable or edit maintenance or its audit',async()=>{
  const args=await command(true);
  for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);try{
   for(const table of ['state','events','manifest'])await assert.rejects(db.query('SELECT * FROM crm_legacy_hold.'+table),e=>e.code==='42501');
   await assert.rejects(inspect(),e=>e.code==='42501');await assert.rejects(call(args),e=>e.code==='42501');
   await assert.rejects(db.query('UPDATE crm_legacy_hold.state SET active=false'),e=>e.code==='42501');
  }finally{await db.query('RESET ROLE');}}
 });
 await t.test('installation refuses repeatable and serializable writes even while hold is inactive',async()=>{
  assert.equal((await inspect()).state.active,false);
  for(const isolation of ['REPEATABLE READ','SERIALIZABLE']){await db.query('BEGIN ISOLATION LEVEL '+isolation);
   try{await assert.rejects(db.query('DELETE FROM customers WHERE false'),e=>e.code==='0A000');}finally{await db.query('ROLLBACK');}}
 });
 await t.test('active maintenance blocks INSERT UPDATE DELETE TRUNCATE on every root and descendant, keeps reads and audit',async()=>{
  const before=await inspect();await set(true);
  try{for(const row of before.manifest){
   const table=row.relation,col=(await db.query('SELECT quote_ident(attname) c FROM pg_attribute WHERE attrelid=$1 AND attnum>0 AND NOT attisdropped ORDER BY attnum LIMIT 1',[row.oid])).rows[0].c;
   await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ${table} TO service_role`);
   for(const statement of [`INSERT INTO ${table} DEFAULT VALUES`,`UPDATE ${table} SET ${col}=${col} WHERE false`,`DELETE FROM ${table} WHERE false`,`TRUNCATE ${table} CASCADE`])
    await assert.rejects(peers[0].query(statement),e=>e.code==='55000'&&e.message==='CRM_LEGACY_WRITE_HOLD',statement);
   await peers[0].query(`SELECT count(*) FROM ${table}`);
  }
  const ev=(await db.query('SELECT * FROM crm_legacy_hold.events ORDER BY recorded_at DESC LIMIT 1')).rows[0];assert.equal(ev.after_state.active,true);assert.equal(ev.manifest_hash,before.manifestHash);assert.equal(ev.manifest.length,before.manifest.length);assert.ok(ev.operator_name);
  }finally{await off();}
 });
 await t.test('hold waits for a transaction already writing then rejects its next HTTP-style write after commit',async()=>{
  const f=await prepared(),args=await command(true);let pending;
  await peers[0].query('BEGIN');await peers[1].query('RESET ROLE');
  try{await peers[0].query("UPDATE customers SET full_name='Pre-hold committed' WHERE id=$1",[f.customer]);
   pending=call(args,peers[1]).then(value=>({value}),error=>({error}));await locked(pids[1]);await peers[0].query('COMMIT');
   const x=await pending;assert.equal(x.error,undefined);assert.equal(x.value.currentState.active,true);
   assert.equal((await db.query('SELECT full_name FROM customers WHERE id=$1',[f.customer])).rows[0].full_name,'Pre-hold committed');
   await assert.rejects(peers[0].query('UPDATE crm_leads SET title=title WHERE id=$1',[f.lead]),e=>e.code==='55000');
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending;await peers[1].query('SET ROLE service_role');await off();}
 });
 await t.test('foreign-key cascade and set-null from an unheld parent into a held cross-schema child roll back the parent too',async()=>{
  const f=await prepared(),a=randomUUID(),b=randomUUID(),child=randomUUID();
  await db.query('INSERT INTO hold_outside_parent VALUES($1),($2)',[a,b]);await db.query('INSERT INTO hold_cross.child VALUES($1,$2,$3,$4)',[child,f.customer,a,b]);await set(true);
  try{for(const id of [a,b]){await assert.rejects(db.query('DELETE FROM hold_outside_parent WHERE id=$1',[id]),e=>e.code==='55000');
   assert.equal((await db.query('SELECT count(*)::int n FROM hold_outside_parent WHERE id=$1',[id])).rows[0].n,1);}
   const row=(await db.query('SELECT * FROM hold_cross.child WHERE id=$1',[child])).rows[0];assert.equal(row.cascade_id,a);assert.equal(row.null_id,b);
  }finally{await off();}
 });
 await t.test('activation lock timeout does not claim a hold or record a false audit',async()=>{
  const f=await prepared(),args=await command(true);await peers[0].query('BEGIN');await peers[1].query('RESET ROLE');
  try{await peers[0].query('UPDATE customers SET full_name=full_name WHERE id=$1',[f.customer]);await assert.rejects(call(args,peers[1]),e=>e.code==='55P03');
   assert.equal((await inspect()).state.active,false);assert.equal((await db.query('SELECT count(*)::int n FROM crm_legacy_hold.events WHERE request_id=$1',[args[0]])).rows[0].n,0);
  }finally{await peers[0].query('ROLLBACK');await peers[1].query('SET ROLE service_role');}
 });
 await t.test('hold committed first fences a writer already waiting for relation locks with fresh READ COMMITTED visibility',async()=>{
  const f=await prepared();let pending;await peers[0].query('RESET ROLE');await peers[0].query('BEGIN');
  try{await set(true,peers[0]);pending=peers[1].query('UPDATE customers SET full_name=full_name WHERE id=$1',[f.customer]).then(value=>({value}),error=>({error}));
   await locked(pids[1]);await peers[0].query('COMMIT');assert.equal((await pending).error?.code,'55000');
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending;await peers[0].query('SET ROLE service_role');await off();}
 });
 await t.test('rollback of activation leaves no audit or hold and permits the waiting writer',async()=>{
  const f=await prepared(),args=await command(true);let pending;await peers[0].query('RESET ROLE');await peers[0].query('BEGIN');
  try{await call(args,peers[0]);pending=peers[1].query('UPDATE customers SET full_name=full_name WHERE id=$1',[f.customer]).then(value=>({value}),error=>({error}));
   await locked(pids[1]);await peers[0].query('ROLLBACK');assert.equal((await pending).error,undefined);assert.equal((await inspect()).state.active,false);
   assert.equal((await db.query('SELECT count(*)::int n FROM crm_legacy_hold.events WHERE request_id=$1',[args[0]])).rows[0].n,0);
  }finally{await peers[0].query('ROLLBACK');if(pending)await pending;await peers[0].query('SET ROLE service_role');await off();}
 });
 await t.test('old transactions see a later hold; repeatable-read snapshots and replica mode cannot bypass the guard',async()=>{
  const f=await prepared();await peers[0].query('BEGIN');await peers[0].query('SELECT 1');await set(true);
  try{await assert.rejects(peers[0].query('UPDATE customers SET full_name=full_name WHERE id=$1',[f.customer]),e=>e.code==='55000');}
  finally{await peers[0].query('ROLLBACK');await off();}
  await peers[0].query('BEGIN ISOLATION LEVEL REPEATABLE READ');await peers[0].query('SELECT 1');await set(true);
  try{await assert.rejects(peers[0].query('UPDATE customers SET full_name=full_name WHERE id=$1',[f.customer]),e=>e.code==='0A000');}
  finally{await peers[0].query('ROLLBACK');}
  try{await db.query('SET session_replication_role=replica');await assert.rejects(db.query('DELETE FROM customers WHERE false'),e=>e.code==='55000');}
  finally{await db.query('SET session_replication_role=origin');await off();}
 });
 await t.test('matching request replays without reactivating; changed command and stale revision are refused',async()=>{
  const on=await command(true),first=await call(on);assert.equal(first.replayed,false);assert.equal((await call(on)).replayed,true);
  await assert.rejects(call([...on.slice(0,4),ref+' changed',null]),e=>e.code==='23505');
  const end=await command(false);await assert.rejects(call([...end.slice(0,5),null]),e=>e.code==='22023');
  await call(end);const replay=await call(on);assert.equal(replay.recordedState.active,true);assert.equal(replay.currentState.active,false);
  await assert.rejects(call([randomUUID(),on[1],true,...on.slice(3)]),e=>e.code==='40001');
  assert.equal((await db.query('SELECT count(*)::int n FROM crm_legacy_hold.events WHERE request_id=$1',[on[0]])).rows[0].n,1);
 });
 await t.test('damaged or expanded manifest blocks activation until explicitly installed and re-inspected',async()=>{
  const old=await command(true);await db.query('ALTER TABLE notifications DISABLE TRIGGER a_crm_legacy_write_hold');
  try{await assert.rejects(inspect(),e=>e.code==='55000');await assert.rejects(call(old),e=>e.code==='55000');}
  finally{await db.query('ALTER TABLE notifications ENABLE ALWAYS TRIGGER a_crm_legacy_write_hold');}
  await db.query('CREATE TABLE hold_new_child(id uuid PRIMARY KEY,customer_id uuid REFERENCES customers(id))');
  await assert.rejects(call(old),e=>e.code==='55000');await db.query(sql);await assert.rejects(call(old),e=>e.code==='40001');
  const on=await command(true);await call(on);await db.query(sql);assert.equal((await inspect()).state.active,true);
  await assert.rejects(db.query('INSERT INTO hold_new_child DEFAULT VALUES'),e=>e.code==='55000');await off();
 });
 await t.test('maintenance never resolves UNKNOWN, releases its claim, changes mapping or drains a process',async()=>{
  const f=await prepared();await step(f.key,f.token,f.contact,'START');await query('crm_facebook_batch_stop',[admin,company,f.key,[f.contact]]);
  const snapshot=await read(f.key),business=(await db.query('SELECT to_jsonb(c) c FROM facebook_contacts c WHERE id=$1',[f.contact])).rows[0].c;
  await set(true);try{assert.deepEqual(await read(f.key),snapshot);assert.equal((await inspect()).processesDrained,false);await assert.rejects(begin([f.contact]),e=>e.code==='23505');}
  finally{await off();}
  assert.deepEqual(await read(f.key),snapshot);assert.deepEqual((await db.query('SELECT to_jsonb(c) c FROM facebook_contacts c WHERE id=$1',[f.contact])).rows[0].c,business);
  await assert.rejects(begin([f.contact]),e=>e.code==='23505');
 });
};
