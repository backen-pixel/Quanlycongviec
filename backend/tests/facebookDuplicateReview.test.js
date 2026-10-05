'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {readFacebookDuplicateReview}=require('../src/helpers/facebookDuplicateReview');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),company=id(1),actor=id(2),a=id(3),b=id(4);
const member=(leadId,phone='0901234567')=>({leadId,companyId:company,title:'Khách giả',available:true,generation:0,reviewRequired:false,foreignHistory:false,contextVersion:'a'.repeat(32),contacts:{customerPhone:phone}});
const snapshot=()=>({policy:'CRM_EXACT_CONTACT_REVIEW_V1',companyId:company,complete:true,members:[member(a),member(b)],edges:[],distinctions:[],snapshotToken:'a'.repeat(32),asOf:'2026-10-04T00:00:00Z'});
const req=()=>({method:'GET',user:{userId:actor},query:{company_id:company}});
function setup({raw=snapshot(),error=null,primary=()=>true,enabled=()=>true,thrown=false}={}){
 const calls=[],db={from(){throw Error('Direct queries forbidden');},async rpc(name,args){calls.push({name,args});if(thrown)throw Error('PRIVATE transport');return{data:raw,error};}};
 return{calls,db,read:r=>readFacebookDuplicateReview(db,r||req(),{isPrimary:primary,enabled})};
}
test('company reader executes canonical inventory once and returns no raw phone or destructive action',async()=>{
 const s=setup(),r=await s.read();assert.deepEqual(s.calls,[{name:'crm_identity_review_snapshot',args:{p_actor:actor,p_company:company}}]);
 assert.equal(r.readOnly,true);assert.equal(r.merged,0);assert.equal(r.unresolvedPairCount,1);assert.equal(r.reviewGroupCount,2);assert.equal(r.scannedLeadCount,2);assert.equal(r.availableLeadCount,2);assert.equal(r.allowBudgetExecution,false);assert.ok(!JSON.stringify(r).includes('0901234567'));
});
for(const [label,edit]of[['missing company',r=>{r.query={};}],['body actor',r=>{r.query.actor_id=id(9);}],['unknown field',r=>{r.query.all=true;}],['malformed company',r=>{r.query.company_id='all';}],['conflicting actor',r=>{r.user.id=id(7);}],['no actor',r=>{r.user={};}]])test('reader denies '+label+' before RPC',async()=>{const s=setup(),r=req();edit(r);await assert.rejects(s.read(r));assert.equal(s.calls.length,0);});
test('automatic read POST uses exact company and authenticated actor',async()=>{const s=setup(),r=req();r.method='POST';r.body=r.query;delete r.query;assert.equal((await s.read(r)).merged,0);assert.equal(s.calls[0].args.p_actor,actor);});
test('disabled feature and backup route do not query the inventory',async()=>{for(const s of [setup({enabled:()=>false}),setup({primary:()=>false})]){await assert.rejects(s.read(),e=>e.status===503);assert.equal(s.calls.length,0);}});
test('failover after RPC withholds the entire result',async()=>{let count=0;const s=setup({primary:()=>++count===1});await assert.rejects(s.read(),e=>e.status===503);assert.equal(s.calls.length,1);});
for(const [code,status]of [['42501',403],['54000',409],['40001',409],['XX000',503]])test('inventory error '+code+' cannot become zero',async()=>{const s=setup({error:{code,message:'PRIVATE DB'}});await assert.rejects(s.read(),e=>e.status===status&&!e.message.includes('PRIVATE'));});
for(const [label,change]of [['wrong company',r=>{r.companyId=id(99);}],['truncated',r=>{r.complete=false;}],['missing',r=>null],['too large',r=>{r.members=Array(5001).fill(member(a));}]])test('malformed '+label+' inventory fails closed',async()=>{let raw=snapshot();const result=change(raw);if(result===null)raw=null;await assert.rejects(setup({raw}).read(),e=>e.status===503);});
test('transport errors are sanitized',async()=>{await assert.rejects(setup({thrown:true}).read(),e=>e.status===503&&!e.message.includes('PRIVATE'));});
test('same title and phone suffix never establish a duplicate',async()=>{const raw=snapshot();raw.members=[member(a,'0901234567'),member(b,'+1901234567')];const r=await setup({raw}).read();assert.equal(r.unresolvedPairCount,0);assert.equal(r.groups.length,2);});
test('historical unavailable group survives without private title or guessed completion',async()=>{const raw=snapshot();raw.members[1]={...raw.members[1],available:false,title:null,contacts:{},contextVersion:null};const r=await setup({raw}).read();assert.equal(r.availableLeadCount,1);assert.equal(r.scannedLeadCount,2);assert.equal(r.reviewGroupCount,1);assert.equal(r.groups.find(g=>g.groupId===b).members[0].title,null);});
test('actual retired route cannot read, mutate, broadcast or claim success; debug shares scoped reader',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8'),start=source.indexOf('async function handleFacebookDuplicateReview('),end=source.indexOf('// POST /facebook/batch-create-leads',start),routes={};let reads=0;
 vm.runInNewContext(source.slice(start,end),{r:{get(p,...f){routes['GET '+p]=f.at(-1);},post(p,...f){routes['POST '+p]=f.at(-1);}},authMiddleware(){},supabase:{from(){throw Error('forbidden');}},leadIntakePrimary:()=>true,readFacebookDuplicateReview:async()=>{reads++;return{readOnly:true};}});
 const response=()=>({set(k,v){this.header=[k,v];return this;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}}),r=response();
 await routes['POST /dedup-leads'](req(),r);assert.equal(r.code,409);assert.equal(r.body.merged,0);assert.equal(reads,0);assert.deepEqual(r.header,['Cache-Control','no-store']);
 assert.equal(routes['GET /scan-duplicates-debug'],routes['GET /duplicate-review']);await routes['POST /duplicate-review'](req(),response());assert.equal(reads,1);
});
for(const fail of [false,true])test('actual auto-pipeline review step '+(fail?'keeps unavailable on error':'only reads candidates'),async()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8'),start=s.indexOf('      autoPipeline.step = 3;'),end=s.indexOf('      autoPipeline.step = 4;',start),calls=[];
 const context={autoPipeline:{kpi:{errors:0}},companyId:company,emitAutoState(){},pushAutoLog(){},console:{error(){}},autoPipelineInternalPostJson:async(p,b)=>{calls.push({p,b});if(fail)throw Error('provider fail');return{reviewGroupCount:2,unresolvedPairCount:1};}};
 const result=await vm.runInNewContext('(async()=>{'+s.slice(start,end)+';return dedupReview;})()',context);
 assert.equal(calls[0].p,'/facebook/duplicate-review');assert.equal(calls[0].b.company_id,company);assert.equal(result.merged,0);
 assert.equal(result.status,fail?'UNAVAILABLE':'READ');assert.equal(result.reviewGroupCount,fail?null:2);assert.equal(context.autoPipeline.kpi.errors,fail?1:0);
});
test('actual LeadDetail URL tab handler opens identity review via quality deep link',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../frontend/src/pages/LeadDetail.jsx'),'utf8');
 const start=source.indexOf("    const t = searchParams.get('tab');"),end=source.indexOf('  }, [id, searchParams, setSearchParams, lead, inboxChannel]);',start);assert.ok(start>0&&end>start);
 let active=null,next;
 vm.runInNewContext('(function(){'+source.slice(start,end)+'})()',{searchParams:new URLSearchParams('tab=quality'),URLSearchParams,setActiveTab:t=>{active=t;},setSearchParams:v=>{next=v;},lead:null,id:a,inboxChannel:null});
 assert.equal(active,'quality');assert.equal(next.has('tab'),false);
});
