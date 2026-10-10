/**
 * MCP — cổng đọc các module ngoài CRM: whitelist path và phân quyền theo scope.
 * Chạy offline, không cần DB: `node tests/mcp-module-bridge.js`
 *
 * Phần gọi router thật (production/logistics/accounting/tasks/kpi/events/projects) cần user
 * act-as + DB nên không nằm ở đây — đã kiểm tay, xem WORKLOG.
 */
require('dotenv').config();
const { getMcpReportTools } = require('../src/helpers/mcpGateway');
const {
  MODULES, MCP_MODULE_SCOPES, getMcpModuleTools, assertModulePath,
} = require('../src/helpers/mcpModuleReadBridge');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}
function chan(mod, p) {
  try { assertModulePath(mod, p); return null; } catch (e) { return e.status; }
}

// ── whitelist path ────────────────────────────────────────────────────────────
kiem('cho qua path tinh', assertModulePath('production', '/projects') === '/projects');
kiem('cho qua path co :id la uuid',
  assertModulePath('production', '/projects/14fc8f96-00fb-4bb2-8552-0460eb129924')
  === '/projects/14fc8f96-00fb-4bb2-8552-0460eb129924');
kiem('cho qua path goc "/"', assertModulePath('projects', '/') === '/');
kiem('chap nhan ca dang day du /api/<module>/...',
  assertModulePath('tasks', '/api/tasks/overdue') === '/overdue');

kiem('CHAN /accounting/bank-accounts (so tai khoan ngan hang)', chan('accounting', '/bank-accounts') === 404);
kiem('CHAN /accounting/export (sinh tep)', chan('accounting', '/export') !== null);
kiem('CHAN /logistics/trash', chan('logistics', '/trash') === 404);
kiem('CHAN cau hinh handover-settings', chan('production', '/handover-settings/abc') === 404);
kiem('CHAN duong di ngang hang (path traversal)', chan('production', '/../../etc/passwd') === 404);
kiem('CHAN module khong ton tai', chan('khong_co_module', '/x') === 400);

// ── phan quyen theo scope ─────────────────────────────────────────────────────
const CO_BAN = ['reports', 'crm_read'];
const DU = [...CO_BAN, 'ads_read', ...Object.values(MODULES).map((m) => m.scope)];

const tenModule = (ts) => ts.map((t) => t.name).filter((n) => n.endsWith('_api_get') && n !== 'crm_api_get');

kiem('key KHONG khai scope -> khong thay module nao ngoai CRM',
  tenModule(getMcpReportTools({})).length === 0,
  tenModule(getMcpReportTools({})));
kiem('key chi co reports+crm_read -> van khong thay module moi',
  tenModule(getMcpReportTools({ mcp_scopes: CO_BAN })).length === 0);
kiem('key du scope -> thay ca 7 cong doc module',
  tenModule(getMcpReportTools({ mcp_scopes: DU })).length === 7,
  tenModule(getMcpReportTools({ mcp_scopes: DU })));
kiem('bat le production_read -> CHI thay production_api_get',
  JSON.stringify(tenModule(getMcpReportTools({ mcp_scopes: [...CO_BAN, 'production_read'] })))
  === '["production_api_get"]');
kiem('bat le accounting_read -> CHI thay accounting_api_get',
  JSON.stringify(tenModule(getMcpReportTools({ mcp_scopes: [...CO_BAN, 'accounting_read'] })))
  === '["accounting_api_get"]');

// ── metadata ──────────────────────────────────────────────────────────────────
const duTools = getMcpReportTools({ mcp_scopes: DU });
const modTools = duTools.filter((t) => MCP_MODULE_SCOPES[t.name]);
kiem('moi cong doc module deu co title tieng Viet',
  modTools.every((t) => t.title && t.title !== t.name), modTools.map((t) => t.title));
kiem('moi cong doc module deu readOnlyHint = true',
  modTools.every((t) => t.annotations?.readOnlyHint === true));
kiem('moi cong doc module deu co outputSchema',
  modTools.every((t) => t.outputSchema?.properties?.module));
kiem('mo ta tool co liet ke whitelist de model tu biet goi path nao',
  modTools.every((t) => /Path cho phép:/.test(t.description)));

// ── pham vi bao phu ───────────────────────────────────────────────────────────
const tongPath = Object.values(MODULES).reduce((s, m) => s + m.paths.length, 0);
kiem(`phu >= 80 endpoint chi bang 7 tool (dang co ${tongPath})`, tongPath >= 80);
kiem('tong so tool van duoi 60 (khong lam nghen tools/list)',
  duTools.length < 60, duTools.length);

console.log(`\n${dat} đạt · ${truot} trượt`);
process.exit(truot ? 1 : 0);
