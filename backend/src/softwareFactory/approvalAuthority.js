const crypto = require('node:crypto');
const { deepFreeze } = require('./agentRegistry');
const { stableSerialize } = require('./auditLedger');
const { redactSensitiveData } = require('./evidenceContracts');
const { factoryError } = require('./errors');
const { isAuthenticatedHumanIdentity } = require('./identityBoundary');

const APPROVAL_AUTHORITIES = new Set(['FOUNDER', 'AUTHORIZED_RELEASE_APPROVER']);

function digestValue(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function safeSignatureEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

class SoftwareFactoryApprovalAuthority {
  #clock;
  #consumedNonces;
  #issuedNonces;
  #maxTtlMs;
  #signingKey;

  constructor({
    clock = () => new Date(),
    signingKey = crypto.randomBytes(32),
    maxTtlMs = 10 * 60 * 1000,
  } = {}) {
    const key = Buffer.isBuffer(signingKey) ? Buffer.from(signingKey) : Buffer.from(String(signingKey || ''));
    if (key.length < 32) throw factoryError('APPROVAL_SIGNING_KEY_INVALID', 'Approval signing key phải tối thiểu 32 bytes.');
    if (!Number.isFinite(Number(maxTtlMs)) || Number(maxTtlMs) <= 0) {
      throw factoryError('APPROVAL_TTL_INVALID', 'Approval max TTL phải lớn hơn 0.');
    }
    this.#clock = clock;
    this.#signingKey = key;
    this.#maxTtlMs = Number(maxTtlMs);
    this.#issuedNonces = new Set();
    this.#consumedNonces = new Set();
  }

  #signature(payload) {
    return crypto.createHmac('sha256', this.#signingKey).update(stableSerialize(payload)).digest('hex');
  }

  issue({ humanIdentity, decision, target, notes = '', ttlMs = 5 * 60 * 1000 }) {
    if (!isAuthenticatedHumanIdentity(humanIdentity)) {
      throw factoryError('AUTHENTICATED_HUMAN_REQUIRED', 'Approval cần authenticated human principal.');
    }
    if (!APPROVAL_AUTHORITIES.has(humanIdentity.authority)) {
      throw factoryError('HUMAN_APPROVAL_AUTHORITY_DENIED', 'Human principal không có release approval authority.');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw factoryError('APPROVAL_DECISION_INVALID', 'Approval decision không hợp lệ.');
    }
    const requestedTtl = Number(ttlMs);
    if (!Number.isFinite(requestedTtl) || requestedTtl <= 0 || requestedTtl > this.#maxTtlMs) {
      throw factoryError('APPROVAL_TTL_INVALID', `Approval TTL phải trong khoảng 1..${this.#maxTtlMs}ms.`);
    }
    const requiredTargetFields = [
      'requirement_id', 'run_id', 'run_cycle', 'release_artifact_id', 'target_digest',
    ];
    if (!target || requiredTargetFields.some((field) => target[field] == null || target[field] === '')) {
      throw factoryError('APPROVAL_TARGET_INCOMPLETE', 'Approval target chưa gắn đủ ReleaseArtifact/digest.');
    }

    const issuedAt = this.#clock();
    const expiresAt = new Date(issuedAt.getTime() + requestedTtl);
    const nonce = crypto.randomUUID();
    const notesResult = redactSensitiveData(String(notes || ''));
    const payload = {
      token_type: 'SF_RELEASE_APPROVAL',
      nonce,
      approver_identity: humanIdentity.principal_id,
      authority: humanIdentity.authority,
      decision,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      requirement_id: target.requirement_id,
      run_id: target.run_id,
      run_cycle: Number(target.run_cycle),
      release_artifact_id: target.release_artifact_id,
      target_digest: target.target_digest,
      notes: notesResult.value,
      redactions: notesResult.findings,
    };
    this.#issuedNonces.add(nonce);
    return deepFreeze({ ...payload, signature: this.#signature(payload) });
  }

  consume(token, expectedTarget) {
    if (!token || typeof token !== 'object') {
      throw factoryError('APPROVAL_TOKEN_REQUIRED', 'Thiếu approval token.');
    }
    const { signature, ...payload } = token;
    if (payload.token_type !== 'SF_RELEASE_APPROVAL'
      || !this.#issuedNonces.has(payload.nonce)
      || !safeSignatureEqual(signature, this.#signature(payload))) {
      throw factoryError('APPROVAL_TOKEN_INVALID', 'Approval token không hợp lệ hoặc không do authority hiện tại phát hành.');
    }
    if (this.#consumedNonces.has(payload.nonce)) {
      throw factoryError('APPROVAL_REPLAY_DENIED', 'Approval token đã được sử dụng.');
    }

    const nowMs = this.#clock().getTime();
    const issuedAtMs = Date.parse(payload.issued_at);
    const expiresAtMs = Date.parse(payload.expires_at);
    if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)
      || issuedAtMs > nowMs || expiresAtMs <= nowMs) {
      throw factoryError('APPROVAL_TOKEN_EXPIRED', 'Approval token đã hết hạn hoặc timestamp không hợp lệ.');
    }

    const targetFields = ['requirement_id', 'run_id', 'run_cycle', 'release_artifact_id', 'target_digest'];
    if (!expectedTarget || targetFields.some((field) => String(payload[field]) !== String(expectedTarget[field]))) {
      throw factoryError('APPROVAL_TARGET_MISMATCH', 'Approval token không khớp ReleaseArtifact/digest hiện tại.');
    }

    this.#consumedNonces.add(payload.nonce);
    return deepFreeze({
      approval_id: `sf-approval-${payload.nonce}`,
      nonce: payload.nonce,
      approver_id: payload.approver_identity,
      authority: payload.authority,
      status: payload.decision,
      issued_at: payload.issued_at,
      expires_at: payload.expires_at,
      decided_at: this.#clock().toISOString(),
      requirement_id: payload.requirement_id,
      run_id: payload.run_id,
      run_cycle: payload.run_cycle,
      release_artifact_id: payload.release_artifact_id,
      target_digest: payload.target_digest,
      notes: payload.notes,
    });
  }
}

module.exports = {
  APPROVAL_AUTHORITIES,
  SoftwareFactoryApprovalAuthority,
  digestValue,
};
