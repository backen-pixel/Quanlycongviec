'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { VERSION, assessMarketingEvidence: assess, scopedEventKey } = require('../src/helpers/marketingEvidenceContract');

const context = { tenantId: 'tenant-test', companyId: 'company-test' };
const policy = { now: '2026-10-01T06:00:00Z', maxAgeMs: { source: 60000, crm: 60000, attribution: 60000 } };
const observation = () => ({ ...context, status: 'ok', checkedAt: '2026-10-01T05:59:30Z' });
function fixture() {
  return {
    source: { ...observation(), system: 'meta', metric: 'conversations', count: 2,
      periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-10-01T05:59:00Z' },
    crm: { ...observation(), leadExists: true, leadId: 'lead-test', accepted: true,
      acceptanceRuleRef: 'backend-rule-test-v1', owner: { ...context, id: 'owner-test', active: true } },
    attribution: { ...observation(), method: 'platform_receipt', verified: true,
      eventId: 'event-test', receiptRef: 'receipt-test', leadId: 'lead-test', sourceSystem: 'meta' },
  };
}
function run(change = () => {}) { const row = fixture(); change(row); return assess(context, row, policy); }
function includesReason(result, code) { assert.ok(result.reasonCodes.includes(code), JSON.stringify(result.reasonCodes)); }

// All identities and rules are synthetic. These tests never import server.js or application .env.
test('complete trusted observations link a receipt; no write authorization is provided', () => {
  const r = run();
  assert.equal(r.contractVersion, VERSION); assert.equal(r.scopeState, 'MATCHED');
  assert.equal(r.source.count, 2); assert.equal(r.crm.state, 'ACCEPTED');
  assert.equal(r.attribution.state, 'LINKED'); assert.match(r.attribution.eventKey, /^[0-9a-f]{64}$/);
  assert.equal(r.writeAuthorization, 'NOT_PROVIDED'); assert.deepEqual(r.reasonCodes, []);
});

for (const bad of [undefined, null, [], {}, { tenantId: 'tenant-test' }, { ...context, companyId: '' }]) {
  test(`missing or invalid trusted context fails closed: ${JSON.stringify(bad)}`, () => {
    const r = assess(bad, fixture(), policy); assert.equal(r.scopeState, 'BLOCKED');
    assert.equal(r.source.count, null); includesReason(r, 'TRUSTED_SCOPE_REQUIRED');
  });
}
for (const section of ['source', 'crm', 'attribution']) {
  for (const field of ['tenantId', 'companyId']) {
    test(`reject ${section}.${field} mismatch before copying any evidence`, () => {
      const r = run((x) => { x[section][field] = 'wrong-scope'; });
      assert.equal(r.scopeState, 'BLOCKED'); assert.equal(r.source.count, null);
      assert.equal(r.crm.checkedAt, null); assert.equal(r.attribution.eventKey, null);
      includesReason(r, 'EVIDENCE_SCOPE_MISMATCH');
    });
  }
  test(`missing ${section} stays unknown`, () => {
    const r = run((x) => { delete x[section]; }); assert.equal(r[section].state, 'UNKNOWN');
    includesReason(r, `${section.toUpperCase()}_MISSING`);
  });
  test(`unavailable ${section} stays unknown and never promotes receipt`, () => {
    const r = run((x) => { x[section].status = 'error'; });
    assert.equal(r[section].state, 'UNKNOWN'); assert.notEqual(r.attribution.state, 'LINKED');
    includesReason(r, `${section.toUpperCase()}_UNAVAILABLE`);
  });
  test(`stale ${section} preserves source timestamp, not refresh time`, () => {
    const r = run((x) => { x[section].checkedAt = '2026-10-01T05:58:59Z'; });
    assert.equal(r[section].state, 'UNKNOWN'); assert.equal(r[section].checkedAt, '2026-10-01T05:58:59.000Z');
    assert.notEqual(r.attribution.state, 'LINKED'); includesReason(r, `${section.toUpperCase()}_STALE`);
  });
  test(`future ${section} fails closed`, () => {
    const r = run((x) => { x[section].checkedAt = '2026-10-01T06:00:01Z'; });
    assert.equal(r[section].state, 'UNKNOWN'); includesReason(r, `${section.toUpperCase()}_FUTURE_TIMESTAMP`);
  });
}

test('scope on recipient must match too', () => {
  const r = run((x) => { x.crm.owner.companyId = 'another-company'; });
  assert.equal(r.scopeState, 'BLOCKED'); includesReason(r, 'RECIPIENT_SCOPE_MISMATCH');
});
test('fresh explicit zero remains zero, without claiming any accepted lead count', () => {
  const r = run((x) => { x.source.count = 0; }); assert.equal(r.source.count, 0);
  assert.equal(r.source.metric, 'conversations'); assert.equal('acceptedLeadCount' in r, false);
});
for (const count of [null, undefined, '0', true, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid source count ${String(count)} cannot become zero`, () => {
    const r = run((x) => { x.source.count = count; });
    assert.equal(r.source.count, null); includesReason(r, 'SOURCE_METRIC_INVALID');
  });
}
for (const value of ['2026-10-01', '2026-02-30T05:59:30Z', '2026-10-01T05:59:30', 'yesterday']) {
  test(`reject non-canonical or rollover timestamp ${value}`, () => {
    const r = run((x) => { x.crm.checkedAt = value; }); includesReason(r, 'CRM_INVALID_TIMESTAMP');
  });
}
test('freshness threshold equality passes', () => {
  const r = run((x) => { x.crm.checkedAt = '2026-10-01T05:59:00Z'; }); assert.equal(r.crm.state, 'ACCEPTED');
});
test('timestamps for separate sources are not overwritten to one time', () => {
  const r = run((x) => { x.crm.checkedAt = '2026-10-01T05:59:10Z'; });
  assert.notEqual(r.source.checkedAt, r.crm.checkedAt);
});
for (const badPolicy of [null, {}, { now: policy.now, maxAgeMs: {} },
  { ...policy, maxAgeMs: { ...policy.maxAgeMs, crm: 0 } },
  { ...policy, maxAgeMs: { ...policy.maxAgeMs, crm: '60000' } },
  { ...policy, now: 'not-a-time' }]) {
  test(`explicit deterministic policy required ${JSON.stringify(badPolicy)}`, () => {
    const r = assess(context, fixture(), badPolicy); includesReason(r, 'EXPLICIT_FRESHNESS_POLICY_REQUIRED');
  });
}
for (const mutate of [x => { delete x.source.periodStart; },
  x => { x.source.periodEnd = x.source.periodStart; },
  x => { x.source.periodEnd = '2026-10-01T06:00:00Z'; }]) {
  test('invalid/missing reporting window suppresses the count', () => {
    const r = run(mutate); assert.equal(r.source.count, null); includesReason(r, 'SOURCE_PERIOD_INVALID');
  });
}
test('conversations cannot be renamed to accepted CRM leads', () => {
  const r = run(x => { x.source.metric = 'accepted_crm_leads'; }); includesReason(r, 'SOURCE_METRIC_INVALID');
});
test('missing owner', () => { const r = run(x => { delete x.crm.owner; }); includesReason(r, 'RECIPIENT_MISSING'); });
test('inactive owner', () => { const r = run(x => { x.crm.owner.active = false; }); includesReason(r, 'RECIPIENT_INACTIVE'); });
test('string true is not active', () => { const r = run(x => { x.crm.owner.active = 'true'; }); includesReason(r, 'RECIPIENT_ACTIVITY_UNKNOWN'); });
test('absent lead is not an accepted lead', () => {
  const r = run(x => { x.crm.leadExists = false; }); assert.equal(r.crm.state, 'NOT_ACCEPTED');
});
test('missing lead identity remains unknown', () => {
  const r = run(x => { delete x.crm.leadId; }); assert.equal(r.crm.state, 'UNKNOWN'); includesReason(r, 'CRM_LEAD_IDENTITY_REQUIRED');
});
test('acceptance without backend rule reference is unconfirmed', () => {
  const r = run(x => { delete x.crm.acceptanceRuleRef; }); includesReason(r, 'CRM_ACCEPTANCE_UNCONFIRMED');
});
test('backend rejection is not overridden', () => {
  const r = run(x => { x.crm.accepted = false; }); assert.equal(r.crm.state, 'NOT_ACCEPTED');
  assert.notEqual(r.attribution.state, 'LINKED');
});
test('utm claimed verified still cannot be promoted to paid-click proof', () => {
  const r = run(x => { x.attribution.method = 'utm'; });
  assert.equal(r.attribution.state, 'CLASSIFIED_ONLY'); assert.equal(r.attribution.eventKey, null);
});
test('receipt without verification stays unknown', () => {
  const r = run(x => { x.attribution.verified = false; }); includesReason(r, 'ATTRIBUTION_RECEIPT_UNVERIFIED');
});
test('receipt for a different source cannot link', () => {
  const r = run(x => { x.attribution.sourceSystem = 'google'; }); includesReason(r, 'ATTRIBUTION_SOURCE_MISMATCH');
});
test('receipt for a different lead cannot link', () => {
  const r = run(x => { x.attribution.leadId = 'other-lead'; }); includesReason(r, 'ATTRIBUTION_CRM_LINK_UNCONFIRMED');
});
test('receipt reference is required', () => {
  const r = run(x => { delete x.attribution.receiptRef; }); includesReason(r, 'ATTRIBUTION_IDENTITY_REQUIRED');
});
test('empty evidence object stays unknown, not zero or E2E success', () => {
  const r = assess(context, {}, policy); assert.equal(r.source.count, null); assert.equal(r.crm.state, 'UNKNOWN');
});
test('non-object evidence fails closed', () => {
  for (const e of [null, [], 'raw-body']) includesReason(assess(context, e, policy), 'EVIDENCE_OBJECT_REQUIRED');
});
test('unknown source system is not accepted', () => {
  includesReason(run(x => { x.source.system = 'unknown'; }), 'SOURCE_METRIC_INVALID');
});
test('extra sensitive values and free-text errors never enter output', () => {
  const r = run(x => {
    x.phone = 'SYNTHETIC_PRIVATE_MARKER'; x.crm.name = 'SYNTHETIC_PRIVATE_MARKER';
    x.source.error = 'SYNTHETIC_PRIVATE_MARKER'; x.attribution.rawBody = 'SYNTHETIC_PRIVATE_MARKER';
  });
  assert.equal(JSON.stringify(r).includes('SYNTHETIC_PRIVATE_MARKER'), false);
  assert.deepEqual(Object.keys(r).sort(), ['attribution', 'contractVersion', 'crm', 'reasonCodes', 'scopeState', 'source', 'writeAuthorization']);
});
test('no mutations of evidence, context or policy', () => {
  const freeze = x => { Object.freeze(x); for (const v of Object.values(x)) if (v && typeof v === 'object') freeze(v); return x; };
  const e = freeze(fixture()); const c = freeze({ ...context });
  const p = freeze({ ...policy, maxAgeMs: { ...policy.maxAgeMs } });
  const before = JSON.stringify([c, e, p]); assess(c, e, p); assert.equal(JSON.stringify([c, e, p]), before);
});
test('event key deterministic across repeated observations', () => {
  assert.equal(scopedEventKey(context, 'meta', 'e-test'), scopedEventKey(context, 'meta', 'e-test'));
});
test('event keys separate tenant, company, channel and event', () => {
  const keys = [scopedEventKey(context, 'meta', 'e-test'),
    scopedEventKey({ ...context, tenantId: 'other' }, 'meta', 'e-test'),
    scopedEventKey({ ...context, companyId: 'other' }, 'meta', 'e-test'),
    scopedEventKey(context, 'google', 'e-test'), scopedEventKey(context, 'meta', 'other')];
  assert.equal(new Set(keys).size, 5);
});
test('invalid event identity returns no key', () => {
  assert.equal(scopedEventKey(context, 'meta', 'raw message text'), null);
  assert.equal(scopedEventKey(context, 'meta', ''), null); assert.equal(scopedEventKey({}, 'meta', 'e-test'), null);
});
test('module import requires only built-in crypto; no process, environment, timer or I/O', () => {
  const file = path.join(__dirname, '../src/helpers/marketingEvidenceContract.js');
  const calls = []; const sandbox = { module: { exports: {} }, require(name) {
    calls.push(name); assert.equal(name, 'node:crypto'); return crypto;
  } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { timeout: 1000 });
  assert.deepEqual(calls, ['node:crypto']); assert.equal(typeof sandbox.module.exports.assessMarketingEvidence, 'function');
});
