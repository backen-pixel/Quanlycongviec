# OC6 Synthetic Project Status Update — Architect contract

Authority: original Founder OC6 Proof Implementation Fast Track and latest READ baseline approval. G0 PASS is sealed externally in `OC6_G0_READ_BASELINE_V1/G0_MANIFEST.json` before this workspace was created. Integration parent: `cb0e627093bdc837fcf64d080cebf4d0443b80f7` / `fe110ce78ae91512f34141c2fcd0aa16051febbd`. Active READ technical baseline: `b040d12a27ec0c99433a7c2abb988cc993cf337b` / `4190816ac113d2b6352eb7d242b1d35a9f58ca1e`. All other approved REG4/MG5/BOS pins remain unchanged and are enumerated in the G0 record.

Branch `proof/oc6-v1`. Maximum20 added/changed tracked files, maximum2 repair rounds, no new dependency, no existing baseline or Business Rule edits. Initial build/test is round0. Only synthetic in-memory actors, data, clock, policy, Domain/Adapter and audit; no live OpenClaw/model/API/network/database/business data/Runtime/Production. Authorized GitHub proof publication is a separate final Git operation after all checks.

## Control ownership

Use the real unchanged REG4 and MG5 modules and the approved READ/DRAFT/Publish pre-effect handoff modules. The fake OpenClaw interface owns orchestration only. Founder authority, REG4 state, MG5 policy, BOS policy and Domain state remain in separate private control records; trusted synthetic harness controls are not exposed on the OpenClaw interface. Model output never owns permission or official state.

Preserve the full immutable Founder delegation naming the Executive recipient. A native BOS task-execution view binds that original delegation id/version/integrity, Executive id/version, session/task versions, approved assignment Agent id/version/package, company/resource/action and full intent digest. The native requester is Executive, executor is distinct assigned Agent principal, and on_behalf_of/delegator remain Founder. Native delegate_id denotes only the bound task executor. This view cannot add rights, widen scope/TTL/budget/risk, transfer independently, or substitute the original recipient. Re-resolve before native stages; missing/stale authority or assignment stops execution.

Full OC6 intent validation and catalogue mapping may only narrow authority. A native BOS ALLOW and its original owned permit are always necessary. Native READ CONTROL and EXECUTION permits stay distinct. Domain DENY/STOP precedes every read/effect. Keep idempotency reservations before callback-capable boundaries, action-id and semantic-digest conflicts, no duplicate disclosure/effect under sequential, Promise-scheduled or reentrant calls, and no blind retry after unknown outcomes.

## Intended public API

`tools/oc6/control-integration-proof.js` exports `createOC6Proof(options)` and immutable constants/schema helpers as needed. The factory returns a frozen `{openclaw, harness}` pair. `options` and `harness` are explicitly trusted synthetic test controls, never model/user authority payloads.

OpenClaw methods:

- `openSession(request)` validates a full session request against Founder delegation and emits an ACTIVE session reference or safe denial/STOP.
- `runModel(session_id)` routes a verified assigned Agent through native MG5, returning an `ADVISORY_ONLY` result with `UNTRUSTED_OUTPUT` and opaque provenance on success; it creates no business effect.
- `submitIntent(intent)` validates immutable full OC6 metadata/provenance, calls native BOS and returns its decision with an owned OC6 execution ticket when PERMITTED, or PENDING_APPROVAL/DENIED/STOPPED. READ at this boundary has not performed its pre-effect audit or read.
- `receiveApproval(approvalFixture)` accepts only a branded, task/intent-bound synthetic authority decision, records it and returns the result of a second native BOS evaluation. An APPROVE never directly executes.
- `execute(ticket)` accepts only an owned immutable ticket, revalidates full authority/provenance, then calls the approved native pre-effect audit/Application Service/Domain path. Tickets cannot be forged, swapped across proof instances or rebound to another session/action.
- `inspect()` returns safe snapshots/counters/evidence references and result queues, never authority mutation handles.

Harness methods are documented with the implementation before Development tests: session-request/intent/approval fixture creation; controlled delegation/Executive/assignment/policy/clock/Domain/audit/model mutations; real registry lifecycle transitions; metadata-only fault hooks and counts. Fixture helpers do not bypass public validation and branded ownership. Unknown input fields, accessors/proxies, malformed numbers/TTL and unsafe tokens must fail closed without invoking untrusted getters or logging payload/exception text.

## Mandatory integration mappings

1. One root correlation per session causal chain. Native BOS receives it unchanged. MG5/REG4 native local IDs and sealed audits are preserved; immutable bridge events bind root session/task/action, request id/digest, native local correlation and audit hash. Full payloads, model output, private rows and approval bearer values never enter audit. Every ALLOW/DENY/pending/STOP/EXECUTED/FAILED/COMPENSATION_REQUIRED is traceable.
2. MG5 retains native historical BOS f44/f17 fields. Configure one eligible fake model and at most two primary attempts, no fallback. Budget10 fake credits is enforced by native reservations plus session task limits. Charges and native attempts remain recorded even if a conservative guard suppresses actual simulation.
3. Native MG5 does not recheck all callback/attempt drift. Its configured fake adapter/validator must only reject when authoritative snapshot/model status/assignment/STOP changes. Pin before native invocation, guard before each actual fake-model simulation and after output, latch denial, and recheck before BOS evaluation/approval/execution. Never select a substitute model, manufacture ALLOW or rewrite native audit/cost.
4. REG4's unsupported APPROVED->BLOCKED is retained as a limitation. Prove actual same-package APPROVED->RETIRED mid-session invalidation plus actual IN_REVIEW->BLOCKED negative package, with real roles/native audit. Do not forge BLOCKED state, relabel RETIRED or silently turn a block request into retirement.
5. Full delegation/session STOP and global write closure monotonically narrow native task/delegation/policy state, including final native registry-read boundaries. No shared mutable current-session variable. Normal results go to Executive; approval routing is distinct from material-exception escalation to Founder.
6. Audit unavailable before effect blocks. Native writer hooks connect the common audit gate before READ release and business effects. After a possible effect, preserve native receipt, return compensation/reconciliation as appropriate and never falsely claim zero effect or successful unaudited completion. Final in-memory receipt bookkeeping must be callback-free.

## Required evidence and verification

G1/G2 schema/static/component; G3 P01–P14; G4/G5 negative/security/idempotency; G6/G7 failure/STOP/isolation; G8 full unchanged regression; G9 traceable evidence. Builder tests must cover the complete approved matrix and all G0 adapter restrictions, including swaps of Executive/assignment/session/digest, origin revoke while approval pending, lifecycle change, MG5 drift after prepare/between attempts/output validation, budget exhaustion, native limits, Domain state change, pre/post effect audit failure, duplicate/reentry and cross-company denial.

P01 delegation opens ACTIVE; P02 scope; P03 Router/REG4; P04 MG5 policy; P05 untrusted model; P06 native BOS ALLOW plus separate Domain; P07 company/permission denial before application; P08 pending Publish zero effect; P09 second BOS after approval; P10 one effect; P11 normal Executive routing; P12 material Founder escalation; P13 known vs partial/unknown outcome; P14 correlation/audit/redaction.

Formal tests run from a clean frozen exact commit/tree. Independent IR-OC6-1 uses a distinct task and clean workspace, independently authored adversarial tests and full regression rerun. Preserve every failed round and repair diff; at most2 repairs. Final proof requires G0–G9, P01–P14 14/14, full regression and independent review/rerun PASS, P0/P1 zero, <=20files, clean worktrees and matching source/test/evidence hashes. Then only normal proof-branch push; STOP for Founder APPROVE/DENY OC6 Proof Baseline. No self-approval, main, PR, force, merge, tag, release or next major phase.
