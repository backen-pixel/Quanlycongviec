'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const child = require('node:child_process');
const { checkFile } = require('./isolation-preload.cjs');
const root = path.resolve(__dirname, '../..');
const scratch = process.env.JOURNEY_OFFLINE_RUN_ROOT;

test('offline environment is scrubbed and no credential loader is usable', () => {
  assert.equal(process.env.JOURNEY_OFFLINE_ISOLATED, '1');
  for (const name of ['FOUNDER_LOCAL_ENV_FILE', 'JWT_SECRET', 'SUPABASE_URL', 'DATABASE_URL', 'NODE_OPTIONS']) assert.equal(process.env[name], undefined);
  // Pure path guard: never attempts to open an env file.
  assert.throws(() => checkFile(path.join(root, '.env')), /DENIED/);
  assert.throws(() => checkFile(path.join(root, 'backend/.env')), /DENIED/);
  assert.throws(() => process.loadEnvFile(), /DENIED/);
});

test('write policy admits only explicit scratch and denies protected ancestors', async () => {
  for (const target of [root, path.dirname(root), path.join(root, 'frontend'), path.join(root, 'frontend/dist'), path.join(root, '.git'), path.join(root, 'backend/src/new.js'), path.join(root, 'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/result.json')]) {
    assert.throws(() => checkFile(target, true), /DENIED/);
  }
  const target = path.join(scratch, 'guard-fixture.txt');
  fs.writeFileSync(target, 'SYNTHETIC GUARD FIXTURE');
  assert.equal(fs.readFileSync(target, 'utf8'), 'SYNTHETIC GUARD FIXTURE');
  await assert.rejects(fs.promises.open(path.join(root, 'not-authorized.txt'), fs.constants.O_WRONLY | fs.constants.O_CREAT), /DENIED/);
  fs.unlinkSync(target);
});

test('filesystem link creation and arbitrary subprocesses are rejected before execution', () => {
  assert.throws(() => fs.symlinkSync(root, path.join(scratch, 'denied-link'), 'junction'), /DENIED/);
  assert.throws(() => fs.linkSync(__filename, path.join(scratch, 'denied-hardlink')), /DENIED/);
  assert.throws(() => child.execSync('echo SHOULD_NOT_EXECUTE'), /DENIED/);
  assert.throws(() => child.spawn('npm', ['publish']), /DENIED/);
  assert.throws(() => child.spawn(process.execPath, ['-e', 'throw new Error("NOT EXECUTED")']), /DENIED/);
});

test('external sockets, public listeners and external fetch are rejected before I/O', async () => {
  const socket = new net.Socket();
  try { assert.throws(() => socket.connect({ host: 'untrusted.invalid', port: 443 }), /DENIED/); }
  finally { socket.destroy(); }
  const server = net.createServer();
  try { assert.throws(() => server.listen(0, '0.0.0.0'), /REQUIRED|DENIED/); }
  finally { server.close(); }
  await assert.rejects(async () => fetch('https://untrusted.invalid/'), /DENIED/);
});

test('offline application imports no live route, transport, loader or storage fallback', () => {
  const helper = fs.readFileSync(path.join(root, 'backend/src/helpers/customerJourneyReadModel.js'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'frontend/offline/customer-journey/entry.jsx'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'frontend/src/business-os/customer-journey/CustomerJourneyExplorer.jsx'), 'utf8');
  // Map.delete removes a local dedup/snapshot key; it is not a database delete.
  assert.equal(/\brequire\s*\(|\bimport\s+|\.(?:insert|update|upsert|rpc)\s*\(/.test(helper), false);
  assert.doesNotMatch(entry + ui, /\bfetch\s*\(|\baxios\b|localStorage\.|sessionStorage\.|\/api\//);
  assert.match(entry, /createFixtureAdapter\(\)/);
});
