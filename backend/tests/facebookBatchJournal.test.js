'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {database,harness,ids:i,id}=require('./facebookLegacyCreationScope.harness');
const {runFacebookLeadBatch}=require('../src/helpers/facebookLegacyBatch');
const {createFacebookBatchJournal,journalResponse}=require('../src/helpers/facebookBatchJournal');
const {assertLegacyFacebookWriteAllowed}=require('../src/helpers/facebookLegacyWriteScope');
const requestId=id(80),claims={userId:i.actor,role:'admin',company_id:i.company,tenant_id:i.tenant,crm_region_ids:[]};
const req=()=>({user:claims,body:{company_id:i.company,contact_ids:[i.contact],requestId}});
const view=()=>({policy:'FACEBOOK_BATCH_JOURNAL_V1',actorId:i.actor,companyId:i.company,requestId,state:'RUNNING',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),items:[{contactId:i.contact,state:'PENDING',result:null}]});
function setup({failure=null,replay=false}={}){
 const db=database(),h=harness(db,{user:claims}),calls=[],run=view();let created=0;
 const execution={execute:!replay,run,
  start:async()=>{calls.push('START');if(failure==='START')throw Error('start failed');run.items[0].state='RUNNING';},
  check:async()=>{calls.push('CHECK');if(failure==='CHECK')throw Error('claim denied');},
  result:async(_id,value)=>{calls.push('RESULT');if(failure==='RESULT')throw Error('lost result ack');run.items[0]={contactId:i.contact,state:value.status==='linked'?'LINKED':'SKIPPED',result:value};run.state='COMPLETED';},
  stop:async()=>{calls.push('STOP');if(failure==='STOP')throw Error('journal unavailable');run.state='REVIEW';if(run.items[0].state==='RUNNING')run.items[0].state='UNKNOWN';},
  finish:async()=>{calls.push('FINISH');if(failure==='FINISH')throw Error('lost finish ack');run.state='COMPLETED';},
  read:async()=>{calls.push('READ');return run;}};
 const journal={begin:async()=>{calls.push('BEGIN');if(failure==='BEGIN')throw Error('lost begin ack');return execution;}};
 return{db,calls,run,execution,journal,get created(){return created;},start:()=>runFacebookLeadBatch(db,req(),{journal,
  checkWrite:(d,s)=>assertLegacyFacebookWriteAllowed(d,s,{isPrimary:()=>true}),
  createLead:async(...args)=>{created++;if(failure==='CREATOR'||failure==='STOP')throw Error('uncertain CRM write');return h.context.createLeadFromFacebookInner(...args);}})};
}
test('batch journals before dispatch, checks capability inside creator, and records completion',async()=>{
 const h=setup(),r=await h.start();assert.equal(r.status,200);assert.equal(h.created,1);assert.equal(h.run.state,'COMPLETED');
 assert.deepEqual(h.calls.slice(0,2),['BEGIN','START']);assert.ok(h.calls.filter(x=>x==='CHECK').length>3);assert.deepEqual(h.calls.slice(-3),['RESULT','FINISH','READ']);
 assert.equal(r.body.journal.items[0].result.lead_id,h.db.tables.crm_leads[0].id);
});
test('same request replay never calls creator or writes CRM',async()=>{
 const h=setup({replay:true});assert.equal((await h.start()).status,202);assert.equal(h.created,0);assert.deepEqual(h.db.writes,[]);assert.deepEqual(h.calls,['BEGIN']);
});
for(const point of ['BEGIN','START','CHECK'])test('lost '+point+' stops before creator mutation',async()=>{
 const h=setup({failure:point});if(point==='BEGIN')await assert.rejects(h.start());else await h.start();assert.equal(h.db.tables.crm_leads.length,0);
});
test('CRM success followed by journal failure stays UNKNOWN; replay does not create again',async()=>{
 const h=setup({failure:'RESULT'});let r=await h.start();assert.equal(r.status,202);assert.equal(h.run.items[0].state,'UNKNOWN');assert.equal(h.db.tables.crm_leads.length,1);
 h.execution.execute=false;r=await h.start();assert.equal(r.status,202);assert.equal(h.created,1);assert.equal(h.db.tables.crm_leads.length,1);
});
test('failure recording STOP leaves RUNNING visible rather than pretending it was not executed',async()=>{
 const h=setup({failure:'STOP'});const r=await h.start();assert.equal(r.status,202);assert.equal(h.run.items[0].state,'RUNNING');assert.equal(h.created,1);
});
test('lost FINISH acknowledgement recovers completed results without another creator',async()=>{
 const h=setup({failure:'FINISH'});await assert.rejects(h.start());assert.equal(h.created,1);assert.equal(h.run.items[0].state,'LINKED');
 h.execution.execute=false;assert.equal((await h.start()).status,200);assert.equal(h.run.state,'COMPLETED');assert.equal(h.created,1);
});
test('skip also gets a durable result without creator invocation',async()=>{
 const h=setup();h.db.tables.app_settings.push({key:'auto_lead_config:'+i.tenant,value:{trigger:'manual'}});
 assert.equal((await h.start()).status,200);assert.equal(h.run.items[0].state,'SKIPPED');assert.equal(h.created,0);
});
test('adapter uses a private token, never exposes it through the HTTP result',async()=>{
 const calls=[],run=view(),db={rpc:async(name,args)=>{calls.push({name,args});return{data:name.endsWith('begin')?{execute:true,run}:name.endsWith('read')?run:true};}};
 const service=createFacebookBatchJournal({db,isPrimary:()=>true}),e=await service.begin(req(),i.company,[i.contact]);
 await e.start(i.contact);await e.check(i.contact);assert.ok(calls[0].args.p_token);assert.equal(calls[1].args.p_token,calls[0].args.p_token);
 assert.ok(!JSON.stringify(journalResponse(await e.read())).includes(calls[0].args.p_token));
});
for(const [code,status]of[['42501',403],['22023',400],['23505',409],['40001',409],['55P03',409],['XX000',503]])test('journal adapter sanitizes '+code,async()=>{
 const service=createFacebookBatchJournal({db:{rpc:async()=>({error:{code,message:'PRIVATE'}})},isPrimary:()=>true});
 await assert.rejects(service.read(req(),i.company,requestId),e=>e.status===status&&!e.message.includes('PRIVATE'));
});
test('journal refuses missing requestId and non-primary before RPC',async()=>{
 let n=0;const db={rpc:async()=>{n++;return{};}};const s=createFacebookBatchJournal({db,isPrimary:()=>false});
 await assert.rejects(s.begin({...req(),body:{}},i.company,[i.contact]),e=>e.status===400);
 await assert.rejects(s.begin(req(),i.company,[i.contact]),e=>e.status===503);assert.equal(n,0);
});
test('actual batch route wires durable journal and no-store',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8'),start=source.indexOf("r.post('/batch-create-leads'");let route,received;
 vm.runInNewContext(source.slice(start,source.indexOf('// ═',start)),{r:{post(_path,...fns){route=fns.at(-1);}},authMiddleware(){},supabase:{},createLeadFromFacebook(){},facebookBatchJournal:{tag:'journal'},
  runFacebookLeadBatch:async(_db,_req,options)=>{received=options;return{status:202,body:{journal:{requestId}}};}});
 const res={status(n){this.code=n;return this;},set(k,v){this.header=[k,v];return this;},json(x){this.body=x;return this;}};
 await route(req(),res);assert.equal(received.journal.tag,'journal');assert.deepEqual(res.header,['Cache-Control','no-store']);assert.equal(res.code,202);
});
