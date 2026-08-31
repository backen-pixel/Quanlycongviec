const { deepFreeze } = require('./agentRegistry');
const { clone, sha256Digest, stableSerialize } = require('./canonical');
const { factoryError } = require('./errors');
const { assertPlainJsonValue } = require('./plainJson');

const REDACTED = Object.freeze({
  SECRET: '[REDACTED:SECRET]',
  PII_EMAIL: '[REDACTED:PII_EMAIL]',
  PII_PHONE: '[REDACTED:PII_PHONE]',
});

const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key|access[_-]?key|refresh[_-]?key)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){9,15}/;
const SECRET_VALUE_PATTERNS = [
  /Bearer\s+\S+/i,
  /\b(?:password|passwd|secret|token|api[_-]?key|authorization|credential)\s*[:=]\s*\S+/i,
  /sk-[A-Za-z0-9_-]{12,}/,
  /sbp_[A-Za-z0-9_-]{12,}/,
  /[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const SOURCE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CAPTURE_METHODS = new Set([
  'USER_INPUT',
  'REPOSITORY_SNAPSHOT',
  'TOOL_EVIDENCE',
  'TEST_HARNESS',
  'DERIVED',
]);

function classifySensitiveString(value) {
  const normalized = String(value || '').trim();
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'SECRET';
  if (EMAIL_PATTERN.test(normalized)) return 'PII_EMAIL';
  if (PHONE_PATTERN.test(normalized)) return 'PII_PHONE';
  return null;
}

function redactSensitiveData(input) {
  assertPlainJsonValue(input, {
    unsupported_code: 'EVIDENCE_VALUE_UNSUPPORTED',
    cycle_code: 'EVIDENCE_CYCLE_DENIED',
  });
  const findings = [];

  function visit(value, path, key = '') {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      findings.push({ path, classification: 'SECRET' });
      return REDACTED.SECRET;
    }
    if (typeof value === 'string') {
      if ((key === 'digest' || key.endsWith('_digest'))
        && SOURCE_DIGEST_PATTERN.test(value)) return value;
      const classification = classifySensitiveString(value);
      if (classification) {
        findings.push({ path, classification });
        return REDACTED[classification];
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, path + '[' + index + ']'));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((childKey) => [
        (() => {
          if (classifySensitiveString(childKey)) {
            throw factoryError('EVIDENCE_KEY_SENSITIVE', 'Evidence object key chứa secret/PII tại ' + path + '.');
          }
          return childKey;
        })(),
        visit(value[childKey], path + '.' + childKey, childKey),
      ]));
    }
    return value;
  }

  return deepFreeze({
    value: visit(input, '$'),
    findings,
  });
}

function requiredText(value, field, code = 'PROVENANCE_CONTRACT_INCOMPLETE') {
  if (typeof value !== 'string' || !value.trim()) {
    throw factoryError(code, 'Thiếu hoặc sai ' + field + '.');
  }
  return value.trim();
}

function validateProvenance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw factoryError('PROVENANCE_REQUIRED', 'Artifact/evidence bắt buộc có provenance object.');
  }
  const redacted = redactSensitiveData(input);
  const provenance = redacted.value;
  requiredText(provenance.source_type, 'provenance.source_type');
  requiredText(provenance.policy_version, 'provenance.policy_version');
  requiredText(provenance.captured_by, 'provenance.captured_by');
  if (!CAPTURE_METHODS.has(provenance.capture_method)) {
    throw factoryError('PROVENANCE_CAPTURE_METHOD_INVALID', 'provenance.capture_method không hợp lệ.');
  }
  if (!Array.isArray(provenance.source_refs) || provenance.source_refs.length < 1) {
    throw factoryError('PROVENANCE_SOURCE_REQUIRED', 'Provenance cần ít nhất một source_ref.');
  }
  for (const source of provenance.source_refs) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw factoryError('PROVENANCE_SOURCE_INVALID', 'source_ref phải là object.');
    }
    requiredText(source.ref, 'provenance.source_refs.ref');
    if (!SOURCE_DIGEST_PATTERN.test(String(source.digest || ''))) {
      throw factoryError('PROVENANCE_DIGEST_INVALID', 'source_ref digest phải là SHA-256 canonical.');
    }
  }
  if (!Array.isArray(provenance.parent_artifact_ids)) {
    throw factoryError('PROVENANCE_PARENT_INVALID', 'parent_artifact_ids phải là array.');
  }
  const parentIds = provenance.parent_artifact_ids.map((item) => requiredText(item, 'parent_artifact_id'));
  if (new Set(parentIds).size !== parentIds.length) {
    throw factoryError('PROVENANCE_PARENT_DUPLICATE', 'parent_artifact_ids không được trùng.');
  }
  return deepFreeze({
    provenance: clone(provenance),
    redactions: clone(redacted.findings),
    provenance_digest: sha256Digest(provenance),
  });
}

function createEvidenceEnvelope({ evidence_type: evidenceType, subject, provenance: provenanceInput, content }) {
  requiredText(evidenceType, 'evidence_type', 'EVIDENCE_TYPE_REQUIRED');
  requiredText(subject, 'subject', 'EVIDENCE_SUBJECT_REQUIRED');
  const provenanceResult = validateProvenance(provenanceInput);
  const contentResult = redactSensitiveData(content);
  const canonical = {
    evidence_schema_version: '1.0.0',
    evidence_type: evidenceType.trim(),
    subject: subject.trim(),
    provenance: provenanceResult.provenance,
    content: clone(contentResult.value),
    redactions: [...provenanceResult.redactions, ...contentResult.findings],
  };
  return deepFreeze({
    ...canonical,
    content_digest: sha256Digest(canonical.content),
    provenance_digest: provenanceResult.provenance_digest,
    evidence_digest: sha256Digest(canonical),
  });
}

function verifyEvidenceEnvelope(envelope) {
  assertPlainJsonValue(envelope, {
    unsupported_code: 'EVIDENCE_VALUE_UNSUPPORTED',
    cycle_code: 'EVIDENCE_CYCLE_DENIED',
  });
  if (!envelope || typeof envelope !== 'object') {
    throw factoryError('EVIDENCE_ENVELOPE_INVALID', 'Evidence Envelope không hợp lệ.');
  }
  const expectedFields = [
    'content',
    'content_digest',
    'evidence_digest',
    'evidence_schema_version',
    'evidence_type',
    'provenance',
    'provenance_digest',
    'redactions',
    'subject',
  ];
  if (Object.keys(envelope).sort().join('|') !== expectedFields.join('|')) {
    throw factoryError('EVIDENCE_ENVELOPE_INVALID', 'Evidence Envelope có field ngoài/thiếu canonical contract.');
  }
  requiredText(envelope.evidence_type, 'evidence_type', 'EVIDENCE_TYPE_REQUIRED');
  requiredText(envelope.subject, 'subject', 'EVIDENCE_SUBJECT_REQUIRED');
  if (envelope.evidence_schema_version !== '1.0.0' || !Array.isArray(envelope.redactions)) {
    throw factoryError('EVIDENCE_ENVELOPE_INVALID', 'Evidence Envelope sai schema/redaction contract.');
  }
  const provenanceResult = validateProvenance(envelope.provenance);
  const contentResult = redactSensitiveData(envelope.content);
  if (stableSerialize(provenanceResult.provenance) !== stableSerialize(envelope.provenance)
    || stableSerialize(contentResult.value) !== stableSerialize(envelope.content)) {
    throw factoryError('EVIDENCE_REDACTION_INVALID', 'Evidence Envelope còn chứa secret/PII chưa redaction.');
  }
  for (const finding of envelope.redactions) {
    if (!finding || typeof finding.path !== 'string'
      || !['SECRET', 'PII_EMAIL', 'PII_PHONE'].includes(finding.classification)) {
      throw factoryError('EVIDENCE_REDACTION_INVALID', 'Evidence redaction finding không hợp lệ.');
    }
  }
  const canonical = {
    evidence_schema_version: envelope.evidence_schema_version,
    evidence_type: envelope.evidence_type,
    subject: envelope.subject,
    provenance: clone(envelope.provenance),
    content: clone(envelope.content),
    redactions: clone(envelope.redactions),
  };
  if (sha256Digest(canonical.content) !== envelope.content_digest
    || provenanceResult.provenance_digest !== envelope.provenance_digest
    || sha256Digest(canonical) !== envelope.evidence_digest) {
    throw factoryError('EVIDENCE_TAMPERED', 'Evidence Envelope digest/redaction không khớp.');
  }
  return true;
}

module.exports = {
  CAPTURE_METHODS,
  REDACTED,
  SOURCE_DIGEST_PATTERN,
  createEvidenceEnvelope,
  redactSensitiveData,
  validateProvenance,
  verifyEvidenceEnvelope,
};
