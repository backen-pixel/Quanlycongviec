const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FRONTEND_IDENTITY_FIELDS = Object.freeze([
  'sha256',
  'manifest_sha256',
  'contract_version',
  'runtime_profile',
  'read_only',
  'entry_path',
  'api_base_url',
  'api_origin_policy',
  'credential_request_policy',
]);

function bindingError() {
  const error = new Error('FOUNDER_LOCAL_RUNTIME_PROCESS_BINDING_INVALID');
  error.code = 'FOUNDER_LOCAL_RUNTIME_PROCESS_BINDING_INVALID';
  return error;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function sameCandidate(actual, expected) {
  return SHA1.test(String(actual?.commit || ''))
    && SHA1.test(String(actual?.tree || ''))
    && actual.commit === expected?.commit
    && actual.tree === expected?.tree;
}

function sameFrontendDist(actual, expected) {
  return SHA256.test(String(actual?.sha256 || ''))
    && SHA256.test(String(actual?.manifest_sha256 || ''))
    && FRONTEND_IDENTITY_FIELDS.every((field) => actual?.[field] === expected?.[field]);
}

function validFounderLocalPort(value) {
  return Number.isSafeInteger(value) && value >= 1024 && value <= 65535;
}

function founderLocalRecordCoreValid(value, { state, childPidRequired }) {
  return value?.schema_version === '1.0.0'
    && value.state === state
    && UUID_V4.test(String(value.run_id || ''))
    && value.profile === 'founder-local-read-only'
    && value.host === '127.0.0.1'
    && validFounderLocalPort(value.port)
    && positiveInteger(value.launcher_pid)
    && (!childPidRequired || positiveInteger(value.pid))
    && Number.isFinite(Date.parse(String(value.started_at || '')))
    && sameCandidate(value.candidate, value.candidate)
    && sameCandidate(value.checkout, value.checkout)
    && value.acceptance_only_checkout === (value.candidate.commit !== value.checkout.commit)
    && sameFrontendDist(value.frontend_dist, value.frontend_dist);
}

function assertFounderLocalStandaloneRecord(value, kind) {
  if (kind !== 'lock' && kind !== 'record') throw bindingError();
  const options = kind === 'lock'
    ? { state: 'starting', childPidRequired: false }
    : { state: 'running', childPidRequired: true };
  if (!founderLocalRecordCoreValid(value, options)) throw bindingError();
  return value;
}

function assertFounderLocalRecordPair({
  lock,
  record,
  expectedHost = '127.0.0.1',
  expectedPort = record?.port,
}) {
  assertFounderLocalStandaloneRecord(lock, 'lock');
  assertFounderLocalStandaloneRecord(record, 'record');
  const matches = lock.run_id === record.run_id
    && lock.profile === record.profile
    && lock.host === expectedHost
    && record.host === lock.host
    && lock.port === expectedPort
    && record.port === lock.port
    && lock.launcher_pid === record.launcher_pid
    && lock.started_at === record.started_at
    && sameCandidate(lock.candidate, record.candidate)
    && sameCandidate(lock.checkout, record.checkout)
    && lock.acceptance_only_checkout === record.acceptance_only_checkout
    && sameFrontendDist(lock.frontend_dist, record.frontend_dist);
  if (!matches) throw bindingError();
  return {
    run_id: record.run_id,
    launcher_process_id: record.launcher_pid,
    process_id: record.pid,
    host: record.host,
    port: record.port,
  };
}

function founderLocalRecordIdentityMatches(actual, expected, kind) {
  try {
    assertFounderLocalStandaloneRecord(actual, kind);
    assertFounderLocalStandaloneRecord(expected, kind);
  } catch {
    return false;
  }
  return actual.schema_version === expected.schema_version
    && actual.state === expected.state
    && actual.run_id === expected.run_id
    && actual.profile === expected.profile
    && actual.host === expected.host
    && actual.port === expected.port
    && actual.launcher_pid === expected.launcher_pid
    && (kind === 'lock' || actual.pid === expected.pid)
    && actual.started_at === expected.started_at
    && sameCandidate(actual.candidate, expected.candidate)
    && sameCandidate(actual.checkout, expected.checkout)
    && actual.acceptance_only_checkout === expected.acceptance_only_checkout
    && sameFrontendDist(actual.frontend_dist, expected.frontend_dist);
}

function windowsProcessInfo(pid) {
  const script = [
    "$ErrorActionPreference='Stop'",
    `$p=Get-Process -Id ${pid}`,
    "if ($null -eq $p -or $null -eq $p.Parent) { exit 3 }",
    '[ordered]@{pid=[int]$p.Id;parent_pid=[int]$p.Parent.Id;start_marker=[string]$p.StartTime.ToUniversalTime().Ticks;command_line=[string]$p.CommandLine;executable_path=[string]$p.Path}|ConvertTo-Json -Compress',
  ].join(';');
  let lastError;
  for (const executable of ['pwsh', 'powershell.exe']) {
    try {
      const raw = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }).trim();
      return JSON.parse(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || bindingError();
}

function linuxProcessInfo(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const closeParen = stat.lastIndexOf(')');
  if (closeParen < 0) throw bindingError();
  const fields = stat.slice(closeParen + 2).trim().split(/\s+/);
  const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
  return {
    pid,
    parent_pid: Number(fields[1]),
    start_marker: String(fields[19] || ''),
    command_line: commandLine,
  };
}

function posixProcessInfo(pid) {
  const raw = execFileSync('ps', ['-p', String(pid), '-o', 'ppid=', '-o', 'lstart=', '-o', 'command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const match = raw.match(/^(\d+)\s+(.{24})\s+([\s\S]+)$/);
  if (!match) throw bindingError();
  return {
    pid,
    parent_pid: Number(match[1]),
    start_marker: match[2].trim(),
    command_line: match[3],
  };
}

function inspectLiveProcess(pid) {
  if (!positiveInteger(pid)) throw bindingError();
  try {
    process.kill(pid, 0);
  } catch {
    throw bindingError();
  }
  let info;
  try {
    if (process.platform === 'win32') info = windowsProcessInfo(pid);
    else if (process.platform === 'linux') info = linuxProcessInfo(pid);
    else info = posixProcessInfo(pid);
  } catch {
    throw bindingError();
  }
  if (
    !positiveInteger(info?.pid)
    || info.pid !== pid
    || !positiveInteger(info?.parent_pid)
    || !String(info?.start_marker || '').trim()
  ) {
    throw bindingError();
  }
  return { ...info, alive: true };
}

function normalizedCommand(value) {
  return String(value || '').replace(/\\/g, '/').trim().replace(/\s+/g, ' ').toLowerCase();
}

function processInstanceMatches(actual, expected) {
  if (
    actual?.alive !== true
    || expected?.alive !== true
    || actual.pid !== expected.pid
    || actual.parent_pid !== expected.parent_pid
    || String(actual.start_marker || '') !== String(expected.start_marker || '')
  ) return false;
  const actualCommand = normalizedCommand(actual.command_line);
  const expectedCommand = normalizedCommand(expected.command_line);
  const actualExecutable = normalizedCommand(actual.executable_path);
  const expectedExecutable = normalizedCommand(expected.executable_path);
  return Boolean(
    (actualCommand && expectedCommand && actualCommand === expectedCommand)
    || (actualExecutable && expectedExecutable && actualExecutable === expectedExecutable)
  );
}

function inspectFounderLocalOwnedProcesses(record, inspectProcess = inspectLiveProcess) {
  const child = inspectProcess(record.pid);
  const launcher = inspectProcess(record.launcher_pid);
  const childCommand = normalizedCommand(child?.command_line);
  const launcherCommand = normalizedCommand(launcher?.command_line);
  const expectedExecutable = normalizedCommand(process.execPath);
  const childExecutable = normalizedCommand(child?.executable_path);
  const launcherExecutable = normalizedCommand(launcher?.executable_path);
  const childIdentityMatches = childCommand
    ? childCommand.includes('src/server.js')
    : childExecutable === expectedExecutable;
  const launcherIdentityMatches = launcherCommand
    ? launcherCommand.includes('start-founder-local-read-only.js')
    : launcherExecutable === expectedExecutable;
  if (
    child?.alive !== true
    || launcher?.alive !== true
    || child.parent_pid !== record.launcher_pid
    || !childIdentityMatches
    || !launcherIdentityMatches
  ) {
    throw bindingError();
  }
  return { child, launcher };
}

function assertFounderLocalProcessBinding({
  lock,
  record,
  runtime,
  candidate,
  checkout = candidate,
  frontendDist,
  expectedHost = '127.0.0.1',
  expectedPort = 4010,
  inspectProcess = inspectLiveProcess,
}) {
  assertFounderLocalRecordPair({ lock, record, expectedHost, expectedPort });
  const structural = sameCandidate(lock.candidate, candidate)
    && sameCandidate(record.candidate, candidate)
    && sameCandidate(lock.checkout, checkout)
    && sameCandidate(record.checkout, checkout)
    && lock.acceptance_only_checkout === (candidate.commit !== checkout.commit)
    && record.acceptance_only_checkout === lock.acceptance_only_checkout
    && sameFrontendDist(lock.frontend_dist, frontendDist)
    && sameFrontendDist(record.frontend_dist, frontendDist)
    && runtime?.profile === 'founder-local-read-only'
    && runtime.bind_host === expectedHost
    && runtime.bind_port === expectedPort
    && runtime.instance_id === record.run_id
    && runtime.process_id === record.pid
    && runtime.launcher_process_id === record.launcher_pid
    && runtime.launcher_owned === true
    && sameCandidate(runtime.candidate, candidate)
    && sameCandidate(runtime.checkout, checkout)
    && sameFrontendDist(runtime.frontend_dist, frontendDist);
  if (!structural) throw bindingError();

  inspectFounderLocalOwnedProcesses(record, inspectProcess);

  return {
    run_id: record.run_id,
    process_id: record.pid,
    launcher_process_id: record.launcher_pid,
    host: record.host,
    port: record.port,
    process_record_attested: true,
    launcher_process_alive: true,
    launcher_owns_runtime: true,
  };
}

module.exports = {
  assertFounderLocalProcessBinding,
  assertFounderLocalRecordPair,
  assertFounderLocalStandaloneRecord,
  founderLocalRecordIdentityMatches,
  inspectFounderLocalOwnedProcesses,
  inspectLiveProcess,
  processInstanceMatches,
};
