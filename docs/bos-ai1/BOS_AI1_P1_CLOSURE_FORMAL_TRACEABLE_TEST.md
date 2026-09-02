# BOS-AI1 V1.2B P1 Closure — Formal Traceable Test

## Result and binding

- Result: `PASS`.
- Failed evidence candidate retained unchanged: commit `bfca56ef3fe242f2595813e734d8a6b3b94341e0`, tree `a5f9c21afc9c379f5de9bd17a2d3d8d3cef2d788`.
- Technical closure commit tested: `f44c14365589b7ff9f1df2ce40185ef8ebece05f`.
- Technical closure tree tested: `f17e4c4f699335ddad056310c8d70e3ed3df6909`.
- Direct parent: `bfca56ef3fe242f2595813e734d8a6b3b94341e0`.
- REG4 Technical Baseline: commit `3def40122e4072f266c943bc4eb84d3164501339`, tree `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`.
- Test workspace: `C:\Projects\Quanlycongviec-bos-ai1-proof-v1_2b-p1-closure-ftt`.
- Checkout mode: detached HEAD; clean before and after Formal Traceable Test.

The result applies only to the technical commit and tree above. It is not transferred to a later documentation commit.

## Environment

- OS: Microsoft Windows NT `10.0.26200.0`.
- Node.js: `v22.20.0`.
- npm: `10.9.3`.
- Git: `2.54.0.windows.1`.
- Test runner: built-in `node:test`; no dependency added.

## Exact test inventory

| Gate | Command | Result |
|---|---|---:|
| E01–E09 | `node --test --test-name-pattern="^E" tools/bos-ai1/project-progress-brief-proof.test.js` | 9/9 PASS |
| C01–C09 | `node --test --test-name-pattern="^C" tools/bos-ai1/project-progress-brief-proof.test.js` | 9/9 PASS |
| A01–A07 | `node --test --test-name-pattern="^A" tools/bos-ai1/project-progress-brief-proof.test.js` | 7/7 PASS |
| T01–T06 | `node --test --test-name-pattern="^T" tools/bos-ai1/project-progress-brief-proof.test.js` | 6/6 PASS |
| L01–L05 | `node --test --test-name-pattern="^L" tools/bos-ai1/project-progress-brief-proof.test.js` | 5/5 PASS |
| P1 closure | `node --test --test-name-pattern="^P1C-" tools/bos-ai1/project-progress-brief-proof.test.js` | 4/4 PASS |
| BOS-AI1 full | `node --test tools/bos-ai1/project-progress-brief-proof.test.js` | 40/40 PASS |
| REG4 Builder | `node --test tools/reg4/agent-registry.test.js` | 13/13 PASS |
| REG4 Independent QA | `node --test qa/reg4/agent-registry.independent.test.js` | 14/14 PASS |
| REG4 combined | both REG4 test files | 27/27 PASS |
| Full combined regression | BOS-AI1 plus both REG4 test files | 67/67 PASS |

All commands exited `0`. `git diff --check` passed.

## P1 closure trace

| Test | Required evidence | Observed result |
|---|---|---|
| P1C-01 | hostile Proxy/thrown value cannot control error metadata | safe `DENY/INVALID_REQUEST`; zero draft; exactly one audit; attacker text absent |
| P1C-02 | final REG4 state is checked after the final external resolver | retirement is `DENY/AGENT_RETIRED`; zero draft; exactly one audit |
| P1C-03 | unresolved non-`none` approver fails closed | `DENY/FORGED_AUTHORITY`; zero draft; claim retained safely; verified approver is null; exactly one audit |
| P1C-04 | reentrant identical delivery cannot create two drafts | nested call creates one draft; outer call returns duplicate; two invocations have two linked audits |

For P1C-04, the audit effects are `DRAFT_CREATED` then `DUPLICATE_RETURNED`; duplicate flags are `false` then `true`. This is one audit per invocation, not a duplicate audit for one invocation.

## R01–R04 and scope

- R01: authorized BOS-AI1 and REG4 regression passed, including full combined 67/67.
- R02: four changed paths at the technical commit, within the Founder limit of ten.
- R03: no database, migration, dependency, REG4 source/test, MG5, OC6, OpenClaw, Runtime or Production path changed.
- R04 at test time: no push, tag, merge or release; the technical commit has one parent, no tag points at it, and no remote branch contains it. The later exact-branch push is governed only by the newer P1 Closure Fast Track authorization.

## Formal verdict

Formal Traceable Test: `PASS`. This proves only the in-memory BOS-AI1 proof envelope. It does not authorize a baseline, production, durable audit, MG5, OC6, OpenClaw, Runtime, merge, tag or release.
