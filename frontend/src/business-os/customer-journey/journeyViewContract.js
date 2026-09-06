/** Offline projection presentation only. No API, storage, credential or browser I/O. */
export const OFFLINE_JOURNEY_MODE = 'OFFLINE_FIXTURE_ONLY';
export const JOURNEY_VIEW_CONTRACT_VERSION = 'customer_journey_offline_v1';
export const JOURNEY_SYSTEM_NAMES = Object.freeze([
  'Tư tưởng & Thị trường',
  'Tư duy & Giải pháp',
  'Nguồn lực & Năng lực',
  'Vận hành & Giao giá trị',
  'Báo cáo & Sự thật',
  'Sửa chữa & Tiến hóa',
]);

export const PERIOD_LABELS = Object.freeze({ week: 'Tuần', month: 'Tháng', quarter: 'Quý' });
export const TIME_BASIS_LABELS = Object.freeze({
  '': 'Theo cơ sở thời gian riêng của từng nhóm',
  stock: 'Trạng thái hiện tại — không giới hạn ngày tạo',
  created_at: 'Hồ sơ tạo trong kỳ',
  due_at: 'Việc / hồ sơ đến hạn trong kỳ',
  occurred_at: 'Sự kiện xảy ra trong kỳ',
});

export const FIELD_LABELS = Object.freeze({
  status: 'Trạng thái nguồn', temperature: 'Nhiệt độ lead', stage: 'Công đoạn nguồn',
  source_name: 'Nguồn', owner: 'Người phụ trách', supervisor: 'Người giám sát',
  executor_company_id: 'Công ty thực hiện', created_at: 'Thời điểm ghi nhận',
  started_at: 'Bắt đầu thực tế theo nguồn', planned_start_at: 'Bắt đầu dự kiến theo nguồn',
  due_at: 'Hạn theo nguồn', completed_at: 'Hoàn thành theo nguồn', occurred_at: 'Thời điểm sự kiện',
  blocker: 'Điểm nghẽn theo nguồn', next_action: 'Hành động tiếp theo theo nguồn', impact: 'Ảnh hưởng có chứng cứ',
  amount: 'Giá trị theo nguồn', amount_basis: 'Cơ sở giá trị — không mặc định là lợi nhuận',
  stars: 'Sao khách hàng (1–5)', feedback: 'Phản hồi khách hàng', hours: 'Giờ ghi nhận — không phải tiền lương',
  event_type: 'Loại sự kiện', decision_required: 'Yêu cầu quyết định theo nguồn',
  decision_reason: 'Lý do cần quyết định', is_active: 'Đang hoạt động',
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function text(value) { return typeof value === 'string' ? value : ''; }

export function normalizeJourneyContext(context = {}) {
  const period = context.period || 'month';
  if (!Object.hasOwn(PERIOD_LABELS, period)) fail('JOURNEY_VIEW_PERIOD_INVALID');
  const anchor = text(context.period_anchor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)
    || !Number.isFinite(Date.parse(`${anchor}T00:00:00.000Z`))
    || new Date(`${anchor}T00:00:00.000Z`).toISOString().slice(0, 10) !== anchor) {
    fail('JOURNEY_VIEW_ANCHOR_INVALID');
  }
  const timeBasis = context.filters?.time_basis || '';
  if (!Object.hasOwn(TIME_BASIS_LABELS, timeBasis)) fail('JOURNEY_VIEW_TIME_BASIS_INVALID');
  const result = {
    ecosystem_id: text(context.ecosystem_id),
    company_id: text(context.company_id) || 'all',
    period,
    period_anchor: anchor,
    filters: {
      q: text(context.filters?.q),
      status: text(context.filters?.status),
      temperature: text(context.filters?.temperature),
      time_basis: timeBasis,
    },
  };
  if (!result.ecosystem_id) fail('JOURNEY_VIEW_ECOSYSTEM_REQUIRED');
  if (context.snapshot_id) result.snapshot_id = text(context.snapshot_id);
  return result;
}

/** A changed filter starts a new context; never carry an old snapshot into it. */
export function changeJourneyContext(context, patch = {}) {
  const { snapshot_id: _oldSnapshot, ...base } = normalizeJourneyContext(context);
  return normalizeJourneyContext({
    ...base,
    ...patch,
    filters: { ...base.filters, ...(patch.filters || {}) },
    snapshot_id: undefined,
  });
}

export function journeyContextKey(context, { includeSnapshot = false } = {}) {
  const normalized = normalizeJourneyContext(context);
  if (!includeSnapshot) delete normalized.snapshot_id;
  return JSON.stringify(normalized);
}

export function assertJourneyPacket(packet, requestedContext) {
  if (!packet || packet.mode !== OFFLINE_JOURNEY_MODE) fail('JOURNEY_VIEW_NOT_OFFLINE');
  if (packet.contract_version !== JOURNEY_VIEW_CONTRACT_VERSION) fail('JOURNEY_VIEW_CONTRACT_UNSUPPORTED');
  if (journeyContextKey(packet.context) !== journeyContextKey(requestedContext)) {
    fail('JOURNEY_VIEW_CONTEXT_MISMATCH');
  }
  if (!text(packet.snapshot?.id) || packet.context?.snapshot_id !== packet.snapshot.id) {
    fail('JOURNEY_VIEW_SNAPSHOT_MISMATCH');
  }
  if (packet.snapshot.live_connected !== false) fail('JOURNEY_VIEW_NOT_OFFLINE');
  if (requestedContext.snapshot_id && requestedContext.snapshot_id !== packet.snapshot.id) {
    fail('JOURNEY_VIEW_SNAPSHOT_MISMATCH');
  }
  return packet;
}

export function assertJourneyOverview(packet, context) {
  assertJourneyPacket(packet, context);
  if (packet.protections?.real_data_connected !== false || packet.protections?.write_enabled !== false
    || packet.protections?.live_routes_registered !== false || packet.protections?.ai_runtime_enabled !== false) {
    fail('JOURNEY_VIEW_PROTECTIONS_INVALID');
  }
  if (!Array.isArray(packet.systems) || packet.systems.length !== JOURNEY_SYSTEM_NAMES.length
    || !Array.isArray(packet.companies)) fail('JOURNEY_VIEW_OVERVIEW_INVALID');
  const groupIds = new Set();
  packet.systems.forEach((system, index) => {
    if (!text(system.id) || system.name !== JOURNEY_SYSTEM_NAMES[index] || !Array.isArray(system.groups)) {
      fail('JOURNEY_VIEW_SYSTEM_INVALID');
    }
    system.groups.forEach((group) => {
      assertGroup(group);
      if (groupIds.has(group.id)) fail('JOURNEY_VIEW_GROUP_INVALID');
      groupIds.add(group.id);
    });
  });
  return packet;
}

function assertGroup(group) {
  const relations = { EXACT: 'eq', PARTIAL: 'gte', UNKNOWN: 'unknown' };
  if (!text(group?.id) || !text(group.name) || !text(group.unit)
    || typeof group.locked !== 'boolean' || !Object.hasOwn(relations, group.coverage)
    || group.count_relation !== relations[group.coverage]
    || (group.coverage === 'UNKNOWN' ? group.count !== null : !Number.isSafeInteger(group.count) || group.count < 0)
    || (group.locked && group.coverage !== 'UNKNOWN')) {
    fail('JOURNEY_VIEW_GROUP_INVALID');
  }
}

function assertRecords(records) {
  if (!Array.isArray(records)) fail('JOURNEY_VIEW_RECORDS_INVALID');
  const refs = new Set();
  records.forEach((record) => {
    if (!text(record?.ref) || refs.has(record.ref) || !text(record.entity)
      || !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) {
      fail('JOURNEY_VIEW_RECORD_INVALID');
    }
    if (Object.entries(record.fields).some(([key, value]) => !Object.hasOwn(FIELD_LABELS, key)
      || !(value === null || typeof value === 'string' || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))))) fail('JOURNEY_VIEW_FIELD_INVALID');
    refs.add(record.ref);
  });
}

export function assertJourneyList(packet, context, groupId, { page, pageSize, expectedGroup }) {
  assertJourneyPacket(packet, context);
  assertGroup(packet.group);
  if (packet.group?.id !== groupId || packet.group?.locked) fail('JOURNEY_VIEW_GROUP_MISMATCH');
  if (expectedGroup) {
    assertGroup(expectedGroup);
    if (['id', 'name', 'unit', 'basis', 'coverage', 'count_relation', 'count', 'locked']
      .some((key) => packet.group[key] !== expectedGroup[key])) fail('JOURNEY_VIEW_OVERVIEW_LIST_MISMATCH');
  }
  assertRecords(packet.records);
  const p = packet.pagination;
  if (!p || p.page !== page || p.page_size !== pageSize
    || typeof p.has_more !== 'boolean' || packet.records.length > pageSize || p.total !== packet.group.count
    || !(p.total === null || (Number.isSafeInteger(p.total) && p.total >= packet.records.length))) {
    fail('JOURNEY_VIEW_PAGINATION_INVALID');
  }
  if (packet.group.coverage === 'EXACT') {
    const expectedLength = Math.max(0, Math.min(pageSize, p.total - (page - 1) * pageSize));
    if (packet.records.length !== expectedLength || p.has_more !== (page * pageSize < p.total)) {
      fail('JOURNEY_VIEW_COUNT_LIST_MISMATCH');
    }
  }
  return packet;
}

export function assertJourneyDetail(packet, context, groupId, recordRef) {
  assertJourneyPacket(packet, context);
  assertGroup(packet.group);
  if (packet.group?.id !== groupId || packet.group?.locked || packet.record?.ref !== recordRef) {
    fail('JOURNEY_VIEW_RECORD_MISMATCH');
  }
  assertRecords([packet.record]);
  ['customers', 'commitments', 'tasks', 'related'].forEach((key) => assertRecords(packet[key]));
  if (!Array.isArray(packet.gaps) || !Array.isArray(packet.edges)) fail('JOURNEY_VIEW_DETAIL_INVALID');
  if (!['AUTHORIZED_CUSTOMER_COMMITMENT_EDGES', 'SELECTED_PROJECT_EXPLICIT_TASK_PROJECT',
    'SELECTED_ORDER_PROJECT_OR_FULFILLMENT', 'SELECTED_SOURCE_TASK'].includes(packet.task_scope?.basis)
    || packet.task_scope.source_ref !== recordRef || packet.task_scope.allocation_performed !== false) {
    fail('JOURNEY_VIEW_TASK_SCOPE_INVALID');
  }
  return packet;
}

export function assertJourneyRelationDetail(packet, context, groupId, recordRef, via) {
  assertJourneyDetail(packet, context, groupId, recordRef);
  if (packet.access_basis !== 'AUTHORIZED_RELATION_OF_FILTERED_PARENT'
    || packet.navigation_scope?.group_id !== via?.group_id
    || packet.navigation_scope?.parent_ref !== via?.parent_ref) {
    fail('JOURNEY_VIEW_PARENT_RELATION_MISMATCH');
  }
  return packet;
}

export function displayJourneyCount(group) {
  if (group?.locked || group?.coverage === 'UNKNOWN' || group?.count == null) return '—';
  return `${group.coverage === 'PARTIAL' ? '≥ ' : ''}${new Intl.NumberFormat('vi-VN').format(group.count)}`;
}

export function displaySourceValue(value) {
  if (value === null || value === undefined || value === '') return 'Chưa có nguồn / UNKNOWN';
  if (value === false) return 'Không (theo nguồn)';
  if (value === true) return 'Có (theo nguồn)';
  if (typeof value === 'number') return Number.isFinite(value)
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 }).format(value) : 'UNKNOWN';
  if (typeof value === 'string') return value;
  return 'Dữ liệu có cấu trúc — chưa có hợp đồng trình bày';
}

export function safeJourneyError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return /^[A-Z0-9_]{1,100}$/.test(code) ? code : 'JOURNEY_VIEW_REQUEST_FAILED';
}
