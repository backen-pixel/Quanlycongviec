import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const id=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const migration=await readFile(new URL('../../../database/711_founder_control_center.sql',import.meta.url),'utf8');
test('PostgreSQL WASM: persistence, permissions, version decisions and audit atomicity (synthetic)',async t=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE tenants(id uuid PRIMARY KEY);
 CREATE TABLE companies(id uuid PRIMARY KEY,tenant_id uuid);
 CREATE TABLE users(id uuid PRIMARY KEY,role text,company_id uuid,tenant_id uuid,is_active boolean);
 CREATE TABLE external_api_keys(id uuid PRIMARY KEY,active boolean,default_assigned_to uuid,created_by uuid,company_id uuid,region_id uuid,mcp_scopes text[],allowed_company_ids uuid[]);
 CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),user_id uuid,company_id uuid,module text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb);
 INSERT INTO tenants VALUES ('${id(9)}'),('${id(8)}');
 INSERT INTO companies VALUES ('${id(1)}','${id(9)}'),('${id(7)}','${id(8)}');
 INSERT INTO users VALUES ('${id(2)}','admin','${id(1)}','${id(9)}',true),('${id(4)}','sales_admin','${id(1)}','${id(9)}',true),('${id(6)}','admin','${id(7)}','${id(8)}',true);
 INSERT INTO external_api_keys VALUES ('${id(3)}',true,'${id(2)}','${id(2)}','${id(1)}',NULL,ARRAY['founder_read','founder_write'],NULL);
 `);
 await db.exec(migration);
 await db.exec(migration); // Repeat migration on a fresh synthetic schema copy.
 const payload={owner_id:id(4),title:'Mục tiêu tổng hợp',metric:'QUALIFIED_PAID_LEADS',target:300,window_start:'2026-10-07T00:00:00+07:00',window_end:'2026-11-06T00:00:00+07:00'};
 async function command(request:string,name:string,data:object,company=id(1),tenant=id(9),actor=id(2)) {
   await db.exec('SET ROLE service_role');
   try { return (await db.query<{result:Record<string,unknown>}>('SELECT public.founder_control_command_v1($1,$2,$3,$4,$5,$6,$7::jsonb) AS result',[id(3),actor,company,tenant,request,name,JSON.stringify(data)])).rows[0].result; }
   finally { await db.exec('RESET ROLE'); }
 }
 const created=await command('objective-001','create_founder_objective',payload);
 await t.test('durable duplicate/retry produces exactly one goal/proposal/audit',async()=>{
   assert.deepEqual(await command('objective-001','create_founder_objective',payload),created);
   for(const table of ['founder_objectives','founder_proposals','founder_command_receipts','audit_log'])assert.equal((await db.query<{n:number}>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,1);
 });
 await t.test('same request with changed payload conflicts; unknown connection outcome can safely replay',async()=>{
   await assert.rejects(command('objective-001','create_founder_objective',{...payload,target:301}),/REQUEST_CONFLICT/);
   assert.deepEqual(await command('objective-001','create_founder_objective',payload),created);
 });
 await t.test('model cannot add hidden context; target owner/tenant must match',async()=>{
   await assert.rejects(command('objective-002','create_founder_objective',{...payload,role:'admin'}),/INVALID_ARGUMENTS/);
   await assert.rejects(command('objective-003','create_founder_objective',{...payload,owner_id:id(6)}),/OBJECT_NOT_ACCESSIBLE/);
   await assert.rejects(command('objective-004','create_founder_objective',payload,id(7),id(8)),/PERMISSION_DENIED/);
   await assert.rejects(command('objective-005','create_founder_objective',payload,id(1),id(9),id(4)),/PERMISSION_DENIED/);
 });
 const decision={proposal_id:created.proposal_id,expected_version:created.version,expected_digest:created.digest,decision:'APPROVE',reason:'Chấp thuận mục tiêu synthetic; không thực thi'};
 await t.test('proposal version/digest mismatch rejects without writing decision',async()=>{
   await assert.rejects(command('decision-001','record_founder_decision',{...decision,expected_version:2}),/PROPOSAL_VERSION_CONFLICT/);
   await assert.rejects(command('decision-002','record_founder_decision',{...decision,expected_digest:'0'.repeat(64)}),/PROPOSAL_VERSION_CONFLICT/);
   assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM founder_decisions')).rows[0].n,0);
 });
 await t.test('decision persisted once with object/version/digest and never executed',async()=>{
   const r=await command('decision-003','record_founder_decision',decision);
   assert.equal(r.execution,'NOT_EXECUTED');assert.equal(r.proposal_digest,created.digest);
   assert.deepEqual(await command('decision-003','record_founder_decision',decision),r);
   assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM founder_decisions')).rows[0].n,1);
   await assert.rejects(command('decision-004','record_founder_decision',decision),/PROPOSAL_VERSION_CONFLICT/);
 });
 await t.test('revoked key denied even for retries; inactive actor denied',async()=>{
   await db.exec(`UPDATE external_api_keys SET active=false`);
   await assert.rejects(command('objective-001','create_founder_objective',payload),/PERMISSION_DENIED/);
   await db.exec(`UPDATE external_api_keys SET active=true; UPDATE users SET is_active=false WHERE id='${id(2)}'`);
   await assert.rejects(command('objective-001','create_founder_objective',payload),/PERMISSION_DENIED/);
   await db.exec(`UPDATE users SET is_active=true WHERE id='${id(2)}'`);
 });
 await t.test('audit failure rolls back business records and receipt together',async()=>{
   await db.exec(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END $$;
   CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_audit();`);
   await assert.rejects(command('objective-006','create_founder_objective',payload),/SYNTHETIC_AUDIT_FAILURE/);
   assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM founder_objectives')).rows[0].n,1);
   assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM founder_command_receipts')).rows[0].n,2);
   await db.exec('DROP TRIGGER fail_audit ON audit_log; DROP FUNCTION fail_audit()');
 });
 await t.test('anon/authenticated cannot read or execute; service_role cannot rewrite evidence directly',async()=>{
   for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);try{await assert.rejects(db.query('SELECT * FROM founder_decisions'),/permission denied/);await assert.rejects(db.query('SELECT founder_control_command_v1($1,$2,$3,$4,$5,$6,$7::jsonb)',[id(3),id(2),id(1),id(9),'objective-007','create_founder_objective',JSON.stringify(payload)]),/permission denied/)}finally{await db.exec('RESET ROLE')}}
   await db.exec('SET ROLE service_role');try{await assert.rejects(db.exec("UPDATE founder_decisions SET decision='REJECT'"),/permission denied/)}finally{await db.exec('RESET ROLE')}
 });
 await db.close();
});
