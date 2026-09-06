const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  founderLocalRecordIdentityMatches,
} = require('../../../src/config/founderLocalProcessBinding');

const runtimeDir = path.resolve(process.argv[2]);
const runId = process.argv[3];
const encodedIdentity = process.argv[4];
const identity = JSON.parse(Buffer.from(encodedIdentity, 'base64url').toString('utf8'));
const processFile = path.join(runtimeDir, 'process.json');
const processLockFile = path.join(runtimeDir, 'process.lock.json');
const startedAt = new Date().toISOString();
let lock;
let record;
let ready = false;

fs.mkdirSync(runtimeDir, { recursive: true });
const child = spawn(process.execPath, [
  path.join(__dirname, 'src', 'server.js'),
  encodedIdentity,
  runId,
], {
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  windowsHide: true,
});

function removeExact(file, expected, kind) {
  if (!expected) return;
  try {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (founderLocalRecordIdentityMatches(current, expected, kind)) fs.unlinkSync(file);
  } catch { /* already removed or not this fixture run */ }
}

function stopChild(signal = 'SIGTERM') {
  try { child.kill(signal); } catch { /* already stopped */ }
}

process.once('SIGINT', () => stopChild('SIGINT'));
process.once('SIGTERM', () => stopChild('SIGTERM'));
child.once('message', (message) => {
  if (ready || message?.type !== 'fixture-ready' || !Number.isInteger(message.port)) return;
  lock = {
    schema_version: '1.0.0',
    run_id: runId,
    state: 'starting',
    profile: 'founder-local-read-only',
    host: '127.0.0.1',
    port: message.port,
    launcher_pid: process.pid,
    started_at: startedAt,
    candidate: identity.candidate,
    checkout: identity.checkout,
    acceptance_only_checkout: identity.candidate.commit !== identity.checkout.commit,
    frontend_dist: identity.frontend_dist,
  };
  record = { ...lock, state: 'running', pid: child.pid };
  try {
    fs.writeFileSync(processLockFile, `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.writeFileSync(processFile, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
  } catch (error) {
    removeExact(processFile, record, 'record');
    removeExact(processLockFile, lock, 'lock');
    stopChild();
    process.stderr.write(`${error.code || error.message}\n`);
    return;
  }
  ready = true;
  process.stdout.write(`${JSON.stringify({
    run_id: runId,
    launcher_pid: process.pid,
    pid: child.pid,
    port: message.port,
  })}\n`);
});
child.once('exit', (code) => {
  removeExact(processFile, record, 'record');
  removeExact(processLockFile, lock, 'lock');
  process.exit(code == null ? 1 : code);
});
child.once('error', () => {
  removeExact(processFile, record, 'record');
  removeExact(processLockFile, lock, 'lock');
  process.exit(1);
});
