#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFounderLocalProcessBinding,
} = require('../src/config/founderLocalProcessBinding');

const backendDir = path.resolve(__dirname, '..');
const processFile = path.join(backendDir, '.runtime', 'founder-local-v1', 'process.json');
const processLockFile = path.join(backendDir, '.runtime', 'founder-local-v1', 'process.lock.json');

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function waitForOwnedRuntimeStop(childPid, launcherPid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(childPid) && !processIsAlive(launcherPid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !processIsAlive(childPid) && !processIsAlive(launcherPid);
}

async function main() {
  if (!fs.existsSync(processFile) || !fs.existsSync(processLockFile)) {
    throw new Error('Không có Founder-local PID đang được ghi nhận.');
  }
  const record = JSON.parse(fs.readFileSync(processFile, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(processLockFile, 'utf8'));
  if (
    record.schema_version !== '1.0.0'
    || record.state !== 'running'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(record.run_id || ''))
    || record.profile !== 'founder-local-read-only'
    || record.host !== '127.0.0.1'
    || !Number.isInteger(record.pid)
    || !Number.isInteger(record.port)
    || lock.schema_version !== '1.0.0'
    || lock.state !== 'starting'
    || lock.run_id !== record.run_id
    || lock.profile !== record.profile
    || lock.host !== record.host
    || lock.port !== record.port
    || !Number.isInteger(lock.launcher_pid)
    || record.launcher_pid !== lock.launcher_pid
  ) {
    throw new Error('Tệp PID không khớp profile Founder-local; không dừng tiến trình.');
  }

  const response = await fetch(`http://127.0.0.1:${record.port}/api/health`, {
    signal: AbortSignal.timeout(3000),
    redirect: 'error',
  });
  const health = await response.json();
  if (!response.ok) {
    throw new Error('Listener không tự nhận dạng là Founder-local; không dừng tiến trình.');
  }
  assertFounderLocalProcessBinding({
    lock,
    record,
    runtime: health?.runtime,
    candidate: record.candidate,
    checkout: record.checkout,
    frontendDist: record.frontend_dist,
    expectedHost: '127.0.0.1',
    expectedPort: record.port,
  });

  // Stop through the attested launcher so it owns child shutdown and removes
  // only the process records for this exact run.
  process.kill(record.launcher_pid, 'SIGTERM');
  const stopped = await waitForOwnedRuntimeStop(record.pid, record.launcher_pid);
  if (!stopped || fs.existsSync(processFile) || fs.existsSync(processLockFile)) {
    throw new Error('Founder-local không dừng sạch trong thời gian cho phép.');
  }
  console.log(`Đã dừng sạch Founder-local run ${record.run_id}.`);
}

main().catch((error) => {
  console.error(`Không dừng Founder-local: ${error.message}`);
  process.exit(1);
});
