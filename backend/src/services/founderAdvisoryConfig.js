/**
 * Founder-local provisional advisory configuration.
 *
 * This store is platform-owned and file-backed. It never writes canonical
 * Domain/System-of-Record data. Values can only drive visual advisories and
 * carry an immutable non-canonical/no-operational-effect contract.
 */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { isFounderLocalReadOnly } = require('../config/runtimeProfile');

const SCHEMA_VERSION = '1.0.0';
const CONFIG_CONTRACT_VERSION = 'founder_advisory_configuration_v1';
const MAX_VERSIONS_PER_SCOPE = 50;
const MAX_IDEMPOTENCY_RECEIPTS = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CONFIG = Object.freeze({
  capacity_load_warning_per_active_person: null,
  overdue_work_warning_count: null,
  overdue_project_warning_count: null,
  delayed_procurement_warning_count: null,
});

class FounderAdvisoryConfigError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'FounderAdvisoryConfigError';
    this.status = status;
    this.code = code;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function defaultBaseDir() {
  const configured = String(process.env.FOUNDER_LOCAL_CONFIG_DIR || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, '../../.runtime/founder-local-v1');
}

function assertFounderLocalStorageBoundary(baseDir) {
  if (!isFounderLocalReadOnly(process.env)) return;
  const runtimeRoot = path.resolve(__dirname, '../../.runtime');
  const relative = path.relative(runtimeRoot, path.resolve(baseDir));
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new FounderAdvisoryConfigError(
    503,
    'FOUNDER_CONFIG_STORAGE_BOUNDARY_DENIED',
    'Kho cấu hình Founder-local phải nằm trong backend/.runtime của clean worktree.',
  );
}

function scopeIdentity(scope) {
  const ecosystemId = String(scope?.ecosystem_id || '').trim();
  const companyId = scope?.company_id == null ? null : String(scope.company_id).trim();
  if (!UUID_RE.test(ecosystemId) || (companyId && !UUID_RE.test(companyId))) {
    throw new FounderAdvisoryConfigError(400, 'FOUNDER_CONFIG_SCOPE_INVALID', 'Phạm vi cấu hình advisory không hợp lệ.');
  }
  return {
    ecosystem_id: ecosystemId,
    company_id: companyId,
    level: companyId ? 'company' : 'ecosystem',
  };
}

function scopeKey(scope) {
  const identity = scopeIdentity(scope);
  return digest(`${identity.ecosystem_id}|${identity.company_id || 'all'}`).slice(0, 32);
}

function nullableNumber(value, { key, min, max, integer = false }) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new FounderAdvisoryConfigError(
      422,
      'FOUNDER_CONFIG_VALUE_INVALID',
      `Giá trị advisory “${key}” không hợp lệ.`,
    );
  }
  return parsed;
}

function validateConfiguration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FounderAdvisoryConfigError(422, 'FOUNDER_CONFIG_BODY_INVALID', 'Thiếu cấu hình advisory hợp lệ.');
  }
  const allowed = new Set(Object.keys(DEFAULT_CONFIG));
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new FounderAdvisoryConfigError(422, 'FOUNDER_CONFIG_KEY_DENIED', 'Cấu hình chứa khóa không thuộc advisory contract.');
  }
  return {
    capacity_load_warning_per_active_person: nullableNumber(input.capacity_load_warning_per_active_person, {
      key: 'capacity_load_warning_per_active_person', min: 0.1, max: 10000,
    }),
    overdue_work_warning_count: nullableNumber(input.overdue_work_warning_count, {
      key: 'overdue_work_warning_count', min: 1, max: 1000000, integer: true,
    }),
    overdue_project_warning_count: nullableNumber(input.overdue_project_warning_count, {
      key: 'overdue_project_warning_count', min: 1, max: 1000000, integer: true,
    }),
    delayed_procurement_warning_count: nullableNumber(input.delayed_procurement_warning_count, {
      key: 'delayed_procurement_warning_count', min: 1, max: 1000000, integer: true,
    }),
  };
}

function validateApproval(approval) {
  const reason = String(approval?.reason || '').trim();
  if (approval?.confirmed !== true || reason.length < 3 || reason.length > 500) {
    throw new FounderAdvisoryConfigError(
      422,
      'FOUNDER_CONFIG_APPROVAL_REQUIRED',
      'Cần Founder xác nhận và nêu lý do ngắn cho thay đổi advisory.',
    );
  }
  return { confirmed: true, reason };
}

function validateIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{12,128}$/.test(key)) {
    throw new FounderAdvisoryConfigError(
      400,
      'FOUNDER_CONFIG_IDEMPOTENCY_REQUIRED',
      'Idempotency-Key phải gồm 12–128 ký tự an toàn.',
    );
  }
  return key;
}

function publicContract(record, enabled) {
  const current = record?.versions?.find((version) => version.version === record.current_version) || null;
  return {
    contract_version: CONFIG_CONTRACT_VERSION,
    status: 'PROVISIONAL ADVISORY CONFIGURATION',
    enabled,
    canonical: false,
    operational_effect: false,
    automatic_actions_enabled: false,
    scope: record?.scope || null,
    current_version: current?.version || 0,
    configuration: { ...DEFAULT_CONFIG, ...(current?.configuration || {}) },
    updated_at: current?.created_at || null,
    rollback_versions: (record?.versions || []).map((version) => ({
      version: version.version,
      created_at: version.created_at,
      action: version.action,
      checksum: version.checksum,
    })),
    gates: {
      service: enabled,
      rule: true,
      permission: true,
      approval: true,
      audit: true,
      rollback: true,
    },
  };
}

class FounderAdvisoryConfigService {
  constructor({ baseDir = defaultBaseDir(), enabled = null } = {}) {
    this.baseDir = path.resolve(baseDir);
    assertFounderLocalStorageBoundary(this.baseDir);
    this.filePath = path.join(this.baseDir, 'advisory-config.json');
    this.enabled = enabled == null
      ? isFounderLocalReadOnly(process.env) && process.env.FOUNDER_ADVISORY_CONFIG_ENABLED === '1'
      : enabled === true;
    this._queue = Promise.resolve();
  }

  async _withLock(work) {
    const pending = this._queue.then(work, work);
    this._queue = pending.catch(() => {});
    return pending;
  }

  async _readState() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.schema_version !== SCHEMA_VERSION || !parsed.scopes || typeof parsed.scopes !== 'object') {
        throw new Error('schema');
      }
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return { schema_version: SCHEMA_VERSION, scopes: {} };
      if (error instanceof FounderAdvisoryConfigError) throw error;
      throw new FounderAdvisoryConfigError(
        503,
        'FOUNDER_CONFIG_STORE_INVALID',
        'Kho cấu hình advisory không hợp lệ; đã khóa thay đổi.',
      );
    }
  }

  async _writeState(state) {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
      await fs.rename(temporary, this.filePath);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }

  _ensureEnabled() {
    if (!this.enabled) {
      throw new FounderAdvisoryConfigError(
        503,
        'FOUNDER_CONFIG_DISABLED',
        'Founder advisory configuration đang bị khóa trong runtime profile này.',
      );
    }
  }

  async get(scope) {
    const identity = scopeIdentity(scope);
    if (!this.enabled) return publicContract({ scope: identity, versions: [], current_version: 0 }, false);
    const state = await this._readState();
    const record = state.scopes[scopeKey(identity)] || { scope: identity, versions: [], current_version: 0 };
    return publicContract(record, true);
  }

  async save({ scope, configuration, approval, expectedVersion, idempotencyKey, actorRef }) {
    this._ensureEnabled();
    const identity = scopeIdentity(scope);
    const validated = validateConfiguration(configuration);
    const confirmed = validateApproval(approval);
    const key = validateIdempotencyKey(idempotencyKey);
    const expected = Number(expectedVersion);
    if (!Number.isInteger(expected) || expected < 0) {
      throw new FounderAdvisoryConfigError(409, 'FOUNDER_CONFIG_VERSION_REQUIRED', 'Thiếu expected_version hợp lệ.');
    }
    return this._withLock(async () => {
      const state = await this._readState();
      const id = scopeKey(identity);
      const record = state.scopes[id] || {
        scope: identity,
        current_version: 0,
        versions: [],
        idempotency: {},
      };
      const receiptKey = digest(key);
      const requestHash = digest({ action: 'SAVE', identity, validated, confirmed, expected });
      const priorReceipt = record.idempotency?.[receiptKey];
      if (priorReceipt) {
        if (priorReceipt.request_hash !== requestHash) {
          throw new FounderAdvisoryConfigError(409, 'FOUNDER_CONFIG_IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho nội dung khác.');
        }
        return { ...publicContract(record, true), idempotent_replay: true };
      }
      if (record.current_version !== expected) {
        throw new FounderAdvisoryConfigError(409, 'FOUNDER_CONFIG_VERSION_CONFLICT', 'Cấu hình đã thay đổi; cần tải lại trước khi ghi.');
      }
      const version = record.current_version + 1;
      const createdAt = new Date().toISOString();
      const versionRecord = {
        version,
        action: 'SAVE',
        created_at: createdAt,
        actor_ref: String(actorRef || 'unknown'),
        approval: confirmed,
        configuration: validated,
        checksum: digest(validated),
      };
      record.current_version = version;
      record.versions = [...record.versions, versionRecord].slice(-MAX_VERSIONS_PER_SCOPE);
      record.idempotency = {
        ...(record.idempotency || {}),
        [receiptKey]: { request_hash: requestHash, version, created_at: createdAt },
      };
      const receipts = Object.entries(record.idempotency);
      if (receipts.length > MAX_IDEMPOTENCY_RECEIPTS) {
        record.idempotency = Object.fromEntries(receipts.slice(-MAX_IDEMPOTENCY_RECEIPTS));
      }
      state.scopes[id] = record;
      await this._writeState(state);
      return { ...publicContract(record, true), idempotent_replay: false };
    });
  }

  async rollback({ scope, targetVersion, approval, expectedVersion, idempotencyKey, actorRef }) {
    this._ensureEnabled();
    const identity = scopeIdentity(scope);
    const confirmed = validateApproval(approval);
    const key = validateIdempotencyKey(idempotencyKey);
    const target = Number(targetVersion);
    const expected = Number(expectedVersion);
    if (!Number.isInteger(target) || target < 1 || !Number.isInteger(expected) || expected < 1) {
      throw new FounderAdvisoryConfigError(422, 'FOUNDER_CONFIG_ROLLBACK_VERSION_INVALID', 'Phiên bản rollback không hợp lệ.');
    }
    return this._withLock(async () => {
      const state = await this._readState();
      const id = scopeKey(identity);
      const record = state.scopes[id];
      if (!record) throw new FounderAdvisoryConfigError(404, 'FOUNDER_CONFIG_SCOPE_NOT_FOUND', 'Chưa có cấu hình để rollback.');
      const receiptKey = digest(key);
      const requestHash = digest({ action: 'ROLLBACK', identity, target, confirmed, expected });
      const priorReceipt = record.idempotency?.[receiptKey];
      if (priorReceipt) {
        if (priorReceipt.request_hash !== requestHash) {
          throw new FounderAdvisoryConfigError(409, 'FOUNDER_CONFIG_IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho nội dung khác.');
        }
        return { ...publicContract(record, true), idempotent_replay: true };
      }
      if (record.current_version !== expected) {
        throw new FounderAdvisoryConfigError(409, 'FOUNDER_CONFIG_VERSION_CONFLICT', 'Cấu hình đã thay đổi; cần tải lại trước khi rollback.');
      }
      const targetRecord = record.versions.find((version) => version.version === target);
      if (!targetRecord) throw new FounderAdvisoryConfigError(404, 'FOUNDER_CONFIG_VERSION_NOT_FOUND', 'Không tìm thấy phiên bản rollback.');
      const version = record.current_version + 1;
      const createdAt = new Date().toISOString();
      record.current_version = version;
      record.versions = [...record.versions, {
        version,
        action: 'ROLLBACK',
        rolled_back_from: target,
        created_at: createdAt,
        actor_ref: String(actorRef || 'unknown'),
        approval: confirmed,
        configuration: targetRecord.configuration,
        checksum: targetRecord.checksum,
      }].slice(-MAX_VERSIONS_PER_SCOPE);
      record.idempotency = {
        ...(record.idempotency || {}),
        [receiptKey]: { request_hash: requestHash, version, created_at: createdAt },
      };
      state.scopes[id] = record;
      await this._writeState(state);
      return { ...publicContract(record, true), idempotent_replay: false };
    });
  }
}

module.exports = {
  SCHEMA_VERSION,
  CONFIG_CONTRACT_VERSION,
  DEFAULT_CONFIG,
  FounderAdvisoryConfigError,
  FounderAdvisoryConfigService,
  assertFounderLocalStorageBoundary,
  validateConfiguration,
};
