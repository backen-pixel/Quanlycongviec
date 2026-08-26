process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('assert/strict');
const { buildBusinessOsSnapshot, slaStatus } = require('../src/helpers/businessOsOverview');

function baseLead(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    code: 'LEAD-001',
    title: 'Tủ bếp căn hộ mẫu',
    type: 'lead',
    company_id: '00000000-0000-4000-8000-000000000010',
    customer_id: '00000000-0000-4000-8000-000000000002',
    phone: '0909000000',
    region_id: '00000000-0000-4000-8000-000000000003',
    assigned_to: '00000000-0000-4000-8000-000000000004',
    description: 'Khách cần tủ bếp chữ L, phong cách hiện đại.',
    estimated_value: 180000000,
    expected_construction_time: '1_2m',
    install_address: 'TP.HCM',
    customer: { id: 'c1', full_name: 'Khách mẫu', phone: '0909000000' },
    assignee: { id: 'u1', full_name: 'Sales mẫu' },
    updated_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

function run() {
  const now = new Date('2026-08-24T10:00:00.000Z');
  assert.equal(slaStatus('qualification', '2026-08-24T09:00:00.000Z', now.getTime()), 'overdue');
  assert.equal(slaStatus('qualification', '2026-08-24T12:00:00.000Z', now.getTime()), 'at_risk');
  assert.equal(slaStatus('survey', '2026-08-24T09:00:00.000Z', now.getTime()), 'overdue');
  assert.equal(slaStatus('design', '2026-08-24T12:00:00.000Z', now.getTime()), 'at_risk');
  assert.equal(slaStatus('design_review', '2026-08-24T12:00:00.000Z', now.getTime()), 'at_risk');
  assert.equal(slaStatus('lead', '2026-08-24T09:00:00.000Z', now.getTime()), 'none');

  const secondId = '00000000-0000-4000-8000-000000000005';
  const snapshot = buildBusinessOsSnapshot({
    now,
    records: [baseLead(), baseLead({ id: secondId, code: 'DEAL-001', type: 'deal', title: 'Deal mẫu' })],
    audits: [{
      entity_id: '00000000-0000-4000-8000-000000000001',
      action: 'sales.qualification.started',
      after: {
        process_key: 'sales_lead_qualification_v1',
        stage_key: 'qualification',
        sla_due_at: '2026-08-24T09:00:00.000Z',
      },
    }],
    blockingTasksByLead: new Map(),
  });

  assert.equal(snapshot.summary.total_records, 2);
  assert.equal(snapshot.summary.stage_counts.qualification, 1);
  assert.equal(snapshot.summary.stage_counts.deal, 1);
  assert.equal(snapshot.summary.sla_overdue, 1);
  assert.equal(snapshot.summary.event_throughput.qualification_started, 1);
  assert.equal(snapshot.records[0].operational_status, 'sla_overdue');
  assert.equal(snapshot.records[1].operational_status, 'waiting_route_selection');

  const blocked = buildBusinessOsSnapshot({
    now,
    records: [baseLead()],
    audits: [],
    blockingTasksByLead: new Map([[
      '00000000-0000-4000-8000-000000000001',
      [{ id: 'task-1', title: 'Khảo sát', block_reason: 'incomplete' }],
    ]]),
  });
  assert.equal(blocked.records[0].operational_status, 'task_blocked');
  assert.equal(blocked.summary.blocked_records, 1);

  console.log('business-os-overview: all passed');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
