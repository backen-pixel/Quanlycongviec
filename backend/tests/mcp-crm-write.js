/**
 * MCP — tầng GHI cho CRM. Chạy offline, không cần DB:
 *   node tests/mcp-crm-write.js
 *
 * Điều quan trọng nhất phải chứng minh: KHÔNG có đường nào ghi được khi khoá chưa bật
 * `crm_write`, và whitelist không hở ra ngoài những path đã liệt kê.
 */
require('dotenv').config();
const {
  assertCrmWritePath, MCP_CRM_WRITE_TOOL_SET, getMcpCrmWriteTools, TOOL_PHA_HUY,
} = require('../src/helpers/mcpCrmWriteBridge');
const { getMcpReportTools, assertMcpScopeForTool } = require('../src/helpers/mcpGateway');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}
function nem(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

const ID = '11111111-1111-1111-1111-111111111111';

// ── 1. Whitelist: cho đúng cái đã liệt kê ───────────────────────────────────
kiem('POST /leads được phép', assertCrmWritePath('POST', '/leads') === '/leads');
kiem('PATCH /leads/:id/stage được phép',
  assertCrmWritePath('PATCH', `/leads/${ID}/stage`) === `/leads/${ID}/stage`);
kiem('PUT /leads/:id/tasks/:taskId được phép',
  !!assertCrmWritePath('PUT', `/leads/${ID}/tasks/${ID}`));

// ── 2. Whitelist: chặn mọi thứ khác ─────────────────────────────────────────
kiem('DELETE /leads/:id BỊ CHẶN (chưa mở xoá)',
  nem(() => assertCrmWritePath('DELETE', `/leads/${ID}`))?.status === 403);
kiem('POST /leads/:id/convert-to-deal đúng method mới qua, GET thì không',
  nem(() => assertCrmWritePath('GET', `/leads/${ID}/convert-to-deal`))?.status === 403);
kiem('PUT /leads (thiếu id) bị chặn',
  nem(() => assertCrmWritePath('PUT', '/leads'))?.status === 403);
kiem('path lạ bị chặn', nem(() => assertCrmWritePath('POST', '/users'))?.status === 403);
kiem('path không bắt đầu bằng "/" bị chặn',
  nem(() => assertCrmWritePath('POST', 'leads'))?.status === 400);
kiem('nhét query vào path bị chặn',
  nem(() => assertCrmWritePath('POST', '/leads?company_id=x'))?.status === 400);
kiem('id không đúng dạng UUID bị chặn',
  nem(() => assertCrmWritePath('PUT', '/leads/123'))?.status === 403);

// ── 3. Scope: khoá chưa bật crm_write thì không thấy và không gọi được ──────
const keyDoc = { mcp_scopes: ['reports', 'crm_read'] };
const keyGhi = { mcp_scopes: ['reports', 'crm_read', 'crm_write'] };

const toolDoc = getMcpReportTools(keyDoc).map((t) => t.name);
const toolGhi = getMcpReportTools(keyGhi).map((t) => t.name);
const loGhi = toolDoc.filter((n) => MCP_CRM_WRITE_TOOL_SET.has(n));
kiem('khoá CHỈ ĐỌC không thấy tool ghi nào', loGhi.length === 0, loGhi);
kiem('khoá có crm_write thấy đủ tool ghi',
  getMcpCrmWriteTools().every((t) => toolGhi.includes(t.name)));

kiem('khoá mặc định (không khai scope) KHÔNG có quyền ghi',
  nem(() => assertMcpScopeForTool('create_crm_lead', {}))?.status === 403);
kiem('khoá chỉ đọc gọi tool ghi → 403',
  nem(() => assertMcpScopeForTool('update_crm_lead', keyDoc))?.status === 403);
kiem('khoá có crm_write gọi tool ghi → cho qua',
  nem(() => assertMcpScopeForTool('update_crm_lead', keyGhi)) === null);
kiem('có crm_write KHÔNG tự cho thêm quyền module khác',
  nem(() => assertMcpScopeForTool('create_crm_lead', { mcp_scopes: ['crm_write'] })) === null
  && nem(() => assertMcpScopeForTool('get_crm_lead_detail', { mcp_scopes: ['crm_write'] }))?.status === 403);

// ── 4. Annotation phải khai đúng — client dựa vào đó để hỏi lại người dùng ──
const byName = Object.fromEntries(getMcpReportTools(keyGhi).map((t) => [t.name, t]));
kiem('tool ghi khai readOnlyHint = false',
  byName.create_crm_lead?.annotations?.readOnlyHint === false,
  byName.create_crm_lead?.annotations);
kiem('tool đọc vẫn khai readOnlyHint = true',
  byName.get_crm_lead_detail?.annotations?.readOnlyHint === true);
kiem('move_crm_lead_stage khai destructiveHint = true',
  byName.move_crm_lead_stage?.annotations?.destructiveHint === true);
kiem('create_crm_lead KHÔNG phải idempotent',
  byName.create_crm_lead?.annotations?.idempotentHint === false);
kiem('TOOL_PHA_HUY chỉ gồm tool có thật',
  [...TOOL_PHA_HUY].every((n) => MCP_CRM_WRITE_TOOL_SET.has(n)), [...TOOL_PHA_HUY]);

// ── 5. Mọi tool ghi phải có schema và trường bắt buộc ───────────────────────
const thieu = getMcpCrmWriteTools().filter((t) => !t.inputSchema?.properties
  || !Array.isArray(t.inputSchema.required) || !t.inputSchema.required.length);
kiem('mọi tool ghi đều khai inputSchema + required', thieu.length === 0, thieu.map((t) => t.name));

console.log(`\n${dat} đạt · ${truot} trượt`);
process.exit(truot ? 1 : 0);
