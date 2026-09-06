#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {
  buildFounderLocalChildEnvironment,
  loadFounderLocalDataEnvironment,
} = require('../src/config/founderLocalEnv');
const {
  EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST,
  FOUNDER_LOCAL_PROVENANCE_ENV_KEYS,
  applyFounderLocalProvenanceEnvironment,
  readFounderLocalCandidateBinding,
  readFounderLocalDistIdentity,
} = require('../src/config/founderLocalRuntimeProvenance');

const backendDir = path.resolve(__dirname, '..');
const repositoryDir = path.resolve(backendDir, '..');
const runtimeDir = path.join(backendDir, '.runtime', 'founder-local-v1');
const configDir = path.join(runtimeDir, 'configuration');
const processFile = path.join(runtimeDir, 'process.json');
const processLockFile = path.join(runtimeDir, 'process.lock.json');
const logFile = path.join(runtimeDir, 'server.log');

let candidateBinding;
try {
  candidateBinding = readFounderLocalCandidateBinding(repositoryDir);
} catch (error) {
  console.error(`Founder-local refused to start: ${error.code || 'FOUNDER_LOCAL_GIT_VERIFICATION_FAILED'}.`);
  process.exit(1);
}
const candidateIdentity = candidateBinding.source_candidate;
const checkoutIdentity = candidateBinding.checkout;

// Establish the safety identity before dotenv. The protected env is loaded
// without overriding these values, then the profile re-applies every guard.
process.env.RUNTIME_PROFILE = 'founder-local-read-only';
process.env.FOUNDER_LOCAL_READ_ONLY = '1';
process.env.FOUNDER_LOCAL_CONFIG_DIR = configDir;

const envFileSetting = String(process.env.FOUNDER_LOCAL_ENV_FILE || '').trim();
if (!envFileSetting || !path.isAbsolute(envFileSetting)) {
  console.error('Founder-local refused to start: FOUNDER_LOCAL_ENV_FILE must be an explicit absolute path.');
  process.exit(1);
}
const envFile = path.resolve(envFileSetting);
try {
  loadFounderLocalDataEnvironment(envFile);
} catch (error) {
  console.error(`Founder-local refused to start: ${error.code || 'FOUNDER_LOCAL_ENV_FILE_UNREADABLE'}.`);
  process.exit(1);
}

// Advisory file writes are OFF unless the operator explicitly opted in with
// the exact value "1". Keep them disabled while the runtime profile and its
// required real-data configuration are being validated; enable only after the
// fail-closed profile checks have passed.
const advisoryConfigurationOptIn = process.env.FOUNDER_ADVISORY_CONFIG_ENABLED === '1';
process.env.FOUNDER_ADVISORY_CONFIG_ENABLED = '0';

const {
  FOUNDER_LOCAL_FORCED_ENV,
  applyRuntimeProfile,
  assertFounderLocalDataConfig,
  runtimeSafetySnapshot,
} = require('../src/config/runtimeProfile');

try {
  applyRuntimeProfile();
  assertFounderLocalDataConfig();
  if (advisoryConfigurationOptIn) process.env.FOUNDER_ADVISORY_CONFIG_ENABLED = '1';
} catch (error) {
  console.error(`Founder-local refused to start: ${error.code || 'configuration_invalid'}.`);
  process.exit(1);
}

let frontendDistIdentity;
try {
  frontendDistIdentity = readFounderLocalDistIdentity(repositoryDir);
} catch (error) {
  console.error(`Founder-local refused to start: ${error.code || 'FOUNDER_LOCAL_FRONTEND_DIST_INVALID'}.`);
  process.exit(1);
}

applyFounderLocalProvenanceEnvironment(process.env, {
  candidate: candidateIdentity,
  checkout: checkoutIdentity,
  frontendDist: frontendDistIdentity,
});

fs.mkdirSync(runtimeDir, { recursive: true });
fs.mkdirSync(configDir, { recursive: true });

if (process.argv.includes('--verify-only')) {
  console.log(JSON.stringify({
    ok: true,
    runtime: runtimeSafetySnapshot(),
    frontend_built: true,
    candidate: candidateIdentity,
    checkout: checkoutIdentity,
    acceptance_only_checkout: candidateBinding.acceptance_only_checkout,
    frontend_dist: frontendDistIdentity,
    frontend_contract: EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST.contract_version,
    runtime_state_directory: 'backend/.runtime/founder-local-v1',
  }, null, 2));
  process.exit(0);
}

const runId = crypto.randomUUID();
const startedAt = new Date().toISOString();
applyFounderLocalProvenanceEnvironment(process.env, {
  candidate: candidateIdentity,
  checkout: checkoutIdentity,
  frontendDist: frontendDistIdentity,
  launcherPid: process.pid,
  runId,
});
const claim = {
  schema_version: '1.0.0',
  run_id: runId,
  state: 'starting',
  profile: 'founder-local-read-only',
  host: '127.0.0.1',
  port: Number(process.env.PORT),
  launcher_pid: process.pid,
  started_at: startedAt,
  candidate: candidateIdentity,
  checkout: checkoutIdentity,
  acceptance_only_checkout: candidateBinding.acceptance_only_checkout,
  frontend_dist: frontendDistIdentity,
};

function removeOwnedRecord(file) {
  try {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (current?.run_id === runId) fs.unlinkSync(file);
  } catch { /* absent or no longer owned */ }
}

function clearOwnedRuntimeRecords() {
  removeOwnedRecord(processFile);
  removeOwnedRecord(processLockFile);
}

try {
  fs.writeFileSync(processLockFile, `${JSON.stringify(claim, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  if (fs.existsSync(processFile)) {
    const error = new Error('Founder-local process record already exists.');
    error.code = 'FOUNDER_LOCAL_PROCESS_RECORD_EXISTS';
    throw error;
  }
} catch (error) {
  const code = error?.code === 'EEXIST'
    ? 'FOUNDER_LOCAL_PROCESS_ALREADY_CLAIMED'
    : (error?.code || 'FOUNDER_LOCAL_PROCESS_CLAIM_FAILED');
  removeOwnedRecord(processLockFile);
  console.error(`Founder-local refused to start: ${code}.`);
  process.exit(1);
}

const childEnvironment = buildFounderLocalChildEnvironment(process.env, {
  additionalKeys: [
    ...Object.keys(FOUNDER_LOCAL_FORCED_ENV),
    'RUNTIME_PROFILE',
    'FOUNDER_LOCAL_READ_ONLY',
    'FOUNDER_LOCAL_CONFIG_DIR',
    'FOUNDER_LOCAL_PORT',
    'FOUNDER_ADVISORY_CONFIG_ENABLED',
    ...FOUNDER_LOCAL_PROVENANCE_ENV_KEYS,
    'PORT',
    'FRONTEND_URL',
    'CORS_ORIGINS',
  ],
});
let logFd;
let child;
try {
  logFd = fs.openSync(logFile, 'a');
  child = spawn(process.execPath, ['--use-system-ca', 'src/server.js'], {
    cwd: backendDir,
    env: childEnvironment,
    stdio: ['ignore', logFd, logFd, 'ipc'],
    windowsHide: true,
  });
  fs.closeSync(logFd);
  logFd = undefined;
  if (!Number.isInteger(child.pid)) throw new Error('FOUNDER_LOCAL_CHILD_PID_MISSING');
} catch (error) {
  try { if (logFd !== undefined) fs.closeSync(logFd); } catch { /* ignore */ }
  try { child?.kill('SIGTERM'); } catch { /* ignore */ }
  clearOwnedRuntimeRecords();
  console.error(`Founder-local refused to start: ${error.code || 'FOUNDER_LOCAL_CHILD_START_FAILED'}.`);
  process.exit(1);
}

let stopping = false;
let ready = false;
const stopChild = (signal) => {
  if (stopping) return;
  stopping = true;
  try { child.kill(signal); } catch { /* already stopped */ }
};
process.once('SIGINT', () => stopChild('SIGINT'));
process.once('SIGTERM', () => stopChild('SIGTERM'));

child.once('error', (error) => {
  clearOwnedRuntimeRecords();
  console.error(`Founder-local child failed: ${error.code || error.name || 'spawn_error'}.`);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  clearOwnedRuntimeRecords();
  if (ready && signal) console.log(`Founder-local stopped by ${signal}.`);
  process.exit(code == null ? 1 : code);
});

function identityMatches(actual, expected) {
  return actual && expected
    && Object.keys(expected).every((key) => actual[key] === expected[key]);
}

function readyRuntimeMatches(message, runtime) {
  return message?.type === 'founder-local-ready-v1'
    && message.run_id === runId
    && runtime?.profile === 'founder-local-read-only'
    && runtime.bind_host === claim.host
    && runtime.bind_port === claim.port
    && runtime.instance_id === runId
    && runtime.process_id === child.pid
    && runtime.launcher_process_id === process.pid
    && runtime.launcher_owned === true
    && identityMatches(runtime.candidate, candidateIdentity)
    && identityMatches(runtime.checkout, checkoutIdentity)
    && identityMatches(runtime.frontend_dist, frontendDistIdentity);
}

const readinessTimeout = setTimeout(() => {
  if (ready) return;
  console.error('Founder-local refused to start: FOUNDER_LOCAL_CHILD_READINESS_TIMEOUT.');
  stopChild('SIGTERM');
}, 30_000);
readinessTimeout.unref?.();

child.once('message', async (message) => {
  try {
    if (stopping || ready) return;
    if (!readyRuntimeMatches(message, message?.runtime)) {
      throw Object.assign(new Error('readiness_invalid'), { code: 'FOUNDER_LOCAL_CHILD_READINESS_INVALID' });
    }
    const response = await fetch(`http://127.0.0.1:${claim.port}/api/health`, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    const health = await response.json();
    if (stopping || !response.ok || !readyRuntimeMatches(message, health?.runtime)) {
      throw Object.assign(new Error('health_invalid'), { code: 'FOUNDER_LOCAL_CHILD_HEALTH_INVALID' });
    }
    const candidateBindingAfter = readFounderLocalCandidateBinding(repositoryDir);
    const frontendDistAfter = readFounderLocalDistIdentity(repositoryDir);
    if (
      !identityMatches(candidateBindingAfter.source_candidate, candidateIdentity)
      || !identityMatches(candidateBindingAfter.checkout, checkoutIdentity)
      || candidateBindingAfter.acceptance_only_checkout !== candidateBinding.acceptance_only_checkout
      || !identityMatches(frontendDistAfter, frontendDistIdentity)
    ) {
      throw Object.assign(new Error('candidate_changed'), {
        code: 'FOUNDER_LOCAL_CANDIDATE_CHANGED_DURING_STARTUP',
      });
    }
    fs.writeFileSync(processFile, `${JSON.stringify({
      ...claim,
      state: 'running',
      pid: child.pid,
    }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    ready = true;
    clearTimeout(readinessTimeout);
    console.log(`Founder-local started at http://127.0.0.1:${process.env.PORT} (PID ${child.pid}).`);
    console.log('Raw output: backend/.runtime/founder-local-v1/server.log');
  } catch (error) {
    clearTimeout(readinessTimeout);
    console.error(`Founder-local refused to start: ${error.code || 'FOUNDER_LOCAL_CHILD_READINESS_FAILED'}.`);
    stopChild('SIGTERM');
  }
});
