'use strict';
// Actual modules in VM with declared synthetic ports only; no provider, credentials or DB network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function load(name, deps = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/helpers', name + '.js'), 'utf8'), {
    module, exports: module.exports, console: { warn() {}, info() {}, error() {} },
    Buffer, Date, Intl, URL, AbortSignal, setTimeout, clearTimeout, process: { env: {} },
    fetch() { throw Error('Network prohibited'); },
    require(n) { if (Object.hasOwn(deps, n)) return deps[n]; throw Error('Undeclared dependency ' + n); },
    ...globals,
  }, { filename: name, timeout: 2000 });
  return module.exports;
}
const plain = v => JSON.parse(JSON.stringify(v));
function database(tables, options = {}) {
  const trace = [];
  return { trace, from(table) {
    if (!Object.hasOwn(tables, table)) throw Error('Unexpected table ' + table);
    const filters = [], orders = [];
    let single = false, cap = Infinity, fields, head = false, exact = false;
    const value = (r, k) => k.split('.').reduce((a, b) => a?.[b], r);
    const q = {
      select(f, o) { fields = f; head = o?.head; exact = o?.count === 'exact'; return q; },
      eq(k, v) { filters.push(r => value(r, k) === v); trace.push({ table, k, v }); return q; },
      neq(k, v) { filters.push(r => value(r, k) !== v); return q; },
      in(k, v) { filters.push(r => v.includes(value(r, k))); return q; },
      ilike(k, term) { filters.push(r => String(value(r,k)).toLowerCase().includes(term.replaceAll('%','').toLowerCase())); return q; },
      gte(k, v) { filters.push(r => value(r,k) >= v); return q; },
      lte(k, v) { filters.push(r => value(r,k) <= v); return q; },
      is(k, v) { filters.push(r => value(r,k) === v); return q; },
      order(k, o = {}) { orders.push([k, o.ascending !== false]); return q; },
      limit(n) { cap = n; return q; },
      maybeSingle() { single = true; return q; },
      then(resolve, reject) {
        let rows = tables[table].filter(r => filters.every(f => f(r)));
        rows.sort((a,b) => { for (const [k, asc] of orders) {
          if (a[k] !== b[k]) return (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1);
        } return 0; });
        const count = rows.length;
        rows = rows.slice(0, Math.min(cap, options.cap?.[table] ?? Infinity));
        const error = options.error?.({table, fields, head}) || null;
        return Promise.resolve({ data: head ? null : single ? rows[0] || null : rows,
          error, count: exact ? count : null }).then(resolve, reject);
      },
    };
    return q;
  }};
}
function fixture(role = 'employee') {
  const now = new Date().toISOString();
  return {
    users: [
      { id:'a', company_id:'A', tenant_id:'T', is_active:true, role, full_name:'Alice' },
      { id:'b', company_id:'B', tenant_id:'U', is_active:true, role:'employee', full_name:'Bob' },
      { id:'c', company_id:'A', tenant_id:'T', is_active:true, role:'employee', full_name:'Colleague' },
    ],
    companies: [
      { id:'A', tenant_id:'T', is_active:true, name:'Company A' },
      { id:'B', tenant_id:'U', is_active:true, name:'Company B' },
    ],
    tenants: [{ id:'T', is_active:true }, { id:'U', is_active:true }],
    crm_leads: [
      { id:'la', company_id:'A', assigned_to:'a', created_at:now, actual_close_date:null, type:'lead' },
      { id:'lc', company_id:'A', assigned_to:'c', created_at:now, actual_close_date:null, type:'lead' },
      { id:'lb', company_id:'B', assigned_to:'b', created_at:now, actual_close_date:null, type:'lead' },
    ],
    crm_lead_stage_history: [],
    messenger_groups: [{ id:'dm', is_direct:true }],
    messenger_group_members: [{ group_id:'dm', user_id:'a' }, { group_id:'dm', user_id:'00000000-0000-0000-0000-0000000000a1' }],
  };
}
function toolSuite(tables = fixture(), options = {}) {
  const db = database(tables, options);
  const guard = load('aiToolAuthorization', { '../config/supabase': { supabase:db } });
  const tools = load('aiReportTools', {
    '../config/supabase': { supabase:db }, '../config': {}, './crmPipelineSla': {},
    './aiToolAuthorization':guard,
  });
  return { db, tools, guard };
}
const ctx = { sender_user_id:'a' };
test('employee summary is self/company bound, admin summary remains company bound', async () => {
  const employee = toolSuite(), admin = toolSuite(fixture('sales_admin'));
  const e = await employee.tools.executeTool('get_company_lead_summary', {}, ctx);
  const a = await admin.tools.executeTool('get_company_lead_summary', {}, ctx);
  assert.equal(e.new_leads,1); assert.equal(e.open,1); assert.equal(a.new_leads,2);
  assert.equal(a._evidence.company_id,'A'); assert.equal(a._evidence.actor_id,'a');
});
test('foreign assignee and company overrides are rejected before CRM query', async () => {
  const {tools,db} = toolSuite();
  await assert.rejects(tools.executeTool('resolve_assignee_scope',{user_filter_ids:['b']},ctx),/quyền/);
  await assert.rejects(tools.executeTool('get_company_lead_summary',{company_id:'B'},ctx),/quyền/);
  assert.equal(db.trace.some(q => q.table === 'crm_leads'),false);
});
test('company admin may narrow to same-company colleague, never another company', async () => {
  const {tools} = toolSuite(fixture('sales_admin'));
  assert.equal((await tools.executeTool('get_company_lead_summary',{user_filter_ids:['c']},ctx)).new_leads,1);
  await assert.rejects(tools.executeTool('get_company_lead_summary',{user_filter_ids:['b']},ctx),/phạm vi/);
});
for (const key of ['schedule_id','personal_recipient_user_id','sender_user_id','tenant_id','ctx_user_id','channel_id','company_whitelist','department_whitelist','user_whitelist','bot_schedule_scope']) {
  test('reserved argument cannot become authority: '+key, async () => {
    await assert.rejects(toolSuite().tools.executeTool('get_company_lead_summary',{[key]:'b'},ctx),/Tham số/);
  });
}
test('unknown tool/write tool and ambiguous filters/periods fail closed', async () => {
  const { tools } = toolSuite();
  for (const n of ['manage_ai_bot_schedule','get_user_profile_card','get_org_overview_report_full','invented']) {
    await assert.rejects(tools.executeTool(n,{},ctx),/khóa/);
  }
  for (const a of [{department_id:'d'},{date_from:'2026-01-01'},{time_scope:'all_time'},{days_offset:-1},{user_filter_ids:[]}]) {
    await assert.rejects(tools.executeTool('get_company_lead_summary',a,ctx));
  }
});
test('revocation and tenant/company mismatch are reloaded, including stale ctx', async () => {
  const tables = fixture(), {tools} = toolSuite(tables);
  await tools.executeTool('get_company_lead_summary',{},ctx);
  tables.users[0].is_active=false;
  await assert.rejects(tools.executeTool('get_company_lead_summary',{},ctx),/hoạt động/);
  tables.users[0].is_active=true; tables.companies[0].tenant_id='U';
  await assert.rejects(tools.executeTool('get_company_lead_summary',{}, {...ctx,companies:[{id:'A'}]}),/không khớp/);
});
test('missing actor, disabled tenant, missing tenant binding and empty MCP scope deny', async () => {
  await assert.rejects(toolSuite().tools.executeTool('resolve_time_range',{},{}),/người thực hiện/i);
  const t=fixture(); t.tenants[0].is_active=false;
  await assert.rejects(toolSuite(t).tools.executeTool('resolve_time_range',{},ctx));
  t.tenants[0].is_active=true; t.users[0].tenant_id=null;
  await assert.rejects(toolSuite(t).tools.executeTool('resolve_time_range',{},ctx));
  await assert.rejects(toolSuite().tools.executeTool('resolve_time_range',{}, {...ctx,mcp_allowed_company_ids:[]}));
});
test('only a verified two-member DM may receive private tool results', async () => {
  const t=fixture(), {tools}=toolSuite(t), dm={...ctx,channel_kind:'group',channel_id:'dm'};
  assert.equal((await tools.executeTool('list_companies_in_scope',{},dm))[0].id,'A');
  t.messenger_group_members.push({group_id:'dm',user_id:'b'});
  await assert.rejects(tools.executeTool('list_companies_in_scope',{},dm),/riêng/);
  await assert.rejects(tools.executeTool('list_companies_in_scope',{}, {...ctx,channel_kind:'department',channel_id:'d'}));
});
test('name lookup is bounded to tenant/company and employee self', async () => {
  assert.equal((await toolSuite().tools.executeTool('find_users_by_name',{name:'Bob'},ctx)).matches.length,0);
  assert.equal((await toolSuite().tools.executeTool('find_users_by_name',{name:'Colleague'},ctx)).matches.length,0);
  assert.equal((await toolSuite(fixture('admin')).tools.executeTool('find_users_by_name',{name:'Colleague'},ctx)).matches.length,1);
});
test('errors and server result caps never become zero or undercounted totals', async () => {
  for (const table of ['users','tenants','companies','crm_leads','crm_lead_stage_history']) {
    await assert.rejects(toolSuite(fixture(), { error:q => q.table===table ? {message:'offline'} : null })
      .tools.executeTool('get_company_lead_summary',{},ctx));
  }
  await assert.rejects(toolSuite(fixture('admin'), {cap:{crm_leads:1}}).tools.executeTool('get_company_lead_summary',{},ctx),/SOURCE_INCOMPLETE/);
  const t=fixture(); t.crm_leads=[];
  const zero=await toolSuite(t).tools.executeTool('get_company_lead_summary',{},ctx);
  assert.equal(zero.new_leads,0); assert.equal(zero.open,0);
});
const evidence = load('aiEvidence', { 'node:crypto':require('node:crypto') });
const session = load('aiChatSessionContext', { './aiReportTools':{} });
const verified = data => ({...data,_evidence:{status:'success',tool:'fixture',company_id:'A',
  observed_at:'2026-10-05T00:00:00Z',context:{company_id:'A',time_scope:'today'}}});
function conversation(responses, tool, captured=[]) {
  return load('aiConversation',{
    '../config/supabase':{supabase:{}},'./aiBotSender':{},
    './aiReportTools':{OPENAI_TOOL_DEFINITIONS:[],executeTool:tool},
    './aiChatSessionContext':session,'./aiUserMemory':{},
    './aiToolAuthorization':{SAFE_TOOLS:new Set(['fixture'])},'./aiEvidence':evidence,
  },{fetch:async(_url,req)=>{captured.push(JSON.parse(req.body));return {ok:true,json:async()=>({choices:[{message:responses.shift()}]})};}});
}
const call = args => ({role:'assistant',tool_calls:[{id:'1',function:{name:'fixture',arguments:args}}]});
const run = c => c.runOpenAiToolsLoop({apiKey:'synthetic',system:'test',messages:[],toolCtx:{session_context:{company_id:'A'},last_company_id:'A'}});
test('provider claims without tool evidence never reach the user',async()=>{
  let calls=0;
  const r=await run(conversation([{content:'Có 999 khách và đã được duyệt.'}],async()=>{calls++;}));
  assert.equal(calls,0); assert.doesNotMatch(r.text,/999|đã được duyệt/); assert.match(r.text,/Chưa có/);
});
test('final numbers come from evidence, not provider rewritten claims',async()=>{
  const r=await run(conversation([call('{}'),{content:'Có 999 khách'}],async()=>verified({text:'Có 3 khách.'})));
  assert.match(r.text,/Có 3 khách/); assert.doesNotMatch(r.text,/999/);
});
test('malformed tool arguments cause no call and cannot fall back to broad query',async()=>{
  let called=0;
  const r=await run(conversation([call('{bad'),{content:'999'}],async()=>{called++;}));
  assert.equal(called,0); assert.doesNotMatch(r.text,/999/);
});
test('oversized results remain valid JSON and disclose withheld data',async()=>{
  const captured=[];
  const r=await run(conversation([call('{}'),{content:'total 999'}],async()=>verified({text:'x'.repeat(9000),total:17}),captured));
  const e=JSON.parse(captured[1].messages.find(m=>m.role==='tool').content);
  assert.equal(e.status,'incomplete'); assert.equal(e.truncated,true); assert.ok(e.sha256);
  assert.ok(JSON.stringify(e).length<8000); assert.match(r.text,/giới hạn/); assert.doesNotMatch(r.text,/999/);
});
test('valid report longer than former 1900-character limit is preserved',async()=>{
  const body='x'.repeat(2000)+' TOTAL=17';
  const r=await run(conversation([call('{}'),{content:'done'}],async()=>verified({text:body})));
  assert.match(r.text,/TOTAL=17/); assert.ok(r.text.length>2000);
});
test('failed or unverified tool results do not alter scope or subject memory',()=>{
  const old={company_id:'A',subject_user_id:'a'};
  for(const result of [{error:'denied'}, {}, {company_id:'B',_evidence:{status:'denied'}}]){
    assert.deepEqual(plain(session.updateSessionFromToolResult(old,'fixture',{company_id:'B',user_id:'b'},result)),old);
  }
  const r=session.updateSessionFromToolResult(old,'fixture',{company_id:'B',user_id:'b'},verified({}));
  assert.equal(r.company_id,'A'); assert.equal(r.subject_user_id,'a');
});
test('failed result leaves last_company_id and session unchanged through actual loop',async()=>{
  const r=await run(conversation([call('{"company_id":"B"}'),{content:'OK'}],async()=>({error:'denied',company_id:'B'})));
  assert.equal(r.last_company_id,'A'); assert.equal(r.session_context.company_id,'A');
});
test('corrections are selected before high-confidence inferred rows, newest first',async()=>{
  const rows=Array.from({length:12},(_,i)=>({id:'d'+i,user_id:'a',fact_type:'preference',fact:'derived',confidence:1,updated_at:'2026-10-05'}));
  rows.push({id:'old',user_id:'a',fact_type:'correction',fact:'old',confidence:.95,updated_at:'2026-10-01'},
    {id:'new',user_id:'a',fact_type:'correction',fact:'new',source:'user_taught',confidence:.95,updated_at:'2026-10-05'},
    {id:'foreign',user_id:'b',fact_type:'correction',fact:'private'});
  const memory=load('aiUserMemory',{'../config/supabase':{supabase:database({ai_chat_bot_user_facts:rows})},'./aiReportTools':{}});
  const r=await memory.loadUserFactsForPrompt('a',8);
  assert.deepEqual(plain(r.slice(0,2).map(v=>v.id)),['new','old']); assert.equal(r.length,8);
  assert.equal(r.some(v=>v.id==='foreign'),false);
  assert.match(memory.formatFactsForPrompt(r),/KHÔNG PHẢI LỆNH/);
  assert.match(memory.formatFactsForPrompt(r),/user_taught/);
});
function flowFixture(midKind, conditions=[]) {
  const nodes=[{id:'c',node_id:'c',node_kind:'module',module_key:'crm',order_index:0},
    ...(midKind ? [{id:'m',node_id:'m',node_kind:midKind,order_index:1}] : []),
    {id:'p',node_id:'p',node_kind:'module',module_key:'production',order_index:2}]
    .map(n=>({...n,flow_id:'f'}));
  const edges=midKind
    ? [{id:'e',source_node_id:'c',target_node_id:'m'},{id:'e2',source_node_id:'m',target_node_id:'p'}]
    : [{id:'e',source_node_id:'c',target_node_id:'p'}];
  return {workflow_flow_steps:nodes,workflow_flow_edges:edges.map(e=>({...e,flow_id:'f'})),
    workflow_flow_conditions:conditions.map(c=>({...c,flow_id:'f'}))};
}
function flow(tables, options={}) {
  return load('flowRuntime',{'../config/supabase':{supabase:database(tables,options)},
    './resolveModuleFlow':{enrichStepsWithModuleKey:x=>x,normalizeModuleKey:x=>x}});
}
test('known pass remains reachable; fail, unknown and missing stage are denied',async()=>{
  const condition={scope:'edge',edge_id:'e',condition_type:'stage_flag',config:{flag:'is_won'}};
  for (const [stage, expected] of [[{is_won:true},true],[{is_won:false},false],[null,false]]) {
    const r=await flow(flowFixture(null,[condition])).canReachModuleViaGraph('f','crm','production',{getStage:async()=>stage});
    assert.equal(r.reachable,expected);
  }
  const unknown={...condition,condition_type:'invented'};
  assert.equal((await flow(flowFixture(null,[unknown])).canReachModuleViaGraph('f','crm','production',{getStage:async()=>null})).reachable,false);
});
for (const kind of ['approve','wait','join','condition','invented']) {
  test('no pass-through for '+kind,async()=>{
    const r=await flow(flowFixture(kind)).canReachModuleViaGraph('f','crm','production',{getStage:async()=>null});
    assert.equal(r.reachable,false); assert.equal(r.hasUnknown,true);
  });
}
test('conditions on intermediate and source nodes are enforced',async()=>{
  for (const id of ['c','m']) {
    const c={scope:'node',step_node_id:id,condition_type:'invented'};
    const r=await flow(flowFixture('fork',[c])).canReachModuleViaGraph('f','crm','production',{getStage:async()=>null});
    assert.equal(r.reachable,false);
  }
});
test('missing condition schema and orphan required condition deny instead of treating as empty',async()=>{
  const tables=flowFixture(null);
  await assert.rejects(flow(tables,{error:q=>q.table==='workflow_flow_conditions'?{message:'relation does not exist'}:null})
    .canReachModuleViaGraph('f','crm','production',{}));
  const c={scope:'edge',edge_id:'missing',condition_type:'stage_flag'};
  await assert.rejects(flow(flowFixture(null,[c])).loadGraph('f'),/UNBOUND/);
});
test('production mutation gates ignore shadow permissiveness on unknown or missing graph',async()=>{
  const tables=flowFixture(null);
  const runtime={canReachModuleViaGraph:async()=>({reachable:true,hasUnknown:true,trace:[]}),
    resolveNextModulesViaGraph:async()=>null,isEnforced:()=>false,logRuntimeDecision:async()=>{}};
  const gate=load('resolveModuleFlow',{'../config/supabase':{supabase:database(tables)},'./flowRuntime':runtime});
  assert.equal(await gate.flowAllowsProductionCreate('f'),false);
  assert.equal((await gate.assertProductionHandoffTarget('f')).ok,false);
  runtime.canReachModuleViaGraph=async()=>null;
  assert.equal(await gate.flowAllowsProductionCreate('f'),false);
});
test('action runner cannot bypass approval through onlyNodeId or dryRun',async()=>{
  const graph={nodes:[{node_id:'a',node_kind:'approve'},{node_id:'n',node_kind:'notify'}],
    outEdges:new Map(),condsByEdge:new Map(),condsByNode:new Map()};
  const runner=load('flowActionRunner',{'../config/supabase':{supabase:{}},'./flowRuntime':{loadGraph:async()=>graph}});
  for(const dryRun of [true,false]) await assert.rejects(runner.runFlowActions('f',{dryRun,onlyNodeId:'n'}),/FLOW_GATE_UNVERIFIED/);
});
test('legacy action runner holds external effects even in graphs without approval nodes',async()=>{
  const graph={nodes:[{node_id:'n',node_kind:'notify'}],outEdges:new Map(),condsByEdge:new Map(),condsByNode:new Map()};
  const runner=load('flowActionRunner',{'../config/supabase':{supabase:{}},'./flowRuntime':{loadGraph:async()=>graph}});
  await assert.rejects(runner.runFlowActions('f',{dryRun:false,userId:'a'}),/FLOW_EXECUTION_CONTRACT_PENDING/);
});

test('evidence cannot be published after company move or privilege downgrade',async()=>{
  for(const change of ['company','role','tenant_disabled']){
    const t=fixture('admin'), suite=toolSuite(t);
    const e=(await suite.tools.executeTool('get_company_lead_summary',{},ctx))._evidence;
    if(change==='company'){t.users[0].company_id='B';t.users[0].tenant_id='U';}
    if(change==='role')t.users[0].role='employee';
    if(change==='tenant_disabled')t.tenants[0].is_active=false;
    await assert.rejects(suite.guard.revalidateEvidence([e],ctx));
  }
});
test('effective filtered scope and normalized default/custom period are evidenced',async()=>{
  const suite=toolSuite(fixture('admin'));
  const filtered=await suite.tools.executeTool('get_company_lead_summary',{user_filter_ids:['c']},ctx);
  assert.equal(filtered._evidence.scope.company_wide,false);
  assert.deepEqual(plain(filtered._evidence.scope.assignee_ids),['c']);
  const s=session.updateSessionFromToolResult({time_scope:'last_month',subject_name:'Old'},'get_company_lead_summary',{},filtered);
  assert.equal(s.time_scope,'today'); assert.equal(s.subject_user_id,'c'); assert.equal(s.subject_name,null);
  const custom=await suite.tools.executeTool('resolve_time_range',{scope:'custom',days_offset:10},ctx);
  const c=session.updateSessionFromToolResult(s,'resolve_time_range',{},custom);
  assert.equal(c.time_scope,'custom'); assert.equal(c.days_offset,10);
});
test('public flow gates deny DB error from the first read',async()=>{
  const broken={from(){throw Error('PRIVATE_UPSTREAM_DETAIL');}};
  const gate=load('resolveModuleFlow',{'../config/supabase':{supabase:broken}});
  assert.equal(await gate.flowAllowsProductionCreate('f'),false);
  const result=await gate.assertProductionHandoffTarget('f');
  assert.equal(result.ok,false); assert.doesNotMatch(result.error,/PRIVATE/);
});
test('callers of flow gates do not swallow thrown source errors and continue writes',async()=>{
  // Execute the exact integration boundary without importing unrelated production adapters.
  const cases=[
    ['helpers/autoDealWonProject.js','  try {\n    const allowsSx =','\n  const firstStage =','flowAllowsProductionCreate',
      {flowId:'f',deal:{id:'d'}}],
    ['helpers/vcHandoverCore.js','  try {\n','\n  const sxHandoverPipelineStageId =','assertProductionHandoffTarget',{}],
    ['routes/vcHandover.js','    try {\n','\n    // Ngày lịch từ ĐÚNG','assertProductionHandoffTarget',{}],
  ];
  // Cover the auto-create boundary and both handoff catch bodies directly.
  const auto=fs.readFileSync(path.join(root,'src',cases[0][0]),'utf8').replace(/\r\n/g,'\n');
  const a=auto.indexOf(cases[0][1]),b=auto.indexOf(cases[0][2],a);
  assert.ok(a>=0&&b>a);
  const runAuto=new Function('flowAllowsProductionCreate','return async function(){const flowId="f",deal={id:"d"};'
    +auto.slice(a,b)+';return "DOWNSTREAM";}')(()=>{throw Error('offline');});
  assert.equal((await runAuto()).ok,false);
  const core=fs.readFileSync(path.join(root,'src/helpers/vcHandoverCore.js'),'utf8').replace(/\r\n/g,'\n');
  const ca=core.indexOf('  } catch (gateErr) {'), cb=core.indexOf('\n  }\n',ca);
  const coreCatch=core.slice(ca+'  } catch (gateErr) {'.length,cb);
  const e=Error('offline');
  assert.throws(()=>new Function('gateErr',coreCatch)(e));
  assert.equal(e.code,'FLOW_HANDOFF_BLOCKED');
  const route=fs.readFileSync(path.join(root,'src/routes/vcHandover.js'),'utf8').replace(/\r\n/g,'\n');
  const ra=route.indexOf('    } catch (gateErr) {'),rb=route.indexOf('\n    }\n',ra);
  let status;
  const response={status(s){status=s;return this;},json(v){return v;}};
  const result=new Function('gateErr','res',route.slice(ra+'    } catch (gateErr) {'.length,rb)+';return "DOWNSTREAM";')(Error('offline'),response);
  assert.equal(status,503); assert.equal(result.code,'FLOW_HANDOFF_BLOCKED');
});
test('memory source errors are explicit for tool while prompt may omit unavailable facts',async()=>{
  for(const source of ['correction','derived']){
    const db=database({ai_chat_bot_user_facts:[]});
    let n=0;
    const broken={from(table){n++;if(n===(source==='correction'?1:2)){
      const q={select(){return q;},eq(){return q;},neq(){return q;},order(){return q;},limit(){return q;},
        then(resolve){return Promise.resolve({error:{message:'PRIVATE_UPSTREAM_DETAIL'}}).then(resolve);}};return q;
    }return db.from(table);}};
    const memory=load('aiUserMemory',{'../config/supabase':{supabase:broken},'./aiReportTools':{}});
    await assert.rejects(memory.getUserLearnedFacts('a'),/MEMORY_SOURCE_UNAVAILABLE/);
  }
});
test('upstream error details never reach deterministic chat reply',async()=>{
  const result=await run(conversation([call('{}'),{content:'done'}],async()=>{throw Error('PRIVATE_UPSTREAM_DETAIL');}));
  assert.doesNotMatch(result.text,/PRIVATE_UPSTREAM_DETAIL/); assert.match(result.text,/bằng chứng/);
});
function mcp(suite){
  const audit={
    MCP_REASON:{CONTEXT_INVALID:'CONTEXT_INVALID',CONTEXT_MISSING:'CONTEXT_MISSING',CAPABILITY_DENIED:'CAPABILITY_DENIED',ALLOWED:'ALLOWED'},
    createMcpTraceId:()=> 'fixture',sanitizeMcpArgs:x=>x,writeMcpToolAudit:async()=>{},
    mcpDeny:(code,message,status)=>Object.assign(Error(message),{code,reasonCode:code,status}),
  };
  return load('mcpGateway',{
    '../config/supabase':{supabase:suite.db},'./adminRole':{isAdminLike:u=>u.role==='admin',isSystemAdmin:()=>false},
    './aiReportTools':suite.tools,'./aiToolAuthorization':suite.guard,
    './mcpCrmReadBridge':{MCP_CRM_READ_TOOL_SET:new Set(),getMcpCrmReadTools:()=>[]},
    './mcpAdsBridge':{MCP_ADS_TOOL_SET:new Set(),getMcpAdsTools:()=>[]},'./mcpAudit':audit,
  });
}
test('MCP report actor is bound to API key, headers cannot impersonate a colleague',async()=>{
  const gateway=mcp(toolSuite());
  const key={default_assigned_to:'a',company_id:'A',mcp_scopes:['reports']};
  await assert.rejects(gateway.resolveMcpActAsUser({headers:{'x-user-id':'b'},apiKey:key}),/danh tính/);
  await assert.rejects(gateway.resolveMcpActAsUser({headers:{'x-user-id':'a'},apiKey:{company_id:'A'}}),/danh tính/);
  const r=await gateway.callMcpReportTool('get_company_lead_summary',{}, {headers:{},apiKey:key});
  assert.equal(r.company_id,'A');assert.equal(r.new_leads,1);
  const names=gateway.getMcpReportTools(key).map(x=>x.name);
  assert.ok(names.includes('get_company_lead_summary'));
  assert.ok(!names.includes('get_org_overview_report_full'));
});
test('MCP full report cannot bypass the closed registry',async()=>{
  const gateway=mcp(toolSuite());
  await assert.rejects(gateway.callMcpReportTool('get_org_overview_report_full',{},
    {headers:{},apiKey:{default_assigned_to:'a',company_id:'A',mcp_scopes:['reports']}}),/khóa/);
});
test('confirmed context tombstones clear stale fields when merged for persistence',()=>{
  const stored={company_id:'A',subject_name:'Old',subject_user_id:'old',date_from:'2026-01-01',date_to:'2026-01-31'};
  const result=verified({});
  result._evidence.context={company_id:'A',time_scope:'today',days_offset:0,assignee_ids:null};
  const saved={...stored,...session.updateSessionFromToolResult(stored,'get_company_lead_summary',{},result)};
  assert.equal(saved.subject_name,null);assert.equal(saved.subject_user_id,null);
  assert.equal(saved.date_from,null);assert.equal(saved.date_to,null);assert.equal(saved.time_scope,'today');
});
test('company lookup does not silently reset custom period offset',async()=>{
  const result=await toolSuite().tools.executeTool('list_companies_in_scope',{},ctx);
  const next=session.updateSessionFromToolResult({time_scope:'custom',days_offset:10},'list_companies_in_scope',{},result);
  assert.equal(next.days_offset,10);assert.equal(next.time_scope,'custom');
});


