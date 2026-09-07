'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, 'evidence/internal-live-operation-v1/runtime-safety/runtime');
const staging = process.env.JOURNEY_OFFLINE_RUN_ROOT;
const preserved = Object.freeze({ commit: 'ed3b64c0e64909a18c8d58fca07e3da4e593e565', tree: 'adf60dad69f4ab00462d5c2f0b7833c644b25ce1' });
const sourceAllowlistFiles = [
  'backend/src/middleware/founderLocalReadOnly.js',
  'frontend/src/business-os/founderLocalReadOnly.js',
  'backend/src/helpers/founderCockpitReadModel.js',
];

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(args) { return execFileSync(process.env.JOURNEY_GIT_EXECUTABLE, ['-c', `safe.directory=${root}`, '-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function identity() {
  assert(path.resolve(git(['rev-parse', '--show-toplevel'])) === root, 'JOURNEY_GIT_ROOT_MISMATCH');
  assert(git(['show', '-s', '--format=%T', preserved.commit]) === preserved.tree, 'JOURNEY_C3_R2_OBJECT_MISMATCH');
  const commit = git(['rev-parse', 'HEAD']);
  return { commit, tree: git(['show', '-s', '--format=%T', 'HEAD']), branch: git(['branch', '--show-current']), clean: !git(['status', '--porcelain', '--untracked-files=all']), preserved };
}
function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    assert(!entry.isSymbolicLink(), 'JOURNEY_ARTIFACT_LINK_DENIED');
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(name) : [name];
  });
}
function inventory(directory, extensions = null) {
  return walkFiles(directory).filter((file) => !extensions || extensions.includes(path.extname(file))).map((file) => {
    const content = fs.readFileSync(file);
    return { path: path.relative(root, file).replaceAll('\\', '/'), bytes: content.length, sha256: sha256(content) };
  });
}
function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function originalAllowlistUnchanged() {
  // Git baseline is LF; the preserved Windows checkout contains mixed CRLF/LF.
  // Compare source with Git's newline normalization, and separately byte-hash
  // preserved evidence/dist before and after every verification run.
  const normalized = (value) => sha256(String(value).replace(/\r\n/g, '\n'));
  return sourceAllowlistFiles.every((file) => normalized(fs.readFileSync(path.join(root, file), 'utf8')) === normalized(git(['show', `${preserved.commit}:${file}`]) + '\n'));
}
function outputDirectory(candidate) {
  return candidate.clean && candidate.commit !== preserved.commit
    ? path.join(runtime, 'candidates', `customer-journey-${candidate.commit.slice(0, 12)}`)
    : staging;
}

const testGroups = [
  { id: 'journey_backend', files: ['backend/tests/customer-journey-read-model.test.js'] },
  { id: 'journey_crm_source', files: ['backend/tests/customer-journey-crm-contract.test.js'] },
  { id: 'journey_finance_source', files: ['backend/tests/customer-journey-finance-contract.test.js'] },
  { id: 'journey_logistics_source', files: ['backend/tests/customer-journey-logistics-contract.test.js'] },
  { id: 'journey_feedback_source', files: ['backend/tests/customer-journey-feedback-contract.test.js'] },
  { id: 'journey_functional_integration', files: ['backend/tests/customer-journey-functional-integration.test.js'] },
  { id: 'journey_frontend', files: ['frontend/src/business-os/customer-journey/journeyViewContract.test.js'] },
  { id: 'journey_functional_view', files: ['frontend/src/business-os/customer-journey/journeyFunctionalView.test.js'] },
  { id: 'offline_isolation', files: ['scripts/customer-journey/isolation.test.cjs'] },
  { id: 'existing_frontend_guards', files: ['frontend/src/business-os/businessOsContract.test.js', 'frontend/src/business-os/crmReadOnlyTruth.test.js'] },
  { id: 'existing_backend_cockpit_scope', files: ['backend/tests/founder-cockpit-read-model.test.js'], skip: 'Founder advisory configuration route', excluded: ['Advisory write/configuration tests: unaffected; not in this read-only cycle', 'CRM company suite: legacy router import tries to create upload directory; guarded attempt blocked; NOT RUN in final cycle'] },
  { id: 'existing_readiness', files: ['evidence/internal-live-operation-v1/runtime-safety/browser-runtime-readiness.test.js'], pattern: '^(matches only|reads exact|waits through|fails closed|browser cleanup)', excluded: ['Profile/filesystem mutation and temp confinement cases: unchanged historical code; NOT RUN'] },
  { id: 'existing_candidate_isolation', files: ['evidence/internal-live-operation-v1/runtime-safety/candidate-evidence-paths.test.js'] },
  { id: 'existing_no_write_guards', files: ['evidence/internal-live-operation-v1/runtime-safety/founder-local-read-only.test.js'], skip: 'explicit Founder-local data environment|runtime process inspector', excluded: ['Credential-file loader fixture', 'OS process inspector: native process access not needed for new offline UI'] },
];
const expectedTestCounts = { journey_backend: 45, journey_frontend: 21, offline_isolation: 5,
  journey_crm_source: 11, journey_finance_source: 13, journey_logistics_source: 16,
  journey_feedback_source: 4, journey_functional_integration: 22, journey_functional_view: 5,
  existing_frontend_guards: 21, existing_backend_cockpit_scope: 12, existing_readiness: 8,
  existing_candidate_isolation: 2, existing_no_write_guards: 21 };
function runTests(directory) {
  const results = [];
  for (const group of testGroups) {
    if (group.files.some((file) => !fs.existsSync(path.join(root, file)))) {
      results.push({ id: group.id, status: 'BLOCKED', reason: 'TEST_SOURCE_NOT_PRESENT' });
      continue;
    }
    writeJson(directory, 'offline-test-progress.json', { active_group: group.id, completed: results });
    const args = ['--require', path.join(__dirname, 'isolation-preload.cjs'), '--test', '--test-isolation=none', '--test-reporter=tap', ...(group.pattern ? [`--test-name-pattern=${group.pattern}`] : []), ...(group.skip ? [`--test-skip-pattern=${group.skip}`] : []), ...group.files];
    const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    const counts = {};
    for (const name of ['tests', 'pass', 'fail', 'skipped', 'cancelled']) {
      const match = String(result.stdout || '').match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
      counts[name] = match ? Number(match[1]) : null;
    }
    const countContract = counts.tests === expectedTestCounts[group.id] && counts.pass === counts.tests && counts.pass > 0 && counts.fail === 0 && counts.cancelled === 0;
    const entry = { id: group.id, status: result.status === 0 && !result.error && countContract ? 'PASS' : 'FAIL', exit_code: result.status, counts, expected_tests: expectedTestCounts[group.id], count_contract: countContract, scope: 'OFFLINE_FIXTURES_OR_MOCKS_ONLY' };
    // Record only declared test names, never raw assertion payloads or fixtures.
    entry.passed_tap_names = String(result.stdout || '').split('\n')
      .filter((line) => /^\s*ok \d+ - /.test(line))
      .map((line) => line.replace(/^\s*ok \d+ - /, '').trim());
    if (group.excluded) entry.excluded = group.excluded;
    if (entry.status === 'FAIL') entry.failed_tests = String(result.stdout || '').split('\n').filter((line) => /^not ok |^\s+code: /.test(line));
    results.push(entry);
    const { passed_tap_names, ...progressEntry } = entry;
    console.log(JSON.stringify(progressEntry));
    if (entry.status === 'FAIL' && !entry.failed_tests.length) console.log(JSON.stringify({ id: group.id, failure_code: result.error?.code || 'TEST_PROCESS_FAILED_WITHOUT_TAP' }));
  }
  writeJson(directory, 'offline-tests.json', { mode: 'OFFLINE_FIXTURE_ONLY', candidate: identity(), results, recorded_at: new Date().toISOString(), live_verification: 'NOT RUN / NOT AUTHORIZED IN THIS CYCLE' });
  writeJson(directory, 'offline-test-progress.json', { status: 'COMPLETE', active_group: null, completed: results });
  return results;
}

async function build(directory) {
  // Direct esbuild API: no Vite config, loadEnv, env files, proxy, public assets,
  // standard App/auth/provider, production build hooks, or C3-R2 dist mutation.
  const esbuild = require(path.join(root, 'frontend/node_modules/esbuild/lib/main.js'));
  const assets = path.join(directory, 'preview/assets');
  fs.mkdirSync(assets, { recursive: true });
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: {
      journey: 'frontend/offline/customer-journey/entry.jsx',
      'failure-probe': 'frontend/offline/customer-journey/failure-probe.jsx',
    },
    outdir: assets,
    bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
    target: 'es2020', sourcemap: false, minify: false, metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent', write: false, tsconfigRaw: {},
    plugins: [{ name: 'workspace-source-only', setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        const basedir = args.importer ? path.dirname(args.importer) : root;
        let resolved;
        if (args.kind === 'entry-point') resolved = path.resolve(root, args.path);
        else if (args.path.startsWith('.') || path.isAbsolute(args.path)) {
          const base = path.resolve(basedir, args.path);
          resolved = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')]
            .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
        } else {
          assert(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler'].includes(args.path), 'JOURNEY_BUNDLE_PACKAGE_DENIED');
          resolved = require.resolve(args.path, { paths: [basedir] });
        }
        assert(resolved && path.relative(root, resolved) !== '..' && !path.relative(root, resolved).startsWith(`..${path.sep}`) && !path.isAbsolute(path.relative(root, resolved)), 'JOURNEY_BUNDLE_PATH_DENIED');
        assert(!fs.lstatSync(resolved).isSymbolicLink() && fs.realpathSync(resolved).toLowerCase() === resolved.toLowerCase(), 'JOURNEY_BUNDLE_LINK_DENIED');
        assert(!/(?:^|[\\/])\.env(?:\.|$)/i.test(resolved), 'JOURNEY_BUILD_ENV_INPUT_DENIED');
        return { path: resolved, namespace: 'journey-source' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'journey-source' }, (args) => ({
        contents: fs.readFileSync(args.path, 'utf8'), loader: path.extname(args.path) === '.css' ? 'css' : 'jsx',
      }));
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs).map((file) => path.relative(root, file.replace(/^journey-source:/, '')).replaceAll('\\', '/'));
  assert(inputs.every((file) => !/(?:^|\/)\.env(?:\.|$)/i.test(file)), 'JOURNEY_BUILD_ENV_INPUT_DENIED');
  assert(!inputs.some((file) => /backend\/src\/(?:config|routes)\//.test(file) || /frontend\/src\/lib\/(?:api|auth)/.test(file)), 'JOURNEY_BUILD_LIVE_IMPORT_DENIED');
  for (const output of result.outputFiles) fs.writeFileSync(output.path, output.contents);
  const html = fs.readFileSync(path.join(root, 'frontend/offline/customer-journey/index.html'), 'utf8')
    .replace(/(?:\.\/|\/)entry\.jsx/g, './assets/journey.js');
  assert(!/https?:\/\//i.test(html), 'JOURNEY_BUILD_EXTERNAL_ASSET_DENIED');
  fs.writeFileSync(path.join(directory, 'preview/index.html'), html, 'utf8');
  // A separate synthetic verification entry renders the unchanged component
  // with controllable failures. It is never a production route or live adapter.
  const failureHtml = html.replaceAll('./assets/journey.', './assets/failure-probe.');
  fs.writeFileSync(path.join(directory, 'preview/failure-probe.html'), failureHtml, 'utf8');
  const entry = { status: 'PASS', mode: 'OFFLINE_FIXTURE_ONLY', candidate: identity(), input_count: inputs.length, input_paths: inputs, assets: inventory(path.join(directory, 'preview')), recorded_at: new Date().toISOString() };
  writeJson(directory, 'offline-build.json', entry);
  console.log(JSON.stringify({ id: 'offline_build', status: 'PASS', inputs: inputs.length }));
  return entry;
}

async function serve(directory, port = 0) {
  const previewRoot = path.join(directory, 'preview');
  assert(fs.existsSync(path.join(previewRoot, 'index.html')), 'JOURNEY_PREVIEW_BUILD_REQUIRED');
  const server = http.createServer((req, res) => {
    const actualPort = server.address().port;
    const expectedOrigin = `http://127.0.0.1:${actualPort}`;
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'X-Journey-Mode': 'OFFLINE_FIXTURE_ONLY' };
    const fail = (status) => { res.writeHead(status, headers); res.end(); };
    if (req.headers.host !== `127.0.0.1:${actualPort}` || (req.headers.origin && req.headers.origin !== expectedOrigin)) return fail(403);
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, expectedOrigin).pathname); } catch { return fail(400); }
    if (pathname.startsWith('/api/')) return fail(403);
    if (pathname === '/__offline/health') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ mode: 'OFFLINE_FIXTURE_ONLY', live_connected: false, writes_enabled: false }));
    }
    const file = path.resolve(previewRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(previewRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(?:html|js|css)$/.test(file)) return fail(404);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(404);
    const contentType = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }[path.extname(file)];
    res.writeHead(200, { ...headers, 'Content-Type': contentType });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function main() {
  assert(process.env.JOURNEY_OFFLINE_ISOLATED === '1', 'JOURNEY_USE_SANITIZED_POWERSHELL_ENTRY');
  assert(!process.env.FOUNDER_LOCAL_ENV_FILE && !process.env.JWT_SECRET && !process.env.SUPABASE_URL && !process.env.DATABASE_URL, 'JOURNEY_INHERITED_CREDENTIAL_DENIED');
  const mode = process.argv[2] || 'verify';
  assert(['test', 'build', 'browser', 'preview', 'verify'].includes(mode), 'JOURNEY_MODE_INVALID');
  const before = identity();
  const directory = outputDirectory(before);
  if (mode === 'preview') {
    // A manual synthetic review must never rewrite frozen verification evidence.
    const port = Number(process.argv[3] || 4179);
    assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'JOURNEY_PORT_INVALID');
    const preview = await serve(directory, port);
    console.log(JSON.stringify({ url: preview.url, mode: 'OFFLINE_FIXTURE_ONLY', credentials: 'NOT USED', expires_in_seconds: 900, stop: 'Ctrl+C' }));
    await new Promise((resolve) => {
      const close = () => { preview.server.closeAllConnections(); preview.server.close(resolve); };
      const timer = setTimeout(close, 900000);
      process.once('SIGINT', () => { clearTimeout(timer); close(); });
      process.once('SIGTERM', () => { clearTimeout(timer); close(); });
    });
    return;
  }
  const historyBefore = inventory(path.join(runtime, 'candidates/c3-r2'));
  const distBefore = inventory(path.join(root, 'frontend/dist'));
  assert(originalAllowlistUnchanged(), 'JOURNEY_LIVE_ALLOWLIST_CHANGED');
  writeJson(directory, 'offline-candidate-attestation.json', { ...before, node_version: process.versions.node, mode: 'OFFLINE_FIXTURE_ONLY', frozen_candidate: before.clean && before.commit !== preserved.commit, preserved_history: historyBefore, live_allowlist_unchanged: true, recorded_at: new Date().toISOString() });
  let results = [];
  try {
  if (mode === 'test' || mode === 'verify') results = runTests(directory);
  if (mode === 'verify') assert(results.length === testGroups.length && results.every((result) => result.status === 'PASS'), 'JOURNEY_TEST_GATE_FAILED_BEFORE_BUILD_OR_BROWSER');
  if (mode === 'build' || mode === 'verify') await build(directory);
  if (mode === 'browser' || mode === 'verify') {
    const { verifyBrowser } = require('./verify-offline-browser.cjs');
    const result = await verifyBrowser({ root, directory, serve, candidate: before });
    results.push(result);
    writeJson(directory, 'offline-browser.json', result);
  }
  } finally {
    const after = identity();
    const historyUnchanged = JSON.stringify(historyBefore) === JSON.stringify(inventory(path.join(runtime, 'candidates/c3-r2')));
    const distUnchanged = JSON.stringify(distBefore) === JSON.stringify(inventory(path.join(root, 'frontend/dist')));
    writeJson(directory, 'preservation-check.json', { before, after, history_unchanged: historyUnchanged, c3_dist_unchanged: distUnchanged, c3_dist_files: distBefore.length, preserved_history: historyBefore });
    assert(historyUnchanged && distUnchanged, 'JOURNEY_HISTORY_CHANGED');
    assert(before.commit === after.commit && before.tree === after.tree && before.clean === after.clean, 'JOURNEY_CANDIDATE_CHANGED_DURING_RUN');
  }
  const after = identity();
  assert(originalAllowlistUnchanged(), 'JOURNEY_LIVE_ALLOWLIST_CHANGED');
  writeJson(directory, 'offline-summary.json', { candidate: after, results, mode: 'OFFLINE_FIXTURE_ONLY', history_unchanged: true, c3_dist_unchanged: true, live_allowlist_unchanged: true, real_credentials_used: false, live_verification: 'NOT RUN / NOT AUTHORIZED IN THIS CYCLE', founder_acceptance: 'HOLD', daily_use: 'HOLD', wp3: 'STOP', unaffected_legacy_suites: { lifecycle: 'NOT RUN: original lifecycle unchanged. Isolated mock-browser closeout is separate and does not verify or close lifecycle/supervisor.', timestamp_powershell: 'NOT RUN: original verifier unchanged. Fixture date tests verify the new read model only, not the PowerShell verifier.' }, prior_supervisor: { operational_closure: 'PASS', supervisor: 'FAIL', cause: 'UNDETERMINED' }, recorded_at: new Date().toISOString() });
  writeJson(directory, 'offline-artifact-manifest.json', { candidate: after, mode: 'OFFLINE_FIXTURE_ONLY', files: inventory(directory).filter((file) => !file.path.endsWith('/offline-artifact-manifest.json')), hash_algorithm: 'SHA-256', contains_real_business_records: false, recorded_at: new Date().toISOString() });
  if (results.some((result) => result.status !== 'PASS')) process.exitCode = 1;
}
if (require.main === module) main().catch((error) => { console.error(JSON.stringify({ status: 'FAIL', code: error.code || 'JOURNEY_OFFLINE_FAILURE', error_type: error.name, build_errors: Array.isArray(error.errors) ? error.errors.map((item) => ({ text: item.text, file: item.location?.file, line: item.location?.line })) : undefined, source_frames: String(error.stack || '').split('\n').filter((line) => /^\s+at /.test(line)).slice(0, 5) })); process.exitCode = 1; });
module.exports = { serve, identity, outputDirectory, inventory, build, preserved };
