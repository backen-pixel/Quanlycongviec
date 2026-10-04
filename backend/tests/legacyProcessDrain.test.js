'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createProcessWork}=require('../src/helpers/processWork');
const {trackRouterHandlers}=require('../src/helpers/trackedRouter');
const gate=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fakeTimers(){const items=[],cleared=[];const add=(fn,ms)=>{const t={fn,ms,unref(){}};items.push(t);return t;};return{items,cleared,setTimeout:add,setInterval:add,setImmediate:add,clearTimeout:t=>cleared.push(t),clearInterval:t=>cleared.push(t),clearImmediate:t=>cleared.push(t)};}
function load(file,mocks={},extras={}){
 const filename=path.join(__dirname,'../src',file),exports={};
 const context={module:{exports},exports,console:{log(){},warn(){},error(){}},process:{env:{},pid:123},setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,clearImmediate,...extras};
 context.require=name=>Object.hasOwn(mocks,name)?mocks[name]:name==='./processWork'||name==='../helpers/processWork'?{createProcessWork}:require(name.startsWith('.')?path.resolve(path.dirname(filename),name):name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});return context.module.exports;
}

test('process stop rejects new root work, wakes sleeps and joins children registered by an admitted parent',async()=>{
 const w=createProcessWork({scope:'TEST'}),parent=gate(),child=gate();let children=0;
 const p=w.run(async()=>{await parent.promise;children++;w.track(child.promise);});
 w.stop();await assert.rejects(w.run(()=>{}),e=>e.code==='PROCESS_STOPPING');assert.throws(()=>w.assertOpen(),e=>e.status===503);
 const idle=w.waitForIdle({timeoutMs:1000});parent.resolve();await p;assert.equal(children,1);assert.equal(w.status().activeCount,1);
 assert.equal((await w.waitForIdle({timeoutMs:0})).timedOut,true);child.resolve();assert.equal((await idle).locallyDrained,true);assert.equal(w.status().businessReconciled,false);
});
test('process owns queued timers, blocks re-arm and interrupts long sleeps without forgetting active promises',async()=>{
 const t=fakeTimers(),w=createProcessWork({scope:'TEST',timers:t});let calls=0;
 w.timeout(()=>calls++,30);w.interval(()=>calls++,40);w.immediate(()=>calls++);
 const sleeping=w.run(()=>w.sleep(60000));w.stop();for(const x of t.items)x.fn();assert.equal(await sleeping,false);
 assert.equal(calls,0);assert.equal(w.timeout(()=>calls++,1),null);assert.equal(w.status().scheduledCount,0);assert.equal(w.status().locallyDrained,true);
});
test('timeout does not erase active work and synchronous stop inside admission sees an active promise',async()=>{
 const w=createProcessWork({scope:'TEST'}),g=gate();const p=w.run(()=>{assert.equal(w.stop().activeCount,1);return g.promise;});
 assert.equal((await w.waitForIdle({timeoutMs:1})).timedOut,true);assert.equal(w.status().activeCount,1);g.resolve();await p;await flush();assert.equal(w.status().activeCount,0);
});
test('all stop hooks run even on error; promise rejection is observable, not reconciliation success',async()=>{
 const w=createProcessWork({scope:'TEST'}),g=gate();let n=0;w.onStop(()=>{throw Error('private');});w.onStop(()=>n++);
 const p=w.run(()=>g.promise);const expected=assert.rejects(p,/private/);assert.throws(()=>w.stop(),AggregateError);assert.equal(n,1);g.reject(Error('private'));await expected;
 assert.equal((await w.waitForIdle()).locallyDrained,true);assert.equal(w.status().processesDrained,false);
 for(const x of [-1,60001,NaN,'10'])await assert.rejects(w.waitForIdle({timeoutMs:x}),TypeError);
});
test('tracker starts no new work after a delayed boot continuation resolves',async()=>{
 const w=createProcessWork({scope:'TEST'}),boot=gate();let started=0;
 const p=w.spawn(async()=>{await boot.promise;w.timeout(()=>started++,1);});w.stop();boot.resolve();await p;await flush();assert.equal(started,0);assert.equal(w.status().locallyDrained,true);
});

for(const mode of ['redis','redis_error','no_redis'])test(`leader admission ${mode}: stop during acquisition blocks fn and joins cleanup`,async()=>{
 const acquire=gate(),cleanup=gate(),entered=gate();let fn=0,token,deleted=0;
 const redis=mode==='no_redis'?null:{async set(k,t){token=t;entered.resolve();await acquire.promise;if(mode==='redis_error')throw Error('private');return'OK';},async get(){return token;},async del(){deleted++;await cleanup.promise;}};
 const mod=load('helpers/cronLeader.js',{'../config/redis':{getRedisIfReady:()=>redis}});
 if(mode==='no_redis')mod.shutdown.stop();
 const p=mod.runIfLeader('test',async()=>{fn++;});
 if(mode!=='no_redis'){await entered.promise;mod.shutdown.stop();acquire.resolve();await flush();if(mode==='redis'){assert.equal(mod.shutdown.status().active,true);cleanup.resolve();}}
 assert.equal(await p,false);assert.equal(fn,0);assert.equal(deleted,mode==='redis'?1:0);assert.equal((await mod.shutdown.waitForIdle()).locallyDrained,true);
});
test('leader work already started is joined, and late long-lease acquisition is released without starting',async()=>{
 const body=gate(),entered=gate();const mod=load('helpers/cronLeader.js',{'../config/redis':{getRedisIfReady:()=>null}});
 const p=mod.runIfLeader('test',async()=>{entered.resolve();await body.promise;});await entered.promise;mod.shutdown.stop();assert.equal(mod.shutdown.status().active,true);body.resolve();assert.equal(await p,true);
 const acquire=gate();let token,del=0;const other=load('helpers/cronLeader.js',{'../config/redis':{getRedisIfReady:()=>({set:async(k,t)=>{token=t;await acquire.promise;return'OK';},get:async()=>token,del:async()=>{del++;}})}});
 const lease=other.tryAcquireLeader('pipeline');other.shutdown.stop();acquire.resolve();assert.equal(await lease,false);assert.equal(del,1);
});

function autoHarness({holdEnabled=false,holdConfig=false,failCount=false}={}){
 const enabled=gate(),config=gate(),count=gate(),writes=[];let reads=0;
 const db={from:()=>({
  upsert(row){writes.push(row);return row.key==='auto_tool_config'&&holdConfig?config.promise:row.key==='auto_tool_enabled'&&holdEnabled?enabled.promise:Promise.resolve({});},
  select(){return{not(){return this;},then(resolve,reject){reads++;return (failCount?Promise.reject(Error('count failed')):count.promise).then(resolve,reject);}};},
 })};
 const mod=load('helpers/autoTool.js',{'../config/supabase':{supabase:db},'./facebookContactActivity':{sortFacebookContactsNewestFirst:x=>x}});
 return{mod,enabled,config,count,writes,reads:()=>reads};
}
test('AutoTool shutdown during enable persistence joins it without writing disabled or starting a batch',async()=>{
 const h=autoHarness({holdEnabled:true}),p=h.mod.startLoop();assert.equal(h.mod.startLoop(),p);h.mod.shutdown.stop();assert.equal(h.mod.shutdown.status().active,true);
 h.enabled.resolve({});await p;assert.equal(h.reads(),0);assert.deepEqual(h.writes.map(x=>x.value.enabled),[true]);assert.equal(h.mod.getState().running,false);
 await assert.rejects(h.mod.startLoop(),e=>e.code==='PROCESS_STOPPING');assert.throws(()=>h.mod.stop(),e=>e.code==='PROCESS_STOPPING');
});
test('AutoTool detached config and explicit operator stop writes are joined, quiesce adds no writes',async()=>{
 const h=autoHarness({holdConfig:true,holdEnabled:true});h.mod.setConfig({limit:10});h.mod.stop();assert.equal(h.writes.length,2);h.mod.shutdown.stop();assert.equal(h.writes.length,2);
 const idle=h.mod.shutdown.waitForIdle({timeoutMs:1000});h.config.resolve({});await flush();assert.equal(h.mod.shutdown.status().active,true);h.enabled.resolve({});assert.equal((await idle).locallyDrained,true);
 assert.equal(h.writes[1].value.enabled,false);
});
test('AutoTool rejected count cannot leave a stale running boolean',async()=>{
 const h=autoHarness({failCount:true});await assert.rejects(h.mod.startLoop(),/count failed/);assert.equal(h.mod.getState().running,false);assert.equal(h.mod.getState().enabled,false);h.mod.shutdown.stop();
});

function queueHarness({redis=true,timers}={}){
 const pop=gate(),entered=gate(),handler=gate(),patch=gate(),writes=[],handled=[];let rows=new Map(),holdCompleted=false;
 const item={id:'reserved',job_type:'test',status:'pending',max_retries:1};rows.set(item.id,item);
 const db={from:()=>{let id,change,newRow;return{select(){return this;},eq(k,v){id=v;return this;},update(x){change=x;return this;},insert(x){newRow=x;return this;},async single(){if(newRow){rows.set(newRow.id,newRow);return{data:newRow};}writes.push(change);if(holdCompleted&&change.status==='completed')await patch.promise;Object.assign(rows.get(id),change);return{data:{...rows.get(id)}};},async maybeSingle(){return{data:rows.get(id)?{...rows.get(id)}:null};}};}};
 const store=redis?{zrangebyscore:async()=>[],brpop:async()=>{entered.resolve();return pop.promise;},lpush:async()=>{},zadd:async()=>{}}:null;
 const mod=load('helpers/batchQueue.js',{'./processWork':{createProcessWork:args=>createProcessWork({...args,...(timers?{timers}:{})})},'../config/supabase':{supabase:db},'../config/redis':{getRedisIfReady:()=>store,getStatus:()=>redis?'ok':'off'},'./cronLeader':{runIfLeader:async(n,fn)=>fn()},'./batchJobHandlers':{getBatchJobType:()=>({run:async job=>{handled.push(job.id);return handler.promise;}})},'./batchQueueRateLimit':{assertBatchEnqueueAllowed:async()=>{},getJobCooldownMs:()=>0,recordEnqueueForRateLimit:async()=>{}}});
 return{mod,pop,entered,handler,patch,writes,handled,rows,holdCompleted:()=>{holdCompleted=true;}};
}
test('batch stop after BRPOP keeps the reserved ID and waits through completion persistence',async()=>{
 const h=queueHarness();h.holdCompleted();const p=h.mod.workerTick();await h.entered.promise;h.mod.shutdown.stop();h.pop.resolve(['queue','reserved']);await flush();
 assert.deepEqual(h.handled,['reserved']);assert.equal(h.mod.shutdown.status().active,true);h.handler.resolve({ok:true});await flush();assert.equal(h.mod.shutdown.status().active,true);h.patch.resolve();await p;
 assert.equal(h.rows.get('reserved').status,'completed');assert.equal((await h.mod.shutdown.waitForIdle()).locallyDrained,true);assert.equal(h.writes.some(x=>x.retry_count),false);
});
test('batch direct exports and memory pumps cannot admit a second job after shutdown',async()=>{
 const h=queueHarness({redis:false});const one=await h.mod.enqueueBatchJob({type:'test'});await flush();assert.deepEqual(h.handled,[one.id]);
 h.mod.shutdown.stop();await assert.rejects(h.mod.enqueueBatchJob({type:'test'}),e=>e.code==='PROCESS_STOPPING');await assert.rejects(h.mod.processBatchJob('reserved'),e=>e.code==='PROCESS_STOPPING');
 for(const name of ['resumeBatchJob','retryBatchJob','pauseBatchJob','cancelBatchJob'])await assert.rejects(h.mod[name]('reserved'),e=>e.code==='PROCESS_STOPPING');
 h.handler.resolve({ok:true});assert.equal((await h.mod.shutdown.waitForIdle({timeoutMs:1000})).locallyDrained,true);assert.equal(h.handled.length,1);
});
test('batch job failure after shutdown preserves pending recovery without retry dispatch',async()=>{
 const h=queueHarness({redis:false});const one=await h.mod.enqueueBatchJob({type:'test'});await flush();h.mod.shutdown.stop();h.handler.reject(Error('business failure'));
 await h.mod.shutdown.waitForIdle({timeoutMs:1000});assert.equal(h.rows.get(one.id).status,'pending');assert.equal(h.handled.length,1);assert.equal(h.mod.shutdown.status().businessReconciled,false);
});
test('batch shutdown cancels retry, boot and poll callbacks already queued, preserving pending recovery',async()=>{
 const timers=fakeTimers(),h=queueHarness({redis:false,timers});h.mod.startBatchQueueWorker();h.mod.startBatchQueueWorker();assert.equal(timers.items.length,3);
 const one=await h.mod.enqueueBatchJob({type:'test'});await flush();h.handler.reject(Error('business failure'));await flush();
 assert.equal(h.rows.get(one.id).status,'pending');assert.equal(timers.items.length,4);h.mod.shutdown.stop();for(const x of timers.items)x.fn();await flush();
 assert.equal(h.handled.length,1);assert.equal(h.mod.shutdown.status().queueReconciled,false);assert.equal(h.mod.shutdown.status().scheduledCount,0);
});

test('marketing sync cancels boot and interval, and joins an admitted provider operation',async()=>{
 const timers=fakeTimers(),provider=gate();let calls=0;
 const mod=load('jobs/fbMarketingSyncRunner.js',{'../helpers/fbMarketingSync':{dongBoTatCa:async()=>{calls++;return provider.promise;}},'../helpers/cronLeader':{runIfLeader:async(n,fn)=>fn()},'../helpers/processWork':{createProcessWork:args=>createProcessWork({...args,timers})}});
 mod.start();assert.equal(timers.items.length,2);mod.stop();assert.equal(timers.cleared.length,2);mod.start();
 const p=mod.runOnce();mod.shutdown.stop();for(const t of timers.items)t.fn();assert.equal(calls,1);assert.equal(mod.shutdown.status().active,true);
 provider.resolve({so_tai_khoan:0});await p;assert.equal((await mod.shutdown.waitForIdle()).locallyDrained,true);await assert.rejects(mod.runOnce(),e=>e.code==='PROCESS_STOPPING');
});

test('tracked router retains post-ACK handler and child promises, preserves middleware arrays and errors',async()=>{
 const w=createProcessWork({scope:'ROUTER'}),routes=[];const router={};for(const method of ['get','post','put','patch','delete','head','options','all'])router[method]=function(p,...handlers){routes.push({p,handlers});return this;};
 trackRouterHandlers(router,w);const parent=gate(),child=gate();let ack=false;
 assert.equal(router.post('/webhook',[async(req,res)=>{res.end();await parent.promise;w.track(child.promise);}]),router);
 const run=routes[0].handlers[0][0]({}, {end(){ack=true;}}, e=>{throw e;});assert.equal(ack,true);w.stop();assert.equal(w.status().active,true);parent.resolve();await run;assert.equal(w.status().activeCount,1);child.resolve();await w.waitForIdle();
 let error;await routes[0].handlers[0][0]({}, {}, e=>{error=e;});assert.equal(error.code,'PROCESS_STOPPING');
});

test('actual pipeline starter awaiting a lease cannot reset stop or launch after quiesce',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8');
 const start=source.indexOf('function startAutoPipelineForCompany('),end=source.indexOf('/** Dừng vòng auto',start);assert.ok(start>0&&end>start);
 const legacyWork=createProcessWork({scope:'FACEBOOK'}),lease=gate(),state={running:false,enabled:false};let loops=0;
 const ctx={legacyWork,getAutoPipelineState:()=>state,emitAutoState(){},getFbMasterEnabledSync:()=>true,tryAcquireLeader:()=>lease.promise,FB_AUTO_PIPELINE_LEADER:'test',FB_AUTO_PIPELINE_LEADER_TTL_SEC:30,runAutoPipelineLoop:async()=>{loops++;},console};
 vm.runInNewContext(source.slice(start,end),ctx);const p=ctx.startAutoPipelineForCompany('company');legacyWork.stop();lease.resolve(true);await p;
 assert.equal(loops,0);assert.equal(state.enabled,false);assert.equal((await legacyWork.waitForIdle()).locallyDrained,true);
});

const facebookSource=()=>fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8');
function fragment(startMarker,endMarker){const s=facebookSource(),start=s.indexOf(startMarker),end=s.indexOf(endMarker,start);assert.ok(start>=0&&end>start);return s.slice(start,end);}
test('actual pipeline failure cleanup remains tracked after the detached loop rejects',async()=>{
 const legacyWork=createProcessWork({scope:'FACEBOOK'}),loop=gate(),cleanup=gate(),state={running:false,enabled:false};
 const ctx={legacyWork,getAutoPipelineState:()=>state,emitAutoState(){},pushAutoLog(){},getFbMasterEnabledSync:()=>true,tryAcquireLeader:async()=>true,FB_AUTO_PIPELINE_LEADER:'test',FB_AUTO_PIPELINE_LEADER_TTL_SEC:30,
  runAutoPipelineLoop:()=>loop.promise,releaseFbPipelineLeaderIfIdle:()=>cleanup.promise,console:{log(){},error(){}}};
 vm.runInNewContext(fragment('function startAutoPipelineForCompany(','/** Dừng vòng auto'),ctx);await ctx.startAutoPipelineForCompany('company');legacyWork.stop();loop.reject(Error('synthetic'));await flush();
 assert.equal(legacyWork.status().active,true);cleanup.resolve();assert.equal((await legacyWork.waitForIdle()).locallyDrained,true);
});
test('actual master callback waiting for leader cannot change phase after stop',async()=>{
 const timers=fakeTimers(),legacyWork=createProcessWork({scope:'FACEBOOK',timers}),leader=gate();let entered=0;
 const ctx={legacyWork,fbMasterScheduleTimeoutId:null,fbMasterSchedule:{enabled:true,phase:'run'},masterSchedulePhaseDurationMs:()=>100,
  runIfLeader:async(n,fn)=>{await leader.promise;return fn();},enterMasterSchedulePhase:async()=>{entered++;},console};
 vm.runInNewContext(fragment('function clearFbMasterScheduleTimer()','async function loadFbMasterScheduleConfig()'),ctx);
 const p=ctx.advanceMasterScheduleCycle();legacyWork.stop();leader.resolve();await p;assert.equal(entered,0);assert.equal(timers.items.length,0);assert.equal(legacyWork.status().locallyDrained,true);
});
test('actual master and rescan callbacks completing after stop never re-arm their timers',async()=>{
 for(const kind of ['master','rescan']){
  const timers=fakeTimers(),legacyWork=createProcessWork({scope:'FACEBOOK',timers}),operation=gate(),entered=gate();
  const ctx={legacyWork,runIfLeader:async(n,fn)=>{await fn();return true;},console:{log(){},warn(){},error(){}},
   fbMasterScheduleTimeoutId:null,fbMasterSchedule:{enabled:true,phase:'run'},masterSchedulePhaseDurationMs:()=>100,enterMasterSchedulePhase:async()=>{entered.resolve();await operation.promise;},
   rescanPhonesScheduleTimeoutId:null,rescanPhonesScheduleNextAtMs:null,rescanPhonesScheduleRunning:false,rescanPhonesSchedule:{enabled:true,interval_minutes:15},r:{},runRescanPhonesBatch:async()=>{entered.resolve();await operation.promise;}};
  vm.runInNewContext(kind==='master'?fragment('function clearFbMasterScheduleTimer()','async function loadFbMasterScheduleConfig()'):fragment('function clearRescanPhonesScheduleTimer()','function getRescanPhonesScheduleStatus()'),ctx);
  const p=kind==='master'?ctx.advanceMasterScheduleCycle():ctx.runRescanPhonesScheduledTick();await entered.promise;legacyWork.stop();assert.equal(legacyWork.status().active,true);operation.resolve();await p;
  assert.equal(timers.items.length,0);assert.equal(legacyWork.status().locallyDrained,true);
 }
});
test('actual scan boot config returning after stop cannot start its interval',async()=>{
 const timers=fakeTimers(),legacyWork=createProcessWork({scope:'FACEBOOK',timers}),config=gate();let scans=0;
 const ctx={legacyWork,scanTimer:null,scanConfig:{enabled:true,interval_minutes:60},loadScanConfig:()=>config.promise,runIfLeader:async(n,fn)=>fn(),scanAndCreateLeads:async()=>{scans++;},console:{log(){}}};
 const s=facebookSource(),start=s.indexOf('function startScanTimer()'),end=s.indexOf('// ═',start);vm.runInNewContext(s.slice(start,end),ctx);
 legacyWork.stop();config.resolve({enabled:true});await legacyWork.waitForIdle();assert.equal(legacyWork.status().scheduledCount,0);assert.equal(scans,0);
});
for(const phase of ['config','enabled'])test(`actual AutoTool boot ${phase} returning after stop cannot resume`,async()=>{
 const legacyWork=createProcessWork({scope:'FACEBOOK'}),config=gate(),enabled=gate(),readEnabled=gate();let starts=0;
 const ctx={legacyWork,fbToolsResumeOnBoot:()=>true,autoTool:{loadConfigFromDb:()=>config.promise,loadEnabledFlagFromDb:()=>{readEnabled.resolve();return enabled.promise;},getState:()=>({running:false}),startLoop:async()=>{starts++;}},console:{log(){},warn(){}}};
 vm.runInNewContext(fragment('legacyWork.spawn(() => autoTool.loadConfigFromDb()',"r.get('/auto-tool/status'"),ctx);
 if(phase==='enabled'){config.resolve();await readEnabled.promise;}legacyWork.stop();config.resolve();enabled.resolve(true);await legacyWork.waitForIdle();assert.equal(starts,0);
});
