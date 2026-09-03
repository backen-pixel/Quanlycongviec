# BOS-AI1 Pre-Effect Domain and Audit Handoff V1 — Architect contract

Authority: Founder Pre-Effect Domain and Audit Handoff Fast Track, supplied
2026-09-02. OC6 stays PAUSED at G0. No OC6 implementation or baseline approval.

Technical source: `1317f1468a341379f51e33b5631d7767af7c8848`, tree
`ab7296b7ac316ea24324f5dc431a66c3375d91ca`. Branch parent is documentation
record `f259c891e266b51e44cc1691562443054c3fc812`, tree
`e9646aa904332ab4cd93403f090d67d06e6a2f0b`; ancestry and documentation-only
delta have been verified. All prior source/tests remain unchanged.

Workspace: `C:\Projects\Quanlycongviec-bos-ai1-pre-effect-handoff-v1`.
Branch: `proof/bos-ai1-pre-effect-domain-audit-v1`.
At most 12 tracked changed files, two repair rounds, zero new dependencies.

## Public handoff

An additive `pre-effect-handoff-proof.js` exposes `createPreEffectHandoffProof`.
`bos.evaluate(request)` returns a control decision. ALLOW returns a branded,
immutable, process-local execution permit, after successful ACTION_INTENT and
BOS_DECISION audit writes, with zero effects and zero Application Service calls.
Missing approval returns REQUIRE_APPROVAL. Approval always re-enters BOS.

`applicationService.execute(permit, request)` is a separate public boundary.
It verifies permit provenance and exact request binding, reserves execution,
revalidates authority, and calls the fake Domain before the fake adapter.
The Domain owns its synthetic rule/state decision and may ALLOW, DENY or STOP.
No canonical business rule is implemented by BOS or the Application Service.

The request uses unique `action_id`, fixed `tool_id=project.publish_status_update`,
LIMITED_WRITE, requester/executor/on_behalf_of, company/resource/version,
task/version, delegation/version, Agent ID/version/package SHA, REG4 commit/tree,
policy ID/version, approval ID, valid_until, idempotency key, correlation ID and
payload digest. Payload is a synthetic status/note only. The permit binds all
semantic request fields, including approval and correlation, and expires at the
earliest request, approval, task or delegation expiry. Copying or serializing a
permit does not grant authority; permits cannot move across proof instances.

## Ordering and revalidation

1. Own-data snapshot; reject proxies, accessors and hostile prototypes.
2. Reserve key before REG4 or any user-supplied callback.
3. BOS validates real REG4 record and current private synthetic authority.
4. Write intent and ALLOW, each with owned safe metadata and digests.
5. Return permit without effect; caller may delay or decline handoff.
6. Application Service validates permit/current authority and writes recheck.
7. Domain checks its own current resource/version and synthetic rule; audit it.
8. Re-read REG4 as the last external callback. Then revalidate private authority,
   approval/expiry, permit and Domain revision. No callback occurs between these
   checks and private consumption/adapter acceptance.
9. Consume permit/approval once; fake adapter accepts at most once, or records
   a known rejection before effect. Callbacks run only after acceptance.
10. Preserve a safe secondary receipt before attempting terminal audit. Audit
    failure after effect returns COMPENSATION_REQUIRED, never EXECUTED.

The Domain revision check prevents a later audit/registry callback changing
Domain state after its ALLOW. This conservative proof requires a fresh action
after a veto; it does not retry a completed attempt automatically.

## Audit and duplicate safety

`createFakeAuditWriter` has explicit failure injection and immutable hash-linked
records. No external writer response can supply audit metadata. Failed pre-effect
writes stop with zero effect; intent/ALLOW failures never call Domain/adapter.
Every boundary attempt also has an owned hash-linked secondary audit. Reentrant
in-flight calls use that secondary path to avoid invoking the failing writer
recursively. Secondary evidence is in memory only, not production durability.

Keys move ISSUING -> PERMITTED -> EXECUTING -> COMPLETE. In-flight duplicate
returns IN_PROGRESS; a completed exact duplicate returns the stored receipt,
without another adapter call. A conflicting request is denied. Approval and
permit consumption cannot be reset by replacing fixture state. Parallel callers
are serialized by synchronous entry/reservation in one JavaScript process;
Promise-scheduled and reentrant overlap are tested. No multi-process guarantee.

Adapter modes: SUCCESS -> EXECUTED; REJECT_BEFORE_EFFECT -> FAILED/zero effects;
PARTIAL or TIMEOUT_AFTER_ACCEPT -> COMPENSATION_REQUIRED; throw after acceptance
-> unknown/COMPENSATION_REQUIRED. No automatic retry or compensating write.

## Trace requirements and release gate

H01 control ALLOW/zero effects and approval re-entry; H02 audit ordering/failure;
H03 Domain veto/state revision; H04 current Agent/authority/approval/expiry;
H05 permit binding/provenance/consumption; H06 sequential, simultaneous and nested
duplicates; H07 known reject/partial/unknown/post-effect audit failure; H08 hostile
data and safe complete correlation/audit; H09 unchanged 195-test regression;
H10 independent exact-commit review, evidence, scope and clean worktrees.

Formal tests and independent adversarial tests must run against the exact frozen
technical commit/tree. Evidence is a later documentation-only commit and never
substitutes that technical identity. Final Git network use is restricted to the
authorized non-force push and verification of this named proof branch.

No real OpenClaw, models, database, secrets, data, Runtime or Production. No REG4,
MG5 or existing BOS source/test changes. No main merge, force push, tag or release.
Finish by STOP for Founder APPROVE/DENY PRE-EFFECT HANDOFF PROOF BASELINE.
