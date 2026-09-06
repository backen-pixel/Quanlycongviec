'use strict';

// Isolated tests: built-ins + new pure modules only. Do not import app setup,
// config, dotenv, database, HTTP clients, server, or existing route helpers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCustomerJourneyService, calendarRange, SYSTEMS } = require('../src/helpers/customerJourneyReadModel');
const { FIXTURE_TIME, ECOSYSTEM, TRADING, MANUFACTURING, DENIED,
  createFixtureSnapshot, createFixtureAdapter, fixtureActor } = require('./fixtures/customer-journey/syntheticJourney');
const context = { ecosystem_id: ECOSYSTEM, company_id: 'all', period: 'month', period_anchor: '2026-09-06', filters: {} };
const makeService = (snapshot = createFixtureSnapshot(), actor = fixtureActor(), extra = {}) => createCustomerJourneyService({
  adapter: createFixtureAdapter(snapshot), actor, now: () => new Date(FIXTURE_TIME), ...extra,
});
const byGroup = (overview, id) => overview.systems.flatMap((system) => system.groups).find((group) => group.id === id);
const rejects = async (fn, code) => assert.rejects(fn, (error) => error.code === code);

test('offline service preserves six approved systems and explicit runtime gates', async () => {
  const overview = await makeService().overview(context);
  assert.deepEqual(overview.systems.map(({ name }) => name), ['Tư tưởng & Thị trường', 'Tư duy & Giải pháp',
    'Nguồn lực & Năng lực', 'Vận hành & Giao giá trị', 'Báo cáo & Sự thật', 'Sửa chữa & Tiến hóa']);
  assert.equal(SYSTEMS.length, 6);
  assert.equal(overview.mode, 'OFFLINE_FIXTURE_ONLY');
  assert.equal(overview.protections.real_data_connected, false);
  assert.equal(overview.protections.live_routes_registered, false);
  assert.equal(overview.protections.founder_acceptance, 'HOLD');
  assert.equal(overview.protections.wp3, 'STOP');
  assert.equal(overview.capacity.capacity_target, null);
  assert.equal(overview.capacity.load_per_active_person, null);
  assert.equal(overview.planning.forecast, null);
});

test('every exact count has the same distinct ID set through complete pagination and detail', async () => {
  const service = makeService(); const overview = await service.overview(context);
  for (const group of overview.systems.flatMap((system) => system.groups)) {
    if (group.coverage !== 'EXACT') continue;
    const refs = []; let page = 1; let more = true;
    while (more) {
      const result = await service.list(overview.context, group.id, { page, pageSize: 1 });
      assert.equal(result.group.count, group.count);
      assert.equal(result.context_key, overview.context_key);
      for (const row of result.records) {
        refs.push(row.ref);
        const detail = await service.detail(overview.context, group.id, row.ref);
        assert.deepEqual(detail.record, row);
        assert.equal(detail.context_key, result.context_key);
      }
      more = result.pagination.has_more; page += 1;
    }
    assert.equal(refs.length, group.count); assert.equal(new Set(refs).size, refs.length);
  }
});

test('a customer retains multiple distinct commitments and task source fields', async () => {
  const service = makeService();
  const detail = await service.detail(context, 'market_customers', 'customer:customer-a');
  const refs = new Set(detail.commitments.map((row) => row.ref));
  for (const ref of ['crm_leads:deal-a', 'crm_leads:deal-b', 'orders:order-a', 'projects:project-shared', 'projects:project-secondary']) assert.ok(refs.has(ref));
  assert.ok(!refs.has('crm_leads:deal-other'));
  assert.ok(detail.tasks.some((row) => row.ref === 'crm_tasks:crm-work'));
  const task = detail.tasks.find((row) => row.ref === 'crm_tasks:crm-work');
  assert.equal(task.fields.owner, 'Nhân viên giả lập');
  assert.equal(task.fields.blocker, 'Thiếu bằng chứng nguồn giả lập');
  assert.equal(task.fields.started_at, undefined);
  assert.equal(task.fields.impact, undefined);
  assert.ok(task.missing_fields.includes('started_at'));
  assert.ok(detail.gaps.includes('NO_VALUE_OR_WORK_ALLOCATION'));
});

test('customer labels never merge identity; source records without a link stay unknown', async () => {
  const service = makeService();
  const customers = await service.list(context, 'market_customers');
  assert.equal(customers.records.length, 2);
  assert.equal(customers.records[0].label, customers.records[1].label);
  const unknown = await service.detail(context, 'market_leads', 'crm_leads:lead-unknown');
  assert.deepEqual(unknown.customers, []);
  assert.ok(unknown.gaps.includes('CUSTOMER_LINK_UNKNOWN'));
});

test('explicit order lead does not fan through shared project into unrelated customer commitments', async () => {
  const detail = await makeService().detail(context, 'solution_orders', 'orders:order-a');
  assert.deepEqual(detail.customers.map((row) => row.ref), ['customer:customer-a']);
  assert.ok(!detail.commitments.some((row) => row.ref === 'crm_leads:deal-other'));
});

test('primary+junction edges remain typed while project/work units deduplicate fanout and mirror', async () => {
  const service = makeService(); const overview = await service.overview(context);
  assert.equal(byGroup(overview, 'capacity_projects').count, 2);
  assert.equal(byGroup(overview, 'operations_inventory').count, 4);
  const inventory = await service.list(context, 'operations_inventory');
  assert.ok(!inventory.records.some((row) => row.entity === 'assignment'));
  const detail = await service.detail(context, 'solution_deals', 'crm_leads:deal-a');
  const edges = detail.edges.filter((edge) => edge.from === 'crm_leads:deal-a' && edge.to === 'projects:project-shared');
  assert.deepEqual(new Set(edges.map((edge) => edge.kind)), new Set(['primary_project', 'junction_project']));
});

test('typed source tuple prevents collisions, conflicting same-ID facts never choose first silently', async () => {
  const snapshot = createFixtureSnapshot();
  const first = snapshot.records.find((row) => row.ref === 'tasks:production-work');
  snapshot.records.push({ ...first, fields: { ...first.fields, owner: 'Conflicting synthetic owner' } });
  const result = await makeService(snapshot).list(context, 'operations_inventory');
  assert.equal(result.group.coverage, 'PARTIAL');
  assert.ok(result.group.gaps.includes('CONFLICTING_SOURCE_ID_OMITTED'));
  assert.ok(!result.records.some((row) => row.ref === first.ref));
  const invalid = createFixtureSnapshot();
  invalid.records[0].source_id = 'different-id';
  await rejects(() => makeService(invalid).overview(context), 'SOURCE_ID_INVALID');
});

test('different source namespaces with same source ID remain distinct unless authorized explicit mirror', async () => {
  const snapshot = createFixtureSnapshot();
  const task = snapshot.records.find((row) => row.ref === 'tasks:production-work');
  snapshot.records.push({ ...task, ref: 'crm_tasks:production-work', source_type: 'crm_tasks' });
  const result = await makeService(snapshot).list(context, 'operations_inventory');
  assert.ok(result.records.some((row) => row.ref === 'tasks:production-work'));
  assert.ok(result.records.some((row) => row.ref === 'crm_tasks:production-work'));
  assert.equal(result.group.count, 5);
});

test('stock, created cohort and conditional conversion events are different ID sets', async () => {
  const service = makeService();
  const stock = await service.list(context, 'solution_deals');
  const cohort = await service.list({ ...context, filters: { time_basis: 'created_at' } }, 'solution_deals');
  assert.ok(stock.records.some((row) => row.ref === 'crm_leads:deal-a'));
  assert.ok(!cohort.records.some((row) => row.ref === 'crm_leads:deal-a'));
  const conversions = await service.list(context, 'market_conversions');
  assert.equal(conversions.records.length, 1);
  assert.equal(conversions.group.basis, 'occurred_at');
  assert.equal(conversions.group.coverage, 'PARTIAL');
  assert.equal(conversions.group.count_relation, 'gte');
  assert.ok(conversions.group.gaps.includes('CONVERSION_EVENT_HISTORY_NOT_COMPLETE'));
  assert.ok(!stock.records.some((row) => row.entity === 'conversion_event'));
});

test('temperature is not stage; missing temperature is its own source unknown bucket', async () => {
  const service = makeService();
  const cold = await service.list({ ...context, filters: { temperature: 'cold' } }, 'market_leads');
  assert.equal(cold.records.length, 1);
  assert.equal(cold.records[0].fields.stage, 'warm');
  const unknown = await service.list({ ...context, filters: { temperature: 'unknown' } }, 'market_leads');
  assert.deepEqual(unknown.records.map((row) => row.ref), ['crm_leads:lead-unknown']);
});

test('due-in-period excludes null deadlines; null-start and cancelled are not fabricated successes', async () => {
  const service = makeService();
  const due = await service.list(context, 'operations_work');
  assert.equal(due.group.count, 3);
  assert.ok(!due.records.some((row) => row.ref === 'tasks:sequential-work'));
  const sequential = await service.detail(context, 'operations_inventory', 'tasks:sequential-work');
  assert.equal(sequential.record.fields.due_at, null);
  assert.equal(sequential.record.fields.started_at, undefined);
  const cancelled = await service.detail(context, 'operations_inventory', 'tasks:cancelled-work');
  assert.equal(cancelled.record.fields.status, 'cancelled');
  assert.equal(cancelled.record.fields.completed_at, null);
});

test('Vietnam boundaries are half-open and invalid calendar dates are rejected', async () => {
  const snapshot = createFixtureSnapshot(); const row = snapshot.records.find((record) => record.ref === 'crm_tasks:crm-work');
  row.fields.due_at = '2026-08-31T17:00:00.000Z';
  assert.ok((await makeService(snapshot).list(context, 'operations_work')).records.some((record) => record.ref === row.ref));
  row.fields.due_at = '2026-09-30T17:00:00.000Z';
  assert.ok(!(await makeService(snapshot).list(context, 'operations_work')).records.some((record) => record.ref === row.ref));
  assert.equal(calendarRange('week', '2026-09-06').start_at, '2026-08-31T00:00:00+07:00');
  await rejects(() => makeService().overview({ ...context, period_anchor: '2026-02-30' }), 'INVALID_PERIOD_ANCHOR');
});

test('company and tenant denials occur in application service before adapter reads', async () => {
  let reads = 0; const adapter = { ...createFixtureAdapter(), readSnapshot: async () => { reads += 1; return createFixtureSnapshot(); } };
  const service = makeService(undefined, fixtureActor(), { adapter });
  await rejects(() => service.overview({ ...context, company_id: DENIED }), 'COMPANY_DENIED');
  await rejects(() => service.overview({ ...context, ecosystem_id: 'foreign-tenant' }), 'ECOSYSTEM_DENIED');
  await rejects(() => service.overview({ ...context, actor: fixtureActor({ company_ids: [DENIED] }) }), 'UNTRUSTED_CONTEXT');
  assert.equal(reads, 0);
  const bound = makeService(undefined, fixtureActor({ company_id: TRADING }));
  await rejects(() => bound.overview(context), 'COMPANY_DENIED');
  await rejects(() => bound.overview({ ...context, company_id: MANUFACTURING }), 'COMPANY_DENIED');
});

test('company-selected dossiers authorize both relationship ends and expose no foreign/denied metadata', async () => {
  const service = makeService(); const selected = { ...context, company_id: TRADING };
  const detail = await service.detail(selected, 'solution_deals', 'crm_leads:deal-a');
  assert.ok(!detail.commitments.some((row) => row.company_id === MANUFACTURING));
  assert.ok(detail.edges.every((edge) => !edge.from.startsWith('projects:') && !edge.to.startsWith('projects:')));
  const overview = await service.overview(context);
  assert.ok(!overview.companies.some((company) => company.id === DENIED));
  assert.ok(!JSON.stringify([overview, detail]).includes('KHÔNG ĐƯỢC LỘ'));
  await rejects(() => service.detail(context, 'solution_deals', 'crm_leads:denied-deal'), 'RESOURCE_DENIED');
});

test('resource denial and edge denial are enforced independent of UI and preserve unknown linkage', async () => {
  const actor = fixtureActor(); actor.resource_permissions = actor.resource_permissions.filter((entity) => entity !== 'project');
  const service = makeService(undefined, actor);
  assert.equal(byGroup(await service.overview(context), 'capacity_projects').locked, true);
  const detail = await service.detail(context, 'solution_deals', 'crm_leads:deal-a');
  assert.ok(!detail.commitments.some((row) => row.entity === 'project'));
  await rejects(() => service.detail(context, 'capacity_projects', 'projects:project-shared'), 'RESOURCE_DENIED');
  const edgeActor = fixtureActor(); edgeActor.edge_permissions = edgeActor.edge_permissions.filter((kind) => kind !== 'customer_lead');
  const deniedLink = await makeService(undefined, edgeActor).detail(context, 'solution_deals', 'crm_leads:deal-a');
  assert.deepEqual(deniedLink.customers, []);
  assert.ok(deniedLink.gaps.includes('CUSTOMER_LINK_UNKNOWN'));
});

test('field denial hides values and prohibits hidden-field filter inference', async () => {
  const actor = fixtureActor();
  actor.field_permissions.invoice = actor.field_permissions.invoice.filter((field) => !['amount', 'amount_basis'].includes(field));
  actor.field_permissions.lead = actor.field_permissions.lead.filter((field) => field !== 'temperature');
  const service = makeService(undefined, actor);
  const detail = await service.detail(context, 'control_invoices', 'invoices:invoice-a');
  assert.equal(detail.record.fields.amount, undefined);
  assert.ok(detail.record.restricted_fields.includes('amount'));
  const result = await service.list({ ...context, filters: { temperature: 'cold' } }, 'market_leads');
  assert.equal(result.group.locked, true); assert.equal(result.group.count, null);
  assert.deepEqual(result.records, []);
});

test('trusted actor is copied: later mutation and denied raw fields cannot expand output', async () => {
  const actor = fixtureActor(); const service = makeService(undefined, actor);
  actor.company_ids.push(DENIED); actor.denied_record_refs = [];
  await rejects(() => service.overview({ ...context, company_id: DENIED }), 'COMPANY_DENIED');
  const snapshot = createFixtureSnapshot();
  snapshot.records[0].fields.password = 'SYNTHETIC_PRIVATE_FIELD';
  const result = await makeService(snapshot).list(context, 'market_customers');
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_FIELD'));
});

test('per-record denial also removes incident relations and their labels', async () => {
  const actor = fixtureActor({ denied_record_refs: ['crm_leads:deal-a'] });
  const result = await makeService(undefined, actor).detail(context, 'market_customers', 'customer:customer-a');
  assert.ok(!result.commitments.some((row) => row.ref === 'crm_leads:deal-a'));
  assert.ok(!result.edges.some((edge) => edge.from === 'crm_leads:deal-a' || edge.to === 'crm_leads:deal-a'));
  await rejects(() => makeService(undefined, actor).detail(context, 'solution_deals', 'crm_leads:deal-a'), 'RESOURCE_DENIED');
});

test('partial, unknown and exact empty are different, no full-count claim at source cap', async () => {
  const snapshot = createFixtureSnapshot(); snapshot.coverage.purchase_order = { state: 'UNKNOWN', gaps: ['SOURCE_TIMEOUT'] };
  snapshot.coverage.purchase_request = { state: 'PARTIAL', gaps: ['SOURCE_PAGE_CAP'] };
  const service = makeService(snapshot);
  const unknown = await service.list(context, 'capacity_po');
  assert.equal(unknown.group.count, null); assert.equal(unknown.pagination.complete, false);
  const partial = await service.list(context, 'capacity_pr');
  assert.equal(partial.group.count_relation, 'gte'); assert.equal(partial.pagination.complete, false);
  const empty = await service.list({ ...context, filters: { q: 'no synthetic match' } }, 'solution_orders');
  assert.equal(empty.group.count, 0); assert.equal(empty.group.coverage, 'EXACT');
});

test('snapshot ID, age, future time and same-ID mutation fail closed', async () => {
  const service = makeService();
  await rejects(() => service.list({ ...context, snapshot_id: 'old-snapshot' }, 'market_leads'), 'SNAPSHOT_CHANGED');
  const snapshot = createFixtureSnapshot(); snapshot.observed_at = '2026-09-06T10:00:00Z';
  await rejects(() => makeService(snapshot).overview(context), 'SNAPSHOT_STALE');
  snapshot.observed_at = '2026-09-07T12:00:00Z';
  await rejects(() => makeService(snapshot).overview(context), 'SNAPSHOT_STALE');
  let packet = createFixtureSnapshot();
  const mutable = makeService(undefined, fixtureActor(), { adapter: { ...createFixtureAdapter(), readSnapshot: async () => packet } });
  await mutable.overview(context);
  packet = { ...packet, records: packet.records.slice(1) };
  await rejects(() => mutable.list(context, 'market_leads'), 'SNAPSHOT_MUTATED');
});

test('source errors and timeouts expose only sanitized codes; no fallback to stale records', async () => {
  const fake = createFixtureAdapter();
  const failed = makeService(undefined, fixtureActor(), { adapter: { ...fake, readSnapshot: async () => { throw new Error('DO_NOT_RETURN_RAW_SOURCE_DETAIL'); } } });
  await assert.rejects(() => failed.overview(context), (error) => error.code === 'SOURCE_UNAVAILABLE' && !error.message.includes('DO_NOT_RETURN'));
  const pending = makeService(undefined, fixtureActor(), { adapterTimeoutMs: 5, adapter: { ...fake, readSnapshot: () => new Promise(() => {}) } });
  await rejects(() => pending.overview(context), 'SOURCE_TIMEOUT');
});

test('fixture adapter is cloned and service invokes only readSnapshot, never write/route methods', async () => {
  const snapshot = createFixtureSnapshot(); const before = JSON.stringify(snapshot); let writes = 0; let reads = 0;
  const base = createFixtureAdapter(snapshot);
  const adapter = { ...base, readSnapshot: async (ctx) => { reads += 1; return base.readSnapshot(ctx); },
    insert: () => { writes += 1; }, update: () => { writes += 1; }, backfill: () => { writes += 1; } };
  const service = makeService(undefined, fixtureActor(), { adapter });
  const overview = await service.overview(context);
  await service.list(overview.context, 'market_leads');
  await service.detail(overview.context, 'solution_deals', 'crm_leads:deal-a');
  assert.equal(reads, 3); assert.equal(writes, 0); assert.equal(JSON.stringify(snapshot), before);
  assert.throws(() => createCustomerJourneyService({ adapter: { ...adapter, live: true }, actor: fixtureActor() }), (error) => error.code === 'OFFLINE_ADAPTER_REQUIRED');
});

test('invalid record edge tuples and unsupported query/page inputs are rejected safely', async () => {
  const snapshot = createFixtureSnapshot(); snapshot.edges.push({ kind: 'customer_lead', from: 'orders:order-a', to: 'projects:project-shared' });
  await rejects(() => makeService(snapshot).overview(context), 'SOURCE_EDGE_INVALID');
  await rejects(() => makeService().overview({ ...context, filters: { arbitrary_sql: 'invalid' } }), 'INVALID_FILTER');
  await rejects(() => makeService().overview(null), 'UNTRUSTED_CONTEXT');
  await rejects(() => makeService().list(context, 'market_leads', { page: 0 }), 'INVALID_PAGE');
  await rejects(() => makeService().list(context, 'market_leads', { pageSize: 101 }), 'INVALID_PAGE');
});

test('financial and rating fragments retain source basis; no satisfaction/profit/payroll inference', async () => {
  const detail = await makeService().detail(context, 'solution_deals', 'crm_leads:deal-a');
  const invoice = detail.related.find((row) => row.entity === 'invoice');
  assert.equal(invoice.fields.amount_basis, 'SYNTHETIC_INVOICE_TOTAL_NOT_CASH_OR_PROFIT');
  const incident = detail.related.find((row) => row.entity === 'incident');
  assert.equal(incident.fields.status, 'closed');
  assert.equal(incident.fields.customer_satisfied, undefined);
  assert.equal(detail.related.find((row) => row.entity === 'rating').fields.stars, 2);
  assert.ok(detail.gaps.includes('CUSTOMER_ACCEPTANCE_NOT_INFERRED'));
});

test('nested commitment/task detail preserves parent predicate and authorizes explicit relation scope', async () => {
  const service = makeService(); const filtered = { ...context, filters: { q: 'Khách giả lập A' } };
  const parent = await service.detail(filtered, 'market_customers', 'customer:customer-a');
  await rejects(() => service.detail(parent.context, 'solution_deals', 'crm_leads:deal-a'), 'RESOURCE_DENIED');
  const via = { group_id: 'market_customers', parent_ref: 'customer:customer-a' };
  const commitment = await service.detail(parent.context, 'solution_deals', 'crm_leads:deal-a', { via });
  assert.deepEqual(commitment.context, parent.context);
  assert.equal(commitment.access_basis, 'AUTHORIZED_RELATION_OF_FILTERED_PARENT');
  assert.deepEqual(commitment.navigation_scope, via);
  const task = await service.detail(parent.context, 'operations_inventory', 'tasks:production-work', { via });
  assert.equal(task.record.ref, 'tasks:production-work');
  await rejects(() => service.detail(parent.context, 'solution_deals', 'crm_leads:deal-other', { via }), 'RESOURCE_DENIED');
  await rejects(() => service.detail(parent.context, 'solution_deals', 'crm_leads:denied-deal', { via }), 'RESOURCE_DENIED');
});

test('server recomputes echo range; callers cannot widen time boundary via snapshot context', async () => {
  const service = makeService(); const overview = await service.overview(context);
  await rejects(() => service.list({ ...overview.context, start_at: '2020-01-01T00:00:00Z' }, 'market_leads'), 'CONTEXT_RANGE_MISMATCH');
  assert.equal((await service.list(overview.context, 'market_leads')).context_key, overview.context_key);
});

test('unsupported or absent time basis is UNKNOWN, never an invented exact zero', async () => {
  const service = makeService();
  const unavailable = await service.list({ ...context, filters: { time_basis: 'occurred_at' } }, 'capacity_projects');
  assert.equal(unavailable.group.count, null);
  assert.equal(unavailable.group.coverage, 'UNKNOWN');
  assert.ok(unavailable.group.gaps.includes('FILTER_OR_TIME_BASIS_NOT_SUPPORTED'));
  const absent = await service.list({ ...context, filters: { time_basis: 'created_at' } }, 'market_customers');
  assert.equal(absent.group.count, null);
  assert.ok(absent.group.gaps.includes('FILTER_MEMBERSHIP_UNKNOWN'));
  const snapshot = createFixtureSnapshot();
  snapshot.records.find((row) => row.ref === 'crm_tasks:crm-work').fields.due_at = 'not-an-absolute-source-time';
  const invalid = await makeService(snapshot).list(context, 'operations_work');
  assert.equal(invalid.group.coverage, 'PARTIAL');
  assert.ok(invalid.group.gaps.includes('FILTER_MEMBERSHIP_UNKNOWN'));
});

test('an empty active-company scope is denied, not represented as empty business records', async () => {
  const snapshot = createFixtureSnapshot(); snapshot.companies.forEach((company) => { company.active = false; });
  await rejects(() => makeService(snapshot).overview(context), 'COMPANY_SCOPE_EMPTY');
});

test('event-to-deal navigation keeps occurred-at parent context without relabeling deal stock', async () => {
  const service = makeService(); const filter = { ...context, filters: { time_basis: 'occurred_at' } };
  const parent = await service.detail(filter, 'market_conversions', 'crm_kpi_ledger:event-a');
  const result = await service.detail(parent.context, 'solution_deals', 'crm_leads:deal-a', {
    via: { group_id: 'market_conversions', parent_ref: 'crm_kpi_ledger:event-a' },
  });
  assert.equal(result.record.ref, 'crm_leads:deal-a');
  assert.deepEqual(result.context, parent.context);
  assert.equal(result.group.count, null);
  assert.equal(result.group.basis, 'AUTHORIZED_RELATION_OF_FILTERED_PARENT');
  assert.equal(result.access_basis, 'AUTHORIZED_RELATION_OF_FILTERED_PARENT');
});

test('time-log source follows only explicit time_task then task project/lead lineage', async () => {
  const detail = await makeService().detail(context, 'control_time', 'task_time_logs:time-a');
  assert.ok(detail.tasks.some((row) => row.ref === 'tasks:production-work'));
  assert.ok(detail.commitments.some((row) => row.ref === 'projects:project-shared'));
  assert.ok(detail.customers.length > 0);
  assert.equal(detail.record.fields.hours, 2);
  assert.ok(detail.edges.some((edge) => edge.kind === 'time_task'));
});

test('customer task list does not attribute another deal-specific task via shared project', async () => {
  const snapshot = createFixtureSnapshot();
  const base = snapshot.records.find((row) => row.ref === 'tasks:production-work');
  snapshot.records.push({ ...base, ref: 'tasks:other-deal-work', source_id: 'other-deal-work' });
  snapshot.edges.push({ kind: 'task_project', from: 'tasks:other-deal-work', to: 'projects:project-shared' },
    { kind: 'task_lead', from: 'tasks:other-deal-work', to: 'crm_leads:deal-other' });
  const result = await makeService(snapshot).detail(context, 'market_customers', 'customer:customer-a');
  assert.ok(!result.tasks.some((row) => row.ref === 'tasks:other-deal-work'));
  assert.ok(result.tasks.some((row) => row.ref === 'tasks:production-work'));
  const hidden = fixtureActor({ denied_record_refs: ['crm_leads:deal-other'] });
  const bounded = await makeService(snapshot, hidden).detail(context, 'market_customers', 'customer:customer-a');
  assert.ok(!bounded.tasks.some((row) => row.ref === 'tasks:other-deal-work'));
});

test('ambiguous snapshot observation timestamps are rejected', async () => {
  const snapshot = createFixtureSnapshot(); snapshot.observed_at = '2026-09-06T12:00:00';
  await rejects(() => makeService(snapshot).overview(context), 'SOURCE_OBSERVATION_TIME_INVALID');
});

test('unknown work status cannot produce a claimed exact open-work count', async () => {
  const snapshot = createFixtureSnapshot();
  delete snapshot.records.find((row) => row.ref === 'tasks:sequential-work').fields.status;
  const result = await makeService(snapshot).overview(context);
  assert.equal(result.capacity.open_work, null);
  assert.ok(result.capacity.gaps.includes('WORK_STATUS_COVERAGE_UNKNOWN'));
});

test('decision drilldown uses its actual matched inventory group, not a due-only default', async () => {
  const snapshot = createFixtureSnapshot(); const task = snapshot.records.find((row) => row.ref === 'crm_tasks:crm-work');
  task.fields.due_at = '2026-08-01T00:00:00+07:00';
  const service = makeService(snapshot); const overview = await service.overview(context);
  const decision = overview.decisions.find((item) => item.source_ref === task.ref);
  assert.equal(decision.group_id, 'operations_inventory');
  assert.ok((await service.list(overview.context, decision.group_id)).records.some((row) => row.ref === decision.source_ref));
});

test('payment/invoice, expense/project and quotation lead/project edges retain financial lineage without formula or allocation', async () => {
  const service = makeService(); const overview = await service.overview(context);
  for (const group of ['control_payments', 'control_expenses', 'control_quotes']) assert.equal(byGroup(overview, group).count, 1);
  const payment = await service.detail(context, 'control_payments', 'payment_records:payment-a');
  assert.ok(payment.related.some((row) => row.ref === 'invoices:invoice-a'));
  assert.ok(payment.customers.some((row) => row.ref === 'customer:customer-a'));
  assert.ok(payment.commitments.some((row) => row.ref === 'crm_leads:deal-a'));
  assert.ok(payment.edges.some((edge) => edge.kind === 'payment_invoice'));
  const expense = await service.detail(context, 'control_expenses', 'project_expenses:expense-a');
  assert.ok(expense.commitments.some((row) => row.ref === 'projects:project-shared'));
  assert.equal(expense.record.fields.amount, 5);
  assert.equal(expense.record.fields.owner, undefined); // created_by is not the owner
  const customer = await service.detail(context, 'market_customers', 'customer:customer-a');
  for (const ref of ['quotations:quotation-a', 'invoices:invoice-a', 'payment_records:payment-a', 'project_expenses:expense-a']) {
    assert.equal(customer.related.filter((row) => row.ref === ref).length, 1);
  }
  assert.equal(customer.profit, undefined);
  assert.equal(customer.total_revenue, undefined);
  assert.ok(customer.gaps.includes('NO_VALUE_OR_WORK_ALLOCATION'));
});

test('payment source cannot traverse an invoice whose resource access is denied', async () => {
  const actor = fixtureActor({ denied_record_refs: ['invoices:invoice-a'] });
  const result = await makeService(undefined, actor).detail(context, 'control_payments', 'payment_records:payment-a');
  assert.deepEqual(result.customers, []); assert.deepEqual(result.commitments, []);
  assert.ok(!result.edges.some((edge) => edge.kind === 'payment_invoice'));
  assert.ok(result.gaps.includes('CUSTOMER_LINK_UNKNOWN'));
});

test('shared project never attributes another deal invoice/quotation/payment to selected customer', async () => {
  const snapshot = createFixtureSnapshot();
  for (const [entity, ref, source] of [['invoice', 'invoices:other', 'invoices'], ['quotation', 'quotations:other', 'quotations'], ['payment', 'payment_records:other', 'payment_records']]) {
    const row = snapshot.records.find((item) => item.entity === entity);
    snapshot.records.push({ ...row, ref, source_type: source, source_id: 'other' });
  }
  snapshot.edges.push({ kind: 'invoice_lead', from: 'invoices:other', to: 'crm_leads:deal-other' },
    { kind: 'invoice_project', from: 'invoices:other', to: 'projects:project-shared' },
    { kind: 'quotation_lead', from: 'quotations:other', to: 'crm_leads:deal-other' },
    { kind: 'quotation_project', from: 'quotations:other', to: 'projects:project-shared' },
    { kind: 'payment_invoice', from: 'payment_records:other', to: 'invoices:other' });
  for (const actor of [fixtureActor(), fixtureActor({ denied_record_refs: ['crm_leads:deal-other'] })]) {
    const result = await makeService(snapshot, actor).detail(context, 'market_customers', 'customer:customer-a');
    for (const ref of ['invoices:other', 'quotations:other', 'payment_records:other']) assert.ok(!result.related.some((row) => row.ref === ref));
    assert.ok(result.related.some((row) => row.ref === 'project_expenses:expense-a'));
    assert.ok(result.related.some((row) => row.ref === 'payment_records:payment-a'));
  }
});

test('commitment-specific project/order tasks do not inherit sibling-project or broad master-deal work', async () => {
  const service = makeService();
  const project = await service.detail(context, 'capacity_projects', 'projects:project-secondary');
  assert.deepEqual(project.tasks.map((row) => row.ref), ['tasks:sequential-work']);
  assert.equal(project.task_scope.basis, 'SELECTED_PROJECT_EXPLICIT_TASK_PROJECT');
  const order = await service.detail(context, 'solution_orders', 'orders:order-a');
  assert.ok(order.tasks.some((row) => row.ref === 'tasks:production-work'));
  assert.ok(!order.tasks.some((row) => row.ref === 'tasks:sequential-work'));
  assert.ok(!order.tasks.some((row) => row.ref === 'crm_tasks:crm-work'));
  assert.ok(order.gaps.includes('ORDER_WORK_REQUIRES_PROJECT_OR_FULFILLMENT_EDGE'));
  const log = await service.detail(context, 'control_time', 'task_time_logs:time-a');
  assert.deepEqual(log.tasks.map((row) => row.ref), ['tasks:production-work']);
});

test('selected source with a denied explicit lead cannot infer another customer through visible shared project', async () => {
  const snapshot = createFixtureSnapshot();
  const copies = [['invoice', 'invoices:foreign', 'invoices'], ['quotation', 'quotations:foreign', 'quotations'],
    ['payment', 'payment_records:foreign', 'payment_records'], ['task', 'tasks:foreign', 'tasks'],
    ['time_log', 'task_time_logs:foreign', 'task_time_logs'], ['order', 'orders:foreign', 'orders']];
  for (const [entity, ref, source] of copies) {
    const row = snapshot.records.find((item) => item.entity === entity);
    snapshot.records.push({ ...row, ref, source_type: source, source_id: 'foreign' });
  }
  snapshot.edges.push({ kind: 'invoice_lead', from: 'invoices:foreign', to: 'crm_leads:deal-other' },
    { kind: 'invoice_project', from: 'invoices:foreign', to: 'projects:project-shared' },
    { kind: 'quotation_lead', from: 'quotations:foreign', to: 'crm_leads:deal-other' },
    { kind: 'quotation_project', from: 'quotations:foreign', to: 'projects:project-shared' },
    { kind: 'payment_invoice', from: 'payment_records:foreign', to: 'invoices:foreign' },
    { kind: 'task_lead', from: 'tasks:foreign', to: 'crm_leads:deal-other' },
    { kind: 'task_project', from: 'tasks:foreign', to: 'projects:project-shared' },
    { kind: 'time_task', from: 'task_time_logs:foreign', to: 'tasks:foreign' },
    { kind: 'order_lead', from: 'orders:foreign', to: 'crm_leads:deal-other' },
    { kind: 'order_project', from: 'orders:foreign', to: 'projects:project-shared' });
  const hiddenTarget = fixtureActor({ denied_record_refs: ['crm_leads:deal-other'] });
  const deniedEdges = fixtureActor();
  deniedEdges.edge_permissions = deniedEdges.edge_permissions.filter((kind) =>
    !['invoice_lead', 'quotation_lead', 'task_lead', 'order_lead', 'fulfillment_lead'].includes(kind));
  for (const actor of [hiddenTarget, deniedEdges]) {
    const service = makeService(snapshot, actor);
    for (const [group, ref] of [['control_invoices', 'invoices:foreign'], ['control_quotes', 'quotations:foreign'],
      ['control_payments', 'payment_records:foreign'], ['operations_inventory', 'tasks:foreign'],
      ['control_time', 'task_time_logs:foreign'], ['solution_orders', 'orders:foreign']]) {
      const result = await service.detail(context, group, ref);
      assert.deepEqual(result.customers, []);
      assert.ok(!result.commitments.some((row) => row.entity === 'deal'));
      assert.ok(result.gaps.includes('EXPLICIT_SOURCE_LINK_UNRESOLVED'));
    }
  }
});

test('canonical work count and capacity are UNKNOWN when mirror permission is unavailable', async () => {
  const actor = fixtureActor();
  actor.edge_permissions = actor.edge_permissions.filter((kind) => kind !== 'mirror');
  const service = makeService(undefined, actor); const overview = await service.overview(context);
  for (const groupId of ['operations_work', 'operations_inventory']) {
    const group = byGroup(overview, groupId);
    assert.equal(group.count, null); assert.equal(group.coverage, 'UNKNOWN');
    assert.equal(group.locked, true);
    assert.ok(group.gaps.includes('CANONICAL_MIRROR_SCOPE_UNKNOWN'));
    const list = await service.list(overview.context, groupId);
    assert.deepEqual(list.records, []); assert.equal(list.pagination.total, null);
    await rejects(() => service.detail(overview.context, groupId, 'crm_tasks:crm-work'), 'RESOURCE_DENIED');
  }
  assert.equal(overview.capacity.open_work, null);
});
