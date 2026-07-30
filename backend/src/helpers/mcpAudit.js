/**
 * MCP Identity/Permission audit — Allow/Deny/Error có reason_code + trace_id.
 * Fail-safe: không làm fail request nếu ghi audit lỗi.
 */
const crypto = require('crypto');
const { writeAuditLog } = require('./auditLog');

/** Reason codes (deny-by-default) — khớp Phase 2 Security Matrix. */
const MCP_REASON = Object.freeze({
  TOOL_NOT_REGISTERED: 'TOOL_NOT_REGISTERED',
  WRITE_NOT_ALLOWED: 'WRITE_NOT_ALLOWED',
  CAPABILITY_DENIED: 'CAPABILITY_DENIED',
  COMPANY_SCOPE_DENIED: 'COMPANY_SCOPE_DENIED',
  CONTEXT_MISSING: 'CONTEXT_MISSING',
  CONTEXT_INVALID: 'CONTEXT_INVALID',
  COMPANY_USER_MISMATCH: 'COMPANY_USER_MISMATCH',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  ALLOWED: 'ALLOWED',
});

const ARG_ALLOWLIST = new Set([
  'company_id', 'region_id', 'department_id', 'assigned_to',
  'date_from', 'date_to', 'time_scope', 'days_offset',
  'type', 'compare', 'deal_kh_split', 'path', 'pipeline_id',
  'user_id', 'lead_id', 'deal_id', 'employee_id', 'query',
]);

function createMcpTraceId(req) {
  const fromHeader = String(req?.headers?.['x-trace-id'] || req?.headers?.['x-request-id'] || '').trim();
  if (fromHeader && fromHeader.length <= 64) return fromHeader;
  return crypto.randomUUID();
}

function mcpDeny(reasonCode, message, status = 403) {
  const err = new Error(message);
  err.status = status;
  err.reasonCode = reasonCode;
  err.mcpReasonCode = reasonCode;
  return err;
}

/** Chỉ giữ field an toàn / ngắn — không log PII rộng hoặc secret. */
function sanitizeMcpArgs(args = {}) {
  if (!args || typeof args !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (!ARG_ALLOWLIST.has(k)) continue;
    if (v == null) continue;
    if (typeof v === 'string') {
      out[k] = v.length > 120 ? `${v.slice(0, 117)}...` : v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (k === 'query' && typeof v === 'object') {
      out.query = sanitizeMcpArgs(v);
    }
  }
  return out;
}

/**
 * @param {import('express').Request} req
 * @param {object} opts
 */
async function writeMcpToolAudit(req, opts = {}) {
  const {
    decision, // allow | deny | error
    reasonCode,
    toolName,
    traceId,
    userId = null,
    companyId = null,
    tenantId = null,
    latencyMs = null,
    argsSanitized = null,
    errorMessage = null,
  } = opts;

  const action = decision === 'allow'
    ? 'mcp.tool.allow'
    : decision === 'deny'
      ? 'mcp.tool.deny'
      : 'mcp.tool.error';

  await writeAuditLog(req, {
    user_id: userId || req?.user?.id || null,
    company_id: companyId || null,
    module: 'mcp',
    entity_type: 'mcp_tool',
    entity_id: req?.apiKey?.id || null,
    action,
    entity_label: toolName ? String(toolName).slice(0, 200) : null,
    metadata: {
      event: 'AUTH_DECISION',
      decision,
      reason_code: reasonCode || null,
      tool_name: toolName || null,
      trace_id: traceId || null,
      api_key_id: req?.apiKey?.id || null,
      api_key_name: req?.apiKey?.name || null,
      tenant_id: tenantId || null,
      latency_ms: latencyMs,
      args: argsSanitized,
      error: errorMessage ? String(errorMessage).slice(0, 300) : null,
    },
  });
}

module.exports = {
  MCP_REASON,
  createMcpTraceId,
  mcpDeny,
  sanitizeMcpArgs,
  writeMcpToolAudit,
};
