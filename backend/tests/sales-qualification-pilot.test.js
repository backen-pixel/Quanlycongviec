process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('node:assert/strict');
const {
  buildQualificationRequirements,
  isQualificationTask,
  normalizeQualificationStageContract,
  normalizeSalesPilotConfig,
} = require('../src/helpers/salesQualificationPilot');

const requirements = buildQualificationRequirements({
  customer_id: 'customer-1',
  phone: '0909000000',
  region_id: 'region-1',
  assigned_to: 'user-1',
  description: 'Khách cần tủ bếp chữ L hiện đại.',
  estimated_value: 120000000,
  expected_construction_time: 'under_1m',
  install_address: 'Cần Thơ',
});
assert.equal(requirements.length, 8);
assert.equal(requirements.every((item) => item.complete), true);
assert.equal(requirements.filter((item) => item.required).length, 4);
assert.deepEqual(
  requirements.filter((item) => item.required).map((item) => item.key),
  ['customer_id', 'region_id', 'owner_id', 'description'],
);

const customContract = normalizeQualificationStageContract({
  required_fields: ['estimated_value'],
  optional_fields: ['phone'],
});
assert.deepEqual(customContract.required_fields, [
  'customer_id',
  'region_id',
  'owner_id',
  'estimated_value',
]);
assert.deepEqual(customContract.optional_fields, ['phone']);
assert.equal(customContract.fields.find((field) => field.key === 'description').mode, 'hidden');
assert.equal(customContract.fields.find((field) => field.key === 'customer_id').system_required, true);

assert.equal(isQualificationTask({ stage_slug: 'consulting' }), true);
assert.equal(isQualificationTask({ stage_slug: 'qualification' }), true);
assert.equal(isQualificationTask({ stage_slug: 'lead_qualification' }), true);
assert.equal(isQualificationTask({ stage_slug: 'deal_new' }), false);
assert.equal(isQualificationTask({ stage_slug: 'deal_quote_contract' }), false);
assert.equal(isQualificationTask({ stage_slug: 'deal_ordering' }), false);
assert.equal(isQualificationTask({ stage_slug: 'deal_schedule' }), false);
assert.equal(isQualificationTask({ stage_slug: null }), false);

const config = normalizeSalesPilotConfig({
  enabled: true,
  company_id: 'company-1',
  mode: 'enforce',
  workspace_mode: 'all_modules_gateway',
});
assert.equal(config.enabled, true);
assert.equal(config.company_id, 'company-1');
assert.equal(config.workspace_mode, 'all_modules_gateway');

console.log('sales-qualification-pilot.test: OK');
