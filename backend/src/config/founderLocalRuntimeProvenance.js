const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST = Object.freeze({
  contract_version: 'business_ai_os_founder_local_dist_v1',
  runtime_profile: 'founder-local-read-only',
  read_only: true,
  entry_path: '/business-os/login',
  api_base_url: '/api',
  api_origin_policy: 'same-origin-only',
  credential_request_policy: 'single-slash-relative-api-path-only',
});
const FOUNDER_LOCAL_ACCEPTANCE_DELTA_ALLOWLIST = Object.freeze([
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_FOUNDER_ACCEPTANCE.md',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_RUNBOOK.md',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_VERIFICATION_SUMMARY.md',
  'evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json',
]);

const FOUNDER_LOCAL_PROVENANCE_ENV_KEYS = Object.freeze([
  'FOUNDER_LOCAL_CANDIDATE_COMMIT',
  'FOUNDER_LOCAL_CANDIDATE_TREE',
  'FOUNDER_LOCAL_CHECKOUT_COMMIT',
  'FOUNDER_LOCAL_CHECKOUT_TREE',
  'FOUNDER_LOCAL_FRONTEND_DIST_SHA256',
  'FOUNDER_LOCAL_FRONTEND_MANIFEST_SHA256',
  'FOUNDER_LOCAL_FRONTEND_CONTRACT_VERSION',
  'FOUNDER_LOCAL_FRONTEND_RUNTIME_PROFILE',
  'FOUNDER_LOCAL_FRONTEND_READ_ONLY',
  'FOUNDER_LOCAL_FRONTEND_ENTRY_PATH',
  'FOUNDER_LOCAL_FRONTEND_API_BASE_URL',
  'FOUNDER_LOCAL_FRONTEND_API_ORIGIN_POLICY',
  'FOUNDER_LOCAL_FRONTEND_CREDENTIAL_REQUEST_POLICY',
  'FOUNDER_LOCAL_LAUNCHER_PID',
  'FOUNDER_LOCAL_RUN_ID',
]);

function provenanceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizedPath(value) {
  const resolved = path.resolve(String(value || '')).replaceAll('/', path.sep);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function listDistFiles(directory) {
  const root = path.resolve(directory);
  const output = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const resolved = path.resolve(full);
      if (!resolved.startsWith(`${root}${path.sep}`)) {
        throw provenanceError('FOUNDER_LOCAL_FRONTEND_DIST_PATH_INVALID');
      }
      if (entry.isSymbolicLink()) {
        throw provenanceError('FOUNDER_LOCAL_FRONTEND_DIST_SYMLINK_FORBIDDEN');
      }
      if (entry.isDirectory()) visit(resolved);
      else if (entry.isFile()) output.push(resolved);
    }
  };
  visit(root);
  return output.sort((left, right) => (
    left.replace(/\\/g, '/').localeCompare(right.replace(/\\/g, '/'))
  ));
}

// Keep this byte-for-byte directory hashing contract aligned with the static
// verifier. Relative path, NUL, file bytes, NUL are hashed for each sorted file.
function sha256DirectoryPass(directory) {
  const root = path.resolve(directory);
  const hash = crypto.createHash('sha256');
  for (const file of listDistFiles(root)) {
    hash.update(path.relative(root, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function sha256Directory(directory) {
  const first = sha256DirectoryPass(directory);
  const second = sha256DirectoryPass(directory);
  if (first !== second) {
    throw provenanceError('FOUNDER_LOCAL_FRONTEND_DIST_CHANGED_DURING_ATTESTATION');
  }
  return first;
}

function git(repositoryDir, args) {
  return execFileSync('git', ['-C', repositoryDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

function readCleanCandidateIdentity(repositoryDir) {
  const root = path.resolve(repositoryDir);
  let actualRoot;
  let commit;
  let tree;
  let status;
  try {
    actualRoot = path.resolve(git(root, ['rev-parse', '--show-toplevel']));
    commit = git(root, ['rev-parse', 'HEAD']);
    tree = git(root, ['show', '-s', '--format=%T', 'HEAD']);
    status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  } catch {
    throw provenanceError('FOUNDER_LOCAL_GIT_VERIFICATION_FAILED');
  }
  if (normalizedPath(actualRoot) !== normalizedPath(root)) {
    throw provenanceError('FOUNDER_LOCAL_GIT_ROOT_MISMATCH');
  }
  if (status) throw provenanceError('FOUNDER_LOCAL_WORKTREE_NOT_FROZEN');
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^[0-9a-f]{40}$/.test(tree)) {
    throw provenanceError('FOUNDER_LOCAL_CANDIDATE_IDENTITY_INVALID');
  }
  return Object.freeze({ commit, tree });
}

function acceptanceOnlyCheckoutValid({
  sourceCandidate,
  actualSourceTree,
  sourceIsAncestor,
  changedFiles,
  mergeCommits,
}) {
  return actualSourceTree === sourceCandidate?.tree
    && sourceIsAncestor === true
    && Array.isArray(changedFiles)
    && changedFiles.every((file) => FOUNDER_LOCAL_ACCEPTANCE_DELTA_ALLOWLIST.includes(file))
    && Array.isArray(mergeCommits)
    && mergeCommits.length === 0;
}

function readFounderLocalCandidateBinding(repositoryDir) {
  const root = path.resolve(repositoryDir);
  const checkout = readCleanCandidateIdentity(root);
  const reportFile = path.join(
    root,
    'docs',
    'internal-live-v1',
    'INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json',
  );
  let recorded;
  try {
    recorded = JSON.parse(fs.readFileSync(reportFile, 'utf8'))?.verified_source_candidate;
  } catch {
    throw provenanceError('FOUNDER_LOCAL_VERIFIED_SOURCE_CANDIDATE_UNREADABLE');
  }
  const recordedCandidate = recorded?.clean === true
    && /^[0-9a-f]{40}$/.test(String(recorded?.commit || ''))
    && /^[0-9a-f]{40}$/.test(String(recorded?.tree || ''))
    ? { commit: recorded.commit, tree: recorded.tree }
    : null;
  if (!recordedCandidate || recordedCandidate.commit === checkout.commit) {
    if (recordedCandidate && recordedCandidate.tree !== checkout.tree) {
      throw provenanceError('FOUNDER_LOCAL_VERIFIED_SOURCE_CANDIDATE_INVALID');
    }
    return Object.freeze({
      source_candidate: Object.freeze(recordedCandidate || checkout),
      checkout,
      acceptance_only_checkout: false,
    });
  }

  let actualSourceTree;
  let sourceIsAncestor = false;
  let changedFiles = [];
  let mergeCommits = [];
  try {
    actualSourceTree = git(root, ['show', '-s', '--format=%T', recordedCandidate.commit]);
    try {
      execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', recordedCandidate.commit, checkout.commit], {
        stdio: 'ignore',
        windowsHide: true,
      });
      sourceIsAncestor = true;
    } catch { sourceIsAncestor = false; }
    changedFiles = git(root, ['diff', '--name-only', `${recordedCandidate.commit}..${checkout.commit}`])
      .split(/\r?\n/)
      .map((item) => item.trim().replace(/\\/g, '/'))
      .filter(Boolean);
    mergeCommits = git(root, ['rev-list', '--merges', `${recordedCandidate.commit}..${checkout.commit}`])
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    throw provenanceError('FOUNDER_LOCAL_ACCEPTANCE_CHECKOUT_INVALID');
  }
  if (!acceptanceOnlyCheckoutValid({
    sourceCandidate: recordedCandidate,
    actualSourceTree,
    sourceIsAncestor,
    changedFiles,
    mergeCommits,
  })) {
    throw provenanceError('FOUNDER_LOCAL_ACCEPTANCE_CHECKOUT_INVALID');
  }
  return Object.freeze({
    source_candidate: Object.freeze(recordedCandidate),
    checkout,
    acceptance_only_checkout: true,
  });
}

function readFounderLocalDistIdentity(repositoryDir) {
  const distRoot = path.join(path.resolve(repositoryDir), 'frontend', 'dist');
  const manifestFile = path.join(distRoot, 'founder-local-manifest.json');
  const indexFile = path.join(distRoot, 'index.html');
  let manifestBytes;
  let indexBytes;
  let manifest;
  try {
    manifestBytes = fs.readFileSync(manifestFile);
    indexBytes = fs.readFileSync(indexFile);
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw provenanceError('FOUNDER_LOCAL_FRONTEND_DIST_MISSING');
  }

  const expectedKeys = Object.keys(EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST).sort();
  const actualKeys = Object.keys(manifest || {}).sort();
  const indexHtml = indexBytes.toString('utf8');
  const contractMatches = JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)
    && Object.entries(EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST)
      .every(([key, value]) => manifest[key] === value)
    && indexHtml.includes('<meta name="business-ai-os-runtime-profile" content="founder-local-read-only">')
    && indexHtml.includes('<meta name="business-ai-os-api-base" content="/api">')
    && !/\b(?:src|href)\s*=\s*["']https?:\/\//i.test(indexHtml);
  if (!contractMatches) {
    throw provenanceError('FOUNDER_LOCAL_FRONTEND_DIST_CONTRACT_INVALID');
  }

  const identity = {
    sha256: sha256Directory(distRoot),
    manifest_sha256: sha256(manifestBytes),
    ...EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST,
  };
  // Fail if the manifest or entry point changed while the served directory was
  // being hashed. The runtime verifier independently re-hashes the full dist.
  if (
    !fs.readFileSync(manifestFile).equals(manifestBytes)
    || !fs.readFileSync(indexFile).equals(indexBytes)
  ) {
    throw provenanceError('FOUNDER_LOCAL_FRONTEND_DIST_CHANGED_DURING_ATTESTATION');
  }
  return Object.freeze(identity);
}

function applyFounderLocalProvenanceEnvironment(env, {
  candidate,
  checkout = candidate,
  frontendDist,
  launcherPid,
  runId,
}) {
  const values = {
    FOUNDER_LOCAL_CANDIDATE_COMMIT: candidate?.commit,
    FOUNDER_LOCAL_CANDIDATE_TREE: candidate?.tree,
    FOUNDER_LOCAL_CHECKOUT_COMMIT: checkout?.commit,
    FOUNDER_LOCAL_CHECKOUT_TREE: checkout?.tree,
    FOUNDER_LOCAL_FRONTEND_DIST_SHA256: frontendDist?.sha256,
    FOUNDER_LOCAL_FRONTEND_MANIFEST_SHA256: frontendDist?.manifest_sha256,
    FOUNDER_LOCAL_FRONTEND_CONTRACT_VERSION: frontendDist?.contract_version,
    FOUNDER_LOCAL_FRONTEND_RUNTIME_PROFILE: frontendDist?.runtime_profile,
    FOUNDER_LOCAL_FRONTEND_READ_ONLY: frontendDist?.read_only === true ? '1' : undefined,
    FOUNDER_LOCAL_FRONTEND_ENTRY_PATH: frontendDist?.entry_path,
    FOUNDER_LOCAL_FRONTEND_API_BASE_URL: frontendDist?.api_base_url,
    FOUNDER_LOCAL_FRONTEND_API_ORIGIN_POLICY: frontendDist?.api_origin_policy,
    FOUNDER_LOCAL_FRONTEND_CREDENTIAL_REQUEST_POLICY: frontendDist?.credential_request_policy,
    FOUNDER_LOCAL_LAUNCHER_PID: launcherPid == null ? undefined : String(launcherPid),
    FOUNDER_LOCAL_RUN_ID: runId,
  };
  for (const key of FOUNDER_LOCAL_PROVENANCE_ENV_KEYS) {
    if (values[key] == null || values[key] === '') delete env[key];
    else env[key] = String(values[key]);
  }
  return env;
}

function runtimeProvenanceSnapshot(env = process.env, {
  processId = process.pid,
  parentProcessId = process.ppid,
} = {}) {
  const launcherProcessId = /^\d+$/.test(String(env.FOUNDER_LOCAL_LAUNCHER_PID || ''))
    ? Number(env.FOUNDER_LOCAL_LAUNCHER_PID)
    : null;
  return {
    candidate: {
      commit: String(env.FOUNDER_LOCAL_CANDIDATE_COMMIT || '').trim() || null,
      tree: String(env.FOUNDER_LOCAL_CANDIDATE_TREE || '').trim() || null,
    },
    checkout: {
      commit: String(env.FOUNDER_LOCAL_CHECKOUT_COMMIT || '').trim() || null,
      tree: String(env.FOUNDER_LOCAL_CHECKOUT_TREE || '').trim() || null,
    },
    frontend_dist: {
      sha256: String(env.FOUNDER_LOCAL_FRONTEND_DIST_SHA256 || '').trim() || null,
      manifest_sha256: String(env.FOUNDER_LOCAL_FRONTEND_MANIFEST_SHA256 || '').trim() || null,
      contract_version: String(env.FOUNDER_LOCAL_FRONTEND_CONTRACT_VERSION || '').trim() || null,
      runtime_profile: String(env.FOUNDER_LOCAL_FRONTEND_RUNTIME_PROFILE || '').trim() || null,
      read_only: env.FOUNDER_LOCAL_FRONTEND_READ_ONLY === '1',
      entry_path: String(env.FOUNDER_LOCAL_FRONTEND_ENTRY_PATH || '').trim() || null,
      api_base_url: String(env.FOUNDER_LOCAL_FRONTEND_API_BASE_URL || '').trim() || null,
      api_origin_policy: String(env.FOUNDER_LOCAL_FRONTEND_API_ORIGIN_POLICY || '').trim() || null,
      credential_request_policy: String(
        env.FOUNDER_LOCAL_FRONTEND_CREDENTIAL_REQUEST_POLICY || '',
      ).trim() || null,
    },
    run_id: String(env.FOUNDER_LOCAL_RUN_ID || '').trim() || null,
    launcher_process_id: launcherProcessId,
    process_id: Number.isSafeInteger(processId) && processId > 0 ? processId : null,
    launcher_owned: launcherProcessId != null && launcherProcessId === parentProcessId,
  };
}

function assertFounderLocalRuntimeProvenance(env = process.env, options = {}) {
  const snapshot = runtimeProvenanceSnapshot(env, options);
  const expected = EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST;
  const valid = /^[0-9a-f]{40}$/.test(String(snapshot.candidate.commit || ''))
    && /^[0-9a-f]{40}$/.test(String(snapshot.candidate.tree || ''))
    && /^[0-9a-f]{40}$/.test(String(snapshot.checkout.commit || ''))
    && /^[0-9a-f]{40}$/.test(String(snapshot.checkout.tree || ''))
    && /^[0-9a-f]{64}$/.test(String(snapshot.frontend_dist.sha256 || ''))
    && /^[0-9a-f]{64}$/.test(String(snapshot.frontend_dist.manifest_sha256 || ''))
    && snapshot.frontend_dist.contract_version === expected.contract_version
    && snapshot.frontend_dist.runtime_profile === expected.runtime_profile
    && snapshot.frontend_dist.read_only === expected.read_only
    && snapshot.frontend_dist.entry_path === expected.entry_path
    && snapshot.frontend_dist.api_base_url === expected.api_base_url
    && snapshot.frontend_dist.api_origin_policy === expected.api_origin_policy
    && snapshot.frontend_dist.credential_request_policy === expected.credential_request_policy
    && Number.isSafeInteger(snapshot.launcher_process_id)
    && snapshot.launcher_process_id > 0
    && Number.isSafeInteger(snapshot.process_id)
    && snapshot.process_id > 0
    && snapshot.launcher_owned === true
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(snapshot.run_id || ''));
  if (!valid) throw provenanceError('FOUNDER_LOCAL_RUNTIME_PROVENANCE_INVALID');
  return snapshot;
}

function assertFounderLocalRuntimeFileBinding(repositoryDir, env = process.env, options = {}) {
  const claimed = assertFounderLocalRuntimeProvenance(env, options);
  const candidateBinding = readFounderLocalCandidateBinding(repositoryDir);
  const candidate = candidateBinding.source_candidate;
  const checkout = candidateBinding.checkout;
  const frontendDist = readFounderLocalDistIdentity(repositoryDir);
  const candidateMatches = claimed.candidate.commit === candidate.commit
    && claimed.candidate.tree === candidate.tree;
  const checkoutMatches = claimed.checkout.commit === checkout.commit
    && claimed.checkout.tree === checkout.tree;
  const frontendMatches = Object.keys(frontendDist)
    .every((key) => claimed.frontend_dist[key] === frontendDist[key]);
  if (!candidateMatches || !checkoutMatches || !frontendMatches) {
    throw provenanceError('FOUNDER_LOCAL_RUNTIME_FILE_BINDING_INVALID');
  }
  return {
    candidate,
    checkout,
    acceptance_only_checkout: candidateBinding.acceptance_only_checkout,
    frontend_dist: frontendDist,
  };
}

module.exports = {
  EXPECTED_FOUNDER_LOCAL_FRONTEND_MANIFEST,
  FOUNDER_LOCAL_ACCEPTANCE_DELTA_ALLOWLIST,
  FOUNDER_LOCAL_PROVENANCE_ENV_KEYS,
  applyFounderLocalProvenanceEnvironment,
  acceptanceOnlyCheckoutValid,
  assertFounderLocalRuntimeFileBinding,
  assertFounderLocalRuntimeProvenance,
  readCleanCandidateIdentity,
  readFounderLocalCandidateBinding,
  readFounderLocalDistIdentity,
  runtimeProvenanceSnapshot,
  sha256Directory,
};
