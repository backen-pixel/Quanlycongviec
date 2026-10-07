import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { synthetic,company } from './fixture.js';
test('Skybridge HTTP MCP: authenticated tools/views and error states against synthetic backend',async()=>{
 const calls: { name:string; arguments:Record<string,unknown> }[]=[];
 const backend=createServer(async(req,res)=>{
   const token=req.headers.authorization;
   if(token!=='Bearer synthetic-read-key'){res.writeHead(401).end('{}');return}
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/mcp/tools'){res.end(JSON.stringify({tools:[{name:'get_founder_overview'}]}));return}
   let text='';for await(const c of req)text+=c;
   const body=JSON.parse(text);calls.push(body);
   if(body.arguments.company_id!==company){res.writeHead(403).end('{}');return}
   res.end(JSON.stringify({content:[{type:'text',text:JSON.stringify(synthetic)}],structuredContent:synthetic}));
 });
 backend.listen(0,'127.0.0.1');await once(backend,'listening');
 const addr=backend.address();assert.ok(addr&&typeof addr==='object');
 const child=fork(new URL('../dist/index.js',import.meta.url),[],{env:{...process.env,__PORT:'0',FOUNDER_BACKEND_URL:`http://127.0.0.1:${addr.port}`},stdio:['ignore','pipe','pipe','ipc']});
 child.stdout?.resume();let stderr='';child.stderr?.on('data',c=>{stderr+=String(c).slice(0,1000)});
 try{
   const port=await new Promise<number>((resolve,reject)=>{
     const timer=setTimeout(()=>reject(new Error('Skybridge startup timeout: '+stderr)),15000);
     child.on('message',(m:unknown)=>{const x=m as {type:string;port:number};if(x.type==='skybridge:listening'){clearTimeout(timer);resolve(x.port)}});
     child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Skybridge exited ${code}: ${stderr}`))});
   });
   let id=0;
   async function rpc(method:string,params:object={},token?:string){
     const r=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
     const text=await r.text();const data=text.startsWith('event:')||text.startsWith('data:')?JSON.parse(text.split('\n').find(s=>s.startsWith('data:'))!.slice(5)):JSON.parse(text);return {r,data};
   }
   const denied=await rpc('tools/list');assert.equal(denied.r.status,401);
   const invalid=await rpc('tools/list',{},'synthetic-invalid');assert.equal(invalid.r.status,401);
   const listed=await rpc('tools/list',{},'synthetic-read-key');assert.equal(listed.r.status,200);assert.equal(listed.data.result.tools.length,5);
   const tool=listed.data.result.tools.find((t:{name:string})=>t.name==='get_founder_overview');assert.ok(tool._meta);assert.ok(JSON.stringify(tool._meta).includes('founder-control'));
   const args={company_id:company,window_start:'2026-10-07T00:00:00+07:00',window_end:'2026-10-08T00:00:00+07:00'};
   const called=await rpc('tools/call',{name:'get_founder_overview',arguments:args},'synthetic-read-key');assert.equal(called.data.result.structuredContent.synthetic,true);assert.equal(called.data.result.structuredContent.data.metrics.attribution_events.value,null);
   const injected=await rpc('tools/call',{name:'get_founder_overview',arguments:{...args,role:'admin'}},'synthetic-read-key');assert.equal(injected.data.result.isError,true);assert.equal(calls.length,1);
   const other=await rpc('tools/call',{name:'get_founder_overview',arguments:{...args,company_id:'00000000-0000-4000-8000-000000000007'}},'synthetic-read-key');assert.equal(other.data.result.isError,true);assert.equal(other.data.result.structuredContent.outcome,'ERROR');
   const write=await rpc('tools/call',{name:'record_founder_decision',arguments:{company_id:company,request_id:'sample-request',proposal_id:company,expected_version:1,expected_digest:'0'.repeat(64),decision:'APPROVE',reason:'Synthetic'}},'synthetic-read-key');assert.ok(write.data.result?.isError||write.data.error);assert.equal(calls.length,2);
 }finally{child.kill('SIGTERM');await new Promise<void>(resolve=>backend.close(()=>resolve()))}
});
