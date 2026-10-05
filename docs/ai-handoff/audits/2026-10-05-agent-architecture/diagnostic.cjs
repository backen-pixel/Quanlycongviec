'use strict';
// Offline diagnostics: execute repository code in VM with synthetic ports only.
// An OBSERVED result reproduces a risk; it is not a passing release test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..');
const results=[],sourceFileSha256={};
function load(rel,deps={},globals={}){
 const module={exports:{}};
 const source=fs.readFileSync(path.join(root,rel),'utf8').replace(/\r\n/g,'\n');
 sourceFileSha256[rel]=crypto.createHash('sha256').update(source).digest('hex');
 vm.runInNewContext(source,{
  module,exports:module.exports,console:{info(){},warn(){},error(){}},Buffer,URL,Date,Intl,setTimeout,clearTimeout,
  process:{env:{}},
  fetch:()=>{throw Error('Network prohibited');},
  require:name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('Undeclared dependency '+name);},
  ...globals
 },{filename:rel,timeout:2000});
 return module.exports;
}
function queryDb(tables,trace=[]){
 return {from(table){
  if(!Object.hasOwn(tables,table))throw Error('Unexpected table '+table);
  let rows=tables[table].map(x=>({...x})),single=false,head=false;
  const q={select(_fields,opts){head=opts?.head===true;return q;},eq(k,v){trace.push({table,filter:k,value:v});rows=rows.filter(r=>r[k]===v);return q;},
   in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},not(){return q;},
   order(){return q;},limit(n){rows=rows.slice(0,n);return q;},gte(){return q;},lte(){return q;},is(k,v){rows=rows.filter(r=>r[k]===v);return q;},
   maybeSingle(){single=true;return q;},then(resolve,reject){return Promise.resolve({data:single?(rows[0]||null):rows,error:null,...(head?{count:rows.length}:{})}).then(resolve,reject);}
  };return q;
 }};
}
async function probe(id,fn){try{results.push({id,status:'OBSERVED',...await fn()});}catch(e){results.push({id,status:'DIAGNOSTIC_FAILED',error:e.message});process.exitCode=1;}}
(async()=>{
 const session=load('backend/src/helpers/aiChatSessionContext.js',{'./aiReportTools':{}});
 const tools=load('backend/src/helpers/aiReportTools.js',{
  '../config/supabase':{supabase:{from(){throw Error('DB must not be used in this probe');}}},
  '../config':{},'./aiChatSessionContext':session,'./crmPipelineSla':{}
 });
 await probe('P1_MODEL_SCOPE_OVERRIDE',async()=>{
  const r=await tools.executeTool('resolve_assignee_scope',{user_filter_ids:['employee-B']},
   {sender_user_id:'employee-A',personal_recipient_user_id:'employee-A',companies:[{id:'company-A'}]});
  assert.deepEqual(Array.from(r.assignee_ids),['employee-B']);
  return {trustedActor:'employee-A',modelRequested:'employee-B',effectiveAssignees:r.assignee_ids};
 });
 await probe('P1B_FOREIGN_COMPANY_SUMMARY',async()=>{
  const trace=[],t=load('backend/src/helpers/aiReportTools.js',{
   '../config/supabase':{supabase:queryDb({companies:[{id:'company-B',name:'Synthetic B'}],
    crm_leads:[{id:'lead-B',company_id:'company-B',assigned_to:'employee-B',type:'lead',actual_close_date:null}],crm_lead_stage_history:[]},trace)},
   '../config':{},'./aiChatSessionContext':session,'./crmPipelineSla':{}
  });
  const r=await t.executeTool('get_company_lead_summary',{company_id:'company-B',user_filter_ids:['employee-B'],time_scope:'today'},
   {sender_user_id:'employee-A',personal_recipient_user_id:'employee-A',companies:[{id:'company-A'}]});
  assert.equal(r.company_id,'company-B');assert.equal(r.new_leads,1);
  return {actorCompany:'company-A',returnedCompany:r.company_id,foreignSyntheticLeads:r.new_leads};
 });
 function conversation(fetchImpl,executeTool){
  return load('backend/src/helpers/aiConversation.js',{
   '../config/supabase':{supabase:{}},'./aiBotSender':{},'./aiReportTools':{OPENAI_TOOL_DEFINITIONS:[],executeTool},
   './aiChatSessionContext':session,'./aiUserMemory':{}
  },{fetch:fetchImpl});
 }
 await probe('P2_UNGROUNDED_FINAL_ACCEPTED',async()=>{
  let called=0;
  const c=conversation(async()=>({ok:true,json:async()=>({choices:[{message:{content:'Hôm nay có 999 khách.'}}]})}),async()=>{called++;});
  const r=await c.runOpenAiToolsLoop({apiKey:'synthetic',system:'Mọi số liệu phải lấy từ tool.',messages:[{role:'user',content:'Có bao nhiêu khách hôm nay?'}],toolCtx:{}});
  assert.equal(called,0);assert.match(r.text,/999/);
  return {toolCalls:called,acceptedText:r.text};
 });
 await probe('P3_TOOL_JSON_CUT_MID_VALUE',async()=>{
  let call=0,cut='';
  const c=conversation(async(_url,req)=>{
   call++;
   if(call===1)return {ok:true,json:async()=>({choices:[{message:{role:'assistant',tool_calls:[{id:'c1',function:{name:'fixture',arguments:'{}'}}]}}]})};
   cut=JSON.parse(req.body).messages.find(m=>m.role==='tool').content;
   return {ok:true,json:async()=>({choices:[{message:{content:'fixture completed'}}]})};
  },async()=>({text:'x'.repeat(9000),total:1}));
  await c.runOpenAiToolsLoop({apiKey:'synthetic',system:'fixture',messages:[],toolCtx:{}});
  let valid=true;try{JSON.parse(cut);}catch{valid=false;}
  assert.equal(cut.length,8000);assert.equal(valid,false);
  return {deliveredCharacters:cut.length,validJson:valid};
 });
 await probe('P4_UNKNOWN_AND_APPROVAL_PASS_THROUGH',async()=>{
  const nodes=[{id:'c',node_id:'c',node_kind:'module',module_key:'crm',order_index:0},
   {id:'a',node_id:'a',node_kind:'approve',order_index:1},
   {id:'p',node_id:'p',node_kind:'module',module_key:'production',order_index:2}].map(x=>({...x,flow_id:'flow-fixture'}));
  const edges=[{id:'e1',flow_id:'flow-fixture',source_node_id:'c',target_node_id:'a',order_index:0},
   {id:'e2',flow_id:'flow-fixture',source_node_id:'a',target_node_id:'p',order_index:0}];
  const conds=[{flow_id:'flow-fixture',scope:'edge',edge_id:'e1',is_required:true,condition_type:'unrecognized_required_condition',config:{}}];
  const f=load('backend/src/helpers/flowRuntime.js',{
   '../config/supabase':{supabase:queryDb({workflow_flow_steps:nodes,workflow_flow_edges:edges,workflow_flow_conditions:conds})},
   './resolveModuleFlow':{enrichStepsWithModuleKey:x=>x,normalizeModuleKey:x=>x}
  });
  const r=await f.canReachModuleViaGraph('flow-fixture','crm','production',{getStage:async()=>null});
  assert.equal(r.reachable,true);assert.equal(r.hasUnknown,true);
  return {reachable:r.reachable,hasUnknown:r.hasUnknown,trace:r.trace};
 });
 await probe('P5_FAILED_TOOL_PERSISTS_SCOPE',async()=>{
  const r=session.updateSessionFromToolResult({company_id:'company-A'},'get_company_lead_summary',
   {company_id:'company-B'},{error:'forbidden'});
  assert.equal(r.company_id,'company-B');
  return {priorCompany:'company-A',failedRequestedCompany:'company-B',persistedCompany:r.company_id};
 });
 await probe('P6_CORRECTION_LOST_BEFORE_PRIORITY_SORT',async()=>{
  const derived=Array.from({length:12},(_,i)=>({id:'d'+i,user_id:'u',fact_type:'preference',fact:'inferred '+i,confidence:1}));
  const newer={id:'new',user_id:'u',fact_type:'correction',fact:'new correction',confidence:.95};
  const older={id:'old',user_id:'u',fact_type:'correction',fact:'important older correction',confidence:.95};
  const mem=load('backend/src/helpers/aiUserMemory.js',{
   '../config/supabase':{supabase:queryDb({ai_chat_bot_user_facts:[...derived,newer,older]})},'./aiReportTools':{}
  });
  const r=await mem.loadUserFactsForPrompt('u');
  assert.equal(r.some(x=>x.id==='old'),false);assert.equal(r[0].id,'new');
  return {correctionsAvailable:2,correctionsReturned:r.filter(x=>x.fact_type==='correction').length,returned:r.length};
 });
 const output={sourceCommitLabel:'679cb9266ecb87c560421f3f6fc3c3e31b50b831',sourceFileSha256,mode:'offline-vm-synthetic-ports',results};
 fs.writeFileSync(path.join(__dirname,'diagnostic-results.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(output,null,2));
})();
