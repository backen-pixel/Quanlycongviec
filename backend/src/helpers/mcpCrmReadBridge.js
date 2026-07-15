/**
 * MCP CRM read bridge — gọi GET handler CRM qua Express router + JWT act-as.
 * Chỉ whitelist path đọc; không expose POST/PUT/PATCH/DELETE.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { resolveCompanyId, resolveCrmRegionIds } = require('./authSession');

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MAX_JSON_BYTES = 256 * 1024;
const MAX_ARRAY_ITEMS = 200;
const JWT_TTL_SEC = 120;

/** Path GET CRM được phép qua MCP (khớp router crm.js, không có prefix /api/crm). */
const CRM_GET_WHITELIST = [
  new RegExp(`^/pipelines$`),
  new RegExp(`^/pipelines/${UUID}$`),
  new RegExp(`^/pipeline-stages$`),
  new RegExp(`^/sources$`),
  new RegExp(`^/lead-types$`),
  new RegExp(`^/company-regions$`),
  new RegExp(`^/employees-by-company$`),
  new RegExp(`^/referrers$`),
  new RegExp(`^/leads$`),
  new RegExp(`^/leads/${UUID}$`),
  new RegExp(`^/leads/${UUID}/detail$`),
  new RegExp(`^/leads/${UUID}/tasks$`),
  new RegExp(`^/leads/${UUID}/activities$`),
  new RegExp(`^/leads/${UUID}/documents$`),
  new RegExp(`^/leads/${UUID}/task-documents$`),
  new RegExp(`^/leads/${UUID}/deadline-history$`),
  new RegExp(`^/leads/${UUID}/project-setup$`),
  new RegExp(`^/stage-counts$`),
  new RegExp(`^/leads-deadlines$`),
  new RegExp(`^/kanban-bootstrap$`),
  new RegExp(`^/web-dashboard-bootstrap$`),
  new RegExp(`^/dashboard$`),
  new RegExp(`^/customers$`),
  new RegExp(`^/customers-overview$`),
  new RegExp(`^/customers-overview/${UUID}$`),
  new RegExp(`^/quotations$`),
  new RegExp(`^/quotations/${UUID}$`),
  new RegExp(`^/quotations/${UUID}/history$`),
  new RegExp(`^/orders$`),
  new RegExp(`^/orders/${UUID}$`),
  new RegExp(`^/invoices$`),
  new RegExp(`^/invoices/${UUID}$`),
  new RegExp(`^/tasks/overview$`),
  new RegExp(`^/tasks/planner$`),
  new RegExp(`^/reports/staff-lead-deal$`),
  new RegExp(`^/reports/org-activity-feed$`),
  new RegExp(`^/reports/org-overview$`),
  new RegExp(`^/reports/org-overview/survey-visits$`),
  new RegExp(`^/ledger-net-by-leads$`),
  new RegExp(`^/contract-signed-revenue$`),
  new RegExp(`^/project/${UUID}/summary$`),
  new RegExp(`^/project/${UUID}/lead-documents$`),
];

const ALLOWED_PATHS_HELP = [
  '/pipelines', '/pipelines/:id', '/pipeline-stages', '/sources', '/lead-types',
  '/company-regions', '/employees-by-company', '/referrers',
  '/leads', '/leads/:id', '/leads/:id/detail', '/leads/:id/tasks',
  '/leads/:id/activities', '/leads/:id/documents', '/leads/:id/task-documents',
  '/leads/:id/deadline-history', '/leads/:id/project-setup',
  '/stage-counts', '/leads-deadlines', '/kanban-bootstrap', '/web-dashboard-bootstrap', '/dashboard',
  '/customers', '/customers-overview', '/customers-overview/:id',
  '/quotations', '/quotations/:id', '/quotations/:id/history',
  '/orders', '/orders/:id', '/invoices', '/invoices/:id',
  '/tasks/overview', '/tasks/planner',
  '/reports/staff-lead-deal', '/reports/org-activity-feed',
  '/reports/org-overview', '/reports/org-overview/survey-visits',
  '/ledger-net-by-leads', '/contract-signed-revenue',
  '/project/:id/summary', '/project/:id/lead-documents',
].join(', ');

function normalizeCrmPath(path) {
  let p = String(path || '').trim();
  if (!p) return '';
  // Cho phép client gửi /api/crm/... hoặc crm/...
  p = p.replace(/^\/api\/crm/i, '').replace(/^\/crm/i, '');
  if (!p.startsWith('/')) p = `/${p}`;
  // Bỏ query string nếu dính vào path
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  // Collapse //
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function isPathDenied(path) {
  const lower = path.toLowerCase();
  if (lower.includes('/admin')) return true;
  if (lower.endsWith('.pdf') || lower.includes('/export')) return true;
  if (lower.includes('zalo')) return true;
  if (lower.includes('misa')) return true;
  if (lower.includes('scan-duplicates')) return true;
  if (lower.includes('/settings/')) return true;
  return false;
}

function assertCrmGetPath(path) {
  const p = normalizeCrmPath(path);
  if (!p) {
    const err = new Error('Thiếu path CRM (vd: /leads, /pipelines)');
    err.status = 400;
    throw err;
  }
  if (isPathDenied(p)) {
    const err = new Error(`Path không được phép qua MCP: ${p}`);
    err.status = 403;
    throw err;
  }
  if (!CRM_GET_WHITELIST.some((re) => re.test(p))) {
    const err = new Error(
      `Path không nằm trong whitelist GET CRM: ${p}. Cho phép: ${ALLOWED_PATHS_HELP}`,
    );
    err.status = 404;
    throw err;
  }
  return p;
}

function truncatePayload(data) {
  if (data == null) return data;
  if (Array.isArray(data)) {
    if (data.length <= MAX_ARRAY_ITEMS) return data;
    return {
      items: data.slice(0, MAX_ARRAY_ITEMS),
      _truncated: true,
      _total_items: data.length,
      _returned: MAX_ARRAY_ITEMS,
    };
  }
  if (typeof data === 'object') {
    // Phổ biến: { data: [...], total } hoặc { leads: [...] }
    const out = { ...data };
    for (const key of ['data', 'leads', 'items', 'rows', 'results', 'quotations', 'deals', 'customers']) {
      if (Array.isArray(out[key]) && out[key].length > MAX_ARRAY_ITEMS) {
        out[key] = out[key].slice(0, MAX_ARRAY_ITEMS);
        out._truncated = true;
        out._truncated_field = key;
        out._total_items = data[key].length;
        out._returned = MAX_ARRAY_ITEMS;
      }
    }
    let json;
    try {
      json = JSON.stringify(out);
    } catch {
      return { error: 'Không serialize được response CRM' };
    }
    if (json.length <= MAX_JSON_BYTES) return out;
    return {
      _truncated: true,
      _reason: `Response > ${MAX_JSON_BYTES} bytes`,
      _bytes: json.length,
      preview: json.slice(0, Math.min(8000, MAX_JSON_BYTES / 4)),
    };
  }
  return data;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    headers: Object.create(null),
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[String(k).toLowerCase()];
    },
    removeHeader(k) {
      delete this.headers[String(k).toLowerCase()];
      return this;
    },
    set(k, v) {
      if (k && typeof k === 'object') {
        Object.entries(k).forEach(([hk, hv]) => this.setHeader(hk, hv));
        return this;
      }
      return this.setHeader(k, v);
    },
    get(k) {
      return this.getHeader(k);
    },
    type() {
      return this;
    },
    json(obj) {
      this.headersSent = true;
      this.body = obj;
      if (typeof this._onFinish === 'function') this._onFinish();
      return this;
    },
    send(payload) {
      this.headersSent = true;
      if (typeof payload === 'string') {
        try {
          this.body = JSON.parse(payload);
        } catch {
          this.body = payload;
        }
      } else {
        this.body = payload;
      }
      if (typeof this._onFinish === 'function') this._onFinish();
      return this;
    },
    end(payload) {
      if (payload !== undefined && this.body === undefined) {
        this.send(payload);
        return this;
      }
      this.headersSent = true;
      if (typeof this._onFinish === 'function') this._onFinish();
      return this;
    },
  };
  return res;
}

async function signActAsJwt(user) {
  const company_id = user.company_id || (await resolveCompanyId(user));
  const crm_region_ids = Array.isArray(user.crm_region_ids)
    ? user.crm_region_ids
    : await resolveCrmRegionIds(user.id);
  return jwt.sign(
    {
      userId: user.id,
      email: user.email || null,
      role: user.role,
      fullName: user.full_name || user.fullName || null,
      company_id: company_id || null,
      tenant_id: user.tenant_id || null,
      department_id: user.department_id || null,
      crm_region_ids: crm_region_ids || [],
      mcp_act_as: true,
    },
    config.jwtSecret,
    { expiresIn: JWT_TTL_SEC },
  );
}

function stringifyQuery(query = {}) {
  const out = {};
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v == null || v === '') return;
    if (typeof v === 'boolean') {
      out[k] = v ? '1' : '0';
      return;
    }
    out[k] = String(v);
  });
  return out;
}

/**
 * Gọi GET CRM nội bộ với quyền user act-as.
 * @returns {{ status: number, data: any }}
 */
async function invokeCrmGet({ path, query = {}, user }) {
  const safePath = assertCrmGetPath(path);
  if (!user?.id) {
    const err = new Error('Thiếu user act-as');
    err.status = 400;
    throw err;
  }

  const token = await signActAsJwt(user);
  const q = stringifyQuery(query);
  const qs = new URLSearchParams(q).toString();
  const url = qs ? `${safePath}?${qs}` : safePath;

  const req = {
    method: 'GET',
    url,
    originalUrl: `/api/crm${url}`,
    baseUrl: '',
    path: safePath,
    query: q,
    params: {},
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
    get(name) {
      const key = String(name || '').toLowerCase();
      if (key === 'authorization') return this.headers.authorization;
      return this.headers[key];
    },
    header(name) {
      return this.get(name);
    },
    ip: '127.0.0.1',
  };

  const res = createMockRes();
  const crmRouter = require('../routes/crm');

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    res._onFinish = finish;
    try {
      crmRouter.handle(req, res, (err) => {
        if (err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }
        finish();
      });
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(e);
      }
    }
    // Timeout phòng handler treo
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(Object.assign(new Error('CRM GET timeout (30s)'), { status: 504 }));
      }
    }, 30_000);
  });

  const status = res.statusCode || 200;
  const data = truncatePayload(res.body);
  if (status >= 400) {
    const msg = data?.error || data?.message || `CRM GET ${safePath} → HTTP ${status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = status;
    err.data = data;
    throw err;
  }
  return { status, data, path: safePath };
}

function pickQuery(args, keys) {
  const q = {};
  keys.forEach((k) => {
    if (args[k] != null && args[k] !== '') q[k] = args[k];
  });
  return q;
}

const ID_PROP = { type: 'string', description: 'UUID' };

const MCP_CRM_READ_TOOLS = [
  {
    name: 'crm_api_get',
    description:
      'Đọc bất kỳ GET CRM trong whitelist (path tương đối /api/crm). '
      + `Path cho phép: ${ALLOWED_PATHS_HELP}. `
      + 'Dùng khi không có tool alias phù hợp.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Path CRM, vd. /leads, /pipelines, /leads/{uuid}/detail',
        },
        query: {
          type: 'object',
          description: 'Query string (type, search, company_id, limit, offset, …)',
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: 'search_crm_leads',
    description: 'Tìm/list lead hoặc deal — GET /crm/leads (type=lead|deal).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['lead', 'deal'], description: 'Mặc định lead' },
        search: { type: 'string', description: 'Tìm tên / SĐT / mã' },
        stage_id: ID_PROP,
        assigned_to: ID_PROP,
        pipeline_id: ID_PROP,
        company_id: ID_PROP,
        region_id: ID_PROP,
        source_id: ID_PROP,
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'integer', description: 'Mặc định 50, tối đa 200' },
        offset: { type: 'integer' },
      },
    },
  },
  {
    name: 'get_crm_lead_detail',
    description: 'Chi tiết đầy đủ 1 lead/deal — GET /crm/leads/:id/detail.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'UUID lead/deal' } },
    },
  },
  {
    name: 'get_crm_stage_counts',
    description: 'Đếm lead/deal theo stage — GET /crm/stage-counts.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['lead', 'deal'] },
        pipeline_id: ID_PROP,
        company_id: ID_PROP,
        region_id: ID_PROP,
        assigned_to: ID_PROP,
      },
    },
  },
  {
    name: 'list_crm_pipelines',
    description: 'Danh sách pipeline CRM — GET /crm/pipelines.',
    inputSchema: {
      type: 'object',
      properties: { company_id: ID_PROP },
    },
  },
  {
    name: 'list_crm_pipeline_stages',
    description: 'Danh sách stage — GET /crm/pipeline-stages.',
    inputSchema: {
      type: 'object',
      properties: {
        pipeline_id: ID_PROP,
        company_id: ID_PROP,
      },
    },
  },
  {
    name: 'list_crm_customers',
    description: 'Danh sách khách hàng — GET /crm/customers.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        company_id: ID_PROP,
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
  },
  {
    name: 'list_crm_quotations',
    description: 'Danh sách báo giá — GET /crm/quotations.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: ID_PROP,
        company_id: ID_PROP,
        status: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
  },
  {
    name: 'get_crm_quotation',
    description: 'Chi tiết báo giá — GET /crm/quotations/:id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: ID_PROP },
    },
  },
  {
    name: 'list_crm_orders',
    description: 'Danh sách đơn hàng — GET /crm/orders.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: ID_PROP,
        company_id: ID_PROP,
        status: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
  },
  {
    name: 'get_crm_order',
    description: 'Chi tiết đơn hàng — GET /crm/orders/:id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: ID_PROP },
    },
  },
  {
    name: 'list_crm_invoices',
    description: 'Danh sách hóa đơn — GET /crm/invoices.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: ID_PROP,
        company_id: ID_PROP,
        status: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
  },
  {
    name: 'get_crm_invoice',
    description: 'Chi tiết hóa đơn — GET /crm/invoices/:id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: ID_PROP },
    },
  },
  {
    name: 'list_crm_lead_tasks',
    description: 'Tasks của 1 lead/deal — GET /crm/leads/:id/tasks.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'UUID lead/deal' } },
    },
  },
  {
    name: 'get_crm_lead_activities',
    description: 'Lịch sử hoạt động lead/deal — GET /crm/leads/:id/activities.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'UUID lead/deal' } },
    },
  },
  {
    name: 'list_crm_lead_documents',
    description: 'Tài liệu đính kèm lead/deal — GET /crm/leads/:id/documents.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'UUID lead/deal' } },
    },
  },
  {
    name: 'get_crm_dashboard',
    description: 'Dashboard CRM tổng quan — GET /crm/dashboard.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['lead', 'deal', 'all'] },
        company_id: ID_PROP,
        region_id: ID_PROP,
        date_from: { type: 'string' },
        date_to: { type: 'string' },
      },
    },
  },
  {
    name: 'get_crm_kanban_bootstrap',
    description: 'Bootstrap kanban CRM — GET /crm/kanban-bootstrap (limit gọn).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['lead', 'deal'] },
        pipeline_id: ID_PROP,
        company_id: ID_PROP,
        region_id: ID_PROP,
        limit: { type: 'integer', description: 'Mặc định 50' },
      },
    },
  },
];

const MCP_CRM_READ_TOOL_SET = new Set(MCP_CRM_READ_TOOLS.map((t) => t.name));

function getMcpCrmReadTools() {
  return MCP_CRM_READ_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

async function callMcpCrmReadTool(name, args = {}, user) {
  if (!MCP_CRM_READ_TOOL_SET.has(name)) {
    const err = new Error(`Tool CRM không được phép: ${name}`);
    err.status = 404;
    throw err;
  }

  const a = args || {};

  if (name === 'crm_api_get') {
    return invokeCrmGet({ path: a.path, query: a.query || {}, user });
  }
  if (name === 'search_crm_leads') {
    const limit = Math.min(Math.max(parseInt(a.limit, 10) || 50, 1), 200);
    return invokeCrmGet({
      path: '/leads',
      query: {
        ...pickQuery(a, [
          'type', 'search', 'stage_id', 'assigned_to', 'pipeline_id',
          'company_id', 'region_id', 'source_id', 'date_from', 'date_to', 'offset',
        ]),
        type: a.type || 'lead',
        limit,
      },
      user,
    });
  }
  if (name === 'get_crm_lead_detail') {
    return invokeCrmGet({ path: `/leads/${a.id}/detail`, query: {}, user });
  }
  if (name === 'get_crm_stage_counts') {
    return invokeCrmGet({
      path: '/stage-counts',
      query: pickQuery(a, ['type', 'pipeline_id', 'company_id', 'region_id', 'assigned_to']),
      user,
    });
  }
  if (name === 'list_crm_pipelines') {
    return invokeCrmGet({ path: '/pipelines', query: pickQuery(a, ['company_id']), user });
  }
  if (name === 'list_crm_pipeline_stages') {
    return invokeCrmGet({
      path: '/pipeline-stages',
      query: pickQuery(a, ['pipeline_id', 'company_id']),
      user,
    });
  }
  if (name === 'list_crm_customers') {
    return invokeCrmGet({
      path: '/customers',
      query: pickQuery(a, ['search', 'company_id', 'limit', 'offset']),
      user,
    });
  }
  if (name === 'list_crm_quotations') {
    return invokeCrmGet({
      path: '/quotations',
      query: pickQuery(a, ['lead_id', 'company_id', 'status', 'limit', 'offset']),
      user,
    });
  }
  if (name === 'get_crm_quotation') {
    return invokeCrmGet({ path: `/quotations/${a.id}`, query: {}, user });
  }
  if (name === 'list_crm_orders') {
    return invokeCrmGet({
      path: '/orders',
      query: pickQuery(a, ['lead_id', 'company_id', 'status', 'limit', 'offset']),
      user,
    });
  }
  if (name === 'get_crm_order') {
    return invokeCrmGet({ path: `/orders/${a.id}`, query: {}, user });
  }
  if (name === 'list_crm_invoices') {
    return invokeCrmGet({
      path: '/invoices',
      query: pickQuery(a, ['lead_id', 'company_id', 'status', 'limit', 'offset']),
      user,
    });
  }
  if (name === 'get_crm_invoice') {
    return invokeCrmGet({ path: `/invoices/${a.id}`, query: {}, user });
  }
  if (name === 'list_crm_lead_tasks') {
    return invokeCrmGet({ path: `/leads/${a.id}/tasks`, query: {}, user });
  }
  if (name === 'get_crm_lead_activities') {
    return invokeCrmGet({ path: `/leads/${a.id}/activities`, query: {}, user });
  }
  if (name === 'list_crm_lead_documents') {
    return invokeCrmGet({ path: `/leads/${a.id}/documents`, query: {}, user });
  }
  if (name === 'get_crm_dashboard') {
    return invokeCrmGet({
      path: '/dashboard',
      query: pickQuery(a, ['type', 'company_id', 'region_id', 'date_from', 'date_to']),
      user,
    });
  }
  if (name === 'get_crm_kanban_bootstrap') {
    const limit = Math.min(Math.max(parseInt(a.limit, 10) || 50, 1), 100);
    return invokeCrmGet({
      path: '/kanban-bootstrap',
      query: {
        ...pickQuery(a, ['type', 'pipeline_id', 'company_id', 'region_id']),
        limit,
      },
      user,
    });
  }

  const err = new Error(`Tool CRM chưa map: ${name}`);
  err.status = 500;
  throw err;
}

module.exports = {
  MCP_CRM_READ_TOOL_NAMES: MCP_CRM_READ_TOOLS.map((t) => t.name),
  MCP_CRM_READ_TOOL_SET,
  getMcpCrmReadTools,
  callMcpCrmReadTool,
  invokeCrmGet,
  assertCrmGetPath,
  ALLOWED_PATHS_HELP,
};
