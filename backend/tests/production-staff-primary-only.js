const assert = require('assert');
const { toPrimaryOnlyStaff } = require('../src/helpers/productionWorkshopTypeStaff');

assert.deepEqual(toPrimaryOnlyStaff(null), { userIds: [], primaryUserId: null });
assert.deepEqual(toPrimaryOnlyStaff({ userIds: [] }), { userIds: [], primaryUserId: null });

const many = {
  userIds: ['a', 'b', 'c'],
  primaryUserId: 'b',
};
assert.deepEqual(toPrimaryOnlyStaff(many), { userIds: ['b'], primaryUserId: 'b' });

const noPrimary = { userIds: ['x', 'y'], primaryUserId: null };
assert.deepEqual(toPrimaryOnlyStaff(noPrimary), { userIds: ['x'], primaryUserId: 'x' });

console.log('production-staff-primary-only: ok');
