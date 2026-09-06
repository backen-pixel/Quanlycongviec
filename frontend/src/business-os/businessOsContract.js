export const BUSINESS_OS_CONTRACT_VERSION = 'founder_cockpit_v1';
export const BUSINESS_OS_LIVE_MODE = 'live_read_only';
export const BUSINESS_OS_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 1000;

export const BUSINESS_OS_STATUSES = Object.freeze([
  'LIVE',
  'LIVE WITH DATA GAPS',
  'UNDER RECONCILIATION',
  'NOT CONNECTED',
  'BLOCKED',
  'FOUNDER DECISION REQUIRED',
]);

const STATUS_SET = new Set(BUSINESS_OS_STATUSES);

export class BusinessOsContractError extends Error {
  constructor(message, code = 'BUSINESS_OS_CONTRACT_INVALID') {
    super(message);
    this.name = 'BusinessOsContractError';
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, field) {
  if (!isRecord(value)) {
    throw new BusinessOsContractError(`Phản hồi Live Mode thiếu đối tượng “${field}”.`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new BusinessOsContractError(`Phản hồi Live Mode thiếu danh sách “${field}”.`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BusinessOsContractError(`Phản hồi Live Mode thiếu trường “${field}”.`);
  }
}

function requireStatus(value, field) {
  if (!STATUS_SET.has(value)) {
    throw new BusinessOsContractError(`Trạng thái “${field}” không thuộc hợp đồng kích hoạt V1.`);
  }
}

function sameId(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

/**
 * Frontend contract for GET /api/business-os.
 *
 * Live Mode is intentionally fail-closed: this function never fills missing
 * business values, never reuses another scope, and never converts null metrics
 * to zero. A backend data gap must arrive explicitly with a mandated status.
 */
export function assertBusinessOsSnapshot(payload, requestScope = {}) {
  requireRecord(payload, 'root');

  if (payload.contract_version !== BUSINESS_OS_CONTRACT_VERSION) {
    throw new BusinessOsContractError(
      `Phiên bản hợp đồng không hợp lệ (cần ${BUSINESS_OS_CONTRACT_VERSION}).`,
      'BUSINESS_OS_CONTRACT_VERSION_MISMATCH',
    );
  }
  if (payload.mode !== BUSINESS_OS_LIVE_MODE) {
    throw new BusinessOsContractError(
      'Live Mode chỉ chấp nhận dữ liệu live_read_only đã được backend xác minh.',
      'BUSINESS_OS_MODE_MISMATCH',
    );
  }

  requireString(payload.generated_at, 'generated_at');
  requireRecord(payload.scope, 'scope');
  requireRecord(payload.period, 'period');
  requireArray(payload.modules, 'modules');
  requireArray(payload.systems, 'systems');
  requireRecord(payload.planning, 'planning');
  requireRecord(payload.workload, 'workload');
  requireRecord(payload.capacity, 'capacity');
  requireArray(payload.manufacturing_companies, 'manufacturing_companies');
  requireRecord(payload.decision_center, 'decision_center');
  requireRecord(payload.configuration_center, 'configuration_center');
  requireArray(payload.drilldowns, 'drilldowns');
  requireRecord(payload.protections, 'protections');

  const generatedAtMs = Date.parse(payload.generated_at);
  const nowMs = Number.isFinite(requestScope.nowMs) ? requestScope.nowMs : Date.now();
  const maxAgeMs = Number.isFinite(requestScope.maxAgeMs)
    ? requestScope.maxAgeMs
    : BUSINESS_OS_SNAPSHOT_MAX_AGE_MS;
  if (!Number.isFinite(generatedAtMs) || generatedAtMs > nowMs + 60_000 || nowMs - generatedAtMs > maxAgeMs) {
    throw new BusinessOsContractError(
      'Snapshot đã quá hạn hoặc có dấu thời gian không hợp lệ. Cockpit đã khóa dữ liệu cũ.',
      'BUSINESS_OS_SNAPSHOT_STALE',
    );
  }

  requireString(payload.scope.ecosystem_id, 'scope.ecosystem_id');
  requireString(payload.scope.level, 'scope.level');
  requireArray(payload.scope.company_ids, 'scope.company_ids');
  requireArray(payload.scope.companies, 'scope.companies');
  if (!payload.scope.company_ids.length) {
    throw new BusinessOsContractError('Phạm vi phản hồi không có công ty nào được xác minh.');
  }
  const responseCompanyIds = payload.scope.company_ids.map((id) => String(id || '').trim());
  if (responseCompanyIds.some((id) => !id) || new Set(responseCompanyIds).size !== responseCompanyIds.length) {
    throw new BusinessOsContractError('Danh sách công ty trong phạm vi không hợp lệ hoặc bị trùng.');
  }
  const responseCompanySet = new Set(responseCompanyIds.map((id) => id.toLowerCase()));
  const scopeCompanyObjectIds = payload.scope.companies.map((company, index) => {
    requireRecord(company, `scope.companies[${index}]`);
    requireString(company.id, `scope.companies[${index}].id`);
    requireString(company.name, `scope.companies[${index}].name`);
    return String(company.id).toLowerCase();
  });
  if (scopeCompanyObjectIds.length !== responseCompanySet.size
    || scopeCompanyObjectIds.some((id) => !responseCompanySet.has(id))) {
    throw new BusinessOsContractError('Chi tiết công ty không khớp phạm vi company_ids.');
  }

  if (payload.systems.length !== 6) {
    throw new BusinessOsContractError(
      `Tổng quan phải có đúng 6 hệ; backend trả về ${payload.systems.length}.`,
      'BUSINESS_OS_SIX_SYSTEMS_REQUIRED',
    );
  }

  const systemKeys = new Set();
  payload.systems.forEach((system, index) => {
    requireRecord(system, `systems[${index}]`);
    requireString(system.key, `systems[${index}].key`);
    requireString(system.label, `systems[${index}].label`);
    requireStatus(system.status, `systems[${index}].status`);
    requireArray(system.module_keys, `systems[${index}].module_keys`);
    requireRecord(system.metrics, `systems[${index}].metrics`);
    requireArray(system.signals, `systems[${index}].signals`);
    requireArray(system.drilldowns, `systems[${index}].drilldowns`);
    if (systemKeys.has(system.key)) {
      throw new BusinessOsContractError('Khóa của 6 hệ bị trùng lặp.');
    }
    systemKeys.add(system.key);
  });

  const moduleKeys = new Set();
  payload.modules.forEach((module, index) => {
    requireRecord(module, `modules[${index}]`);
    requireString(module.key, `modules[${index}].key`);
    requireString(module.label, `modules[${index}].label`);
    requireStatus(module.activation_status, `modules[${index}].activation_status`);
    requireRecord(module.activation, `modules[${index}].activation`);
    if (typeof module.activation.enabled !== 'boolean') {
      throw new BusinessOsContractError(`Trạng thái kích hoạt “modules[${index}]” không hợp lệ.`);
    }
    requireArray(module.activation.company_ids, `modules[${index}].activation.company_ids`);
    if (module.activation.company_ids.some((id) => !responseCompanySet.has(String(id || '').toLowerCase()))) {
      throw new BusinessOsContractError(`Module “${module.label}” chứa phạm vi công ty ngoài snapshot.`);
    }
    requireRecord(module.metrics, `modules[${index}].metrics`);
    requireRecord(module.freshness, `modules[${index}].freshness`);
    requireRecord(module.reconciliation, `modules[${index}].reconciliation`);
    requireRecord(module.gates, `modules[${index}].gates`);
    requireArray(module.data_gaps, `modules[${index}].data_gaps`);
    const requiredGates = ['data', 'scope', 'permission', 'audit', 'reconciliation', 'verification', 'drill_down'];
    requiredGates.forEach((gate) => {
      if (typeof module.gates[gate] !== 'boolean') {
        throw new BusinessOsContractError(`Gate “modules[${index}].gates.${gate}” không hợp lệ.`);
      }
    });
    if (module.activation_status === 'LIVE'
      && (!module.activation.enabled || !requiredGates.every((gate) => module.gates[gate]) || module.data_gaps.length > 0)) {
      throw new BusinessOsContractError(
        `Module “${module.label}” không được công bố LIVE khi còn gate hoặc data gap chưa đạt.`,
        'BUSINESS_OS_LIVE_GATE_INVALID',
      );
    }
    if (moduleKeys.has(module.key)) {
      throw new BusinessOsContractError('Khóa module bị trùng lặp.');
    }
    moduleKeys.add(module.key);
  });

  requireRecord(payload.planning.selected_period, 'planning.selected_period');
  requireArray(payload.planning.horizons, 'planning.horizons');
  requireRecord(payload.planning.forecast, 'planning.forecast');
  requireRecord(payload.workload.metric_contract, 'workload.metric_contract');
  requireRecord(payload.capacity.metric_contract, 'capacity.metric_contract');
  requireArray(payload.capacity.data_gaps, 'capacity.data_gaps');
  requireRecord(payload.decision_center.contract, 'decision_center.contract');
  requireArray(payload.decision_center.items, 'decision_center.items');
  requireArray(payload.configuration_center.modules, 'configuration_center.modules');
  requireRecord(payload.configuration_center.permissions, 'configuration_center.permissions');
  payload.configuration_center.modules.forEach((module, index) => {
    requireRecord(module, `configuration_center.modules[${index}]`);
    requireString(module.key, `configuration_center.modules[${index}].key`);
    requireArray(module.company_ids, `configuration_center.modules[${index}].company_ids`);
    if (module.company_ids.some((id) => !responseCompanySet.has(String(id || '').toLowerCase()))) {
      throw new BusinessOsContractError(`Configuration Center chứa công ty ngoài phạm vi tại module “${module.key}”.`);
    }
  });

  if (payload.manufacturing_companies.length > 2) {
    throw new BusinessOsContractError(
      'Hợp đồng V1 chỉ cho phép tối đa hai chế độ xem công ty sản xuất.',
      'BUSINESS_OS_MANUFACTURING_SCOPE_INVALID',
    );
  }
  payload.manufacturing_companies.forEach((item, index) => {
    requireRecord(item, `manufacturing_companies[${index}]`);
    requireRecord(item.company, `manufacturing_companies[${index}].company`);
    requireString(item.company.id, `manufacturing_companies[${index}].company.id`);
    requireString(item.company.name, `manufacturing_companies[${index}].company.name`);
    if (!responseCompanySet.has(String(item.company.id).toLowerCase())) {
      throw new BusinessOsContractError('Góc nhìn sản xuất chứa công ty ngoài phạm vi đã xác minh.');
    }
    requireStatus(item.status, `manufacturing_companies[${index}].status`);
    requireRecord(item.capacity, `manufacturing_companies[${index}].capacity`);
    requireRecord(item.freshness, `manufacturing_companies[${index}].freshness`);
    requireRecord(item.reconciliation, `manufacturing_companies[${index}].reconciliation`);
    requireArray(item.data_gaps, `manufacturing_companies[${index}].data_gaps`);
  });

  const requiredProtectionFlags = [
    'write_enabled',
    'direct_database_write_enabled',
    'synthetic_fallback_enabled',
    'external_send_enabled',
  ];
  requiredProtectionFlags.forEach((field) => {
    if (typeof payload.protections[field] !== 'boolean') {
      throw new BusinessOsContractError(`Cờ bảo vệ “protections.${field}” không hợp lệ.`);
    }
  });
  requireArray(payload.protections.actions, 'protections.actions');
  if (
    payload.protections.write_enabled
    || payload.protections.direct_database_write_enabled
    || payload.protections.synthetic_fallback_enabled
    || payload.protections.external_send_enabled
  ) {
    throw new BusinessOsContractError(
      'Phản hồi vi phạm hàng rào Live Read-only; Cockpit đã khóa toàn bộ snapshot.',
      'BUSINESS_OS_PROTECTION_INVARIANT_FAILED',
    );
  }

  const requestedEcosystemId = String(requestScope.ecosystemId || '').trim();
  const requestedCompanyId = String(requestScope.companyId || '').trim();
  const requestedPeriod = String(requestScope.period || '').trim();

  if (requestedEcosystemId && !sameId(payload.scope.ecosystem_id, requestedEcosystemId)) {
    throw new BusinessOsContractError(
      'Backend trả dữ liệu ngoài hệ sinh thái đang chọn. Cockpit đã khóa phản hồi.',
      'BUSINESS_OS_SCOPE_MISMATCH',
    );
  }

  if (requestedCompanyId === 'all') {
    if (payload.scope.level !== 'ecosystem' || payload.scope.company_id !== null) {
      throw new BusinessOsContractError(
        'Backend đã thu hẹp yêu cầu toàn hệ sinh thái mà không khai báo. Cockpit đã khóa phản hồi.',
        'BUSINESS_OS_COMPANY_SCOPE_MISMATCH',
      );
    }
  } else if (requestedCompanyId) {
    const matchesCompany = sameId(payload.scope.company_id, requestedCompanyId)
      && responseCompanyIds.length === 1
      && responseCompanyIds.some((id) => sameId(id, requestedCompanyId));
    if (!matchesCompany) {
      throw new BusinessOsContractError(
        'Backend trả dữ liệu ngoài công ty đang chọn. Cockpit đã khóa phản hồi.',
        'BUSINESS_OS_COMPANY_SCOPE_MISMATCH',
      );
    }
  }

  const responsePeriod = payload.planning.selected_period.key || payload.period.key;
  if (requestedPeriod && responsePeriod !== requestedPeriod) {
    throw new BusinessOsContractError(
      'Backend trả dữ liệu khác kỳ kế hoạch đang chọn. Cockpit đã khóa phản hồi.',
      'BUSINESS_OS_PERIOD_MISMATCH',
    );
  }

  return payload;
}

export function businessOsErrorMessage(error) {
  if (error instanceof BusinessOsContractError) return error.message;
  if (error?.response?.status === 401) return 'Phiên đăng nhập không còn hiệu lực.';
  if (error?.response?.status === 403) {
    return error.response?.data?.error || 'Tài khoản không có quyền mở Founder Executive Cockpit.';
  }
  if (error?.response?.status === 422 || error?.response?.status === 400) {
    return error.response?.data?.error || 'Phạm vi hoặc kỳ báo cáo không hợp lệ.';
  }
  return error?.response?.data?.error
    || error?.message
    || 'Không thể xác minh dữ liệu thật từ Business AI OS.';
}

/** Only app-internal routes are accepted as operational drill-down targets. */
export function safeBusinessOsHref(value) {
  const href = typeof value === 'string' ? value.trim() : '';
  if (!href.startsWith('/') || href.startsWith('//') || /^\/api(?:\/|[?#]|$)/i.test(href)) return '';
  if (/[\\\u0000-\u001f\u007f]/.test(href) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(href)) return '';
  try {
    const base = new URL('https://business-os.invalid/');
    const parsed = new URL(href, base);
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return '';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}
