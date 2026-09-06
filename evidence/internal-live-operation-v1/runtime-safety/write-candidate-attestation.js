#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SOURCE_CANDIDATE_COMMIT = 'f73b3e19ef01b866358d4cdb6307748ef72a559c';
const EXPECTED_BRANCH = 'codex/business-ai-os-founder-local-live-v1';
const EXPECTED_REMOTE = 'https://github.com/backen-pixel/Quanlycongviec.git';
const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const outputDir = path.join(__dirname, 'runtime');
const outputFile = path.join(outputDir, 'candidate-attestation.json');

function git(args, cwd = repositoryDir) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function slash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  // A failed rerun must not leave an older PASS artifact looking current.
  fs.rmSync(outputFile, { force: true });
  const actualRoot = path.resolve(git(['rev-parse', '--show-toplevel']));
  const gitDir = path.resolve(actualRoot, git(['rev-parse', '--git-dir']));
  const branch = git(['branch', '--show-current']);
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const remote = git(['remote', 'get-url', 'origin']);
  const worktreeChanges = git(['status', '--porcelain']);
  const isLinkedWorktree = slash(gitDir).includes('/worktrees/');
  let sourceIsAncestor = false;
  try {
    execFileSync('git', ['-C', actualRoot, 'merge-base', '--is-ancestor', SOURCE_CANDIDATE_COMMIT, 'HEAD'], {
      stdio: 'ignore',
    });
    sourceIsAncestor = true;
  } catch {
    sourceIsAncestor = false;
  }
  const changedFiles = git(['diff', '--name-only', `${SOURCE_CANDIDATE_COMMIT}..HEAD`])
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const result = branch === EXPECTED_BRANCH
    && remote === EXPECTED_REMOTE
    && /^[0-9a-f]{40}$/.test(commit)
    && /^[0-9a-f]{40}$/.test(tree)
    && sourceIsAncestor
    && !worktreeChanges
    && actualRoot === repositoryDir
    && isLinkedWorktree
    ? 'PASS'
    : 'FAIL';
  const evidence = {
    schema_version: '1.0.0',
    evidence_type: 'FOUNDER_LOCAL_CANDIDATE_ATTESTATION',
    checked_at: new Date().toISOString(),
    result,
    repository: {
      authorized_worktree_root: slash(actualRoot),
      linked_worktree: isLinkedWorktree,
      remote,
      branch,
      commit,
      tree,
      source_candidate_commit: SOURCE_CANDIDATE_COMMIT,
      source_candidate_is_ancestor: sourceIsAncestor,
      worktree_clean: !worktreeChanges,
      root_workspace_status_inspected: false,
      root_workspace_modified_by_task: false,
      root_workspace_claim_basis: 'TASK_SCOPE_ATTESTATION_NOT_FILESYSTEM_INSPECTION',
      user_level_codex_directory_status_inspected: false,
      user_level_codex_directory_modified_by_task: false,
      changed_files: changedFiles,
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      target_profile: 'founder-local-read-only',
      target_host: '127.0.0.1',
      target_port: 4010,
    },
    security: {
      real_customer_data_included: false,
      real_financial_data_included: false,
      real_hr_data_included: false,
      secret_values_included: false,
    },
  };
  const temporary = `${outputFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    fs.renameSync(temporary, outputFile);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  console.log(JSON.stringify({
    result,
    artifact: slash(path.relative(repositoryDir, outputFile)),
    changed_file_count: changedFiles.length,
  }));
  if (result !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', code: String(error?.code || error?.message || 'ATTESTATION_FAILED').slice(0, 120) }));
  process.exit(1);
}
