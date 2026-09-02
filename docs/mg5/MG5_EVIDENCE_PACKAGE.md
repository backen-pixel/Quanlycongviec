# MG5 Proof V1 — Evidence Package

## Decision disposition

**READY FOR FOUNDER DECISION: APPROVE / DENY MG5 PROOF BASELINE**

This package establishes a proof-only candidate. Approval would baseline only
the synthetic, deterministic, in-memory MG5 proof represented by the final
`proof/mg5-v1` branch head and its embedded technical candidate. It would not
authorize OC6, OpenClaw, Business AI Runtime, Production, a real provider/API,
real data or credentials, a business effect, merge to `main`, tag or release.

## Bound technical candidate

| Item | Identity |
|---|---|
| Authorized parent | `057de036f9434b6acdd1951b556bc2cbd77cd881` |
| Parent tree | `6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf` |
| Technical candidate | `c0ba1b282422c68bd96478d7585f2c2381198420` |
| Technical candidate tree | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |
| Technical changed paths | `6/20` |
| Final evidence paths | `11/20` |
| Builder repairs used | `2/2` |

The final evidence-record commit/tree is the branch head containing this
package and is reported with the Founder decision request after local and
remote identity verification.

## What the proof implements

The proof provides a closed model-request admission path over synthetic data:

1. strict request and exact REG4/BOS baseline binding;
2. current real-REG4 package fingerprint, evidence, approval and
   `model.request` verification;
3. trusted authority and Company Context resolution;
4. proof-only D0–D4 and secret containment;
5. deterministic policy-ordinal fake catalog/model selection;
6. safe-integer symbolic maximum cost, reservation, charging and release;
7. bounded canonical transient retry and one same-boundary fallback;
8. duplicate/conflict/reentrant idempotency containment and T1 revalidation;
9. strict output validation with `UNTRUSTED` and `business_effect: NONE`;
10. one bounded terminal hash-linked audit record, with prepare and fail-safe
    terminal-writer handling.

The gateway instance exposes exactly `invoke`, `listAuditRecords` and
`getBudgetSnapshot`. It has no business-write or publish method.

## Verification summary

| Gate | Result |
|---|---:|
| Builder final | `36/36 PASS` |
| Independent QA corrected run | `12/12 PASS` |
| MG5 combined | `48/48 PASS` |
| REG4 predecessor | `27/27 PASS` |
| BOS-AI1 predecessor | `40/40 PASS` |
| Orchestrator clean FTT combined | `115/115 PASS` |
| Orchestrator deterministic MG5 rerun | `48/48 PASS` |
| Independent Review combined | `115/115 PASS` |
| Independent Review deterministic rerun | PASS, exit `0` |

Coverage is explicit for every `P01`–`P17` requirement and every
`ADV-01`–`ADV-17` adversarial item. The final evidence-record HEAD is rerun
through the combined 115-test gate before delivery.

## Findings and audit disposition

| Severity | Open findings |
|---|---:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |

Independent QA and Independent Review both concluded that audit evidence is
complete for the proof scope. Tests independently verify one terminal record
per invocation, monotonic sequence, zero-hash genesis, predecessor linkage,
terminal SHA-256 recomputation, safe bounded fields, absence of raw
prompt/payload/output/error/secret content, prepare failure with zero adapter
call and commit failure with no output release.

## Baseline integrity

- REG4 Technical Baseline:
  `3def40122e4072f266c943bc4eb84d3164501339`, tree
  `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`.
- BOS-AI1 Technical Baseline:
  `f44c14365589b7ff9f1df2ce40185ef8ebece05f`, tree
  `f17e4c4f699335ddad056310c8d70e3ed3df6909`.
- REG4 source blob remained
  `be69c77be7559f8fb2ccf896612e65e0f605b595`.
- BOS-AI1 source/test blobs remained
  `05f51d90b4f187d95682b58f75430f88bad9f82d` and
  `ece5780d08899d4b07caf846dec88452722074dd`.

There are no package/lockfile, predecessor source/test, application, database,
migration, runtime or deployment changes.

## Limits that remain explicit

This proof does not establish persistent or distributed idempotency, durable or
tamper-resistant audit, crash recovery, multi-process concurrency, real-model
quality, provider security/privacy, real latency/availability, quota/billing or
Production policy. D0–D4 labels and cost units are proof fixtures. All adapters,
data and budgets are synthetic and synchronous.

## Founder decision requested

Founder is asked to choose exactly one outcome after the final branch head and
remote identity are reported:

- **APPROVE MG5 PROOF BASELINE** — approve only the proof boundary and exact
  final commit/tree delivered on `proof/mg5-v1`.
- **DENY MG5 PROOF BASELINE** — do not establish the proof baseline.

Neither outcome implicitly opens a later phase. Any OC6/OpenClaw, Business AI
Runtime or Production work requires separate explicit authority.
