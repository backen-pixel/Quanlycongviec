const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { KINDS, kindLabel, resolveAllowedActorIds } = require('../src/helpers/projectConstructionLogs');

describe('projectConstructionLogs', () => {
  test('đủ tab nhật ký', () => {
    for (const k of ['all', 'tasks', 'phat_sinh', 'project', 'crm', 'comments']) {
      assert.ok(KINDS.has(k), k);
    }
  });

  test('nhãn tiếng Việt', () => {
    assert.equal(kindLabel('phat_sinh'), 'Phát sinh');
    assert.equal(kindLabel('tasks'), 'Nhiệm vụ');
  });

  test('lọc nhân viên ưu tiên user_id', async () => {
    const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const ids = await resolveAllowedActorIds({ userId: uid });
    assert.deepEqual([...ids], [uid]);
  });
});
