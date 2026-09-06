/**
 * Read-only acceptance smoke for Founder Cockpit against the configured
 * enterprise data source. The script never prints identities or credentials.
 *
 * Run from backend/ with the normal internal environment loaded:
 *   node tests/founder-cockpit-live-read.js
 */
process.env.REDIS_DISABLED = '1';
process.env.PG_POOL_DISABLED = '1';
process.env.SUPABASE_FAILOVER_ENABLED = '0';
process.env.SUPABASE_AUTO_FAILOVER = '0';
process.env.SUPABASE_AUTO_FAILBACK = '0';
process.env.NODE_ENV = 'production';

const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');
const businessOsRouter = require('../src/routes/businessOs');

const ALLOWED_STATUSES = new Set([
  'LIVE',
  'LIVE WITH DATA GAPS',
  'UNDER RECONCILIATION',
  'NOT CONNECTED',
  'BLOCKED',
  'FOUNDER DECISION REQUIRED',
]);

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
      || rankedCandidates.find((item) => tenantRank.has(String(item.tenant_id || '')))
      || rankedCandidates.find((item) => !item.tenant_id && !item.company_id);
  assert.ok(user, 'Không tìm thấy tài khoản admin nội bộ đủ điều kiện cho acceptance smoke.');

  const ecosystemId = requestedEcosystemId
    || (tenantRank.has(String(user.tenant_id || '')) ? String(user.tenant_id) : tenantIds[0]);
  assert.ok(ecosystemId, 'Không tìm thấy ecosystem_id thật để kiểm tra.');
  return { user, ecosystemId, tenantIds, companyRows };
}

async function run() {
  const { user, ecosystemId, tenantIds, companyRows } = await discoverAcceptanceIdentity();
  const session = await buildAuthSessionForUser(user);
  const app = express();
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
    assert.equal(response.status, 200, JSON.stringify({ code: payload.code, error: payload.error }));
    assert.equal(payload.contract_version, 'founder_cockpit_v1');
    assert.equal(payload.mode, 'live_read_only');
    assert.equal(payload.systems.length, 6);
    assert.equal(payload.modules.length, 15);
    assert.ok(payload.modules.every((item) => ALLOWED_STATUSES.has(item.activation_status)));
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
        const scopedSession = await buildAuthSessionForUser(scopedUser);
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
    console.log(JSON.stringify({
      ok: true,
      contract_version: payload.contract_version,
      mode: payload.mode,
      scope_level: payload.scope.level,
      company_count: payload.scope.company_ids.length,
      system_count: payload.systems.length,
      module_count: payload.modules.length,
      module_status_counts: statusCounts,
      module_activation: payload.modules.map((item) => ({
        key: item.key,
        status: item.activation_status,
        as_of: item.freshness?.as_of || null,
        gap_count: Array.isArray(item.data_gaps) ? item.data_gaps.length : null,
      })),
      manufacturing_view_count: payload.manufacturing_companies.length,
      manufacturing_activation: payload.manufacturing_companies.map((item, index) => ({
        view: index + 1,
        status: item.status,
        as_of: item.freshness?.as_of || null,
        gap_count: Array.isArray(item.data_gaps) ? item.data_gaps.length : null,
      })),
      planning_statuses: payload.planning.horizons.map((item) => ({
        period: item.key,
        status: item.status,
        as_of: payload.workload.freshness?.as_of || null,
        gap_count: Array.isArray(item.data_gaps) ? item.data_gaps.length : null,
      })),
      configuration_gap_count: Array.isArray(payload.configuration_center.data_gaps)
        ? payload.configuration_center.data_gaps.length
        : null,
      negative_scope_checks: negativeScopeChecks,
      generated_at: payload.generated_at,
      writes_enabled: payload.protections.write_enabled,
    }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
