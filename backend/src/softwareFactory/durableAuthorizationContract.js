const { clone, sha256Digest } = require('./canonical');
const { factoryError } = require('./errors');
const { assertPlainJsonValue } = require('./plainJson');
const { types: utilTypes } = require('node:util');

const AUTHORIZATION_FIELDS = Object.freeze([
  'agent_id',
  'authorization_schema_version',
  'decision_digest',
  'decision_id',
  'issued_at',
  'operation',
  'outcome',
  'policy_version',
  'principal_id',
  'request_id',
  'requirement_id',
  'scope_id',
]);

function assertAuthorizationVerifierContract(verifier) {
  if (!verifier || typeof verifier !== 'object' || typeof verifier.verifyDecision !== 'function') {
    throw factoryError('AUTHORIZATION_VERIFIER_REQUIRED', 'Durable foundation cần trusted Authorization Decision Verifier.');
  }
  if (utilTypes.isProxy(verifier)) {
    throw factoryError('AUTHORIZATION_VERIFIER_SURFACE_DENIED', 'Proxy Authorization Verifier bị deny.');
  }
  const publicNames = new Set();
  let current = verifier;
  while (current && current !== Object.prototype) {
    if (Object.getOwnPropertySymbols(current).length) {
      throw factoryError('AUTHORIZATION_VERIFIER_SURFACE_DENIED', 'Authorization Verifier không được có Symbol surface.');
    }
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor?.get || descriptor?.set || typeof descriptor?.value !== 'function') {
        throw factoryError('AUTHORIZATION_VERIFIER_SURFACE_DENIED', 'Authorization Verifier không được lộ public state/getter.');
      }
      publicNames.add(name);
    }
    current = Object.getPrototypeOf(current);
  }
  if (publicNames.size !== 1 || !publicNames.has('verifyDecision')) {
    throw factoryError('AUTHORIZATION_VERIFIER_SURFACE_DENIED', 'Authorization Verifier chỉ được public verifyDecision; không được tự issue/approve.');
  }
  return true;
}

function authorizationDecisionDigest(decision) {
  const { decision_digest: ignored, ...unsigned } = decision;
  return sha256Digest(unsigned);
}

async function verifyAuthorizationDecision(verifier, decision, binding) {
  assertAuthorizationVerifierContract(verifier);
  decision = Object.freeze(clone(decision));
  binding = Object.freeze(clone(binding));
  assertPlainJsonValue(decision);
  assertPlainJsonValue(binding);
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)
    || Object.keys(decision).sort().join('|') !== [...AUTHORIZATION_FIELDS].sort().join('|')
    || decision.authorization_schema_version !== '1.0.0'
    || decision.outcome !== 'ALLOW'
    || decision.decision_digest !== authorizationDecisionDigest(decision)
    || typeof decision.issued_at !== 'string' || !Number.isFinite(Date.parse(decision.issued_at))) {
    throw factoryError('DURABLE_AUTHORIZATION_REQUIRED', 'Authorization Decision sai exact schema/outcome/digest.');
  }
  for (const field of ['scope_id', 'request_id', 'requirement_id', 'operation', 'agent_id']) {
    if (decision[field] !== binding[field]) {
      throw factoryError('DURABLE_AUTHORIZATION_REQUIRED', 'Authorization Decision không gắn đúng ' + field + '.');
    }
  }
  for (const field of ['decision_id', 'principal_id', 'policy_version']) {
    if (typeof decision[field] !== 'string' || !decision[field].trim()) {
      throw factoryError('DURABLE_AUTHORIZATION_REQUIRED', 'Authorization Decision thiếu ' + field + '.');
    }
  }
  if (await verifier.verifyDecision({ decision, binding }) !== true) {
    throw factoryError('DURABLE_AUTHORIZATION_REQUIRED', 'Authorization Decision không do trusted verifier xác nhận.');
  }
  return clone(decision);
}

module.exports = {
  AUTHORIZATION_FIELDS,
  assertAuthorizationVerifierContract,
  authorizationDecisionDigest,
  verifyAuthorizationDecision,
};
