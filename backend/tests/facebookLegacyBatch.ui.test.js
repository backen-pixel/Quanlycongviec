'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../frontend/src/pages/FacebookPage.jsx'),'utf8');
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
