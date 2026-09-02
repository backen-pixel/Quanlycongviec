# MG5 Proof V1 — Builder Report

## Delivery status

Builder implementation and Builder-owned tests are **PASS** for the synthetic,
deterministic, in-memory MG5 proof scope. Both permitted repair rounds were
used. This report is implementation evidence only; it does not approve the MG5
Proof Baseline and does not authorize Production use.

## Authority and ancestry verified before implementation

| Record | Commit | Tree / blob |
|---|---|---|
| Authorized parent | `057de036f9434b6acdd1951b556bc2cbd77cd881` | tree `6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf` |
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` | tree `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |
| REG4 source | — | blob `be69c77be7559f8fb2ccf896612e65e0f605b595` |
| BOS-AI1 Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | tree `f17e4c4f699335ddad056310c8d70e3ed3df6909` |
| BOS-AI1 source | — | blob `05f51d90b4f187d95682b58f75430f88bad9f82d` |
| BOS-AI1 test | — | blob `ece5780d08899d4b07caf846dec88452722074dd` |

The implementation imports the real REG4 fingerprint function with
`require('../reg4/agent-registry')`. Builder tests instantiate the real REG4
registry and register/review/approve a synthetic Agent carrying both required
evidence types and the trusted `model.request` permission.

## Builder-owned files

1. `tools/mg5/model-gateway-proof.js`
2. `tools/mg5/model-gateway-proof.test.js`
3. `docs/mg5/MG5_BUILDER_REPORT.md`

No Builder change was made to the Architect contract, QA files, REG4/BOS-AI1
source or tests, package/lock files, application code, database or migrations.

## Implemented proof boundaries

- Exact parent, REG4 and BOS-AI1 identity binding.
- Current REG4 package/fingerprint/evidence/approval and `model.request` checks.
- Trusted authority, Company Context and proof-only D0–D4 egress checks.
- Strict own-data-descriptor snapshots with bounded depth, size and dense arrays.
- Module-private decision provenance and canonical failure reasons.
- Policy-ordinal deterministic fake-model selection, followed by quality, cost,
  latency and ASCII ordering inside the applicable policy priority.
- Safe-integer maximum-cost calculation, reservation, per-attempt charging and
  unused reservation release.
- Completed duplicate recovery before a new reservation, conflict denial and
  in-flight reentrant containment, while preserving final T1 revalidation and
  terminal audit.
- Bounded canonical transient retry and one same-provider, same-region,
  same-capability-set and same-safety-class fallback.
- Strict output validation with `UNTRUSTED` trust and `business_effect: NONE`.
- Audit prepare gate, hash-linked terminal audit and fail-safe terminal-writer
  containment without raw payload, output or exception material.

The gateway instance surface is exactly `invoke`, `listAuditRecords` and
`getBudgetSnapshot`.

## Trace coverage

The final Builder suite contains explicit named coverage for every contract
item `P01` through `P17` and every mandatory adversarial inventory item
`ADV-01` through `ADV-17`. It also includes two focused regressions:

- `P03-R`: policy allowlist ordinal precedes model score/cost/latency/ASCII.
- `P14-R`: a completed duplicate makes zero new calls and zero new charges even
  when the remaining company budget cannot reserve the plan maximum again.

Hostile fixtures cover Proxy traps, accessors and arbitrary thrown values at
the request, REG4, authority, Company Context, policy, catalog, budget, clock,
hook, adapter, validator and audit boundaries.

## Builder run history and repair accounting

| Run | Result | Finding / correction |
|---|---:|---|
| Initial Builder run | `6/34 PASS`, `28 FAIL` | Git commit/tree identities were incorrectly validated as 64-hex SHA-256 instead of exact lowercase 40-hex object IDs. |
| Repair round 1/2 | `33/34 PASS`, `1 FAIL` | Corrected Git object-ID validation; remaining D4 decision was shadowed by the general data-class allowlist. |
| Repair round 2/2 | `36/36 PASS`, `0 FAIL` | Corrected D4 precedence and added/fixed duplicate-budget, policy-ordinal and exact-surface regressions. Duration `166.3173 ms`. |

Repair budget used: **2/2**. No third repair round is available.

## Commands executed

```text
node --check tools/mg5/model-gateway-proof.js
node --test tools/mg5/model-gateway-proof.test.js
node --test tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js
node --test tools/bos-ai1/project-progress-brief-proof.test.js
```

Final syntax check and all test commands passed.

## Predecessor regression results

| Suite | Result | Duration |
|---|---:|---:|
| MG5 Builder | `36/36 PASS`, `0 FAIL` | `166.3173 ms` |
| REG4 Builder + Independent QA combined | `27/27 PASS`, `0 FAIL` | `164.5488 ms` |
| BOS-AI1 predecessor | `40/40 PASS`, `0 FAIL` | `189.8694 ms` |
| Total executed at this gate | `103/103 PASS`, `0 FAIL` | — |

## Explicit exclusions and safety statement

This proof uses only Node.js built-ins, deterministic synchronous fake adapters
and synthetic in-memory data. It has no network or real model/API access, no
credentials or Production data, no external dependency, no database/migration,
no business write/approval/publish authority and no business effect. OC6,
OpenClaw, Business AI Runtime and Production were not opened. Nothing was
merged to `main`, tagged, released, pushed or committed by the Builder.
