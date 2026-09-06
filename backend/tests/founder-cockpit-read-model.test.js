const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Unit tests must not discover, probe, or write to a configured real environment.
process.env.NODE_ENV = 'test';
process.env.RUNTIME_PROFILE = 'test';
process.env.SUPABASE_HEALTH_CHECK_DISABLED = '1';
process.env.SUPABASE_URL = 'https://founder-cockpit-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder';
process.env.JWT_SECRET = 'test-only-placeholder';
process.env.FOUNDER_ADVISORY_CONFIG_ENABLED = '0';
process.env.DOTENV_CONFIG_QUIET = 'true';

const express = require('express');
const {
  CONTRACT_VERSION,
  MODE,
  MODULE_STATUSES,
  FRESHNESS_STATES,
  MODULE_FRESHNESS_SLO_MINUTES,
  FounderCockpitError,
  buildPeriodRange,
  freshness,
  combineFreshness,
  resolveFounderCockpitScope,
  loadFounderCockpit,
} = require('../src/helpers/founderCockpitReadModel');
const businessOsRouter = require('../src/routes/businessOs');
const { FounderAdvisoryConfigService } = require('../src/services/founderAdvisoryConfig');
const { PLATFORM_CAPABILITY_DEFINITIONS } = require('../src/helpers/founderPlatformCapabilities');
const { getActiveClient } = require('../src/config/supabaseRouter');

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

test('freshness contract separates current observation from source mutation watermark', () => {
  const direct = freshness(
    NOW.toISOString(),
    [{ updated_at: '2025-01-01T00:00:00.000Z' }],
    undefined,
    { source: 'projects', state: 'FRESH', sloMinutes: 30 },
  );
  assert.equal(direct.state, 'FRESH');
  assert.equal(direct.observed_at, NOW.toISOString());
  assert.equal(direct.as_of, NOW.toISOString());
  assert.equal(direct.source_updated_at, '2025-01-01T00:00:00.000Z');
  assert.equal(direct.slo_minutes, 30);

  const invalidAggregate = combineFreshness([
    { source: 'invalid', freshness: { state: 'UNRECOGNIZED', observed_at: NOW.toISOString() } },
  ], NOW.toISOString(), { datasetId: 'invalid_aggregate', sloMinutes: 15 });
  assert.equal(invalidAggregate.state, 'UNKNOWN');
  assert.equal(invalidAggregate.slo_minutes, 15);
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
  assert.ok(payload.planning.horizons.every((item) => (
    FRESHNESS_STATES.includes(item.freshness?.state)
    && item.freshness?.slo_minutes === 60
  )));
  assert.equal(payload.workload.open, 7);
  assert.equal(payload.capacity.active_people, 3);
  assert.equal(payload.capacity.capacity_target, null);
  assert.equal(payload.capacity.freshness.state, 'FRESH');
  assert.equal(payload.capacity.freshness.observed_at, NOW.toISOString());
  assert.equal(payload.capacity.freshness.slo_minutes, 60);
  assert.equal(payload.manufacturing_companies.length, 2);
  assert.deepEqual(payload.manufacturing_companies.map((item) => item.company.id).sort(), [COMPANY_A, COMPANY_B].sort());
  assert.ok(payload.manufacturing_companies.every((item) => (
    item.freshness.state === 'FRESH'
    && item.freshness.observed_at === NOW.toISOString()
    && item.freshness.slo_minutes === 60
  )));
  assert.equal(payload.modules.find((module) => module.key === 'warranty_care').status, 'NOT CONNECTED');
  assert.ok(payload.modules.every((module) => (
    FRESHNESS_STATES.includes(module.freshness?.state)
    && module.freshness?.slo_minutes === MODULE_FRESHNESS_SLO_MINUTES[module.key]
    && module.freshness?.observed_at === NOW.toISOString()
  )));
  assert.equal(payload.modules.find((module) => module.key === 'warranty_care').freshness.state, 'NOT_CONNECTED');
  assert.ok(payload.modules.filter((module) => module.key !== 'warranty_care').every((module) => module.freshness.state === 'FRESH'));
  const projectsFreshness = payload.modules.find((module) => module.key === 'projects').freshness;
  assert.equal(projectsFreshness.state, 'FRESH', 'a successful direct read is fresh at observation time');
  assert.equal(projectsFreshness.observed_at, NOW.toISOString());
  assert.equal(projectsFreshness.as_of, NOW.toISOString());
  assert.equal(projectsFreshness.source_updated_at, '2026-09-02T02:00:00.000Z');
  assert.ok(payload.decision_center.items.every((item) => Array.isArray(item.evidence) && item.evidence.length > 0));
  assert.equal(payload.configuration_center.read_only, true);
  assert.equal(payload.configuration_center.canonical_configuration_read_only, true);
  assert.ok(payload.configuration_center.modules.length >= 15);
  assert.ok(!payload.configuration_center.modules.some((module) => module.key === 'private-other-tenant'));
  assert.equal(payload.platform_capabilities.length, 19);
  assert.deepEqual(
    payload.platform_capabilities.map((item) => item.key),
    PLATFORM_CAPABILITY_DEFINITIONS.map((item) => item.key),
  );
  assert.equal(new Set(payload.platform_capabilities.map((item) => item.key)).size, 19);
  assert.ok(payload.platform_capabilities.every((item) => (
    MODULE_STATUSES.includes(item.status)
    && item.activation_status === item.status
    && item.canonical === false
    && item.automatic_operational_effect === false
    && item.reconciliation
    && FRESHNESS_STATES.includes(item.freshness?.state)
    && Number(item.freshness?.slo_minutes) > 0
    && Array.isArray(item.data_gaps)
  )));
  assert.ok(payload.platform_capabilities
    .filter((item) => item.mode === 'PRODUCTIZATION_INTERFACE' || item.mode === 'RUNTIME_DISABLED')
    .every((item) => item.status === 'SANDBOX'));
  assert.equal(
    payload.platform_capabilities.find((item) => item.key === 'executive_domain_ai_interfaces').write_capability,
    'DISABLED',
  );
  assert.equal(payload.signal_hub.contract_version, 'founder_signal_hub_v1');
  assert.equal(payload.signal_hub.canonical, false);
  assert.ok(payload.signal_hub.contracts.length >= 20);
  assert.ok(payload.signal_hub.contracts.every((signal) => (
    signal.signal_id
    && signal.owner_domain
    && signal.source_service_read_model
    && signal.source_object_field
    && Array.isArray(signal.company_scope)
    && signal.user_role_scope?.[0] === 'admin'
    && signal.freshness
    && FRESHNESS_STATES.includes(signal.freshness.state)
    && Number(signal.freshness.slo_minutes) > 0
    && signal.freshness_slo_minutes === signal.freshness.slo_minutes
    && signal.freshness_target_seconds === signal.freshness.slo_minutes * 60
    && signal.reconciliation
    && signal.write_capability === 'DISABLED'
    && signal.canonical_status === 'NON_CANONICAL MANAGEMENT VIEW'
  )));
  assert.equal(payload.correction_center.contract_version, 'founder_correction_evolution_v1');
  assert.equal(payload.correction_center.rule_change_request.enabled, false);
  assert.ok(payload.correction_center.items.every((item) => (
    item.issue_id
    && item.root_cause
    && item.corrective_action
    && item.status
    && item.protected_write_enabled === false
  )));
  assert.equal(payload.protections.write_enabled, false);
  assert.equal(payload.protections.direct_database_write_enabled, false);
  assert.equal(payload.protections.synthetic_fallback_enabled, false);
  assert.deepEqual(payload.protections.actions, []);
  assert.ok(payload.drilldowns.every((item) => (
    item.href.startsWith('/')
    && item.href.includes('company_id=all')
    && item.read_only === true
    && item.read_only_contract === 'founder_local_read_only_v1'
    && item.write_capability === 'DISABLED_IN_FOUNDER_LOCAL'
  )));
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

test('provisional capacity configuration creates advisories only and never changes operations', async () => {
  const advisory = {
    enabled: true,
    status: 'PROVISIONAL ADVISORY CONFIGURATION',
    canonical: false,
    operational_effect: false,
    automatic_actions_enabled: false,
    current_version: 1,
    configuration: {
      capacity_load_warning_per_active_person: 2,
      overdue_work_warning_count: 2,
      overdue_project_warning_count: 1,
      delayed_procurement_warning_count: 1,
    },
  };
  const payload = await loadFounderCockpit({
    scope: ecosystemScope(),
    user: tenantAdmin(),
    period: 'week',
    periodAnchor: '2026-09-02',
    now: NOW,
    readers: readers(),
    gateContext: VERIFIED_GATES,
    advisoryConfig: advisory,
    companyAdvisoryConfigs: { [COMPANY_A]: advisory, [COMPANY_B]: advisory },
  });
  assert.equal(payload.capacity.capacity_target, 2);
  assert.equal(payload.capacity.target_contract.canonical, false);
  assert.equal(payload.capacity.target_contract.operational_effect, false);
  assert.ok(payload.decision_center.items.some((item) => (
    item.provisional_advisory === true
    && item.canonical === false
    && item.operational_effect === false
  )));
  assert.ok(payload.manufacturing_companies.every((item) => item.capacity.capacity_target === 2));
  assert.equal(payload.configuration_center.permissions.can_change, true);
  assert.equal(payload.protections.write_enabled, false);
  assert.equal(payload.protections.provisional_configuration_write_enabled, true);
  assert.equal(payload.protections.provisional_configuration_operational_effect, false);
  assert.deepEqual(payload.protections.actions, []);
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

test('runtime health is fail-closed while allowing the approved non-blocking Warranty gap', async () => {
  const payload = await loadFounderCockpit({
    scope: ecosystemScope(),
    user: tenantAdmin(),
    period: 'week',
    periodAnchor: '2026-09-02',
    now: NOW,
    readers: readers(),
    gateContext: VERIFIED_GATES,
  });
  const health = businessOsRouter.buildFounderCockpitHealth(payload, { now: NOW });
  assert.equal(health.contract_version, 'founder_cockpit_health_v1');
  assert.equal(health.ready, true);
  assert.equal(health.status, 'DEGRADED');
  assert.ok(health.degraded_modules.some((module) => (
    module.key === 'warranty_care'
    && module.status === 'NOT CONNECTED'
    && module.v1_blocking === false
  )));
  assert.deepEqual(health.critical_blockers, []);
  assert.equal(health.protections.status, 'PASS');
  assert.equal(health.connectors.policy.timeout_ms, 15_000);
  assert.equal(health.connectors.policy.circuit_breaker, 'ENABLED');
  assert.equal(health.configuration_store.canonical_configuration_read_only, true);
  assert.equal(health.configuration_store.advisory_operational_effect, false);
  assert.deepEqual(health.freshness.failed_module_keys, []);
  assert.equal(health.freshness.modules.find((module) => module.key === 'warranty_care').state, 'NOT_CONNECTED');
  assert.equal(
    health.freshness.modules.find((module) => module.key === 'projects').source_updated_at,
    '2026-09-02T02:00:00.000Z',
  );

  const unsafe = structuredClone(payload);
  const production = unsafe.modules.find((module) => module.key === 'production');
  production.activation_status = 'NOT CONNECTED';
  const failed = businessOsRouter.buildFounderCockpitHealth(unsafe, { now: NOW });
  assert.equal(failed.ready, false);
  assert.equal(failed.status, 'FAIL');
  assert.ok(failed.critical_blockers.includes('production'));
  assert.ok(failed.freshness.failed_module_keys.includes('production'));

  for (const [state, moduleKey] of [['STALE', 'production'], ['UNKNOWN', 'projects']]) {
    const invalidFreshness = structuredClone(payload);
    invalidFreshness.modules.find((module) => module.key === moduleKey).freshness.state = state;
    const freshnessFailure = businessOsRouter.buildFounderCockpitHealth(invalidFreshness, { now: NOW });
    assert.equal(freshnessFailure.ready, false);
    assert.equal(freshnessFailure.freshness.status, 'FAIL');
    assert.ok(freshnessFailure.freshness.failed_module_keys.includes(moduleKey));
  }

  const expiredSlo = structuredClone(payload);
  expiredSlo.modules.find((module) => module.key === 'production').freshness.observed_at = new Date(
    NOW.getTime() - 31 * 60 * 1000,
  ).toISOString();
  const expiredSloHealth = businessOsRouter.buildFounderCockpitHealth(expiredSlo, { now: NOW });
  assert.equal(expiredSloHealth.freshness.snapshot_status, 'FRESH');
  assert.equal(
    expiredSloHealth.freshness.modules.find((module) => module.key === 'production').state,
    'STALE',
  );
  assert.equal(expiredSloHealth.ready, false);

  const warrantyGap = structuredClone(payload);
  warrantyGap.modules.find((module) => module.key === 'warranty_care').freshness.state = 'UNKNOWN';
  const warrantyHealth = businessOsRouter.buildFounderCockpitHealth(warrantyGap, { now: NOW });
  assert.equal(warrantyHealth.ready, true);
  assert.ok(!warrantyHealth.freshness.failed_module_keys.includes('warranty_care'));

  const stale = businessOsRouter.buildFounderCockpitHealth(payload, {
    now: new Date(NOW.getTime() + 3 * 60 * 1000),
  });
  assert.equal(stale.ready, false);
  assert.equal(stale.freshness.status, 'FAIL');
});

test('Founder advisory configuration route is admin-scoped, idempotent and rollback-capable', async (t) => {
  const baseDir = path.resolve(__dirname, '../.runtime/tests', `business-os-route-config-${process.pid}-${Date.now()}`);
  t.after(() => fs.promises.rm(baseDir, { recursive: true, force: true }));
  const authMiddleware = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test') return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.user = tenantAdmin();
    req.tenantContext = { enforced: true, tenantId: ECOSYSTEM_ID };
    req.tenantCompanyIds = [COMPANY_A, COMPANY_B];
    return next();
  };
  const router = businessOsRouter.createBusinessOsRouter({
    authMiddleware,
    permissionMiddleware: (_req, _res, next) => next(),
    readers: readers(),
    advisoryConfigService: new FounderAdvisoryConfigService({ baseDir, enabled: true }),
  });
  const app = express();
  app.use(express.json());
  app.use('/api/business-os', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const scopeQuery = `ecosystem_id=${ECOSYSTEM_ID}&company_id=${COMPANY_A}`;
  const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' };

  const before = await fetch(`${base}/api/business-os/configuration?${scopeQuery}`, { headers });
  assert.equal(before.status, 200);
  assert.equal((await before.json()).current_version, 0);

  const saveBody = {
    expected_version: 0,
    approval: { confirmed: true, reason: 'Founder xác nhận cảnh báo nội bộ' },
    configuration: {
      capacity_load_warning_per_active_person: 8,
      overdue_work_warning_count: 3,
      overdue_project_warning_count: 2,
      delayed_procurement_warning_count: 2,
    },
  };
  const saved = await fetch(`${base}/api/business-os/configuration?${scopeQuery}`, {
    method: 'PUT',
    headers: { ...headers, 'Idempotency-Key': 'route-config-save-0001' },
    body: JSON.stringify(saveBody),
  });
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json();
  assert.equal(savedPayload.current_version, 1);
  assert.equal(savedPayload.configuration.capacity_load_warning_per_active_person, 8);
  assert.equal(savedPayload.operational_effect, false);

  const replay = await fetch(`${base}/api/business-os/configuration?${scopeQuery}`, {
    method: 'PUT',
    headers: { ...headers, 'Idempotency-Key': 'route-config-save-0001' },
    body: JSON.stringify(saveBody),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).idempotent_replay, true);

  const changed = await fetch(`${base}/api/business-os/configuration?${scopeQuery}`, {
    method: 'PUT',
    headers: { ...headers, 'Idempotency-Key': 'route-config-save-0002' },
    body: JSON.stringify({
      ...saveBody,
      expected_version: 1,
      configuration: { ...saveBody.configuration, capacity_load_warning_per_active_person: 10 },
    }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).current_version, 2);

  const rollback = await fetch(`${base}/api/business-os/configuration/rollback?${scopeQuery}`, {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': 'route-config-rollback-0001' },
    body: JSON.stringify({
      expected_version: 2,
      target_version: 1,
      approval: { confirmed: true, reason: 'Founder xác nhận hoàn tác cảnh báo' },
    }),
  });
  assert.equal(rollback.status, 200);
  const rollbackPayload = await rollback.json();
  assert.equal(rollbackPayload.current_version, 3);
  assert.equal(rollbackPayload.configuration.capacity_load_warning_per_active_person, 8);
});

test('Founder advisory configuration route enforces settings:edit deny and allow decisions', async (t) => {
  const baseDir = path.resolve(__dirname, '../.runtime/tests', `business-os-route-permission-${process.pid}-${Date.now()}`);
  t.after(() => fs.promises.rm(baseDir, { recursive: true, force: true }));

  const supabaseClient = getActiveClient();
  const originalRpc = supabaseClient.rpc;
  let settingsEditAllowed = false;
  const permissionCalls = [];
  supabaseClient.rpc = async (name, args) => {
    permissionCalls.push({ name, args });
    return { data: settingsEditAllowed, error: null };
  };
  t.after(() => {
    supabaseClient.rpc = originalRpc;
  });

  const authMiddleware = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test') return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.user = tenantAdmin({ role: 'employee', company_id: COMPANY_A });
    req.tenantContext = { enforced: true, tenantId: ECOSYSTEM_ID };
    req.tenantCompanyIds = [COMPANY_A, COMPANY_B];
    return next();
  };
  const router = businessOsRouter.createBusinessOsRouter({
    authMiddleware,
    founderMiddleware: (_req, _res, next) => next(),
    permissionMiddleware: (_req, _res, next) => next(),
    readers: readers(),
    advisoryConfigService: new FounderAdvisoryConfigService({ baseDir, enabled: true }),
  });
  const app = express();
  app.use(express.json());
  app.use('/api/business-os', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/api/business-os/configuration?ecosystem_id=${ECOSYSTEM_ID}&company_id=${COMPANY_A}`;
  const request = {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer test',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'route-config-permission-0001',
    },
    body: JSON.stringify({
      expected_version: 0,
      approval: { confirmed: true, reason: 'Founder xác nhận kiểm tra quyền cấu hình' },
      configuration: { capacity_load_warning_per_active_person: 8 },
    }),
  };

  const denied = await fetch(url, request);
  assert.equal(denied.status, 403);
  assert.deepEqual((await denied.json()).details, {
    resource: 'settings',
    action: 'edit',
    ecosystem_unit_id: null,
  });

  settingsEditAllowed = true;
  const allowed = await fetch(url, request);
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).current_version, 1);

  assert.equal(permissionCalls.length, 2);
  assert.ok(permissionCalls.every(({ name, args }) => (
    name === 'user_has_permission'
    && args.p_user_id === USER_ID
    && args.p_resource === 'settings'
    && args.p_action === 'edit'
    && args.p_ecosystem_unit_id === null
  )));
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

  const metadataResponse = await fetch(`${base}/api/business-os/metadata?ecosystem_id=${ECOSYSTEM_ID}&company_id=${COMPANY_A}`, {
    headers: { Authorization: 'Bearer test' },
  });
  assert.equal(metadataResponse.status, 200);
  assert.equal(metadataResponse.headers.get('cache-control'), 'no-store');
  const metadata = await metadataResponse.json();
  assert.equal(metadata.contract_version, 'founder_cockpit_metadata_v1');
  assert.equal(metadata.ecosystem.id, ECOSYSTEM_ID);
  assert.deepEqual(metadata.companies.map((company) => company.id), [COMPANY_A, COMPANY_B]);

  const response = await fetch(`${base}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}&company_id=all&period=week&period_anchor=2026-09-02`, {
    headers: { Authorization: 'Bearer test' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-business-os-contract'), CONTRACT_VERSION);
  const payload = await response.json();
  assert.equal(payload.contract_version, CONTRACT_VERSION);
  assert.equal(payload.systems.length, 6);

  const healthResponse = await fetch(`${base}/api/business-os/health?ecosystem_id=${ECOSYSTEM_ID}&company_id=all&period=week&period_anchor=2026-09-02`, {
    headers: { Authorization: 'Bearer test' },
  });
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get('cache-control'), 'no-store');
  assert.equal(healthResponse.headers.get('x-business-os-health-contract'), 'founder_cockpit_health_v1');
  const health = await healthResponse.json();
  assert.equal(health.ready, true);
  assert.equal(health.route.health_path, '/api/business-os/health');
  assert.equal(health.protections.status, 'PASS');
});

test('Founder Cockpit implementation contains no direct mutation call and is mounted in server', () => {
  const backendRoot = path.resolve(__dirname, '..');
  const helper = fs.readFileSync(path.join(backendRoot, 'src/helpers/founderCockpitReadModel.js'), 'utf8');
  const route = fs.readFileSync(path.join(backendRoot, 'src/routes/businessOs.js'), 'utf8');
  const server = fs.readFileSync(path.join(backendRoot, 'src/server.js'), 'utf8');
  const startup = fs.readFileSync(path.join(backendRoot, 'scripts/start-founder-local-read-only.js'), 'utf8');
  const provenance = fs.readFileSync(path.join(backendRoot, 'src/config/founderLocalRuntimeProvenance.js'), 'utf8');
  const liveRead = fs.readFileSync(path.join(backendRoot, 'tests/founder-cockpit-live-read.js'), 'utf8');
  const forbidden = /\.(?:insert|upsert|delete)\s*\(|\.update\s*\(\s*\{/;
  assert.doesNotMatch(helper, forbidden);
  assert.doesNotMatch(route, forbidden);
  assert.match(route, /router\.use\(authMiddleware\)/);
  assert.match(route, /requirePermission\('reports', 'view'\)/);
  assert.match(server, /app\.use\('\/api\/business-os', require\('\.\/routes\/businessOs'\)\)/);
  assert.match(startup, /readFounderLocalCandidateBinding\(repositoryDir\)/);
  assert.match(provenance, /'rev-parse', '--show-toplevel'/);
  assert.match(provenance, /'status', '--porcelain=v1', '--untracked-files=all'/);
  assert.match(provenance, /FOUNDER_LOCAL_WORKTREE_NOT_FROZEN/);
  assert.match(startup, /FOUNDER_LOCAL_ENV_FILE must be an explicit absolute path/);
  assert.doesNotMatch(startup, /C:\\Projects\\Quanlycongviec/);
  assert.match(startup, /FOUNDER_ADVISORY_CONFIG_ENABLED === '1'/);
  assert.match(startup, /process\.env\.FOUNDER_ADVISORY_CONFIG_ENABLED = '0'/);
  assert.match(startup, /assertFounderLocalDataConfig\(\);[\s\S]*if \(advisoryConfigurationOptIn\)/);
  assert.doesNotMatch(route, /console\.error\('\[business-os\/founder-cockpit(?:-health)?\]', error\)/);
  assert.doesNotMatch(liveRead, /error\?\.(?:stack|message)/);
  assert.match(liveRead, /result: 'FAIL',[\s\S]*code: safeEvidenceCode/);
});
