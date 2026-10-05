/**
 * Hào hoàn thiện chỉ giữ dự án có nhiệm vụ gắn cho mình.
 * Chạy: node tests/hao-task-project-scope.js
 */
const assert = require('assert');
const {
  isTaskScopedProductionUser,
  intersectProjectIds,
} = require('../src/helpers/dealParticipantProduction');

assert.strictEqual(isTaskScopedProductionUser({ email: 'hao@metalla.com' }), true);
assert.strictEqual(isTaskScopedProductionUser({ email: 'Hao@Metalla.com' }), true);
assert.strictEqual(isTaskScopedProductionUser({ email: 'ly@metalla.com' }), false);
assert.strictEqual(isTaskScopedProductionUser({ email: 'thuan@metalla.com' }), false);
assert.strictEqual(isTaskScopedProductionUser(null), false);

assert.deepEqual(intersectProjectIds(null, ['b', 'a', 'a']), ['b', 'a']);
assert.deepEqual(intersectProjectIds(['a', 'c', 'a'], ['a', 'b']), ['a']);
assert.deepEqual(intersectProjectIds(['c'], ['a']), []);
assert.deepEqual(intersectProjectIds([], ['a']), []);

console.log('hao-task-project-scope: ok');
