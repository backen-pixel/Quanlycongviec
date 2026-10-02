'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createLeadQualityService } = require('../src/modules/crmLeadQuality/service');
const actorId='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',leadId='33333333-3333-4333-8333-333333333333';
const context={actorId,companyId,leadId},version='a'.repeat(32);
const body=()=>({requestId:'44444444-4444-4444-8444-444444444444',expectedRevision:0,contextVersion:version,status:'QUALIFIED',contactVerified:true,demandMatches:true,serviceAreaVerified:true,evidence:'Khách xác nhận nhu cầu tủ bếp và địa điểm khảo sát.'});
const snapshot={status:'QUALIFIED',revision:1,contextVersion:version};
function fixture({primary=true,error=null,data=snapshot}={}) { const calls=[];return {calls,service:createLeadQualityService({isPrimary:()=>primary,db:{rpc:async(name,args)=>{calls.push({name,args});return{data,error};}}})}; }
test('writes authenticated actor/company and structured evidence to CRM RPC',async()=>{const f=fixture();assert.deepEqual(await f.service.record(context,body()),snapshot);assert.equal(f.calls[0].args.p_actor_id,actorId);assert.equal(f.calls[0].args.p_company_id,companyId);assert.equal(f.calls[0].name,'crm_lead_quality_record');});
for(const field of ['actorId','companyId','leadId','qualifiedBy','sourceVerified','canonicalLeadId','qualifiedAt']) test('rejects client supplied authority '+field,async()=>{const f=fixture();assert.throws(()=>f.service.record(context,{...body(),[field]:actorId}),e=>e.code==='INVALID_QUALIFICATION');assert.equal(f.calls.length,0);});
for(const patch of [{contactVerified:'true'},{demandMatches:false},{serviceAreaVerified:null},{expectedRevision:-1},{expectedRevision:1.5},{requestId:'unknown'},{contextVersion:'old'},{evidence:'guess'},{evidence:'x'.repeat(2001)},{status:'WON'}]) test('rejects invalid facts, revision or evidence '+JSON.stringify(patch).slice(0,80),()=>{const f=fixture();assert.throws(()=>f.service.record(context,{...body(),...patch}));assert.equal(f.calls.length,0);});
test('primary guard applies to reads and writes before any DB call',async()=>{const f=fixture({primary:false});await assert.rejects(f.service.read(context));await assert.rejects(f.service.record(context,body()));assert.equal(f.calls.length,0);});
test('missing server identity cannot call DB',async()=>{const f=fixture();await assert.rejects(f.service.read({...context,actorId:null}));assert.equal(f.calls.length,0);});
for(const [pg,code,status] of [['42501','FORBIDDEN',403],['40001','STALE_CONTEXT',409],['23505','IDEMPOTENCY_CONFLICT',409],['P0002','NOT_FOUND',404],['22023','INVALID_QUALIFICATION',400],['XX000','QUALITY_UNAVAILABLE',503]]) test('sanitizes DB error '+pg,async()=>{const f=fixture({error:{code:pg,message:'secret upstream content'}});await assert.rejects(f.service.read(context),e=>e.code===code&&e.status===status&&!e.message.includes('secret'));});
for(const data of [null,[],{status:'QUALIFIED',revision:1}, {...snapshot,revision:'1'}]) test('malformed source cannot turn into verified status '+JSON.stringify(data),async()=>{await assert.rejects(fixture({data}).service.read(context),e=>e.code==='QUALITY_UNAVAILABLE');});

const source=fs.readFileSync(path.resolve(__dirname,'../src/routes/crm/routes/leadQuality.js'),'utf8');
function router({enabled=true,primary=true,error=null}={}) {
 const routes={},calls=[];
 const deps={express:{Router:()=>({get:(p,h)=>routes['GET '+p]=h,post:(p,h)=>routes['POST '+p]=h})},'../../../config/supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:snapshot,error};}}},'../../../config/supabaseRouter':{isFailoverEnabled:()=>!primary,getActiveTarget:()=> 'primary'},'../../../modules/crmLeadQuality/service':{createLeadQualityService}};
 vm.runInNewContext(source,{require:n=>{if(!deps[n])throw Error(n);return deps[n]},module:{exports:{}},process:{env:{VPT_CRM_LEAD_QUALITY:enabled?'1':'0'}}});
 const request={params:{id:leadId},user:{id:actorId,userId:actorId},crmLeadAccess:{lead:{id:leadId,company_id:companyId}},body:body()};
 async function invoke(req=request,method='POST'){const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await routes[method+' /leads/:id/marketing-quality'](req,res);return res;}
 return {request,invoke,calls};
}
test('actual router uses parent lead company and no-store response',async()=>{const f=router();f.request.query={company_id:actorId};const r=await f.invoke();assert.equal(r.statusCode,200);assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(f.calls[0].args.p_company_id,companyId);});
test('default disabled never touches DB',async()=>{const f=router({enabled:false});assert.equal((await f.invoke()).body.code,'QUALITY_DISABLED');assert.equal(f.calls.length,0);});
test('missing parent authorization and alias identity conflicts deny before RPC',async()=>{for(const patch of [{crmLeadAccess:null},{user:{id:companyId,userId:actorId}},{params:{id:companyId}}]){const f=router();assert.equal((await f.invoke({...f.request,...patch})).statusCode,403);assert.equal(f.calls.length,0);}});
test('record DB failure returns unknown outcome without leaking message',async()=>{const f=router({error:{code:'XX000',message:'private SQL'}});const r=await f.invoke();assert.equal(r.statusCode,503);assert.equal(r.body.code,'QUALITY_UNAVAILABLE');assert.ok(!JSON.stringify(r.body).includes('private'));});
test('composition authenticates and checks Lead before mounting new route',()=>{const s=fs.readFileSync(path.resolve(__dirname,'../src/routes/crm/index.js'),'utf8');assert.ok(s.indexOf('r.use(auth)')<s.indexOf('r.use(leadQuality)'));assert.ok(s.indexOf('r.use(enforceCrmDealAssigneeAccess)')<s.indexOf('r.use(leadQuality)'));assert.ok(s.indexOf('r.use(leadQuality)')<s.indexOf('r.use(leadLifecycle)'));});
