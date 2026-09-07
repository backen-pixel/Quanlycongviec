/**
 * Customer Journey C-READ application service. OFFLINE fixtures only.
 * No config, credential, database, network, legacy route or mutation imports.
 * A future source adapter requires its own authority and security review; this
 * module does not register routes or enlarge the Founder-local allowlist.
 */
'use strict';

const { CRM_FIELDS, CRM_ACTION_GROUPS, crmActionMembership, describeCrmSource } = require('./customerJourneyCrmContract');
const { FINANCE_FIELDS, projectInvoiceCollection } = require('./customerJourneyFinanceContract');
const { LOGISTICS_FIELDS, projectOrderLogistics } = require('./customerJourneyLogisticsContract');
const { FEEDBACK_FIELDS, projectDealFeedback } = require('./customerJourneyFeedbackContract');

const CONTRACT_VERSION = 'customer_journey_offline_v1';
const MODE = 'OFFLINE_FIXTURE_ONLY';
const ENTITIES = ['customer', 'lead', 'deal', 'order', 'project', 'task', 'assignment',
  'purchase_request', 'purchase_order', 'invoice', 'payment', 'expense', 'quotation',
  'incident', 'rating', 'time_log', 'conversion_event', 'person', 'crm_event'];
// Source fields only. Derived claims are never accepted from an adapter, even
// when a fixture actor happens to list their names as field permissions.
const FIELDS = [...new Set(['status', 'temperature', 'stage', 'source_name', 'owner', 'supervisor',
  'executor_company_id', 'created_at', 'started_at', 'planned_start_at', 'due_at',
  'completed_at', 'occurred_at', 'blocker', 'next_action', 'impact', 'amount',
  'amount_basis', 'stars', 'feedback', 'hours', 'event_type', 'decision_required',
  'decision_reason', 'is_active', ...CRM_FIELDS, ...FINANCE_FIELDS, ...LOGISTICS_FIELDS, ...FEEDBACK_FIELDS])];
const DONE = new Set(['done', 'completed', 'cancelled']);
// Query capabilities are not inferred from an absent field. A future adapter
// must map each source timestamp explicitly (DATE vs timestamp + timezone).
const TIME_BASES = {
  customer: ['stock', 'created_at'], lead: ['stock', 'created_at', 'due_at'],
  deal: ['stock', 'created_at', 'due_at'], order: ['stock', 'created_at', 'due_at'],
  project: ['stock', 'created_at', 'due_at'], task: ['stock', 'created_at', 'due_at'],
  assignment: ['stock', 'created_at', 'due_at'], purchase_request: ['stock', 'created_at', 'due_at'],
  purchase_order: ['stock', 'created_at', 'due_at'], invoice: ['stock', 'created_at', 'due_at'],
  payment: ['stock', 'created_at'], expense: ['stock', 'created_at'], quotation: ['stock', 'created_at'],
  incident: ['stock', 'created_at'], rating: ['stock', 'created_at'],
  time_log: ['stock', 'started_at'], conversion_event: ['stock', 'occurred_at'], person: ['stock'],
  crm_event: ['stock', 'created_at'],
};
const SYSTEMS = [
  { id: 'market', name: 'Tư tưởng & Thị trường' },
  { id: 'solution', name: 'Tư duy & Giải pháp' },
  { id: 'capacity', name: 'Nguồn lực & Năng lực' },
  { id: 'operations', name: 'Vận hành & Giao giá trị' },
  { id: 'control', name: 'Báo cáo & Sự thật' },
  { id: 'correction', name: 'Sửa chữa & Tiến hóa' },
];
const GROUPS = [
  ['market_customers', 'market', 'Khách hàng theo định danh nguồn', ['customer'], 'customer', 'stock'],
  ['market_leads', 'market', 'Lead theo nguồn / nhiệt độ', ['lead'], 'lead', 'stock'],
  ['market_conversions', 'market', 'Sự kiện chuyển Lead → Deal', ['conversion_event'], 'conversion_event', 'occurred_at'],
  ['solution_deals', 'solution', 'Deal và giải pháp', ['deal'], 'deal', 'stock'],
  ['solution_orders', 'solution', 'Cam kết đơn hàng', ['order'], 'order', 'stock'],
  ['capacity_projects', 'capacity', 'Công trình / đơn vị thực hiện', ['project'], 'project', 'stock'],
  ['capacity_pr', 'capacity', 'Hạng mục cần mua (PR)', ['purchase_request'], 'purchase_request_item', 'stock'],
  ['capacity_po', 'capacity', 'Đơn mua hàng (PO)', ['purchase_order'], 'purchase_order', 'stock'],
  ['capacity_canonical', 'capacity', 'Định mức năng lực — chưa nối nguồn chuẩn', [], 'capacity_target', 'stock'],
  ['operations_work', 'operations', 'Công việc đến hạn', ['task', 'assignment'], 'canonical_work_item', 'due_at'],
  ['operations_inventory', 'operations', 'Toàn bộ công việc theo nguồn', ['task', 'assignment'], 'canonical_work_item', 'stock'],
  ['control_invoices', 'control', 'Hóa đơn theo nguồn (không phải tiền đã thu)', ['invoice'], 'invoice', 'stock'],
  ['control_payments', 'control', 'Bản ghi thu tiền theo hóa đơn', ['payment'], 'payment_record', 'stock'],
  ['control_expenses', 'control', 'Chi phí dự án đã ghi nhận (chưa phải toàn bộ giá vốn)', ['expense'], 'project_expense', 'stock'],
  ['control_quotes', 'control', 'Báo giá tham chiếu (không phải doanh thu)', ['quotation'], 'quotation', 'stock'],
  ['control_time', 'control', 'Nhật ký giờ (không phải lương)', ['time_log'], 'time_log', 'started_at'],
  ['control_profit', 'control', 'Lãi/lỗ đầy đủ — chưa có contract chuẩn', [], 'profit', 'stock'],
  ['control_payroll', 'control', 'Lương — quyền và rule chưa mở', [], 'payroll', 'stock'],
  ['correction_incidents', 'correction', 'Sự cố / việc cần khắc phục', ['incident'], 'incident', 'stock'],
  ['correction_ratings', 'correction', 'Phản hồi khách hàng theo Deal', ['rating'], 'rating', 'created_at'],
  ['correction_effectiveness', 'correction', 'Hiệu quả sau sửa / nghiệm thu — chưa đủ nguồn', [], 'verified_outcome', 'stock'],
].map(([id, system, name, entities, unit, basis]) => ({ id, system, name, entities, unit, basis }))
  .concat(CRM_ACTION_GROUPS.map((group) => ({ ...group, stock_only: true })), [
    ['operations_logistics', 'operations', 'Đơn có công trình giao/lắp liên kết', 'order', 'order'],
    ['operations_logistics_attention', 'operations', 'Đơn giao/lắp đang thực hiện hoặc có cảnh báo', 'order', 'order'],
    ['operations_install_overdue', 'operations', 'Đơn có mốc lắp đặt đã qua theo nguồn', 'order', 'order'],
    ['operations_logistics_incidents', 'operations', 'Đơn giao/lắp có sự cố nguồn (kể cả đã đóng)', 'order', 'order'],
    ['control_receivables', 'control', 'Hóa đơn còn thu theo snapshot nguồn', 'invoice', 'invoice'],
    ['control_overdue', 'control', 'Hóa đơn còn thu quá ngày hạn nguồn', 'invoice', 'invoice'],
    ['control_due_today', 'control', 'Hóa đơn còn thu đến hạn hôm nay theo nguồn', 'invoice', 'invoice'],
    ['correction_feedback', 'correction', 'Deal có đánh giá khách được phép thấy', 'deal', 'deal'],
    ['correction_not_rated', 'correction', 'Deal chưa có đánh giá — nguồn đầy đủ', 'deal', 'deal'],
    ['correction_feedback_unknown', 'correction', 'Phản hồi chưa rõ / bị khóa theo nguồn', 'deal', 'deal'],
  ].map(([id, system, name, entity, unit]) => ({ id, system, name, entities: [entity], unit,
    basis: 'stock', stock_only: true, contract_key: id.startsWith('operations_') ? 'JOURNEY_LOGISTICS_SOURCE_V1'
      : id.startsWith('control_') ? 'INVOICE_SNAPSHOT_COLLECTION_V1' : 'JOURNEY_DEAL_FEEDBACK_SOURCE_V1' })));
const EDGE_TYPES = {
  customer_lead: [['customer'], ['lead', 'deal']],
  primary_project: [['lead', 'deal'], ['project']],
  junction_project: [['lead', 'deal'], ['project']],
  order_lead: [['order'], ['lead', 'deal']],
  fulfillment_lead: [['order'], ['lead', 'deal']],
  order_project: [['order'], ['project']],
  logistics_project: [['order'], ['project']],
  task_lead: [['task', 'assignment'], ['lead', 'deal']],
  task_project: [['task', 'assignment'], ['project']],
  mirror: [['assignment'], ['task']],
  pr_project: [['purchase_request'], ['project']],
  pr_order: [['purchase_request'], ['order']],
  po_lead: [['purchase_order'], ['lead', 'deal']],
  invoice_lead: [['invoice'], ['lead', 'deal']],
  invoice_project: [['invoice'], ['project']],
  invoice_order: [['invoice'], ['order']],
  payment_invoice: [['payment'], ['invoice']],
  expense_project: [['expense'], ['project']],
  quotation_lead: [['quotation'], ['lead', 'deal']],
  quotation_project: [['quotation'], ['project']],
  incident_project: [['incident'], ['project']],
  rating_deal: [['rating'], ['deal']],
  time_task: [['time_log'], ['task']],
  event_lead: [['conversion_event'], ['lead', 'deal']],
  survey_event_lead: [['crm_event'], ['lead', 'deal']],
};
const REF_RE = /^[a-z][a-z0-9_]*:[A-Za-z0-9_-]{1,100}$/;
const scalar = (value) => value === null || typeof value === 'string'
  || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const clone = (value) => JSON.parse(JSON.stringify(value));
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
class CustomerJourneyError extends Error {
  constructor(code, status = 400) {
    super(`Không thể đọc hành trình ngoại tuyến (${code}).`);
    this.name = 'CustomerJourneyError'; this.code = code; this.status = status;
  }
}
function fail(code, status) { throw new CustomerJourneyError(code, status); }
function calendarRange(period, anchor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor || '')) fail('INVALID_PERIOD_ANCHOR');
  const date = new Date(`${anchor}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== anchor) fail('INVALID_PERIOD_ANCHOR');
  const start = new Date(date); const end = new Date(date);
  if (period === 'week') {
    start.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    end.setTime(start.getTime()); end.setUTCDate(start.getUTCDate() + 7);
  } else {
    start.setUTCDate(1);
    if (period === 'quarter') start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3);
    end.setTime(start.getTime()); end.setUTCMonth(start.getUTCMonth() + (period === 'quarter' ? 3 : 1));
  }
  return { start_at: `${start.toISOString().slice(0, 10)}T00:00:00+07:00`,
    end_before: `${end.toISOString().slice(0, 10)}T00:00:00+07:00`, timezone: 'Asia/Ho_Chi_Minh' };
}

/** Trusted actor is injected by the application boundary, NEVER accepted from request context. */
function createCustomerJourneyService({ adapter, actor, now = () => new Date(),
  maxSnapshotAgeMs = 15 * 60 * 1000, adapterTimeoutMs = 1000 } = {}) {
  if (!adapter || adapter.kind !== 'OFFLINE_FIXTURE' || adapter.live !== false
    || adapter.read_only !== true || typeof adapter.readSnapshot !== 'function') fail('OFFLINE_ADAPTER_REQUIRED', 403);
  if (!actor || actor.active !== true || !actor.ecosystem_id || !Array.isArray(actor.company_ids)
    || !Array.isArray(actor.resource_permissions) || !actor.field_permissions || !Array.isArray(actor.edge_permissions)) fail('TRUSTED_ACTOR_REQUIRED', 403);
  const trusted = clone(actor);
  if (trusted.company_id && !trusted.company_ids.includes(trusted.company_id)) fail('ACTOR_SCOPE_INVALID', 403);
  const snapshots = new Map();
  const snapshotCalendarDays = new Map();
  const allowedFields = (entity) => new Set(trusted.field_permissions[entity] || []);
  const canReadFields = (entity, names = []) => trusted.resource_permissions.includes(entity)
    && names.every((name) => allowedFields(entity).has(name));
  const safeGaps = (gaps) => [...new Set((gaps || []).map((gap) =>
    typeof gap === 'string' && /^[A-Z0-9_]{1,100}$/.test(gap) ? gap : 'SOURCE_GAP_REDACTED'))];
  const sourceCoverage = (value) => ['EXACT', 'PARTIAL', 'UNKNOWN'].includes(value) ? value : 'UNKNOWN';
  const relationState = (state, kind) => sourceCoverage(state.snapshot.relationship_coverage?.[kind]?.state
    || state.snapshot.relationship_coverage?.[kind]);
  const coverageState = (state, entity) => sourceCoverage(state.snapshot.coverage?.[entity]?.state);

  function normalizeContext(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('UNTRUSTED_CONTEXT');
    const allowed = ['ecosystem_id', 'company_id', 'period', 'period_anchor', 'filters', 'snapshot_id',
      'start_at', 'end_before', 'timezone'];
    if (Object.keys(input).some((key) => !allowed.includes(key))) fail('UNTRUSTED_CONTEXT');
    const ecosystem = input.ecosystem_id || trusted.ecosystem_id;
    if (ecosystem !== trusted.ecosystem_id) fail('ECOSYSTEM_DENIED', 403);
    const company = input.company_id || trusted.company_id || 'all';
    if ((trusted.company_id && company !== trusted.company_id)
      || (company !== 'all' && !trusted.company_ids.includes(company))) fail('COMPANY_DENIED', 403);
    const period = input.period || 'month';
    if (!['week', 'month', 'quarter'].includes(period)) fail('INVALID_PERIOD');
    const anchor = input.period_anchor || new Date(now().getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const range = calendarRange(period, anchor);
    for (const key of ['start_at', 'end_before', 'timezone']) {
      if (input[key] !== undefined && input[key] !== range[key]) fail('CONTEXT_RANGE_MISMATCH', 409);
    }
    const filters = input.filters || {};
    if (!filters || Array.isArray(filters) || Object.keys(filters).some((key) => !['q', 'status', 'temperature', 'time_basis'].includes(key))) fail('INVALID_FILTER');
    if (Object.values(filters).some((value) => typeof value !== 'string' || value.length > 120)) fail('INVALID_FILTER');
    if (filters.time_basis && !['stock', 'created_at', 'due_at', 'occurred_at'].includes(filters.time_basis)) fail('INVALID_TIME_BASIS');
    if (filters.temperature && !['cold', 'warm', 'hot', 'unknown'].includes(filters.temperature)) fail('INVALID_TEMPERATURE');
    return { ecosystem_id: ecosystem, company_id: company, period, period_anchor: anchor,
      filters: clone(filters), ...range, ...(input.snapshot_id ? { snapshot_id: input.snapshot_id } : {}) };
  }
  async function read(input) {
    const context = normalizeContext(input);
    let timer; let raw;
    try {
      raw = await Promise.race([adapter.readSnapshot(clone(context)), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new CustomerJourneyError('SOURCE_TIMEOUT', 503)), adapterTimeoutMs);
      })]);
    } catch (error) {
      if (error instanceof CustomerJourneyError) throw error;
      fail('SOURCE_UNAVAILABLE', 503);
    } finally { clearTimeout(timer); }
    let snapshot;
    try { snapshot = clone(raw); } catch { fail('SOURCE_CONTRACT_INVALID', 503); }
    if (!snapshot || snapshot.mode !== MODE || snapshot.ecosystem_id !== trusted.ecosystem_id
      || typeof snapshot.snapshot_id !== 'string' || !snapshot.snapshot_id
      || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.edges) || !Array.isArray(snapshot.companies)) fail('SOURCE_CONTRACT_INVALID', 503);
    if (typeof snapshot.observed_at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(snapshot.observed_at)) fail('SOURCE_OBSERVATION_TIME_INVALID', 503);
    const observedNow = now();
    const age = observedNow.getTime() - Date.parse(snapshot.observed_at);
    if (!Number.isFinite(age) || age < -30_000 || age > maxSnapshotAgeMs) fail('SNAPSHOT_STALE', 409);
    if (context.snapshot_id && context.snapshot_id !== snapshot.snapshot_id) fail('SNAPSHOT_CHANGED', 409);
    const signature = stable(snapshot);
    if (snapshots.has(snapshot.snapshot_id) && snapshots.get(snapshot.snapshot_id) !== signature) fail('SNAPSHOT_MUTATED', 409);
    snapshots.set(snapshot.snapshot_id, signature);
    if (!snapshotCalendarDays.has(snapshot.snapshot_id)) snapshotCalendarDays.set(snapshot.snapshot_id,
      new Date(observedNow.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
    if (snapshots.size > 8) {
      const oldest = snapshots.keys().next().value;
      snapshots.delete(oldest); snapshotCalendarDays.delete(oldest);
    }
    context.snapshot_id = snapshot.snapshot_id;
    const visibleCompanies = snapshot.companies.filter((company) => company.ecosystem_id === trusted.ecosystem_id
      && company.active === true && trusted.company_ids.includes(company.id)
      && (!trusted.company_id || company.id === trusted.company_id));
    const companyIds = new Set(visibleCompanies.map((company) => company.id));
    if (!companyIds.size) fail('COMPANY_SCOPE_EMPTY', 403);
    if (context.company_id !== 'all' && !companyIds.has(context.company_id)) fail('COMPANY_DENIED', 403);
    const permitted = (row) => row && row.ecosystem_id === trusted.ecosystem_id
      && companyIds.has(row.company_id) && (context.company_id === 'all' || row.company_id === context.company_id)
      && trusted.resource_permissions.includes(row.entity) && !(trusted.denied_record_refs || []).includes(row.ref);
    const records = new Map(); const conflicts = new Set();
    for (const row of snapshot.records) {
      if (!permitted(row)) continue;
      if (!ENTITIES.includes(row.entity) || !REF_RE.test(row.ref || '') || !row.source_type || !row.source_id
        || row.ref !== `${row.source_type}:${row.source_id}`) fail('SOURCE_ID_INVALID', 503);
      const fields = {}; const granted = allowedFields(row.entity);
      for (const field of FIELDS) {
        if (granted.has(field) && Object.prototype.hasOwnProperty.call(row.fields || {}, field)) {
          if (!scalar(row.fields[field])) fail('SOURCE_FIELD_INVALID', 503);
          if (['executor_company_id', 'logistics_company_id'].includes(field)
            && row.fields[field] && !companyIds.has(row.fields[field])) continue;
          fields[field] = row.fields[field];
        }
      }
      const projected = { ref: row.ref, entity: row.entity, source_type: row.source_type, source_id: row.source_id,
        group_id: ['task', 'assignment'].includes(row.entity) ? 'operations_inventory'
          : GROUPS.find((group) => group.entities.includes(row.entity))?.id || null,
        label: granted.has('label') && typeof row.label === 'string' ? row.label : 'Hồ sơ nguồn',
        label_available: granted.has('label') && typeof row.label === 'string' && row.label.length > 0,
        company_id: row.company_id, fields,
        restricted_fields: FIELDS.filter((field) => !granted.has(field)),
        missing_fields: ['owner', 'started_at', 'due_at', 'completed_at', 'blocker', 'next_action', 'impact']
          .filter((field) => !granted.has(field) || fields[field] === null || fields[field] === undefined) };
      if (records.has(row.ref) && stable(records.get(row.ref)) !== stable(projected)) conflicts.add(row.ref);
      else records.set(row.ref, projected);
    }
    for (const ref of conflicts) records.delete(ref);
    // deal_customer_ratings.deal_lead_id is a single FK. Contradictory
    // observations (including a hidden second target) cannot attribute one
    // rating to multiple customers. Keep the conflict gap, omit that rating.
    const ratingTargets = new Map();
    for (const edge of snapshot.edges) if (edge.kind === 'rating_deal' && records.get(edge.from)?.entity === 'rating') {
      if (!ratingTargets.has(edge.from)) ratingTargets.set(edge.from, new Set());
      ratingTargets.get(edge.from).add(edge.to);
    }
    const ratingRelationConflicts = new Set();
    for (const [ref, targets] of ratingTargets) if (targets.size > 1) {
      ratingRelationConflicts.add(ref); conflicts.add(ref); records.delete(ref);
    }
    const edges = []; const seen = new Set(); const unresolvedLeadSources = new Set();
    const unresolvedOrderSources = new Set();
    const leadBoundKinds = new Set(['task_lead', 'invoice_lead', 'quotation_lead', 'po_lead', 'order_lead', 'fulfillment_lead', 'survey_event_lead']);
    const orderBoundKinds = new Set(['invoice_order', 'pr_order']);
    for (const edge of snapshot.edges) {
      const kind = EDGE_TYPES[edge.kind]; const from = records.get(edge.from); const to = records.get(edge.to);
      const bindingUnavailable = !to || !trusted.edge_permissions.includes(edge.kind);
      if (leadBoundKinds.has(edge.kind) && from && bindingUnavailable) unresolvedLeadSources.add(from.ref);
      if (orderBoundKinds.has(edge.kind) && from && bindingUnavailable) unresolvedOrderSources.add(from.ref);
      if (!kind || !trusted.edge_permissions.includes(edge.kind) || !from || !to) continue;
      if (!kind[0].includes(from.entity) || !kind[1].includes(to.entity)) fail('SOURCE_EDGE_INVALID', 503);
      const key = stable([edge.kind, edge.from, edge.to]);
      if (!seen.has(key)) { seen.add(key); edges.push({ kind: edge.kind, from: edge.from, to: edge.to }); }
    }
    const state = { context, snapshot, companies: visibleCompanies.map(({ id, name, kind, parent_id }) => ({
      id, name, kind, parent_id: companyIds.has(parent_id) ? parent_id : null,
    })), records, edges, conflicts, unresolvedLeadSources, unresolvedOrderSources,
      todayDate: snapshotCalendarDays.get(snapshot.snapshot_id), functional: new Map(), ratingRelationConflicts };
    projectFunctionalSources(state);
    return state;
  }
  function projectFunctionalSources(state) {
    const { snapshot, records, edges, conflicts } = state;
    const rawRatings = snapshot.records.filter((row) => row?.entity === 'rating');
    const feedbackCanRead = canReadFields('rating', ['stars']) && trusted.edge_permissions.includes('rating_deal');
    const feedbackComplete = feedbackCanRead && coverageState(state, 'rating') === 'EXACT'
      && relationState(state, 'rating_deal') === 'EXACT'
      && snapshot.edges.filter((edge) => edge.kind === 'rating_deal').every((rawEdge) =>
        edges.some((edge) => edge.kind === 'rating_deal' && edge.from === rawEdge.from && edge.to === rawEdge.to))
      && rawRatings.every((rawRow) => {
        const rating = records.get(rawRow.ref);
        const links = edges.filter((edge) => edge.kind === 'rating_deal' && edge.from === rawRow.ref);
        const rawLinks = snapshot.edges.filter((edge) => edge.kind === 'rating_deal' && edge.from === rawRow.ref);
        return rating?.source_type === 'deal_customer_ratings' && !conflicts.has(rawRow.ref)
          && typeof rating.fields.stars === 'number' && rating.fields.stars >= 1 && rating.fields.stars <= 5
          && links.length === 1 && new Set(rawLinks.map((edge) => edge.to)).size === 1
          && rawLinks.every((edge) => links.some((link) => link.to === edge.to));
      });
    const incidentCollectionComplete = snapshot.records.filter((row) => row?.entity === 'incident').every((rawRow) => {
      const incident = records.get(rawRow.ref);
      const links = edges.filter((edge) => edge.kind === 'incident_project' && edge.from === rawRow.ref);
      return incident?.source_type === 'project_incidents' && !conflicts.has(rawRow.ref) && links.length === 1;
    });
    const completeEdges = (kind, relevant) => relationState(state, kind) === 'EXACT'
      && snapshot.edges.filter((edge) => edge.kind === kind && relevant(edge)).every((rawEdge) =>
        edges.some((edge) => edge.kind === kind && edge.from === rawEdge.from && edge.to === rawEdge.to));
    for (const row of records.values()) {
      const descriptions = [];
      const crm = describeCrmSource(row);
      if (crm) {
        Object.assign(row.fields, { crm_source_state: crm.state, crm_source_kind: crm.kind,
          crm_source_basis: crm.contract_key });
        descriptions.push(...crm.gaps);
      }
      if (row.entity === 'invoice') {
        const finance = projectInvoiceCollection(row, { todayDate: state.todayDate,
          clockBasis: 'FIXTURE_AS_OF_DAY_NOT_SOURCE_HOST_CALENDAR' });
        Object.assign(row.fields, { collection_state: finance.state, collection_remaining_amount: finance.remaining_amount,
          collection_basis: finance.basis, collection_as_of_date: finance.as_of_date,
          collection_clock_basis: finance.clock_basis });
        state.functional.set(row.ref, finance);
        descriptions.push(...finance.gaps, 'INVOICE_SNAPSHOT_NOT_CANONICAL_ACCOUNTING_RECEIVABLE',
          'SOURCE_HOST_CALENDAR_NOT_VERIFIED', 'INVOICE_COLLECTION_NOT_LIFECYCLE_OR_LEGAL_COLLECTIBILITY');
      }
      if (row.entity === 'order') {
        const projectRefs = new Set(edges.filter((edge) => edge.kind === 'logistics_project' && edge.from === row.ref).map((edge) => edge.to));
        const linksComplete = completeEdges('logistics_project', (edge) => edge.from === row.ref);
        const incidentsComplete = incidentCollectionComplete && completeEdges('incident_project', (edge) => projectRefs.has(edge.to));
        const logistics = projectOrderLogistics(row, { records, edges, todayDate: state.todayDate,
          clockBasis: 'Asia/Ho_Chi_Minh', edgePermissions: trusted.edge_permissions,
          coverage: { project: coverageState(state, 'project'), incident: coverageState(state, 'incident'),
            logistics_project: linksComplete ? 'EXACT' : 'UNKNOWN',
            incident_project: incidentsComplete ? 'EXACT' : 'UNKNOWN' } });
        Object.assign(row.fields, { logistics_state: logistics.state, logistics_flags: logistics.flags.join(' | '),
          shipping_state: logistics.flag_states.SHIPPING, installing_state: logistics.flag_states.INSTALLING,
          install_deadline_state: logistics.flag_states.INSTALL_DEADLINE_PAST,
          incident_state: logistics.flag_states.INCIDENT, logistics_basis: logistics.basis });
        state.functional.set(row.ref, logistics);
        descriptions.push(...logistics.gaps);
      }
      if (row.entity === 'deal') {
        const ratings = edges.filter((edge) => edge.kind === 'rating_deal' && edge.to === row.ref)
          .map((edge) => records.get(edge.from));
        const feedback = projectDealFeedback(row, { ratings, complete: feedbackComplete, canRead: feedbackCanRead });
        Object.assign(row.fields, { feedback_state: feedback.state, feedback_coverage: feedback.coverage,
          feedback_count: feedback.visible_rating_count, outcome_state: feedback.outcome_state,
          outcome_basis: feedback.outcome_basis });
        state.functional.set(row.ref, feedback);
        descriptions.push(...feedback.gaps);
        if (state.ratingRelationConflicts.size) descriptions.push('RATING_DEAL_RELATION_CONFLICT_OMITTED');
      }
      row.functional_gaps = safeGaps(descriptions);
    }
  }
  function envelope(state) {
    return { contract_version: CONTRACT_VERSION, mode: MODE, context: clone(state.context),
      context_key: stable(state.context), snapshot: { id: state.snapshot.snapshot_id,
        observed_at: state.snapshot.observed_at, coverage: 'SOURCE_QUALIFIED', live_connected: false } };
  }
  function functionalRequirements(definition) {
    const id = definition.id;
    if (CRM_ACTION_GROUPS.some((group) => group.id === id)) return {
      sources: Object.fromEntries(definition.entities.map((entity) => [entity, definition.required_fields])), edges: [],
    };
    if (['control_receivables', 'control_overdue', 'control_due_today'].includes(id)) return {
      sources: { invoice: ['total', 'paid_amount', ...(id === 'control_receivables' ? [] : ['due_date'])] }, edges: [],
    };
    if (['correction_feedback', 'correction_not_rated', 'correction_feedback_unknown'].includes(id)) return {
      sources: { deal: ['crm_stage_name'], rating: ['stars'] }, edges: ['rating_deal'],
    };
    if (['operations_logistics', 'operations_logistics_attention', 'operations_install_overdue', 'operations_logistics_incidents'].includes(id)) {
      const checkStatus = ['operations_logistics_attention', 'operations_install_overdue'].includes(id);
      const checkIncidents = ['operations_logistics_attention', 'operations_logistics_incidents'].includes(id);
      return { sources: { order: [], project: checkStatus ? ['status', 'vc_stage_slug', 'vc_temp_staged', 'install_date', 'delivery_date'] : [],
        ...(checkIncidents ? { incident: [] } : {}) },
      edges: ['logistics_project', ...(checkIncidents ? ['incident_project'] : [])] };
    }
    return { sources: {}, edges: [] };
  }
  function functionalMembership(state, definition, row) {
    const id = definition.id;
    if (CRM_ACTION_GROUPS.some((group) => group.id === id)) return crmActionMembership(id, row);
    if (['control_receivables', 'control_overdue', 'control_due_today'].includes(id)) {
      if (row.source_type !== 'invoices') return null;
      const value = state.functional.get(row.ref);
      if (!value || value.remaining_amount === null) return null;
      if (id === 'control_receivables') return value.remaining_amount > 0;
      if (value.state === 'UNKNOWN' || value.state === 'UNKNOWN_DUE') return null;
      return value.state === (id === 'control_overdue' ? 'OVERDUE' : 'DUE_TODAY');
    }
    if (['correction_feedback', 'correction_not_rated', 'correction_feedback_unknown'].includes(id)) {
      const value = state.functional.get(row.ref);
      if (!value) return null;
      if (id === 'correction_feedback_unknown') return ['UNKNOWN', 'SOURCE_STAGE_LOCKED'].includes(value.state);
      if (value.state === 'UNKNOWN') return null;
      return value.state === (id === 'correction_feedback' ? 'RATED' : 'NOT_RATED');
    }
    if (['operations_logistics', 'operations_logistics_attention', 'operations_install_overdue', 'operations_logistics_incidents'].includes(id)) {
      const value = state.functional.get(row.ref);
      if (row.source_type !== 'orders' || !value) return null;
      if (id === 'operations_logistics') return value.project_plans.length ? true : null;
      const flags = id === 'operations_logistics_attention' ? Object.values(value.flag_states)
        : [value.flag_states[id === 'operations_install_overdue' ? 'INSTALL_DEADLINE_PAST' : 'INCIDENT']];
      return flags.includes('YES') ? true : flags.includes('UNKNOWN') ? null : false;
    }
    return true;
  }
  function groupData(state, groupId) {
    const definition = GROUPS.find((group) => group.id === groupId);
    if (!definition) fail('GROUP_NOT_FOUND', 404);
    const { filters, start_at: start, end_before: end } = state.context;
    const basis = filters.time_basis || definition.basis;
    const required = [...(filters.q ? ['label'] : []), ...(filters.status ? ['status'] : []),
      ...(filters.temperature ? ['temperature'] : []), ...(basis !== 'stock' ? [basis] : [])];
    const unsupported = (definition.stock_only && basis !== 'stock') || definition.entities.some((entity) => !TIME_BASES[entity].includes(basis)
      || (filters.temperature && entity !== 'lead'));
    const requirements = functionalRequirements(definition);
    const functionalScopeDenied = Object.entries(requirements.sources).some(([entity, fields]) => !canReadFields(entity, fields))
      || requirements.edges.some((kind) => !trusted.edge_permissions.includes(kind));
    const mirrorScopeUnknown = definition.unit === 'canonical_work_item'
      && !trusted.edge_permissions.includes('mirror');
    const locked = !definition.entities.length || unsupported || mirrorScopeUnknown || functionalScopeDenied || definition.entities.some((entity) => !trusted.resource_permissions.includes(entity)
      || required.some((field) => !allowedFields(entity).has(field)));
    const mirrorSources = new Set(state.edges.filter((edge) => edge.kind === 'mirror').map((edge) => edge.from));
    let membershipUnknown = 0;
    const rows = locked ? [] : [...state.records.values()].filter((row) => {
      if (!definition.entities.includes(row.entity)) return false;
      if (definition.unit === 'canonical_work_item' && mirrorSources.has(row.ref)) return false;
      const unknownField = (filters.q && !row.label_available)
        || (filters.status && row.fields.status === undefined)
        || (filters.temperature && row.fields.temperature === undefined)
        || (basis !== 'stock' && (row.fields[basis] === undefined
          || (row.fields[basis] !== null && (!Number.isFinite(Date.parse(row.fields[basis]))
            || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(row.fields[basis])))));
      if (unknownField) { membershipUnknown += 1; return false; }
      if (filters.q && !row.label.toLocaleLowerCase('vi').includes(filters.q.toLocaleLowerCase('vi'))) return false;
      if (filters.status && row.fields.status !== filters.status) return false;
      if (filters.temperature && (row.fields.temperature || 'unknown') !== filters.temperature) return false;
      const functionalMember = functionalMembership(state, definition, row);
      if (functionalMember === null) { membershipUnknown += 1; return false; }
      if (!functionalMember) return false;
      if (basis !== 'stock') {
        const time = Date.parse(row.fields[basis]);
        if (!Number.isFinite(time) || time < Date.parse(start) || time >= Date.parse(end)) return false;
      }
      return true;
    }).sort((a, b) => a.ref.localeCompare(b.ref));
    const states = [...new Set([...definition.entities, ...Object.keys(requirements.sources)])]
      .map((entity) => coverageState(state, entity));
    states.push(...requirements.edges.map((kind) => relationState(state, kind)));
    const coverage = locked || states.includes('UNKNOWN') || (membershipUnknown && !rows.length) ? 'UNKNOWN'
      : (states.some((value) => value !== 'EXACT') || state.conflicts.size || membershipUnknown ? 'PARTIAL' : 'EXACT');
    const gaps = [...new Set([...(locked ? ['SOURCE_SCOPE_LOCKED'] : []),
      ...(coverage !== 'EXACT' ? [`${coverage}_SOURCE_COVERAGE`] : []),
      ...(state.conflicts.size ? ['CONFLICTING_SOURCE_ID_OMITTED'] : []),
      ...(unsupported ? ['FILTER_OR_TIME_BASIS_NOT_SUPPORTED'] : []),
      ...(membershipUnknown ? ['FILTER_MEMBERSHIP_UNKNOWN'] : []),
      ...(mirrorScopeUnknown ? ['CANONICAL_MIRROR_SCOPE_UNKNOWN'] : []),
      ...(functionalScopeDenied ? ['FUNCTIONAL_SOURCE_FIELD_OR_EDGE_SCOPE_DENIED'] : []),
      ...(definition.stock_only ? ['SOURCE_STOCK_GROUP_NOT_PERIOD_FLOW'] : []),
      ...rows.flatMap((row) => definition.contract_key ? row.functional_gaps || [] : []),
      ...(!definition.entities.length ? ['CANONICAL_SOURCE_OR_RULE_NOT_CONNECTED'] : []),
      ...definition.entities.flatMap((entity) => state.snapshot.coverage?.[entity]?.gaps || [])
        .map((code) => /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'SOURCE_GAP_REDACTED')])];
    return { rows, group: { id: definition.id, name: definition.name, unit: definition.unit,
      count: coverage === 'UNKNOWN' ? null : rows.length, coverage, basis, locked, gaps,
      count_relation: coverage === 'EXACT' ? 'eq' : coverage === 'PARTIAL' ? 'gte' : 'unknown',
      predicate: { entities: definition.entities, filters: clone(filters), basis, timezone: state.context.timezone,
        ...(definition.contract_key ? { source_contract: definition.contract_key,
          required_sources: clone(requirements.sources), required_edges: [...requirements.edges] } : {}) } } };
  }
  async function overview(context) {
    const state = await read(context);
    const groupResults = GROUPS.map((group) => groupData(state, group.id));
    const groups = groupResults.map((result) => result.group);
    const inventory = groupData(state, 'operations_inventory');
    const readableStatus = ['task', 'assignment'].every((entity) => allowedFields(entity).has('status'));
    const knownStatuses = new Set(['pending', 'todo', 'in_progress', 'review', 'blocked', ...DONE]);
    const completeStatus = readableStatus && inventory.rows.every((row) => knownStatuses.has(row.fields.status));
    const open = completeStatus && inventory.group.coverage === 'EXACT'
      ? inventory.rows.filter((row) => row.fields.status && !DONE.has(row.fields.status)).length : null;
    const people = trusted.resource_permissions.includes('person') && allowedFields('person').has('is_active')
      && state.snapshot.coverage?.person?.state === 'EXACT'
      ? [...state.records.values()].filter((row) => row.entity === 'person' && row.fields.is_active === true).length : null;
    const matchedRefs = new Set(groupResults.flatMap((result) => result.rows.map((row) => row.ref)));
    const decisions = [...state.records.values()].filter((row) => matchedRefs.has(row.ref) && row.fields.decision_required === true)
      .map((row) => ({ id: row.ref, title: row.label, source_ref: row.ref,
        group_id: (groupResults.find((result) => result.group.id === row.group_id && result.rows.some((item) => item.ref === row.ref))
          || groupResults.find((result) => result.rows.some((item) => item.ref === row.ref)))?.group.id || null,
        reason: row.fields.decision_reason || null, owner: row.fields.owner || null,
        deadline: row.fields.due_at || null, gaps: row.missing_fields }));
    return { ...envelope(state), companies: state.companies,
      systems: SYSTEMS.map((system) => ({ ...system, groups: groups.filter((group) => GROUPS.find((item) => item.id === group.id).system === system.id) })),
      planning: { period: state.context.period, start_at: state.context.start_at,
        end_before: state.context.end_before, basis: 'EACH_GROUP_HAS_ITS_OWN_TIME_BASIS', forecast: null },
      capacity: { open_work: open, active_people: people, load_per_active_person: null,
        capacity_target: null, capacity_gap: null, basis: 'AUTHORIZED_VISIBLE_OPEN_TASKS; NOT CANONICAL CAPACITY',
        gaps: ['CAPACITY_RULE_NOT_CONNECTED', ...(!completeStatus ? ['WORK_STATUS_COVERAGE_UNKNOWN'] : [])] }, decisions,
      decision_center: { items: decisions, mode: 'SOURCE_READ_ONLY', execution_enabled: false },
      protections: { real_data_connected: false, write_enabled: false, live_routes_registered: false,
        ai_runtime_enabled: false, founder_acceptance: 'HOLD', wp3: 'STOP' } };
  }
  async function list(context, groupId, { page = 1, pageSize = 20 } = {}) {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) fail('INVALID_PAGE');
    const state = await read(context); const { group, rows } = groupData(state, groupId);
    const from = (page - 1) * pageSize;
    if (!Number.isSafeInteger(from)) fail('INVALID_PAGE');
    return { ...envelope(state), group, records: rows.slice(from, from + pageSize),
      pagination: { page, page_size: pageSize, total: group.count, has_more: from + pageSize < rows.length,
        complete: group.coverage === 'EXACT', known_records: rows.length } };
  }
  async function detail(context, groupId, recordRef, options = {}) {
    const state = await read(context); const { group, rows } = groupData(state, groupId);
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some((key) => key !== 'via')) fail('INVALID_NAVIGATION_SCOPE');
    let record = rows.find((row) => row.ref === recordRef);
    let navigationScope = null;
    if (options.via) {
      const via = options.via;
      if (!via || typeof via !== 'object' || Array.isArray(via)
        || Object.keys(via).sort().join(',') !== 'group_id,parent_ref'
        || typeof via.group_id !== 'string' || !REF_RE.test(via.parent_ref || '')) fail('INVALID_NAVIGATION_SCOPE');
      const parent = await detail(state.context, via.group_id, via.parent_ref);
      const allowedRelated = [...parent.customers, ...parent.commitments, ...parent.tasks, ...parent.related];
      const definition = GROUPS.find((item) => item.id === groupId);
      record = allowedRelated.find((row) => row.ref === recordRef && definition.entities.includes(row.entity));
      navigationScope = { group_id: via.group_id, parent_ref: via.parent_ref };
    }
    if (!record || (!navigationScope && group.locked)) fail('RESOURCE_DENIED', 403);
    const get = (ref) => state.records.get(ref);
    const leadRefs = new Set(); const projectRefs = new Set(); const orderRefs = new Set();
    const taskSeeds = new Set(['task', 'assignment'].includes(record.entity) ? [record.ref] : []);
    const financialSeeds = new Set(record.entity === 'invoice' ? [record.ref] : []);
    if (['lead', 'deal'].includes(record.entity)) leadRefs.add(record.ref);
    if (record.entity === 'project') projectRefs.add(record.ref);
    if (record.entity === 'order') orderRefs.add(record.ref);
    for (const edge of state.edges) {
      if (record.entity === 'customer' && edge.kind === 'customer_lead' && edge.from === record.ref) leadRefs.add(edge.to);
      if (edge.from === record.ref && ['lead', 'deal'].includes(get(edge.to).entity)) leadRefs.add(edge.to);
      if (edge.from === record.ref && get(edge.to).entity === 'project') projectRefs.add(edge.to);
      if (edge.from === record.ref && get(edge.to).entity === 'order') orderRefs.add(edge.to);
      if (edge.from === record.ref && edge.kind === 'time_task') taskSeeds.add(edge.to);
      if (edge.from === record.ref && edge.kind === 'payment_invoice') financialSeeds.add(edge.to);
    }
    for (const edge of state.edges) {
      if (taskSeeds.has(edge.from) && ['lead', 'deal'].includes(get(edge.to).entity)) leadRefs.add(edge.to);
      if (taskSeeds.has(edge.from) && get(edge.to).entity === 'project') projectRefs.add(edge.to);
      if (financialSeeds.has(edge.from) && ['lead', 'deal'].includes(get(edge.to).entity)) leadRefs.add(edge.to);
      if (financialSeeds.has(edge.from) && get(edge.to).entity === 'project') projectRefs.add(edge.to);
      if (financialSeeds.has(edge.from) && get(edge.to).entity === 'order') orderRefs.add(edge.to);
    }
    const identityBlocked = [record.ref, ...taskSeeds, ...financialSeeds, ...orderRefs].some((ref) =>
      state.unresolvedLeadSources.has(ref) || state.unresolvedOrderSources.has(ref));
    if (identityBlocked) leadRefs.clear();
    // Ancestors of a selected source record. Do not traverse a customer's shared
    // project back into another customer's unrelated deals.
    if (record.entity !== 'customer' && !identityBlocked) {
      for (const edge of state.edges) {
        if (orderRefs.has(edge.from) && ['lead', 'deal'].includes(get(edge.to).entity)) leadRefs.add(edge.to);
      }
      // A selected order/task with an explicit lead must not expand through a
      // shared project into another customer's deal. Project-only lineage may
      // legitimately have multiple customers, so preserve all those edges.
      if (!leadRefs.size) for (const edge of state.edges) {
        if (projectRefs.has(edge.to) && ['lead', 'deal'].includes(get(edge.from).entity)) leadRefs.add(edge.from);
      }
    }
    for (const edge of state.edges) if (leadRefs.has(edge.to) && get(edge.from).entity === 'order') orderRefs.add(edge.from);
    for (const edge of state.edges) if ((leadRefs.has(edge.from) || orderRefs.has(edge.from)) && get(edge.to).entity === 'project') projectRefs.add(edge.to);
    const customers = new Set(state.edges.filter((edge) => edge.kind === 'customer_lead' && leadRefs.has(edge.to)).map((edge) => edge.from));
    if (record.entity === 'customer') customers.add(record.ref);
    const commitments = new Set([...leadRefs, ...orderRefs, ...projectRefs]);
    const matchesExplicitCommitment = (ref) => {
      const leadKinds = new Set(['task_lead', 'invoice_lead', 'quotation_lead', 'po_lead', 'survey_event_lead']);
      const orderKinds = new Set(['invoice_order', 'pr_order']);
      const explicitLeads = state.edges.filter((edge) => leadKinds.has(edge.kind) && edge.from === ref).map((edge) => edge.to);
      const explicitOrders = state.edges.filter((edge) => orderKinds.has(edge.kind) && edge.from === ref).map((edge) => edge.to);
      if (state.unresolvedLeadSources.has(ref) || state.unresolvedOrderSources.has(ref)) return false;
      if (explicitLeads.length && !explicitLeads.some((lead) => leadRefs.has(lead))) return false;
      if (explicitOrders.length && !explicitOrders.some((order) => orderRefs.has(order))) return false;
      return true;
    };
    const taskCandidates = new Set(state.edges.filter((edge) => ['task', 'assignment'].includes(get(edge.from).entity)
      && commitments.has(edge.to)).map((edge) => edge.from));
    // An inaccessible or different explicit lead/order must not be silently
    // reinterpreted as customer-independent work through a shared project.
    const tasks = new Set([...taskCandidates].filter(matchesExplicitCommitment));
    for (const ref of taskSeeds) tasks.add(ref);
    let taskScopeBasis = 'AUTHORIZED_CUSTOMER_COMMITMENT_EDGES';
    if (record.entity === 'project') {
      taskScopeBasis = 'SELECTED_PROJECT_EXPLICIT_TASK_PROJECT';
      for (const ref of tasks) if (!state.edges.some((edge) => edge.kind === 'task_project'
        && edge.from === ref && edge.to === record.ref)) tasks.delete(ref);
    } else if (record.entity === 'order') {
      taskScopeBasis = 'SELECTED_ORDER_PROJECT_OR_FULFILLMENT';
      const orderProjects = new Set(state.edges.filter((edge) => edge.from === record.ref
        && ['order_project', 'logistics_project'].includes(edge.kind)).map((edge) => edge.to));
      const fulfillment = new Set(state.edges.filter((edge) => edge.from === record.ref
        && edge.kind === 'fulfillment_lead').map((edge) => edge.to));
      for (const ref of tasks) if (!state.edges.some((edge) => edge.from === ref
        && ((edge.kind === 'task_project' && orderProjects.has(edge.to))
          || (edge.kind === 'task_lead' && fulfillment.has(edge.to))))) tasks.delete(ref);
    } else if (['task', 'assignment', 'time_log'].includes(record.entity)) {
      taskScopeBasis = 'SELECTED_SOURCE_TASK';
      for (const ref of tasks) if (!taskSeeds.has(ref)) tasks.delete(ref);
    } else if (record.entity === 'crm_event') {
      taskScopeBasis = 'SELECTED_SOURCE_SURVEY_EVENT';
      // An event is work evidence in its own unit, not a fabricated task. The
      // selected event card carries the authorized assignee and planned times.
      tasks.clear();
    }
    const mirrors = state.edges.filter((edge) => edge.kind === 'mirror' && tasks.has(edge.to));
    for (const mirror of mirrors) tasks.delete(mirror.from);
    const included = new Set([record.ref, ...customers, ...commitments, ...tasks, ...financialSeeds]);
    const related = new Set();
    for (const ref of financialSeeds) if (ref !== record.ref) related.add(ref);
    // Directed source-only closure: payment -> invoice -> commitment, or time
    // log -> task. Never walk back through a shared project into new customers.
    for (let pass = 0; pass < state.records.size; pass += 1) {
      let added = false;
      for (const edge of state.edges) {
        if (included.has(edge.to) && !included.has(edge.from)
          && !['customer', 'lead', 'deal', 'order', 'project', 'task', 'assignment'].includes(get(edge.from).entity)
          && matchesExplicitCommitment(edge.from)) {
          related.add(edge.from); included.add(edge.from); added = true;
        }
      }
      if (!added) break;
    }
    for (const ref of related) included.add(ref);
    const toRows = (refs) => [...refs].map(get).filter(Boolean).sort((a, b) => a.ref.localeCompare(b.ref));
    const detailGroup = navigationScope ? { ...group, locked: false, count: null,
      count_relation: 'unknown', coverage: 'UNKNOWN', basis: 'AUTHORIZED_RELATION_OF_FILTERED_PARENT',
      gaps: ['RELATED_DETAIL_NOT_A_TARGET_GROUP_COUNT_MEMBER'] } : group;
    return { ...envelope(state), group: detailGroup, record,
      access_basis: navigationScope ? 'AUTHORIZED_RELATION_OF_FILTERED_PARENT' : 'FILTERED_GROUP_MEMBER',
      navigation_scope: navigationScope,
      task_scope: { basis: taskScopeBasis, source_ref: record.ref, allocation_performed: false },
      customers: toRows(customers), commitments: toRows(commitments),
      tasks: toRows(tasks), related: toRows(related),
      edges: state.edges.filter((edge) => included.has(edge.from) && included.has(edge.to)),
      gaps: [...group.gaps, ...(!customers.size ? ['CUSTOMER_LINK_UNKNOWN'] : []),
        ...(!commitments.size ? ['COMMITMENT_LINK_UNKNOWN'] : []), 'ONLY_AUTHORIZED_EXPLICIT_EDGES',
        ...(identityBlocked ? ['EXPLICIT_SOURCE_LINK_UNRESOLVED'] : []),
        ...(!trusted.edge_permissions.includes('mirror') && [...tasks].some((ref) => get(ref).entity === 'assignment')
          ? ['CANONICAL_MIRROR_SCOPE_UNKNOWN'] : []),
        ...(record.entity === 'order' ? ['ORDER_WORK_REQUIRES_PROJECT_OR_FULFILLMENT_EDGE'] : []),
        ...(record.entity === 'crm_event' ? ['SURVEY_EVENT_NOT_A_TASK', 'SURVEY_PLANNED_TIMES_NOT_ACTUAL'] : []),
        'NO_VALUE_OR_WORK_ALLOCATION', 'CUSTOMER_ACCEPTANCE_NOT_INFERRED'] };
  }
  return Object.freeze({ overview, list, detail });
}

module.exports = { CONTRACT_VERSION, MODE, ENTITIES, FIELDS, SYSTEMS, GROUPS, EDGE_TYPES, TIME_BASES,
  CustomerJourneyError, createCustomerJourneyService, calendarRange };
