const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repositoryDir = path.resolve(__dirname, '..', '..', '..');
const attestationFile = path.join(__dirname, 'runtime', 'candidate-attestation.json');

function git(args) {
  return execFileSync('git', ['-C', repositoryDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

function bindingError() {
  const error = new Error('FOUNDER_LOCAL_CANDIDATE_BINDING_INVALID');
  error.code = 'FOUNDER_LOCAL_CANDIDATE_BINDING_INVALID';
  return error;
}

/**
 * Bind generated acceptance evidence to the already-attested clean C3
 * implementation. Runtime files are ignored, so this checks source status as
 * well as exact HEAD/tree and never records the worktree or secret-file path.
 */
function readCandidateBinding() {
  let raw;
  let attestation;
  try {
    raw = fs.readFileSync(attestationFile);
    attestation = JSON.parse(raw.toString('utf8'));
  } catch {
    throw bindingError();
  }

  const actualRoot = path.resolve(git(['rev-parse', '--show-toplevel']));
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  const recorded = attestation?.repository || {};
  if (
    attestation?.schema_version !== '1.0.0'
    || attestation?.evidence_type !== 'FOUNDER_LOCAL_CANDIDATE_ATTESTATION'
    || attestation?.result !== 'PASS'
    || actualRoot !== repositoryDir
    || status
    || recorded.worktree_clean !== true
    || recorded.commit !== commit
    || recorded.tree !== tree
  ) {
    throw bindingError();
  }

  return {
    commit,
    tree,
    candidate_attestation_sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    attested_at: String(attestation.checked_at || ''),
  };
}

module.exports = { readCandidateBinding };
