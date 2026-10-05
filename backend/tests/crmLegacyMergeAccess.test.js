'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const access = require('../src/helpers/crmLegacyMergeAccess');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actorId=id(1), company=id(2), tenant=id(3), keep=id(4), source=id(5), customer=id(6), region=id(7), pipeline=id(8);
function fixture({ role='sales', patchActor={}, patchKeep={}, patchSource={}, failTable, failWrite=0 }={}) {
  const tables={
    users:[{id:actorId,role,company_id:company,tenant_id:tenant,is_active:true,...patchActor}],
    companies:[{id:company,tenant_id:tenant,is_active:true},{id:id(20),tenant_id:tenant,is_active:true}],
    tenants:[{id:tenant,is_active:true}],
    crm_leads:[keep,source].map((key,i)=>({id:key,type:'lead',company_id:company,customer_id:customer,
      assigned_to:actorId,lead_owner_id:null,pipeline_id:pipeline,region_id:region,created_at:'2026-10-01T01:00:00Z',...(i?patchSource:patchKeep)})),
    customers:[{id:customer,company_id:company}],
    crm_pipelines:[{id:pipeline,company_id:company,allow_employee_delete_lead:true,allow_employee_delete_deal:true}],
    user_company_regions:[{user_id:actorId,region_id:region}],
    company_regions:[{id:region,company_id:company,is_active:true}],
  };
  const db={reads:[],writes:[],from(table){
    let op='read',payload,single=false,from=0,to=Infinity;const filters=[];
    const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},in(k,v){filters.push(row=>v.includes(row[k]));return q;},
      order(){return q;},range(a,b){from=a;to=b;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},
      update(value){op='update';payload=value;return q;},delete(){op='delete';return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        const rows=(tables[table]||[]).filter(row=>filters.every(fn=>fn(row))).slice(from,to+1);
        if(op==='read') { db.reads.push({table});if(table===failTable)return {error:{message:'PRIVATE DATABASE ERROR'}};
          return {data:single?(rows[0]||null):rows.map(x=>({...x}))}; }
        db.writes.push({table,op,payload});
        if(db.writes.length===failWrite)return {error:{message:'PRIVATE DATABASE ERROR'}};
        return {data:rows};
      }).then(resolve,reject);}
    };return q;
  }};
  // Forged broad token fields deliberately disagree with current DB authority.
  const req={user:{userId:actorId,role:'platform_admin',company_id:id(20),tenant_id:id(22),crm_region_ids:[id(99)]},body:{}};
  const run=opts=>access.assertLegacyLeadMergeAccess(db,req,keep,[source],opts);
  return {db,req,tables,run};
}
test('owned same-company Lead selection passes with a fresh actor and normalized IDs',async()=>{
  const f=fixture();const r=await f.run();assert.equal(r.companyId,company);assert.equal(r.actor.role,'sales');
  assert.deepEqual(r.allIds,[keep,source]);assert.equal(f.db.writes.length,0);
  const normalized=access.normalizeMergeIds(keep.toUpperCase(),[source.toUpperCase(),source,keep]);assert.deepEqual(normalized.deleteIds,[source]);
});
for(const [label,args] of [['missing actor',{}],['wrong id',{user:{userId:'x'}}]])test(label+' denies without a read',async()=>{
  const f=fixture();await assert.rejects(access.assertLegacyLeadMergeAccess(f.db,args,keep,[source]),{status:403});assert.equal(f.db.reads.length,0);
});
for(const value of [null,'x',[],['x'],[keep],Array(500).fill(source)])test('invalid source list '+JSON.stringify(value)?.slice(0,50),async()=>{
  const f=fixture();await assert.rejects(access.assertLegacyLeadMergeAccess(f.db,f.req,keep,value),{status:400});assert.equal(f.db.reads.length,0);
});
for(const [name,setup] of [
  ['revoked actor',f=>f.tables.users[0].is_active=false],
  ['missing actor role',f=>f.tables.users[0].role=null],
  ['actor moved company',f=>f.tables.users[0].company_id=id(20)],
  ['tenant mismatch',f=>f.tables.users[0].tenant_id=id(20)],
  ['inactive company',f=>f.tables.companies[0].is_active=false],
  ['inactive tenant',f=>f.tables.tenants[0].is_active=false],
  ['missing source',f=>f.tables.crm_leads.pop()],
  ['foreign source same tenant',f=>f.tables.crm_leads[1].company_id=id(20)],
  ['foreign keep same tenant',f=>f.tables.crm_leads[0].company_id=id(20)],
  ['mixed Lead Deal',f=>f.tables.crm_leads[1].type='deal'],
  ['source owner changed',f=>f.tables.crm_leads[1].assigned_to=id(99)],
  ['keep owner changed',f=>f.tables.crm_leads[0].assigned_to=id(99)],
  ['employee delete disabled',f=>f.tables.crm_pipelines[0].allow_employee_delete_lead=false],
  ['pipeline foreign',f=>f.tables.crm_pipelines[0].company_id=id(20)],
  ['customer foreign',f=>f.tables.customers[0].company_id=id(20)],
  ['customer missing',f=>f.tables.customers=[]],
])test(name+' rejects the complete batch before any mutation',async()=>{
  const f=fixture();setup(f);await assert.rejects(f.run(),{status:403});assert.deepEqual(f.db.writes,[]);
});
for(const table of ['users','companies','tenants','crm_leads','customers','crm_pipelines'])test('failed '+table+' read is unavailable without private detail or writes',async()=>{
  const f=fixture({failTable:table});await assert.rejects(f.run(),e=>e.status===503&&!e.message.includes('PRIVATE'));assert.deepEqual(f.db.writes,[]);
});
test('missing delete-policy column is not interpreted as allowed',async()=>{
  const f=fixture();delete f.tables.crm_pipelines[0].allow_employee_delete_lead;await assert.rejects(f.run(),{status:503});
});
test('missing source pipeline cannot bypass employee deletion policy',async()=>{
  const f=fixture({patchSource:{pipeline_id:null}});await assert.rejects(f.run(),{status:503});assert.deepEqual(f.db.writes,[]);
});
test('Deal employee deletion uses its own setting',async()=>{
  const f=fixture({patchKeep:{type:'deal'},patchSource:{type:'deal'}});f.tables.crm_pipelines[0].allow_employee_delete_deal=false;await assert.rejects(f.run(),{status:403});
});
test('region admin needs current membership even if the token still has the region',async()=>{
  const f=fixture({role:'region_admin'});await f.run();f.tables.user_company_regions=[];await assert.rejects(f.run(),{status:403});
});
test('a region admin with no region is never treated as unscoped',async()=>{
  const f=fixture({role:'region_admin',patchSource:{region_id:null}});await assert.rejects(f.run(),{status:403});
});
for (const patch of [{company_id:id(20)},{is_active:false}]) test('region authority checks the current region '+JSON.stringify(patch),async()=>{
  const f=fixture({role:'region_admin'});Object.assign(f.tables.company_regions[0],patch);await assert.rejects(f.run(),{status:403});
});
test('company admin cannot merge a second company in the same tenant',async()=>{
  const f=fixture({role:'admin',patchSource:{company_id:id(20)}});await assert.rejects(f.run(),{status:403});
});
test('ecosystem admin requires a current tenant; platform still cannot mix companies',async()=>{
  const f=fixture({role:'ecosystem_admin',patchActor:{company_id:null}});await f.run();f.tables.users[0].tenant_id=null;await assert.rejects(f.run(),{status:403});
  const p=fixture({role:'platform_admin',patchActor:{company_id:null,tenant_id:null},patchSource:{company_id:id(20)}});await assert.rejects(p.run(),{status:403});
});
test('both tenantless company and actor can work only within their own company',async()=>{
  const f=fixture({patchActor:{tenant_id:null}});f.tables.companies[0].tenant_id=null;await f.run();
  f.tables.users[0].company_id=null;f.tables.users[0].role='admin';await assert.rejects(f.run(),{status:403});
});
test('distinct Customer consolidation is held before its unbounded legacy reassign, including admin',async()=>{
  const f=fixture();f.tables.customers.push({id:id(21),company_id:company});f.tables.crm_leads[1].customer_id=id(21);
  await assert.rejects(f.run({mergeCustomers:true}),{code:'CRM_CUSTOMER_MERGE_REVIEW_REQUIRED'});await f.run({mergeCustomers:false});
  f.tables.users[0].role='admin';await assert.rejects(f.run({mergeCustomers:true}),{status:409});
  f.tables.crm_leads.push({...f.tables.crm_leads[1],id:id(30),company_id:id(20)});
  await assert.rejects(f.run({mergeCustomers:true}),{status:409});assert.deepEqual(f.db.writes,[]);
});
test('cleanup is bounded to a current company and requires broad company authority',async()=>{
  const f=fixture();await assert.rejects(access.legacyCleanupScope(f.db,f.req),{status:403});
  f.tables.users[0].role='admin';assert.equal((await access.legacyCleanupScope(f.db,f.req)).companyId,company);
  f.req.body.company_id=id(20);await assert.rejects(access.legacyCleanupScope(f.db,f.req),{status:403});
  f.tables.users[0].role='ecosystem_admin';f.tables.users[0].company_id=null;
  assert.equal((await access.legacyCleanupScope(f.db,f.req)).companyId,id(20));
  f.req.body={};await assert.rejects(access.legacyCleanupScope(f.db,f.req),{status:403});
});

const routeSource=fs.readFileSync(path.join(__dirname,'../src/routes/crm/routes/leadDuplicates.js'),'utf8');
function route(url,ctx) {
  let handler;const start=routeSource.indexOf(`r.post('${url}'`),end=routeSource.indexOf('\n});',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(routeSource.slice(start,end+4),{...access,require:()=>({assertLegacyFacebookWriteAllowed:async()=>{}}),
    emitCrmDashboardChanged:()=>{},...ctx,r:{post:(_,fn)=>{handler=fn;}}});return handler;
}
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}});
for(const url of ['/leads/merge-duplicates','/leads/merge-selected'])test('actual '+url+' passes only server request authority into merge',async()=>{
  const f=fixture(),res=response();f.req.body={keep_id:keep,delete_ids:[source],request:{user:{role:'platform_admin'}}};let received;
  await route(url,{executeLeadMerge:async(k,ds,o)=>{received=o.request;return {success:true};}})(f.req,res);
  assert.equal(received,f.req);assert.equal(res.statusCode,200);
});
test('actual cleanup never treats two opportunities for the same buyer as proof of duplicates',async()=>{
  const f=fixture({role:'admin',failWrite:2}),res=response();await route('/leads/cleanup-duplicates',{supabase:f.db})(f.req,res);
  assert.equal(res.statusCode,409);assert.deepEqual(f.db.writes,[]);
  assert.equal(res.body.code,'CRM_DUPLICATES_REQUIRE_REVIEW');assert.equal(res.body.deleted,0);assert.equal(res.body.candidateGroups,1);
});
test('actual cleanup checks every group before its first mutation',async()=>{
  const f=fixture({role:'admin'}),res=response();f.tables.crm_leads.push(...[10,11].map(n=>({...f.tables.crm_leads[0],id:id(n),customer_id:id(12)})));
  f.tables.customers.push({id:id(12),company_id:id(20)});
  await route('/leads/cleanup-duplicates',{supabase:f.db})(f.req,res);assert.equal(res.statusCode,403);assert.deepEqual(f.db.writes,[]);
});
test('actual cleanup neither scans nor mutates another company',async()=>{
  const f=fixture({role:'admin'}),res=response();f.tables.crm_leads=f.tables.crm_leads.map(x=>({...x,company_id:id(20)}));
  await route('/leads/cleanup-duplicates',{supabase:f.db})(f.req,res);assert.equal(res.statusCode,200);assert.equal(res.body.deleted,0);assert.deepEqual(f.db.writes,[]);
});
test('actual cleanup rejects truncated scope and separates Lead from Deal',async()=>{
  const f=fixture({role:'admin'});f.tables.crm_leads[1].type='deal';let res=response();
  await route('/leads/cleanup-duplicates',{supabase:f.db})(f.req,res);assert.equal(res.body.deleted,0);
  f.tables.crm_leads=Array.from({length:501},(_,n)=>({...f.tables.crm_leads[0],id:id(n+1000)}));res=response();
  await route('/leads/cleanup-duplicates',{supabase:f.db})(f.req,res);assert.equal(res.statusCode,409);assert.deepEqual(f.db.writes,[]);
});
test('actual merge helper rejects unauthorized source before its legacy mutation body',async()=>{
  const f=fixture({patchSource:{company_id:id(20)}}),src=fs.readFileSync(path.join(__dirname,'../src/routes/crm/shared/helpersBundle.js'),'utf8');
  const start=src.indexOf('async function executeLeadMerge('),end=src.indexOf('\n}',start);const ctx={supabase:f.db,require:()=>access};
  vm.runInNewContext(src.slice(start,end+2),ctx);
  await assert.rejects(ctx.executeLeadMerge(keep,[source],{request:f.req}),{status:403});assert.deepEqual(f.db.writes,[]);
});
