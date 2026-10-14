const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createCollaborationService}=require('../src/modules/work-plans/application/collaboration');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
const p=randomUUID(),co=randomUUID(),actor=randomUUID(),other=randomUUID(),ctx={companyId:co,actorId:actor,manager:false};
function mock(){let comments=[],files=[],removed=[];const repo={plan:async()=>({company_id:co,document:{active:{graph:{tasks:[{id:'a',assignee_id:actor},{id:'b',assignee_id:other}]}}}}),comments:async()=>comments,comment:async id=>comments.find(c=>c.id===id),files:async(p,t,ids)=>files.filter(f=>f.project_id===p&&f.task_id===t&&ids.includes(f.id)),insertComment:async c=>{comments.push(c);return {id:c.id};},insertFile:async f=>{files.push(f);return f;},upload:async()=>{},signed:async()=>({signedUrl:'https://example.invalid/private'}),removeUploaded:async s=>removed.push(s)};return {repo,comments,files,removed};}
test('Collaboration is task-scoped, replay-safe and validates ownership of attachments',async()=>{
 const m=mock(),s=createCollaborationService(m.repo);
 await assert.rejects(s.list(p,'b',ctx,0),e=>e.status===403);
 await assert.rejects(s.list(p,'missing',{...ctx,manager:true},0),e=>e.status===404);
 const file=await s.upload(p,'a',ctx,{originalname:'../../test.txt',buffer:Buffer.from('test')});
 assert.ok(file.storage_path.startsWith(`${co}/${p}/a/${actor}/`));assert.equal(file.bytes,4);
 const body={id:randomUUID(),body:'Nội dung thử',file_ids:[file.id]};await s.post(p,'a',ctx,body);await s.post(p,'a',ctx,body);assert.equal(m.comments.length,1);
 await assert.rejects(s.post(p,'a',ctx,{...body,body:'changed'}),e=>e.status===409);
 assert.equal((await s.list(p,'a',ctx,0)).comments[0].attachments[0].id,file.id);
 await assert.rejects(s.post(p,'a',ctx,{id:randomUUID(),body:'foreign',file_ids:[randomUUID()]}),e=>e.status===403);
 await assert.rejects(s.download(p,'b',ctx,file.id),e=>e.status===403);
 await assert.rejects(s.upload(p,'a',ctx,{buffer:Buffer.alloc(8388609)}),e=>e.status===413);
});
test('Definite SQL rejection cleans only the newly created private object; unknown outcome retains it',async()=>{const m=mock();m.repo.insertFile=async()=>{throw Object.assign(Error('changed'),{status:403,code:'42501'});};await assert.rejects(createCollaborationService(m.repo).upload(p,'a',ctx,{originalname:'a.txt',buffer:Buffer.from('a')}),e=>e.status===403);assert.equal(m.removed.length,1);assert.ok(m.removed[0].startsWith(`${co}/${p}/a/${actor}/`));m.repo.insertFile=async()=>{throw Error('network unknown');};await assert.rejects(createCollaborationService(m.repo).upload(p,'a',ctx,{originalname:'b.txt',buffer:Buffer.from('b')}));assert.equal(m.removed.length,1);});
test('Collaboration migration enforces privacy, current assignee and history preservation in PostgreSQL',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer);
 create table public.companies(id uuid primary key);create table public.users(id uuid primary key,company_id uuid,role text);
 create table public.user_module_roles(user_id uuid,module_key text,role text);
 create table public.projects(id uuid primary key,company_id uuid,project_manager_id uuid,production_person_id uuid);
 insert into public.companies values('${co}');insert into public.users values('${actor}','${co}','production_staff'),('${other}','${co}','production_staff');insert into public.projects values('${p}','${co}',null,null);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../../database/20261014034959_flexible_work_plans.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../database/20261014162507_work_plan_collaboration.sql'),'utf8'));
 const doc={active:{graph:{tasks:[{id:'a',assignee_id:actor}]}}};await db.query('insert into work_plan_instances(project_id,company_id,revision,document) values($1,$2,1,$3)',[p,co,doc]);
 const insert=(who,id=randomUUID())=>db.query('insert into work_plan_comments(id,project_id,company_id,task_id,author_id,body) values($1,$2,$3,$4,$5,$6)',[id,p,co,'a',who,'SQL test']);
 await assert.rejects(insert(other),/Người phụ trách/);await insert(actor);
 await assert.rejects(db.query('update work_plan_instances set document=$1 where project_id=$2',[{active:{graph:{tasks:[]}}},p]),/Không được xóa/);
 doc.active.graph.tasks[0].assignee_id=other;await db.query('update work_plan_instances set document=$1 where project_id=$2',[doc,p]);await assert.rejects(insert(actor),/Người phụ trách/);await insert(other);
 assert.equal((await db.query("select public from storage.buckets where id='work-plan-files'")).rows[0].public,false);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from work_plan_comments'),/permission denied/);await assert.rejects(db.query('select * from work_plan_files'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
