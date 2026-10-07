const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {TOOL_SET,getTools}=require('../../src/modules/founderControl/contracts');
function gateway() {
 const audits=[];let called=null;
 const requireStub=name=>{
  if(name==='../config/supabase')return {supabase:{from(){throw new Error('Legacy actor path must not run')}}};
  if(name==='./mcpFounderBridge')return {MCP_FOUNDER_TOOL_SET:TOOL_SET,getMcpFounderTools:key=>getTools(key),callMcpFounderTool:async(name,args,req)=>{called={name,args,req};return {scope:{tenant_id:'tenant'},data:{execution:'NOT_EXECUTED'}}}};
  if(name==='./adminRole')return {isAdminLike:()=>false,isSystemAdmin:()=>false};
  if(name==='./aiReportTools')return {OPENAI_TOOL_DEFINITIONS:[],executeTool:()=>{throw new Error('Legacy execution')}};
  if(name==='./mcpCrmReadBridge')return {MCP_CRM_READ_TOOL_SET:new Set(),getMcpCrmReadTools:()=>[]};
  if(name==='./mcpAdsBridge')return {MCP_ADS_TOOL_SET:new Set(),getMcpAdsTools:()=>[]};
  if(name==='./mcpAudit')return {MCP_REASON:{ALLOWED:'ALLOWED',WRITE_NOT_ALLOWED:'WRITE_NOT_ALLOWED',TOOL_NOT_REGISTERED:'TOOL_NOT_REGISTERED'},createMcpTraceId:()=> 'test-trace',sanitizeMcpArgs:()=>({}),writeMcpToolAudit:async(req,args)=>audits.push(args),mcpDeny:(code,msg,status)=>Object.assign(new Error(msg),{status,reasonCode:code})};
  throw new Error('Unexpected import '+name);
 };
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/helpers/mcpGateway.js'),'utf8'),{require:requireStub,module,exports:module.exports,console});
 return {api:module.exports,audits,called:()=>called};
}
test('new tools require access secret even when Founder scope is present',()=>{const f=gateway();assert.ok(!f.api.getMcpReportTools({mcp_scopes:['reports','crm_read']}).some(t=>TOOL_SET.has(t.name)));assert.equal(f.api.getMcpReportTools({mcp_scopes:['founder_read'],credential:'UUID_PATH'}).filter(t=>TOOL_SET.has(t.name)).length,0);assert.equal(f.api.getMcpReportTools({mcp_scopes:['founder_read'],credential:'SECRET'}).filter(t=>TOOL_SET.has(t.name)).length,3)});
test('new gateway delegates raw args to stricter backend and writes shared audit',async()=>{const f=gateway();const req={apiKey:{id:'test-key',credential:'SECRET',default_assigned_to:'test-actor',mcp_scopes:['founder_write']},headers:{}};const args={company_id:'test-company',request_id:'test-request'};await f.api.callMcpReportTool('create_founder_objective',args,req);assert.equal(f.called().args,args);assert.equal(f.audits[0].decision,'allow');assert.equal(f.audits[0].userId,'test-actor')});
test('unknown write tool remains denied',async()=>{const f=gateway();await assert.rejects(f.api.callMcpReportTool('delete_all_ads',{}, {headers:{},apiKey:{}}),e=>e.status===403);assert.equal(f.called(),null);assert.equal(f.audits[0].decision,'deny')});
