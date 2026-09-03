'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  ACTION, PERMISSION, EFFECT_CLASS, BINDINGS, REG4_BASELINE, AGENT_CONTRACT,
  payloadSha256, createReadAuthority, createFakeReadDomain, createFakeReadRepository,
  createFakeReadPipeline, createFakeReadAuditWriter, createReadPreEffectHandoffProof,
  fixture, NOW, PAST, FUTURE, EARLY, LATER, SECRET, SAFE_DATA,
} = require('./read-pre-effect-fixtures.cjs');

const AUDIT_EVENTS = ['ACTION_INTENT', 'BOS_DECISION', 'PRE_EFFECT_READY', 'EXECUTION_REVALIDATED',
  'DOMAIN_DECISION', 'READ_COMPLETED', 'FILTERED', 'REDACTED', 'RESULT'];
const cases = [];
const add = (name, run) => { cases.push({ name, run }); };

function envelope(result, request) {
  assert.equal(typeof result.correlation_id, 'string');
  assert.ok(result.correlation_id.length > 0);
  assert.equal(typeof result.audit_id, 'string');
  assert.ok(result.audit_id.length > 0);
  if (request) assert.equal(result.correlation_id, request.correlation_id);
}
function noData(result, status, request) {
  envelope(result, request);
  assert.equal(result.data_released, false);
  assert.equal(Object.hasOwn(result, 'data'), false);
  if (status) assert.equal(result.status, status);
  if (result.status === 'DENIED') assert.equal(result.reason_code, 'READ_DENIED');
  if (result.status === 'STOPPED') assert.equal(result.reason_code, 'READ_STOPPED');
  for (const key of ['exists', 'resource_exists', 'row', 'fields', 'raw', 'raw_result']) {
    assert.equal(Object.hasOwn(result, key), false, `public ${key} leaked`);
  }
}
function noRelease(f, result, status) {
  noData(result, status);
  assert.equal(f.proof.releaseCount(), 0);
  assert.equal(JSON.stringify([result, f.audit.listRecords(), f.proof.listSecondaryAudit(), f.proof.listReceipts()]).includes(SECRET), false);
}
function noRead(f, result, status = 'DENIED') {
  noRelease(f, result, status);
  assert.equal(f.repository.readCount(), 0);
  assert.equal(f.repository.callCount(), 0);
  assert.equal(f.pipeline.filterCount(), 0);
  assert.equal(f.pipeline.redactionCount(), 0);
}
function succeeded(f, result) {
  envelope(result, f.request);
  assert.equal(result.status, 'EXECUTED');
  assert.equal(result.data_released, true);
  assert.deepEqual(result.data, SAFE_DATA);
  assert.ok(Object.isFrozen(result.data));
  assert.equal(f.repository.readCount(), 1);
  assert.equal(f.pipeline.filterCount(), 1);
  assert.equal(f.pipeline.redactionCount(), 1);
  assert.equal(f.proof.releaseCount(), 1);
}
function delivery(f, n) { return { ...f.request, request_id: `retry-${n}` }; }
function shape(result) {
  return { status: result.status, decision: result.decision, reason_code: result.reason_code,
    data_released: result.data_released, keys: Object.keys(result).sort() };
}
function frozenMetadata(value) {
  assert.ok(value && typeof value === 'object');
  assert.ok(Object.isFrozen(value));
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(SECRET), false);
  for (const [key, child] of Object.entries(value)) {
    assert.equal(['payload', 'fields', 'row', 'data', 'owner_contact', 'private_note', 'progress_percent'].includes(key), false);
    if (child && typeof child === 'object') frozenMetadata(child);
  }
}
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function checkChain(records) {
  let previous = '0'.repeat(64);
  for (const [i, record] of records.entries()) {
    const { audit_sha256, ...body } = record;
    assert.equal(body.sequence, i + 1);
    assert.equal(body.previous_audit_sha256, previous);
    assert.equal(createHash('sha256').update(stable(body)).digest('hex'), audit_sha256);
    previous = audit_sha256;
  }
}

add('R01 explicit READ contract and real REG4 approved package', () => {
  assert.equal(ACTION, 'project.get_progress_summary');
  assert.equal(PERMISSION, 'project.progress.read');
  assert.equal(EFFECT_CLASS, 'READ');
  const f = fixture();
  const record = f.registry.getAgentPackage(AGENT_CONTRACT.agent_id, AGENT_CONTRACT.version);
  assert.equal(record.approval_status, 'APPROVED');
  assert.equal(record.package_sha256, f.request.package_sha256);
  assert.equal(f.request.reg4_baseline_commit, REG4_BASELINE.commit);
  assert.equal(f.request.reg4_baseline_tree, REG4_BASELINE.tree);
  assert.deepEqual(Object.keys(f.authority.snapshot()).sort(), ['delegation', 'identities', 'now', 'policy', 'scope', 'task']);
  assert.deepEqual(Object.keys(f.authority.snapshot().scope).sort(), ['company_id', 'permissions_by_principal', 'resource_id', 'version']);
});

add('R01 BOS, pre-effect audit and execution are separate zero-read handoffs', () => {
  const trace = [];
  const f = fixture({ beforeAudit: (_f, e) => { trace.push(e.event); },
    beforeDomain: () => { trace.push('DOMAIN_CALL'); }, beforeRead: () => { trace.push('REPOSITORY_CALL'); } });
  const control = f.allow();
  noData(control, 'PERMITTED', f.request);
  assert.equal(control.decision, 'ALLOW');
  assert.equal(f.domain.callCount(), 0);
  assert.equal(f.repository.readCount(), 0);
  assert.equal(f.proof.applicationCallCount(), 0);
  assert.equal(f.proof.releaseCount(), 0);
  assert.deepEqual(trace, []);
  const ready = f.ready(control);
  noData(ready, 'READY', f.request);
  assert.equal(ready.decision, 'ALLOW');
  assert.notEqual(ready.permit, control.permit);
  assert.equal(f.domain.callCount(), 0);
  assert.equal(f.repository.readCount(), 0);
  assert.equal(f.proof.applicationCallCount(), 0);
  assert.deepEqual(trace, AUDIT_EVENTS.slice(0, 3));
  succeeded(f, f.proof.applicationService.execute(ready.permit, f.request));
  assert.deepEqual(trace, [...AUDIT_EVENTS.slice(0, 4), 'DOMAIN_CALL', 'DOMAIN_DECISION',
    'REPOSITORY_CALL', ...AUDIT_EVENTS.slice(5)]);
  assert.equal(f.audit.listRecords().at(-1).event, 'RESULT');
  assert.equal(f.audit.listRecords().at(-1).status, 'PREPARED');
});

add('R01 a control permit alone cannot invoke the Application Service', () => {
  const f = fixture();
  const control = f.allow();
  noRead(f, f.proof.applicationService.execute(control.permit, f.request));
  assert.equal(f.domain.callCount(), 0);
  const ready = f.ready(control);
  succeeded(f, f.proof.applicationService.execute(ready.permit, f.request));
});

for (const event of AUDIT_EVENTS) add(`R02 ${event} primary audit failure never releases data`, () => {
  const f = fixture({ failAt: [event] });
  const result = f.run();
  noRelease(f, result, 'STOPPED');
  if (AUDIT_EVENTS.indexOf(event) <= 4) {
    assert.equal(f.repository.readCount(), 0);
    assert.equal(f.repository.callCount(), 0);
  } else assert.equal(f.repository.readCount(), 1);
  assert.equal(f.domain.callCount(), AUDIT_EVENTS.indexOf(event) >= 4 ? 1 : 0);
  assert.ok(f.proof.listSecondaryAudit().length > 0);
});

for (const event of AUDIT_EVENTS) for (const hook of ['beforeAudit', 'afterAudit']) {
  add(`R02 ${hook} ${event} hostile exception fails closed`, () => {
    const poison = new Proxy({}, { get() { throw new Error(SECRET); } });
    const f = fixture({ [hook]: (_f, metadata) => { if (metadata.event === event) throw poison; } });
    noRelease(f, f.run(), 'STOPPED');
    if (AUDIT_EVENTS.indexOf(event) < 4) assert.equal(f.domain.callCount(), 0);
  });
}

for (const event of ['ACTION_INTENT', 'PRE_EFFECT_READY', 'READ_COMPLETED', 'FILTERED', 'REDACTED', 'RESULT']) {
  for (const hook of ['beforeAudit', 'afterAudit']) add(`R02 ${hook} ${event} returned data cannot replace audit success`, () => {
    const f = fixture({ [hook]: (_f, metadata) => metadata.event === event ? { secret: SECRET, status: 'ALLOW' } : undefined });
    noRelease(f, f.run(), 'STOPPED');
  });
}

for (const decision of ['DENY', 'STOP']) for (const exists of [true, false]) {
  add(`R03 Domain ${decision}, exists=${exists}: no repository call or existence disclosure`, () => {
    const f = fixture({ domainDecision: decision, editDomain: (d) => { d.exists = exists; } });
    noRead(f, f.run(), decision === 'DENY' ? 'DENIED' : 'STOPPED');
    assert.equal(f.domain.callCount(), 1);
  });
}

add('R03 missing, denied and mismatched Domain resources have the same public envelope', () => {
  const edits = [d => { d.exists = false; }, d => { d.decision = 'DENY'; }, d => { d.company_id = 'other'; },
    d => { d.resource_id = 'other'; }, d => { d.version = '8'; }];
  const results = edits.map(editDomain => {
    const f = fixture({ editDomain });
    const result = f.run();
    noRead(f, result);
    return shape(result);
  });
  for (const result of results) assert.deepEqual(result, results[0]);
});

add('R03 unavailable Domain is STOPPED before repository', () => {
  const f = fixture();
  f.domain.replace(null);
  noRead(f, f.run(), 'STOPPED');
});

for (const hook of ['beforeDomain', 'afterDomain']) for (const failure of ['throw', 'returned value']) {
  add(`R03 ${hook} ${failure} stops before repository`, () => {
    const f = fixture({ [hook]: () => { if (failure === 'throw') throw new Error(SECRET); return { status: 'ALLOW', secret: SECRET }; } });
    noRead(f, f.run(), 'STOPPED');
  });
}

const authorityChanges = {
  'requester inactive': d => { d.identities.requester.active = false; },
  'executor inactive': d => { d.identities.executor.active = false; },
  'owner inactive': d => { d.identities.owner.active = false; },
  'requester permission revoked': d => { d.identities.requester.permissions = []; },
  'executor permission revoked': d => { d.identities.executor.permissions = []; },
  'owner permission revoked': d => { d.identities.owner.permissions = []; },
  'requester cross tenant': d => { d.identities.requester.company_id = 'other'; },
  'executor cross tenant': d => { d.identities.executor.company_id = 'other'; },
  'owner cross tenant': d => { d.identities.owner.company_id = 'other'; },
  'executor package changed': d => { d.identities.executor.package_sha256 = 'f'.repeat(64); },
  'task inactive': d => { d.task.active = false; },
  'task expired': d => { d.task.expires_at = NOW; },
  'task permission revoked': d => { d.task.permissions = []; },
  'task tool revoked': d => { d.task.allowed_tools = []; },
  'task action revoked': d => { d.task.allowed_actions = []; },
  'task version changed': d => { d.task.version = '2'; },
  'task tenant changed': d => { d.task.company_id = 'other'; },
  'delegation revoked': d => { d.delegation.revoked = true; },
  'delegation expired': d => { d.delegation.expires_at = NOW; },
  'delegation permission revoked': d => { d.delegation.permissions = []; },
  'delegation tool revoked': d => { d.delegation.allowed_tools = []; },
  'delegation action revoked': d => { d.delegation.allowed_actions = []; },
  'delegation version changed': d => { d.delegation.version = '2'; },
  'delegation tenant changed': d => { d.delegation.company_id = 'other'; },
  'scope resource changed': d => { d.scope.resource_id = 'other'; },
  'scope tenant changed': d => { d.scope.company_id = 'other'; },
  'scope version changed': d => { d.scope.version = '8'; },
  'scope permission revoked': d => { d.scope.permissions_by_principal.owner = []; },
  'policy ID changed': d => { d.policy.policy_id = 'other'; },
  'policy version changed': d => { d.policy.policy_version = 'other'; },
  'policy tenant changed': d => { d.policy.company_id = 'other'; },
  'policy permission revoked': d => { d.policy.role_permissions.requester = []; },
  'policy tool revoked': d => { d.policy.allowed_tools = []; },
  'policy action revoked': d => { d.policy.allowed_actions = []; },
  'policy prohibits READ': d => { d.policy.prohibited_actions = [ACTION]; },
  'intent expired': d => { d.now = FUTURE; },
  'clock rollback': d => { d.now = PAST; },
};
for (const [label, edit] of Object.entries(authorityChanges)) for (const boundary of ['preAudit', 'preExecution', 'afterDomain']) {
  add(`R04 ${label} at ${boundary} prevents repository access`, () => {
    const f = fixture({ afterDomain: x => { if (boundary === 'afterDomain') x.change(edit); } });
    const c = f.allow();
    assert.equal(c.status, 'PERMITTED');
    if (boundary === 'preAudit') {
      f.change(edit);
      noRead(f, f.ready(c));
    } else {
      const e = f.ready(c);
      assert.equal(e.status, 'READY');
      if (boundary === 'preExecution') f.change(edit);
      noRead(f, f.proof.applicationService.execute(e.permit, f.request));
    }
  });
}

for (const status of ['DRAFT', 'IN_REVIEW', 'BLOCKED', 'RETIRED']) add(`R04 real REG4 ${status} cannot issue READ control`, () => {
  const f = fixture({ status });
  noRead(f, f.allow());
  assert.equal(f.domain.callCount(), 0);
});

for (const boundary of ['preAudit', 'preExecution', 'afterDomain', 'afterRead', 'afterResult']) {
  add(`R04 real REG4 retirement at ${boundary} suppresses release`, () => {
    const f = fixture({
      afterDomain: x => { if (boundary === 'afterDomain') x.transition('RETIRED'); },
      afterRead: x => { if (boundary === 'afterRead') x.transition('RETIRED'); },
      afterAudit: (x, e) => { if (boundary === 'afterResult' && e.event === 'RESULT') x.transition('RETIRED'); },
    });
    const c = f.allow();
    if (boundary === 'preAudit') {
      f.transition('RETIRED');
      noRead(f, f.ready(c));
      return;
    }
    const e = f.ready(c);
    if (boundary === 'preExecution') f.transition('RETIRED');
    const result = f.proof.applicationService.execute(e.permit, f.request);
    noRelease(f, result, 'DENIED');
    if (['preExecution', 'afterDomain'].includes(boundary)) assert.equal(f.repository.readCount(), 0);
  });
}

for (const [label, editAgent] of [
  ['permission', a => { a.permissions = ['project.other.read']; }], ['tool', a => { a.required_tools = []; }],
  ['prohibited READ action', a => { a.prohibited_actions = [ACTION]; }],
]) add(`R04 real approved package without usable ${label} is denied`, () => {
  const f = fixture({ editAgent });
  noRead(f, f.allow());
});

for (const boundary of ['beforeAudit', 'afterAudit']) for (const event of AUDIT_EVENTS.slice(0, 3)) {
  add(`R04 revocation during ${boundary} ${event} prevents execution permit`, () => {
    const f = fixture({ [boundary]: (x, metadata) => { if (metadata.event === event) x.change(d => { d.delegation.revoked = true; }); } });
    noRead(f, f.ready());
    assert.equal(f.domain.callCount(), 0);
  });
}

for (const key of BINDINGS) for (const stage of ['preAudit', 'execution']) {
  add(`R05 ${stage} rejects substituted binding ${key} without consuming genuine permit`, () => {
    const f = fixture();
    const c = f.allow();
    const e = stage === 'execution' ? f.ready(c) : null;
    const bad = { ...f.request, [key]: key.includes('sha256') ? 'c'.repeat(64) : key === 'valid_until' ? PAST : 'other' };
    noRead(f, stage === 'preAudit' ? f.proof.preEffectAudit.record(c.permit, bad)
      : f.proof.applicationService.execute(e.permit, bad));
    assert.equal(f.domain.callCount(), 0);
    const genuine = e || f.ready(c);
    succeeded(f, f.proof.applicationService.execute(genuine.permit, f.request));
  });
}

for (const originalLimit of ['task', 'delegation', 'request']) for (const stage of ['preAudit', 'execution', 'repeatControl']) {
  add(`R05 original ${originalLimit} expiry survives extensions at ${stage}`, () => {
    const f = fixture();
    if (originalLimit === 'request') f.request.valid_until = EARLY;
    else f.change(d => { d[originalLimit].expires_at = EARLY; });
    const c = f.allow();
    assert.equal(c.status, 'PERMITTED');
    const e = stage === 'execution' ? f.ready(c) : null;
    f.change(d => { d.now = LATER; d.task.expires_at = FUTURE; d.delegation.expires_at = FUTURE; });
    const result = stage === 'repeatControl' ? f.allow() : stage === 'preAudit'
      ? f.ready(c) : f.proof.applicationService.execute(e.permit, f.request);
    noRead(f, result);
  });
}

for (const stage of ['preAudit', 'execution']) add(`R05 ${stage} rejects forged copied proxy and cross-instance permits`, () => {
  const f = fixture();
  const g = fixture();
  const c = f.allow();
  const e = f.ready(c);
  const real = stage === 'preAudit' ? c.permit : e.permit;
  const foreign = stage === 'preAudit' ? g.allow().permit : g.ready().permit;
  const revoked = Proxy.revocable(real, {}); revoked.revoke();
  for (const bad of [null, {}, { ...real }, new Proxy(real, {}), revoked.proxy, foreign,
    stage === 'preAudit' ? e.permit : c.permit]) {
    noRead(f, stage === 'preAudit' ? f.proof.preEffectAudit.record(bad, f.request)
      : f.proof.applicationService.execute(bad, f.request));
  }
  assert.ok(Object.isFrozen(real));
  succeeded(f, f.proof.applicationService.execute(e.permit, f.request));
});

add('R05 payload is exact current include and hash-bound', () => {
  for (const payload of [{ include: 'history' }, { include: 'current', private_note: SECRET }, {}, [], null]) {
    const f = fixture();
    const request = { ...f.request, payload, payload_sha256: payloadSha256(payload) };
    noRead(f, f.proof.bos.evaluate(request));
    assert.equal(f.domain.callCount(), 0);
  }
  const f = fixture();
  noRead(f, f.proof.bos.evaluate({ ...f.request, payload_sha256: 'c'.repeat(64) }));
});

add('R06 fifty sequential retries across all three APIs return metadata only', () => {
  const f = fixture();
  const c = f.allow();
  const e = f.ready(c);
  succeeded(f, f.proof.applicationService.execute(e.permit, f.request));
  for (let i = 0; i < 50; i++) for (const result of [
    f.proof.bos.evaluate(delivery(f, i)),
    f.proof.preEffectAudit.record(c.permit, delivery(f, i)),
    f.proof.applicationService.execute(e.permit, delivery(f, i)),
  ]) {
    noData(result, 'EXECUTED', f.request);
    assert.equal(result.duplicate, true);
  }
  assert.equal(f.domain.callCount(), 1);
  assert.equal(f.repository.readCount(), 1);
  assert.equal(f.pipeline.filterCount(), 1);
  assert.equal(f.pipeline.redactionCount(), 1);
  assert.equal(f.proof.releaseCount(), 1);
  assert.equal(f.proof.listReceipts().length, 1);
  assert.equal(JSON.stringify(f.proof.listReceipts()).includes('ON_TRACK'), false);
});

add('R06 Promise-scheduled control, audit and execution callers release only once', async () => {
  const f = fixture();
  const controls = await Promise.all(Array.from({ length: 32 }, (_, i) => Promise.resolve().then(() => f.proof.bos.evaluate(delivery(f, i)))));
  assert.ok(controls.every(r => r.status === 'PERMITTED'));
  controls.forEach(r => noData(r, 'PERMITTED'));
  assert.equal(f.repository.readCount(), 0);
  const executions = await Promise.all(controls.map((r, i) => Promise.resolve().then(() => f.proof.preEffectAudit.record(r.permit, delivery(f, i)))));
  assert.ok(executions.every(r => r.status === 'READY'));
  executions.forEach(r => noData(r, 'READY'));
  assert.equal(f.repository.readCount(), 0);
  const results = await Promise.all(executions.map((r, i) => Promise.resolve().then(() => f.proof.applicationService.execute(r.permit, delivery(f, i)))));
  assert.equal(results.filter(r => r.data_released).length, 1);
  for (const r of results.filter(r => !r.data_released)) { noData(r, 'EXECUTED'); assert.equal(r.duplicate, true); }
  assert.equal(f.domain.callCount(), 1);
  assert.equal(f.repository.readCount(), 1);
  assert.equal(f.proof.releaseCount(), 1);
});

add('R06 reentrant BOS registry read keeps issuance reservation', () => {
  const nested = [];
  const f = fixture({ onRegistry: x => { nested.push(x.allow()); } });
  noData(f.allow(), 'PERMITTED');
  assert.ok(nested.length > 0);
  nested.forEach(r => noData(r, 'IN_PROGRESS'));
  assert.equal(f.domain.callCount(), 0);
  assert.equal(f.repository.readCount(), 0);
});

for (const event of AUDIT_EVENTS.slice(0, 3)) for (const hook of ['beforeAudit', 'afterAudit']) {
  add(`R06 reentrant pre-effect record at ${hook} ${event} is IN_PROGRESS`, () => {
    const nested = [];
    let control;
    const f = fixture({ [hook]: (x, metadata) => {
      if (metadata.event === event) {
        nested.push(x.proof.preEffectAudit.record(control, x.request));
        nested.push(x.allow());
      }
    } });
    control = f.allow().permit;
    const e = f.proof.preEffectAudit.record(control, f.request);
    assert.equal(e.status, 'READY');
    assert.equal(nested.length, 2);
    nested.forEach(r => noData(r, 'IN_PROGRESS'));
    succeeded(f, f.proof.applicationService.execute(e.permit, f.request));
  });
}

const executionHooks = ['beforeDomain', 'afterDomain', 'beforeRead', 'afterRead',
  'beforeFilter', 'afterFilter', 'beforeRedact', 'afterRedact'];
for (const point of [...executionHooks, ...AUDIT_EVENTS.slice(3)]) {
  add(`R06 all three APIs reentered at ${point} preserve the execution reservation`, () => {
    const nested = [];
    let control;
    let execution;
    const replay = x => {
      nested.push(x.allow());
      nested.push(x.proof.preEffectAudit.record(control, x.request));
      nested.push(x.proof.applicationService.execute(execution, x.request));
    };
    const options = executionHooks.includes(point) ? { [point]: replay }
      : { beforeAudit: (x, metadata) => { if (metadata.event === point) replay(x); } };
    const f = fixture(options);
    control = f.allow().permit;
    execution = f.proof.preEffectAudit.record(control, f.request).permit;
    succeeded(f, f.proof.applicationService.execute(execution, f.request));
    assert.equal(nested.length, 3);
    nested.forEach(r => noData(r, 'IN_PROGRESS'));
  });
}

for (const stage of ['control', 'preAudit', 'execution']) add(`R06 terminal ${stage} replay holds receipt lock through registry callbacks`, () => {
  let armed = false;
  let control;
  let execution;
  const nested = [];
  const f = fixture({ onRegistry: x => {
    if (armed) {
      nested.push(x.allow());
      nested.push(x.proof.preEffectAudit.record(control, x.request));
      nested.push(x.proof.applicationService.execute(execution, x.request));
    }
  } });
  control = f.allow().permit;
  execution = f.proof.preEffectAudit.record(control, f.request).permit;
  succeeded(f, f.proof.applicationService.execute(execution, f.request));
  armed = true;
  const result = stage === 'control' ? f.allow() : stage === 'preAudit'
    ? f.proof.preEffectAudit.record(control, f.request) : f.proof.applicationService.execute(execution, f.request);
  noData(result, 'EXECUTED');
  assert.equal(result.duplicate, true);
  assert.ok(nested.length >= 3);
  nested.forEach(r => noData(r, 'IN_PROGRESS'));
  assert.equal(f.repository.readCount(), 1);
  assert.equal(f.proof.releaseCount(), 1);
});

for (const stage of ['control', 'preAudit', 'execution']) add(`R06 completed ${stage} replay revalidates revoked authority`, () => {
  const f = fixture();
  const c = f.allow();
  const e = f.ready(c);
  succeeded(f, f.proof.applicationService.execute(e.permit, f.request));
  f.change(d => { d.delegation.revoked = true; });
  const result = stage === 'control' ? f.allow() : stage === 'preAudit'
    ? f.proof.preEffectAudit.record(c.permit, f.request) : f.proof.applicationService.execute(e.permit, f.request);
  noData(result, 'DENIED');
  assert.equal(f.repository.readCount(), 1);
  assert.equal(f.proof.releaseCount(), 1);
});

for (const state of ['permitted', 'ready', 'executing', 'complete']) {
  add(`R06 semantic action and idempotency conflicts at ${state} cannot create a second read`, () => {
    const nested = [];
    const conflict = x => {
      nested.push(x.proof.bos.evaluate({ ...x.request, idempotency_key: 'different-key' }));
      nested.push(x.proof.bos.evaluate({ ...x.request, correlation_id: 'different-correlation' }));
      nested.push(x.proof.bos.evaluate({ ...x.request, action_id: 'different-action' }));
    };
    const f = fixture({ beforeRead: x => { if (state === 'executing') conflict(x); } });
    const c = f.allow();
    if (state === 'permitted') conflict(f);
    const e = f.ready(c);
    if (state === 'ready') conflict(f);
    succeeded(f, f.proof.applicationService.execute(e.permit, f.request));
    if (state === 'complete') conflict(f);
    assert.equal(nested.length, 3);
    nested.forEach(r => noData(r, 'DENIED'));
    assert.equal(f.repository.readCount(), 1);
    assert.equal(f.proof.releaseCount(), 1);
  });
}

add('R06 independent action reentry during final registry check assigns distinct release receipts', () => {
  let armed = false;
  let innerRequest;
  let innerPermit;
  let innerResult;
  const f = fixture({
    afterAudit: (x, metadata) => {
      if (metadata.event === 'RESULT' && metadata.status === 'PREPARED' && metadata.correlation_id === x.request.correlation_id) armed = true;
    },
    onRegistry: x => {
      if (armed) {
        armed = false;
        innerResult = x.proof.applicationService.execute(innerPermit, innerRequest);
      }
    },
  });
  const outerControl = f.allow();
  const outerReady = f.ready(outerControl);
  innerRequest = { ...f.request, request_id: 'independent-request', correlation_id: 'independent-correlation',
    idempotency_key: 'independent-key', action_id: 'ACT-READ-INDEPENDENT' };
  const innerControl = f.proof.bos.evaluate(innerRequest);
  innerPermit = f.proof.preEffectAudit.record(innerControl.permit, innerRequest).permit;
  const outerResult = f.proof.applicationService.execute(outerReady.permit, f.request);
  for (const result of [outerResult, innerResult]) {
    assert.equal(result.status, 'EXECUTED');
    assert.equal(result.data_released, true);
    assert.deepEqual(result.data, SAFE_DATA);
  }
  assert.notEqual(outerResult.release_id, innerResult.release_id);
  assert.equal(f.repository.readCount(), 2);
  assert.equal(f.proof.releaseCount(), 2);
  assert.equal(new Set(f.proof.listReceipts().map(r => r.release_id)).size, 2);
  noData(f.proof.applicationService.execute(outerReady.permit, f.request), 'EXECUTED');
  noData(f.proof.applicationService.execute(innerPermit, innerRequest), 'EXECUTED');
  assert.equal(f.repository.readCount(), 2);
  assert.equal(f.proof.releaseCount(), 2);
});

add('R06 conflicting nested request cannot unlock an outer reservation', () => {
  const nested = [];
  let control;
  const f = fixture({ beforeAudit: (x, e) => {
    if (e.event === 'PRE_EFFECT_READY') {
      nested.push(x.proof.preEffectAudit.record(control, { ...x.request, correlation_id: 'conflict' }));
      nested.push(x.proof.preEffectAudit.record(control, x.request));
    }
  } });
  control = f.allow().permit;
  const e = f.proof.preEffectAudit.record(control, f.request);
  assert.deepEqual(nested.map(r => r.status), ['DENIED', 'IN_PROGRESS']);
  nested.forEach(r => noData(r));
  succeeded(f, f.proof.applicationService.execute(e.permit, f.request));
});

for (const mode of ['THROW', 'INVALID_RESULT']) add(`R07 repository ${mode} never releases data or blindly retries`, () => {
  const f = fixture({ mode });
  const c = f.allow();
  const e = f.ready(c);
  noRelease(f, f.proof.applicationService.execute(e.permit, f.request), 'STOPPED');
  const calls = f.repository.callCount();
  for (const result of [f.allow(), f.proof.preEffectAudit.record(c.permit, f.request),
    f.proof.applicationService.execute(e.permit, f.request)]) noRelease(f, result, 'STOPPED');
  assert.equal(f.repository.callCount(), calls);
  assert.equal(calls, 1);
});

for (const [label, edit] of [['null', null], ['tenant', d => { d.company_id = 'other'; }],
  ['resource', d => { d.resource_id = 'other'; }], ['version', d => { d.version = '8'; }]]) {
  add(`R07 unusable repository ${label} is uniformly STOPPED`, () => {
    const f = fixture(edit === null ? { row: null } : { editRow: edit });
    noRelease(f, f.run(), 'STOPPED');
    assert.equal(f.domain.callCount(), 1);
    assert.equal(f.repository.callCount(), 1);
  });
}

for (const hook of ['beforeRead', 'afterRead', 'beforeFilter', 'afterFilter', 'beforeRedact', 'afterRedact']) {
  for (const failure of ['throw', 'returned value']) add(`R07 ${hook} ${failure} prevents entire data release`, () => {
    const f = fixture({ [hook]: () => {
      if (failure === 'throw') throw new Proxy({}, { get() { throw new Error(SECRET); } });
      return { data: { status: SECRET }, decision: 'ALLOW' };
    } });
    noRelease(f, f.run(), 'STOPPED');
  });
}

for (const failure of ['filter', 'redaction']) add(`R07 explicit ${failure} failure suppresses projection`, () => {
  const f = fixture();
  f.pipeline.setFailures({ filter: failure === 'filter', redaction: failure === 'redaction' });
  noRelease(f, f.run(), 'STOPPED');
  assert.equal(f.repository.readCount(), 1);
});

for (const point of ['beforeRead', 'afterRead', 'beforeFilter', 'afterFilter', 'beforeRedact', 'afterRedact', 'beforeResult', 'afterResult', 'finalRegistry']) {
  add(`R07 authority revoked at ${point} cannot escape final release checks`, () => {
    let finalRegistry = false;
    const revoke = x => x.change(d => { d.delegation.revoked = true; });
    const options = {};
    if (!['beforeResult', 'afterResult', 'finalRegistry'].includes(point)) options[point] = revoke;
    options.beforeAudit = (x, e) => { if (point === 'beforeResult' && e.event === 'RESULT') revoke(x); };
    options.afterAudit = (x, e) => {
      if (e.event === 'RESULT') {
        if (point === 'afterResult') revoke(x);
        if (point === 'finalRegistry') finalRegistry = true;
      }
    };
    options.onRegistry = x => { if (finalRegistry) revoke(x); };
    const f = fixture(options);
    noRelease(f, f.run(), 'DENIED');
  });
}

for (const dependency of ['domain', 'repository', 'pipeline']) for (const point of ['afterRead', 'afterResult', 'finalRegistry']) {
  add(`R07 ${dependency} revision changed at ${point} prevents release even with identical values`, () => {
    let armed = false;
    const mutate = x => {
      if (dependency === 'domain') x.domain.replace(x.domainData);
      if (dependency === 'repository') x.repository.replace(x.rowData);
      if (dependency === 'pipeline') x.pipeline.setFailures({ filter: false, redaction: false });
    };
    const f = fixture({ afterRead: x => { if (point === 'afterRead') mutate(x); },
      afterAudit: (x, e) => {
        if (e.event === 'RESULT') {
          if (point === 'afterResult') mutate(x);
          if (point === 'finalRegistry') armed = true;
        }
      }, onRegistry: x => { if (armed) mutate(x); },
    });
    noRelease(f, f.run(), dependency === 'domain' ? 'DENIED' : 'STOPPED');
  });
}

add('R07 final registry retirement after RESULT PREPARED stops release', () => {
  let armed = false;
  let retired = false;
  const f = fixture({ afterAudit: (_f, e) => { if (e.event === 'RESULT') armed = true; },
    onRegistry: x => { if (armed && !retired) { retired = true; x.transition('RETIRED'); } } });
  noRelease(f, f.run(), 'DENIED');
  assert.equal(retired, true);
  assert.equal(f.audit.listRecords().at(-1).status, 'PREPARED');
  assert.equal(f.proof.listReceipts().some(r => r.data_released === true), false);
});

add('R07 RESULT hooks occur before release, with no callback after data becomes visible', () => {
  const seen = [];
  const observe = (f, metadata) => { seen.push(f.proof.releaseCount()); frozenMetadata(metadata); };
  const f = fixture(Object.fromEntries([...executionHooks, 'beforeAudit', 'afterAudit'].map(key => [key, observe])));
  succeeded(f, f.run());
  assert.ok(seen.length > 15);
  assert.ok(seen.every(count => count === 0));
});

for (const [field, value] of [
  ['status', SECRET], ['status', 'on_track'], ['status', null], ['status', { text: SECRET }],
  ['progress_percent', -1], ['progress_percent', 101], ['progress_percent', '42'],
  ['progress_percent', null], ['progress_percent', {}], ['progress_percent', []],
]) add(`R08 unsafe projection ${field} ${JSON.stringify(value)} fails closed`, () => {
  const f = fixture({ editRow: row => { row.fields[field] = value; } });
  noRelease(f, f.run(), 'STOPPED');
  assert.equal(f.repository.readCount(), 1);
});

for (const value of [SECRET, { private: SECRET }, [SECRET], null, 999]) {
  add(`R08 owner contact ${JSON.stringify(value)} is replaced by a fixed redaction`, () => {
    const f = fixture({ editRow: row => { row.fields.owner_contact = value; } });
    succeeded(f, f.run());
    assert.equal(JSON.stringify([f.audit.listRecords(), f.proof.listSecondaryAudit(), f.proof.listReceipts()]).includes(SECRET), false);
  });
}

for (const [status, progress] of [['ON_TRACK', 0], ['AT_RISK', 50], ['BLOCKED', 100]]) {
  add(`R08 safe enum ${status} and integer boundary ${progress} remain usable`, () => {
    const f = fixture({ editRow: row => { row.fields.status = status; row.fields.progress_percent = progress; } });
    const result = f.run();
    assert.equal(result.status, 'EXECUTED');
    assert.deepEqual(result.data, { status, progress_percent: progress, owner_contact: '[REDACTED]' });
    assert.deepEqual(Object.keys(result.data).sort(), ['owner_contact', 'progress_percent', 'status']);
    assert.equal(f.proof.releaseCount(), 1);
  });
}

const hostile = {
  getter: () => Object.defineProperty({}, 'action_id', { enumerable: true, get() { throw new Error(SECRET); } }),
  proxy: () => new Proxy({}, { ownKeys() { throw new Error(SECRET); }, get() { throw new Error(SECRET); } }),
  'revoked proxy': () => { const p = Proxy.revocable({}, {}); p.revoke(); return p.proxy; },
  cycle: () => { const x = {}; x.payload = x; return x; },
  'foreign prototype': () => Object.create({ action_id: SECRET }),
  symbol: () => ({ [Symbol(SECRET)]: SECRET }),
  'oversized string': () => ({ action_id: 'x'.repeat(4097) }),
};
for (const [label, make] of Object.entries(hostile)) for (const stage of ['control', 'preAudit', 'execution']) {
  add(`R08 hostile ${label} at ${stage} never executes user code or leaks exceptions`, () => {
    const f = fixture();
    const c = stage !== 'control' ? f.allow() : null;
    const e = stage === 'execution' ? f.ready(c) : null;
    let result;
    assert.doesNotThrow(() => {
      result = stage === 'control' ? f.proof.bos.evaluate(make()) : stage === 'preAudit'
        ? f.proof.preEffectAudit.record(c.permit, make()) : f.proof.applicationService.execute(e.permit, make());
    });
    noRead(f, result);
    assert.notEqual(result.correlation_id, f.request.correlation_id);
    assert.equal(f.domain.callCount(), 0);
  });
}

for (const stage of ['control', 'preAudit', 'execution']) add(`R08 ${stage} rejects an accessor inside a valid request without invoking it`, () => {
  let invoked = 0;
  const f = fixture();
  const payload = Object.defineProperty({}, 'include', { enumerable: true, get() { invoked++; return 'current'; } });
  const request = { ...f.request, payload };
  const c = f.allow();
  const e = f.ready(c);
  const result = stage === 'control' ? f.proof.bos.evaluate(request) : stage === 'preAudit'
    ? f.proof.preEffectAudit.record(c.permit, request) : f.proof.applicationService.execute(e.permit, request);
  noRead(f, result);
  assert.equal(invoked, 0);
});

for (const label of ['request', 'payload', 'authority', 'row', 'domain']) {
  add(`R08 ${label} Proxy is rejected without invoking traps`, () => {
    let traps = 0;
    const f = fixture();
    const source = label === 'request' ? f.request : label === 'payload' ? f.request.payload
      : label === 'authority' ? f.data : label === 'row' ? f.rowData : f.domainData;
    const proxy = new Proxy(source, { get() { traps++; throw new Error(SECRET); }, ownKeys() { traps++; throw new Error(SECRET); },
      getPrototypeOf() { traps++; throw new Error(SECRET); } });
    if (label === 'request') noRead(f, f.proof.bos.evaluate(proxy));
    else if (label === 'payload') noRead(f, f.proof.bos.evaluate({ ...f.request, payload: proxy }));
    else assert.throws(() => (label === 'authority' ? createReadAuthority : label === 'row'
      ? createFakeReadRepository : createFakeReadDomain)(proxy));
    assert.equal(traps, 0);
  });
}

for (const [label, mutate] of [
  ['authority project data', d => { d.project = { status: SECRET }; }],
  ['scope existence', d => { d.scope.exists = true; }],
  ['scope project fields', d => { d.scope.fields = { private_note: SECRET }; }],
  ['policy business fields', d => { d.policy.status = SECRET; }],
]) add(`R08 authority exact schema rejects ${label}`, () => {
  const f = fixture();
  mutate(f.data);
  assert.throws(() => createReadAuthority(f.data));
  assert.equal(f.domain.callCount(), 0);
  assert.equal(f.repository.readCount(), 0);
});

add('R08 repository rejects getters, fractional values and extra top-level fields before execution', () => {
  const f = fixture();
  let gets = 0;
  const fields = Object.defineProperty({ progress_percent: 42 }, 'status', { enumerable: true,
    get() { gets++; return SECRET; } });
  assert.throws(() => createFakeReadRepository({ ...f.rowData, fields }));
  assert.equal(gets, 0);
  assert.throws(() => createFakeReadRepository({ ...f.rowData, fields: { status: 'ON_TRACK', progress_percent: 0.5 } }));
  assert.throws(() => createFakeReadRepository({ ...f.rowData, extra: SECRET }));
  assert.throws(() => createFakeReadDomain({ ...f.domainData, fields: { private_note: SECRET } }));
});

for (const label of ['missing', 'proxy', 'getter', 'tampered package']) {
  add(`R08 unverifiable REG4 ${label} fails without data or raw exception text`, () => {
    let invoked = 0;
    const f = fixture({ registryResult: record => {
      if (label === 'missing') return null;
      if (label === 'proxy') return new Proxy(record, { get() { invoked++; throw new Error(SECRET); } });
      if (label === 'getter') return Object.defineProperty({}, 'approval_status', { enumerable: true,
        get() { invoked++; throw new Error(SECRET); } });
      return { ...record, package_sha256: 'f'.repeat(64) };
    } });
    noRead(f, f.allow());
    assert.equal(invoked, 0);
  });
}

for (const label of ['authority', 'domain', 'repository', 'pipeline', 'audit']) {
  add(`R08 copied ${label} harness cannot forge a private dependency brand`, () => {
    const f = fixture();
    const deps = { registry: f.gateRegistry, authority: createReadAuthority(f.data),
      domain: createFakeReadDomain(f.domainData), repository: createFakeReadRepository(f.rowData),
      pipeline: createFakeReadPipeline(), audit: createFakeReadAuditWriter() };
    deps[label] = { ...deps[label] };
    assert.throws(() => createReadPreEffectHandoffProof(deps), TypeError);
  });
}

for (const label of ['authority', 'domain', 'repository', 'pipeline', 'audit']) {
  add(`R08 a bound ${label} cannot be reused to reset one-shot state`, () => {
    const f = fixture();
    const deps = { registry: f.gateRegistry, authority: createReadAuthority(f.data),
      domain: createFakeReadDomain(f.domainData), repository: createFakeReadRepository(f.rowData),
      pipeline: createFakeReadPipeline(), audit: createFakeReadAuditWriter() };
    deps[label] = f[label];
    assert.throws(() => createReadPreEffectHandoffProof(deps), TypeError);
    succeeded(f, f.run());
  });
}

add('R08 source API exposes metadata counters and no raw read or raw inspection API', () => {
  const f = fixture();
  assert.deepEqual(Object.keys(f.domain).sort(), ['callCount', 'replace']);
  assert.deepEqual(Object.keys(f.repository).sort(), ['callCount', 'readCount', 'replace']);
  assert.deepEqual(Object.keys(f.pipeline).sort(), ['filterCount', 'redactionCount', 'setFailures']);
  assert.deepEqual(Object.keys(f.proof).sort(), ['applicationCallCount', 'applicationService', 'bos',
    'listReceipts', 'listSecondaryAudit', 'preEffectAudit', 'releaseCount']);
  for (const value of [f.domain, f.repository, f.pipeline, f.proof, f.proof.bos, f.proof.preEffectAudit, f.proof.applicationService]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.equal(f.domain.snapshot, undefined);
  assert.equal(f.repository.read, undefined);
  assert.equal(f.repository.snapshot, undefined);
  assert.equal(f.proof.listResults, undefined);
});

add('R08 snapshots isolate caller mutation from authority, Domain and row state', () => {
  const f = fixture();
  f.data.delegation.revoked = true;
  f.domainData.decision = 'DENY';
  f.rowData.fields.status = SECRET;
  const snapshot = f.authority.snapshot();
  snapshot.delegation.revoked = true;
  assert.equal(f.authority.snapshot().delegation.revoked, false);
  succeeded(f, f.run());
});

add('R09 ledgers and metadata receipts have intact chains and exclude raw data and data hashes', () => {
  const f = fixture();
  const result = f.run();
  succeeded(f, result);
  const forbiddenHashes = [payloadSha256(f.rowData), payloadSha256(f.rowData.fields), payloadSha256(result.data),
    createHash('sha256').update(SECRET).digest('hex')];
  const records = [f.audit.listRecords(), f.proof.listSecondaryAudit(), f.proof.listReceipts()];
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes('ON_TRACK'), false);
  assert.equal(serialized.includes('[REDACTED]'), false);
  for (const digest of forbiddenHashes) assert.equal(serialized.includes(digest), false);
  for (const key of ['payload', 'row', 'fields', 'data', 'payload_sha256', 'row_sha256', 'output_sha256', 'data_sha256', 'result_sha256']) {
    assert.equal(serialized.includes(`"${key}":`), false);
  }
  for (const ledger of records.slice(0, 2)) {
    checkChain(ledger);
    assert.ok(ledger.every(r => r.correlation_id === f.request.correlation_id));
  }
  const oldPrimary = f.audit.listRecords();
  oldPrimary[0].reason_code = 'TAMPER'; oldPrimary.length = 0;
  assert.notEqual(f.audit.listRecords()[0].reason_code, 'TAMPER');
  const oldSecondary = f.proof.listSecondaryAudit(); oldSecondary[0].reason_code = 'TAMPER';
  assert.notEqual(f.proof.listSecondaryAudit()[0].reason_code, 'TAMPER');
  const oldReceipts = f.proof.listReceipts(); oldReceipts[0].status = 'TAMPER'; oldReceipts.length = 0;
  assert.equal(f.proof.listReceipts()[0].status, 'EXECUTED');
  assert.throws(() => { result.data.status = SECRET; }, TypeError);
});

add('R09 success and hostile failure paths never print raw data or exceptions', () => {
  const captured = [];
  const methods = ['log', 'warn', 'error', 'debug'];
  const original = Object.fromEntries(methods.map(method => [method, console[method]]));
  try {
    for (const method of methods) console[method] = (...values) => { captured.push(values); };
    const success = fixture();
    succeeded(success, success.run());
    const failure = fixture({ afterRead: () => { throw new Error(SECRET); } });
    noRelease(failure, failure.run(), 'STOPPED');
  } finally {
    for (const method of methods) console[method] = original[method];
  }
  assert.deepEqual(captured, []);
});

add('R09 ledgers remain readable beyond 200 actions and 500 terminal duplicates', () => {
  const f = fixture();
  let c;
  let e;
  for (let i = 0; i < 201; i++) {
    Object.assign(f.request, { action_id: `ACT-READ-${i}`, idempotency_key: `read-key-${i}` });
    c = f.allow(); e = f.ready(c);
    const result = f.proof.applicationService.execute(e.permit, f.request);
    assert.equal(result.status, 'EXECUTED');
    assert.deepEqual(result.data, SAFE_DATA);
  }
  for (let i = 0; i < 500; i++) {
    const result = f.proof.applicationService.execute(e.permit, delivery(f, i));
    noData(result, 'EXECUTED');
    assert.equal(result.duplicate, true);
  }
  assert.equal(f.repository.readCount(), 201);
  assert.equal(f.proof.releaseCount(), 201);
  assert.equal(f.proof.listReceipts().length, 201);
  assert.ok(f.proof.listSecondaryAudit().length > 500);
  checkChain(f.audit.listRecords());
  checkChain(f.proof.listSecondaryAudit());
});

// Register after constructing the matrix, so the Builder count is explicit.
for (const item of cases) test(item.name, item.run);
module.exports = Object.freeze({ builder_case_count: cases.length });
