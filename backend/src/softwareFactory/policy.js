const path = require('node:path');
const { POLICY_ACTIONS } = require('./constants');
const { factoryError } = require('./errors');
const { isAuthenticatedAgentIdentity } = require('./identityBoundary');

const PROTECTED_MANUFACTURING_BASELINE_PATHS = Object.freeze([
  'database/587_manufacturing_backward_schedule.sql',
  'database/588_manufacturing_schedule_profile_audit.sql',
  'backend/src/helpers/manufacturingSchedule.js',
  'backend/src/routes/manufacturingScheduling.js',
  'backend/src/domains/production/rules/manufacturingScheduleRules.js',
  'backend/tests/business-os-manufacturing-schedule.test.js',
  'backend/tests/business-os-manufacturing-schedule-staging.js',
  'docs/adr/0019-manufacturing-backward-scheduling.md',
  'docs/baseline/BUSINESS_OS_UAT_MANUFACTURING_SCHEDULE_13.md',
]);

const ACTION_CAPABILITY = Object.freeze({
  [POLICY_ACTIONS.MODIFY_CODE]: 'can_modify_code',
  [POLICY_ACTIONS.MODIFY_TEST_CODE]: 'can_modify_test_code',
  [POLICY_ACTIONS.MODIFY_SCHEMA]: 'can_modify_schema',
  [POLICY_ACTIONS.RUN_TESTS]: 'can_run_tests',
  [POLICY_ACTIONS.CREATE_MIGRATION]: 'can_create_migration',
  [POLICY_ACTIONS.COMMIT]: 'can_commit',
  [POLICY_ACTIONS.TAG]: 'can_tag',
  [POLICY_ACTIONS.DEPLOY_STAGING]: 'can_deploy_staging',
  [POLICY_ACTIONS.DEPLOY_PRODUCTION]: 'can_deploy_production',
});

const TOOL_ACTIONS = Object.freeze({
  'repository.read': POLICY_ACTIONS.READ_REPOSITORY,
  'artifact.read': POLICY_ACTIONS.READ_REPOSITORY,
  'audit.read': POLICY_ACTIONS.READ_REPOSITORY,
  'diff.read': POLICY_ACTIONS.READ_REPOSITORY,
  'diff.review': POLICY_ACTIONS.READ_REPOSITORY,
  'evidence.read': POLICY_ACTIONS.READ_REPOSITORY,
  'schema.analyze': POLICY_ACTIONS.READ_REPOSITORY,
  'source.write': POLICY_ACTIONS.MODIFY_CODE,
  'test.write': POLICY_ACTIONS.MODIFY_TEST_CODE,
  'test.execute': POLICY_ACTIONS.RUN_TESTS,
  'frontend.build': POLICY_ACTIONS.RUN_TESTS,
  'migration.create': POLICY_ACTIONS.CREATE_MIGRATION,
  'git.commit.propose': POLICY_ACTIONS.COMMIT,
  'git.tag.propose': POLICY_ACTIONS.TAG,
  'deploy.staging': POLICY_ACTIONS.DEPLOY_STAGING,
  'deploy.production': POLICY_ACTIONS.DEPLOY_PRODUCTION,
  'database.staging.migrate': POLICY_ACTIONS.RUN_STAGING_MIGRATION,
  'database.production.migrate': POLICY_ACTIONS.RUN_PRODUCTION_MIGRATION,
  'database.staging.write': POLICY_ACTIONS.WRITE_STAGING_BUSINESS_DATA,
  'database.production.write': POLICY_ACTIONS.WRITE_PRODUCTION_BUSINESS_DATA,
  'database.write': POLICY_ACTIONS.DATABASE_WRITE,
  'database.destructive': POLICY_ACTIONS.DESTRUCTIVE_DATABASE_OPERATION,
  'production.data.delete': POLICY_ACTIONS.DELETE_PRODUCTION_DATA,
  'tenant.isolation.disable': POLICY_ACTIONS.DISABLE_TENANT_ISOLATION,
  'migration.history.rewrite': POLICY_ACTIONS.REWRITE_MIGRATION_HISTORY,
  'git.force_push': POLICY_ACTIONS.FORCE_PUSH,
  'baseline.protected.change': POLICY_ACTIONS.CHANGE_PROTECTED_BASELINE,
  'test.failing.remove': POLICY_ACTIONS.REMOVE_FAILING_TESTS,
  'quality_gate.weaken': POLICY_ACTIONS.WEAKEN_QUALITY_GATE,
  'agent.policy.modify': POLICY_ACTIONS.MODIFY_AGENT_POLICY,
  'quality_gate.bypass': POLICY_ACTIONS.BYPASS_QUALITY_GATE,
  'domain_rules.bypass': POLICY_ACTIONS.BYPASS_DOMAIN_RULES,
});

const PATH_REQUIRED_ACTIONS = new Set([
  POLICY_ACTIONS.MODIFY_CODE,
  POLICY_ACTIONS.MODIFY_TEST_CODE,
  POLICY_ACTIONS.MODIFY_SCHEMA,
  POLICY_ACTIONS.RUN_TESTS,
  POLICY_ACTIONS.CREATE_MIGRATION,
]);

const TEST_CODE_PATTERNS = Object.freeze(['backend/tests/**', 'frontend/tests/**']);

const ALWAYS_DENIED_ACTIONS = new Set([
  POLICY_ACTIONS.DEPLOY_PRODUCTION,
  POLICY_ACTIONS.RUN_STAGING_MIGRATION,
  POLICY_ACTIONS.RUN_PRODUCTION_MIGRATION,
  POLICY_ACTIONS.WRITE_STAGING_BUSINESS_DATA,
  POLICY_ACTIONS.WRITE_PRODUCTION_BUSINESS_DATA,
  POLICY_ACTIONS.DATABASE_WRITE,
  POLICY_ACTIONS.DESTRUCTIVE_DATABASE_OPERATION,
  POLICY_ACTIONS.DELETE_PRODUCTION_DATA,
  POLICY_ACTIONS.DISABLE_TENANT_ISOLATION,
  POLICY_ACTIONS.REWRITE_MIGRATION_HISTORY,
  POLICY_ACTIONS.FORCE_PUSH,
  POLICY_ACTIONS.CHANGE_PROTECTED_BASELINE,
  POLICY_ACTIONS.REMOVE_FAILING_TESTS,
  POLICY_ACTIONS.WEAKEN_QUALITY_GATE,
  POLICY_ACTIONS.MODIFY_AGENT_POLICY,
  POLICY_ACTIONS.BYPASS_QUALITY_GATE,
  POLICY_ACTIONS.BYPASS_DOMAIN_RULES,
]);

const DOMAIN_CONTEXT_PATTERN = /^[a-z][a-z0-9_-]*$/;

function normalizeRepoPath(input) {
  const raw = String(input || '').trim().replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:\//.test(raw)) {
    throw factoryError('INVALID_REPOSITORY_PATH', `Path phải là đường dẫn tương đối trong repo: ${input}`);
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw factoryError('INVALID_REPOSITORY_PATH', `Path vượt khỏi repo: ${input}`);
  }
  return normalized.replace(/^\.\//, '');
}

function expandPattern(pattern, context = {}) {
  return String(pattern).replaceAll('{domain}', String(context.domain || ''));
}

function pathMatches(pattern, repoPath, context = {}) {
  const expanded = expandPattern(pattern, context).replaceAll('\\', '/');
  if (expanded.includes('{}') || expanded.includes('//')) return false;
  if (expanded === '**') return true;
  if (expanded.endsWith('/**')) {
    const prefix = expanded.slice(0, -3);
    return repoPath === prefix || repoPath.startsWith(`${prefix}/`);
  }
  if (expanded.includes('*')) {
    const escaped = expanded.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*');
    return new RegExp(`^${escaped}$`).test(repoPath);
  }
  return repoPath === expanded;
}

function policyDecision(allowed, reasonCode, message, extra = {}) {
  return Object.freeze({ allowed, reason_code: reasonCode, message, ...extra });
}

function evaluateAgentAction(registry, request = {}) {
  const identity = request.identity;
  if (!isAuthenticatedAgentIdentity(identity)) {
    return policyDecision(false, 'AUTHENTICATED_AGENT_IDENTITY_REQUIRED', 'Policy chỉ nhận identity đã resolve qua trusted Identity Boundary.');
  }
  if (identity.identity_namespace !== 'software_factory') {
    return policyDecision(false, 'IDENTITY_NAMESPACE_DENIED', 'Business AI hoặc identity ngoài Software Factory không có quyền sửa phần mềm.');
  }

  let agent;
  try {
    agent = registry.get(identity.agent_id);
  } catch (error) {
    return policyDecision(false, error.code || 'AGENT_NOT_REGISTERED', error.message);
  }

  if (Object.prototype.hasOwnProperty.call(request, 'action')) {
    return policyDecision(false, 'CALLER_DECLARED_ACTION_DENIED', 'Caller không được tự khai action; policy phải suy ra action từ tool canonical.');
  }

  const tool = String(request.tool || '').trim();
  const action = TOOL_ACTIONS[tool];
  if (!tool || !action) {
    return policyDecision(false, 'TOOL_NOT_REGISTERED', 'Tool phải có trong canonical Tool → Action catalog.');
  }
  if (ALWAYS_DENIED_ACTIONS.has(action)) {
    return policyDecision(false, 'DANGEROUS_ACTION_DENIED', `Action ${action} bị deny theo policy SF-1.`, { action });
  }
  if (agent.prohibited_tools.includes(tool)) {
    return policyDecision(false, 'PROHIBITED_TOOL', `${agent.agent_id} bị cấm dùng tool ${tool}.`, { action });
  }
  if (!agent.allowed_tools.includes(tool)) {
    return policyDecision(false, 'TOOL_SCOPE_DENIED', `${tool} nằm ngoài allowed_tools của ${agent.agent_id}.`, { action });
  }

  if (action === POLICY_ACTIONS.READ_REPOSITORY) {
    return policyDecision(true, 'ALLOWED', 'Registry cho phép đọc repository.', { agent_id: agent.agent_id, action });
  }

  const capability = ACTION_CAPABILITY[action];
  if (!capability || agent[capability] !== true) {
    return policyDecision(false, 'CAPABILITY_DENIED', `${agent.agent_id} không có capability ${action}.`, { action });
  }

  if (agent.requires_domain_context && !request.context?.domain) {
    return policyDecision(false, 'DOMAIN_CONTEXT_REQUIRED', 'Backend Agent bắt buộc có Domain Context.');
  }
  if (agent.requires_domain_context && !DOMAIN_CONTEXT_PATTERN.test(String(request.context.domain))) {
    return policyDecision(false, 'DOMAIN_CONTEXT_INVALID', 'Domain Context không hợp lệ.');
  }

  if (PATH_REQUIRED_ACTIONS.has(action) && !request.path) {
    return policyDecision(false, 'PATH_REQUIRED', `Tool ${tool} bắt buộc có repository path canonical.`, { action });
  }
  if ([POLICY_ACTIONS.COMMIT, POLICY_ACTIONS.TAG].includes(action) && !request.target_digest) {
    return policyDecision(false, 'TARGET_DIGEST_REQUIRED', `${tool} phải gắn release target digest.`, { action });
  }

  if (request.path) {
    let repoPath;
    try {
      repoPath = normalizeRepoPath(request.path);
    } catch (error) {
      return policyDecision(false, error.code, error.message);
    }

    if (PROTECTED_MANUFACTURING_BASELINE_PATHS.some((item) => pathMatches(item, repoPath, request.context))) {
      return policyDecision(false, 'BLOCKED_BY_BASELINE_DEPENDENCY', 'Path thuộc Manufacturing Backward Scheduling baseline đang được bảo vệ.', { path: repoPath, action });
    }

    const testCodePath = TEST_CODE_PATTERNS.some((item) => pathMatches(item, repoPath, request.context));
    if (action === POLICY_ACTIONS.MODIFY_CODE && testCodePath) {
      return policyDecision(false, 'ACTION_PATH_CLASSIFICATION_MISMATCH', 'Test code chỉ được ghi bằng test.write/MODIFY_TEST_CODE.', { path: repoPath, action });
    }
    if (action === POLICY_ACTIONS.MODIFY_TEST_CODE && !testCodePath) {
      return policyDecision(false, 'ACTION_PATH_CLASSIFICATION_MISMATCH', 'test.write chỉ được ghi trong canonical test paths.', { path: repoPath, action });
    }

    if (agent.prohibited_paths.some((item) => pathMatches(item, repoPath, request.context))) {
      return policyDecision(false, 'PROHIBITED_PATH', `${agent.agent_id} bị cấm ghi path này.`, { path: repoPath, action });
    }

    if (!agent.allowed_paths.some((item) => pathMatches(item, repoPath, request.context))) {
      return policyDecision(false, 'PATH_SCOPE_DENIED', `${repoPath} nằm ngoài allowed_paths của ${agent.agent_id}.`, { path: repoPath, action });
    }
  }

  return policyDecision(true, 'ALLOWED', 'Action được suy ra từ tool và nằm trong registry/path scope.', {
    agent_id: agent.agent_id,
    action,
  });
}

function assertAgentAction(registry, request) {
  const decision = evaluateAgentAction(registry, request);
  if (!decision.allowed) {
    throw factoryError(decision.reason_code, decision.message, decision);
  }
  return decision;
}

module.exports = {
  PROTECTED_MANUFACTURING_BASELINE_PATHS,
  TOOL_ACTIONS,
  assertAgentAction,
  evaluateAgentAction,
  normalizeRepoPath,
  pathMatches,
};
