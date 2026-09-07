'use strict';

// Functional successor fixture: every ID, label, person and amount is invented
// test data. Derive a fresh base snapshot; never mutate the historical fixture.
const {
  FIXTURE_TIME, ECOSYSTEM, TRADING, MANUFACTURING, DENIED,
  fixtureActor, createFixtureSnapshot, createFixtureAdapter,
} = require('./syntheticJourney');

function createFunctionalSnapshot() {
  const snapshot = createFixtureSnapshot();
  snapshot.snapshot_id = 'fixture-functional-journey-v1';
  const record = (entity, id, label, fields = {}, company = TRADING, source = entity) => ({
    ref: `${source}:${id}`, source_type: source, source_id: id, entity, label,
    ecosystem_id: ECOSYSTEM, company_id: company, fields,
  });
  const addEdge = (kind, from, to) => snapshot.edges.push({ kind, from, to });
  const enrich = (ref, fields) => {
    // Update every duplicate view observation identically, preserving the
    // intentional same-source fan-out without manufacturing a conflict.
    for (const row of snapshot.records) if (row.ref === ref) Object.assign(row.fields, fields);
  };

  enrich('crm_leads:deal-a', { crm_stage_name: 'Hoàn thành' });
  enrich('crm_leads:deal-b', { crm_stage_name: 'Hoàn thành', owner: 'Người phụ trách cam kết A2 giả lập' });
  // deal-other intentionally lacks eligibility stage; it must remain UNKNOWN,
  // never NOT RATED merely because its visible rating set is empty.
  enrich('crm_tasks:crm-work', { stage_slug: 'consulting',
    supervisor: 'Giám sát thương mại giả lập', executor_company_id: TRADING });
  enrich('tasks:production-work', { supervisor: 'Giám sát sản xuất giả lập', executor_company_id: MANUFACTURING });
  enrich('orders:order-a', { delivery_date: '2026-09-05',
    shipped_at: '2026-09-04T03:00:00Z', delivered_at: null });
  enrich('invoices:invoice-a', { status: 'issued', payment_status: 'partial',
    total: 100, paid_amount: 25, due_date: '2026-09-05' });

  snapshot.records.push(
    record('lead', 'lead-warm', 'Lead ấm hoàn toàn giả lập', {
      temperature: 'warm', stage: 'warm', source_name: 'Nguồn thử nghiệm ấm',
      owner: 'Người phụ trách lead ấm giả lập', created_at: '2026-09-03T01:00:00Z',
    }, TRADING, 'crm_leads'),
    record('lead', 'lead-hot', 'Lead nóng hoàn toàn giả lập', {
      temperature: 'hot', stage: 'hot', source_name: 'Nguồn thử nghiệm nóng',
      owner: 'Người phụ trách lead nóng giả lập', created_at: '2026-09-04T01:00:00Z',
    }, TRADING, 'crm_leads'),
    record('crm_event', 'survey-open', 'Lịch khảo sát nguồn giả lập', {
      event_type: 'site_visit', status: 'planned', owner: 'Người khảo sát giả lập',
      planned_start_at: '2026-09-08T02:00:00Z', planned_end_at: '2026-09-08T04:00:00Z',
      created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'crm_events'),
    record('task', 'design-open', 'Nhiệm vụ thiết kế nguồn giả lập', {
      stage_slug: 'design', status: 'pending', owner: 'Người thiết kế giả lập',
      supervisor: 'Giám sát thiết kế giả lập', executor_company_id: TRADING,
      due_at: '2026-09-09T10:00:00Z', blocker: 'Chờ số đo nguồn giả lập',
      next_action: 'Đối chiếu số đo trong ca giả lập', created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'crm_tasks'),
    record('task', 'quote-open', 'Nhiệm vụ báo giá nguồn giả lập', {
      stage_slug: 'quotation', status: 'in_progress', owner: 'Người báo giá giả lập',
      executor_company_id: TRADING, due_at: '2026-09-10T10:00:00Z',
      blocker: 'Chờ xác nhận đầu vào nguồn giả lập', next_action: 'Hoàn thiện bản nguồn giả lập',
      created_at: '2026-09-02T01:00:00Z',
    }, TRADING, 'crm_tasks'),
    record('task', 'quote-contract-open', 'Nhiệm vụ báo giá và hợp đồng nguồn giả lập', {
      stage_slug: 'deal_quote_contract', status: 'pending', owner: 'Người phụ trách hợp đồng giả lập',
      executor_company_id: TRADING, due_at: '2026-09-11T10:00:00Z',
      blocker: 'Chưa đủ tài liệu nguồn giả lập', next_action: 'Xem tài liệu theo cam kết A2 giả lập',
      created_at: '2026-09-02T01:00:00Z',
    }, TRADING, 'crm_tasks'),
    record('project', 'project-logistics', 'Công trình giao lắp khác công ty giả lập', {
      status: 'shipping', vc_stage_slug: 'delivery', vc_temp_staged: false,
      install_date: '2026-09-05', delivery_date: '2026-09-05',
      pickup_at: '2026-09-04T03:00:00Z', logistics_company_id: MANUFACTURING,
      logistics_person_id: 'fixture-logistics-person', installer_person_id: 'fixture-installer-person',
      owner: 'Người phụ trách giao lắp giả lập', executor_company_id: MANUFACTURING,
      created_at: '2026-09-01T01:00:00Z',
    }, MANUFACTURING, 'projects'),
    record('task', 'logistics-work', 'Công việc giao lắp nguồn giả lập', {
      status: 'in_progress', owner: 'Người điều phối giao lắp giả lập',
      supervisor: 'Giám sát giao lắp giả lập', executor_company_id: MANUFACTURING,
      due_at: '2026-09-05T10:00:00Z', blocker: 'Đang xử lý sự cố nguồn giả lập',
      next_action: 'Xem sự cố liên kết công trình giả lập', started_at: '2026-09-04T03:00:00Z',
      created_at: '2026-09-01T01:00:00Z',
    }, MANUFACTURING, 'tasks'),
    record('incident', 'incident-logistics', 'Sự cố giao lắp nguồn giả lập', {
      status: 'open', severity: 'medium', reported_by: 'fixture-incident-reporter',
      resolved_by: null, resolved_at: null, owner: null,
      created_at: '2026-09-05T01:00:00Z', decision_required: true,
    }, MANUFACTURING, 'project_incidents'),
    record('invoice', 'invoice-due', 'Hóa đơn đến hạn hôm nay giả lập', {
      status: 'issued', payment_status: 'unpaid', total: 80, paid_amount: 0,
      due_date: '2026-09-06', amount: 80, amount_basis: 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT',
      created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'invoices'),
    record('invoice', 'invoice-future', 'Hóa đơn chưa đến hạn giả lập', {
      status: 'issued', payment_status: 'partial', total: 60, paid_amount: 10,
      due_date: '2026-09-07', amount: 60, amount_basis: 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT',
      created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'invoices'),
    record('invoice', 'invoice-settled', 'Hóa đơn đủ thanh toán theo snapshot giả lập', {
      status: 'issued', payment_status: 'paid', total: 40, paid_amount: 40,
      due_date: '2026-09-05', amount: 40, amount_basis: 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT',
      created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'invoices'),
    record('invoice', 'invoice-unknown-due', 'Hóa đơn còn thu thiếu hạn nguồn giả lập', {
      status: 'issued', payment_status: 'unpaid', total: 30, paid_amount: 0,
      due_date: null, amount: 30, amount_basis: 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT',
      created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'invoices'),
    record('invoice', 'invoice-other', 'Hóa đơn khách khác tại công trình dùng chung giả lập', {
      status: 'issued', payment_status: 'partial', total: 999, paid_amount: 1,
      due_date: '2026-09-05', amount: 999, amount_basis: 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT',
      created_at: '2026-09-01T01:00:00Z',
    }, TRADING, 'invoices'),
  );

  addEdge('customer_lead', 'customer:customer-a', 'crm_leads:lead-warm');
  addEdge('customer_lead', 'customer:customer-a', 'crm_leads:lead-hot');
  addEdge('survey_event_lead', 'crm_events:survey-open', 'crm_leads:deal-a');
  addEdge('task_lead', 'crm_tasks:design-open', 'crm_leads:deal-a');
  addEdge('task_lead', 'crm_tasks:quote-open', 'crm_leads:deal-a');
  addEdge('task_lead', 'crm_tasks:quote-contract-open', 'crm_leads:deal-b');
  addEdge('logistics_project', 'orders:order-a', 'projects:project-logistics');
  addEdge('task_project', 'tasks:logistics-work', 'projects:project-logistics');
  addEdge('incident_project', 'project_incidents:incident-logistics', 'projects:project-logistics');
  for (const id of ['invoice-due', 'invoice-settled', 'invoice-unknown-due']) {
    addEdge('invoice_lead', `invoices:${id}`, 'crm_leads:deal-a');
    addEdge('invoice_project', `invoices:${id}`, 'projects:project-shared');
  }
  addEdge('invoice_lead', 'invoices:invoice-future', 'crm_leads:deal-b');
  addEdge('invoice_project', 'invoices:invoice-future', 'projects:project-shared');
  addEdge('invoice_lead', 'invoices:invoice-other', 'crm_leads:deal-other');
  addEdge('invoice_project', 'invoices:invoice-other', 'projects:project-shared');

  snapshot.coverage.crm_event = { state: 'EXACT', gaps: [] };
  // These are complete finite fixture relationships, not real-source claims.
  // Rating belongs only to deal-a. No incident -> repair -> recheck edge exists.
  snapshot.relationship_coverage = Object.fromEntries(
    ['rating_deal', 'logistics_project', 'incident_project'].map((kind) => [kind, { state: 'EXACT', gaps: [] }]),
  );
  return snapshot;
}

function createFunctionalActor(overrides = {}) {
  // The base factory grants only the current offline contract's exported
  // entities/fields/edges; this never imports or changes live IAM permissions.
  return fixtureActor(overrides);
}

function createFunctionalAdapter(snapshot = createFunctionalSnapshot()) {
  return createFixtureAdapter(snapshot);
}

module.exports = { FIXTURE_TIME, ECOSYSTEM, TRADING, MANUFACTURING, DENIED,
  createFunctionalSnapshot, createFunctionalActor, createFunctionalAdapter };
