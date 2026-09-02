# MG5 Proof V1 — Formal Traceable Test

## Disposition

**PASS TO INDEPENDENT REVIEW**

This FTT binds and verifies the technical candidate only. It is not Founder
approval, does not establish a Production baseline, and grants no authority to
open OC6, OpenClaw, Business AI Runtime or Production.

## Exact tested object

| Object | Identity |
|---|---|
| Authorized parent | `057de036f9434b6acdd1951b556bc2cbd77cd881` |
| Parent tree | `6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf` |
| Technical candidate | `c0ba1b282422c68bd96478d7585f2c2381198420` |
| Technical candidate tree | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |
| Candidate parent | `057de036f9434b6acdd1951b556bc2cbd77cd881` |

The test was executed from clean detached worktree
`C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\SX1_XLSX_SECURITY_REMEDIATION_2026-09-01\MG5_FTT_c0ba1b28`.
`git status --porcelain=v1` was empty, and HEAD/tree/parent matched the table
before the gates. The worktree remained unchanged after testing.

## Test results at the exact candidate

| Gate | Result | Duration |
|---|---:|---:|
| MG5 Builder | `36/36 PASS`, `0 FAIL` | `537.6334 ms` |
| MG5 Independent QA | `12/12 PASS`, `0 FAIL` | `1002.6019 ms` |
| MG5 combined | `48/48 PASS`, `0 FAIL` | `785.3441 ms` |
| REG4 Builder + Independent QA | `27/27 PASS`, `0 FAIL` | `218.1459 ms` |
| BOS-AI1 predecessor | `40/40 PASS`, `0 FAIL` | `355.0875 ms` |
| All proof and predecessor suites combined | `115/115 PASS`, `0 FAIL` | `1026.7454 ms` |
| Deterministic MG5 rerun | `48/48 PASS`, `0 FAIL` | `951.7969 ms` |

Commands:

```text
node --test tools/mg5/model-gateway-proof.test.js
node --test qa/mg5/model-gateway-proof.independent.test.js
node --test tools/mg5/model-gateway-proof.test.js qa/mg5/model-gateway-proof.independent.test.js
node --test tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js
node --test tools/bos-ai1/project-progress-brief-proof.test.js
node --test tools/mg5/model-gateway-proof.test.js qa/mg5/model-gateway-proof.independent.test.js tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js tools/bos-ai1/project-progress-brief-proof.test.js
```

## Scope and provenance checks

The candidate is an exact one-parent descendant of the authorized parent and
changes six paths:

1. `docs/mg5/MG5_BUILDER_REPORT.md`
2. `docs/mg5/MG5_INDEPENDENT_QA_REPORT.md`
3. `docs/mg5/MG5_PROOF_IMPLEMENTATION_CONTRACT.md`
4. `qa/mg5/model-gateway-proof.independent.test.js`
5. `tools/mg5/model-gateway-proof.js`
6. `tools/mg5/model-gateway-proof.test.js`

This is within the closed `6/20` technical-candidate path limit. `git diff
--check` passed. No package or lock file, REG4/BOS-AI1 source/test, application,
database, migration, runtime or deployment path changed.

The predecessor bindings were recomputed at the candidate and matched their
technical baselines exactly:

| Binding | Candidate blob | Baseline blob |
|---|---|---|
| REG4 source | `be69c77be7559f8fb2ccf896612e65e0f605b595` | `be69c77be7559f8fb2ccf896612e65e0f605b595` |
| BOS-AI1 source | `05f51d90b4f187d95682b58f75430f88bad9f82d` | `05f51d90b4f187d95682b58f75430f88bad9f82d` |
| BOS-AI1 test | `ece5780d08899d4b07caf846dec88452722074dd` | `ece5780d08899d4b07caf846dec88452722074dd` |

Static inspection of the proof source found only `node:crypto` and the real
`../reg4/agent-registry` import. It found no network client, environment-secret
access, real provider/API, external dependency, database, business-write or
publish capability.

## Traceability and repair accounting

Builder tests explicitly cover `P01`–`P17` and `ADV-01`–`ADV-17`; Independent
QA covers the same inventory with separate fixtures and grouped oracles. The
FTT reran both suites together and with all predecessor regressions.

Builder used the complete authorized repair allowance:

- initial run: `6/34 PASS`;
- repair round 1/2: `33/34 PASS`;
- repair round 2/2: `36/36 PASS`.

Independent QA initially had `11/12 PASS` because its own helper calculated a
raw-byte SHA-1 instead of a Git blob OID. The expected baseline did not change;
the QA-only helper was corrected to calculate the Git object identity, after
which Independent QA passed `12/12`. This did not modify or repair the
technical candidate.

## Boundary statement

All tests use synthetic data, fake synchronous adapters and in-memory policy,
budget and audit state. Output remains `UNTRUSTED` with
`business_effect: NONE`. The FTT does not prove durability, distributed
atomicity, crash recovery, real-provider behavior, real privacy/billing/latency
properties, or Production readiness.

No merge to `main`, force-push, tag or release occurred. No forbidden phase was
opened.

## Final FTT verdict

The exact technical candidate and tree are **PASS TO INDEPENDENT REVIEW** with
all required tests green, predecessor blobs unchanged, closed scope preserved,
and no mandatory STOP condition observed at the FTT gate.
