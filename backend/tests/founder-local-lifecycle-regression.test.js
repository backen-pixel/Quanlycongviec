const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  portIsClosed,
  processIsAlive,
  signalExactProcess,
  stopFounderLocalRuntime,
} = require('../scripts/stop-founder-local-read-only');
const {
  buildFounderLocalChildEnvironment,
} = require('../src/config/founderLocalEnv');

const repositoryDir = path.resolve(__dirname, '..', '..');
const testRuntimeParent = path.join(repositoryDir, 'backend', '.runtime');
const fixtureLauncher = path.join(
  __dirname,
  'fixtures',
  'founder-local-stop',
  'start-founder-local-read-only.js',
);
const candidate = Object.freeze({
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
});
const frontendDist = Object.freeze({
  sha256: 'c'.repeat(64),
  manifest_sha256: 'd'.repeat(64),
  contract_version: 'business_ai_os_founder_local_dist_v1',
  runtime_profile: 'founder-local-read-only',
  read_only: true,
  entry_path: '/business-os/login',
  api_base_url: '/api',
  api_origin_policy: 'same-origin-only',
  credential_request_policy: 'single-slash-relative-api-path-only',
});
const fixtureIdentity = Object.freeze({
  candidate,
  checkout: candidate,
  frontend_dist: frontendDist,
});

function makeRuntimeDir() {
  fs.mkdirSync(testRuntimeParent, { recursive: true });
  return fs.mkdtempSync(path.join(testRuntimeParent, 'founder-local-stop-test-'));
}

function removeRuntimeDir(runtimeDir) {
  const resolved = path.resolve(runtimeDir);
  const relative = path.relative(testRuntimeParent, resolved);
  assert.match(path.basename(resolved), /^founder-local-stop-test-/);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  fs.rmSync(resolved, { recursive: true, force: true });
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}

function fixtureRecords({
  runId = crypto.randomUUID(),
  launcherPid = 2_000_000_001,
  childPid = 2_000_000_002,
  port = 45_123,
} = {}) {
  const lock = {
    schema_version: '1.0.0',
    run_id: runId,
    state: 'starting',
    profile: 'founder-local-read-only',
    host: '127.0.0.1',
    port,
    launcher_pid: launcherPid,
    started_at: '2026-09-06T00:00:00.000Z',
    candidate,
    checkout: candidate,
    acceptance_only_checkout: false,
    frontend_dist: frontendDist,
  };
  return { lock, record: { ...lock, state: 'running', pid: childPid } };
}

function waitForJsonLine(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      reject(new Error(`fixture readiness timeout: ${stderr}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    };
    const onStdout = (chunk) => {
      stdout += chunk.toString('utf8');
      const newline = stdout.indexOf('\n');
      if (newline < 0) return;
      cleanup();
      try {
        resolve(JSON.parse(stdout.slice(0, newline)));
      } catch (error) {
        reject(error);
      }
    };
    const onStderr = (chunk) => { stderr += chunk.toString('utf8'); };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`fixture exited before readiness (${code}): ${stderr}`));
    };
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('exit', onExit);
  });
}

function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode != null || child.signalCode != null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('fixture launcher did not exit')), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function launchFixture(runtimeDir) {
  const runId = crypto.randomUUID();
  const encodedIdentity = Buffer.from(JSON.stringify(fixtureIdentity)).toString('base64url');
  const child = spawn(process.execPath, [
    fixtureLauncher,
    runtimeDir,
    runId,
    encodedIdentity,
  ], {
    cwd: repositoryDir,
    env: buildFounderLocalChildEnvironment(process.env, { includeDataKeys: false }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const ready = await waitForJsonLine(child);
  assert.equal(ready.run_id, runId);
  assert.equal(ready.launcher_pid, child.pid);
  assert.equal(processIsAlive(ready.launcher_pid), true);
  assert.equal(processIsAlive(ready.pid), true);
  assert.equal(await portIsClosed('127.0.0.1', ready.port), false);
  return { child, ready };
}

test('owned stop is idempotent and a clean restart needs no manual record deletion', async (t) => {
  const runtimeDir = makeRuntimeDir();
  let active;
  t.after(async () => {
    if (active && processIsAlive(active.ready.launcher_pid)) {
      try { active.child.kill('SIGTERM'); } catch { /* already stopped */ }
      try { await waitForExit(active.child, 3000); } catch { /* test assertion reports the lifecycle */ }
    }
    removeRuntimeDir(runtimeDir);
  });

  active = await launchFixture(runtimeDir);
  const first = await stopFounderLocalRuntime({ runtimeDir });
  assert.deepEqual({
    status: first.status,
    run_id: first.run_id,
    candidate: first.candidate,
    process_identity_attested: first.process_identity_attested,
    records_cleaned: first.records_cleaned,
    processes_dead: first.processes_dead,
    port_closed: first.port_closed,
  }, {
    status: 'stopped',
    run_id: active.ready.run_id,
    candidate,
    process_identity_attested: true,
    records_cleaned: true,
    processes_dead: true,
    port_closed: true,
  });
  await waitForExit(active.child);
  assert.equal(processIsAlive(active.ready.launcher_pid), false);
  assert.equal(processIsAlive(active.ready.pid), false);
  assert.equal(await portIsClosed('127.0.0.1', active.ready.port), true);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'process.json')), false);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'process.lock.json')), false);

  const repeated = await stopFounderLocalRuntime({ runtimeDir });
  assert.deepEqual(repeated, {
    ok: true,
    status: 'already_stopped',
    records_absent: true,
    records_cleaned: true,
    process_state: 'unknown_without_records',
  });

  active = await launchFixture(runtimeDir);
  const restarted = await stopFounderLocalRuntime({ runtimeDir });
  assert.equal(restarted.status, 'stopped');
  assert.equal(restarted.run_id, active.ready.run_id);
  assert.deepEqual(restarted.candidate, candidate);
  await waitForExit(active.child);
  assert.equal(await portIsClosed('127.0.0.1', active.ready.port), true);
  active = null;
});

test('dead stale pair and lone lock are cleaned, while status remains truthful', async (t) => {
  const runtimeDir = makeRuntimeDir();
  t.after(() => removeRuntimeDir(runtimeDir));
  const processFile = path.join(runtimeDir, 'process.json');
  const lockFile = path.join(runtimeDir, 'process.lock.json');
  const first = fixtureRecords();
  writeJson(lockFile, first.lock);
  writeJson(processFile, first.record);
  const pairResult = await stopFounderLocalRuntime({
    runtimeDir,
    isProcessAlive: () => false,
    isPortClosed: async () => true,
  });
  assert.equal(pairResult.status, 'stale_records_cleaned');
  assert.equal(pairResult.processes_dead, true);
  assert.equal(pairResult.port_closed, true);

  const second = fixtureRecords();
  writeJson(lockFile, second.lock);
  const lockResult = await stopFounderLocalRuntime({
    runtimeDir,
    isProcessAlive: () => false,
    isPortClosed: async () => true,
  });
  assert.equal(lockResult.status, 'stale_record_cleaned');
  assert.equal(lockResult.recorded_launcher_dead, true);
  assert.equal(lockResult.recorded_port_closed, true);
  assert.equal(lockResult.child_process_state, 'unknown_without_process_record');
  assert.equal(Object.hasOwn(lockResult, 'processes_dead'), false);
});

test('incomplete ownership and PID reuse fail closed without signal or deletion', async (t) => {
  const runtimeDir = makeRuntimeDir();
  t.after(() => removeRuntimeDir(runtimeDir));
  const processFile = path.join(runtimeDir, 'process.json');
  const { record } = fixtureRecords();
  writeJson(processFile, record);
  let signals = 0;
  await assert.rejects(stopFounderLocalRuntime({
    runtimeDir,
    isProcessAlive: () => true,
    isPortClosed: async () => true,
    signalProcess: () => { signals += 1; },
  }), { code: 'FOUNDER_LOCAL_STOP_OWNERSHIP_INSUFFICIENT' });
  assert.equal(signals, 0);
  assert.equal(fs.existsSync(processFile), true);

  const expected = {
    pid: record.pid,
    parent_pid: record.launcher_pid,
    start_marker: 'original-instance',
    command_line: 'node src/server.js',
    alive: true,
  };
  assert.throws(() => signalExactProcess({
    expected,
    signal: 'SIGTERM',
    inspectProcess: () => ({ ...expected, start_marker: 'reused-pid' }),
    isProcessAlive: () => true,
    signalProcess: () => { signals += 1; },
  }), { code: 'FOUNDER_LOCAL_STOP_PROCESS_CHANGED' });
  assert.equal(signals, 0);
});

test('symlink or junction runtime paths are rejected before record reads', async (t) => {
  const runtimeDir = makeRuntimeDir();
  const targetDir = makeRuntimeDir();
  const linkDir = path.join(runtimeDir, 'linked-runtime');
  t.after(() => {
    try { fs.unlinkSync(linkDir); } catch { /* absent */ }
    removeRuntimeDir(runtimeDir);
    removeRuntimeDir(targetDir);
  });
  try {
    fs.symlinkSync(targetDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`platform does not permit test symlink/junction: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(stopFounderLocalRuntime({ runtimeDir: linkDir }), {
    code: 'FOUNDER_LOCAL_STOP_DIRECTORY_INVALID',
  });
});

test('hard-linked runtime records are rejected without deleting their target', async (t) => {
  const runtimeDir = makeRuntimeDir();
  const targetDir = makeRuntimeDir();
  t.after(() => {
    removeRuntimeDir(runtimeDir);
    removeRuntimeDir(targetDir);
  });
  const { lock } = fixtureRecords();
  const targetFile = path.join(targetDir, 'outside-runtime-lock.json');
  const linkedRecord = path.join(runtimeDir, 'process.lock.json');
  writeJson(targetFile, lock);
  fs.linkSync(targetFile, linkedRecord);
  await assert.rejects(stopFounderLocalRuntime({ runtimeDir }), {
    code: 'FOUNDER_LOCAL_STOP_RECORD_INVALID',
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(targetFile, 'utf8')), lock);
  assert.equal(fs.existsSync(linkedRecord), true);
});
