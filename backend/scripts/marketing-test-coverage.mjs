// Offline unit coverage only. PostgreSQL, browser and provider acceptance are separate gates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export default async function* report(events) {
  for await (const event of events) {
    if (event.type === 'test:coverage' || (event.type === 'test:summary' && !event.data.file)) {
      yield JSON.stringify({ type: event.type, data: event.data }) + '\n';
    }
  }
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 8)) throw Error('Coverage command requires Node 22.8+ or Node 24; ordinary unit tests still support Node 18.');
  const root = path.resolve(path.dirname(script), '../..');
  const output = path.join(root, 'coverage/marketing-crm');
  fs.mkdirSync(output, { recursive: true });
  const roots = ['marketingAutomation', 'crmLeadIdentity', 'crmLeadQuality'].map(x => `backend/src/modules/${x}`);
  const workflows = ['vpt-marketing-automation', 'agent-guardrails', 'backup-privilege-guard'];
  const tests = new Set();
  for (const workflow of workflows) {
    for (const line of fs.readFileSync(path.join(root, `.github/workflows/${workflow}.yml`), 'utf8').split(/\r?\n/)) {
      const command = line.trim().replace(/^(?:- )?run: /, '');
      // Only existing dependency-free CI unit commands, never DB / HTTP / deploy steps.
      if (!command.startsWith('node --test ')) continue;
      for (const match of command.matchAll(/backend\/tests\/[\w.-]+\.test\.js/g)) {
        if (/\.(postgres|http)\.test\.js$/.test(match[0])) throw Error('Database/HTTP test in offline suite');
        tests.add(match[0]);
      }
    }
  }
  if (!tests.size) throw Error('No offline tests discovered');
  const inventory = roots.flatMap(dir => fs.readdirSync(path.join(root, dir), { recursive: true })
    .filter(file => file.endsWith('.js')).map(file => `${dir}/${file.replaceAll('\\', '/')}`)).sort();
  const args = ['--test', '--experimental-test-coverage', ...roots.map(dir => `--test-coverage-include=${dir}/**`),
    '--test-reporter=tap', `--test-reporter-destination=${path.join(output, 'tests.tap')}`,
    `--test-reporter=${import.meta.url}`, `--test-reporter-destination=${path.join(output, 'events.jsonl')}`, ...[...tests].sort()];
  const child = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (child.error) throw child.error;
  const events = fs.readFileSync(path.join(output, 'events.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const coverage = events.find(e => e.type === 'test:coverage')?.data.summary;
  const result = events.find(e => e.type === 'test:summary')?.data;
  if (!coverage || !result || child.status !== 0 || !result.success || !result.counts.passed) {
    throw Error(`Unit tests or coverage collection failed; inspect ${output}`);
  }
  const files = coverage.files.map(file => ({
    path: path.relative(root, file.path).replaceAll('\\', '/'),
    lines: file.coveredLinePercent, branches: file.coveredBranchPercent, functions: file.coveredFunctionPercent,
    uncoveredLines: file.lines.filter(line => line.count === 0).map(line => line.line),
    uncoveredFunctions: file.functions.filter(fn => fn.count === 0).map(fn => ({ name: fn.name, line: fn.line })),
  })).sort((a, b) => a.path.localeCompare(b.path));
  const missing = inventory.filter(file => !files.some(f => f.path === file));
  const unexpected = files.filter(file => !inventory.includes(file.path));
  const below = files.filter(file => Math.min(file.lines, file.branches, file.functions) < 80);
  const report = { generatedAt: new Date().toISOString(), nodeVersion: process.version, scope: roots, threshold: 80,
    tests: result.counts, suiteFiles: [...tests].sort(), totals: coverage.totals, inventory, missing,
    sourceSha256: Object.fromEntries(inventory.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
    files, status: missing.length || unexpected.length || below.length || files.length !== inventory.length ? 'FAIL' : 'PASS',
  };
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${result.counts.passed} passed, ${result.counts.skipped} skipped; ${files.length}/${inventory.length} source files measured.`);
  console.log(`Lines ${coverage.totals.coveredLinePercent.toFixed(2)}%; branches ${coverage.totals.coveredBranchPercent.toFixed(2)}%; functions ${coverage.totals.coveredFunctionPercent.toFixed(2)}%.`);
  for (const file of below) console.log(`Below 80%: ${file.path}`);
  for (const file of missing) console.log(`Unmeasured source: ${file}`);
  console.log(`Report: ${path.join(output, 'summary.json')}`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
