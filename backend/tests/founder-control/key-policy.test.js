const test=require('node:test'),assert=require('node:assert/strict');
const {founderKeyManagement}=require('../../src/helpers/founderKeyPolicy');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('API auth labels UUID path and access secret without accepting refresh as access',async()=>{
 const row={id:'00000000-0000-0000-0000-000000000003',key:'synthetic-access',refresh_token:'synthetic-refresh',active:true,company_id:'00000000-0000-0000-0000-000000000001'};
 const db={from(){return {select(){return this},eq(column,value){this.column=column;this.value=value;return this},async maybeSingle(){return {data:row[this.column]===this.value?row:null,error:null}}}}};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/middleware/apiKeyAuth.js'),'utf8'),{module:mod,exports:mod.exports,require:name=>name==='../config/supabase'?{supabase:db}:name==='fs'?{existsSync:()=>false}:require(name),__dirname:path.join(__dirname,'../../src/middleware'),console});
 async function auth(value){const req={headers:{authorization:'Bearer '+value},query:{},params:{}};let next=false,status=null;
  const res={status(n){status=n;return this},json(){return this}};await mod.exports.apiKeyAuth(req,res,()=>{next=true});return {req,next,status};}
 const uuid=await auth(row.id),secret=await auth(row.key),refresh=await auth(row.refresh_token);
 assert.equal(uuid.next,true);assert.equal(uuid.req.apiKeyCredential,'UUID_PATH');
 assert.equal(secret.req.apiKeyCredential,'SECRET');assert.match(secret.req.apiKeyCredentialDigest,/^[a-f0-9]{64}$/);
 assert.equal(refresh.next,false);assert.equal(refresh.status,401);
});
test('manager keeps old capabilities, cannot grant/manage/rotate Founder delegation',()=>{assert.equal(founderKeyManagement('manager',['crm_read']).ok,true);assert.equal(founderKeyManagement('manager',[],['founder_read']).status,403);assert.equal(founderKeyManagement('manager',['founder_write']).status,403);assert.equal(founderKeyManagement('manager',['founder_read'],['crm_read']).status,403)});
test('Founder scopes require a dedicated key; only current admin grants',()=>{assert.equal(founderKeyManagement('admin',[],['founder_read','founder_write']).ok,true);assert.equal(founderKeyManagement('ecosystem_admin',[],['founder_read']).ok,true);assert.equal(founderKeyManagement('admin',[],['founder_read','crm_read']).status,400);assert.equal(founderKeyManagement('sales_admin',[],['founder_write']).status,403)});
