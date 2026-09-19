const assert = require('assert');
const {
  matchesClientFilters,
  reportSummary,
} = require('../src/helpers/sharedWorkspaceAssignmentsReport');
const {
  buildSharedWorkspaceAnalysis,
  isoWeekMeta,
} = require('../src/helpers/sharedWorkspaceAssignmentsAnalysis');

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

const week = isoWeekMeta('2026-09-07');
assert.strictEqual(week.week, 37);
assert.ok(week.label.includes('Tuần 37/2026'));

const analysisRows = [
  {
    id: 1,
    title: 'Sửa kính',
    status: 'pending',
    task_source_type: 'employee_error',
    assignment_module: 'production',
    deadline: '2020-01-01T00:00:00Z',
    created_at: '2026-08-10T03:00:00Z',
    phat_sinh_kind: 'kinh',
    phat_sinh_kind_name: 'Kính',
    department: { id: 'd1', name: 'Xưởng' },
    project: { id: 'p1', code: 'TB-01', name: 'Chị An' },
    assignees: [{ id: 'u1', full_name: 'Nguyễn Văn A' }],
  },
  {
    id: 2,
    title: 'Làm lại cánh',
    status: 'in_progress',
    task_source_type: 'employee_error',
    assignment_module: 'production',
    deadline: '2020-01-01T00:00:00Z',
    created_at: '2026-08-12T03:00:00Z',
    phat_sinh_kind: 'kinh',
    phat_sinh_kind_name: 'Kính',
    department: { id: 'd1', name: 'Xưởng' },
    project: { id: 'p1', code: 'TB-01', name: 'Chị An' },
    assignees: [{ id: 'u1', full_name: 'Nguyễn Văn A' }],
  },
  {
    id: 3,
    title: 'Đổi tay nắm',
    status: 'completed',
    task_source_type: 'customer_request',
    assignment_module: 'crm',
    deadline: null,
    created_at: '2026-09-08T03:00:00Z',
    phat_sinh_kind: 'phu-kien',
    phat_sinh_kind_name: 'Phụ kiện',
    department: { id: 'd2', name: 'Kinh doanh' },
    project: { id: 'p2', code: 'TB-02', name: 'Anh Bình' },
    assignees: [{ id: 'u2', full_name: 'Trần Văn B' }],
  },
];

const analysis = buildSharedWorkspaceAnalysis(analysisRows, reportSummary(analysisRows));
assert.ok(analysis.by_week.length >= 2);
assert.ok(analysis.by_month.some((item) => item.key === '2026-08' && item.total === 2));
assert.ok(analysis.by_month.some((item) => item.key === '2026-09' && item.total === 1));
assert.strictEqual(analysis.by_department[0].label, 'Xưởng');
assert.strictEqual(analysis.by_project[0].project_code, 'TB-01');
assert.strictEqual(analysis.by_employee.find((item) => item.user_id === 'u1').total, 2);
assert.ok(analysis.lessons.length >= 1);
assert.ok(analysis.lessons.some((item) => item.group === 'dự án' || item.group === 'nhân viên' || item.group === 'loại'));

console.log('shared-workspace-report: analysis assertions passed');
