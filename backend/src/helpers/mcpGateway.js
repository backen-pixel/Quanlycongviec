/**
 * MCP Gateway — logic dùng chung cho /api/mcp (OpenClaw / agent bên ngoài).
 * Báo cáo tổ chức + CRM GET (bridge) dùng quyền user act-as.
 */
const { supabase } = require('../config/supabase');
const { isAdminLike, isSystemAdmin } = require('./adminRole');
const { OPENAI_TOOL_DEFINITIONS, executeTool } = require('./aiReportTools');
const {
  MCP_CRM_READ_TOOL_SET,
  getMcpCrmReadTools,
  callMcpCrmReadTool,
} = require('./mcpCrmReadBridge');

/** Role được xem BC đầy đủ trong phạm vi công ty (không ép assigned_to = self). */
const MCP_ORG_WIDE_ROLES = new Set([
  'admin', 'sales_admin', 'platform_admin',
  'manager', 'director', 'supervisor', 'region_admin',
  'superadmin', 'super_admin',
]);

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isMcpOrgWideViewer(user) {
  if (isAdminLike(user) || isSystemAdmin(user)) return true;
  return MCP_ORG_WIDE_ROLES.has(normalizeRole(user?.role));
}

/** Danh sách company_id key được phép — null = tất cả. */
function getKeyAllowedCompanyIds(apiKey) {
  if (apiKey?.company_id) return [String(apiKey.company_id)];
  const list = Array.isArray(apiKey?.allowed_company_ids)
    ? apiKey.allowed_company_ids.map((x) => String(x)).filter(Boolean)
    : [];
  return list.length ? list : null;
}

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
  // Đọc CRM thêm (AI tools sẵn có)
  'find_users_by_name',
  'list_pipelines_for_company',
  'get_pipeline_breakdown',
  'get_company_lead_summary',
  'format_company_report_text',
  'get_lead_deal_risk_report',
  'format_lead_deal_risk_text',
  'get_user_profile_card',
  'resolve_assignee_scope',
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

function getMcpReportTools(apiKey = null) {
  const scopes = Array.isArray(apiKey?.mcp_scopes) && apiKey.mcp_scopes.length
    ? apiKey.mcp_scopes
    : ['reports', 'crm_read'];
  const allowReports = scopes.includes('reports');
  const allowCrm = scopes.includes('crm_read');

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

  // CRM GET tools (bridge)
  for (const t of getMcpCrmReadTools()) {
    if (!names.has(t.name)) {
      patched.push(t);
      names.add(t.name);
    }
  }

  return patched.filter((t) => {
    if (MCP_CRM_READ_TOOL_SET.has(t.name)) return allowCrm;
    return allowReports;
  });
}

function assertMcpScopeForTool(name, apiKey) {
  const scopes = Array.isArray(apiKey?.mcp_scopes) && apiKey.mcp_scopes.length
    ? apiKey.mcp_scopes
    : ['reports', 'crm_read'];
  if (MCP_CRM_READ_TOOL_SET.has(name)) {
    if (!scopes.includes('crm_read')) {
      const err = new Error('API key không có quyền crm_read');
      err.status = 403;
      throw err;
    }
    return;
  }
  if (MCP_REPORT_TOOL_SET.has(name) || name === 'get_org_overview_report_full') {
    if (!scopes.includes('reports')) {
      const err = new Error('API key không có quyền reports');
      err.status = 403;
      throw err;
    }
  }
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
    .select('id, email, full_name, role, company_id, department_id, tenant_id, is_active')
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
  const allowed = getKeyAllowedCompanyIds(req.apiKey);
  const keyCompanyId = req.apiKey?.company_id
    || (allowed?.length === 1 ? allowed[0] : null)
    || null;
  return {
    sender_user_id: user.id,
    personal_recipient_user_id: user.id,
    last_company_id: keyCompanyId || user.company_id || null,
    days_offset: 0,
    mcp_api_key_name: req.apiKey?.name || null,
    mcp_all_companies: !getKeyAllowedCompanyIds(req.apiKey),
    mcp_allowed_company_ids: getKeyAllowedCompanyIds(req.apiKey),
    mcp_org_wide: isMcpOrgWideViewer(user),
  };
}

function normalizeReportArgs(args = {}, ctx) {
  const out = { ...args };
  if (!out.company_id && ctx.last_company_id) {
    out.company_id = ctx.last_company_id;
  }
  return out;
}

/** Nhân viên thường → chỉ data của chính mình. Admin/sales_admin/manager… → xem cả phạm vi. */
function applyActAsVisibility(args = {}, user) {
  if (isMcpOrgWideViewer(user)) return { ...args };
  return { ...args, assigned_to: String(user.id) };
}

function assertCompanyScope(args, apiKey) {
  const cid = args?.company_id;
  if (!cid) return;
  const allowed = getKeyAllowedCompanyIds(apiKey);
  if (!allowed) return; // tất cả công ty
  if (!allowed.includes(String(cid))) {
    const err = new Error('company_id không nằm trong danh sách công ty được phép của API key');
    err.status = 403;
    throw err;
  }
}

function isMcpToolAllowed(name) {
  return MCP_REPORT_TOOL_SET.has(name) || MCP_CRM_READ_TOOL_SET.has(name);
}

async function callMcpReportTool(name, args = {}, req) {
  if (!isMcpToolAllowed(name)) {
    const err = new Error(`Tool không được phép: ${name}`);
    err.status = 404;
    throw err;
  }

  assertMcpScopeForTool(name, req.apiKey);

  const user = await resolveMcpActAsUser(req);
  const ctx = buildMcpToolContext(req, user);
  let merged = normalizeReportArgs(args, ctx);
  merged = applyActAsVisibility(merged, user);
  assertCompanyScope(merged, req.apiKey);

  // Với key chọn nhiều công ty: nếu chưa truyền company_id và có đúng 1 công ty → mặc định
  const allowed = getKeyAllowedCompanyIds(req.apiKey);
  if (!merged.company_id && allowed?.length === 1) {
    merged.company_id = allowed[0];
  }

  if (MCP_CRM_READ_TOOL_SET.has(name)) {
    // Default company_id từ key cho alias list (không ghi đè path crm_api_get)
    if (name !== 'crm_api_get' && !merged.company_id && ctx.last_company_id) {
      merged.company_id = ctx.last_company_id;
    }
    if (name === 'crm_api_get' && merged.query && typeof merged.query === 'object') {
      const q = { ...merged.query };
      if (!q.company_id && ctx.last_company_id) q.company_id = ctx.last_company_id;
      assertCompanyScope(q, req.apiKey);
      merged.query = q;
    }
    return callMcpCrmReadTool(name, merged, user);
  }

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
