/**
 * Phase C: Audit denial quyền CRM (reason code + audit evidence + dedupe).
 * Chạy: npm run test:crm-audit
 */
const assert = require('assert');
const {
  recordCrmAccessDenial,
  setCrmAccessAuditSink,
  resetCrmAccessAuditDedupe,
} = require('../src/helpers/crmAccessAudit');

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  resetCrmAccessAuditDedupe();
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { failed += 1; failures.push({ name, error: e.message }); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const mkReq = (over = {}) => ({
  user: { userId: 'u1', company_id: 'c1' },
  method: 'GET',
  originalUrl: '/api/crm/leads/L1/tasks/T2',
  ...over,
});

console.log('\n== Phase C: CRM access denial audit ==');

test('ghi entry với reason code + ngữ cảnh đầy đủ', () => {
  const captured = [];
  setCrmAccessAuditSink((e) => captured.push(e));
  const r = recordCrmAccessDenial(mkReq(), {
    reason: 'task_access_denied', leadId: 'L1', taskId: 'T2', operation: 'READ', status: 403,
  });
  assert.ok(r.recorded);
  assert.strictEqual(captured.length, 1);
  const e = captured[0];
  assert.strictEqual(e.kind, 'crm_access_denied');
  assert.strictEqual(e.reason, 'task_access_denied');
  assert.strictEqual(e.status, 403);
  assert.strictEqual(e.operation, 'READ');
  assert.strictEqual(e.user_id, 'u1');
  assert.strictEqual(e.company_id, 'c1');
  assert.strictEqual(e.lead_id, 'L1');
  assert.strictEqual(e.task_id, 'T2');
  assert.ok(e.at);
});

test('dedupe: cùng (user, lead, task, reason) trong cửa sổ → chỉ ghi 1 lần', () => {
  const captured = [];
  setCrmAccessAuditSink((e) => captured.push(e));
  const args = { reason: 'task_access_denied', leadId: 'L1', taskId: 'T2', status: 403 };
  recordCrmAccessDenial(mkReq(), args);
  const second = recordCrmAccessDenial(mkReq(), args);
  assert.strictEqual(second.deduped, true);
  assert.strictEqual(captured.length, 1, 'không spam khi lặp 403');
});

test('reason khác nhau → ghi riêng (không dedupe nhầm)', () => {
  const captured = [];
  setCrmAccessAuditSink((e) => captured.push(e));
  recordCrmAccessDenial(mkReq(), { reason: 'task_access_denied', leadId: 'L1', taskId: 'T2' });
  recordCrmAccessDenial(mkReq(), { reason: 'task_delete_forbidden', leadId: 'L1', taskId: 'T2' });
  assert.strictEqual(captured.length, 2);
});

test('fail-safe: sink ném lỗi vẫn không throw ra request', () => {
  setCrmAccessAuditSink(() => { throw new Error('sink down'); });
  const r = recordCrmAccessDenial(mkReq(), { reason: 'tenant_scope_denied', leadId: 'L1' });
  assert.ok(r.error, 'lỗi được nuốt và trả về, không ném');
});

console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
if (failed) { failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`)); process.exit(1); }
process.exit(0);
