// Explicit opt-in integration test against the isolated staging database.
// Never run with a production URL, .env or real user credentials.
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const configFile = process.env.STAGING_TEST_CREDENTIALS;
if (!configFile) throw new Error('Set STAGING_TEST_CREDENTIALS to the private staging fixture');
const c = JSON.parse(fs.readFileSync(configFile,'utf8'));
assert.equal(c.project_ref,'jdwgcivfqajpnlatrfwq');
const base = process.env.STAGING_ORIGIN || 'http://127.0.0.1:44010';
const origin = new URL(base);
if (!['127.0.0.1','tubep-staging-work-plans.onrender.com'].includes(origin.hostname)) throw new Error('Not an approved staging origin');
const sessions = {};
async function request(route,role='manager',body,expected=200) {
  const response = await fetch(`${base}/api${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(sessions[role]?{Authorization:`Bearer ${sessions[role]}`}:{})},body:body?JSON.stringify(body):undefined});
  const data = await response.json();
  assert.equal(response.status,expected,`${route}: ${JSON.stringify(data).slice(0,600)}`);
  return data;
}
const graph = (durations,dependencies,names) => ({
  calendar:{weekdays:[1,2,3,4,5,6],shifts:[[8,12],[13,17]],holidays:[]},
  stages:durations.map((_,i)=>({id:`s${i}`,name:`Công đoạn ${i+1}`})),
  tasks:durations.map((days,i)=>({id:`t${i}`,name:names?.[i]||`Việc ${i+1}`,stage_id:`s${i}`,hours:days*8,dependencies:dependencies[i].map(j=>`t${j}`),assignee_id:c.ids.staff})),
});
async function command(project,body,role='manager',expected=200) {
  const plan = await request(`/work-plans/${project}`,role);
  return request(`/work-plans/${project}/commands`,role,{command_id:randomUUID(),expected_revision:plan.revision,...body},expected);
}
async function main() {
  assert.equal((await request('/health')).database_ref,c.project_ref);
  for(const role of ['manager','staff','other']) {
    const login = await request('/auth/login',role,{email:`${role}@staging.invalid`,password:c.test_password});
    sessions[role] = login.token;
  }
  const cabinet=graph([1,1,2,2,1,1,1],[[],[0],[1],[1],[2,3],[4],[5]],['Chốt kích thước','Chuẩn bị vật tư','Gia công','Gia công','Lắp ráp','Kiểm tra','Đóng gói']);
  const glass=graph([1,2,1,1,1,1],[[],[0],[0],[1,2],[3],[4]]);
  const deadline = new Date(Date.now()+21*86400000).toISOString();
  for(const [project,g] of [[c.ids.cabinet,cabinet],[c.ids.glass,glass]]) {
    const prior = await request(`/work-plans/${project}`);
    await command(project,{action:'draft',graph:g,deadline,reason:prior.document?.active?'Chạy lại kiểm thử staging':''});
    const approved = await command(project,{action:'approve',accept_late:true});
    assert.equal(approved.schedule.tasks.length,g.tasks.length);
    assert.equal(approved.document.active.plan_schema_version,2);
  }
  const all = await request('/work-tasks?open_only=0&page_size=100');
  const rows = all.tasks || all.data || all.items;
  assert.ok(Array.isArray(rows),'Task response shape');
  assert.equal(rows.filter(t=>t.source==='work_plan').length,13);
  assert.equal(rows.filter(t=>t.title==='Gia công').length,2,'Same-name tasks must remain distinct');
  assert.ok(rows.some(t=>t.source_id===c.ids.old_task),'Legacy task remains');
  await request(`/work-plans/${c.ids.cabinet}`,'other',undefined,403);
  // Cabinet fixture may explicitly appoint staff as the production lead;
  // use glass (manager-led) to verify an ordinary assignee cannot plan.
  await command(c.ids.glass,{action:'draft',graph:glass,deadline},'staff',403);
  const cabinetPlan=await request(`/work-plans/${c.ids.cabinet}`,'staff');
  if(!['done','waived'].includes(cabinetPlan.document.execution.t0?.status)) {
    const complete=await command(c.ids.cabinet,{action:'task',task_id:'t0',status:'done'},'staff');
    assert.equal(complete.schedule.tasks.find(t=>t.id==='t1').ready,true);
  }
  const team=await request('/work-tasks/team-project-tasks?due_days=60&created_days=60&page_size=100');
  assert.ok(team.counts,'Team counts available');
  const overview=await request('/work-tasks/project-overview?module=sx');
  assert.ok(overview.tasks.some(t=>t.source==='work_plan'),'Manager sees plan tasks');
  const mine=await request(`/work-tasks?assignee_id=${c.ids.staff}&open_only=1&page_size=100`,'staff');
  assert.ok((mine.tasks||mine.data||mine.items).some(t=>t.source==='work_plan'),'Employee sees assigned plan tasks');
  const date=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const report=await request(`/work-plans/report?date=${date}&company_id=${c.ids.company}`);
  assert.equal(report.totals.tasks,13);
  const management=await request('/management/work-unified');
  assert.ok(management.items.some(i=>i.production_plan?.total===7),'Work Unified includes canonical task counts');
  const old=await request(`/work-plans/${c.ids.legacy}`);
  assert.equal(old.document,null,'Legacy project is not automatically migrated');
  console.log(JSON.stringify({result:'PASS',origin:base,plan_tasks:13,legacy_preserved:true,role_checks:true,report:true,manager:true}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
