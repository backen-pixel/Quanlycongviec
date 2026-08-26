const PROJECT_CHANGES_VERSION = 'project_changes_v1';

const OPEN_INCIDENT_STATUSES = new Set(['open', 'in_progress', 'pending']);
const BLOCKING_INCIDENT_SEVERITIES = new Set(['high', 'critical', 'blocker']);
const CHANGE_TYPE_LABELS = {
  operational_incident: 'Sự cố vận hành',
  customer_request: 'Yêu cầu khách hàng',
  design_change: 'Thay đổi thiết kế',
  material_change: 'Thay đổi vật tư',
  quantity_change: 'Thay đổi khối lượng',
  site_condition: 'Điều kiện công trường',
  rework: 'Thi công lại',
  commercial_change: 'Phát sinh thương mại',
  other: 'Phát sinh khác',
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeAttachments(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addMissing(list, condition, label) {
  if (condition && !list.includes(label)) list.push(label);
}

function incidentItem(projectId, row) {
  const status = String(row?.status || 'open').toLowerCase();
  const severity = String(row?.severity || 'medium').toLowerCase();
  const open = OPEN_INCIDENT_STATUSES.has(status);
  const attachments = normalizeAttachments(row?.attachments);
  const changeType = row?.change_type || 'operational_incident';
  const approvalStatus = row?.requires_approval
    ? (row?.approval_status || 'pending')
    : 'not_required';
  const missingFields = [];

  addMissing(missingFields, !row?.cause, 'Nguyên nhân phát sinh');
  addMissing(missingFields, !row?.phase_key, 'Chặng Project bị ảnh hưởng');
  addMissing(missingFields, open && !row?.owner && !row?.responsible, 'Người/bộ phận chịu trách nhiệm');
  addMissing(missingFields, numberOrNull(row?.cost_impact) == null, 'Ảnh hưởng chi phí');
  addMissing(missingFields, numberOrNull(row?.schedule_impact_days) == null, 'Ảnh hưởng số ngày tiến độ');
  addMissing(missingFields, !row?.cost_bearer, 'Bên chịu chi phí');
  addMissing(missingFields, attachments.length === 0, 'Bằng chứng/tài liệu');
  addMissing(missingFields, !row?.task_id && !row?.purchase_request_id && !row?.quotation_id, 'Liên kết task/chứng từ');

  return {
    id: row.id,
    source: 'project_incidents',
    record_type: 'operational_incident',
    record_type_label: CHANGE_TYPE_LABELS[changeType] || 'Phát sinh Project',
    change_type: changeType,
    title: row.title || 'Sự cố chưa đặt tên',
    description: row.description || null,
    cause: row.cause || null,
    phase_key: row.phase_key || null,
    status,
    severity,
    created_at: row.created_at || null,
    resolved_at: row.resolved_at || null,
    reporter: row.reporter || null,
    owner: row.owner || row.responsible || row.resolver || null,
    attachments,
    impact: {
      cost_amount: numberOrNull(row.cost_impact),
      schedule_days: numberOrNull(row.schedule_impact_days),
      cost_bearer: row.cost_bearer || null,
    },
    approval: {
      required: row?.requires_approval === true,
      status: approvalStatus,
      decided_by: row.approver || null,
      decided_at: row.approved_at || null,
      notes: row.approval_notes || null,
      rejected_reason: row.rejected_reason || null,
    },
    related: { project_id: projectId, links: Array.isArray(row.related_links) ? row.related_links : [] },
    source_url: `/sx/projects/${projectId}?tab=incidents`,
    missing_fields: missingFields,
    blocks_project: open && BLOCKING_INCIDENT_SEVERITIES.has(severity),
  };
}

function approvalItem(projectId, row) {
  const status = String(row?.status || 'pending').toLowerCase();
  const attachments = normalizeAttachments(row?.attachments);
  return {
    id: row.id,
    source: 'project_approvals',
    record_type: 'workflow_approval',
    record_type_label: 'Phê duyệt Project',
    title: `Duyệt ${row?.stage?.name || 'giai đoạn Project'}`,
    description: row.notes || row.approve_notes || row.reject_reason || null,
    status,
    severity: null,
    created_at: row.created_at || null,
    resolved_at: row.decided_at || null,
    reporter: row.requester || null,
    owner: row.decider || null,
    attachments,
    impact: { cost_amount: null, schedule_days: null, cost_bearer: null },
    approval: {
      status,
      requested_by: row.requester || null,
      decided_by: row.decider || null,
      decided_at: row.decided_at || null,
      reject_reason: row.reject_reason || null,
    },
    related: { project_id: projectId, stage_id: row.stage_id || row.stage?.id || null },
    source_url: `/projects/${projectId}?tab=approvals`,
    missing_fields: [],
    blocks_project: false,
  };
}

function commercialAdditionItem(row) {
  const won = row?.stage?.is_won === true;
  const lost = row?.stage?.is_lost === true;
  const status = won ? 'approved' : lost ? 'rejected' : 'in_progress';
  const estimatedValue = numberOrNull(row?.estimated_value) || 0;
  const owner = row?.assignee || row?.lead_owner || null;
  const missingFields = [];

  addMissing(missingFields, !owner, 'Người chịu trách nhiệm');
  addMissing(missingFields, !row?.description && !row?.notes, 'Nguyên nhân/nội dung phát sinh');
  addMissing(missingFields, !row?.schedule_impact_days, 'Ảnh hưởng số ngày tiến độ');
  addMissing(missingFields, !row?.cost_bearer, 'Bên chịu chi phí');
  addMissing(missingFields, !row?.attachments?.length, 'Bằng chứng/tài liệu');

  return {
    id: row.id,
    source: 'crm_leads',
    record_type: 'commercial_addition',
    record_type_label: 'Đơn hàng phát sinh',
    title: row.title || row.code || 'Đơn hàng phát sinh',
    description: row.description || row.notes || null,
    status,
    stage: row.stage || null,
    severity: null,
    created_at: row.created_at || null,
    resolved_at: null,
    reporter: null,
    owner,
    attachments: normalizeAttachments(row.attachments),
    impact: {
      commercial_value: estimatedValue,
      revenue_adjustment_amount: won ? estimatedValue : 0,
      cost_amount: null,
      schedule_days: numberOrNull(row.schedule_impact_days),
      cost_bearer: row.cost_bearer || null,
    },
    approval: {
      status,
      approved_for_revenue: won,
      decided_by: null,
      decided_at: null,
    },
    related: {
      source_deal_id: row.source_customer_deal_id || null,
      deal_id: row.id,
      project_id: row.project_id || null,
    },
    source_url: `/crm/leads/${row.id}`,
    missing_fields: missingFields,
    blocks_project: false,
  };
}

function byNewest(left, right) {
  const leftTime = new Date(left.created_at || 0).getTime() || 0;
  const rightTime = new Date(right.created_at || 0).getTime() || 0;
  return rightTime - leftTime;
}

function buildProjectChangeReadModel({
  projectId = null,
  incidents = [],
  approvals = [],
  commercialAdditions = [],
} = {}) {
  const incidentItems = incidents.map((row) => incidentItem(projectId, row));
  const approvalItems = approvals.map((row) => approvalItem(projectId, row));
  const commercialItems = commercialAdditions.map(commercialAdditionItem);
  const items = [...incidentItems, ...approvalItems, ...commercialItems].sort(byNewest);
  const openIncidents = incidentItems.filter((item) => OPEN_INCIDENT_STATUSES.has(item.status));
  const blockingIncidents = openIncidents.filter((item) => item.blocks_project);
  const approvedCommercial = commercialItems.filter((item) => item.approval?.approved_for_revenue);

  return {
    version: PROJECT_CHANGES_VERSION,
    project_id: projectId,
    source: 'project_incidents + project_approvals + crm_leads.source_customer_deal_id',
    rules: {
      commercial_revenue_adjustment: 'Chỉ Deal phát sinh ở trạng thái thắng mới điều chỉnh doanh thu Project.',
      health_blocker: 'Chỉ sự cố mức cao/nghiêm trọng chưa xử lý mới tự động tạo blocker Project.',
    },
    stats: {
      total_records: items.length,
      open_incidents: openIncidents.length,
      blocking_incidents: blockingIncidents.length,
      pending_approvals: approvalItems.filter((item) => item.status === 'pending').length
        + incidentItems.filter((item) => item.approval?.status === 'pending').length,
      pending_change_approvals: incidentItems.filter((item) => item.approval?.status === 'pending').length,
      commercial_additions: commercialItems.length,
      approved_commercial_additions: approvedCommercial.length,
      approved_commercial_value: approvedCommercial.reduce(
        (sum, item) => sum + (item.impact.revenue_adjustment_amount || 0),
        0,
      ),
      approved_cost_impact: incidentItems
        .filter((item) => ['not_required', 'approved'].includes(item.approval?.status))
        .reduce((sum, item) => sum + (item.impact.cost_amount || 0), 0),
      records_missing_contract_fields: [...incidentItems, ...commercialItems]
        .filter((item) => item.missing_fields.length > 0).length,
    },
    coverage: [
      { source: 'project_incidents', label: 'Sự cố xưởng/công trường', count: incidentItems.length },
      { source: 'project_approvals', label: 'Phê duyệt Project', count: approvalItems.length },
      { source: 'crm_leads', label: 'Đơn hàng phát sinh', count: commercialItems.length },
    ],
    blockers: blockingIncidents.map((item) => ({
      id: item.id,
      source: item.source,
      phase_key: item.phase_key || null,
      reason: `Phát sinh nghiêm trọng chưa xử lý: ${item.title}`,
    })),
    items,
  };
}

module.exports = {
  PROJECT_CHANGES_VERSION,
  buildProjectChangeReadModel,
};
