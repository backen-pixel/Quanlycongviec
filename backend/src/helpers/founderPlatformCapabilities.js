/**
 * Full Platform V1 capability registry for the Founder Cockpit.
 *
 * This is an interface/status projection only. It owns no canonical business
 * state and never upgrades a capability beyond the evidence supplied by the
 * existing Domain read models.
 */
const PLATFORM_CAPABILITY_DEFINITIONS = Object.freeze([
  ['strategy_objective_center', 'Strategy & Objective Center', 'INTERNAL_OPERATIONAL'],
  ['founder_executive_cockpit', 'Founder Executive Cockpit', 'INTERNAL_OPERATIONAL'],
  ['portfolio_planning_forecasting', 'Portfolio Planning & Forecasting', 'INTERNAL_OPERATIONAL'],
  ['capacity_workload_balancing', 'Capacity & Workload Balancing', 'INTERNAL_OPERATIONAL'],
  ['founder_decision_exception_center', 'Founder Decision & Exception Center', 'INTERNAL_OPERATIONAL'],
  ['management_reporting_profitability', 'Management Reporting & Profitability', 'INTERNAL_OPERATIONAL'],
  ['correction_evolution', 'Correction & Evolution', 'INTERNAL_OPERATIONAL'],
  ['founder_configuration_center', 'Founder Configuration Center', 'INTERNAL_OPERATIONAL'],
  ['cross_domain_signal_hub', 'Cross-Domain Signal Hub', 'INTERNAL_OPERATIONAL'],
  ['module_registry_feature_flags', 'Module Registry & Feature Flags', 'INTERNAL_OPERATIONAL'],
  ['connector_center', 'Connector Center', 'INTERNAL_OPERATIONAL'],
  ['data_quality_reconciliation', 'Data Quality & Reconciliation Center', 'INTERNAL_OPERATIONAL'],
  ['customer_tenant_administration', 'Customer / Tenant Administration', 'PRODUCTIZATION_INTERFACE'],
  ['industry_pack_template_studio', 'Industry Pack & Template Studio', 'PRODUCTIZATION_INTERFACE'],
  ['customer_onboarding_data_portability', 'Customer Onboarding & Data Portability', 'PRODUCTIZATION_INTERFACE'],
  ['licensing_billing', 'Licensing & Billing', 'PRODUCTIZATION_INTERFACE'],
  ['release_upgrade_rollback', 'Release / Upgrade / Rollback', 'PRODUCTIZATION_INTERFACE'],
  ['monitoring_backup_support', 'Monitoring / Backup / Support', 'INTERNAL_OPERATIONAL'],
  ['executive_domain_ai_interfaces', 'Executive AI & Domain AI Interfaces', 'RUNTIME_DISABLED'],
].map(([key, label, mode]) => ({ key, label, mode })));

const MATCH_STATES = new Set(['MATCH', 'MATCHED', 'MATCH WITH DOCUMENTED NORMALIZATION']);
const FRESHNESS_STATE_RANK = Object.freeze({
  FRESH: 0,
  STALE: 1,
  UNKNOWN: 2,
  NOT_CONNECTED: 3,
});
const CRITICAL_DOMAIN_KEYS = Object.freeze([
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
  'people_kpi',
  'permissions',
  'approvals',
  'reporting',
]);

function moduleByKey(modules, key) {
  return (modules || []).find((module) => module.key === key) || null;
}

function statusRank(status) {
  return {
    LIVE: 0,
    'LIVE WITH DATA GAPS': 1,
    'UNDER RECONCILIATION': 2,
    'NOT CONNECTED': 3,
    BLOCKED: 4,
    'FOUNDER DECISION REQUIRED': 5,
    SANDBOX: 1,
  }[status] ?? 4;
}

function combinedStatus(modules, { allowSandbox = false } = {}) {
  const present = (modules || []).filter(Boolean);
  if (!present.length) return allowSandbox ? 'SANDBOX' : 'NOT CONNECTED';
  const worst = [...present].sort((left, right) => statusRank(right.activation_status || right.status)
    - statusRank(left.activation_status || left.status))[0];
  return worst.activation_status || worst.status || 'NOT CONNECTED';
}

function reconciliationState(modules) {
  const states = (modules || []).filter(Boolean).map((module) => (
    module.reconciliation?.state || module.reconciliation?.status || 'NOT CHECKED'
  ));
  return states.length && states.every((state) => MATCH_STATES.has(state)) ? 'MATCH' : 'UNDER RECONCILIATION';
}

function aggregateFreshness(modules, generatedAt) {
  const entries = (modules || []).map((module) => module?.freshness).filter(Boolean);
  const state = entries.length
    ? entries.reduce((worst, entry) => {
      const current = Object.hasOwn(FRESHNESS_STATE_RANK, entry.state) ? entry.state : 'UNKNOWN';
      return FRESHNESS_STATE_RANK[current] > FRESHNESS_STATE_RANK[worst] ? current : worst;
    }, 'FRESH')
    : 'UNKNOWN';
  const observedTimes = entries
    .map((entry) => Date.parse(entry.observed_at || ''))
    .filter(Number.isFinite);
  const sourceTimes = entries
    .map((entry) => Date.parse(entry.source_updated_at || ''))
    .filter(Number.isFinite);
  const slos = entries
    .map((entry) => Number(entry.slo_minutes))
    .filter((value) => Number.isFinite(value) && value > 0);
  const generatedMs = Date.parse(generatedAt || '');
  const observedAt = observedTimes.length
    ? new Date(Math.min(...observedTimes)).toISOString()
    : Number.isFinite(generatedMs)
      ? new Date(generatedMs).toISOString()
      : null;
  return {
    dataset_id: 'platform_capabilities',
    source_module: 'founder_cockpit_modules',
    state,
    status: state,
    as_of: observedAt,
    observed_at: observedAt,
    source_updated_at: sourceTimes.length ? new Date(Math.max(...sourceTimes)).toISOString() : null,
    slo_minutes: slos.length ? Math.min(...slos) : null,
    freshness_basis: state === 'FRESH' ? 'DIRECT_READ_OBSERVED_AT' : state,
  };
}

function capability({
  key,
  status,
  source,
  reconciliation,
  freshness,
  dataGaps = [],
  drilldown,
  mode,
  writeCapability = 'DISABLED',
}) {
  return {
    key,
    label: PLATFORM_CAPABILITY_DEFINITIONS.find((item) => item.key === key)?.label || key,
    mode: mode || PLATFORM_CAPABILITY_DEFINITIONS.find((item) => item.key === key)?.mode || 'INTERNAL_OPERATIONAL',
    status,
    activation_status: status,
    source,
    reconciliation: { state: reconciliation },
    freshness,
    data_gaps: dataGaps,
    drilldown,
    canonical: false,
    canonical_owner: 'existing_domain_and_system_of_record_modules',
    write_capability: writeCapability,
    automatic_operational_effect: false,
  };
}

function buildFounderPlatformCapabilities({
  modules,
  planning,
  capacity,
  decisions,
  configurationCenter,
  generatedAt,
}) {
  const critical = CRITICAL_DOMAIN_KEYS.map((key) => moduleByKey(modules, key)).filter(Boolean);
  const reporting = [moduleByKey(modules, 'reporting'), moduleByKey(modules, 'accounting')].filter(Boolean);
  const operations = [
    moduleByKey(modules, 'projects'),
    moduleByKey(modules, 'work_unified'),
    moduleByKey(modules, 'procurement_purchasing'),
    moduleByKey(modules, 'production'),
    moduleByKey(modules, 'logistics'),
  ].filter(Boolean);
  const criticalReconciliation = reconciliationState(critical);
  const commonFreshness = aggregateFreshness(critical, generatedAt);
  const configEnabled = configurationCenter?.advisory_configuration?.enabled === true;
  const configGates = configurationCenter?.advisory_configuration?.gates || {};
  const configWriteReady = configEnabled && Object.values(configGates).length > 0 && Object.values(configGates).every(Boolean);
  const planningStatus = combinedStatus((planning?.horizons || []).map((item) => ({
    status: item.status,
    activation_status: item.status,
  })));

  return [
    capability({
      key: 'strategy_objective_center',
      status: 'LIVE WITH DATA GAPS',
      source: 'six_system_market_signals_from_existing_crm_and_project_read_models',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      dataGaps: [{ code: 'CANONICAL_OBJECTIVE_SOURCE_NOT_CONNECTED', message: 'Chưa có nguồn mục tiêu chiến lược canonical; không suy diễn mục tiêu.' }],
      drilldown: { href: '/business-os#six-systems', label: 'Mở 6 hệ', enabled: true },
    }),
    capability({
      key: 'founder_executive_cockpit',
      status: combinedStatus(critical),
      source: 'founder_cockpit_v1',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      drilldown: { href: '/business-os#six-systems', label: 'Mở Cockpit', enabled: true },
    }),
    capability({
      key: 'portfolio_planning_forecasting',
      status: planningStatus,
      source: 'unified_tasks_v_plus_projects',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      drilldown: { href: '/business-os#planning', label: 'Mở kế hoạch', enabled: true },
    }),
    capability({
      key: 'capacity_workload_balancing',
      status: 'LIVE WITH DATA GAPS',
      source: 'unified_tasks_v_plus_users_plus_projects',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      dataGaps: capacity?.data_gaps || [],
      drilldown: { href: '/business-os#capacity', label: 'Mở năng lực', enabled: true },
    }),
    capability({
      key: 'founder_decision_exception_center',
      status: combinedStatus(operations),
      source: 'cross_domain_exception_projection',
      reconciliation: reconciliationState(operations),
      freshness: commonFreshness,
      dataGaps: (decisions || []).some((item) => item.provisional_advisory)
        ? [{ code: 'PROVISIONAL_ADVISORY_PRESENT', message: 'Có cảnh báo tạm không mang tác động vận hành.' }]
        : [],
      drilldown: { href: '/business-os#decisions', label: 'Mở quyết định', enabled: true },
    }),
    capability({
      key: 'management_reporting_profitability',
      status: combinedStatus(reporting),
      source: 'accounting_summary_plus_management_reporting',
      reconciliation: reconciliationState(reporting),
      freshness: commonFreshness,
      drilldown: { href: '/business-os#modules', label: 'Mở báo cáo', enabled: true },
    }),
    capability({
      key: 'correction_evolution',
      status: 'LIVE WITH DATA GAPS',
      source: 'decision_and_data_quality_exceptions',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      dataGaps: [{ code: 'CORRECTIVE_WORKFLOW_DRILLDOWN_ONLY', message: 'V1 chỉ tổng hợp issue/cause/action signals và drill-down; không tạo luồng ghi mới.' }],
      drilldown: { href: '/business-os#decisions', label: 'Mở ngoại lệ', enabled: true },
    }),
    capability({
      key: 'founder_configuration_center',
      status: 'LIVE WITH DATA GAPS',
      source: 'app_module_registry_plus_founder_advisory_configuration_service',
      reconciliation: configEnabled ? 'MATCH' : 'UNDER RECONCILIATION',
      freshness: commonFreshness,
      dataGaps: configEnabled ? [{ code: 'PROVISIONAL_ADVISORY_ONLY', message: 'Chỉ cấu hình cảnh báo tạm, không phải Business Rule canonical.' }] : [{ code: 'ADVISORY_WRITE_DISABLED', message: 'Runtime chưa bật cấu hình advisory cục bộ.' }],
      drilldown: { href: '/business-os#configuration', label: 'Mở cấu hình', enabled: true },
      writeCapability: configWriteReady ? 'PROVISIONAL_CONFIGURATION_ONLY' : 'DISABLED',
    }),
    capability({
      key: 'cross_domain_signal_hub',
      status: combinedStatus(critical),
      source: 'founder_cockpit_signal_contracts',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      dataGaps: [{ code: 'CANONICAL_TOLERANCE_DICTIONARY_PARTIAL', message: 'Một số tolerance liên miền chưa có nguồn canonical.' }],
      drilldown: { href: '/business-os#modules', label: 'Mở Signal Hub', enabled: true },
    }),
    capability({
      key: 'module_registry_feature_flags',
      status: configurationCenter?.data_gaps?.length ? 'LIVE WITH DATA GAPS' : 'LIVE',
      source: 'app_module_registry',
      reconciliation: configurationCenter?.data_gaps?.length ? 'UNDER RECONCILIATION' : 'MATCH',
      freshness: commonFreshness,
      dataGaps: configurationCenter?.data_gaps || [],
      drilldown: configurationCenter?.drilldown,
    }),
    capability({
      key: 'connector_center',
      status: 'LIVE WITH DATA GAPS',
      source: 'module_activation_and_freshness_registry',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      dataGaps: [{ code: 'WARRANTY_CARE_NOT_CONNECTED', message: 'Warranty / Care chưa có read model chuẩn; không chặn V1.' }],
      drilldown: { href: '/business-os#modules', label: 'Mở kết nối', enabled: true },
    }),
    capability({
      key: 'data_quality_reconciliation',
      status: criticalReconciliation === 'MATCH' ? 'LIVE' : 'UNDER RECONCILIATION',
      source: 'source_packet_scope_freshness_and_reconciliation_gates',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      drilldown: { href: '/business-os#modules', label: 'Mở đối soát', enabled: true },
    }),
    ...[
      'customer_tenant_administration',
      'industry_pack_template_studio',
      'customer_onboarding_data_portability',
      'licensing_billing',
      'release_upgrade_rollback',
    ].map((key) => capability({
      key,
      status: 'SANDBOX',
      source: 'configuration_interface_only',
      reconciliation: 'NOT APPLICABLE',
      freshness: commonFreshness,
      dataGaps: [{ code: 'EXTERNAL_ACTIVATION_NOT_AUTHORIZED', message: 'Chỉ hiển thị interface/configuration; external Production không được kích hoạt.' }],
      drilldown: { href: '/business-os#platform-capabilities', label: 'Xem trạng thái', enabled: true },
      mode: 'PRODUCTIZATION_INTERFACE',
    })),
    capability({
      key: 'monitoring_backup_support',
      status: 'LIVE WITH DATA GAPS',
      source: 'founder_cockpit_health_v1_plus_internal_runbook',
      reconciliation: criticalReconciliation,
      freshness: commonFreshness,
      dataGaps: [{ code: 'SOURCE_BACKUP_FAILOVER_NOT_VERIFIED', message: 'Backup/failover nguồn không được kiểm chứng; không chặn Founder-local read-only.' }],
      drilldown: { href: '/business-os#platform-capabilities', label: 'Xem health', enabled: true },
    }),
    capability({
      key: 'executive_domain_ai_interfaces',
      status: 'SANDBOX',
      source: 'interface_only',
      reconciliation: 'NOT APPLICABLE',
      freshness: commonFreshness,
      dataGaps: [{ code: 'AUTONOMOUS_RUNTIME_DISABLED', message: 'OpenClaw và autonomous Business AI Runtime tiếp tục bị khóa.' }],
      drilldown: { href: '/business-os#platform-capabilities', label: 'Xem trạng thái', enabled: true },
      mode: 'RUNTIME_DISABLED',
    }),
  ];
}

module.exports = {
  PLATFORM_CAPABILITY_DEFINITIONS,
  CRITICAL_DOMAIN_KEYS,
  aggregateFreshness,
  buildFounderPlatformCapabilities,
};
