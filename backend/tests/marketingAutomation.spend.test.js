'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { readAccountSpend, allPages, vnd, calendarDays } = require('../src/modules/marketingAutomation/facebookSpendSource');
const { createSpendSync } = require('../src/modules/marketingAutomation/facebookSpendSync');
const { summarizeSpend, readSpendCoverage } = require('../src/modules/marketingAutomation/spendCoverage');
const now = '2026-10-02T03:00:00.000Z';
const info = { id: '123', currency: 'VND', timezone_name: 'Asia/Ho_Chi_Minh', timezone_offset_hours_utc: 7 };
const row = (date, spend) => ({ account_id: '123', account_currency: 'VND', date_start: date, date_stop: date, spend });
function fixture({ metadata = info, daily = [row('2026-10-01','500000.00')], total = [{ ...row('2026-10-01','500000'), date_stop: '2026-10-02' }] } = {}) {
  const calls = [];
  const fetchImpl = async (raw, options) => {
    const u = new URL(raw); calls.push(u);
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(options.redirect, 'error'); assert.equal(u.searchParams.has('access_token'),false);
    const body = !u.pathname.endsWith('/insights') ? metadata : { data: u.searchParams.get('time_increment') === '1' ? daily : total };
    return { ok: true, json: async () => body };
  };
  return { calls, input: { adAccountId: 'act_123', token: 'synthetic-token', since: '2026-10-01', until: '2026-10-02', now, fetchImpl } };
}
test('account report includes spend without leads and explicit zero days after reconciliation', async () => {
  const f=fixture(), s=await readAccountSpend(f.input);
  assert.equal(s.totalVnd,500000); assert.deepEqual(s.days,[{date:'2026-10-01',amountVnd:500000},{date:'2026-10-02',amountVnd:0}]);
  assert.equal(f.calls.length,3);assert.equal(f.calls[1].searchParams.get('level'),'account');
});
test('two successful empty reports prove zero; missing data does not',async()=>{
  assert.equal((await readAccountSpend(fixture({daily:[],total:[]}).input)).totalVnd,0);
  await assert.rejects(allPages('https://graph.facebook.com/v22.0/act_123/insights','x',async()=>({ok:true,json:async()=>({})})),/INVALID_FACEBOOK_DATA/);
});
for(const [label,override,reason] of [
  ['wrong currency',{metadata:{...info,currency:'USD'}},'ACCOUNT_OR_CURRENCY_MISMATCH'],
  ['unknown currency',{metadata:{...info,currency:null}},'ACCOUNT_OR_CURRENCY_MISMATCH'],
  ['wrong account',{metadata:{...info,id:'999'}},'ACCOUNT_OR_CURRENCY_MISMATCH'],
  ['wrong timezone',{metadata:{...info,timezone_name:'America/Los_Angeles',timezone_offset_hours_utc:-7}},'UNSUPPORTED_ACCOUNT_TIMEZONE'],
  ['missing day report money',{daily:[]},'SPEND_RECONCILIATION_FAILED'],
  ['duplicate daily rows',{daily:[row('2026-10-01','500000'),row('2026-10-01','500000')]},'INVALID_DAILY_SPEND'],
  ['wrong source account',{daily:[{...row('2026-10-01','500000'),account_id:'999'}]},'ACCOUNT_OR_CURRENCY_MISMATCH'],
  ['wrong row currency',{daily:[{...row('2026-10-01','500000'),account_currency:'USD'}]},'ACCOUNT_OR_CURRENCY_MISMATCH'],
  ['out of range',{daily:[row('2026-09-30','500000')]},'INVALID_DAILY_SPEND'],
  ['malformed spend',{daily:[row('2026-10-01','bad')]},'INVALID_VND_AMOUNT'],
  ['fractional VND',{daily:[row('2026-10-01','0.01')]},'INVALID_VND_AMOUNT'],
  ['duplicate totals',{total:[row('2026-10-01','500000'),row('2026-10-02','0')]},'INVALID_ACCOUNT_TOTAL'],
]) test(label+' cannot certify spend',async()=>assert.rejects(readAccountSpend(fixture(override).input),new RegExp(reason)));
test('pagination completes, strips embedded token and preserves all rows',async()=>{
  let n=0;
  const rows=await allPages('https://graph.facebook.com/v22.0/act_123/insights','secret',async(url,opts)=>{
    assert.ok(!url.includes('access_token'));assert.equal(opts.headers.Authorization,'Bearer secret');
    return {ok:true,json:async()=>++n===1?{data:[1],paging:{next:'https://graph.facebook.com/v22.0/act_123/insights?after=2&access_token=should-not-forward'}}:{data:[2]}};
  });assert.deepEqual(rows,[1,2]);
});
for(const [name,next,reason] of [
  ['foreign host','https://example.com/v22.0/act_123/insights','UNSAFE_PAGINATION'],
  ['different account','https://graph.facebook.com/v22.0/act_999/insights','UNSAFE_PAGINATION'],
  ['loop','https://graph.facebook.com/v22.0/act_123/insights','PAGINATION_LOOP'],
]) test(name+' pagination is rejected without forwarding token',async()=>{
  let n=0;await assert.rejects(allPages('https://graph.facebook.com/v22.0/act_123/insights','secret',async()=>{n++;return{ok:true,json:async()=>({data:[],paging:{next}})};}),new RegExp(reason));assert.equal(n,1);
});
test('page limit does not certify a truncated list',async()=>{
  let n=0;await assert.rejects(allPages('https://graph.facebook.com/v22.0/act_123/insights','x',async()=>({ok:true,json:async()=>({data:[],paging:{next:`https://graph.facebook.com/v22.0/act_123/insights?after=${++n}`}})}),2),/PAGINATION_LIMIT/);
});
test('upstream error cannot leak token into failure evidence',async()=>{
  const f=fixture();f.input.fetchImpl=async()=>{throw new Error('private-token https://secret')};
  await assert.rejects(readAccountSpend(f.input),e=>e.message==='FACEBOOK_READ_FAILED');
});
test('invalid dates, unsafe or missing money never normalize to zero',()=>{
  for(const x of [null,undefined,'','NaN',-1,Infinity,9007199254740992,'1e3'])assert.throws(()=>vnd(x));
  for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2026-01-01','2026-10-01']])assert.throws(()=>calendarDays(a,b));
});

function coverage() {
  return { companyId:'company-a',since:'2026-10-01',until:'2026-10-02',now,
    accounts:[{ad_account_id:'act_123',company_id:'company-a',bat:true}],
    runs:[{id:1,ad_account_id:'act_123',company_id:'company-a',state:'COMPLETE',started_at:now,since:'2026-10-01',until:'2026-10-02',snapshot:{accountId:'act_123',currency:'VND',source:'META_ACCOUNT_INSIGHTS_V1',since:'2026-10-01',until:'2026-10-02',days:[{date:'2026-10-01',amountVnd:500000},{date:'2026-10-02',amountVnd:0}]}}] };
}
test('coverage counts every enabled account including one without any lead',()=>{
  const c=coverage();c.accounts.push({...c.accounts[0],ad_account_id:'act_456'});c.runs.push({...c.runs[0],id:2,ad_account_id:'act_456',snapshot:{...c.runs[0].snapshot,accountId:'act_456'}});
  const r=summarizeSpend(c);assert.equal(r.spendVnd,1000000);assert.equal(r.allowBudgetExecution,false);assert.equal(r.scope,'CONFIGURED_FACEBOOK_ACCOUNTS');
});
for(const [name,mutate] of [
  ['missing account run',c=>c.runs=[]],['wrong company',c=>c.accounts[0].company_id='b'],
  ['failed latest run',c=>c.runs[0].state='FAILED'],['interrupted run',c=>c.runs[0].state='RUNNING'],
  ['stale run',c=>c.runs[0].started_at='2026-10-01T20:00:00Z'],['future run',c=>c.runs[0].started_at='2026-10-02T04:00:00Z'],
  ['missing day',c=>c.runs[0].snapshot.days.pop()],['expired access',c=>c.accounts[0].token_het_han=now],
  ['short range',c=>c.runs[0].since='2026-10-02'],['multiple current snapshots',c=>c.runs.push(c.runs[0])],
])test(name+' returns unknown not zero',()=>{const c=coverage();mutate(c);const r=summarizeSpend(c);assert.equal(r.status,'UNKNOWN');assert.equal(r.spendVnd,null);assert.equal(r.allowBudgetExecution,false)});
test('DB failure or disabled source is not an empty report',async()=>{
  const r=await readSpendCoverage({client:{from(){throw Error('secret')}},companyId:'a',since:'2026-10-01',until:'2026-10-02',now});assert.equal(r.status,'UNKNOWN');assert.equal(r.spendVnd,null);
  assert.equal((await readSpendCoverage({sourceAllowed:false})).reason,'SOURCE_NOT_ENABLED');
});
test('sync persists intent before source; source error supersedes prior success',async()=>{
  const calls=[];const sync=createSpendSync({writerAllowed:()=>true,client:{async rpc(name,args){calls.push([name,args]);return{data:{id:7}}}},readSource:async()=>{assert.equal(calls[0][0],'marketing_spend_begin');throw Error('token');}});
  const r=await sync({account:{ad_account_id:'123',company_id:'a'},since:'2026-10-01',until:'2026-10-02',now});
  assert.equal(r.status,'UNKNOWN');assert.equal(calls[1][1].p_snapshot,null);assert.equal(calls[1][1].p_failure,'SOURCE_OR_STORAGE_FAILED');assert.ok(!JSON.stringify(calls).includes('token'));
});
test('writer guard prevents source call when failover is possible',async()=>{
  const sync=createSpendSync({writerAllowed:()=>false,client:{rpc(){assert.fail()}},readSource:async()=>assert.fail()});
  await assert.rejects(sync({account:{ad_account_id:'123',company_id:'a'},since:'2026-10-01',until:'2026-10-02',now}),/PRIMARY_ONLY_REQUIRED/);
});
test('failed snapshot commit never reports success',async()=>{
  let n=0;const sync=createSpendSync({writerAllowed:()=>true,client:{async rpc(){if(++n===1)return{data:{id:1}};return{error:{message:'unavailable'}}}},readSource:async()=>({totalVnd:500000})});
  assert.equal((await sync({account:{ad_account_id:'123',company_id:'a'},since:'2026-10-01',until:'2026-10-02',now})).status,'UNKNOWN');assert.equal(n,3);
});
test('storage adapter reads exact company account roster and all latest snapshots',async()=>{
 const c=coverage(),calls=[];
 const client={from(name){assert.equal(name,'fb_ad_accounts');return{select(fields,opts){assert.equal(opts.count,'exact');assert.ok(!fields.includes('access_token'));return{async eq(k,v){calls.push([k,v]);return{data:c.accounts,count:1}}}}}},async rpc(name,args){assert.equal(name,'marketing_spend_latest');assert.equal(args.p_company,c.companyId);return{data:c.runs}}};
 const r=await readSpendCoverage({...c,client});assert.equal(r.spendVnd,500000);assert.deepEqual(calls,[['company_id','company-a']]);
});
test('row-limited account response cannot certify partial total',async()=>{
 const c=coverage(),client={from(){return{select(){return{async eq(){return{data:c.accounts,count:2}}}}}},rpc(){assert.fail('must stop before reading partial roster')}};
 assert.equal((await readSpendCoverage({...c,client})).status,'UNKNOWN');
});
test('disabled configured account cannot be silently dropped from costs',()=>{
 const c=coverage();c.accounts[0].bat=false;assert.equal(summarizeSpend(c).status,'UNKNOWN');
});
