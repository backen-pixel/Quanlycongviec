const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOperationsMetricContract,
  buildOperationsQueue,
} = require('../src/helpers/operationsReadModel');
const {
  buildProjectHealthContract,
  isFinanceProductionStage,
} = require('../src/helpers/projectHealthContract');
const { buildProjectChangeReadModel } = require('../src/helpers/projectChangeReadModel');
const {
  validateProjectChangePayload,
  hasApprovalSensitiveChanges,
} = require('../src/helpers/projectChangeRecord');

test('operations_kpi_v1 dùng Project làm đơn vị và mô tả đủ ba chặng', () => {
  const contract = buildOperationsMetricContract('company-1');
  assert.equal(contract.version, 'operations_kpi_v1');
  assert.equal(contract.unit, 'project');
  assert.equal(contract.scope_company_id, 'company-1');
  assert.deepEqual(contract.phases, ['production', 'delivery', 'installation']);
});

test('read model khử trùng Project dù Project xuất hiện ở nhiều chặng', () => {
  const shared = {
    id: 'project-1', code: 'DA-001', name: 'Dự án 1', status: 'shipping',
    company_id: 'workshop-1', logistics_company_id: 'company-1',
    sx_kanban_column_id: 'sx-1', vc_kanban_column_id: 'vc-1',
    deadline: '2999-01-01', updated_at: '2026-08-26',
  };
  const result = buildOperationsQueue({
    companyId: 'company-1',
    production: [{ ...shared, stage: { id: 'sx-1', name: 'Đóng gói' } }],
    delivery: [{ ...shared, stage: { id: 'vc-1', name: 'Đang giao' } }],
    recordsByProject: {
      'project-1': { id: 'deal-1', type: 'deal', customer: { full_name: 'Anh A' } },
    },
  });

  assert.equal(result.stats.unique_projects, 1);
  assert.equal(result.stats.production, 1);
  assert.equal(result.stats.delivery, 1);
  assert.equal(result.queues.all.length, 1);
  assert.deepEqual(result.queues.all[0].phases, ['production', 'delivery']);
  assert.equal(result.queues.all[0].commercial_record.id, 'deal-1');
});

test('hàng đợi chú ý chỉ nhận hồ sơ chờ tiếp nhận hoặc quá hạn', () => {
  const result = buildOperationsQueue({
    production: [
      { id: 'intake', status: 'consulting', deadline: '2999-01-01' },
      { id: 'overdue', status: 'producing', sx_kanban_column_id: 'sx-1', deadline: '2000-01-01' },
      { id: 'normal', status: 'producing', sx_kanban_column_id: 'sx-2', deadline: '2999-01-01' },
    ],
  });

  assert.equal(result.stats.production, 3);
  assert.equal(result.stats.production_intake, 1);
  assert.equal(result.stats.production_overdue, 1);
  assert.equal(result.stats.attention, 2);
  assert.deepEqual(result.queues.attention.map((item) => item.project_id).sort(), ['intake', 'overdue']);
});

test('project_health_v1 giữ 8 macro phase và loại trạng thái tài chính khỏi tiến độ sản xuất', () => {
  const stages = [
    { id: 'sx', name: 'Sản xuất', order_index: 1 },
    { id: 'finance', name: 'Đã thu tiền', order_index: 2, counts_as_collected_revenue: true },
  ];
  const result = buildProjectHealthContract({
    project: { id: 'project-1', status: 'producing', production_deadline: '2999-01-01' },
    productionStages: stages,
    productionStage: stages[1],
    owners: { production: { id: 'user-1', full_name: 'Anh A' } },
    now: new Date('2026-08-26T00:00:00Z'),
  });

  assert.equal(result.version, 'project_health_v1');
  assert.equal(result.phases.length, 8);
  assert.equal(result.current_phase_key, 'production');
  assert.equal(result.phases.find((phase) => phase.key === 'production').progress_pct, 100);
  assert.equal(result.health_status, 'blocked');
  assert.match(result.phases.find((phase) => phase.key === 'production').blockers[0], /thuộc Finance/);
  assert.equal(isFinanceProductionStage(stages[1]), true);
});

test('project_health_v1 chỉ coi vật tư đạt hoặc đã nhận là sẵn sàng và báo KCS fail', () => {
  const result = buildProjectHealthContract({
    project: { id: 'project-2', status: 'new' },
    materials: [
      { id: 'ready', status: 'received' },
      { id: 'failed', status: 'qc_fail', qc_status: 'fail' },
    ],
    owners: { procurement: { id: 'buyer-1', full_name: 'Chị B' } },
    now: new Date('2026-08-26T00:00:00Z'),
  });
  const procurement = result.phases.find((phase) => phase.key === 'procurement');

  assert.equal(result.current_phase_key, 'procurement');
  assert.equal(procurement.progress_pct, 50);
  assert.equal(procurement.state, 'blocked');
  assert.deepEqual(procurement.blockers, ['1 dòng vật tư không đạt KCS']);
});

test('project_health_v1 map nghiệm thu và công việc quá hạn vào đúng macro phase', () => {
  const result = buildProjectHealthContract({
    project: { id: 'project-3', status: 'installing', deadline: '2999-01-01' },
    logisticsStage: { id: 'acceptance', name: 'Nghiệm thu - bàn giao', bucket_slug: 'acceptance' },
    logisticsStages: [{ id: 'acceptance', name: 'Nghiệm thu - bàn giao', bucket_slug: 'acceptance' }],
    tasks: [{ unified_id: 'task:1', title: 'Ký biên bản', task_kind: 'VC', status: 'todo', deadline: '2026-08-20' }],
    owners: { acceptance: { id: 'installer-1', full_name: 'Anh C' } },
    now: new Date('2026-08-26T00:00:00Z'),
  });
  const acceptance = result.phases.find((phase) => phase.key === 'acceptance');

  assert.equal(result.current_phase_key, 'acceptance');
  assert.equal(result.phases.find((phase) => phase.key === 'delivery').progress_pct, 100);
  assert.equal(result.phases.find((phase) => phase.key === 'installation').progress_pct, 100);
  assert.match(acceptance.blockers[0], /Ký biên bản/);
});

test('project_health_v1 chuyển chặng hiện tại sang Lắp đặt khi giao hàng đã hoàn thành', () => {
  const result = buildProjectHealthContract({
    project: { id: 'project-4', status: 'shipping', install_date: '2026-08-18' },
    logisticsStage: { id: 'delivered', name: 'Đã giao', bucket_slug: 'delivered' },
    logisticsStages: [{ id: 'delivered', name: 'Đã giao', bucket_slug: 'delivered' }],
    owners: { installation: { id: 'installer-2', full_name: 'Anh D' } },
    now: new Date('2026-08-26T00:00:00Z'),
  });

  assert.equal(result.current_phase_key, 'installation');
  assert.equal(result.current_phase_label, 'Lắp đặt');
  assert.equal(result.phases.find((phase) => phase.key === 'delivery').progress_pct, 100);
  assert.equal(result.phases.find((phase) => phase.key === 'installation').state, 'blocked');
});

test('project_changes_v1 gom ba nguồn thật và chỉ cộng doanh thu phát sinh đã thắng', () => {
  const result = buildProjectChangeReadModel({
    projectId: 'project-5',
    incidents: [{
      id: 'incident-1', title: 'Thiếu phụ kiện', severity: 'high', status: 'open', created_at: '2026-08-26',
    }],
    approvals: [{
      id: 'approval-1', status: 'pending', stage: { id: 'stage-1', name: 'Sản xuất' }, created_at: '2026-08-25',
    }],
    commercialAdditions: [
      { id: 'deal-won', title: 'Bổ sung tủ rượu', estimated_value: 12000000, stage: { is_won: true }, created_at: '2026-08-24' },
      { id: 'deal-open', title: 'Bổ sung đảo bếp', estimated_value: 8000000, stage: { is_won: false }, created_at: '2026-08-23' },
    ],
  });

  assert.equal(result.version, 'project_changes_v1');
  assert.equal(result.stats.total_records, 4);
  assert.equal(result.stats.open_incidents, 1);
  assert.equal(result.stats.blocking_incidents, 1);
  assert.equal(result.stats.pending_approvals, 1);
  assert.equal(result.stats.commercial_additions, 2);
  assert.equal(result.stats.approved_commercial_additions, 1);
  assert.equal(result.stats.approved_commercial_value, 12000000);
  assert.equal(result.blockers[0].reason, 'Phát sinh nghiêm trọng chưa xử lý: Thiếu phụ kiện');
});

test('project_changes_v1 chỉ ra trường còn thiếu thay vì tự bịa dữ liệu phát sinh', () => {
  const result = buildProjectChangeReadModel({
    projectId: 'project-6',
    incidents: [{ id: 'incident-2', title: 'Lắp sai kích thước', status: 'open', severity: 'medium' }],
  });
  const incident = result.items[0];

  assert.equal(incident.owner, null);
  assert.equal(incident.impact.cost_amount, null);
  assert.match(incident.missing_fields.join(' · '), /Người\/bộ phận chịu trách nhiệm/);
  assert.match(incident.missing_fields.join(' · '), /Ảnh hưởng chi phí/);
  assert.equal(incident.blocks_project, false);
});

test('project_health_v1 nhận blocker nghiêm trọng từ Project change read model', () => {
  const result = buildProjectHealthContract({
    project: { id: 'project-7', status: 'producing', production_deadline: '2999-01-01' },
    productionStage: { id: 'sx-1', name: 'Sản xuất', order_index: 1 },
    productionStages: [{ id: 'sx-1', name: 'Sản xuất', order_index: 1 }],
    owners: { production: { id: 'user-1', full_name: 'Anh A' } },
    externalBlockers: [{ reason: 'Phát sinh nghiêm trọng chưa xử lý: Hỏng mặt đá' }],
    now: new Date('2026-08-26T00:00:00Z'),
  });
  const production = result.phases.find((phase) => phase.key === 'production');

  assert.equal(result.health_status, 'blocked');
  assert.match(production.blockers.join(' · '), /Hỏng mặt đá/);
});

test('Project change contract chỉ bắt buộc loại, tiêu đề và nguyên nhân khi tạo', () => {
  const missingCause = validateProjectChangePayload({
    change_type: 'material_change',
    title: 'Đổi mặt đá',
  });
  assert.equal(missingCause.ok, false);
  assert.match(missingCause.error, /nguyên nhân/i);

  const valid = validateProjectChangePayload({
    change_type: 'material_change',
    title: 'Đổi mặt đá',
    cause: 'Khách đổi màu sau khi duyệt thiết kế',
    cost_impact: '1500000',
    schedule_impact_days: '2',
    requires_approval: true,
    attachments: [{ file_name: 'xac-nhan.pdf', file_url: '/uploads/xac-nhan.pdf' }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.cost_impact, 1500000);
  assert.equal(valid.value.schedule_impact_days, 2);
  assert.equal(valid.value.requires_approval, true);
  assert.equal(valid.value.attachments.length, 1);
});

test('Project change contract cho phép cập nhật trạng thái mà không bắt nhập lại hồ sơ', () => {
  const result = validateProjectChangePayload({ status: 'in_progress' }, { partial: true });
  assert.deepEqual(result, { ok: true, value: { status: 'in_progress' } });
});

test('Project change contract không ghi đè nguyên nhân khi chỉ sửa mô tả', () => {
  const result = validateProjectChangePayload({ description: 'Bổ sung phương án xử lý' }, { partial: true });
  assert.deepEqual(result, { ok: true, value: { description: 'Bổ sung phương án xử lý' } });
});

test('Project change contract nhận diện thay đổi phải xin duyệt lại', () => {
  assert.equal(hasApprovalSensitiveChanges({ cost_impact: 2500000 }), true);
  assert.equal(hasApprovalSensitiveChanges({ attachments: [] }), true);
  assert.equal(hasApprovalSensitiveChanges({ status: 'in_progress' }), false);
});
