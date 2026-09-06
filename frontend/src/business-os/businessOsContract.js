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

export const BUSINESS_OS_PLATFORM_STATUSES = Object.freeze([
  ...BUSINESS_OS_STATUSES,
  'SANDBOX',
]);

export const BUSINESS_OS_PLATFORM_CAPABILITY_KEYS = Object.freeze([
  'strategy_objective_center',
  'founder_executive_cockpit',
  'portfolio_planning_forecasting',
  'capacity_workload_balancing',
  'founder_decision_exception_center',
  'management_reporting_profitability',
  'correction_evolution',
  'founder_configuration_center',
  'cross_domain_signal_hub',
  'module_registry_feature_flags',
  'connector_center',
  'data_quality_reconciliation',
  'customer_tenant_administration',
  'industry_pack_template_studio',
  'customer_onboarding_data_portability',
  'licensing_billing',
  'release_upgrade_rollback',
  'monitoring_backup_support',
  'executive_domain_ai_interfaces',
]);

export const BUSINESS_OS_MODULE_KEYS = Object.freeze([
  'crm',
  'sales',
  'lead_deal',
  'commercial_documents',
  'projects',
  'work_unified',
  'procurement_purchasing',
  'production',
  'logistics',
  'accounting',
  'warranty_care',
  'people_kpi',
  'permissions',
  'approvals',
  'reporting',
]);

export const FOUNDER_ADVISORY_CONFIGURATION_KEYS = Object.freeze([
  'capacity_load_warning_per_active_person',
  'overdue_work_warning_count',
  'overdue_project_warning_count',
  'delayed_procurement_warning_count',
]);

const STATUS_SET = new Set(BUSINESS_OS_STATUSES);
const PLATFORM_STATUS_SET = new Set(BUSINESS_OS_PLATFORM_STATUSES);
const PLATFORM_CAPABILITY_KEY_SET = new Set(BUSINESS_OS_PLATFORM_CAPABILITY_KEYS);
const MODULE_KEY_SET = new Set(BUSINESS_OS_MODULE_KEYS);
const DATASET_FRESHNESS_STATES = new Set(['FRESH', 'STALE', 'UNKNOWN', 'NOT_CONNECTED']);
const TRUSTED_RECONCILIATION_STATES = new Set(['MATCH', 'MATCHED', 'MATCH WITH DOCUMENTED NORMALIZATION']);
const READ_ONLY_DRILLDOWN_CONTRACT = 'founder_local_read_only_v1';
const COMPANY_SCOPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOUNDER_LOCAL_APPROVED_SOURCE_PATH = '/crm/dashboard';

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

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new BusinessOsContractError(`Cờ “${field}” không hợp lệ.`);
  }
}

function normalizeCompanyScope(value) {
  const scope = String(value || '').trim().toLowerCase();
  if (scope === 'all') return scope;
  return COMPANY_SCOPE_RE.test(scope) ? scope : '';
}

function requireReadOnlyDrilldown(value, field, {
  allowCockpitAnchor = false,
  companyScope,
} = {}) {
  requireRecord(value, field);
  requireBoolean(value.enabled, `${field}.enabled`);
  const href = safeBusinessOsHref(value.href || value.to || value.path);
  if (!href) throw new BusinessOsContractError(`Drill-down “${field}” không phải đường dẫn nội bộ an toàn.`);
  const parsed = new URL(href, 'https://business-os.invalid');
  const isCockpitAnchor = allowCockpitAnchor
    && (parsed.pathname === '/business-os' || parsed.pathname.startsWith('/business-os/'));
  if (!isCockpitAnchor && (
    value.read_only !== true
    || value.read_only_contract !== READ_ONLY_DRILLDOWN_CONTRACT
    || value.write_capability !== 'DISABLED_IN_FOUNDER_LOCAL'
  )) {
    throw new BusinessOsContractError(`Drill-down “${field}” chưa được backend chứng thực read-only.`);
  }
  if (!isCockpitAnchor) {
    const expectedScope = normalizeCompanyScope(companyScope);
    const scopeValues = parsed.searchParams.getAll('company_id');
    const actualScope = scopeValues.length === 1 ? normalizeCompanyScope(scopeValues[0]) : '';
    if (!expectedScope || !actualScope || scopeValues.length !== 1) {
      throw new BusinessOsContractError(
        `Drill-down “${field}” phải mang đúng một company_id hợp lệ đã được backend chứng thực.`,
        'BUSINESS_OS_DRILLDOWN_SCOPE_INVALID',
      );
    }
    if (actualScope !== expectedScope) {
      throw new BusinessOsContractError(
        `Drill-down “${field}” không khớp phạm vi công ty của snapshot.`,
        'BUSINESS_OS_DRILLDOWN_SCOPE_MISMATCH',
      );
    }
    if (value.enabled === true
      && (actualScope === 'all' || parsed.pathname !== FOUNDER_LOCAL_APPROVED_SOURCE_PATH)) {
      throw new BusinessOsContractError(
        `Drill-down “${field}” chưa thuộc allowlist CRM một-công-ty của Founder-local.`,
        'BUSINESS_OS_DRILLDOWN_NOT_APPROVED',
      );
    }
  }
  return href;
}

function requireTimestamp(value, field) {
  requireString(value, field);
  if (!Number.isFinite(Date.parse(value))) {
    throw new BusinessOsContractError(`Dấu thời gian “${field}” không hợp lệ.`);
  }
}

function requireFreshness(value, field, { datasetState = false } = {}) {
  requireRecord(value, field);
  const state = value.state || value.status;
  requireString(state, `${field}.state`);
  if (datasetState && !DATASET_FRESHNESS_STATES.has(state)) {
    throw new BusinessOsContractError(`Freshness “${field}.state” không thuộc hợp đồng dữ liệu V1.`);
  }
  requireTimestamp(
    value.as_of || value.observed_at || value.updated_at || value.last_success_at,
    `${field}.as_of`,
  );
}

function requireReconciliation(value, field, { checkedAt = false } = {}) {
  requireRecord(value, field);
  requireString(value.state || value.status, `${field}.state`);
  if (checkedAt) requireTimestamp(value.checked_at, `${field}.checked_at`);
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
  requireArray(payload.platform_capabilities, 'platform_capabilities');
  requireRecord(payload.signal_hub, 'signal_hub');
  requireRecord(payload.correction_center, 'correction_center');
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
  const snapshotCompanyScope = payload.scope.company_id == null
    ? 'all'
    : normalizeCompanyScope(payload.scope.company_id);
  if (!snapshotCompanyScope
    || (snapshotCompanyScope !== 'all' && !responseCompanySet.has(snapshotCompanyScope))) {
    throw new BusinessOsContractError('Phạm vi company_id của snapshot không hợp lệ.');
  }
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
  const systemModuleReferences = new Set();
  payload.systems.forEach((system, index) => {
    requireRecord(system, `systems[${index}]`);
    requireString(system.key, `systems[${index}].key`);
    requireString(system.label, `systems[${index}].label`);
    requireStatus(system.status, `systems[${index}].status`);
    requireArray(system.module_keys, `systems[${index}].module_keys`);
    requireRecord(system.metrics, `systems[${index}].metrics`);
    requireArray(system.signals, `systems[${index}].signals`);
    requireArray(system.drilldowns, `systems[${index}].drilldowns`);
    if (!system.module_keys.length || new Set(system.module_keys).size !== system.module_keys.length) {
      throw new BusinessOsContractError(`Hệ “${system.label}” thiếu module hoặc chứa tham chiếu trùng.`);
    }
    system.module_keys.forEach((key) => systemModuleReferences.add(key));
    system.drilldowns.forEach((drilldown, drilldownIndex) => {
      requireReadOnlyDrilldown(drilldown, `systems[${index}].drilldowns[${drilldownIndex}]`, {
        companyScope: snapshotCompanyScope,
      });
    });
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
    requireFreshness(module.freshness, `modules[${index}].freshness`, { datasetState: true });
    requireReconciliation(module.reconciliation, `modules[${index}].reconciliation`, { checkedAt: true });
    requireRecord(module.gates, `modules[${index}].gates`);
    requireArray(module.data_gaps, `modules[${index}].data_gaps`);
    const requiredGates = ['data', 'scope', 'permission', 'audit', 'reconciliation', 'verification', 'drill_down'];
    requiredGates.forEach((gate) => {
      if (typeof module.gates[gate] !== 'boolean') {
        throw new BusinessOsContractError(`Gate “modules[${index}].gates.${gate}” không hợp lệ.`);
      }
    });
    if (module.drilldown) {
      requireReadOnlyDrilldown(module.drilldown, `modules[${index}].drilldown`, {
        companyScope: snapshotCompanyScope,
      });
    } else if (module.gates.drill_down) {
      throw new BusinessOsContractError(`Module “${module.label}” công bố drill_down đạt nhưng thiếu đường dẫn đã chứng thực.`);
    }
    const reconciliationState = module.reconciliation.state || module.reconciliation.status;
    if (module.gates.reconciliation && !TRUSTED_RECONCILIATION_STATES.has(reconciliationState)) {
      throw new BusinessOsContractError(`Module “${module.label}” công bố gate đối soát đạt nhưng trạng thái không khớp.`);
    }
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
  if (moduleKeys.size !== MODULE_KEY_SET.size
    || BUSINESS_OS_MODULE_KEYS.some((key) => !moduleKeys.has(key))) {
    throw new BusinessOsContractError(
      `Business AI OS V1 phải có đúng ${BUSINESS_OS_MODULE_KEYS.length} module bắt buộc.`,
      'BUSINESS_OS_MODULES_INVALID',
    );
  }
  if ([...systemModuleReferences].some((key) => !MODULE_KEY_SET.has(key))
    || BUSINESS_OS_MODULE_KEYS.some((key) => !systemModuleReferences.has(key))) {
    throw new BusinessOsContractError(
      'Tổng quan 6 hệ chứa module lạ hoặc không bao phủ đủ module V1.',
      'BUSINESS_OS_SYSTEM_MODULE_REFERENCES_INVALID',
    );
  }

  requireRecord(payload.planning.selected_period, 'planning.selected_period');
  requireArray(payload.planning.horizons, 'planning.horizons');
  requireRecord(payload.planning.forecast, 'planning.forecast');
  requireRecord(payload.workload.metric_contract, 'workload.metric_contract');
  requireRecord(payload.capacity.metric_contract, 'capacity.metric_contract');
  requireArray(payload.capacity.data_gaps, 'capacity.data_gaps');
  if (payload.workload.drilldown) {
    requireReadOnlyDrilldown(payload.workload.drilldown, 'workload.drilldown', {
      companyScope: snapshotCompanyScope,
    });
  }
  if (payload.capacity.drilldown) {
    requireReadOnlyDrilldown(payload.capacity.drilldown, 'capacity.drilldown', {
      companyScope: snapshotCompanyScope,
    });
  }
  requireRecord(payload.decision_center.contract, 'decision_center.contract');
  requireArray(payload.decision_center.items, 'decision_center.items');
  if (payload.decision_center.drilldown) {
    requireReadOnlyDrilldown(payload.decision_center.drilldown, 'decision_center.drilldown', {
      companyScope: snapshotCompanyScope,
    });
  }
  requireArray(payload.configuration_center.modules, 'configuration_center.modules');
  requireRecord(payload.configuration_center.permissions, 'configuration_center.permissions');
  if (payload.configuration_center.read_only !== true
    || payload.configuration_center.canonical_configuration_read_only !== true) {
    throw new BusinessOsContractError('Configuration Center canonical phải giữ nguyên chế độ chỉ đọc.');
  }
  requireBoolean(payload.configuration_center.permissions.can_view, 'configuration_center.permissions.can_view');
  requireBoolean(payload.configuration_center.permissions.can_change, 'configuration_center.permissions.can_change');
  if (payload.configuration_center.drilldown) {
    requireReadOnlyDrilldown(payload.configuration_center.drilldown, 'configuration_center.drilldown', {
      companyScope: snapshotCompanyScope,
    });
  }
  payload.configuration_center.modules.forEach((module, index) => {
    requireRecord(module, `configuration_center.modules[${index}]`);
    requireString(module.key, `configuration_center.modules[${index}].key`);
    requireArray(module.company_ids, `configuration_center.modules[${index}].company_ids`);
    if (module.company_ids.some((id) => !responseCompanySet.has(String(id || '').toLowerCase()))) {
      throw new BusinessOsContractError(`Configuration Center chứa công ty ngoài phạm vi tại module “${module.key}”.`);
    }
  });

  const advisory = payload.configuration_center.advisory_configuration;
  requireRecord(advisory, 'configuration_center.advisory_configuration');
  if (advisory.contract_version !== 'founder_advisory_configuration_v1'
    || advisory.status !== 'PROVISIONAL ADVISORY CONFIGURATION'
    || advisory.canonical !== false
    || advisory.operational_effect !== false
    || advisory.automatic_actions_enabled !== false) {
    throw new BusinessOsContractError('Cấu hình advisory không giữ đúng hợp đồng provisional/noncanonical/no-effect.');
  }
  requireBoolean(advisory.enabled, 'configuration_center.advisory_configuration.enabled');
  if (!Number.isInteger(advisory.current_version) || advisory.current_version < 0) {
    throw new BusinessOsContractError('Phiên bản cấu hình advisory không hợp lệ.');
  }
  requireRecord(advisory.scope, 'configuration_center.advisory_configuration.scope');
  if (!sameId(advisory.scope.ecosystem_id, payload.scope.ecosystem_id)
    || (payload.scope.company_id === null
      ? advisory.scope.company_id !== null
      : !sameId(advisory.scope.company_id, payload.scope.company_id))) {
    throw new BusinessOsContractError('Cấu hình advisory nằm ngoài phạm vi snapshot.');
  }
  requireRecord(advisory.configuration, 'configuration_center.advisory_configuration.configuration');
  const advisoryKeys = Object.keys(advisory.configuration);
  if (advisoryKeys.length !== FOUNDER_ADVISORY_CONFIGURATION_KEYS.length
    || advisoryKeys.some((key) => !FOUNDER_ADVISORY_CONFIGURATION_KEYS.includes(key))) {
    throw new BusinessOsContractError('Cấu hình advisory chứa khóa ngoài hợp đồng V1.');
  }
  FOUNDER_ADVISORY_CONFIGURATION_KEYS.forEach((key) => {
    const value = advisory.configuration[key];
    if (value !== null && !Number.isFinite(value)) {
      throw new BusinessOsContractError(`Giá trị advisory “${key}” không hợp lệ.`);
    }
  });
  requireArray(advisory.rollback_versions, 'configuration_center.advisory_configuration.rollback_versions');
  advisory.rollback_versions.forEach((version, index) => {
    requireRecord(version, `configuration_center.advisory_configuration.rollback_versions[${index}]`);
    if (!Number.isInteger(version.version) || version.version < 1) {
      throw new BusinessOsContractError('Lịch sử rollback advisory chứa phiên bản không hợp lệ.');
    }
    requireString(version.created_at, `configuration_center.advisory_configuration.rollback_versions[${index}].created_at`);
    requireString(version.action, `configuration_center.advisory_configuration.rollback_versions[${index}].action`);
    requireString(version.checksum, `configuration_center.advisory_configuration.rollback_versions[${index}].checksum`);
  });
  requireRecord(advisory.gates, 'configuration_center.advisory_configuration.gates');
  const advisoryGateKeys = ['service', 'rule', 'permission', 'approval', 'audit', 'rollback'];
  if (Object.keys(advisory.gates).length !== advisoryGateKeys.length) {
    throw new BusinessOsContractError('Cấu hình advisory không công bố đúng sáu gate bắt buộc.');
  }
  advisoryGateKeys.forEach((gate) => requireBoolean(advisory.gates[gate], `configuration_center.advisory_configuration.gates.${gate}`));
  if (payload.configuration_center.permissions.can_change
    && (!advisory.enabled || !advisoryGateKeys.every((gate) => advisory.gates[gate]))) {
    throw new BusinessOsContractError('Backend mở quyền đổi advisory khi sáu gate chưa đạt.');
  }

  if (payload.platform_capabilities.length !== BUSINESS_OS_PLATFORM_CAPABILITY_KEYS.length) {
    throw new BusinessOsContractError(
      `Full Platform V1 phải có đúng ${BUSINESS_OS_PLATFORM_CAPABILITY_KEYS.length} capability.`,
      'BUSINESS_OS_PLATFORM_CAPABILITIES_INVALID',
    );
  }
  const capabilityKeys = new Set();
  payload.platform_capabilities.forEach((capability, index) => {
    const field = `platform_capabilities[${index}]`;
    requireRecord(capability, field);
    requireString(capability.key, `${field}.key`);
    requireString(capability.label, `${field}.label`);
    requireString(capability.mode, `${field}.mode`);
    requireString(capability.source, `${field}.source`);
    if (!PLATFORM_CAPABILITY_KEY_SET.has(capability.key) || capabilityKeys.has(capability.key)) {
      throw new BusinessOsContractError('Full Platform V1 có capability thiếu, lạ hoặc trùng khóa.');
    }
    capabilityKeys.add(capability.key);
    if (!PLATFORM_STATUS_SET.has(capability.status) || capability.activation_status !== capability.status) {
      throw new BusinessOsContractError(`Trạng thái “${field}” không thuộc hợp đồng Full Platform V1.`);
    }
    requireReconciliation(capability.reconciliation, `${field}.reconciliation`);
    requireFreshness(capability.freshness, `${field}.freshness`);
    requireArray(capability.data_gaps, `${field}.data_gaps`);
    requireReadOnlyDrilldown(capability.drilldown, `${field}.drilldown`, {
      allowCockpitAnchor: true,
      companyScope: snapshotCompanyScope,
    });
    if (capability.canonical !== false || capability.automatic_operational_effect !== false) {
      throw new BusinessOsContractError(`Capability “${capability.key}” không được nhận quyền canonical hoặc tác động tự động.`);
    }
    requireString(capability.canonical_owner, `${field}.canonical_owner`);
    requireString(capability.write_capability, `${field}.write_capability`);
    if (!['DISABLED', 'PROVISIONAL_CONFIGURATION_ONLY'].includes(capability.write_capability)) {
      throw new BusinessOsContractError(`Capability “${capability.key}” công bố quyền ghi không được phép.`);
    }
    if ((capability.mode === 'PRODUCTIZATION_INTERFACE' || capability.mode === 'RUNTIME_DISABLED')
      && capability.status !== 'SANDBOX') {
      throw new BusinessOsContractError(`Capability interface “${capability.key}” phải hiển thị SANDBOX.`);
    }
  });
  if (capabilityKeys.size !== PLATFORM_CAPABILITY_KEY_SET.size
    || BUSINESS_OS_PLATFORM_CAPABILITY_KEYS.some((key) => !capabilityKeys.has(key))) {
    throw new BusinessOsContractError('Full Platform V1 không khớp đúng 19 capability bắt buộc.');
  }

  if (payload.signal_hub.contract_version !== 'founder_signal_hub_v1'
    || payload.signal_hub.mode !== 'read_projection'
    || payload.signal_hub.canonical !== false) {
    throw new BusinessOsContractError('Signal Hub không giữ đúng hợp đồng read-projection noncanonical.');
  }
  requireArray(payload.signal_hub.contracts, 'signal_hub.contracts');
  const signalIds = new Set();
  payload.signal_hub.contracts.forEach((signal, index) => {
    const field = `signal_hub.contracts[${index}]`;
    requireRecord(signal, field);
    [
      'signal_id', 'display_name', 'owner_domain', 'source_service_read_model',
      'source_object_field', 'source_record_id_semantics', 'query_filter_rule',
      'reconciliation_rule', 'quality_state', 'failure_state', 'canonical_status', 'as_of',
    ].forEach((key) => requireString(signal[key], `${field}.${key}`));
    if (signalIds.has(signal.signal_id)) throw new BusinessOsContractError('Signal Hub có signal_id trùng lặp.');
    signalIds.add(signal.signal_id);
    if (!sameId(signal.ecosystem_scope, payload.scope.ecosystem_id)) {
      throw new BusinessOsContractError('Signal Hub chứa ecosystem ngoài phạm vi snapshot.');
    }
    requireArray(signal.company_scope, `${field}.company_scope`);
    if (!signal.company_scope.length
      || signal.company_scope.some((id) => !responseCompanySet.has(String(id || '').toLowerCase()))) {
      throw new BusinessOsContractError('Signal Hub chứa công ty ngoài phạm vi snapshot.');
    }
    requireArray(signal.user_role_scope, `${field}.user_role_scope`);
    if (signal.user_role_scope.length !== 1 || signal.user_role_scope[0] !== 'admin') {
      throw new BusinessOsContractError('Signal Hub mở vai trò ngoài Founder/admin.');
    }
    if (!Number.isFinite(signal.freshness_target_seconds) || signal.freshness_target_seconds <= 0) {
      throw new BusinessOsContractError(`Freshness target “${field}” không hợp lệ.`);
    }
    requireFreshness(signal.freshness, `${field}.freshness`);
    requireReconciliation(signal.reconciliation, `${field}.reconciliation`);
    requireReadOnlyDrilldown(signal.drilldown, `${field}.drilldown`, {
      companyScope: snapshotCompanyScope,
    });
    if (signal.write_capability !== 'DISABLED'
      || signal.canonical_status !== 'NON_CANONICAL MANAGEMENT VIEW'
      || typeof signal.provisional !== 'boolean') {
      throw new BusinessOsContractError(`Signal “${signal.signal_id}” vi phạm hàng rào read-only/noncanonical.`);
    }
  });

  if (payload.correction_center.contract_version !== 'founder_correction_evolution_v1'
    || payload.correction_center.mode !== 'read_projection_and_drilldown'
    || payload.correction_center.canonical !== false) {
    throw new BusinessOsContractError('Correction Center không giữ đúng hợp đồng projection read-only.');
  }
  requireRecord(payload.correction_center.rule_change_request, 'correction_center.rule_change_request');
  if (payload.correction_center.rule_change_request.enabled !== false
    || payload.correction_center.rule_change_request.status !== 'DISABLED') {
    throw new BusinessOsContractError('Correction Center không được mở thay đổi Business Rule canonical.');
  }
  requireString(payload.correction_center.rule_change_request.reason, 'correction_center.rule_change_request.reason');
  requireArray(payload.correction_center.items, 'correction_center.items');
  const correctionIds = new Set();
  payload.correction_center.items.forEach((item, index) => {
    const field = `correction_center.items[${index}]`;
    requireRecord(item, field);
    ['issue_id', 'issue', 'root_cause', 'corrective_action', 'owner_state', 'deadline_state', 'status']
      .forEach((key) => requireString(item[key], `${field}.${key}`));
    if (correctionIds.has(item.issue_id)) throw new BusinessOsContractError('Correction Center có issue_id trùng lặp.');
    correctionIds.add(item.issue_id);
    if (!Object.hasOwn(item, 'owner') || !Object.hasOwn(item, 'deadline')) {
      throw new BusinessOsContractError(`Correction Center thiếu owner/deadline tại “${field}”.`);
    }
    requireReadOnlyDrilldown(item.drilldown, `${field}.drilldown`, {
      companyScope: snapshotCompanyScope,
    });
    if (item.protected_write_enabled !== false || typeof item.provisional !== 'boolean') {
      throw new BusinessOsContractError(`Correction item “${item.issue_id}” vi phạm hàng rào read-only.`);
    }
  });

  payload.drilldowns.forEach((drilldown, index) => {
    requireReadOnlyDrilldown(drilldown, `drilldowns[${index}]`, {
      companyScope: snapshotCompanyScope,
    });
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
    requireFreshness(item.freshness, `manufacturing_companies[${index}].freshness`, { datasetState: true });
    requireReconciliation(item.reconciliation, `manufacturing_companies[${index}].reconciliation`, { checkedAt: true });
    requireArray(item.data_gaps, `manufacturing_companies[${index}].data_gaps`);
    requireReadOnlyDrilldown(item.drilldown, `manufacturing_companies[${index}].drilldown`, {
      companyScope: item.company.id,
    });
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
