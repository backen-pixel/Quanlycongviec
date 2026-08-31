'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  AgentControlPlane,
  AgentControlPlaneAuditLedger,
  AgentIdentityBoundary,
  CompanyContextBoundary,
} = require('../src/agentControlPlane');
const {
  createProductionDeliveryRiskApplicationService,
} = require('../src/domains/production/services/productionDeliveryRiskApplicationService');

const TOOL = 'production.delivery_risk.assess';
const CAPABILITY = 'production.delivery_risk.assess';
const PERMISSION = 'production.delivery_risk.read';

function baseAgent(overrides = {}) {
  return {
    principal_type: 'business_agent',
    principal_id: 'principal-production-risk-1',
    agent_id: 'production-delay-risk-agent',
    agent_version: '1.0.0-cp1',
    role: 'Production delay risk analyst',
    domain: 'production',
    capabilities: [CAPABILITY],
    decision_level: 'RECOMMEND',
    tenant_id: 'tenant-a',
    company_id: 'company-a',
    actor_user_id: 'user-founder',
    actor_type: 'FOUNDER',
    permission_scope: [PERMISSION],
    runtime_environment: 'TEST',
    ...overrides,
  };
}

function baseCompanyContext(overrides = {}) {
  return {
    ecosystem_id: 'ecosystem-a',
    tenant_id: 'tenant-a',
    company_id: 'company-a',
    user_id: 'user-founder',
    role: 'founder',
    department: 'executive',
    permissions: [PERMISSION],
    policy: {
      agent_access_enabled: true,
      risk_warning_days: 2,
    },
    process_kpi_context: {
      delivery_on_time_target_percent: 95,
    },
    data_scope: {
      project_ids: ['project-1'],
      resource_types: ['project', 'manufacturing_order', 'manufacturing_order_stage'],
    },
    enabled_capabilities: [CAPABILITY],
    ...overrides,
  };
}

function baseAssessmentInput(overrides = {}) {
  return {
    project: {
      id: 'project-1',
      code: 'P-001',
      name: 'Project CP1',
      tenant_id: 'tenant-a',
      company_id: 'company-a',
      delivery_date: '2026-09-10',
      ...(overrides.project || {}),
    },
    production_order: {
      id: 'order-1',
      code: 'MO-001',
      project_id: 'project-1',
      tenant_id: 'tenant-a',
      company_id: 'company-a',
      delivery_date: '2026-09-10',
      status: 'IN_PROGRESS',
      ...(overrides.production_order || {}),
    },
    stages: overrides.stages || [{
      id: 'stage-1',
      stage_code: 'MAIN_PRODUCTION',
      label: 'Production',
      order_index: 1,
      planned_start_at: '2026-09-01',
      planned_due_at: '2026-09-07',
      status: 'IN_PROGRESS',
      progress_percent: 60,
      is_active: true,
    }],
  };
}

function baseReasoner() {
  return {
    async recommend({ facts }) {
      return {
        summary: facts.delivery_at_risk
          ? 'Delivery is at risk and requires human follow-up.'
          : 'No active delivery delay signal.',
        actions: [
          'Ask the production owner to verify the current stage and blocker evidence.',
          'Escalate any delivery-date change through the existing human approval workflow.',
        ],
        confidence: 0.9,
      };
    },
  };
}

function buildHarness({
  agent = baseAgent(),
  resolveAgent,
  companyContext = baseCompanyContext(),
  resolveCompanyContext,
  assessmentInput = baseAssessmentInput(),
  repository,
  reasoner = baseReasoner(),
} = {}) {
  const trustedAgents = new Map([['trusted-agent-token', agent]]);
  const identityBoundary = new AgentIdentityBoundary({
    resolveTrustedAgent: resolveAgent || ((assertion) => trustedAgents.get(assertion) || null),
  });
  const companyContextBoundary = new CompanyContextBoundary({
    resolveTrustedCompanyContext: resolveCompanyContext || (async () => companyContext),
  });
  const typedRepository = repository || {
    async loadAssessmentInput() {
      return assessmentInput;
    },
  };
  const applicationService = createProductionDeliveryRiskApplicationService({
    repository: typedRepository,
  });
  const auditLedger = new AgentControlPlaneAuditLedger();
  const controlPlane = new AgentControlPlane({
    identityBoundary,
    companyContextBoundary,
    applicationService,
    reasoner,
    auditLedger,
  });
  return {
    auditLedger,
    controlPlane,
    identityBoundary,
    companyContextBoundary,
  };
}

async function startTrustedRun(harness) {
  return harness.controlPlane.startRun('trusted-agent-token');
}

function invokeRisk(controlPlane, run, input = {}) {
  return controlPlane.invoke(run, {
    tool: TOOL,
    input: {
      project_id: 'project-1',
      production_order_id: 'order-1',
      as_of_date: '2026-09-08',
      ...input,
    },
  });
}

test('CP1 happy path: trusted context to Domain PASS to recommendation to audit', async () => {
  const harness = buildHarness();
  const run = await startTrustedRun(harness);
  const result = await invokeRisk(harness.controlPlane, run);

  assert.equal(result.decision, 'PASS');
  assert.equal(result.reason_code, 'DELIVERY_RISK_ASSESSED');
  assert.equal(result.mode, 'RECOMMEND');
  assert.equal(result.facts.risk_level, 'RED');
  assert.equal(result.facts.control_constraints.state_change_prohibited, true);
  assert.equal(result.recommendation.mode, 'RECOMMEND_ONLY');

  const trace = harness.controlPlane.getAuditTrace(run);
  assert.deepEqual(trace.map((entry) => entry.event_type), [
    'AGENT_RUN_STARTED',
    'AGENT_REQUEST_ACCEPTED',
    'DOMAIN_DECISION_RECORDED',
    'AGENT_RECOMMENDATION_RECORDED',
  ]);
  for (const entry of trace) {
    assert.equal(entry.requested_by_user_id, 'user-founder');
    assert.equal(entry.agent_id, 'production-delay-risk-agent');
    assert.equal(entry.agent_version, '1.0.0-cp1');
    assert.equal(entry.tenant_id, 'tenant-a');
    assert.equal(entry.company_id, 'company-a');
    assert.ok(entry.data_scope);
  }
  assert.equal(trace[1].tool, TOOL);
  assert.equal(trace[2].application_service, 'production.delivery-risk-assessment');
  assert.equal(trace[2].decision, 'PASS');
  assert.ok(trace[3].recommendation);
  assert.equal(harness.controlPlane.verifyAuditChain(), true);
});

test('missing tenant is DENY BY DEFAULT', async () => {
  const harness = buildHarness({ agent: baseAgent({ tenant_id: '' }) });
  await assert.rejects(
    () => startTrustedRun(harness),
    (error) => error.code === 'TENANT_CONTEXT_REQUIRED',
  );
  assert.equal(harness.auditLedger.list({ event_type: 'CONTROL_PLANE_DENIED' }).at(-1).reason_code, 'TENANT_CONTEXT_REQUIRED');
});

test('missing company is DENY BY DEFAULT', async () => {
  const harness = buildHarness({ agent: baseAgent({ company_id: '' }) });
  await assert.rejects(
    () => startTrustedRun(harness),
    (error) => error.code === 'COMPANY_CONTEXT_REQUIRED',
  );
});

test('fake company unresolved by Business OS is denied', async () => {
  const harness = buildHarness({
    agent: baseAgent({ company_id: 'company-fake' }),
    resolveCompanyContext: async () => null,
  });
  await assert.rejects(
    () => startTrustedRun(harness),
    (error) => error.code === 'COMPANY_SCOPE_INVALID',
  );
});

test('cross-tenant Company Context is denied', async () => {
  const harness = buildHarness({
    companyContext: baseCompanyContext({ tenant_id: 'tenant-b' }),
  });
  await assert.rejects(
    () => startTrustedRun(harness),
    (error) => error.code === 'TENANT_SCOPE_INVALID',
  );
});

test('cross-company Company Context is denied', async () => {
  const harness = buildHarness({
    companyContext: baseCompanyContext({ company_id: 'company-b' }),
  });
  await assert.rejects(
    () => startTrustedRun(harness),
    (error) => error.code === 'COMPANY_SCOPE_INVALID',
  );
});

test('insufficient Agent permission is denied before Application Service', async () => {
  let repositoryCalls = 0;
  const harness = buildHarness({
    agent: baseAgent({ permission_scope: ['project.summary.read'] }),
    repository: {
      async loadAssessmentInput() {
        repositoryCalls += 1;
        return baseAssessmentInput();
      },
    },
  });
  const run = await startTrustedRun(harness);
  await assert.rejects(
    () => invokeRisk(harness.controlPlane, run),
    (error) => error.code === 'PERMISSION_MISSING',
  );
  assert.equal(repositoryCalls, 0);
});

test('model-style self-declared Agent Identity is not trusted', async () => {
  const harness = buildHarness();
  await assert.rejects(
    () => harness.controlPlane.startRun(baseAgent()),
    (error) => error.code === 'AGENT_IDENTITY_AUTHENTICATION_DENIED',
  );
});

test('Company Context cannot change during an Agent Run', async () => {
  const harness = buildHarness();
  const run = await startTrustedRun(harness);
  await assert.rejects(
    () => harness.controlPlane.invoke(run, {
      company_context: baseCompanyContext({ company_id: 'company-b' }),
      tool: TOOL,
      input: { project_id: 'project-1' },
    }),
    (error) => error.code === 'COMPANY_CONTEXT_CHANGED',
  );
  await assert.rejects(
    () => invokeRisk(harness.controlPlane, run, { company_id: 'company-b' }),
    (error) => error.code === 'COMPANY_CONTEXT_CHANGED',
  );
});

test('direct database and generic CRUD tool attempts are denied', async () => {
  const harness = buildHarness();
  const run = await startTrustedRun(harness);
  for (const tool of ['supabase.from', 'database.query', 'generic_table_crud', 'sql.execute']) {
    await assert.rejects(
      () => harness.controlPlane.invoke(run, {
        tool,
        input: { project_id: 'project-1' },
      }),
      (error) => error.code === 'DIRECT_DATABASE_ACCESS_DENIED',
    );
  }
});

test('forbidden non-database tool is denied', async () => {
  const harness = buildHarness();
  const run = await startTrustedRun(harness);
  await assert.rejects(
    () => harness.controlPlane.invoke(run, {
      tool: 'production.stage.change',
      input: { project_id: 'project-1' },
    }),
    (error) => error.code === 'FORBIDDEN_TOOL',
  );
});

test('Domain DENY is final and reasoner is not called', async () => {
  let reasonerCalls = 0;
  const harness = buildHarness({
    assessmentInput: baseAssessmentInput({ stages: [] }),
    reasoner: {
      async recommend() {
        reasonerCalls += 1;
        return { summary: 'Must not run', actions: ['Must not run'] };
      },
    },
  });
  const run = await startTrustedRun(harness);
  const result = await invokeRisk(harness.controlPlane, run);
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reason_code, 'SCHEDULE_CONTEXT_MISSING');
  assert.equal(result.recommendation, null);
  assert.equal(reasonerCalls, 0);
  assert.equal(
    harness.controlPlane.getAuditTrace(run).at(-1).event_type,
    'DOMAIN_DECISION_RECORDED',
  );
});

test('data scope outside the immutable Company Context is denied', async () => {
  const harness = buildHarness({
    companyContext: baseCompanyContext({
      data_scope: { project_ids: ['project-other'] },
    }),
  });
  const run = await startTrustedRun(harness);
  const result = await invokeRisk(harness.controlPlane, run);
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reason_code, 'DATA_SCOPE_DENIED');
});

test('cross-tenant and cross-company resource records are denied by Application Service', async () => {
  for (const assessmentInput of [
    baseAssessmentInput({ project: { tenant_id: 'tenant-b' } }),
    baseAssessmentInput({ production_order: { company_id: 'company-b' } }),
  ]) {
    const harness = buildHarness({ assessmentInput });
    const run = await startTrustedRun(harness);
    const result = await invokeRisk(harness.controlPlane, run);
    assert.equal(result.decision, 'DENY');
    assert.ok(['TENANT_SCOPE_INVALID', 'COMPANY_SCOPE_INVALID'].includes(result.reason_code));
  }
});

test('cloned or fabricated Agent Run handle is denied', async () => {
  const harness = buildHarness();
  const run = await startTrustedRun(harness);
  assert.throws(
    () => harness.controlPlane.describeRun({ ...run }),
    (error) => error.code === 'AGENT_RUN_CONTEXT_INVALID',
  );
});

test('AUTO_EXECUTE and PRODUCTION runtime identities are denied in CP1', async () => {
  for (const agent of [
    baseAgent({ decision_level: 'AUTO_EXECUTE' }),
    baseAgent({ runtime_environment: 'PRODUCTION' }),
  ]) {
    const harness = buildHarness({ agent });
    await assert.rejects(
      () => startTrustedRun(harness),
      (error) => ['AGENT_DECISION_LEVEL_DENIED', 'AGENT_RUNTIME_ENVIRONMENT_DENIED'].includes(error.code),
    );
  }
});

test('reasoner cannot smuggle auto-execution into recommendation', async () => {
  const harness = buildHarness({
    reasoner: {
      async recommend() {
        return {
          summary: 'Unsafe',
          actions: ['Change production state'],
          auto_execute: true,
        };
      },
    },
  });
  const run = await startTrustedRun(harness);
  await assert.rejects(
    () => invokeRisk(harness.controlPlane, run),
    (error) => error.code === 'RECOMMENDATION_OUTPUT_FORBIDDEN',
  );
});

test('Domain result is immutable before the recommendation reasoner receives it', async () => {
  const harness = buildHarness({
    reasoner: {
      async recommend({ facts }) {
        assert.equal(Object.isFrozen(facts), true);
        assert.equal(Object.isFrozen(facts.current_stage), true);
        assert.throws(() => {
          facts.risk_level = 'GREEN';
        }, TypeError);
        return {
          summary: 'Domain facts remained immutable.',
          actions: ['Keep the assessment in recommendation-only mode.'],
          confidence: 0.8,
        };
      },
    },
  });
  const run = await startTrustedRun(harness);
  const result = await invokeRisk(harness.controlPlane, run);
  assert.equal(result.facts.risk_level, 'RED');
});

test('READ_ONLY Agent receives facts without calling recommendation reasoner', async () => {
  const harness = buildHarness({
    agent: baseAgent({ decision_level: 'READ_ONLY' }),
    reasoner: {
      async recommend() {
        throw new Error('READ_ONLY must not call reasoner');
      },
    },
  });
  const run = await startTrustedRun(harness);
  const result = await invokeRisk(harness.controlPlane, run);
  assert.equal(result.decision, 'PASS');
  assert.equal(result.mode, 'READ_ONLY');
  assert.equal(result.recommendation, null);
});

test('Application Service rejects repositories exposing generic database methods', () => {
  assert.throws(
    () => createProductionDeliveryRiskApplicationService({
      repository: {
        async loadAssessmentInput() {
          return null;
        },
        async update() {
          return null;
        },
      },
    }),
    /Generic database repository methods are forbidden/,
  );
});

test('Control Plane rejects write-capable or unnamed Application Services', () => {
  const identityBoundary = new AgentIdentityBoundary({
    resolveTrustedAgent: async () => baseAgent(),
  });
  const companyContextBoundary = new CompanyContextBoundary({
    resolveTrustedCompanyContext: async () => baseCompanyContext(),
  });
  assert.throws(
    () => new AgentControlPlane({
      identityBoundary,
      companyContextBoundary,
      applicationService: {
        name: 'production.write-service',
        mode: 'WRITE',
        async execute() {
          return { decision: 'PASS' };
        },
      },
      reasoner: baseReasoner(),
      auditLedger: new AgentControlPlaneAuditLedger(),
    }),
    (error) => error.code === 'APPLICATION_SERVICE_CONTRACT_DENIED',
  );
});

test('governed Agent source has no Supabase, Legacy AI Action or database imports', () => {
  const root = path.join(__dirname, '..', 'src', 'agentControlPlane');
  const files = fs.readdirSync(root)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(root, name));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.includes("require('../config/supabase')"), false, path.basename(file));
    assert.equal(source.includes("require('../../config/supabase')"), false, path.basename(file));
    assert.equal(source.includes("require('../helpers/aiActions')"), false, path.basename(file));
    assert.equal(source.includes('legacyAiActions'), false, path.basename(file));
  }

  const assistantSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'assistant.js'),
    'utf8',
  );
  const compatibilitySource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'legacy', 'assistant', 'legacyAiActions.js'),
    'utf8',
  );
  assert.equal(assistantSource.includes('legacy/assistant/legacyAiActions'), true);
  assert.equal(compatibilitySource.includes('LEGACY_COMPATIBILITY_ONLY'), true);
});

test('Legacy Assistant compatibility namespace preserves the existing action engine', () => {
  const direct = require('../src/helpers/aiActions');
  const compatibility = require('../src/legacy/assistant/legacyAiActions');
  assert.strictEqual(compatibility.ACTIONS, direct.ACTIONS);
  assert.strictEqual(compatibility.findCustomer, direct.findCustomer);
  assert.strictEqual(compatibility.findProject, direct.findProject);
  assert.strictEqual(compatibility.findLead, direct.findLead);
  assert.equal(compatibility.LEGACY_COMPATIBILITY_ONLY, true);
});
