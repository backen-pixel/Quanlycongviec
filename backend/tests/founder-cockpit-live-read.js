/**
 * Read-only acceptance smoke for Founder Cockpit against the configured
 * enterprise data source. The script never prints identities or credentials.
 *
 * Run from backend/ with the normal internal environment loaded:
 *   node tests/founder-cockpit-live-read.js
 */
const fs = require('node:fs');
const path = require('node:path');

const WRITE_EVIDENCE = process.env.BUSINESS_OS_WRITE_EVIDENCE === '1';
const EVIDENCE_PATH = path.resolve(
  __dirname,
  '../../evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/real-data-live-read.json',
);

function prepareEvidenceTarget() {
  if (!WRITE_EVIDENCE) return;
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.rmSync(EVIDENCE_PATH, { force: true });
}

function writeEvidenceAtomic(evidence) {
  if (!WRITE_EVIDENCE) return;
  const temporaryPath = `${EVIDENCE_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, EVIDENCE_PATH);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

prepareEvidenceTarget();
process.env.RUNTIME_PROFILE = 'founder-local-read-only';
if (process.env.FOUNDER_ADVISORY_CONFIG_ENABLED == null) process.env.FOUNDER_ADVISORY_CONFIG_ENABLED = '0';
const founderEnvFile = String(process.env.FOUNDER_LOCAL_ENV_FILE || '').trim();
if (!founderEnvFile || !require('node:path').isAbsolute(founderEnvFile)) {
  console.error(JSON.stringify({ result: 'FAIL', code: 'FOUNDER_LOCAL_ENV_FILE_REQUIRED' }));
  process.exit(1);
}
try {
  require('../src/config/founderLocalEnv').loadFounderLocalDataEnvironment(founderEnvFile);
} catch {
  console.error(JSON.stringify({ result: 'FAIL', code: 'FOUNDER_LOCAL_ENV_FILE_UNREADABLE' }));
  process.exit(1);
}
const {
  applyRuntimeProfile,
  assertFounderLocalDataConfig,
} = require('../src/config/runtimeProfile');
applyRuntimeProfile();
assertFounderLocalDataConfig();
require('../src/helpers/founderLocalSupabaseGuard').installFounderLocalSupabaseGuard();

const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const {
  FOUNDER_LOCAL_JWT_AUDIENCE,
  buildAuthSessionForUser,
} = require('../src/helpers/authSession');
const { founderLocalReadOnlyMiddleware } = require('../src/middleware/founderLocalReadOnly');
const businessOsRouter = require('../src/routes/businessOs');
const {
  readCandidateBinding,
} = require('../../evidence/internal-live-operation-v1/runtime-safety/candidate-binding');

const ALLOWED_STATUSES = new Set([
  'LIVE',
  'LIVE WITH DATA GAPS',
  'UNDER RECONCILIATION',
  'NOT CONNECTED',
  'BLOCKED',
  'SANDBOX',
  'FOUNDER DECISION REQUIRED',
]);
const ALLOWED_FRESHNESS_STATES = new Set(['FRESH', 'STALE', 'UNKNOWN', 'NOT_CONNECTED']);

function safeEvidenceCode(value, fallback = 'FOUNDER_COCKPIT_LIVE_READ_FAILED') {
  const candidate = String(value || '').trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(candidate) ? candidate : fallback;
}

async function discoverAcceptanceIdentity() {
  const requestedUserId = String(process.env.FOUNDER_COCKPIT_ACCEPTANCE_USER_ID || '').trim();
  const requestedEcosystemId = String(process.env.FOUNDER_COCKPIT_ACCEPTANCE_ECOSYSTEM_ID || '').trim();
  const { data: companyRows, error: companiesError } = await supabase
    .from('companies')
    .select('id, tenant_id, is_active')
    .not('tenant_id', 'is', null)
    .or('is_active.eq.true,is_active.is.null');
  if (companiesError) throw companiesError;
  const companyCountByTenant = new Map();
  for (const company of companyRows || []) {
    const tenantId = String(company.tenant_id || '').trim();
    if (!tenantId || (requestedEcosystemId && tenantId !== requestedEcosystemId)) continue;
    companyCountByTenant.set(tenantId, (companyCountByTenant.get(tenantId) || 0) + 1);
  }
  const tenantIds = [...companyCountByTenant.keys()].sort((left, right) => (
    companyCountByTenant.get(right) - companyCountByTenant.get(left)
  ));
  assert.ok(tenantIds.length, 'Không tìm thấy hệ sinh thái có công ty đang hoạt động để kiểm tra.');

  let query = supabase
    .from('users')
    .select('id, email, full_name, role, company_id, tenant_id, is_active')
    .or('is_active.eq.true,is_active.is.null');
  if (requestedUserId) query = query.eq('id', requestedUserId);
  else query = query.eq('role', 'admin').limit(500);
  const { data: users, error } = await query;
  if (error) throw error;
  const candidates = users || [];
  const tenantRank = new Map(tenantIds.map((id, index) => [id, index]));
  const rankedCandidates = [...candidates].sort((left, right) => {
    const leftRank = tenantRank.get(String(left.tenant_id || '')) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = tenantRank.get(String(right.tenant_id || '')) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Number(Boolean(left.company_id)) - Number(Boolean(right.company_id));
  });
  const user = requestedUserId
    ? rankedCandidates[0]
    : rankedCandidates.find((item) => tenantRank.has(String(item.tenant_id || '')) && !item.company_id)
      || rankedCandidates.find((item) => tenantRank.has(String(item.tenant_id || '')));
  assert.ok(user, 'Không tìm thấy tài khoản admin nội bộ đủ điều kiện cho acceptance smoke.');
  assert.equal(String(user.role || '').trim().toLowerCase(), 'admin', 'Danh tính acceptance phải là admin đang hoạt động.');
  const verifiedTenantId = String(user.tenant_id || '').trim();
  assert.ok(verifiedTenantId && tenantRank.has(verifiedTenantId), 'Danh tính acceptance phải thuộc hệ sinh thái đang hoạt động.');

  if (requestedEcosystemId) {
    assert.equal(requestedEcosystemId, verifiedTenantId, 'Hệ sinh thái yêu cầu không khớp danh tính acceptance.');
  }
  if (user.company_id) {
    assert.ok((companyRows || []).some((company) => (
      String(company.id) === String(user.company_id)
      && String(company.tenant_id) === verifiedTenantId
      && company.is_active !== false
    )), 'Công ty của danh tính acceptance không thuộc hệ sinh thái đang hoạt động.');
  }
  const ecosystemId = verifiedTenantId;
  return { user, ecosystemId, tenantIds, companyRows };
}

async function run() {
  const candidate = readCandidateBinding();
  const { user, ecosystemId, tenantIds, companyRows } = await discoverAcceptanceIdentity();
  const session = await buildAuthSessionForUser(user, {
    expiresInSeconds: 10 * 60,
    audience: FOUNDER_LOCAL_JWT_AUDIENCE,
  });
  const app = express();
  app.use(founderLocalReadOnlyMiddleware);
  app.use('/api/business-os', businessOsRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const url = new URL('/api/business-os', baseUrl);
    url.searchParams.set('ecosystem_id', ecosystemId);
    url.searchParams.set('company_id', user.company_id || 'all');
    url.searchParams.set('period', 'week');
    url.searchParams.set('period_anchor', new Date().toISOString().slice(0, 10));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify({
      code: safeEvidenceCode(payload.code, 'FOUNDER_COCKPIT_HTTP_STATUS_UNEXPECTED'),
    }));
    assert.equal(payload.contract_version, 'founder_cockpit_v1');
    assert.equal(payload.mode, 'live_read_only');
    assert.equal(payload.systems.length, 6);
    assert.equal(payload.modules.length, 15);
    assert.equal(payload.platform_capabilities.length, 19);
    assert.equal(new Set(payload.platform_capabilities.map((item) => item.key)).size, 19);
    assert.ok(payload.platform_capabilities.every((item) => (
      ALLOWED_STATUSES.has(item.status)
      && item.canonical === false
      && item.automatic_operational_effect === false
    )));
    assert.equal(payload.signal_hub.contract_version, 'founder_signal_hub_v1');
    assert.equal(payload.signal_hub.canonical, false);
    assert.ok(payload.signal_hub.contracts.every((signal) => (
      signal.write_capability === 'DISABLED'
      && signal.company_scope.every((id) => payload.scope.company_ids.includes(id))
    )));
    assert.equal(payload.correction_center.rule_change_request.enabled, false);
    assert.ok(payload.modules.every((item) => ALLOWED_STATUSES.has(item.activation_status)));
    assert.ok(payload.modules.every((item) => (
      ALLOWED_FRESHNESS_STATES.has(item.freshness?.state)
      && Number.isFinite(Number(item.freshness?.slo_minutes))
      && Number(item.freshness.slo_minutes) > 0
    )));
    assert.ok(payload.signal_hub.contracts.every((signal) => (
      ALLOWED_FRESHNESS_STATES.has(signal.freshness?.state)
      && Number.isFinite(Number(signal.freshness?.slo_minutes))
      && Number(signal.freshness.slo_minutes) > 0
    )));
    assert.equal(payload.protections.write_enabled, false);
    assert.equal(payload.protections.direct_database_write_enabled, false);
    assert.equal(payload.protections.synthetic_fallback_enabled, false);
    assert.equal(payload.protections.external_send_enabled, false);
    assert.ok((payload.scope.company_ids || []).every((id) => (
      payload.scope.companies || []
    ).some((company) => String(company.id) === String(id))));

    let negativeScopeChecks = 0;
    const scopedCompanyIds = (companyRows || [])
      .filter((company) => String(company.tenant_id) === ecosystemId)
      .map((company) => String(company.id));
    if (scopedCompanyIds.length > 1) {
      const { data: scopedUsers, error: scopedUsersError } = await supabase
        .from('users')
        .select('id, email, full_name, role, company_id, tenant_id, department_id, is_active')
        .in('company_id', scopedCompanyIds)
        .or('is_active.eq.true,is_active.is.null')
        .limit(500);
      if (scopedUsersError) throw scopedUsersError;
      const scopedUser = (scopedUsers || []).find((item) => (
        String(item.role || '').trim().toLowerCase() === 'admin'
        && item.company_id
        && scopedCompanyIds.some((id) => id !== String(item.company_id))
      ));
      if (scopedUser) {
        const deniedCompanyId = scopedCompanyIds.find((id) => id !== String(scopedUser.company_id));
        const scopedSession = await buildAuthSessionForUser(scopedUser, {
          expiresInSeconds: 10 * 60,
          audience: FOUNDER_LOCAL_JWT_AUDIENCE,
        });
        const deniedUrl = new URL('/api/business-os', baseUrl);
        deniedUrl.searchParams.set('ecosystem_id', ecosystemId);
        deniedUrl.searchParams.set('company_id', deniedCompanyId);
        deniedUrl.searchParams.set('period', 'week');
        deniedUrl.searchParams.set('period_anchor', new Date().toISOString().slice(0, 10));
        const deniedResponse = await fetch(deniedUrl, {
          headers: { Authorization: `Bearer ${scopedSession.token}` },
        });
        const deniedPayload = await deniedResponse.json();
        assert.equal(deniedResponse.status, 403);
        assert.equal(deniedPayload.code, 'BUSINESS_OS_COMPANY_DENIED');
        assert.equal(Array.isArray(deniedPayload.systems), false, 'Phản hồi từ chối không được chứa dữ liệu hệ thống.');
        negativeScopeChecks += 1;
      }
    }

    const outsideEcosystemId = tenantIds.find((id) => id !== ecosystemId);
    if (user.tenant_id && outsideEcosystemId) {
      const deniedUrl = new URL('/api/business-os', baseUrl);
      deniedUrl.searchParams.set('ecosystem_id', outsideEcosystemId);
      deniedUrl.searchParams.set('company_id', 'all');
      deniedUrl.searchParams.set('period', 'week');
      deniedUrl.searchParams.set('period_anchor', new Date().toISOString().slice(0, 10));
      const deniedResponse = await fetch(deniedUrl, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const deniedPayload = await deniedResponse.json();
      assert.equal(deniedResponse.status, 403);
      assert.equal(deniedPayload.code, 'BUSINESS_OS_ECOSYSTEM_DENIED');
      assert.equal(Array.isArray(deniedPayload.modules), false, 'Phản hồi từ chối không được chứa dữ liệu module.');
      negativeScopeChecks += 1;
    }
    assert.ok(negativeScopeChecks > 0, 'Không tìm được danh tính thật để chạy kiểm tra từ chối chéo phạm vi.');

    const statusCounts = payload.modules.reduce((acc, item) => {
      acc[item.activation_status] = (acc[item.activation_status] || 0) + 1;
      return acc;
    }, {});
    const evidence = {
      schema_version: '1.0.0',
      evidence_type: 'FOUNDER_COCKPIT_REAL_DATA_LIVE_READ',
      result: 'PASS',
      candidate,
      ok: true,
      contract_version: payload.contract_version,
      mode: payload.mode,
      scope_level: payload.scope.level,
      company_count: payload.scope.company_ids.length,
      system_count: payload.systems.length,
      module_count: payload.modules.length,
      platform_capability_count: payload.platform_capabilities.length,
      signal_contract_count: payload.signal_hub.contracts.length,
      module_status_counts: statusCounts,
      module_activation: payload.modules.map((item) => ({
        key: item.key,
        status: item.activation_status,
        freshness_state: item.freshness?.state || 'UNKNOWN',
        freshness_slo_minutes: item.freshness?.slo_minutes ?? null,
        observed_at: item.freshness?.observed_at || null,
        source_updated_at: item.freshness?.source_updated_at || null,
        gap_count: Array.isArray(item.data_gaps) ? item.data_gaps.length : null,
      })),
      signal_freshness: payload.signal_hub.contracts.map((signal) => ({
        signal_id: signal.signal_id,
        freshness_state: signal.freshness?.state || 'UNKNOWN',
        freshness_slo_minutes: signal.freshness?.slo_minutes ?? null,
      })),
      manufacturing_view_count: payload.manufacturing_companies.length,
      manufacturing_activation: payload.manufacturing_companies.map((item, index) => ({
        view: index + 1,
        status: item.status,
        freshness_state: item.freshness?.state || 'UNKNOWN',
        freshness_slo_minutes: item.freshness?.slo_minutes ?? null,
        observed_at: item.freshness?.observed_at || null,
        gap_count: Array.isArray(item.data_gaps) ? item.data_gaps.length : null,
      })),
      planning_statuses: payload.planning.horizons.map((item) => ({
        period: item.key,
        status: item.status,
        freshness_state: item.freshness?.state || 'UNKNOWN',
        freshness_slo_minutes: item.freshness?.slo_minutes ?? null,
        observed_at: item.freshness?.observed_at || null,
        gap_count: Array.isArray(item.data_gaps) ? item.data_gaps.length : null,
      })),
      configuration_gap_count: Array.isArray(payload.configuration_center.data_gaps)
        ? payload.configuration_center.data_gaps.length
        : null,
      negative_scope_checks: negativeScopeChecks,
      generated_at: payload.generated_at,
      writes_enabled: payload.protections.write_enabled,
      security: {
        raw_business_values_recorded: false,
        identities_recorded: false,
        credentials_recorded: false,
        synthetic_fallback_enabled: false,
      },
    };
    writeEvidenceAtomic(evidence);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(JSON.stringify({
      result: 'FAIL',
      code: safeEvidenceCode(error?.code || error?.name),
    }));
    process.exit(1);
  });
