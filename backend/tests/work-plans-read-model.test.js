const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { workTaskReadSource } = require('../src/modules/work-plans/infrastructure/readSource');
const { reportWindow, summarizePlans } = require('../src/modules/work-plans/domain/report');
test('Actual legacy overview builder never restores SX tasks for an approved project when employee has no plan assignment', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname,'../src/routes/workTasks.js'),'utf8');
  const start = source.indexOf('function buildCrmSxOverviewChildren(');
  const end = source.indexOf('/** Nhóm trên Kanban',start);
  const build = vm.runInNewContext(`(${source.slice(start,end)})`,{Map,Set,crmRowInDetailLeads:()=>true});
  const rows = [{id:'legacy',lead_id:'lead',stage_slug:'sx_cut',title:'Cắt'}];
  const result = build({tasksRows:[],sxCrmRows:rows,leadProjectById:new Map([['lead','project']]),projectById:new Map([['project',{id:'project'}]]),approvedPlanProjectIds:new Set(['project'])});
  assert.equal(result.children.length,0);
  const legacy = build({tasksRows:[],sxCrmRows:rows,leadProjectById:new Map([['lead','project']]),projectById:new Map([['project',{id:'project'}]])});
  assert.equal(legacy.children.length,1);
});
test('Report uses Vietnam day, separates daily actuals from overdue stock and respects task assignment', () => {
  const window = reportWindow('2026-10-13','2026-10-14T02:00:00Z');
  assert.equal(new Date(window.start).toISOString(),'2026-10-12T17:00:00.000Z');
  assert.equal(new Date(window.end).toISOString(),'2026-10-13T17:00:00.000Z');
  assert.throws(()=>reportWindow('2026-02-30'),/không hợp lệ/);
  const tasks = [
    {id:'old',assignee_id:'a',deadline:'2026-10-12T10:00:00Z'},
    {id:'due',assignee_id:'a',deadline:'2026-10-13T10:00:00Z'},
    {id:'other',assignee_id:'b',deadline:'2026-10-13T10:00:00Z'}
  ];
  const document={active:{plan_schema_version:2,planned_tasks:tasks},execution:{due:{status:'done',completed_at:'2026-10-13T09:00:00Z'}}};
  const result=summarizePlans([{project_id:'p',document,actor_id:'a',can_manage:false}],window);
  assert.equal(result.totals.tasks,2);
  assert.equal(result.totals.due_in_day,1);
  assert.equal(result.totals.completed_in_day,1);
  assert.equal(result.totals.overdue_at_cutoff,1);
  assert.equal(result.totals.due_completed_on_time,1);
  document.execution.due.needs_review=true;
  const reviewed=summarizePlans([{project_id:'p',document,can_manage:true}],window);
  assert.equal(reviewed.totals.completed_in_day,0);
  assert.equal(reviewed.totals.needs_review,1);
});
test('Aggregate source is opt-in, legacy remains the default', () => {
  const original = process.env.WORK_PLANS_AGGREGATES_ENABLED;
  try {
    delete process.env.WORK_PLANS_AGGREGATES_ENABLED;
    assert.equal(workTaskReadSource(), 'unified_tasks_v');
    process.env.WORK_PLANS_AGGREGATES_ENABLED = '1';
    assert.equal(workTaskReadSource(), 'unified_work_tasks_v');
  } finally {
    if (original === undefined) delete process.env.WORK_PLANS_AGGREGATES_ENABLED;
    else process.env.WORK_PLANS_AGGREGATES_ENABLED = original;
  }
});
test('Actual SQL projection: old project intact, active plan replaces only SX, exact dates and canonical review status', async () => {
  const db = new PGlite();
  const project = '00000000-0000-4000-8000-000000000001';
  const old = '00000000-0000-4000-8000-000000000002';
  const actor = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table projects(id uuid primary key, code text, name text);
      create table crm_tasks(id uuid, stage_slug text, production_pipeline_stage_id uuid);
      create type unified_task_source as enum ('task', 'crm_task', 'crm_assignment');
      create table unified_tasks_v(unified_id text, source unified_task_source, source_id text,
        project_id uuid, lead_id uuid, company_id uuid, title text, description text,
        status text, priority text, assignee_id uuid, deadline timestamptz, completed_at timestamptz,
        created_by_id uuid, created_at timestamptz, updated_at timestamptz, task_kind text,
        project_code text, project_name text, lead_title text, is_primary_lead boolean);
      insert into projects values ('${project}', 'NEW', 'Tủ mẫu'), ('${old}', 'OLD', 'Dự án cũ');
      insert into unified_tasks_v(unified_id,source,source_id,project_id,title,task_kind,is_primary_lead) values
        ('sx','task','sx','${project}','SX cũ','SX',true),
        ('vc','task','vc','${project}','VC giữ nguyên','VC',true),
        ('crm','crm_task','${actor}','${project}','Sales giữ nguyên','CRM-Deal',true),
        ('old','task','old','${old}','SX dự án cũ','SX',true);
      grant select on projects, crm_tasks, unified_tasks_v to service_role;`);
    for (const file of ['20261014034959_flexible_work_plans.sql', '20261014050004_work_plan_task_read_model.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../../database', file), 'utf8'));
    }
    const doc = { active: { plan_schema_version: 2, approved_at: '2026-10-13T00:00:00Z',
      planned_tasks: [{ id: 'cut', name: 'Cắt', assignee_id: actor, deadline: '2026-10-14T04:00:00Z' }] },
      execution: { cut: { status: 'done', needs_review: true, completed_at: '2026-10-14T03:00:00Z' } } };
    await db.query('insert into work_plan_instances(project_id,company_id,revision,document) values($1,$2,1,$3)', [project, actor, JSON.stringify(doc)]);
    await db.exec('set role service_role');
    const rows = (await db.query('select * from unified_work_tasks_v order by unified_id')).rows;
    assert.equal(rows.length, 4);
    assert.ok(rows.some(r => r.unified_id === 'old'));
    assert.ok(rows.some(r => r.unified_id === 'vc'));
    assert.ok(rows.some(r => r.unified_id === 'crm'));
    assert.ok(!rows.some(r => r.unified_id === 'sx'));
    const task = rows.find(r => r.source === 'work_plan');
    assert.equal(task.status, 'blocked');
    assert.equal(task.assignee_id, actor);
    assert.equal(task.deadline.toISOString(), '2026-10-14T04:00:00.000Z');
    assert.equal(task.completed_at.toISOString(), '2026-10-14T03:00:00.000Z');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query('select * from unified_work_tasks_v'), /permission denied/);
    }
  } finally { await db.close(); }
});
