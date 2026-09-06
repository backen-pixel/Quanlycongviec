const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {
  CONTRACT_VERSION,
  MODE,
  MODULE_STATUSES,
  FounderCockpitError,
  buildPeriodRange,
  resolveFounderCockpitScope,
  loadFounderCockpit,
} = require('../src/helpers/founderCockpitReadModel');
const businessOsRouter = require('../src/routes/businessOs');

const ECOSYSTEM_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMPANY_OUTSIDE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-09-02T08:00:00.000Z');
const VERIFIED_GATES = { permission: true, audit: true, verification: true };

function companies() {
  return [
    { id: COMPANY_A, tenant_id: ECOSYSTEM_ID, name: 'Xưởng A', short_name: 'A', is_active: true },
    { id: COMPANY_B, tenant_id: ECOSYSTEM_ID, name: 'Xưởng B', short_name: 'B', is_active: true },
  ];
}

function readers(overrides = {}) {
  return {
    companies: async () => companies(),
    crm: async ({ companyId }) => ({
      company_id: companyId,
      summary: {
        lead_count: companyId === COMPANY_A ? 8 : 3,
        deal_count: 2,
        customer_order_count: 1,
        closed_won_count: 1,
        closed_won_value: 100,
        pipeline_value: 500,
        overdue_count: 1,
        kpi_ledger_net: 10,
      },
    }),
    workload: async ({ companyId }) => ({
      total: companyId === COMPANY_A ? 8 : 4,
      open: companyId === COMPANY_A ? 5 : 2,
      overdue: companyId === COMPANY_A ? 2 : 0,
      done: 3,
      by_module: { crm: 2, production: 3, logistics: 1, assignment: 1, personal: 0, other: 1 },
      by_status: { pending: 2, in_progress: 3, done: 3, other: 0 },
    }),
    projects: async () => ([
      { id: 'p-a', company_id: COMPANY_A, status: 'producing', sx_kanban_column_id: 'sx-a', production_deadline: '2026-09-01', updated_at: '2026-09-02T01:00:00Z' },
      { id: 'p-b', company_id: COMPANY_B, logistics_company_id: COMPANY_A, status: 'shipping', vc_kanban_column_id: 'vc-b', deadline: '2026-09-06', updated_at: '2026-09-02T02:00:00Z' },
    ]),
    people: async () => ([
      { id: 'u-a1', company_id: COMPANY_A, is_active: true },
      { id: 'u-a2', company_id: COMPANY_A, is_active: true },
      { id: 'u-b1', company_id: COMPANY_B, is_active: true },
    ]),
    procurement: async () => ([
      { id: 'pr-a', company_id: COMPANY_A, project_id: 'p-a', status: 'delayed', qc_status: 'pending', updated_at: '2026-09-02T03:00:00Z' },
      { id: 'pr-b', company_id: COMPANY_B, project_id: 'p-b', status: 'qc_fail', qc_status: 'fail', updated_at: '2026-09-02T04:00:00Z' },
    ]),
    approvals: async () => ([
      { id: 'approval-a', project_id: 'p-a', status: 'pending', created_at: '2026-09-02T05:00:00Z' },
    ]),
    modules: async () => ([
      { module_key: 'production', name: 'Sản xuất', is_active: true, company_ids: [COMPANY_A, COMPANY_B] },
      { module_key: 'crm', name: 'CRM', is_active: true, company_ids: [] },
      { module_key: 'private-other-tenant', name: 'Không được lộ', is_active: true, company_ids: [COMPANY_OUTSIDE] },
    ]),
    accounting: async ({ companyId }) => ({
      client_company_id: companyId,
      total_deals: 2,
      total_estimated_value: 500,
      total_production_value: 300,
      total_invoiced_value: 100,
      total_outstanding_value: 200,
      count_not_invoiced: 1,
      count_sx_done_not_invoiced: 0,
    }),
    ...overrides,
  };
}

function ecosystemScope() {
  return {
    ecosystem_id: ECOSYSTEM_ID,
    company_id: null,
    company_ids: [COMPANY_A, COMPANY_B],
    level: 'ecosystem',
    companies: companies().map(({ id, name, short_name }) => ({ id, name, short_name })),
  };
}

function tenantAdmin(overrides = {}) {
  return { userId: USER_ID, id: USER_ID, role: 'admin', tenant_id: ECOSYSTEM_ID, ...overrides };
}

test('calendar periods are deterministic and reject invalid input', () => {
  assert.deepEqual(buildPeriodRange('week', '2026-09-02', NOW), {
    key: 'week', anchor: '2026-09-02', start_at: '2026-08-31', end_at: '2026-09-06',
    label: 'Tuần 2026-08-31 → 2026-09-06',
  });
  assert.equal(buildPeriodRange('month', '2026-09-02', NOW).end_at, '2026-09-30');
  assert.equal(buildPeriodRange('quarter', '2026-09-02', NOW).start_at, '2026-07-01');
  assert.throws(() => buildPeriodRange('year', '2026-09-02', NOW), (error) => (
    error instanceof FounderCockpitError && error.code === 'BUSINESS_OS_PERIOD_INVALID'
  ));
});

test('company and ecosystem scope fail closed', async () => {
  const companyUserReq = {
    user: tenantAdmin({ role: 'manager', company_id: COMPANY_A }),
    query: { ecosystem_id: ECOSYSTEM_ID, company_id: COMPANY_B },
    tenantContext: { enforced: true, tenantId: ECOSYSTEM_ID },
    tenantCompanyIds: [COMPANY_A, COMPANY_B],
  };
  await assert.rejects(
    resolveFounderCockpitScope(companyUserReq, { readers: readers() }),
    (error) => error.code === 'BUSINESS_OS_COMPANY_DENIED' && error.status === 403,
  );

  const wrongEcosystemReq = {
    user: tenantAdmin(),
    query: { ecosystem_id: '99999999-9999-4999-8999-999999999999', company_id: 'all' },
    tenantContext: { enforced: true, tenantId: ECOSYSTEM_ID },
    tenantCompanyIds: [COMPANY_A, COMPANY_B],
  };
  await assert.rejects(
    resolveFounderCockpitScope(wrongEcosystemReq, { readers: readers() }),
    (error) => error.code === 'BUSINESS_OS_ECOSYSTEM_DENIED' && error.status === 403,
  );

  const adminReq = {
    user: tenantAdmin(),
    query: { ecosystem_id: ECOSYSTEM_ID, company_id: 'all' },
    tenantContext: { enforced: true, tenantId: ECOSYSTEM_ID },
    tenantCompanyIds: [COMPANY_A, COMPANY_B],
  };
  const scope = await resolveFounderCockpitScope(adminReq, { readers: readers() });
  assert.equal(scope.level, 'ecosystem');
  assert.equal(scope.company_id, null);
  assert.deepEqual(scope.company_ids, [COMPANY_A, COMPANY_B]);
});

test('Founder Cockpit composes six systems and truthful read-only operational contracts', async () => {
  const payload = await loadFounderCockpit({
    scope: ecosystemScope(),
    user: tenantAdmin(),
    period: 'week',
    periodAnchor: '2026-09-02',
    now: NOW,
    readers: readers(),
    gateContext: VERIFIED_GATES,
  });

  assert.equal(payload.contract_version, CONTRACT_VERSION);
  assert.equal(payload.mode, MODE);
  assert.equal(payload.systems.length, 6);
  assert.equal(payload.modules.length, 15);
  assert.ok(payload.modules.every((module) => MODULE_STATUSES.includes(module.status)));
  assert.ok(payload.modules.every((module) => module.activation_status === module.status));
  assert.ok(payload.modules.every((module) => module.metrics && typeof module.metrics === 'object' && !Array.isArray(module.metrics)));
  assert.ok(payload.modules.every((module) => module.gates && Object.values(module.gates).every((value) => typeof value === 'boolean')));
  assert.ok(payload.modules.filter((module) => module.status === 'LIVE').every((module) => (
    Object.values(module.gates).every(Boolean) && module.data_gaps.length === 0
  )), 'LIVE chỉ được dùng khi toàn bộ gate đạt và không còn data gap');
  assert.deepEqual(payload.systems.map((system) => system.label), [
    'Tư tưởng & Thị trường',
    'Tư duy & Giải pháp',
    'Nguồn lực & Năng lực',
    'Vận hành & Giao giá trị',
    'Báo cáo & Sự thật',
    'Sửa chữa & Tiến hóa',
  ]);
  assert.deepEqual(payload.planning.horizons.map((item) => item.key), ['week', 'month', 'quarter']);
  assert.equal(payload.workload.open, 7);
  assert.equal(payload.capacity.active_people, 3);
  assert.equal(payload.capacity.capacity_target, null);
  assert.equal(payload.manufacturing_companies.length, 2);
  assert.deepEqual(payload.manufacturing_companies.map((item) => item.company.id).sort(), [COMPANY_A, COMPANY_B].sort());
  assert.equal(payload.modules.find((module) => module.key === 'warranty_care').status, 'NOT CONNECTED');
  assert.ok(payload.decision_center.items.every((item) => Array.isArray(item.evidence) && item.evidence.length > 0));
  assert.equal(payload.configuration_center.read_only, true);
  assert.ok(payload.configuration_center.modules.length >= 15);
  assert.ok(!payload.configuration_center.modules.some((module) => module.key === 'private-other-tenant'));
  assert.equal(payload.protections.write_enabled, false);
  assert.equal(payload.protections.direct_database_write_enabled, false);
  assert.equal(payload.protections.synthetic_fallback_enabled, false);
  assert.deepEqual(payload.protections.actions, []);
  assert.ok(payload.drilldowns.every((item) => item.href.startsWith('/')));
});

test('unavailable real sources become null/data-gap states, never synthetic zeroes', async () => {
  const payload = await loadFounderCockpit({
    scope: ecosystemScope(),
    user: tenantAdmin(),
    period: 'week',
    periodAnchor: '2026-09-02',
    now: NOW,
    readers: readers({ crm: async () => { throw new Error('offline'); } }),
    gateContext: VERIFIED_GATES,
  });
  assert.equal(payload.modules.find((module) => module.key === 'crm').status, 'NOT CONNECTED');
  assert.equal(payload.modules.find((module) => module.key === 'crm').metrics.lead_count, null);
  assert.ok(payload.modules.find((module) => module.key === 'crm').data_gaps.length > 0);
  assert.equal(payload.protections.synthetic_fallback_enabled, false);
});

test('module activation preserves canonical per-company registry coverage', async () => {
  const payload = await loadFounderCockpit({
    scope: ecosystemScope(),
    user: tenantAdmin(),
    period: 'week',
    periodAnchor: '2026-09-02',
    now: NOW,
    readers: readers({
      modules: async () => ([
        { module_key: 'production', name: 'Sản xuất', is_active: true, company_ids: [COMPANY_A] },
        { module_key: 'crm', name: 'CRM', is_active: true, company_ids: [] },
      ]),
    }),
    gateContext: VERIFIED_GATES,
  });
  const production = payload.modules.find((module) => module.key === 'production');
  assert.deepEqual(production.activation.company_ids, [COMPANY_A]);
  assert.equal(production.activation.basis, 'app_module_registry');
  assert.ok(production.data_gaps.some((gap) => gap.code === 'MODULE_PARTIAL_COMPANY_COVERAGE'));
  const crm = payload.modules.find((module) => module.key === 'crm');
  assert.deepEqual(crm.activation.company_ids.sort(), [COMPANY_A, COMPANY_B].sort());
});

test('unproven permission, audit, or verification gates cannot publish LIVE', async () => {
  const payload = await loadFounderCockpit({
    scope: ecosystemScope(),
    user: tenantAdmin(),
    period: 'week',
    periodAnchor: '2026-09-02',
    now: NOW,
    readers: readers(),
  });
  assert.equal(payload.modules.some((module) => module.status === 'LIVE'), false);
  assert.ok(payload.modules.some((module) => module.status === 'UNDER RECONCILIATION'));
});

test('a source returning another company is blocked before a cockpit payload is emitted', async () => {
  await assert.rejects(
    loadFounderCockpit({
      scope: ecosystemScope(),
      user: tenantAdmin(),
      period: 'week',
      periodAnchor: '2026-09-02',
      now: NOW,
      readers: readers({
        crm: async () => ({ company_id: COMPANY_OUTSIDE, summary: {} }),
      }),
      gateContext: VERIFIED_GATES,
    }),
    (error) => error.code === 'BUSINESS_OS_SCOPE_RECONCILIATION_FAILED' && error.status === 503,
  );
});

test('GET /api/business-os requires auth and serves the aggregate contract', async (t) => {
  const authMiddleware = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test') return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.user = req.headers['x-test-platform-admin'] === '1'
      ? tenantAdmin({ role: 'platform_admin' })
      : req.headers['x-test-non-founder'] === '1'
      ? tenantAdmin({ role: 'production' })
      : req.headers['x-test-company-scoped'] === '1'
      ? tenantAdmin({ role: 'admin', company_id: COMPANY_A })
      : tenantAdmin();
    req.tenantContext = { enforced: true, tenantId: ECOSYSTEM_ID };
    req.tenantCompanyIds = [COMPANY_A, COMPANY_B];
    return next();
  };
  const router = businessOsRouter.createBusinessOsRouter({
    authMiddleware,
    permissionMiddleware: (_req, _res, next) => next(),
    readers: readers(),
  });
  const app = express();
  app.use('/api/business-os', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await fetch(`${base}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}`);
  assert.equal(unauthorized.status, 401);

  const nonFounder = await fetch(`${base}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}`, {
    headers: { Authorization: 'Bearer test', 'X-Test-Non-Founder': '1' },
  });
  assert.equal(nonFounder.status, 403);
  assert.equal((await nonFounder.json()).code, 'BUSINESS_OS_FOUNDER_ACCESS_REQUIRED');

  const platformAdmin = await fetch(`${base}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}`, {
    headers: { Authorization: 'Bearer test', 'X-Test-Platform-Admin': '1' },
  });
  assert.equal(platformAdmin.status, 403);
  assert.equal((await platformAdmin.json()).code, 'BUSINESS_OS_FOUNDER_ACCESS_REQUIRED');

  const denied = await fetch(`${base}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}&company_id=${COMPANY_B}`, {
    headers: { Authorization: 'Bearer test', 'X-Test-Company-Scoped': '1' },
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'BUSINESS_OS_COMPANY_DENIED');

  const response = await fetch(`${base}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}&company_id=all&period=week&period_anchor=2026-09-02`, {
    headers: { Authorization: 'Bearer test' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-business-os-contract'), CONTRACT_VERSION);
  const payload = await response.json();
  assert.equal(payload.contract_version, CONTRACT_VERSION);
  assert.equal(payload.systems.length, 6);
});

test('Founder Cockpit implementation contains no direct mutation call and is mounted in server', () => {
  const backendRoot = path.resolve(__dirname, '..');
  const helper = fs.readFileSync(path.join(backendRoot, 'src/helpers/founderCockpitReadModel.js'), 'utf8');
  const route = fs.readFileSync(path.join(backendRoot, 'src/routes/businessOs.js'), 'utf8');
  const server = fs.readFileSync(path.join(backendRoot, 'src/server.js'), 'utf8');
  const forbidden = /\.(?:insert|upsert|delete)\s*\(|\.update\s*\(\s*\{/;
  assert.doesNotMatch(helper, forbidden);
  assert.doesNotMatch(route, forbidden);
  assert.match(route, /router\.use\(authMiddleware\)/);
  assert.match(route, /requirePermission\('reports', 'view'\)/);
  assert.match(server, /app\.use\('\/api\/business-os', require\('\.\/routes\/businessOs'\)\)/);
});
