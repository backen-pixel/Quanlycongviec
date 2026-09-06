import test from 'node:test';
import assert from 'node:assert/strict';
import readModel from '../../../../backend/src/helpers/customerJourneyReadModel.js';
import synthetic from '../../../../backend/tests/fixtures/customer-journey/syntheticJourney.js';
import {
  JOURNEY_SYSTEM_NAMES, normalizeJourneyContext, changeJourneyContext, journeyContextKey,
  assertJourneyOverview, assertJourneyList, assertJourneyDetail, assertJourneyRelationDetail,
  displayJourneyCount, displaySourceValue, safeJourneyError,
} from './journeyViewContract.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const context = () => normalizeJourneyContext({
  ecosystem_id: synthetic.ECOSYSTEM, company_id: 'all', period: 'month', period_anchor: '2026-09-06',
});
const service = () => readModel.createCustomerJourneyService({
  actor: synthetic.fixtureActor(), adapter: synthetic.createFixtureAdapter(),
  now: () => new Date(synthetic.FIXTURE_TIME),
});

test('view consumes actual offline application-service overview, not duplicated UI facts', async () => {
  const packet = await service().overview(context());
  assert.equal(assertJourneyOverview(packet, context()), packet);
  assert.deepEqual(packet.systems.map((system) => system.name), [...JOURNEY_SYSTEM_NAMES]);
  assert.equal(packet.protections.real_data_connected, false);
  assert.equal(packet.snapshot.live_connected, false);
  assert.equal(packet.companies.some((company) => company.id === synthetic.DENIED), false);
});

test('default view preserves each source group time basis', () => {
  assert.equal(context().filters.time_basis, '');
  assert.notEqual(context().filters.time_basis, 'stock');
});

test('back/navigation context can be echoed without changing scope, filters or snapshot', async () => {
  const client = service();
  const request = { ...context(), filters: { ...context().filters, q: 'giả lập', status: '', temperature: '' } };
  const overview = await client.overview(request);
  const pinned = normalizeJourneyContext(overview.context);
  assert.equal(journeyContextKey(pinned), journeyContextKey(request));
  assert.equal(pinned.snapshot_id, overview.snapshot.id);
  const list = await client.list(pinned, 'market_customers', { page: 1, pageSize: 2 });
  assertJourneyList(list, pinned, 'market_customers', { page: 1, pageSize: 2 });
});

test('company/filter/period change drops old snapshot and keeps other filters', async () => {
  const packet = await service().overview(context());
  const before = { ...packet.context, filters: { ...packet.context.filters, q: 'giả', status: 'pending' } };
  const changed = changeJourneyContext(before, { company_id: synthetic.MANUFACTURING, period: 'week' });
  assert.equal(changed.snapshot_id, undefined);
  assert.equal(changed.company_id, synthetic.MANUFACTURING);
  assert.equal(changed.period, 'week');
  assert.equal(changed.filters.q, 'giả');
  assert.equal(changed.filters.status, 'pending');
});

test('view rejects packets bound to a different company, period, predicate or snapshot', async () => {
  const packet = await service().overview(context());
  for (const patch of [
    { company_id: synthetic.TRADING }, { period: 'week' },
    { filters: { ...packet.context.filters, status: 'closed' } },
  ]) {
    const wrong = clone(packet); Object.assign(wrong.context, patch);
    assert.throws(() => assertJourneyOverview(wrong, context()), /JOURNEY_VIEW_CONTEXT_MISMATCH/);
  }
  const wrongSnapshot = clone(packet); wrongSnapshot.snapshot.id = 'other-snapshot';
  assert.throws(() => assertJourneyOverview(wrongSnapshot, context()), /JOURNEY_VIEW_SNAPSHOT_MISMATCH/);
  assert.throws(() => assertJourneyOverview(packet, { ...context(), snapshot_id: 'older-snapshot' }), /JOURNEY_VIEW_SNAPSHOT_MISMATCH/);
});

test('view rejects wrong mode, live-connected or write-capable packets', async () => {
  const packet = await service().overview(context());
  const wrongMode = { ...packet, mode: 'LIVE' };
  assert.throws(() => assertJourneyOverview(wrongMode, context()), /JOURNEY_VIEW_NOT_OFFLINE/);
  assert.throws(() => assertJourneyOverview({ ...packet, contract_version: 'customer_journey_unknown_v9' }, context()), /JOURNEY_VIEW_CONTRACT_UNSUPPORTED/);
  const live = clone(packet); live.snapshot.live_connected = true;
  assert.throws(() => assertJourneyOverview(live, context()), /JOURNEY_VIEW_NOT_OFFLINE/);
  for (const key of ['real_data_connected', 'write_enabled', 'live_routes_registered', 'ai_runtime_enabled']) {
    const wrong = clone(packet); wrong.protections[key] = true;
    assert.throws(() => assertJourneyOverview(wrong, context()), /JOURNEY_VIEW_PROTECTIONS_INVALID/);
  }
});

test('view rejects missing or duplicate groups and renamed systems', async () => {
  const packet = await service().overview(context());
  const duplicate = clone(packet); duplicate.systems[0].groups.push(duplicate.systems[0].groups[0]);
  assert.throws(() => assertJourneyOverview(duplicate, context()), /JOURNEY_VIEW_GROUP_INVALID/);
  const renamed = clone(packet); renamed.systems[5].name = 'Dashboard khác';
  assert.throws(() => assertJourneyOverview(renamed, context()), /JOURNEY_VIEW_SYSTEM_INVALID/);
  const shortened = clone(packet); shortened.systems.pop();
  assert.throws(() => assertJourneyOverview(shortened, context()), /JOURNEY_VIEW_OVERVIEW_INVALID/);
});

test('count presentation preserves exact, lower-bound, unknown, locked and zero distinctions', () => {
  assert.equal(displayJourneyCount({ count: 0, coverage: 'EXACT', locked: false }), '0');
  assert.equal(displayJourneyCount({ count: 2, coverage: 'PARTIAL', locked: false }), '≥ 2');
  assert.equal(displayJourneyCount({ count: 2, coverage: 'UNKNOWN', locked: false }), '—');
  assert.equal(displayJourneyCount({ count: 2, coverage: 'EXACT', locked: true }), '—');
  assert.equal(displayJourneyCount({ count: null, coverage: 'UNKNOWN', locked: true }), '—');
});

test('all list pages consume same source group and pinned context with unique refs', async () => {
  const client = service();
  const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const expected = overview.systems.flatMap((system) => system.groups).find((group) => group.id === 'solution_deals').count;
  const refs = [];
  for (let page = 1; page <= 10; page += 1) {
    const packet = await client.list(pinned, 'solution_deals', { page, pageSize: 2 });
    assertJourneyList(packet, pinned, 'solution_deals', { page, pageSize: 2 });
    refs.push(...packet.records.map((row) => row.ref));
    if (!packet.pagination.has_more) break;
  }
  assert.equal(refs.length, expected);
  assert.equal(new Set(refs).size, expected);
});

test('view rejects wrong-page, wrong-group and duplicated list records', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const packet = await client.list(pinned, 'solution_deals', { page: 1, pageSize: 5 });
  assert.throws(() => assertJourneyList(packet, pinned, 'market_leads', { page: 1, pageSize: 5 }), /JOURNEY_VIEW_GROUP_MISMATCH/);
  assert.throws(() => assertJourneyList(packet, pinned, 'solution_deals', { page: 2, pageSize: 5 }), /JOURNEY_VIEW_PAGINATION_INVALID/);
  const duplicate = clone(packet); duplicate.records.push(duplicate.records[0]);
  assert.throws(() => assertJourneyList(duplicate, pinned, 'solution_deals', { page: 1, pageSize: 5 }), /JOURNEY_VIEW_RECORD_INVALID/);
});

test('view cannot promote partial count to exact or accept count/list/pagination disagreement', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const packet = await client.list(pinned, 'solution_deals', { page: 1, pageSize: 5 });
  const wrongTotal = clone(packet); wrongTotal.pagination.total += 1;
  assert.throws(() => assertJourneyList(wrongTotal, pinned, 'solution_deals', { page: 1, pageSize: 5 }), /JOURNEY_VIEW_PAGINATION_INVALID/);
  const missingRow = clone(packet); missingRow.records.pop();
  assert.throws(() => assertJourneyList(missingRow, pinned, 'solution_deals', { page: 1, pageSize: 5 }), /JOURNEY_VIEW_COUNT_LIST_MISMATCH/);
  const wrongRelation = clone(packet); wrongRelation.group.count_relation = 'gte';
  assert.throws(() => assertJourneyList(wrongRelation, pinned, 'solution_deals', { page: 1, pageSize: 5 }), /JOURNEY_VIEW_GROUP_INVALID/);
});

test('list remains bound to overview count, coverage, unit and basis on the same snapshot', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const expectedGroup = overview.systems.flatMap((system) => system.groups).find((group) => group.id === 'solution_deals');
  const packet = await client.list(pinned, expectedGroup.id, { page: 1, pageSize: 2 });
  const options = { page: 1, pageSize: 2, expectedGroup };
  assertJourneyList(packet, pinned, expectedGroup.id, options);
  const internallyConsistent = clone(packet);
  internallyConsistent.group.count += 1; internallyConsistent.pagination.total += 1;
  assert.throws(() => assertJourneyList(internallyConsistent, pinned, expectedGroup.id, options), /JOURNEY_VIEW_OVERVIEW_LIST_MISMATCH/);
  for (const patch of [{ basis: 'different-basis' }, { unit: 'different-unit' }, { coverage: 'PARTIAL', count_relation: 'gte' }]) {
    const wrong = clone(packet); Object.assign(wrong.group, patch);
    assert.throws(() => assertJourneyList(wrong, pinned, expectedGroup.id, options), /JOURNEY_VIEW_OVERVIEW_LIST_MISMATCH/);
  }
});

test('detail keeps multiple commitments/tasks and rejects another selected record', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const packet = await client.detail(pinned, 'market_customers', 'customer:customer-a');
  assertJourneyDetail(packet, pinned, 'market_customers', 'customer:customer-a');
  assert.ok(packet.commitments.length > 1);
  assert.ok(packet.tasks.length > 1);
  assert.equal(packet.commitments.some((record) => record.ref === 'crm_leads:deal-other'), false);
  assert.throws(() => assertJourneyDetail(packet, pinned, 'market_customers', 'customer:customer-b'), /JOURNEY_VIEW_RECORD_MISMATCH/);
});

test('detail validates duplicate tasks and missing relation metadata', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const packet = await client.detail(pinned, 'market_customers', 'customer:customer-a');
  const duplicate = clone(packet); duplicate.tasks.push(duplicate.tasks[0]);
  assert.throws(() => assertJourneyDetail(duplicate, pinned, 'market_customers', 'customer:customer-a'), /JOURNEY_VIEW_RECORD_INVALID/);
  const missing = clone(packet); delete missing.edges;
  assert.throws(() => assertJourneyDetail(missing, pinned, 'market_customers', 'customer:customer-a'), /JOURNEY_VIEW_DETAIL_INVALID/);
  const brokenRelated = clone(packet); brokenRelated.related = { fake: true };
  assert.throws(() => assertJourneyDetail(brokenRelated, pinned, 'market_customers', 'customer:customer-a'), /JOURNEY_VIEW_RECORDS_INVALID/);
});

test('task view requires source-specific scope and never claims an allocation', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const packet = await client.detail(pinned, 'capacity_projects', 'projects:project-secondary');
  assertJourneyDetail(packet, pinned, 'capacity_projects', packet.record.ref);
  assert.equal(packet.task_scope.basis, 'SELECTED_PROJECT_EXPLICIT_TASK_PROJECT');
  assert.deepEqual(packet.tasks.map((row) => row.ref), ['tasks:sequential-work']);
  for (const patch of [{ allocation_performed: true }, { source_ref: 'projects:other' }, { basis: 'UNREVIEWED_ALLOCATION' }]) {
    const wrong = clone(packet); Object.assign(wrong.task_scope, patch);
    assert.throws(() => assertJourneyDetail(wrong, pinned, 'capacity_projects', packet.record.ref), /JOURNEY_VIEW_TASK_SCOPE_INVALID/);
  }
});

test('unrecognized source fields cannot bypass the view field contract', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const packet = await client.detail(pinned, 'market_customers', 'customer:customer-a');
  const wrong = clone(packet); wrong.record.fields.unreviewed_private_field = 'fixture-only-private';
  assert.throws(() => assertJourneyDetail(wrong, pinned, 'market_customers', 'customer:customer-a'), /JOURNEY_VIEW_FIELD_INVALID/);
});

test('commitment task navigation keeps original customer search via authorized parent proof', async () => {
  const client = service();
  const request = { ...context(), filters: { ...context().filters, q: 'Khách giả lập A' } };
  const overview = await client.overview(request);
  const pinned = normalizeJourneyContext(overview.context);
  const via = { group_id: 'market_customers', parent_ref: 'customer:customer-a' };
  const packet = await client.detail(pinned, 'solution_deals', 'crm_leads:deal-a', { via });
  assertJourneyRelationDetail(packet, pinned, 'solution_deals', 'crm_leads:deal-a', via);
  assert.equal(packet.context.filters.q, request.filters.q);
  assert.ok(packet.tasks.some((task) => task.ref === 'crm_tasks:crm-work'));
  assert.equal(packet.commitments.some((record) => record.ref === 'crm_leads:deal-other'), false);
});

test('commitment task view rejects direct-detail packets or mismatched parent proof', async () => {
  const client = service(); const overview = await client.overview(context());
  const pinned = normalizeJourneyContext(overview.context);
  const via = { group_id: 'market_customers', parent_ref: 'customer:customer-a' };
  const direct = await client.detail(pinned, 'solution_deals', 'crm_leads:deal-a');
  assert.throws(() => assertJourneyRelationDetail(direct, pinned, 'solution_deals', 'crm_leads:deal-a', via), /JOURNEY_VIEW_PARENT_RELATION_MISMATCH/);
  const linked = await client.detail(pinned, 'solution_deals', 'crm_leads:deal-a', { via });
  assert.throws(() => assertJourneyRelationDetail(linked, pinned, 'solution_deals', 'crm_leads:deal-a', { ...via, parent_ref: 'customer:customer-b' }), /JOURNEY_VIEW_PARENT_RELATION_MISMATCH/);
});

test('raw error message and unsafe code are never reflected as view error text', () => {
  assert.equal(safeJourneyError({ message: 'arbitrary raw upstream error' }), 'JOURNEY_VIEW_REQUEST_FAILED');
  assert.equal(safeJourneyError({ code: '<not-a-code>' }), 'JOURNEY_VIEW_REQUEST_FAILED');
  assert.equal(safeJourneyError({ code: 'COMPANY_DENIED' }), 'COMPANY_DENIED');
});

test('source value presentation never invents owner, start, money unit or outcome', () => {
  assert.equal(displaySourceValue(null), 'Chưa có nguồn / UNKNOWN');
  assert.equal(displaySourceValue(false), 'Không (theo nguồn)');
  assert.equal(displaySourceValue(0), '0');
  assert.equal(displaySourceValue(1.234567), '1,234567');
  assert.equal(displaySourceValue('cancelled'), 'cancelled');
  assert.equal(displaySourceValue({ amount: 42 }), 'Dữ liệu có cấu trúc — chưa có hợp đồng trình bày');
});

test('invalid dates, periods and time-basis fail before a client call', () => {
  assert.throws(() => normalizeJourneyContext({ ...context(), period_anchor: '2026-02-30' }), /JOURNEY_VIEW_ANCHOR_INVALID/);
  assert.throws(() => normalizeJourneyContext({ ...context(), period: 'year' }), /JOURNEY_VIEW_PERIOD_INVALID/);
  assert.throws(() => normalizeJourneyContext({ ...context(), filters: { time_basis: 'profit' } }), /JOURNEY_VIEW_TIME_BASIS_INVALID/);
});
