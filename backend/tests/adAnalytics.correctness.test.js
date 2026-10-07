'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const baseline = process.env.AD_ANALYTICS_REGRESSION_BASELINE === '1';
const base = 'bb6f1f26a66905de7701947c0b03c82c41343061';
function source(file) {
  return baseline ? cp.execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
}
const routeSource = source('backend/src/routes/adAnalytics.js');
const uiSource = source('frontend/src/pages/AdAnalyticsPage.jsx');
const plain = (x) => JSON.parse(JSON.stringify(x));
const paths = ['/summary', '/ads', '/campaigns', '/pages'];
function fixture() {
  return {
    lead_attribution: [
      { lead_id: 'lead-one', fb_ad_id: 'ad-one', fb_page_id: 'page-one', fb_campaign_id: 'campaign-one', cham_dau_luc: '2026-10-01T01:00:00Z' },
      { lead_id: 'lead-one', fb_ad_id: 'ad-one', fb_page_id: 'page-one', fb_campaign_id: 'campaign-one', cham_dau_luc: '2026-10-01T02:00:00Z' },
    ],
    crm_leads: [{ id: 'lead-one', company_id: 'company-one', type: 'deal', actual_close_date: '2026-10-01', estimated_value: 100 }],
    lead_quality_scores: [{ lead_id: 'lead-one', diem: 80, nhan: 'nong' }],
    fb_ad_catalog: [{ ad_id: 'ad-one', campaign_id: 'campaign-one', campaign_name: 'Campaign' }],
    facebook_pages: [{ page_id: 'page-one', page_name: 'Page', default_company_id: 'company-one' }],
    fb_ad_spend_daily: [{ ad_id: 'ad-one', chi_tieu: 200, hien_thi: 1000, nhap: 20 }],
  };
}
function harness(tables, fault = null) {
  const handlers = new Map(); const calls = []; const logs = [];
  const router = { use() {} };
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
    router[method] = (url, ...functions) => handlers.set(`${method} ${url}`, functions.at(-1));
  }
  const db = { from(table) {
    const call = { table, ops: [], ordinal: calls.filter(c => c.table === table).length + 1 }; calls.push(call);
    const q = {};
    for (const op of ['select', 'in', 'not', 'limit', 'eq', 'neq', 'gte', 'lte', 'order', 'maybeSingle']) {
      q[op] = (...args) => { call.ops.push([op, ...args]); return q; };
    }
    q.then = (yes, no) => {
      const fail = fault?.table === table && (!fault.ordinal || call.ordinal === fault.ordinal);
      if (fail && fault.kind === 'reject') return Promise.reject(new Error('UPSTREAM_PRIVATE_DETAIL')).then(yes, no);
      if (fail && fault.kind === 'error') return Promise.resolve({ data: null, error: { message: 'UPSTREAM_PRIVATE_DETAIL' } }).then(yes, no);
      if (fail && fault.kind === 'invalid') return Promise.resolve({ data: null, error: null }).then(yes, no);
      let data = structuredClone(tables[table] || []);
      for (const [op, key, value] of call.ops) {
        if (op === 'in') data = data.filter((row) => value.includes(row[key]));
        if (op === 'eq') data = data.filter((row) => row[key] === value);
        if (op === 'neq') data = data.filter((row) => row[key] !== value);
        if (op === 'not' && value === 'is') data = data.filter((row) => row[key] != null);
      }
      if (call.ops.some(o => o[0] === 'maybeSingle')) data = data[0] || null;
      return Promise.resolve({ data, error: null }).then(yes, no);
    };
    return q;
  } };
  const module = { exports: {} };
  const dependencies = {
    express: { Router: () => router }, '../config/supabase': { supabase: db },
    '../middleware/auth': { auth() {} },
    '../helpers/adminRole': { isAdminLike: (u) => u.role === 'ecosystem_admin' },
    '../helpers/tenantScope': { isTenantScopeEnforced: () => true },
    '../helpers/adInsights': { chayPhanTich() { throw Error('write forbidden'); }, tomTat() {} },
    '../helpers/fbMarketingSync': { dongBoTatCa() { throw Error('write forbidden'); }, kiemTraKetNoi() {}, daCauHinh() {}, chuanHoaActId() {} },
  };
  const batchModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/src/helpers/supabaseLo.js'), 'utf8'), {
    module: batchModule, require(id) { assert.equal(id, '../config/supabase'); return {supabase: db}; },
    console: {warn() {}},
  });
  dependencies['../helpers/supabaseLo'] = batchModule.exports;
  function localHelper(name, deps) {
    const m={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'backend/src/helpers',name+'.js'),'utf8'),{
      module:m,console:{warn(){}},require(id) {
        if (!(id in deps)) throw Error('Unexpected helper import '+id);return deps[id];
      },
    });return m.exports;
  }
  const tenant={companyInTenantContext:(req,cid)=>req.tenantCompanyIds.includes(cid)};
  const roles=localHelper('crmAccessRoles',{'./adminRole':localHelper('adminRole',{})});
  dependencies['../helpers/adminRole']=localHelper('adminRole',{});
  const regions=localHelper('crmRegionScope',{'./crmAccessRoles':roles,'./tenantScope':tenant});
  const crmGate=localHelper('crmTaskLeadAccess',{'./tenantScope':tenant,'./crmAccessRoles':roles,'./crmRegionScope':regions,
    './crmLeadParticipantAccess':{userCanAccessCrmLeadAsParticipant:async()=>false,userCanAccessCrmLeadViaVisibility:async()=>false}});
  dependencies['../helpers/crmTaskLeadAccess']=crmGate;
  dependencies['../helpers/crmAccessRoles']=roles;
  dependencies['../helpers/crmRegionScope']=regions;
  const accessModule = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'backend/src/helpers/projectAccessScope.js'),'utf8'),{
    module:accessModule, console:{warn(){}}, require(id) {
      if(id==='../config/supabase') return {supabase:db};
      if(id==='./tenantScope') return {assertRowCompanyInTenant:(req,res,row)=>req.tenantCompanyIds.includes(row.company_id)};
      if(id==='./adminRole') return {isSystemAdmin:()=>false,isPlatformAdmin:()=>false,
        isAdminLike:u=>['sales_admin','ecosystem_admin'].includes(u.role),isProductionAdmin:()=>false,isLogisticsAdmin:()=>false};
      if(id==='./workshopCompanyScope') return {effectiveWorkshopCompanyId:()=>null};
      if(id==='./crmTaskLeadAccess') return crmGate;
      throw Error('Unexpected gate import '+id);
    },
  });
  dependencies['../helpers/projectAccessScope']=accessModule.exports;
  vm.runInNewContext(routeSource, { module, exports: module.exports, require(id) {
    if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
    return dependencies[id];
  }, console: { error: (...args) => logs.push(args.map(String).join(' ')), log() {}, warn() {} } }, { timeout: 1000 });
  return { calls, logs, async run(url, query = {}, user = { company_id: 'company-one', role: 'sales_admin' }, tenantCompanyIds = ['company-one']) {
    const res = { code: 200, body: null, status(n) { this.code = n; return this; }, json(x) { this.body = plain(x); return this; } };
    await handlers.get(`get ${url}`)({ query, user, tenantCompanyIds }, res);
    return res;
  } };
}
function bucket(url, response) { return url === '/summary' ? response.body.tu_quang_cao : response.body.data[0]; }
for (const url of paths) {
  test(`${url}: unique Lead, Deal and order value despite duplicate attribution`, async () => {
    const h = harness(fixture()); const r = await h.run(url);
    assert.equal(r.code, 200); const b = bucket(url, r);
    assert.equal(b.leads, 1); assert.equal(b.deals, 1); assert.equal(b.closed, 1); assert.equal(b.revenue, 100);
    assert.equal(b.quality_leads, 1); assert.equal(b.avg_score, 80); assert.equal(b.cost_per_lead, 200);
    assert.doesNotMatch(JSON.stringify(r.body), /_leadIds|_paidLeadIds|lead-one/);
    if (url === '/summary') assert.equal(r.body.tat_ca.leads, 1);
    if (url === '/pages') assert.equal(b.co_ad_id, 1);
  });
  for (const kind of ['error', 'reject', 'invalid']) {
    test(`${url}: CRM ${kind} is unavailable, never a successful zero`, async () => {
      const h = harness(fixture(), { table: 'crm_leads', kind }); const r = await h.run(url);
      assert.equal(r.code, 503); assert.equal(r.body.data_status, 'UNKNOWN');
      assert.equal(r.body.code, 'AD_ANALYTICS_CRM_UNAVAILABLE');
      assert.equal(r.body.data, undefined); assert.equal(r.body.tat_ca, undefined);
      assert.doesNotMatch(JSON.stringify(r.body) + h.logs.join(' '), /UPSTREAM_PRIVATE_DETAIL/);
    });
  }
  test(`${url}: no authorized leads remains an actual empty result`, async () => {
    const h = harness(fixture()); const r = await h.run(url, { company_id: 'outside-company' });
    assert.equal(r.code, 200);
    if (url === '/summary') assert.equal(r.body.tat_ca.leads, 0); else assert.deepEqual(r.body.data, []);
  });
  test(`${url}: truly empty attribution is not a CRM error`, async () => {
    const f = fixture(); f.lead_attribution = [];
    const h = harness(f); const r = await h.run(url);
    assert.equal(r.code, 200); assert.equal(h.calls.some((x) => x.table === 'crm_leads'), false);
  });
}
test('summary: organic then two ads still one total and one paid Lead', async () => {
  const f = fixture(); f.lead_attribution.unshift({ ...f.lead_attribution[0], fb_ad_id: null });
  f.lead_attribution.push({ ...f.lead_attribution[0], fb_ad_id: 'ad-two' });
  const r = await harness(f).run('/summary');
  assert.equal(r.body.tat_ca.leads, 1); assert.equal(r.body.tu_quang_cao.leads, 1); assert.equal(r.body.so_quang_cao, 2);
});
test('pages: paid unique count is independent of organic record ordering', async () => {
  const f = fixture(); f.lead_attribution.unshift({ ...f.lead_attribution[0], fb_ad_id: null });
  const r = await harness(f).run('/pages'); assert.equal(r.body.data[0].leads, 1); assert.equal(r.body.data[0].co_ad_id, 1);
});
test('campaigns: same label cannot merge different campaign IDs', async () => {
  const f = fixture(); f.lead_attribution[1].fb_ad_id = 'ad-two';
  f.fb_ad_catalog.push({ ad_id: 'ad-two', campaign_id: 'campaign-two', campaign_name: 'Campaign' });
  const r = await harness(f).run('/campaigns'); assert.equal(r.body.total, 2);
  assert.deepEqual(r.body.data.map((x) => x.campaign_id).sort(), ['campaign-one', 'campaign-two']);
});
test('campaigns: attribution ID is used before a manual name fallback', async () => {
  const f = fixture(); f.fb_ad_catalog = []; f.lead_attribution[1].fb_ad_id = 'ad-two';
  const r = await harness(f).run('/campaigns'); assert.equal(r.body.total, 1); assert.equal(r.body.data[0].campaign_id, 'campaign-one');
  assert.equal(r.body.data[0].leads, 1); assert.equal(r.body.data[0].so_quang_cao, 2);
  assert.equal(r.body.lead_chua_dat_ten_chien_dich, 1);
});
test('campaigns: legacy manual grouping remains available without IDs', async () => {
  const f = fixture(); for (const a of f.lead_attribution) a.fb_campaign_id = null;
  f.lead_attribution[1].fb_ad_id = 'ad-two'; f.fb_ad_catalog[0].campaign_id = null;
  f.fb_ad_catalog.push({ ad_id: 'ad-two', campaign_id: null, campaign_name: 'Campaign' });
  const r = await harness(f).run('/campaigns'); assert.equal(r.body.total, 1); assert.equal(r.body.data[0].campaign_id, null);
});
test('different real leads are not collapsed; company filtering remains intact', async () => {
  const f = fixture(); f.lead_attribution.push({ ...f.lead_attribution[0], lead_id: 'lead-two' }, { ...f.lead_attribution[0], lead_id: 'other-company-lead' });
  f.crm_leads.push({ ...f.crm_leads[0], id: 'lead-two' }, { ...f.crm_leads[0], id: 'other-company-lead', company_id: 'other-company' });
  const r = await harness(f).run('/summary'); assert.equal(r.body.tat_ca.leads, 2); assert.equal(r.body.tat_ca.revenue, 200);
});
test('UI: a failed read clears earlier figures instead of presenting them as current', async () => {
  const begin = 'const tai = useCallback(async () => {'; const end = '}, [tab, params]);';
  const start = uiSource.indexOf(begin); assert.notEqual(start, -1);
  const finish = uiSource.indexOf(end, start); assert.notEqual(finish, -1);
  const body = uiSource.slice(start + begin.length, finish); const state = {};
  const scope = { api: { get: async () => { throw { response: { data: { error: 'Unavailable' } } }; } }, params: {}, tab: 'ads', reportRequestId: { current: 0 } };
  for (const name of ['setDangTai', 'setLoi', 'setTongQuan', 'setRows', 'setNhanXet', 'setTomTat', 'setTinhLuc']) scope[name] = (v) => { state[name] = plain(v); };
  await vm.runInNewContext(`(async () => {${body}})()`, scope);
  assert.equal(state.setTongQuan, null); assert.deepEqual(state.setRows, []); assert.deepEqual(state.setNhanXet, []);
  assert.equal(state.setTomTat, null); assert.equal(state.setTinhLuc, null); assert.equal(state.setLoi, 'Unavailable'); assert.equal(state.setDangTai, false);
  assert.match(uiSource, /loi && !tongQuan/);
});

const pagePaths = ['/pages-profile', '/page-ads', '/page-posts', '/post-leads'];
const pageQuery = {page_id:'page-one', ad_id:'ad-one'};
function pageFixture(count = 1) {
  const f = fixture();
  f.companies = [{id:'company-one', name:'Synthetic company'}];
  f.crm_leads = Array.from({length:count}, (_, i) => ({...f.crm_leads[0], id:`lead-${i}`}));
  f.lead_attribution = f.crm_leads.flatMap(l => [0,1].map(() => ({...f.lead_attribution[0],
    lead_id:l.id, fb_post_id:'post-one', cham_dau_luc:new Date().toISOString()})));
  f.lead_quality_scores=[];
  return f;
}
for (const url of pagePaths) {
  test(`${url}: new view counts duplicate touchpoints once`, async () => {
    const r = await harness(pageFixture()).run(url, pageQuery);
    assert.equal(r.code,200);
    const stats=url==='/post-leads'?r.body.tom_tat:r.body.data[0];
    assert.equal(stats.leads,1); assert.equal(stats.closed,1);
    if(url==='/pages-profile') assert.equal(stats.lead_7_ngay,1);
  });
  test(`${url}: no Lead details outside company scope`, async () => {
    const r=await harness(pageFixture()).run(url,{...pageQuery,company_id:'outside'});
    assert.equal(r.code,200); assert.deepEqual(r.body.data,[]);
  });
  for (const kind of ['error','invalid','reject']) {
    test(`${url}: second CRM batch ${kind} fails entire report safely`, async () => {
      const h=harness(pageFixture(201),{table:'crm_leads',ordinal:2,kind});
      const r=await h.run(url,pageQuery);
      assert.equal(r.code,503); assert.equal(r.body.data_status,'UNKNOWN');
      assert.equal(r.body.data,undefined);
      assert.doesNotMatch(JSON.stringify(r.body)+h.logs.join(' '),/UPSTREAM_PRIVATE_DETAIL/);
    });
  }
  test(`${url}: batched read includes every Lead`, async () => {
    const h=harness(pageFixture(201)); const r=await h.run(url,pageQuery);
    assert.equal(r.code,200);
    assert.equal((url==='/post-leads'?r.body.tom_tat:r.body.data[0]).leads,201);
    for(const call of h.calls.filter(c=>c.table==='crm_leads')) {
      assert.ok(call.ops.find(o=>o[0]==='in')[2].length<=200);
    }
  });
}
test('post-leads: second detail read with invalid data is UNKNOWN',async()=>{
  const r=await harness(pageFixture(),{table:'crm_leads',ordinal:2,kind:'invalid'}).run('/post-leads',pageQuery);
  assert.equal(r.code,503);assert.equal(r.body.data_status,'UNKNOWN');
});
test('filter labels: count unique canonical Leads per Page and company',async()=>{
  const f=pageFixture();
  f.facebook_pages.push({...f.facebook_pages[0],page_id:'page-two'});
  f.lead_attribution.push({...f.lead_attribution[0],fb_page_id:'page-two'});
  const r=await harness(f).run('/bo-loc');
  assert.equal(r.code,200);assert.equal(r.body.cong_ty[0].lead_quang_cao,1);
  assert.deepEqual(r.body.pages.map(p=>p.lead_quang_cao),[1,1]);
});
test('filter labels: unavailable CRM count is null, not zero',async()=>{
  const r=await harness(pageFixture(),{table:'crm_leads',kind:'error'}).run('/bo-loc');
  assert.equal(r.code,200);assert.equal(r.body.cong_ty[0].lead_quang_cao,null);
  assert.equal(r.body.pages[0].lead_quang_cao,null);
});

for(const direct of [false,true]) {
  test(`post-leads: canonical project gate hides foreign ${direct?'direct project':'shared-customer project'}`,async()=>{
    const f=pageFixture();
    const own='11111111-1111-4111-8111-111111111111', foreign='22222222-2222-4222-8222-222222222222';
    f.crm_leads[0].customer_id='shared-customer';f.crm_leads[0].project_id=direct?foreign:own;
    f.projects=[{id:own,company_id:'company-one',customer_id:'shared-customer',name:'Authorized project',final_value:100},
      {id:foreign,company_id:'outside-company',customer_id:'shared-customer',name:'FOREIGN_PRIVATE_PROJECT',final_value:999999}];
    const r=await harness(f).run('/post-leads',pageQuery);
    assert.equal(r.code,200);assert.equal(r.body.tom_tat.so_du_an,1);
    assert.deepEqual(r.body.data[0].du_an.map(d=>d.id),[own]);
    assert.doesNotMatch(JSON.stringify(r.body),/FOREIGN_PRIVATE_PROJECT|999999/);
  });
}
test('post-leads: project permission read failure is unavailable, not allowed',async()=>{
  const f=pageFixture();f.crm_leads[0].project_id='11111111-1111-4111-8111-111111111111';
  f.projects=[{id:f.crm_leads[0].project_id,company_id:'company-one'}];
  // Two batched project joins are built, then canonical permission gate reads project.
  const r=await harness(f,{table:'projects',ordinal:2,kind:'error'}).run('/post-leads',pageQuery);
  assert.equal(r.code,500);assert.equal(r.body.data_status,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(r.body),/UPSTREAM_PRIVATE_DETAIL/);
});

const regionA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',regionB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
for(const role of ['sales_admin','admin','crm_production_admin','region_admin']) {
  test(`${role}: company admin cannot request another company inside the same tenant`,async()=>{
    const f=pageFixture();f.crm_leads[0].company_id='company-two';
    const r=await harness(f).run('/post-leads',{...pageQuery,company_id:'company-two'},
      {role,company_id:'company-one'},['company-one','company-two']);
    assert.equal(r.code,200);assert.deepEqual(r.body.data,[]);
  });
}
test('sales_admin without company has no report scope',async()=>{
  const r=await harness(pageFixture()).run('/summary',{}, {role:'sales_admin'},['company-one','company-two']);
  assert.equal(r.code,200);assert.equal(r.body.tat_ca.leads,0);
});
test('ecosystem admin retains access across companies inside its tenant',async()=>{
  const f=pageFixture();f.crm_leads[0].company_id='company-two';
  const r=await harness(f).run('/summary',{}, {role:'ecosystem_admin'},['company-one','company-two']);
  assert.equal(r.code,200);assert.equal(r.body.tat_ca.leads,1);
});
for(const scenario of [
  {role:'sales',owner:'other',regions:[regionA],leadRegion:regionA,allowed:false},
  {role:'sales',owner:'viewer',regions:[regionA],leadRegion:regionA,allowed:true},
  {role:'sales_admin',owner:'other',regions:[],leadRegion:regionB,allowed:true},
  {role:'region_admin',owner:'other',regions:[regionA],leadRegion:regionB,allowed:false},
  {role:'region_admin',owner:'other',regions:[regionA],leadRegion:regionA,allowed:true},
]) {
  test(`post-leads: ${scenario.role} owner=${scenario.owner} region=${scenario.leadRegion===regionA?'A':'B'} allowed=${scenario.allowed}`,async()=>{
    const f=pageFixture();Object.assign(f.crm_leads[0],{title:'PRIVATE_LEAD_TITLE',assigned_to:scenario.owner,
      region_id:scenario.leadRegion,customer_id:'private-customer'});
    f.customers=[{id:'private-customer',phone:'SYNTHETIC_PRIVATE_PHONE'}];
    const h=harness(f);const r=await h.run('/post-leads',pageQuery,{company_id:'company-one',userId:'viewer',role:scenario.role,crm_region_ids:scenario.regions});
    assert.equal(r.code,200);assert.equal(r.body.data.length,scenario.allowed?1:0);
    if(!scenario.allowed) {
      assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_LEAD_TITLE|SYNTHETIC_PRIVATE_PHONE/);
      assert.equal(h.calls.some(c=>c.table==='customers'),false,'Denied details must not trigger downstream customer lookup');
    }
  });
}
