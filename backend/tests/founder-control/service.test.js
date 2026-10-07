const test=require('node:test'), assert=require('node:assert/strict');
const {createFounderControl}=require('../../src/modules/founderControl/service');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
function fixture(overrides={}) {
 const key={id:id(3),active:true,default_assigned_to:id(2),created_by:id(2),company_id:id(1),mcp_scopes:['founder_read','founder_write']};
 const tables={external_api_keys:[key],companies:[{id:id(1),tenant_id:id(9)}],users:[{id:id(2),tenant_id:id(9),company_id:id(1),role:'admin',is_active:true}],
   crm_leads:[],lead_attribution:[],fb_ad_accounts:[],founder_objectives:[],founder_proposals:[],founder_decisions:[],...overrides};
 const calls=[]; let rpcCalls=0;
 const db={from(table){
  const filters=[];let single=false,range=null;
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lt(k,v){filters.push(r=>r[k]<v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},order(){return q},range(a,b){range=[a,b];return q},maybeSingle(){single=true;return q},then(resolve,reject){
   calls.push({table,filters:filters.length});
   const data=tables[table];
   if(data instanceof Error)return Promise.resolve({error:{message:'secret raw provider error'},data:null}).then(resolve,reject);
   let rows=(data||[]).filter(r=>filters.every(f=>f(r)));if(range)rows=rows.slice(range[0],range[1]+1);
   return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(resolve,reject);
  }};return q;
 },async rpc(){rpcCalls++;return {data:{status:'DRAFT',objective_id:id(5),execution:'NOT_EXECUTED'}}}};
 const service=createFounderControl({db,slaCompanyId:id(1),isPrimary:()=>true,enabled:()=>true,writesEnabled:()=>true,now:()=> '2026-10-08T00:00:00Z'});
 const req={apiKey:key,headers:{}};
 const args={company_id:id(1),window_start:'2026-10-07T00:00:00Z',window_end:'2026-10-08T00:00:00Z'};
 return {service,db,req,args,tables,calls,rpcCalls:()=>rpcCalls};
}
test('lỗi nguồn không thành 0; actor/key kiểm lại trước trả',async()=>{
 const f=fixture({lead_attribution:new Error('down')});const r=await f.service.call('get_founder_overview',f.args,f.req);
 assert.equal(r.outcome,'PARTIAL');assert.equal(r.data.metrics.attribution_events.value,null);assert.equal(r.data.metrics.spend_vnd.value,null);
 assert.equal(f.calls.filter(c=>c.table==='external_api_keys').length,2);assert.ok(!JSON.stringify(r).includes('secret raw'));
});
test('zero thực từ snapshot khác với nguồn thiếu',async()=>{const f=fixture();const r=await f.service.call('get_founder_overview',f.args,f.req);assert.equal(r.data.metrics.attribution_events.value,0);assert.equal(r.data.metrics.attribution_events.status,'OBSERVED');assert.equal(r.source_as_of,null)});
test('không truy cập dữ liệu doanh nghiệp khác',async()=>{const f=fixture();await assert.rejects(f.service.call('get_founder_overview',{...f.args,company_id:id(8)},f.req),/COMPANY_SCOPE_DENIED/);assert.ok(!f.calls.some(c=>c.table==='crm_leads'))});
test('tenant/role/user inactive/region/delegation bị từ chối',async()=>{
 for(const edit of [f=>f.tables.users[0].tenant_id=id(8),f=>f.tables.users[0].role='sales',f=>f.tables.users[0].is_active=false,f=>f.tables.external_api_keys[0].region_id=id(8),f=>f.req.headers['x-user-id']=id(8),f=>f.tables.external_api_keys[0].active=false]){
  const f=fixture();edit(f);await assert.rejects(f.service.call('get_founder_overview',f.args,f.req));assert.ok(!f.calls.some(c=>c.table==='crm_leads'));
 }
});
test('sales_admin không có quyền ghi dù key có scope',async()=>{const f=fixture();f.tables.users[0].role='sales_admin';f.tables.users.push({id:id(11),company_id:id(1),tenant_id:id(9),role:'admin',is_active:true});f.tables.external_api_keys[0].created_by=id(11);await assert.rejects(f.service.call('create_founder_objective',{...f.args,request_id:'request-001',owner_id:id(2),title:'Mục tiêu',metric:'FIRST_RESPONSE_SLA',target:95},f.req),/ACTOR_PERMISSION_DENIED/);assert.equal(f.rpcCalls(),0)});
test('ghi mặc định tắt và Backup không được ghi',async()=>{
 for(const [writes,primary] of [[false,true],[true,false]]){const f=fixture();const s=createFounderControl({db:f.db,enabled:()=>true,writesEnabled:()=>writes,isPrimary:()=>primary});await assert.rejects(s.call('create_founder_objective',{...f.args,request_id:'request-001',owner_id:id(2),title:'Mục tiêu',metric:'FIRST_RESPONSE_SLA',target:95},f.req),/WRITE_GATE_CLOSED/);assert.equal(f.rpcCalls(),0)}
});
test('chỉ query CRM object đúng company, không ghi seen_by',async()=>{const f=fixture();await assert.rejects(f.service.call('get_founder_evidence',{...f.args,lead_id:id(8)},f.req),/OBJECT_NOT_ACCESSIBLE/);assert.equal(f.rpcCalls(),0)});
test('SLA bỏ system response và lấy human sent_by đúng tenant',async()=>{
 const f=fixture({crm_leads:[{id:id(4),company_id:id(1),type:'lead',assigned_to:id(2),stage_id:id(7)}],
 facebook_lead_ads_intake_receipts:[{id:id(5),company_id:id(1),lead_id:id(4),inbox_id:id(6),created_at:'2026-10-07T03:00:01Z'}],
 facebook_page_inbox:[{id:id(6),created_at:'2026-10-07T03:00:00Z'}],facebook_messages:[
 {id:id(7),lead_id:id(4),direction:'outbound',created_at:'2026-10-07T03:00:30Z',sent_by:null,fb_message_id:'auto'},
 {id:id(8),lead_id:id(4),direction:'outbound',created_at:'2026-10-07T03:04:00Z',sent_by:id(10),fb_message_id:'human'},
 ]});f.tables.users.push({id:id(10),company_id:id(1),tenant_id:id(9),role:'sales_admin',is_active:true});
 const r=await f.service.call('get_founder_evidence',{...f.args,lead_id:id(4)},f.req);assert.equal(r.data.first_response.status,'MET');assert.equal(r.data.first_response.minutes,4);assert.equal(r.data.first_response.evidence_ref,id(8));
});
test('read lỗi/không receipt không dùng first_touch_time thay SLA',async()=>{const f=fixture({crm_leads:[{id:id(4),company_id:id(1),first_touch_time:'2026-10-07T03:00:00Z'}]});const r=await f.service.call('get_founder_evidence',{...f.args,lead_id:id(4)},f.req);assert.equal(r.data.first_response.status,'UNKNOWN')});
module.exports={fixture,id};
test('nguồn đồng bộ cũ hiện nhãn STALE; không biến fetched_at thành source_as_of',async()=>{const f=fixture({fb_ad_accounts:[{company_id:id(1),tenant_id:id(9),ad_account_id:'act_fixture',lan_dong_bo_cuoi:'2026-10-06T00:00:00Z'}]});const r=await f.service.call('get_founder_overview',f.args,f.req);const account=r.source_refs.find(s=>s.ref==='fb_ad_accounts');assert.equal(account.freshness,'STALE_SYNC_OVER_15_MINUTES');assert.equal(account.source_as_of,null);assert.equal(r.data.metrics.spend_vnd.value,null)});
test('không đọc inbox theo Page hiện tại; chỉ IDs từ receipt cùng công ty',async()=>{const f=fixture({facebook_lead_ads_intake_receipts:[{id:id(5),inbox_id:id(6),company_id:id(1),lead_id:id(4),created_at:'2026-10-07T03:00:00Z'}],facebook_page_inbox:[{id:id(6),status:'pending',attempts:2,last_error_code:'RETRY_FIXTURE',available_at:'2026-10-07T03:00:05Z'},{id:id(7),status:'pending',attempts:9,last_error_code:'OTHER_COMPANY'}]});const r=await f.service.call('get_founder_overview',f.args,f.req);assert.equal(r.data.intake_processing.length,1);assert.equal(r.data.intake_processing[0].evidence_ref,id(6));assert.equal(r.data.metrics.unprocessed_intake_events.value,null);assert.ok(!JSON.stringify(r).includes('OTHER_COMPANY'))});
test('uncertain connection error is explicit; backend does not retry the write blindly',async()=>{const f=fixture();f.db.rpc=async()=>{throw new Error('raw secret')};await assert.rejects(f.service.call('create_founder_objective',{...f.args,request_id:'request-001',owner_id:id(2),title:'Mục tiêu',metric:'FIRST_RESPONSE_SLA',target:95},f.req),/WRITE_OUTCOME_UNKNOWN_REPLAY_SAME_REQUEST/)});
test('feature disabled does not read DB and missing read scope cannot list',async()=>{const f=fixture();const s=createFounderControl({db:f.db,enabled:()=>false});await assert.rejects(s.call('get_founder_overview',f.args,f.req),/FOUNDER_CONTROL_DISABLED/);assert.equal(f.calls.length,0);f.tables.external_api_keys[0].mcp_scopes=['reports','crm_read'];await assert.rejects(f.service.call('get_founder_overview',f.args,f.req),/CAPABILITY_DENIED/)});
test('truncated source cannot give complete count',async()=>{const f=fixture({lead_attribution:Array.from({length:3000},(_,n)=>({id:id(n+20),company_id:id(1),cham_dau_luc:'2026-10-07T03:00:00Z'}))});const r=await f.service.call('get_founder_overview',f.args,f.req);assert.equal(r.data.metrics.attribution_events.value,null);assert.equal(r.source_refs.find(s=>s.ref==='lead_attribution').coverage,'PARTIAL')});
test('VPT shift policy is never silently applied to another company',async()=>{const f=fixture({crm_leads:[{id:id(4),company_id:id(1)}]});const s=createFounderControl({db:f.db,enabled:()=>true,writesEnabled:()=>false,isPrimary:()=>true,slaCompanyId:id(7)});const r=await s.call('get_founder_evidence',{...f.args,lead_id:id(4)},f.req);assert.equal(r.data.first_response.reason,'VPT_POLICY_SCOPE_UNVERIFIED')});
