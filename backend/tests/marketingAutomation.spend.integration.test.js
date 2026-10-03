'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=require('../src/modules/marketingAutomation/facebookSpendSource');
const routeSource=fs.readFileSync(path.join(__dirname,'../src/routes/adAnalytics.js'),'utf8');
const company='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
function route({role='sales_admin',scope=[company],failover=false,enabled=true,tenantEnforced=true,userCompany=company}={}){
 const handlers={},calls=[],router={use(){}};
 for(const method of ['get','post','put','delete','patch'])router[method]=(p,...f)=>handlers[method+p]=f.at(-1);
 const deps={express:{Router:()=>router},'../config/supabase':{supabase:{}},'../middleware/auth':{auth(){}},
 '../helpers/adminRole':{isAdminLike:u=>['admin','ecosystem_admin','platform_admin'].includes(u.role)},'../helpers/tenantScope':{isTenantScopeEnforced:()=>tenantEnforced},
 '../modules/marketingAutomation/accountScope':require('../src/modules/marketingAutomation/accountScope'),
 '../helpers/adInsights':{},'../helpers/fbMarketingSync':{},'../modules/marketingAutomation/facebookSpendSource':source,
 '../config/supabaseRouter':{isFailoverEnabled:()=>failover,getActiveTarget:()=> 'primary'},
 '../modules/marketingAutomation/spendCoverage':{async readSpendCoverage(args){calls.push(args);return{status:args.sourceAllowed?'KNOWN_TO_DATE':'UNKNOWN',spendVnd:args.sourceAllowed?500000:null}}}};
 vm.runInNewContext(routeSource,{require:id=>{if(!(id in deps))throw Error(id);return deps[id]},module:{exports:{}},process:{env:{VPT_CERTIFIED_FACEBOOK_SPEND:enabled?'1':'0'}},console:{error(){}}});
 return{calls,async run(query){const res={code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}};await handlers['get/marketing/spend-coverage']({query,user:{role,company_id:userCompany},tenantCompanyIds:scope},res);return res}};
}
test('mounted read route resolves tenant/company on server; wrong company does not touch storage',async()=>{
 for(const options of [{},{role:'ecosystem_admin'}]){const h=route(options);assert.equal((await h.run({company_id:other,from:'2026-10-01',to:'2026-10-02',sourceVerified:true})).code,403);assert.equal(h.calls.length,0)}
});
test('mounted read route rejects broad or malformed dates and missing scope',async()=>{
 const h=route();for(const q of [{},{company_id:company},{company_id:company,from:'2026-02-30',to:'2026-03-02'}])assert.equal((await h.run(q)).code,400);assert.equal(h.calls.length,0);
});
test('mounted read route ignores client verification flags and stays disabled by default/failover',async()=>{
 for(const options of [{enabled:false},{failover:true}]){const h=route(options),r=await h.run({company_id:company,from:'2026-10-01',to:'2026-10-02',sourceAllowed:true});assert.equal(r.body.status,'UNKNOWN');assert.equal(r.body.spendVnd,null);assert.equal(h.calls[0].sourceAllowed,false)}
});
test('mounted read route passes only authorized company and bounded dates',async()=>{
 const h=route(),r=await h.run({company_id:company,from:'2026-10-01',to:'2026-10-02',accountIds:['arbitrary']});assert.equal(r.body.spendVnd,500000);assert.equal(h.calls[0].companyId,company);assert.equal(h.calls[0].accountIds,undefined);
});
test('legacy admin missing tenant cannot read another company; missing global context denies all',async()=>{
 for(const options of [{role:'admin',tenantEnforced:false},{role:'admin',userCompany:null,tenantEnforced:false},{role:'ecosystem_admin',tenantEnforced:false}]){
  const h=route(options);assert.equal((await h.run({company_id:other,from:'2026-10-01',to:'2026-10-02'})).code,403);assert.equal(h.calls.length,0);
 }
});
test('company admin does not inherit every company in tenant',async()=>{
 const h=route({role:'admin',scope:[company,other]});assert.equal((await h.run({company_id:other,from:'2026-10-01',to:'2026-10-02'})).code,403);
});
test('explicit ecosystem scope and platform role are honored',async()=>{
 for(const options of [{role:'ecosystem_admin',scope:[company,other]},{role:'platform_admin',tenantEnforced:false}]){
  const h=route(options);assert.equal((await h.run({company_id:other,from:'2026-10-01',to:'2026-10-02'})).code,200);
 }
});

const helperSource=fs.readFileSync(path.join(__dirname,'../src/helpers/fbMarketingSync.js'),'utf8');
function legacy({currency='VND',malformed=false,pageLimit=false,enabled=false,failover=false}={}){
 const writes=[];const db={from:table=>({update:row=>({async eq(){writes.push([table,row]);return{}}}),upsert:async rows=>{writes.push([table,rows]);return{}},select:()=>({in:async()=>({data:[]})})})};
 let page=0;
 const fetchImpl=async raw=>{const u=new URL(raw);return{ok:true,json:async()=>{
  if(u.searchParams.get('fields')==='currency')return{currency};
  if(u.pathname.endsWith('/ads'))return{data:[],...(pageLimit?{paging:{next:`${u.origin}${u.pathname}?after=${++page}`}}:{})};
  const d=new Date().toISOString().slice(0,10);return{data:[{ad_id:'ad',date_start:d,date_stop:d,spend:malformed?'bad':'500000',impressions:'1',clicks:'0'}]};
 }}};
 const mod={exports:{}};vm.runInNewContext(helperSource,{module:mod,require:id=>id==='../config/supabase'?{supabase:db}:id==='../config/supabaseRouter'?{isFailoverEnabled:()=>failover,getActiveTarget:()=> 'primary'}:source,fetch:fetchImpl,process:{env:{VPT_CERTIFIED_FACEBOOK_SPEND:enabled?'1':'0'}},Date,URL,AbortController,setTimeout,clearTimeout,console:{warn(){}}});
 return{writes,run:()=>mod.exports.dongBoMot({ad_account_id:'act_123',access_token:'fake'})};
}
for(const [label,options] of [['unknown currency',{currency:null}],['invalid spend',{malformed:true}],['truncated pagination',{pageLimit:true}]])test('existing production sync rejects '+label+' without writing spend',async()=>{
 const h=legacy(options);assert.equal((await h.run()).ok,false);assert.equal(h.writes.filter(([t])=>t==='fb_ad_spend_daily').length,0);
});
test('existing valid sync still preserves daily spend writes when evidence flag is off',async()=>{
 const h=legacy();assert.equal((await h.run()).ok,true);assert.equal(h.writes.find(([t])=>t==='fb_ad_spend_daily')[1][0].chi_tieu,500000);
});
test('primary-only refusal performs no legacy journal or spend writes',async()=>{
 const h=legacy({enabled:true,failover:true});assert.equal((await h.run()).loi,'PRIMARY_ONLY_REQUIRED');assert.equal(h.writes.length,0);
});

function management({existing=null,role='admin',userCompany=company,tenantEnforced=true,scope=[company]}={}){
 const handlers={},calls=[],writes=[],router={use(){}};
 for(const method of ['get','post','put','patch','delete'])router[method]=(url,...f)=>handlers[method+url]=f.at(-1);
 const db={from(table){let mutation=null;const filters=[],q={};for(const op of ['select','eq','is'])q[op]=(...a)=>{filters.push([op,...a]);return q};
  for(const op of ['insert','update'])q[op]=data=>{mutation=data;writes.push({table,op,data,filters});return q};
  q.maybeSingle=async()=>({data:mutation|| (table==='companies'?{id:company,tenant_id:'tenant-a'}:existing)});return q;}};
 const deps={express:{Router:()=>router},'../config/supabase':{supabase:db},'../middleware/auth':{auth(){}},
 '../helpers/adminRole':{isAdminLike:u=>['admin','ecosystem_admin','platform_admin'].includes(u.role)},'../helpers/tenantScope':{isTenantScopeEnforced:()=>tenantEnforced},
 '../modules/marketingAutomation/accountScope':require('../src/modules/marketingAutomation/accountScope'),
 '../helpers/adInsights':{chayPhanTich(){assert.fail('global writer must not run')}},
 '../helpers/fbMarketingSync':{chuanHoaActId:v=>String(v).startsWith('act_')?v:'act_'+v,async kiemTraKetNoi(...a){calls.push(['test',...a]);return{}},async daCauHinh(o){calls.push(['status',o]);return{}},async dongBoTatCa(o){calls.push(['sync',o]);return{ket_qua:[]}}}};
 vm.runInNewContext(routeSource,{require:id=>{if(!(id in deps))throw Error(id);return deps[id]},module:{exports:{}},Date,console:{error(){}}});
 return{calls,writes,async run(method,url,body={}){const res={code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}};await handlers[method+url]({body,query:{},user:{role,company_id:userCompany},tenantCompanyIds:scope},res);return res}};
}
test('management status and sync are scoped to company admin, not all tenant companies',async()=>{
 const h=management({scope:[company,other]});await h.run('get','/marketing/status');await h.run('post','/marketing/sync');
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls.map(c=>c[1].companyIds))),[[company],[company]]);
});
test('management missing tenant/global context cannot sync any account',async()=>{
 const h=management({role:'ecosystem_admin',tenantEnforced:false,userCompany:null});assert.equal((await h.run('post','/marketing/sync')).code,403);assert.equal(h.calls.length,0);
});
for(const owner of [other,null])test('stored account owner '+owner+' cannot be substituted by request company',async()=>{
 for(const action of ['test','account']){const h=management({existing:{ad_account_id:'act_123',company_id:owner,access_token:'not-to-be-used'}});const r=await h.run(action==='test'?'post':'put','/marketing/'+action,{ad_account_id:'123',company_id:company});assert.equal(r.code,403);assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);}
});
test('new account derives tenant from verified company, accepts empty name as null',async()=>{
 const h=management();assert.equal((await h.run('put','/marketing/account',{ad_account_id:'123',company_id:company,ten:null,access_token:'synthetic'})).code,200);
 assert.equal(h.writes[0].op,'insert');assert.equal(h.writes[0].data.tenant_id,'tenant-a');assert.equal(h.writes[0].data.ten,null);
});
test('account update cannot switch owner outside scope or forge tenant membership',async()=>{
 for(const body of [{company_id:other},{company_id:company,tenant_id:'foreign'}]){
  const h=management({existing:{ad_account_id:'act_123',company_id:company}});assert.equal((await h.run('put','/marketing/account',{ad_account_id:'123',...body})).code,403);assert.equal(h.writes.length,0);
 }
});
test('existing account uses owner-conditioned update, never broad upsert',async()=>{
 const h=management({existing:{ad_account_id:'act_123',company_id:company}});assert.equal((await h.run('put','/marketing/account',{ad_account_id:'123',ten:' VPT '})).code,200);
 assert.equal(h.writes[0].op,'update');assert.equal(h.writes[0].data.ten,'VPT');assert.ok(h.writes[0].filters.some(f=>f[0]==='eq'&&f[1]==='company_id'&&f[2]===company));
});
