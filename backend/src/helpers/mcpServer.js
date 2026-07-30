/**
 * MCP Server — Model Context Protocol (Streamable HTTP + legacy lifecycle).
 * Spec: https://modelcontextprotocol.io/specification/2024-11-05
 */
const crypto = require('crypto');
const {
  getMcpReportTools,
  callMcpReportTool,
} = require('./mcpGateway');

const JSONRPC_VERSION = '2.0';
const SERVER_NAME = 'qlcv-mcp-reports';
const SERVER_VERSION = '2.0.0';

/** Phiên bản MCP server hỗ trợ (mới → cũ). */
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

const DEFAULT_LEGACY_VERSION = '2025-03-26';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const TOOLS_PAGE_SIZE = 50;

const MCP_RESOURCES = [
  {
    uri: 'qlcv://reports/org-overview-guide',
    name: 'org-overview-guide',
    description: 'Hướng dẫn lấy báo cáo tổ chức CRM qua MCP tools',
    mimeType: 'text/markdown',
  },
];

const MCP_RESOURCE_CONTENT = {
  'qlcv://reports/org-overview-guide': `# Báo cáo tổ chức — MCP

Gọi tool \`get_org_overview_report_full\` hoặc \`format_org_overview_report_text\`.

**Kỳ báo cáo** (client gửi mỗi request):
- \`date_from\` + \`date_to\` (YYYY-MM-DD, ưu tiên)
- hoặc \`time_scope\`: today, yesterday, last_7d, last_30d, this_month, last_month, custom

**Lọc:** company_id, region_id, department_id, assigned_to, deal_kh_split, compare.

Auth: header X-Api-Key + X-User-Id (user có quyền xem BC).
`,
};

const MCP_PROMPTS = [
  {
    name: 'org_overview_report',
    description: 'Yêu cầu báo cáo tổ chức CRM theo kỳ',
    arguments: [
      { name: 'date_from', description: 'YYYY-MM-DD đầu kỳ', required: true },
      { name: 'date_to', description: 'YYYY-MM-DD cuối kỳ', required: true },
      { name: 'department', description: 'Tên phòng ban (tùy chọn)', required: false },
    ],
  },
];

const SERVER_INSTRUCTIONS =
  'MCP server báo cáo CRM TuBep Pro. '
  + 'Dùng tools/list để xem tool; gọi get_org_overview_report_full hoặc format_org_overview_report_text. '
  + 'Mỗi request phải truyền kỳ BC (date_from/date_to hoặc time_scope). '
  + 'Cần header X-Api-Key và X-User-Id (user có quyền báo cáo tổ chức).';

/** @type {Map<string, {
 *   initialized: boolean,
 *   protocolVersion: string,
 *   clientId: string,
 *   clientInfo: object|null,
 *   apiKeyId: string|null,
 *   createdAt: number,
 *   lastSeenAt: number,
 * }>} */
const _sessions = new Map();

function getHeader(req, name) {
  const lower = name.toLowerCase();
  const key = Object.keys(req.headers || {}).find((k) => k.toLowerCase() === lower);
  return key ? req.headers[key] : undefined;
}

function isModernProtocol(version) {
  return ['2026-07-28', '2025-11-25', '2025-06-18'].includes(version);
}

function requiresLegacyHandshake(version) {
  return version === '2024-11-05' || version === '2025-03-26';
}

function negotiateProtocolVersion(requested) {
  if (!requested) return DEFAULT_LEGACY_VERSION;
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) return requested;
  return null;
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of _sessions.entries()) {
    if (now - s.createdAt > SESSION_TTL_MS) _sessions.delete(id);
  }
}

function resolveClientId(params = {}, headerClientId) {
  const fromParams = String(params.client_id || '').trim();
  if (fromParams) return fromParams;
  const fromHeader = String(headerClientId || '').trim();
  if (fromHeader) return fromHeader;
  const info = params.clientInfo;
  if (info?.name) {
    const seed = `${info.name}:${info.version || '1.0.0'}`;
    return `client_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
  }
  return crypto.randomUUID();
}

function touchSession(sessionId) {
  const s = _sessions.get(sessionId);
  if (s) s.lastSeenAt = Date.now();
  return s;
}

function beginInitializeSession(req, params, protocolVersion) {
  pruneSessions();
  const sessionId = crypto.randomUUID();
  const clientId = resolveClientId(params, getHeader(req, 'Mcp-Client-Id'));
  const session = {
    initialized: false,
    protocolVersion,
    clientId,
    clientInfo: params?.clientInfo || null,
    apiKeyId: req.apiKey?.id || null,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  _sessions.set(sessionId, session);
  return { sessionId, clientId, session };
}

function getBoundSession(sessionId) {
  if (!sessionId || !_sessions.has(sessionId)) return null;
  const session = touchSession(sessionId);
  return { id: sessionId, ...session };
}

function markSessionInitialized(sessionId) {
  const s = _sessions.get(sessionId);
  if (s) s.initialized = true;
}

function isJsonRpcNotification(msg) {
  return msg && typeof msg === 'object' && typeof msg.method === 'string' && !('id' in msg);
}

function isJsonRpcRequest(msg) {
  return msg && typeof msg === 'object' && typeof msg.method === 'string' && 'id' in msg;
}

function jsonRpcError(id, code, message, data) {
  const err = { jsonrpc: JSONRPC_VERSION, id: id ?? null, error: { code, message } };
  if (data !== undefined) err.error.data = data;
  return err;
}

function jsonRpcResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function serverCapabilities() {
  return {
    logging: {},
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false },
  };
}

function buildInitializeResult(protocolVersion, sessionId, clientId) {
  return {
    protocolVersion,
    capabilities: serverCapabilities(),
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions: SERVER_INSTRUCTIONS,
    session_id: sessionId,
    client_id: clientId,
    connection: {
      session_id: sessionId,
      client_id: clientId,
    },
    _meta: {
      'io.modelcontextprotocol/sessionId': sessionId,
      'io.modelcontextprotocol/clientId': clientId,
      'io.modelcontextprotocol/protocolVersion': protocolVersion,
    },
  };
}

function validateConnectionHeaders(req, sessionId, session, method) {
  if (method === 'initialize') return { ok: true };

  const hSession = getHeader(req, 'Mcp-Session-Id');
  const hClient = getHeader(req, 'Mcp-Client-Id');

  if (!hSession) {
    return { ok: false, code: -32020, message: 'Thiếu header Mcp-Session-Id — gọi initialize trước' };
  }
  if (hSession !== sessionId) {
    return {
      ok: false,
      code: -32020,
      message: `Mcp-Session-Id không khớp phiên (${hSession} ≠ ${sessionId})`,
    };
  }
  if (!session) {
    return { ok: false, code: -32002, message: 'Session không tồn tại hoặc đã hết hạn — initialize lại' };
  }
  // Mcp-Client-Id là mở rộng — chỉ kiểm tra khi client gửi
  if (hClient && session.clientId && hClient !== session.clientId) {
    return {
      ok: false,
      code: -32020,
      message: `Mcp-Client-Id không khớp phiên (${hClient} ≠ ${session.clientId})`,
    };
  }
  return { ok: true };
}

function extractProtocolVersion(req, body) {
  const headerVer = getHeader(req, 'MCP-Protocol-Version');
  const metaVer = body?.params?._meta?.['io.modelcontextprotocol/protocolVersion']
    || body?.params?._meta?.protocolVersion;
  return headerVer || metaVer || body?.params?.protocolVersion || null;
}

function validateAcceptHeader(req) {
  const accept = getHeader(req, 'Accept') || '';
  // Client chuẩn (Cursor) có thể gửi */* hoặc chỉ application/json — không bắt buộc SSE.
  if (!accept || accept === '*/*' || accept.includes('*/*')) return { ok: true };
  const hasJson = accept.includes('application/json');
  const hasSse = accept.includes('text/event-stream');
  if (hasJson || hasSse) return { ok: true };
  return {
    ok: false,
    message: 'Accept header phải gồm application/json và/hoặc text/event-stream',
  };
}

function decodeHeaderValue(value) {
  if (!value || typeof value !== 'string') return value;
  const m = value.match(/^=\?base64\?(.+)\?=$/);
  if (m) {
    try {
      return Buffer.from(m[1], 'base64').toString('utf8');
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Header Mcp-Method / Mcp-Name là mở rộng QLCV (không bắt buộc MCP spec).
 * Chỉ validate khi client có gửi — Cursor/Claude chuẩn không gửi vẫn OK.
 */
function validateModernHeaders(req, body, protocolVersion) {
  if (!isModernProtocol(protocolVersion)) return { ok: true };

  const method = body.method;
  const mcpMethod = getHeader(req, 'Mcp-Method');
  const mcpName = getHeader(req, 'Mcp-Name');
  const headerVer = getHeader(req, 'MCP-Protocol-Version');

  if (headerVer && headerVer !== protocolVersion) {
    return {
      ok: false,
      code: -32020,
      message: `Header mismatch: MCP-Protocol-Version '${headerVer}' ≠ '${protocolVersion}'`,
    };
  }

  if (mcpMethod && mcpMethod !== method) {
    return {
      ok: false,
      code: -32020,
      message: `Header mismatch: Mcp-Method '${mcpMethod}' ≠ body method '${method}'`,
    };
  }

  if (method === 'tools/call' && mcpName) {
    const bodyName = body.params?.name;
    const decodedName = decodeHeaderValue(mcpName);
    if (bodyName && decodedName !== bodyName) {
      return {
        ok: false,
        code: -32020,
        message: `Header mismatch: Mcp-Name '${decodedName}' ≠ body '${bodyName}'`,
      };
    }
  }

  if (method === 'resources/read' && mcpName) {
    const bodyUri = body.params?.uri;
    const decodedUri = decodeHeaderValue(mcpName);
    if (bodyUri && decodedUri !== bodyUri) {
      return {
        ok: false,
        code: -32020,
        message: `Header mismatch: Mcp-Name '${decodedUri}' ≠ body uri '${bodyUri}'`,
      };
    }
  }

  return { ok: true };
}

function paginateList(items, cursor, pageSize = TOOLS_PAGE_SIZE) {
  let start = 0;
  if (cursor) {
    try {
      start = parseInt(Buffer.from(String(cursor), 'base64url').toString('utf8'), 10);
      if (Number.isNaN(start) || start < 0) start = 0;
    } catch {
      start = 0;
    }
  }
  const slice = items.slice(start, start + pageSize);
  const nextStart = start + pageSize;
  const nextCursor = nextStart < items.length
    ? Buffer.from(String(nextStart), 'utf8').toString('base64url')
    : undefined;
  return { items: slice, nextCursor };
}

function buildCallToolResult(result) {
  const payload = {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    payload.structuredContent = result;
  }
  return payload;
}

function getSessionState(sessionId) {
  return _sessions.get(sessionId) || null;
}

async function dispatchMethod(method, params, req, sessionId, fallbackVersion) {
  const normalized = method === 'mcp/tools/list' ? 'tools/list'
    : method === 'mcp/tools/call' ? 'tools/call'
      : method;

  if (normalized === 'initialize') {
    const requested = params?.protocolVersion || DEFAULT_LEGACY_VERSION;
    const negotiated = negotiateProtocolVersion(requested);
    if (!negotiated) {
      const err = new Error('Unsupported protocol version');
      err.mcpCode = -32001;
      err.mcpData = { supported: SUPPORTED_PROTOCOL_VERSIONS };
      throw err;
    }
    const s = getSessionState(sessionId);
    if (s) {
      s.protocolVersion = negotiated;
      if (params?.client_id || params?.clientInfo) {
        s.clientId = resolveClientId(params, getHeader(req, 'Mcp-Client-Id'));
      }
      if (params?.clientInfo) s.clientInfo = params.clientInfo;
    }
    const clientId = s?.clientId || resolveClientId(params, getHeader(req, 'Mcp-Client-Id'));
    return buildInitializeResult(negotiated, sessionId, clientId);
  }

  if (normalized === 'ping') {
    const s = getSessionState(sessionId);
    return {
      connection: {
        session_id: sessionId,
        client_id: s?.clientId || null,
        initialized: s?.initialized === true,
      },
    };
  }

  const sessionVer = getSessionState(sessionId)?.protocolVersion || fallbackVersion;
  if (requiresLegacyHandshake(sessionVer)) {
    const initialized = getSessionState(sessionId)?.initialized === true;
    if (!initialized) {
      const err = new Error('Server chưa initialized — gửi initialize rồi notifications/initialized');
      err.mcpCode = -32002;
      throw err;
    }
  }

  if (normalized === 'tools/list') {
    const allTools = getMcpReportTools(req.apiKey);
    const { items, nextCursor } = paginateList(allTools, params?.cursor);
    const out = { tools: items };
    if (nextCursor) out.nextCursor = nextCursor;
    return out;
  }

  if (normalized === 'tools/call') {
    const name = params?.name || params?.tool;
    const args = params?.arguments || params?.args || {};
    if (!name) {
      const err = new Error('Thiếu params.name');
      err.mcpCode = -32602;
      throw err;
    }
    try {
      const result = await callMcpReportTool(String(name), args, req);
      return buildCallToolResult(result);
    } catch (e) {
      const reasonCode = e.reasonCode || e.mcpReasonCode || null;
      const traceId = e.mcpTraceId || req.mcpTraceId || null;
      if (e.status === 404) {
        const err = new Error(e.message);
        err.mcpCode = -32602;
        err.mcpData = { reason_code: reasonCode, trace_id: traceId };
        throw err;
      }
      if (e.status === 403) {
        const err = new Error(e.message);
        err.mcpCode = -32003;
        err.mcpData = { reason_code: reasonCode, trace_id: traceId };
        throw err;
      }
      if (e.status === 400) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: e.message,
              reason_code: reasonCode,
              trace_id: traceId,
            }),
          }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: e.message || 'Lỗi thực thi tool',
            reason_code: reasonCode || 'UPSTREAM_ERROR',
            trace_id: traceId,
          }),
        }],
        isError: true,
      };
    }
  }

  if (normalized === 'resources/list') {
    const { items, nextCursor } = paginateList(MCP_RESOURCES, params?.cursor);
    const out = { resources: items };
    if (nextCursor) out.nextCursor = nextCursor;
    return out;
  }

  if (normalized === 'resources/templates/list') {
    return { resourceTemplates: [] };
  }

  if (normalized === 'resources/read') {
    const uri = params?.uri;
    const text = MCP_RESOURCE_CONTENT[uri];
    if (!text) {
      const err = new Error(`Resource không tồn tại: ${uri}`);
      err.mcpCode = -32602;
      throw err;
    }
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text,
      }],
    };
  }

  if (normalized === 'resources/subscribe' || normalized === 'resources/unsubscribe') {
    return {};
  }

  if (normalized === 'prompts/list') {
    const { items, nextCursor } = paginateList(MCP_PROMPTS, params?.cursor);
    const out = { prompts: items };
    if (nextCursor) out.nextCursor = nextCursor;
    return out;
  }

  if (normalized === 'prompts/get') {
    const name = params?.name;
    const prompt = MCP_PROMPTS.find((p) => p.name === name);
    if (!prompt) {
      const err = new Error(`Prompt không tồn tại: ${name}`);
      err.mcpCode = -32602;
      throw err;
    }
    const args = params?.arguments || {};
    const dateFrom = args.date_from || 'YYYY-MM-DD';
    const dateTo = args.date_to || 'YYYY-MM-DD';
    const dept = args.department ? ` phòng ${args.department}` : '';
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Lấy báo cáo tổ chức CRM${dept} từ ${dateFrom} đến ${dateTo}. `
            + 'Gọi format_org_overview_report_text hoặc get_org_overview_report_full với cùng kỳ.',
        },
      }],
    };
  }

  if (normalized === 'subscriptions/listen') {
    const err = new Error('subscriptions/listen chưa hỗ trợ trên server báo cáo');
    err.mcpCode = -32601;
    throw err;
  }

  const err = new Error(`Method not found: ${method}`);
  err.mcpCode = -32601;
  throw err;
}

async function handleNotification(method, params, sessionId) {
  if (method === 'notifications/initialized') {
    if (sessionId) markSessionInitialized(sessionId);
    return { accepted: true };
  }
  if (method === 'notifications/cancelled') {
    return { accepted: true };
  }
  return { accepted: true };
}

/**
 * Xử lý một message JSON-RPC từ client MCP.
 * @returns {{ httpStatus: number, body?: object, sessionId?: string, isNotification?: boolean }}
 */
async function handleMcpPost(req, body) {
  if (!body || typeof body !== 'object') {
    return {
      httpStatus: 400,
      body: jsonRpcError(null, -32700, 'Parse error'),
    };
  }

  if (body.jsonrpc && body.jsonrpc !== JSONRPC_VERSION) {
    return {
      httpStatus: 400,
      body: jsonRpcError(body.id ?? null, -32600, 'Invalid Request — cần jsonrpc 2.0'),
    };
  }

  const acceptCheck = validateAcceptHeader(req);
  if (!acceptCheck.ok) {
    return {
      httpStatus: 400,
      body: jsonRpcError(body.id ?? null, -32600, acceptCheck.message),
    };
  }

  const protocolVersion = negotiateProtocolVersion(
    extractProtocolVersion(req, body) || DEFAULT_LEGACY_VERSION,
  );
  if (!protocolVersion) {
    return {
      httpStatus: 400,
      body: jsonRpcError(
        body.id ?? null,
        -32001,
        'Unsupported protocol version',
        { supported: SUPPORTED_PROTOCOL_VERSIONS },
      ),
    };
  }

  const method = body.method;
  const isInit = method === 'initialize';
  let sessionId = getHeader(req, 'Mcp-Session-Id');
  let clientId = null;
  let session = null;

  if (isInit) {
    const started = beginInitializeSession(req, body.params || {}, protocolVersion);
    sessionId = started.sessionId;
    clientId = started.clientId;
    session = started.session;
  } else {
    session = getBoundSession(sessionId);
    clientId = session?.clientId || null;
  }

  if (isJsonRpcNotification(body)) {
    const connCheck = validateConnectionHeaders(req, sessionId, session, method);
    if (!connCheck.ok) {
      return {
        httpStatus: 400,
        body: jsonRpcError(null, connCheck.code, connCheck.message),
      };
    }
    await handleNotification(method, body.params, sessionId);
    return {
      httpStatus: 202,
      isNotification: true,
      sessionId,
      clientId,
    };
  }

  if (!isJsonRpcRequest(body)) {
    return {
      httpStatus: 400,
      body: jsonRpcError(null, -32600, 'Invalid Request'),
    };
  }

  const connCheck = validateConnectionHeaders(req, sessionId, session, method);
  if (!connCheck.ok) {
    return {
      httpStatus: 400,
      body: jsonRpcError(body.id, connCheck.code, connCheck.message),
      sessionId,
      clientId,
    };
  }

  const headerValidation = validateModernHeaders(req, body, protocolVersion);
  if (!headerValidation.ok) {
    return {
      httpStatus: 400,
      body: jsonRpcError(body.id, headerValidation.code, headerValidation.message),
      sessionId,
      clientId,
    };
  }

  try {
    const result = await dispatchMethod(method, body.params || {}, req, sessionId, protocolVersion);
    return {
      httpStatus: 200,
      body: jsonRpcResult(body.id, result),
      sessionId,
      clientId,
      setSessionOnInit: isInit,
      setClientOnInit: isInit,
    };
  } catch (e) {
    const code = e.mcpCode
      || (e.status === 403 ? -32003 : e.status === 400 ? -32602 : -32603);
    const httpStatus = code === -32601 ? 404 : code === -32020 ? 400 : 200;
    return {
      httpStatus,
      body: jsonRpcError(body.id, code, e.message || 'Lỗi', e.mcpData),
      sessionId,
      clientId,
    };
  }
}

function buildLegacySseEndpointUrl(req) {
  const proto = getHeader(req, 'X-Forwarded-Proto') || req.protocol || 'https';
  const host = getHeader(req, 'X-Forwarded-Host') || getHeader(req, 'Host') || req.get?.('host');
  const connectId = req.params?.connectId || req.apiKey?.id;
  const path = connectId ? `/api/mcp/${connectId}` : '/api/mcp';
  return `${proto}://${host}${path}`;
}

module.exports = {
  JSONRPC_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  SERVER_INSTRUCTIONS,
  getMcpReportTools,
  buildCallToolResult,
  handleMcpPost,
  buildLegacySseEndpointUrl,
  isJsonRpcNotification,
  isJsonRpcRequest,
  jsonRpcError,
  jsonRpcResult,
  buildInitializeResult,
  serverCapabilities,
  resolveClientId,
  getBoundSession,
};
