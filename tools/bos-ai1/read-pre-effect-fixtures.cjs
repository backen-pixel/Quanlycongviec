'use strict';

// Synthetic Builder fixtures. These deliberately use the real unchanged REG4.
// Raw fixture data belongs to this test harness, never the proof's public API.
const api = require('./read-pre-effect-handoff-proof');
const { createAgentRegistry, calculatePackageSha256 } = require('../reg4/agent-registry');

const NOW = '2026-09-03T03:00:00.000Z';
const PAST = '2026-09-02T03:00:00.000Z';
const FUTURE = '2026-09-04T03:00:00.000Z';
const EARLY = '2026-09-03T03:00:01.000Z';
const LATER = '2026-09-03T03:00:02.000Z';
const SECRET = 'PRIVATE_READ_FIXTURE_SENTINEL';
const SAFE_DATA = Object.freeze({ status: 'ON_TRACK', progress_percent: 42, owner_contact: '[REDACTED]' });

function fixture(options = {}) {
  let f;
  const registry = createAgentRegistry({ now: () => NOW });
  const content = {
    agent_id: api.AGENT_CONTRACT.agent_id, version: api.AGENT_CONTRACT.version,
    name: 'Synthetic READ handoff agent', created_by: 'builder.read',
    permissions: [api.PERMISSION], required_tools: [api.ACTION], prohibited_actions: ['critical_write'],
    evidence_references: [
      { evidence_id: 'synthetic.read.test', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: 'a'.repeat(64) },
      { evidence_id: 'synthetic.read.review', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: 'b'.repeat(64) },
    ],
  };
  options.editAgent?.(content);
  const packageSha = calculatePackageSha256(content);
  registry.registerAgentPackage({ ...content, package_sha256: packageSha }, { actor_id: 'builder.read', role: 'AUTHOR' });
  const transition = (status) => registry.transitionApproval(
    { agent_id: content.agent_id, version: content.version, to_status: status },
    { actor_id: 'review.read', role: status === 'RETIRED' ? 'REGISTRY_ADMIN' : status === 'APPROVED' ? 'APPROVER' : 'REVIEWER' });
  const initialStatus = options.status || 'APPROVED';
  if (initialStatus !== 'DRAFT') {
    transition('IN_REVIEW');
    if (initialStatus !== 'IN_REVIEW') transition(initialStatus);
  }
  const payload = { include: 'current' };
  const request = {
    request_id: 'request-read-1', correlation_id: 'synthetic-read-correlation-1', idempotency_key: 'read-delivery-1',
    action_id: 'ACT-READ-001', tool_id: api.ACTION, policy_id: 'synthetic-read-policy', valid_until: FUTURE,
    effect_class: api.EFFECT_CLASS, agent_id: content.agent_id, agent_version: content.version,
    package_sha256: packageSha, reg4_baseline_commit: api.REG4_BASELINE.commit, reg4_baseline_tree: api.REG4_BASELINE.tree,
    requester_id: 'requester', executor_id: 'executor', on_behalf_of: 'owner', company_id: 'synthetic-company',
    resource_id: 'synthetic-project', resource_version: '7', task_id: 'synthetic-task', task_version: '1',
    delegation_id: 'synthetic-delegation', delegation_version: '1', policy_version: 'policy-1',
    payload, payload_sha256: api.payloadSha256(payload),
  };
  const identities = Object.fromEntries(['requester', 'executor', 'owner'].map((id) => [id, {
    identity_id: id, company_id: request.company_id, active: true, role: id, permissions: [api.PERMISSION],
  }]));
  Object.assign(identities.executor, { agent_id: content.agent_id, agent_version: content.version, package_sha256: packageSha });
  const data = {
    now: NOW, identities,
    task: { task_id: request.task_id, version: request.task_version, company_id: request.company_id,
      requester_id: request.requester_id, executor_id: request.executor_id, on_behalf_of: request.on_behalf_of,
      resource_id: request.resource_id, active: true, expires_at: FUTURE,
      permissions: [api.PERMISSION], allowed_actions: [api.ACTION], allowed_tools: [api.ACTION] },
    delegation: { delegation_id: request.delegation_id, version: request.delegation_version,
      company_id: request.company_id, delegate_id: request.executor_id, delegator_id: request.on_behalf_of,
      resource_id: request.resource_id, revoked: false, expires_at: FUTURE,
      permissions: [api.PERMISSION], allowed_actions: [api.ACTION], allowed_tools: [api.ACTION] },
    scope: { company_id: request.company_id, resource_id: request.resource_id, version: request.resource_version,
      permissions_by_principal: { owner: [api.PERMISSION] } },
    policy: { company_id: request.company_id, policy_id: request.policy_id, policy_version: request.policy_version,
      allowed_actions: [api.ACTION], allowed_tools: [api.ACTION], prohibited_actions: [],
      role_permissions: { requester: [api.PERMISSION] } },
  };
  const domainData = { company_id: request.company_id, resource_id: request.resource_id,
    version: request.resource_version, exists: true, decision: options.domainDecision || 'ALLOW' };
  const rowData = { company_id: request.company_id, resource_id: request.resource_id, version: request.resource_version,
    fields: { status: 'ON_TRACK', progress_percent: 42, owner_contact: SECRET + '@invalid.example',
      private_note: SECRET, internal_budget: 909090, nested_private: { note: SECRET } } };
  options.editAuthority?.(data);
  options.editDomain?.(domainData);
  options.editRow?.(rowData);
  const authority = api.createReadAuthority(data);
  const domain = api.createFakeReadDomain(domainData, {
    beforeCheck: (metadata) => options.beforeDomain?.(f, metadata),
    afterCheck: (metadata) => options.afterDomain?.(f, metadata),
  });
  const repository = api.createFakeReadRepository(Object.hasOwn(options, 'row') ? options.row : rowData, {
    mode: options.mode || 'SUCCESS',
    beforeRead: (metadata) => options.beforeRead?.(f, metadata),
    afterRead: (metadata) => options.afterRead?.(f, metadata),
  });
  const pipeline = api.createFakeReadPipeline({
    failFilter: options.failFilter || false, failRedaction: options.failRedaction || false,
    beforeFilter: (metadata) => options.beforeFilter?.(f, metadata),
    afterFilter: (metadata) => options.afterFilter?.(f, metadata),
    beforeRedact: (metadata) => options.beforeRedact?.(f, metadata),
    afterRedact: (metadata) => options.afterRedact?.(f, metadata),
  });
  const audit = api.createFakeReadAuditWriter({ failAt: options.failAt || [],
    beforeWrite: (metadata) => options.beforeAudit?.(f, metadata),
    afterWrite: (metadata) => options.afterAudit?.(f, metadata),
  });
  let registryReads = 0;
  const gateRegistry = { getAgentPackage(...args) {
    registryReads++;
    // Changes occur before the real REG4 snapshot, preserving its trust contract.
    options.onRegistry?.(f, registryReads);
    const record = registry.getAgentPackage(...args);
    return options.registryResult ? options.registryResult(record, registryReads) : record;
  } };
  const proof = api.createReadPreEffectHandoffProof({ registry: gateRegistry, authority, audit, domain, repository, pipeline });
  f = {
    registry, gateRegistry, transition, content, data, domainData, rowData,
    authority, domain, repository, pipeline, audit, proof, request,
    registryReadCount: () => registryReads,
    change(edit) { edit(data); authority.replace(data); },
    changeDomain(edit) { edit(domainData); domain.replace(domainData); },
    changeRow(edit) { edit(rowData); repository.replace(rowData); },
    allow() { return proof.bos.evaluate(request); },
    ready(control = f.allow()) {
      return control.status === 'PERMITTED' ? proof.preEffectAudit.record(control.permit, request) : control;
    },
    run() {
      const execution = f.ready();
      return execution.status === 'READY' ? proof.applicationService.execute(execution.permit, request) : execution;
    },
  };
  return f;
}

module.exports = { ...api, fixture, NOW, PAST, FUTURE, EARLY, LATER, SECRET, SAFE_DATA };
