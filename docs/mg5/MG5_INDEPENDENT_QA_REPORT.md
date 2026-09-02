# MG5 Proof V1 — Independent QA Report

## Disposition

**PASS FOR FTT**

Independent QA found no candidate-related P0, P1 or P2 defect in the synthetic,
deterministic, in-memory MG5 proof scope. This disposition is a proof gate only;
it is not Production approval and does not authorize a real model, API, data,
credential, business write, approval, publication or deployment.

## Files owned by Independent QA

1. `qa/mg5/model-gateway-proof.independent.test.js`
2. `docs/mg5/MG5_INDEPENDENT_QA_REPORT.md`

Independent QA did not edit the implementation contract, MG5 source, Builder
test/report, REG4/BOS-AI1 source or tests, application code, package/lock files,
database, migration or deployment paths.

## Execution results

| Gate | Command | Result | Duration |
|---|---|---:|---:|
| Initial independent run | `node --test qa/mg5/model-gateway-proof.independent.test.js` | `11/12 PASS`, `1 FAIL` | `291.7592 ms` |
| Corrected independent run | `node --test qa/mg5/model-gateway-proof.independent.test.js` | `12/12 PASS`, `0 FAIL` | `323.9473 ms` |
| Builder rerun | `node --test tools/mg5/model-gateway-proof.test.js` | `36/36 PASS`, `0 FAIL` | `247.1197 ms` |
| Combined MG5 | `node --test tools/mg5/model-gateway-proof.test.js qa/mg5/model-gateway-proof.independent.test.js` | `48/48 PASS`, `0 FAIL` | `418.5613 ms` |

The initial failure was an Independent-QA harness/oracle error, not a candidate
failure. The first helper computed SHA-1 directly from raw checked-out bytes,
which did not apply Git's path/content normalization. The expected constant was
not weakened or changed. The QA-only helper was corrected to use read-only
`git hash-object <path>`, after the REG4 and BOS-AI1 baseline and parent path
OIDs had been independently verified. All required gates then passed.

## Severity and completeness

| Severity | Open candidate findings |
|---|---:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |

The corrected Independent QA suite has 12 grouped tests using its own REG4
Agent, company, policy, catalog, budget, adapter, validator, audit and hostile
boundary fixtures. Collectively it maps every proof requirement `P01`–`P17`
and every mandatory adversarial item `ADV-01`–`ADV-17`.

## P01–P17 trace mapping

| QA group | Contract coverage |
|---|---|
| 01 | `P01`, `P10`, `P11`: real REG4 APPROVED record, exact fingerprint, both evidence types, trusted permission, baseline mismatch and forged authority denial |
| 02 | `P02`, `P03`: exact APPROVED catalog version, exact three-method surface, policy allowlist ordinal and forbidden caller routing |
| 03 | `P04`, `P10`, `P11`, `P12`: Company Context, forged claims, D0–D4 behavior and nested secret denial |
| 04 | `P05`, `P13`: safe-integer validation, reservation/charge/release, arithmetic overflow, request limit and company budget |
| 05 | `P06`, `P07`: canonical transient retry, same-boundary fallback, retry/fallback/call caps and cross-boundary rejection |
| 06 | `P08`, `P12`, `P16`: strict frozen output, `UNTRUSTED`, `NONE`, frozen adapter input and malformed/secret output denial |
| 07 | `P14`: identical replay, conflict, reentrant in-flight delivery and replay with insufficient remaining reserve budget |
| 08 | `P11`, `P15`: T1 policy, model, authority, company and budget change denial with zero adapter calls |
| 09 | `P09`, `P16`: one terminal safe hash-linked record, prepare gate and fail-safe terminal commit handling |
| 10 | `P12`, `P16`: hostile getter, Proxy, Symbol, prototype, depth and arbitrary throw containment at all trust boundaries |
| 11–12 | `P17`: static dependency/effect exclusions, frozen authority constants, and exact REG4/BOS-AI1 Git blob OIDs |

## ADV-01–ADV-17 trace mapping

| QA group | Adversarial coverage |
|---|---|
| 01, 03 | `ADV-01`, `ADV-02`, `ADV-03` |
| 04 | `ADV-04`, `ADV-05`, `ADV-06`, `ADV-07` |
| 07 | `ADV-08` |
| 08 | `ADV-09`, `ADV-10` |
| 06 | `ADV-11` |
| 09 | `ADV-12`, `ADV-13` |
| 05 | `ADV-14`, `ADV-15`, `ADV-16` |
| 10 | `ADV-17` |

## Independent evidence summary

- The real REG4 registry was used to register, review and approve an independent
  synthetic Agent. QA separately tested evidence, `model.request`, fingerprint
  and exact REG4/BOS baseline gates.
- The gateway instance exposed exactly `invoke`, `listAuditRecords` and
  `getBudgetSnapshot`. Policy allowlist order won over model quality/cost, and
  provider/model/region/retry/threshold caller fields were rejected.
- D0–D3 allowed only under the proof policy, the D3 owner requirement returned
  STOP, D4 was denied, wrong-company and forged claims were denied, and nested
  input/output secret markers did not enter audit records.
- Negative, fractional, NaN, Infinity, unsafe and overflowing values failed
  closed. Maximum cost was reserved before invocation; attempts were charged
  and unused reserve released. Limit and company-budget failures made zero calls.
- Only the exact canonical transient result retried. Primary attempts were capped
  at two, same-boundary fallback at one and total invocations at three. Provider,
  region, data-capability-set and safety-class mismatches prevented fallback.
- Valid output and adapter input were deeply frozen; released output was strictly
  shaped, `UNTRUSTED` and `business_effect: NONE`. Invalid output was not released.
- Identical completed replay made no new call or charge even after remaining
  reserve budget was reduced below the plan maximum. Conflicting and in-flight
  reentrant delivery were contained.
- Policy/model/authority/company/budget changes at T1 made zero adapter calls and
  left no active budget reservation.
- Hostile getters, Proxies, Symbols, prototypes, excessive depth and arbitrary
  thrown values were contained across request, resolvers, adapter, validator,
  audit and clock boundaries without allowing forged decisions or leaking markers.
- Static inspection found only Node crypto and the real REG4 fingerprint import
  in the candidate source, with no network, environment-secret, database,
  external-package or business-effect capability.

## Audit completeness

Independent fixtures verified exactly one terminal ledger record per invocation,
monotonic sequence values, zero-hash genesis, predecessor hash linkage and an
independent recomputation of each terminal record SHA-256. Records contained
digests and bounded identifiers rather than raw payload, output or exception
material. Audit preparation failure made zero adapter calls. Terminal commit
failure changed the result to `DENY/AUDIT_UNAVAILABLE`, emitted exactly one
`FAILSAFE` terminal record with no output digest, and released no output.

## Verified authority/blob constants

- REG4 source blob: `be69c77be7559f8fb2ccf896612e65e0f605b595`
- BOS-AI1 source blob: `05f51d90b4f187d95682b58f75430f88bad9f82d`
- BOS-AI1 test blob: `ece5780d08899d4b07caf846dec88452722074dd`

The exact parent, REG4 and BOS-AI1 commit/tree constants and the six fixed proof
policy limits were also asserted, including deep-frozen constant objects.

## Limitations

- The proof is synchronous, synthetic and in memory; it does not establish
  durability, tamper resistance, distributed atomicity or crash recovery.
- Fake adapters do not establish real provider/API security, privacy, latency,
  quality, billing, quota or availability behavior.
- D0–D4 labels, numeric cost units and thresholds are proof-only policy.
- No Production Agent, tenant data, credential, model, network, database,
  migration, Business OS mutation, deployment or runtime integration was tested.
- This QA report supports the Formal Traceable Test gate only. Later evidence,
  provenance, review and clean commit/tree gates remain separate obligations.

## Final statement

At the tested workspace state, corrected Independent QA is `12/12 PASS`, the
Builder suite is `36/36 PASS`, and the combined MG5 suite is `48/48 PASS`, with
P0 = 0, P1 = 0 and P2 = 0. **MG5 Proof V1 is PASS FOR FTT.**
