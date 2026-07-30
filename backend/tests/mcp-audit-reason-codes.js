/**
 * Smoke test MCP audit helpers (không cần DB / HTTP).
 * Chạy: node tests/mcp-audit-reason-codes.js
 */
const assert = require('assert');
const {
  MCP_REASON,
  mcpDeny,
  sanitizeMcpArgs,
  createMcpTraceId,
} = require('../src/helpers/mcpAudit');

function run() {
  assert.strictEqual(MCP_REASON.TOOL_NOT_REGISTERED, 'TOOL_NOT_REGISTERED');
  assert.strictEqual(MCP_REASON.WRITE_NOT_ALLOWED, 'WRITE_NOT_ALLOWED');

  const err = mcpDeny(MCP_REASON.COMPANY_SCOPE_DENIED, 'blocked', 403);
  assert.strictEqual(err.status, 403);
  assert.strictEqual(err.reasonCode, 'COMPANY_SCOPE_DENIED');

  const clean = sanitizeMcpArgs({
    company_id: 'abc',
    password: 'secret',
    api_key: 'k',
    customer_phone: '090',
    date_from: '2026-01-01',
    note: 'should drop',
  });
  assert.deepStrictEqual(clean, { company_id: 'abc', date_from: '2026-01-01' });
  assert.ok(!('password' in clean));
  assert.ok(!('customer_phone' in clean));

  const tid = createMcpTraceId({ headers: { 'x-trace-id': 'TRACE-TEST-1' } });
  assert.strictEqual(tid, 'TRACE-TEST-1');

  const tid2 = createMcpTraceId({ headers: {} });
  assert.match(tid2, /^[0-9a-f-]{36}$/i);

  console.log('PASS mcp-audit-reason-codes (5 checks)');
}

run();
