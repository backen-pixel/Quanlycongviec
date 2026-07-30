/**
 * MCP API — Model Context Protocol chuẩn (Streamable HTTP).
 *
 * Transport (URL-token — khuyến nghị Cursor / Claude):
 *   POST /api/mcp/:connectId     — MCP endpoint (connectId = external_api_keys.id)
 *   GET  /api/mcp/:connectId     — Legacy HTTP+SSE
 *   GET  /api/mcp/:connectId/ping
 *
 * Transport (legacy — header X-Api-Key):
 *   POST /api/mcp
 *   GET  /api/mcp
 *   GET  /api/mcp/ping
 *
 * Act-as: X-User-Id hoặc default_assigned_to trên key.
 */
const { Router } = require('express');
const { apiKeyAuth, isUuid } = require('../middleware/apiKeyAuth');
const { mcpKeyRateLimit, MCP_RATE_LIMITS } = require('../helpers/mcpRateLimit');
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

/** Express 5 không hỗ trợ regex trong :param — lọc UUID bằng middleware */
function onlyUuidConnectId(req, res, next) {
  if (!isUuid(req.params.connectId)) return next('route');
  return next();
}

function applyMcpResponseHeaders(res, { sessionId, clientId, setSessionOnInit, setClientOnInit }, req = null) {
  res.set('Cache-Control', 'no-store');
  if (sessionId) res.set('Mcp-Session-Id', sessionId);
  if (clientId && (setClientOnInit || setSessionOnInit)) res.set('Mcp-Client-Id', clientId);
  const traceId = req?.mcpTraceId;
  if (traceId) res.set('Mcp-Trace-Id', String(traceId));
}

async function handleToolError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error('[MCP]', e.message);
  return res.status(status).json({ error: e.message || 'Lỗi MCP' });
}

/**
 * POST — MCP endpoint chuẩn (Streamable HTTP).
 * Mỗi request = một JSON-RPC message.
 */
async function mcpPostHandler(req, res) {
  try {
    const out = await handleMcpPost(req, req.body || {});
    applyMcpResponseHeaders(res, out, req);

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

/**
 * GET — Legacy HTTP+SSE (protocol 2024-11-05).
 * Client cũ mở SSE, nhận event `endpoint` trỏ về POST URL (giữ /{uuid} nếu có).
 */
function mcpSseHandler(req, res) {
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
}

function mcpPingHandler(req, res) {
  const connectId = req.params?.connectId || req.apiKey?.id || null;
  res.json({
    ok: true,
    mcp: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
    endpoint: connectId ? `POST /api/mcp/${connectId}` : 'POST /api/mcp',
    connect_url: connectId ? `/api/mcp/${connectId}` : null,
    rate_limits: MCP_RATE_LIMITS,
    mcp_scopes: req.apiKey?.mcp_scopes || ['reports', 'crm_read'],
    all_companies: !req.apiKey?.company_id,
    connection: {
      session_id: '(nhận sau initialize — header Mcp-Session-Id)',
      client_id: '(gửi Mcp-Client-Id hoặc params.client_id khi initialize)',
      flow: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'],
    },
    key_name: req.apiKey.name,
    company_id: req.apiKey.company_id,
    act_as_user: req.apiKey.default_assigned_to || null,
  });
}

function registerMcpHandlers(router) {
  router.post('/', mcpPostHandler);
  router.get('/', mcpSseHandler);
  router.post('/rpc', mcpPostHandler);
  router.get('/ping', mcpPingHandler);

  router.get('/tools', (req, res) => {
    res.json({ tools: getMcpReportTools(req.apiKey) });
  });

  router.post('/tools/call', async (req, res) => {
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

  router.get('/reports/org-overview', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const args = queryToReportArgs(req.query);
      const result = await callMcpReportTool('get_org_overview_report_full', args, req);
      res.json(result);
    } catch (e) {
      return handleToolError(res, e);
    }
  });

  router.get('/reports/org-overview/summary', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const args = queryToReportArgs(req.query);
      const result = await callMcpReportTool('get_org_overview_report', args, req);
      res.json(result);
    } catch (e) {
      return handleToolError(res, e);
    }
  });

  router.get('/reports/org-overview/text', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const args = queryToReportArgs(req.query);
      const result = await callMcpReportTool('format_org_overview_report_text', args, req);
      res.json(result);
    } catch (e) {
      return handleToolError(res, e);
    }
  });
}

/** /api/mcp/{uuid} — auth từ path (Cursor / Claude chỉ cần URL) */
const tokenRouter = Router({ mergeParams: true });
tokenRouter.use(apiKeyAuth);
tokenRouter.use(mcpKeyRateLimit);
registerMcpHandlers(tokenRouter);
r.use('/:connectId', onlyUuidConnectId, tokenRouter);

/** /api/mcp — legacy header/query auth */
r.use(apiKeyAuth);
r.use(mcpKeyRateLimit);
registerMcpHandlers(r);

module.exports = r;
