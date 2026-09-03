# BOS-AI1 READ Pre-Effect Handoff — Architect contract

Authority: direct Founder READ Pre-Effect Handoff Fast Track, 2026-09-03.
Base: `0c2b16f381421538ce220270305534612974d615`, tree
`ba8e496311c9c99a9f8094a8197b41df4d066def`; verified before workspace creation.
Branch: `proof/bos-ai1-read-pre-effect-v1`. OC6 remains PAUSED at G0.

Planned tracked footprint: source, Builder fixture/test, this contract, build
record, formal report, independent report, evidence narrative/JSON: 9/10 paths.
At most two repair rounds; no dependency or existing source/test changes.

## Public boundaries

Additive `tools/bos-ai1/read-pre-effect-handoff-proof.js` exports ACTION
`project.get_progress_summary`, PERMISSION `project.progress.read`, EFFECT_CLASS
`READ`, BINDINGS, REG4_BASELINE, AGENT_CONTRACT, payloadSha256 and the factories:

- `createReadAuthority(initial)` — exact metadata-only identity/task/delegation,
  resource grant (`scope`), policy and fake clock; replace/snapshot harness methods.
- `createFakeReadDomain(initial, hooks)` — private existence, tenant, resource,
  version and ALLOW/DENY/STOP fixture; replace and callCount only, no row access.
- `createFakeReadRepository(initial, options)` — private fake row or null; replace,
  readCount/callCount only; no public raw-read/list API.
- `createFakeReadPipeline(options)` — fixed projection and redaction; setFailures
  and filterCount/redactionCount; hooks receive metadata only.
- `createFakeReadAuditWriter(options)` — bounded failure points and hooks;
  setFailures/listRecords; no raw payload, row or output hashes in audit.
- `createReadPreEffectHandoffProof({registry,authority,audit,domain,repository,pipeline})`.

The proof exposes `bos.evaluate(request)`, `preEffectAudit.record(controlPermit,
request)`, `applicationService.execute(executionPermit,request)`, metadata-only
`listSecondaryAudit()` and `listReceipts()`, applicationCallCount and releaseCount.

1. BOS checks real REG4 and current metadata authority only, without invoking
   Domain, Repository or projection. ALLOW returns an opaque control permit.
2. Pre-effect audit records ACTION_INTENT, BOS_DECISION and PRE_EFFECT_READY,
   rechecks authority, and issues a separately branded execution permit. A control
   permit alone cannot invoke the Application Service.
3. Application Service revalidates the permit/current authority, invokes Domain,
   records DOMAIN_DECISION, and calls Repository only after Domain ALLOW and final
   authority/Domain checks. Domain veto/STOP gives zero repository reads/releases.
4. Filter selects status/progress/contact from the private row; redaction produces
   exactly `{status,progress_percent,owner_contact:'[REDACTED]'}`. Status is a fixed
   enum and progress is an integer 0..100. Other fields and free text never escape.
5. RESULT audit records PREPARED before release. Recheck REG4, current authority,
   original permit expiry and pinned Domain/Repository/pipeline revisions after
   all hooks. In one callback-free block consume release, record a metadata-only
   receipt and return the frozen safe projection once. No callback follows release.

## Request and fixture schemas

Request fields match the additive DRAFT binding envelope: request_id,
correlation_id, idempotency_key, action_id, effect_class, Agent tuple/REG4 pins,
requester_id/executor_id/on_behalf_of, company_id/resource_id/resource_version,
task_id/task_version, delegation_id/delegation_version, policy_id/policy_version,
valid_until, tool_id, payload and payload_sha256. READ payload is exactly
`{include:'current'}`. Only request_id is non-semantic delivery metadata.

Authority top-level fields: now, identities, task, delegation, scope, policy.
Identity/task/delegation schemas retain the relevant DRAFT metadata fields.
Scope contains only company_id/resource_id/version/permissions_by_principal;
it is an authority grant independent of resource existence, never a fetched row.
Policy contains company_id/policy_id/policy_version, allowed_actions/tools,
prohibited_actions and role_permissions. No project fields/business data in authority.

Domain fields: company_id/resource_id/version/exists/decision. Missing, mismatched
or denied resources produce the same public READ_DENIED envelope; explicit STOP
or unavailable Domain produces READ_STOPPED, regardless of existence.
Repository row fields: company_id/resource_id/version/fields. Null or unusable row
fails closed without revealing existence in errors. All data is synthetic.

## Duplicates, failure and evidence

Reserve action/key before callbacks. Different semantic payload/key conflicts
fail closed. ISSUING/AUDITING/EXECUTING/CHECKING_RECEIPT nested calls return
IN_PROGRESS without data. Completed duplicates revalidate under a receipt lock
and return cached metadata only, with duplicate=true and data_released=false.
They never repeat repository reads, filtering or data release. No blind retry.

Every public result has the caller correlation_id when its request is valid and
a safe audit reference. Invalid requests receive generated safe correlation.
Audit/filter/redaction/repository errors and stale/revoked authority suppress the
entire data field. Primary failure has private secondary metadata evidence; no
raw row, projected values, sensitive free text, raw exception or content hash.

Inputs use bounded own-data snapshots, rejecting Proxy/accessor/foreign-prototype
payloads. All permits/dependencies are private WeakMap-branded and instance-bound.
Hooks are trusted synthetic fault injection, not production adapters or policy.
Concurrency means one-process reservation, Promise scheduling and reentrant calls.

Preserve READ/DRAFT/Publish baselines and REG4/MG5 regression; do not edit REG4,
MG5, OC6, canonical Business Rules, database/migrations or dependencies. No real
network/model/OpenClaw/business data/Runtime/Production. Only final authorized
Git push/verification may use GitHub after all gates pass. No main/PR/merge/force/
tag/release. Finish STOP for Founder APPROVE/DENY READ Proof Baseline; no G0 rerun
or self-approval. Rollback is STOP and preserve the evidence, not history rewrite.
