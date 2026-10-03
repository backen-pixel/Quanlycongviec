'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, id } = require('./marketingAutomation.trial.fixture');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
function sample() {
  const f = fixture();
  f.runs.forEach(r => r.snapshot.days[0].amountVnd = 500000);
  f.providerReconciliation = { version: 2, companyId: f.companyId, trialId: f.trial.id, status: 'AVAILABLE', complete: true,
    run: { id: id(801), state: 'SCANNED', trialRevision: 1, scopeCurrent: true, tasksPending: 0,
      since: '2026-09-30T17:00:00Z', until: '2026-10-01T17:00:00Z', recoveryUntil: '2026-10-01T18:00:00Z',
      startedAt: '2026-10-01T18:00:00Z', finishedAt: '2026-10-01T19:00:00Z', measurementPolicy: 'VIETNAM_CLOSED_DAY_V1' },
    forms: [{ pageId: '123', formId: '456', discovered: true, expiredLeads: 0 }], observations: [],
    items: f.sources.map(s => ({ ...s.proof, receiptId: s.receiptId })) };
  return f;
}
function noAttainment(r) {
  assert.equal(r.costPerQualifiedLeadVnd, null); assert.equal(r.targetMetToDate, false);
  assert.equal(r.allowBudgetExecution, false); assert.equal(r.measurementStatus, 'INCOMPLETE');
  assert.equal(r.observedMeasurement.targetStatus, 'NOT_EVALUATED'); assert.equal(r.observedMeasurement.allowBudgetExecution, false);
}
test('one million / four reconciled qualified customers = provisional 250k, including the zero-lead account', () => {
  const r = reportTrial(sample()), x = r.observedMeasurement;
  assert.equal(x.status, 'AVAILABLE_PROVISIONAL'); assert.equal(x.spendVnd, 1000000); assert.equal(x.qualifiedLeads, 4);
  assert.equal(x.costPerQualifiedLeadVnd, 250000); assert.equal(x.pendingQualification, 1);
  assert.equal(r.spend.sources.length, 2); assert.equal(x.evidence.spendRunIds.length, 2);
  assert.equal(x.evidence.censusRunId, id(801)); assert.equal(x.untilExclusive, r.period.untilExclusive); noAttainment(r);
});
test('genuine zero account spend is distinct from missing spend and never certifies the target', () => {
  const f = sample(); f.runs.forEach(r => r.snapshot.days[0].amountVnd = 0); const r = reportTrial(f);
  assert.equal(r.observedMeasurement.costPerQualifiedLeadVnd, 0); assert.equal(r.observedMeasurement.status, 'AVAILABLE_PROVISIONAL'); noAttainment(r);
});
test('no qualified customers preserves known spend, with an undefined quotient instead of zero', () => {
  const f = sample(); f.qualities.forEach(q => { if (q.evidence) q.evidence.status = 'REJECTED'; });
  const x = reportTrial(f).observedMeasurement;
  assert.equal(x.status, 'NO_QUALIFIED_LEADS'); assert.equal(x.spendVnd, 1000000); assert.equal(x.qualifiedLeads, 0); assert.equal(x.costPerQualifiedLeadVnd, null);
});
test('a verified duplicate pair contributes exactly once', () => {
  const f = sample(), a = f.identity.members[0], b = f.identity.members[1];
  f.identity.edges.push({ leftLeadId: a.leadId, rightLeadId: b.leadId, active: true, revision: 1,
    leftContext: a.contextVersion, rightContext: b.contextVersion, evidenceId: id(901) });
  const x = reportTrial(f).observedMeasurement; assert.equal(x.qualifiedLeads, 3); assert.equal(x.costPerQualifiedLeadVnd, 1000000 / 3);
});
test('existing customers do not inflate the acquisition denominator', () => {
  const f = sample(); f.qualities[0].firstKnownAt = '2026-01-01T00:00:00Z'; const r = reportTrial(f);
  assert.equal(r.observed.existing, 1); assert.equal(r.observedMeasurement.qualifiedLeads, 3);
});
test('current qualification revocation removes that customer from the denominator', () => {
  const f = sample(); f.qualities[0].routingReady = false;
  const x = reportTrial(f).observedMeasurement; assert.equal(x.qualifiedLeads, 3); assert.equal(x.pendingQualification, 2);
});
test('late qualification may increase the denominator without rewriting acquisition dates', () => {
  const f = sample(); f.qualities[4].evidence = { ...f.qualities[0].evidence, id: id(902), recordedAt: f.asOf };
  const x = reportTrial(f).observedMeasurement; assert.equal(x.qualifiedLeads, 5); assert.equal(x.costPerQualifiedLeadVnd, 200000); assert.equal(x.pendingQualification, 0);
});
for (const [label, change] of [
  ['undiscovered historical form', f => f.providerReconciliation.forms[0].discovered = false],
  ['old expired leads', f => f.providerReconciliation.forms[0].expiredLeads = 100],
  ['unknown retention', f => f.providerReconciliation.forms[0].expiredLeads = null],
]) test(label + ' remains a coverage gap without erasing the observed quotient', () => {
  const f = sample(); change(f); const r = reportTrial(f);
  assert.equal(r.reconciliation.matchStatus, 'DISCREPANCIES'); assert.equal(r.reconciliation.recordMatchStatus, 'MATCHED_OBSERVED');
  assert.equal(r.reconciliation.coverageIssues.length, 1); assert.equal(r.observedMeasurement.costPerQualifiedLeadVnd, 250000); noAttainment(r);
});
for (const [label, change] of [
  ['missing census', f => delete f.providerReconciliation],
  ['running census', f => { f.providerReconciliation.run.state = 'RUNNING'; f.providerReconciliation.run.tasksPending = 1; }],
  ['failed census', f => { f.providerReconciliation.run.state = 'FAILED'; f.providerReconciliation.run.tasksPending = 1; }],
  ['scope change', f => f.providerReconciliation.run.scopeCurrent = false],
  ['missing known ID', f => f.providerReconciliation.items.pop()],
  ['receipt pending', f => f.receipts[0].state = 'PENDING'],
  ['unknown paid source', f => { f.sources[0].source = 'UNKNOWN'; f.sources[0].proof.source = 'UNKNOWN'; }],
  ['duplicate unresolved', f => f.identity.members[1].contacts = { ...f.identity.members[0].contacts }],
  ['missing account spend', f => f.runs.pop()],
  ['account disabled', f => f.accounts[1].bat = false],
  ['account permission expired', f => f.accounts[1].token_het_han = '2026-10-01T00:00:00Z'],
  ['extra account', f => f.accounts.push({ ...f.accounts[0], ad_account_id: 'act_3' })],
  ['spend stale', f => f.runs[0].started_at = '2026-10-01T17:00:00Z'],
]) test(label + ' hides the provisional amount', () => {
  const f = sample(); change(f); const r = reportTrial(f), x = r.observedMeasurement;
  assert.equal(x.status, 'UNAVAILABLE'); assert.equal(x.costPerQualifiedLeadVnd, null); assert.equal(x.spendVnd, null); assert.ok(x.reasons.length); noAttainment(r);
});
test('six-hour census freshness boundary is explicit', () => {
  const f = sample(); f.asOf = '2026-10-02T01:00:00Z'; f.runs.forEach(r => r.started_at = f.asOf);
  assert.equal(reportTrial(f).observedMeasurement.status, 'AVAILABLE_PROVISIONAL');
  f.asOf = '2026-10-02T01:00:00.001Z'; f.runs.forEach(r => r.started_at = f.asOf);
  assert.ok(reportTrial(f).observedMeasurement.reasons.includes('CENSUS_STALE'));
});
test('a contradictory provider timestamp cannot remain a qualified customer in the displayed count', () => {
  const f = sample(), s = f.sources[0]; f.providerReconciliation.observations.push({ ...s.proof, acquiredAt: '2026-09-01T00:00:00Z', observedAt: f.asOf, graphVersion: 'v24.0' });
  const r = reportTrial(f); assert.equal(r.observed.qualified, 3); assert.equal(r.observed.unresolved, 1); assert.equal(r.observedMeasurement.status, 'UNAVAILABLE');
});
test('late receipt with unknown acquisition invalidates the current quotient; delivery time is not proof', () => {
  const f = sample(); f.receipts.push({ id: id(903), pageId: '123', formId: '456', leadgenId: '903', state: 'REVIEW', receivedAt: f.asOf });
  assert.equal(reportTrial(f).observedMeasurement.status, 'UNAVAILABLE');
  f.providerReconciliation.observations.push({ pageId: '123', formId: '456', leadgenId: '903', acquiredAt: '2026-10-01T17:00:00Z', observedAt: f.asOf, graphVersion: 'v24.0' });
  const r = reportTrial(f); assert.equal(r.observed.outsidePeriodForms, 1); assert.equal(r.observedMeasurement.status, 'AVAILABLE_PROVISIONAL');
});
test('midnight selects only closed-day spend; first day has no misleading amount', () => {
  const f = sample(); f.asOf = '2026-10-01T16:00:00Z'; delete f.providerReconciliation;
  const x = reportTrial(f).observedMeasurement; assert.equal(x.status, 'UNAVAILABLE'); assert.ok(x.reasons.includes('NO_CLOSED_DAY'));
});
test('forged completeness or client-derived numbers cannot authorize a target result', () => {
  const f = sample(); f.observedMeasurement = { status: 'AVAILABLE', costPerQualifiedLeadVnd: 1, targetStatus: 'MET' };
  f.providerReconciliation.coverage = 'COMPLETE'; f.providerReconciliation.cpqlReady = true;
  const r = reportTrial(f); assert.equal(r.observedMeasurement.costPerQualifiedLeadVnd, 250000); noAttainment(r);
  const output = JSON.stringify(r.observedMeasurement); for (const field of ['phone', 'pageToken', 'leadgenId', 'proof']) assert.ok(!output.includes('"' + field + '"'));
});
test('UI preserves the exact provisional scope and rejects contradictory arithmetic, period or target claims', async () => {
  const { observedCpqlResult } = await import('../../frontend/src/components/marketing/observedCpqlState.mjs');
  const r = reportTrial(sample()); assert.equal(observedCpqlResult(r), r.observedMeasurement);
  for (const change of [
    x => x.observedMeasurement.costPerQualifiedLeadVnd = 1,
    x => x.observedMeasurement.qualifiedLeads = 5,
    x => x.observedMeasurement.untilExclusive = '2026-10-02T17:00:00Z',
    x => x.observedMeasurement.targetStatus = 'MET',
    x => x.observedMeasurement.spendScope = 'LEAD_ADS_ONLY',
    x => x.observedMeasurement.status = 'COMPLETE',
    x => x.allowBudgetExecution = true,
    x => x.costPerQualifiedLeadVnd = 250000,
  ]) { const altered = structuredClone(r); change(altered); assert.throws(() => observedCpqlResult(altered)); }
});
test('UI handles zero denominator, unknown and old-server absence without fabricating zero CPQL', async () => {
  const { observedCpqlResult } = await import('../../frontend/src/components/marketing/observedCpqlState.mjs');
  const f = sample(); f.qualities.forEach(q => q.evidence = null); const r = reportTrial(f);
  assert.equal(observedCpqlResult(r).status, 'NO_QUALIFIED_LEADS');
  r.observedMeasurement.costPerQualifiedLeadVnd = 0; assert.throws(() => observedCpqlResult(r));
  delete f.providerReconciliation; assert.equal(observedCpqlResult(reportTrial(f)).status, 'UNAVAILABLE');
  delete r.observedMeasurement; assert.equal(observedCpqlResult(r), null);
});
module.exports = { sample };
