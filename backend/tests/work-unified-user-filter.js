const assert = require('assert');
const {
  parseWorkUnifiedUserIds,
  workUnifiedItemMatchesUserIds,
} = require('../src/helpers/workUnifiedUserFilter');

const a = '11111111-1111-1111-1111-111111111111';
const b = '22222222-2222-2222-2222-222222222222';
const c = '33333333-3333-3333-3333-333333333333';

assert.deepStrictEqual(parseWorkUnifiedUserIds({}), []);
assert.deepStrictEqual(parseWorkUnifiedUserIds({ user_id: a }), [a]);
assert.deepStrictEqual(parseWorkUnifiedUserIds({ user_ids: `${a},${b}` }), [a, b]);
assert.deepStrictEqual(parseWorkUnifiedUserIds({ user_id: [a, b], user_ids: c }), [c, a, b]);
assert.deepStrictEqual(parseWorkUnifiedUserIds({ user_id: 'not-a-uuid' }), []);

const item = {
  sales_person_id: a,
  project_manager_id: null,
  deal_assignee_id: c,
  deal_staff_ids: [c],
};
assert.strictEqual(workUnifiedItemMatchesUserIds(item, []), true);
assert.strictEqual(workUnifiedItemMatchesUserIds(item, [a]), true);
assert.strictEqual(workUnifiedItemMatchesUserIds(item, [b, c]), true);
assert.strictEqual(workUnifiedItemMatchesUserIds(item, [b]), false);
assert.strictEqual(workUnifiedItemMatchesUserIds({
  ...item,
  person2_id: b,
}, [b]), false);
assert.strictEqual(workUnifiedItemMatchesUserIds({
  ...item,
  deal_staff_ids: [b, c],
}, [b]), true);

console.log('work-unified-user-filter: OK');
