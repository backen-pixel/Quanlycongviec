/**
 * MCP Gateway — logic dùng chung cho /api/mcp (OpenClaw / agent bên ngoài).
 * Báo cáo tổ chức dùng cùng engine với trang «Báo cáo theo tổ chức» và AI bot.
 */
const { supabase } = require('../config/supabase');
const { isSystemAdmin } = require('./adminRole');
const { OPENAI_TOOL_DEFINITIONS, executeTool } = require('./aiReportTools');

/** Tool báo cáo được phép qua MCP (không expose quản trị bot / skill). */
const MCP_REPORT_TOOL_NAMES = [
  'get_org_overview_report',
  'get_org_overview_report_full',
  'format_org_overview_report_text',
  'format_org_employee_tab_report_text',
  'format_all_employees_report_text',
  'get_employee_activity_report',
  'format_employee_activity_report_text',
  'get_employee_leads_drill',
  'get_employee_breakdown',
  'list_departments_in_company',
  'list_employees_in_scope',
  'list_companies_in_scope',
  'get_overdue_breakdown',
  'resolve_time_range',
];

const MCP_REPORT_TOOL_SET = new Set(MCP_REPORT_TOOL_NAMES);

const FULL_ORG_REPORT_SCHEMA = {
  type: 'object',
  description:
    'Kỳ báo cáo do client (OpenClaw) truyền mỗi request — không cố định trên server. '
    + 'Ưu tiên date_from + date_to (YYYY-MM-DD); hoặc time_scope (+ days_offset tùy chọn).',
  properties: {
    company_id: { type: 'string', description: 'UUID công ty (mặc định theo API key / user)' },
    region_id: { type: 'string', description: 'Lọc khu vực' },
    department_id: { type: 'string', description: 'Lọc phòng ban' },
    assigned_to: { type: 'string', description: 'Lọc 1 NV (user_id)' },
    date_from: {
      type: 'string',
      description: 'YYYY-MM-DD — đầu kỳ (client gửi). Ưu tiên hơn time_scope.',
    },
    date_to: {
      type: 'string',
      description: 'YYYY-MM-DD — cuối kỳ (client gửi). Bắt buộc kèm date_from.',
    },
    time_scope: {
      type: 'string',
      enum: ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'custom'],
      description: 'Preset kỳ — chỉ khi client không gửi date_from/date_to',
    },
    days_offset: { type: 'integer', description: 'Dùng với time_scope=custom' },
    type: { type: 'string', enum: ['all', 'lead', 'deal'] },
    compare: { type: 'boolean', description: 'So kỳ trước (mặc định true)' },
    deal_kh_split: { type: 'boolean', description: 'Tách Deal / Đơn hàng' },
  },
};

function openAiToolToMcp(def) {
  const fn = def.function || def;
  return {
    name: fn.name,
    description: fn.description || '',
    inputSchema: fn.parameters || { type: 'object', properties: {} },
  };
}

function getMcpReportTools() {
  const fromOpenAi = OPENAI_TOOL_DEFINITIONS
    .filter((d) => MCP_REPORT_TOOL_SET.has(d.function?.name))
    .map(openAiToolToMcp);

  const fullTool = {
    name: 'get_org_overview_report_full',
    description:
      'JSON đầy đủ báo cáo tổ chức — khớp GET /crm/reports/org-overview. '
      + 'Client (OpenClaw) tự chọn kỳ mỗi lần gọi: truyền date_from + date_to, hoặc time_scope. Cơ sở created_at.',
    inputSchema: FULL_ORG_REPORT_SCHEMA,
  };

  const periodNote = ' Kỳ BC do client request (date_from/date_to hoặc time_scope) — không cấu hình sẵn trên gateway.';
  const patched = fromOpenAi.map((t) => {
    if (!['get_org_overview_report', 'format_org_overview_report_text', 'format_org_employee_tab_report_text', 'format_all_employees_report_text'].includes(t.name)) {
      return t;
    }
    return {
      ...t,
      description: `${t.description || ''}${periodNote}`.trim(),
      inputSchema: {
        ...FULL_ORG_REPORT_SCHEMA,
        ...(t.inputSchema?.required ? { required: t.inputSchema.required } : {}),
      },
    };
  });

  const names = new Set(patched.map((t) => t.name));
  if (!names.has(fullTool.name)) patched.unshift(fullTool);
  return patched;
}

async function resolveMcpActAsUser(req) {
  const userId = String(req.headers['x-user-id'] || req.apiKey?.default_assigned_to || '').trim();
  if (!userId) {
    const err = new Error(
      'Thiếu user context: cấu hình default_assigned_to trên API key hoặc header X-User-Id',
    );
    err.status = 400;
    throw err;
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, full_name, role, company_id, department_id, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!user || user.is_active === false) {
    const err = new Error('X-User-Id / default_assigned_to không hợp lệ hoặc user đã tắt');
    err.status = 400;
    throw err;
  }

  const keyCompanyId = req.apiKey?.company_id || null;
  if (keyCompanyId && user.company_id && String(user.company_id) !== String(keyCompanyId)) {
    if (!isSystemAdmin(user)) {
      const err = new Error('User phải thuộc cùng công ty với API key');
      err.status = 403;
      throw err;
    }
  }

  return user;
}

function buildMcpToolContext(req, user) {
  const keyCompanyId = req.apiKey?.company_id || null;
  return {
    sender_user_id: user.id,
    personal_recipient_user_id: user.id,
    last_company_id: keyCompanyId || user.company_id || null,
    days_offset: 0,
    mcp_api_key_name: req.apiKey?.name || null,
  };
}

function normalizeReportArgs(args = {}, ctx) {
  const out = { ...args };
  if (!out.company_id && ctx.last_company_id) {
    out.company_id = ctx.last_company_id;
  }
  return out;
}

function assertCompanyScope(args, apiKey) {
  const keyCompanyId = apiKey?.company_id;
  if (!keyCompanyId || !args?.company_id) return;
  if (String(args.company_id) !== String(keyCompanyId)) {
    const err = new Error('company_id phải trùng công ty gắn với API key');
    err.status = 403;
    throw err;
  }
}

async function callMcpReportTool(name, args = {}, req) {
  if (!MCP_REPORT_TOOL_SET.has(name)) {
    const err = new Error(`Tool không được phép: ${name}`);
    err.status = 404;
    throw err;
  }

  const user = await resolveMcpActAsUser(req);
  const ctx = buildMcpToolContext(req, user);
  const merged = normalizeReportArgs(args, ctx);
  assertCompanyScope(merged, req.apiKey);

  if (name === 'get_org_overview_report_full') {
    const { getOrgOverviewReportFull } = require('./orgOverviewReportAi');
    return getOrgOverviewReportFull({
      ...merged,
      ctx_user_id: user.id,
    });
  }

  return executeTool(name, merged, ctx);
}

function queryToReportArgs(query = {}) {
  const args = {};
  const copy = [
    'company_id', 'region_id', 'department_id', 'assigned_to',
    'time_scope', 'date_from', 'date_to', 'type',
  ];
  copy.forEach((k) => {
    if (query[k] != null && String(query[k]).trim() !== '') args[k] = String(query[k]).trim();
  });
  if (query.days_offset != null && query.days_offset !== '') {
    args.days_offset = parseInt(query.days_offset, 10) || 0;
  }
  if (query.compare === '0' || query.compare === 'false') args.compare = false;
  if (query.deal_kh_split === '1' || query.deal_kh_split === 'true') args.deal_kh_split = true;
  return args;
}

module.exports = {
  MCP_REPORT_TOOL_NAMES,
  getMcpReportTools,
  resolveMcpActAsUser,
  callMcpReportTool,
  queryToReportArgs,
};
