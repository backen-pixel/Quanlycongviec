const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateBusinessOsUatGate,
  validIsoDate,
} = require('../src/helpers/businessOsUatGate');

const FREEZE = '2026-08-26T10:21:23.977Z';

function backupAt(timestamp, verified = true) {
  return {
    verified,
    latest_completed_backup_at: timestamp,
  };
}

test('READY khi migration đủ và backup đã xác minh mới hơn schema freeze', () => {
  const gate = evaluateBusinessOsUatGate({
    allApplied: true,
    backup: backupAt('2026-08-26T10:21:23.978Z'),
    requiredBackupAfter: FREEZE,
  });

  assert.equal(gate.status, 'READY');
  assert.equal(gate.ready, true);
  assert.equal(gate.backup_fresh, true);
});

test('BLOCKED khi backup bằng hoặc cũ hơn schema freeze', () => {
  for (const timestamp of [FREEZE, '2026-08-25T22:13:36.512Z']) {
    const gate = evaluateBusinessOsUatGate({
      allApplied: true,
      backup: backupAt(timestamp),
      requiredBackupAfter: FREEZE,
    });

    assert.equal(gate.status, 'BLOCKED');
    assert.equal(gate.backup_fresh, false);
  }
});

test('BLOCKED khi backup chưa được xác minh dù timestamp đủ mới', () => {
  const gate = evaluateBusinessOsUatGate({
    allApplied: true,
    backup: backupAt('2026-08-27T00:00:00.000Z', false),
    requiredBackupAfter: FREEZE,
  });

  assert.equal(gate.status, 'BLOCKED');
  assert.equal(gate.backup_verified, false);
  assert.equal(gate.backup_fresh, true);
});

test('BLOCKED khi migration chưa đủ dù backup hợp lệ', () => {
  const gate = evaluateBusinessOsUatGate({
    allApplied: false,
    backup: backupAt('2026-08-27T00:00:00.000Z'),
    requiredBackupAfter: FREEZE,
  });

  assert.equal(gate.status, 'BLOCKED');
  assert.equal(gate.migrations_ready, false);
});

test('từ chối mốc thời gian không hợp lệ', () => {
  assert.equal(validIsoDate('not-a-date'), false);
  assert.throws(
    () => evaluateBusinessOsUatGate({
      allApplied: true,
      backup: backupAt('2026-08-27T00:00:00.000Z'),
      requiredBackupAfter: 'not-a-date',
    }),
    /không hợp lệ/,
  );
});
