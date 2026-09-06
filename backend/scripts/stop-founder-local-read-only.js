#!/usr/bin/env node
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  assertFounderLocalProcessBinding,
  assertFounderLocalRecordPair,
  assertFounderLocalStandaloneRecord,
  founderLocalRecordIdentityMatches,
  inspectFounderLocalOwnedProcesses,
  inspectLiveProcess,
  processInstanceMatches,
} = require('../src/config/founderLocalProcessBinding');

const backendDir = path.resolve(__dirname, '..');
const repositoryDir = path.resolve(backendDir, '..');
const repositoryRealDir = fs.realpathSync.native(repositoryDir);
const defaultRuntimeDir = path.join(backendDir, '.runtime', 'founder-local-v1');

function stopError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pathIsWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertWorkspaceRuntimeDirectory(runtimeDir) {
  const resolved = path.resolve(runtimeDir);
  if (resolved === repositoryDir || !pathIsWithin(repositoryDir, resolved)) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_DIRECTORY_INVALID',
      'Thư mục trạng thái dừng phải nằm bên trong worktree đã xác minh.',
    );
  }
  const parts = path.relative(repositoryDir, resolved).split(path.sep).filter(Boolean);
  let cursor = repositoryDir;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw stopError(
        'FOUNDER_LOCAL_STOP_DIRECTORY_INVALID',
        'Đường dẫn trạng thái Founder-local không được đi qua symlink hoặc junction.',
      );
    }
    const real = fs.realpathSync.native(cursor);
    if (!pathIsWithin(repositoryRealDir, real)) {
      throw stopError(
        'FOUNDER_LOCAL_STOP_DIRECTORY_INVALID',
        'Đường dẫn trạng thái Founder-local thoát khỏi worktree đã xác minh.',
      );
    }
  }
  try {
    if (!fs.lstatSync(resolved).isDirectory()) {
      throw stopError('FOUNDER_LOCAL_STOP_DIRECTORY_INVALID', 'Đường dẫn trạng thái không phải thư mục.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return resolved;
}

function sameFileInstance(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function assertWorkspaceRuntimeFilePath(file) {
  const runtimeDir = assertWorkspaceRuntimeDirectory(path.dirname(file));
  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== runtimeDir) {
    throw stopError('FOUNDER_LOCAL_STOP_RECORD_INVALID', 'Tệp runtime nằm ngoài thư mục đã xác minh.');
  }
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error?.code === 'ENOENT') return resolved;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_RECORD_INVALID',
      'Tệp runtime phải là regular file cục bộ, đơn liên kết.',
    );
  }
  const real = fs.realpathSync.native(resolved);
  const runtimeReal = fs.realpathSync.native(runtimeDir);
  if (!pathIsWithin(repositoryRealDir, real) || path.dirname(real) !== runtimeReal) {
    throw stopError('FOUNDER_LOCAL_STOP_RECORD_INVALID', 'Tệp runtime thoát khỏi worktree đã xác minh.');
  }
  return resolved;
}

function assertOpenWorkspaceRuntimeFile(file, fd) {
  const resolved = assertWorkspaceRuntimeFilePath(file);
  const pathStat = fs.lstatSync(resolved);
  const openStat = fs.fstatSync(fd);
  if (!openStat.isFile() || openStat.nlink !== 1 || !sameFileInstance(pathStat, openStat)) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_RECORD_CHANGED',
      'Tệp runtime thay đổi giữa lúc mở và xác minh.',
    );
  }
  return resolved;
}

function readSafeRecordText(file) {
  const runtimeDir = assertWorkspaceRuntimeDirectory(path.dirname(file));
  const resolved = assertWorkspaceRuntimeFilePath(file);
  let before;
  try {
    before = fs.lstatSync(resolved);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 1024 * 1024) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_RECORD_INVALID',
      'Tệp trạng thái phải là regular file cục bộ, đơn liên kết và có kích thước giới hạn.',
    );
  }
  const beforeReal = fs.realpathSync.native(resolved);
  const runtimeReal = fs.realpathSync.native(runtimeDir);
  if (!pathIsWithin(repositoryRealDir, beforeReal) || path.dirname(beforeReal) !== runtimeReal) {
    throw stopError('FOUNDER_LOCAL_STOP_RECORD_INVALID', 'Tệp trạng thái thoát khỏi runtime đã xác minh.');
  }

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(fd);
    const after = fs.lstatSync(resolved);
    const afterReal = fs.realpathSync.native(resolved);
    if (
      !opened.isFile()
      || opened.nlink !== 1
      || after.isSymbolicLink()
      || afterReal !== beforeReal
      || !sameFileInstance(before, opened)
      || !sameFileInstance(opened, after)
    ) {
      throw stopError(
        'FOUNDER_LOCAL_STOP_RECORD_CHANGED',
        'Tệp trạng thái thay đổi trong lúc xác minh; không đọc hoặc xóa.',
      );
    }
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function portIsClosed(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host, port });
    const finish = (closed) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(closed);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(false));
    socket.once('error', (error) => {
      finish(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error?.code));
    });
  });
}

function readOptionalJson(file) {
  const raw = readSafeRecordText(file);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw stopError(
      'FOUNDER_LOCAL_STOP_RECORD_INVALID',
      `Tệp trạng thái ${path.basename(file)} không hợp lệ; không dừng hay xóa tiến trình.`,
    );
  }
}

function exactRecordOrThrow(actual, expected, kind) {
  if (!expected || !founderLocalRecordIdentityMatches(actual, expected, kind)) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_RECORD_CHANGED',
      'Danh tính run đã thay đổi trong lúc dừng; không xóa tệp trạng thái.',
    );
  }
}

function unlinkExactRecord(file, expected, kind) {
  const current = readOptionalJson(file);
  if (!current) return false;
  exactRecordOrThrow(current, expected, kind);
  const quarantine = `${file}.stopping-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.renameSync(file, quarantine);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  try {
    const moved = readOptionalJson(quarantine);
    exactRecordOrThrow(moved, expected, kind);
    fs.unlinkSync(quarantine);
  } catch (error) {
    // Leave uncertain state quarantined inside the verified runtime directory.
    // Never overwrite a path that another run may have created concurrently.
    throw error;
  }
  return true;
}

function cleanExactRuntimeRecords({ processFile, processLockFile, record, lock }) {
  const currentRecord = readOptionalJson(processFile);
  const currentLock = readOptionalJson(processLockFile);
  if (currentRecord) exactRecordOrThrow(currentRecord, record, 'record');
  if (currentLock) exactRecordOrThrow(currentLock, lock, 'lock');
  // The lock is the start exclusion primitive. Remove the process record first,
  // then the exact lock last so a new run cannot be mistaken for this run.
  unlinkExactRecord(processFile, record, 'record');
  unlinkExactRecord(processLockFile, lock, 'lock');
}

async function waitForOwnedRuntimeStop({
  childPid,
  launcherPid,
  host,
  port,
  timeoutMs,
  isProcessAlive = processIsAlive,
  isPortClosed = portIsClosed,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      !isProcessAlive(childPid)
      && !isProcessAlive(launcherPid)
      && await isPortClosed(host, port)
    ) return true;
    await delay(100);
  }
  return !isProcessAlive(childPid)
    && !isProcessAlive(launcherPid)
    && await isPortClosed(host, port);
}

function signalExactProcess({
  expected,
  signal,
  inspectProcess,
  isProcessAlive,
  signalProcess,
}) {
  let current;
  try {
    current = inspectProcess(expected.pid);
  } catch (error) {
    if (!isProcessAlive(expected.pid)) return false;
    throw error;
  }
  if (!processInstanceMatches(current, expected)) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_PROCESS_CHANGED',
      'PID Founder-local đã được tái sử dụng hoặc thay đổi; không gửi tín hiệu.',
    );
  }
  signalProcess(expected.pid, signal);
  return true;
}

async function fetchRuntimeHealth(record, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`http://${record.host}:${record.port}/api/health`, {
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    });
  } catch {
    throw stopError(
      'FOUNDER_LOCAL_STOP_HEALTH_UNAVAILABLE',
      'Không xác minh được listener Founder-local; không dừng tiến trình.',
    );
  }
  let health;
  try {
    health = await response.json();
  } catch {
    throw stopError(
      'FOUNDER_LOCAL_STOP_HEALTH_INVALID',
      'Listener không trả về health Founder-local hợp lệ; không dừng tiến trình.',
    );
  }
  if (!response.ok) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_HEALTH_INVALID',
      'Listener không tự nhận dạng là Founder-local; không dừng tiến trình.',
    );
  }
  return health;
}

async function stopFounderLocalRuntime(options = {}) {
  const runtimeDir = assertWorkspaceRuntimeDirectory(options.runtimeDir || defaultRuntimeDir);
  const processFile = path.join(runtimeDir, 'process.json');
  const processLockFile = path.join(runtimeDir, 'process.lock.json');
  const fetchImpl = options.fetchImpl || global.fetch;
  const inspectProcess = options.inspectProcess || inspectLiveProcess;
  const isProcessAlive = options.isProcessAlive || processIsAlive;
  const isPortClosed = options.isPortClosed || portIsClosed;
  const signalProcess = options.signalProcess || ((pid, signal) => process.kill(pid, signal));
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const lock = readOptionalJson(processLockFile);
  const record = readOptionalJson(processFile);

  if (!lock && !record) {
    return {
      ok: true,
      status: 'already_stopped',
      records_absent: true,
      records_cleaned: true,
      process_state: 'unknown_without_records',
    };
  }

  if (!lock || !record) {
    const remaining = lock || record;
    const kind = lock ? 'lock' : 'record';
    assertFounderLocalStandaloneRecord(remaining, kind);
    const pids = [remaining.launcher_pid];
    if (kind === 'record') pids.push(remaining.pid);
    if (pids.some((pid) => isProcessAlive(pid)) || !await isPortClosed(remaining.host, remaining.port)) {
      throw stopError(
        'FOUNDER_LOCAL_STOP_OWNERSHIP_INSUFFICIENT',
        'Thiếu một tệp ràng buộc trong khi tiến trình hoặc cổng còn hoạt động; không dừng hay xóa.',
      );
    }
    cleanExactRuntimeRecords({ processFile, processLockFile, record, lock });
    return {
      ok: true,
      status: 'stale_record_cleaned',
      run_id: remaining.run_id,
      candidate: remaining.candidate,
      checkout: remaining.checkout,
      launcher_process_id: remaining.launcher_pid,
      process_id: kind === 'record' ? remaining.pid : null,
      host: remaining.host,
      port: remaining.port,
      records_cleaned: true,
      recorded_launcher_dead: true,
      recorded_process_dead: kind === 'record' ? true : undefined,
      child_process_state: kind === 'lock' ? 'unknown_without_process_record' : undefined,
      recorded_port_closed: true,
    };
  }

  assertFounderLocalRecordPair({
    lock,
    record,
    expectedHost: '127.0.0.1',
    expectedPort: record.port,
  });

  const childAlive = isProcessAlive(record.pid);
  const launcherAlive = isProcessAlive(record.launcher_pid);
  if (!childAlive && !launcherAlive) {
    if (!await isPortClosed(record.host, record.port)) {
      throw stopError(
        'FOUNDER_LOCAL_STOP_PORT_STILL_OPEN',
        'PID đã dừng nhưng cổng Founder-local vẫn đang mở; không xóa ràng buộc run.',
      );
    }
    cleanExactRuntimeRecords({ processFile, processLockFile, record, lock });
    return {
      ok: true,
      status: 'stale_records_cleaned',
      run_id: record.run_id,
      candidate: record.candidate,
      checkout: record.checkout,
      launcher_process_id: record.launcher_pid,
      process_id: record.pid,
      host: record.host,
      port: record.port,
      records_cleaned: true,
      processes_dead: true,
      port_closed: true,
    };
  }
  if (!childAlive || !launcherAlive) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_OWNERSHIP_INSUFFICIENT',
      'Cặp launcher/listener không còn đầy đủ; không gửi tín hiệu hay xóa ràng buộc.',
    );
  }

  const health = await fetchRuntimeHealth(record, fetchImpl);
  assertFounderLocalProcessBinding({
    lock,
    record,
    runtime: health?.runtime,
    candidate: record.candidate,
    checkout: record.checkout,
    frontendDist: record.frontend_dist,
    expectedHost: '127.0.0.1',
    expectedPort: record.port,
    inspectProcess,
  });
  const owned = inspectFounderLocalOwnedProcesses(record, inspectProcess);

  // On Windows, process.kill(SIGTERM) terminates a process immediately. Signal
  // the fully attested child first so its launcher receives the exit event and
  // performs its own orderly record cleanup before exiting.
  signalExactProcess({
    expected: owned.child,
    signal: 'SIGTERM',
    inspectProcess,
    isProcessAlive,
    signalProcess,
  });

  let stopped = await waitForOwnedRuntimeStop({
    childPid: record.pid,
    launcherPid: record.launcher_pid,
    host: record.host,
    port: record.port,
    timeoutMs: options.launcherGraceMs || 4000,
    isProcessAlive,
    isPortClosed,
    delay,
  });
  if (!stopped && isProcessAlive(record.launcher_pid)) {
    signalExactProcess({
      expected: owned.launcher,
      signal: 'SIGTERM',
      inspectProcess,
      isProcessAlive,
      signalProcess,
    });
    stopped = await waitForOwnedRuntimeStop({
      childPid: record.pid,
      launcherPid: record.launcher_pid,
      host: record.host,
      port: record.port,
      timeoutMs: options.finalTimeoutMs || 6000,
      isProcessAlive,
      isPortClosed,
      delay,
    });
  }
  if (!stopped) {
    throw stopError(
      'FOUNDER_LOCAL_STOP_INCOMPLETE',
      'Founder-local không dừng sạch hoặc cổng vẫn mở trong thời gian cho phép.',
    );
  }

  cleanExactRuntimeRecords({ processFile, processLockFile, record, lock });
  return {
    ok: true,
    status: 'stopped',
    run_id: record.run_id,
    candidate: record.candidate,
    checkout: record.checkout,
    launcher_process_id: record.launcher_pid,
    process_id: record.pid,
    host: record.host,
    port: record.port,
    process_identity_attested: true,
    records_cleaned: true,
    processes_dead: true,
    port_closed: true,
  };
}

async function main() {
  const result = await stopFounderLocalRuntime();
  if (result.status === 'already_stopped') {
    console.log('Founder-local đã dừng; không còn tệp run để xử lý.');
    return;
  }
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Không dừng Founder-local: ${error.code || error.message}`);
    process.exit(1);
  });
}

module.exports = {
  assertOpenWorkspaceRuntimeFile,
  assertWorkspaceRuntimeDirectory,
  assertWorkspaceRuntimeFilePath,
  cleanExactRuntimeRecords,
  portIsClosed,
  processIsAlive,
  signalExactProcess,
  stopFounderLocalRuntime,
  removeExactRuntimeRecord: unlinkExactRecord,
  waitForOwnedRuntimeStop,
};
