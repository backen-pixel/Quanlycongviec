'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCommandRepository } = require('../src/modules/marketingAutomation/commandRepository');
const { createCommandService, commandDigest } = require('../src/modules/marketingAutomation/commandService');
const { createTrialService } = require('../src/modules/marketingAutomation/trialService');
const spendSource = require('../src/modules/marketingAutomation/facebookSpendSource');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('command repository preserves command identity across enqueue, claim, finish and recovery', async () => {
  const row = { id: 'command-1', company_id: 'vpt', actor_id: 'actor', policy_version: 'v1', action: 'reply', payload: { text: 'approved' }, state: 'QUEUED', request_digest: 'digest', idempotency_key: 'key', result: null };
  const calls = [], trusted = async () => ({ policyVersion: 'v1' });
  const repository = createCommandRepository({ isPrimary: () => true, loadTrustedContext: trusted, client: {
    async rpc(name, args) { calls.push([name, args]); return { data: name.endsWith('recover') ? 2 : row }; },
  } });
  const command = { id: row.id, companyId: 'vpt', actorId: 'actor', policyVersion: 'v1', action: 'reply', payload: row.payload, state: 'QUEUED', digest: 'digest', idempotencyKey: 'key', result: null };
  assert.equal(repository.loadContext, trusted);
  assert.deepEqual(await repository.enqueue(command), command);
  assert.deepEqual(calls[0], ['marketing_automation_enqueue', { p_company: 'vpt', p_actor: 'actor', p_version: 'v1', p_action: 'reply', p_key: 'key', p_digest: 'digest', p_payload: row.payload }]);
  assert.deepEqual(await repository.claim(), command);
  assert.deepEqual(await repository.finish(command, 'UNKNOWN', { reason: 'NO_ACK' }), command);
  assert.deepEqual(calls[2], ['marketing_automation_finish', { p_id: 'command-1', p_company: 'vpt', p_state: 'UNKNOWN', p_result: { reason: 'NO_ACK' } }]);
  assert.equal(await repository.recover('2026-10-01T00:00:00Z'), 2);
  assert.deepEqual(calls[3], ['marketing_automation_recover', { p_before: '2026-10-01T00:00:00Z' }]);
});

test('repository distinguishes an empty queue from a storage failure and rechecks the writer', async () => {
  let primary = true, response = { data: null }, calls = 0;
  const repository = createCommandRepository({ isPrimary: () => primary, loadTrustedContext: async () => ({}), client: { async rpc() { calls++; return response; } } });
  assert.equal(await repository.claim(), null);
  response = { error: { message: 'private connection detail' } };
  await assert.rejects(repository.claim(), { message: 'AUTOMATION_STORAGE_UNAVAILABLE' });
  primary = false;
  await assert.rejects(repository.recover('2026-10-01'), /PRIMARY_WRITER_REQUIRED/);
  assert.equal(calls, 2);
  for (const options of [{}, { client: {}, isPrimary: () => true }, { client: {}, isPrimary: true, loadTrustedContext() {} }]) {
    assert.throws(() => createCommandRepository(options), /INVALID_REPOSITORY/);
  }
});

test('submit uses authenticated identity and trusted policy rather than caller authority fields', async () => {
  const actor = { id: 'real-actor', companyId: 'vpt' }, intent = { action: 'reply', idempotencyKey: 'once', payload: { text: 'approved' }, actorId: 'forged', companyId: 'other', policyVersion: 'forged', authorized: true };
  const context = { policyVersion: 'approved-v1' }, calls = [];
  const service = createCommandService({ enabled: true, repository: {
    async loadContext(a, i) { assert.equal(a, actor); assert.equal(i, intent); return context; },
    async enqueue(c) { calls.push(c); return c; },
  }, validate: async (c, i) => { assert.equal(c, context); assert.equal(i, intent); return { status: 'ALLOWED' }; } });
  const out = await service.submit(actor, intent);
  const request = { actorId: actor.id, companyId: 'vpt', action: 'reply', policyVersion: 'approved-v1', payload: intent.payload };
  assert.deepEqual(out, { ...request, idempotencyKey: 'once', digest: commandDigest(request) });
  assert.equal(calls.length, 1);
  assert.notEqual(out.digest, commandDigest({ ...request, payload: { text: 'changed' } }));
});

test('invalid, denied and waiting submissions never enter the command queue', async () => {
  let reads = 0, status = 'DENIED';
  const service = createCommandService({ enabled: true, repository: {
    async loadContext() { reads++; return {}; }, enqueue() { assert.fail('must not queue'); },
  }, validate: () => ({ status, reason: 'APPROVAL_REQUIRED' }) });
  for (const [actor, intent] of [[null, {}], [{ id: 'a' }, {}], [{ id: 'a', companyId: 'vpt' }, null], [{ id: 'a', companyId: 'vpt' }, { action: 'reply' }]]) {
    assert.equal((await service.submit(actor, intent)).reason, 'INVALID_COMMAND');
  }
  assert.equal(reads, 0);
  for (status of ['DENIED', 'WAITING_APPROVAL']) {
    assert.deepEqual(await service.submit({ id: 'a', companyId: 'vpt' }, { action: 'reply', idempotencyKey: 'k' }), { status, reason: 'APPROVAL_REQUIRED' });
  }
  assert.throws(() => commandDigest({ missing: undefined }), /NON_JSON_COMMAND/);
  assert.equal(commandDigest([{ b: 2, a: 1 }]), commandDigest([{ a: 1, b: 2 }]));
  assert.throws(() => createCommandService({ repository: {} }), /INVALID_COMMAND_DEPENDENCIES/);
});

test('runner requires an explicitly idempotent executable adapter before any external action', async () => {
  for (const adapter of [undefined, { idempotent: false, execute() { assert.fail(); } }, { idempotent: true }]) {
    const service = createCommandService({ enabled: true, adapters: { reply: adapter }, validate: () => ({ status: 'ALLOWED' }), repository: {
      async claim() { return { id: 'c', actorId: 'a', companyId: 'vpt', policyVersion: 'v1', action: 'reply' }; },
      async loadContext() { return { policyVersion: 'v1' }; },
      async finish(c, state, result) { return { state, ...result }; },
    } });
    assert.deepEqual(await service.runOne(), { state: 'MANUAL_REQUIRED', reason: 'SUPPORTED_ADAPTER_REQUIRED' });
  }
});

// Load the actual module with explicit synthetic ports; never import live Supabase config.
function configuredSpend({ delivery = false, failover = false, target = 'primary', failure, withEvidence = true } = {}) {
  const file = path.resolve(__dirname, '../src/modules/marketingAutomation/facebookSpendSync.js');
  const calls = [], reads = [], module = { exports: {} };
  const client = { async rpc(name, args) {
    calls.push([name, args]);
    return { data: name === 'marketing_spend_begin' ? { id: 7 } : withEvidence ? { deliveryEvidence: { runId: 7, payloadDigest: 'a'.repeat(64) } } : {} };
  } };
  const read = kind => async args => { reads.push({ kind, args }); if (failure) throw Object.assign(Error('private provider detail'), { code: failure }); return { totalVnd: 500000, ...(delivery ? { delivery: {} } : {}) }; };
  const deps = {
    './facebookSpendSource': { ...spendSource, readAccountSpend: read('spend') },
    './facebookAccountDelivery': { readAccountSpendWithDelivery: read('delivery') },
    '../../config/supabaseRouter': { supabase: client, isFailoverEnabled: () => failover, getActiveTarget: () => target },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, process: { env: { VPT_MARKETING_ACCOUNT_DELIVERY: delivery ? '1' : '0', VPT_META_GRAPH_VERSION: 'v24.0' } }, Date, Math, Set, String, Error,
    require(name) { assert.ok(Object.hasOwn(deps, name), 'unexpected dependency'); return deps[name]; },
  }, { filename: file });
  return { run: module.exports.syncConfiguredAccount, calls, reads };
}
const spendAccount = () => ({ ad_account_id: '123', company_id: 'synthetic-vpt', access_token: 'synthetic-token' });

test('configured spend uses Vietnam dates and closes delivery at yesterday across UTC month boundary', async () => {
  for (const [delivery, since, until] of [[false, '2026-10-01', '2026-10-02'], [true, '2026-09-30', '2026-10-01']]) {
    const h = configuredSpend({ delivery });
    const out = await h.run(spendAccount(), { days: 2, now: '2026-10-01T18:00:00Z' });
    assert.equal(out.status, 'COMPLETE');
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0][1])), { p_account: 'act_123', p_company: 'synthetic-vpt', p_since: since, p_until: until });
    assert.equal(h.reads[0].kind, delivery ? 'delivery' : 'spend');
    assert.equal(h.reads[0].args.version, delivery ? 'v24.0' : undefined);
    assert.equal(h.calls.length, 2);
  }
});

test('configured spend clamps bounded history and refuses failover before reading or writing', async () => {
  for (const [days, since] of [[0, '2026-10-01'], [999, '2026-07-04']]) {
    const h = configuredSpend();
    await h.run(spendAccount(), { days, now: '2026-10-01T10:00:00Z' });
    assert.equal(h.calls[0][1].p_since, since);
  }
  for (const options of [{ failover: true }, { target: 'backup' }]) {
    const h = configuredSpend(options);
    await assert.rejects(h.run(spendAccount(), { now: '2026-10-01T10:00:00Z' }), /PRIMARY_ONLY_REQUIRED/);
    assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0);
  }
});

test('configured delivery only completes with matching durable evidence and sanitizes provider failures', async () => {
  for (const options of [{ delivery: true, withEvidence: false }, { failure: 'FACEBOOK_READ_FAILED' }, { delivery: true, failure: 'DELIVERY_SCOPE_CHANGED' }]) {
    const h = configuredSpend(options), out = await h.run(spendAccount(), { days: 1, now: '2026-10-02T10:00:00Z' });
    assert.equal(out.status, 'UNKNOWN');
    assert.equal(out.reason, options.failure || 'SOURCE_OR_STORAGE_FAILED');
    assert.equal(h.calls.at(-1)[1].p_snapshot, null);
    assert.equal(h.calls.at(-1)[1].p_failure, out.reason);
    assert.ok(!JSON.stringify(h.calls).includes('synthetic-token'));
    assert.ok(!JSON.stringify(out).includes('private'));
  }
});

test('trial list rejects foreign and malformed results and preserves an explicitly empty list', async () => {
  const c = { actorId: id(1), companyId: id(2) };
  for (const data of [{ companyId: c.companyId, trials: [] }, { companyId: id(3), trials: [] }, { companyId: c.companyId, trials: null }, null]) {
    const service = createTrialService({ isPrimary: () => true, db: { async rpc(name, args) {
      assert.equal(name, 'marketing_lead_trial_list'); assert.deepEqual(args, { p_actor: c.actorId, p_company: c.companyId }); return { data };
    } } });
    if (data?.companyId === c.companyId && Array.isArray(data.trials)) assert.deepEqual(await service.list(c), data);
    else await assert.rejects(service.list(c), e => e.status === 503);
  }
});

test('trial configuration binds revision and authenticated company; malformed inputs never reach storage', async () => {
  const c = { actorId: id(1), companyId: id(2) }, calls = [];
  const body = { trialId: id(3), requestId: id(4), name: '  Trial VPT  ', since: '2026-10-01', until: '2026-10-30', expectedRevision: 0 };
  const service = createTrialService({ isPrimary: () => true, db: { async rpc(name, args) { calls.push([name, args]); return { data: { revision: 1 } }; } } });
  assert.deepEqual(await service.configure(c, body), { revision: 1 });
  assert.deepEqual(calls[0], ['marketing_lead_trial_set', { p_actor: c.actorId, p_company: c.companyId, p_trial: id(3), p_request: id(4), p_command: { name: 'Trial VPT', since: body.since, until: body.until, expectedRevision: 0 } }]);
  for (const patch of [{ actorId: id(9) }, { expectedRevision: -1 }, { requestId: 'bad' }, { name: 'x' }, { until: null }]) {
    await assert.rejects(service.configure(c, { ...body, ...patch }), e => e.status === 400);
  }
  await assert.rejects(service.list({ ...c, actorId: 'invalid' }), e => e.status === 400);
  assert.equal(calls.length, 1);
});
