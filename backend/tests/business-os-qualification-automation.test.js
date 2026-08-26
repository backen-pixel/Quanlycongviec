process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('node:assert/strict');
const {
  DEFAULT_TASK_ITEMS,
  itemKeyFromTitle,
  normalizeTaskItems,
  normalizeQualificationAutomation,
  qualificationSlaLevel,
  buildQualificationFunnelKpi,
} = require('../src/helpers/businessOsQualificationAutomation');

const defaults = normalizeQualificationAutomation({ company_id: 'company-1' });
assert.equal(defaults.persisted, false);
assert.equal(defaults.sla_policy.duration_minutes, 960);
assert.equal(defaults.sla_policy.warning_minutes, 240);
assert.equal(defaults.task_items.length, DEFAULT_TASK_ITEMS.length);
assert.equal(defaults.task_items.filter((item) => item.blocks_stage_advance).length, 2);

assert.match(itemKeyFromTitle('Xác minh nhu cầu', 0), /^xac_minh_nhu_cau_/);
assert.throws(() => normalizeTaskItems([{ title: '' }]), /chưa có tên/);

const custom = normalizeQualificationAutomation({
  id: 'automation-1',
  company_id: 'company-1',
  sla_duration_minutes: 480,
  sla_warning_minutes: 600,
}, [{
  item_key: 'call_customer',
  title: 'Gọi khách hàng',
  deadline_minutes: 60,
  blocks_stage_advance: true,
  assignment_strategy: 'record_owner',
}]);
assert.equal(custom.persisted, true);
assert.equal(custom.sla_policy.duration_minutes, 480);
assert.equal(custom.sla_policy.warning_minutes, 480);
assert.equal(custom.task_items[0].item_key, 'call_customer');

const now = new Date('2026-08-25T08:00:00.000Z');
assert.equal(qualificationSlaLevel({ dueAt: '2026-08-25T07:59:59.000Z', now }), 'overdue');
assert.equal(qualificationSlaLevel({ dueAt: '2026-08-25T10:00:00.000Z', now, warningMinutes: 240 }), 'at_risk');
assert.equal(qualificationSlaLevel({ dueAt: '2026-08-26T10:00:00.000Z', now, warningMinutes: 240 }), 'on_track');

const records = [
  { id: 'lead-1', type: 'lead' },
  { id: 'lead-2', type: 'deal' },
  { id: 'lead-3', type: 'lead' },
];
const instances = [
  {
    record_id: 'lead-1',
    current_stage_key: 'qualification',
    sla_started_at: '2026-08-25T06:00:00.000Z',
    sla_due_at: '2026-08-25T07:00:00.000Z',
  },
  {
    record_id: 'lead-2',
    current_stage_key: 'deal',
    sla_started_at: '2026-08-24T06:00:00.000Z',
    sla_due_at: '2026-08-24T10:00:00.000Z',
    qualified_at: '2026-08-24T08:00:00.000Z',
    converted_at: '2026-08-24T09:00:00.000Z',
  },
];
const funnel = buildQualificationFunnelKpi({ records, instances, now });
assert.equal(funnel.total_records, 3);
assert.equal(funnel.qualification_started, 2);
assert.equal(funnel.qualification_completed, 1);
assert.equal(funnel.converted_to_deal, 1);
assert.equal(funnel.active_qualification, 1);
assert.equal(funnel.sla_overdue, 1);
assert.equal(funnel.lead_to_deal_rate_pct, 33.3);
assert.equal(funnel.sla_on_time_rate_pct, 100);
assert.equal(funnel.average_qualification_hours, 2);

console.log('business-os-qualification-automation.test: OK');
