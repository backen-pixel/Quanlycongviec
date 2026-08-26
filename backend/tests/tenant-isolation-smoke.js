/**
 * Smoke tests tenant isolation (no live server / DB required).
 * Run: node tests/tenant-isolation-smoke.js
 */

const assert = require('assert');
const {
  applyCompanyTenantScope,
  applyProjectTenantScope,
  companyInTenantContext,
  intersectCompanyIdsWithTenant,
  assertCompanyAccessible,
  assertRowCompanyInTenant,
  TENANT_EMPTY_COMPANY_SENTINEL,
} = require('../src/helpers/tenantScope');
const { guardTenantCompanyParams, normalizeCompanyParamValues } = require('../src/middleware/tenantGate');
const { applyCrmLeadRegionFilterToQuery } = require('../src/helpers/crmRegionScope');

function mockQuery() {
  const calls = [];
  const q = {
    _calls: calls,
    eq(col, val) { calls.push(['eq', col, val]); return q; },
    in(col, vals) { calls.push(['in', col, vals]); return q; },
    or(filter) { calls.push(['or', filter]); return q; },
  };
  return q;
}

function mockReq(tenantId, companyIds, user = {}) {
  const enforced = !!tenantId;
  return {
    user: { userId: 'u1', tenant_id: tenantId, role: 'admin', ...user },
    tenantContext: enforced ? { enforced: true, tenantId, companyIds } : { enforced: false },
    tenantCompanyIds: companyIds || [],
    query: {},
    body: {},
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function run() {
  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const co1 = '11111111-1111-1111-1111-111111111111';
  const co2 = '22222222-2222-2222-2222-222222222222';
  const coOther = '99999999-9999-9999-9999-999999999999';

  // Legacy bypass
  assert.strictEqual(companyInTenantContext(mockReq(null, []), coOther), true);

  // Enforced tenant
  const reqA = mockReq(tenantA, [co1, co2]);
  assert.strictEqual(companyInTenantContext(reqA, co1), true);
  assert.strictEqual(companyInTenantContext(reqA, coOther), false);

  // applyCompanyTenantScope
  const q1 = mockQuery();
  applyCompanyTenantScope(q1, reqA);
  assert.deepStrictEqual(q1._calls, [['in', 'company_id', [co1, co2]]]);

  const qEmpty = mockQuery();
  applyCompanyTenantScope(qEmpty, mockReq(tenantA, []));
  assert.deepStrictEqual(qEmpty._calls, [['eq', 'company_id', TENANT_EMPTY_COMPANY_SENTINEL]]);

  // applyProjectTenantScope
  const qProj = mockQuery();
  applyProjectTenantScope(qProj, reqA);
  assert.ok(qProj._calls.some((c) => c[0] === 'or' && c[1].includes(co1)));

  // intersect
  assert.deepStrictEqual(
    intersectCompanyIdsWithTenant(reqA, [co1, coOther]),
    [co1],
  );

  // assertCompanyAccessible
  const resOk = mockRes();
  assert.strictEqual(assertCompanyAccessible(reqA, resOk, co1), true);
  const resDeny = mockRes();
  assert.strictEqual(assertCompanyAccessible(reqA, resDeny, coOther), false);
  assert.strictEqual(resDeny.statusCode, 403);

  // assertRowCompanyInTenant — project with logistics_company_id
  const resProj = mockRes();
  assert.strictEqual(
    assertRowCompanyInTenant(reqA, resProj, { company_id: coOther, logistics_company_id: co2 }),
    true,
  );

  // guardTenantCompanyParams
  const reqGuard = mockReq(tenantA, [co1]);
  reqGuard.query = { company_id: coOther };
  const resGuard = mockRes();
  let nextCalled = false;
  guardTenantCompanyParams(reqGuard, resGuard, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(resGuard.statusCode, 403);

  reqGuard.query = { company_id: co1 };
  nextCalled = false;
  guardTenantCompanyParams(reqGuard, resGuard, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);

  // Danh sách company_id: hỗ trợ CSV, JSON string và array; chỉ một ID ngoài tenant là bị chặn.
  assert.deepStrictEqual(normalizeCompanyParamValues(`${co1},${co2}`), [co1, co2]);
  assert.deepStrictEqual(normalizeCompanyParamValues(JSON.stringify([co1, co2])), [co1, co2]);
  assert.deepStrictEqual(normalizeCompanyParamValues([co1, co2]), [co1, co2]);
  assert.deepStrictEqual(normalizeCompanyParamValues('all'), []);

  const reqListGuard = mockReq(tenantA, [co1, co2]);
  reqListGuard.query = { company_ids: `${co1},${coOther}` };
  const resListGuard = mockRes();
  nextCalled = false;
  guardTenantCompanyParams(reqListGuard, resListGuard, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(resListGuard.statusCode, 403);

  const reqExecutorGuard = mockReq(tenantA, [co1]);
  reqExecutorGuard.body = { executor_company_id: coOther };
  const resExecutorGuard = mockRes();
  nextCalled = false;
  guardTenantCompanyParams(reqExecutorGuard, resExecutorGuard, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(resExecutorGuard.statusCode, 403);

  // CRM region filter chains tenant scope
  const qCrm = mockQuery();
  applyCrmLeadRegionFilterToQuery(qCrm, reqA);
  assert.ok(qCrm._calls.some((c) => c[0] === 'in' && c[1] === 'company_id'));

  console.log('✅ tenant-isolation-smoke: all passed');
}

run().catch((e) => {
  console.error('❌ tenant-isolation-smoke failed:', e);
  process.exit(1);
});
