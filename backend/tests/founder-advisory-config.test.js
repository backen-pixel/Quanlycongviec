const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  FounderAdvisoryConfigError,
  FounderAdvisoryConfigService,
  validateConfiguration,
} = require('../src/services/founderAdvisoryConfig');

const SCOPE = {
  ecosystem_id: '11111111-1111-4111-8111-111111111111',
  company_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

function testRuntimeDir(label) {
  return path.resolve(__dirname, '../.runtime/tests', `${label}-${process.pid}-${Date.now()}`);
}

function body(overrides = {}) {
  return {
    scope: SCOPE,
    configuration: {
      capacity_load_warning_per_active_person: 7.5,
      overdue_work_warning_count: 3,
      overdue_project_warning_count: 2,
      delayed_procurement_warning_count: 2,
    },
    approval: { confirmed: true, reason: 'Founder xác nhận ngưỡng cảnh báo nội bộ' },
    expectedVersion: 0,
    idempotencyKey: 'founder-config-save-0001',
    actorRef: 'actor-redacted-ref',
    ...overrides,
  };
}

test('advisory validation accepts only bounded, non-operational contract keys', () => {
  assert.deepEqual(validateConfiguration({
    capacity_load_warning_per_active_person: 4.5,
    overdue_work_warning_count: null,
    overdue_project_warning_count: 2,
    delayed_procurement_warning_count: 1,
  }), {
    capacity_load_warning_per_active_person: 4.5,
    overdue_work_warning_count: null,
    overdue_project_warning_count: 2,
    delayed_procurement_warning_count: 1,
  });
  assert.throws(
    () => validateConfiguration({ operational_reassignment_enabled: true }),
    (error) => error instanceof FounderAdvisoryConfigError && error.code === 'FOUNDER_CONFIG_KEY_DENIED',
  );
  assert.throws(
    () => validateConfiguration({ overdue_work_warning_count: 0 }),
    (error) => error.code === 'FOUNDER_CONFIG_VALUE_INVALID',
  );
});

test('disabled service is readable but fails closed for writes', async () => {
  const service = new FounderAdvisoryConfigService({ baseDir: testRuntimeDir('unused-founder-config'), enabled: false });
  const current = await service.get(SCOPE);
  assert.equal(current.enabled, false);
  assert.equal(current.current_version, 0);
  assert.equal(current.canonical, false);
  assert.equal(current.operational_effect, false);
  assert.equal(current.gates.service, false);
  await assert.rejects(
    service.save(body()),
    (error) => error.code === 'FOUNDER_CONFIG_DISABLED' && error.status === 503,
  );
});

test('Founder-local refuses an advisory store outside this clean worktree runtime directory', () => {
  const previous = process.env.RUNTIME_PROFILE;
  process.env.RUNTIME_PROFILE = 'founder-local-read-only';
  try {
    assert.throws(
      () => new FounderAdvisoryConfigService({
        baseDir: 'C:\\outside-approved-worktree\\founder-config',
        enabled: true,
      }),
      (error) => error.code === 'FOUNDER_CONFIG_STORAGE_BOUNDARY_DENIED',
    );
  } finally {
    if (previous == null) delete process.env.RUNTIME_PROFILE;
    else process.env.RUNTIME_PROFILE = previous;
  }
});

test('save, idempotent replay, audit versioning and rollback are atomic and reversible', async (t) => {
  const baseDir = testRuntimeDir('founder-advisory-config');
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  const service = new FounderAdvisoryConfigService({ baseDir, enabled: true });

  const first = await service.save(body());
  assert.equal(first.current_version, 1);
  assert.equal(first.idempotent_replay, false);
  assert.equal(first.configuration.capacity_load_warning_per_active_person, 7.5);
  assert.equal(first.canonical, false);
  assert.equal(first.operational_effect, false);
  assert.equal(first.automatic_actions_enabled, false);
  assert.ok(Object.values(first.gates).every(Boolean));

  const replay = await service.save(body());
  assert.equal(replay.current_version, 1);
  assert.equal(replay.idempotent_replay, true);

  await assert.rejects(
    service.save(body({
      configuration: { ...body().configuration, overdue_work_warning_count: 4 },
    })),
    (error) => error.code === 'FOUNDER_CONFIG_IDEMPOTENCY_CONFLICT',
  );

  const second = await service.save(body({
    configuration: { ...body().configuration, capacity_load_warning_per_active_person: 9 },
    expectedVersion: 1,
    idempotencyKey: 'founder-config-save-0002',
  }));
  assert.equal(second.current_version, 2);
  assert.equal(second.configuration.capacity_load_warning_per_active_person, 9);

  const rolledBack = await service.rollback({
    scope: SCOPE,
    targetVersion: 1,
    expectedVersion: 2,
    idempotencyKey: 'founder-config-rollback-0001',
    approval: { confirmed: true, reason: 'Founder xác nhận quay lại ngưỡng trước' },
    actorRef: 'actor-redacted-ref',
  });
  assert.equal(rolledBack.current_version, 3);
  assert.equal(rolledBack.configuration.capacity_load_warning_per_active_person, 7.5);
  assert.deepEqual(rolledBack.rollback_versions.map((version) => version.action), ['SAVE', 'SAVE', 'ROLLBACK']);

  const stored = JSON.parse(await fs.readFile(path.join(baseDir, 'advisory-config.json'), 'utf8'));
  const record = Object.values(stored.scopes)[0];
  assert.equal(record.versions.length, 3);
  assert.ok(record.versions.every((version) => version.actor_ref === 'actor-redacted-ref'));
  assert.ok(record.versions.every((version) => version.checksum && !version.operational_effect));
});
