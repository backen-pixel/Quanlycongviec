const test = require('node:test');
const assert = require('node:assert/strict');
const { responseSla, windowOf, digest, evaluateAdDryRun } = require('../../src/modules/founderControl/domain');
const { validate } = require('../../src/modules/founderControl/contracts');
const now='2026-10-08T23:00:00+07:00';
for (const [name,start,end,minutes,status] of [
 ['trong ca', '2026-10-07T08:00:00+07:00','2026-10-07T08:04:59+07:00',299/60,'MET'],
 ['đúng 5 phút không dưới 5', '2026-10-07T08:00:00+07:00','2026-10-07T08:05:00+07:00',5,'BREACHED'],
 ['qua đêm', '2026-10-07T21:58:00+07:00','2026-10-08T08:02:00+07:00',4,'MET'],
 ['trước ca', '2026-10-07T07:00:00+07:00','2026-10-07T08:01:00+07:00',1,'MET'],
 ['ngoài ca phản hồi trước ca sau', '2026-10-07T23:00:00+07:00','2026-10-08T07:00:00+07:00',0,'MET'],
 ['chủ nhật vẫn trực', '2026-10-04T08:00:00+07:00','2026-10-04T08:06:00+07:00',6,'BREACHED'],
 ['UTC tương đương VN', '2026-10-07T01:00:00Z','2026-10-07T01:04:00Z',4,'MET'],
]) test('SLA '+name,()=>{const s=responseSla(start,end,now);assert.equal(s.minutes,minutes);assert.equal(s.status,status)});
test('SLA thiếu, thứ tự sai, thời điểm tương lai không đo được',()=>{
 for(const args of [[null,now,now],[now,'2026-10-07T08:00:00Z',now],['2026-10-07T08:00:00Z','2026-10-09T08:00:00Z',now]])assert.equal(responseSla(...args).status,'UNKNOWN');
});
test('schema đóng từ chối actor/tenant/role và input sai',()=>{
 const args={company_id:'00000000-0000-0000-0000-000000000001',window_start:'2026-10-07T00:00:00+07:00',window_end:'2026-10-08T00:00:00+07:00'};
 for(const k of ['tenant_id','actor_id','role','assigned_to'])assert.throws(()=>validate('get_founder_overview',{...args,[k]:'admin'}),/INVALID_ARGUMENTS/);
 assert.throws(()=>windowOf({...args,window_start:'2026-02-30T00:00:00Z'}));
 assert.throws(()=>windowOf({...args,window_end:args.window_start}));
});
test('digest không phụ thuộc thứ tự key và khác theo payload',()=>{assert.equal(digest({a:1,b:2}),digest({b:2,a:1}));assert.notEqual(digest({a:1}),digest({a:2}))});
const company='00000000-0000-0000-0000-000000000001';
const policy={verified:true,subject:'ad',version:'fixture-only',ad_id:'ad-1',company_id:company,max_age_ms:60000,resume_at_midnight:true};
const observation={coverage:'COMPLETE',scope_verified:true,currency:'VND',spend_vnd:50000,phone_count:0,company_id:company,ad_id:'ad-1',day:'2026-10-07',as_of:'2026-10-07T10:00:00+07:00'};
test('dry-run mặc định không policy gốc → UNKNOWN',()=>{assert.equal(evaluateAdDryRun(observation,null,observation.as_of).reason,'POLICY_SCOPE_UNVERIFIED')});
test('dry-run chỉ WOULD_PAUSE ở ngưỡng với nguồn đầy đủ',()=>{const r=evaluateAdDryRun(observation,policy,observation.as_of);assert.equal(r.action,'WOULD_PAUSE');assert.equal(r.execution,'NOT_EXECUTED');assert.equal(evaluateAdDryRun({...observation,spend_vnd:49999},policy,observation.as_of).action,'NO_CHANGE')});
test('không biến thiếu khách/currency/trễ/sai scope thành số 0',()=>{
 for(const o of [{phone_count:null},{coverage:'UNKNOWN'},{currency:'USD'},{company_id:'other'},{as_of:'2026-10-06T10:00:00+07:00'},{day:'2026-10-06'}])assert.equal(evaluateAdDryRun({...observation,...o},policy,observation.as_of).action,'UNKNOWN');
});
test('00:00 chỉ đề xuất bật lại ads do cùng policy đã dừng',()=>{
 const o={...observation,day:'2026-10-08',as_of:'2026-10-08T00:00:00+07:00',paused_by_policy_version:'fixture-only',paused_on_day:'2026-10-07'};
 assert.equal(evaluateAdDryRun(o,policy,o.as_of).action,'WOULD_RESUME');
 assert.notEqual(evaluateAdDryRun({...o,paused_by_policy_version:'unrelated'},policy,o.as_of).action,'WOULD_RESUME');
});
