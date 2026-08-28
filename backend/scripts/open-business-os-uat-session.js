#!/usr/bin/env node
/**
 * Mở phiên UAT có kiểm soát: backup gate -> PII-safe preflight -> evidence local.
 * Không tạo/sửa hồ sơ nghiệp vụ và không sinh evidence khi gate còn BLOCKED.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildBusinessOsUatSessionManifest,
  renderBusinessOsUatSessionMarkdown,
} = require('../src/helpers/businessOsUatSession');

const BACKEND_DIR = path.join(__dirname, '..');
const REPO_DIR = path.join(BACKEND_DIR, '..');
const BASELINE_TAG = 'business-os-vnext-staging-baseline-02';
const SCHEMA_FREEZE = '2026-08-27T01:01:30.141Z';
const PILOT_COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';

function cliValue(prefix) {
  const entry = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1).trim() : '';
}

function runJsonScript(filename, args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, filename), ...args], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
  });
  const stdout = String(result.stdout || '').trim();
  let report = null;
  try { report = JSON.parse(stdout); } catch { /* handled below */ }
  return {
    status: Number.isInteger(result.status) ? result.status : 1,
    report,
    stdout,
    stderr: String(result.stderr || '').trim(),
  };
}

function gitValue(args) {
  const result = spawnSync('git', args, { cwd: REPO_DIR, encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function gitContext() {
  const status = gitValue(['status', '--porcelain']);
  return {
    commit: gitValue(['rev-parse', 'HEAD']) || null,
    branch: gitValue(['branch', '--show-current']) || null,
    baselineTagCommit: gitValue(['rev-list', '-n', '1', BASELINE_TAG]) || null,
    dirtyFileCount: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
  };
}

function printChildFailure(label, result) {
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.stderr.write(`[uat-session] ${label} không đạt; không sinh biên bản UAT.\n`);
}

function main() {
  const gate = runJsonScript('audit-business-os-baseline.js', [
    `--require-backup-after=${SCHEMA_FREEZE}`,
  ]);
  if (gate.status !== 0 || gate.report?.uat_gate?.status !== 'READY') {
    printChildFailure('backup gate', gate);
    process.exitCode = gate.status || 3;
    return;
  }

  const code = gitContext();
  if (!code.baselineTagCommit || code.baselineTagCommit !== code.commit) {
    console.error(JSON.stringify({
      status: 'BLOCKED',
      reason: !code.baselineTagCommit
        ? `Chưa tạo tag ${BASELINE_TAG}.`
        : `Tag ${BASELINE_TAG} không trỏ tới commit đang chạy.`,
      code,
    }, null, 2));
    process.exitCode = 4;
    return;
  }

  const preflight = runJsonScript('preflight-business-os-uat.js', [
    `--company-id=${PILOT_COMPANY_ID}`,
  ]);
  if (preflight.status !== 0 || !preflight.report) {
    printChildFailure('preflight', preflight);
    process.exitCode = preflight.status || 1;
    return;
  }

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[-:.]/g, '').replace('Z', 'Z');
  const sessionId = `business-os-uat-${stamp}`;
  const manifest = buildBusinessOsUatSessionManifest({
    sessionId,
    generatedAt,
    baselineTag: BASELINE_TAG,
    schemaFreeze: SCHEMA_FREEZE,
    code,
    gateReport: gate.report,
    preflightReport: preflight.report,
  });

  const outputDirArg = cliValue('--output-dir');
  const outputDir = outputDirArg
    ? path.resolve(process.cwd(), outputDirArg)
    : path.join(BACKEND_DIR, '.uat-evidence');
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${sessionId}.json`);
  const markdownPath = path.join(outputDir, `${sessionId}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(markdownPath, renderBusinessOsUatSessionMarkdown(manifest), { encoding: 'utf8', flag: 'wx' });

  console.log(JSON.stringify({
    status: manifest.status,
    session_id: sessionId,
    all_applied: gate.report.all_applied === true,
    uat_gate: gate.report.uat_gate,
    preflight_completed: true,
    evidence: { json: jsonPath, markdown: markdownPath },
    backup: manifest.backup,
    migration_count: manifest.migrations.length,
    slots_with_existing_coverage: manifest.slots_with_existing_coverage,
    slots_needing_uat_record: manifest.slots_needing_uat_record,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[uat-session] ${error.message || error}`);
  process.exit(1);
}
