'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LOGISTICS_FIELDS, projectOrderLogistics } = require('../src/helpers/customerJourneyLogisticsContract');

function fixture() {
  const order = { ref: 'orders:fixture-order', entity: 'order', source_type: 'orders', company_id: 'fixture-owner',
    fields: { delivery_date: '2026-09-09', shipped_at: '2026-09-05T06:00:00Z', delivered_at: null } };
  const project = { ref: 'projects:fixture-logistics', entity: 'project', source_type: 'projects', company_id: 'fixture-executor',
    fields: { status: 'shipping', vc_stage_slug: 'delivery', vc_temp_staged: false,
      install_date: '2026-09-05T14:00:00+07:00', delivery_date: '2026-09-05', pickup_at: '2026-09-04T09:00:00+07:00',
      logistics_company_id: 'fixture-executor', logistics_person_id: 'fixture-driver', installer_person_id: 'fixture-installer' } };
  const incident = { ref: 'project_incidents:fixture-incident', entity: 'incident', source_type: 'project_incidents',
    fields: { status: 'closed', reported_by: 'fixture-reporter', resolved_by: 'fixture-resolver' } };
  return { order, project, incident, input: {
    records: new Map([order, project, incident].map((row) => [row.ref, row])),
    edges: [{ kind: 'logistics_project', from: order.ref, to: project.ref },
      { kind: 'incident_project', from: incident.ref, to: project.ref }],
    todayDate: '2026-09-06', clockBasis: 'Asia/Ho_Chi_Minh',
    coverage: { project: 'EXACT', incident: 'EXACT', logistics_project: 'EXACT', incident_project: 'EXACT' },
    edgePermissions: ['logistics_project', 'incident_project'],
  } };
}
const result = ({ order, input }) => projectOrderLogistics(order, input);

test('J05 one shipping order with past install deadline and incident stays one order', () => {
  const f = fixture();
  const output = result(f);
  assert.equal(output.state, 'LINKED');
  assert.deepEqual(output.flags, ['SHIPPING', 'INSTALL_DEADLINE_PAST', 'INCIDENT']);
  assert.equal(output.unique_order_count, 1);
  assert.equal(output.source_refs.filter((ref) => ref === f.order.ref).length, 1);
  assert.equal(output.project_plans.length, 1);
  assert.equal(output.project_plans[0].fields.install_deadline, '2026-09-05T14:00:00+07:00');
});

test('J05 planned delivery and delivered status timestamp are never actual receipt or install', () => {
  const f = fixture(); f.order.fields.delivered_at = '2026-09-06T01:00:00Z';
  const output = result(f);
  assert.deepEqual(output.planning, { planned_delivery_date: '2026-09-09',
    status_shipped_at: '2026-09-05T06:00:00Z', status_delivered_at: '2026-09-06T01:00:00Z' });
  assert.ok(output.gaps.includes('SOURCE_STATUS_TIMESTAMPS_NOT_CUSTOMER_RECEIPT'));
  assert.ok(output.gaps.includes('ACTUAL_INSTALL_OUTCOME_NOT_CONNECTED'));
  assert.equal(output.actual_delivery_at, undefined); assert.equal(output.actual_install_at, undefined);
  assert.equal(output.customer_accepted, undefined); assert.equal(output.repair_owner, undefined);
});

test('J05 source date rule does not call an earlier hour today past deadline', () => {
  const f = fixture(); f.project.fields.install_date = '2026-09-06T01:00:00+07:00';
  assert.equal(result(f).flag_states.INSTALL_DEADLINE_PAST, 'NO');
  f.project.fields.install_date = '2026-09-05T18:30:00Z'; // 06/09 01:30 VN
  assert.equal(result(f).flag_states.INSTALL_DEADLINE_PAST, 'NO');
});

test('J05 source completed project and completed stages suppress install warning without acceptance inference', () => {
  for (const fields of [{ status: 'completed' }, { vc_stage_slug: 'completed' },
    { vc_stage_slug: 'done' }, { vc_stage_slug: 'install_completed' }]) {
    const f = fixture(); Object.assign(f.project.fields, fields);
    const output = result(f);
    assert.equal(output.flag_states.INSTALL_DEADLINE_PAST, 'NO');
    assert.ok(output.flags.includes('INCIDENT')); // closed is still a source incident
    assert.ok(output.gaps.includes('CUSTOMER_ACCEPTANCE_NOT_INFERRED'));
  }
});

test('J05 explicitly empty install date can use source legacy install date, not order delivery', () => {
  const f = fixture(); f.project.fields.install_date = null;
  const output = result(f);
  assert.equal(output.flag_states.INSTALL_DEADLINE_PAST, 'YES');
  assert.equal(output.project_plans[0].fields.install_deadline_source, 'projects.delivery_date_legacy_install_date');
  assert.equal(output.project_plans[0].fields.install_deadline, '2026-09-05');
  assert.notEqual(output.project_plans[0].fields.install_deadline, output.planning.planned_delivery_date);
});

test('J05 denied install field cannot consult fallback or production deadlines', () => {
  const f = fixture(); delete f.project.fields.install_date;
  Object.assign(f.project.fields, { due_at: '2026-09-01T00:00:00Z', deadline: '2026-09-01', production_deadline: '2026-09-01' });
  const output = result(f);
  assert.equal(output.flag_states.INSTALL_DEADLINE_PAST, 'UNKNOWN');
  assert.equal(output.project_plans[0].fields.install_deadline, undefined);
  assert.ok(output.gaps.includes('INSTALL_FIELD_UNAVAILABLE_NO_FALLBACK'));
  assert.ok(!JSON.stringify(output).includes('2026-09-01'));
});

test('J05 absent, invalid or ambiguous install milestones and unknown clock stay unknown', () => {
  for (const install of [null, 'invalid', '2026-02-30', '2026-09-05T14:00:00']) {
    const f = fixture(); f.project.fields.install_date = install; f.project.fields.delivery_date = null;
    assert.equal(result(f).flag_states.INSTALL_DEADLINE_PAST, 'UNKNOWN');
  }
  const f = fixture(); f.input.clockBasis = 'UNKNOWN';
  assert.equal(result(f).flag_states.INSTALL_DEADLINE_PAST, 'UNKNOWN');
});

test('J05 missing or denied logistics relationship never uses production project or source status alone', () => {
  const missing = fixture(); missing.input.edges[0].kind = 'order_project';
  const denied = fixture(); denied.input.edgePermissions = ['incident_project'];
  for (const f of [missing, denied]) {
    const output = result(f);
    assert.equal(output.state, 'UNKNOWN'); assert.deepEqual(output.flags, []);
    assert.deepEqual(output.source_refs, [f.order.ref]); assert.deepEqual(output.project_plans, []);
  }
});

test('J05 denied project and incident row cannot leak references from surviving edge inputs', () => {
  const f = fixture(); f.input.records.delete(f.project.ref); f.input.records.delete(f.incident.ref);
  const output = result(f);
  assert.equal(output.state, 'UNKNOWN'); assert.deepEqual(output.source_refs, [f.order.ref]);
  assert.ok(!JSON.stringify(output).includes('fixture-logistics'));
  assert.ok(!JSON.stringify(output).includes('fixture-incident'));
});

test('J05 complete authorized empty incident set is distinct from partial or denied', () => {
  const f = fixture(); f.input.edges = f.input.edges.filter((edge) => edge.kind !== 'incident_project');
  assert.equal(result(f).flag_states.INCIDENT, 'NO');
  f.input.coverage.incident = 'PARTIAL';
  assert.equal(result(f).flag_states.INCIDENT, 'UNKNOWN');
  f.input.coverage.incident = 'EXACT'; f.input.edgePermissions = ['logistics_project'];
  assert.equal(result(f).flag_states.INCIDENT, 'UNKNOWN');
  f.input.edgePermissions.push('incident_project'); delete f.input.coverage.incident_project;
  assert.equal(result(f).flag_states.INCIDENT, 'UNKNOWN');
});

test('J05 overlapping duplicate source edges do not multiply orders, projects or incidents', () => {
  const f = fixture(); f.input.edges.push(...f.input.edges.map((edge) => ({ ...edge })));
  const output = result(f);
  assert.equal(output.unique_order_count, 1); assert.equal(output.project_plans.length, 1);
  assert.equal(output.source_refs.length, 3);
  assert.deepEqual(output.flags, ['SHIPPING', 'INSTALL_DEADLINE_PAST', 'INCIDENT']);
});

test('J05 separate authorized logistics projects remain separate rather than first-project fallback', () => {
  const f = fixture();
  const extra = { ref: 'projects:fixture-second', entity: 'project', source_type: 'projects', company_id: 'fixture-executor',
    fields: { ...f.project.fields, status: 'installing', vc_stage_slug: 'installation', install_date: '2026-09-09T14:00:00+07:00' } };
  f.input.records.set(extra.ref, extra); f.input.edges.push({ kind: 'logistics_project', from: f.order.ref, to: extra.ref });
  const output = result(f);
  assert.equal(output.project_plans.length, 2); assert.equal(output.unique_order_count, 1);
  assert.equal(output.state, 'UNKNOWN');
  assert.ok(output.gaps.includes('MULTIPLE_LOGISTICS_PROJECT_LINKS_SOURCE_CONFLICT'));
  assert.deepEqual(output.flags, ['SHIPPING', 'INSTALLING', 'INSTALL_DEADLINE_PAST', 'INCIDENT']);
});

test('J05 executor IDs come only from authorized project fields, never order owner or incident resolver', () => {
  const f = fixture(); let output = result(f);
  assert.equal(output.project_plans[0].fields.logistics_company_id, 'fixture-executor');
  assert.notEqual(output.project_plans[0].fields.logistics_company_id, f.order.company_id);
  assert.equal(output.project_plans[0].fields.logistics_person_id, 'fixture-driver');
  assert.ok(!JSON.stringify(output).includes('fixture-resolver'));
  delete f.project.fields.logistics_company_id; delete f.project.fields.logistics_person_id;
  output = result(f);
  assert.equal(output.project_plans[0].fields.logistics_company_id, undefined);
  assert.equal(output.project_plans[0].fields.logistics_person_id, undefined);
  assert.ok(!JSON.stringify(output).includes('fixture-owner'));
});

test('J05 unknown completion fields and temporary handover do not manufacture delay or activity negatives', () => {
  for (const field of ['status', 'vc_stage_slug', 'vc_temp_staged']) {
    const f = fixture(); delete f.project.fields[field];
    assert.equal(result(f).flag_states.INSTALL_DEADLINE_PAST, 'UNKNOWN');
  }
  const unknownStatus = fixture(); unknownStatus.project.fields.status = null;
  assert.equal(result(unknownStatus).flag_states.INSTALL_DEADLINE_PAST, 'UNKNOWN');
  const f = fixture(); f.project.fields.vc_temp_staged = true;
  assert.equal(result(f).flag_states.SHIPPING, 'UNKNOWN');
  assert.equal(result(f).flag_states.INSTALL_DEADLINE_PAST, 'UNKNOWN');
});

test('J05 pure projection preserves input and exposes only the declared scalar source fields', () => {
  const f = fixture(); const before = JSON.stringify({ order: f.order, records: [...f.input.records], edges: f.input.edges });
  f.project.fields.private_secret_fixture = 'MUST_NOT_APPEAR';
  const output = result(f);
  assert.ok(!JSON.stringify(output).includes('MUST_NOT_APPEAR'));
  delete f.project.fields.private_secret_fixture;
  assert.equal(JSON.stringify({ order: f.order, records: [...f.input.records], edges: f.input.edges }), before);
  assert.ok(LOGISTICS_FIELDS.includes('install_date'));
  assert.ok(!LOGISTICS_FIELDS.includes('production_deadline'));
  assert.throws(() => projectOrderLogistics({ entity: 'project' }, f.input), /AUTHORIZED_ORDER_AND_RECORD_MAP_REQUIRED/);
});

test('J05 entity labels cannot turn an unsupported source into an orders projects or incidents contract', () => {
  const order = fixture(); order.order.source_type = 'unsupported_orders';
  assert.equal(result(order).state, 'UNKNOWN'); assert.deepEqual(result(order).flags, []);
  assert.deepEqual(result(order).planning, {}); assert.equal(result(order).unique_order_count, null);
  const project = fixture(); project.project.source_type = 'unsupported_projects';
  assert.equal(result(project).state, 'UNKNOWN'); assert.deepEqual(result(project).flags, []);
  assert.ok(!result(project).source_refs.includes(project.project.ref));
  const incident = fixture(); incident.incident.source_type = 'unsupported_incidents';
  assert.equal(result(incident).flag_states.INCIDENT, 'UNKNOWN');
  assert.ok(!result(incident).source_refs.includes(incident.incident.ref));
});
