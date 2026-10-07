'use strict';
const { UUID, windowOf, fail } = require('./domain');
const str = (minLength = 1, maxLength = 120) => ({ type: 'string', minLength, maxLength });
const uuid = { type: 'string', pattern: UUID.source };
const window = { company_id: uuid, window_start: str(), window_end: str() };
const tools = [
  { name: 'get_founder_overview', description: 'Tình hình Marketing → CRM theo sáu hệ; thiếu nguồn trả UNKNOWN, không thực thi quảng cáo.', properties: window, required: Object.keys(window), read: true },
  { name: 'get_founder_evidence', description: 'Truy receipt, nguồn CRM và phản hồi con người của một khách; không trả PII hay đánh dấu đã đọc.', properties: { ...window, lead_id: uuid }, required: [...Object.keys(window), 'lead_id'], read: true },
  { name: 'get_founder_objectives', description: 'Theo dõi mục tiêu, người chịu trách nhiệm và quyết định đã ghi; approval không phải execution.', properties: window, required: Object.keys(window), read: true },
  { name: 'create_founder_objective', description: 'Ghi mục tiêu bền vững theo quyền Founder được ủy quyền; không tạo tác vụ hoặc thông báo bên ngoài.', properties: { ...window, request_id: str(8, 100), owner_id: uuid, title: str(1, 200), metric: { type: 'string', enum: ['QUALIFIED_PAID_LEADS', 'FIRST_RESPONSE_SLA'] }, target: { type: 'number', minimum: 0, maximum: 1000000000 } }, required: [...Object.keys(window), 'request_id', 'owner_id', 'title', 'metric', 'target'], read: false },
  { name: 'record_founder_decision', description: 'Ghi approve/reject đúng đề xuất và phiên bản; không thực thi đề xuất.', properties: { company_id: uuid, request_id: str(8, 100), proposal_id: uuid, expected_version: { type: 'integer', minimum: 1 }, expected_digest: { type: 'string', pattern: '^[a-f0-9]{64}$' }, decision: { type: 'string', enum: ['APPROVE', 'REJECT'] }, reason: str(1, 500) }, required: ['company_id', 'request_id', 'proposal_id', 'expected_version', 'expected_digest', 'decision', 'reason'], read: false },
];
const TOOL_SET = new Set(tools.map(t => t.name));
function getTools(apiKey) {
  if (apiKey?.credential !== 'SECRET') return [];
  const scopes = apiKey?.mcp_scopes || [];
  return tools.filter(t => scopes.includes(t.read ? 'founder_read' : 'founder_write')).map(t => ({
    name: t.name, description: t.description, inputSchema: { type: 'object', additionalProperties: false, properties: t.properties, required: t.required },
    annotations: { readOnlyHint: t.read, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  }));
}
function validate(name, args) {
  const t = tools.find(t => t.name === name);
  if (!t || !args || typeof args !== 'object' || Array.isArray(args)) throw fail('INVALID_ARGUMENTS');
  if (Object.keys(args).some(k => !Object.hasOwn(t.properties, k)) || t.required.some(k => args[k] === undefined)) throw fail('INVALID_ARGUMENTS');
  for (const [k, v] of Object.entries(args)) {
    const p = t.properties[k];
    if (typeof v !== (p.type === 'integer' ? 'number' : p.type) || (p.type === 'integer' && !Number.isSafeInteger(v))
      || (p.enum && !p.enum.includes(v)) || (p.pattern && !new RegExp(p.pattern).test(v))
      || (typeof v === 'string' && (v.trim().length < (p.minLength || 0) || v.length > (p.maxLength || 10000)))
      || (typeof v === 'number' && (!Number.isFinite(v) || v < (p.minimum ?? -Infinity) || v > (p.maximum ?? Infinity)))) throw fail('INVALID_ARGUMENTS');
  }
  if (args.window_start) windowOf(args);
  if (name === 'create_founder_objective' && (args.metric === 'FIRST_RESPONSE_SLA' && args.target > 100
    || args.metric === 'QUALIFIED_PAID_LEADS' && !Number.isSafeInteger(args.target))) throw fail('INVALID_ARGUMENTS');
  return t;
}
module.exports = { tools, TOOL_SET, getTools, validate };
