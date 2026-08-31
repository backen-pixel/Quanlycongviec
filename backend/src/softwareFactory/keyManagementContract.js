const { clone, sha256Digest } = require('./canonical');
const { factoryError } = require('./errors');
const { assertPlainJsonValue } = require('./plainJson');
const { redactSensitiveData } = require('./evidenceContracts');
const { types: utilTypes } = require('node:util');

const HMAC_ALGORITHM = 'HMAC-SHA-256';
const IDEMPOTENCY_KEY_PURPOSE = 'SOFTWARE_FACTORY_IDEMPOTENCY';
const KEY_STATUSES = new Set(['ACTIVE', 'VERIFY_ONLY', 'REVOKED']);
const REQUIRED_KEY_PROVIDER_METHODS = Object.freeze([
  'getActiveKey',
  'getKey',
  'sign',
  'verify',
  'listAuditEvents',
  'rotateKey',
  'revokeKey',
]);
const KEY_DESCRIPTOR_FIELDS = Object.freeze(['algorithm', 'key_id', 'purpose', 'status', 'version']);
const KEY_AUDIT_FIELDS = Object.freeze([
  'actor_id',
  'audit_schema_version',
  'event_type',
  'hash',
  'key_id',
  'key_version',
  'previous_hash',
  'previous_version',
  'reason',
  'sequence',
  'timestamp',
]);
const KEY_AUDIT_TYPES = new Set(['KEY_CREATED', 'KEY_ROTATED', 'KEY_REVOKED']);

function exactFields(value, fields) {
  return Object.keys(value).sort().join('|') === [...fields].sort().join('|');
}

function assertNonSensitiveString(value, field, code = 'KEY_AUDIT_SENSITIVE') {
  const result = redactSensitiveData({ value });
  if (result.findings.length || result.value.value !== value) {
    throw factoryError(code, field + ' không được chứa secret/PII.');
  }
}

function publicSurface(provider) {
  const methods = new Set();
  let current = provider;
  while (current && current !== Object.prototype) {
    if (Object.getOwnPropertySymbols(current).length) {
      throw factoryError('KEY_PROVIDER_PUBLIC_STATE_DENIED', 'Key Provider không được có public Symbol surface.');
    }
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor?.get || descriptor?.set) {
        throw factoryError('KEY_PROVIDER_PUBLIC_STATE_DENIED', 'Key Provider không được có public getter/setter: ' + name + '.');
      }
      if (typeof descriptor?.value === 'function') methods.add(name);
      else if (current === provider) {
        throw factoryError('KEY_PROVIDER_PUBLIC_STATE_DENIED', 'Key Provider phải giữ state/key material trong private field/closure; public property bị deny: ' + name + '.');
      }
    }
    current = Object.getPrototypeOf(current);
  }
  return methods;
}

function assertKeyProviderContract(provider) {
  if (!provider || typeof provider !== 'object') {
    throw factoryError('KEY_PROVIDER_INVALID', 'HMAC Key Provider phải là object.');
  }
  if (utilTypes.isProxy(provider)) {
    throw factoryError('KEY_PROVIDER_PROXY_DENIED', 'Proxy Key Provider bị deny vì có thể che public/export surface.');
  }
  const methods = publicSurface(provider);
  const missing = REQUIRED_KEY_PROVIDER_METHODS.filter((method) => !methods.has(method));
  if (missing.length) {
    throw factoryError('KEY_PROVIDER_CONTRACT_INCOMPLETE', 'Key Provider thiếu: ' + missing.join(', ') + '.', { missing });
  }
  const extra = [...methods].filter((method) => !REQUIRED_KEY_PROVIDER_METHODS.includes(method));
  if (extra.length) {
    throw factoryError('KEY_PROVIDER_EXTRA_SURFACE_DENIED', 'Key Provider có public method ngoài exact contract: ' + extra.join(', ') + '.', { extra });
  }
  return true;
}

function validateKeyDescriptor(descriptor, { allowed_statuses: allowedStatuses = [...KEY_STATUSES] } = {}) {
  assertPlainJsonValue(descriptor);
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
    || !exactFields(descriptor, KEY_DESCRIPTOR_FIELDS)) {
    throw factoryError('HMAC_KEY_DESCRIPTOR_INVALID', 'HMAC key descriptor phải là exact plain object, không được có metadata/material ngoài contract.');
  }
  if (typeof descriptor.key_id !== 'string' || !descriptor.key_id.trim()
    || !Number.isInteger(descriptor.version) || descriptor.version < 1
    || descriptor.algorithm !== HMAC_ALGORITHM
    || descriptor.purpose !== IDEMPOTENCY_KEY_PURPOSE
    || !KEY_STATUSES.has(descriptor.status)
    || !allowedStatuses.includes(descriptor.status)) {
    throw factoryError('HMAC_KEY_DESCRIPTOR_INVALID', 'HMAC key ID/version/algorithm/purpose/status không hợp lệ.');
  }
  assertNonSensitiveString(descriptor.key_id, 'key_id', 'HMAC_KEY_SENSITIVE');
  return true;
}

function createKeyReference(descriptor) {
  validateKeyDescriptor(descriptor);
  return Object.freeze({
    key_id: descriptor.key_id,
    version: descriptor.version,
    algorithm: descriptor.algorithm,
    purpose: descriptor.purpose,
  });
}

function validateKeyReference(reference) {
  assertPlainJsonValue(reference);
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)
    || Object.keys(reference).length !== 4
    || typeof reference.key_id !== 'string' || !reference.key_id.trim()
    || !Number.isInteger(reference.version) || reference.version < 1
    || reference.algorithm !== HMAC_ALGORITHM
    || reference.purpose !== IDEMPOTENCY_KEY_PURPOSE) {
    throw factoryError('HMAC_KEY_REFERENCE_INVALID', 'HMAC key reference sai key ID/version/algorithm/purpose hoặc có field ngoài contract.');
  }
  assertNonSensitiveString(reference.key_id, 'key_reference.key_id', 'HMAC_KEY_SENSITIVE');
  return true;
}

function keyAuditHash(event) {
  const { hash: ignored, ...unsigned } = event;
  return sha256Digest(unsigned);
}

function validateKeyAuditEvents(events) {
  assertPlainJsonValue(events);
  if (!Array.isArray(events) || events.length < 1) {
    throw factoryError('KEY_AUDIT_REQUIRED', 'Key Provider cần ít nhất một lifecycle audit event.');
  }
  let previousHash = null;
  events.forEach((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)
      || !exactFields(event, KEY_AUDIT_FIELDS)
      || event.audit_schema_version !== '1.0.0'
      || event.sequence !== index + 1
      || typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp))
      || !KEY_AUDIT_TYPES.has(event.event_type)
      || typeof event.key_id !== 'string' || !event.key_id.trim()
      || !Number.isInteger(event.key_version) || event.key_version < 1
      || typeof event.actor_id !== 'string' || !event.actor_id.trim()
      || typeof event.reason !== 'string' || !event.reason.trim()
      || event.previous_hash !== previousHash
      || event.hash !== keyAuditHash(event)) {
      throw factoryError('KEY_AUDIT_TAMPERED', 'Key lifecycle audit schema/hash chain không hợp lệ.', { sequence: index + 1 });
    }
    if (event.event_type === 'KEY_ROTATED') {
      if (!Number.isInteger(event.previous_version) || event.previous_version < 1
        || event.previous_version >= event.key_version) {
        throw factoryError('KEY_AUDIT_TAMPERED', 'KEY_ROTATED cần previous_version hợp lệ.');
      }
    } else if (event.previous_version !== null) {
      throw factoryError('KEY_AUDIT_TAMPERED', 'KEY_CREATED/KEY_REVOKED phải có previous_version null.');
    }
    assertNonSensitiveString(event.key_id, 'key audit key_id');
    assertNonSensitiveString(event.actor_id, 'key audit actor_id');
    assertNonSensitiveString(event.reason, 'key audit reason');
    previousHash = event.hash;
  });
  return true;
}

async function getVerifiedKeyAuditEvents(provider) {
  assertKeyProviderContract(provider);
  const events = await provider.listAuditEvents({ purpose: IDEMPOTENCY_KEY_PURPOSE });
  validateKeyAuditEvents(events);
  return clone(events);
}

function assertDescriptorHasLifecycleEvent(descriptor, events) {
  const lifecycle = events.filter((event) => (
    event.key_id === descriptor.key_id && event.key_version === descriptor.version
  ));
  if (!lifecycle.some((event) => ['KEY_CREATED', 'KEY_ROTATED'].includes(event.event_type))) {
    throw factoryError('KEY_LIFECYCLE_AUDIT_MISSING', 'Key descriptor không có create/rotate audit event.');
  }
  const revoked = lifecycle.some((event) => event.event_type === 'KEY_REVOKED');
  if ((descriptor.status === 'REVOKED') !== revoked) {
    throw factoryError('KEY_LIFECYCLE_STATUS_MISMATCH', 'Key descriptor status không khớp revocation audit.');
  }
}

function canonicalPrehash(value) {
  assertPlainJsonValue(value);
  return Object.freeze({
    prehash_schema_version: '1.0.0',
    algorithm: 'SHA-256',
    canonical_sha256: sha256Digest(value),
  });
}

async function resolveActiveKey(provider) {
  assertKeyProviderContract(provider);
  const descriptor = await provider.getActiveKey({ purpose: IDEMPOTENCY_KEY_PURPOSE });
  validateKeyDescriptor(descriptor, { allowed_statuses: ['ACTIVE'] });
  const events = await getVerifiedKeyAuditEvents(provider);
  assertDescriptorHasLifecycleEvent(descriptor, events);
  return Object.freeze({ descriptor: clone(descriptor), reference: createKeyReference(descriptor) });
}

async function signCanonical(provider, keyReference, value) {
  assertKeyProviderContract(provider);
  validateKeyReference(keyReference);
  const prehash = canonicalPrehash(value);
  const descriptor = await provider.getKey({ ...keyReference, purpose: IDEMPOTENCY_KEY_PURPOSE });
  validateKeyDescriptor(descriptor, { allowed_statuses: ['ACTIVE'] });
  const events = await getVerifiedKeyAuditEvents(provider);
  assertDescriptorHasLifecycleEvent(descriptor, events);
  if (descriptor.key_id !== keyReference.key_id || descriptor.version !== keyReference.version) {
    throw factoryError('HMAC_KEY_REFERENCE_MISMATCH', 'Key Provider trả descriptor không khớp key reference.');
  }
  const digest = await provider.sign({
    key_reference: keyReference,
    purpose: IDEMPOTENCY_KEY_PURPOSE,
    value: prehash,
  });
  if (!/^hmac-sha256:[a-f0-9]{64}$/.test(String(digest || ''))) {
    throw factoryError('HMAC_SIGNATURE_INVALID', 'Key Provider trả HMAC digest không hợp lệ.');
  }
  return digest;
}

async function verifyCanonical(provider, keyReference, value, digest) {
  assertKeyProviderContract(provider);
  validateKeyReference(keyReference);
  const prehash = canonicalPrehash(value);
  if (!/^hmac-sha256:[a-f0-9]{64}$/.test(String(digest || ''))) {
    throw factoryError('HMAC_SIGNATURE_INVALID', 'HMAC digest cần verify không hợp lệ.');
  }
  const descriptor = await provider.getKey({ ...keyReference, purpose: IDEMPOTENCY_KEY_PURPOSE });
  validateKeyDescriptor(descriptor);
  const events = await getVerifiedKeyAuditEvents(provider);
  assertDescriptorHasLifecycleEvent(descriptor, events);
  if (descriptor.status === 'REVOKED') {
    throw factoryError('HMAC_KEY_REVOKED', 'HMAC key version đã bị revoke; replay/recovery fail closed.');
  }
  if (descriptor.key_id !== keyReference.key_id || descriptor.version !== keyReference.version) {
    throw factoryError('HMAC_KEY_REFERENCE_MISMATCH', 'Key reference không khớp descriptor.');
  }
  if (await provider.verify({
    key_reference: keyReference,
    purpose: IDEMPOTENCY_KEY_PURPOSE,
    value: prehash,
    digest,
  }) !== true) {
    throw factoryError('HMAC_VERIFICATION_FAILED', 'Request/transaction HMAC không khớp canonical payload.');
  }
  return true;
}

async function rotateActiveKey(provider, { actor_id: actorId, reason } = {}) {
  const previous = await resolveActiveKey(provider);
  if (typeof actorId !== 'string' || !actorId.trim() || typeof reason !== 'string' || !reason.trim()) {
    throw factoryError('KEY_LIFECYCLE_AUTHORITY_REQUIRED', 'Rotation cần actor_id và reason.');
  }
  assertNonSensitiveString(actorId.trim(), 'rotation actor_id');
  assertNonSensitiveString(reason.trim(), 'rotation reason');
  const descriptor = await provider.rotateKey({
    previous_reference: previous.reference,
    actor_id: actorId.trim(),
    reason: reason.trim(),
  });
  validateKeyDescriptor(descriptor, { allowed_statuses: ['ACTIVE'] });
  const oldDescriptor = await provider.getKey(previous.reference);
  validateKeyDescriptor(oldDescriptor, { allowed_statuses: ['VERIFY_ONLY'] });
  if (descriptor.key_id !== previous.reference.key_id || descriptor.version <= previous.reference.version) {
    throw factoryError('KEY_ROTATION_INVALID', 'Rotation phải tăng version trên cùng key_id.');
  }
  const events = await getVerifiedKeyAuditEvents(provider);
  const last = events.at(-1);
  if (last.event_type !== 'KEY_ROTATED' || last.key_id !== descriptor.key_id
    || last.key_version !== descriptor.version || last.previous_version !== previous.reference.version
    || last.actor_id !== actorId.trim() || last.reason !== reason.trim()) {
    throw factoryError('KEY_ROTATION_AUDIT_MISSING', 'Rotation không có audit event gắn đúng actor/reason/version.');
  }
  return Object.freeze({ previous_reference: previous.reference, descriptor: clone(descriptor) });
}

async function revokeKeyVersion(provider, keyReference, { actor_id: actorId, reason } = {}) {
  assertKeyProviderContract(provider);
  validateKeyReference(keyReference);
  if (typeof actorId !== 'string' || !actorId.trim() || typeof reason !== 'string' || !reason.trim()) {
    throw factoryError('KEY_LIFECYCLE_AUTHORITY_REQUIRED', 'Revocation cần actor_id và reason.');
  }
  assertNonSensitiveString(actorId.trim(), 'revocation actor_id');
  assertNonSensitiveString(reason.trim(), 'revocation reason');
  const descriptor = await provider.revokeKey({
    key_reference: keyReference,
    actor_id: actorId.trim(),
    reason: reason.trim(),
  });
  validateKeyDescriptor(descriptor, { allowed_statuses: ['REVOKED'] });
  const events = await getVerifiedKeyAuditEvents(provider);
  const last = events.at(-1);
  if (last.event_type !== 'KEY_REVOKED' || last.key_id !== keyReference.key_id
    || last.key_version !== keyReference.version || last.actor_id !== actorId.trim()
    || last.reason !== reason.trim()) {
    throw factoryError('KEY_REVOCATION_AUDIT_MISSING', 'Revocation không có audit event gắn đúng actor/reason/version.');
  }
  return clone(descriptor);
}

module.exports = {
  HMAC_ALGORITHM,
  IDEMPOTENCY_KEY_PURPOSE,
  KEY_STATUSES,
  REQUIRED_KEY_PROVIDER_METHODS,
  assertKeyProviderContract,
  canonicalPrehash,
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
};
