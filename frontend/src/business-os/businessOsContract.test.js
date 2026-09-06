import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_OS_MODULE_KEYS,
  BUSINESS_OS_PLATFORM_CAPABILITY_KEYS,
  assertBusinessOsSnapshot,
  safeBusinessOsHref,
} from './businessOsContract.js';
import {
  FOUNDER_LOCAL_COMPANY_SCOPE_KEY,
  FOUNDER_LOCAL_READ_ONLY_CONTRACT,
  applyFounderLocalCompanyScopeLock,
  activateFounderLocalReadOnlyForPath,
  assertFounderLocalLoginAttested,
  assertFounderLocalResponseAttested,
  clearFounderLocalCompanyScopeLock,
  commitFounderLocalCompanyScopeFromVerifiedDrilldown,
  founderLocalCompanyScopeFromHref,
  founderLocalUiPathAllowed,
  founderLocalRequestDecision,
  readFounderLocalCompanyScopeLock,
  safeFounderLocalDrilldownHref,
  setFounderLocalReadOnlyActive,
} from './founderLocalReadOnly.js';

const NOW = Date.parse('2026-09-06T01:00:00.000Z');
const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const API_BASE_URL = '/api';
const SYSTEM_MODULE_KEYS = [
  ['crm', 'sales', 'lead_deal'],
  ['commercial_documents', 'projects'],
  ['work_unified', 'people_kpi'],
  ['projects', 'procurement_purchasing', 'production', 'logistics'],
  ['accounting', 'approvals', 'reporting', 'permissions'],
  ['warranty_care', 'reporting'],
];

function readOnlyDrilldown(href = '/crm/dashboard?company_id=all', enabled = false) {
  return {
    href,
    label: 'Mở nguồn',
    enabled,
    read_only: true,
    read_only_contract: FOUNDER_LOCAL_READ_ONLY_CONTRACT,
    write_capability: 'DISABLED_IN_FOUNDER_LOCAL',
  };
}

function platformCapability(key, index) {
  const sandbox = index >= 12 && index <= 16 || index === 18;
  return {
    key,
    label: `Capability ${index + 1}`,
    mode: sandbox ? (index === 18 ? 'RUNTIME_DISABLED' : 'PRODUCTIZATION_INTERFACE') : 'INTERNAL_OPERATIONAL',
    status: sandbox ? 'SANDBOX' : 'LIVE WITH DATA GAPS',
    activation_status: sandbox ? 'SANDBOX' : 'LIVE WITH DATA GAPS',
    source: 'verified_read_projection',
    reconciliation: { state: 'MATCH' },
    freshness: { state: 'OBSERVED', as_of: '2026-09-06T00:59:30.000Z' },
    data_gaps: [],
    drilldown: { href: '/business-os#platform-capabilities', label: 'Xem', enabled: true },
    canonical: false,
    canonical_owner: 'existing_domains',
    write_capability: 'DISABLED',
    automatic_operational_effect: false,
  };
}

function snapshot() {
  return {
    contract_version: 'founder_cockpit_v1',
    mode: 'live_read_only',
    generated_at: '2026-09-06T00:59:30.000Z',
    scope: {
      ecosystem_id: '11111111-1111-4111-8111-111111111111',
      company_id: null,
      company_ids: [COMPANY_A, COMPANY_B],
      level: 'ecosystem',
      companies: [
        { id: COMPANY_A, name: 'A' },
        { id: COMPANY_B, name: 'B' },
      ],
    },
    period: { key: 'week' },
    systems: SYSTEM_MODULE_KEYS.map((moduleKeys, index) => ({
      key: `system_${index}`,
      label: `System ${index}`,
      status: 'LIVE',
      module_keys: [...moduleKeys],
      metrics: {},
      signals: [],
      drilldowns: [readOnlyDrilldown()],
    })),
    modules: BUSINESS_OS_MODULE_KEYS.map((key) => ({
      key,
      label: key,
      activation_status: 'LIVE',
      activation: { enabled: true, company_ids: [COMPANY_A, COMPANY_B] },
      metrics: {},
      freshness: { state: 'FRESH', as_of: '2026-09-06T00:59:30.000Z' },
      reconciliation: { state: 'MATCHED', checked_at: '2026-09-06T00:59:30.000Z' },
      gates: {
        data: true,
        scope: true,
        permission: true,
        audit: true,
        reconciliation: true,
        verification: true,
        drill_down: true,
      },
      data_gaps: [],
      drilldown: readOnlyDrilldown(),
    })),
    planning: { selected_period: { key: 'week' }, horizons: [], forecast: {} },
    workload: { metric_contract: {}, freshness: {}, drilldown: readOnlyDrilldown('/management/work-unified?company_id=all') },
    capacity: { metric_contract: {}, data_gaps: [], drilldown: readOnlyDrilldown('/management/work-unified?company_id=all') },
    manufacturing_companies: [{
      company: { id: COMPANY_A, name: 'A' },
      status: 'LIVE WITH DATA GAPS',
      capacity: {},
      freshness: { state: 'FRESH', as_of: '2026-09-06T00:59:30.000Z' },
      reconciliation: { state: 'MATCHED', checked_at: '2026-09-06T00:59:30.000Z' },
      data_gaps: [{ message: 'No target' }],
      drilldown: readOnlyDrilldown(`/sx/dashboard?company_id=${COMPANY_A}`),
    }],
    decision_center: { contract: {}, items: [] },
    configuration_center: {
      read_only: true,
      canonical_configuration_read_only: true,
      modules: [{ key: 'crm', company_ids: [COMPANY_A, COMPANY_B] }],
      permissions: { can_view: true, can_change: false },
      advisory_configuration: {
        contract_version: 'founder_advisory_configuration_v1',
        status: 'PROVISIONAL ADVISORY CONFIGURATION',
        enabled: false,
        canonical: false,
        operational_effect: false,
        automatic_actions_enabled: false,
        scope: {
          ecosystem_id: '11111111-1111-4111-8111-111111111111',
          company_id: null,
          level: 'ecosystem',
        },
        current_version: 0,
        configuration: {
          capacity_load_warning_per_active_person: null,
          overdue_work_warning_count: null,
          overdue_project_warning_count: null,
          delayed_procurement_warning_count: null,
        },
        updated_at: null,
        rollback_versions: [],
        gates: { service: false, rule: true, permission: true, approval: true, audit: true, rollback: true },
      },
    },
    platform_capabilities: BUSINESS_OS_PLATFORM_CAPABILITY_KEYS.map(platformCapability),
    signal_hub: {
      contract_version: 'founder_signal_hub_v1',
      mode: 'read_projection',
      canonical: false,
      contracts: [{
        signal_id: 'crm.open',
        display_name: 'CRM · Open',
        owner_domain: 'CRM',
        source_service_read_model: 'crmReadModel',
        source_object_field: 'summary.open',
        source_record_id: null,
        source_record_id_semantics: 'SCOPED_AGGREGATE_NOT_SINGLE_RECORD',
        ecosystem_scope: '11111111-1111-4111-8111-111111111111',
        company_scope: [COMPANY_A, COMPANY_B],
        user_role_scope: ['admin'],
        query_filter_rule: 'verified scope',
        freshness_target_seconds: 120,
        freshness: { state: 'OBSERVED', as_of: '2026-09-06T00:59:30.000Z' },
        reconciliation_rule: 'compare source',
        reconciliation: { state: 'MATCHED' },
        quality_state: 'VERIFIED',
        failure_state: 'DISCLOSE GAP',
        drilldown: readOnlyDrilldown(),
        write_capability: 'DISABLED',
        canonical_status: 'NON_CANONICAL MANAGEMENT VIEW',
        provisional: false,
        current_value: 1,
        as_of: '2026-09-06T00:59:30.000Z',
      }],
    },
    correction_center: {
      contract_version: 'founder_correction_evolution_v1',
      mode: 'read_projection_and_drilldown',
      canonical: false,
      rule_change_request: { enabled: false, status: 'DISABLED', reason: 'Outside authority' },
      items: [],
    },
    drilldowns: [],
    protections: {
      write_enabled: false,
      direct_database_write_enabled: false,
      synthetic_fallback_enabled: false,
      external_send_enabled: false,
      actions: [],
    },
  };
}

function rewriteAttestedDrilldownScopes(value, companyScope) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)
    && value.read_only_contract === FOUNDER_LOCAL_READ_ONLY_CONTRACT
    && typeof value.href === 'string') {
    const parsed = new URL(value.href, 'https://business-os.invalid');
    parsed.searchParams.delete('company_id');
    parsed.searchParams.set('company_id', companyScope);
    value.href = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  Object.values(value).forEach((nested) => rewriteAttestedDrilldownScopes(nested, companyScope));
}

function narrowSnapshotToCompany(payload, companyId = COMPANY_A) {
  const company = payload.scope.companies.find((item) => item.id === companyId);
  payload.scope.level = 'company';
  payload.scope.company_id = companyId;
  payload.scope.company_ids = [companyId];
  payload.scope.companies = [company];
  payload.modules.forEach((module) => { module.activation.company_ids = [companyId]; });
  payload.configuration_center.modules.forEach((module) => { module.company_ids = [companyId]; });
  payload.configuration_center.advisory_configuration.scope.company_id = companyId;
  payload.configuration_center.advisory_configuration.scope.level = 'company';
  payload.signal_hub.contracts.forEach((signal) => { signal.company_scope = [companyId]; });
  rewriteAttestedDrilldownScopes(payload, companyId);
  return payload;
}

test('accepts a current, ecosystem-scoped, internally consistent snapshot', () => {
  assert.equal(assertBusinessOsSnapshot(snapshot(), {
    ecosystemId: '11111111-1111-4111-8111-111111111111',
    companyId: 'all',
    period: 'week',
    nowMs: NOW,
  }).contract_version, 'founder_cockpit_v1');
});

test('rejects stale snapshots and silently narrowed all-company scope', () => {
  const stale = snapshot();
  stale.generated_at = '2026-09-06T00:00:00.000Z';
  assert.throws(() => assertBusinessOsSnapshot(stale, { companyId: 'all', nowMs: NOW }), /quá hạn/);

  const narrowed = narrowSnapshotToCompany(snapshot());
  assert.throws(() => assertBusinessOsSnapshot(narrowed, { companyId: 'all', nowMs: NOW }), /thu hẹp/);
});

test('requires every source drill-down to carry exactly the verified company scope', () => {
  const exact = narrowSnapshotToCompany(snapshot());
  exact.modules[0].drilldown.enabled = true;
  assert.equal(assertBusinessOsSnapshot(exact, {
    ecosystemId: exact.scope.ecosystem_id,
    companyId: COMPANY_A,
    period: 'week',
    nowMs: NOW,
  }).scope.company_id, COMPANY_A);

  const allScopeEnabled = snapshot();
  allScopeEnabled.modules[0].drilldown.enabled = true;
  assert.throws(
    () => assertBusinessOsSnapshot(allScopeEnabled, { companyId: 'all', nowMs: NOW }),
    /allowlist CRM một-công-ty/i,
  );

  const nonCrmEnabled = narrowSnapshotToCompany(snapshot());
  nonCrmEnabled.modules[0].drilldown = readOnlyDrilldown(
    `/management/work-unified?company_id=${COMPANY_A}`,
    true,
  );
  assert.throws(
    () => assertBusinessOsSnapshot(nonCrmEnabled, { companyId: COMPANY_A, nowMs: NOW }),
    /allowlist CRM một-công-ty/i,
  );

  const missing = snapshot();
  missing.modules[0].drilldown.href = '/crm/dashboard';
  assert.throws(() => assertBusinessOsSnapshot(missing, { companyId: 'all', nowMs: NOW }), /đúng một company_id/i);

  const mismatched = snapshot();
  mismatched.modules[0].drilldown.href = `/crm/dashboard?company_id=${COMPANY_A}`;
  assert.throws(() => assertBusinessOsSnapshot(mismatched, { companyId: 'all', nowMs: NOW }), /không khớp phạm vi/i);

  const duplicated = snapshot();
  duplicated.modules[0].drilldown.href = '/crm/dashboard?company_id=all&company_id=all';
  assert.throws(() => assertBusinessOsSnapshot(duplicated, { companyId: 'all', nowMs: NOW }), /đúng một company_id/i);

  const wrongManufacturingCompany = snapshot();
  wrongManufacturingCompany.manufacturing_companies[0].drilldown = readOnlyDrilldown(
    `/sx/dashboard?company_id=${COMPANY_B}`,
  );
  assert.throws(
    () => assertBusinessOsSnapshot(wrongManufacturingCompany, { companyId: 'all', nowMs: NOW }),
    /không khớp phạm vi/i,
  );
});

test('rejects incomplete module inventory, invalid system references, and false drill-down gates', () => {
  const missingModule = snapshot();
  missingModule.modules.pop();
  assert.throws(() => assertBusinessOsSnapshot(missingModule, { nowMs: NOW }), /đúng 15 module/);

  const invalidReference = snapshot();
  invalidReference.systems[0].module_keys.push('unknown_module');
  assert.throws(() => assertBusinessOsSnapshot(invalidReference, { nowMs: NOW }), /module lạ/);

  const missingDrilldown = snapshot();
  delete missingDrilldown.modules[0].drilldown;
  assert.throws(() => assertBusinessOsSnapshot(missingDrilldown, { nowMs: NOW }), /thiếu đường dẫn/);
});

test('rejects non-substantive module and manufacturing evidence', () => {
  const missingFreshness = snapshot();
  missingFreshness.modules[0].freshness = {};
  assert.throws(() => assertBusinessOsSnapshot(missingFreshness, { nowMs: NOW }), /freshness/i);

  const missingReconciliationTimestamp = snapshot();
  missingReconciliationTimestamp.manufacturing_companies[0].reconciliation = { state: 'MATCHED' };
  assert.throws(() => assertBusinessOsSnapshot(missingReconciliationTimestamp, { nowMs: NOW }), /checked_at/);
});

test('rejects nested company data outside the verified scope', () => {
  const payload = snapshot();
  payload.manufacturing_companies[0].company.id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  assert.throws(() => assertBusinessOsSnapshot(payload, { companyId: 'all', nowMs: NOW }), /ngoài phạm vi/);
});

test('internal drill-down guard rejects network paths, backslashes, controls, and API routes', () => {
  assert.equal(safeBusinessOsHref('/crm/dashboard?company_id=a'), '/crm/dashboard?company_id=a');
  assert.equal(safeBusinessOsHref('/\\attacker.example/path'), '');
  assert.equal(safeBusinessOsHref('/%5c%5cattacker.example/path'), '');
  assert.equal(safeBusinessOsHref('/%2e%2e//attacker.example/path'), '');
  assert.equal(safeBusinessOsHref('//attacker.example/path'), '');
  assert.equal(safeBusinessOsHref('/api/business-os'), '');
});

test('Founder-local request guard allows reads and explicit constrained writes only', () => {
  setFounderLocalReadOnlyActive(true);
  const decision = (config) => founderLocalRequestDecision(
    { baseURL: API_BASE_URL, ...config },
    { expectedBaseURL: API_BASE_URL },
  );
  try {
    assert.equal(decision({ method: 'get', url: '/projects' }).allowed, false);
    assert.equal(decision({ method: 'get', url: '/crm/leads' }).allowed, false);
    assert.equal(decision({ method: 'get', url: '/business-os/metadata' }).allowed, true);
    assert.equal(decision({ method: 'get', url: '/auth/me' }).allowed, true);
    assert.equal(decision({
      method: 'get',
      url: '/crm/web-dashboard-bootstrap',
      headers: { 'X-Founder-Local-Company-Scope': COMPANY_A },
    }).allowed, true);
    assert.equal(decision({
      method: 'get',
      url: '/crm/web-dashboard-bootstrap',
      headers: { 'X-Founder-Local-Company-Scope': 'all' },
    }).allowed, false);
    assert.equal(decision({ method: 'head', url: '/crm/web-dashboard-bootstrap' }).allowed, false);
    assert.equal(decision({ method: 'post', url: '/tasks' }).allowed, false);
    assert.equal(decision({ method: 'post', url: '/auth/login' }).allowed, false);
    assert.equal(decision({ method: 'post', url: '/auth/login', founderLocalAuth: true }).allowed, true);
    assert.equal(decision({ method: 'post', url: '/users/ping' }).allowed, true);
    assert.equal(decision({
      method: 'put',
      url: '/business-os/configuration',
      founderLocalControlledAction: true,
      headers: { 'Idempotency-Key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    }).allowed, true);
    assert.equal(decision({
      method: 'put',
      url: '/business-os/configuration',
      founderLocalControlledAction: true,
      headers: {},
    }).allowed, false);

    assert.equal(decision({ method: 'get', url: 'https://attacker.invalid/collect' }).allowed, false);
    assert.equal(decision({ method: 'head', url: '//attacker.invalid/collect' }).allowed, false);
    assert.equal(decision({ method: 'get', url: '/%2f%2fattacker.invalid/collect' }).allowed, false);
    assert.equal(decision({ method: 'get', url: '/%5c%5cattacker.invalid/collect' }).allowed, false);
    assert.equal(decision({ method: 'get', url: '/projects', baseURL: 'https://attacker.invalid' }).allowed, false);

    const configuredRemoteBase = 'https://tubep-backend.onrender.com/api';
    const exactConfiguredRemote = founderLocalRequestDecision({
      method: 'get',
      url: '/auth/me',
      baseURL: configuredRemoteBase,
    }, { expectedBaseURL: configuredRemoteBase });
    assert.equal(exactConfiguredRemote.allowed, false);
    assert.equal(exactConfiguredRemote.reason, 'founder_local_api_base_must_be_same_origin');
    assert.equal(founderLocalRequestDecision({
      method: 'get',
      url: '/auth/me',
      baseURL: 'http://127.0.0.1:4010/api',
    }, { expectedBaseURL: 'http://127.0.0.1:4010/api' }).allowed, false);
  } finally {
    setFounderLocalReadOnlyActive(false);
  }
});

test('Founder-local company scope is committed only by a verified drill-down and locks reads', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  storage.setItem('token', 'founder-token-a');
  storage.setItem('user', JSON.stringify({ id: 'founder-a' }));
  storage.setItem('session_id', 'session-a');
  setFounderLocalReadOnlyActive(true);
  try {
    const exactDrilldown = readOnlyDrilldown(`/crm/dashboard?company_id=${COMPANY_A}`, true);
    assert.equal(commitFounderLocalCompanyScopeFromVerifiedDrilldown(exactDrilldown, {
      expectedCompanyScope: COMPANY_A,
      storage,
    }), COMPANY_A);
    assert.equal(readFounderLocalCompanyScopeLock({ storage }), COMPANY_A);
    assert.equal(JSON.parse(values.get(FOUNDER_LOCAL_COMPANY_SCOPE_KEY)).company_id, COMPANY_A);

    // A source-page URL is untrusted and cannot replace the verified lock.
    assert.equal(readFounderLocalCompanyScopeLock({
      search: `?company_id=${COMPANY_B}`,
      storage,
    }), COMPANY_A);

    const scoped = applyFounderLocalCompanyScopeLock({
      method: 'get',
      url: `/crm/web-dashboard-bootstrap?company_id=${COMPANY_B}&type=lead`,
      params: { company_id: COMPANY_B, pipeline_id: 'pipeline-a' },
      headers: {},
    }, { storage });
    assert.equal(scoped.url, '/crm/web-dashboard-bootstrap?type=lead');
    assert.equal(scoped.params.company_id, COMPANY_A);
    assert.equal(scoped.params.pipeline_id, 'pipeline-a');
    assert.equal(scoped.headers['X-Founder-Local-Company-Scope'], COMPANY_A);

    assert.throws(() => commitFounderLocalCompanyScopeFromVerifiedDrilldown(
      readOnlyDrilldown(`/crm/dashboard?company_id=${COMPANY_B}`, true),
      { expectedCompanyScope: COMPANY_A, storage },
    ), /đã được Cockpit xác minh/i);
    assert.throws(() => commitFounderLocalCompanyScopeFromVerifiedDrilldown(
      readOnlyDrilldown('/crm/dashboard?company_id=all&company_id=all', true),
      { expectedCompanyScope: 'all', storage },
    ), /đã được Cockpit xác minh/i);
    assert.equal(readFounderLocalCompanyScopeLock({ storage }), COMPANY_A);

    assert.throws(() => commitFounderLocalCompanyScopeFromVerifiedDrilldown(
      readOnlyDrilldown('/crm/dashboard?company_id=all', true),
      { expectedCompanyScope: 'all', storage },
    ), /đã được Cockpit xác minh/i);

    // A legacy all-scope marker cannot open any source read.
    values.set(FOUNDER_LOCAL_COMPANY_SCOPE_KEY, 'all');
    assert.throws(() => applyFounderLocalCompanyScopeLock({
      method: 'get',
      url: '/crm/web-dashboard-bootstrap',
      params: {},
      headers: {},
    }, { storage }), /phạm vi công ty/i);

    const cockpit = applyFounderLocalCompanyScopeLock({
      method: 'get',
      url: '/business-os?company_id=all',
      params: { company_id: 'all', period: 'week' },
      headers: {},
    }, { storage });
    assert.equal(cockpit.url, '/business-os?company_id=all');
    assert.equal(cockpit.params.company_id, 'all');
    assert.equal(cockpit.headers['X-Founder-Local-Company-Scope'], undefined);

    assert.doesNotThrow(() => applyFounderLocalCompanyScopeLock({
      method: 'get',
      url: '/auth/me',
      headers: {},
    }, { storage: { getItem: () => null } }));
  } finally {
    setFounderLocalReadOnlyActive(false);
  }
});

test('Founder-local activation ignores Founder paths in a standard build', () => {
  setFounderLocalReadOnlyActive(false);
  assert.equal(activateFounderLocalReadOnlyForPath('/business-os'), false);
  assert.equal(activateFounderLocalReadOnlyForPath('/business-os/login'), false);
  assert.equal(activateFounderLocalReadOnlyForPath('/crm/dashboard'), false);
});

test('Founder-local company lock is bound to the authenticated browser session', () => {
  const values = new Map([
    ['token', 'founder-token-a'],
    ['user', JSON.stringify({ id: 'founder-a' })],
    ['session_id', 'session-a'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  setFounderLocalReadOnlyActive(true);
  try {
    commitFounderLocalCompanyScopeFromVerifiedDrilldown(
      readOnlyDrilldown(`/crm/dashboard?company_id=${COMPANY_A}`, true),
      { expectedCompanyScope: COMPANY_A, storage },
    );
    assert.equal(readFounderLocalCompanyScopeLock({ storage }), COMPANY_A);

    storage.setItem('token', 'founder-token-b');
    storage.setItem('user', JSON.stringify({ id: 'founder-b' }));
    storage.setItem('session_id', 'session-b');
    assert.equal(readFounderLocalCompanyScopeLock({ storage }), '');
    assert.throws(() => applyFounderLocalCompanyScopeLock({
      method: 'get',
      url: '/crm/web-dashboard-bootstrap',
      params: {},
      headers: {},
    }, { storage }), /chưa có phạm vi/i);
  } finally {
    setFounderLocalReadOnlyActive(false);
  }
});

test('Founder-local logout clears company A before a company B session starts', () => {
  const values = new Map([
    ['token', 'founder-token-a'],
    ['user', JSON.stringify({ id: 'founder-a' })],
    ['session_id', 'session-a'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  setFounderLocalReadOnlyActive(true);
  try {
    commitFounderLocalCompanyScopeFromVerifiedDrilldown(
      readOnlyDrilldown(`/crm/dashboard?company_id=${COMPANY_A}`, true),
      { expectedCompanyScope: COMPANY_A, storage },
    );
    clearFounderLocalCompanyScopeLock({ storage });
    for (const key of ['token', 'user', 'session_id']) storage.removeItem(key);

    storage.setItem('token', 'founder-token-b');
    storage.setItem('user', JSON.stringify({ id: 'founder-b' }));
    storage.setItem('session_id', 'session-b');
    assert.equal(storage.getItem(FOUNDER_LOCAL_COMPANY_SCOPE_KEY), null);
    assert.equal(readFounderLocalCompanyScopeLock({ storage }), '');
  } finally {
    setFounderLocalReadOnlyActive(false);
  }
});

test('Founder-local drill-down scope parser rejects missing, duplicate and malformed values', () => {
  assert.equal(founderLocalCompanyScopeFromHref('/crm/dashboard?company_id=all'), 'all');
  assert.equal(founderLocalCompanyScopeFromHref(`/crm/dashboard?company_id=${COMPANY_A}`), COMPANY_A);
  assert.equal(founderLocalCompanyScopeFromHref('/crm/dashboard'), '');
  assert.equal(founderLocalCompanyScopeFromHref('/crm/dashboard?company_id=all&company_id=all'), '');
  assert.equal(founderLocalCompanyScopeFromHref('/crm/dashboard?company_id=not-a-company'), '');
});

test('Founder-local responses and login bodies require runtime attestation', () => {
  setFounderLocalReadOnlyActive(true);
  try {
    assert.equal(assertFounderLocalResponseAttested({
      headers: { 'x-founder-local-profile': 'founder-local-read-only' },
    }).headers['x-founder-local-profile'], 'founder-local-read-only');
    assert.throws(() => assertFounderLocalResponseAttested({ headers: {} }), /chưa chứng thực runtime/i);
    assert.throws(() => assertFounderLocalResponseAttested({
      headers: { 'x-founder-local-profile': 'standard' },
    }), /chưa chứng thực runtime/i);
    assert.equal(assertFounderLocalResponseAttested({
      config: { headers: { 'X-Founder-Local-Company-Scope': COMPANY_A } },
      headers: {
        'x-founder-local-profile': 'founder-local-read-only',
        'x-founder-local-company-scope': COMPANY_A,
      },
    }).headers['x-founder-local-company-scope'], COMPANY_A);
    assert.throws(() => assertFounderLocalResponseAttested({
      config: { headers: { 'X-Founder-Local-Company-Scope': COMPANY_A } },
      headers: { 'x-founder-local-profile': 'founder-local-read-only' },
    }), /đúng phạm vi công ty/i);
    assert.throws(() => assertFounderLocalResponseAttested({
      config: { headers: { 'X-Founder-Local-Company-Scope': COMPANY_A } },
      headers: {
        'x-founder-local-profile': 'founder-local-read-only',
        'x-founder-local-company-scope': COMPANY_B,
      },
    }), /đúng phạm vi công ty/i);

    assert.equal(assertFounderLocalLoginAttested({
      read_only: true,
      runtime_profile: 'founder-local-read-only',
      session_expires_in_seconds: 3600,
    }).read_only, true);
    assert.throws(() => assertFounderLocalLoginAttested({
      read_only: true,
      runtime_profile: 'founder-local-read-only',
    }), /có thời hạn/i);
    assert.throws(() => assertFounderLocalLoginAttested({
      read_only: true,
      runtime_profile: 'founder-local-read-only',
      session_expires_in_seconds: 3601,
    }), /có thời hạn/i);
    assert.throws(() => assertFounderLocalLoginAttested({
      read_only: false,
      runtime_profile: 'standard',
    }), /không thuộc runtime/i);
  } finally {
    setFounderLocalReadOnlyActive(false);
  }
});

test('Founder-local guards are transparent while the profile is inactive', () => {
  setFounderLocalReadOnlyActive(false);
  assert.equal(founderLocalRequestDecision({
    method: 'post',
    url: 'https://standard-runtime.invalid/action',
    baseURL: 'https://standard-runtime.invalid',
  }).allowed, true);
  assert.deepEqual(assertFounderLocalResponseAttested({ headers: {} }), { headers: {} });
  assert.deepEqual(assertFounderLocalLoginAttested({ read_only: false }), { read_only: false });
});

test('Founder-local drilldowns require backend read-only attestation', () => {
  assert.equal(
    safeFounderLocalDrilldownHref(
      readOnlyDrilldown(`/crm/dashboard?company_id=${COMPANY_A}`, true),
      { expectedCompanyScope: COMPANY_A },
    ),
    `/crm/dashboard?company_id=${COMPANY_A}`,
  );
  assert.equal(safeFounderLocalDrilldownHref(readOnlyDrilldown('/crm/dashboard', true)), '');
  assert.equal(safeFounderLocalDrilldownHref({ href: '/management/work-unified?company_id=all', enabled: true }), '');
  assert.equal(safeFounderLocalDrilldownHref(
    readOnlyDrilldown(`/crm/dashboard?company_id=${COMPANY_B}`, true),
    { expectedCompanyScope: COMPANY_A },
  ), '');
  assert.equal(safeFounderLocalDrilldownHref(
    readOnlyDrilldown(`/management/work-unified?company_id=${COMPANY_A}`, true),
    { expectedCompanyScope: COMPANY_A },
  ), '');
  assert.equal(safeFounderLocalDrilldownHref(readOnlyDrilldown('/api/business-os', true)), '');
  assert.equal(safeFounderLocalDrilldownHref(readOnlyDrilldown('//attacker.example', true)), '');
});

test('Founder-local UI route surface is limited to its control plane and audited CRM screen', () => {
  assert.equal(founderLocalUiPathAllowed('/business-os'), true);
  assert.equal(founderLocalUiPathAllowed('/business-os/login'), true);
  assert.equal(founderLocalUiPathAllowed('/crm/dashboard'), true);
  assert.equal(founderLocalUiPathAllowed('/crm/dashboard/'), true);
  assert.equal(founderLocalUiPathAllowed('/login'), false);
  assert.equal(founderLocalUiPathAllowed('/drive'), false);
  assert.equal(founderLocalUiPathAllowed('/s/public-token'), false);
});
