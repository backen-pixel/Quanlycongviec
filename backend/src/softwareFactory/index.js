const { SoftwareFactoryAgentRegistry } = require('./agentRegistry');
const { SoftwareFactoryControlPlane } = require('./controlPlane');
const { SoftwareFactoryAuditLedger } = require('./auditLedger');
const { SoftwareFactoryApprovalAuthority } = require('./approvalAuthority');
const { SoftwareFactoryIdentityBoundary } = require('./identityBoundary');
const { assertRuntimeAdapterContract, isAuthorizedExecutionGrant } = require('./runtimeAdapterContract');
const { evaluateAgentAction } = require('./policy');
const {
  createEvidenceEnvelope,
  redactSensitiveData,
  validateProvenance,
  verifyEvidenceEnvelope,
} = require('./evidenceContracts');
const { verifyArtifactIntegrity } = require('./artifactContracts');
const { SoftwareFactoryMutationGuard } = require('./mutationGuard');
const {
  SoftwareFactoryStateCoordinator,
  assertStatePortContract,
  createRecoveryCheckpoint,
  validateRecoveryCheckpoint,
} = require('./stateContracts');
const { sha256Digest } = require('./canonical');
const {
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_NODES,
  DEFAULT_MAX_JSON_STRING_BYTES,
  DEFAULT_MAX_JSON_TOTAL_STRING_BYTES,
  assertPlainJsonValue,
} = require('./plainJson');
const { DurableControlPlaneFoundation } = require('./durableControlPlane');
const { assertDurableStatePortContract } = require('./durableStatePort');
const {
  assertAuthorizationVerifierContract,
  authorizationDecisionDigest,
  verifyAuthorizationDecision,
} = require('./durableAuthorizationContract');
const {
  assertKeyProviderContract,
  createKeyReference,
  getVerifiedKeyAuditEvents,
  keyAuditHash,
  resolveActiveKey,
  revokeKeyVersion,
  rotateActiveKey,
  signCanonical,
  validateKeyAuditEvents,
  validateKeyDescriptor,
  validateKeyReference,
  verifyCanonical,
} = require('./keyManagementContract');
const constants = require('./constants');

module.exports = {
  SoftwareFactoryAgentRegistry,
  SoftwareFactoryApprovalAuthority,
  SoftwareFactoryAuditLedger,
  SoftwareFactoryControlPlane,
  SoftwareFactoryIdentityBoundary,
  assertRuntimeAdapterContract,
  evaluateAgentAction,
  isAuthorizedExecutionGrant,
  SoftwareFactoryMutationGuard,
  SoftwareFactoryStateCoordinator,
  DurableControlPlaneFoundation,
  assertDurableStatePortContract,
  assertAuthorizationVerifierContract,
  assertKeyProviderContract,
  assertPlainJsonValue,
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_NODES,
  DEFAULT_MAX_JSON_STRING_BYTES,
  DEFAULT_MAX_JSON_TOTAL_STRING_BYTES,
  assertStatePortContract,
  createEvidenceEnvelope,
  createRecoveryCheckpoint,
  createKeyReference,
  authorizationDecisionDigest,
  getVerifiedKeyAuditEvents,
  keyAuditHash,
  redactSensitiveData,
  sha256Digest,
  resolveActiveKey,
  revokeKeyVersion,
  rotateActiveKey,
  signCanonical,
  validateProvenance,
  validateRecoveryCheckpoint,
  validateKeyDescriptor,
  validateKeyAuditEvents,
  validateKeyReference,
  verifyArtifactIntegrity,
  verifyEvidenceEnvelope,
  verifyCanonical,
  verifyAuthorizationDecision,
  ...constants,
};
