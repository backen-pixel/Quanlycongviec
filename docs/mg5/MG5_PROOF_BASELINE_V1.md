# MG5 Model Gateway Proof V1 — Founder-Approved Baseline

> Baseline date: 2026-09-02
>
> Authority: Founder Approval — MG5 Proof Baseline V1
>
> Status: **FOUNDER-APPROVED / COMPLETE / STOP**

## 1. Baseline identity

| Identity | Commit | Tree |
|---|---|---|
| MG5 Proof Technical Baseline | `c0ba1b282422c68bd96478d7585f2c2381198420` | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |
| Authorized implementation parent | `057de036f9434b6acdd1951b556bc2cbd77cd881` | `6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf` |
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |
| BOS-AI1 Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | `f17e4c4f699335ddad056310c8d70e3ed3df6909` |

The full MG5 Technical Baseline commit and tree identify the approved proof
implementation. A branch name, abbreviated SHA, working tree, Final Evidence
Record or later documentation commit must not be substituted for them.

## 2. Final evidence record

| Record | Commit | Tree |
|---|---|---|
| MG5 Final Evidence Record | `347ddd2d97a2dfb4f52322086b2c49d568404fee` | `1751d0de44d1096764c535cd2a33940b8d6a2120` |

The Final Evidence Record adds five evidence documents after the six-path
Technical Baseline. It contains `11/20` distinct changed paths relative to the
authorized implementation parent. The implementation and test Git blobs remain
exactly those of the Technical Baseline:

```text
tools/mg5/model-gateway-proof.js
537ec2930573735c4c1671e4929b28b8910b9ac4

tools/mg5/model-gateway-proof.test.js
72608771e27e0f4f307b55b71e9760e5d3dd52fc

qa/mg5/model-gateway-proof.independent.test.js
fd04d560cb3fddfa46ce7c055af9c702c95c4601
```

The documentation-only closure authorized after approval has direct parent
`347ddd2d97a2dfb4f52322086b2c49d568404fee`. Its SHA/tree is reported in the
external Founder handoff after creation and does not become a new Technical
Baseline or Final Evidence Record.

## 3. Formal and independent binding

Formal Traceable Test and Independent Review are both bound to the exact MG5
Proof Technical Baseline:

```text
commit = c0ba1b282422c68bd96478d7585f2c2381198420
tree   = 02f6ed227a288009f449ef9de4e94ba98ceb6c33
```

| Gate | Result |
|---|---:|
| Builder | `36/36 PASS` |
| Independent QA | `12/12 PASS` |
| MG5 combined | `48/48 PASS` |
| REG4 combined | `27/27 PASS` |
| BOS-AI1 predecessor | `40/40 PASS` |
| Formal full combined regression | `115/115 PASS` |
| Formal deterministic MG5 rerun | `48/48 PASS` |
| Independent Review combined | `115/115 PASS` |
| Independent Review deterministic rerun | `PASS`, exit `0` |
| Findings | `P0=0 / P1=0 / P2=0` |
| Audit completeness | `COMPLETE` within the in-memory proof contract |
| Builder repair rounds used | `2/2` |

The Final Evidence Record was rerun twice at `115/115 PASS`. Those reruns
confirm source/test integrity but do not move the formal or independent binding
away from the Technical Baseline.

## 4. Approved proof contract

Within its synthetic, deterministic and synchronous in-memory boundary, MG5
Proof V1 establishes:

1. exact REG4/BOS baseline-bound requests and strict descriptor snapshots;
2. current real-REG4 Agent package fingerprint, required evidence, `APPROVED`
   lifecycle and trusted `model.request` verification;
3. trusted requester and Company Context resolution without caller-created
   authority;
4. proof-only D0–D4 outbound policy, payload digest verification and nested
   secret containment;
5. deterministic policy-ordinal selection from an exact approved fake catalog;
6. non-negative safe-integer symbolic maximum cost, budget reservation,
   per-attempt charging and unused release;
7. retry only for canonical transient failure, at most one retry on the primary,
   at most one same-provider/same-region/same-capability/same-safety fallback,
   and at most three adapter invocations;
8. completed duplicate replay without a new call or charge, conflict denial and
   reentrant in-flight containment;
9. final Agent/authority/company/policy/catalog/model/budget T1 revalidation
   before adapter invocation;
10. strict output validation, `UNTRUSTED` labeling and
    `business_effect: NONE`;
11. exactly one bounded terminal hash-linked audit record per invocation,
    including fail-closed audit preparation and fail-safe terminal commit
    handling without raw payload, output, exception or secret content;
12. hostile getter, Proxy, Symbol, prototype, depth and arbitrary thrown-value
    containment at each tested trust boundary.

The gateway instance exposes exactly `invoke`, `listAuditRecords` and
`getBudgetSnapshot`. It has no publish, business-write or Production capability.

## 5. Repair and evidence disposition

Builder used the full authorized allowance:

- initial run: `6/34 PASS`;
- repair round 1/2: `33/34 PASS`;
- repair round 2/2: `36/36 PASS`.

Independent QA initially reported `11/12 PASS` because its own helper compared
raw-byte SHA-1 with a Git blob OID. The expected baseline was not changed. The
QA-only oracle was corrected to calculate Git object identity, after which the
independent suite passed `12/12`. This was not a candidate repair.

Formal Traceable Test and Independent Review used separate detached clean
worktrees. The Independent Reviewer was not the Builder and made no candidate
change. Audit evidence was independently recomputed and classified complete
for proof scope.

## 6. Scope and limits

- Data, catalog, adapters, model outputs and budgets: synthetic only.
- Policy, budget, idempotency and audit state: synchronous and in memory only.
- Network, real provider/API/model, credentials and real tenant data: none.
- Database, migration, dependency, application/runtime and deployment change:
  none.
- REG4/BOS-AI1 source/test change: none.
- Business write, approval, publish or canonical business effect: none.
- Durable/tamper-resistant audit, persistence, crash recovery, distributed
  atomicity and multi-process concurrency: not claimed.
- Real provider privacy/security, quality, latency, quota/billing and
  availability: not claimed.

## 7. Governance boundary

- Authorized branch: `proof/mg5-v1`.
- Final Evidence Record was verified on remote before documentation closure.
- Documentation closure is one fast-forward documentation-only commit with
  parent `347ddd2d97a2dfb4f52322086b2c49d568404fee`.
- Source/test modification, force push, Pull Request, merge, tag and release are
  prohibited.
- No OC6, OpenClaw, Business AI Runtime or Production phase is opened.
- No next phase is opened automatically by this approval.
- Current operating state after closure: **APPROVED / COMPLETE / STOP**.
