'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, id } = require('./marketingAutomation.trial.fixture');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
function scanned() {
  const f = fixture();
  f.providerReconciliation = { version: 2, companyId: f.companyId, trialId: f.trial.id, status: 'AVAILABLE', complete: true,
    run: { id: id(801), state: 'SCANNED', trialRevision: 1, scopeCurrent: true, tasksPending: 0,
      since: '2026-09-30T17:00:00Z', until: '2026-10-01T17:00:00Z', startedAt: '2026-10-01T18:00:00Z', finishedAt: '2026-10-01T19:00:00Z' },
    forms: [{ pageId: '123', formId: '456', discovered: true, expiredLeads: 0 }], observations: [],
    items: f.sources.map(s => ({ ...s.proof, receiptId: s.receiptId })) };
  return f;
}
function outside(f, stamp = '2026-09-01T00:00:00Z') {
  const row = { id: id(850), state: 'REVIEW', pageId: '123', formId: '456', leadgenId: '850', receivedAt: f.asOf };
  f.receipts.push(row);
  f.providerReconciliation.observations.push({ ...row, acquiredAt: stamp, observedAt: '2026-10-01T18:30:00Z', graphVersion: 'v24.0' });
  return row;
}
test('closed period uses yesterday spend on both accounts, including an account with zero leads', () => {
  const r = reportTrial(scanned());
  assert.equal(r.period.until, '2026-10-01'); assert.equal(r.period.untilExclusive, '2026-10-01T17:00:00.000Z');
  assert.equal(r.spend.spendVnd, 500000); assert.equal(r.spend.sources.length, 2); assert.equal(r.spend.provisionalToday, false);
  assert.equal(r.observed.qualified, 4); assert.equal(r.period.censusAligned, true); assert.equal(r.period.qualificationAsOf, r.asOf);
  assert.equal(r.costPerQualifiedLeadVnd, null); assert.equal(r.allowBudgetExecution, false);
});
test('first trial day has no full-day result and never reports zero cost', () => {
  const f = fixture(); f.asOf = '2026-10-01T16:59:59Z'; const r = reportTrial(f);
  assert.equal(r.period.status, 'NO_CLOSED_DAY'); assert.equal(r.spend.spendVnd, null); assert.equal(r.observed.qualified, 0);
});
test('a first-day recovery scan has an empty measurement interval without failing the dashboard', () => {
  const f = scanned(); f.asOf = '2026-10-01T12:00:00Z';
  Object.assign(f.providerReconciliation.run, { until: '2026-09-30T17:00:00Z', recoveryUntil: '2026-10-01T10:00:00Z', startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T11:00:00Z', measurementPolicy: 'VIETNAM_CLOSED_DAY_V1' });
  f.providerReconciliation.items = [];
  const r = reportTrial(f); assert.equal(r.period.status, 'NO_CLOSED_DAY'); assert.equal(r.spend.spendVnd, null);
  assert.ok(r.reconciliation.issues.some(x => x.code === 'CENSUS_NO_CLOSED_DAY')); assert.equal(r.observed.qualified, 0);
});
test('a new Vietnam day starts at 17 UTC, with an exclusive customer upper boundary', () => {
  const f = fixture(); f.asOf = '2026-10-01T17:00:00Z'; f.runs.forEach(r => r.started_at = f.asOf);
  f.sources[0].acquiredAt = f.sources[0].proof.acquiredAt = f.asOf;
  assert.equal(reportTrial(f).observed.qualified, 3); assert.equal(reportTrial(f).spend.spendVnd, 500000);
});
test('an older aligned census freezes both sides while quality can be verified later', () => {
  const f = scanned(); f.asOf = '2026-10-03T02:00:00Z'; f.runs.forEach(r => r.started_at = f.asOf);
  f.qualities[4].evidence = { ...f.qualities[0].evidence, id: id(910), recordedAt: f.asOf };
  const r = reportTrial(f); assert.equal(r.period.until, '2026-10-01'); assert.equal(r.spend.spendVnd, 500000); assert.equal(r.observed.qualified, 5);
});
test('a legacy partial-day census cannot certify a whole-day match', () => {
  const f = scanned(); f.providerReconciliation.run.until = '2026-10-01T12:00:00Z';
  const r = reportTrial(f); assert.equal(r.period.censusAligned, false); assert.equal(r.reconciliation.matchStatus, 'DISCREPANCIES');
  assert.ok(r.reconciliation.issues.some(x => x.code === 'CENSUS_PERIOD_MISMATCH'));
});
test('fresh-looking spend fetched before the selected close is incomplete', () => {
  const f = fixture(); f.asOf = '2026-10-01T18:00:00Z'; f.runs.forEach(r => r.started_at = '2026-10-01T16:59:59Z');
  assert.equal(reportTrial(f).spend.reason, 'SPEND_BEFORE_PERIOD_CLOSE');
});
test('after the trial ends, both bounds stop at exactly the 30-day window', () => {
  const f = fixture(); f.asOf = '2026-11-05T00:00:00Z';
  const r = reportTrial(f); assert.equal(r.period.until, '2026-10-30'); assert.equal(r.period.untilExclusive, '2026-10-30T17:00:00.000Z');
});
test('a late REVIEW receipt with provider-proved old acquisition is outside, not silently dropped', () => {
  const f = scanned(); outside(f); const r = reportTrial(f);
  assert.equal(r.observed.outsidePeriodForms, 1); assert.equal(r.observed.unprocessedForms, 0);
  assert.equal(r.reconciliation.counts.outsidePeriod, 1); assert.equal(r.reconciliation.counts.unknownAcquiredTime, 0);
  assert.equal(r.reconciliation.matchStatus, 'MATCHED_ENUMERATED'); assert.equal(r.costPerQualifiedLeadVnd, null);
});
test('exactly the closed upper boundary belongs to the next period', () => {
  const f = scanned(); outside(f, '2026-10-01T17:00:00Z'); assert.equal(reportTrial(f).observed.outsidePeriodForms, 1);
});
test('provider evidence inside the period keeps a pending receipt blocking reconciliation', () => {
  const f = scanned(); outside(f, '2026-10-01T08:00:00Z'); const r = reportTrial(f);
  assert.equal(r.observed.unprocessedForms, 1); assert.equal(r.observed.outsidePeriodForms, 0); assert.equal(r.reconciliation.matchStatus, 'DISCREPANCIES');
});
for (const state of ['RUNNING', 'FAILED']) test(state + ' observation cannot dismiss a receipt', () => {
  const f = scanned(); outside(f); Object.assign(f.providerReconciliation.run, { state, tasksPending: 1 });
  const r = reportTrial(f); assert.equal(r.observed.unprocessedForms, 1); assert.equal(r.reconciliation.counts.unknownAcquiredTime, 1);
});
test('scope revocation makes previously proven outside receipts unresolved again', () => {
  const f = scanned(); outside(f); f.providerReconciliation.run.scopeCurrent = false;
  const r = reportTrial(f); assert.equal(r.observed.unprocessedForms, 1); assert.equal(r.reconciliation.status, 'STALE');
});
test('conflicting receipt form and observation cannot be used as an outside-period exception', () => {
  const f = scanned(); outside(f).formId = '789'; assert.equal(reportTrial(f).observed.unprocessedForms, 1);
});
test('conflicting existing source proof cannot be hidden by old provider timestamp', () => {
  const f = scanned(), row = outside(f); f.sources.push({ ...f.sources[0], id: id(851), receiptId: row.id });
  assert.equal(reportTrial(f).observed.unprocessedForms, 1); assert.equal(reportTrial(f).reconciliation.counts.proofConflict, 1);
});
test('a REVIEW receipt with matching source and observation remains review-required, not a fabricated proof conflict', () => {
  const f = scanned(), source = f.sources[0]; f.receipts[0].state = 'REVIEW';
  f.providerReconciliation.observations.push({ ...source.proof, observedAt: '2026-10-01T18:30:00Z', graphVersion: 'v24.0' });
  const r = reportTrial(f); assert.equal(r.observed.unprocessedForms, 1); assert.equal(r.reconciliation.counts.reviewRequired, 1); assert.equal(r.reconciliation.counts.proofConflict, 0);
});
test('a DONE receipt with two different out-of-period acquisition proofs stays a visible conflict', () => {
  const f = scanned(), source = f.sources[0];
  source.acquiredAt = source.proof.acquiredAt = '2026-09-01T00:00:00Z';
  f.providerReconciliation.items.shift();
  f.providerReconciliation.observations.push({ ...source.proof, acquiredAt: '2026-09-02T00:00:00Z', observedAt: '2026-10-01T18:30:00Z', graphVersion: 'v24.0' });
  const r = reportTrial(f); assert.equal(r.observed.unprocessedForms, 1); assert.equal(r.observed.outsidePeriodForms, 0);
  assert.equal(r.reconciliation.matchStatus, 'DISCREPANCIES'); assert.equal(r.reconciliation.counts.proofConflict, 1);
  assert.ok(r.issues.some(x => x.code === 'RECEIPT_ACQUISITION_CONFLICT'));
});
test('delivery date alone never dismisses a pending receipt', () => {
  const f = scanned(), row = outside(f); row.receivedAt = '2020-01-01T00:00:00Z'; f.providerReconciliation.observations = [];
  assert.equal(reportTrial(f).observed.unprocessedForms, 1);
});
for (const mutate of [o => o.acquiredAt = '2099-01-01T00:00:00Z', o => o.observedAt = '2026-10-01T16:00:00Z', o => o.graphVersion = 'fake', o => o.formId = '999']) {
  test('invalid acquisition evidence fails closed: ' + mutate, () => {
    const f = scanned(); outside(f); mutate(f.providerReconciliation.observations[0]); assert.throws(() => reportTrial(f), /RECONCILIATION_UNAVAILABLE/);
  });
}
test('duplicated observations are rejected even for a failed scan', () => {
  const f = scanned(); outside(f); f.providerReconciliation.run.state = 'FAILED'; f.providerReconciliation.observations.push(f.providerReconciliation.observations[0]);
  assert.throws(() => reportTrial(f), /RECONCILIATION_UNAVAILABLE/);
});
test('public report includes period and counts without exposing observation IDs or tokens', () => {
  const f = scanned(); outside(f); const text = JSON.stringify(reportTrial(f));
  assert.ok(text.includes('VIETNAM_CLOSED_DAY_V1')); assert.ok(!text.includes('"observations"')); assert.ok(!text.includes('"graphVersion"'));
});
