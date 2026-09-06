#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { readCandidateBinding } = require('./candidate-binding');
const {
  sha256Directory,
} = require('../../../backend/src/config/founderLocalRuntimeProvenance');

const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const runtimeDir = path.join(__dirname, 'runtime', 'candidates', 'c3-r2');
const outputFile = path.join(runtimeDir, 'static-verification.json');
const configurationOutputFile = path.join(runtimeDir, 'configuration-rollback-verification.json');
const safetyOutputFile = path.join(runtimeDir, 'founder-local-safety-verification.json');

function npmCheck(id, args, cwd) {
  if (process.platform === 'win32') {
    return {
      id,
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', ...args],
      cwd,
    };
  }
  return { id, command: 'npm', args, cwd };
}

const checks = [
  {
    id: 'structural_candidate_verifier',
    command: 'pwsh',
    args: ['-NoProfile', '-File', 'scripts/verify-internal-live-v1.ps1', '-RepoRoot', '.'],
    cwd: repositoryDir,
  },
  {
    id: 'timestamp_verifier_regression',
    command: 'pwsh',
    args: ['-NoProfile', '-File', 'evidence/internal-live-operation-v1/runtime-safety/timestamp-verifier-regression.test.ps1'],
    cwd: repositoryDir,
  },
  npmCheck('tenant_isolation', ['run', 'test:tenant'], path.join(repositoryDir, 'backend')),
  npmCheck('backend_business_os', ['run', 'test:business-os'], path.join(repositoryDir, 'backend')),
  {
    id: 'advisory_configuration',
    command: process.execPath,
    args: ['--test', 'tests/founder-advisory-config.test.js'],
    cwd: path.join(repositoryDir, 'backend'),
  },
  npmCheck('founder_local_safety', ['run', 'test:founder-local-safety'], path.join(repositoryDir, 'backend')),
  {
    id: 'founder_local_lifecycle_regression',
    command: process.execPath,
    args: ['--test', 'tests/founder-local-lifecycle-regression.test.js'],
    cwd: path.join(repositoryDir, 'backend'),
  },
  {
    id: 'browser_readiness_regression',
    command: process.execPath,
    args: ['--test', 'evidence/internal-live-operation-v1/runtime-safety/browser-runtime-readiness.test.js'],
    cwd: repositoryDir,
  },
  {
    id: 'candidate_evidence_isolation',
    command: process.execPath,
    args: ['--test', 'evidence/internal-live-operation-v1/runtime-safety/candidate-evidence-paths.test.js'],
    cwd: repositoryDir,
  },
  npmCheck('frontend_business_os', ['run', 'test:business-os'], path.join(repositoryDir, 'frontend')),
  npmCheck('frontend_founder_local_build', ['run', 'build:founder-local'], path.join(repositoryDir, 'frontend')),
];

function slash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function git(args) {
  return execFileSync('git', ['-C', repositoryDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJsonAtomic(file, evidence) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function securitySummary() {
  return {
    command_output_recorded: false,
    credentials_recorded: false,
    environment_values_recorded: false,
    real_business_values_recorded: false,
  };
}

function trackedReadinessIsAllPass() {
  const reportFile = path.join(repositoryDir, 'docs', 'internal-live-v1', 'INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const blocking = report?.readiness_gates?.blocking || {};
  return ['runtime', 'health', 'reconciliation', 'configuration_rollback', 'no_write']
    .every((gate) => blocking[gate]?.status === 'PASS');
}

function runCheck(check) {
  const started = Date.now();
  const childEnv = { ...process.env, TEMP: runtimeDir, TMP: runtimeDir };
  for (const key of Object.keys(childEnv)) {
    if (/^(FOUNDER_LOCAL_ENV_FILE|FOUNDER_LOCAL_ACCEPTANCE_|SUPABASE_|VITE_|DATABASE_URL$|JWT_SECRET$)/i.test(key)) {
      delete childEnv[key];
    }
  }
  const result = spawnSync(check.command, check.args, {
    cwd: check.cwd,
    env: childEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    id: check.id,
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exit_code: Number.isInteger(result.status) ? result.status : null,
    duration_ms: Date.now() - started,
    failure_code: result.error ? String(result.error.code || result.error.name || 'SPAWN_ERROR').slice(0, 80) : null,
  };
}

function main() {
  if (trackedReadinessIsAllPass()) {
    const error = new Error('STATIC_VERIFICATION_C3_ONLY');
    error.code = 'STATIC_VERIFICATION_C3_ONLY';
    throw error;
  }
  const actualRoot = path.resolve(git(['rev-parse', '--show-toplevel']));
  const before = git(['status', '--porcelain', '--untracked-files=all']);
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['show', '-s', '--format=%T', 'HEAD']);
  const branch = git(['branch', '--show-current']) || 'DETACHED';
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const candidateEnvFiles = git(['diff', '--name-only', `${mergeBase}..HEAD`])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => /(^|\/)\.env(?:\.|$)/i.test(file));
  const binding = readCandidateBinding();
  const attestedAtMs = Date.parse(binding.attested_at);
  const nowMs = Date.now();
  const identitySafe = actualRoot === repositoryDir
    && /^[0-9a-f]{40}$/.test(commit)
    && /^[0-9a-f]{40}$/.test(tree)
    && !before
    && binding.commit === commit
    && binding.tree === tree
    && /^[0-9a-f]{64}$/.test(binding.candidate_attestation_sha256)
    && Number.isFinite(attestedAtMs)
    && attestedAtMs >= nowMs - (24 * 60 * 60 * 1000)
    && attestedAtMs <= nowMs
    && candidateEnvFiles.length === 0;
  if (!identitySafe) {
    const error = new Error('STATIC_VERIFICATION_C3_PREFLIGHT_FAILED');
    error.code = 'STATIC_VERIFICATION_C3_PREFLIGHT_FAILED';
    throw error;
  }

  const results = checks.map(runCheck);
  const after = git(['status', '--porcelain', '--untracked-files=all']);
  const commitAfter = git(['rev-parse', 'HEAD']);
  const treeAfter = git(['show', '-s', '--format=%T', 'HEAD']);
  let bindingUnchanged = false;
  if (!after && commitAfter === commit && treeAfter === tree) {
    try {
      const bindingAfter = readCandidateBinding();
      bindingUnchanged = bindingAfter.commit === binding.commit
        && bindingAfter.tree === binding.tree
        && bindingAfter.candidate_attestation_sha256 === binding.candidate_attestation_sha256
        && bindingAfter.attested_at === binding.attested_at;
    } catch {
      bindingUnchanged = false;
    }
  }
  const candidateUnchanged = !after && commitAfter === commit && treeAfter === tree && bindingUnchanged;
  const result = identitySafe && candidateUnchanged && results.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL';
  const resultById = Object.fromEntries(results.map((item) => [item.id, item.status]));
  const checkedAt = new Date().toISOString();
  const evidence = {
    schema_version: '1.0.0',
    evidence_type: 'FOUNDER_LOCAL_STATIC_VERIFICATION',
    checked_at: checkedAt,
    result,
    candidate: {
      ...binding,
      branch,
      worktree_root: slash(actualRoot),
      clean_before: !before,
      clean_after: candidateUnchanged,
      head_and_tree_unchanged: commitAfter === commit && treeAfter === tree,
      attestation_unchanged: bindingUnchanged,
    },
    supply_chain: {
      candidate_environment_files_changed: candidateEnvFiles.length,
      backend_package_lock_sha256: sha256File(path.join(repositoryDir, 'backend', 'package-lock.json')),
      frontend_package_lock_sha256: sha256File(path.join(repositoryDir, 'frontend', 'package-lock.json')),
      backend_source_sha256: sha256Directory(path.join(repositoryDir, 'backend', 'src')),
      frontend_dist_sha256: fs.existsSync(path.join(repositoryDir, 'frontend', 'dist', 'index.html'))
        ? sha256Directory(path.join(repositoryDir, 'frontend', 'dist'))
        : null,
    },
    checks: results,
    security: securitySummary(),
  };

  const configurationResult = identitySafe
    && candidateUnchanged
    && resultById.backend_business_os === 'PASS'
    && resultById.advisory_configuration === 'PASS'
    && resultById.founder_local_safety === 'PASS'
    ? 'PASS'
    : 'FAIL';
  const configurationEvidence = {
    schema_version: '1.0.0',
    evidence_type: 'FOUNDER_ADVISORY_CONFIGURATION_ROLLBACK_VERIFICATION',
    checked_at: checkedAt,
    result: configurationResult,
    candidate: { ...binding },
    controls: {
      authenticated_admin_and_permission_gate: configurationResult === 'PASS',
      bounded_validation: configurationResult === 'PASS',
      explicit_approval: configurationResult === 'PASS',
      idempotent_versioned_persistence: configurationResult === 'PASS',
      sanitized_audit_attribution: configurationResult === 'PASS',
      rollback_rehearsed_in_isolated_local_state: configurationResult === 'PASS',
      canonical_business_rule_changed: false,
      operational_effect: false,
    },
    source_checks: ['backend_business_os', 'advisory_configuration', 'founder_local_safety'],
    security: securitySummary(),
  };

  const safetyResult = identitySafe
    && candidateUnchanged
    && resultById.founder_local_safety === 'PASS'
    && resultById.tenant_isolation === 'PASS'
    ? 'PASS'
    : 'FAIL';
  const safetyEvidence = {
    schema_version: '1.0.0',
    evidence_type: 'FOUNDER_LOCAL_STATIC_SAFETY_VERIFICATION',
    checked_at: checkedAt,
    result: safetyResult,
    candidate: { ...binding },
    controls: {
      loopback_only_profile: safetyResult === 'PASS',
      canonical_database_mutations_blocked: safetyResult === 'PASS',
      unreviewed_rpc_blocked: safetyResult === 'PASS',
      operational_http_writes_blocked: safetyResult === 'PASS',
      unapproved_get_routes_blocked: safetyResult === 'PASS',
      source_scope_attested: safetyResult === 'PASS',
      integration_credentials_isolated: safetyResult === 'PASS',
      process_identity_bound: safetyResult === 'PASS',
      background_writers_disabled: safetyResult === 'PASS',
      tenant_isolation_suite_passed: safetyResult === 'PASS',
    },
    source_checks: ['founder_local_safety', 'tenant_isolation'],
    security: securitySummary(),
  };
  writeJsonAtomic(outputFile, evidence);
  writeJsonAtomic(configurationOutputFile, configurationEvidence);
  writeJsonAtomic(safetyOutputFile, safetyEvidence);
  console.log(JSON.stringify({
    result,
    artifact: slash(path.relative(repositoryDir, outputFile)),
    checks_passed: results.filter((item) => item.status === 'PASS').length,
    checks_total: checks.length,
  }));
  if (result !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', code: String(error?.code || error?.name || 'STATIC_VERIFICATION_FAILED').slice(0, 80) }));
  process.exit(1);
}
