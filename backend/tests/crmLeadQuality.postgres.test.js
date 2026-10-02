'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const dsn=process.env.CRM_QUALITY_TEST_DATABASE_URL;
test('isolated PostgreSQL CRM qualification, authorization and concurrency',{skip:!dsn},async t=>{
 const url=new URL(dsn);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/crm_quality_test');
 const {Client}=require('pg'),db=new Client({connectionString:dsn}),peers=[];await db.connect();
 const company=randomUUID(),other=randomUUID(),tenant=randomUUID(),actor=randomUUID(),outsider=randomUUID(),admin=randomUUID(),region=randomUUID(),customer=randomUUID(),lead=randomUUID();
 try {
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n,0,'Requires fresh isolated database');
  await db.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
   CREATE TABLE companies(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
   CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,tenant_id uuid,role text,is_active boolean);
   CREATE TABLE company_regions(id uuid PRIMARY KEY,company_id uuid,is_active boolean,name text,code text);
   CREATE TABLE user_company_regions(user_id uuid,region_id uuid,PRIMARY KEY(user_id,region_id));
   CREATE TABLE customers(id uuid PRIMARY KEY,company_id uuid,full_name text,phone text,email text,address text,city text);
   CREATE TABLE crm_leads(id uuid PRIMARY KEY,company_id uuid,customer_id uuid,region_id uuid,assigned_to uuid,lead_owner_id uuid,type text,title text,description text,lead_type_id uuid,install_address text,phone text,email text);`);
  await db.query('INSERT INTO companies VALUES($1,$3,true),($2,$3,true)',[company,other,tenant]);
  await db.query("INSERT INTO users VALUES($1,$4,$6,'sales',true),($2,$5,$6,'sales',true),($3,$4,$6,'admin',true)",[actor,outsider,admin,company,other,tenant]);
  await db.query("INSERT INTO company_regions VALUES($1,$2,true,'HCM','HCM')",[region,company]);await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[actor,region]);
  await db.query("INSERT INTO customers VALUES($1,$2,'Khách giả','0901234567',null,'TP.HCM','HCM')",[customer,company]);
  await db.query("INSERT INTO crm_leads(id,company_id,customer_id,region_id,assigned_to,lead_owner_id,type,title) VALUES($1,$2,$3,$4,$5,$5,'lead','Tủ bếp')",[lead,company,customer,region,actor]);
  const sql=fs.readFileSync(path.resolve(__dirname,'../../database/650_crm_lead_qualification.sql'),'utf8');await db.query(sql);await db.query(sql);
  for(let i=0;i<3;i++){const c=new Client({connectionString:dsn});await c.connect();await c.query('SET ROLE service_role');peers.push(c);}
  const read=(who=actor,cid=company,id=lead,c=peers[0])=>c.query('SELECT crm_lead_quality_read($1,$2,$3) r',[who,cid,id]).then(x=>x.rows[0].r);
  const decision=(status='QUALIFIED')=>({status,contactVerified:true,demandMatches:true,serviceAreaVerified:true,evidence:'Đã liên hệ khách giả và xác nhận nhu cầu cùng địa điểm.'});
  const record=(s,d=decision(),key=randomUUID(),who=actor,c=peers[0],cid=company,id=lead)=>c.query('SELECT crm_lead_quality_record($1,$2,$3,$4,$5,$6,$7) r',[who,cid,id,key,s.revision,s.contextVersion,d]).then(x=>x.rows[0].r);
  await t.test('deny public table/RPC access and direct service-role mutation',async()=>{
   for(const role of ['anon','authenticated','service_role']){await db.query('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM crm_lead_quality_events'),e=>e.code==='42501');await assert.rejects(db.query('DELETE FROM crm_lead_quality_source_versions'),e=>e.code==='42501');if(role!=='service_role')await assert.rejects(read(actor,company,lead,db),e=>e.code==='42501');await db.query('RESET ROLE');}
   await db.query('GRANT SELECT ON crm_lead_quality_events TO authenticated');await db.query('SET ROLE authenticated');assert.equal((await db.query('SELECT * FROM crm_lead_quality_events')).rowCount,0);await db.query('RESET ROLE');await db.query('REVOKE SELECT ON crm_lead_quality_events FROM authenticated');
  });
  await t.test('fresh records are pending; wrong company and unassigned actors cannot read/record',async()=>{assert.equal((await read()).revision,0);await assert.rejects(read(outsider),e=>e.code==='42501');await assert.rejects(read(actor,other),e=>e.code==='P0002');});
  await t.test('atomic confirmation and exact retry creates only one evidence event',async()=>{const s=await read(),key=randomUUID(),d=decision();const first=await record(s,d,key),second=await record(s,d,key);assert.equal(first.status,'QUALIFIED');assert.equal(second.replayed,true);assert.equal(second.revision,first.revision);await assert.rejects(record(s,decision('REJECTED'),key),e=>e.code==='23505');});
  await t.test('two concurrent different decisions only accept one revision',async()=>{const s=await read();const rs=await Promise.allSettled([record(s,decision(),randomUUID(),actor,peers[0]),record(s,decision('REJECTED'),randomUUID(),actor,peers[1])]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);assert.equal(rs.find(x=>x.status==='rejected').reason.code,'40001');});
  await t.test('replaying an older successful command returns current rejection',async()=>{const s=await read(),key=randomUUID(),d=decision();await record(s,d,key);await record(await read(),decision('REJECTED'));const r=await record(s,d,key);assert.equal(r.status,'REJECTED');assert.equal(r.replayed,true);});
  await t.test('customer contact changes outside CRM Lead invalidate and A-B-A cannot revive',async()=>{await record(await read());await db.query("UPDATE customers SET phone='0909999999' WHERE id=$1",[customer]);assert.equal((await read()).status,'PENDING');await db.query("UPDATE customers SET phone='0901234567' WHERE id=$1",[customer]);assert.equal((await read()).needsRecheck,true);});
  await t.test('changed demand invalidates prior revision and blocks stale form',async()=>{const s=await read();await db.query("UPDATE crm_leads SET description='Nhu cầu khác' WHERE id=$1",[lead]);await assert.rejects(record(s),e=>e.code==='40001');});
  await t.test('missing routing/contact or inactive region cannot qualify',async()=>{await db.query('UPDATE company_regions SET is_active=false WHERE id=$1',[region]);const s=await read();assert.equal(s.readyToQualify,false);await assert.rejects(record(s),e=>e.code==='22023');await db.query('UPDATE company_regions SET is_active=true WHERE id=$1',[region]);});
  await t.test('region from another company does not count as ready',async()=>{await db.query('UPDATE company_regions SET company_id=$1 WHERE id=$2',[other,region]);assert.equal((await read()).readyToQualify,false);await db.query('UPDATE company_regions SET company_id=$1 WHERE id=$2',[company,region]);});
  await t.test('recipient region removal/re-add invalidates previous qualified evidence',async()=>{await record(await read());await db.query('DELETE FROM user_company_regions WHERE user_id=$1',[actor]);assert.equal((await read()).readyToQualify,false);await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[actor,region]);assert.equal((await read()).needsRecheck,true);});
  await t.test('permission revocation denies even idempotent retry',async()=>{const s=await read(),key=randomUUID(),d=decision();await record(s,d,key);await db.query('UPDATE users SET is_active=false WHERE id=$1',[actor]);await assert.rejects(record(s,d,key),e=>e.code==='42501');await db.query('UPDATE users SET is_active=true WHERE id=$1',[actor]);});
  await t.test('company/tenant changes cannot reuse stale admin identity',async()=>{const s=await read(admin);await db.query('UPDATE users SET tenant_id=$1 WHERE id=$2',[randomUUID(),admin]);await assert.rejects(record(s,decision(),randomUUID(),admin),e=>e.code==='42501');await db.query('UPDATE users SET tenant_id=$1 WHERE id=$2',[tenant,admin]);});
  await t.test('concurrent CRM edit commits before qualification: stale snapshot rejected',async()=>{const s=await read();await db.query('BEGIN');await db.query("UPDATE customers SET city='Địa bàn mới' WHERE id=$1",[customer]);const outcome=record(s).then(()=>({ok:true}),e=>({code:e.code}));await db.query('COMMIT');assert.equal((await outcome).code,'40001');});
  await t.test('failed transaction leaves no extra evidence',async()=>{const before=(await read()).revision;await peers[0].query('BEGIN');await record(await read());await peers[0].query('ROLLBACK');assert.equal((await read()).revision,before);});
  await t.test('bad fact types/unknown fields rejected at DB boundary too',async()=>{for(const patch of [{contactVerified:'true'},{evidence:null},{status:null},{verifiedBy:'AI'},{demandMatches:false}])await assert.rejects(record(await read(),{...decision(),...patch}),e=>e.code==='22023');});
  await t.test('history survives legacy Lead deletion; deleted Lead cannot be counted/read',async()=>{const n=(await db.query('SELECT count(*)::int n FROM crm_lead_quality_events')).rows[0].n;await db.query('DELETE FROM crm_leads WHERE id=$1',[lead]);await assert.rejects(read(),e=>e.code==='P0002');assert.equal((await db.query('SELECT count(*)::int n FROM crm_lead_quality_events')).rows[0].n,n);});
 } finally {await Promise.all(peers.map(c=>c.end()));await db.end();}
});
