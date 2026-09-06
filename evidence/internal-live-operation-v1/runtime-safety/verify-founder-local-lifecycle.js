#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { readCandidateBinding } = require('./candidate-binding');
const { buildFounderLocalChildEnvironment } = require('../../../backend/src/config/founderLocalEnv');
const { assertFounderLocalProcessBinding } = require('../../../backend/src/config/founderLocalProcessBinding');
const { readFounderLocalDistIdentity } = require('../../../backend/src/config/founderLocalRuntimeProvenance');
const { stopFounderLocalRuntime, portIsClosed, processIsAlive } = require('../../../backend/scripts/stop-founder-local-read-only');

const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const backendDir = path.join(repositoryDir, 'backend');
const runtimeDir = path.join(backendDir, '.runtime', 'founder-local-v1');
const outputDir = path.join(__dirname, 'runtime', 'candidates', 'c3-r2');
const outputFile = path.join(outputDir, 'lifecycle-runtime-verification.json');
const processFile = path.join(runtimeDir, 'process.json');
const lockFile = path.join(runtimeDir, 'process.lock.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireTrue(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

function assertLocalDirectory(directory) {
  const relative = path.relative(repositoryDir, path.resolve(directory));
  requireTrue(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'LIFECYCLE_DIRECTORY_INVALID');
  let current = repositoryDir;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      requireTrue(stat.isDirectory() && !stat.isSymbolicLink(), 'LIFECYCLE_DIRECTORY_INVALID');
    } else fs.mkdirSync(current);
  }
}

function assertRegularRecord(file) {
  const stat = fs.lstatSync(file);
  requireTrue(stat.isFile() && !stat.isSymbolicLink(), 'LIFECYCLE_RECORD_INVALID');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function assertStopped(record) {
  requireTrue(!processIsAlive(record.pid) && !processIsAlive(record.launcher_pid), 'LIFECYCLE_PROCESSES_STILL_ALIVE');
  requireTrue(await portIsClosed('127.0.0.1', 4010), 'LIFECYCLE_PORT_STILL_OPEN');
  requireTrue(!fs.existsSync(processFile) && !fs.existsSync(lockFile), 'LIFECYCLE_RECORDS_REMAIN');
}

async function runCycle(candidate, frontendDist) {
  const started = Date.now();
  requireTrue(!fs.existsSync(processFile) && !fs.existsSync(lockFile), 'LIFECYCLE_REQUIRES_CLEAN_STOP');
  requireTrue(await portIsClosed('127.0.0.1', 4010), 'LIFECYCLE_PORT_IN_USE');
  const tempDir = path.join(runtimeDir, 'tmp');
  assertLocalDirectory(tempDir);
  // The launcher alone loads the operator-selected file in place. This wrapper
  // imports no credential values and passes no unrelated integration environment.
  const childEnv = buildFounderLocalChildEnvironment(process.env, { includeDataKeys: false });
  Object.assign(childEnv, {
    FOUNDER_LOCAL_ENV_FILE: process.env.FOUNDER_LOCAL_ENV_FILE,
    FOUNDER_LOCAL_PORT: '4010',
    FOUNDER_ADVISORY_CONFIG_ENABLED: '0',
    TEMP: tempDir,
    TMP: tempDir,
  });
  const launcher = spawn(process.execPath, ['scripts/start-founder-local-read-only.js'], {
    cwd: backendDir, env: childEnv, stdio: 'ignore', windowsHide: true,
  });
  let spawnError = false;
  launcher.on('error', () => { spawnError = true; });
  const deadline = Date.now() + 45_000;
  let record;
  try {
  while (Date.now() < deadline) {
    requireTrue(!spawnError && launcher.exitCode == null && launcher.signalCode == null, 'LIFECYCLE_START_FAILED');
    if (fs.existsSync(processFile) && fs.existsSync(lockFile)) {
      record = assertRegularRecord(processFile);
      requireTrue(record.launcher_pid === launcher.pid, 'LIFECYCLE_LAUNCHER_MISMATCH');
      const lock = assertRegularRecord(lockFile);
      const response = await fetch('http://127.0.0.1:4010/api/health', {
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      const health = await response.json();
      requireTrue(response.ok, 'LIFECYCLE_HEALTH_FAILED');
      assertFounderLocalProcessBinding({ lock, record, runtime: health.runtime,
        candidate, checkout: candidate, frontendDist });
      for (const key of ['controlled_real_writes_enabled', 'background_writers_enabled', 'realtime_writes_enabled', 'public_binding_enabled']) {
        requireTrue(health.runtime[key] === false, 'LIFECYCLE_UNSAFE_RUNTIME');
      }
      break;
    }
    await delay(100);
  }
  requireTrue(record, 'LIFECYCLE_START_TIMEOUT');
  const stopped = await stopFounderLocalRuntime();
  requireTrue(stopped.ok && stopped.status === 'stopped' && stopped.process_identity_attested
    && stopped.processes_dead && stopped.port_closed && stopped.records_cleaned, 'LIFECYCLE_STOP_FAILED');
  await assertStopped(record);
  const repeated = await stopFounderLocalRuntime();
  requireTrue(repeated.ok && repeated.status === 'already_stopped', 'LIFECYCLE_REPEAT_STOP_FAILED');
  // The empty-record response makes no process claim; prove that fact here using
  // the exact pair this cycle attested before stop, and check the same port again.
  await assertStopped(record);
  return {
    result: 'PASS',
    run_ref: createHash('sha256').update(record.run_id).digest('hex').slice(0, 16),
    duration_ms: Date.now() - started,
    candidate_bound: true,
    loopback_only: true,
    operational_writes_disabled: true,
    owned_launcher_and_child_attested: true,
    stop_succeeded: true,
    repeated_stop_succeeded: true,
    exact_processes_dead: true,
    port_closed: true,
    pid_and_lock_absent: true,
    manual_cleanup_used: false,
  };
  } catch (error) {
    // A failing verifier must not orphan the launcher it just created. The
    // stopper is invoked only for records that still name this exact launcher;
    // it independently checks the live pair or dead owned records before cleanup.
    const stopOnlyThisRun = async () => {
      assertLocalDirectory(runtimeDir);
      const current = fs.existsSync(processFile) ? assertRegularRecord(processFile) : null;
      const lock = fs.existsSync(lockFile) ? assertRegularRecord(lockFile) : null;
      requireTrue([current, lock].filter(Boolean).every((item) => (
        item.launcher_pid === launcher.pid && (!record || item.run_id === record.run_id)
      )), 'LIFECYCLE_CLEANUP_OWNERSHIP_CHANGED');
      await stopFounderLocalRuntime();
    };
    try { await stopOnlyThisRun(); } catch { /* keep the primary failure */ }
    if (launcher.pid && launcher.exitCode == null && launcher.signalCode == null) {
      // ChildProcess owns an OS process handle; this is not a PID search or kill-all.
      try { launcher.kill('SIGTERM'); } catch { /* checked below */ }
    }
    const cleanupDeadline = Date.now() + 8000;
    while (launcher.pid && processIsAlive(launcher.pid) && Date.now() < cleanupDeadline) await delay(100);
    try {
      await stopOnlyThisRun();
      requireTrue(!launcher.pid || !processIsAlive(launcher.pid), 'LIFECYCLE_CLEANUP_LAUNCHER_ALIVE');
      if (record) requireTrue(!processIsAlive(record.pid), 'LIFECYCLE_CLEANUP_CHILD_ALIVE');
      requireTrue(await portIsClosed('127.0.0.1', 4010), 'LIFECYCLE_CLEANUP_PORT_OPEN');
      requireTrue(!fs.existsSync(processFile) && !fs.existsSync(lockFile), 'LIFECYCLE_CLEANUP_RECORDS_REMAIN');
    } catch { error.cleanup_failed = true; }
    throw error;
  }
}

async function main() {
  const candidate = readCandidateBinding();
  requireTrue(path.isAbsolute(String(process.env.FOUNDER_LOCAL_ENV_FILE || '')), 'LIFECYCLE_EXPLICIT_CREDENTIAL_SOURCE_REQUIRED');
  assertLocalDirectory(outputDir);
  assertLocalDirectory(runtimeDir);
  const staticEvidence = JSON.parse(fs.readFileSync(path.join(outputDir, 'static-verification.json'), 'utf8'));
  const frontendDist = readFounderLocalDistIdentity(repositoryDir);
  requireTrue(staticEvidence.result === 'PASS'
    && staticEvidence.candidate.commit === candidate.commit
    && staticEvidence.candidate.tree === candidate.tree
    && staticEvidence.candidate.candidate_attestation_sha256 === candidate.candidate_attestation_sha256
    && staticEvidence.supply_chain.frontend_dist_sha256 === frontendDist.sha256,
  'LIFECYCLE_STATIC_BINDING_INVALID');
  fs.rmSync(outputFile, { force: true });
  const evidence = {
    schema_version: '1.0.0', evidence_type: 'FOUNDER_LOCAL_LIFECYCLE_RUNTIME_VERIFICATION',
    checked_at: new Date().toISOString(), candidate, result: 'FAIL', cycles: [],
    security: { credentials_recorded: false, environment_file_path_recorded: false,
      raw_business_values_recorded: false, canonical_writes_enabled: false },
  };
  try {
    evidence.cycles.push(await runCycle(candidate, frontendDist));
    evidence.cycles.push(await runCycle(candidate, frontendDist));
    requireTrue(evidence.cycles[0].run_ref !== evidence.cycles[1].run_ref, 'LIFECYCLE_RESTART_IDENTITY_REUSED');
    requireTrue(JSON.stringify(readCandidateBinding()) === JSON.stringify(candidate), 'LIFECYCLE_CANDIDATE_CHANGED');
    evidence.clean_restart_verified = true;
    evidence.result = 'PASS';
  } catch (error) {
    const code = String(error?.code || 'LIFECYCLE_VERIFICATION_FAILED');
    evidence.failure_code = /^[A-Z0-9_]{1,100}$/.test(code) ? code : 'LIFECYCLE_VERIFICATION_FAILED';
    if (error.cleanup_failed) evidence.cleanup_failed = true;
  }
  evidence.finished_at = new Date().toISOString();
  const temporary = `${outputFile}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, outputFile);
  } finally { fs.rmSync(temporary, { force: true }); }
  console.log(JSON.stringify({ result: evidence.result, cycles_passed: evidence.cycles.length,
    ...(evidence.failure_code ? { code: evidence.failure_code } : {}) }));
  if (evidence.result !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  const code = String(error?.code || 'LIFECYCLE_VERIFICATION_FAILED');
  console.error(JSON.stringify({ result: 'FAIL', code: /^[A-Z0-9_]{1,100}$/.test(code) ? code : 'LIFECYCLE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
});
