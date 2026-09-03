# BOS-AI1 DRAFT Pre-Effect Handoff — Formal Traceable Test

Result: **PASS**. Exact technical candidate, not baseline self-approval.

| Identity | Value |
|---|---|
| Technical commit | `a0fbabb9e210b4fdf2ad2e7fc2b8e9f89200d0d0` |
| Technical tree | `6d0e3895400599570aefffaa14430231c1dfa443` |
| Direct parent | `38a4dd853100f022843758360464206bfb1e0e58` |
| Workspace | `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_DRAFT_PRE_EFFECT_FTT_R1_WORKSPACE` |
| Environment | Node v22.20.0, git version 2.54.0.windows.1, win32 |
| Before/after | Detached exact candidate, CLEAN, unchanged |
| Repairs used | 1/2 |

## Formal inventory

| Group | PASS | Raw stdout SHA-256 |
|---|---:|---|
| draft | 176/176 | `76940156753fb382dbd7be2784427621db0f7fe7c32ef09f5884f39b83d3b977` |
| baseline-regression | 383/383 | `e4409a3fb6ac09d9e0f9ae85d23fe51cd46e71746589a6d958e949edc15d32ee` |
| historical-controlled-publish | 152/152 | `3eac8d4b50049cb27a53a19426bc061961e47e35e8953e0387bfaf640f033391` |
| historical-pre-effect | 173/173 | `144709edbbec5f01eaf9cdc6589a973105946abb7c32bb1bcb4a4bb65ef68434` |
| **Unique formal total** | **884/884** | |

Failures, cancellations, skipped and todo tests: 0. DRAFT176 covers handoff with
zero draft, pre-effect audit failure, Domain ALLOW/DENY/STOP, late Agent and
authority mutation, tenant/resource/version and permit binding, sequential/
Promise-scheduled/nested duplicates, action-key conflict, safe correlated audit,
failure/compensation receipts and growing ledgers. Existing 708 tests preserve
READ/DRAFT, Controlled Publish, Pre-Effect Publish, REG4 and MG5 behavior.

Historical independent assertions and fixture were extracted byte-for-byte from
evidence commit `18fd91bbc7e6ae8bfe10f4519219a4c53642d83e` and their SHA-256
verified; only execution cwd selects this exact worktree. No fixture/assertion
change or new dependency was needed.

## Source binding

| File | Git blob | Canonical Git SHA-256 |
|---|---|---|
| tools/bos-ai1/draft-pre-effect-handoff-proof.js | `6ffa35a38fecdb73df759fa28c7779bfa0f58edd` | `93892ff9fd116fdb89e4c9493d0bf63ba151a8a758b660df208f6b18e723dc50` |
| tools/bos-ai1/draft-pre-effect-handoff-proof.test.js | `0ea629264b890c8fb6fc8fc5d8584e72bb9c2e9d` | `ffa96bb6658922174ea3fca7033bcc13c615f579b6fa296db771612f081f0291` |

Windows worktree hashes are separately recorded in the manifest because checkout
line endings may differ from canonical Git blobs. Technical claims use the full
commit/tree above and those canonical source/test blobs.

## Execution and retained evidence

Runner: `run-tests-round1.cjs` in the portable evidence. It requires the supplied
commit/tree, detached clean worktree, exact four-path candidate diff, preserved
baseline files, zero unexpected test outcomes and identical before/after state.

Each manifest group records executable/argument array, cwd, UTC start/end, exit
code, TAP counts, stdout/stderr paths and SHA-256. Tests ran from
2026-09-03T08:45:56.475Z to 2026-09-03T08:46:01.038Z.
Original command logs, regression source, provenance and runner are embedded in
the final portable evidence; development round0 evidence is retained separately
and does not substitute the exact-commit formal run.

Scope at technical freeze: four new files; planned final scope eight of ten.
No existing source/test, REG4/MG5, OC6, Business Rules, dependency, database or
migration changed. No live OpenClaw/model/network business operation, Runtime or
Production. This test result is not OC6 G0 execution or baseline approval.
