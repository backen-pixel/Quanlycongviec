'use strict';

// Cross-module assertions over the actual pure service and synthetic successor
// fixture. No source routes/config, credentials, real clients, or live runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCustomerJourneyService } = require('../src/helpers/customerJourneyReadModel');
const { FIXTURE_TIME, ECOSYSTEM, TRADING, MANUFACTURING, DENIED,
  createFunctionalSnapshot, createFunctionalActor, createFunctionalAdapter,
} = require('./fixtures/customer-journey/functionalJourney');
const context = { ecosystem_id: ECOSYSTEM, company_id: 'all', period: 'month',
  period_anchor: '2026-09-06', filters: {} };
const make = (snapshot = createFunctionalSnapshot(), actor = createFunctionalActor(), extra = {}) =>
  createCustomerJourneyService({ adapter: createFunctionalAdapter(snapshot), actor,
    now: () => new Date(FIXTURE_TIME), ...extra });
const sourceRow = (snapshot, ref) => snapshot.records.find((row) => row.ref === ref);
const groupBy = (overview, id) => overview.systems.flatMap((system) => system.groups).find((group) => group.id === id);
const selected = async (service, group, ref, input = context) => (await service.detail(input, group, ref)).record;
async function fullList(service, group, input = context) {
  const records = []; let packet; let page = 1;
  do {
    packet = await service.list(input, group, { page, pageSize: 1 });
    records.push(...packet.records); page += 1;
    assert.ok(page < 80, 'fixture pagination terminates');
  } while (packet.pagination.has_more);
  assert.equal(new Set(records.map((row) => row.ref)).size, records.length);
  return { records, packet };
}

test('J02 integrated survey design and quotation counts resolve to their actual source units and details', async () => {
  const service = make(); const overview = await service.overview(context);
  for (const [id, unit, expected] of [
    ['solution_surveys', 'crm_event', ['crm_events:survey-open']],
    ['solution_design', 'crm_task', ['crm_tasks:design-open']],
    ['solution_quotation_tasks', 'crm_task', ['crm_tasks:quote-contract-open', 'crm_tasks:quote-open']],
  ]) {
    const group = groupBy(overview, id); const { records, packet } = await fullList(service, id, overview.context);
    assert.equal(group.unit, unit); assert.equal(group.count, expected.length);
    assert.deepEqual(records.map((row) => row.ref).sort(), expected.sort());
    assert.equal(packet.group.count, group.count); assert.equal(packet.context_key, overview.context_key);
    for (const row of records) assert.deepEqual(await selected(service, id, row.ref, overview.context), row);
  }
  const documents = await fullList(service, 'control_quotes');
  assert.deepEqual(documents.records.map((row) => row.ref), ['quotations:quotation-a']);
  assert.ok(!documents.records.some((row) => row.entity === 'task'));
});

test('J02 survey event leads to the exact customer commitment while its planned end is not actual completion', async () => {
  const service = make();
  const detail = await service.detail(context, 'solution_surveys', 'crm_events:survey-open');
  assert.equal(detail.record.fields.crm_source_state, 'OPEN_SITE_VISIT');
  assert.equal(detail.record.fields.planned_end_at, '2026-09-08T04:00:00Z');
  assert.equal(detail.record.fields.completed_at, undefined); assert.equal(detail.record.fields.due_at, undefined);
  assert.deepEqual(detail.customers.map((row) => row.ref), ['customer:customer-a']);
  assert.ok(detail.commitments.some((row) => row.ref === 'crm_leads:deal-a'));
  assert.ok(!detail.commitments.some((row) => row.ref === 'crm_leads:deal-other'));
  const commitment = await service.detail(detail.context, 'solution_deals', 'crm_leads:deal-a', {
    via: { group_id: 'solution_surveys', parent_ref: 'crm_events:survey-open' },
  });
  assert.ok(commitment.tasks.some((row) => row.ref === 'crm_tasks:design-open'));
  const design = commitment.tasks.find((row) => row.ref === 'crm_tasks:design-open');
  assert.equal(design.fields.owner, 'Người thiết kế giả lập');
  assert.equal(design.fields.due_at, '2026-09-09T10:00:00Z');
  assert.equal(design.fields.blocker, 'Chờ số đo nguồn giả lập');
  assert.equal(design.fields.next_action, 'Đối chiếu số đo trong ca giả lập');
});

test('J02 title-only classification and denied stage fields cannot manufacture actionable memberships', async () => {
  const snapshot = createFunctionalSnapshot();
  const design = sourceRow(snapshot, 'crm_tasks:design-open');
  design.label = 'Khảo sát báo giá thiết kế'; design.fields.stage_slug = 'consulting';
  assert.deepEqual((await fullList(make(snapshot), 'solution_design')).records, []);
  const actor = createFunctionalActor(); actor.field_permissions.task = actor.field_permissions.task.filter((field) => field !== 'stage_slug');
  const unknown = await make(createFunctionalSnapshot(), actor).list(context, 'solution_design');
  assert.equal(unknown.group.count, null); assert.deepEqual(unknown.records, []);
});

test('J02 denied explicit deal ancestry cannot reappear through a shared project in task drill-down', async () => {
  const snapshot = createFunctionalSnapshot();
  snapshot.edges.push({ kind: 'task_project', from: 'crm_tasks:design-open', to: 'projects:project-shared' });
  const actor = createFunctionalActor(); actor.denied_record_refs = ['crm_leads:deal-a'];
  const detail = await make(snapshot, actor).detail(context, 'solution_design', 'crm_tasks:design-open');
  assert.deepEqual(detail.customers, []);
  assert.ok(!detail.commitments.some((row) => ['crm_leads:deal-a', 'crm_leads:deal-other', 'crm_leads:deal-b'].includes(row.ref)));
  assert.deepEqual(detail.tasks.map((row) => row.ref), ['crm_tasks:design-open']);
  assert.ok(detail.gaps.includes('EXPLICIT_SOURCE_LINK_UNRESOLVED'));
});

test('J05 four overlapping logistics groups share one order identity and source-specific planned milestones', async () => {
  const service = make(); const overview = await service.overview(context);
  const identities = new Set();
  for (const id of ['operations_logistics', 'operations_logistics_attention', 'operations_install_overdue', 'operations_logistics_incidents']) {
    assert.equal(groupBy(overview, id).count, 1);
    const { records } = await fullList(service, id, overview.context);
    assert.deepEqual(records.map((row) => row.ref), ['orders:order-a']);
    identities.add(records[0].ref);
    assert.deepEqual(await selected(service, id, records[0].ref, overview.context), records[0]);
  }
  assert.equal(identities.size, 1);
  const detail = await service.detail(context, 'operations_logistics_attention', 'orders:order-a');
  assert.equal(detail.record.fields.shipping_state, 'YES');
  assert.equal(detail.record.fields.install_deadline_state, 'YES');
  assert.equal(detail.record.fields.incident_state, 'YES');
  assert.equal(detail.record.fields.delivered_at, null);
  assert.ok(detail.record.functional_gaps.includes('SOURCE_STATUS_TIMESTAMPS_NOT_CUSTOMER_RECEIPT'));
  const logistics = detail.commitments.find((row) => row.ref === 'projects:project-logistics');
  assert.equal(logistics.fields.install_date, '2026-09-05');
  assert.equal(logistics.fields.pickup_at, '2026-09-04T03:00:00Z');
  assert.ok(detail.tasks.some((row) => row.ref === 'tasks:logistics-work'));
});

test('J05 changing report period does not recast the observation-day warning or drop stock order identity', async () => {
  const service = make(); const month = await fullList(service, 'operations_install_overdue');
  const quarterContext = { ...context, period: 'quarter', period_anchor: '2026-12-20' };
  const quarter = await fullList(service, 'operations_install_overdue', quarterContext);
  assert.deepEqual(quarter.records.map((row) => row.ref), month.records.map((row) => row.ref));
  assert.equal(quarter.records[0].fields.install_deadline_state, 'YES');
  assert.equal(quarter.packet.group.basis, 'stock');
  assert.notEqual(quarter.packet.context_key, month.packet.context_key);
});

test('J05 unavailable install date and denied logistics edge retain unknown warnings without production fallback', async () => {
  const snapshot = createFunctionalSnapshot(); const project = sourceRow(snapshot, 'projects:project-logistics');
  project.fields.install_date = null; project.fields.delivery_date = null;
  project.fields.due_at = '2026-09-01T00:00:00Z'; project.fields.production_deadline = '2026-09-01';
  const order = await selected(make(snapshot), 'solution_orders', 'orders:order-a');
  assert.equal(order.fields.install_deadline_state, 'UNKNOWN');
  assert.deepEqual((await fullList(make(snapshot), 'operations_install_overdue')).records, []);
  const actor = createFunctionalActor(); actor.edge_permissions = actor.edge_permissions.filter((kind) => kind !== 'logistics_project');
  const denied = await selected(make(createFunctionalSnapshot(), actor), 'solution_orders', 'orders:order-a');
  assert.equal(denied.fields.logistics_state, 'UNKNOWN'); assert.equal(denied.fields.shipping_state, 'UNKNOWN');
  assert.equal(denied.fields.incident_state, 'UNKNOWN');
});

test('J06 invoice projections distinguish overdue due today future unpaid settled and unknown due independently', async () => {
  const service = make();
  for (const [ref, state, amount] of [
    ['invoice-a', 'OVERDUE', 75], ['invoice-other', 'OVERDUE', 998], ['invoice-due', 'DUE_TODAY', 80],
    ['invoice-future', 'FUTURE_UNPAID', 50], ['invoice-settled', 'SETTLED', 0], ['invoice-unknown-due', 'UNKNOWN_DUE', 30],
  ]) {
    const row = await selected(service, 'control_invoices', `invoices:${ref}`);
    assert.equal(row.fields.collection_state, state); assert.equal(row.fields.collection_remaining_amount, amount);
    assert.equal(row.fields.collection_basis, 'INVOICES_TOTAL_MINUS_PAID_AMOUNT_SOURCE_SNAPSHOT');
  }
  assert.deepEqual((await fullList(service, 'control_overdue')).records.map((row) => row.ref), ['invoices:invoice-a', 'invoices:invoice-other']);
  assert.deepEqual((await fullList(service, 'control_due_today')).records.map((row) => row.ref), ['invoices:invoice-due']);
  const receivables = (await fullList(service, 'control_receivables')).records.map((row) => row.ref);
  assert.ok(receivables.includes('invoices:invoice-future')); assert.ok(receivables.includes('invoices:invoice-unknown-due'));
  assert.ok(!receivables.includes('invoices:invoice-settled'));
});

test('J06 source observation clock does not move with the selected period anchor', async () => {
  const service = make();
  const earlier = await selected(service, 'control_invoices', 'invoices:invoice-future', { ...context, period_anchor: '2020-01-01' });
  const later = await selected(service, 'control_invoices', 'invoices:invoice-future', { ...context, period: 'quarter', period_anchor: '2030-12-01' });
  for (const row of [earlier, later]) {
    assert.equal(row.fields.collection_state, 'FUTURE_UNPAID');
    assert.equal(row.fields.collection_as_of_date, '2026-09-06');
    assert.equal(row.fields.collection_clock_basis, 'FIXTURE_AS_OF_DAY_NOT_SOURCE_HOST_CALENDAR');
  }
});

test('J06 denied monetary and date fields cannot leak a remaining amount or overdue claim', async () => {
  for (const hidden of ['total', 'paid_amount']) {
    const actor = createFunctionalActor(); actor.field_permissions.invoice = actor.field_permissions.invoice.filter((field) => field !== hidden);
    const service = make(createFunctionalSnapshot(), actor);
    const invoice = await selected(service, 'control_invoices', 'invoices:invoice-a');
    assert.equal(invoice.fields[hidden], undefined); assert.equal(invoice.fields.collection_remaining_amount, null);
    assert.equal(invoice.fields.collection_state, 'UNKNOWN');
    assert.deepEqual((await fullList(service, 'control_overdue')).records, []);
  }
  const actor = createFunctionalActor(); actor.field_permissions.invoice = actor.field_permissions.invoice.filter((field) => field !== 'due_date');
  const invoice = await selected(make(createFunctionalSnapshot(), actor), 'control_invoices', 'invoices:invoice-a');
  assert.equal(invoice.fields.collection_remaining_amount, 75); assert.equal(invoice.fields.collection_state, 'UNKNOWN_DUE');
});

test('J06 unrelated customer invoice is excluded from customer and explicit deal dossiers despite shared project', async () => {
  const service = make();
  for (const [group, ref] of [['market_customers', 'customer:customer-a'], ['solution_deals', 'crm_leads:deal-a']]) {
    const detail = await service.detail(context, group, ref);
    assert.ok(detail.related.some((row) => row.ref === 'invoices:invoice-a'));
    assert.ok(!detail.related.some((row) => row.ref === 'invoices:invoice-other'));
    assert.ok(!detail.commitments.some((row) => row.ref === 'crm_leads:deal-other'));
  }
});

test('J07 integrated feedback distinguishes rated not rated and unknown without repair outcome invention', async () => {
  const service = make();
  const rated = await selected(service, 'correction_feedback', 'crm_leads:deal-a');
  const notRated = await selected(service, 'correction_not_rated', 'crm_leads:deal-b');
  const unknown = await selected(service, 'correction_feedback_unknown', 'crm_leads:deal-other');
  assert.equal(rated.fields.feedback_state, 'RATED'); assert.equal(rated.fields.feedback_count, 1);
  assert.equal(notRated.fields.feedback_state, 'NOT_RATED'); assert.equal(notRated.fields.feedback_count, 0);
  assert.equal(notRated.fields.feedback_coverage, 'EXACT'); assert.equal(unknown.fields.feedback_state, 'UNKNOWN');
  assert.equal(unknown.fields.feedback_count, null);
  for (const row of [rated, notRated, unknown]) {
    assert.equal(row.fields.outcome_state, 'UNKNOWN');
    assert.ok(row.functional_gaps.includes('REPAIR_RECHECK_OUTCOME_NOT_CONNECTED'));
  }
});

test('J07 partial ratings denied edges denied stars or hidden source rows never certify NOT RATED', async () => {
  for (const change of ['coverage', 'edge', 'stars', 'record', 'relation']) {
    const snapshot = createFunctionalSnapshot(); const actor = createFunctionalActor();
    if (change === 'coverage') snapshot.coverage.rating.state = 'PARTIAL';
    if (change === 'edge') actor.edge_permissions = actor.edge_permissions.filter((kind) => kind !== 'rating_deal');
    if (change === 'stars') actor.field_permissions.rating = actor.field_permissions.rating.filter((field) => field !== 'stars');
    if (change === 'record') actor.denied_record_refs = ['deal_customer_ratings:rating-a'];
    if (change === 'relation') delete snapshot.relationship_coverage.rating_deal;
    const service = make(snapshot, actor); const deal = await selected(service, 'solution_deals', 'crm_leads:deal-b');
    assert.equal(deal.fields.feedback_state, 'UNKNOWN', change);
    assert.equal(deal.fields.feedback_count, null, change);
    assert.deepEqual((await fullList(service, 'correction_not_rated')).records, [], change);
  }
});

test('J07 source deal rating cannot be reassigned to an incident repair or every project in that deal', async () => {
  const service = make(); const detail = await service.detail(context, 'correction_feedback', 'crm_leads:deal-a');
  const rating = detail.related.find((row) => row.ref === 'deal_customer_ratings:rating-a');
  assert.equal(rating.fields.stars, 2);
  assert.equal(rating.fields.feedback, 'Phản hồi hoàn toàn giả lập');
  const links = detail.edges.filter((edge) => edge.from === rating.ref);
  assert.deepEqual(links, [{ kind: 'rating_deal', from: rating.ref, to: 'crm_leads:deal-a' }]);
  assert.ok(!links.some((edge) => edge.to.startsWith('projects:') || edge.to.startsWith('project_incidents:')));
  const incident = detail.related.find((row) => row.ref === 'project_incidents:incident-a');
  assert.equal(incident.fields.status, 'closed'); assert.equal(incident.fields.outcome_state, undefined);
  assert.equal(detail.record.fields.outcome_state, 'UNKNOWN');
});

test('J07 a dangling rating relationship does not turn a missing source row into confirmed NOT RATED', async () => {
  const snapshot = createFunctionalSnapshot();
  snapshot.records = snapshot.records.filter((row) => row.entity !== 'rating');
  const service = make(snapshot);
  for (const ref of ['crm_leads:deal-a', 'crm_leads:deal-b']) {
    const deal = await selected(service, 'solution_deals', ref);
    assert.equal(deal.fields.feedback_state, 'UNKNOWN'); assert.equal(deal.fields.feedback_count, null);
  }
  assert.deepEqual((await fullList(service, 'correction_not_rated')).records, []);
});

test('J07 conflicting deal identities on one rating are omitted rather than rating both commitments', async () => {
  for (const hidden of [false, true]) {
    const snapshot = createFunctionalSnapshot(); const actor = createFunctionalActor();
    snapshot.edges.push({ kind: 'rating_deal', from: 'deal_customer_ratings:rating-a', to: 'crm_leads:deal-b' });
    if (hidden) actor.denied_record_refs = ['crm_leads:deal-b'];
    const service = make(snapshot, actor);
    const detail = await service.detail(context, 'solution_deals', 'crm_leads:deal-a');
    assert.equal(detail.record.fields.feedback_state, 'UNKNOWN');
    assert.ok(detail.record.functional_gaps.includes('RATING_DEAL_RELATION_CONFLICT_OMITTED'));
    assert.ok(!detail.related.some((row) => row.ref === 'deal_customer_ratings:rating-a'));
    if (!hidden) assert.equal((await selected(service, 'solution_deals', 'crm_leads:deal-b')).fields.feedback_state, 'UNKNOWN');
  }
});

test('J05 hidden or orphan incident cannot become an exact no-incident claim while a visible positive remains source qualified', async () => {
  for (const missing of ['row', 'permission']) {
    const snapshot = createFunctionalSnapshot(); const actor = createFunctionalActor();
    if (missing === 'row') snapshot.records = snapshot.records.filter((row) => row.ref !== 'project_incidents:incident-logistics');
    else actor.denied_record_refs = ['project_incidents:incident-logistics'];
    const order = await selected(make(snapshot, actor), 'solution_orders', 'orders:order-a');
    assert.equal(order.fields.incident_state, 'UNKNOWN');
  }
  const partial = createFunctionalSnapshot(); partial.coverage.incident.state = 'PARTIAL';
  const order = await selected(make(partial), 'solution_orders', 'orders:order-a');
  assert.equal(order.fields.incident_state, 'YES');
  assert.ok(order.functional_gaps.includes('INCIDENT_LINK_SCOPE_OR_COVERAGE_UNKNOWN'));
});

test('J08 cross-company logistics work retains source owner executor and context without widening selected-company scope', async () => {
  const service = make();
  const detail = await service.detail(context, 'operations_logistics_attention', 'orders:order-a');
  assert.equal(detail.record.company_id, TRADING);
  const project = detail.commitments.find((row) => row.ref === 'projects:project-logistics');
  const work = detail.tasks.find((row) => row.ref === 'tasks:logistics-work');
  assert.equal(project.company_id, MANUFACTURING); assert.equal(project.fields.logistics_company_id, MANUFACTURING);
  assert.equal(work.fields.executor_company_id, MANUFACTURING);
  assert.equal(work.fields.owner, 'Người điều phối giao lắp giả lập');
  assert.equal(work.fields.supervisor, 'Giám sát giao lắp giả lập');
  const trading = await service.detail({ ...context, company_id: TRADING }, 'solution_orders', 'orders:order-a');
  assert.ok(!trading.commitments.some((row) => row.company_id === MANUFACTURING));
  assert.ok(!trading.tasks.some((row) => row.company_id === MANUFACTURING));
  assert.equal(trading.record.fields.shipping_state, 'UNKNOWN');
  await assert.rejects(() => service.overview({ ...context, company_id: DENIED }), (error) => error.code === 'COMPANY_DENIED');
});

test('J08 unauthorized executor company identifiers are omitted before functional projection', async () => {
  const snapshot = createFunctionalSnapshot();
  const project = sourceRow(snapshot, 'projects:project-logistics');
  project.fields.logistics_company_id = DENIED; project.fields.executor_company_id = DENIED;
  const detail = await make(snapshot).detail(context, 'capacity_projects', project.ref);
  assert.equal(detail.record.fields.logistics_company_id, undefined);
  assert.equal(detail.record.fields.executor_company_id, undefined);
  assert.ok(!JSON.stringify(detail.record).includes(DENIED));
});

test('J01 existing warm and hot filters retain actual source temperature rather than stage display labels', async () => {
  const service = make();
  for (const [temperature, ref] of [['warm', 'crm_leads:lead-warm'], ['hot', 'crm_leads:lead-hot']]) {
    const filtered = await fullList(service, 'market_leads', { ...context, filters: { temperature } });
    assert.deepEqual(filtered.records.map((row) => row.ref), [ref]);
    assert.equal(filtered.records[0].fields.temperature, temperature);
  }
});

test('J09 adapter-injected derived claims are ignored even when an actor lists those field names', async () => {
  const snapshot = createFunctionalSnapshot(); const actor = createFunctionalActor();
  const forged = { collection_state: 'SETTLED', collection_remaining_amount: 999999,
    logistics_flags: 'FORGED', install_deadline_state: 'NO', feedback_state: 'RATED', feedback_count: 999999 };
  for (const ref of ['invoices:invoice-a', 'orders:order-a', 'crm_leads:deal-b']) {
    Object.assign(sourceRow(snapshot, ref).fields, forged);
  }
  for (const entity of ['invoice', 'order', 'deal']) actor.field_permissions[entity].push(...Object.keys(forged));
  const service = make(snapshot, actor);
  const invoice = await selected(service, 'control_invoices', 'invoices:invoice-a');
  assert.equal(invoice.fields.collection_state, 'OVERDUE'); assert.equal(invoice.fields.collection_remaining_amount, 75);
  const order = await selected(service, 'solution_orders', 'orders:order-a');
  assert.equal(order.fields.install_deadline_state, 'YES'); assert.ok(!order.fields.logistics_flags.includes('FORGED'));
  const deal = await selected(service, 'solution_deals', 'crm_leads:deal-b');
  assert.equal(deal.fields.feedback_state, 'NOT_RATED'); assert.equal(deal.fields.feedback_count, 0);
});

test('J10 all new source groups use the existing context search and pagination contract while protected outcomes remain locked', async () => {
  const service = make(); const overview = await service.overview(context);
  for (const id of ['solution_surveys', 'solution_design', 'solution_quotation_tasks', 'operations_logistics_attention',
    'control_receivables', 'control_overdue', 'control_due_today', 'correction_feedback', 'correction_not_rated', 'correction_feedback_unknown']) {
    const { records, packet } = await fullList(service, id, overview.context);
    assert.equal(packet.context_key, overview.context_key); assert.equal(packet.group.basis, 'stock');
    for (const row of records) {
      const filtered = await fullList(service, id, { ...context, filters: { q: row.label } });
      assert.ok(filtered.records.some((candidate) => candidate.ref === row.ref));
      assert.ok(filtered.records.every((candidate) => candidate.label.toLocaleLowerCase('vi').includes(row.label.toLocaleLowerCase('vi'))));
    }
  }
  for (const id of ['capacity_canonical', 'control_profit', 'control_payroll', 'correction_effectiveness']) {
    const group = groupBy(overview, id); assert.equal(group.locked, true); assert.equal(group.count, null);
  }
  assert.equal(overview.protections.real_data_connected, false); assert.equal(overview.protections.write_enabled, false);
  assert.equal(overview.protections.live_routes_registered, false); assert.equal(overview.protections.founder_acceptance, 'HOLD');
  assert.equal(overview.protections.wp3, 'STOP');
});
