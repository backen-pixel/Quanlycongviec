# BOS-AI1 DRAFT Pre-Effect Handoff — Architect contract

Authority: direct Founder DRAFT Pre-Effect Handoff Fast Track, 2026-09-03.
OC6 remains PAUSED at G0; no OC6 change, G0 rerun or baseline approval in this task.

## Provenance and scope

Documentation parent: `f2f79018abe727f9499ef2a5b541c7246c760f25`, tree `f01df2d15827ee7ca5e6e10504afe35b180839ed`.
It contains approved technical `a4c80f30e3afcf8d0c2fec43d8634368890b383d`,
tree `7850bf028741e6319c62262cbd2b2f86c822134a`; all later changes are eight
authorized evidence/closure documents. Preflight verifies source/test unchanged.

Workspace: C:\Projects\Quanlycongviec-bos-ai1-draft-pre-effect-v1.
Branch: proof/bos-ai1-draft-pre-effect-v1. Limit: 10 tracked paths, two repairs,
zero new dependencies. Planned inventory: additive source/test, this contract,
build record, formal report, independent report, evidence narrative and portable
evidence JSON (8/10). No edits to existing baselines or historical evidence.

## DRAFT-only public contract

Action/tool `project.create_status_update_draft`; permission
`project.status_update.draft`; effect class `DRAFT`. This is an additional
API; historical combined READ/DRAFT and Publish APIs retain their exact blobs.

`createDraftPreEffectHandoffProof` takes real REG4 contract and branded fake
authority/audit/Domain/draft-adapter dependencies. `bos.evaluate(request)` returns
ALLOW plus an opaque immutable permit with draft count 0. DRAFT needs current
scoped authority, not a Publish approval; no approval is fabricated or reused.
The fixed DRAFT contract rejects Publish tools/effect classes and extra fields.

The permit binds action, company/resource/version, requester/executor/on_behalf_of,
task/delegation IDs and versions, Agent tuple/package SHA and REG4 baseline,
policy ID/version, payload digest, idempotency key, correlation and valid_until.
Expiry is the earliest intent/task/delegation expiry and cannot be extended by
fixture replacement. Copied, serialized, forged, Proxy or cross-instance permits
have no authority. Request ID is delivery metadata; all other semantics bind.

## Required ordering and authority

1. Safely snapshot untrusted request; reserve idempotency key and action identity
   before any registry/audit callback; resolve real REG4 plus private synthetic
   authority, permissions, company, task/delegation expiry and policy/version.
2. Successfully write ACTION_INTENT and BOS_DECISION, revalidate after writer
   hooks, then return ALLOW permit. No Application Service, Domain or draft yet.
3. Separate `applicationService.execute(permit,request)` checks provenance,
   exact binding, expiry and current authority, then writes EXECUTION_REVALIDATED.
4. Application Service invokes the fake Domain. Domain alone owns its synthetic
   state/rule fixture and returns ALLOW/DENY/STOP; record DOMAIN_DECISION.
5. DENY/STOP ends with zero drafts and zero adapter calls. After ALLOW, re-read
   REG4 as the last external trust callback, check current authority and Domain
   revision, then accept exactly once without callbacks between checks/effect.
6. The adapter alone appends a DRAFT_ONLY, non-canonical, non-publishable fake
   draft with copied content. Preserve secondary evidence before terminal writer;
   successful terminal audit returns EXECUTED and one draft.

Keys progress ISSUING -> PERMITTED -> EXECUTING -> COMPLETE. A second key cannot
reuse the same action identity. Same-key semantic conflict is denied; in-flight
duplicates return IN_PROGRESS; complete duplicates return the cached receipt.
Known no-effect failure is FAILED; injected partial/unknown or post-effect audit
failure is COMPENSATION_REQUIRED. No automatic retry or compensating write.

## Audit, boundaries and acceptance

Audit is owned safe metadata/digests, never raw note, exception, stack or untrusted
response metadata. Every evaluate/execute branch receives correlated secondary
evidence, including DENY, STOPPED, ALLOW and EXECUTED. Primary intent/ALLOW failure
returns STOPPED without Domain/adapter. Ledger exports copy each trusted record,
so input size limits do not truncate accumulated audit or draft evidence.

Use synthetic in-memory data and fixed fake clocks only. No real OpenClaw, model,
network operation except authorized final Git publication/verification, database,
secret, real business data, Runtime, Production, canonical Business Rules changes,
REG4/MG5/OC6 edits, main merge, force push, tag/release or new baseline approval.
Concurrency evidence covers synchronous reservation, Promise scheduling and nested
callbacks in one process; it does not establish multi-process persistence/recovery.

Required tests cover each Founder behavior, late revocation/permission and tenant/
resource/version changes, exact permit binding, three duplicate forms, hostile
inputs, audit completeness/failure, unchanged READ/Publish/BOS and REG4/MG5
regression. Freeze technical SHA/tree; separate clean Formal and Independent
worktrees; independent reviewer is not Builder and authors independent attacks.
Only after all PASS, P0=P1=0, scope <=10 and clean worktrees may the evidence branch
be pushed normally. Finish STOP for Founder APPROVE/DENY DRAFT proof baseline.
