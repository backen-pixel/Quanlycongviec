const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');

const {
  DurableControlPlaneFoundation,
  DEFAULT_MAX_JSON_STRING_BYTES,
  HttpDurableStatePortProof,
  HttpKmsKeyProviderProof,
  assertDurableStatePortContract,
  assertKeyProviderContract,
  assertPlainJsonValue,
  authorizationDecisionDigest,
  createEvidenceEnvelope,
  getVerifiedKeyAuditEvents,
  revokeKeyVersion,
  rotateActiveKey,
  sha256Digest,
} = require('../src/softwareFactory');
const { MAX_PROOF_RESPONSE_BYTES } = require('../src/softwareFactory/adapters/proofHttpClient');

const STORE_SERVER = path.join(__dirname, 'fixtures', 'sf2c1-durable-store-proof-server.js');
const KMS_SERVER = path.join(__dirname, 'fixtures', 'sf2c1-kms-proof-server.js');
const WORKER = path.join(__dirname, 'fixtures', 'sf2c1-worker.js');
const ISSUED_DECISIONS = new Set();
const ACTIVE_WORKERS = new Set();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startLocalServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    endpoint: 'http://127.0.0.1:' + server.address().port,
  };
}

async function stopLocalServer(service) {
  if (!service?.server?.listening) return;
  service.server.closeAllConnections?.();
  await new Promise((resolve) => service.server.close(resolve));
}

function isolatedChildEnvironment(extra = {}) {
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'ComSpec']) {
    if (typeof process.env[name] === 'string') environment[name] = process.env[name];
  }
  return { ...environment, ...extra };
}

async function startService(script, environment) {
  const child = spawn(process.execPath, [script], {
    env: isolatedChildEnvironment(environment),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Proof service startup timeout: ' + stderr));
    }, 10000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const newline = stdout.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timer);
      try {
        const ready = JSON.parse(stdout.slice(0, newline));
        if (ready.ready !== true || !Number.isInteger(ready.port)) throw new Error('invalid ready');
        resolve({ child, endpoint: 'http://127.0.0.1:' + ready.port, stderr: () => stderr });
      } catch (error) {
        child.kill();
        reject(new Error('Invalid proof service ready envelope: ' + error.message + ' ' + stderr));
      }
    });
    child.once('exit', (code) => {
      if (stdout.includes('\n')) return;
      clearTimeout(timer);
      reject(new Error('Proof service exited before ready (' + code + '): ' + stderr));
    });
  });
}

async function stopService(service) {
  if (!service?.child || service.child.exitCode !== null) return;
  const gracefulExit = once(service.child, 'exit');
  service.child.kill('SIGTERM');
  await Promise.race([gracefulExit, delay(3000)]);
  if (service.child.exitCode === null) {
    const forcedExit = once(service.child, 'exit');
    service.child.kill('SIGKILL');
    await Promise.race([forcedExit, delay(1000)]);
  }
}

async function controlService(service, token, body) {
  const response = await fetch(service.endpoint + '/control', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const envelope = await response.json();
  if (!response.ok || envelope.ok !== true) throw new Error(JSON.stringify(envelope));
  return envelope.result;
}

function createAuthorization({ scopeId, requestId, requirementId, actorId, operation, policyVersion }) {
  const base = {
    authorization_schema_version: '1.0.0',
    decision_id: 'sf2c1-decision-' + requestId,
    scope_id: scopeId,
    request_id: requestId,
    requirement_id: requirementId,
    operation,
    agent_id: actorId,
    principal_id: 'founder-delegated-principal',
    policy_version: policyVersion,
    outcome: 'ALLOW',
    issued_at: '2026-08-30T00:00:00.000Z',
  };
  const decision = { ...base, decision_digest: authorizationDecisionDigest(base) };
  ISSUED_DECISIONS.add(decision.decision_digest);
  return decision;
}

function createCommand({
  scopeId,
  requestId,
  expectedRevision = 0,
  nextState = { status: 'SF2C1_DURABLE' },
  input = { action: 'SAVE_DURABLE_STATE' },
} = {}) {
  const requirementId = 'sf2c1-requirement-' + requestId;
  const actorId = 'sf-product-owner';
  const operation = 'SAVE_DURABLE_STATE';
  const policyVersion = 'sf-policy-v2';
  const authorization = createAuthorization({
    scopeId,
    requestId,
    requirementId,
    actorId,
    operation,
    policyVersion,
  });
  const evidence = createEvidenceEnvelope({
    evidence_type: 'SF2C1_DURABLE_PROOF',
    subject: scopeId + ':' + requestId,
    provenance: {
      source_type: 'SF2C1_TEST_HARNESS',
      source_refs: [{
        ref: 'sf2c1-proof:' + requestId,
        digest: sha256Digest({ scope_id: scopeId, request_id: requestId }),
      }],
      parent_artifact_ids: [],
      policy_version: policyVersion,
      captured_by: actorId,
      capture_method: 'TEST_HARNESS',
    },
    content: { acceptance: 'PASS', request_id: requestId },
  });
  return {
    scope_id: scopeId,
    request_id: requestId,
    requirement_id: requirementId,
    expected_revision: expectedRevision,
    operation,
    actor_id: actorId,
    authorization,
    input,
    next_state: nextState,
    evidence,
  };
}

function verifierFor(set = ISSUED_DECISIONS) {
  return Object.freeze({
    async verifyDecision({ decision, binding }) {
      return set.has(decision?.decision_digest)
        && decision.scope_id === binding.scope_id
        && decision.request_id === binding.request_id
        && decision.requirement_id === binding.requirement_id
        && decision.operation === binding.operation
        && decision.agent_id === binding.agent_id;
    },
  });
}

function createControl(storeOptions, kmsOptions, verifier = verifierFor()) {
  return new DurableControlPlaneFoundation({
    port: new HttpDurableStatePortProof(storeOptions),
    key_provider: new HttpKmsKeyProviderProof(kmsOptions),
    authorization_verifier: verifier,
  });
}

function runWorker({ command, store, kms }) {
  const child = fork(WORKER, [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: isolatedChildEnvironment(),
    windowsHide: true,
  });
  ACTIVE_WORKERS.add(child);
  child.once('exit', () => ACTIVE_WORKERS.delete(child));
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Worker timeout: ' + stderr));
    }, 20000);
    child.once('message', (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.once('exit', (code) => {
      if (code !== 0 && child.connected) {
        clearTimeout(timer);
        reject(new Error('Worker exit ' + code + ': ' + stderr));
      }
    });
    child.send({
      command,
      store,
      kms,
      allowed_decision_digest: command.authorization.decision_digest,
    });
  });
}

function launchWorker({ command, store, kms }) {
  const child = fork(WORKER, [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: isolatedChildEnvironment(),
    windowsHide: true,
  });
  ACTIVE_WORKERS.add(child);
  child.once('exit', () => ACTIVE_WORKERS.delete(child));
  child.send({
    command,
    store,
    kms,
    allowed_decision_digest: command.authorization.decision_digest,
  });
  return child;
}

async function waitForReceipt(port, scopeId, requestId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const receipt = await port.readReceipt(scopeId, requestId);
    if (receipt) return receipt;
    await delay(50);
  }
  throw new Error('Timed out waiting for committed receipt.');
}

test('SF2-C1 Distributed Durable Store & KMS staging/test-only proof', { timeout: 180000 }, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2c1-proof-'));
  const storeDatabasePath = path.join(tempRoot, 'durable-store.sqlite');
  const kmsVaultPath = path.join(tempRoot, 'kms-vault.sqlite');
  const storeToken = crypto.randomBytes(32).toString('base64url');
  const kmsToken = crypto.randomBytes(32).toString('base64url');
  const kmsMasterKey = crypto.randomBytes(32);
  let storeService;
  let kmsService;

  const startStore = () => startService(STORE_SERVER, {
    SF2C1_STORE_DATABASE_PATH: storeDatabasePath,
    SF2C1_STORE_SERVICE_TOKEN: storeToken,
    SF2C1_STORE_FAULT_DELAY_MS: '600',
  });
  const startKms = () => startService(KMS_SERVER, {
    SF2C1_KMS_VAULT_PATH: kmsVaultPath,
    SF2C1_KMS_SERVICE_TOKEN: kmsToken,
    SF2C1_KMS_MASTER_KEY_B64: kmsMasterKey.toString('base64'),
    SF2C1_KMS_FAULT_DELAY_MS: '600',
  });
  const storeOptionsFor = (service, timeout = 2000) => ({
    endpoint: service.endpoint,
    service_token: storeToken,
    timeout_ms: timeout,
  });
  const storeOptions = (timeout = 2000) => storeOptionsFor(storeService, timeout);
  const kmsOptions = (timeout = 2000) => ({
    endpoint: kmsService.endpoint,
    service_token: kmsToken,
    timeout_ms: timeout,
  });

  storeService = await startStore();
  kmsService = await startKms();
  t.after(async () => {
    const workerExits = [...ACTIVE_WORKERS].map((worker) => {
      const exited = once(worker, 'exit');
      worker.kill('SIGKILL');
      return Promise.race([exited, delay(1000)]);
    });
    await Promise.all(workerExits);
    await stopService(storeService);
    await stopService(kmsService);
    kmsMasterKey.fill(0);
    if (tempRoot.startsWith(os.tmpdir())) fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await t.test('1. Proof adapters chỉ cho loopback, exact KMS surface và non-production capability', async () => {
    const port = new HttpDurableStatePortProof(storeOptions());
    const kms = new HttpKmsKeyProviderProof(kmsOptions());
    assert.equal(assertDurableStatePortContract(port), true);
    assert.equal(assertKeyProviderContract(kms), true);
    assert.deepEqual(Object.keys(kms), []);
    assert.throws(() => new HttpDurableStatePortProof({
      endpoint: 'https://production.example.com', service_token: storeToken, timeout_ms: 1000,
    }), (error) => error.code === 'SF2C1_PROOF_ENDPOINT_DENIED');
    assert.throws(() => new HttpKmsKeyProviderProof({
      endpoint: 'http://10.0.0.2:9999', service_token: kmsToken, timeout_ms: 1000,
    }), (error) => error.code === 'SF2C1_PROOF_ENDPOINT_DENIED');
    const descriptor = await kms.getActiveKey();
    assert.deepEqual(Object.keys(descriptor).sort(), ['algorithm', 'key_id', 'purpose', 'status', 'version']);
    assert.equal(descriptor.status, 'ACTIVE');
    const reference = {
      key_id: descriptor.key_id,
      version: descriptor.version,
      algorithm: descriptor.algorithm,
      purpose: descriptor.purpose,
    };
    await assert.rejects(() => kms.rotateKey({
      previous_reference: reference,
      actor_id: 'sf-security-reviewer',
      reason: 'api_token=sk-12345678901234567890',
    }), (error) => error.code === 'SF2C1_KMS_LIFECYCLE_SENSITIVE');
    assert.equal((await kms.getActiveKey()).version, descriptor.version);

    let redirectedBodyHits = 0;
    const redirectTarget = await startLocalServer((request, response) => {
      redirectedBodyHits += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true,"result":null}');
    });
    const redirectOrigin = await startLocalServer((request, response) => {
      response.writeHead(307, { location: redirectTarget.endpoint + '/captured' });
      response.end();
    });
    try {
      const redirectPort = new HttpDurableStatePortProof({
        endpoint: redirectOrigin.endpoint,
        service_token: storeToken,
        timeout_ms: 1000,
      });
      await assert.rejects(() => redirectPort.readScopeState('redirect-scope'),
        (error) => error.code === 'SF2C1_STORE_REDIRECT_DENIED');
      assert.equal(redirectedBodyHits, 0);
    } finally {
      await stopLocalServer(redirectOrigin);
      await stopLocalServer(redirectTarget);
    }

    const slowBody = await startLocalServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"ok":true,"result":');
      setTimeout(() => {
        if (!response.destroyed) response.end('null}');
      }, 600).unref();
    });
    try {
      const slowPort = new HttpDurableStatePortProof({
        endpoint: slowBody.endpoint,
        service_token: storeToken,
        timeout_ms: 100,
      });
      await assert.rejects(() => slowPort.readScopeState('slow-body-scope'),
        (error) => error.code === 'SF2C1_STORE_TIMEOUT');
    } finally {
      await stopLocalServer(slowBody);
    }

    const oversizedBody = await startLocalServer((request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
      });
      response.end(JSON.stringify({ ok: true, result: 'x'.repeat(MAX_PROOF_RESPONSE_BYTES) }));
    });
    try {
      const boundedPort = new HttpDurableStatePortProof({
        endpoint: oversizedBody.endpoint,
        service_token: storeToken,
        timeout_ms: 3000,
      });
      await assert.rejects(() => boundedPort.readScopeState('oversized-response-scope'),
        (error) => error.code === 'SF2C1_STORE_RESPONSE_TOO_LARGE');
    } finally {
      await stopLocalServer(oversizedBody);
    }
  });

  await t.test('2. SQLite WAL state và encrypted KMS vault sống qua service/application restart', async () => {
    const command = createCommand({ scopeId: 'sf2c1-restart', requestId: 'restart-1' });
    const first = await createControl(storeOptions(), kmsOptions()).commit(command);
    assert.equal(first.state.revision, 1);
    await stopService(storeService);
    storeService = await startStore();
    await stopService(kmsService);
    kmsService = await startKms();
    const restarted = createControl(storeOptions(), kmsOptions());
    const recovered = await restarted.recover({ scope_id: command.scope_id, request_id: command.request_id });
    assert.equal(recovered.receipt.committed_revision, 1);
    const replay = await restarted.commit(command);
    assert.equal(replay.replayed, true);
  });

  await t.test('3. Hai process/different request cùng revision chỉ một CAS winner', async () => {
    const secondaryStoreService = await startStore();
    const one = createCommand({ scopeId: 'sf2c1-cas-workers', requestId: 'cas-worker-1' });
    const two = createCommand({ scopeId: 'sf2c1-cas-workers', requestId: 'cas-worker-2' });
    let results;
    try {
      results = await Promise.all([
        runWorker({ command: one, store: storeOptions(), kms: kmsOptions() }),
        runWorker({ command: two, store: storeOptionsFor(secondaryStoreService), kms: kmsOptions() }),
      ]);
    } finally {
      await stopService(secondaryStoreService);
    }
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => result.error?.code === 'CONCURRENT_MUTATION_DENIED').length, 1);
    const count = await controlService(storeService, storeToken, {
      action: 'count_outcomes', scope_id: one.scope_id,
    });
    assert.equal(count.count, 1);
  });

  await t.test('4. Concurrent retry cùng request/payload chỉ tạo một outcome và worker còn lại replay', async () => {
    const secondaryStoreService = await startStore();
    const command = createCommand({ scopeId: 'sf2c1-same-request', requestId: 'same-request-1' });
    let results;
    try {
      results = await Promise.all([
        runWorker({ command, store: storeOptions(), kms: kmsOptions() }),
        runWorker({ command, store: storeOptionsFor(secondaryStoreService), kms: kmsOptions() }),
      ]);
    } finally {
      await stopService(secondaryStoreService);
    }
    assert.equal(results.every((result) => result.ok), true);
    assert.equal(results.filter((result) => result.result.replayed === false).length, 1);
    assert.equal(results.filter((result) => result.result.replayed === true).length, 1);
    const count = await controlService(storeService, storeToken, {
      action: 'count_outcomes', scope_id: command.scope_id,
    });
    assert.equal(count.count, 1);
  });

  await t.test('5. Duplicate replay idempotent; cùng request ID/payload khác bị HMAC deny', async () => {
    const control = createControl(storeOptions(), kmsOptions());
    const command = createCommand({ scopeId: 'sf2c1-idempotency', requestId: 'idempotency-1' });
    await control.commit(command);
    assert.equal((await control.commit(command)).replayed, true);
    await assert.rejects(() => control.commit({
      ...command,
      input: { action: 'DIFFERENT_PAYLOAD' },
    }), (error) => error.code === 'HMAC_VERIFICATION_FAILED');
    const count = await controlService(storeService, storeToken, {
      action: 'count_outcomes', scope_id: command.scope_id,
    });
    assert.equal(count.count, 1);
  });

  await t.test('6. Lost ACK sau SQLite commit được consistent recovery đúng một lần', async () => {
    await controlService(storeService, storeToken, { action: 'set_fault', value: 'commit_then_disconnect' });
    const command = createCommand({ scopeId: 'sf2c1-lost-ack', requestId: 'lost-ack-1' });
    const result = await createControl(storeOptions(), kmsOptions()).commit(command);
    assert.equal(result.recovered, true);
    assert.equal(result.replayed, false);
    const count = await controlService(storeService, storeToken, {
      action: 'count_outcomes', scope_id: command.scope_id,
    });
    assert.equal(count.count, 1);
  });

  await t.test('7. Worker crash sau commit không làm mất lịch sử hoặc duplicate outcome', async () => {
    await controlService(storeService, storeToken, { action: 'set_fault', value: 'commit_then_hang' });
    const command = createCommand({ scopeId: 'sf2c1-process-crash', requestId: 'process-crash-1' });
    const worker = launchWorker({
      command,
      store: storeOptions(10000),
      kms: kmsOptions(),
    });
    const observer = new HttpDurableStatePortProof(storeOptions());
    await waitForReceipt(observer, command.scope_id, command.request_id);
    const workerExit = once(worker, 'exit');
    worker.kill('SIGKILL');
    await workerExit;
    const recovered = await createControl(storeOptions(), kmsOptions()).recover({
      scope_id: command.scope_id,
      request_id: command.request_id,
    });
    assert.equal(recovered.receipt.committed_revision, 1);
    const count = await controlService(storeService, storeToken, {
      action: 'count_outcomes', scope_id: command.scope_id,
    });
    assert.equal(count.count, 1);
  });

  await t.test('8. Unknown/timeout/store unavailable/KMS unavailable đều fail closed, không guessed success', async () => {
    const unknown = createCommand({ scopeId: 'sf2c1-unknown', requestId: 'unknown-1' });
    await controlService(storeService, storeToken, { action: 'set_fault', value: 'unknown_without_commit' });
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).commit(unknown),
      (error) => error.code === 'DURABLE_COMMIT_INDETERMINATE');

    const timeout = createCommand({ scopeId: 'sf2c1-timeout', requestId: 'timeout-1' });
    await controlService(storeService, storeToken, { action: 'set_fault', value: 'timeout_before_commit' });
    await assert.rejects(() => createControl(storeOptions(100), kmsOptions()).commit(timeout),
      (error) => error.code === 'DURABLE_COMMIT_INDETERMINATE');

    const kmsTimeout = createCommand({ scopeId: 'sf2c1-kms-timeout', requestId: 'kms-timeout-1' });
    await controlService(kmsService, kmsToken, { action: 'set_fault', value: 'timeout' });
    await assert.rejects(() => createControl(storeOptions(), kmsOptions(100)).commit(kmsTimeout),
      (error) => error.code === 'SF2C1_KMS_TIMEOUT');
    assert.equal(await new HttpDurableStatePortProof(storeOptions()).readReceipt(
      kmsTimeout.scope_id, kmsTimeout.request_id,
    ), null);

    const storeDown = createCommand({ scopeId: 'sf2c1-store-down', requestId: 'store-down-1' });
    await stopService(storeService);
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).commit(storeDown),
      (error) => error.code === 'SF2C1_STORE_UNAVAILABLE');
    storeService = await startStore();

    const kmsDown = createCommand({ scopeId: 'sf2c1-kms-down', requestId: 'kms-down-1' });
    await stopService(kmsService);
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).commit(kmsDown),
      (error) => error.code === 'SF2C1_KMS_UNAVAILABLE');
    kmsService = await startKms();
    assert.equal(await new HttpDurableStatePortProof(storeOptions()).readReceipt(
      kmsDown.scope_id, kmsDown.request_id,
    ), null);
  });

  await t.test('9. Partial current record và missing historical evidence bị phát hiện sau restart', async () => {
    const current = createCommand({ scopeId: 'sf2c1-partial-current', requestId: 'partial-current-1' });
    await createControl(storeOptions(), kmsOptions()).commit(current);
    const historyOne = createCommand({ scopeId: 'sf2c1-history', requestId: 'history-1' });
    const historyTwo = createCommand({
      scopeId: 'sf2c1-history', requestId: 'history-2', expectedRevision: 1,
    });
    const control = createControl(storeOptions(), kmsOptions());
    await control.commit(historyOne);
    await control.commit(historyTwo);
    await stopService(storeService);
    const db = new DatabaseSync(storeDatabasePath);
    db.prepare('DELETE FROM sf2c1_receipts WHERE scope_id = ? AND request_id = ?')
      .run(current.scope_id, current.request_id);
    db.prepare('DELETE FROM sf2c1_evidence_records WHERE scope_id = ? AND request_id = ?')
      .run(historyOne.scope_id, historyOne.request_id);
    db.close();
    storeService = await startStore();
    const restarted = createControl(storeOptions(), kmsOptions());
    await assert.rejects(() => restarted.recover({
      scope_id: current.scope_id, request_id: current.request_id,
    }), (error) => error.code === 'DURABLE_PARTIAL_COMMIT_DETECTED');
    await assert.rejects(() => restarted.recover({
      scope_id: historyTwo.scope_id, request_id: historyTwo.request_id,
    }), (error) => error.code === 'DURABLE_PARTIAL_COMMIT_DETECTED');
  });

  await t.test('10. Tampered historical/current HMAC seal bị phát hiện qua encrypted KMS boundary', async () => {
    const command = createCommand({ scopeId: 'sf2c1-hmac-tamper', requestId: 'hmac-tamper-1' });
    await createControl(storeOptions(), kmsOptions()).commit(command);
    await stopService(storeService);
    const db = new DatabaseSync(storeDatabasePath);
    const row = db.prepare(
      'SELECT record_json FROM sf2c1_transaction_seals WHERE scope_id = ? AND request_id = ?',
    ).get(command.scope_id, command.request_id);
    const seal = JSON.parse(row.record_json);
    seal.auth_tag = 'hmac-sha256:' + '0'.repeat(64);
    db.prepare(`UPDATE sf2c1_transaction_seals SET record_json = ? WHERE scope_id = ? AND request_id = ?`)
      .run(JSON.stringify(seal), command.scope_id, command.request_id);
    db.close();
    storeService = await startStore();
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).recover({
      scope_id: command.scope_id, request_id: command.request_id,
    }), (error) => error.code === 'HMAC_VERIFICATION_FAILED');
  });

  await t.test('11. Forged authorization, async TOCTOU và oversized/deep input không tạo durable side effect', async () => {
    const forged = createCommand({ scopeId: 'sf2c1-forged-auth', requestId: 'forged-auth-1' });
    const { decision_digest: ignored, ...forgedBase } = forged.authorization;
    forgedBase.decision_id = 'attacker-forged-decision';
    forged.authorization = { ...forgedBase, decision_digest: authorizationDecisionDigest(forgedBase) };
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).commit(forged),
      (error) => error.code === 'DURABLE_AUTHORIZATION_REQUIRED');

    let releaseVerifier;
    const gate = new Promise((resolve) => { releaseVerifier = resolve; });
    const toctouVerifier = Object.freeze({
      async verifyDecision({ decision }) {
        await gate;
        return ISSUED_DECISIONS.has(decision.decision_digest);
      },
    });
    const toctou = createCommand({ scopeId: 'sf2c1-toctou', requestId: 'toctou-1' });
    const pending = createControl(storeOptions(), kmsOptions(), toctouVerifier).commit(toctou);
    toctou.scope_id = 'sf2c1-toctou-attacker';
    releaseVerifier();
    await assert.rejects(() => pending, (error) => error.code === 'DURABLE_COMMAND_TOCTOU_DENIED');

    let deep = { value: 'leaf' };
    for (let index = 0; index < 70; index += 1) deep = { nested: deep };
    const deepCommand = createCommand({
      scopeId: 'sf2c1-deep-input', requestId: 'deep-input-1', nextState: deep,
    });
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).commit(deepCommand),
      (error) => error.code === 'CANONICAL_BUDGET_EXCEEDED');
    assert.throws(() => assertPlainJsonValue(Array.from({ length: 50001 }, () => 0)),
      (error) => error.code === 'CANONICAL_BUDGET_EXCEEDED');
    assert.throws(() => assertPlainJsonValue('x'.repeat(DEFAULT_MAX_JSON_STRING_BYTES + 1)),
      (error) => error.code === 'CANONICAL_BUDGET_EXCEEDED');
    const oversizedKey = 'k'.repeat(DEFAULT_MAX_JSON_STRING_BYTES + 1);
    assert.throws(() => assertPlainJsonValue({ [oversizedKey]: true }),
      (error) => error.code === 'CANONICAL_BUDGET_EXCEEDED');

    const port = new HttpDurableStatePortProof(storeOptions());
    for (const command of [forged, toctou, deepCommand]) {
      assert.equal(await port.readReceipt(command.scope_id, command.request_id), null);
    }
  });

  await t.test('12. Secret không vào durable DB; KMS vault không chứa master/token hoặc raw-key schema', async () => {
    const rawSecret = 'sk-sf2c1-secret-12345678901234567890';
    const command = createCommand({
      scopeId: 'sf2c1-secret-scan',
      requestId: 'secret-scan-1',
      input: { api_token: rawSecret },
      nextState: { status: 'COMMITTED', api_token: rawSecret },
    });
    const originalFetch = global.fetch;
    let rawSecretObservedInKmsRpc = false;
    global.fetch = async (resource, options) => {
      if (String(resource).startsWith(kmsService.endpoint)
        && String(options?.body || '').includes(rawSecret)) {
        rawSecretObservedInKmsRpc = true;
      }
      return originalFetch(resource, options);
    };
    let result;
    try {
      result = await createControl(storeOptions(), kmsOptions()).commit(command);
    } finally {
      global.fetch = originalFetch;
    }
    assert.equal(result.state.state.api_token, '[REDACTED:SECRET]');
    assert.equal(rawSecretObservedInKmsRpc, false);
    await stopService(storeService);
    const storeBytes = [storeDatabasePath, storeDatabasePath + '-wal', storeDatabasePath + '-shm']
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file).toString('utf8'))
      .join('');
    assert.equal(storeBytes.includes(rawSecret), false);
    assert.equal(storeBytes.includes(kmsToken), false);
    storeService = await startStore();

    await stopService(kmsService);
    const vaultBytes = [kmsVaultPath, kmsVaultPath + '-wal', kmsVaultPath + '-shm']
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file).toString('utf8'))
      .join('');
    assert.equal(vaultBytes.includes(kmsMasterKey.toString('base64')), false);
    assert.equal(vaultBytes.includes(kmsToken), false);
    assert.equal(/raw[_-]?key|plaintext|export[_-]?key/i.test(vaultBytes), false);
    kmsService = await startKms();
  });

  await t.test('13. KMS rotate/restart verifies old version; revoke được audit và recovery fail closed', async () => {
    const kms = new HttpKmsKeyProviderProof(kmsOptions());
    const old = await kms.getActiveKey();
    const first = createCommand({ scopeId: 'sf2c1-kms-lifecycle', requestId: 'kms-life-1' });
    const control = createControl(storeOptions(), kmsOptions());
    await control.commit(first);
    const rotation = await rotateActiveKey(kms, {
      actor_id: 'sf-security-reviewer',
      reason: 'scheduled SF2-C1 proof rotation',
    });
    assert.equal(rotation.previous_reference.version, old.version);
    assert.equal(rotation.descriptor.version, old.version + 1);
    const second = createCommand({
      scopeId: first.scope_id,
      requestId: 'kms-life-2',
      expectedRevision: 1,
      nextState: { status: 'SIGNED_BY_ROTATED_KEY' },
    });
    await control.commit(second);
    await stopService(kmsService);
    kmsService = await startKms();
    const restarted = createControl(storeOptions(), kmsOptions());
    assert.equal((await restarted.recover({
      scope_id: first.scope_id, request_id: first.request_id,
    })).receipt.key_reference.version, old.version);
    assert.equal((await restarted.recover({
      scope_id: second.scope_id, request_id: second.request_id,
    })).receipt.key_reference.version, old.version + 1);
    const restartedKms = new HttpKmsKeyProviderProof(kmsOptions());
    await revokeKeyVersion(restartedKms, rotation.previous_reference, {
      actor_id: 'sf-security-reviewer',
      reason: 'revoke old SF2-C1 proof key',
    });
    const audit = await getVerifiedKeyAuditEvents(restartedKms);
    assert.equal(audit.at(-1).event_type, 'KEY_REVOKED');
    await assert.rejects(() => restarted.recover({
      scope_id: first.scope_id, request_id: first.request_id,
    }), (error) => error.code === 'HMAC_KEY_REVOKED');
    await stopService(kmsService);
    const vault = new DatabaseSync(kmsVaultPath);
    vault.prepare(`UPDATE sf2c1_kms_keys SET status = 'VERIFY_ONLY' WHERE key_id = ? AND version = ?`)
      .run(old.key_id, old.version);
    vault.prepare('DELETE FROM sf2c1_kms_audit WHERE sequence = (SELECT MAX(sequence) FROM sf2c1_kms_audit)')
      .run();
    vault.close();
    kmsService = await startKms();
    await assert.rejects(() => createControl(storeOptions(), kmsOptions()).recover({
      scope_id: first.scope_id, request_id: first.request_id,
    }), (error) => error.code === 'SF2C1_KMS_METADATA_TAMPERED');
  });
});
