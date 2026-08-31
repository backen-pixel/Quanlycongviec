const { factoryError } = require('./errors');
const { assertPlainJsonValue } = require('./plainJson');
const { types: utilTypes } = require('node:util');

const DURABLE_PORT_CONTRACT_VERSION = '1.0.0';
const REQUIRED_DURABLE_PORT_METHODS = Object.freeze([
  'getCapabilities',
  'readScopeState',
  'readCheckpoint',
  'readReceipt',
  'readAuditEntries',
  'readIdempotencyRecord',
  'readEvidenceRecord',
  'readTransactionSeal',
  'readRecoverySnapshot',
  'commitAtomicMutation',
]);

function assertDurableStatePortContract(port) {
  if (!port || typeof port !== 'object') {
    throw factoryError('DURABLE_PORT_INVALID', 'Durable State Port phải là object.');
  }
  if (utilTypes.isProxy(port)) {
    throw factoryError('DURABLE_PORT_INVALID', 'Proxy Durable State Port bị deny.');
  }
  const missing = REQUIRED_DURABLE_PORT_METHODS.filter((method) => typeof port[method] !== 'function');
  if (missing.length) {
    throw factoryError('DURABLE_PORT_CONTRACT_INCOMPLETE', 'Durable State Port thiếu: ' + missing.join(', ') + '.', { missing });
  }
  if (port.isProductionAdapter === true || port.databaseClient || port.supabase || port.pool) {
    throw factoryError('REAL_DURABLE_ADAPTER_DENIED', 'SF2-B chỉ cho durable foundation/test port, không cho database adapter thật.');
  }
  const capabilities = port.getCapabilities();
  assertPlainJsonValue(capabilities);
  const capabilityFields = [
    'async_methods',
    'atomic_state_checkpoint_receipt_audit_idempotency_evidence_seal',
    'compare_and_swap',
    'consistent_recovery_read',
    'contract_version',
    'production_ready',
    'unique_scope_request',
  ];
  if (Object.keys(capabilities || {}).sort().join('|') !== capabilityFields.sort().join('|')
    || capabilities?.contract_version !== DURABLE_PORT_CONTRACT_VERSION
    || capabilities.atomic_state_checkpoint_receipt_audit_idempotency_evidence_seal !== true
    || capabilities.compare_and_swap !== true
    || capabilities.unique_scope_request !== true
    || capabilities.consistent_recovery_read !== true
    || capabilities.async_methods !== true
    || capabilities.production_ready === true) {
    throw factoryError('DURABLE_PORT_CAPABILITY_DENIED', 'Durable Port thiếu exact async/atomic-seal/CAS/unique/consistent-read capability hoặc tự khai production-ready.');
  }
  return true;
}

module.exports = {
  DURABLE_PORT_CONTRACT_VERSION,
  REQUIRED_DURABLE_PORT_METHODS,
  assertDurableStatePortContract,
};
