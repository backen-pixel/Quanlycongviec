'use strict';

// Deliberately synthetic IDs, names and values. No business snapshots or secrets.
const { ENTITIES, FIELDS, EDGE_TYPES, MODE } = require('../../../src/helpers/customerJourneyReadModel');
const FIXTURE_TIME = '2026-09-06T12:00:00.000Z';
const ECOSYSTEM = 'fixture-ecosystem';
const TRADING = 'fixture-trading';
const MANUFACTURING = 'fixture-manufacturing';
const DENIED = 'fixture-denied';
function fixtureActor(overrides = {}) {
  return { id: 'fixture-reviewer', active: true, ecosystem_id: ECOSYSTEM,
    company_ids: [TRADING, MANUFACTURING], resource_permissions: [...ENTITIES],
    field_permissions: Object.fromEntries(ENTITIES.map((entity) => [entity, ['label', ...FIELDS]])),
    edge_permissions: Object.keys(EDGE_TYPES), denied_record_refs: [], ...overrides };
}
function createFixtureSnapshot() {
  const record = (entity, id, label, fields = {}, company = TRADING, source = entity) => ({
    ref: `${source}:${id}`, source_type: source, source_id: id, entity, label,
    ecosystem_id: ECOSYSTEM, company_id: company, fields,
  });
  const records = [
    record('customer', 'customer-a', 'Khách giả lập A'),
    record('customer', 'customer-b', 'Khách giả lập A'), // same label, separate identity
    record('lead', 'lead-cold', 'Lead lạnh giả lập', { temperature: 'cold', stage: 'warm', source_name: 'Nguồn giả lập', owner: 'Người phụ trách giả lập', created_at: '2026-09-01T01:00:00Z' }, TRADING, 'crm_leads'),
    record('lead', 'lead-unknown', 'Lead chưa phân loại', { temperature: null, created_at: '2026-09-02T01:00:00Z' }, TRADING, 'crm_leads'),
    record('deal', 'deal-a', 'Cam kết A1 — giả lập', { status: 'in_progress', owner: 'Người phụ trách giả lập', created_at: '2026-08-01T01:00:00Z' }, TRADING, 'crm_leads'),
    record('deal', 'deal-b', 'Cam kết A2 — giả lập', { status: 'in_progress', created_at: '2026-09-02T01:00:00Z' }, TRADING, 'crm_leads'),
    record('deal', 'deal-other', 'Cam kết của khách khác', { created_at: '2026-09-03T01:00:00Z' }, TRADING, 'crm_leads'),
    record('order', 'order-a', 'Đơn thương mại giả lập A', { status: 'confirmed', due_at: '2026-09-15T00:00:00+07:00' }, TRADING, 'orders'),
    record('project', 'project-shared', 'Công trình giả lập dùng chung', { status: 'in_progress', due_at: '2026-09-18T00:00:00+07:00' }, MANUFACTURING, 'projects'),
    record('project', 'project-secondary', 'Công trình SX thứ hai giả lập', { status: 'in_progress', owner: 'Đội SX giả lập' }, MANUFACTURING, 'projects'),
    record('task', 'crm-work', 'Công việc CRM giả lập', { status: 'in_progress', owner: 'Nhân viên giả lập', due_at: '2026-09-04T00:00:00+07:00', blocker: 'Thiếu bằng chứng nguồn giả lập', next_action: 'Bổ sung theo nguồn giả lập', decision_required: true, decision_reason: 'Cần xem bằng chứng giả lập' }, TRADING, 'crm_tasks'),
    record('assignment', 'mirror-work', 'Bản phân công cùng việc CRM', { status: 'in_progress', due_at: '2026-09-04T00:00:00+07:00' }, TRADING, 'crm_assignments'),
    record('task', 'production-work', 'Công việc SX giả lập', { status: 'in_progress', owner: 'Đội SX giả lập', due_at: '2026-09-10T00:00:00+07:00', started_at: '2026-09-03T02:00:00Z' }, MANUFACTURING, 'tasks'),
    record('task', 'sequential-work', 'Việc kế tiếp chưa khởi hạn', { status: 'pending', due_at: null }, MANUFACTURING, 'tasks'),
    record('task', 'cancelled-work', 'Việc giả lập đã hủy', { status: 'cancelled', due_at: '2026-09-03T00:00:00+07:00', completed_at: null }, MANUFACTURING, 'tasks'),
    record('purchase_request', 'pr-a', 'Hạng mục cần mua giả lập', { status: 'received', next_action: 'KCS theo nguồn', due_at: '2026-09-07T00:00:00+07:00' }, MANUFACTURING, 'purchase_requests'),
    record('purchase_order', 'po-a', 'Đơn mua hàng giả lập', { status: 'ordered' }, TRADING, 'purchase_orders'),
    record('invoice', 'invoice-a', 'Hóa đơn giả lập', { status: 'unpaid', amount: 100, amount_basis: 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT' }, TRADING, 'invoices'),
    record('payment', 'payment-a', 'Bản ghi thu tiền giả lập', { amount: 20, amount_basis: 'SYNTHETIC_PAYMENT_RECORD_AMOUNT', created_at: '2026-09-04T01:00:00Z' }, TRADING, 'payment_records'),
    record('expense', 'expense-a', 'Chi phí đã ghi nhận giả lập', { amount: 5, amount_basis: 'SYNTHETIC_RECORDED_PROJECT_EXPENSE_NOT_FULL_COST', created_at: '2026-09-04T01:00:00Z' }, MANUFACTURING, 'project_expenses'),
    record('quotation', 'quotation-a', 'Báo giá tham chiếu giả lập', { amount: 120, amount_basis: 'SYNTHETIC_QUOTATION_TOTAL_NOT_REVENUE', status: 'draft', created_at: '2026-09-01T01:00:00Z' }, TRADING, 'quotations'),
    record('incident', 'incident-a', 'Sự cố giả lập đã đóng', { status: 'closed', next_action: null, decision_required: true }, MANUFACTURING, 'project_incidents'),
    record('rating', 'rating-a', 'Phản hồi giả lập', { stars: 2, feedback: 'Phản hồi hoàn toàn giả lập', source_name: 'manual', created_at: '2026-09-05T01:00:00Z' }, TRADING, 'deal_customer_ratings'),
    record('time_log', 'time-a', 'Giờ làm giả lập — không phải lương', { hours: 2, started_at: '2026-09-03T02:00:00Z' }, MANUFACTURING, 'task_time_logs'),
    record('conversion_event', 'event-a', 'Sự kiện chuyển đổi giả lập', { event_type: 'lead_converted', occurred_at: '2026-09-02T01:00:00Z' }, TRADING, 'crm_kpi_ledger'),
    record('person', 'person-a', 'Người giả lập thương mại', { is_active: true }),
    record('person', 'person-b', 'Người giả lập SX', { is_active: true }, MANUFACTURING),
    record('deal', 'denied-deal', 'KHÔNG ĐƯỢC LỘ TÊN GIẢ LẬP', { private_notes: 'KHÔNG ĐƯỢC LỘ FIELD GIẢ LẬP' }, DENIED, 'crm_leads'),
  ];
  // View fan-out: same source task repeated; must not become two work items.
  records.push(JSON.parse(JSON.stringify(records.find((row) => row.ref === 'tasks:production-work'))));
  const edge = (kind, from, to) => ({ kind, from, to });
  return { mode: MODE, snapshot_id: 'fixture-snapshot-v1', ecosystem_id: ECOSYSTEM, observed_at: FIXTURE_TIME,
    companies: [{ id: TRADING, name: 'Công ty thương mại giả lập', kind: 'trading', ecosystem_id: ECOSYSTEM, active: true },
      { id: MANUFACTURING, name: 'Công ty sản xuất giả lập', kind: 'manufacturing', ecosystem_id: ECOSYSTEM, active: true },
      { id: DENIED, name: 'Công ty không được phép giả lập', kind: 'trading', ecosystem_id: ECOSYSTEM, active: true }],
    records, coverage: Object.fromEntries(ENTITIES.map((entity) => [entity, {
      state: entity === 'conversion_event' ? 'PARTIAL' : 'EXACT',
      gaps: entity === 'conversion_event' ? ['CONVERSION_EVENT_HISTORY_NOT_COMPLETE'] : [],
    }])), edges: [
      edge('customer_lead', 'customer:customer-a', 'crm_leads:lead-cold'),
      edge('customer_lead', 'customer:customer-a', 'crm_leads:deal-a'),
      edge('customer_lead', 'customer:customer-a', 'crm_leads:deal-b'),
      edge('customer_lead', 'customer:customer-b', 'crm_leads:deal-other'),
      edge('customer_lead', 'customer:customer-a', 'crm_leads:denied-deal'),
      edge('primary_project', 'crm_leads:deal-a', 'projects:project-shared'),
      edge('junction_project', 'crm_leads:deal-a', 'projects:project-shared'),
      edge('junction_project', 'crm_leads:deal-a', 'projects:project-secondary'),
      edge('primary_project', 'crm_leads:deal-b', 'projects:project-shared'),
      edge('primary_project', 'crm_leads:deal-other', 'projects:project-shared'),
      edge('order_lead', 'orders:order-a', 'crm_leads:deal-a'),
      edge('order_project', 'orders:order-a', 'projects:project-shared'),
      edge('task_lead', 'crm_tasks:crm-work', 'crm_leads:deal-a'),
      edge('task_lead', 'crm_assignments:mirror-work', 'crm_leads:deal-a'),
      edge('mirror', 'crm_assignments:mirror-work', 'crm_tasks:crm-work'),
      edge('task_project', 'tasks:production-work', 'projects:project-shared'),
      edge('task_project', 'tasks:sequential-work', 'projects:project-secondary'),
      edge('task_project', 'tasks:cancelled-work', 'projects:project-shared'),
      edge('pr_project', 'purchase_requests:pr-a', 'projects:project-shared'),
      edge('pr_order', 'purchase_requests:pr-a', 'orders:order-a'),
      edge('po_lead', 'purchase_orders:po-a', 'crm_leads:deal-a'),
      edge('invoice_lead', 'invoices:invoice-a', 'crm_leads:deal-a'),
      edge('invoice_project', 'invoices:invoice-a', 'projects:project-shared'),
      edge('invoice_order', 'invoices:invoice-a', 'orders:order-a'),
      edge('payment_invoice', 'payment_records:payment-a', 'invoices:invoice-a'),
      edge('expense_project', 'project_expenses:expense-a', 'projects:project-shared'),
      edge('quotation_lead', 'quotations:quotation-a', 'crm_leads:deal-a'),
      edge('quotation_project', 'quotations:quotation-a', 'projects:project-shared'),
      edge('incident_project', 'project_incidents:incident-a', 'projects:project-shared'),
      edge('rating_deal', 'deal_customer_ratings:rating-a', 'crm_leads:deal-a'),
      edge('time_task', 'task_time_logs:time-a', 'tasks:production-work'),
      edge('event_lead', 'crm_kpi_ledger:event-a', 'crm_leads:deal-a'),
    ] };
}
function createFixtureAdapter(snapshot = createFixtureSnapshot()) {
  const isolated = JSON.parse(JSON.stringify(snapshot));
  return Object.freeze({ kind: 'OFFLINE_FIXTURE', live: false, read_only: true,
    readSnapshot: async () => JSON.parse(JSON.stringify(isolated)) });
}
module.exports = { FIXTURE_TIME, ECOSYSTEM, TRADING, MANUFACTURING, DENIED,
  fixtureActor, createFixtureSnapshot, createFixtureAdapter };
