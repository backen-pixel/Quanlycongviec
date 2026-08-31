const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { keyAuditHash, validateKeyReference } = require('../../src/softwareFactory/keyManagementContract');
const { stableSerialize } = require('../../src/softwareFactory/canonical');
const { redactSensitiveData } = require('../../src/softwareFactory/evidenceContracts');
const { assertPlainJsonValue } = require('../../src/softwareFactory/plainJson');

const vaultPath = process.env.SF2C1_KMS_VAULT_PATH;
const serviceToken = process.env.SF2C1_KMS_SERVICE_TOKEN;
const requestedPort = Number(process.env.SF2C1_KMS_PORT || 0);
const faultDelayMs = Number(process.env.SF2C1_KMS_FAULT_DELAY_MS || 500);
const masterKey = Buffer.from(process.env.SF2C1_KMS_MASTER_KEY_B64 || '', 'base64');
const metadataMacKey = Buffer.from(crypto.hkdfSync(
  'sha256',
  masterKey,
  Buffer.from('sf2c1-kms-proof-metadata-salt'),
  Buffer.from('sf2c1-kms-proof-metadata-authentication-v1'),
  32,
));
const KEY_ID = 'sf2c1-proof-idempotency';
const PURPOSE = 'SOFTWARE_FACTORY_IDEMPOTENCY';

if (!vaultPath || !serviceToken || serviceToken.length < 32 || masterKey.length !== 32) {
  throw new Error('SF2-C1 KMS proof server requires isolated vault, ephemeral token and 256-bit runtime master key.');
}
const resolvedVaultPath = path.resolve(vaultPath);
const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
if (!resolvedVaultPath.toLowerCase().startsWith(temporaryRoot.toLowerCase())) {
  throw new Error('SF2-C1 KMS proof vault must stay under OS temporary directory.');
}

const db = new DatabaseSync(resolvedVaultPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = FULL');
db.exec('PRAGMA busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS sf2c1_kms_keys (
    key_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    nonce_b64 TEXT NOT NULL,
    tag_b64 TEXT NOT NULL,
    ciphertext_b64 TEXT NOT NULL,
    metadata_mac TEXT NOT NULL,
    PRIMARY KEY (key_id, version)
  );
  CREATE TABLE IF NOT EXISTS sf2c1_kms_audit (
    sequence INTEGER PRIMARY KEY,
    event_json TEXT NOT NULL,
    metadata_mac TEXT NOT NULL
  );
`);

function metadataMac(namespace, value) {
  return 'hmac-sha256:' + crypto.createHmac('sha256', metadataMacKey)
    .update(stableSerialize({ namespace, value }))
    .digest('hex');
}

function assertMetadataMac(namespace, value, supplied) {
  const expected = metadataMac(namespace, value);
  if (typeof supplied !== 'string' || supplied.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw Object.assign(new Error('KMS lifecycle/key metadata authentication failed.'), {
      code: 'SF2C1_KMS_METADATA_TAMPERED',
    });
  }
}

function authenticatedKeyRow(row) {
  if (!row) return null;
  const material = {
    key_id: row.key_id,
    version: Number(row.version),
    status: row.status,
    nonce_b64: row.nonce_b64,
    tag_b64: row.tag_b64,
    ciphertext_b64: row.ciphertext_b64,
  };
  assertMetadataMac('KEY_ROW', material, row.metadata_mac);
  return row;
}

function descriptor(row) {
  row = authenticatedKeyRow(row);
  if (!row) return null;
  return {
    key_id: row.key_id,
    version: Number(row.version),
    algorithm: 'HMAC-SHA-256',
    purpose: PURPOSE,
    status: row.status,
  };
}

function encryptKey(keyId, version, rawKey) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, nonce);
  cipher.setAAD(Buffer.from(keyId + ':' + version));
  const ciphertext = Buffer.concat([cipher.update(rawKey), cipher.final()]);
  return {
    nonce_b64: nonce.toString('base64'),
    tag_b64: cipher.getAuthTag().toString('base64'),
    ciphertext_b64: ciphertext.toString('base64'),
  };
}

function decryptKey(row) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      masterKey,
      Buffer.from(row.nonce_b64, 'base64'),
    );
    decipher.setAAD(Buffer.from(row.key_id + ':' + row.version));
    decipher.setAuthTag(Buffer.from(row.tag_b64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext_b64, 'base64')),
      decipher.final(),
    ]);
  } catch {
    throw Object.assign(new Error('KMS vault key decrypt/authentication failed.'), {
      code: 'SF2C1_KMS_KEY_DECRYPT_FAILED',
    });
  }
}

function auditEvents() {
  return db.prepare('SELECT event_json, metadata_mac FROM sf2c1_kms_audit ORDER BY sequence ASC')
    .all()
    .map((row) => {
      const event = JSON.parse(row.event_json);
      assertMetadataMac('AUDIT_EVENT', event, row.metadata_mac);
      return event;
    });
}

function appendAudit({ event_type: eventType, key_version: keyVersion, previous_version: previousVersion, actor_id: actorId, reason }) {
  const events = auditEvents();
  const previous = events.at(-1) || null;
  const base = {
    audit_schema_version: '1.0.0',
    sequence: events.length + 1,
    timestamp: new Date().toISOString(),
    event_type: eventType,
    key_id: KEY_ID,
    key_version: keyVersion,
    previous_version: previousVersion,
    actor_id: actorId,
    reason,
    previous_hash: previous?.hash || null,
  };
  const event = { ...base, hash: keyAuditHash(base) };
  db.prepare('INSERT INTO sf2c1_kms_audit (sequence, event_json, metadata_mac) VALUES (?, ?, ?)')
    .run(event.sequence, stableSerialize(event), metadataMac('AUDIT_EVENT', event));
}

function initializeVault() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM sf2c1_kms_keys').get();
  if (Number(existing.count) > 0) return;
  db.exec('BEGIN IMMEDIATE');
  const rawKey = crypto.randomBytes(32);
  try {
    const encrypted = encryptKey(KEY_ID, 1, rawKey);
    const keyRow = {
      key_id: KEY_ID,
      version: 1,
      status: 'ACTIVE',
      nonce_b64: encrypted.nonce_b64,
      tag_b64: encrypted.tag_b64,
      ciphertext_b64: encrypted.ciphertext_b64,
    };
    db.prepare(`
      INSERT INTO sf2c1_kms_keys
        (key_id, version, status, nonce_b64, tag_b64, ciphertext_b64, metadata_mac)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      keyRow.key_id,
      keyRow.version,
      keyRow.status,
      keyRow.nonce_b64,
      keyRow.tag_b64,
      keyRow.ciphertext_b64,
      metadataMac('KEY_ROW', keyRow),
    );
    appendAudit({
      event_type: 'KEY_CREATED',
      key_version: 1,
      previous_version: null,
      actor_id: 'sf2c1-kms-bootstrap',
      reason: 'create isolated encrypted proof key',
    });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* no-op */ }
    throw error;
  } finally {
    rawKey.fill(0);
  }
}

initializeVault();
let fault = null;

function findKey(reference) {
  validateKeyReference(reference);
  const row = db.prepare('SELECT * FROM sf2c1_kms_keys WHERE key_id = ? AND version = ?')
    .get(reference.key_id, reference.version);
  if (!row) throw Object.assign(new Error('Unknown proof key reference.'), { code: 'SF2C1_KMS_KEY_NOT_FOUND' });
  return authenticatedKeyRow(row);
}

function updateKeyStatus(row, status) {
  const material = {
    key_id: row.key_id,
    version: Number(row.version),
    status,
    nonce_b64: row.nonce_b64,
    tag_b64: row.tag_b64,
    ciphertext_b64: row.ciphertext_b64,
  };
  db.prepare(`UPDATE sf2c1_kms_keys SET status = ?, metadata_mac = ? WHERE key_id = ? AND version = ?`)
    .run(status, metadataMac('KEY_ROW', material), row.key_id, row.version);
}

function assertLifecycleInput(actorId, reason) {
  if (typeof actorId !== 'string' || !actorId.trim()
    || typeof reason !== 'string' || !reason.trim()) {
    throw Object.assign(new Error('KMS lifecycle actor/reason required.'), {
      code: 'SF2C1_KMS_LIFECYCLE_AUTHORITY_REQUIRED',
    });
  }
  const redacted = redactSensitiveData({ actor_id: actorId, reason });
  if (redacted.findings.length
    || redacted.value.actor_id !== actorId
    || redacted.value.reason !== reason) {
    throw Object.assign(new Error('KMS lifecycle actor/reason cannot contain secret/PII.'), {
      code: 'SF2C1_KMS_LIFECYCLE_SENSITIVE',
    });
  }
}

const operations = {
  getActiveKey() {
    return descriptor(db.prepare(
      `SELECT * FROM sf2c1_kms_keys WHERE key_id = ? AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1`,
    ).get(KEY_ID));
  },
  getKey(options) {
    return descriptor(findKey(options));
  },
  sign({ key_reference: reference, value }) {
    assertPlainJsonValue(value);
    const row = findKey(reference);
    if (row.status !== 'ACTIVE') {
      throw Object.assign(new Error('Proof key is not ACTIVE for sign.'), { code: 'SF2C1_KMS_SIGN_DENIED' });
    }
    const rawKey = decryptKey(row);
    try {
      return 'hmac-sha256:' + crypto.createHmac('sha256', rawKey)
        .update(stableSerialize(value))
        .digest('hex');
    } finally {
      rawKey.fill(0);
    }
  },
  verify({ key_reference: reference, value, digest }) {
    assertPlainJsonValue(value);
    const row = findKey(reference);
    if (row.status === 'REVOKED') return false;
    const rawKey = decryptKey(row);
    try {
      const expected = 'hmac-sha256:' + crypto.createHmac('sha256', rawKey)
        .update(stableSerialize(value))
        .digest('hex');
      if (typeof digest !== 'string' || digest.length !== expected.length) return false;
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
    } finally {
      rawKey.fill(0);
    }
  },
  listAuditEvents() {
    return auditEvents();
  },
  rotateKey({ previous_reference: previousReference, actor_id: actorId, reason }) {
    assertLifecycleInput(actorId, reason);
    const previous = findKey(previousReference);
    if (previous.status !== 'ACTIVE') {
      throw Object.assign(new Error('Rotation reference is stale.'), { code: 'SF2C1_KMS_ROTATION_CONFLICT' });
    }
    const nextVersion = Number(previous.version) + 1;
    const rawKey = crypto.randomBytes(32);
    db.exec('BEGIN IMMEDIATE');
    try {
      const encrypted = encryptKey(KEY_ID, nextVersion, rawKey);
      updateKeyStatus(previous, 'VERIFY_ONLY');
      const nextKeyRow = {
        key_id: KEY_ID,
        version: nextVersion,
        status: 'ACTIVE',
        nonce_b64: encrypted.nonce_b64,
        tag_b64: encrypted.tag_b64,
        ciphertext_b64: encrypted.ciphertext_b64,
      };
      db.prepare(`
        INSERT INTO sf2c1_kms_keys
          (key_id, version, status, nonce_b64, tag_b64, ciphertext_b64, metadata_mac)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextKeyRow.key_id,
        nextKeyRow.version,
        nextKeyRow.status,
        nextKeyRow.nonce_b64,
        nextKeyRow.tag_b64,
        nextKeyRow.ciphertext_b64,
        metadataMac('KEY_ROW', nextKeyRow),
      );
      appendAudit({
        event_type: 'KEY_ROTATED',
        key_version: nextVersion,
        previous_version: Number(previous.version),
        actor_id: actorId,
        reason,
      });
      db.exec('COMMIT');
      return descriptor(db.prepare('SELECT * FROM sf2c1_kms_keys WHERE key_id = ? AND version = ?')
        .get(KEY_ID, nextVersion));
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* no-op */ }
      throw error;
    } finally {
      rawKey.fill(0);
    }
  },
  revokeKey({ key_reference: keyReference, actor_id: actorId, reason }) {
    assertLifecycleInput(actorId, reason);
    const row = findKey(keyReference);
    if (row.status === 'REVOKED') {
      throw Object.assign(new Error('Key already revoked.'), { code: 'SF2C1_KMS_REVOCATION_CONFLICT' });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      updateKeyStatus(row, 'REVOKED');
      appendAudit({
        event_type: 'KEY_REVOKED',
        key_version: Number(row.version),
        previous_version: null,
        actor_id: actorId,
        reason,
      });
      db.exec('COMMIT');
      return descriptor(db.prepare('SELECT * FROM sf2c1_kms_keys WHERE key_id = ? AND version = ?')
        .get(KEY_ID, row.version));
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* no-op */ }
      throw error;
    }
  },
};

function authorized(request) {
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const left = Buffer.from(supplied);
  const right = Buffer.from(serviceToken);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 8 * 1024 * 1024) {
        reject(Object.assign(new Error('request too large'), { code: 'SF2C1_KMS_REQUEST_TOO_LARGE' }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        assertPlainJsonValue(parsed);
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST' || !authorized(request)) {
    send(response, 403, { ok: false, error: { code: 'SF2C1_KMS_AUTH_DENIED', message: 'Denied.' } });
    return;
  }
  try {
    const body = await readBody(request);
    if (request.url === '/control') {
      if (body.action !== 'set_fault' || ![null, 'timeout'].includes(body.value)) {
        throw Object.assign(new Error('invalid control'), { code: 'SF2C1_KMS_CONTROL_DENIED' });
      }
      fault = body.value;
      send(response, 200, { ok: true, result: { fault } });
      return;
    }
    if (request.url !== '/rpc'
      || !Object.prototype.hasOwnProperty.call(operations, body.method)
      || typeof operations[body.method] !== 'function'
      || !Array.isArray(body.args)) {
      throw Object.assign(new Error('unknown RPC method'), { code: 'SF2C1_KMS_METHOD_DENIED' });
    }
    if (fault === 'timeout') {
      fault = null;
      setTimeout(() => {
        if (!response.destroyed) send(response, 200, { ok: true, result: null });
      }, faultDelayMs);
      return;
    }
    const result = operations[body.method](...body.args);
    assertPlainJsonValue(result);
    send(response, 200, { ok: true, result });
  } catch (error) {
    if (response.destroyed) return;
    send(response, 400, {
      ok: false,
      error: {
        code: typeof error?.code === 'string' ? error.code : 'SF2C1_KMS_SERVER_ERROR',
        message: typeof error?.message === 'string' ? error.message : 'KMS proof error.',
      },
    });
  }
});

server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(JSON.stringify({ ready: true, port: address.port }) + '\n');
});

function shutdown() {
  masterKey.fill(0);
  metadataMacKey.fill(0);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
