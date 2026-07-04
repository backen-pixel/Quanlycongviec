/**
 * MCP API Gateway — OpenClaw / agent bên ngoài lấy dữ liệu báo cáo CRM.
 *
 * Auth: header X-Api-Key (bảng external_api_keys), giống /api/external.
 * User context (quyền xem BC): default_assigned_to trên key, hoặc header X-User-Id.
 *
 * REST:
 *   GET  /api/mcp/ping
 *   GET  /api/mcp/tools
 *   POST /api/mcp/tools/call       { "name": "...", "arguments": { ... } }
 *   GET  /api/mcp/reports/org-overview?date_from=...&date_to=...
 *
 * JSON-RPC (MCP transport lite):
 *   POST /api/mcp/rpc
 *     { "jsonrpc":"2.0", "method":"tools/list", "id":1 }
 *     { "jsonrpc":"2.0", "method":"tools/call", "params":{ "name":"...", "arguments":{} }, "id":2 }
 */
const { Router } = require('express');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const {
  getMcpReportTools,
  callMcpReportTool,
  queryToReportArgs,
} = require('../helpers/mcpGateway');

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

r.use(apiKeyAuth);
r.use(mcpRateLimit);

async function handleToolError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error('[MCP]', e.message);
  return res.status(status).json({ error: e.message || 'Lỗi MCP' });
}

/** GET /api/mcp/ping */
r.get('/ping', (req, res) => {
  res.json({
    ok: true,
    gateway: 'mcp-report',
    key_name: req.apiKey.name,
    company_id: req.apiKey.company_id,
    act_as_user: req.apiKey.default_assigned_to || null,
    message: 'MCP report gateway — kỳ BC do client gửi (date_from/date_to hoặc time_scope mỗi request)',
  });
});

/** GET /api/mcp/tools — manifest cho OpenClaw MCP client */
r.get('/tools', (_req, res) => {
  res.json({
    protocol: 'mcp-report-gateway/1',
    tools: getMcpReportTools(),
  });
});

/** POST /api/mcp/tools/call */
r.post('/tools/call', async (req, res) => {
  try {
    const name = req.body?.name || req.body?.tool;
    const args = req.body?.arguments || req.body?.args || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name (tên tool)' });
    const result = await callMcpReportTool(String(name), args, req);
    res.json({ ok: true, tool: name, result });
  } catch (e) {
    return handleToolError(res, e);
  }
});

/** POST /api/mcp/rpc — JSON-RPC 2.0 (tools/list, tools/call) */
r.post('/rpc', async (req, res) => {
  const body = req.body || {};
  const id = body.id ?? null;
  const reply = (result, error = null) => {
    if (error) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: error.code || -32000, message: error.message },
      });
    }
    return res.json({ jsonrpc: '2.0', id, result });
  };

  if (body.jsonrpc && body.jsonrpc !== '2.0') {
    return reply(null, { code: -32600, message: 'Invalid Request — cần jsonrpc 2.0' });
  }

  const method = body.method;
  try {
    if (method === 'tools/list' || method === 'mcp/tools/list') {
      return reply({ tools: getMcpReportTools() });
    }
    if (method === 'tools/call' || method === 'mcp/tools/call') {
      const params = body.params || {};
      const name = params.name || params.tool;
      const args = params.arguments || params.args || {};
      if (!name) return reply(null, { code: -32602, message: 'Thiếu params.name' });
      const result = await callMcpReportTool(String(name), args, req);
      return reply({
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    }
    if (method === 'ping' || method === 'initialize') {
      return reply({
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'qlcv-mcp-report', version: '1.0.0' },
        capabilities: { tools: {} },
      });
    }
    return reply(null, { code: -32601, message: `Method not found: ${method}` });
  } catch (e) {
    const code = e.status === 403 ? -32003 : e.status === 400 ? -32602 : -32000;
    return reply(null, { code, message: e.message || 'Lỗi' });
  }
});

/**
 * GET /api/mcp/reports/org-overview
 * Shortcut REST — trả JSON đầy đủ như trang «Báo cáo theo tổ chức».
 */
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

/**
 * GET /api/mcp/reports/org-overview/summary
 * JSON gọn (get_org_overview_report) — phù hợp token/context nhỏ.
 */
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

/**
 * GET /api/mcp/reports/org-overview/text
 * Text đã format — gửi thẳng vào chat OpenClaw.
 */
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
