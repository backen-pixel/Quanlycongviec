# BOS-AI1 DRAFT Pre-Effect Handoff — Independent Review record

Verdict: **PASS**. Independent reviewer: `independent_draft_handoff_review (not Builder)`, not Builder.

| Binding | Value |
|---|---|
| Technical commit | `a0fbabb9e210b4fdf2ad2e7fc2b8e9f89200d0d0` |
| Technical tree | `6d0e3895400599570aefffaa14430231c1dfa443` |
| Direct parent | `38a4dd853100f022843758360464206bfb1e0e58` |
| Independent adversarial tests | **223/223 PASS** |
| Independent repository rerun | **559/559 PASS** |
| Independent historical rerun | **325/325 PASS** |
| P0 / P1 / P2 open | **0 / 0 / 0** |
| Before/after worktree | Clean, detached, exact SHA/tree, tracked-file hashes unchanged |
| Original manifest SHA-256 | `1db9a1c138cf85134690f9c86d1f776a0ebffd287d9c693be9a88c64eff15067` |

The reviewer independently authored fixture/attacks and reran the existing suites
in a separate workspace. The original reviewer-owned report, source, runner,
raw stdout/stderr, hashes and manifest are embedded verbatim under `independent-round1/`
in [portable evidence](./BOS_AI1_DRAFT_PRE_EFFECT_EVIDENCE.json). Nothing in this
record substitutes the tested technical identity with the later evidence commit.

## Original independent report

The following is the reviewer report; any local artifact paths refer to the
original evidence directory represented by the portable package.

# Independent Review — repaired DRAFT candidate, round 1

Result: **PASS. P0=0, P1=0, P2=0 open findings.** Historical finding **IR-DRAFT-P2-001 is CLOSED_VERIFIED** by the unchanged independent failing assertion from the original review. This review does not approve a baseline or resume OC6.

Exact technical commit: `a0fbabb9e210b4fdf2ad2e7fc2b8e9f89200d0d0`.
Exact technical tree: `6d0e3895400599570aefffaa14430231c1dfa443`.
Direct parent / preserved original failed candidate: `38a4dd853100f022843758360464206bfb1e0e58`.
Original documentation base: `f2f79018abe727f9499ef2a5b541c7246c760f25`.
Read-only review worktree: `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_DRAFT_PRE_EFFECT_IR_R1_WORKSPACE`.
Evidence directory: `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_DRAFT_PRE_EFFECT_WORK\independent-round1`.

## Repair disposition

The original P2 allowed repeated evaluation to return ALLOW after an already issued permit expired during an audit callback. The permit itself remained immutable, and execution still denied it before Domain or adapter calls; the defect was an incorrect current authorization result.

At DRAFT source line 348, the repaired implementation checks the existing permit's immutable expiry against the final trusted context clock, after injectable audit writers and before returning ALLOW. The check uses the original permit expiry and the final authority time, so replacing the current task/delegation expiry cannot extend the original grant. It introduces no callback, adapter operation, dependency, or additional authority. Original issuance continues to use the earliest intent/task/delegation expiry; execution still checks provenance, binding, current authority, and expiry separately.

The unchanged `reviewer-expiry-boundary.test.js` now passes. The unchanged `probe-expired-reevaluation.js` now observes DENY / PERMIT_EXPIRED for repeated evaluation, no returned permit, and zero Domain calls, adapter calls, and drafts. Raw TAP and reproduction output are preserved in `raw/reviewer-expiry-boundary.stdout` and `raw/expired-reevaluation-probe.stdout`. The original failed assertion remains unchanged in the original evidence directory. Four additional Builder regressions cover before/after ACTION_INTENT and BOS_DECISION clock-crossing hooks; the independent review did not use them as its substitute assertion.

## Independent tests and regression

The reviewer read the unchanged AGENTS.md and Architect contract, inspected the exact repair diff, and reran tests directly with Node `v22.20.0` and the new review worktree as cwd. The Builder runner was not imported or used. The reviewer is not Builder and made no candidate edits.

The independently authored fixture, broad adversarial test file, expiry assertion, and standalone probe were copied byte-for-byte from the preserved original review. Their SHA-256 values were verified on copy and again at finalization; no assertion or fixture was adapted for the repair. Only runner workspace/pins, parent/base scope checks, counts, and preservation metadata were adapted.

| Group | Pass | Fail | Total |
|---|---:|---:|---:|
| DRAFT repository | 176 | 0 | 176 |
| Historical Pre-Effect repository | 188 | 0 | 188 |
| Controlled Publish repository | 80 | 0 | 80 |
| Historical BOS READ/DRAFT | 40 | 0 | 40 |
| REG4 Builder / independent | 27 | 0 | 27 |
| MG5 Builder / independent | 48 | 0 | 48 |
| Historical external Controlled Publish independent | 152 | 0 | 152 |
| Historical external Pre-Effect independent | 173 | 0 | 173 |
| Unchanged reviewer adversarial tests | 222 | 0 | 222 |
| Unchanged reviewer expiry boundary regression | 1 | 0 | 1 |
| **Combined** | **1107** | **0** | **1107** |

Repository tests: **559/559 PASS**. Unchanged historical external tests: **325/325 PASS**. Regression subtotal: **884/884 PASS**. Reviewer-owned tests: **223/223 PASS**. Zero tests were cancelled, skipped, or todo.

The unchanged independent suite covers zero-effect ALLOW, separate Application Service invocation, full permit bindings, copied/serialized/Proxy/cross-instance permits, authority mutation at trust callbacks, real REG4 retirement, fixed permit lifetime, rollback, Domain veto/revision changes, required audit failures, hostile input and exception sanitization, safe correlation/hash chains, partial/unknown effects, action/key conflicts, sequential/Promise-scheduled/nested replay, draft-copy isolation, and exports beyond the input collection limit. The targeted repair does not change these tested behaviors.

## Identity, unchanged baselines, and preservation

The new worktree was clean and detached at the exact commit/tree above before and after tests. All **4167 tracked paths** have identical before/after Git blob and working-byte hash inventories. Inventory SHA-256: `bbf18972bd0ece3b19d3b2efe1570853635d179621e678a4ea19a1dec144b6c3`.

Against the original documentation base, scope is exactly the four additive candidate files: DRAFT source, DRAFT test, Architect contract, and build record. Against original candidate `38a4dd853100f022843758360464206bfb1e0e58`, the repair changes only source, test, and build record. The source delta is one final expiry check; the test delta is four added regressions; the build record preserves the original finding and round-one repair. The Architect contract is unchanged. Existing source/tests, historical evidence, READ/Publish/BOS, REG4, MG5, and OC6 remain unchanged. Approved technical ancestor `a4c80f30e3afcf8d0c2fec43d8634368890b383d` remains in ancestry.

The original failed review is preserved: all **142 files**, including the original manifest and seal, matched their original hashes before and after this rerun. The original manifest SHA-256 remains `cbbcbb46f9db0cd24ed8027b754a37dfba05b75553465b289260d6103289cdf8`. Its original worktree is still clean and detached at `38a4dd853100f022843758360464206bfb1e0e58`, tree `db3c9c873037b6f01bae640b2cf7b750da39f1e2`; all 4167 original tracked working-file hashes matched the original inventory before and after. No original artifact was rewritten.

The repaired DRAFT source has Git blob `6ffa35a38fecdb73df759fa28c7779bfa0f58edd` and canonical Git-byte SHA-256 `93892ff9fd116fdb89e4c9493d0bf63ba151a8a758b660df208f6b18e723dc50`. The repaired DRAFT test has Git blob `0ea629264b890c8fb6fc8fc5d8584e72bb9c2e9d` and canonical SHA-256 `ffa96bb6658922174ea3fca7033bcc13c615f579b6fa296db771612f081f0291`. The manifest records equivalent identities for every rerun repository source/test, separate raw checkout hashes, and historical external fixture/test hashes matching evidence commit `18fd91bbc7e6ae8bfe10f4519219a4c53642d83e`. Historical external files were run unchanged.

## Evidence and limits

The final manifest includes full commands, cwd, UTC start/end times, exit codes, TAP counts, exact pins, source/test Git blobs and canonical SHA-256 values, copied-test provenance, original-preservation checks, tracked-file hashes, and SHA-256 values for every artifact. Raw stdout/stderr, reviewer tests/fixture/probe, runner, and report are retained. `independent-manifest.sha256` seals the final manifest without a self-hash cycle.

A reviewer-only runner startup syntax error occurred before any candidate/test execution: a quoting conversion in the new preservation helper produced an invalid JavaScript string. Its failed runner/preparation sources, replayed raw stdout/stderr, and command metadata are preserved under `startup-failure/`. Only that runner helper was corrected; no candidate repair, fixture edit, or test assertion change was involved. This tooling failure is reported separately from the completed 1107/1107 test results and did not consume a candidate repair round.

Repairs used: **1/2**. All proof data, authority clocks, Domain, adapter, and effects are synthetic and in memory. Evidence covers a single process, including Promise scheduling and nested callbacks; it does not establish distributed persistence, recovery, or production safety. No network, real model, OpenClaw, database, Runtime, Production, repository edit, commit, push, branch creation, or baseline approval was performed by this reviewer. OC6 remains **PAUSED at G0**. Founder APPROVE/DENY remains separate.

## Authority at handoff

PASS is a proof/review result, not Founder baseline approval. OC6 remains PAUSED
at G0. No real OpenClaw/model, network business operation, database, Runtime,
Production, main merge, force push, tag or release has been authorized by review.
