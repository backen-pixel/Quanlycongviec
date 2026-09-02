# MG5 Model Gateway Proof V1 — Implementation Contract

> Authority: Founder-approved MG5 Design Baseline V1 and Proof Implementation Fast Track
>
> Mode: synthetic, deterministic, in-memory proof only
>
> Architect gate: **READY FOR BUILDER — MG5 PROOF ONLY**

## 1. Exact authority and ancestry

| Record | Commit | Tree |
|---|---|---|
| Authorized implementation parent | `057de036f9434b6acdd1951b556bc2cbd77cd881` | `6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf` |
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |
| BOS-AI1 Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | `f17e4c4f699335ddad056310c8d70e3ed3df6909` |

The authorized parent contains both technical baselines. At the parent, the
REG4 source blob is `be69c77be7559f8fb2ccf896612e65e0f605b595`.
The BOS-AI1 source/test blobs are
`05f51d90b4f187d95682b58f75430f88bad9f82d` and
`ece5780d08899d4b07caf846dec88452722074dd`.

This proof uses the real REG4 module with synthetic Agent data. It may not
modify REG4 or BOS-AI1 source or tests.

## 2. Ownership boundary

MG5 controls only model-request admission, fake catalog/version selection,
proof data-egress policy, symbolic cost/budget, bounded retry/fallback, output
validation and model-call audit.

MG5 does not own Agent identity/lifecycle, canonical Business Rules, business
write authority, business approval or official business state. Every model
output is `UNTRUSTED`; every result declares `business_effect: NONE`. No result
from this proof can publish, write, approve or mutate Business OS state.

## 3. Closed execution pipeline

```text
strict request snapshot
→ exact REG4/BOS baseline binding
→ current APPROVED REG4 package/fingerprint/evidence check
→ trusted authority and Company Context resolution
→ D0–D4 proof-only outbound-data policy
→ exact fake catalog/version validation
→ deterministic eligible plan
→ safe-integer maximum-cost check and budget reservation
→ idempotency/in-flight reservation
→ final REG4/authority/policy/catalog revalidation
→ audit readiness
→ bounded synchronous fake-adapter attempts
→ strict output validation
→ terminal safe audit
→ release output marked UNTRUSTED
```

Inputs from request, resolver, catalog, budget, adapter and validator are
untrusted data. They must be copied using own data descriptors. Proxy traps,
accessors, Symbols, sparse arrays, prototype changes and excessive depth/size
fail closed. Arbitrary thrown values cannot select a decision, reason or audit
field.

## 4. Fixed proof policy

| Limit | Value |
|---|---:|
| Maximum request cost units | `12` |
| Minimum quality score | `80` |
| Maximum latency units | `50` |
| Maximum adapter invocations | `3` |
| Maximum retries per model | `1` |
| Maximum fallback models | `1` |

All cost and counter values are non-negative safe integers. Selection uses the
policy allowlist first, then quality descending, cost ascending, latency
ascending and ASCII `model_id@version` order.

Retry is allowed only for an exact canonical `TRANSIENT_FAILURE` adapter
result. A throw or malformed result is not retryable. Output validation failure
is not retryable in V1.

Fallback is allowed only to a pre-approved fake model with the same provider,
region, complete data-class capability set and safety class. Cross-provider,
cross-region or cross-class fallback is forbidden.

Proof labels are `D0` public, `D1` internal, `D2` confidential, `D3`
restricted and `D4` secret/credential. A detected secret is always denied.
When D3 policy requires a real Domain Owner or another policy exception, the
proof returns STOP. D4 is denied. These labels and thresholds are not
Production policy.

## 5. P01–P17 trace matrix

| ID | Required proof behavior |
|---|---|
| `P01` | Exact baseline-bound, fingerprint-verified, currently APPROVED REG4 Agent with evidence and trusted `model.request` authority is required before any adapter call. |
| `P02` | Only exact fake catalog/model/version entries in APPROVED state are eligible. |
| `P03` | Selection is deterministic and the caller cannot choose provider, model, region, retry or thresholds. |
| `P04` | Company, use case, D0–D4, payload digest and model data capability all satisfy outbound policy; secret is denied and authority exception is STOP. |
| `P05` | Maximum plan cost is safely calculated and reserved before invocation; every actual attempt is charged and unused reserve released. |
| `P06` | Only canonical transient failure can retry the same model; retry and total invocation limits cannot be exceeded. |
| `P07` | At most one same-provider/same-region/same-class approved fallback follows primary exhaustion. |
| `P08` | Strict valid output is released only as `UNTRUSTED`; invalid output is not released and no business effect exists. |
| `P09` | Every request attempt has exactly one terminal safe hash-linked audit without raw prompt, response, exception or secret. |
| `P10` | Caller Agent/role/permission/company claims never create authority; REG4 and trusted resolvers are authoritative. |
| `P11` | Authority, policy, budget, catalog eligibility and claimed company must match before selection or data release. |
| `P12` | Secret/credential patterns in input or output are denied and absent from result/audit views. |
| `P13` | Negative, fractional, NaN, Infinity, unsafe, overflowing or over-limit numeric inputs fail closed with zero invocation. |
| `P14` | Completed identical duplicate does not call/charge again; conflict is denied; reentrant in-flight delivery cannot create a second call. |
| `P15` | REG4, authority, policy and catalog are re-read after the hook and immediately before invocation; changes deny with zero invocation. |
| `P16` | Resolver, adapter, validator and audit failures expose only canonical reasons; audit failure blocks calls when detected before invocation and always blocks output release. |
| `P17` | No network/API, secret, DB/migration, dependency or business effect; REG4/BOS blobs stay unchanged and all predecessor regressions pass. |

## 6. Mandatory adversarial inventory

The Builder and Independent QA suites must cover, with independent fixtures:

1. forged Agent/role/permission/package authority;
2. wrong company;
3. nested secret input and secret output;
4. negative or fractional catalog cost;
5. NaN, Infinity and unsafe-integer numeric values;
6. multiplication/addition overflow;
7. per-request and company-budget overflow;
8. same, conflicting and reentrant idempotent delivery;
9. policy change immediately before invocation;
10. selected model changing to BLOCKED/RETIRED before invocation;
11. malformed, accessor, oversized or secret-bearing output;
12. audit prepare failure with zero adapter call;
13. audit terminal failure with no output release;
14. repeated transient failures respecting every count/cost cap;
15. cross-provider fallback rejection;
16. cross-region/data-class/safety-class fallback rejection; and
17. hostile Proxy/getter/thrown values at every trust boundary.

## 7. Idempotency, budget and audit atomicity

An in-flight marker is installed before any adapter call. Same-key reentry
returns `DENY/REQUEST_IN_PROGRESS`; a same semantic request completed earlier
returns the safe stored receipt without a new call or charge; a different
semantic digest returns `DENY/IDEMPOTENCY_CONFLICT`.

The maximum cost is reserved before invocation. Actual attempts consume only
from that reservation. Unused units are released. No path may make more calls
or charge more cost than the fixed policy and reserved amount.

Audit preparation must succeed before invocation. A terminal-writer failure
uses a separate in-memory fail-safe record, changes the response to
`DENY/AUDIT_UNAVAILABLE`, and prevents output release. The proof ledger is not
durable, tamper-proof or Production-ready.

Permitted audit content is limited to bounded IDs/versions/digests, exact
baseline identities, policy/catalog/model versions, data class, canonical
attempt outcomes and costs, budget accounting, decision/reason, output digest,
`output_trust: UNTRUSTED`, `business_effect: NONE`, sequence and hash links.
Raw prompt/payload/response, secrets, credentials, exception text/stack and
arbitrary external metadata are forbidden.

## 8. Closed file set and delivery gates

Maximum `11/20` changed paths:

1. `docs/mg5/MG5_PROOF_IMPLEMENTATION_CONTRACT.md`
2. `tools/mg5/model-gateway-proof.js`
3. `tools/mg5/model-gateway-proof.test.js`
4. `docs/mg5/MG5_BUILDER_REPORT.md`
5. `qa/mg5/model-gateway-proof.independent.test.js`
6. `docs/mg5/MG5_INDEPENDENT_QA_REPORT.md`
7. `docs/mg5/MG5_FORMAL_TRACEABLE_TEST.md`
8. `docs/mg5/MG5_INDEPENDENT_REVIEW.md`
9. `docs/mg5/MG5_PROVENANCE_MANIFEST.md`
10. `docs/mg5/MG5_EVIDENCE_PACKAGE.md`
11. `docs/mg5/MG5_EVIDENCE_INDEX.md`

`MASTER_CONTEXT.md` and `PROJECT_DECISION_LOG.md` remain unchanged until a
later Founder baseline decision. No package/lockfile, REG4/BOS source/test,
database, migration, application, runtime or deployment path may change.

PASS requires all Builder/QA/combined/predecessor tests green at one exact
clean commit/tree, deterministic rerun, P0=0, P1=0, complete proof audit and a
clean worktree. Only then may `proof/mg5-v1` be pushed without force.

Any scope expansion, dependency, real model/API/data/secret, cross-provider or
cross-region fallback, business effect, third repair round, file-cap breach or
remaining P0/P1 is mandatory STOP.
