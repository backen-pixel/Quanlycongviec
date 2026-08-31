const { DatabaseSync } = require('node:sqlite');
const os = require('node:os');
const path = require('node:path');
const { sha256Digest, stableSerialize } = require('../canonical');
const { factoryError } = require('../errors');
const { assertPlainJsonValue } = require('../plainJson');

const BUNDLE_FIELDS = Object.freeze([
  'audit_event',
  'bundle_digest',
  'checkpoint',
  'evidence_record',
  'expected_revision',
  'idempotency_record',
  'next_revision',
  'receipt',
  'request_id',
  'scope_id',
  'state_record',
  'transaction_id',
  'transaction_schema_version',
  'transaction_seal',
]);

function parseRecord(row) {
  if (!row) return null;
  const record = JSON.parse(row.record_json);
  assertPlainJsonValue(record);
  return record;
}

function sameFields(value, fields) {
  return Object.keys(value || {}).sort().join('|') === [...fields].sort().join('|');
}

function assertBundle(bundle) {
  assertPlainJsonValue(bundle);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
    || !sameFields(bundle, BUNDLE_FIELDS)
    || bundle.transaction_schema_version !== '1.0.0'
    || !Number.isInteger(bundle.expected_revision) || bundle.expected_revision < 0
    || bundle.next_revision !== bundle.expected_revision + 1) {
    throw factoryError('SF2C1_STORE_BUNDLE_INVALID', 'SQLite proof store từ chối bundle sai exact contract/revision.');
  }
  const { bundle_digest: ignored, ...unsigned } = bundle;
  if (bundle.bundle_digest !== sha256Digest(unsigned)) {
    throw factoryError('SF2C1_STORE_BUNDLE_TAMPERED', 'SQLite proof store từ chối bundle digest không hợp lệ.');
  }
  const scopedRecords = [
    bundle.state_record,
    bundle.checkpoint,
    bundle.receipt,
    bundle.audit_event,
    bundle.idempotency_record,
    bundle.evidence_record,
    bundle.transaction_seal,
  ];
  if (scopedRecords.some((record) => record.scope_id !== bundle.scope_id)) {
    throw factoryError('SF2C1_STORE_BUNDLE_BINDING_INVALID', 'Persisted record không cùng scope.');
  }
  const transactionRecords = scopedRecords.filter((record) => record !== bundle.checkpoint);
  if (transactionRecords.some((record) => record.transaction_id !== bundle.transaction_id)) {
    throw factoryError('SF2C1_STORE_BUNDLE_BINDING_INVALID', 'Persisted record không cùng transaction.');
  }
  if (bundle.receipt.request_id !== bundle.request_id
    || bundle.audit_event.request_id !== bundle.request_id
    || bundle.idempotency_record.request_id !== bundle.request_id
    || bundle.evidence_record.request_id !== bundle.request_id
    || bundle.transaction_seal.request_id !== bundle.request_id
    || bundle.state_record.revision !== bundle.next_revision
    || bundle.checkpoint.revision !== bundle.next_revision
    || bundle.receipt.committed_revision !== bundle.next_revision
    || bundle.audit_event.revision !== bundle.next_revision
    || bundle.idempotency_record.committed_revision !== bundle.next_revision
    || bundle.evidence_record.revision !== bundle.next_revision
    || bundle.transaction_seal.revision !== bundle.next_revision) {
    throw factoryError('SF2C1_STORE_BUNDLE_BINDING_INVALID', 'Persisted record không cùng request/revision.');
  }
  return true;
}

class SqliteDurableStoreProofEngine {
  #db;

  constructor({ database_path: databasePath } = {}) {
    if (typeof databasePath !== 'string' || !databasePath.trim()) {
      throw factoryError('SF2C1_STORE_PATH_REQUIRED', 'SQLite proof store cần isolated database path.');
    }
    const resolvedPath = path.resolve(databasePath);
    const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolvedPath.toLowerCase().startsWith(temporaryRoot.toLowerCase())) {
      throw factoryError('SF2C1_STORE_PATH_DENIED', 'SQLite proof store chỉ được tạo dưới OS temporary directory.');
    }
    this.#db = new DatabaseSync(resolvedPath);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA synchronous = FULL');
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec('PRAGMA busy_timeout = 5000');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS sf2c1_state_records (
        scope_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        transaction_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, revision),
        UNIQUE (scope_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS sf2c1_checkpoints (
        scope_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        transaction_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, revision),
        UNIQUE (scope_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS sf2c1_receipts (
        scope_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, request_id),
        UNIQUE (scope_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS sf2c1_idempotency_records (
        scope_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, request_id),
        UNIQUE (scope_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS sf2c1_evidence_records (
        scope_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, request_id),
        UNIQUE (scope_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS sf2c1_transaction_seals (
        scope_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, request_id),
        UNIQUE (scope_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS sf2c1_audit_events (
        scope_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        request_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (scope_id, sequence),
        UNIQUE (scope_id, revision),
        UNIQUE (scope_id, request_id),
        UNIQUE (scope_id, transaction_id)
      );
    `);
  }

  close() {
    this.#db.close();
  }

  #one(sql, ...params) {
    return this.#db.prepare(sql).get(...params) || null;
  }

  #all(sql, ...params) {
    return this.#db.prepare(sql).all(...params);
  }

  #currentRevision(scopeId) {
    return Number(this.#one(
      'SELECT COALESCE(MAX(revision), 0) AS revision FROM sf2c1_state_records WHERE scope_id = ?',
      scopeId,
    )?.revision || 0);
  }

  readScopeState(scopeId) {
    return parseRecord(this.#one(
      'SELECT record_json FROM sf2c1_state_records WHERE scope_id = ? ORDER BY revision DESC LIMIT 1',
      scopeId,
    ));
  }

  readCheckpoint(scopeId, revision = null) {
    return parseRecord(revision === null
      ? this.#one('SELECT record_json FROM sf2c1_checkpoints WHERE scope_id = ? ORDER BY revision DESC LIMIT 1', scopeId)
      : this.#one('SELECT record_json FROM sf2c1_checkpoints WHERE scope_id = ? AND revision = ?', scopeId, revision));
  }

  readReceipt(scopeId, requestId) {
    return parseRecord(this.#one(
      'SELECT record_json FROM sf2c1_receipts WHERE scope_id = ? AND request_id = ?',
      scopeId,
      requestId,
    ));
  }

  readAuditEntries(scopeId) {
    return this.#all(
      'SELECT record_json FROM sf2c1_audit_events WHERE scope_id = ? ORDER BY sequence ASC',
      scopeId,
    ).map(parseRecord);
  }

  readIdempotencyRecord(scopeId, requestId) {
    return parseRecord(this.#one(
      'SELECT record_json FROM sf2c1_idempotency_records WHERE scope_id = ? AND request_id = ?',
      scopeId,
      requestId,
    ));
  }

  readEvidenceRecord(scopeId, requestId) {
    return parseRecord(this.#one(
      'SELECT record_json FROM sf2c1_evidence_records WHERE scope_id = ? AND request_id = ?',
      scopeId,
      requestId,
    ));
  }

  readTransactionSeal(scopeId, requestId) {
    return parseRecord(this.#one(
      'SELECT record_json FROM sf2c1_transaction_seals WHERE scope_id = ? AND request_id = ?',
      scopeId,
      requestId,
    ));
  }

  readRecoverySnapshot({ scope_id: scopeId, request_id: requestId }) {
    this.#db.exec('BEGIN');
    try {
      const auditEntries = this.readAuditEntries(scopeId);
      const currentAudit = auditEntries.at(-1) || null;
      const requestedAudit = auditEntries.find((event) => event.request_id === requestId) || null;
      const receipt = this.readReceipt(scopeId, requestId);
      const requestedRevision = receipt?.committed_revision || requestedAudit?.revision || null;
      const stateRecord = this.readScopeState(scopeId);
      const checkpoint = this.readCheckpoint(scopeId);
      const transactionState = requestedRevision === null ? null : parseRecord(this.#one(
        'SELECT record_json FROM sf2c1_state_records WHERE scope_id = ? AND revision = ?',
        scopeId,
        requestedRevision,
      ));
      const transactionCheckpoint = requestedRevision === null
        ? null
        : this.readCheckpoint(scopeId, requestedRevision);
      const historyRecordSets = auditEntries.map((event) => ({
        state_record: parseRecord(this.#one(
          'SELECT record_json FROM sf2c1_state_records WHERE scope_id = ? AND revision = ?',
          scopeId,
          event.revision,
        )),
        checkpoint: this.readCheckpoint(scopeId, event.revision),
        receipt: this.readReceipt(scopeId, event.request_id),
        idempotency_record: this.readIdempotencyRecord(scopeId, event.request_id),
        evidence_record: this.readEvidenceRecord(scopeId, event.request_id),
        transaction_seal: this.readTransactionSeal(scopeId, event.request_id),
      }));
      const snapshot = {
        scope_id: scopeId,
        request_id: requestId,
        state_record: stateRecord,
        checkpoint,
        transaction_state_record: transactionState,
        transaction_checkpoint: transactionCheckpoint,
        receipt,
        idempotency_record: this.readIdempotencyRecord(scopeId, requestId),
        evidence_record: this.readEvidenceRecord(scopeId, requestId),
        transaction_seal: this.readTransactionSeal(scopeId, requestId),
        current_transaction_seal: currentAudit
          ? this.readTransactionSeal(scopeId, currentAudit.request_id)
          : null,
        current_receipt: currentAudit ? this.readReceipt(scopeId, currentAudit.request_id) : null,
        current_idempotency_record: currentAudit
          ? this.readIdempotencyRecord(scopeId, currentAudit.request_id)
          : null,
        current_evidence_record: currentAudit
          ? this.readEvidenceRecord(scopeId, currentAudit.request_id)
          : null,
        history_record_sets: historyRecordSets,
        audit_entries: auditEntries,
      };
      assertPlainJsonValue(snapshot);
      this.#db.exec('COMMIT');
      return snapshot;
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch { /* no-op */ }
      throw error;
    }
  }

  commitAtomicMutation(bundle) {
    assertBundle(bundle);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const currentRevision = this.#currentRevision(bundle.scope_id);
      const duplicate = this.#one(
        `SELECT 1 AS found FROM sf2c1_receipts WHERE scope_id = ? AND request_id = ?
         UNION ALL
         SELECT 1 AS found FROM sf2c1_idempotency_records WHERE scope_id = ? AND request_id = ?
         LIMIT 1`,
        bundle.scope_id,
        bundle.request_id,
        bundle.scope_id,
        bundle.request_id,
      );
      if (currentRevision !== bundle.expected_revision || duplicate) {
        this.#db.exec('ROLLBACK');
        return { status: 'CONFLICT', current_revision: currentRevision };
      }
      const lastAudit = this.#one(
        'SELECT sequence, record_json FROM sf2c1_audit_events WHERE scope_id = ? ORDER BY sequence DESC LIMIT 1',
        bundle.scope_id,
      );
      const lastEvent = parseRecord(lastAudit);
      if (bundle.audit_event.sequence !== Number(lastAudit?.sequence || 0) + 1
        || bundle.audit_event.previous_hash !== (lastEvent?.hash || null)) {
        throw factoryError('SF2C1_STORE_AUDIT_CONFLICT', 'Audit sequence/hash không khớp transaction tip.');
      }

      const insertRevisionRecord = (table, record) => this.#db.prepare(
        `INSERT INTO ${table} (scope_id, revision, transaction_id, record_json) VALUES (?, ?, ?, ?)`,
      ).run(bundle.scope_id, bundle.next_revision, bundle.transaction_id, stableSerialize(record));
      const insertRequestRecord = (table, record) => this.#db.prepare(
        `INSERT INTO ${table} (scope_id, request_id, transaction_id, revision, record_json) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        bundle.scope_id,
        bundle.request_id,
        bundle.transaction_id,
        bundle.next_revision,
        stableSerialize(record),
      );

      insertRevisionRecord('sf2c1_state_records', bundle.state_record);
      insertRevisionRecord('sf2c1_checkpoints', bundle.checkpoint);
      insertRequestRecord('sf2c1_receipts', bundle.receipt);
      insertRequestRecord('sf2c1_idempotency_records', bundle.idempotency_record);
      insertRequestRecord('sf2c1_evidence_records', bundle.evidence_record);
      insertRequestRecord('sf2c1_transaction_seals', bundle.transaction_seal);
      this.#db.prepare(
        `INSERT INTO sf2c1_audit_events
          (scope_id, sequence, revision, request_id, transaction_id, record_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        bundle.scope_id,
        bundle.audit_event.sequence,
        bundle.next_revision,
        bundle.request_id,
        bundle.transaction_id,
        stableSerialize(bundle.audit_event),
      );
      this.#db.exec('COMMIT');
      return { status: 'COMMITTED', current_revision: bundle.next_revision };
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch { /* no-op */ }
      if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
        return { status: 'CONFLICT', current_revision: this.#currentRevision(bundle.scope_id) };
      }
      throw error;
    }
  }

  countCommittedOutcomes(scopeId) {
    return Number(this.#one(
      'SELECT COUNT(*) AS count FROM sf2c1_receipts WHERE scope_id = ?',
      scopeId,
    )?.count || 0);
  }
}

module.exports = {
  SqliteDurableStoreProofEngine,
  assertBundle,
};
