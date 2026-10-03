'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../frontend/src/pages/FacebookPage.jsx'),'utf8');
const handler=source.slice(source.indexOf('  const batchCreateLeads = async '),source.indexOf('  // Batch: quét SĐT + thông tin',source.indexOf('  const batchCreateLeads = async ')));
function setup(){const states=[],requests=[],alerts=[],loads=[],scope={loaded:true,key:'actor/company',version:0};let answer={ok:true,status:200,json:async()=>({total:2,processed:2,skipped:0})};
 const c={API:'/synthetic',user:{id:'actor',company_id:'company'},toolCompanyId:'company',contacts:[{id:'a'},{id:'b'},{id:'already',lead_id:'lead'}],
  contactScopeRef:{current:scope},contactMountedRef:{current:true},batchRunRef:{current:0},
  hdr:()=>({Authorization:'synthetic'}),alert:message=>alerts.push(message),confirm:()=>true,setBatchStatus:state=>{states.push(state);c.batchStatus=state;},
  load:append=>loads.push(append),fetch:async(url,options)=>{requests.push({url,...options});return typeof answer==='function'?answer():answer;},
 };
 vm.createContext(c);vm.runInContext(handler+'\nglobalThis.runBatch = batchCreateLeads;',c);
 return{c,states,requests,alerts,loads,run:ids=>c.runBatch(ids),reply:value=>{answer=value;}};}
test('actual UI sends exactly the confirmed visible IDs and company',async()=>{const h=setup();await h.run();
 assert.deepEqual(JSON.parse(h.requests[0].body),{company_id:'company',contact_ids:['a','b']});assert.equal(h.requests[0].headers['Content-Type'],'application/json');
 assert.equal(h.states.at(-1).result.processed,2);assert.deepEqual(h.loads,[false]);});
test('UI caps the confirmed set at 500 rather than an unannounced server scan',async()=>{const h=setup();h.c.contacts=Array.from({length:600},(_,i)=>({id:String(i)}));
 await h.run();assert.equal(JSON.parse(h.requests[0].body).contact_ids.length,500);});
test('unloaded current scope and absent company do not dispatch',async()=>{for(const kind of ['unloaded','company']){
 const h=setup();if(kind==='unloaded')h.c.contactScopeRef.current.loaded=false;else{h.c.toolCompanyId=null;h.c.user.company_id=null;}
 await h.run();assert.equal(h.requests.length,0);assert.equal(h.alerts.length,1);}});
test('HTTP error is visible with partial progress, followed by a same-scope reload',async()=>{const h=setup();h.reply({ok:false,status:409,json:async()=>({total:2,processed:1,failed:1,unprocessed:0})});
 await h.run();assert.ok(h.states.at(-1).result.error.includes('409'));assert.equal(h.states.at(-1).result.processed,1);assert.deepEqual(h.loads,[false]);});
test('network uncertainty tells the user to reconcile rather than resubmit as untouched',async()=>{const h=setup();h.reply(()=>{throw Error('synthetic network');});
 await h.run();assert.equal(h.states.at(-1).result.reconciliation_required,true);assert.equal(h.loads.length,0);});
for(const change of ['actor/company','unmount','new run']){
 test('delayed batch result is discarded after '+change,async()=>{const h=setup();let release;
  h.reply(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run();await Promise.resolve();
  if(change==='actor/company')h.c.contactScopeRef.current={loaded:false};else if(change==='unmount')h.c.contactMountedRef.current=false;else h.c.batchRunRef.current++;
  release({ok:true,status:200,json:async()=>({processed:1})});await pending;assert.equal(h.states.length,1);assert.equal(h.loads.length,0);});
}
test('actual contact loader ignores response from a previous scope before enabling batch',async()=>{
 const start=source.indexOf('  const load = useCallback((append = false) => {',source.indexOf('function ContactsTab('));
 const end=source.indexOf('  // Load DISTINCT',start),code=source.slice(start,end);let release;
 const rows=[],oldScope={loaded:false,request:0},c={useCallback:fn=>fn,contactScopeRef:{current:oldScope},contactMountedRef:{current:true},
  search:'',filter:'all',sourceFilter:'',meta:{nextOffset:0},sortContacts:x=>x,contacts:[],fbCompanyQs:'company_id=A',contactScopeKey:'A',
  URLSearchParams,API:'/synthetic',hdr:()=>({}),fetch:()=>new Promise(resolve=>{release=resolve;}),fbActivityTs:()=>0,setContacts:value=>rows.push(value),setMeta:()=>{}};
 vm.createContext(c);vm.runInContext(code+'\nglobalThis.runLoad=load;',c);c.runLoad();
 const current={loaded:false,request:0};c.contactScopeRef.current=current;
 release({ok:true,json:async()=>({data:[{id:'foreign'}]})});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(rows.length,0);assert.equal(current.loaded,false);
});
test('partial error followed by reload of a mapped contact can explicitly repair the original failed ID',async()=>{
 const h=setup();h.reply({ok:false,status:503,json:async()=>({total:2,processed:1,failed:1,unprocessed:0,reconciliation_required:true,
  results:[{contact_id:'a',status:'linked'},{contact_id:'b',status:'reconciliation_required'}]})});
 await h.run();const retry=h.states.at(-1).retryContactIds;assert.deepEqual(Array.from(retry),['b']);
 h.c.contacts=[{id:'a',lead_id:'leadA'},{id:'b',lead_id:'leadB'}];h.reply({ok:true,status:200,json:async()=>({total:1,processed:1})});
 await h.run(retry);assert.deepEqual(JSON.parse(h.requests[1].body),{company_id:'company',contact_ids:['b']});assert.equal(h.states.at(-1).result.processed,1);
});
test('retry cannot reuse a previous scope even when the company is selected again',async()=>{
 const h=setup();h.reply(()=>{throw Error('synthetic network');});await h.run();const retry=h.states.at(-1).retryContactIds;
 h.c.contactScopeRef.current={loaded:true,key:'actor/company',version:2};await h.run(retry);assert.equal(h.requests.length,1);assert.equal(h.alerts.length,1);
});
