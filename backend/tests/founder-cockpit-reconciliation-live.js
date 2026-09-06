/**
 * Sanitized, read-only source reconciliation for Founder Cockpit V1.
 *
 * This process mounts only the Business OS router, reads the approved source
 * services a second time, and compares their results with the live Cockpit
 * contract. It never prints business values, identities, or credentials.
 */
const fs = require('node:fs');
const path = require('node:path');

const WRITE_EVIDENCE = process.env.BUSINESS_OS_WRITE_EVIDENCE === '1';
const EVIDENCE_PATH = path.resolve(
  __dirname,
  '../../evidence/internal-live-operation-v1/runtime-safety/runtime/real-data-reconciliation.json',
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
process.env.FOUNDER_LOCAL_READ_ONLY = '1';
process.env.FOUNDER_ADVISORY_CONFIG_ENABLED = '0';
process.env.BACKGROUND_WRITE_JOBS_ENABLED = '0';
process.env.REDIS_DISABLED = '1';
process.env.PG_POOL_DISABLED = '1';
process.env.SUPABASE_FAILOVER_ENABLED = '0';
process.env.SUPABASE_AUTO_FAILOVER = '0';
process.env.SUPABASE_AUTO_FAILBACK = '0';
process.env.NODE_ENV = 'production';

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

const { createHash } = require('node:crypto');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const {
  FOUNDER_LOCAL_JWT_AUDIENCE,
  buildAuthSessionForUser,
} = require('../src/helpers/authSession');
const { founderLocalReadOnlyMiddleware } = require('../src/middleware/founderLocalReadOnly');
const {
  buildPeriodRange,
  defaultReaders,
} = require('../src/helpers/founderCockpitReadModel');
const businessOsRouter = require('../src/routes/businessOs');
const {
  readCandidateBinding,
} = require('../../evidence/internal-live-operation-v1/runtime-safety/candidate-binding');

const DONE_PROJECT_STATUSES = new Set(['completed', 'done', 'cancelled']);
const DONE_PROCUREMENT_STATUSES = new Set(['done', 'qc_pass', 'received']);
const checks = [];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function compare(signalId, actual, expected) {
  if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) {
    const differingFields = actual && expected && typeof actual === 'object' && typeof expected === 'object'
      ? [...new Set([...Object.keys(actual), ...Object.keys(expected)])]
        .filter((key) => JSON.stringify(stable(actual[key])) !== JSON.stringify(stable(expected[key])))
      : [];
    fail(`RECONCILIATION_MISMATCH:${signalId}${differingFields.length ? `:${differingFields.join(',')}` : ''}`);
  }
  checks.push({ signal_id: signalId, state: 'MATCH' });
}

function assertCheck(checkId, condition) {
  if (!condition) fail(`CHECK_FAILED:${checkId}`);
  checks.push({ signal_id: checkId, state: 'MATCH' });
}

function sumField(rows, field) {
  return (rows || []).reduce((total, row) => total + (Number(row?.[field]) || 0), 0);
}

function aggregateEntries(entries, fields) {
  return Object.fromEntries(fields.map((field) => [field, sumField(entries, field)]));
}

function mergeWork(entries) {
  const byModule = {};
  const byStatus = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.by_module || {})) {
      byModule[key] = (byModule[key] || 0) + (Number(value) || 0);
    }
    for (const [key, value] of Object.entries(entry.by_status || {})) {
      byStatus[key] = (byStatus[key] || 0) + (Number(value) || 0);
    }
  }
  return {
    total: sumField(entries, 'total'),
    open: sumField(entries, 'open'),
    overdue: sumField(entries, 'overdue'),
    done: sumField(entries, 'done'),
    by_module: byModule,
    by_status: byStatus,
  };
}

function projectMetrics(rows, range, now) {
  const active = rows.filter((row) => !DONE_PROJECT_STATUSES.has(String(row.status || '').trim().toLowerCase()));
  const deadlineOf = (row) => row.production_deadline || row.deadline || null;
  const inRange = (value) => value
    && String(value).slice(0, 10) >= range.start_at
    && String(value).slice(0, 10) <= range.end_at;
  return {
    total_projects: rows.length,
    active_projects: active.length,
    projects_due: active.filter((row) => inRange(deadlineOf(row))).length,
    overdue_projects: active.filter((row) => {
      const deadline = deadlineOf(row);
      return deadline && new Date(deadline).getTime() < now.getTime();
    }).length,
    production_projects: active.filter((row) => row.sx_kanban_column_id
      || String(row.status || '').trim().toLowerCase() === 'producing').length,
    logistics_projects: active.filter((row) => row.vc_kanban_column_id
      || ['shipping', 'installing'].includes(String(row.status || '').trim().toLowerCase())).length,
  };
}

function procurementMetrics(rows) {
  const done = rows.filter((row) => DONE_PROCUREMENT_STATUSES.has(String(row.status || '').trim().toLowerCase())).length;
  return {
    total_requests: rows.length,
    open_requests: rows.length - done,
    done_requests: done,
    delayed_requests: rows.filter((row) => String(row.status || '').trim().toLowerCase() === 'delayed').length,
    qc_failed_requests: rows.filter((row) => {
      const status = String(row.status || '').trim().toLowerCase();
      const qcStatus = String(row.qc_status || '').trim().toLowerCase();
      return qcStatus === 'fail' || status === 'qc_fail';
    }).length,
  };
}

function approvalMetrics(rows) {
  return {
    total_approvals: rows.length,
    pending_approvals: rows.filter((row) => String(row.status || '').trim().toLowerCase() === 'pending').length,
  };
}

function uniqueIds(source, rows) {
  const ids = (rows || []).map((row) => String(row.id || '')).filter(Boolean);
  assertCheck(`${source}.duplicate_behavior`, new Set(ids).size === ids.length);
}

function fingerprint(source, value) {
  return `${source}:sha256:${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

async function discoverAcceptanceIdentity() {
  const requestedUserId = String(process.env.FOUNDER_COCKPIT_ACCEPTANCE_USER_ID || '').trim();
  const requestedEcosystemId = String(process.env.FOUNDER_COCKPIT_ACCEPTANCE_ECOSYSTEM_ID || '').trim();
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, tenant_id, is_active')
    .not('tenant_id', 'is', null)
    .or('is_active.eq.true,is_active.is.null');
  if (companiesError) throw companiesError;

  const companyCountByTenant = new Map();
  for (const company of companies || []) {
    const tenantId = String(company.tenant_id || '').trim();
    if (!tenantId || (requestedEcosystemId && tenantId !== requestedEcosystemId)) continue;
    companyCountByTenant.set(tenantId, (companyCountByTenant.get(tenantId) || 0) + 1);
  }
  const tenantIds = [...companyCountByTenant.keys()].sort((left, right) => (
    companyCountByTenant.get(right) - companyCountByTenant.get(left)
  ));
  if (!tenantIds.length) fail('ACCEPTANCE_SCOPE_NOT_FOUND');

  let query = supabase
    .from('users')
    .select('id, email, full_name, role, company_id, tenant_id, is_active')
    .or('is_active.eq.true,is_active.is.null');
  if (requestedUserId) query = query.eq('id', requestedUserId);
  else query = query.eq('role', 'admin').limit(500);
  const { data: users, error: usersError } = await query;
  if (usersError) throw usersError;
  const tenantRank = new Map(tenantIds.map((id, index) => [id, index]));
  const ranked = [...(users || [])].sort((left, right) => (
    (tenantRank.get(String(left.tenant_id || '')) ?? Number.MAX_SAFE_INTEGER)
    - (tenantRank.get(String(right.tenant_id || '')) ?? Number.MAX_SAFE_INTEGER)
  ));
  const user = requestedUserId
    ? ranked[0]
    : ranked.find((item) => tenantRank.has(String(item.tenant_id || '')) && !item.company_id)
      || ranked.find((item) => tenantRank.has(String(item.tenant_id || '')));
  if (!user || String(user.role || '').trim().toLowerCase() !== 'admin') fail('ACCEPTANCE_ADMIN_NOT_FOUND');
  const verifiedTenantId = String(user.tenant_id || '').trim();
  if (!verifiedTenantId || !tenantRank.has(verifiedTenantId)) fail('ACCEPTANCE_TENANT_NOT_VERIFIED');
  if (requestedEcosystemId && requestedEcosystemId !== verifiedTenantId) {
    fail('ACCEPTANCE_ECOSYSTEM_IDENTITY_MISMATCH');
  }
  if (user.company_id && !(companies || []).some((company) => (
    String(company.id) === String(user.company_id)
    && String(company.tenant_id) === verifiedTenantId
    && company.is_active !== false
  ))) {
    fail('ACCEPTANCE_COMPANY_NOT_VERIFIED');
  }
  return {
    user,
    ecosystemId: verifiedTenantId,
  };
}

async function fetchCockpit(user, ecosystemId, periodAnchor) {
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
    const url = new URL('/api/business-os', `http://127.0.0.1:${server.address().port}`);
    url.searchParams.set('ecosystem_id', ecosystemId);
    url.searchParams.set('company_id', user.company_id || 'all');
    url.searchParams.set('period', 'week');
    url.searchParams.set('period_anchor', periodAnchor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } });
    const payload = await response.json();
    if (response.status !== 200) fail(`COCKPIT_HTTP_${response.status}:${payload.code || 'UNKNOWN'}`);
    return payload;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run(comparisonAttempt = 1) {
  checks.length = 0;
  const candidate = readCandidateBinding();
  const { user, ecosystemId } = await discoverAcceptanceIdentity();
  const periodAnchor = new Date().toISOString().slice(0, 10);
  const payload = await fetchCockpit(user, ecosystemId, periodAnchor);
  const now = new Date(payload.generated_at);
  const companyIds = payload.scope.company_ids.map(String);
  const allowedCompanies = new Set(companyIds);
  const ranges = Object.fromEntries(['week', 'month', 'quarter'].map((key) => [
    key,
    buildPeriodRange(key, periodAnchor, now),
  ]));

  const [crmEntries, accountingEntries, projects, people, procurement, workloadEntriesByPeriod] = await Promise.all([
    Promise.all(companyIds.map((companyId) => defaultReaders.crm({ user, companyId, range: ranges.week, now }))),
    Promise.all(companyIds.map((companyId) => defaultReaders.accounting({ user, companyId, range: ranges.week, now }))),
    defaultReaders.projects({ user, companyIds, range: ranges.week, now }),
    defaultReaders.people({ user, companyIds, now }),
    defaultReaders.procurement({ user, companyIds, range: ranges.week, now }),
    Promise.all(['week', 'month', 'quarter'].map(async (key) => [
      key,
      await Promise.all(companyIds.map((companyId) => defaultReaders.workload({
        user, companyId, range: ranges[key], now,
      }))),
    ])).then(Object.fromEntries),
  ]);
  const projectIds = projects.map((row) => row.id).filter(Boolean).map(String);
  const approvals = await defaultReaders.approvals({ user, projectIds, companyIds, now });

  assertCheck('scope.company_rows', projects.every((row) => (
    allowedCompanies.has(String(row.company_id || ''))
      || allowedCompanies.has(String(row.logistics_company_id || ''))
  )));
  assertCheck('scope.people_rows', people.every((row) => allowedCompanies.has(String(row.company_id || ''))));
  assertCheck('scope.procurement_rows', procurement.every((row) => allowedCompanies.has(String(row.company_id || ''))));
  assertCheck('scope.approval_rows', approvals.every((row) => projectIds.includes(String(row.project_id || ''))));
  uniqueIds('projects', projects);
  uniqueIds('people', people);
  uniqueIds('procurement', procurement);
  uniqueIds('approvals', approvals);

  const crm = aggregateEntries(crmEntries.map((entry) => entry.summary || {}), [
    'lead_count', 'deal_count', 'customer_order_count', 'closed_won_count',
    'closed_won_value', 'pipeline_value', 'overdue_count', 'kpi_ledger_net',
  ]);
  const accounting = aggregateEntries(accountingEntries, [
    'total_deals', 'total_estimated_value', 'total_production_value',
    'total_invoiced_value', 'total_outstanding_value', 'count_not_invoiced',
    'count_sx_done_not_invoiced',
  ]);
  const projectSummary = projectMetrics(projects, ranges.week, now);
  const procurementSummary = procurementMetrics(procurement);
  const approvalSummary = approvalMetrics(approvals);
  const workloadByPeriod = Object.fromEntries(Object.entries(workloadEntriesByPeriod).map(([key, entries]) => [
    key,
    mergeWork(entries),
  ]));
  const module = (key) => payload.modules.find((item) => item.key === key);

  assertCheck('platform_capabilities.complete', Array.isArray(payload.platform_capabilities)
    && payload.platform_capabilities.length === 19
    && new Set(payload.platform_capabilities.map((item) => item.key)).size === 19);
  assertCheck('platform_capabilities.runtime_disabled', payload.platform_capabilities
    .find((item) => item.key === 'executive_domain_ai_interfaces')?.status === 'SANDBOX');
  assertCheck('signal_hub.contract', payload.signal_hub?.contract_version === 'founder_signal_hub_v1'
    && payload.signal_hub?.canonical === false
    && Array.isArray(payload.signal_hub?.contracts)
    && payload.signal_hub.contracts.every((signal) => (
      signal.write_capability === 'DISABLED'
      && signal.canonical_status === 'NON_CANONICAL MANAGEMENT VIEW'
      && signal.company_scope.every((companyId) => allowedCompanies.has(String(companyId)))
    )));
  assertCheck('correction_center.protected', payload.correction_center?.contract_version === 'founder_correction_evolution_v1'
    && payload.correction_center?.rule_change_request?.enabled === false
    && payload.correction_center.items.every((item) => item.protected_write_enabled === false));

  compare('crm.summary', module('crm').metrics, crm);
  compare('sales.summary', module('sales').metrics, crm);
  compare('lead_deal.summary', module('lead_deal').metrics, crm);
  compare('work_unified.summary', module('work_unified').metrics, workloadByPeriod.week);
  compare('project.summary', module('projects').metrics, projectSummary);
  compare('procurement.summary', module('procurement_purchasing').metrics, procurementSummary);
  compare('accounting.summary', module('accounting').metrics, accounting);
  compare('commercial_documents.summary', module('commercial_documents').metrics, accounting);
  compare('approval.summary', module('approvals').metrics, approvalSummary);
  compare('people_kpi.active_people', module('people_kpi').metrics.active_people, people.length);
  compare('planning.week', payload.planning.horizons.find((item) => item.key === 'week').metrics, workloadByPeriod.week);
  compare('planning.month', payload.planning.horizons.find((item) => item.key === 'month').metrics, workloadByPeriod.month);
  compare('planning.quarter', payload.planning.horizons.find((item) => item.key === 'quarter').metrics, workloadByPeriod.quarter);
  compare('production.summary', module('production').metrics, {
    active_projects: projectSummary.active_projects,
    production_projects: projectSummary.production_projects,
    overdue_projects: projectSummary.overdue_projects,
  });
  compare('logistics.summary', module('logistics').metrics, {
    active_projects: projectSummary.active_projects,
    logistics_projects: projectSummary.logistics_projects,
    overdue_projects: projectSummary.overdue_projects,
  });

  for (const view of payload.manufacturing_companies) {
    const companyId = String(view.company.id);
    const companyProjects = projectMetrics(
      projects.filter((row) => String(row.company_id || '') === companyId),
      ranges.week,
      now,
    );
    const companyPeople = people.filter((row) => String(row.company_id || '') === companyId).length;
    const index = companyIds.indexOf(companyId);
    const companyWork = workloadEntriesByPeriod.week[index];
    compare(`manufacturing.${fingerprint('company', companyId)}`, view.capacity, {
      active_projects: companyProjects.active_projects,
      production_projects: companyProjects.production_projects,
      overdue_projects: companyProjects.overdue_projects,
      open_work: companyWork?.open ?? null,
      active_people: companyPeople,
      load_per_active_person: companyPeople > 0 && companyWork?.open != null
        ? Number((companyWork.open / companyPeople).toFixed(2))
        : null,
      capacity_target: null,
      capacity_gap: null,
      target_contract: null,
    });
  }

  assertCheck('freshness.generated_at', Number.isFinite(now.getTime()) && Date.now() - now.getTime() < 2 * 60 * 1000);
  assertCheck('freshness.modules', payload.modules.every((item) => Number.isFinite(Date.parse(item.freshness?.as_of || ''))));
  assertCheck('synthetic_fallback.disabled', payload.protections.synthetic_fallback_enabled === false);
  assertCheck('controlled_write.disabled', payload.protections.write_enabled === false && payload.protections.actions.length === 0);
  assertCheck('warranty.non_blocking_not_connected', module('warranty_care').activation_status === 'NOT CONNECTED');
  assertCheck('capacity.no_canonical_target_invention', payload.capacity.capacity_target === null);

  const representativeFingerprints = [];
  for (const [source, table, rows] of [
    ['projects', 'projects', projects],
    ['procurement', 'purchase_requests', procurement],
    ['approvals', 'project_approvals', approvals],
  ]) {
    const id = rows[0]?.id;
    if (!id) continue;
    const { data, error } = await supabase.from(table).select('id').eq('id', id).limit(1);
    if (error || !data?.length) fail(`REPRESENTATIVE_SOURCE_MISSING:${source}`);
    representativeFingerprints.push(fingerprint(source, id));
  }
  assertCheck('representative_record_identity', representativeFingerprints.length > 0);

  const evidence = {
    schema_version: '1.0.0',
    evidence_type: 'FOUNDER_COCKPIT_REAL_DATA_RECONCILIATION',
    generated_at: new Date().toISOString(),
    candidate,
    runtime_profile: 'FOUNDER_LOCAL_READ_ONLY',
    result: 'PASS',
    contract_version: payload.contract_version,
    mode: payload.mode,
    source_method: 'approved application services and read models; second read comparison',
    comparison_attempts: comparisonAttempt,
    live_churn_retry_applied: comparisonAttempt > 1,
    checks,
    representative_source_fingerprints: representativeFingerprints,
    security: {
      raw_business_values_recorded: false,
      identities_recorded: false,
      credentials_recorded: false,
      synthetic_fallback_enabled: false,
      controlled_write_enabled: false,
    },
  };

  writeEvidenceAtomic(evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

async function runWithBoundedLiveChurnRetry() {
  const maximumAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      const mismatch = String(error?.code || '').startsWith('RECONCILIATION_MISMATCH:');
      if (!mismatch || attempt === maximumAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

runWithBoundedLiveChurnRetry().then(() => process.exit(0)).catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    code: String(error?.code || error?.message || 'RECONCILIATION_FAILED').slice(0, 180),
  }));
  process.exit(1);
});
