'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {matchingFields,createLegacyReview}=require('../src/modules/marketingAutomation/facebookLegacyReview');
test('legacy contact checks use current exact contacts without searching by phone',()=>{
 assert.deepEqual(matchingFields({phone:'+84901234567',email:'VPT@example.com'},{customerPhone:'0901 234 567',customerEmail:'vpt@example.com'}),['phone','email']);
 assert.deepEqual(matchingFields({phone:'',email:'vpt@example.com'},{customerPhone:'0901234567',leadEmail:'vpt@example.com'}),['email']);
});
for(const [name,provider,crm] of [
 ['empty contacts',{phone:'',email:''},{}],['invalid provider phone',{phone:'123'},{customerPhone:'0901234567'}],
 ['mismatched phone',{phone:'0901234567'},{customerPhone:'0901234568'}],
 ['one matching and one conflicting CRM phone',{phone:'0901234567'},{leadPhone:'0901234567',customerPhone:'0901234568'}],
 ['matching phone but conflicting email',{phone:'0901234567',email:'one@example.com'},{customerPhone:'0901234567',customerEmail:'two@example.com'}],
 ['malformed CRM field',{phone:'0901234567'},{customerPhone:'0901234567',leadEmail:42}],
 ['disjoint fields',{phone:'0901234567'},{customerEmail:'vpt@example.com'}],
])test('legacy review rejects '+name,()=>assert.throws(()=>matchingFields(provider,crm),e=>['CONTACT_CONFLICT','CONTACT_UNVERIFIED'].includes(e.code)));
function fixture(){
 const actor=randomUUID(),company=randomUUID(),receipt=randomUUID(),proposal=randomUUID();
 const env={VPT_FB_LEAD_INTAKE_ADMIN:'1',VPT_FB_LEGACY_REVIEW:'1',VPT_FB_LEAD_INTAKE_PAGES:'123',VPT_META_GRAPH_VERSION:'v24.0'};
 const context={companyId:company,receipt:{id:receipt,page_id:'123',form_id:'456',leadgen_id:'789'},receiptVersion:'a'.repeat(32),contextVersion:'b'.repeat(32),contacts:{customerPhone:'0901234567'},providerContext:{pageToken:'private-page-token',accountToken:'private-ad-token'}};
 const proposalResult={companyId:company,receiptId:receipt,proposalId:proposal,target:{leadId:randomUUID()},matchedFields:['phone'],sourceKind:'PAID'};
 const calls=[],sourceCalls=[];let primary=true;
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='marketing_fb_legacy_context'?context:name==='marketing_fb_legacy_prepare'?proposalResult:{accepted:true,companyId:company,receiptId:receipt}}}};
 let reader=async args=>{sourceCalls.push(args);return{proof:{source:'PAID'},contact:{phone:'+84901234567',email:''}}};
 const handle=createLegacyReview({db,env,isPrimary:()=>primary,readSource:(...args)=>reader(...args)});
 const request={user:{userId:actor},body:{companyId:company,receiptId:receipt,expectedVersion:context.receiptVersion}};
 const res=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(data){this.body=data;return this}});
 return {actor,company,receipt,proposal,env,context,calls,sourceCalls,db,request,handle,res,setPrimary:x=>primary=x,setReader:x=>reader=x};
}
test('preview uses trusted provider context, revalidates through storage and returns no credentials/contact',async()=>{
 const f=fixture(),r=f.res();await f.handle(f.request,r,'preview');assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.deepEqual(f.calls.map(x=>x.name),['marketing_fb_legacy_context','marketing_fb_legacy_prepare']);
 assert.equal(f.sourceCalls[0].context.pageToken,'private-page-token');assert.deepEqual(f.calls[1].args.p_matches,['phone']);
 assert.equal(JSON.stringify(r.body).includes('token'),false);assert.equal(JSON.stringify(r.body).includes('0901234567'),false);
});
test('client cannot supply provider proof, match flag, candidate or actor',async()=>{
 for(const key of ['proof','contact','matchedFields','target','actor']){const f=fixture(),r=f.res();f.request.body[key]='injected';await f.handle(f.request,r,'preview');assert.equal(r.code,400);assert.equal(f.calls.length,0)}
});
test('flags and primary ownership gate all legacy calls',async()=>{
 for(const name of ['VPT_FB_LEAD_INTAKE_ADMIN','VPT_FB_LEGACY_REVIEW','primary']){const f=fixture(),r=f.res();if(name==='primary')f.setPrimary(false);else delete f.env[name];await f.handle(f.request,r,'preview');assert.equal(r.code,503);assert.equal(f.calls.length,0)}
});
test('scope, receipt version and enabled Pages checked before provider access',async()=>{
 for(const alter of [f=>f.context.companyId=randomUUID(),f=>f.context.receipt.id=randomUUID(),f=>f.context.receiptVersion='c'.repeat(32),f=>f.env.VPT_FB_LEAD_INTAKE_PAGES='999']){const f=fixture(),r=f.res();alter(f);await f.handle(f.request,r,'preview');assert.ok([403,409].includes(r.code));assert.equal(f.sourceCalls.length,0);assert.equal(f.calls.length,1)}
});
test('revocation or primary failover during provider fetch prevents saving a proposal',async()=>{
 for(const alter of [f=>f.env.VPT_FB_LEGACY_REVIEW='0',f=>f.setPrimary(false),f=>f.env.VPT_FB_LEAD_INTAKE_PAGES='999']){const f=fixture(),r=f.res();f.setReader(async()=>{alter(f);return{proof:{},contact:{phone:'0901234567'}}});await f.handle(f.request,r,'preview');assert.ok([403,503].includes(r.code));assert.equal(f.calls.length,1)}
});
test('provider failures/contact conflicts never publish a proposal',async()=>{
 for(const conflict of [false,true]){const f=fixture(),r=f.res();f.setReader(async()=>{if(!conflict)throw Error('sensitive token');return{proof:{},contact:{phone:'0901234568'}}});await f.handle(f.request,r,'preview');assert.equal(r.code,conflict?409:503);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r.body).includes('sensitive'),false)}
});
test('ambiguous actor is rejected without a database call',async()=>{const f=fixture(),r=f.res();f.request.user.id=randomUUID();await f.handle(f.request,r,'preview');assert.equal(r.code,403);assert.equal(f.calls.length,0)});
test('commit forwards only current server actor, scope, enabled Pages and exact approved command',async()=>{
 const f=fixture(),r=f.res(),command={proposalId:f.proposal,reason:'Verified synthetic legacy mapping'};
 f.request.body={companyId:f.company,requestId:randomUUID(),command};await f.handle(f.request,r,'commit');assert.equal(r.code,200);assert.equal(f.sourceCalls.length,0);
 assert.deepEqual(f.calls[0].args,{p_actor:f.actor,p_company:f.company,p_request:f.request.body.requestId,p_command:command,p_pages:['123']});
});
test('storage errors never leak provider credentials and preserve refusal/conflict distinction',async()=>{
 for(const [code,status]of [['42501',403],['40001',409],['23505',409],['22023',400],['22P02',400],['XX000',503]]){const f=fixture(),r=f.res();f.db.rpc=async()=>({error:{code,message:'private-page-token'}});await f.handle(f.request,r,'preview');assert.equal(r.code,status);assert.equal(JSON.stringify(r.body).includes('private-page-token'),false)}
});
