import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { forward, verifyKey, type Fetcher } from '../src/bridge.js';
import { present } from '../src/view-model.js';
import { FounderCard, FounderError } from '../src/founder-card.js';
import { synthetic } from './fixture.js';
const responder=(body:object,status=200): Fetcher=>async()=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('safe backend error codes survive bridge without upstream content',async()=>{
 for(const reason of ['REQUEST_CONFLICT','PROPOSAL_VERSION_CONFLICT','OBJECT_NOT_ACCESSIBLE','PERMISSION_DENIED','TENANT_INACTIVE','INVALID_ARGUMENTS','WRITE_GATE_CLOSED','WRITE_OUTCOME_UNKNOWN_REPLAY_SAME_REQUEST','AUTHENTICATION_REQUIRED','BACKEND_UNAVAILABLE']){
  const r=await forward('create_founder_objective',{},'synthetic-key',responder({reasonCode:reason,error:'SYNTHETIC_SECRET_SENTINEL',message:'SYNTHETIC_DB_SENTINEL',phone:'SYNTHETIC_PHONE_SENTINEL'},409));
  assert.equal(r.structuredContent?.reason,reason);assert.ok(!JSON.stringify(r).includes('SENTINEL'));
  if(reason==='WRITE_OUTCOME_UNKNOWN_REPLAY_SAME_REQUEST'){
   assert.equal(r.structuredContent.replay_same_request_id,true);assert.match(r.content[0].text,/cùng request_id và payload/);
  }
 }
 const unknown=await forward('create_founder_objective',{},'synthetic-key',responder({reasonCode:'RAW_DB_ERROR'},503));
 assert.equal(unknown.structuredContent?.reason,'BACKEND_UNAVAILABLE');
 const toolFailure=await forward('create_founder_objective',{},'synthetic-key',responder({isError:true,structuredContent:{reason:'REQUEST_CONFLICT'},content:[{type:'text',text:'SYNTHETIC_SECRET_SENTINEL'}]}));
 assert.equal(toolFailure.structuredContent.reason,'REQUEST_CONFLICT');assert.ok(!JSON.stringify(toolFailure).includes('SENTINEL'));
});
test('missing bearer rejects before network; failed connection returns error without raw secret',async()=>{
 let called=false;const result=await forward('get_founder_overview',{},undefined,async()=>{called=true;throw new Error('SHOULD_NOT_CALL')});
 assert.equal(called,false);assert.equal(result.isError,true);
 const failed=await forward('get_founder_overview',{},'synthetic-key',async()=>{throw new Error('SECRET_RAW')});assert.equal(failed.isError,true);assert.equal(failed.structuredContent?.outcome,'ERROR');assert.ok(!JSON.stringify(failed).includes('SECRET_RAW'));
});
test('backend error/schema failure never become empty data or zero',async()=>{
 for(const body of [{isError:true,content:[{type:'text',text:'SECRET_RAW'}]},{structuredContent:{metrics:{count:0}}}]){const r=await forward('get_founder_overview',{},'synthetic-key',responder(body));assert.equal(r.isError,true);assert.ok(!JSON.stringify(r).includes('SECRET_RAW'))}
});
test('bridge preserves source/unknown/time/sample label in structuredContent',async()=>{
 const r=await forward('get_founder_overview',{},'synthetic-key',responder({structuredContent:synthetic}));
 assert.equal(r.structuredContent?.outcome,'PARTIAL');assert.match(r.content[0].text,/DỮ LIỆU MẪU/);
 const m=present(synthetic);assert.equal(m.metrics[0].value,'Chưa đo được');assert.equal(m.metrics[1].value,'2');
});
test('view renders synthetic/unknown/error and escapes untrusted customer content',()=>{
 const body=renderToStaticMarkup(createElement(FounderCard,{result:{...synthetic,data:{...synthetic.data,objectives:[{id:'sample-goal',title:'<script>attack()</script>',owner_id:'sample-owner',status:'DRAFT'}]}}}));
 assert.match(body,/DỮ LIỆU MẪU/);assert.match(body,/Chưa đo được/);assert.match(body,/lead_attribution/);assert.ok(!body.includes('<script>'));
 assert.match(renderToStaticMarkup(createElement(FounderError)),/role="alert"/);
});
test('stale sync displayed explicitly, not overwritten by fetched_at',()=>{
 const s={...synthetic,source_refs:[{...synthetic.source_refs[0],last_sync_observed_at:'2026-10-06T08:00:00Z',freshness:'STALE_SYNC_OVER_15_MINUTES'}]};assert.match(present(s).sources[0].freshness,/Dữ liệu đồng bộ cũ/);
});
test('verifier only accepts capabilities returned by authenticated backend',async()=>{
 await assert.rejects(verifyKey('synthetic-key',responder({tools:[{name:'crm_get_leads'}]})),/FOUNDER_SCOPE_REQUIRED/);
 const r=await verifyKey('synthetic-key',responder({tools:[{name:'get_founder_overview'}]}));assert.deepEqual(r.scopes,['founder_read']);
});
