const assert = require('assert');
const {
  matchesClientFilters,
  reportSummary,
} = require('../src/helpers/sharedWorkspaceAssignmentsReport');

const rows = [
  {
    id: 1,
    title: 'Sửa kính bếp',
    status: 'pending',
    task_source_type: 'customer_request',
    deadline: '2020-01-01T00:00:00Z',
    lead: { code: 'DEAL-01', title: 'Chị An' },
    project: { code: 'DA-01', name: 'Tủ bếp chị An' },
    created_by: { full_name: 'Admin' },
    assignees: [{ id: 'u1', full_name: 'Nguyễn Văn A' }],
  },
  {
    id: 2,
    title: 'Làm lại cánh',
    status: 'completed',
    task_source_type: 'employee_error',
    deadline: null,
    lead: { code: 'DEAL-02', title: 'Anh Bình' },
    project: null,
    created_by: { full_name: 'Quản lý' },
    assignees: [{ id: 'u2', full_name: 'Trần Văn B' }],
  },
];

assert.strictEqual(matchesClientFilters(rows[0], { assignee_id: 'u1' }), true);
assert.strictEqual(matchesClientFilters(rows[0], { assignee_id: 'u2' }), false);
assert.strictEqual(matchesClientFilters(rows[0], { q: 'deal-01' }), true);
assert.strictEqual(matchesClientFilters(rows[0], { q: 'nguyễn văn a' }), true);
assert.strictEqual(matchesClientFilters(rows[0], { q: 'không tồn tại' }), false);

const summary = reportSummary(rows);
assert.deepStrictEqual(summary, {
  total: 2,
  pending: 1,
  in_progress: 0,
  completed: 1,
  cancelled: 0,
  overdue: 1,
  customer_request: 1,
  employee_error: 1,
});

console.log('shared-workspace-report: 6 assertions passed');
