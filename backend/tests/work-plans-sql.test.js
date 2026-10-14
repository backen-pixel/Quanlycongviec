// Executes the actual migration in an isolated WASM PostgreSQL. No .env or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const project='00000000-0000-4000-8000-000000000001', company='00000000-0000-4000-8000-000000000002', actor='00000000-0000-4000-8000-000000000003';
test('PostgreSQL migration: atomic history, CAS, replay, company guard and browser denial',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.projects(id uuid primary key); insert into public.projects values('${project}');`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../../database/20261014034959_flexible_work_plans.sql'),'utf8'));
    const commit=(kind,id,expected,key=randomUUID(),hash='hash',doc={active:null},owner=company)=>db.query('select public.work_plan_commit($1,$2,$3,$4,$5,$6,$7,$8) as result',[kind,id,owner,actor,expected,key,hash,JSON.stringify(doc)]);
    // Invoker privileges: service role executes; browser role cannot bypass via RPC.
    await db.exec('set role service_role');
    const key=randomUUID();const first=await commit('plan',project,0,key);assert.equal(first.rows[0].result.revision,1);
    assert.deepEqual((await commit('plan',project,0,key)).rows,first.rows);
    assert.equal((await db.query('select count(*) as n from public.work_plan_versions')).rows[0].n,1);
    await assert.rejects(commit('plan',project,0),/Revision conflict/);
    await assert.rejects(commit('plan',project,1,key,'changed'),/Idempotency key reused/);
    await assert.rejects(commit('plan',project,1,randomUUID(),'hash',{},randomUUID()),/Company denied/);
    await commit('plan',project,1,randomUUID(),'second',{active:{deadline:'2026-10-20'}});
    assert.equal((await db.query('select count(*) as n from public.work_plan_versions')).rows[0].n,2);
    const template=randomUUID();await commit('template',template,0);await commit('template',template,1);
    assert.equal((await db.query('select count(*) as n from public.work_plan_template_versions')).rows[0].n,2);
    await assert.rejects(db.exec("update public.work_plan_template_versions set document='{}'"),/permission denied/);
    await assert.rejects(db.exec("delete from public.work_plan_versions"),/permission denied/);
    // Failed FK write must not leave command or version rows.
    const badKey=randomUUID();await assert.rejects(commit('plan',randomUUID(),0,badKey),/foreign key/);
    assert.equal((await db.query('select count(*) as n from public.work_plan_commands where command_id=$1',[badKey])).rows[0].n,0);
    for (const role of ['anon','authenticated']) {
      await db.exec(`reset role;set role ${role}`);
      await assert.rejects(db.query('select * from public.work_plan_instances'),/permission denied/);
      await assert.rejects(commit('plan',project,2),/permission denied/);
    }
    await db.exec('reset role');
    const rls=await db.query("select relname,relrowsecurity from pg_class where relname in ('work_plan_instances','work_plan_versions','work_plan_template_versions','work_plan_commands')");
    assert.equal(rls.rows.length,4);assert.ok(rls.rows.every(r=>r.relrowsecurity));
  } finally {await db.close();}
});
