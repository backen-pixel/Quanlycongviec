const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { schedule, templateGraph } = require('../src/modules/work-plans/domain/schedule');
const { createService } = require('../src/modules/work-plans/application/service');
const { createRouter } = require('../src/modules/work-plans/public/router');
const { canManage } = require('../src/modules/work-plans/application/permissions');
const { createRepository } = require('../src/modules/work-plans/infrastructure/repository');
const {summarizeBoard}=require('../src/modules/work-plans/domain/board');
const {progression}=require('../src/modules/work-plans/domain/progression');
test('stage progression waits for every task, preserves parallel branches and returns on reopen',()=>{
  const result={graph:{stages:[{id:'a',name:'Vật tư'},{id:'b',name:'Gia công'},{id:'c',name:'Đóng gói'}]},tasks:[
    {id:'1',stage_id:'a',status:'done',ready:true},
    {id:'2',stage_id:'a',status:'pending',ready:true,required:false},
    {id:'3',stage_id:'b',status:'pending',ready:true},
    {id:'4',stage_id:'c',status:'pending',ready:false}]};
  assert.equal(progression(result).current.id,'a');
  assert.deepEqual(progression(result).active_stages.map(s=>s.id),['a','b']);
  assert.deepEqual(progression(result).waiting_stages.map(s=>s.id),['c']);
  assert.deepEqual(progression(result).parallel.map(s=>s.id),['b']);
  result.tasks[1].status='done';assert.equal(progression(result).current.id,'b');
  assert.deepEqual(progression(result).active_stages.map(s=>s.id),['b']);
  result.tasks[2].status='done';result.tasks[3].ready=true;
  assert.equal(progression(result).current.id,'c');
  result.tasks[3].status='done';assert.equal(progression(result).complete,true);
  result.tasks[0].needs_review=true;assert.equal(progression(result).current.id,'a');
  assert.equal(progression(result).stages[0].review,true);
  assert.deepEqual(progression(result).active_stages.map(s=>s.id),['a']);
});
test('Board preserves parallel ready stages, review and waiver semantics without leaking colleague tasks',()=>{
  const g={stages:[{id:'s1',name:'Thùng'},{id:'s2',name:'Kính'}],tasks:[{id:'a',name:'Thùng',stage_id:'s1',hours:8,dependencies:[],assignee_id:actor},{id:'b',name:'Kính',stage_id:'s2',hours:8,dependencies:[],assignee_id:other}],calendar:{weekdays:[1,2,3,4,5,6],shifts:[[8,12],[13,17]]}};
  const doc={active:{graph:g,deadline:'2026-10-12T12:00:00+07:00'},execution:{}};
  const m={manager:true,actorId:actor};
  const both=summarizeBoard(doc,m,'2026-10-12T12:01:00+07:00');assert.equal(both.total,2);assert.equal(both.open_stages.length,2);assert.equal(both.overdue,2);
  const personal=summarizeBoard(doc,{manager:false,actorId:actor},'2026-10-12T12:01:00+07:00');assert.equal(personal.total,1);assert.deepEqual(personal.open_stages,[{id:'s1',name:'Thùng'}]);
  doc.execution={a:{status:'done',needs_review:true},b:{status:'waived'}};
  const reviewed=summarizeBoard(doc,m,'2026-10-12T12:01:00+07:00');assert.equal(reviewed.completed,0);assert.equal(reviewed.waived,1);assert.equal(reviewed.needs_review,1);assert.equal(reviewed.complete,false);
  assert.equal(summarizeBoard(null,m).state,'none');assert.equal(summarizeBoard({draft:{}},m).state,'draft');
});
test('Board does not advertise a doing successor when its predecessor is reopened',()=>{
  const g={stages:[{id:'s1',name:'Chuẩn bị'},{id:'s2',name:'Sơn'}],tasks:[{id:'a',name:'Kính',stage_id:'s1',hours:8,dependencies:[],assignee_id:other},{id:'b',name:'Sơn',stage_id:'s2',hours:8,dependencies:['a'],assignee_id:actor}]};
  const d={active:{graph:g,deadline:'2026-11-01T17:00:00+07:00'},execution:{a:{status:'pending'},b:{status:'doing'}}};
  const s=summarizeBoard(d,{manager:false,actorId:actor});assert.equal(s.blocked,true);assert.deepEqual(s.open_stages,[]);
});
test('Board HTTP validates batches, hides denied projects and surfaces read failures',async()=>{
  const previous=process.env.WORK_PLANS_AGGREGATES_ENABLED;process.env.WORK_PLANS_AGGREGATES_ENABLED='1';
  const express=require('express');const app=express();let failRead=false;
  const repo={getPlan:async()=>{if(failRead)throw Error('offline');return null;}};
  app.use('/plans',createRouter({repository:repo,auth:(req,res,next)=>{req.user={userId:actor,company_id:company};next();},scope:async(req,res,id)=>id===other?null:{project:{company_id:company}},isManager:()=>true}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const url=`http://127.0.0.1:${server.address().port}/plans/board`;
    assert.equal((await fetch(url+'?ids=invalid')).status,400);
    const result=await(await fetch(url+`?ids=${actor},${other}`)).json();assert.equal(result.items.length,1);assert.equal(result.items[0].state,'none');
    failRead=true;assert.equal((await fetch(url+`?ids=${actor}`)).status,503);
  }finally{await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.WORK_PLANS_AGGREGATES_ENABLED;else process.env.WORK_PLANS_AGGREGATES_ENABLED=previous;}
});
const actor='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002', company='00000000-0000-4000-8000-000000000003';
const now='2026-10-12T08:00:00+07:00', deadline='2026-10-19T17:00:00+07:00';
const ctx={actorId:actor,companyId:company,manager:true};
function graph(days=[1,1,2,2,1,1,1],deps=[[],[0],[1],[1],[2,3],[4],[5]]) {
  return {stages:days.map((_,i)=>({id:`s${i}`,name:`Công đoạn ${i}`})),tasks:days.map((d,i)=>({id:`t${i}`,name:`Việc ${i}`,stage_id:`s${i}`,hours:d*8,dependencies:deps[i].map(j=>`t${j}`),assignee_id:actor})),calendar:{weekdays:[1,2,3,4,5,6],shifts:[[8,12],[13,17]],holidays:[]}};
}
function memory(){let row=null;const commands=new Map();const templates=[];const versions=[];
  return {getPlan:async()=>row,replay:async(id,hash,c)=>{const p=commands.get(id);if(!p)return null;if(p.hash!==hash||p.actor!==c.actorId)throw Object.assign(new Error('reused'),{status:409});return p.result;},
    commit:async(kind,id,expected,key,hash,doc,c)=>{if(kind==='template'){const result={revision:expected+1,document:structuredClone(doc)};templates.push(result);return result;}if((row?.revision||0)!==expected)throw Object.assign(new Error('conflict'),{status:409});row={company_id:c.companyId,revision:expected+1,document:structuredClone(doc)};versions.push(structuredClone(row));const result={revision:row.revision,document:row.document};commands.set(key,{hash,actor:c.actorId,result:structuredClone(result)});return result;},
    getTemplate:async()=>({document:{}}),listTemplates:async()=>templates,history:async()=>versions,listPlans:async()=>row?[{...row,project_id:actor}]:[],peek:()=>row};
}
test('Cabinet critical path is seven working days, parallel branches share dates',()=>{const r=schedule(graph(),deadline,now);assert.equal(r.tasks[0].planned_start,'2026-10-12T01:00:00.000Z');assert.equal(r.tasks[2].planned_start,r.tasks[3].planned_start);assert.equal(r.forecast_finish,'2026-10-19T10:00:00.000Z');assert.equal(r.feasible,true);assert.ok(r.collisions.length>0);});
test('Glass takes six days, short branch gets later latest-start than longest branch',()=>{const r=schedule(graph([1,2,1,1,1,1],[[],[0],[0],[1,2],[3],[4]]),'2026-10-17T17:00:00+07:00',now);assert.equal(r.tasks[0].planned_start,'2026-10-12T01:00:00.000Z');assert.ok(r.tasks[2].planned_start>r.tasks[1].planned_start);});
test('Holidays, Sundays and lunch are excluded',()=>{const g=graph([1],[[]]);g.calendar.holidays=['2026-10-19'];const r=schedule(g,'2026-10-19T17:00:00+07:00',now);assert.equal(r.tasks[0].planned_start,'2026-10-17T01:00:00.000Z');assert.equal(r.tasks[0].deadline,'2026-10-17T10:00:00.000Z');});
test('Fractional duration crosses lunch correctly',()=>{const g=graph([1],[[]]);g.tasks[0].hours=1.5;const r=schedule(g,'2026-10-12T13:30:00+07:00',now);assert.equal(r.tasks[0].planned_start,'2026-10-12T04:00:00.000Z');});
test('24-hour shifts have exact midnight boundaries without millisecond drift',()=>{const g=graph([1],[[]]);g.tasks[0].hours=48;g.calendar.weekdays=[0,1,2,3,4,5,6];g.calendar.shifts=[[0,24]];const r=schedule(g,'2026-10-14T00:00:00+07:00',now);assert.equal(r.tasks[0].planned_start,'2026-10-11T17:00:00.000Z');assert.equal(r.tasks[0].deadline,'2026-10-13T17:00:00.000Z');});
test('Supplier elapsed-time wait includes weekends and nights',()=>{const g=graph([1],[[]]);g.tasks[0].hours=48;g.tasks[0].clock_mode='elapsed';const r=schedule(g,'2026-10-19T08:00:00+07:00',now);assert.equal(r.tasks[0].planned_start,'2026-10-17T01:00:00.000Z');});
test('Deadline at weekend produces actual last working finish',()=>{const r=schedule(graph([1],[[]]),'2026-10-18T17:00:00+07:00',now);assert.equal(r.tasks[0].deadline,'2026-10-17T10:00:00.000Z');});
test('Cycle, missing predecessor, duplicate ID, zero duration and overlapping shifts fail',()=>{for(const alter of [g=>g.tasks[0].dependencies=['t6'],g=>g.tasks[0].dependencies=['absent'],g=>g.tasks[1].id='t0',g=>g.tasks[0].hours=0,g=>g.calendar.shifts=[[8,13],[12,17]]]){const g=graph();alter(g);assert.throws(()=>schedule(g,deadline,now));}});
test('Template excludes assignment, customer, dates and execution fields',()=>{const g=graph();g.customer='SECRET';g.tasks[0].status='done';g.tasks[0].deadline=deadline;const clean=templateGraph(g);assert.equal(clean.tasks[0].assignee_id,null);assert.equal(clean.customer,undefined);assert.equal(clean.tasks[0].status,undefined);assert.equal(clean.tasks[0].deadline,undefined);});
test('Template drops project-specific holidays',()=>{const g=graph();g.calendar.holidays=['2026-10-15'];assert.deepEqual(templateGraph(g).calendar.holidays,[]);});
test('Company module admin cannot manage another production company through logistics access',()=>{const project={company_id:company,logistics_company_id:other};assert.equal(canManage({userId:actor,role:'production_admin',company_id:other},project),false);assert.equal(canManage({userId:actor,role:'production_admin',company_id:company},project),true);assert.equal(canManage({userId:actor,role:'production_staff',company_id:company},project),false);assert.equal(canManage({userId:actor,role:'staff',company_id:other},{...project,project_manager_id:actor}),true);});
test('Personal task candidates include cross-company assignments without browser company override',async()=>{const filters=[];const db={from:()=>{const q={select:()=>q,order:()=>q,range:()=>q,eq:(k,v)=>{filters.push([k,v]);return Promise.resolve({data:[{project_id:actor,company_id:company}]});},contains:(k,v)=>{filters.push([k,v]);return Promise.resolve({data:[{project_id:actor,company_id:company},{project_id:other,company_id:other}]});}};return q;}};const result=await createRepository(db).listPlans(company,0,actor);assert.equal(result.rows.length,2);assert.deepEqual(filters[1],['document',{active:{graph:{tasks:[{assignee_id:actor}]}}}]);});
async function setup(){const repo=memory();const svc=createService(repo,()=>now);let rev=0;const run=async(body,c=ctx)=>{const r=await svc.command(actor,{expected_revision:rev,command_id:randomUUID(),...body},c);rev=r.revision;return r;};await run({action:'draft',graph:graph([1,1],[[],[0]]),deadline});await run({action:'approve'});return {repo,svc,run,revision:()=>rev};}
test('Manager reassign preserves planned deadlines, moves task ownership and retains assignment history',async()=>{
 const {run}=await setup();await assert.rejects(run({action:'reassign',task_id:'t0',assignee_id:other,reason:'test'},{...ctx,manager:false}),e=>e.status===403);
 await assert.rejects(run({action:'reassign',task_id:'t0',assignee_id:other}),/lý do/);
 const r=await run({action:'reassign',task_id:'t0',assignee_id:other,reason:'Điều phối thử'});
 assert.equal(r.document.active.graph.tasks[0].assignee_id,other);assert.equal(r.document.active.planned_tasks[0].assignee_id,other);assert.equal(Date.parse(r.document.active.deadline),Date.parse(deadline));assert.equal(r.document.assignment_latest.t0.previous,actor);
 await assert.rejects(run({action:'task',task_id:'t0',status:'done'},{...ctx,manager:false}),e=>e.status===403);
 await run({action:'task',task_id:'t0',status:'done'},{...ctx,manager:false,actorId:other});
 await assert.rejects(run({action:'reassign',task_id:'t0',assignee_id:actor,reason:'changed'}),/Mở lại/);
});
test('Mandatory tasks must have an assignee before approval',async()=>{const repo=memory(),svc=createService(repo,()=>now);const g=graph();g.tasks[0].assignee_id=null;await svc.command(actor,{action:'draft',graph:g,deadline,expected_revision:0,command_id:randomUUID()},ctx);await assert.rejects(svc.command(actor,{action:'approve',expected_revision:1,command_id:randomUUID()},ctx),/giao người phụ trách/);assert.equal(repo.peek().document.active,null);});
test('Draft does not activate execution; approval creates immutable baseline',async()=>{const repo=memory(),svc=createService(repo,()=>now);const r=await svc.command(actor,{action:'draft',graph:graph(),deadline,expected_revision:0,command_id:randomUUID()},ctx);assert.equal(r.schedule,null);assert.ok(r.preview);const approved=await svc.command(actor,{action:'approve',expected_revision:1,command_id:randomUUID()},ctx);assert.equal(approved.document.baselines.length,1);assert.equal((await repo.history()).length,2);});
test('Staff cannot plan, update another person task or skip predecessor',async()=>{const {run}=await setup();const staff={...ctx,manager:false};await assert.rejects(run({action:'draft',graph:graph(),deadline},staff),e=>e.status===403);await assert.rejects(run({action:'task',task_id:'t0',status:'done'},{...staff,actorId:other}),e=>e.status===403);await assert.rejects(run({action:'task',task_id:'t1',status:'done'},staff),/nhiệm vụ trước/);});
test('Completion updates readiness and stage from canonical execution',async()=>{const {run}=await setup();const r=await run({action:'task',task_id:'t0',status:'done'},{...ctx,manager:false});assert.equal(r.schedule.tasks[1].ready,true);assert.equal(r.schedule.stages[0].complete,true);assert.equal(r.schedule.stages[1].complete,false);});
test('Required evidence and waiver reason are enforced',async()=>{const {run}=await setup();const g=graph([1,1],[[],[0]]);g.tasks[0].evidence_required=true;await run({action:'draft',graph:g,deadline,reason:'Cần ảnh'});await run({action:'approve'});await assert.rejects(run({action:'task',task_id:'t0',status:'done'}),/minh chứng/);await assert.rejects(run({action:'task',task_id:'t0',status:'waived'}),e=>e.status===403);await run({action:'task',task_id:'t0',status:'waived',reason:'Quản lý miễn nhiệm vụ'});});
test('Staff cannot reopen a waived task',async()=>{const {run}=await setup();await run({action:'task',task_id:'t0',status:'waived',reason:'Miễn'});await assert.rejects(run({action:'task',task_id:'t0',status:'pending'},{...ctx,manager:false}),e=>e.status===403);});
test('Completed task identity cannot be reused for a different template task',async()=>{const {run}=await setup();await run({action:'task',task_id:'t0',status:'done'});const g=graph([1,1],[[],[0]]);g.tasks[0].name='Hoạt động khác';await run({action:'draft',graph:g,deadline,reason:'Đổi quy trình'});await assert.rejects(run({action:'approve'}),/nội dung/);});
test('Completion after baseline deadline retains completed-late indicator',()=>{const g=graph([1],[[]]);const r=schedule(g,'2026-10-12T17:00:00+07:00','2026-10-13T08:00:00+07:00',{t0:{status:'done',completed_at:'2026-10-12T18:00:00+07:00'}});assert.equal(r.tasks[0].completed_late,true);assert.equal(r.tasks[0].overdue,false);});
test('Reopening predecessor preserves successor completion and requires revalidation',async()=>{const {run,repo}=await setup();await run({action:'task',task_id:'t0',status:'done'});await run({action:'task',task_id:'t1',status:'done',evidence:'Ảnh bàn giao'});const completed=repo.peek().document.execution.t1.completed_at;await assert.rejects(run({action:'task',task_id:'t0',status:'pending',reason:'Làm lại'}),/xác nhận/);const r=await run({action:'task',task_id:'t0',status:'pending',reason:'Làm lại',reopen_successors:true});assert.equal(r.schedule.tasks[1].status,'done');assert.equal(r.schedule.tasks[1].needs_review,true);assert.equal(r.schedule.tasks[1].completed_at,completed);assert.equal(r.schedule.tasks[1].evidence,'Ảnh bàn giao');assert.equal(r.schedule.stages[1].complete,false);});
test('Late approval requires explicit acknowledgment; execution cannot be deleted by replanning',async()=>{const {run}=await setup();await run({action:'task',task_id:'t0',status:'done'});await run({action:'draft',graph:graph([1],[[]]),deadline:'2026-10-10T17:00:00+07:00',reason:'Đổi'});await assert.rejects(run({action:'approve'}),/rủi ro trễ/);await run({action:'approve',accept_late:true});const g=graph([1],[[]]);g.tasks[0].id='new';await run({action:'draft',graph:g,deadline,reason:'Đổi'});await assert.rejects(run({action:'approve'}),/lịch sử/);});
test('Optimistic version lock and command replay prevent stale writes and duplicate completion',async()=>{const {svc,repo,revision}=await setup();const b={action:'task',task_id:'t0',status:'done',expected_revision:revision(),command_id:randomUUID()};const first=await svc.command(actor,b,ctx);const replay=await svc.command(actor,b,ctx);assert.deepEqual(first,replay);assert.equal(repo.peek().revision,3);await assert.rejects(svc.command(actor,{...b,command_id:randomUUID()},ctx),e=>e.status===409);});
test('Real HTTP router gates project access and staff commands without starting production jobs',async()=>{const express=require('express');const repo=memory();const app=express();app.use(express.json());app.use('/plans',createRouter({repository:repo,auth:(req,res,next)=>{req.user={userId:actor,company_id:company};next();},scope:async(req,res,id)=>id===other?(res.status(403).json({error:'denied'}),null):{project:{id,company_id:company}},isManager:()=>false,validateAssignees:async()=>{}}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{const base=`http://127.0.0.1:${server.address().port}/plans`;assert.equal((await fetch(`${base}/${other}`)).status,403);const old=await (await fetch(`${base}/${actor}`)).json();assert.equal(old.document,null);assert.equal((await fetch(`${base}/${actor}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'draft'})})).status,403);assert.equal((await fetch(`${base}/${actor}/history`)).status,403);}finally{await new Promise(resolve=>server.close(resolve));}});
