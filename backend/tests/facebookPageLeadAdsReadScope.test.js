'use strict';

// Execute the actual route, Page-scope resolver and role predicates without app
// startup. Tenant attachment/social-inbox lookup and storage are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const roles = require('../src/helpers/adminRole');
const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/facebook.js'), 'utf8');
const tenantSource = fs.readFileSync(path.resolve(__dirname, '../src/helpers/tenantScope.js'), 'utf8');
function functionText(name, source = routeSource) {
  const start = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(source);
  assert.ok(start);
  const closing = /^}\r?$/mg; closing.lastIndex = start.index;
  const end = closing.exec(source); assert.ok(end);
  return source.slice(start.index, end.index + 1);
}
function harness(options = {}) {
  const state = { queries: [], status: 200, body: undefined };
  const pages = options.pages || [
    { page_id: '10001', default_company_id: 'company-a' },
    { page_id: '10002', default_company_id: 'company-b' },
    { page_id: '10003', default_company_id: 'company-c' },
  ];
  const ads = [
    { id: 'ad-a', page_id: '10001', full_name: 'Synthetic A', phone: '0901111111' },
    { id: 'ad-b', page_id: '10002', full_name: 'Synthetic B', phone: '0902222222' },
    { id: 'ad-c', page_id: '10003', full_name: 'Synthetic C', phone: '0903333333' },
  ];
  const db = { from(table) {
    const entry = { table, filters: [] }; state.queries.push(entry);
    const query = {
      select(columns) { entry.columns = columns; return query; },
      eq(key, value) { entry.filters.push({ key, values: [value] }); return query; },
      in(key, values) { entry.filters.push({ key, values: [...values] }); return query; },
      order(key, value) { entry.order = { key, ...value }; return query; },
      limit(value) { entry.limit = value; return query; },
      then(resolve, reject) {
        const get = async () => {
          assert.ok(['facebook_pages', 'facebook_lead_ads'].includes(table));
          if (options.throwTable === table) throw new Error('SYNTHETIC_PRIVATE_DB_ERROR');
          if (options.errorTable === table) return { data: null, error: { message: 'SYNTHETIC_PRIVATE_DB_ERROR' } };
          if (options.nullTable === table) return { data: null, error: null };
          const rows = table === 'facebook_pages' ? pages : ads;
          return { data: options.ignoreFilters && table === 'facebook_lead_ads' ? rows
            : rows.filter(row => entry.filters.every(filter => filter.values.includes(row[filter.key]))), error: null };
        };
        return get().then(resolve, reject);
      },
    };
    return query;
  } };
  let handler;
  const context = vm.createContext({
    ...roles, supabase: db, authMiddleware() {}, r: { get(_route, _auth, fn) { handler = fn; } },
    attachTenantContext: async req => {
      if (options.tenantDenied) throw Object.assign(new Error('Tenant unavailable'), { statusCode: 403 });
      req.tenantContext = options.tenant || { enforced: true, tenantId: 'tenant-a' };
      req.tenantCompanyIds = options.tenantCompanies || ['company-a', 'company-b'];
    },
    resolveCrmSocialInboxCompanyId: async () => options.socialCompany || null,
  });
  for (const name of ['isTenantScopeEnforced', 'companyInTenantContext']) vm.runInContext(functionText(name, tenantSource), context);
  for (const name of ['ensureFacebookTenantContext', 'isFacebookHstAdmin', 'resolveFacebookPageScope', 'contactAllowedByFacebookScope']) {
    vm.runInContext(functionText(name), context);
  }
  if (options.scopeOverride) context.resolveFacebookPageScope = async () => options.scopeOverride;
  const start = routeSource.indexOf("r.get('/lead-ads',");
  assert.notEqual(start, -1); const end = routeSource.indexOf('\n});', start);
  vm.runInContext(routeSource.slice(start, end + 4), context);
  const res = { status(value) { state.status = value; return res; }, json(value) { state.body = value; return res; } };
  return { state, async run(user = { role: 'sales', company_id: 'company-a' }, query = {}) {
    await handler({ user, query }, res); return state;
  } };
}
const adsQueries = state => state.queries.filter(query => query.table === 'facebook_lead_ads');

for (const role of ['sales', 'admin', 'sales_admin']) {
  test(role + ' stays inside its company Pages even when query requests a sibling company', async () => {
    const h = harness(); const result = await h.run({ role, company_id: 'company-a' }, { company_id: 'company-b' });
    assert.equal(result.status, 200); assert.deepEqual(Array.from(result.body, row => row.id), ['ad-a']);
    assert.deepEqual(adsQueries(result)[0].filters, [{ key: 'page_id', values: ['10001'] }]);
    assert.equal(adsQueries(result)[0].limit, 100);
  });
}
test('explicit foreign Page is denied before any Lead Ads read', async () => {
  const h = harness(); const result = await h.run({ role: 'sales', company_id: 'company-b' }, { page_id: '10001' });
  assert.equal(result.status, 403); assert.equal(adsQueries(result).length, 0);
  assert.equal(JSON.stringify(result.body).includes('Synthetic A'), false);
});
test('explicit allowed Page narrows a tenant admin request in the database', async () => {
  const h = harness(); const result = await h.run({ role: 'ecosystem_admin', tenant_id: 'tenant-a' }, { page_id: '10002' });
  assert.equal(result.status, 200); assert.deepEqual(Array.from(result.body, row => row.id), ['ad-b']);
  assert.deepEqual(adsQueries(result)[0].filters, [{ key: 'page_id', values: ['10002'] }]);
});
test('tenant admin sees only tenant companies and cannot request a foreign company', async () => {
  const h = harness(); const result = await h.run({ role: 'ecosystem_admin', tenant_id: 'tenant-a' });
  assert.deepEqual(Array.from(result.body, row => row.id), ['ad-a', 'ad-b']);
  const foreign = harness(); const denied = await foreign.run({ role: 'ecosystem_admin', tenant_id: 'tenant-a' }, { company_id: 'company-c' });
  assert.equal(denied.status, 403); assert.equal(adsQueries(denied).length, 0);
});
test('canonical system-wide scope retains its allowed all-Page behavior', async () => {
  const h = harness({ tenant: { enforced: false } });
  const result = await h.run({ role: 'admin' });
  assert.equal(result.status, 200); assert.equal(result.body.length, 3);
  assert.deepEqual(adsQueries(result)[0].filters, []);
});
test('social-inbox forced company is respected', async () => {
  const h = harness({ socialCompany: 'company-b' }); const result = await h.run();
  assert.deepEqual(Array.from(result.body, row => row.id), ['ad-b']);
});
test('user without company scope cannot query Lead Ads', async () => {
  const h = harness(); const result = await h.run({ role: 'sales' });
  assert.equal(result.status, 400); assert.equal(adsQueries(result).length, 0);
});
test('empty allowed Page set returns an empty list without unfiltered fallback', async () => {
  const h = harness({ pages: [] }); const result = await h.run();
  assert.equal(result.status, 200); assert.equal(result.body.length, 0); assert.equal(adsQueries(result).length, 0);
});
test('tenant attachment denial stops before any data query', async () => {
  const h = harness({ tenantDenied: true }); const result = await h.run();
  assert.equal(result.status, 403); assert.equal(result.queries.length, 0);
});
for (const failure of ['errorTable', 'throwTable']) {
  test('Page scope ' + failure + ' never falls through to an unfiltered Lead Ads read', async () => {
    const h = harness({ [failure]: 'facebook_pages' }); const result = await h.run();
    assert.equal(result.status, 500); assert.equal(adsQueries(result).length, 0);
  });
}
for (const failure of ['errorTable', 'throwTable', 'nullTable']) {
  test('Lead Ads ' + failure + ' returns a safe error instead of a false empty success', async () => {
    const h = harness({ [failure]: 'facebook_lead_ads' }); const result = await h.run();
    assert.equal(result.status, 500); assert.equal(result.body.error, 'Không đọc được danh sách Lead Ads.');
    assert.equal(JSON.stringify(result.body).includes('SYNTHETIC_PRIVATE'), false);
  });
}
test('unexpected foreign row in a scoped result is rejected before returning PII', async () => {
  const h = harness({ ignoreFilters: true }); const result = await h.run();
  assert.equal(result.status, 500); assert.equal(result.body.error, 'Không đọc được danh sách Lead Ads.');
  assert.equal(JSON.stringify(result.body).includes('Synthetic B'), false);
});
for (const scope of [{ mode: 'unexpected' }, { mode: 'filter' }, { mode: 'filter', pageIds: [null] }]) {
  test('invalid scope object fails closed: ' + JSON.stringify(scope), async () => {
    const h = harness({ scopeOverride: scope }); const result = await h.run();
    assert.equal(result.status, 500); assert.equal(adsQueries(result).length, 0);
  });
}
