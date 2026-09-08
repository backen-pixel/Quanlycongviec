const assert = require('assert');
const {
  canManageAssignmentStructure,
  canOverrideAssignmentManage,
} = require('../src/helpers/assignmentManageAccess');

const THANH = {
  userId: '646e364e-504d-4362-af1a-4f4694b0d05d',
  role: 'admin',
  company_id: null,
};

const CREATOR = { userId: 'user-creator', role: 'sales', company_id: 'co-a' };
const OTHER = { userId: 'user-other', role: 'sales', company_id: 'co-a' };
const COMPANY_ADMIN = { userId: 'admin-a', role: 'admin', company_id: 'co-a' };
const OTHER_COMPANY_ADMIN = { userId: 'admin-b', role: 'admin', company_id: 'co-b' };

const row = {
  id: 'asg-1',
  created_by_id: 'user-creator',
  company_id: 'co-a',
  executor_company_id: 'co-sx',
};

assert.strictEqual(canManageAssignmentStructure(CREATOR, row), true);
assert.strictEqual(canManageAssignmentStructure(OTHER, row), false);
assert.strictEqual(canOverrideAssignmentManage(THANH, row), true);
assert.strictEqual(canManageAssignmentStructure(THANH, row), true, 'admin hệ thống sửa/xóa việc người khác');
assert.strictEqual(canManageAssignmentStructure(COMPANY_ADMIN, row), true);
assert.strictEqual(canManageAssignmentStructure(OTHER_COMPANY_ADMIN, row), false);
assert.strictEqual(
  canManageAssignmentStructure(OTHER_COMPANY_ADMIN, { ...row, executor_company_id: 'co-b' }),
  true,
);

console.log('assignment-manage-access: OK');
