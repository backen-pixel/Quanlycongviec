import test from 'node:test';
import assert from 'node:assert/strict';
import readModel from '../../../../backend/src/helpers/customerJourneyReadModel.js';
import functional from '../../../../backend/tests/fixtures/customer-journey/functionalJourney.js';
import {
  FIELD_LABELS, normalizeJourneyContext, assertJourneyOverview, assertJourneyList,
  assertJourneyDetail, assertJourneyRelationDetail, displaySourceValue,
} from './journeyViewContract.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const request = () => normalizeJourneyContext({ ecosystem_id: functional.ECOSYSTEM,
  company_id: 'all', period: 'month', period_anchor: '2026-09-06' });
const clientFor = (actor = functional.createFunctionalActor()) => readModel.createCustomerJourneyService({
  actor, adapter: functional.createFunctionalAdapter(), now: () => new Date(functional.FIXTURE_TIME),
});

test('functional view accepts every actual default group with all pages and source details', async () => {
  const client = clientFor(); const overview = await client.overview(request());
  assert.equal(assertJourneyOverview(overview, request()), overview);
  const context = normalizeJourneyContext(overview.context);
  const groups = overview.systems.flatMap((system) => system.groups);
  for (const id of ['solution_surveys', 'solution_design', 'solution_quotation_tasks',
    'operations_logistics_attention', 'operations_install_overdue', 'operations_logistics_incidents',
    'control_receivables', 'control_overdue', 'control_due_today', 'correction_feedback',
    'correction_not_rated', 'correction_feedback_unknown']) assert.ok(groups.some((group) => group.id === id));
  for (const group of groups.filter((item) => !item.locked)) {
    const refs = [];
    for (let page = 1; page <= 100; page += 1) {
      const list = await client.list(context, group.id, { page, pageSize: 2 });
      assert.equal(assertJourneyList(list, context, group.id, { page, pageSize: 2, expectedGroup: group }), list);
      for (const row of list.records) {
        refs.push(row.ref);
        const detail = await client.detail(context, group.id, row.ref);
        assert.equal(assertJourneyDetail(detail, context, group.id, row.ref), detail);
      }
      if (!list.pagination.has_more) break;
      assert.ok(page < 100, 'finite fixture must exhaust pages');
    }
    assert.equal(new Set(refs).size, refs.length);
    if (group.coverage === 'EXACT') assert.equal(refs.length, group.count);
  }
});

test('functional derived DTO fields have supported labels and retain distinct source meanings', async () => {
  const client = clientFor();
  const cases = [
    ['solution_surveys', 'crm_events:survey-open', { crm_source_state: 'OPEN_SITE_VISIT' }],
    ['solution_design', 'crm_tasks:design-open', { crm_source_state: 'OPEN_DESIGN_TASK' }],
    ['operations_logistics_attention', 'orders:order-a', { logistics_flags: 'SHIPPING | INSTALL_DEADLINE_PAST | INCIDENT' }],
    ['control_receivables', 'invoices:invoice-a', { collection_state: 'OVERDUE', collection_remaining_amount: 75 }],
    ['control_receivables', 'invoices:invoice-future', { collection_state: 'FUTURE_UNPAID', collection_remaining_amount: 50 }],
    ['correction_not_rated', 'crm_leads:deal-b', { feedback_state: 'NOT_RATED', outcome_state: 'UNKNOWN' }],
    ['correction_feedback_unknown', 'crm_leads:deal-other', { feedback_state: 'UNKNOWN' }],
  ];
  for (const [group, ref, expected] of cases) {
    const packet = await client.detail(request(), group, ref);
    assertJourneyDetail(packet, request(), group, ref);
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(packet.record.fields[field], value);
      assert.equal(typeof FIELD_LABELS[field], 'string');
      assert.ok(FIELD_LABELS[field].length > 0);
      assert.equal(typeof displaySourceValue(value), 'string');
    }
  }
});

test('functional DTO rejects untrusted gap messages, unrecognized fields and structured derived payloads', async () => {
  const group = 'control_receivables'; const ref = 'invoices:invoice-a';
  const packet = await clientFor().detail(request(), group, ref);
  for (const invalid of [['free-form source response'], [{}], 'SOURCE_ERROR']) {
    const altered = clone(packet); altered.record.functional_gaps = invalid;
    assert.throws(() => assertJourneyDetail(altered, request(), group, ref), /JOURNEY_VIEW_FUNCTIONAL_GAP_INVALID/);
  }
  const unexpected = clone(packet); unexpected.record.fields.unrecognized_secret_field = 'synthetic-only';
  assert.throws(() => assertJourneyDetail(unexpected, request(), group, ref), /JOURNEY_VIEW_FIELD_INVALID/);
  const structured = clone(packet); structured.record.fields.collection_remaining_amount = { value: 75 };
  assert.throws(() => assertJourneyDetail(structured, request(), group, ref), /JOURNEY_VIEW_FIELD_INVALID/);
});

test('functional view sees no denied invoice amounts and never displays an inferred zero remaining', async () => {
  const actor = functional.createFunctionalActor();
  actor.field_permissions.invoice = actor.field_permissions.invoice.filter((field) => !['total', 'paid_amount', 'amount'].includes(field));
  const client = clientFor(actor); const overview = await client.overview(request());
  assertJourneyOverview(overview, request());
  const locked = overview.systems.flatMap((system) => system.groups).find((group) => group.id === 'control_receivables');
  assert.equal(locked.locked, true); assert.equal(locked.count, null);
  const packet = await client.detail(request(), 'control_invoices', 'invoices:invoice-a');
  assertJourneyDetail(packet, request(), 'control_invoices', 'invoices:invoice-a');
  for (const row of [packet.record, ...packet.related].filter((item) => item.entity === 'invoice')) {
    for (const field of ['total', 'paid_amount', 'amount']) assert.equal(Object.hasOwn(row.fields, field), false);
    assert.equal(row.fields.collection_remaining_amount, null);
    assert.equal(row.fields.collection_state, 'UNKNOWN');
    assert.match(displaySourceValue(row.fields.collection_remaining_amount), /UNKNOWN/);
    assert.ok(row.functional_gaps.includes('INVOICE_AMOUNT_UNKNOWN_OR_RESTRICTED'));
  }
});

test('functional relation detail preserves pinned parent scope for exact logistics commitment and denies a wrong parent proof', async () => {
  const client = clientFor(); const group = 'operations_logistics_attention'; const ref = 'orders:order-a';
  const parent = await client.detail(request(), group, ref);
  const context = normalizeJourneyContext(parent.context);
  const project = parent.commitments.find((row) => row.ref === 'projects:project-logistics');
  assert.ok(project);
  const via = { group_id: group, parent_ref: ref };
  const detail = await client.detail(context, project.group_id, project.ref, { via });
  assertJourneyRelationDetail(detail, context, project.group_id, project.ref, via);
  assert.equal(detail.task_scope.basis, 'SELECTED_PROJECT_EXPLICIT_TASK_PROJECT');
  assert.deepEqual(detail.tasks.map((row) => row.ref), ['tasks:logistics-work']);
  assert.throws(() => assertJourneyRelationDetail(detail, context, project.group_id, project.ref,
    { ...via, parent_ref: 'orders:unrelated-synthetic' }), /JOURNEY_VIEW_PARENT_RELATION_MISMATCH/);
});
