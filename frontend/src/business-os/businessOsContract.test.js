import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBusinessOsSnapshot,
  safeBusinessOsHref,
} from './businessOsContract.js';

const NOW = Date.parse('2026-09-06T01:00:00.000Z');
const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    systems: Array.from({ length: 6 }, (_, index) => ({
      key: `system_${index}`,
      label: `System ${index}`,
      status: 'LIVE',
      module_keys: ['crm'],
      metrics: {},
      signals: [],
      drilldowns: [],
    })),
    modules: [{
      key: 'crm',
      label: 'CRM',
      activation_status: 'LIVE',
      activation: { enabled: true, company_ids: [COMPANY_A, COMPANY_B] },
      metrics: {},
      freshness: { as_of: '2026-09-06T00:59:30.000Z' },
      reconciliation: { state: 'MATCHED' },
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
    }],
    planning: { selected_period: { key: 'week' }, horizons: [], forecast: {} },
    workload: { metric_contract: {}, freshness: {} },
    capacity: { metric_contract: {}, data_gaps: [] },
    manufacturing_companies: [{
      company: { id: COMPANY_A, name: 'A' },
      status: 'LIVE WITH DATA GAPS',
      capacity: {},
      freshness: {},
      reconciliation: {},
      data_gaps: [{ message: 'No target' }],
    }],
    decision_center: { contract: {}, items: [] },
    configuration_center: {
      modules: [{ key: 'crm', company_ids: [COMPANY_A, COMPANY_B] }],
      permissions: {},
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

  const narrowed = snapshot();
  narrowed.scope.level = 'company';
  narrowed.scope.company_id = COMPANY_A;
  narrowed.scope.company_ids = [COMPANY_A];
  narrowed.scope.companies = [{ id: COMPANY_A, name: 'A' }];
  narrowed.modules[0].activation.company_ids = [COMPANY_A];
  narrowed.configuration_center.modules[0].company_ids = [COMPANY_A];
  assert.throws(() => assertBusinessOsSnapshot(narrowed, { companyId: 'all', nowMs: NOW }), /thu hẹp/);
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
