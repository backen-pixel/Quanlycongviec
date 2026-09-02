'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  createAgentRegistry, calculatePackageSha256, STATUSES, ACTOR_ROLES,
} = require('../reg4/agent-registry');
const {
  createModelGatewayProof, calculatePayloadSha256, BASELINES, POLICY,
  DECISIONS, REASON_CODES,
} = require('./model-gateway-proof');

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);

function clock() {
  let tick = 0;
  return () => `2026-09-02T00:00:${String(tick++).padStart(2, '0')}.000Z`;
}

function approvedRegistry() {
  const registry = createAgentRegistry({ now: clock() });
  const content = {
    agent_id: 'mg5.gateway.agent', name: 'MG5 Synthetic Gateway Agent', version: '1.0.0',
    created_by: 'builder.author', permissions: ['model.request'], required_tools: [],
    prohibited_actions: ['business.write'], evidence_references: [
      { evidence_id: 'builder-tests', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: H1 },
      { evidence_id: 'builder-review', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: H2 },
    ],
  };
  const packageSha = calculatePackageSha256(content);
  registry.registerAgentPackage({ ...content, package_sha256: packageSha }, {
    actor_id: content.created_by, role: ACTOR_ROLES.AUTHOR,
  });
  registry.transitionApproval({ agent_id: content.agent_id, version: content.version,
    to_status: STATUSES.IN_REVIEW }, { actor_id: 'builder.reviewer', role: ACTOR_ROLES.REVIEWER });
  registry.transitionApproval({ agent_id: content.agent_id, version: content.version,
    to_status: STATUSES.APPROVED }, { actor_id: 'builder.approver', role: ACTOR_ROLES.APPROVER });
  return { registry, content, packageSha };
}

function output(content = 'bounded proof answer') {
  return { schema_version: 'mg5-output/v1', content, confidence: 91 };
}

function makeHarness(overrides = {}) {
  const reg = approvedRegistry();
  const state = {
    authority: { requester_id: 'user.one', active: true, company_id: 'company.one',
      role: 'operator', permissions: ['model.request'], agent_id: reg.content.agent_id,
      agent_version: reg.content.version, package_sha256: reg.packageSha },
    company: { company_id: 'company.one', active: true, context_version: 'context.v1' },
    policy: { company_id: 'company.one', policy_version: 'policy.v1',
      allowed_use_cases: ['summary'], allowed_data_classes: ['D0', 'D1', 'D2', 'D3'],
      allowed_models: ['fake.alpha@1.0.0', 'fake.beta@1.0.0'], d3_mode: 'ALLOW' },
    catalog: { catalog_version: 'catalog.v1', models: [
      { model_id: 'fake.alpha', version: '1.0.0', adapter_id: 'primary',
        provider: 'provider-a', region: 'vn', safety_class: 'proof-safe',
        data_classes: ['D0', 'D1', 'D2', 'D3'], status: 'APPROVED', quality_score: 90,
        cost_units: 2, latency_units: 20 },
      { model_id: 'fake.beta', version: '1.0.0', adapter_id: 'fallback',
        provider: 'provider-a', region: 'vn', safety_class: 'proof-safe',
        data_classes: ['D0', 'D1', 'D2', 'D3'], status: 'APPROVED', quality_score: 85,
        cost_units: 3, latency_units: 25 },
    ] },
    budget: { company_id: 'company.one', budget_version: 'budget.v1',
      limit_units: 100, preexisting_spent_units: 0 },
  };
  if (overrides.state) overrides.state(state, reg);
  const metrics = { primary: 0, fallback: 0, validator: 0 };
  const primaryQueue = [...(overrides.primaryOutcomes || [])];
  const fallbackQueue = [...(overrides.fallbackOutcomes || [])];
  const adapters = overrides.adapters || {
    primary: (input) => { metrics.primary += 1; metrics.lastInput = input;
      return primaryQueue.shift() || { outcome: 'SUCCESS', output: output() }; },
    fallback: (input) => { metrics.fallback += 1; metrics.lastInput = input;
      return fallbackQueue.shift() || { outcome: 'SUCCESS', output: output('fallback answer') }; },
  };
  const resolvers = overrides.resolvers || {
    getAuthority: () => state.authority,
    getCompanyContext: () => state.company,
    getPolicy: () => state.policy,
    getCatalog: () => state.catalog,
    getBudget: () => state.budget,
  };
  const registry = overrides.registryFactory ? overrides.registryFactory(reg) : (overrides.registry || reg.registry);
  const options = { registry, resolvers, adapters,
    now: overrides.now || (() => '2026-09-02T01:00:00.000Z') };
  if (overrides.beforeFinalRevalidation) options.beforeFinalRevalidation = overrides.beforeFinalRevalidation;
  if (overrides.audit) options.audit = overrides.audit;
  if (overrides.validator) options.validator = overrides.validator;
  const gateway = createModelGatewayProof(options);
  function request(changes = {}) {
    const base = {
      request_id: 'request.one', idempotency_key: 'idem.one', agent_id: reg.content.agent_id,
      agent_version: reg.content.version, package_sha256: reg.packageSha,
      reg4_baseline_commit: BASELINES.reg4.commit, reg4_baseline_tree: BASELINES.reg4.tree,
      bos_ai1_baseline_commit: BASELINES.bos_ai1.commit,
      bos_ai1_baseline_tree: BASELINES.bos_ai1.tree, requester_id: 'user.one',
      company_id: 'company.one', use_case: 'summary', data_class: 'D1',
      payload: { prompt: 'summarize public facts' },
    };
    Object.assign(base, changes);
    if (!Object.hasOwn(changes, 'payload_sha256')) base.payload_sha256 = calculatePayloadSha256(base.payload);
    return base;
  }
  return { ...reg, state, metrics, gateway, request };
}

function expectReason(response, decision, reason) {
  assert.equal(response.decision, decision);
  assert.equal(response.reason_code, reason);
  if (decision !== DECISIONS.ALLOW) assert.equal(response.result, null);
}

test('P01 exact baselines, real REG4 approval, fingerprint, evidence and authority gate', () => {
  const h = makeHarness();
  expectReason(h.gateway.invoke(h.request()), DECISIONS.ALLOW, REASON_CODES.OK);
  const bad = h.request({ package_sha256: 'f'.repeat(64), idempotency_key: 'idem.bad' });
  h.state.authority.package_sha256 = bad.package_sha256;
  expectReason(h.gateway.invoke(bad), DECISIONS.DENY, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
  const blocked = makeHarness({ registryFactory: (reg) => ({
    getAgentPackage: () => ({ ...reg.registry.getAgentPackage(reg.content.agent_id, reg.content.version),
      approval_status: 'BLOCKED' }),
  }) });
  expectReason(blocked.gateway.invoke(blocked.request()), DECISIONS.DENY, REASON_CODES.AGENT_BLOCKED);
  const missing = makeHarness({ registryFactory: (reg) => {
    const record = reg.registry.getAgentPackage(reg.content.agent_id, reg.content.version);
    record.evidence_references = [];
    record.package_sha256 = calculatePackageSha256({ agent_id: record.agent_id, name: record.name,
      version: record.version, created_by: record.created_by, permissions: record.permissions,
      required_tools: record.required_tools, prohibited_actions: record.prohibited_actions,
      evidence_references: record.evidence_references });
    reg.packageSha = record.package_sha256;
    return { getAgentPackage: () => record };
  }, state: (s, reg) => { s.authority.package_sha256 = reg.packageSha; } });
  expectReason(missing.gateway.invoke(missing.request({ package_sha256: missing.packageSha })),
    DECISIONS.DENY, REASON_CODES.REQUIRED_EVIDENCE_MISSING);
});

test('P02 only exact APPROVED fake catalog model versions are eligible', () => {
  const h = makeHarness({ state: (s) => { s.catalog.models.forEach((m) => { m.status = 'BLOCKED'; }); } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.CATALOG_DENIED);
  assert.equal(h.metrics.primary + h.metrics.fallback, 0);
});

test('P03 deterministic selection and caller routing fields are forbidden', () => {
  const h = makeHarness();
  const allowed = h.gateway.invoke(h.request());
  assert.equal(allowed.result.selected_model.model_id, 'fake.alpha');
  expectReason(h.gateway.invoke({ ...h.request({ idempotency_key: 'idem.route' }), provider: 'evil' }),
    DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
});

test('P03-R policy allowlist ordinal precedes model quality cost latency and ASCII', () => {
  const h = makeHarness({ state: (s) => {
    s.policy.allowed_models = ['fake.beta@1.0.0', 'fake.alpha@1.0.0'];
  } });
  const response = h.gateway.invoke(h.request());
  expectReason(response, DECISIONS.ALLOW, REASON_CODES.OK);
  assert.equal(response.result.selected_model.model_id, 'fake.beta');
  assert.deepEqual([h.metrics.primary, h.metrics.fallback], [0, 1]);
});

test('P04 D0-D4 egress policy denies secret and STOPs real-owner exception', () => {
  const h = makeHarness();
  expectReason(h.gateway.invoke(h.request({ data_class: 'D4', idempotency_key: 'idem.d4' })),
    DECISIONS.DENY, REASON_CODES.D4_DENIED);
  h.state.policy.d3_mode = 'REQUIRE_DOMAIN_OWNER';
  expectReason(h.gateway.invoke(h.request({ data_class: 'D3', idempotency_key: 'idem.d3' })),
    DECISIONS.STOP, REASON_CODES.DOMAIN_OWNER_REQUIRED);
});

test('P05 safe maximum-cost reservation charges attempts and releases unused units', () => {
  const h = makeHarness();
  const result = h.gateway.invoke(h.request()).result;
  assert.deepEqual(result.cost, { reserved_units: 7, charged_units: 2, released_units: 5, attempts: 1 });
  assert.deepEqual(h.gateway.getBudgetSnapshot(), [
    { company_id: 'company.one', proof_spent_units: 2, reserved_units: 0 },
  ]);
  assert.deepEqual(Object.keys(h.gateway).sort(), ['getBudgetSnapshot', 'invoke', 'listAuditRecords']);
});

test('P06 only canonical transient result retries same model within caps', () => {
  const h = makeHarness({ primaryOutcomes: [
    { outcome: 'TRANSIENT_FAILURE' }, { outcome: 'SUCCESS', output: output('retry success') },
  ] });
  const response = h.gateway.invoke(h.request());
  expectReason(response, DECISIONS.ALLOW, REASON_CODES.OK);
  assert.equal(h.metrics.primary, 2); assert.equal(response.result.cost.charged_units, 4);
});

test('P07 one same-provider region capability safety fallback follows exhaustion', () => {
  const h = makeHarness({ primaryOutcomes: [
    { outcome: 'TRANSIENT_FAILURE' }, { outcome: 'TRANSIENT_FAILURE' },
  ] });
  const response = h.gateway.invoke(h.request());
  assert.equal(response.result.selected_model.model_id, 'fake.beta');
  assert.deepEqual([h.metrics.primary, h.metrics.fallback], [2, 1]);
});

test('P08 output release is strict, UNTRUSTED and has no business effect', () => {
  const h = makeHarness(); const result = h.gateway.invoke(h.request()).result;
  assert.equal(result.output_trust, 'UNTRUSTED'); assert.equal(result.business_effect, 'NONE');
  assert.deepEqual(Object.keys(result.output), ['confidence', 'content', 'schema_version']);
});

test('P09 exactly one safe hash-linked terminal audit per request', () => {
  const h = makeHarness(); h.gateway.invoke(h.request());
  h.gateway.invoke({ bad: 'request' });
  const records = h.gateway.listAuditRecords(); assert.equal(records.length, 2);
  assert.equal(records[0].previous_audit_sha256, '0'.repeat(64));
  assert.equal(records[1].previous_audit_sha256, records[0].audit_sha256);
  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, /summarize public facts|bounded proof answer|exception|stack/i);
});

test('P10 forged caller Agent role permission and package claims cannot create authority', () => {
  const h = makeHarness();
  for (const changes of [
    { claimed_role: 'founder' }, { claimed_permissions: ['model.request', 'business.write'] },
    { claimed_company_id: 'company.evil' },
  ]) expectReason(h.gateway.invoke(h.request({ ...changes, idempotency_key: `idem.${Object.keys(changes)[0]}` })),
    DECISIONS.DENY, Object.hasOwn(changes, 'claimed_company_id')
      ? REASON_CODES.COMPANY_CONTEXT_DENIED : REASON_CODES.AUTHORITY_DENIED);
  assert.equal(h.metrics.primary, 0);
});

test('P11 authority policy budget catalog and claimed company must match before release', () => {
  const h = makeHarness({ state: (s) => { s.authority.company_id = 'company.other'; } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED);
  assert.equal(h.metrics.primary, 0);
});

test('P12 secret patterns in nested input and model output are denied and absent from audit', () => {
  const h = makeHarness();
  const response = h.gateway.invoke(h.request({ payload: { nested: [{ api_key: 'api_key=supersecretvalue' }] } }));
  expectReason(response, DECISIONS.DENY, REASON_CODES.SECRET_DETECTED);
  assert.doesNotMatch(JSON.stringify(h.gateway.listAuditRecords()), /supersecretvalue/);
});

test('P13 invalid and overflowing cost or budget numerics fail closed with zero invocation', () => {
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const h = makeHarness({ state: (s) => { s.catalog.models[0].cost_units = value; } });
    assert.equal(h.gateway.invoke(h.request()).decision, DECISIONS.DENY);
    assert.equal(h.metrics.primary + h.metrics.fallback, 0);
  }
});

test('P14 completed duplicate, conflict and reentrant in-flight delivery are contained', () => {
  const h = makeHarness(); const first = h.gateway.invoke(h.request());
  const same = h.gateway.invoke(h.request());
  expectReason(same, DECISIONS.ALLOW, REASON_CODES.DUPLICATE_REQUEST);
  assert.deepEqual(same.result, first.result); assert.equal(h.metrics.primary, 1);
  expectReason(h.gateway.invoke(h.request({ payload: { prompt: 'different' } })),
    DECISIONS.DENY, REASON_CODES.IDEMPOTENCY_CONFLICT);
});

test('P14-R completed duplicate needs no new maximum-cost reservation', () => {
  const h = makeHarness(); const first = h.gateway.invoke(h.request());
  expectReason(first, DECISIONS.ALLOW, REASON_CODES.OK);
  const before = h.gateway.getBudgetSnapshot();
  h.state.budget.limit_units = before[0].proof_spent_units;
  const duplicate = h.gateway.invoke(h.request());
  expectReason(duplicate, DECISIONS.ALLOW, REASON_CODES.DUPLICATE_REQUEST);
  assert.deepEqual(duplicate.result, first.result);
  assert.equal(h.metrics.primary + h.metrics.fallback, 1);
  assert.deepEqual(h.gateway.getBudgetSnapshot(), before);
  const duplicateAudit = h.gateway.listAuditRecords().at(-1);
  assert.deepEqual([duplicateAudit.reserved_units, duplicateAudit.charged_units,
    duplicateAudit.released_units, duplicateAudit.attempts.length], [0, 0, 0, 0]);
});

test('P15 final T1 policy and catalog revalidation denies changes before invocation', () => {
  let state; const h = makeHarness({ state: (s) => { state = s; },
    beforeFinalRevalidation: () => { state.policy.policy_version = 'policy.v2'; } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.POLICY_CHANGED);
  assert.equal(h.metrics.primary, 0);
});

test('P16 resolver adapter validator and audit failures expose canonical reasons only', () => {
  const marker = 'raw-secret-stack-marker';
  const h = makeHarness({ adapters: { primary: () => { throw new Error(marker); }, fallback: () => ({ outcome: 'SUCCESS', output: output() }) } });
  const response = h.gateway.invoke(h.request());
  expectReason(response, DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  assert.doesNotMatch(JSON.stringify(response) + JSON.stringify(h.gateway.listAuditRecords()), new RegExp(marker));
});

test('P17 proof constants are frozen and results cannot cause business or network effects', () => {
  const h = makeHarness(); const response = h.gateway.invoke(h.request());
  assert(Object.isFrozen(BASELINES)); assert(Object.isFrozen(POLICY)); assert(Object.isFrozen(response));
  assert.equal(response.result.business_effect, 'NONE'); assert.equal(response.result.output_trust, 'UNTRUSTED');
  assert.equal(response.result.publish_capability, undefined);
});

test('ADV-01 forged Agent role permission and package inventory', () => {
  const h = makeHarness({ state: (s) => { s.authority.agent_id = 'forged.agent'; } });
  expectReason(h.gateway.invoke(h.request({ claimed_role: 'admin', claimed_permissions: ['model.request'] })),
    DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED);
});

test('ADV-02 wrong-company inventory', () => {
  const h = makeHarness({ state: (s) => { s.company.company_id = 'company.other'; } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.COMPANY_CONTEXT_DENIED);
});

test('ADV-03 nested secret input and secret output inventory', () => {
  const h = makeHarness({ primaryOutcomes: [{ outcome: 'SUCCESS', output: output('Bearer abcdefghijklmnop') }] });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.SECRET_DETECTED);
  assert.doesNotMatch(JSON.stringify(h.gateway.listAuditRecords()), /abcdefghijklmnop/);
});

test('ADV-04 negative and fractional catalog-cost inventory', () => {
  for (const cost of [-1, 0.25]) {
    const h = makeHarness({ state: (s) => { s.catalog.models[0].cost_units = cost; } });
    assert.equal(h.gateway.invoke(h.request()).decision, DECISIONS.DENY); assert.equal(h.metrics.primary, 0);
  }
});

test('ADV-05 NaN Infinity and unsafe-integer inventory', () => {
  for (const field of ['quality_score', 'latency_units', 'cost_units']) {
    for (const value of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const h = makeHarness({ state: (s) => { s.catalog.models[0][field] = value; } });
      assert.equal(h.gateway.invoke(h.request()).decision, DECISIONS.DENY); assert.equal(h.metrics.primary, 0);
    }
  }
});

test('ADV-06 multiplication and addition overflow inventory', () => {
  const multiplication = makeHarness({ state: (s) => { s.catalog.models[0].cost_units = Number.MAX_SAFE_INTEGER; } });
  expectReason(multiplication.gateway.invoke(multiplication.request()), DECISIONS.DENY, REASON_CODES.COST_OVERFLOW);
  const addition = makeHarness({ state: (s) => { s.budget.limit_units = Number.MAX_SAFE_INTEGER;
    s.budget.preexisting_spent_units = Number.MAX_SAFE_INTEGER; } });
  expectReason(addition.gateway.invoke(addition.request()), DECISIONS.DENY, REASON_CODES.COST_OVERFLOW);
});

test('ADV-07 per-request and company-budget overflow inventory', () => {
  const requestLimit = makeHarness({ state: (s) => { s.catalog.models[0].cost_units = 5; } });
  expectReason(requestLimit.gateway.invoke(requestLimit.request()), DECISIONS.DENY, REASON_CODES.COST_LIMIT_EXCEEDED);
  const companyLimit = makeHarness({ state: (s) => { s.budget.limit_units = 6; } });
  expectReason(companyLimit.gateway.invoke(companyLimit.request()), DECISIONS.DENY, REASON_CODES.BUDGET_EXHAUSTED);
});

test('ADV-08 same conflicting and reentrant idempotency inventory', () => {
  let gateway; let nested; let original; let calls = 0;
  const adapters = { primary: () => { calls += 1; nested = gateway.invoke(original);
    return { outcome: 'SUCCESS', output: output() }; }, fallback: () => ({ outcome: 'SUCCESS', output: output() }) };
  const h = makeHarness({ adapters }); gateway = h.gateway; original = h.request();
  expectReason(gateway.invoke(original), DECISIONS.ALLOW, REASON_CODES.OK);
  expectReason(nested, DECISIONS.DENY, REASON_CODES.REQUEST_IN_PROGRESS); assert.equal(calls, 1);
  expectReason(gateway.invoke(original), DECISIONS.ALLOW, REASON_CODES.DUPLICATE_REQUEST);
  expectReason(gateway.invoke(h.request({ payload: { changed: true } })), DECISIONS.DENY, REASON_CODES.IDEMPOTENCY_CONFLICT);
});

test('ADV-09 policy change immediately before invocation inventory', () => {
  let state; const h = makeHarness({ state: (s) => { state = s; },
    beforeFinalRevalidation: () => { state.policy.allowed_models = ['fake.beta@1.0.0']; } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.POLICY_CHANGED); assert.equal(h.metrics.primary, 0);
});

test('ADV-10 selected model BLOCKED or RETIRED at T1 inventory', () => {
  for (const status of ['BLOCKED', 'RETIRED']) {
    let state; const h = makeHarness({ state: (s) => { state = s; },
      beforeFinalRevalidation: () => { state.catalog.models[0].status = status; } });
    expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.MODEL_STATUS_CHANGED);
    assert.equal(h.metrics.primary + h.metrics.fallback, 0);
  }
});

test('ADV-11 malformed accessor oversized and secret-bearing output inventory', () => {
  const cases = [
    { bad: true }, output('x'.repeat(2001)), output('password=extremely-secret-value'),
  ];
  let getterCalled = false; const accessor = output();
  Object.defineProperty(accessor, 'content', { enumerable: true, get() { getterCalled = true; return 'unsafe'; } });
  cases.push(accessor);
  for (const candidate of cases) {
    const h = makeHarness({ primaryOutcomes: [{ outcome: 'SUCCESS', output: candidate }] });
    assert.equal(h.gateway.invoke(h.request()).decision, DECISIONS.DENY);
  }
  assert.equal(getterCalled, false);
});

test('ADV-12 audit prepare failure has zero adapter call inventory', () => {
  const h = makeHarness({ audit: { prepare: () => { throw new Error('raw prepare'); }, commit: () => ({ ok: true }) } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE);
  assert.equal(h.metrics.primary + h.metrics.fallback, 0); assert.equal(h.gateway.listAuditRecords().length, 1);
});

test('ADV-13 audit terminal failure blocks output and uses one fail-safe record inventory', () => {
  const h = makeHarness({ audit: { prepare: () => ({ ok: true }), commit: () => { throw new Error('raw terminal'); } } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE);
  const records = h.gateway.listAuditRecords(); assert.equal(records.length, 1);
  assert.equal(records[0].audit_mode, 'FAILSAFE'); assert.equal(records[0].output_sha256, null);
});

test('ADV-14 repeated transient failures respect invocation retry and cost caps inventory', () => {
  const transient = { outcome: 'TRANSIENT_FAILURE' };
  const h = makeHarness({ primaryOutcomes: [transient, transient], fallbackOutcomes: [transient] });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  assert.deepEqual([h.metrics.primary, h.metrics.fallback], [2, 1]);
  const audit = h.gateway.listAuditRecords()[0]; assert.equal(audit.attempts.length, POLICY.maximum_adapter_invocations);
  assert.equal(audit.charged_units, 7); assert.equal(h.gateway.getBudgetSnapshot()[0].reserved_units, 0);
});

test('ADV-15 cross-provider fallback rejection inventory', () => {
  const transient = { outcome: 'TRANSIENT_FAILURE' };
  const h = makeHarness({ primaryOutcomes: [transient, transient], state: (s) => {
    s.catalog.models[1].provider = 'provider-b'; } });
  expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  assert.deepEqual([h.metrics.primary, h.metrics.fallback], [2, 0]);
});

test('ADV-16 cross-region data-class and safety-class fallback rejection inventory', () => {
  for (const mutate of [
    (m) => { m.region = 'us'; }, (m) => { m.data_classes = ['D1']; },
    (m) => { m.safety_class = 'other-safe'; },
  ]) {
    const transient = { outcome: 'TRANSIENT_FAILURE' };
    const h = makeHarness({ primaryOutcomes: [transient, transient], state: (s) => mutate(s.catalog.models[1]) });
    expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
    assert.equal(h.metrics.fallback, 0);
  }
});

test('ADV-17 hostile Proxy getter and thrown values at trust boundaries inventory', () => {
  let getterCalled = false; const getterRequest = makeHarness(); const request = getterRequest.request();
  Object.defineProperty(request, 'payload', { enumerable: true, get() { getterCalled = true; return {}; } });
  expectReason(getterRequest.gateway.invoke(request), DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  assert.equal(getterCalled, false);
  for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    const h = makeHarness(); const hostile = new Proxy(h.request(), { [trap]() { throw 'raw-request-secret'; } });
    expectReason(h.gateway.invoke(hostile), DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  }
  const traps = ['authority', 'company', 'policy', 'catalog', 'budget'];
  for (const boundary of traps) {
    const h = makeHarness({ state: (s) => { s[boundary] = new Proxy(s[boundary], { ownKeys() { throw { decision: 'ALLOW', raw: 'secret' }; } }); } });
    expectReason(h.gateway.invoke(h.request()), DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
  }
  const thrown = makeHarness({ adapters: { primary: () => { throw { decision: 'ALLOW', reason_code: 'OK' }; },
    fallback: () => ({ outcome: 'SUCCESS', output: output() }) } });
  expectReason(thrown.gateway.invoke(thrown.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  const registry = makeHarness({ registryFactory: () => ({ getAgentPackage: () => { throw { decision: 'ALLOW' }; } }) });
  expectReason(registry.gateway.invoke(registry.request()), DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED);
  const adapterProxy = makeHarness({ adapters: { primary: () => new Proxy({ outcome: 'SUCCESS', output: output() }, {
    ownKeys() { throw 'raw-adapter-secret'; } }), fallback: () => ({ outcome: 'SUCCESS', output: output() }) } });
  expectReason(adapterProxy.gateway.invoke(adapterProxy.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  const validator = makeHarness({ validator: () => { throw { decision: 'ALLOW', raw: 'validator-secret' }; } });
  expectReason(validator.gateway.invoke(validator.request()), DECISIONS.DENY, REASON_CODES.OUTPUT_VALIDATION_FAILED);
  const hook = makeHarness({ beforeFinalRevalidation: () => { throw { decision: 'ALLOW', raw: 'hook-secret' }; } });
  expectReason(hook.gateway.invoke(hook.request()), DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
  const badClock = makeHarness({ now: () => { throw { decision: 'ALLOW', raw: 'clock-secret' }; } });
  expectReason(badClock.gateway.invoke(badClock.request()), DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
  for (const gateway of [getterRequest.gateway, registry.gateway, adapterProxy.gateway,
    validator.gateway, hook.gateway, badClock.gateway]) {
    assert.doesNotMatch(JSON.stringify(gateway.listAuditRecords()), /raw-.*secret|validator-secret|hook-secret|clock-secret/);
  }
});
