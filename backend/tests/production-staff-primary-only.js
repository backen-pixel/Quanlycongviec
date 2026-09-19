const assert = require('assert');
const {
  toPrimaryOnlyStaff,
  shouldUsePrimaryOnlyStaff,
} = require('../src/helpers/productionWorkshopTypeStaff');
const { HCB_COMPANY_ID } = require('../src/helpers/dealParticipantProduction');

assert.deepEqual(toPrimaryOnlyStaff(null), { userIds: [], primaryUserId: null });
assert.deepEqual(toPrimaryOnlyStaff({ userIds: [] }), { userIds: [], primaryUserId: null });

const many = {
  userIds: ['a', 'b', 'c'],
  primaryUserId: 'b',
};
assert.deepEqual(toPrimaryOnlyStaff(many), { userIds: ['b'], primaryUserId: 'b' });

const noPrimary = { userIds: ['x', 'y'], primaryUserId: null };
assert.deepEqual(toPrimaryOnlyStaff(noPrimary), { userIds: ['x'], primaryUserId: 'x' });

assert.strictEqual(shouldUsePrimaryOnlyStaff('other-co', true), true);
assert.strictEqual(shouldUsePrimaryOnlyStaff('other-co', false), false);
assert.strictEqual(shouldUsePrimaryOnlyStaff(HCB_COMPANY_ID, true), false);
assert.strictEqual(shouldUsePrimaryOnlyStaff(HCB_COMPANY_ID, false), false);

console.log('production-staff-primary-only: ok');
