process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('node:assert/strict');
const {
  AFTER_SALES_PROCESS_KEY,
  CARE_ACTIVE_STAGE,
  WARRANTY_ACTIVE_STAGE,
  CLOSED_STAGE,
  CARE_TASK_DEFINITIONS,
  addCalendarDaysIso,
  caseSlaMinutes,
  canTransitionCase,
} = require('../src/helpers/businessOsAfterSales');

assert.equal(AFTER_SALES_PROCESS_KEY, 'customer_after_sales_v1');
assert.equal(CARE_ACTIVE_STAGE, 'care_active');
assert.equal(WARRANTY_ACTIVE_STAGE, 'warranty_active');
assert.equal(CLOSED_STAGE, 'closed');

assert.deepEqual(CARE_TASK_DEFINITIONS.map((task) => task.calendar_days), [7, 30, 90]);
assert.equal(new Set(CARE_TASK_DEFINITIONS.map((task) => task.item_key)).size, 3);
assert.equal(CARE_TASK_DEFINITIONS.every((task) => task.title && task.description), true);
assert.equal(
  addCalendarDaysIso('2026-08-26T03:00:00.000Z', 7),
  '2026-09-02T03:00:00.000Z',
);

assert.equal(caseSlaMinutes('urgent'), 240);
assert.equal(caseSlaMinutes('high'), 480);
assert.equal(caseSlaMinutes('medium'), 1440);
assert.equal(caseSlaMinutes('low'), 2880);
assert.equal(caseSlaMinutes('unknown'), 1440);

assert.equal(canTransitionCase('open', 'triaged'), true);
assert.equal(canTransitionCase('open', 'in_progress'), true);
assert.equal(canTransitionCase('open', 'resolved'), false);
assert.equal(canTransitionCase('triaged', 'resolved'), true);
assert.equal(canTransitionCase('in_progress', 'resolved'), true);
assert.equal(canTransitionCase('resolved', 'in_progress'), true);
assert.equal(canTransitionCase('resolved', 'closed'), true);
assert.equal(canTransitionCase('closed', 'in_progress'), false);
assert.equal(canTransitionCase('cancelled', 'open'), false);

console.log('business-os-after-sales.test: OK');
