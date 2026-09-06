/**
 * Founder Cockpit V1 — authenticated, permissioned, read-in-place aggregate.
 * Mount: GET /api/business-os
 */
const { Router } = require('express');
const { createHash } = require('node:crypto');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const {
  CONTRACT_VERSION,
  CONNECTOR_POLICY,
  FRESHNESS_STATES,
  FounderCockpitError,
  defaultReaders,
  resolveFounderCockpitScope,
  loadFounderCockpit,
} = require('../helpers/founderCockpitReadModel');
const {
  FounderAdvisoryConfigError,
  FounderAdvisoryConfigService,
} = require('../services/founderAdvisoryConfig');

const FOUNDER_ROLES = new Set(['admin']);
const HEALTH_CONTRACT_VERSION = 'founder_cockpit_health_v1';
const HEALTH_MAX_AGE_MS = 2 * 60 * 1000;
const NON_BLOCKING_MODULES = new Set(['warranty_care']);
const TRUSTED_RECONCILIATION_STATES = new Set([
  'MATCH',
  'MATCHED',
  'MATCH WITH DOCUMENTED NORMALIZATION',
]);
const TRUSTED_FRESHNESS_STATES = new Set(FRESHNESS_STATES);
const defaultAdvisoryConfigService = new FounderAdvisoryConfigService();

function requireFounderAccess(req, res, next) {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (!FOUNDER_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Founder Executive Cockpit chỉ dành cho Founder/admin được ủy quyền.',
      code: 'BUSINESS_OS_FOUNDER_ACCESS_REQUIRED',
    });
  }
  return next();
}

function auditRef(value) {
  return createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 16);
}

function safeErrorCode(error, fallback = 'UNEXPECTED_ERROR') {
  const candidate = String(error?.code || error?.name || '').trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(candidate) ? candidate : fallback;
}

function evaluateModuleFreshness(module, nowMs) {
  const freshness = module?.freshness || {};
  let state = TRUSTED_FRESHNESS_STATES.has(freshness.state) ? freshness.state : 'UNKNOWN';
  if (module?.activation_status === 'NOT CONNECTED') state = 'NOT_CONNECTED';

  const observedAtMs = Date.parse(freshness.observed_at || '');
  const sloMinutes = Number(freshness.slo_minutes);
  if (state === 'FRESH') {
    if (
      !Number.isFinite(observedAtMs)
      || observedAtMs > nowMs + 60_000
      || !Number.isFinite(sloMinutes)
      || sloMinutes <= 0
    ) {
      state = 'UNKNOWN';
    } else if (nowMs - observedAtMs > sloMinutes * 60_000) {
      state = 'STALE';
    }
  }

  return {
    state,
    observed_at: Number.isFinite(observedAtMs) ? new Date(observedAtMs).toISOString() : null,
    source_updated_at: Number.isFinite(Date.parse(freshness.source_updated_at || ''))
      ? new Date(Date.parse(freshness.source_updated_at)).toISOString()
      : null,
    slo_minutes: Number.isFinite(sloMinutes) && sloMinutes > 0 ? sloMinutes : null,
  };
}

function buildFounderCockpitHealth(payload, { now = new Date() } = {}) {
  if (!payload || !Array.isArray(payload.modules) || !payload.configuration_center) {
    throw new FounderCockpitError(503, 'BUSINESS_OS_HEALTH_CONTRACT_INVALID', 'Không tạo được health signal từ snapshot không hợp lệ.');
  }

  const nowMs = now.getTime();
  const generatedAtMs = Date.parse(payload.generated_at || '');
  const stale = !Number.isFinite(generatedAtMs)
    || generatedAtMs > nowMs + 60_000
    || nowMs - generatedAtMs > HEALTH_MAX_AGE_MS;
  const protectionFlags = payload.protections || {};
  const protectionOk = protectionFlags.write_enabled === false
    && protectionFlags.direct_database_write_enabled === false
    && protectionFlags.synthetic_fallback_enabled === false
    && protectionFlags.external_send_enabled === false;

  const moduleHealth = payload.modules.map((module) => {
    const moduleFreshness = evaluateModuleFreshness(module, nowMs);
    const activationBlocking = !NON_BLOCKING_MODULES.has(module.key)
      && ['NOT CONNECTED', 'BLOCKED', 'FOUNDER DECISION REQUIRED'].includes(module.activation_status);
    const freshnessBlocking = !NON_BLOCKING_MODULES.has(module.key)
      && moduleFreshness.state !== 'FRESH';
    return {
      key: module.key,
      status: module.activation_status,
      reconciliation: module.reconciliation?.state || module.reconciliation?.status || 'NOT CHECKED',
      freshness_state: moduleFreshness.state,
      freshness_as_of: moduleFreshness.observed_at,
      freshness_source_updated_at: moduleFreshness.source_updated_at,
      freshness_slo_minutes: moduleFreshness.slo_minutes,
      gap_codes: (module.data_gaps || []).map((gap) => gap?.code).filter(Boolean),
      v1_blocking: activationBlocking || freshnessBlocking,
    };
  });
  const degradedModules = moduleHealth.filter((module) => (
    module.status !== 'LIVE' || module.freshness_state !== 'FRESH'
  ));
  const criticalBlockers = degradedModules.filter((module) => module.v1_blocking);
  const criticalFreshnessFailures = moduleHealth.filter((module) => (
    !NON_BLOCKING_MODULES.has(module.key) && module.freshness_state !== 'FRESH'
  ));
  const reconciliationFailures = payload.modules.filter((module) => {
    if (NON_BLOCKING_MODULES.has(module.key)) return false;
    const state = module.reconciliation?.state || module.reconciliation?.status || 'NOT CHECKED';
    return !TRUSTED_RECONCILIATION_STATES.has(state);
  });
  const configurationAvailable = payload.configuration_center.read_only === true
    && Array.isArray(payload.configuration_center.modules)
    && payload.configuration_center.permissions?.can_view === true;
  const scopeAvailable = Array.isArray(payload.scope?.company_ids) && payload.scope.company_ids.length > 0;
  const ready = !stale
    && protectionOk
    && configurationAvailable
    && scopeAvailable
    && criticalBlockers.length === 0
    && criticalFreshnessFailures.length === 0
    && reconciliationFailures.length === 0;

  return {
    contract_version: HEALTH_CONTRACT_VERSION,
    status: ready ? (degradedModules.length ? 'DEGRADED' : 'PASS') : 'FAIL',
    ready,
    checked_at: now.toISOString(),
    mode: payload.mode,
    process: {
      status: 'PASS',
      uptime_seconds: Math.max(0, Math.floor(process.uptime())),
    },
    route: {
      status: 'PASS',
      path: '/api/business-os',
      health_path: '/api/business-os/health',
    },
    scope: {
      status: scopeAvailable ? 'PASS' : 'FAIL',
      level: payload.scope?.level || null,
      company_count: payload.scope?.company_ids?.length || 0,
    },
    connectors: {
      status: criticalBlockers.length || criticalFreshnessFailures.length
        ? 'FAIL'
        : (degradedModules.length ? 'DEGRADED' : 'PASS'),
      module_count: payload.modules.length,
      degraded_count: degradedModules.length,
      critical_blocker_count: criticalBlockers.length,
      policy: {
        ...CONNECTOR_POLICY,
        circuit_breaker: 'ENABLED',
        failure_behavior: 'DEGRADE_AFFECTED_MODULE',
      },
    },
    freshness: {
      status: stale || criticalFreshnessFailures.length ? 'FAIL' : 'PASS',
      snapshot_status: stale ? 'STALE' : 'FRESH',
      critical_module_status: criticalFreshnessFailures.length ? 'FAIL' : 'PASS',
      failed_module_keys: criticalFreshnessFailures.map((module) => module.key),
      last_successful_refresh: payload.generated_at || null,
      max_age_ms: HEALTH_MAX_AGE_MS,
      modules: moduleHealth.map((module) => ({
        key: module.key,
        state: module.freshness_state,
        observed_at: module.freshness_as_of,
        source_updated_at: module.freshness_source_updated_at,
        slo_minutes: module.freshness_slo_minutes,
      })),
    },
    reconciliation: {
      status: reconciliationFailures.length ? 'FAIL' : 'PASS',
      failed_module_keys: reconciliationFailures.map((module) => module.key),
    },
    configuration_store: {
      status: configurationAvailable ? 'PASS' : 'FAIL',
      source: payload.configuration_center.source || null,
      read_only: payload.configuration_center.read_only === true,
      canonical_configuration_read_only: payload.configuration_center.canonical_configuration_read_only === true,
      advisory_configuration_enabled: payload.configuration_center.advisory_configuration?.enabled === true,
      advisory_operational_effect: payload.configuration_center.advisory_configuration?.operational_effect ?? false,
      rollback_available: Array.isArray(payload.configuration_center.advisory_configuration?.rollback_versions),
    },
    protections: {
      status: protectionOk ? 'PASS' : 'FAIL',
      write_enabled: protectionFlags.write_enabled,
      direct_database_write_enabled: protectionFlags.direct_database_write_enabled,
      synthetic_fallback_enabled: protectionFlags.synthetic_fallback_enabled,
      external_send_enabled: protectionFlags.external_send_enabled,
    },
    degraded_modules: degradedModules,
    critical_blockers: criticalBlockers.map((module) => module.key),
  };
}

async function loadAdvisoryConfiguration(scope, service) {
  const [selected, companyEntries] = await Promise.all([
    service.get(scope),
    Promise.all((scope.company_ids || []).map(async (companyId) => [
      String(companyId),
      await service.get({ ecosystem_id: scope.ecosystem_id, company_id: String(companyId) }),
    ])),
  ]);
  return {
    selected,
    byCompany: Object.fromEntries(companyEntries),
  };
}

function isExpectedBusinessOsError(error) {
  return error instanceof FounderCockpitError
    || error instanceof FounderAdvisoryConfigError
    || error?.code?.startsWith?.('BUSINESS_OS_')
    || error?.code?.startsWith?.('FOUNDER_CONFIG_');
}

function sendBusinessOsError(res, error, fallbackCode, fallbackMessage, status = 500) {
  if (isExpectedBusinessOsError(error)) {
    return res.status(error.status || 400).json({
      error: error.message,
      code: error.code,
    });
  }
  return res.status(status).json({ error: fallbackMessage, code: fallbackCode });
}

function createBusinessOsRouter({
  authMiddleware = auth,
  founderMiddleware = requireFounderAccess,
  permissionMiddleware = requirePermission('reports', 'view'),
  configurationPermissionMiddleware = requirePermission('settings', 'edit'),
  readers = defaultReaders,
  resolveScope = resolveFounderCockpitScope,
  loadCockpit = loadFounderCockpit,
  advisoryConfigService = defaultAdvisoryConfigService,
} = {}) {
  const router = Router();
  router.use(authMiddleware);
  router.use(founderMiddleware);

  router.get('/metadata', permissionMiddleware, async (req, res) => {
    try {
      // Metadata is part of the Cockpit control plane. Always resolve the
      // caller's full verified tenant scope; a prior source-page drill-down
      // lock must never rewrite the Cockpit selector itself.
      const scope = await resolveScope({
        user: req.user,
        tenantContext: req.tenantContext,
        tenantCompanyIds: req.tenantCompanyIds,
        query: { ...(req.query || {}), company_id: 'all' },
      }, { readers });
      res.set('Cache-Control', 'no-store');
      return res.json({
        contract_version: 'founder_cockpit_metadata_v1',
        ecosystem: {
          id: scope.ecosystem_id,
          name: req.user?.tenant_name || req.user?.ecosystem_name || scope.ecosystem_id,
        },
        companies: scope.companies,
      });
    } catch (error) {
      return sendBusinessOsError(
        res,
        error,
        'BUSINESS_OS_METADATA_FAILED',
        'Không tải được danh mục phạm vi Founder Cockpit.',
        503,
      );
    }
  });

  router.get('/health', permissionMiddleware, async (req, res) => {
    try {
      const scope = await resolveScope(req, { readers });
      const advisory = await loadAdvisoryConfiguration(scope, advisoryConfigService);
      const payload = await loadCockpit({
        scope,
        user: req.user,
        period: req.query?.period || 'week',
        periodAnchor: req.query?.period_anchor || null,
        readers,
        gateContext: {
          permission: true,
          audit: true,
        },
        advisoryConfig: advisory.selected,
        companyAdvisoryConfigs: advisory.byCompany,
      });
      const health = buildFounderCockpitHealth(payload);
      console.info('[business-os/audit]', JSON.stringify({
        event: 'founder_cockpit_health_read',
        actor_ref: auditRef(req.user?.userId || req.user?.id),
        ecosystem_ref: auditRef(scope.ecosystem_id),
        scope_level: scope.level,
        company_count: scope.company_ids.length,
        checked_at: health.checked_at,
        outcome: health.ready ? 'ready' : 'degraded',
      }));
      res.set('Cache-Control', 'no-store');
      res.set('X-Business-OS-Health-Contract', HEALTH_CONTRACT_VERSION);
      return res.status(health.ready ? 200 : 503).json(health);
    } catch (error) {
      if (!isExpectedBusinessOsError(error)) {
        console.error('[business-os/founder-cockpit-health]', safeErrorCode(error, 'BUSINESS_OS_HEALTH_UNEXPECTED'));
      }
      return sendBusinessOsError(
        res,
        error,
        'BUSINESS_OS_HEALTH_FAILED',
        'Không xác minh được runtime health của Founder Cockpit.',
        503,
      );
    }
  });

  router.get('/configuration', permissionMiddleware, async (req, res) => {
    try {
      const scope = await resolveScope(req, { readers });
      const configuration = await advisoryConfigService.get(scope);
      res.set('Cache-Control', 'no-store');
      return res.json(configuration);
    } catch (error) {
      return sendBusinessOsError(
        res,
        error,
        'FOUNDER_CONFIG_READ_FAILED',
        'Không đọc được cấu hình advisory của Founder.',
        503,
      );
    }
  });

  router.put('/configuration', permissionMiddleware, configurationPermissionMiddleware, async (req, res) => {
    try {
      const scope = await resolveScope(req, { readers });
      const configuration = await advisoryConfigService.save({
        scope,
        configuration: req.body?.configuration,
        approval: req.body?.approval,
        expectedVersion: req.body?.expected_version,
        idempotencyKey: req.get('Idempotency-Key'),
        actorRef: auditRef(req.user?.userId || req.user?.id),
      });
      console.info('[business-os/audit]', JSON.stringify({
        event: 'founder_advisory_configuration_saved',
        actor_ref: auditRef(req.user?.userId || req.user?.id),
        ecosystem_ref: auditRef(scope.ecosystem_id),
        scope_level: scope.level,
        version: configuration.current_version,
        outcome: configuration.idempotent_replay ? 'idempotent_replay' : 'saved',
      }));
      res.set('Cache-Control', 'no-store');
      return res.json(configuration);
    } catch (error) {
      return sendBusinessOsError(
        res,
        error,
        'FOUNDER_CONFIG_WRITE_FAILED',
        'Không lưu được cấu hình advisory của Founder.',
        503,
      );
    }
  });

  router.post('/configuration/rollback', permissionMiddleware, configurationPermissionMiddleware, async (req, res) => {
    try {
      const scope = await resolveScope(req, { readers });
      const configuration = await advisoryConfigService.rollback({
        scope,
        targetVersion: req.body?.target_version,
        approval: req.body?.approval,
        expectedVersion: req.body?.expected_version,
        idempotencyKey: req.get('Idempotency-Key'),
        actorRef: auditRef(req.user?.userId || req.user?.id),
      });
      console.info('[business-os/audit]', JSON.stringify({
        event: 'founder_advisory_configuration_rolled_back',
        actor_ref: auditRef(req.user?.userId || req.user?.id),
        ecosystem_ref: auditRef(scope.ecosystem_id),
        scope_level: scope.level,
        version: configuration.current_version,
        outcome: configuration.idempotent_replay ? 'idempotent_replay' : 'rolled_back',
      }));
      res.set('Cache-Control', 'no-store');
      return res.json(configuration);
    } catch (error) {
      return sendBusinessOsError(
        res,
        error,
        'FOUNDER_CONFIG_ROLLBACK_FAILED',
        'Không rollback được cấu hình advisory của Founder.',
        503,
      );
    }
  });

  router.get('/', permissionMiddleware, async (req, res) => {
    try {
      const scope = await resolveScope(req, { readers });
      const advisory = await loadAdvisoryConfiguration(scope, advisoryConfigService);
      const payload = await loadCockpit({
        scope,
        user: req.user,
        period: req.query?.period || 'week',
        periodAnchor: req.query?.period_anchor || null,
        readers,
        gateContext: {
          permission: true,
          audit: true,
        },
        advisoryConfig: advisory.selected,
        companyAdvisoryConfigs: advisory.byCompany,
      });
      console.info('[business-os/audit]', JSON.stringify({
        event: 'founder_cockpit_read',
        actor_ref: auditRef(req.user?.userId || req.user?.id),
        ecosystem_ref: auditRef(scope.ecosystem_id),
        scope_level: scope.level,
        company_count: scope.company_ids.length,
        generated_at: payload.generated_at,
        outcome: 'allowed',
      }));
      res.set('Cache-Control', 'no-store');
      res.set('X-Business-OS-Contract', CONTRACT_VERSION);
      return res.json(payload);
    } catch (error) {
      if (!isExpectedBusinessOsError(error)) {
        console.error('[business-os/founder-cockpit]', safeErrorCode(error, 'BUSINESS_OS_READ_UNEXPECTED'));
      }
      return sendBusinessOsError(
        res,
        error,
        'BUSINESS_OS_READ_FAILED',
        'Không tải được Founder Cockpit từ các nguồn dữ liệu hiện hữu.',
      );
    }
  });

  return router;
}

const router = createBusinessOsRouter();
router.createBusinessOsRouter = createBusinessOsRouter;
router.requireFounderAccess = requireFounderAccess;
router.buildFounderCockpitHealth = buildFounderCockpitHealth;
router.HEALTH_CONTRACT_VERSION = HEALTH_CONTRACT_VERSION;

module.exports = router;
