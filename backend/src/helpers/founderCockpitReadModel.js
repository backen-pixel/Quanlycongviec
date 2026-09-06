/**
 * Founder Cockpit V1 read model.
 *
 * This module only composes existing read models and SELECT-only source reads.
 * It never materializes a second business state and deliberately reports source
 * gaps instead of substituting demo or synthetic values.
 */
const { supabase } = require('../config/supabase');
const { getOrgOverviewReport } = require('./orgOverviewReportAi');
const {
  DONE_STATUSES,
  buildUnifiedTasksBaseQuery,
  resolveModuleKey,
} = require('./unifiedTasksQuery');
const { fetchAllPages } = require('./supabaseFetchAll');
const { normalizeModuleRow } = require('./appModuleRegistry');
const { buildAccountingSummary } = require('./accountingDeals');
const { isAdminLike } = require('./adminRole');
const { buildFounderPlatformCapabilities } = require('./founderPlatformCapabilities');

const CONTRACT_VERSION = 'founder_cockpit_v1';
const MODE = 'live_read_only';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MODULE_STATUSES = Object.freeze([
  'LIVE',
  'LIVE WITH DATA GAPS',
  'UNDER RECONCILIATION',
  'NOT CONNECTED',
  'BLOCKED',
  'SANDBOX',
  'FOUNDER DECISION REQUIRED',
]);

const PERIOD_KEYS = new Set(['week', 'month', 'quarter']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DONE_PROJECT_STATUSES = new Set(['completed', 'done', 'cancelled']);
const DONE_PROCUREMENT_STATUSES = new Set(['done', 'qc_pass', 'received']);
const CONNECTOR_POLICY = Object.freeze({
  timeout_ms: 15_000,
  failure_threshold: 3,
  circuit_open_ms: 30_000,
});
const CONNECTOR_TIMEOUT_MS = CONNECTOR_POLICY.timeout_ms;
const CONNECTOR_FAILURE_THRESHOLD = CONNECTOR_POLICY.failure_threshold;
const CONNECTOR_OPEN_MS = CONNECTOR_POLICY.circuit_open_ms;
const connectorCircuitState = new Map();

const FRESHNESS_STATES = Object.freeze(['FRESH', 'STALE', 'UNKNOWN', 'NOT_CONNECTED']);
const SOURCE_FRESHNESS_SLO_MINUTES = Object.freeze({
  crm_org_overview: 15,
  work_unified: 60,
  projects: 30,
  people: 60,
  procurement: 30,
  accounting_summary: 1440,
  project_approvals: 5,
  app_module_registry: 5,
  permissions: 5,
  warranty_care: 30,
});
const MODULE_FRESHNESS_SLO_MINUTES = Object.freeze({
  crm: 15,
  sales: 15,
  lead_deal: 15,
  commercial_documents: 15,
  projects: 30,
  work_unified: 15,
  procurement_purchasing: 30,
  production: 30,
  logistics: 30,
  accounting: 1440,
  warranty_care: 30,
  people_kpi: 1440,
  permissions: 5,
  approvals: 5,
  reporting: 60,
});

const DRILLDOWN_DEFINITIONS = Object.freeze([
  { key: 'crm', label: 'CRM / Lead / Deal', module_key: 'crm', href: '/crm/dashboard', contract_version: 'crm_live_v1' },
  { key: 'sales_report', label: 'Báo cáo Kinh doanh', module_key: 'crm', href: '/crm/reports/org-overview', contract_version: 'org_overview_v1' },
  { key: 'commercial_documents', label: 'Báo giá / Hợp đồng / Đơn hàng', module_key: 'crm', href: '/crm/quotations', contract_version: 'commercial_documents_v1' },
  { key: 'projects', label: 'Project / Work Unified', module_key: 'projects', href: '/management/work-unified', contract_version: 'work_unified_v1' },
  { key: 'purchasing', label: 'Procurement / Purchasing', module_key: 'purchasing', href: '/management/purchasing-overview', contract_version: 'procurement_read_v1' },
  { key: 'production', label: 'Sản xuất', module_key: 'production', href: '/sx/dashboard', contract_version: 'production_dashboard_v1' },
  { key: 'logistics', label: 'Giao hàng / Lắp đặt', module_key: 'logistics', href: '/vc/dashboard', contract_version: 'logistics_dashboard_v1' },
  { key: 'accounting', label: 'Kế toán', module_key: 'accounting', href: '/ketoan/dashboard', contract_version: 'accounting_summary_v1' },
  { key: 'approvals', label: 'Phê duyệt', module_key: 'approvals', href: '/approval-rules', contract_version: 'project_approvals_v1' },
  { key: 'people_kpi', label: 'Con người / KPI', module_key: 'kpi', href: '/crm/kpi/company', contract_version: 'people_kpi_v1' },
  { key: 'permissions', label: 'Phân quyền', module_key: 'permissions', href: '/ecosystem-permissions', contract_version: 'permission_v1' },
  { key: 'configuration', label: 'Cấu hình module', module_key: 'app_modules', href: '/ecosystem/app-modules', contract_version: 'app_module_registry_v1' },
]);

const MODULE_DEFINITIONS = Object.freeze([
  { key: 'crm', label: 'CRM', sources: ['crm'], drilldown: 'crm', registry_keys: ['crm'] },
  { key: 'sales', label: 'Sales', sources: ['crm'], drilldown: 'sales_report', registry_keys: ['crm'] },
  { key: 'lead_deal', label: 'Lead / Deal', sources: ['crm'], drilldown: 'crm', registry_keys: ['crm'] },
  {
    key: 'commercial_documents', label: 'Quotation / Contract / Order', sources: ['accounting'], drilldown: 'commercial_documents', registry_keys: ['crm'],
    known_gaps: ['Cockpit hiện dùng tổng hợp kế toán; trạng thái hợp đồng pháp lý và vòng đời báo giá/đơn hàng vẫn xem tại module gốc.'],
  },
  {
    key: 'projects', label: 'Project', sources: ['projects'], drilldown: 'projects', registry_keys: ['projects'],
    known_gaps: ['Chưa có một read model Project Health được phê duyệt bao phủ đầy đủ milestone và blocker liên miền.'],
  },
  { key: 'work_unified', label: 'Work Unified', sources: ['workload'], drilldown: 'projects', registry_keys: ['tasks'] },
  {
    key: 'procurement_purchasing', label: 'Procurement / Purchasing', sources: ['procurement'], drilldown: 'purchasing', registry_keys: ['purchasing'],
    known_gaps: ['Chỉ số cockpit hiện bao phủ purchase request; PO, nhận hàng và công nợ vẫn drill-down về module nguồn.'],
  },
  {
    key: 'production', label: 'Production', sources: ['projects'], drilldown: 'production', registry_keys: ['production'],
    known_gaps: ['Capacity mục tiêu và tiến độ chi tiết công đoạn chưa có hợp đồng định mức được phê duyệt.'],
  },
  {
    key: 'logistics', label: 'Logistics / Delivery / Installation', sources: ['projects'], drilldown: 'logistics', registry_keys: ['logistics'],
    known_gaps: ['Tổng hợp dùng mốc Project; bằng chứng nghiệm thu/lắp đặt chi tiết vẫn thuộc module Logistics.'],
  },
  { key: 'accounting', label: 'Accounting', sources: ['accounting'], drilldown: 'accounting', registry_keys: ['accounting'] },
  { key: 'warranty_care', label: 'Warranty / Care', sources: ['care'], drilldown: 'crm', registry_keys: ['customers'] },
  {
    key: 'people_kpi', label: 'People / KPI', sources: ['people', 'crm'], drilldown: 'people_kpi', registry_keys: ['tasks'],
    known_gaps: ['Workload có số người hoạt động nhưng chưa có định mức năng lực/phân bổ giờ được phê duyệt.'],
  },
  { key: 'permissions', label: 'Permission', sources: ['permissions'], drilldown: 'permissions', registry_keys: [] },
  { key: 'approvals', label: 'Approval', sources: ['approvals'], drilldown: 'approvals', registry_keys: [] },
  {
    key: 'reporting', label: 'Reporting', sources: ['crm', 'workload', 'projects', 'accounting'], drilldown: 'sales_report', registry_keys: [],
    known_gaps: ['Một số chỉ số liên miền chưa có signal dictionary và tolerance đối soát chính thức.'],
  },
]);

const SYSTEM_DEFINITIONS = Object.freeze([
  { key: 'market', label: 'Tư tưởng & Thị trường', module_keys: ['crm', 'sales', 'lead_deal'] },
  { key: 'solutions', label: 'Tư duy & Giải pháp', module_keys: ['commercial_documents', 'projects'] },
  { key: 'capacity', label: 'Nguồn lực & Năng lực', module_keys: ['work_unified', 'people_kpi'] },
  { key: 'operations', label: 'Vận hành & Giao giá trị', module_keys: ['projects', 'procurement_purchasing', 'production', 'logistics'] },
  { key: 'truth', label: 'Báo cáo & Sự thật', module_keys: ['accounting', 'approvals', 'reporting', 'permissions'] },
  { key: 'evolution', label: 'Sửa chữa & Tiến hóa', module_keys: ['warranty_care', 'reporting'] },
]);

class FounderCockpitError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function isUuid(value) {
  return UUID_RE.test(text(value));
}

function todayYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseYmd(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildPeriodRange(periodKey = 'week', anchorInput = null, now = new Date()) {
  const key = text(periodKey).toLowerCase() || 'week';
  if (!PERIOD_KEYS.has(key)) {
    throw new FounderCockpitError(400, 'BUSINESS_OS_PERIOD_INVALID', 'period chỉ nhận week, month hoặc quarter.');
  }
  const anchorYmd = text(anchorInput) || todayYmd(now);
  const anchor = parseYmd(anchorYmd);
  if (!anchor) {
    throw new FounderCockpitError(400, 'BUSINESS_OS_PERIOD_ANCHOR_INVALID', 'period_anchor phải có dạng YYYY-MM-DD hợp lệ.');
  }

  let start;
  let end;
  if (key === 'week') {
    const mondayOffset = (anchor.getUTCDay() + 6) % 7;
    start = addUtcDays(anchor, -mondayOffset);
    end = addUtcDays(start, 6);
  } else if (key === 'month') {
    start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  } else {
    const quarterStartMonth = Math.floor(anchor.getUTCMonth() / 3) * 3;
    start = new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth, 1));
    end = new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth + 3, 0));
  }

  return {
    key,
    anchor: anchorYmd,
    start_at: formatYmd(start),
    end_at: formatYmd(end),
    label: key === 'week'
      ? `Tuần ${formatYmd(start)} → ${formatYmd(end)}`
      : key === 'month'
        ? `Tháng ${anchor.getUTCMonth() + 1}/${anchor.getUTCFullYear()}`
        : `Quý ${Math.floor(anchor.getUTCMonth() / 3) + 1}/${anchor.getUTCFullYear()}`,
  };
}

function buildPlanningRanges(anchor, now = new Date()) {
  return Object.fromEntries(['week', 'month', 'quarter'].map((key) => [
    key,
    buildPeriodRange(key, anchor, now),
  ]));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function sumField(rows, field) {
  return sum((rows || []).map((row) => row?.[field]));
}

function maxTimestamp(rows, fields = ['updated_at', 'created_at']) {
  let latest = null;
  for (const row of rows || []) {
    for (const field of fields) {
      if (!row?.[field]) continue;
      const time = new Date(row[field]).getTime();
      if (!Number.isNaN(time) && (latest == null || time > latest)) latest = time;
    }
  }
  return latest == null ? null : new Date(latest).toISOString();
}

function sourceFreshnessSloMinutes(source) {
  const key = text(source);
  if (key.startsWith('work_unified_')) return SOURCE_FRESHNESS_SLO_MINUTES.work_unified;
  return SOURCE_FRESHNESS_SLO_MINUTES[key] || 60;
}

function freshness(
  observedAt,
  rows = null,
  fields = ['source_updated_at', 'updated_at', 'decided_at', 'created_at'],
  { source = 'unknown', state = 'FRESH', sloMinutes = sourceFreshnessSloMinutes(source) } = {},
) {
  const sourceUpdatedAt = Array.isArray(rows) ? maxTimestamp(rows, fields) : null;
  const observedMs = Date.parse(observedAt || '');
  const normalizedState = FRESHNESS_STATES.includes(state) && Number.isFinite(observedMs)
    ? state
    : state === 'NOT_CONNECTED'
      ? 'NOT_CONNECTED'
      : 'UNKNOWN';
  return {
    dataset_id: text(source) || 'unknown',
    source_module: text(source) || 'unknown',
    state: normalizedState,
    status: normalizedState,
    as_of: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null,
    observed_at: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null,
    source_updated_at: sourceUpdatedAt,
    slo_minutes: Number.isFinite(Number(sloMinutes)) && Number(sloMinutes) > 0
      ? Number(sloMinutes)
      : null,
    freshness_basis: normalizedState === 'FRESH'
      ? 'DIRECT_READ_OBSERVED_AT'
      : normalizedState,
  };
}

function summarizeWorkRows(rows = [], now = new Date()) {
  const byModule = { crm: 0, production: 0, logistics: 0, assignment: 0, personal: 0, other: 0 };
  const byStatus = { pending: 0, in_progress: 0, done: 0, other: 0 };
  let open = 0;
  let overdue = 0;
  let done = 0;
  for (const row of rows) {
    const status = text(row.status).toLowerCase();
    const isDone = DONE_STATUSES.includes(status);
    if (isDone) {
      done += 1;
      byStatus.done += 1;
    } else {
      open += 1;
      if (!status || status === 'pending' || status === 'todo') byStatus.pending += 1;
      else if (['in_progress', 'review', 'blocked'].includes(status)) byStatus.in_progress += 1;
      else byStatus.other += 1;
      if (row.deadline && new Date(row.deadline).getTime() < now.getTime()) overdue += 1;
    }
    const moduleKey = resolveModuleKey(row);
    byModule[moduleKey] = (byModule[moduleKey] || 0) + 1;
  }
  return {
    total: rows.length,
    open,
    overdue,
    done,
    by_module: byModule,
    by_status: byStatus,
    source_updated_at: maxTimestamp(rows, ['updated_at', 'completed_at', 'created_at']),
  };
}

function mergeWorkSummaries(entries = []) {
  const values = entries.map((entry) => entry.value || {});
  const byModule = {};
  const byStatus = {};
  for (const value of values) {
    for (const [key, count] of Object.entries(value.by_module || {})) {
      byModule[key] = (byModule[key] || 0) + (Number(count) || 0);
    }
    for (const [key, count] of Object.entries(value.by_status || {})) {
      byStatus[key] = (byStatus[key] || 0) + (Number(count) || 0);
    }
  }
  return {
    total: sumField(values, 'total'),
    open: sumField(values, 'open'),
    overdue: sumField(values, 'overdue'),
    done: sumField(values, 'done'),
    by_module: byModule,
    by_status: byStatus,
  };
}

function publicGap(source, companyId = null, code = 'SOURCE_UNAVAILABLE') {
  const messages = {
    SOURCE_SCOPE_MISMATCH: 'Nguồn trả dữ liệu ngoài phạm vi yêu cầu; dữ liệu đã bị chặn.',
    CONNECTOR_TIMEOUT: `Nguồn ${source} quá thời gian đọc cho phép.`,
    CONNECTOR_CIRCUIT_OPEN: `Nguồn ${source} đang tạm ngắt sau nhiều lần lỗi liên tiếp.`,
  };
  return {
    source,
    company_id: companyId,
    code,
    message: messages[code] || `Nguồn ${source} chưa khả dụng trong phạm vi này.`,
  };
}

function connectorFailureCode(error) {
  return ['CONNECTOR_TIMEOUT', 'CONNECTOR_CIRCUIT_OPEN'].includes(error?.code)
    ? error.code
    : 'SOURCE_UNAVAILABLE';
}

async function protectedConnectorRead(key, reader) {
  const now = Date.now();
  const state = connectorCircuitState.get(key);
  if (state?.opened_until > now) {
    const error = new Error('Connector circuit is temporarily open.');
    error.code = 'CONNECTOR_CIRCUIT_OPEN';
    throw error;
  }
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('Connector read timed out.');
        error.code = 'CONNECTOR_TIMEOUT';
        reject(error);
      }, CONNECTOR_TIMEOUT_MS);
      timer.unref?.();
    });
    const value = await Promise.race([Promise.resolve().then(reader), timeout]);
    connectorCircuitState.set(key, { failures: 0, opened_until: 0 });
    return value;
  } catch (error) {
    const failures = (state?.failures || 0) + 1;
    connectorCircuitState.set(key, {
      failures,
      opened_until: failures >= CONNECTOR_FAILURE_THRESHOLD ? now + CONNECTOR_OPEN_MS : 0,
    });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readPerCompany(
  source,
  companyIds,
  reader,
  validate,
  observedAt,
  rowsForFreshness = (value) => value,
) {
  const settled = await Promise.all(companyIds.map(async (companyId) => {
    try {
      const value = await protectedConnectorRead(`${source}:${companyId}`, () => reader(companyId));
      if (validate && !validate(value, companyId)) {
        return { ok: false, company_id: companyId, scope_violation: true, gap: publicGap(source, companyId, 'SOURCE_SCOPE_MISMATCH') };
      }
      return { ok: true, company_id: companyId, value };
    } catch (error) {
      const code = connectorFailureCode(error);
      console.warn(`[founder-cockpit/${source}/company-scope]`, code);
      return { ok: false, company_id: companyId, gap: publicGap(source, companyId, code) };
    }
  }));
  const values = settled.filter((item) => item.ok);
  const gaps = settled.filter((item) => !item.ok).map((item) => item.gap);
  const scopeViolation = settled.some((item) => item.scope_violation);
  const freshnessState = scopeViolation || (values.length > 0 && gaps.length > 0)
    ? 'UNKNOWN'
    : values.length > 0
      ? 'FRESH'
      : 'NOT_CONNECTED';
  const freshnessRows = values.flatMap((item) => {
    const rows = rowsForFreshness(item.value);
    if (Array.isArray(rows)) return rows;
    return rows && typeof rows === 'object' ? [rows] : [];
  });
  return {
    source,
    ok: values.length > 0,
    complete: gaps.length === 0,
    values,
    gaps,
    scope_violation: scopeViolation,
    freshness: freshness(observedAt, freshnessRows, undefined, { source, state: freshnessState }),
    reconciliation: {
      state: scopeViolation ? 'MISMATCH' : gaps.length ? (values.length ? 'PARTIAL' : 'NOT CHECKED') : 'MATCHED',
      checked_at: observedAt,
      requested_company_count: companyIds.length,
      reconciled_company_count: values.length,
    },
  };
}

async function safeRead(source, reader, validate, observedAt, rowsForFreshness = (value) => value) {
  try {
    const value = await protectedConnectorRead(source, reader);
    const valid = !validate || validate(value);
    if (!valid) {
      return {
        source,
        ok: false,
        complete: false,
        value: null,
        gaps: [publicGap(source, null, 'SOURCE_SCOPE_MISMATCH')],
        scope_violation: true,
        freshness: freshness(observedAt, null, undefined, { source, state: 'UNKNOWN' }),
        reconciliation: { state: 'MISMATCH', checked_at: observedAt },
      };
    }
    const rows = rowsForFreshness(value);
    const freshnessRows = Array.isArray(rows)
      ? rows
      : rows && typeof rows === 'object'
        ? [rows]
        : null;
    return {
      source,
      ok: true,
      complete: true,
      value,
      gaps: [],
      scope_violation: false,
      freshness: freshness(observedAt, freshnessRows, undefined, { source, state: 'FRESH' }),
      reconciliation: { state: 'MATCHED', checked_at: observedAt },
    };
  } catch (error) {
    const code = connectorFailureCode(error);
    console.warn(`[founder-cockpit/${source}]`, code);
    return {
      source,
      ok: false,
      complete: false,
      value: null,
      gaps: [publicGap(source, null, code)],
      scope_violation: false,
      freshness: freshness(observedAt, null, undefined, { source, state: 'NOT_CONNECTED' }),
      reconciliation: { state: 'NOT CHECKED', checked_at: observedAt },
    };
  }
}

function companyInProjectScope(row, allowed) {
  return allowed.has(text(row?.company_id)) || allowed.has(text(row?.logistics_company_id));
}

const defaultReaders = {
  async companies(ecosystemId) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, short_name, tenant_id, is_active')
      .eq('tenant_id', ecosystemId)
      .or('is_active.eq.true,is_active.is.null')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async crm({ user, companyId, range }) {
    return getOrgOverviewReport({
      ctx_user_id: user?.userId || user?.id,
      company_id: companyId,
      date_from: range.start_at,
      date_to: range.end_at,
      compare: false,
      deal_kh_split: true,
    });
  },

  async workload({ user, companyId, range, now }) {
    const rows = await fetchAllPages(() => buildUnifiedTasksBaseQuery(user, {
      company_id: companyId,
      date_from: `${range.start_at}T00:00:00+07:00`,
      date_to: `${range.end_at}T23:59:59.999+07:00`,
    }));
    return summarizeWorkRows(rows, now);
  },

  async projects({ companyIds }) {
    const inList = companyIds.join(',');
    return fetchAllPages(() => supabase
      .from('projects')
      .select('id, code, name, status, company_id, logistics_company_id, deadline, production_deadline, delivery_date, install_date, sx_kanban_column_id, vc_kanban_column_id, updated_at')
      .or(`company_id.in.(${inList}),logistics_company_id.in.(${inList})`));
  },

  async people({ companyIds }) {
    return fetchAllPages(() => supabase
      .from('users')
      .select('id, company_id, role, is_active')
      .in('company_id', companyIds)
      .or('is_active.eq.true,is_active.is.null'));
  },

  async procurement({ companyIds }) {
    return fetchAllPages(() => supabase
      .from('purchase_requests')
      .select('id, company_id, project_id, status, qc_status, supplier_committed_date, created_at, updated_at')
      .in('company_id', companyIds));
  },

  async approvals({ projectIds }) {
    if (!projectIds.length) return [];
    return fetchAllPages(() => supabase
      .from('project_approvals')
      .select('id, project_id, status, created_at, decided_at')
      .in('project_id', projectIds));
  },

  async modules() {
    const { data, error } = await supabase
      .from('app_modules')
      .select('id, module_key, name, icon, icon_image, category, color, company_id, is_active, description, companies:app_module_companies(company_id)')
      .order('name');
    if (error) throw error;
    return (data || []).map(normalizeModuleRow);
  },

  async accounting({ companyId }) {
    return buildAccountingSummary(companyId);
  },
};

async function resolveFounderCockpitScope(req, { readers = defaultReaders } = {}) {
  const user = req.user || {};
  const requestedEcosystem = text(req.query?.ecosystem_id);
  const userEcosystem = text(user.tenant_id || req.tenantContext?.tenantId);
  const ecosystemId = requestedEcosystem || userEcosystem;

  if (!ecosystemId) {
    throw new FounderCockpitError(400, 'BUSINESS_OS_ECOSYSTEM_REQUIRED', 'Thiếu ecosystem_id và tài khoản không có phạm vi hệ sinh thái.');
  }
  if (!isUuid(ecosystemId)) {
    throw new FounderCockpitError(400, 'BUSINESS_OS_ECOSYSTEM_INVALID', 'ecosystem_id không hợp lệ.');
  }
  if (userEcosystem && requestedEcosystem && requestedEcosystem !== userEcosystem) {
    throw new FounderCockpitError(403, 'BUSINESS_OS_ECOSYSTEM_DENIED', 'Không có quyền truy cập hệ sinh thái này.');
  }

  const allCompanies = await readers.companies(ecosystemId);
  const rows = (allCompanies || []).filter((company) => text(company.tenant_id) === ecosystemId);
  const tenantAllowed = req.tenantContext?.enforced
    ? new Set((req.tenantCompanyIds || []).map(String))
    : null;
  const userCompany = text(user.company_id);
  let accessible = tenantAllowed ? rows.filter((company) => tenantAllowed.has(String(company.id))) : rows;
  if (userCompany) accessible = accessible.filter((company) => String(company.id) === userCompany);
  else if (!isAdminLike(user)) accessible = [];

  if (!accessible.length) {
    throw new FounderCockpitError(403, 'BUSINESS_OS_SCOPE_EMPTY', 'Tài khoản không có công ty đang hoạt động trong phạm vi Business OS.');
  }

  const requestedCompany = text(req.query?.company_id);
  if (requestedCompany && requestedCompany !== 'all' && !isUuid(requestedCompany)) {
    throw new FounderCockpitError(400, 'BUSINESS_OS_COMPANY_INVALID', 'company_id không hợp lệ.');
  }
  const accessibleIds = new Set(accessible.map((company) => String(company.id)));
  if (requestedCompany && requestedCompany !== 'all' && !accessibleIds.has(requestedCompany)) {
    throw new FounderCockpitError(403, 'BUSINESS_OS_COMPANY_DENIED', 'Không có quyền truy cập công ty này.');
  }

  let selected = accessible;
  let level = 'ecosystem';
  if (requestedCompany && requestedCompany !== 'all') {
    selected = accessible.filter((company) => String(company.id) === requestedCompany);
    level = 'company';
  } else if (requestedCompany !== 'all' && (userCompany || accessible.length === 1)) {
    selected = accessible.filter((company) => !userCompany || String(company.id) === userCompany);
    level = 'company';
  }

  return {
    ecosystem_id: ecosystemId,
    company_id: level === 'company' ? String(selected[0].id) : null,
    company_ids: selected.map((company) => String(company.id)),
    level,
    companies: selected.map((company) => ({
      id: company.id,
      name: company.name || company.short_name || String(company.id),
      short_name: company.short_name || null,
    })),
  };
}

function aggregateCrm(entries = []) {
  const summaries = entries.map((entry) => entry.value?.summary || {});
  return {
    lead_count: sumField(summaries, 'lead_count'),
    deal_count: sumField(summaries, 'deal_count'),
    customer_order_count: sumField(summaries, 'customer_order_count'),
    closed_won_count: sumField(summaries, 'closed_won_count'),
    closed_won_value: sumField(summaries, 'closed_won_value'),
    pipeline_value: sumField(summaries, 'pipeline_value'),
    overdue_count: sumField(summaries, 'overdue_count'),
    kpi_ledger_net: sumField(summaries, 'kpi_ledger_net'),
  };
}

function aggregateAccounting(entries = []) {
  const values = entries.map((entry) => entry.value || {});
  return {
    total_deals: sumField(values, 'total_deals'),
    total_estimated_value: sumField(values, 'total_estimated_value'),
    total_production_value: sumField(values, 'total_production_value'),
    total_invoiced_value: sumField(values, 'total_invoiced_value'),
    total_outstanding_value: sumField(values, 'total_outstanding_value'),
    count_not_invoiced: sumField(values, 'count_not_invoiced'),
    count_sx_done_not_invoiced: sumField(values, 'count_sx_done_not_invoiced'),
  };
}

function projectMetrics(rows = [], range, now = new Date()) {
  const active = rows.filter((row) => !DONE_PROJECT_STATUSES.has(text(row.status).toLowerCase()));
  const deadlineOf = (row) => row.production_deadline || row.deadline || null;
  const inRange = (value) => value && text(value).slice(0, 10) >= range.start_at && text(value).slice(0, 10) <= range.end_at;
  const overdue = active.filter((row) => {
    const deadline = deadlineOf(row);
    return deadline && new Date(deadline).getTime() < now.getTime();
  });
  return {
    total_projects: rows.length,
    active_projects: active.length,
    projects_due: active.filter((row) => inRange(deadlineOf(row))).length,
    overdue_projects: overdue.length,
    production_projects: active.filter((row) => row.sx_kanban_column_id || text(row.status).toLowerCase() === 'producing').length,
    logistics_projects: active.filter((row) => row.vc_kanban_column_id || ['shipping', 'installing'].includes(text(row.status).toLowerCase())).length,
  };
}

function procurementMetrics(rows = []) {
  const done = rows.filter((row) => DONE_PROCUREMENT_STATUSES.has(text(row.status).toLowerCase())).length;
  return {
    total_requests: rows.length,
    open_requests: rows.length - done,
    done_requests: done,
    delayed_requests: rows.filter((row) => text(row.status).toLowerCase() === 'delayed').length,
    qc_failed_requests: rows.filter((row) => text(row.qc_status).toLowerCase() === 'fail' || text(row.status).toLowerCase() === 'qc_fail').length,
  };
}

function approvalMetrics(rows = []) {
  return {
    total_approvals: rows.length,
    pending_approvals: rows.filter((row) => text(row.status).toLowerCase() === 'pending').length,
  };
}

function combineFreshness(
  packets,
  observedAt,
  { datasetId = 'aggregate', sloMinutes = null } = {},
) {
  const states = packets.map((packet) => (
    FRESHNESS_STATES.includes(packet?.freshness?.state) ? packet.freshness.state : 'UNKNOWN'
  ));
  const statePriority = { FRESH: 0, STALE: 1, UNKNOWN: 2, NOT_CONNECTED: 3 };
  const state = states.reduce((worst, current) => (
    (statePriority[current] ?? statePriority.UNKNOWN) > (statePriority[worst] ?? statePriority.UNKNOWN)
      ? current
      : worst
  ), 'FRESH');
  const sourceUpdatedAt = maxTimestamp(
    packets.map((packet) => ({ updated_at: packet?.freshness?.source_updated_at })).filter((row) => row.updated_at),
  );
  const packetSlos = packets
    .map((packet) => Number(packet?.freshness?.slo_minutes))
    .filter((value) => Number.isFinite(value) && value > 0);
  const resolvedSlo = Number.isFinite(Number(sloMinutes)) && Number(sloMinutes) > 0
    ? Number(sloMinutes)
    : packetSlos.length
      ? Math.min(...packetSlos)
      : null;
  const normalizedObservedAt = Number.isFinite(Date.parse(observedAt || ''))
    ? new Date(Date.parse(observedAt)).toISOString()
    : null;
  return {
    dataset_id: datasetId,
    source_module: packets.map((packet) => packet?.source).filter(Boolean).join('+') || datasetId,
    state,
    status: state,
    as_of: normalizedObservedAt,
    observed_at: normalizedObservedAt,
    source_updated_at: sourceUpdatedAt,
    slo_minutes: resolvedSlo,
    freshness_basis: state === 'FRESH' ? 'DIRECT_READ_OBSERVED_AT' : state,
    sources: packets.map((packet) => ({
      dataset_id: packet?.freshness?.dataset_id || packet.source,
      source: packet.source,
      state: packet.freshness?.state || 'UNKNOWN',
      observed_at: packet.freshness?.observed_at || observedAt,
      source_updated_at: packet.freshness?.source_updated_at || null,
      slo_minutes: packet.freshness?.slo_minutes ?? null,
    })),
  };
}

function combineReconciliation(packets, observedAt) {
  const states = packets.map((packet) => packet.reconciliation?.state || 'NOT CHECKED');
  let state = 'MATCHED';
  if (states.includes('MISMATCH')) state = 'MISMATCH';
  else if (states.includes('PARTIAL')) state = 'PARTIAL';
  else if (states.includes('NOT CHECKED')) state = 'NOT CHECKED';
  return {
    state,
    status: state,
    checked_at: observedAt,
    sources: packets.map((packet) => ({ source: packet.source, state: packet.reconciliation?.state || 'NOT CHECKED' })),
  };
}

function deriveModuleStatus(packets, enabled = true) {
  if (!enabled) return 'NOT CONNECTED';
  const usable = packets.filter((packet) => packet.ok);
  if (!usable.length) return 'NOT CONNECTED';
  if (packets.some((packet) => packet.reconciliation?.state === 'MISMATCH')) return 'UNDER RECONCILIATION';
  if (usable.length !== packets.length || packets.some((packet) => !packet.complete || packet.gaps?.length)) {
    return 'LIVE WITH DATA GAPS';
  }
  return 'LIVE';
}

function statusForSystem(modules = []) {
  if (!modules.length || modules.every((module) => module.status === 'NOT CONNECTED')) return 'NOT CONNECTED';
  if (modules.some((module) => module.status === 'FOUNDER DECISION REQUIRED')) return 'FOUNDER DECISION REQUIRED';
  if (modules.some((module) => module.status === 'BLOCKED')) return 'BLOCKED';
  if (modules.some((module) => module.status === 'UNDER RECONCILIATION')) return 'UNDER RECONCILIATION';
  if (modules.some((module) => module.status !== 'LIVE')) return 'LIVE WITH DATA GAPS';
  return 'LIVE';
}

function moduleRegistryEntries(registryPacket, scope) {
  if (!registryPacket.ok) return [];
  const allowed = new Set(scope.company_ids);
  return (registryPacket.value || []).filter((row) => {
    const ids = (row.company_ids || []).map(String);
    return !ids.length || ids.some((id) => allowed.has(id));
  }).map((row) => ({
    key: row.module_key,
    label: row.name || row.module_key,
    enabled: row.is_active !== false,
    company_ids: (row.company_ids || []).length === 0
      ? [...scope.company_ids]
      : (row.company_ids || []).map(String).filter((id) => allowed.has(id)),
    shared_all: (row.company_ids || []).length === 0,
  }));
}

function moduleActivationCoverage(definition, registryPacket, scope) {
  const registryKeys = new Set(definition.registry_keys || []);
  if (!registryKeys.size || !registryPacket.ok) {
    return {
      enabled: true,
      basis: registryKeys.size ? 'builtin_route_registry_unavailable' : 'builtin_route',
      company_ids: [...scope.company_ids],
      registry_keys: [],
      gaps: registryKeys.size && !registryPacket.ok
        ? [{
          source: 'app_module_registry',
          company_id: scope.company_id,
          code: 'MODULE_REGISTRY_UNAVAILABLE',
          message: 'Không xác minh được cấu hình module theo công ty; route hệ thống vẫn tồn tại nhưng trạng thái registry chưa được khẳng định.',
        }]
        : [],
    };
  }

  const configuredRows = (registryPacket.value || []).filter((row) => registryKeys.has(String(row.module_key || '')));
  if (!configuredRows.length) {
    return {
      enabled: true,
      basis: 'builtin_route',
      company_ids: [...scope.company_ids],
      registry_keys: [],
      gaps: [],
    };
  }

  const allowed = new Set(scope.company_ids.map(String));
  const covered = new Set();
  const activeRows = configuredRows.filter((row) => row.is_active !== false);
  for (const row of activeRows) {
    const ids = (row.company_ids || []).map(String);
    if (!ids.length) scope.company_ids.forEach((id) => covered.add(String(id)));
    else ids.filter((id) => allowed.has(id)).forEach((id) => covered.add(id));
  }
  const companyIds = scope.company_ids.map(String).filter((id) => covered.has(id));
  const missingIds = scope.company_ids.map(String).filter((id) => !covered.has(id));
  const gaps = [];
  if (!companyIds.length) {
    gaps.push({
      source: 'app_module_registry',
      company_id: scope.company_id,
      code: 'MODULE_DISABLED_FOR_SCOPE',
      message: 'Module đang tắt hoặc không được gán cho công ty trong phạm vi đã chọn.',
    });
  } else if (missingIds.length) {
    gaps.push({
      source: 'app_module_registry',
      company_id: scope.company_id,
      code: 'MODULE_PARTIAL_COMPANY_COVERAGE',
      message: `Module chỉ được kích hoạt cho ${companyIds.length}/${scope.company_ids.length} công ty trong phạm vi.`,
    });
  }

  return {
    enabled: companyIds.length > 0,
    basis: 'app_module_registry',
    company_ids: companyIds,
    registry_keys: [...new Set(configuredRows.map((row) => String(row.module_key)).filter(Boolean))],
    gaps,
  };
}

function scopedFounderHref(href, companyScope) {
  const raw = String(href || '').trim();
  const scope = String(companyScope || '').trim().toLowerCase();
  if (!raw.startsWith('/') || raw.startsWith('//') || (!isUuid(scope) && scope !== 'all')) return '';
  const target = new URL(raw, 'http://founder-local.invalid');
  const scopedParams = new URLSearchParams(
    [...target.searchParams.entries()].filter(([key]) => key.toLowerCase() !== 'company_id'),
  );
  scopedParams.set('company_id', scope);
  target.search = scopedParams.toString();
  return `${target.pathname}${target.search}${target.hash}`;
}

function createDrilldowns(moduleByKey, scope) {
  const companyScope = scope.company_id || 'all';
  return DRILLDOWN_DEFINITIONS.map((item) => {
    const related = [...moduleByKey.values()].filter((module) => module.drilldown?.key === item.key);
    return {
      ...item,
      href: scopedFounderHref(item.href, companyScope),
      enabled: item.key === 'crm'
        && Boolean(scope.company_id)
        && (!related.length || related.some((module) => !['NOT CONNECTED', 'BLOCKED'].includes(module.status))),
      read_only: true,
      read_only_contract: 'founder_local_read_only_v1',
      write_capability: 'DISABLED_IN_FOUNDER_LOCAL',
    };
  });
}

function moduleMetrics(key, metrics) {
  const map = {
    crm: metrics.crm,
    sales: metrics.crm,
    lead_deal: metrics.crm,
    commercial_documents: metrics.accounting,
    projects: metrics.projects,
    work_unified: metrics.workload,
    procurement_purchasing: metrics.procurement,
    production: {
      active_projects: metrics.projects.active_projects,
      production_projects: metrics.projects.production_projects,
      overdue_projects: metrics.projects.overdue_projects,
    },
    logistics: {
      active_projects: metrics.projects.active_projects,
      logistics_projects: metrics.projects.logistics_projects,
      overdue_projects: metrics.projects.overdue_projects,
    },
    accounting: metrics.accounting,
    warranty_care: { data_available: false },
    people_kpi: { active_people: metrics.active_people, kpi_ledger_net: metrics.crm.kpi_ledger_net },
    permissions: { authentication_enforced: true, company_scope_enforced: true, read_permission: 'reports.view' },
    approvals: metrics.approvals,
    reporting: {
      connected_sources: metrics.connected_sources,
      total_sources: metrics.total_sources,
      reconciled_sources: metrics.reconciled_sources,
    },
  };
  return map[key] ?? null;
}

const SIGNAL_SOURCE_BY_MODULE = Object.freeze({
  crm: ['CRM', 'orgOverviewReportAi', 'crm_org_overview.summary'],
  sales: ['Sales', 'orgOverviewReportAi', 'crm_org_overview.summary'],
  lead_deal: ['CRM', 'orgOverviewReportAi', 'crm_org_overview.summary'],
  commercial_documents: ['Accounting', 'accountingDeals', 'accounting_summary'],
  projects: ['Project', 'founderCockpitReadModel', 'projects'],
  work_unified: ['Work', 'unifiedTasksQuery', 'unified_tasks_v'],
  procurement_purchasing: ['Procurement', 'founderCockpitReadModel', 'purchase_requests'],
  production: ['Production', 'founderCockpitReadModel', 'projects.production'],
  logistics: ['Logistics', 'founderCockpitReadModel', 'projects.logistics'],
  accounting: ['Accounting', 'accountingDeals', 'accounting_summary'],
  warranty_care: ['Warranty / Care', 'not_connected', 'not_connected'],
  people_kpi: ['People / KPI', 'founderCockpitReadModel', 'users+crm_kpi_ledger'],
  permissions: ['Permission', 'auth+newPermission+tenantScope', 'authenticated_scope'],
  approvals: ['Approval', 'founderCockpitReadModel', 'project_approvals'],
  reporting: ['Reporting', 'founderCockpitReadModel', 'cross_domain_source_packets'],
});

function signalDisplayName(moduleLabel, metricKey) {
  return `${moduleLabel} · ${String(metricKey).replaceAll('_', ' ')}`;
}

function buildSignalHub({ modules, scope, generatedAt }) {
  const contracts = [];
  for (const module of modules) {
    const [ownerDomain, sourceService, sourceObject] = SIGNAL_SOURCE_BY_MODULE[module.key]
      || [module.label, 'founderCockpitReadModel', 'aggregate'];
    const metrics = module.metrics && typeof module.metrics === 'object' ? module.metrics : {};
    for (const [metricKey, currentValue] of Object.entries(metrics)) {
      if (currentValue && typeof currentValue === 'object') continue;
      contracts.push({
        signal_id: `${module.key}.${metricKey}`,
        display_name: signalDisplayName(module.label, metricKey),
        owner_domain: ownerDomain,
        source_service_read_model: sourceService,
        source_object_field: `${sourceObject}.${metricKey}`,
        source_record_id: null,
        source_record_id_semantics: 'SCOPED_AGGREGATE_NOT_SINGLE_RECORD',
        ecosystem_scope: scope.ecosystem_id,
        company_scope: [...scope.company_ids],
        user_role_scope: ['admin'],
        query_filter_rule: 'existing tenant/company scope plus selected planning period',
        freshness_slo_minutes: module.freshness?.slo_minutes ?? null,
        freshness_target_seconds: Number.isFinite(Number(module.freshness?.slo_minutes))
          ? Number(module.freshness.slo_minutes) * 60
          : null,
        freshness: module.freshness,
        reconciliation_rule: 'compare scoped aggregate with the existing source service/read model',
        reconciliation: module.reconciliation,
        quality_state: module.activation_status === 'LIVE'
          ? 'VERIFIED'
          : module.activation_status === 'NOT CONNECTED'
            ? 'SOURCE UNAVAILABLE'
            : 'VERIFIED WITH DISCLOSED GAP',
        failure_state: module.activation_status === 'NOT CONNECTED'
          ? 'CHƯA ĐỦ DỮ LIỆU'
          : 'DEGRADE MODULE AND DISCLOSE FRESHNESS/GAP',
        drilldown: module.drilldown,
        write_capability: 'DISABLED',
        canonical_status: 'NON_CANONICAL MANAGEMENT VIEW',
        provisional: false,
        current_value: currentValue,
        as_of: module.freshness?.as_of || generatedAt,
      });
    }
  }
  return {
    contract_version: 'founder_signal_hub_v1',
    mode: 'read_projection',
    canonical: false,
    contracts,
  };
}

function buildCorrectionCenter(decisions = []) {
  return {
    contract_version: 'founder_correction_evolution_v1',
    mode: 'read_projection_and_drilldown',
    canonical: false,
    rule_change_request: {
      enabled: false,
      status: 'DISABLED',
      reason: 'Canonical Business Rule changes remain outside Founder-local authority.',
    },
    items: decisions.map((decision) => ({
      issue_id: decision.id,
      issue: decision.title,
      root_cause: 'CHƯA ĐỦ DỮ LIỆU — xác minh tại module nguồn',
      corrective_action: 'REVIEW_IN_EXISTING_OPERATIONAL_MODULE',
      owner: null,
      owner_state: 'CHƯA ĐỦ DỮ LIỆU',
      deadline: null,
      deadline_state: 'CHƯA ĐỦ DỮ LIỆU',
      status: 'OPEN SIGNAL',
      drilldown: {
        href: decision.href,
        label: 'Mở bằng chứng nguồn',
        enabled: false,
        read_only: true,
        read_only_contract: 'founder_local_read_only_v1',
        write_capability: 'DISABLED_IN_FOUNDER_LOCAL',
      },
      protected_write_enabled: false,
      provisional: decision.provisional_advisory === true,
    })),
  };
}

function buildDecisionItems({ sourcePackets, workload, projects, procurement, approvals }) {
  const items = [];
  const gaps = Object.values(sourcePackets).flatMap((packet) => packet.gaps || []);
  if (gaps.length) {
    items.push({
      id: 'data-connectivity-gaps',
      severity: 'medium',
      title: 'Có nguồn dữ liệu chưa kết nối đầy đủ',
      reason: `${gaps.length} nguồn/phạm vi chưa trả dữ liệu thật.`,
      evidence: gaps.map((gap) => ({ source: gap.source, company_id: gap.company_id, code: gap.code })),
      href: '/ecosystem/app-modules',
      requires_founder_decision: false,
    });
  }
  if (workload.overdue > 0) {
    items.push({
      id: 'overdue-work', severity: 'high', title: 'Công việc quá hạn cần xử lý',
      reason: `${workload.overdue} công việc trong kỳ đã quá hạn.`,
      evidence: [{ source: 'unified_tasks_v', metric: 'overdue', value: workload.overdue }],
      href: '/management/work-unified', requires_founder_decision: false,
    });
  }
  if (projects.overdue_projects > 0) {
    items.push({
      id: 'overdue-projects', severity: 'high', title: 'Project vận hành quá hạn',
      reason: `${projects.overdue_projects} Project đang hoạt động đã quá hạn.`,
      evidence: [{ source: 'projects', metric: 'overdue_projects', value: projects.overdue_projects }],
      href: '/management/production-overview', requires_founder_decision: false,
    });
  }
  if (procurement.delayed_requests > 0 || procurement.qc_failed_requests > 0) {
    items.push({
      id: 'procurement-exceptions', severity: 'high', title: 'Ngoại lệ mua hàng / KCS',
      reason: `${procurement.delayed_requests} yêu cầu trễ, ${procurement.qc_failed_requests} yêu cầu KCS không đạt.`,
      evidence: [{ source: 'purchase_requests', metric: 'delayed', value: procurement.delayed_requests }, { source: 'purchase_requests', metric: 'qc_failed', value: procurement.qc_failed_requests }],
      href: '/management/purchasing-overview', requires_founder_decision: false,
    });
  }
  if (approvals.pending_approvals > 0) {
    items.push({
      id: 'pending-approvals', severity: 'medium', title: 'Phê duyệt đang chờ',
      reason: `${approvals.pending_approvals} phê duyệt Project đang chờ quyết định.`,
      evidence: [{ source: 'project_approvals', metric: 'pending', value: approvals.pending_approvals }],
      href: '/approval-rules', requires_founder_decision: false,
    });
  }
  return items;
}

function advisoryNumber(contract, key) {
  const value = contract?.configuration?.[key];
  return Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null;
}

function buildProvisionalAdvisories({ advisoryConfig, workload, projects, procurement, loadPerActivePerson }) {
  if (!advisoryConfig?.enabled || advisoryConfig?.operational_effect !== false || advisoryConfig?.canonical !== false) {
    return [];
  }
  const definitions = [
    {
      id: 'provisional-capacity-load',
      key: 'capacity_load_warning_per_active_person',
      value: loadPerActivePerson,
      title: 'Tải công việc vượt ngưỡng advisory tạm',
      href: '/management/work-unified',
    },
    {
      id: 'provisional-overdue-work',
      key: 'overdue_work_warning_count',
      value: workload.overdue,
      title: 'Công việc quá hạn chạm ngưỡng advisory tạm',
      href: '/management/work-unified',
    },
    {
      id: 'provisional-overdue-project',
      key: 'overdue_project_warning_count',
      value: projects.overdue_projects,
      title: 'Project quá hạn chạm ngưỡng advisory tạm',
      href: '/management/production-overview',
    },
    {
      id: 'provisional-delayed-procurement',
      key: 'delayed_procurement_warning_count',
      value: procurement.delayed_requests,
      title: 'Mua hàng trễ chạm ngưỡng advisory tạm',
      href: '/management/purchasing-overview',
    },
  ];
  return definitions.flatMap((definition) => {
    const threshold = advisoryNumber(advisoryConfig, definition.key);
    if (threshold == null || definition.value == null || Number(definition.value) < threshold) return [];
    return [{
      id: definition.id,
      severity: 'medium',
      title: definition.title,
      reason: 'Tín hiệu chỉ phục vụ cảnh báo trực quan; không phải Business Rule chuẩn và không tự động thay đổi vận hành.',
      evidence: [{
        source: 'founder_advisory_configuration',
        metric: definition.key,
        value: definition.value,
        threshold,
        configuration_version: advisoryConfig.current_version,
      }],
      href: definition.href,
      requires_founder_decision: false,
      provisional_advisory: true,
      canonical: false,
      operational_effect: false,
    }];
  });
}

async function loadFounderCockpit({
  scope,
  user,
  period,
  periodAnchor,
  now = new Date(),
  readers = defaultReaders,
  gateContext = {},
  advisoryConfig = null,
  companyAdvisoryConfigs = {},
}) {
  const generatedAt = now.toISOString();
  const selectedPeriod = buildPeriodRange(period, periodAnchor, now);
  const planningRanges = buildPlanningRanges(selectedPeriod.anchor, now);
  const companyIds = scope.company_ids;
  const allowedCompanies = new Set(companyIds);

  const crmPromise = readPerCompany(
    'crm_org_overview',
    companyIds,
    (companyId) => readers.crm({ user, companyId, range: selectedPeriod, now }),
    (value, companyId) => text(value?.company_id) === String(companyId),
    generatedAt,
  );
  const workloadPromises = Object.fromEntries(Object.entries(planningRanges).map(([key, range]) => [
    key,
    readPerCompany(
      `work_unified_${key}`,
      companyIds,
      (companyId) => readers.workload({ user, companyId, range, now }),
      null,
      generatedAt,
    ),
  ]));
  const projectsPromise = safeRead(
    'projects',
    () => readers.projects({ companyIds, user, range: selectedPeriod, now }),
    (rows) => Array.isArray(rows) && rows.every((row) => companyInProjectScope(row, allowedCompanies)),
    generatedAt,
  );
  const peoplePromise = safeRead(
    'people',
    () => readers.people({ companyIds, user, now }),
    (rows) => Array.isArray(rows) && rows.every((row) => allowedCompanies.has(text(row.company_id))),
    generatedAt,
  );
  const procurementPromise = safeRead(
    'procurement',
    () => readers.procurement({ companyIds, user, range: selectedPeriod, now }),
    (rows) => Array.isArray(rows) && rows.every((row) => allowedCompanies.has(text(row.company_id))),
    generatedAt,
  );
  const registryPromise = safeRead('app_module_registry', () => readers.modules({ companyIds, user }), Array.isArray, generatedAt);
  const accountingPromise = readPerCompany(
    'accounting_summary',
    companyIds,
    (companyId) => readers.accounting({ companyId, user, range: selectedPeriod, now }),
    (value, companyId) => text(value?.client_company_id) === String(companyId),
    generatedAt,
  );

  const [crmPacket, projectsPacket, peoplePacket, procurementPacket, registryPacket, accountingPacket] = await Promise.all([
    crmPromise, projectsPromise, peoplePromise, procurementPromise, registryPromise, accountingPromise,
  ]);
  const workloadPackets = Object.fromEntries(await Promise.all(Object.entries(workloadPromises).map(async ([key, promise]) => [key, await promise])));
  const selectedWorkloadPacket = workloadPackets[selectedPeriod.key];

  const projectRows = projectsPacket.ok ? projectsPacket.value : [];
  const projectIds = projectRows.map((row) => row.id).filter(Boolean).map(String);
  const projectIdSet = new Set(projectIds);
  const approvalsPacket = projectsPacket.scope_violation
    ? { source: 'project_approvals', ok: false, complete: false, value: [], gaps: [publicGap('project_approvals')], scope_violation: true, freshness: freshness(generatedAt, null, undefined, { source: 'project_approvals', state: 'UNKNOWN' }), reconciliation: { state: 'MISMATCH', checked_at: generatedAt } }
    : await safeRead(
      'project_approvals',
      () => readers.approvals({ projectIds, companyIds, user, now }),
      (rows) => Array.isArray(rows) && rows.every((row) => projectIdSet.has(text(row.project_id))),
      generatedAt,
      (value) => value,
    );

  const sourcePackets = {
    crm: crmPacket,
    workload: selectedWorkloadPacket,
    projects: projectsPacket,
    people: peoplePacket,
    procurement: procurementPacket,
    accounting: accountingPacket,
    approvals: approvalsPacket,
    registry: registryPacket,
    permissions: {
      source: 'auth+reports.view+tenant_scope', ok: true, complete: true, value: true, gaps: [], scope_violation: false,
      freshness: freshness(generatedAt, null, undefined, { source: 'permissions', state: 'FRESH' }), reconciliation: { state: 'MATCHED', checked_at: generatedAt },
    },
    care: {
      source: 'warranty_care', ok: false, complete: false, value: null,
      gaps: [{ source: 'warranty_care', company_id: scope.company_id, code: 'NO_APPROVED_READ_MODEL', message: 'Chưa có read model tổng hợp Warranty / Care được phê duyệt.' }],
      scope_violation: false, freshness: freshness(generatedAt, null, undefined, { source: 'warranty_care', state: 'NOT_CONNECTED' }), reconciliation: { state: 'NOT CHECKED', checked_at: generatedAt },
    },
  };

  const allPackets = [...Object.values(sourcePackets), ...Object.values(workloadPackets)];
  if (allPackets.some((packet) => packet.scope_violation)) {
    throw new FounderCockpitError(503, 'BUSINESS_OS_SCOPE_RECONCILIATION_FAILED', 'Không thể xác minh phạm vi dữ liệu Business OS.');
  }

  const workload = selectedWorkloadPacket.ok ? mergeWorkSummaries(selectedWorkloadPacket.values) : {
    total: null, open: null, overdue: null, done: null, by_module: {}, by_status: {},
  };
  const crm = crmPacket.ok ? aggregateCrm(crmPacket.values) : {
    lead_count: null, deal_count: null, customer_order_count: null, closed_won_count: null,
    closed_won_value: null, pipeline_value: null, overdue_count: null, kpi_ledger_net: null,
  };
  const projects = projectsPacket.ok ? projectMetrics(projectRows, selectedPeriod, now) : {
    total_projects: null, active_projects: null, projects_due: null, overdue_projects: null,
    production_projects: null, logistics_projects: null,
  };
  const procurement = procurementPacket.ok ? procurementMetrics(procurementPacket.value) : {
    total_requests: null, open_requests: null, done_requests: null, delayed_requests: null, qc_failed_requests: null,
  };
  const accounting = accountingPacket.ok ? aggregateAccounting(accountingPacket.values) : {
    total_deals: null, total_estimated_value: null, total_production_value: null,
    total_invoiced_value: null, total_outstanding_value: null, count_not_invoiced: null,
    count_sx_done_not_invoiced: null,
  };
  const approvals = approvalsPacket.ok ? approvalMetrics(approvalsPacket.value) : {
    total_approvals: null, pending_approvals: null,
  };
  const activePeople = peoplePacket.ok ? peoplePacket.value.length : null;
  const metricSummary = {
    crm, workload, projects, procurement, accounting, approvals, active_people: activePeople,
    connected_sources: Object.values(sourcePackets).filter((packet) => packet.ok).length,
    total_sources: Object.keys(sourcePackets).length,
    reconciled_sources: Object.values(sourcePackets).filter((packet) => packet.reconciliation?.state === 'MATCHED').length,
  };

  const registryEntries = moduleRegistryEntries(registryPacket, scope);
  const drilldownByKey = new Map(DRILLDOWN_DEFINITIONS.map((item) => [item.key, item]));
  const modules = MODULE_DEFINITIONS.map((definition) => {
    const packets = definition.sources.map((source) => sourcePackets[source]);
    const activation = moduleActivationCoverage(definition, registryPacket, scope);
    const knownGaps = (definition.known_gaps || []).map((message) => ({
      source: 'cockpit_coverage',
      company_id: scope.company_id,
      code: 'APPROVED_READ_MODEL_COVERAGE_GAP',
      message,
    }));
    const drilldown = drilldownByKey.get(definition.drilldown) || null;
    const dataGaps = [...packets.flatMap((packet) => packet.gaps || []), ...knownGaps, ...activation.gaps];
    const gates = {
      data: packets.every((packet) => packet.ok),
      scope: packets.every((packet) => packet.reconciliation?.state !== 'MISMATCH'),
      permission: gateContext.permission === true,
      audit: gateContext.audit === true,
      reconciliation: packets.every((packet) => packet.reconciliation?.state === 'MATCHED'),
      verification: packets.every((packet) => (
        packet.ok
        && packet.scope_violation === false
        && packet.freshness?.observed_at
        && packet.reconciliation?.state === 'MATCHED'
      )),
      drill_down: Boolean(
        drilldown
        && typeof drilldown.href === 'string'
        && drilldown.href.startsWith('/')
        && !drilldown.href.includes('\\')
      ),
    };
    let status = deriveModuleStatus(packets, activation.enabled);
    if (status === 'LIVE' && dataGaps.length) status = 'LIVE WITH DATA GAPS';
    if (activation.enabled && !['NOT CONNECTED', 'BLOCKED'].includes(status) && Object.values(gates).some((value) => !value)) {
      status = 'UNDER RECONCILIATION';
    }
    return {
      key: definition.key,
      label: definition.label,
      status,
      activation_status: status,
      activation,
      freshness: combineFreshness(packets, generatedAt, {
        datasetId: definition.key,
        sloMinutes: MODULE_FRESHNESS_SLO_MINUTES[definition.key],
      }),
      reconciliation: combineReconciliation(packets, generatedAt),
      gates,
      data_gaps: dataGaps,
      metrics: moduleMetrics(definition.key, metricSummary),
      drilldown,
    };
  });
  const moduleByKey = new Map(modules.map((module) => [module.key, module]));
  const drilldowns = createDrilldowns(moduleByKey, scope);
  const finalDrilldownByKey = new Map(drilldowns.map((item) => [item.key, item]));
  modules.forEach((module) => {
    if (module.drilldown) module.drilldown = finalDrilldownByKey.get(module.drilldown.key) || module.drilldown;
  });

  const loadPerActivePerson = activePeople > 0 && workload.open != null
    ? Number((workload.open / activePeople).toFixed(2))
    : null;
  const provisionalTarget = advisoryNumber(advisoryConfig, 'capacity_load_warning_per_active_person');
  const provisionalCapacityGap = provisionalTarget != null && loadPerActivePerson != null
    ? Number(Math.max(0, loadPerActivePerson - provisionalTarget).toFixed(2))
    : null;
  const decisions = [
    ...buildDecisionItems({ sourcePackets, workload, projects, procurement, approvals }),
    ...buildProvisionalAdvisories({
      advisoryConfig,
      workload,
      projects,
      procurement,
      loadPerActivePerson,
    }),
  ].map((decision) => ({
    ...decision,
    href: scopedFounderHref(decision.href, scope.company_id || 'all'),
  }));
  const systems = SYSTEM_DEFINITIONS.map((definition) => {
    const systemModules = definition.module_keys.map((key) => moduleByKey.get(key)).filter(Boolean);
    const systemDrilldowns = [...new Map(systemModules
      .map((module) => module.drilldown)
      .filter(Boolean)
      .map((item) => [item.key, item])).values()];
    return {
      key: definition.key,
      label: definition.label,
      status: statusForSystem(systemModules),
      module_keys: definition.module_keys,
      metrics: Object.fromEntries(systemModules.map((module) => [module.key, module.metrics])),
      signals: decisions.filter((item) => systemDrilldowns.some((drilldown) => item.href.startsWith(drilldown.href.split('?')[0]))),
      drilldowns: systemDrilldowns,
    };
  });

  const horizonItems = ['week', 'month', 'quarter'].map((key) => {
    const packet = workloadPackets[key];
    return {
      ...planningRanges[key],
      status: deriveModuleStatus([packet]),
      metrics: packet.ok ? mergeWorkSummaries(packet.values) : {
        total: null, open: null, overdue: null, done: null, by_module: {}, by_status: {},
      },
      freshness: combineFreshness([packet], generatedAt, {
        datasetId: `planning_${key}`,
        sloMinutes: SOURCE_FRESHNESS_SLO_MINUTES.work_unified,
      }),
      data_gaps: packet.gaps || [],
    };
  });

  const capacityGaps = activePeople == null
    ? [publicGap('people')]
    : provisionalTarget == null
      ? [{ source: 'capacity_targets', company_id: scope.company_id, code: 'TARGET_NOT_CONFIGURED', message: 'Chưa có định mức năng lực được phê duyệt; không suy diễn công suất tối đa.' }]
      : [{
        source: 'founder_advisory_configuration',
        company_id: scope.company_id,
        code: 'PROVISIONAL_ADVISORY_ONLY',
        message: 'Đang dùng ngưỡng cảnh báo tạm, không canonical và không có tác động vận hành tự động.',
      }];

  const projectsByCompany = new Map(companyIds.map((id) => [id, projectRows.filter((row) => text(row.company_id) === id)]));
  const peopleByCompany = new Map(companyIds.map((id) => [id, peoplePacket.ok ? peoplePacket.value.filter((row) => text(row.company_id) === id) : []]));
  const selectedWorkByCompany = new Map((selectedWorkloadPacket.values || []).map((entry) => [entry.company_id, entry.value]));
  const productionRegistryEntries = registryEntries.filter((entry) => entry.key === 'production');
  const productionConfiguredIds = new Set(productionRegistryEntries.flatMap((entry) => (
    entry.shared_all ? companyIds : entry.company_ids
  )));
  const productionDataIds = new Set(projectRows
    .filter((row) => row.sx_kanban_column_id || text(row.status).toLowerCase() === 'producing')
    .map((row) => text(row.company_id))
    .filter(Boolean));
  const manufacturingEvidenceIds = new Set([...productionConfiguredIds, ...productionDataIds]);
  const manufacturingIds = [...companyIds]
    .filter((companyId) => manufacturingEvidenceIds.has(companyId))
    .sort((a, b) => Number(productionConfiguredIds.has(b)) - Number(productionConfiguredIds.has(a))
      || Number(productionDataIds.has(b)) - Number(productionDataIds.has(a)))
    .slice(0, 2);
  const companyById = new Map(scope.companies.map((company) => [String(company.id), company]));
  const manufacturingCompanies = manufacturingIds.map((companyId) => {
    const rows = projectsByCompany.get(companyId) || [];
    const companyProjects = projectMetrics(rows, selectedPeriod, now);
    const companyPeople = peoplePacket.ok ? (peopleByCompany.get(companyId) || []).length : null;
    const companyWork = selectedWorkByCompany.get(companyId) || null;
    const load = companyPeople > 0 && companyWork?.open != null
      ? Number((companyWork.open / companyPeople).toFixed(2))
      : null;
    const companyAdvisory = companyAdvisoryConfigs?.[companyId] || null;
    const companyTarget = advisoryNumber(companyAdvisory, 'capacity_load_warning_per_active_person');
    const companyGap = companyTarget != null && load != null
      ? Number(Math.max(0, load - companyTarget).toFixed(2))
      : null;
    const complete = projectsPacket.ok && peoplePacket.ok && selectedWorkloadPacket.complete;
    return {
      company: companyById.get(companyId),
      status: complete ? 'LIVE WITH DATA GAPS' : (projectsPacket.ok || peoplePacket.ok || companyWork ? 'LIVE WITH DATA GAPS' : 'NOT CONNECTED'),
      freshness: combineFreshness([projectsPacket, peoplePacket, selectedWorkloadPacket], generatedAt, {
        datasetId: `manufacturing_capacity_${companyId}`,
        sloMinutes: 60,
      }),
      reconciliation: { state: complete ? 'MATCHED' : 'PARTIAL', checked_at: generatedAt, company_id: companyId },
      capacity: {
        active_projects: companyProjects.active_projects,
        production_projects: companyProjects.production_projects,
        overdue_projects: companyProjects.overdue_projects,
        open_work: companyWork?.open ?? null,
        active_people: companyPeople,
        load_per_active_person: load,
        capacity_target: companyTarget,
        capacity_gap: companyGap,
        target_contract: companyTarget == null ? null : {
          status: 'PROVISIONAL ADVISORY CONFIGURATION',
          version: companyAdvisory.current_version,
          canonical: false,
          operational_effect: false,
        },
      },
      data_gaps: companyTarget == null
        ? [{ source: 'capacity_targets', company_id: companyId, code: 'TARGET_NOT_CONFIGURED', message: 'Chưa có định mức năng lực được phê duyệt.' }]
        : [{ source: 'founder_advisory_configuration', company_id: companyId, code: 'PROVISIONAL_ADVISORY_ONLY', message: 'Ngưỡng tạm chỉ tạo cảnh báo trực quan.' }],
      drilldown: { ...finalDrilldownByKey.get('production'), href: `/sx/dashboard?company_id=${encodeURIComponent(companyId)}` },
    };
  });

  const planning = {
    selected_period: selectedPeriod,
    horizons: horizonItems,
    forecast: {
      active_projects: projects.active_projects,
      projects_due: projects.projects_due,
      open_work: workload.open,
      overdue_work: workload.overdue,
      capacity_gap: null,
    },
  };
  const capacity = {
    metric_contract: { version: 'founder_capacity_v1', unit: 'open task per active user', source: 'unified_tasks_v + users + projects' },
    freshness: combineFreshness([projectsPacket, peoplePacket, selectedWorkloadPacket], generatedAt, {
      datasetId: 'capacity_workload',
      sloMinutes: 60,
    }),
    active_people: activePeople,
    open_work: workload.open,
    due_in_period: workload.total,
    overdue_work: workload.overdue,
    load_per_active_person: loadPerActivePerson,
    utilization_status: provisionalTarget == null
      ? 'MEASURED WITHOUT APPROVED TARGET'
      : provisionalCapacityGap > 0
        ? 'ABOVE PROVISIONAL ADVISORY THRESHOLD'
        : 'WITHIN PROVISIONAL ADVISORY THRESHOLD',
    capacity_target: provisionalTarget,
    capacity_gap: provisionalCapacityGap,
    target_contract: provisionalTarget == null ? null : {
      status: 'PROVISIONAL ADVISORY CONFIGURATION',
      version: advisoryConfig.current_version,
      canonical: false,
      operational_effect: false,
    },
    data_gaps: capacityGaps,
    drilldown: finalDrilldownByKey.get('projects'),
  };
  const configurationCenter = {
    read_only: true,
    canonical_configuration_read_only: true,
    source: 'builtin route registry + app_module_registry',
    advisory_configuration: advisoryConfig,
    modules: [
      ...modules.map((module) => ({
        key: module.key,
        label: module.label,
        enabled: module.activation.enabled,
        company_ids: module.activation.company_ids,
        status: module.status,
        basis: module.activation.basis,
      })),
      ...registryEntries.filter((entry) => !modules.some((module) => module.key === entry.key)),
    ],
    permissions: {
      can_view: true,
      can_change: isAdminLike(user) && advisoryConfig?.enabled === true,
      required_permissions: ['reports:view', 'settings:edit'],
      changes_via: advisoryConfig?.enabled === true
        ? 'founder_advisory_configuration_service'
        : 'disabled',
    },
    data_gaps: registryPacket.gaps,
    drilldown: finalDrilldownByKey.get('configuration'),
  };
  const platformCapabilities = buildFounderPlatformCapabilities({
    modules,
    planning,
    capacity,
    decisions,
    configurationCenter,
    generatedAt,
  });
  const signalHub = buildSignalHub({ modules, scope, generatedAt });
  const correctionCenter = buildCorrectionCenter(decisions);

  return {
    contract_version: CONTRACT_VERSION,
    mode: MODE,
    generated_at: generatedAt,
    scope,
    period: selectedPeriod,
    modules,
    systems,
    planning,
    workload: {
      metric_contract: { version: 'unified_workload_v1', unit: 'task', source: 'unified_tasks_v via unifiedTasksQuery' },
      ...workload,
      freshness: selectedWorkloadPacket.freshness,
      reconciliation: selectedWorkloadPacket.reconciliation,
      data_gaps: selectedWorkloadPacket.gaps,
      drilldown: finalDrilldownByKey.get('projects'),
    },
    capacity,
    manufacturing_companies: manufacturingCompanies,
    decision_center: {
      contract: { version: 'founder_decision_read_v1', mode: 'read_recommend' },
      items: decisions,
      drilldown: finalDrilldownByKey.get('approvals'),
    },
    configuration_center: configurationCenter,
    platform_capabilities: platformCapabilities,
    signal_hub: signalHub,
    correction_center: correctionCenter,
    drilldowns,
    protections: {
      write_enabled: false,
      direct_database_write_enabled: false,
      synthetic_fallback_enabled: false,
      external_send_enabled: false,
      actions: [],
      provisional_configuration_write_enabled: advisoryConfig?.enabled === true,
      provisional_configuration_operational_effect: false,
    },
  };
}

module.exports = {
  CONTRACT_VERSION,
  MODE,
  MODULE_STATUSES,
  FRESHNESS_STATES,
  SOURCE_FRESHNESS_SLO_MINUTES,
  MODULE_FRESHNESS_SLO_MINUTES,
  PERIOD_KEYS,
  MODULE_DEFINITIONS,
  SYSTEM_DEFINITIONS,
  DRILLDOWN_DEFINITIONS,
  CONNECTOR_POLICY,
  FounderCockpitError,
  buildPeriodRange,
  buildPlanningRanges,
  summarizeWorkRows,
  mergeWorkSummaries,
  freshness,
  combineFreshness,
  buildSignalHub,
  buildCorrectionCenter,
  scopedFounderHref,
  resolveFounderCockpitScope,
  loadFounderCockpit,
  defaultReaders,
};
