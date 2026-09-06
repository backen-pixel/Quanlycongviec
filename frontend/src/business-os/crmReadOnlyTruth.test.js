import assert from 'node:assert/strict';
import test from 'node:test';
import { presentCrmPostDerivedMetric } from './crmReadOnlyTruth.js';

test('Founder-local labels a loaded-subset metric as a lower bound', () => {
  assert.deepEqual(
    presentCrmPostDerivedMetric({
      founderLocal: true,
      exactValue: null,
      partialValue: 7,
      partialEvidenceCount: 12,
    }),
    {
      displayValue: '≥ 7',
      founderFallback: true,
      hasEvidence: true,
      incomplete: true,
      value: 7,
    },
  );
});

test('Founder-local does not turn a failed total into an exact zero', () => {
  const withLoadedEvidence = presentCrmPostDerivedMetric({
    founderLocal: true,
    exactValue: null,
    partialValue: 0,
    partialEvidenceCount: 4,
  });
  const withoutLoadedEvidence = presentCrmPostDerivedMetric({
    founderLocal: true,
    exactValue: null,
    partialValue: 0,
    partialEvidenceCount: 0,
  });

  assert.equal(withLoadedEvidence.displayValue, '≥ 0');
  assert.equal(withLoadedEvidence.incomplete, true);
  assert.equal(withoutLoadedEvidence.displayValue, '—');
  assert.equal(withoutLoadedEvidence.hasEvidence, false);
});

test('an attested exact total remains exact and standard runtime is unchanged', () => {
  assert.equal(presentCrmPostDerivedMetric({
    founderLocal: true,
    exactValue: 0,
    partialValue: 8,
    partialEvidenceCount: 8,
  }).displayValue, '0');

  assert.equal(presentCrmPostDerivedMetric({
    founderLocal: false,
    exactValue: null,
    partialValue: 0,
    partialEvidenceCount: 0,
  }).displayValue, '0');
});

test('server-declared partial totals remain visibly incomplete', () => {
  const result = presentCrmPostDerivedMetric({
    exactValue: 20_000,
    partialValue: 4,
    partialEvidenceCount: 4,
    serverIncomplete: true,
    formatValue: (value) => `${value} pts`,
  });

  assert.equal(result.displayValue, '≥ 20000 pts');
  assert.equal(result.incomplete, true);
  assert.equal(result.founderFallback, false);
});
