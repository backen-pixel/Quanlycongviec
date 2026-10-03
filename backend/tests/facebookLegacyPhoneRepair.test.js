'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {assertLegacyFacebookWriteAllowed}=require('../src/helpers/facebookLegacyWriteScope');
const helpers=require('../src/helpers/facebookLegacyContactWrites');
const {reconcileInboundPhoneAfterScan,phonesEqualDigits}=require('../src/helpers/facebookInboundPhoneReconcile');
const {extractInboundContactInfo,validateVnSubscriberPhoneStored}=require('../src/helpers/facebookPhoneExtract');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/facebook.js'),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const contact=id(1),lead=id(2),customer=id(3),foreign=id(4),primary={isPrimary:()=>true};
const c={id:contact,page_id:'123',psid:'456',lead_id:lead,customer_id:customer,phone:'0900000000',fb_name:'Synthetic'};
const l={id:lead,customer_id:customer,description:'SĐT: 0900000000',title:'Synthetic'};
const cu={id:customer,phone:'0900000000'};
const reads=messages=>[{data:c},{data:l},{data:cu},{data:messages}];
function database({responses=[],allow=()=>true,failWrite=0}={}) {
 const db={reads:[],writes:[],checks:[],rpc:async(name,{p_scope})=>{
  assert.equal(name,'crm_care_legacy_write_check');db.checks.push(p_scope);
  const allowed=allow(p_scope,db.checks.length);
  return {data:{policy:'CARE_LEGACY_WRITE_CHECK_V1',scope:p_scope,allowed,reason:allowed?'LEGACY_SCOPE':'MANAGED_PAGE',observedAt:'2026-10-03T08:00:00Z',reservationMade:false}};
 },from(table){
  let action='read',payload;const filters=[];
  const q={then(resolve,reject){
   const execute=()=>{
    if(action!=='read') {db.writes.push({table,action,payload,filters});return db.writes.length===failWrite?{error:{message:'synthetic database failure'}}:{data:[]};}
    db.reads.push({table,filters});assert.ok(responses.length,`Unexpected read ${table}`);return responses.shift();
   };return Promise.resolve().then(execute).then(resolve,reject);
  }};
  for(const method of ['select','eq','neq','not','in','order','limit','range','single','maybeSingle'])q[method]=(...args)=>{filters.push([method,...args]);return q;};
  for(const method of ['update','delete','insert'])q[method]=value=>{action=method;payload=value;return q;};
  return q;
 }};return db;
}
function context(db,extra={}) {
 return {supabase:db,...helpers,assertLegacyFacebookWriteAllowed:(db,scope)=>assertLegacyFacebookWriteAllowed(db,scope,primary),
  extractInboundContactInfo,validateVnSubscriberPhoneStored,phonesEqualDigits,
  _phoneDigitsLen:p=>String(p||'').replace(/\D/g,'').length,
  console:{log(){},warn(){},error(){}},r:{_ioRef:null},FB_SYNC_BATCH_GRAPH_MAX_PAGES:5,
  applyPageIdsFilter:(q,ids)=>Array.isArray(ids)?q.in('page_id',ids.length?ids:['__none__']):q,
  filterContactsByLeadDateRange:async(_,rows)=>({filtered:rows,skippedByDate:0}),
  sortFacebookContactsNewestFirst:rows=>rows,leadLinkedPhoneAlreadyStored:()=>false,
  ...extra};
}
function fn(name,ctx) {
 const start=source.indexOf(`async function ${name}(`);assert.ok(start>=0,name);
 const end=source.indexOf('\n}',start);assert.ok(end>start);
 vm.runInNewContext(source.slice(start,end+2),ctx);return ctx[name];
}
function route(url,ctx) {
 let handler;
 const start=source.indexOf(`r.post('${url}'`),end=source.indexOf('\n});',start);assert.ok(start>=0&&end>start,url);
 vm.runInNewContext(source.slice(start,end+4),{...ctx,authMiddleware:()=>{},r:{post:(_url,_auth,h)=>{handler=h;},_ioRef:null}});
 return handler;
}
function response(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
test('reconcile refuses managed or unavailable scope before any contact read/write',async()=>{
 const db=database({allow:()=>false});await assert.rejects(reconcileInboundPhoneAfterScan(db,contact,primary),{status:409});
 assert.equal(db.reads.length,0);assert.equal(db.writes.length,0);
});
test('reconcile never clears phones or deletes records after failed/null message reads',async()=>{
 for(const last of [{error:{message:'failed'}},{data:null}]){
  const rows=reads([]);rows[3]=last;const db=database({responses:rows});
  await assert.rejects(reconcileInboundPhoneAfterScan(db,contact,{...primary,deleteLeadIfNoPhone:true}),{status:503});assert.equal(db.writes.length,0);
 }
});
test('reconcile rejects missing or failed linked Lead/Customer reads without writes',async()=>{
 for(const index of [1,2])for(const result of [{data:null},{error:{message:'failed'}}]){
  const rows=reads([]);rows[index]=result;const db=database({responses:rows});
  await assert.rejects(reconcileInboundPhoneAfterScan(db,contact,primary),{status:503});assert.equal(db.writes.length,0);
 }
});
test('reconcile rechecks discovered targets before its first mutation',async()=>{
 const db=database({responses:reads([]),allow:s=>!s.customerIds.includes(customer)});
 await assert.rejects(reconcileInboundPhoneAfterScan(db,contact,primary),{status:409});assert.equal(db.writes.length,0);
 assert.deepEqual(db.checks[1].leadIds,[lead]);assert.deepEqual(db.checks[1].customerIds,[customer]);
});
test('reconcile stops after any failed write before subsequent writes or deletion',async()=>{
 for(const failWrite of [1,2,3]) {
  const db=database({responses:reads([]),failWrite});
  await assert.rejects(reconcileInboundPhoneAfterScan(db,contact,{...primary,deleteLeadIfNoPhone:true}),{status:503});
  assert.equal(db.writes.length,failWrite);assert.ok(db.writes.every(w=>w.action==='update'));
 }
});
test('allowed reconcile preserves existing inbound number and completes checked cleanup otherwise',async()=>{
 const same=database({responses:reads([{direction:'inbound',content:'Số điện thoại 0900000000'}])});
 assert.equal((await reconcileInboundPhoneAfterScan(same,contact,primary)).action,'skipped_same_inbound_as_stored');assert.equal(same.writes.length,0);
 const db=database({responses:reads([])});assert.equal((await reconcileInboundPhoneAfterScan(db,contact,primary)).action,'cleared_stored_phone_only');
 assert.deepEqual(db.writes.map(w=>w.table),['facebook_contacts','customers','crm_leads']);
});
test('batch authority checks the entire requested list, including mixed foreign IDs',async()=>{
 const db=database({responses:[{data:[{id:contact,page_id:'123'},{id:foreign,page_id:'999'}]}]});
 await assert.rejects(helpers.assertLegacyContactIdsInPageScope(db,[contact,foreign],['123']),{status:403});assert.equal(db.writes.length,0);
 for(const ids of ['bad',['bad'],Array(501).fill(contact)])await assert.rejects(helpers.assertLegacyContactIdsInPageScope(database(),ids,['123']),{status:400});
 const own=database({responses:[{data:[{id:contact,page_id:'123'}]}]});await helpers.assertLegacyContactIdsInPageScope(own,[contact,contact.toUpperCase()],['123']);
});
test('actual quality apply route rejects mixed-company selection before invoking worker',async()=>{
 let calls=0;const db=database({responses:[{data:[{id:contact,page_id:'123'},{id:foreign,page_id:'999'}]}]});
 const h=route('/phone-quality-apply',context(db,{resolvePageIdsForCompanyScoped:async()=>['123'],applyPhoneQualityActions:async()=>{calls++;}}));
 const res=response();await h({body:{update_contact_ids:[contact],delete_contact_ids:[foreign],pageIds:['999']}},res);
 assert.equal(res.statusCode,403);assert.equal(calls,0);assert.equal(db.writes.length,0);
});
test('actual quality apply route preserves authorized selection and ignores caller page scope',async()=>{
 let calls=0;const db=database({responses:[{data:[{id:contact,page_id:'123'}]}]});
 const h=route('/phone-quality-apply',context(db,{resolvePageIdsForCompanyScoped:async()=>['123'],applyPhoneQualityActions:async()=>{calls++;return {ok:true};}}));
 const res=response();await h({body:{update_contact_ids:[contact],pageIds:['999']}},res);
 assert.equal(res.statusCode,200);assert.equal(calls,1);assert.equal(db.checks.length,1);
});
test('actual date and quality scan routes replace untrusted pageIds with server scope',async()=>{
 for(const [url,worker] of [['/scan-leads-by-date','runLeadScanByDateBatch'],['/phone-quality-scan','runPhoneQualityScan']]){
  let received;const h=route(url,context(database(),{resolvePageIdsForCompanyScoped:async()=>['123'],[worker]:async b=>{received=b;return {ok:true};}}));
  const res=response();await h({body:{pageIds:['999']}},res);assert.deepEqual(Array.from(received.pageIds),['123']);assert.equal(res.statusCode,200);
 }
});
test('actual reconcile route authorizes before provider/helper and stops after provider error',async()=>{
 for(const authorized of [false,true]){
  const db=database({responses:[{data:c}]});let effects=0;
  const h=route('/contacts/:id/reconcile-inbound-phone',context(db,{authorizeLegacyContactMutation:async(_,res)=>{if(!authorized)res.status(403).json({error:'denied'});return authorized;},
   graphSyncMessagesForContactRow:async()=>({status:'error'}),applyExtractFromDbMessagesForContact:async()=>{effects++;},reconcileInboundPhoneAfterScan:async()=>{effects++;}}));
  const res=response();await h({params:{id:contact},body:{}},res);assert.equal(res.statusCode,authorized?503:403);assert.equal(effects,0);assert.equal(db.writes.length,0);
 }
});
test('provider status gate accepts completed sync and rejects unknown/failed source states',()=>{
 for(const status of ['synced','up_to_date','no_msg'])assert.doesNotThrow(()=>helpers.assertLegacyFacebookSyncSucceeded({status}));
 for(const status of ['no_token','no_conv','error','skipped',undefined])assert.throws(()=>helpers.assertLegacyFacebookSyncSucceeded({status}),{status:503});
});
test('actual Graph reader does not return partial data when a subsequent page fails',async()=>{
 let calls=0;
 const get=fn('graphFetchConversationMessages',context(database(),{FB_GRAPH_MESSAGES_FIELDS:'id',fetch:async()=>({ok:true,json:async()=>++calls===1?{data:[{id:'m1'}],paging:{next:'https://graph.facebook.com/example'}}:{error:{message:'expired'}}})}));
 await assert.rejects(get('conv','fake-token'),{status:503});assert.equal(calls,2);
});
test('actual Graph reader rejects invalid payload and HTTP failure, retains legitimate empty history',async()=>{
 for(const [ok,payload,allowed] of [[true,{data:null},false],[false,{data:[]},false],[true,{data:[]},true]]){
  const get=fn('graphFetchConversationMessages',context(database(),{FB_GRAPH_MESSAGES_FIELDS:'id',fetch:async()=>({ok,json:async()=>payload})}));
  if(allowed)assert.equal((await get('conv','fake-token')).length,0);else await assert.rejects(get('conv','fake-token'),{status:503});
 }
});
function graph(db,extra={}){return fn('graphSyncMessagesForContactRow',context(db,{getPageConfig:async()=>({access_token:'fake'}),graphResolveConversationIdForPsid:async()=>({convId:'conv'}),graphFetchConversationMessages:async()=>Object.assign([{id:'m1',message:'synthetic'},{id:'m2',message:'synthetic'}],{complete:true}),acquireMidLock:()=>true,...extra}));}
test('actual Graph sync rejects managed scope before provider access and read failures before writes',async()=>{
 const denied=database({allow:()=>false});await assert.rejects(graph(denied)(c,{}),{status:409});assert.equal(denied.reads.length,0);
 const failed=database({responses:[{error:{message:'read failed'}}]});assert.equal((await graph(failed)(c,{})).status,'error');assert.equal(failed.writes.length,0);
});
test('actual Graph sync retains partial inserted count and never stamps a failed attempt successful',async()=>{
 const db=database({responses:[{data:[]},{data:[]}],failWrite:2});const result=await graph(db)(c,{});
 assert.equal(result.status,'error');assert.equal(result.synced,1);assert.ok(db.writes.every(w=>w.table==='facebook_messages'));
});
test('actual shared extraction blocks protected scope and checked read failures before mutation',async()=>{
 const denied=database({allow:()=>false});await assert.rejects(fn('applyExtractFromDbMessagesForContact',context(denied))(c),{status:409});assert.equal(denied.reads.length,0);
 const db=database({responses:[{data:c},{data:l},{data:cu},{error:{message:'bad messages'}}]});
 await assert.rejects(fn('applyExtractFromDbMessagesForContact',context(db))(c,{forceRescanPhones:true}),{status:503});assert.equal(db.writes.length,0);
});
test('actual shared extraction stops after Customer write failure before Lead update',async()=>{
 const db=database({responses:reads([{direction:'inbound',content:'Số điện thoại 0911111111'}]),failWrite:1});
 await assert.rejects(fn('applyExtractFromDbMessagesForContact',context(db))(c,{forceRescanPhones:true}),{status:503});
 assert.deepEqual(db.writes.map(w=>w.table),['customers']);
});
test('final description sync requires explicit IDs, checks managed targets and never scans all Leads',async()=>{
 const db=database();const run=fn('runExtractPhonesFinalLeadDescriptionSync',context(db));await assert.rejects(run(),{status:400});
 assert.equal((await run([])).totalLeads,0);assert.equal(db.reads.length,0);
 const denied=database({allow:()=>false});await assert.rejects(fn('runExtractPhonesFinalLeadDescriptionSync',context(denied))([lead]),{status:409});assert.equal(denied.reads.length,0);
 const own=database({responses:[{data:[{...l,description:'Needs phone'}]},{data:[cu]}]});const result=await fn('runExtractPhonesFinalLeadDescriptionSync',context(own))([lead]);
 assert.equal(result.leadsUpdatedPhone,1);assert.ok(own.reads[0].filters.some(([method,key,ids])=>method==='in'&&key==='id'&&ids.length===1&&ids[0]===lead));
 assert.deepEqual(own.writes.map(w=>w.table),['crm_leads']);
});
test('final description sync does not interpret unavailable Customer data as missing phone',async()=>{
 const db=database({responses:[{data:[l]},{data:[]}]});await assert.rejects(fn('runExtractPhonesFinalLeadDescriptionSync',context(db))([lead]),{status:503});assert.equal(db.writes.length,0);
});
test('actual rescan applies page scope even with explicit foreign page_id and does not cleanup after read failure',async()=>{
 const db=database({responses:[{data:[c]},{data:[l]},{data:[cu]},{error:{message:'message read failed'}}]});let deleted=0;
 const run=fn('runRescanPhonesBatch',context(db,{deleteLeadIfAllowedForRescan:async()=>{deleted++;}}));
 const result=await run({pageIds:['123'],page_id:'999',delete_lead_when_no_phone:true});assert.equal(result.errors,1);assert.equal(deleted,0);assert.equal(db.writes.length,0);
 assert.ok(db.reads[0].filters.some(([m,k,ids])=>m==='in'&&k==='page_id'&&ids[0]==='123'));
});
test('actual date scan does not cleanup after message read or requested Graph sync fails',async()=>{
 for(const sync_graph_first of [false,true]){
  const db=database({responses:sync_graph_first?[{data:[c]}]:[{data:[c]},{data:c},{error:{message:'failed'}}]});let effects=0;
  const run=fn('runLeadScanByDateBatch',context(db,{graphSyncMessagesForContactRow:async()=>({status:'error'}),applyExtractFromDbMessagesForContact:async()=>{effects++;},deleteLeadIfAllowedForRescan:async()=>{effects++;}}));
  const result=await run({pageIds:['123'],lead_date_from:'2026-10-01',lead_date_to:'2026-10-03',sync_graph_first});assert.equal(result.errors,1);assert.equal(effects,0);assert.equal(db.writes.length,0);
  assert.ok(db.reads[0].filters.some(([m,k])=>m==='in'&&k==='page_id'));
 }
});
test('actual phone quality update stops after failed Customer update without updating Lead or reporting success',async()=>{
 const db=database({responses:[{data:c},{data:[{direction:'inbound',content:'0911111111'}]}],failWrite:2});let patched=0;
 const run=fn('applyPhoneQualityActions',context(db,{patchLeadDescriptionPhone:async()=>{patched++;}}));
 await assert.rejects(run({update_contact_ids:[contact]}),{status:503});assert.equal(patched,0);assert.equal(db.writes.length,2);
});
test('actual phone quality deletion stops after failed message deletion before deleting contact',async()=>{
 const db=database({responses:[{data:{...c,lead_id:null,customer_id:null}}],failWrite:1});
 await assert.rejects(fn('applyPhoneQualityActions',context(db))({delete_contact_ids:[contact]}),{status:503});
 assert.deepEqual(db.writes.map(w=>w.table),['facebook_messages']);
});
test('actual batch extractor scopes contact reads and rejects a failed message read before any write or final round',async()=>{
 let final=0;const db=database({responses:[{data:[c]},{data:[l]},{data:[cu]},{error:{message:'failed'}}]});
 const h=route('/batch-extract-phones',context(db,{resolvePageIdsForCompanyScoped:async()=>['123'],activityTimestampMs:()=>0,runExtractPhonesFinalLeadDescriptionSync:async()=>{final++;},AUTO_PIPELINE_RECENT_HOURS:48}));
 const res=response();await h({body:{limit:1,force_rescan_phones:true}},res);assert.equal(res.statusCode,503);assert.equal(db.writes.length,0);assert.equal(final,0);
 assert.ok(db.reads[0].filters.some(([m,k])=>m==='in'&&k==='page_id'));
});

function resolver(db,extra={}) {
 const roleHelpers=require('../src/helpers/adminRole');
 const ctx=context(db,{...roleHelpers,isInternalAutoPipelineRequest:()=>false,
  ensureFacebookTenantContext:async()=>true,facebookTenantCompanyIds:req=>req.tenantCompanyIds,
  resolveCrmSocialInboxCompanyId:async()=>null,...extra});
 const start=source.indexOf('function isFacebookHstAdmin('),end=source.indexOf('\n}',start);vm.runInNewContext(source.slice(start,end+2),ctx);
 return fn('resolvePageIdsForCompanyScoped',ctx);
}
test('actual scope resolver restricts sales and company admins before tenant-wide membership',async()=>{
 for(const role of ['sales','sales_admin','admin']) {
  const db=database({responses:[{data:[{page_id:'123',default_company_id:'A'}]}]});
  const run=resolver(db), req={user:{role,company_id:'A',tenant_id:'tenant'},tenantCompanyIds:['A','B']};
  assert.deepEqual(Array.from(await run(req,response(),null)),['123']);
  const filter=db.reads[0].filters.find(([m,k])=>m==='in'&&k==='default_company_id');assert.deepEqual(Array.from(filter[2]),['A']);
  const res=response();assert.equal(await run(req,res,'B'),undefined);assert.equal(res.statusCode,403);assert.equal(db.reads.length,1);
 }
});
test('actual scope resolver retains tenant admin rights without admitting another tenant',async()=>{
 const db=database({responses:[{data:[{page_id:'123'},{page_id:'456'}]}]});const run=resolver(db);
 const req={user:{role:'ecosystem_admin',tenant_id:'tenant'},tenantCompanyIds:['A','B']};
 assert.equal((await run(req,response(),null)).length,2);const res=response();await run(req,res,'outside');assert.equal(res.statusCode,403);
});
test('actual scope resolver rejects an unenforced missing tenant for ecosystem and legacy admins',async()=>{
 for(const role of ['ecosystem_admin','admin']){
  const db=database(),res=response();const run=resolver(db);
  assert.equal(await run({user:{role},tenantCompanyIds:null},res),undefined);assert.equal(res.statusCode,403);assert.equal(db.reads.length,0);
 }
 const db=database({responses:[{data:[{page_id:'123'},{page_id:'456'}]}]});
 assert.equal((await resolver(db)({user:{role:'platform_admin'},tenantCompanyIds:null},response())).length,2);
});
test('actual scope resolver fails on missing tenant context or failed Page source and bypasses stale Page cache',async()=>{
 const missing=database();assert.equal(await resolver(missing,{ensureFacebookTenantContext:async()=>false})({},response()),undefined);assert.equal(missing.reads.length,0);
 const req={user:{role:'sales',company_id:'A'},tenantCompanyIds:['A']};
 const failed=database({responses:[{error:{message:'failed'}}]});await assert.rejects(resolver(failed)(req,response()),{status:503});
 const changed=database({responses:[{data:[{page_id:'123'}]},{data:[]}]});
 const run=resolver(changed,{getPageIdsForCompany:async()=>{throw Error('Must not use stale cache');}});
 assert.equal((await run(req,response())).length,1);assert.equal((await run(req,response())).length,0);assert.equal(changed.reads.length,2);
});
test('actual Graph sync never calls a locked but absent MID complete or stamps it successful',async()=>{
 const db=database({responses:[{data:[]}]});const result=await graph(db,{acquireMidLock:()=>false})(c,{});
 assert.equal(result.status,'error');assert.equal(db.writes.length,0);assert.throws(()=>helpers.assertLegacyFacebookSyncSucceeded(result),{status:503});
});
test('actual Graph sync accepts a stored same-contact MID while refusing another contact mapping',async()=>{
 for(const owner of [contact,foreign]){
  const db=database({responses:[{data:[{id:'db-message',contact_id:owner}]},{data:[{id:'db-message2',contact_id:owner}]}]});
  const result=await graph(db,{acquireMidLock:()=>false})(c,{});
  assert.equal(result.status,owner===contact?'up_to_date':'error');assert.equal(db.writes.length,owner===contact?1:0);
 }
});
test('actual Graph reader marks a page cap incomplete and downstream sync keeps cleanup closed',async()=>{
 const ctx=context(database(),{FB_GRAPH_MESSAGES_FIELDS:'id',fetch:async()=>({ok:true,json:async()=>({data:[{id:'m1'}],paging:{next:'https://graph.facebook.com/next'}})})});
 const messages=await fn('graphFetchConversationMessages',ctx)('conv','fake',{maxPages:1});assert.equal(messages.complete,false);
 const db=database({responses:[{data:[]}]});const result=await graph(db,{graphFetchConversationMessages:async()=>messages})(c,{});
 assert.equal(result.status,'partial');assert.equal(db.writes.length,1);assert.equal(db.writes[0].table,'facebook_messages');
 assert.throws(()=>helpers.assertLegacyFacebookSyncSucceeded(result),{status:503});
});
test('reconcile keeps stored phone and Lead when the no-phone result is only a history window',async()=>{
 const db=database({responses:reads(Array.from({length:801},()=>({direction:'inbound',content:'synthetic without number'})))});
 await assert.rejects(reconcileInboundPhoneAfterScan(db,contact,{...primary,deleteLeadIfNoPhone:true}),{status:503});assert.equal(db.writes.length,0);
});
test('actual rescan and date cleanup stop when 501 messages cannot prove phone absence',async()=>{
 const messages=Array.from({length:501},()=>({direction:'inbound',content:'synthetic without number'}));
 const cases=[['runRescanPhonesBatch',[{data:[c]},{data:[l]},{data:[cu]},{data:messages}],{pageIds:['123'],delete_lead_when_no_phone:true}],
  ['runLeadScanByDateBatch',[{data:[c]},{data:c},{data:messages}],{pageIds:['123'],lead_date_from:'2026-10-01',lead_date_to:'2026-10-03',sync_graph_first:false}]];
 for(const [name,responses,body] of cases){
  const db=database({responses});let deleted=0;const result=await fn(name,context(db,{deleteLeadIfAllowedForRescan:async()=>{deleted++;}}))(body);
  assert.equal(result.errors,1);assert.equal(deleted,0);assert.equal(db.writes.length,0);
 }
});
