/**
 * MCP module read bridge — mở rộng MCP ra ngoài CRM.
 *
 * VÌ SAO KHÔNG VIẾT 80 TOOL ALIAS
 * Hệ thống có ~97 route GET ngoài CRM (sản xuất, vận chuyển, kế toán, dự án, nhiệm vụ, KPI,
 * sự kiện). Mỗi route một tool thì `tools/list` nhảy từ 50 lên ~150. Hai hậu quả đã biết:
 * model chọn sai tool hẳn lên khi danh sách quá dài, và riêng phần mô tả tool đã ngốn hàng
 * nghìn token ở MỌI lượt hỏi. Nên mỗi module chỉ một cổng đọc `<module>_api_get`, whitelist
 * nằm ngay trong mô tả tool để model tự biết gọi path nào. 7 tool, phủ 82 endpoint.
 *
 * AN TOÀN
 * - Chỉ GET. Không có đường ghi.
 * - Whitelist theo regex từng module; path ngoài danh sách bị từ chối 404.
 * - Đi qua ĐÚNG router Express thật với JWT act-as, nên mọi middleware phân quyền sẵn có
 *   vẫn chạy — cầu nối này không mở cửa sau.
 * - Scope riêng từng module (`production_read`, `accounting_read`, …). Key cũ KHÔNG tự nhiên
 *   có thêm quyền: mặc định vẫn chỉ `reports` + `crm_read`, module mới phải bật tay.
 * - Kết quả còn đi qua lưới lọc công ty ở mcpGateway trước khi ra khỏi server.
 *
 * CỐ Ý BỎ RA NGOÀI WHITELIST
 * - `/accounting/bank-accounts` — số tài khoản ngân hàng, không có lý do gì để trợ lý đọc.
 * - `/accounting/export`, `/projects/:id/cost-excel` — sinh tệp, vô nghĩa qua MCP.
 * - `/*\/handover-settings/*`, `/*\/workshop-type-staff-defaults/*` — cấu hình, không phải dữ liệu.
 * - `/*\/notifications/comments*` — hộp thông báo cá nhân của user act-as, nhiễu.
 * - `/logistics/trash` — thùng rác.
 */
const {
  signActAsJwt, createMockRes, stringifyQuery, truncatePayload, isPathDenied,
} = require('./mcpCrmReadBridge');

const UUID = '[0-9a-fA-F-]{36}';
const ANYID = '[^/]+';

/** Mỗi module: tiền tố URL, đường dẫn router, scope, và whitelist path. */
const MODULES = {
  production: {
    nhan: 'Sản xuất (xưởng)',
    prefix: '/api/production',
    router: '../routes/production',
    scope: 'production_read',
    paths: [
      '/dashboard', '/projects', '/projects/:id', '/projects/:id/workshop-placements',
      '/projects/:id/participant-companies', '/projects/:id/task-bootstrap',
      '/projects/:id/incidents', '/pipeline-stages', '/substage-status',
      '/external-companies', '/client-companies', '/schedule-config',
      '/workshop-options', '/deadline-bucket-page', '/task-templates',
      '/cost-types', '/planner/me',
    ],
  },
  logistics: {
    nhan: 'Vận chuyển – Lắp đặt',
    prefix: '/api/logistics',
    router: '../routes/logistics',
    scope: 'logistics_read',
    paths: [
      '/dashboard', '/overview-kpis', '/pipeline-stages',
      '/projects', '/projects/:id', '/projects/:id/incidents',
    ],
  },
  accounting: {
    nhan: 'Kế toán',
    prefix: '/api/accounting',
    router: '../routes/accounting',
    scope: 'accounting_read',
    paths: [
      '/summary', '/deals', '/deals/:id', '/deals/:id/checklist',
      '/deals/:id/phat-sinh', '/deals/:id/payment-stages', '/deals/:id/payments',
      '/receivables', '/workshops', '/regions',
    ],
  },
  projects: {
    nhan: 'Dự án',
    prefix: '/api/projects',
    router: '../routes/projects',
    scope: 'projects_read',
    paths: [
      '/', '/:id', '/:id/orders', '/:id/cashflow', '/:id/cost-summary',
      '/:id/tong-ket', '/:id/documents', '/:id/task-files', '/:id/activities',
      '/:id/products', '/:id/workflow-lines', '/:id/comments',
      '/latest-comments', '/pending-approvals',
    ],
  },
  tasks: {
    nhan: 'Nhiệm vụ',
    prefix: '/api/tasks',
    router: '../routes/tasks',
    scope: 'tasks_read',
    paths: [
      '/', '/my', '/overdue', '/:id', '/:id/checklists', '/:id/comments',
      '/:id/attachments', '/:id/time-logs', '/:id/participants', '/planner/board',
    ],
  },
  kpi: {
    nhan: 'KPI',
    prefix: '/api/kpi',
    router: '../routes/kpi',
    scope: 'kpi_read',
    paths: [
      '/users', '/definitions', '/periods', '/scores', '/scorecard', '/leaderboard',
      '/targets', '/deal-scores', '/lead-ledger/:id', '/lead-trace',
      '/pipeline-mapping', '/company-overview', '/dashboard/sales-admin',
      '/dashboard/deal', '/business-hours', '/holidays', '/leaves',
    ],
  },
  events: {
    nhan: 'Sự kiện / lịch',
    prefix: '/api/events',
    router: '../routes/events',
    scope: 'events_read',
    paths: [
      '/', '/:id', '/:id/comments', '/event-types', '/overview', '/map',
      '/calendar', '/install-schedule', '/module-owners',
    ],
  },
};

/** '/projects/:id/orders' -> /^\/projects\/<id>\/orders$/ */
function pathToRegex(p) {
  if (p === '/') return /^\/$/;
  const than = p
    .split('/')
    .map((seg) => {
      if (!seg) return '';
      if (seg === ':id') return `(?:${UUID}|${ANYID})`;
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${than}$`);
}

for (const m of Object.values(MODULES)) {
  m.regexes = m.paths.map(pathToRegex);
  m.help = m.paths.join(', ');
}

function normalizePath(prefix, path) {
  let p = String(path || '').trim();
  if (!p) return '';
  const bo = prefix.replace('/api', '');
  p = p.replace(new RegExp(`^/api${bo}`, 'i'), '').replace(new RegExp(`^${bo}`, 'i'), '');
  if (!p.startsWith('/')) p = `/${p}`;
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function assertModulePath(moduleKey, path) {
  const m = MODULES[moduleKey];
  if (!m) {
    const e = new Error(`Module không hợp lệ: ${moduleKey}`);
    e.status = 400;
    throw e;
  }
  const p = normalizePath(m.prefix, path) || '/';
  if (isPathDenied(p)) {
    const e = new Error(`Path không được phép qua MCP: ${p}`);
    e.status = 403;
    throw e;
  }
  if (!m.regexes.some((re) => re.test(p))) {
    const e = new Error(`Path không nằm trong whitelist ${moduleKey}: ${p}. Cho phép: ${m.help}`);
    e.status = 404;
    throw e;
  }
  return p;
}

/** Gọi một GET của module qua router thật, với JWT act-as. Khớp invokeCrmGet. */
async function invokeModuleGet({ moduleKey, path, query = {}, user }) {
  const m = MODULES[moduleKey];
  const safePath = assertModulePath(moduleKey, path);
  if (!user?.id) {
    const e = new Error('Thiếu user act-as');
    e.status = 400;
    throw e;
  }

  const token = await signActAsJwt(user);
  const q = stringifyQuery(query);
  const qs = new URLSearchParams(q).toString();
  const url = qs ? `${safePath}?${qs}` : safePath;

  const req = {
    method: 'GET',
    url,
    originalUrl: `${m.prefix}${url}`,
    baseUrl: '',
    path: safePath,
    query: q,
    params: {},
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    get(name) {
      const k = String(name || '').toLowerCase();
      if (k === 'authorization') return this.headers.authorization;
      return this.headers[k];
    },
    header(name) { return this.get(name); },
    ip: '127.0.0.1',
  };

  const res = createMockRes();
  const router = require(m.router);

  await new Promise((resolve, reject) => {
    let xong = false;
    const finish = () => { if (!xong) { xong = true; resolve(); } };
    res._onFinish = finish;
    try {
      router.handle(req, res, (err) => {
        if (err) {
          if (!xong) { xong = true; reject(err); }
          return;
        }
        finish();
      });
    } catch (e) {
      if (!xong) { xong = true; reject(e); }
    }
    setTimeout(() => {
      if (!xong) {
        xong = true;
        reject(Object.assign(new Error(`${moduleKey} GET timeout (30s)`), { status: 504 }));
      }
    }, 30_000);
  });

  const status = res.statusCode || 200;
  const data = truncatePayload(res.body);
  if (status >= 400) {
    const msg = data?.error || data?.message || `${moduleKey} GET ${safePath} → HTTP ${status}`;
    const e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    e.status = status;
    e.data = data;
    throw e;
  }
  return { status, data, path: safePath, module: moduleKey };
}

const MCP_MODULE_TOOLS = Object.entries(MODULES).map(([key, m]) => ({
  name: `${key}_api_get`,
  description:
    `Đọc dữ liệu module ${m.nhan} (GET ${m.prefix}). `
    + `Path cho phép: ${m.help}. `
    + 'Tham số lọc truyền qua `query` (vd company_id, date_from, date_to, limit).',
  inputSchema: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', description: `Path tương đối, vd ${m.paths[0]}` },
      query: { type: 'object', description: 'Tham số query dạng key/value' },
    },
  },
}));

const MCP_MODULE_TOOL_SET = new Set(MCP_MODULE_TOOLS.map((t) => t.name));
const MCP_MODULE_SCOPES = Object.fromEntries(
  Object.entries(MODULES).map(([k, m]) => [`${k}_api_get`, m.scope]),
);

function getMcpModuleTools() {
  return MCP_MODULE_TOOLS.map((t) => ({ ...t }));
}

async function callMcpModuleTool(name, args = {}, user) {
  const moduleKey = String(name).replace(/_api_get$/, '');
  if (!MODULES[moduleKey]) {
    const e = new Error(`Tool module không được phép: ${name}`);
    e.status = 404;
    throw e;
  }
  return invokeModuleGet({ moduleKey, path: args?.path, query: args?.query || {}, user });
}

module.exports = {
  MODULES,
  MCP_MODULE_TOOL_SET,
  MCP_MODULE_SCOPES,
  getMcpModuleTools,
  callMcpModuleTool,
  invokeModuleGet,
  assertModulePath,
};
