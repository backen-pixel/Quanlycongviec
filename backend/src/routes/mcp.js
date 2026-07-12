/**
 * MCP API — Model Context Protocol chuẩn (Streamable HTTP).
 *
 * Transport:
 *   POST /api/mcp          — MCP endpoint (JSON-RPC 2.0, Streamable HTTP)
 *   GET  /api/mcp          — Legacy HTTP+SSE (2024-11-05 backward compat)
 *
 * Auth: X-Api-Key (+ X-User-Id cho quyền BC).
 *
 * REST shortcuts (không thay MCP endpoint):
 *   GET  /api/mcp/ping
 *   GET  /api/mcp/reports/org-overview?...
 */
const { Router } = require('express');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const {
  getMcpReportTools,
  callMcpReportTool,
  queryToReportArgs,
} = require('../helpers/mcpGateway');
const {
  handleMcpPost,
  buildCallToolResult,
  buildLegacySseEndpointUrl,
  SUPPORTED_PROTOCOL_VERSIONS,
  SERVER_NAME,
  SERVER_VERSION,
} = require('../helpers/mcpServer');

const r = Router();

const _rateBucket = new Map();
function checkRateLimit({ apiKeyId, ip, windowMs = 60_000, limit = 90 }) {
  const now = Date.now();
  const bucketKey = `${apiKeyId || 'unknown'}:${ip || 'unknown'}`;
  const cur = _rateBucket.get(bucketKey) || { t: now, c: 0 };
  if (now - cur.t > windowMs) {
    _rateBucket.set(bucketKey, { t: now, c: 1 });
    return { ok: true };
  }
  if (cur.c >= limit) return { ok: false };
  cur.c += 1;
  _rateBucket.set(bucketKey, cur);
  return { ok: true };
}

function mcpRateLimit(req, res, next) {
  const rl = checkRateLimit({ apiKeyId: req.apiKey?.id, ip: req.ip });
  if (!rl.ok) return res.status(429).json({ error: 'Rate limit exceeded' });
  next();
}

function applyMcpResponseHeaders(res, { sessionId, clientId, setSessionOnInit, setClientOnInit }) {
  res.set('Cache-Control', 'no-store');
  if (sessionId) res.set('Mcp-Session-Id', sessionId);
  if (clientId && (setClientOnInit || setSessionOnInit)) res.set('Mcp-Client-Id', clientId);
}

async function handleToolError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error('[MCP]', e.message);
  return res.status(status).json({ error: e.message || 'Lỗi MCP' });
}

r.use(apiKeyAuth);
r.use(mcpRateLimit);

/**
 * POST /api/mcp — MCP endpoint chuẩn (Streamable HTTP).
 * Mỗi request = một JSON-RPC message.
 */
async function mcpPostHandler(req, res) {
  try {
    const out = await handleMcpPost(req, req.body || {});
    applyMcpResponseHeaders(res, out);

    if (out.isNotification) {
      return res.status(202).end();
    }

    res.status(out.httpStatus || 200);
    res.set('Content-Type', 'application/json');
    return res.json(out.body);
  } catch (e) {
    console.error('[MCP] POST', e.message);
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: { code: -32603, message: e.message || 'Internal error' },
    });
  }
}

r.post('/', mcpPostHandler);

/**
 * GET /api/mcp — Legacy HTTP+SSE (protocol 2024-11-05).
 * Client cũ mở SSE, nhận event `endpoint` trỏ về POST URL.
 */
r.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const postUrl = buildLegacySseEndpointUrl(req);
  res.write(`event: endpoint\ndata: ${JSON.stringify(postUrl)}\n\n`);

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n');
  }, 25_000);

  req.on('close', () => clearInterval(keepAlive));
});

/** POST /api/mcp/rpc — alias backward-compat → cùng handler MCP chuẩn */
r.post('/rpc', mcpPostHandler);

/** GET /api/mcp/ping — health check (ngoài MCP spec, tiện debug) */
r.get('/ping', (req, res) => {
  res.json({
    ok: true,
    mcp: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
    endpoint: 'POST /api/mcp',
    connection: {
      session_id: '(nhận sau initialize — header Mcp-Session-Id)',
      client_id: '(gửi Mcp-Client-Id hoặc params.client_id khi initialize)',
      flow: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'],
    },
    key_name: req.apiKey.name,
    company_id: req.apiKey.company_id,
    act_as_user: req.apiKey.default_assigned_to || null,
  });
});

/**
 * GET /api/mcp/tools — MCP tools/list (JSON thuần, không JSON-RPC envelope).
 * @deprecated Dùng POST /api/mcp với method tools/list
 */
r.get('/tools', (_req, res) => {
  res.json({ tools: getMcpReportTools() });
});

/**
 * POST /api/mcp/tools/call — MCP CallToolResult (không JSON-RPC envelope).
 * @deprecated Dùng POST /api/mcp với method tools/call
 */
r.post('/tools/call', async (req, res) => {
  try {
    const name = req.body?.name || req.body?.tool;
    const args = req.body?.arguments || req.body?.args || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name (tên tool)' });
    const result = await callMcpReportTool(String(name), args, req);
    res.json(buildCallToolResult(result));
  } catch (e) {
    if (e.status === 404 || e.status === 403) return handleToolError(res, e);
    return res.status(200).json({
      content: [{ type: 'text', text: e.message || 'Lỗi' }],
      isError: true,
    });
  }
});

/** GET /api/mcp/reports/org-overview — REST shortcut */
r.get('/reports/org-overview', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const args = queryToReportArgs(req.query);
    const result = await callMcpReportTool('get_org_overview_report_full', args, req);
    res.json(result);
  } catch (e) {
    return handleToolError(res, e);
  }
});

r.get('/reports/org-overview/summary', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const args = queryToReportArgs(req.query);
    const result = await callMcpReportTool('get_org_overview_report', args, req);
    res.json(result);
  } catch (e) {
    return handleToolError(res, e);
  }
});

r.get('/reports/org-overview/text', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const args = queryToReportArgs(req.query);
    const result = await callMcpReportTool('format_org_overview_report_text', args, req);
    res.json(result);
  } catch (e) {
    return handleToolError(res, e);
  }
});

module.exports = r;
