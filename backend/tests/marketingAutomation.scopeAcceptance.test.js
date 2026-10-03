'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {context,request,receipt,id}=require('./marketingAutomation.scopeAcceptance.fixture');
const {parseRequest,requirements,evaluate,publicReceipt,publicView,createScopeAcceptance,keyOf}=require('../src/modules/marketingAutomation/scopeAcceptance');
const issue=(fn,code)=>assert.throws(fn,e=>e.status===409&&e.issues?.some(x=>x.code===code));
test('accepted scope includes spend on zero-lead account: 1m / 4 = 250k; no budget or full-channel claim',async()=>{
 const c=await context(),r=parseRequest(request(c)),out=evaluate(c,r.command);
 assert.deepEqual(requirements(c).gaps,[]);assert.equal(out.spendVnd,1000000);assert.equal(out.qualifiedLeads,4);assert.equal(out.costPerQualifiedLeadVnd,250000);
 assert.equal(out.targetStatus,'AT_OR_BELOW_TARGET_IN_SCOPE');assert.equal(out.providerUniverseVerified,false);assert.equal(out.allChannelsMeasured,false);assert.equal(out.allowBudgetExecution,false);
 assert.deepEqual(publicReceipt(receipt(c,r,out),c.companyId,c.trialId).report,out);
});
test('zero-spend delivered ad must still have historical destinations',async()=>{
 const c=await context(),r=parseRequest(request(c));r.command.manifest=r.command.manifest.filter(x=>x.adId!=='70');issue(()=>evaluate(c,r.command),'DESTINATION_HISTORY_MISSING');
});
test('destination sets can change within a day without losing interval coverage',async()=>{
 const c=await context(),entry={...c.facts.sourceRegistry.declaration.entries[0],formId:'457'};
 c.facts.sourceRegistry.declaration.entries.push(entry);
 const e={...c.exports[0],requestId:id(921),formId:'457'},d={...c.exportDetails[0].result,requestId:e.requestId,formId:'457'};c.exports.push(e);c.exportDetails.push({requestId:e.requestId,result:d});
 const r=parseRequest(request(c)),m=r.command.manifest.find(x=>x.accountId==='act_1'&&x.adId==='7'),end=m.validUntil;
 m.validUntil='2026-10-01T00:00:00Z';m.destinations=[keyOf(entry)];r.command.manifest.push({...m,validFrom:m.validUntil,validUntil:end,destinations:c.facts.sourceRegistry.declaration.entries.filter(e=>e.accountId==='act_1').map(keyOf)});
 assert.equal(evaluate(c,r.command).qualifiedLeads,4);
 r.command.manifest.at(-1).validFrom='2026-10-01T00:00:01Z';issue(()=>evaluate(c,r.command),'DESTINATION_HISTORY_MISSING');
});
test('known proof must match destination at acquisition, including adset and campaign',async()=>{
 for(const field of ['adsetId','campaignId']){const c=await context(),r=parseRequest(request(c));c.facts.sources[0].proof[field]='998';issue(()=>evaluate(c,r.command),'PROOF_DELIVERY_METADATA_CONFLICT');}
 const c=await context(),r=parseRequest(request(c));const m=r.command.manifest.find(x=>x.accountId==='act_1'&&x.adId==='7');m.destinations=[keyOf(c.facts.sourceRegistry.declaration.entries[1])];issue(()=>evaluate(c,r.command),'INVALID_DESTINATION_INTERVAL');
});
test('overlapping historical intervals cannot hide contradictory destinations',async()=>{
 const c=await context(),r=parseRequest(request(c));r.command.manifest.push({...r.command.manifest[0]});issue(()=>evaluate(c,r.command),'OVERLAPPING_DESTINATION_INTERVALS');
});
test('empty export may be accepted with explicit provenance; no qualified customers means null cost',async()=>{
 const c=await context();c.facts.sources=[];c.facts.receipts=[];c.facts.qualities=[];c.facts.identity.members=[];c.facts.providerReconciliation.items=[];
 c.exports[0].status=c.exportDetails[0].result.status='EMPTY_COMPARISON';const comparison=c.exportDetails[0].result.comparison;for(const k of Object.keys(comparison))if(k!=='differences')comparison[k]=0;
 const out=evaluate(c,parseRequest(request(c)).command);assert.equal(out.spendVnd,1000000);assert.equal(out.qualifiedLeads,0);assert.equal(out.costPerQualifiedLeadVnd,null);assert.equal(out.status,'NO_QUALIFIED_LEADS');assert.equal(out.targetStatus,'NOT_EVALUATED');
});
for(const [label,change,code]of[
 ['pending qualification',c=>c.facts.qualities[0].evidence=null,'QUALIFICATION_PENDING'],
 ['expired export authority',c=>c.exports[0].currentStatus='STALE_AUTHORITY','EXPORT_NOT_RECONCILED'],
 ['filtered export',c=>c.exportDetails[0].result.comparison.notInExport=1,'EXPORT_NOT_RECONCILED'],
 ['export from different scan',c=>c.exportDetails[0].result.pagesDigest='3'.repeat(64),'EXPORT_NOT_RECONCILED'],
 ['malformed comparison',c=>c.exportDetails[0].result.comparison={},'EXPORT_NOT_RECONCILED'],
 ['unsupported destination',c=>c.facts.sourceRegistry.declaration.entries[1].kind='WEBSITE','ENTRYPOINT_NOT_SUPPORTED'],
 ['untraversed census',c=>c.facts.providerReconciliation.run.witness.status='MISSING','CENSUS_NOT_RECONCILED'],
 ['missing delivery',c=>c.facts.accountDelivery.pop(),'DELIVERY_UNAVAILABLE'],
])test(label+' cannot produce an accepted result',async()=>{const c=await context(),r=parseRequest(request(c));change(c);issue(()=>evaluate(c,r.command),code);});
test('artifact bytes are hashed at server; unexpected authority, money, completeness and forged hashes are rejected',async()=>{
 const c=await context();for(const mutate of [r=>r.command.spendVnd=1,r=>r.command.artifactSha256='a'.repeat(64),r=>r.companyId=id(999),r=>r.command.claims.pop(),r=>r.artifactBase64+='=',r=>r.command.manifest[0].validFrom='2026-02-30T00:00:00Z',r=>r.command.exportClaims.push(r.command.exportClaims[0])]){const r=request(c);mutate(r);assert.throws(()=>parseRequest(r));}
 const r=parseRequest(request(c));assert.equal(r.command.artifactBytes,Buffer.from(r.artifact,'base64').length);assert.match(r.command.artifactSha256,/^[a-f0-9]{64}$/);
});
test('public receipt is a whitelist; impossible target/period/revoke/scope hides the whole result',async()=>{
 const c=await context(),p=parseRequest(request(c)),r=receipt(c,p,evaluate(c,p.command));r.artifact='private';r.command='private';r.report.secret='private';
 assert.ok(!JSON.stringify(publicReceipt(r,c.companyId,c.trialId)).includes('private'));
 for(const mutate of [x=>x.report.targetStatus='MET',x=>x.report.targetVnd=7,x=>x.report.costPerQualifiedLeadVnd=1,x=>x.report.sinceAt=x.report.untilExclusive,x=>x.report.accountIds.push('act_1'),x=>x.artifactSha256='bad',x=>x.report.qualificationAsOf='bad',x=>x.action='REVOKE']){const x=structuredClone(r);mutate(x);assert.throws(()=>publicReceipt(x,c.companyId,c.trialId));}
});
test('view distinguishes current scope from revoked/history and unavailable source',async()=>{
 const c=await context(),p=parseRequest(request(c)),r=receipt(c,p,evaluate(c,p.command)),v={actorId:c.actorId,companyId:c.companyId,trialId:c.trialId,revision:1,context:c,history:[r],currentStatus:'CURRENT'};
 assert.equal(publicView(v,c.actorId,c.companyId,c.trialId).currentStatus,'CURRENT');
 for(const patch of [{context:null},{revision:2},{currentStatus:'REVOKED'}])assert.throws(()=>publicView({...v,...patch},c.actorId,c.companyId,c.trialId));
 const revoked=receipt(c,parseRequest({requestId:id(931),command:{action:'REVOKE',expectedRevision:1,targetRequestId:r.requestId,reason:'Withdraw synthetic historical source acceptance.'}}),null);
 assert.equal(publicView({...v,revision:2,context:null,history:[revoked,r],currentStatus:'REVOKED'},c.actorId,c.companyId,c.trialId).requirements,null);
});
function harness(c,{env={VPT_MARKETING_TRIAL_REPORT:'1',VPT_MARKETING_SCOPE_ACCEPTANCE:'1'},primary=()=>true,reply}={}){
 const calls=[],res={code:200,set(){},status(v){this.code=v;return this;},json(v){this.body=v;return this;}},req={user:{userId:c.actorId},query:{company_id:c.companyId},params:{trialId:c.trialId}};
 const service=createScopeAcceptance({isPrimary:primary,env,db:{rpc:async(name,args)=>{calls.push({name,args});return reply?reply(name,args):{data:{actorId:c.actorId,companyId:c.companyId,trialId:c.trialId,context:c,revision:0,history:[],currentStatus:'MISSING'}};}}});
 return{calls,res,req,run:(write=false)=>service(req,res,write)};
}
test('API rejects extra client authority and default-off/backup before database calls',async()=>{
 const c=await context();for(const options of [{env:{}},{primary:()=>false}]){const h=harness(c,options);await h.run();assert.equal(h.res.code,503);assert.equal(h.calls.length,0);}
 const h=harness(c);h.req.body={...request(c),report:{spendVnd:0}};await h.run(true);assert.equal(h.res.code,400);assert.equal(h.calls.length,0);
});
test('API calculates privately, stores artifact once and returns no raw facts/bytes',async()=>{
 const c=await context(),h=harness(c,{reply:(name,args)=>({data:name==='marketing_scope_prepare'?{actorId:c.actorId,companyId:c.companyId,trialId:c.trialId,context:c,revision:0}:receipt(c,{requestId:args.p_request,command:args.p_command},args.p_report)})});
 h.req.body=request(c);await h.run(true);assert.equal(h.res.code,200);assert.equal(h.calls[1].args.p_report.costPerQualifiedLeadVnd,250000);assert.ok(h.calls[1].args.p_artifact);assert.equal(h.res.body.receipt.report.spendVnd,1000000);assert.ok(!JSON.stringify(h.res.body).includes('artifactBase64'));
});
test('exact retry remains historical, including after revoke; cannot claim current or switch actor',async()=>{
 const c=await context(),p=parseRequest(request(c)),r={...receipt(c,p,evaluate(c,p.command)),replayed:true};
 const h=harness(c,{reply:()=>({data:{receipt:r}})});h.req.body=request(c);await h.run(true);assert.equal(h.res.body.currentStatus,'HISTORICAL_REPLAY');assert.equal(h.calls.length,1);
 r.actorId=id(999);const bad=harness(c,{reply:()=>({data:{receipt:r}})});bad.req.body=request(c);await bad.run(true);assert.equal(bad.res.code,503);
});
test('source/failover errors and stale expectedRevision cannot append',async()=>{
 const c=await context(),h=harness(c,{reply:()=>({error:{code:'40001',message:'private'}})});h.req.body=request(c);await h.run(true);assert.equal(h.res.code,409);assert.ok(!JSON.stringify(h.res.body).includes('private'));
 let primary=true;const switched=harness(c,{primary:()=>primary,reply:()=>{primary=false;return{data:{actorId:c.actorId,companyId:c.companyId,trialId:c.trialId,context:c,revision:0}};}});switched.req.body=request(c);await switched.run(true);assert.equal(switched.res.code,503);assert.equal(switched.calls.length,1);
});
test('UI verifies arithmetic, scope and current-vs-historical state before displaying accepted result',async()=>{
 const ui=await import('../../frontend/src/components/marketing/scopeAcceptanceState.mjs'),c=await context(),p=parseRequest(request(c)),r=receipt(c,p,evaluate(c,p.command));
 const view=publicView({actorId:c.actorId,companyId:c.companyId,trialId:c.trialId,revision:1,context:c,history:[r],currentStatus:'CURRENT'},c.actorId,c.companyId,c.trialId);
 assert.equal(ui.scopeResult(view,c.actorId,c.companyId,c.trialId).history[0].report.costPerQualifiedLeadVnd,250000);
 for(const change of [x=>x.history[0].report.costPerQualifiedLeadVnd=1,x=>x.contextVersion='b'.repeat(64),x=>x.currentStatus='REVOKED',x=>x.history[0].report.allChannelsMeasured=true,x=>x.requirements=null]){const v=structuredClone(view);change(v);assert.throws(()=>ui.scopeResult(v,c.actorId,c.companyId,c.trialId));}
});
test('UI retry storage keeps exact metadata without file bytes and isolates users/companies/trials',async()=>{
 const ui=await import('../../frontend/src/components/marketing/scopeAcceptanceState.mjs'),c=await context(),body=request(c),parsed=parseRequest(body),p={requestId:body.requestId,command:body.command,fileSha256:parsed.command.artifactSha256,fileBytes:parsed.command.artifactBytes};
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 ui.savePending(storage,c.actorId,c.companyId,c.trialId,p);assert.deepEqual(ui.readPending(storage,c.actorId,c.companyId,c.trialId),p);assert.ok(![...map.values()][0].includes(body.artifactBase64));
 for(const scope of [[id(999),c.companyId,c.trialId],[c.actorId,id(999),c.trialId],[c.actorId,c.companyId,id(999)]])assert.equal(ui.readPending(storage,...scope),null);
 assert.throws(()=>ui.savePending(storage,c.actorId,c.companyId,c.trialId,{...p,artifactBase64:body.artifactBase64}));
 assert.throws(()=>ui.savePending({...storage,setItem:()=>{}},c.actorId,c.companyId,id(997),p));
 const saved=receipt(c,parsed,evaluate(c,parsed.command));assert.equal(ui.receiptResult(saved,c.companyId,c.trialId,p,c.actorId).requestId,p.requestId);assert.throws(()=>ui.receiptResult(saved,c.companyId,c.trialId,{...p,fileSha256:'f'.repeat(64)},c.actorId));
});
test('UI Vietnam interval conversion does not depend on browser timezone and rejects impossible dates',async()=>{
 const ui=await import('../../frontend/src/components/marketing/scopeAcceptanceState.mjs');assert.equal(ui.utcTime('2026-10-01T00:00'),'2026-09-30T17:00:00.000Z');assert.equal(ui.localTime('2026-09-30T17:00:00Z'),'2026-10-01T00:00:00');assert.throws(()=>ui.utcTime('2026-02-30T00:00'));
});
