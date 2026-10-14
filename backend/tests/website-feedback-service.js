'use strict';

// Actual service and Express router, using synthetic sources and loopback only.
// The tenant predicate is isolated so importing this test cannot start Supabase's
// health checker or read a production environment file.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { Module, createRequire } = require('node:module');
const express = require('express');
const { createWebsiteQualifiedFeedback } = require('../src/services/websiteQualifiedFeedback');
const { getWebsiteFeedbackConfig } = require('../src/modules/marketingAutomation/websiteFeedbackSender');
const Google = require('../src/modules/marketingAutomation/googleQualifiedConversions');
const { qualificationContext } = require('../src/modules/marketingAutomation/qualificationContext');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const OTHER = '11111111-1111-4111-8111-111111111111', DAY = 86400000;
const uuid = n => `22222222-2222-4222-8222-${String(n).padStart(12,'0')}`;
const NOW = Date.parse('2026-10-14T03:00:00Z');
const TARGET = { company_id: COMPANY, ad_account_id: 'act_835757498658305',
  dataset_id: '123456789', site_host: 'vanphuthanh.net' };
const environment = patch => ({ VPT_META_WEB_FEEDBACK_ENABLED: '0', VPT_META_WEB_FEEDBACK_MODE: 'production',
  VPT_META_WEB_FEEDBACK_COMPANY_ID: COMPANY, VPT_META_WEB_FEEDBACK_AD_ACCOUNT_ID: TARGET.ad_account_id,
  VPT_META_WEB_FEEDBACK_DATASET_ID: TARGET.dataset_id, VPT_META_WEB_FEEDBACK_GRAPH_VERSION: 'v26.0', ...patch });
const candidate = patch => ({ company_id: COMPANY, lead_id: uuid(1), qualified_ms: NOW-60000,
  acquired_ms: NOW-3600000, delivery_supported: true, hold_reason: null,
  fbc: 'private-fbc', fbp: 'private-fbp', fbclid: 'private-click', phone: '0900000000',
  email: 'private@example.test', identity_key: 'a'.repeat(64), context_hash: 'b'.repeat(64),
  source_receipt_id: uuid(2), qualification_id: uuid(3), evidence_ref: 'private-recording', ...patch });
const clearGuard = () => ({ blocked:false, reason_code:null, unknown:0, accepted_stale:0, expired_processing:0 });

function harness({ config = getWebsiteFeedbackConfig(environment()), rows = [], sourceError = false,
  ledgerError = false, guardError = false, primary = true, afterSourceBackup = false, afterGuardBackup = false } = {}) {
  const calls = []; let currentPrimary = primary;
  const db = { async rpc(name, args) {
    calls.push({ name, args });
    if (name === 'web_feedback_list_v1') return ledgerError
      ? { error: new Error('private ledger token') } : { data: { counts:{}, rows:[] }, error:null };
    if (name === 'web_feedback_guard_v1') {
      if (afterGuardBackup) currentPrimary = false;
      return guardError ? { data:{ blocked:false, unknown:1 }, error:null } : { data:clearGuard(), error:null };
    }
    throw Error('Unexpected RPC: '+name);
  } };
  const runtime = createWebsiteQualifiedFeedback({ db, getConfig:()=>config,
    isPrimary:()=>currentPrimary, withPrimary:fn=>fn(), now:()=>NOW,
    fetchImpl:async()=>{ throw Error('External network forbidden'); },
    buildEligible:async input=>{
      calls.push({ source:input });
      if (sourceError) throw Error('private source phone 0900000000');
      if (afterSourceBackup) currentPrimary=false;
      return { rows, reconciliationRows:rows, reconciliationComplete:true,
        diagnostics:{ duplicate_or_returning:2, phone:'private', invalid:-1, 'bad/key':1 } };
    } });
  return { runtime, calls };
}

function loadRouter() {
  const filename=path.resolve(__dirname,'../src/routes/websiteFeedback.js'), module=new Module(filename);
  const actualRequire=createRequire(filename);
  module.filename=filename;
  module.require=name=>name==='../helpers/tenantScope'
    ? { isTenantScopeEnforced:req=>req?.tenantContext?.enforced===true } : actualRequire(name);
  module._compile(fs.readFileSync(filename,'utf8'),filename);
  return module.exports.createWebsiteFeedbackRouter;
}
const createRouter=loadRouter();
async function withServer({ runtime, noAuth=false, role='admin', company=COMPANY, tenant=[COMPANY], enforced=true,
  config=getWebsiteFeedbackConfig(environment()), failPreview=false, failRun=false, throwConfig=false, throwConfigAt=0,
  result={status:'held',reason_code:'META_HISTORY_REVIEW_REQUIRED',sent:0} }={}, run) {
  const calls={preview:0,drain:0,config:0};
  const service=runtime || { getConfig:()=>{ calls.config++; if (throwConfig || calls.config===throwConfigAt) throw Error('private configuration token'); return config; },
    preview:async()=>{ calls.preview++; if (failPreview) throw Error('private source fbc'); return { counts:{verified_receipted:0} }; },
    drain:async()=>{ calls.drain++; if (failRun) throw Error('private provider token'); return result; } };
  const app=express(); app.use(express.json());
  app.use('/api/website-feedback',createRouter({ runtime:service, authenticate:(req,res,next)=>{
    if (noAuth) return res.status(401).json({error:'auth'});
    req.user={role,company_id:company}; req.tenantContext={enforced}; req.tenantCompanyIds=tenant; next();
  } }));
  // An escaped exception is a test failure, not a silently added sanitizing API.
  app.use((error,req,res,next)=>res.status(599).json({reason_code:'UNCAUGHT_ROUTER_ERROR',message:error.message}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    await run(async(url,body)=>{
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/website-feedback${url}`,
        body===undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      return { status:response.status,cache:response.headers.get('cache-control'),body:await response.json() };
    },calls);
  } finally { await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}); }
}

test('unconfigured preview still reads fixed VPT CRM scope; delivery remains unknown and worker disabled',async()=>{
  const h=harness({ config:getWebsiteFeedbackConfig({}),rows:[candidate({delivery_supported:false,hold_reason:'META_CONSENT_REQUIRED'})] });
  const report=await h.runtime.preview();
  assert.equal(report.configured,false);assert.equal(report.enabled,false);assert.equal(report.scope.dataset_id,null);
  assert.equal(report.scope.company_id,COMPANY);assert.equal(report.scope.ad_account_id,TARGET.ad_account_id);
  assert.deepEqual(report.counts,{verified_receipted:1,meta_ready:0,meta_held:1});
  assert.equal(report.delivery.available,false);assert.equal(report.delivery.counts,null);
  assert.equal(h.calls.filter(c=>c.name).length,0);assert.equal(h.calls[0].source.companyId,COMPANY);
  assert.equal(h.calls[0].source.fromMs,NOW-60*DAY);assert.equal(h.calls[0].source.toMs,NOW);
  h.runtime.start();assert.equal((await h.runtime.drain()).status,'disabled');h.runtime.stop();
  assert.equal(h.calls.length,1);
});

test('preview bounds public rows, sanitizes counters and never returns matching/contact/qualification evidence',async()=>{
  const rows=Array.from({length:101},(_,i)=>candidate({lead_id:uuid(i+1),delivery_supported:i===0}));
  const report=await harness({rows}).runtime.preview();
  assert.equal(report.rows.length,100);assert.equal(report.counts.verified_receipted,101);
  assert.equal(report.counts.meta_ready,1);assert.equal(report.counts.meta_held,100);
  assert.deepEqual(report.diagnostics,{duplicate_or_returning:2});
  assert.equal(report.delivery.available,true);assert.equal(report.delivery.counts.accepted,0);
  assert.doesNotMatch(JSON.stringify(report),/private|0900000000|identity_key|context_hash|fbclid|fbc|fbp|qualification_id|evidence_ref|accessToken/);
  assert.equal(report.window.from,new Date(NOW-60*DAY).toISOString());
});

test('missing ledger or malformed guard never replaces unknown delivery with zero',async()=>{
  for (const patch of [{ledgerError:true},{guardError:true}]) {
    const report=await harness({...patch,rows:[candidate()]}).runtime.preview();
    assert.equal(report.counts.verified_receipted,1);assert.equal(report.delivery.available,false);
    assert.equal(report.delivery.counts,null);assert.deepEqual(report.delivery.rows,[]);assert.equal(report.delivery.guard,null);
  }
});

test('source outage and primary changes fail closed before releasing preview or touching backup',async()=>{
  for (const patch of [{sourceError:true},{afterSourceBackup:true},{afterGuardBackup:true}])
    await assert.rejects(harness(patch).runtime.preview());
  const h=harness({primary:false});await assert.rejects(h.runtime.preview(),/PRIMARY_REQUIRED/);assert.equal(h.calls.length,0);
});

test('wrong configured company is denied before any source read',async()=>{
  const h=harness({config:{target:{...TARGET,company_id:OTHER},mode:'production',enabled:false,ready:false}});
  await assert.rejects(h.runtime.preview(),/SCOPE_INVALID/);assert.equal(h.calls.length,0);
});

test('actual HTTP enforces authentication, role, company, tenant and caller scope before source access',async()=>{
  for (const options of [{noAuth:true},{role:'sales'},{role:'platform_admin'},{company:OTHER},{tenant:[OTHER]},
    {tenant:[]},{config:{target:{...TARGET,company_id:OTHER},enabled:true,ready:true}}])
    await withServer(options,async(send,calls)=>{
      const response=await send('/preview');assert.equal(response.status,options.noAuth?401:403);
      assert.equal(response.cache,'no-store');assert.equal(calls.preview,0);assert.equal(calls.drain,0);
    });
  await withServer({},async(send,calls)=>{
    assert.equal((await send('/preview?company_id='+OTHER)).status,403);
    assert.equal(calls.preview,0);assert.equal(calls.drain,0);
  });
});

test('actual HTTP keeps global tenant admin permitted and returns a real zero only after successful source read',async()=>{
  await withServer({company:null},async(send,calls)=>{
    const response=await send('/preview');assert.equal(response.status,200);assert.equal(response.cache,'no-store');
    assert.equal(response.body.counts.verified_receipted,0);assert.equal(calls.preview,1);
  });
});

test('actual HTTP plus real service returns public reconciliation only, without private matching data',async()=>{
  const h=harness({rows:[candidate()]});
  await withServer({runtime:h.runtime},async send=>{
    const response=await send('/preview');assert.equal(response.status,200);
    assert.equal(response.body.counts.verified_receipted,1);assert.equal(response.body.delivery.available,true);
    assert.equal(response.cache,'no-store');
    assert.doesNotMatch(JSON.stringify(response.body),/private|0900000000|identity_key|context_hash|fbclid|fbc|fbp|evidence_ref|accessToken/);
  });
});

test('actual HTTP source/delivery errors are sanitized JSON503 and never reveal upstream diagnostics',async()=>{
  await withServer({failPreview:true},async send=>{
    const response=await send('/preview');assert.equal(response.status,503);assert.equal(response.cache,'no-store');
    assert.equal(response.body.reason_code,'SOURCE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(response.body),/private|fbc|token/);
  });
  const enabled={...getWebsiteFeedbackConfig(environment()),enabled:true,ready:true};
  await withServer({config:enabled,failRun:true},async send=>{
    const response=await send('/run',{limit:1});assert.equal(response.status,503);
    assert.equal(response.body.reason_code,'DELIVERY_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(response.body),/private|token/);
  });
});

test('actual HTTP command refuses arbitrary destination, invalid limit and disabled/not-ready delivery',async()=>{
  const enabled={...getWebsiteFeedbackConfig(environment()),enabled:true,ready:true};
  await withServer({config:enabled},async(send,calls)=>{
    for (const body of [{dataset_id:'987'},{company_id:OTHER},{target:TARGET},{payload:{fbc:'private'}},
      {mode:'test'},{limit:0},{limit:21},{limit:'1'},[]]) assert.equal((await send('/run',body)).status,400);
    assert.equal(calls.drain,0);
    const held=await send('/run',{limit:1});assert.equal(held.status,200);
    assert.equal(held.body.status,'held');assert.equal(held.body.reason_code,'META_HISTORY_REVIEW_REQUIRED');assert.equal(held.body.sent,0);
    assert.equal(calls.drain,1);
  });
  for (const patch of [{enabled:false,ready:true},{enabled:true,ready:false}])
    await withServer({config:{...enabled,...patch}},async(send,calls)=>{
      assert.equal((await send('/run',{})).status,409);assert.equal(calls.drain,0);
    });
});

test('actual HTTP configuration exceptions are sanitized before reaching Express error handling',async()=>{
  await withServer({throwConfig:true},async send=>{
    for (const [url,body] of [['/preview',undefined],['/run',{}]]) {
      const response=await send(url,body);assert.equal(response.status,503);
      assert.doesNotMatch(JSON.stringify(response.body),/private|token|UNCAUGHT_ROUTER_ERROR/);
    }
  });
  const enabled={...getWebsiteFeedbackConfig(environment()),enabled:true,ready:true};
  await withServer({config:enabled,throwConfigAt:2},async(send,calls)=>{
    const response=await send('/run',{});assert.equal(response.status,503);assert.equal(calls.drain,0);
    assert.doesNotMatch(JSON.stringify(response.body),/private|token|UNCAUGHT_ROUTER_ERROR/);
  });
});

function googleFixture(consent) {
  const lead={id:uuid(1),company_id:COMPANY,type:'lead',is_test:false,customer_id:uuid(2),facebook_contact_id:null,
    phone:null,stage_id:uuid(4),created_at:'2026-10-02T01:00:00Z',
    intake_attribution:{kenh:'website',platform:'google',utm_source:'google',gclid:'Cj0_Synthetic_Only_Google_Click_123'},
    description:'VPT_V1 | 2026-10-02T00:59:00Z\ngclid: Cj0_Synthetic_Only_Google_Click_123',website_intake:consent};
  const customer={id:uuid(2),phone:'0901234567',created_at:'2026-10-02T00:59:30Z'};
  return {crm_leads:[lead],customers:[customer],lead_attribution:[],p1_qualification_events:[{
    id:uuid(3),company_id:COMPANY,canonical_lead_id:lead.id,revision:1,status:'QUALIFIED',contact_usable:true,
    need_in_scope:true,area_in_service:true,evidence_ref:'private-recording',actor_id:uuid(5),
    recorded_at:'2026-10-03T01:00:00Z',context_hash:qualificationContext(lead,customer)}]};
}
function queryDb(tables,{missingColumn=false}={}) {
  return {from(table){let rows=[...(tables[table]||[])],start=0,end=Infinity,columns='';
    const q={select(value){columns=value;return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},
      in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},
      then(resolve,reject){return Promise.resolve(missingColumn && columns.includes('website_intake')
        ? {error:Error('column website_intake missing'),data:null,count:null}
        : {data:rows.slice(start,end+1),count:rows.length,error:null}).then(resolve,reject);}};return q;}};
}
const googleBuild=(receipt,options)=>Google.buildGoogleQualifiedConversions({db:queryDb(googleFixture(receipt),options),
  companyId:COMPANY,fromMs:Date.parse('2026-10-01T00:00:00Z'),toMs:NOW});
test('new website measurement denial blocks verified Google export; explicit grant and legacy NULL retain scope',async()=>{
  for (const receipt of [{measurement_consent:false},{},{measurement_consent:'true'}]) {
    const result=await googleBuild(receipt);assert.equal(result.rows.length,0);
    assert.equal(result.diagnostics.measurement_consent_required,1);
    assert.doesNotMatch(Google.toQualifiedGoogleCsv(result.rows),/Synthetic_Only_Google_Click/);
  }
  assert.equal((await googleBuild({measurement_consent:true})).rows.length,1);
  assert.equal((await googleBuild(null)).rows.length,1);
});
test('missing website intake schema fails Google export instead of silently bypassing the consent gate',async()=>{
  await assert.rejects(googleBuild(null,{missingColumn:true}));
});
