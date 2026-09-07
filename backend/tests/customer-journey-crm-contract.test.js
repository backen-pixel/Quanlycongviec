'use strict';

// Pure source-contract fixtures only; no legacy app or network imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const { CRM_FIELDS, CRM_ACTION_GROUPS, SOURCE_CONTRACTS,
  crmActionMembership, describeCrmSource } = require('../src/helpers/customerJourneyCrmContract');

const task = (fields = {}, extra = {}) => ({ entity: 'task', source_type: 'crm_tasks',
  ref: 'crm_tasks:synthetic-crm-task', label: 'Tiêu đề giả lập không quyết định workflow',
  fields: { stage_slug: 'design', status: 'pending', ...fields }, ...extra });
const event = (fields = {}, extra = {}) => ({ entity: 'crm_event', source_type: 'crm_events',
  ref: 'crm_events:synthetic-survey', fields: { event_type: 'site_visit', status: 'planned', ...fields }, ...extra });

test('J02 source groups preserve explicit event/task units and separate document semantics', () => {
  assert.deepEqual(CRM_ACTION_GROUPS.map((group) => [group.id, group.unit, group.entities]), [
    ['solution_surveys', 'crm_event', ['crm_event']],
    ['solution_design', 'crm_task', ['task']],
    ['solution_quotation_tasks', 'crm_task', ['task']],
  ]);
  assert.ok(CRM_ACTION_GROUPS.every((group) => group.system === 'solution' && group.basis === 'stock'
    && group.contract_key && group.required_fields.includes('status')));
  assert.ok(CRM_FIELDS.includes('planned_end_at'));
  assert.match(SOURCE_CONTRACTS.survey.symbol, /SURVEY_EVENT_TYPES/);
  assert.match(SOURCE_CONTRACTS.custom_stage_limit.meaning, /no verified/);
});

test('J02 planned and in-progress site visits are positive survey fixtures by machine source type', () => {
  for (const status of ['planned', 'in_progress']) {
    assert.equal(crmActionMembership('solution_surveys', event({ status })), true);
  }
  for (const event_type of ['measurement', 'meeting', 'consultation', 'design_review']) {
    assert.equal(crmActionMembership('solution_surveys', event({ event_type }, { label: 'Khảo sát' })), false);
  }
});

test('J02 design stage tasks in each source open status are actionable without title matching', () => {
  for (const status of ['pending', 'in_progress']) {
    assert.equal(crmActionMembership('solution_design', task({ status }, { label: 'Tên đã đổi hoàn toàn' })), true);
  }
  assert.equal(crmActionMembership('solution_quotation_tasks', task()), false);
});

test('J02 quotation and combined quotation-contract source tasks stay separate from documents', () => {
  for (const stage_slug of ['quotation', 'deal_quote_contract']) {
    for (const status of ['pending', 'in_progress']) {
      const row = task({ stage_slug, status });
      assert.equal(crmActionMembership('solution_quotation_tasks', row), true);
      assert.equal(crmActionMembership('solution_design', row), false);
      assert.ok(describeCrmSource(row).gaps.includes('QUOTATION_TASK_NOT_QUOTATION_DOCUMENT'));
    }
  }
  assert.equal(crmActionMembership('solution_quotation_tasks', task({}, { entity: 'quotation', source_type: 'quotations' })), false);
});

test('J02 completed or cancelled source tasks and events are not open work', () => {
  for (const status of ['completed', 'cancelled']) {
    assert.equal(crmActionMembership('solution_surveys', event({ status })), false);
    assert.equal(crmActionMembership('solution_design', task({ status })), false);
    assert.equal(crmActionMembership('solution_quotation_tasks', task({ stage_slug: 'quotation', status })), false);
  }
});

test('J02 a display label never assigns custom or different task stages to a workflow', () => {
  for (const label of ['Khảo sát', 'Thiết kế', 'Báo giá']) {
    const different = task({ stage_slug: 'consulting' }, { label });
    assert.equal(crmActionMembership('solution_design', different), false);
    assert.equal(crmActionMembership('solution_quotation_tasks', different), false);
    const custom = task({ stage_slug: 'pl_thiet_ke_aabbccdd' }, { label });
    assert.equal(crmActionMembership('solution_design', custom), null);
    assert.equal(crmActionMembership('solution_quotation_tasks', custom), null);
    assert.equal(describeCrmSource(custom).state, 'UNKNOWN');
  }
});

test('J02 missing or field-denied required predicates yield UNKNOWN rather than false/exact zero', () => {
  for (const group of CRM_ACTION_GROUPS) {
    for (const field of group.required_fields) {
      for (const missing of [undefined, null, '']) {
        const row = group.id === 'solution_surveys' ? event() : task({ stage_slug: 'quotation' });
        row.fields[field] = missing;
        if (missing === undefined) delete row.fields[field]; // post-authorization denied projection
        assert.equal(crmActionMembership(group.id, row), null);
      }
    }
  }
});

test('J02 unknown source statuses remain UNKNOWN; do not inherit generic done/blocked rules', () => {
  for (const status of ['done', 'blocked', 'review', 'arbitrary-new-status']) {
    assert.equal(crmActionMembership('solution_surveys', event({ status })), null);
    assert.equal(crmActionMembership('solution_design', task({ status })), null);
    assert.equal(crmActionMembership('solution_quotation_tasks', task({ stage_slug: 'quotation', status })), null);
  }
});

test('J02 a production task or mirrored assignment does not become a CRM stage task', () => {
  for (const source_type of ['tasks', 'crm_assignments']) {
    assert.equal(crmActionMembership('solution_design', task({}, { source_type })), false);
    assert.equal(crmActionMembership('solution_quotation_tasks', task({ stage_slug: 'quotation' }, { source_type })), false);
  }
  assert.equal(crmActionMembership('solution_design', task({}, { entity: 'assignment' })), false);
  assert.equal(crmActionMembership('solution_surveys', event({}, { source_type: 'crm_kpi_ledger' })), false);
});

test('J02 survey schedule metadata never fabricates actual start/completion or task deadline', () => {
  const row = event({ planned_start_at: '2026-09-07T09:00:00+07:00', planned_end_at: '2026-09-07T10:00:00+07:00' });
  const before = JSON.stringify(row);
  const description = describeCrmSource(row);
  assert.equal(description.state, 'OPEN_SITE_VISIT');
  assert.ok(description.gaps.includes('SURVEY_PLANNED_TIMES_NOT_ACTUAL'));
  assert.ok(description.gaps.includes('SURVEY_EVENT_NOT_A_TASK'));
  assert.equal(row.fields.started_at, undefined);
  assert.equal(row.fields.completed_at, undefined);
  assert.equal(row.fields.due_at, undefined);
  assert.equal(JSON.stringify(row), before);
});

test('J02 open-stage projection does not claim CRM blocking-gate or full custom-stage coverage', () => {
  const row = task({ status: 'completed', blocks_stage_advance: true, completion_requires_file_or_note: true });
  assert.equal(crmActionMembership('solution_design', row), false);
  const description = describeCrmSource(row);
  assert.ok(description.gaps.includes('OPEN_TASK_PREDICATE_NOT_STAGE_ADVANCE_GATE'));
  assert.equal(crmActionMembership('unknown-group', row), null);
  assert.equal(describeCrmSource({ entity: 'invoice', source_type: 'invoices', fields: {} }), null);
});
