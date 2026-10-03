'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { readAccountSpendWithDelivery } = require('../src/modules/marketingAutomation/facebookAccountDelivery');
const { provider } = require('./marketingAutomation.accountDelivery.fixture');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
const { context } = require('./marketingAutomation.measurementSnapshot.fixture');
const { createSpendSync } = require('../src/modules/marketingAutomation/facebookSpendSync');

test('actual collector keeps zero-spend signals and reconciles six unfiltered reports with stable account reads', async () => {
 const f = provider(), r = await readAccountSpendWithDelivery(f.input);
 assert.equal(r.totalVnd, 500000);assert.equal(r.delivery.adDays.length, 2);assert.equal(r.delivery.adDays[1].impressions, 3);
 assert.equal(r.delivery.witnesses.length, 6);assert.equal(r.delivery.destinationCoverage, 'UNVERIFIED');assert.equal(f.calls.length, 7);
 assert.ok(f.calls.every(x => !x.includes('filtering') && !x.includes('effective_status')));
});
for (const [label, mutate, code] of [
 ['zero-spend ad omitted', (b,c) => { if(c.kind.startsWith('ad'))b.data.pop();return b; }, 'DELIVERY_ACCOUNT_MISMATCH'],
 ['same count but different ad IDs', (b,c) => { if(c.kind==='ad:all_days')b.data[0].ad_id='999';return b; }, 'DELIVERY_AD_TOTAL_MISMATCH'],
 ['duplicate ad day', (b,c) => { if(c.kind==='ad:1')b.data.push(b.data[0]);return b; }, 'DUPLICATE_DELIVERY_ROW'],
 ['wrong ad ownership', (b,c) => { if(c.kind==='ad:1')b.data[0].account_id='999';return b; }, 'ACCOUNT_OR_CURRENCY_MISMATCH'],
 ['partial day drift after ad read', (b,c) => { if(c.kind.startsWith('account')&&c.call===2)b.data[0].clicks='12';return b; }, 'DELIVERY_CHANGED_DURING_READ'],
 ['malformed count', b => { b.data[0].impressions=null;return b; }, 'INVALID_DELIVERY_COUNT'],
 ['wrong date', (b,c) => { if(c.kind==='ad:1')b.data[0].date_start='2026-09-30';return b; }, 'DELIVERY_PERIOD_MISMATCH'],
 ['missing data', () => ({}), 'DELIVERY_PAGE_LIMIT'],
]) test(label+' cannot publish a reconciled delivery', async () => assert.rejects(readAccountSpendWithDelivery(provider({mutate}).input),new RegExp(code)));

test('pagination reconstructs scope, preserves rows and never forwards a token in provider next URL', async () => {
 const f = provider({mutate(b,c){if(c.kind==='ad:1'){if(!c.url.searchParams.has('after'))return {data:b.data.slice(0,1),paging:{cursors:{after:'next'},next:c.url.origin+c.url.pathname+'?after=next&access_token=do-not-forward'}};return {data:b.data.slice(1)};}return b;}});
 const r=await readAccountSpendWithDelivery(f.input);assert.equal(r.delivery.adDays.length,2);assert.equal(r.delivery.witnesses[2].pages,2);
 const next=new URL(f.calls.find(x=>x.includes('after=')));assert.equal(next.searchParams.get('level'),'ad');assert.equal(next.searchParams.get('time_range'),JSON.stringify({since:'2026-10-01',until:'2026-10-01'}));
});
for(const [name,next,code] of [['different host','https://example.com/v24.0/act_1/insights?after=n','UNSAFE_DELIVERY_PAGING'],['changed scope','https://graph.facebook.com/v24.0/act_1/insights?after=n&level=ad','DELIVERY_SCOPE_CHANGED'],['cursor conflict','https://graph.facebook.com/v24.0/act_1/insights?after=other','INVALID_DELIVERY_CURSOR']])test(name+' cannot redirect collection',async()=>{
 const f=provider({mutate:b=>({...b,paging:{cursors:{after:'n'},next}})});await assert.rejects(readAccountSpendWithDelivery(f.input),new RegExp(code));assert.equal(f.calls.length,2);
});
test('missing version and upstream failure are bounded without secrets',async()=>{
 const f=provider();await assert.rejects(readAccountSpendWithDelivery({...f.input,version:undefined}),/INVALID_DELIVERY_CONTEXT/);assert.equal(f.calls.length,0);
 await assert.rejects(readAccountSpendWithDelivery({...f.input,fetchImpl:async()=>{throw Error('synthetic secret');}}),e=>e.message==='FACEBOOK_READ_FAILED');
});
for(const paging of ['malformed',[],false,{cursors:false},{cursors:null},{cursors:[]}])test('malformed paging '+JSON.stringify(paging)+' is not evidence of traversal',async()=>{
 const f=provider({mutate:b=>({...b,paging})});await assert.rejects(readAccountSpendWithDelivery(f.input),/INVALID_DELIVERY_PAGING/);assert.equal(f.calls.length,2);
});
test('enabled delivery worker closes at Vietnam midnight; disabled legacy worker preserves its declared current-day scope',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../src/modules/marketingAutomation/facebookSpendSync.js'),'utf8');
 for(const enabled of [true,false])for(const [now,closedDay,today]of [['2026-10-02T16:59:59Z','2026-10-01','2026-10-02'],['2026-10-02T17:00:00Z','2026-10-02','2026-10-03']]){
  const calls=[],reads=[],mod={exports:{}},db={rpc:async(name,args)=>{calls.push({name,args});return{data:{id:1,deliveryEvidence:{runId:1,payloadDigest:'a'.repeat(64)}}};}};
  vm.runInNewContext(source,{module:mod,process:{env:{VPT_MARKETING_ACCOUNT_DELIVERY:enabled?'1':'0',VPT_META_GRAPH_VERSION:'v24.0'}},Date,require:id=>{
   if(id==='../../config/supabaseRouter')return{supabase:db,isFailoverEnabled:()=>false,getActiveTarget:()=> 'primary'};
   if(id==='./facebookSpendSource')return{...require('../src/modules/marketingAutomation/facebookSpendSource'),readAccountSpend:async args=>{reads.push({legacy:true,...args});return{};}};
   if(id==='./facebookAccountDelivery')return{readAccountSpendWithDelivery:async args=>{reads.push(args);return{delivery:{}};}};throw Error(id);
  }});
  assert.equal((await mod.exports.syncConfiguredAccount({ad_account_id:'act_1',company_id:'a',access_token:'synthetic'},{days:1,now})).status,'COMPLETE');
  const expected=enabled?closedDay:today;assert.equal(calls[0].args.p_until,expected);assert.equal(calls[0].args.p_since,expected);assert.equal(reads[0].until,expected);assert.equal(reads[0].since,expected);assert.equal(reads[0].version,enabled?'v24.0':undefined);
 }
});
async function facts(){const f=context().facts;f.accountDelivery=[];for(const a of f.trial.account_ids){const snapshot=await readAccountSpendWithDelivery(provider({account:a,until:'2026-10-02'}).input),run=f.runs.find(x=>x.ad_account_id===a);run.snapshot={...snapshot};delete run.snapshot.delivery;f.accountDelivery.push({companyId:f.companyId,accountId:a,runId:run.id,payload:snapshot.delivery,payloadDigest:'f'.repeat(64),recordedAt:f.asOf});}return f;}
test('real trial projection retains both account costs, reports zero-spend ads and never certifies historical destinations',async()=>{
 const f=await facts(),r=reportTrial(f);assert.equal(r.accountDelivery.accounts.length,2);assert.equal(r.accountDelivery.accounts[1].spendVnd,500000);assert.equal(r.accountDelivery.accounts[0].zeroSpendWithSignals,1);assert.equal(r.accountDelivery.accounts[0].status,'RECONCILED_DELIVERY');assert.equal(r.costPerQualifiedLeadVnd,null);assert.equal(r.allowBudgetExecution,false);assert.ok(!JSON.stringify(r.accountDelivery).includes('090123'));
});
test('source-only ad, stale spend and wrong-company evidence cannot disappear or be reused',async()=>{
 const f=await facts();f.sources[0].proof.adId='88';assert.deepEqual(reportTrial(f).accountDelivery.accounts[0].sourceOnlyAdIds,['88']);
 f.accountDelivery[0].companyId='other';assert.throws(()=>reportTrial(f),/DELIVERY_REPORT_UNAVAILABLE/);
 const g=await facts();g.runs[0].state='FAILED';assert.equal(reportTrial(g).accountDelivery.accounts[0].status,'UNAVAILABLE');assert.equal(reportTrial(g).accountDelivery.accounts[0].ads.length,0);
});
test('sync does not claim delivery storage when an old migration silently discards the witness',async()=>{
 const snapshot=await readAccountSpendWithDelivery(provider().input),calls=[];
 const sync=createSpendSync({writerAllowed:()=>true,readSource:async()=>snapshot,client:{rpc:async(name,args)=>{calls.push(name);return{data:{id:1}};}}});
 assert.equal((await sync({account:{ad_account_id:'act_1',company_id:'a'},since:'2026-10-01',until:'2026-10-01'})).status,'UNKNOWN');assert.equal(calls.length,3);
});
module.exports={facts};
