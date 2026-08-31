const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');

const {
  ARTIFACT_TYPES,
  RUN_STATES,
  HttpDurableStatePortProof,
  HttpKmsKeyProviderProof,
  SF2C2_OPERATIONS,
  StagingDurableFactoryControlPlane,
  authorizationDecisionDigest,
  createEvidenceEnvelope,
  sha256Digest,
  verifyStagingFactoryState,
} = require('../src/softwareFactory');
const { stableSerialize } = require('../src/softwareFactory/canonical');

const STORE_SERVER = path.join(__dirname, 'fixtures', 'sf2c1-durable-store-proof-server.js');
const KMS_SERVER = path.join(__dirname, 'fixtures', 'sf2c1-kms-proof-server.js');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      reject(new Error('Service startup timeout: ' + stderr));
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
        reject(new Error('Invalid service ready envelope: ' + error.message + ' ' + stderr));
      }
    });
    child.once('exit', (code) => {
      if (stdout.includes('\n')) return;
      clearTimeout(timer);
      reject(new Error('Service exited before ready (' + code + '): ' + stderr));
    });
  });
}

async function stopService(service) {
  if (!service?.child || service.child.exitCode !== null) return;
  const graceful = once(service.child, 'exit');
  service.child.kill('SIGTERM');
  await Promise.race([graceful, delay(3000)]);
  if (service.child.exitCode === null) {
    const forced = once(service.child, 'exit');
    service.child.kill('SIGKILL');
    await Promise.race([forced, delay(1000)]);
  }
}

async function controlService(service, token, body) {
  const response = await fetch(service.endpoint + '/control', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const envelope = await response.json();
  if (!response.ok || envelope.ok !== true) throw new Error(JSON.stringify(envelope));
  return envelope.result;
}

function artifactRef(state, artifactId) {
  return state.latest_artifact_versions[artifactId];
}

function provenance(actorId, parentRefs = [], sourceName = 'sf2c2-test-input') {
  return {
    source_type: 'SF2C2_TEST_HARNESS',
    source_refs: parentRefs.length
      ? parentRefs.map((reference) => ({
        ref: 'sf-artifact:' + reference.version_id,
        digest: reference.digest,
      }))
      : [{ ref: sourceName, digest: sha256Digest({ source: sourceName }) }],
    parent_artifact_ids: [...new Set(parentRefs.map((reference) => reference.artifact_id))],
    policy_version: 'sf-policy-v1',
    captured_by: actorId,
    capture_method: 'TEST_HARNESS',
  };
}

function requirementPayload(label) {
  return {
    objective: 'Durable Factory ' + label,
    business_context: 'SF2-C2 isolated staging evidence',
    scope: ['software-factory-artifact-lineage'],
    out_of_scope: ['AF3', 'REG4', 'OpenClaw', 'production'],
    acceptance_criteria: ['durable trace is verified'],
    risks: ['single-host proof backing'],
    definition_of_done: ['PASS then STOP'],
  };
}

function architecturePayload() {
  return {
    affected_domains: ['software_factory'], domain_owner: 'Software Factory Control Plane',
    application_services: [], orchestration: 'Durable semantic adapter over SF2 port',
    schema_impact: 'No Business OS schema', api_impact: 'No HTTP production API',
    permission_impact: 'Software Factory registry roles only', tenant_impact: 'No Business tenant data',
    migration_required: false, adr_required: true,
    test_strategy: ['recovery', 'security', 'concurrency'],
  };
}

function implementationPayload(version) {
  return {
    files_changed: ['backend/src/softwareFactory/stagingFactoryControlPlane.js'],
    reason: 'SF2-C2 version ' + version,
    implementation_summary: 'Durable artifact evidence semantic state',
    tests_added: ['software-factory-sf2c2-staging-factory.test.js'], migration_added: false,
    known_risks: ['staging proof backing only'],
  };
}

function reviewPayload(status = 'PASS', severity = 'NONE') {
  return {
    reviewer: 'sf-independent-reviewer', findings: [], severity,
    architectural_conflicts: [], security_conflicts: [], status,
  };
}

function testPayload(kind = 'AUTOMATED', status = 'PASS') {
  return {
    test_kind: kind, tests_run: ['sf2c2-' + kind.toLowerCase()],
    passed: status === 'PASS' ? 1 : 0, failed: status === 'PASS' ? 0 : 1, skipped: 0,
    fixture: 'isolated-sf2c2-staging', cleanup: 'temporary records only',
    evidence: ['canonical result digest'], status,
  };
}

function releasePayload() {
  return {
    commit: 'candidate-only-no-commit', tag: 'candidate-only-no-tag', baseline: 'not-baselined',
    database_state: 'no-business-database', migration_state: 'no-migration',
    backup: 'not-applicable-isolated-staging', recovery_point: 'durable-factory-revision',
    approvals: [], release_status: 'CANDIDATE',
  };
}

test('SF2-C2 staging durable Factory and Artifact Evidence', { timeout: 240000 }, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2c2-staging-'));
  const storeDatabasePath = path.join(tempRoot, 'factory-store.sqlite');
  const kmsVaultPath = path.join(tempRoot, 'factory-kms.sqlite');
  const storeToken = crypto.randomBytes(32).toString('base64url');
  const kmsToken = crypto.randomBytes(32).toString('base64url');
  const kmsMasterKey = crypto.randomBytes(32);
  const issuedDecisions = new Set();
  let storeService;
  let kmsService;
  let clockTick = 0;

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
  const storeOptions = (timeoutMs = 2000) => ({
    endpoint: storeService.endpoint, service_token: storeToken, timeout_ms: timeoutMs,
  });
  const kmsOptions = (timeoutMs = 2000) => ({
    endpoint: kmsService.endpoint, service_token: kmsToken, timeout_ms: timeoutMs,
  });
  const verifier = Object.freeze({
    async verifyDecision({ decision, binding }) {
      return issuedDecisions.has(decision?.decision_digest)
        && decision.scope_id === binding.scope_id
        && decision.request_id === binding.request_id
        && decision.requirement_id === binding.requirement_id
        && decision.operation === binding.operation
        && decision.agent_id === binding.agent_id;
    },
  });
  const clock = () => new Date(Date.UTC(2026, 7, 31, 0, 0, clockTick++));
  const createControl = ({ storeTimeout = 2000, kmsTimeout = 2000 } = {}) => (
    new StagingDurableFactoryControlPlane({
      port: new HttpDurableStatePortProof(storeOptions(storeTimeout)),
      key_provider: new HttpKmsKeyProviderProof(kmsOptions(kmsTimeout)),
      authorization_verifier: verifier,
      clock,
    })
  );

  let requestSequence = 0;
  function command({ runId, requirementId, revision, actorId, operation, payload, requestId = null }) {
    const actualRequestId = requestId || 'sf2c2-request-' + (++requestSequence);
    const base = {
      authorization_schema_version: '1.0.0',
      decision_id: 'sf2c2-decision-' + actualRequestId,
      scope_id: runId,
      request_id: actualRequestId,
      requirement_id: requirementId,
      operation,
      agent_id: actorId,
      principal_id: 'founder-delegated-factory-principal',
      policy_version: 'sf-policy-v1',
      outcome: 'ALLOW',
      issued_at: '2026-08-31T00:00:00.000Z',
    };
    const authorization = { ...base, decision_digest: authorizationDecisionDigest(base) };
    issuedDecisions.add(authorization.decision_digest);
    const evidence = createEvidenceEnvelope({
      evidence_type: 'SF2C2_FACTORY_MUTATION',
      subject: runId + ':' + actualRequestId,
      provenance: {
        source_type: 'SF2C2_TEST_HARNESS',
        source_refs: [{
          ref: 'sf2c2-command:' + actualRequestId,
          digest: sha256Digest({ run_id: runId, request_id: actualRequestId }),
        }],
        parent_artifact_ids: [],
        policy_version: 'sf-policy-v1',
        captured_by: actorId,
        capture_method: 'TEST_HARNESS',
      },
      content: { operation, expected_revision: revision },
    });
    return {
      run_id: runId, request_id: actualRequestId, requirement_id: requirementId,
      expected_revision: revision, operation, actor_id: actorId,
      authorization, evidence, payload,
    };
  }

  function createRunCommand(runId, requirementId, revision = 0, requestId = null) {
    return command({
      runId, requirementId, revision, actorId: 'sf-product-owner',
      operation: SF2C2_OPERATIONS.CREATE_FACTORY_RUN, requestId,
      payload: {
        requirement_artifact_id: runId + '-requirement-artifact',
        requirement_payload: requirementPayload(runId),
        provenance: provenance('sf-product-owner', [], 'founder-requirement:' + requirementId),
      },
    });
  }

  function artifactCommand({
    runId, requirementId, revision, actorId, artifactId, artifactType,
    expectedPreviousVersion = 0, payload, parentRefs, subjectRef = null, operation,
  }) {
    return command({
      runId, requirementId, revision, actorId, operation,
      payload: {
        artifact_id: artifactId, artifact_type: artifactType,
        expected_previous_version: expectedPreviousVersion, payload,
        provenance: provenance(actorId, parentRefs), subject_ref: subjectRef,
      },
    });
  }

  function gateCommand({ runId, requirementId, revision, actorId, toState, evidenceRefs }) {
    return command({
      runId, requirementId, revision, actorId,
      operation: SF2C2_OPERATIONS.TRANSITION_GATE,
      payload: { to_state: toState, evidence_refs: evidenceRefs },
    });
  }

  async function executeAndRevision(control, value) {
    const result = await control.execute(value);
    return { result, revision: result.receipt.committed_revision, state: result.factory_state };
  }

  async function createUntilBuilding(control, runId, requirementId) {
    let step = await executeAndRevision(control, createRunCommand(runId, requirementId));
    const requirementRef = artifactRef(step.state, runId + '-requirement-artifact');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-product-owner',
      toState: RUN_STATES.ANALYZED, evidenceRefs: [requirementRef],
    }));
    step = await executeAndRevision(control, artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-solution-architect', artifactId: runId + '-architecture',
      artifactType: ARTIFACT_TYPES.ARCHITECTURE, payload: architecturePayload(),
      parentRefs: [requirementRef], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    const architectureRef = artifactRef(step.state, runId + '-architecture');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-solution-architect',
      toState: RUN_STATES.ARCHITECTURE_APPROVED, evidenceRefs: [architectureRef],
    }));
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-orchestrator',
      toState: RUN_STATES.READY_TO_BUILD, evidenceRefs: [architectureRef],
    }));
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-backend-domain',
      toState: RUN_STATES.BUILDING, evidenceRefs: [architectureRef],
    }));
    return { ...step, requirementRef, architectureRef };
  }

  async function fullTrace(control, runId, requirementId, { stopAtUatPassed = false } = {}) {
    let step = await createUntilBuilding(control, runId, requirementId);
    step = await executeAndRevision(control, artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-backend-domain', artifactId: runId + '-implementation',
      artifactType: ARTIFACT_TYPES.IMPLEMENTATION, payload: implementationPayload(1),
      parentRefs: [step.architectureRef], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    const implementationRef = artifactRef(step.state, runId + '-implementation');
    step = await executeAndRevision(control, command({
      runId, requirementId, revision: step.revision, actorId: 'sf-backend-domain',
      operation: SF2C2_OPERATIONS.CREATE_HANDOFF,
      payload: {
        handoff_id: runId + '-builder-review-handoff',
        to_agent_id: 'sf-independent-reviewer',
        purpose: 'Independent security and architecture review',
        artifact_refs: [implementationRef],
      },
    }));
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-backend-domain',
      toState: RUN_STATES.BUILT, evidenceRefs: [implementationRef],
    }));
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-orchestrator',
      toState: RUN_STATES.IN_REVIEW, evidenceRefs: [implementationRef],
    }));
    step = await executeAndRevision(control, artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-independent-reviewer', artifactId: runId + '-review',
      artifactType: ARTIFACT_TYPES.REVIEW, payload: reviewPayload(),
      parentRefs: [implementationRef], subjectRef: implementationRef,
      operation: SF2C2_OPERATIONS.RECORD_REVIEW,
    }));
    const reviewRef = artifactRef(step.state, runId + '-review');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-independent-reviewer',
      toState: RUN_STATES.REVIEW_PASSED, evidenceRefs: [reviewRef],
    }));
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-qa-uat',
      toState: RUN_STATES.TESTING, evidenceRefs: [reviewRef],
    }));
    step = await executeAndRevision(control, artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-qa-uat', artifactId: runId + '-automated-test',
      artifactType: ARTIFACT_TYPES.TEST, payload: testPayload('AUTOMATED'),
      parentRefs: [implementationRef], subjectRef: implementationRef,
      operation: SF2C2_OPERATIONS.RECORD_TEST_EVIDENCE,
    }));
    const testRef = artifactRef(step.state, runId + '-automated-test');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-qa-uat',
      toState: RUN_STATES.TEST_PASSED, evidenceRefs: [testRef],
    }));
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-qa-uat',
      toState: RUN_STATES.UAT_READY, evidenceRefs: [testRef],
    }));
    step = await executeAndRevision(control, artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-qa-uat', artifactId: runId + '-uat',
      artifactType: ARTIFACT_TYPES.TEST, payload: testPayload('UAT'),
      parentRefs: [implementationRef], subjectRef: implementationRef,
      operation: SF2C2_OPERATIONS.RECORD_TEST_EVIDENCE,
    }));
    const uatRef = artifactRef(step.state, runId + '-uat');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-qa-uat',
      toState: RUN_STATES.UAT_PASSED, evidenceRefs: [uatRef],
    }));
    if (stopAtUatPassed) {
      return { ...step, implementationRef, reviewRef, testRef, uatRef };
    }
    step = await executeAndRevision(control, artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-release-baseline', artifactId: runId + '-release-evidence',
      artifactType: ARTIFACT_TYPES.RELEASE, payload: releasePayload(),
      parentRefs: [implementationRef], subjectRef: implementationRef,
      operation: SF2C2_OPERATIONS.RECORD_RELEASE_EVIDENCE,
    }));
    const releaseRef = artifactRef(step.state, runId + '-release-evidence');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-release-baseline',
      toState: RUN_STATES.RELEASE_CANDIDATE, evidenceRefs: [releaseRef],
    }));
    const finalCommand = gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-release-baseline',
      toState: RUN_STATES.AWAITING_FOUNDER_APPROVAL, evidenceRefs: [releaseRef],
    });
    step = await executeAndRevision(control, finalCommand);
    return { ...step, implementationRef, reviewRef, testRef, uatRef, releaseRef, finalCommand };
  }

  storeService = await startStore();
  kmsService = await startKms();
  t.after(async () => {
    await stopService(storeService);
    await stopService(kmsService);
    kmsMasterKey.fill(0);
    const resolved = path.resolve(tempRoot);
    if (resolved.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase() + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  let happy;
  await t.test('1. Durable Requirement → Run → Artifact/Digest → Test → Review → Gate → Handoff chain', async () => {
    const control = createControl();
    happy = await fullTrace(control, 'sf2c2-happy-run', 'sf2c2-happy-requirement');
    assert.equal(happy.state.factory_run.gate_state, RUN_STATES.AWAITING_FOUNDER_APPROVAL);
    assert.equal(happy.state.artifact_versions.length, 7);
    assert.equal(happy.state.reviews.length, 1);
    assert.equal(happy.state.test_evidence.length, 2);
    assert.equal(happy.state.release_evidence.length, 1);
    assert.equal(happy.state.handoffs.length, 1);
    assert.equal(happy.state.gate_events.length, 13);
    assert.equal(happy.state.trace_events.length, happy.revision);
    assert.equal(verifyStagingFactoryState(happy.state), true);
  });

  await t.test('2. Restart recovery and duplicate delivery preserve one exact outcome', async () => {
    const beforeRestartRevision = happy.revision;
    await stopService(storeService);
    storeService = await startStore();
    await stopService(kmsService);
    kmsService = await startKms();
    const restarted = createControl();
    const read = await restarted.readRun('sf2c2-happy-run');
    assert.equal(read.revision, beforeRestartRevision);
    assert.equal(read.state.factory_run.gate_state, RUN_STATES.AWAITING_FOUNDER_APPROVAL);
    const replay = await restarted.execute(happy.finalCommand);
    assert.equal(replay.replayed, true);
    assert.equal(replay.receipt.committed_revision, beforeRestartRevision);
    assert.equal((await restarted.readRun('sf2c2-happy-run')).revision, beforeRestartRevision);
  });

  await t.test('3. Changed replay, forged evidence and identity spoof fail closed', async () => {
    const control = createControl();
    const changedReplay = JSON.parse(JSON.stringify(happy.finalCommand));
    changedReplay.payload.evidence_refs = [happy.uatRef];
    await assert.rejects(() => control.execute(changedReplay), (error) => (
      ['HMAC_VERIFICATION_FAILED', 'DURABLE_REQUEST_STATE_MISMATCH'].includes(error.code)
    ));
    const current = await control.readRun('sf2c2-happy-run');
    const forgedEvidence = command({
      runId: 'sf2c2-happy-run', requirementId: 'sf2c2-happy-requirement',
      revision: current.revision, actorId: 'sf-orchestrator',
      operation: SF2C2_OPERATIONS.CREATE_HANDOFF,
      payload: {
        handoff_id: 'sf2c2-forged-evidence-handoff', to_agent_id: 'sf-release-baseline',
        purpose: 'Must not persist', artifact_refs: [happy.releaseRef],
      },
    });
    forgedEvidence.evidence = createEvidenceEnvelope({
      evidence_type: 'FORGED', subject: 'wrong-scope:wrong-request',
      provenance: provenance('sf-orchestrator', [], 'forged'), content: { forged: true },
    });
    await assert.rejects(() => control.execute(forgedEvidence), (error) => (
      error.code === 'DURABLE_EVIDENCE_BINDING_MISMATCH'
    ));
    const spoofed = command({
      runId: 'sf2c2-happy-run', requirementId: 'sf2c2-happy-requirement',
      revision: current.revision, actorId: 'sf-backend-domain',
      operation: SF2C2_OPERATIONS.CREATE_HANDOFF,
      payload: {
        handoff_id: 'sf2c2-spoof-handoff', to_agent_id: 'sf-qa-uat',
        purpose: 'Must not persist', artifact_refs: [happy.implementationRef],
      },
    });
    spoofed.authorization.agent_id = 'sf-independent-reviewer';
    await assert.rejects(() => control.execute(spoofed), (error) => (
      error.code === 'SF2C2_AUTHORIZATION_POLICY_MISMATCH'
    ));
    assert.equal((await control.readRun('sf2c2-happy-run')).revision, current.revision);
  });

  await t.test('3b. Artifact provenance authority and semantic redaction are fail-closed', async () => {
    const control = createControl();
    const redactedRunCommand = createRunCommand(
      'sf2c2-redacted-artifact-run', 'sf2c2-redacted-artifact-requirement',
    );
    redactedRunCommand.payload.requirement_payload.business_context = 'Contact reviewer@example.com';
    const redactedRun = await control.execute(redactedRunCommand);
    assert.equal(
      redactedRun.factory_state.artifact_versions[0].artifact.payload.business_context,
      '[REDACTED:PII_EMAIL]',
    );

    const runId = 'sf2c2-provenance-run';
    const requirementId = 'sf2c2-provenance-requirement';
    let step = await executeAndRevision(control, createRunCommand(runId, requirementId));
    const requirementRef = artifactRef(step.state, runId + '-requirement-artifact');
    step = await executeAndRevision(control, gateCommand({
      runId, requirementId, revision: step.revision, actorId: 'sf-product-owner',
      toState: RUN_STATES.ANALYZED, evidenceRefs: [requirementRef],
    }));
    const forgedProvenance = artifactCommand({
      runId, requirementId, revision: step.revision,
      actorId: 'sf-solution-architect', artifactId: runId + '-architecture',
      artifactType: ARTIFACT_TYPES.ARCHITECTURE, payload: architecturePayload(),
      parentRefs: [requirementRef], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    });
    forgedProvenance.payload.provenance.captured_by = 'sf-backend-domain';
    forgedProvenance.payload.provenance.policy_version = 'obsolete-policy';
    await assert.rejects(() => control.execute(forgedProvenance), (error) => (
      error.code === 'SF2C2_ARTIFACT_PROVENANCE_AUTHORITY_MISMATCH'
    ));
    assert.equal((await control.readRun(runId)).revision, step.revision);

    const happyCurrent = await control.readRun('sf2c2-happy-run');
    const unredactedHandoff = command({
      runId: 'sf2c2-happy-run', requirementId: 'sf2c2-happy-requirement',
      revision: happyCurrent.revision, actorId: 'sf-orchestrator',
      operation: SF2C2_OPERATIONS.CREATE_HANDOFF,
      payload: {
        handoff_id: 'sf2c2-sensitive-purpose-handoff',
        to_agent_id: 'sf-release-baseline',
        purpose: 'Contact reviewer@example.com before candidate handoff',
        artifact_refs: [happy.releaseRef],
      },
    });
    await assert.rejects(() => control.execute(unredactedHandoff), (error) => (
      error.code === 'SF2C2_UNREDACTED_SEMANTIC_STATE_DENIED'
    ));
    assert.equal((await control.readRun('sf2c2-happy-run')).revision, happyCurrent.revision);
  });

  await t.test('4. Builder self-review, gate bypass and stale approval/baseline are denied', async () => {
    const control = createControl();
    const build = await createUntilBuilding(control, 'sf2c2-security-run', 'sf2c2-security-requirement');
    let step = await executeAndRevision(control, artifactCommand({
      runId: 'sf2c2-security-run', requirementId: 'sf2c2-security-requirement',
      revision: build.revision, actorId: 'sf-backend-domain',
      artifactId: 'sf2c2-security-implementation', artifactType: ARTIFACT_TYPES.IMPLEMENTATION,
      payload: implementationPayload(1), parentRefs: [build.architectureRef],
      operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    const implementationRef = artifactRef(step.state, 'sf2c2-security-implementation');
    const builderReview = artifactCommand({
      runId: 'sf2c2-security-run', requirementId: 'sf2c2-security-requirement',
      revision: step.revision, actorId: 'sf-backend-domain', artifactId: 'self-review',
      artifactType: ARTIFACT_TYPES.REVIEW,
      payload: { ...reviewPayload(), reviewer: 'sf-backend-domain' },
      parentRefs: [implementationRef], subjectRef: implementationRef,
      operation: SF2C2_OPERATIONS.RECORD_REVIEW,
    });
    await assert.rejects(() => control.execute(builderReview), (error) => (
      error.code === 'SF2C2_REVIEW_AUTHORITY_DENIED'
    ));
    const bypass = gateCommand({
      runId: 'sf2c2-security-run', requirementId: 'sf2c2-security-requirement',
      revision: step.revision, actorId: 'sf-release-baseline',
      toState: RUN_STATES.RELEASE_CANDIDATE, evidenceRefs: [implementationRef],
    });
    await assert.rejects(() => control.execute(bypass), (error) => (
      error.code === 'INVALID_GATE_TRANSITION'
    ));
    const finalRead = await control.readRun('sf2c2-happy-run');
    const staleApproval = gateCommand({
      runId: 'sf2c2-happy-run', requirementId: 'sf2c2-happy-requirement',
      revision: finalRead.revision, actorId: 'sf-release-baseline',
      toState: RUN_STATES.BASELINED, evidenceRefs: [happy.releaseRef],
    });
    await assert.rejects(() => control.execute(staleApproval), (error) => (
      error.code === 'SF2C2_RELEASE_EXECUTION_DENIED'
    ));
  });

  await t.test('5. Artifact version is monotonic; stale version/evidence are denied', async () => {
    const control = createControl();
    let step = await createUntilBuilding(control, 'sf2c2-version-run', 'sf2c2-version-requirement');
    step = await executeAndRevision(control, artifactCommand({
      runId: 'sf2c2-version-run', requirementId: 'sf2c2-version-requirement',
      revision: step.revision, actorId: 'sf-backend-domain',
      artifactId: 'sf2c2-version-implementation', artifactType: ARTIFACT_TYPES.IMPLEMENTATION,
      payload: implementationPayload(1), parentRefs: [step.architectureRef],
      operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    const v1Ref = artifactRef(step.state, 'sf2c2-version-implementation');
    const stale = artifactCommand({
      runId: 'sf2c2-version-run', requirementId: 'sf2c2-version-requirement',
      revision: step.revision, actorId: 'sf-backend-domain',
      artifactId: 'sf2c2-version-implementation', artifactType: ARTIFACT_TYPES.IMPLEMENTATION,
      expectedPreviousVersion: 0, payload: implementationPayload(2),
      parentRefs: [v1Ref], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    });
    await assert.rejects(() => control.execute(stale), (error) => (
      error.code === 'SF2C2_STALE_ARTIFACT_VERSION'
    ));
    step = await executeAndRevision(control, artifactCommand({
      runId: 'sf2c2-version-run', requirementId: 'sf2c2-version-requirement',
      revision: step.revision, actorId: 'sf-backend-domain',
      artifactId: 'sf2c2-version-implementation', artifactType: ARTIFACT_TYPES.IMPLEMENTATION,
      expectedPreviousVersion: 1, payload: implementationPayload(2),
      parentRefs: [v1Ref], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    assert.equal(artifactRef(step.state, 'sf2c2-version-implementation').version, 2);
    const staleGate = gateCommand({
      runId: 'sf2c2-version-run', requirementId: 'sf2c2-version-requirement',
      revision: step.revision, actorId: 'sf-backend-domain',
      toState: RUN_STATES.BUILT, evidenceRefs: [v1Ref],
    });
    await assert.rejects(() => control.execute(staleGate), (error) => (
      error.code === 'SF2C2_STALE_GATE_EVIDENCE'
    ));
  });

  await t.test('5b. Latest applicable Review/Test/Release evidence wins across Artifact IDs', async () => {
    const control = createControl();

    const reviewRun = 'sf2c2-review-order-run';
    const reviewRequirement = 'sf2c2-review-order-requirement';
    let reviewStep = await createUntilBuilding(control, reviewRun, reviewRequirement);
    reviewStep = await executeAndRevision(control, artifactCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-backend-domain', artifactId: reviewRun + '-implementation',
      artifactType: ARTIFACT_TYPES.IMPLEMENTATION, payload: implementationPayload(1),
      parentRefs: [reviewStep.architectureRef], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    const reviewImplementation = artifactRef(reviewStep.state, reviewRun + '-implementation');
    reviewStep = await executeAndRevision(control, gateCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-backend-domain', toState: RUN_STATES.BUILT, evidenceRefs: [reviewImplementation],
    }));
    reviewStep = await executeAndRevision(control, gateCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-orchestrator', toState: RUN_STATES.IN_REVIEW, evidenceRefs: [reviewImplementation],
    }));
    reviewStep = await executeAndRevision(control, artifactCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-independent-reviewer', artifactId: reviewRun + '-pass-review',
      artifactType: ARTIFACT_TYPES.REVIEW, payload: reviewPayload('PASS', 'NONE'),
      parentRefs: [reviewImplementation], subjectRef: reviewImplementation,
      operation: SF2C2_OPERATIONS.RECORD_REVIEW,
    }));
    const olderPassReview = artifactRef(reviewStep.state, reviewRun + '-pass-review');
    reviewStep = await executeAndRevision(control, artifactCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-independent-reviewer', artifactId: reviewRun + '-blocked-review',
      artifactType: ARTIFACT_TYPES.REVIEW, payload: reviewPayload('BLOCKED', 'P1'),
      parentRefs: [reviewImplementation], subjectRef: reviewImplementation,
      operation: SF2C2_OPERATIONS.RECORD_REVIEW,
    }));
    const latestBlockedReview = artifactRef(reviewStep.state, reviewRun + '-blocked-review');
    reviewStep = await executeAndRevision(control, artifactCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-independent-reviewer', artifactId: reviewRun + '-new-pass-review',
      artifactType: ARTIFACT_TYPES.REVIEW, payload: reviewPayload('PASS', 'NONE'),
      parentRefs: [reviewImplementation], subjectRef: reviewImplementation,
      operation: SF2C2_OPERATIONS.RECORD_REVIEW,
    }));
    const newerPassReview = artifactRef(reviewStep.state, reviewRun + '-new-pass-review');
    await assert.rejects(() => control.execute(gateCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-independent-reviewer', toState: RUN_STATES.REVIEW_PASSED,
      evidenceRefs: [olderPassReview, newerPassReview],
    })), (error) => error.code === 'SF2C2_REVIEW_PASS_EVIDENCE_REQUIRED');
    reviewStep = await executeAndRevision(control, gateCommand({
      runId: reviewRun, requirementId: reviewRequirement, revision: reviewStep.revision,
      actorId: 'sf-independent-reviewer', toState: RUN_STATES.BLOCKED,
      evidenceRefs: [latestBlockedReview],
    }));
    assert.equal(reviewStep.state.factory_run.gate_state, RUN_STATES.BLOCKED);

    const testRun = 'sf2c2-test-order-run';
    const testRequirement = 'sf2c2-test-order-requirement';
    let testStep = await createUntilBuilding(control, testRun, testRequirement);
    testStep = await executeAndRevision(control, artifactCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-backend-domain', artifactId: testRun + '-implementation',
      artifactType: ARTIFACT_TYPES.IMPLEMENTATION, payload: implementationPayload(1),
      parentRefs: [testStep.architectureRef], operation: SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION,
    }));
    const testImplementation = artifactRef(testStep.state, testRun + '-implementation');
    testStep = await executeAndRevision(control, gateCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-backend-domain', toState: RUN_STATES.BUILT, evidenceRefs: [testImplementation],
    }));
    testStep = await executeAndRevision(control, gateCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-orchestrator', toState: RUN_STATES.IN_REVIEW, evidenceRefs: [testImplementation],
    }));
    testStep = await executeAndRevision(control, artifactCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-independent-reviewer', artifactId: testRun + '-review',
      artifactType: ARTIFACT_TYPES.REVIEW, payload: reviewPayload(),
      parentRefs: [testImplementation], subjectRef: testImplementation,
      operation: SF2C2_OPERATIONS.RECORD_REVIEW,
    }));
    const testReview = artifactRef(testStep.state, testRun + '-review');
    testStep = await executeAndRevision(control, gateCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-independent-reviewer', toState: RUN_STATES.REVIEW_PASSED,
      evidenceRefs: [testReview],
    }));
    testStep = await executeAndRevision(control, gateCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-qa-uat', toState: RUN_STATES.TESTING, evidenceRefs: [testReview],
    }));
    testStep = await executeAndRevision(control, artifactCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-qa-uat', artifactId: testRun + '-pass-test',
      artifactType: ARTIFACT_TYPES.TEST, payload: testPayload('AUTOMATED', 'PASS'),
      parentRefs: [testImplementation], subjectRef: testImplementation,
      operation: SF2C2_OPERATIONS.RECORD_TEST_EVIDENCE,
    }));
    const olderPassTest = artifactRef(testStep.state, testRun + '-pass-test');
    testStep = await executeAndRevision(control, artifactCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-qa-uat', artifactId: testRun + '-fail-test',
      artifactType: ARTIFACT_TYPES.TEST, payload: testPayload('SECURITY', 'FAIL'),
      parentRefs: [testImplementation], subjectRef: testImplementation,
      operation: SF2C2_OPERATIONS.RECORD_TEST_EVIDENCE,
    }));
    const latestFailTest = artifactRef(testStep.state, testRun + '-fail-test');
    testStep = await executeAndRevision(control, artifactCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-qa-uat', artifactId: testRun + '-new-pass-test',
      artifactType: ARTIFACT_TYPES.TEST, payload: testPayload('AUTOMATED', 'PASS'),
      parentRefs: [testImplementation], subjectRef: testImplementation,
      operation: SF2C2_OPERATIONS.RECORD_TEST_EVIDENCE,
    }));
    const newerPassTest = artifactRef(testStep.state, testRun + '-new-pass-test');
    await assert.rejects(() => control.execute(gateCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-qa-uat', toState: RUN_STATES.TEST_PASSED,
      evidenceRefs: [olderPassTest, newerPassTest],
    })), (error) => error.code === 'SF2C2_TEST_PASS_EVIDENCE_REQUIRED');
    testStep = await executeAndRevision(control, gateCommand({
      runId: testRun, requirementId: testRequirement, revision: testStep.revision,
      actorId: 'sf-qa-uat', toState: RUN_STATES.FAILED, evidenceRefs: [latestFailTest],
    }));
    assert.equal(testStep.state.factory_run.gate_state, RUN_STATES.FAILED);

    const releaseRun = 'sf2c2-release-order-run';
    const releaseRequirement = 'sf2c2-release-order-requirement';
    let releaseStep = await fullTrace(control, releaseRun, releaseRequirement, { stopAtUatPassed: true });
    const releaseImplementation = releaseStep.implementationRef;
    releaseStep = await executeAndRevision(control, artifactCommand({
      runId: releaseRun, requirementId: releaseRequirement, revision: releaseStep.revision,
      actorId: 'sf-release-baseline', artifactId: releaseRun + '-candidate',
      artifactType: ARTIFACT_TYPES.RELEASE, payload: releasePayload(),
      parentRefs: [releaseImplementation], subjectRef: releaseImplementation,
      operation: SF2C2_OPERATIONS.RECORD_RELEASE_EVIDENCE,
    }));
    const olderCandidate = artifactRef(releaseStep.state, releaseRun + '-candidate');
    releaseStep = await executeAndRevision(control, artifactCommand({
      runId: releaseRun, requirementId: releaseRequirement, revision: releaseStep.revision,
      actorId: 'sf-release-baseline', artifactId: releaseRun + '-rejected',
      artifactType: ARTIFACT_TYPES.RELEASE,
      payload: { ...releasePayload(), release_status: 'REJECTED' },
      parentRefs: [releaseImplementation], subjectRef: releaseImplementation,
      operation: SF2C2_OPERATIONS.RECORD_RELEASE_EVIDENCE,
    }));
    releaseStep = await executeAndRevision(control, artifactCommand({
      runId: releaseRun, requirementId: releaseRequirement, revision: releaseStep.revision,
      actorId: 'sf-release-baseline', artifactId: releaseRun + '-new-candidate',
      artifactType: ARTIFACT_TYPES.RELEASE, payload: releasePayload(),
      parentRefs: [releaseImplementation], subjectRef: releaseImplementation,
      operation: SF2C2_OPERATIONS.RECORD_RELEASE_EVIDENCE,
    }));
    const newerCandidate = artifactRef(releaseStep.state, releaseRun + '-new-candidate');
    await assert.rejects(() => control.execute(gateCommand({
      runId: releaseRun, requirementId: releaseRequirement, revision: releaseStep.revision,
      actorId: 'sf-release-baseline', toState: RUN_STATES.RELEASE_CANDIDATE,
      evidenceRefs: [olderCandidate, newerCandidate],
    })), (error) => error.code === 'SF2C2_RELEASE_CANDIDATE_EVIDENCE_REQUIRED');
    assert.equal((await control.readRun(releaseRun)).revision, releaseStep.revision);
  });

  await t.test('6. Two coordinators cannot commit one revision; duplicate event is idempotent', async () => {
    const first = createControl();
    const second = createControl();
    const runId = 'sf2c2-concurrency-run';
    const requirementId = 'sf2c2-concurrency-requirement';
    const created = await executeAndRevision(first, createRunCommand(runId, requirementId));
    const requirementRef = artifactRef(created.state, runId + '-requirement-artifact');
    const one = command({
      runId, requirementId, revision: created.revision, actorId: 'sf-product-owner',
      operation: SF2C2_OPERATIONS.CREATE_HANDOFF,
      payload: {
        handoff_id: 'sf2c2-concurrent-handoff-one', to_agent_id: 'sf-solution-architect',
        purpose: 'Concurrent one', artifact_refs: [requirementRef],
      },
    });
    const two = command({
      runId, requirementId, revision: created.revision, actorId: 'sf-product-owner',
      operation: SF2C2_OPERATIONS.CREATE_HANDOFF,
      payload: {
        handoff_id: 'sf2c2-concurrent-handoff-two', to_agent_id: 'sf-solution-architect',
        purpose: 'Concurrent two', artifact_refs: [requirementRef],
      },
    });
    const results = await Promise.allSettled([first.execute(one), second.execute(two)]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected'
      && item.reason?.code === 'CONCURRENT_MUTATION_DENIED').length, 1);
    const winner = results.find((item) => item.status === 'fulfilled').value;
    const winnerCommand = results[0].status === 'fulfilled' ? one : two;
    const replay = await first.execute(winnerCommand);
    assert.equal(replay.replayed, true);
    assert.equal(replay.receipt.committed_revision, winner.receipt.committed_revision);
    const read = await first.readRun(runId);
    assert.equal(read.state.handoffs.length, 1);
    assert.equal(read.state.trace_events.length, 2);
  });

  await t.test('7. Unknown/timeout fail closed; lost ACK recovers one committed outcome', async () => {
    const control = createControl();
    await controlService(storeService, storeToken, { action: 'set_fault', value: 'unknown_without_commit' });
    await assert.rejects(() => control.execute(createRunCommand(
      'sf2c2-unknown-run', 'sf2c2-unknown-requirement', 0,
    )), (error) => error.code === 'DURABLE_COMMIT_INDETERMINATE');
    await assert.rejects(() => control.readRun('sf2c2-unknown-run'), (error) => (
      error.code === 'SF2C2_FACTORY_RUN_NOT_FOUND'
    ));

    await controlService(storeService, storeToken, { action: 'set_fault', value: 'timeout_before_commit' });
    const timeoutControl = createControl({ storeTimeout: 100 });
    await assert.rejects(() => timeoutControl.execute(createRunCommand(
      'sf2c2-timeout-run', 'sf2c2-timeout-requirement', 0,
    )), (error) => error.code === 'DURABLE_COMMIT_INDETERMINATE');

    await controlService(storeService, storeToken, { action: 'set_fault', value: 'commit_then_disconnect' });
    const recovered = await control.execute(createRunCommand(
      'sf2c2-lost-ack-run', 'sf2c2-lost-ack-requirement', 0,
    ));
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.receipt.committed_revision, 1);
    assert.equal((await control.readRun('sf2c2-lost-ack-run')).revision, 1);
  });

  await t.test('8. Store/KMS unavailable remain DENY and create no durable state', async () => {
    const unavailableStoreControl = createControl();
    await stopService(storeService);
    await assert.rejects(() => unavailableStoreControl.readRun('sf2c2-happy-run'), (error) => (
      error.code === 'SF2C1_STORE_UNAVAILABLE'
    ));
    storeService = await startStore();

    const unavailableKmsControl = createControl();
    await stopService(kmsService);
    await assert.rejects(() => unavailableKmsControl.execute(createRunCommand(
      'sf2c2-kms-down-run', 'sf2c2-kms-down-requirement', 0,
    )), (error) => error.code === 'SF2C1_KMS_UNAVAILABLE');
    kmsService = await startKms();
    await assert.rejects(() => createControl().readRun('sf2c2-kms-down-run'), (error) => (
      error.code === 'SF2C2_FACTORY_RUN_NOT_FOUND'
    ));
  });

  await t.test('9. Artifact/digest tamper and missing durable evidence are detected', async () => {
    const control = createControl();
    const semanticTamper = JSON.parse(JSON.stringify(happy.state));
    semanticTamper.artifact_versions[0].artifact.payload.objective = 'tampered objective';
    assert.throws(() => verifyStagingFactoryState(semanticTamper), (error) => (
      ['ARTIFACT_TAMPERED', 'SF2C2_SEMANTIC_RECORD_TAMPERED'].includes(error.code)
    ));

    const tamperRun = 'sf2c2-persisted-tamper-run';
    await control.execute(createRunCommand(tamperRun, 'sf2c2-persisted-tamper-requirement'));
    const db = new DatabaseSync(storeDatabasePath);
    const row = db.prepare(
      'SELECT record_json FROM sf2c1_state_records WHERE scope_id = ? ORDER BY revision DESC LIMIT 1',
    ).get(tamperRun);
    const original = row.record_json;
    const record = JSON.parse(original);
    record.state.artifact_versions[0].artifact.payload.objective = 'persisted tamper';
    db.prepare(
      'UPDATE sf2c1_state_records SET record_json = ? WHERE scope_id = ? AND revision = 1',
    ).run(stableSerialize(record), tamperRun);
    db.close();
    await assert.rejects(() => control.readRun(tamperRun), (error) => (
      error.code === 'DURABLE_STATE_TAMPERED'
    ));
    const restoreDb = new DatabaseSync(storeDatabasePath);
    restoreDb.prepare(
      'UPDATE sf2c1_state_records SET record_json = ? WHERE scope_id = ? AND revision = 1',
    ).run(original, tamperRun);
    restoreDb.close();
    assert.equal((await control.readRun(tamperRun)).revision, 1);

    const missingRun = 'sf2c2-missing-evidence-run';
    await control.execute(createRunCommand(missingRun, 'sf2c2-missing-evidence-requirement'));
    const missingDb = new DatabaseSync(storeDatabasePath);
    missingDb.prepare('DELETE FROM sf2c1_evidence_records WHERE scope_id = ?').run(missingRun);
    missingDb.close();
    await assert.rejects(() => control.readRun(missingRun), (error) => (
      ['DURABLE_PARTIAL_COMMIT_DETECTED', 'DURABLE_HISTORY_INCOMPLETE'].includes(error.code)
    ));
  });

  await t.test('10. Boundary remains candidate-only and introduces no runtime authority', async () => {
    const serialized = stableSerialize(happy.state);
    assert.doesNotMatch(serialized, /provider_model|production_credential|business_agent_registry/i);
    assert.match(happy.releaseRef.digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(happy.state.release_evidence[0].release_status, 'CANDIDATE');
    assert.equal(happy.state.factory_run.gate_state, RUN_STATES.AWAITING_FOUNDER_APPROVAL);
  });
});
