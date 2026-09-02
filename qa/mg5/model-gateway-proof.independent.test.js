'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  createAgentRegistry, calculatePackageSha256, STATUSES, ACTOR_ROLES,
} = require('../../tools/reg4/agent-registry');
const {
  createModelGatewayProof, calculatePayloadSha256, BASELINES, POLICY,
  DECISIONS, REASON_CODES,
} = require('../../tools/mg5/model-gateway-proof');

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const ZERO_SHA = '0'.repeat(64);

function qaRegistry(changes = {}) {
  let tick = 0;
  const registry = createAgentRegistry({
    now: () => `2026-09-02T02:00:${String(tick++).padStart(2, '0')}.000Z`,
  });
  const content = {
    agent_id: 'qa.mg5.agent', name: 'Independent QA Synthetic Agent', version: '2.1.0',
    created_by: 'qa.author', permissions: ['model.request', 'audit.read'], required_tools: [],
    prohibited_actions: ['business.write', 'business.approve'], evidence_references: [
      { evidence_id: 'qa-automated', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: SHA_A },
      { evidence_id: 'qa-independent', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: SHA_B },
    ],
    ...changes,
  };
  const packageSha = calculatePackageSha256(content);
  registry.registerAgentPackage({ ...content, package_sha256: packageSha }, {
    actor_id: content.created_by, role: ACTOR_ROLES.AUTHOR,
  });
  registry.transitionApproval({ agent_id: content.agent_id, version: content.version,
    to_status: STATUSES.IN_REVIEW }, { actor_id: 'qa.reviewer', role: ACTOR_ROLES.REVIEWER });
  registry.transitionApproval({ agent_id: content.agent_id, version: content.version,
    to_status: STATUSES.APPROVED }, { actor_id: 'qa.approver', role: ACTOR_ROLES.APPROVER });
  return { registry, content, packageSha };
}

function modelOutput(content = 'independent synthetic answer') {
  return { schema_version: 'mg5-output/v1', content, confidence: 88 };
}

function harness(options = {}) {
  const reg = options.reg || qaRegistry(options.registryChanges);
  const packageSha = options.packageSha || reg.packageSha;
  const state = {
    authority: { requester_id: 'qa.user', active: true, company_id: 'qa.company',
      role: 'analyst', permissions: ['model.request'], agent_id: reg.content.agent_id,
      agent_version: reg.content.version, package_sha256: packageSha },
    company: { company_id: 'qa.company', active: true, context_version: 'company.v1' },
    policy: { company_id: 'qa.company', policy_version: 'policy.v1',
      allowed_use_cases: ['summarize'], allowed_data_classes: ['D0', 'D1', 'D2', 'D3'],
      allowed_models: ['qa.primary@1.0.0', 'qa.backup@1.0.0'], d3_mode: 'ALLOW' },
    catalog: { catalog_version: 'catalog.v1', models: [
      { model_id: 'qa.primary', version: '1.0.0', adapter_id: 'primary', provider: 'qa-provider',
        region: 'vn', safety_class: 'qa-safe', data_classes: ['D0', 'D1', 'D2', 'D3'],
        status: 'APPROVED', quality_score: 96, cost_units: 2, latency_units: 10 },
      { model_id: 'qa.backup', version: '1.0.0', adapter_id: 'backup', provider: 'qa-provider',
        region: 'vn', safety_class: 'qa-safe', data_classes: ['D0', 'D1', 'D2', 'D3'],
        status: 'APPROVED', quality_score: 82, cost_units: 3, latency_units: 30 },
    ] },
    budget: { company_id: 'qa.company', budget_version: 'budget.v1',
      limit_units: 100, preexisting_spent_units: 0 },
  };
  if (options.mutate) options.mutate(state, reg);
  const metrics = { primary: 0, backup: 0, inputs: [] };
  const primaryQueue = [...(options.primary || [])];
  const backupQueue = [...(options.backup || [])];
  const defaultAdapters = {
    primary: (input) => { metrics.primary += 1; metrics.inputs.push(input);
      return primaryQueue.shift() || { outcome: 'SUCCESS', output: modelOutput() }; },
    backup: (input) => { metrics.backup += 1; metrics.inputs.push(input);
      return backupQueue.shift() || { outcome: 'SUCCESS', output: modelOutput('backup synthetic answer') }; },
  };
  const adapters = options.adaptersFactory ? options.adaptersFactory(metrics, state) : defaultAdapters;
  const defaultResolvers = {
    getAuthority: () => state.authority,
    getCompanyContext: () => state.company,
    getPolicy: () => state.policy,
    getCatalog: () => state.catalog,
    getBudget: () => state.budget,
  };
  const resolvers = options.resolversFactory ? options.resolversFactory(state) : defaultResolvers;
  const gatewayOptions = {
    registry: options.registry || reg.registry, resolvers, adapters,
    now: options.now || (() => '2026-09-02T03:00:00.000Z'),
  };
  if (options.hook) gatewayOptions.beforeFinalRevalidation = options.hook;
  if (options.validator) gatewayOptions.validator = options.validator;
  if (options.audit) gatewayOptions.audit = options.audit;
  const gateway = createModelGatewayProof(gatewayOptions);
  function request(changes = {}) {
    const value = {
      request_id: 'qa.request', idempotency_key: 'qa.idempotency', agent_id: reg.content.agent_id,
      agent_version: reg.content.version, package_sha256: packageSha,
      reg4_baseline_commit: BASELINES.reg4.commit, reg4_baseline_tree: BASELINES.reg4.tree,
      bos_ai1_baseline_commit: BASELINES.bos_ai1.commit,
      bos_ai1_baseline_tree: BASELINES.bos_ai1.tree, requester_id: 'qa.user',
      company_id: 'qa.company', use_case: 'summarize', data_class: 'D1',
      payload: { instruction: 'summarize synthetic public material' },
      ...changes,
    };
    if (!Object.hasOwn(changes, 'payload_sha256')) value.payload_sha256 = calculatePayloadSha256(value.payload);
    return value;
  }
  return { ...reg, state, metrics, gateway, request };
}

function expect(response, decision, reason) {
  assert.equal(response.decision, decision);
  assert.equal(response.reason_code, reason);
  if (decision !== DECISIONS.ALLOW) assert.equal(response.result, null);
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex');
}

function gitBlob(path) {
  return execFileSync('git', ['hash-object', path], { encoding: 'utf8' }).trim();
}

test('01 P01 P10 P11 ADV-01 ADV-02: real REG4 approval fingerprint evidence permission and baseline gates', () => {
  const good = harness();
  const record = good.registry.getAgentPackage(good.content.agent_id, good.content.version);
  assert.equal(record.approval_status, STATUSES.APPROVED);
  assert.equal(record.package_sha256, good.packageSha);
  assert(record.permissions.includes('model.request'));
  assert.deepEqual(new Set(record.evidence_references.map((item) => item.evidence_type)),
    new Set(['AUTOMATED_TEST', 'INDEPENDENT_REVIEW']));
  expect(good.gateway.invoke(good.request()), DECISIONS.ALLOW, REASON_CODES.OK);

  const fingerprint = harness();
  expect(fingerprint.gateway.invoke(fingerprint.request({ package_sha256: SHA_C })),
    DECISIONS.DENY, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
  const baseline = harness();
  expect(baseline.gateway.invoke(baseline.request({ reg4_baseline_tree: 'f'.repeat(40) })),
    DECISIONS.DENY, REASON_CODES.BASELINE_MISMATCH);
  const permission = harness({ registryChanges: { permissions: ['audit.read'] } });
  expect(permission.gateway.invoke(permission.request()), DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED);

  const baseReg = qaRegistry();
  const approved = baseReg.registry.getAgentPackage(baseReg.content.agent_id, baseReg.content.version);
  const evidenceContent = { ...baseReg.content,
    evidence_references: baseReg.content.evidence_references.filter((item) => item.evidence_type === 'AUTOMATED_TEST') };
  const evidenceSha = calculatePackageSha256(evidenceContent);
  const evidenceRegistry = { getAgentPackage: () => ({ ...approved, ...evidenceContent, package_sha256: evidenceSha }) };
  const evidence = harness({ reg: baseReg, registry: evidenceRegistry, packageSha: evidenceSha });
  expect(evidence.gateway.invoke(evidence.request()), DECISIONS.DENY, REASON_CODES.REQUIRED_EVIDENCE_MISSING);
  for (const item of [fingerprint, baseline, permission, evidence]) {
    assert.equal(item.metrics.primary + item.metrics.backup, 0);
  }
});

test('02 P02 P03: exact three-method API, approved exact versions, allowlist ordering, no caller routing', () => {
  const ordered = harness({ mutate: (state) => {
    state.policy.allowed_models = ['qa.backup@1.0.0', 'qa.primary@1.0.0'];
  } });
  assert.deepEqual(Object.keys(ordered.gateway).sort(), ['getBudgetSnapshot', 'invoke', 'listAuditRecords']);
  const selected = ordered.gateway.invoke(ordered.request());
  expect(selected, DECISIONS.ALLOW, REASON_CODES.OK);
  assert.equal(selected.result.selected_model.model_id, 'qa.backup');
  assert.deepEqual([ordered.metrics.primary, ordered.metrics.backup], [0, 1]);

  for (const mutate of [
    (s) => { s.catalog.models[0].status = 'BLOCKED'; s.policy.allowed_models = ['qa.primary@1.0.0']; },
    (s) => { s.policy.allowed_models = ['qa.primary@9.9.9']; },
  ]) {
    const exact = harness({ mutate });
    expect(exact.gateway.invoke(exact.request()), DECISIONS.DENY, REASON_CODES.CATALOG_DENIED);
    assert.equal(exact.metrics.primary + exact.metrics.backup, 0);
  }
  for (const field of ['provider', 'model_id', 'region', 'retry', 'minimum_quality_score', 'allowed_models']) {
    const routed = harness();
    expect(routed.gateway.invoke(routed.request({ [field]: 'caller-choice' })),
      DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
    assert.equal(routed.metrics.primary + routed.metrics.backup, 0);
  }
});

test('03 P04 P10 P11 P12 ADV-01 ADV-02 ADV-03: company claims, D0-D4 and nested secrets fail closed', () => {
  for (const dataClass of ['D0', 'D1', 'D2', 'D3']) {
    const allowed = harness();
    expect(allowed.gateway.invoke(allowed.request({ data_class: dataClass })),
      DECISIONS.ALLOW, REASON_CODES.OK);
  }
  const owner = harness({ mutate: (state) => { state.policy.d3_mode = 'REQUIRE_DOMAIN_OWNER'; } });
  expect(owner.gateway.invoke(owner.request({ data_class: 'D3' })),
    DECISIONS.STOP, REASON_CODES.DOMAIN_OWNER_REQUIRED);
  const d4 = harness();
  expect(d4.gateway.invoke(d4.request({ data_class: 'D4' })), DECISIONS.DENY, REASON_CODES.D4_DENIED);

  const cases = [
    [harness({ mutate: (s) => { s.company.company_id = 'other.company'; } }), {}, REASON_CODES.COMPANY_CONTEXT_DENIED],
    [harness(), { claimed_company_id: 'other.company' }, REASON_CODES.COMPANY_CONTEXT_DENIED],
    [harness(), { claimed_role: 'administrator' }, REASON_CODES.AUTHORITY_DENIED],
    [harness(), { claimed_permissions: ['business.write'] }, REASON_CODES.AUTHORITY_DENIED],
    [harness(), { agent_id: 'forged.agent' }, REASON_CODES.AGENT_NOT_REGISTERED],
    [harness(), { payload: { level1: [{ level2: 'api_key=independent-secret-value' }] } }, REASON_CODES.SECRET_DETECTED],
  ];
  for (const [item, changes, reason] of cases) {
    expect(item.gateway.invoke(item.request(changes)), DECISIONS.DENY, reason);
    assert.equal(item.metrics.primary + item.metrics.backup, 0);
    assert.doesNotMatch(JSON.stringify(item.gateway.listAuditRecords()), /independent-secret-value/);
  }
});

test('04 P05 P13 ADV-04 ADV-05 ADV-06 ADV-07: safe integer cost, overflow, request limit and budget', () => {
  const normal = harness();
  expect(normal.gateway.invoke(normal.request()), DECISIONS.ALLOW, REASON_CODES.OK);
  assert.deepEqual(normal.gateway.listAuditRecords()[0] && {
    reserved: normal.gateway.listAuditRecords()[0].reserved_units,
    charged: normal.gateway.listAuditRecords()[0].charged_units,
    released: normal.gateway.listAuditRecords()[0].released_units,
  }, { reserved: 7, charged: 2, released: 5 });
  assert.deepEqual(normal.gateway.getBudgetSnapshot(), [
    { company_id: 'qa.company', proof_spent_units: 2, reserved_units: 0 },
  ]);

  for (const numeric of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = harness({ mutate: (s) => { s.catalog.models[0].cost_units = numeric; } });
    assert.equal(invalid.gateway.invoke(invalid.request()).decision, DECISIONS.DENY);
    assert.equal(invalid.metrics.primary + invalid.metrics.backup, 0);
  }
  const multiplication = harness({ mutate: (s) => { s.catalog.models[0].cost_units = Number.MAX_SAFE_INTEGER; } });
  expect(multiplication.gateway.invoke(multiplication.request()), DECISIONS.DENY, REASON_CODES.COST_OVERFLOW);
  const addition = harness({ mutate: (s) => {
    s.budget.limit_units = Number.MAX_SAFE_INTEGER;
    s.budget.preexisting_spent_units = Number.MAX_SAFE_INTEGER;
  } });
  expect(addition.gateway.invoke(addition.request()), DECISIONS.DENY, REASON_CODES.COST_OVERFLOW);
  const requestLimit = harness({ mutate: (s) => { s.catalog.models[0].cost_units = 5; } });
  expect(requestLimit.gateway.invoke(requestLimit.request()), DECISIONS.DENY, REASON_CODES.COST_LIMIT_EXCEEDED);
  const budget = harness({ mutate: (s) => { s.budget.limit_units = 6; } });
  expect(budget.gateway.invoke(budget.request()), DECISIONS.DENY, REASON_CODES.BUDGET_EXHAUSTED);
  for (const item of [multiplication, addition, requestLimit, budget]) {
    assert.equal(item.metrics.primary + item.metrics.backup, 0);
  }
});

test('05 P06 P07 ADV-14 ADV-15 ADV-16: canonical retry twice and same-boundary fallback cap three', () => {
  const transient = { outcome: 'TRANSIENT_FAILURE' };
  const retry = harness({ primary: [transient, { outcome: 'SUCCESS', output: modelOutput('retry success') }] });
  expect(retry.gateway.invoke(retry.request()), DECISIONS.ALLOW, REASON_CODES.OK);
  assert.deepEqual([retry.metrics.primary, retry.metrics.backup], [2, 0]);
  assert.equal(retry.gateway.listAuditRecords()[0].charged_units, 4);

  const fallback = harness({ primary: [transient, transient] });
  const recovered = fallback.gateway.invoke(fallback.request());
  expect(recovered, DECISIONS.ALLOW, REASON_CODES.OK);
  assert.equal(recovered.result.selected_model.model_id, 'qa.backup');
  assert.deepEqual([fallback.metrics.primary, fallback.metrics.backup], [2, 1]);
  assert.equal(fallback.gateway.listAuditRecords()[0].attempts.length, POLICY.maximum_adapter_invocations);

  const thrown = harness({ adaptersFactory: (metrics) => ({
    primary: () => { metrics.primary += 1; throw { outcome: 'TRANSIENT_FAILURE' }; },
    backup: () => { metrics.backup += 1; return { outcome: 'SUCCESS', output: modelOutput() }; },
  }) });
  expect(thrown.gateway.invoke(thrown.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  assert.deepEqual([thrown.metrics.primary, thrown.metrics.backup], [1, 0]);

  for (const boundary of [
    (m) => { m.provider = 'foreign-provider'; },
    (m) => { m.region = 'us'; },
    (m) => { m.data_classes = ['D0', 'D1', 'D2']; },
    (m) => { m.safety_class = 'other-safe'; },
  ]) {
    const blocked = harness({ primary: [transient, transient], mutate: (s) => boundary(s.catalog.models[1]) });
    expect(blocked.gateway.invoke(blocked.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
    assert.deepEqual([blocked.metrics.primary, blocked.metrics.backup], [2, 0]);
  }
});

test('06 P08 P12 P16 ADV-03 ADV-11: strict frozen UNTRUSTED/NONE output and frozen adapter input', () => {
  const good = harness();
  const response = good.gateway.invoke(good.request());
  expect(response, DECISIONS.ALLOW, REASON_CODES.OK);
  assert.equal(response.result.output_trust, 'UNTRUSTED');
  assert.equal(response.result.business_effect, 'NONE');
  assert(Object.isFrozen(response));
  assert(Object.isFrozen(response.result));
  assert(Object.isFrozen(response.result.output));
  assert(Object.isFrozen(good.metrics.inputs[0]));
  assert(Object.isFrozen(good.metrics.inputs[0].payload));
  assert(Object.isFrozen(good.metrics.inputs[0].model));

  let getterCalled = false;
  const accessor = modelOutput();
  Object.defineProperty(accessor, 'content', { enumerable: true, get() { getterCalled = true; return 'unsafe'; } });
  const hostileOutputs = [
    { ...modelOutput(), unexpected: true },
    accessor,
    modelOutput('x'.repeat(2001)),
    modelOutput('Bearer qa-secret-token-123456789'),
  ];
  for (const candidate of hostileOutputs) {
    const invalid = harness({ primary: [{ outcome: 'SUCCESS', output: candidate }] });
    assert.equal(invalid.gateway.invoke(invalid.request()).decision, DECISIONS.DENY);
    assert.equal(invalid.gateway.listAuditRecords()[0].output_sha256, null);
    assert.doesNotMatch(JSON.stringify(invalid.gateway.listAuditRecords()), /qa-secret-token/);
  }
  assert.equal(getterCalled, false);
});

test('07 P14 ADV-08: identical conflict reentry and completed replay with no remaining reserve budget', () => {
  const replay = harness();
  const first = replay.gateway.invoke(replay.request());
  expect(first, DECISIONS.ALLOW, REASON_CODES.OK);
  replay.state.budget.limit_units = 2;
  const duplicate = replay.gateway.invoke(replay.request({ request_id: 'qa.request.replay' }));
  expect(duplicate, DECISIONS.ALLOW, REASON_CODES.DUPLICATE_REQUEST);
  assert.deepEqual(duplicate.result, first.result);
  assert.equal(replay.metrics.primary + replay.metrics.backup, 1);
  const replayAudit = replay.gateway.listAuditRecords().at(-1);
  assert.deepEqual([replayAudit.reserved_units, replayAudit.charged_units,
    replayAudit.released_units, replayAudit.attempts.length], [0, 0, 0, 0]);
  expect(replay.gateway.invoke(replay.request({ request_id: 'qa.request.conflict',
    payload: { instruction: 'different semantic request' } })),
  DECISIONS.DENY, REASON_CODES.IDEMPOTENCY_CONFLICT);

  let gateway;
  let original;
  let nested;
  const reentrant = harness({ adaptersFactory: (metrics) => ({
    primary: () => { metrics.primary += 1; nested = gateway.invoke(original);
      return { outcome: 'SUCCESS', output: modelOutput('outer only') }; },
    backup: () => { metrics.backup += 1; return { outcome: 'SUCCESS', output: modelOutput() }; },
  }) });
  gateway = reentrant.gateway;
  original = reentrant.request({ request_id: 'qa.reentrant' });
  expect(gateway.invoke(original), DECISIONS.ALLOW, REASON_CODES.OK);
  expect(nested, DECISIONS.DENY, REASON_CODES.REQUEST_IN_PROGRESS);
  assert.deepEqual([reentrant.metrics.primary, reentrant.metrics.backup], [1, 0]);
});

test('08 P11 P15 ADV-09 ADV-10: T1 policy/model/authority/company/budget changes make zero calls', () => {
  const cases = [
    [(s) => { s.policy.policy_version = 'policy.v2'; }, REASON_CODES.POLICY_CHANGED],
    [(s) => { s.catalog.models[0].status = 'BLOCKED'; }, REASON_CODES.MODEL_STATUS_CHANGED],
    [(s) => { s.catalog.models[0].status = 'RETIRED'; }, REASON_CODES.MODEL_STATUS_CHANGED],
    [(s) => { s.authority.role = 'reviewer'; }, REASON_CODES.CONTEXT_CHANGED],
    [(s) => { s.company.context_version = 'company.v2'; }, REASON_CODES.CONTEXT_CHANGED],
    [(s) => { s.budget.budget_version = 'budget.v2'; }, REASON_CODES.CONTEXT_CHANGED],
  ];
  for (const [change, reason] of cases) {
    let live;
    const item = harness({ mutate: (state) => { live = state; }, hook: () => change(live) });
    expect(item.gateway.invoke(item.request()), DECISIONS.DENY, reason);
    assert.equal(item.metrics.primary + item.metrics.backup, 0);
    assert.equal(item.gateway.getBudgetSnapshot()[0].reserved_units, 0);
  }
});

test('09 P09 P16 ADV-12 ADV-13: one terminal hash-linked safe audit; prepare zero-call and commit no-output', () => {
  const committed = [];
  const audited = harness({
    primary: [{ outcome: 'SUCCESS', output: modelOutput('qa-raw-output-marker') }],
    audit: { prepare: () => ({ ok: true }), commit: (record) => {
      assert(Object.isFrozen(record)); committed.push(record); return { ok: true };
    } },
  });
  expect(audited.gateway.invoke(audited.request({ payload: { instruction: 'qa-raw-payload-marker' } })),
    DECISIONS.ALLOW, REASON_CODES.OK);
  expect(audited.gateway.invoke(audited.request({ request_id: 'qa.audit.second',
    idempotency_key: 'qa.audit.second', payload: { instruction: 'second-raw-payload-marker' } })),
  DECISIONS.ALLOW, REASON_CODES.OK);
  const records = audited.gateway.listAuditRecords();
  assert.equal(records.length, 2);
  assert.equal(committed.length, 2);
  assert.deepEqual(records.map((record) => record.sequence), [1, 2]);
  assert.equal(records[0].previous_audit_sha256, ZERO_SHA);
  assert.equal(records[1].previous_audit_sha256, records[0].audit_sha256);
  for (const record of records) {
    const { audit_sha256: digest, ...body } = record;
    assert.equal(digest, sha256(body));
    assert.equal(record.business_effect, 'NONE');
    assert(!Object.hasOwn(record, 'payload'));
    assert(!Object.hasOwn(record, 'response'));
    assert(!Object.hasOwn(record, 'exception'));
  }
  assert.doesNotMatch(JSON.stringify(records), /raw-payload-marker|raw-output-marker/);

  const prepare = harness({ audit: {
    prepare: () => { throw { decision: 'ALLOW', raw: 'prepare-secret-marker' }; },
    commit: () => ({ ok: true }),
  } });
  expect(prepare.gateway.invoke(prepare.request()), DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE);
  assert.equal(prepare.metrics.primary + prepare.metrics.backup, 0);
  assert.equal(prepare.gateway.listAuditRecords().length, 1);
  assert.doesNotMatch(JSON.stringify(prepare.gateway.listAuditRecords()), /prepare-secret-marker/);

  const commit = harness({ primary: [{ outcome: 'SUCCESS', output: modelOutput('never released raw output') }],
    audit: { prepare: () => ({ ok: true }), commit: () => { throw new Error('commit-secret-marker'); } } });
  const denied = commit.gateway.invoke(commit.request());
  expect(denied, DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE);
  const failSafe = commit.gateway.listAuditRecords();
  assert.equal(failSafe.length, 1);
  assert.equal(failSafe[0].audit_mode, 'FAILSAFE');
  assert.equal(failSafe[0].output_sha256, null);
  assert.doesNotMatch(JSON.stringify(failSafe), /never released|commit-secret-marker/);
});

test('10 P12 P16 ADV-17: hostile getter Proxy Symbol prototype depth and throws at every boundary', () => {
  let getterCalled = false;
  const getterCase = harness();
  const getterRequest = getterCase.request();
  Object.defineProperty(getterRequest, 'payload', { enumerable: true,
    get() { getterCalled = true; return {}; } });
  expect(getterCase.gateway.invoke(getterRequest), DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  assert.equal(getterCalled, false);

  const proxyCase = harness();
  expect(proxyCase.gateway.invoke(new Proxy(proxyCase.request(), {
    ownKeys() { throw { decision: 'ALLOW', raw: 'request-proxy-secret' }; },
  })), DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  const symbolCase = harness();
  const symbolRequest = symbolCase.request();
  symbolRequest[Symbol('hostile')] = 'x';
  expect(symbolCase.gateway.invoke(symbolRequest), DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  const prototypeCase = harness();
  const prototypeRequest = prototypeCase.request();
  Object.setPrototypeOf(prototypeRequest, null);
  expect(prototypeCase.gateway.invoke(prototypeRequest), DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  let deep = 'leaf';
  for (let index = 0; index < 13; index += 1) deep = { nested: deep };
  const depthCase = harness();
  expect(depthCase.gateway.invoke(depthCase.request({ payload: deep, payload_sha256: SHA_A })),
    DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);

  const resolverNames = ['getAuthority', 'getCompanyContext', 'getPolicy', 'getCatalog', 'getBudget'];
  for (const attacked of resolverNames) {
    const item = harness({ resolversFactory: (state) => {
      const values = { getAuthority: state.authority, getCompanyContext: state.company,
        getPolicy: state.policy, getCatalog: state.catalog, getBudget: state.budget };
      return Object.fromEntries(resolverNames.map((name) => [name, () => name === attacked
        ? new Proxy(values[name], { ownKeys() { throw { decision: 'ALLOW', raw: 'resolver-secret' }; } })
        : values[name]]));
    } });
    expect(item.gateway.invoke(item.request()), DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
    assert.equal(item.metrics.primary + item.metrics.backup, 0);
  }

  for (const primary of [
    () => { throw { decision: 'ALLOW', reason_code: 'OK', raw: 'adapter-throw-secret' }; },
    () => { const value = { outcome: 'SUCCESS', output: modelOutput() }; value[Symbol('x')] = true; return value; },
    () => new Proxy({ outcome: 'SUCCESS', output: modelOutput() }, { ownKeys() { throw 'adapter-proxy-secret'; } }),
  ]) {
    const item = harness({ adaptersFactory: (metrics) => ({
      primary: () => { metrics.primary += 1; return primary(); },
      backup: () => { metrics.backup += 1; return { outcome: 'SUCCESS', output: modelOutput() }; },
    }) });
    expect(item.gateway.invoke(item.request()), DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  }
  const validator = harness({ validator: () => { throw { decision: 'ALLOW', raw: 'validator-secret' }; } });
  expect(validator.gateway.invoke(validator.request()), DECISIONS.DENY, REASON_CODES.OUTPUT_VALIDATION_FAILED);
  const audit = harness({ audit: { prepare: () => new Proxy({ ok: true }, {
    ownKeys() { throw 'audit-proxy-secret'; } }), commit: () => ({ ok: true }) } });
  expect(audit.gateway.invoke(audit.request()), DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE);
  assert.equal(audit.metrics.primary + audit.metrics.backup, 0);
  const clock = harness({ now: () => { throw { decision: 'ALLOW', raw: 'clock-secret' }; } });
  expect(clock.gateway.invoke(clock.request()), DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
  for (const item of [getterCase, proxyCase, symbolCase, prototypeCase, depthCase, validator, audit, clock]) {
    assert.doesNotMatch(JSON.stringify(item.gateway.listAuditRecords()), /(?:request|resolver|adapter|validator|audit|clock)-(?:proxy-)?secret/);
  }
});

test('11 P17: static proof has no forbidden imports, dependencies, network, secrets or business effects', () => {
  const sourcePath = join(__dirname, '../../tools/mg5/model-gateway-proof.js');
  const source = readFileSync(sourcePath, 'utf8');
  const imports = [...source.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((match) => match[2]).sort();
  assert.deepEqual(imports, ['../reg4/agent-registry', 'node:crypto']);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest)\s*\(|node:(?:http|https|net|tls|child_process)|process\.env|\b(?:axios|pg|mysql|mongodb|sequelize|prisma)\b/i);
  assert.doesNotMatch(source, /publish_capability|business_effect\s*:\s*['"](?!NONE['"])/);
  const effects = [...source.matchAll(/business_effect\s*:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert(effects.length >= 2);
  assert(effects.every((effect) => effect === 'NONE'));
  assert.doesNotMatch(source, /require\(['"]\.\.\/(?:bos-ai1|\.\.\/backend|\.\.\/database)/);
});

test('12 P17: REG4/BOS blob constants and all authority/policy constants are exact and frozen', () => {
  assert.deepEqual(BASELINES, {
    parent: { commit: '057de036f9434b6acdd1951b556bc2cbd77cd881',
      tree: '6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf' },
    reg4: { commit: '3def40122e4072f266c943bc4eb84d3164501339',
      tree: 'aef6c623ce7f549b560af46e73a7ee6d0abd35ae', source_blob: 'be69c77be7559f8fb2ccf896612e65e0f605b595' },
    bos_ai1: { commit: 'f44c14365589b7ff9f1df2ce40185ef8ebece05f',
      tree: 'f17e4c4f699335ddad056310c8d70e3ed3df6909',
      source_blob: '05f51d90b4f187d95682b58f75430f88bad9f82d',
      test_blob: 'ece5780d08899d4b07caf846dec88452722074dd' },
  });
  assert.deepEqual(POLICY, { maximum_request_cost_units: 12, minimum_quality_score: 80,
    maximum_latency_units: 50, maximum_adapter_invocations: 3,
    maximum_retries_per_model: 1, maximum_fallback_models: 1 });
  assert(Object.isFrozen(BASELINES));
  assert(Object.isFrozen(BASELINES.reg4));
  assert(Object.isFrozen(BASELINES.bos_ai1));
  assert(Object.isFrozen(POLICY));
  assert.equal(gitBlob(join(__dirname, '../../tools/reg4/agent-registry.js')), BASELINES.reg4.source_blob);
  assert.equal(gitBlob(join(__dirname, '../../tools/bos-ai1/project-progress-brief-proof.js')), BASELINES.bos_ai1.source_blob);
  assert.equal(gitBlob(join(__dirname, '../../tools/bos-ai1/project-progress-brief-proof.test.js')), BASELINES.bos_ai1.test_blob);
});
