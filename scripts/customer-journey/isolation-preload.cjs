'use strict';

// Defence in depth for reviewed offline code. This is not an OS sandbox and
// grants no authority to connect to live data or publish artifacts.
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const Module = require('node:module');
const net = require('node:net');
const dns = require('node:dns');
const dgram = require('node:dgram');
const childProcess = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const stagingParent = path.join(root, 'evidence/internal-live-operation-v1/runtime-safety/runtime/customer-journey-staging');
const candidateParent = path.join(root, 'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates');
const preloadPath = path.resolve(__filename);

function deny(code) {
  throw Object.assign(new Error(code), { code });
}
function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
function inside(parent, target) {
  const rel = path.relative(path.resolve(parent), path.resolve(target));
  return !rel || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
function descendant(parent, target) {
  return !samePath(parent, target) && inside(parent, target);
}
function filePath(value) {
  if (typeof value === 'number' || (value && Number.isInteger(value.fd))) return null;
  if (value instanceof URL) return path.resolve(fileURLToPath(value));
  return path.resolve(Buffer.isBuffer(value) ? value.toString() : String(value));
}
function envPath(name) {
  const value = String(process.env[name] || '').trim();
  if (!value || !path.isAbsolute(value)) deny(`JOURNEY_${name}_INVALID`);
  return path.resolve(value);
}

if (process.env.JOURNEY_OFFLINE_ISOLATED !== '1') deny('JOURNEY_USE_SANITIZED_POWERSHELL_ENTRY');
if (process.env.NODE_OPTIONS) deny('JOURNEY_INHERITED_NODE_OPTIONS_DENIED');
if (!samePath(process.cwd(), root)) deny('JOURNEY_WORKING_DIRECTORY_MISMATCH');
if (!samePath(process.execPath, envPath('JOURNEY_NODE_EXECUTABLE'))) deny('JOURNEY_NODE_EXECUTABLE_MISMATCH');

const runRoot = envPath('JOURNEY_OFFLINE_RUN_ROOT');
if (!descendant(stagingParent, runRoot) || !/^run-[0-9a-f]{32}$/i.test(path.basename(runRoot))) deny('JOURNEY_RUN_ROOT_INVALID');
const evidenceRootText = String(process.env.JOURNEY_OFFLINE_EVIDENCE_ROOT || '').trim();
const evidenceRoot = evidenceRootText ? path.resolve(evidenceRootText) : null;
const candidateCommit = String(process.env.JOURNEY_CANDIDATE_COMMIT || '');
if (evidenceRoot && (
  !descendant(candidateParent, evidenceRoot)
  || !/^customer-journey-[0-9a-f]{12}$/i.test(path.basename(evidenceRoot))
  || !/^[0-9a-f]{40}$/i.test(candidateCommit)
  || path.basename(evidenceRoot).slice(-12).toLowerCase() !== candidateCommit.slice(0, 12).toLowerCase()
)) deny('JOURNEY_EVIDENCE_ROOT_INVALID');

const rawExists = fs.existsSync.bind(fs);
const rawLstat = fs.lstatSync.bind(fs);
const rawRealpath = (fs.realpathSync.native || fs.realpathSync).bind(fs.realpathSync);
function assertExistingRoot(directory, code) {
  if (!rawExists(directory)) deny(code);
  const stat = rawLstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(rawRealpath(directory), directory)) deny(code);
}
assertExistingRoot(root, 'JOURNEY_REPOSITORY_LINK_DENIED');
assertExistingRoot(runRoot, 'JOURNEY_RUN_ROOT_LINK_DENIED');
if (evidenceRoot) assertExistingRoot(evidenceRoot, 'JOURNEY_EVIDENCE_ROOT_LINK_DENIED');
const writableRoots = [runRoot, ...(evidenceRoot ? [evidenceRoot] : [])];

function envLike(target) {
  const base = path.basename(target);
  return /^\.env(?:\..*)?$/i.test(base) || /\.env(?:\..*)?$/i.test(base) || /^backend\.env$/i.test(base);
}
function checkRead(value) {
  const target = filePath(value);
  if (target && envLike(target)) deny('JOURNEY_ENV_FILE_ACCESS_DENIED');
  return target;
}
function safeChain(allowedRoot, target) {
  assertExistingRoot(allowedRoot, 'JOURNEY_WRITE_ROOT_LINK_DENIED');
  const rel = path.relative(allowedRoot, target);
  let current = allowedRoot;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!rawExists(current)) break;
    const stat = rawLstat(current);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) deny('JOURNEY_WRITE_LINK_DENIED');
    if (!inside(allowedRoot, rawRealpath(current))) deny('JOURNEY_WRITE_REALPATH_ESCAPE_DENIED');
  }
}
function checkWrite(value, operation = 'write') {
  const target = checkRead(value);
  if (!target) deny('JOURNEY_UNTRACKED_FILE_DESCRIPTOR_WRITE_DENIED');
  const allowedRoot = writableRoots.find((candidate) => inside(candidate, target));
  if (!allowedRoot) deny('JOURNEY_WRITE_BOUNDARY_DENIED');
  if (samePath(allowedRoot, target) && operation !== 'mkdir') deny('JOURNEY_WRITE_ROOT_MUTATION_DENIED');
  safeChain(allowedRoot, target);
  return target;
}
function checkFile(value, write = false) {
  return write ? checkWrite(value) : checkRead(value);
}

for (const method of ['readFileSync', 'readFile', 'createReadStream']) {
  const original = fs[method];
  if (!original) continue;
  fs[method] = function guardedRead(target, ...args) {
    checkRead(target);
    return original.call(this, target, ...args);
  };
}
for (const method of [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream',
  'mkdirSync', 'mkdir', 'mkdtempSync', 'mkdtemp', 'rmSync', 'rm', 'unlinkSync',
  'unlink', 'rmdirSync', 'rmdir', 'truncateSync', 'truncate', 'chmodSync', 'chmod',
  'chownSync', 'chown', 'utimesSync', 'utimes',
]) {
  const original = fs[method];
  if (!original) continue;
  fs[method] = function guardedWrite(target, ...args) {
    checkWrite(target, method.startsWith('mkdir') ? 'mkdir' : method);
    return original.call(this, target, ...args);
  };
}
for (const method of ['renameSync', 'rename', 'copyFileSync', 'copyFile', 'cpSync', 'cp']) {
  const original = fs[method];
  if (!original) continue;
  fs[method] = function guardedPair(from, to, ...args) {
    if (method.startsWith('rename')) checkWrite(from, 'rename'); else checkRead(from);
    checkWrite(to, method);
    return original.call(this, from, to, ...args);
  };
}
for (const method of ['symlinkSync', 'symlink', 'linkSync', 'link']) {
  if (fs[method]) fs[method] = () => deny('JOURNEY_LINK_OPERATION_DENIED');
}
function writingFlags(flags) {
  if (typeof flags !== 'number') return /[wa+]/.test(String(flags));
  const mask = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_TRUNC;
  return (flags & mask) !== 0;
}
for (const method of ['openSync', 'open']) {
  const original = fs[method];
  fs[method] = function guardedOpen(target, flags, ...args) {
    (writingFlags(flags) ? checkWrite : checkRead)(target);
    return original.call(this, target, flags, ...args);
  };
}

for (const method of ['readFile', 'writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'unlink', 'rmdir', 'truncate', 'chmod', 'chown', 'utimes']) {
  const original = fs.promises[method];
  if (!original) continue;
  fs.promises[method] = async function guardedPromise(target, ...args) {
    if (method === 'readFile') checkRead(target); else checkWrite(target, method.startsWith('mkdir') ? 'mkdir' : method);
    return original.call(this, target, ...args);
  };
}
for (const method of ['rename', 'copyFile', 'cp']) {
  const original = fs.promises[method];
  if (!original) continue;
  fs.promises[method] = async function guardedPromisePair(from, to, ...args) {
    if (method === 'rename') checkWrite(from, 'rename'); else checkRead(from);
    checkWrite(to, method);
    return original.call(this, from, to, ...args);
  };
}
for (const method of ['symlink', 'link']) {
  if (fs.promises[method]) fs.promises[method] = async () => deny('JOURNEY_LINK_OPERATION_DENIED');
}
const promiseOpen = fs.promises.open;
fs.promises.open = async function guardedPromiseOpen(target, flags, ...args) {
  (writingFlags(flags) ? checkWrite : checkRead)(target);
  return promiseOpen.call(this, target, flags, ...args);
};

// Fixture text may still be parsed; discovery and file loading never run.
const originalLoad = Module._load;
const realDotenv = originalLoad.call(Module, path.join(root, 'backend/node_modules/dotenv/lib/main.js'), module, false);
const dotenvStub = Object.freeze({ parse: realDotenv.parse, populate: realDotenv.populate, config: () => ({ parsed: {} }), configDotenv: () => ({ parsed: {} }) });
Module._load = function guardedLoad(request, parent, isMain) {
  if (typeof request === 'string' && envLike(request)) deny('JOURNEY_ENV_MODULE_ACCESS_DENIED');
  if (request === 'dotenv') return dotenvStub;
  if (request === 'dotenv/config') return Object.freeze({ parsed: {} });
  return originalLoad.call(this, request, parent, isMain);
};
if (typeof process.loadEnvFile === 'function') process.loadEnvFile = () => deny('JOURNEY_PROCESS_ENV_FILE_ACCESS_DENIED');

function loopback(host) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(host || '').toLowerCase());
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === 'string') deny('JOURNEY_SOCKET_PATH_DENIED');
  if (first && typeof first === 'object' && first.path) deny('JOURNEY_SOCKET_PATH_DENIED');
  const host = typeof first === 'object' ? first?.host : args[1];
  const port = Number(typeof first === 'object' ? first?.port : first);
  if (!loopback(host) || !Number.isInteger(port) || port < 1 || port > 65535) deny('JOURNEY_NETWORK_DENIED');
  return connect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function guardedListen(...args) {
  const first = args[0];
  const host = typeof first === 'object' ? first?.host : args[1];
  const port = Number(typeof first === 'object' ? first?.port : first);
  const requested = Number(process.env.JOURNEY_OFFLINE_PORT || 0);
  if (host !== '127.0.0.1' || !Number.isInteger(port) || (port !== 0 && port !== requested)) deny('JOURNEY_LOOPBACK_BIND_REQUIRED');
  return listen.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function guardedLookup(host, ...args) {
  if (!loopback(host)) deny('JOURNEY_DNS_DENIED');
  return lookup.call(this, host, ...args);
};
for (const method of Object.keys(dns).filter((name) => /^resolve|^reverse$/.test(name))) {
  if (typeof dns[method] === 'function') dns[method] = () => deny('JOURNEY_DNS_DENIED');
}
dgram.createSocket = () => deny('JOURNEY_DATAGRAM_DENIED');
if (globalThis.fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.protocol !== 'http:' || !loopback(url.hostname)) deny('JOURNEY_FETCH_DENIED');
    return originalFetch(input, init);
  };
}

const allowedTestFiles = new Set([
  'backend/tests/customer-journey-read-model.test.js',
  'backend/tests/customer-journey-crm-contract.test.js',
  'backend/tests/customer-journey-finance-contract.test.js',
  'backend/tests/customer-journey-logistics-contract.test.js',
  'backend/tests/customer-journey-feedback-contract.test.js',
  'backend/tests/customer-journey-functional-integration.test.js',
  'frontend/src/business-os/customer-journey/journeyViewContract.test.js',
  'frontend/src/business-os/customer-journey/journeyFunctionalView.test.js',
  'scripts/customer-journey/isolation.test.cjs',
  'frontend/src/business-os/businessOsContract.test.js',
  'frontend/src/business-os/crmReadOnlyTruth.test.js',
  'backend/tests/founder-cockpit-read-model.test.js',
  'backend/tests/founder-local-crm-company-scope.test.js',
  'evidence/internal-live-operation-v1/runtime-safety/browser-runtime-readiness.test.js',
  'evidence/internal-live-operation-v1/runtime-safety/candidate-evidence-paths.test.js',
  'evidence/internal-live-operation-v1/runtime-safety/founder-local-read-only.test.js',
].map((item) => path.resolve(root, item).toLowerCase()));
function executable(name) {
  const value = String(process.env[name] || '').trim();
  return value && path.isAbsolute(value) ? path.resolve(value) : null;
}
function safeChildEnvironment(options = {}) {
  const env = options.env || process.env;
  if (env.JOURNEY_OFFLINE_ISOLATED !== '1' || env.NODE_OPTIONS || !samePath(env.JOURNEY_OFFLINE_RUN_ROOT, runRoot)) deny('JOURNEY_CHILD_ENVIRONMENT_DENIED');
  for (const key of Object.keys(env)) {
    if (/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|SUPABASE_URL|DATABASE_URL|PGHOST|OPENAI_API_KEY|GOOGLE_CLIENT_SECRET|AWS_SECRET)/i.test(key)) deny('JOURNEY_CHILD_CREDENTIAL_DENIED');
  }
}
function safeNodeArgs(args) {
  if (!args.includes('--test') || !args.includes('--test-isolation=none') || !args.includes('--test-reporter=tap')) return false;
  const files = [];
  let preloadSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--require') {
      if (preloadSeen || index + 1 >= args.length || !samePath(args[index + 1], preloadPath)) return false;
      preloadSeen = true;
      index += 1;
      continue;
    }
    if (['--test', '--test-isolation=none', '--test-reporter=tap'].includes(value) || value.startsWith('--test-name-pattern=') || value.startsWith('--test-skip-pattern=')) continue;
    if (value.startsWith('-')) return false;
    files.push(value);
  }
  if (!preloadSeen) return false;
  return files.length > 0 && files.every((file) => allowedTestFiles.has(path.resolve(root, file).toLowerCase()));
}
function safeGitArgs(args) {
  if (args[0] === '-c' && args[1] === `safe.directory=${root}`) args = args.slice(2);
  if (args.length < 4 || args[0] !== '-C' || !samePath(args[1], root)) return false;
  const rest = args.slice(2);
  const joined = rest.join('\0');
  if (['rev-parse\0--show-toplevel', 'rev-parse\0HEAD', 'branch\0--show-current', 'status\0--porcelain\0--untracked-files=all'].includes(joined)) return true;
  if (rest[0] === 'show' && rest[1] === '-s' && rest[2] === '--format=%T' && /^(?:HEAD|[0-9a-f]{40})$/i.test(rest[3] || '')) return rest.length === 4;
  return rest[0] === 'show' && rest.length === 2 && /^[0-9a-f]{40}:[A-Za-z0-9_./-]+$/i.test(rest[1]);
}
function safeEdgeArgs(args) {
  const profile = args.find((value) => value.startsWith('--user-data-dir='));
  return args.some((value) => value === '--headless' || value.startsWith('--headless='))
    && args.includes('--remote-debugging-pipe')
    && args.includes('--disable-background-networking')
    && args.includes('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1')
    && args.includes('--proxy-server=http://127.0.0.1:9')
    && profile && descendant(runRoot, profile.slice('--user-data-dir='.length))
    && !args.some((value) => /^https?:\/\//i.test(value) || value.startsWith('--remote-debugging-port='));
}
function authorizeChild(command, args, options) {
  if (!Array.isArray(args) || !path.isAbsolute(String(command)) || options?.shell) deny('JOURNEY_SUBPROCESS_DENIED');
  safeChildEnvironment(options);
  const target = path.resolve(command);
  const cwd = path.resolve(options?.cwd || process.cwd());
  if (!inside(root, cwd) && !inside(runRoot, cwd)) deny('JOURNEY_SUBPROCESS_CWD_DENIED');
  if (samePath(target, envPath('JOURNEY_NODE_EXECUTABLE')) && safeNodeArgs(args.map(String))) return;
  if (samePath(target, envPath('JOURNEY_GIT_EXECUTABLE')) && safeGitArgs(args.map(String))) return;
  const esbuild = executable('JOURNEY_ESBUILD_EXECUTABLE');
  if (esbuild && samePath(target, esbuild) && args.length && args.every((value) => /^--(?:service=[0-9.]+|ping)$/.test(String(value)))) return;
  const edge = executable('JOURNEY_EDGE_EXECUTABLE');
  if (edge && samePath(target, edge) && safeEdgeArgs(args.map(String))) return;
  deny('JOURNEY_SUBPROCESS_DENIED');
}
for (const method of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = childProcess[method];
  childProcess[method] = function guardedChild(command, args, options, ...rest) {
    const actualArgs = Array.isArray(args) ? args : [];
    const actualOptions = Array.isArray(args) ? (options && typeof options === 'object' ? options : {}) : (args && typeof args === 'object' ? args : {});
    authorizeChild(command, actualArgs, actualOptions);
    return original.call(this, command, args, options, ...rest);
  };
}
for (const method of ['exec', 'execSync', 'fork']) childProcess[method] = () => deny('JOURNEY_SUBPROCESS_DENIED');

Module.syncBuiltinESMExports();
module.exports = { checkFile, inside, loopback };
