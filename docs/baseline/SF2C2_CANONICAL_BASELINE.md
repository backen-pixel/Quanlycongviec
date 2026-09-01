# SF2-C2 Canonical Technical Baseline

> Decision date: 2026-09-01
>
> Authority: Founder Approval — New SF2-C2 Canonical Baseline
>
> Status: **FOUNDER-APPROVED SF2-C2 CANONICAL BASELINE / STOP**

## 1. Immutable baseline identity

- Full commit: `bd281ab1d61d7177a593e449ac04ba1d4c79d882`.
- Git tree: `3eb2266e4177fba76960316fa167895b01ec84fb`.
- Immediate parent: `684d25fd34928bbde23c1bc01bd5572ea2a4d5dd`.
- Founder-authorized SX-1 starting point:
  `4d5ef23d28ea25f38229f71b416b6e007ec0beed`.
- Historical predecessor: `9c1bae61aa853eb438922b14bff720a32b6125d8`,
  tree `4cc8bde842bab081323e196caf41947112749b71`.

The full commit/tree above is the current Founder-approved SF2-C2 canonical
technical baseline for subsequent SF2-C2 development. Branch names, shortened
SHAs, later documentation commits and working-tree state must not replace this
identity.

The predecessor remains preserved as an immutable
[historical baseline](./SF2C2_HISTORICAL_BASELINE_9c1bae61.md) and remains an
ancestor of this baseline.

## 2. Approved security scope

The baseline includes the previously approved SF2-C2 dependency remediation
and the controlled SX-1 replacement of `xlsx@0.18.5` with SheetJS Community
Edition `0.20.3` from the official SheetJS distribution source.

| Field | Approved value |
|---|---|
| Source | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` |
| Repository path | `vendor/xlsx-0.20.3.tgz` |
| Package binding | `file:../vendor/xlsx-0.20.3.tgz` |
| Size | `2,409,319` bytes |
| SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| Git blob | `b9df84a5c07d3bb78d75e310b7931e3dbf56783e` |

- Business source changed by SX-1: `NO`.
- Business Rules changed: `NO`.
- Database changed: `NO`.
- Migration changed: `NO`.
- New functionality added: `NO`.

One authorized remediation loop changed only the SX-1 test harness by giving
the existing-module startup probe a separate timeout. The adversarial parser
deadline and memory bound were not relaxed.

## 3. Formal Traceable Test evidence

FTT bound every final result to the exact commit/tree and retained clean
pre/post status without modifying candidate source or tests.

| Suite | Result |
|---|---:|
| SX-1 XLS/XLSX/ODS/security | `7/7 PASS` |
| SF2-C2 dependency security | `9/9 PASS` |
| Agent Control Plane | `23/23 PASS` |
| Software Factory | `57/57 PASS` |
| SF2-C1 | `14/14 PASS` |
| SF2-C2 | `13/13 PASS` |
| Business OS | `37/37 PASS` |
| Existing development checks | `153/153 PASS` |
| All formal TAP checks | `160/160 PASS` |

Dependency audit: Critical `0`, High `0`, Moderate `0`, Low `0`, Info `0`.

- FTT package: `FTT_SX1_bd281ab1_EVIDENCE/`.
- Archive: `FTT_SX1_bd281ab1_EVIDENCE.zip`.
- Archive SHA-256:
  `714c4d2c63e41f1e5f1f82bb91b159ed41615b87ae6518618c8ee86748c9d6a4`.
- Final report SHA-256:
  `8b7d0afb93dabfff6ab693c946c204aa08a37c6fc5776bc15c1c5942c7e1f4e5`.
- Test-results SHA-256:
  `2098b554118cddf08195e07a9c8a154e80cf64ffa60545ea5c336cc7a928fe0a`.
- Artifact-manifest SHA-256:
  `f2f31fed4ef2a43f7451bcc1bdf514773a893ef7c1ca22035a5c4c263a029f00`.

## 4. Independent Review evidence

- Verdict: **PASS / STOP**.
- Independent exact-SHA rerun: `160/160 PASS`.
- Independent dependency audit: every severity `0`.
- Candidate and review worktrees: clean.
- Candidate/source/test/FTT evidence modified by reviewer: `NO`.
- P0: `0`.
- P1: `0`.
- P2: `3` open residuals accepted by Founder for this baseline decision.
- Blocking findings: `0`.

- IR package: `IR_SX1_FTT_bd281ab1_EVIDENCE/`.
- Archive: `IR_SX1_FTT_bd281ab1_EVIDENCE.zip`.
- Archive SHA-256:
  `23d6b7d8c0d93df85232343b1b2d49e02808ea933e35039a395e13fe6f2ad9be`.

Primary review evidence:

| Artifact | SHA-256 |
|---|---|
| `IR_INDEPENDENT_REVIEW_REPORT.md` | `376105c2b1a76fe6d42ae660ae8e701a3c992476d3b7ba6cd080c22be649feb7` |
| `IR_FINDINGS_LEDGER.md` | `357183768cfe268246b23dfb241487aa446e84622ddbec6796339fdb5ec2f5bf` |
| `IR_REVIEW_ATTESTATION.json` | `02f4835d63d1527a00416fd322e3d7eb3cb0a7cc7b4e19ac847c03fdce48776c` |
| `IR_ARTIFACT_MANIFEST.csv` | `36ea444b69716314ba82dbdfe8e5310afcb72cd3215f3b1a7c83be7daafcb5ce` |

## 5. Founder-accepted open P2 residuals

Founder accepts the following three risks only for establishing this exact
technical baseline. They remain open and tracked; acceptance does not mean
fixed, closed or Production-ready.

| Finding | Founder disposition | Continuing boundary |
|---|---|---|
| `IR-SX1-P2-01` — commit and local attestations are digest-bound but not cryptographically signed | `FOUNDER-ACCEPTED / OPEN` | Preserve exact commit/tree/archive digests; use signed commits and attestations in a future release/non-repudiation workflow. |
| `IR-SX1-P2-02` — resource isolation is proven by adversarial test controls, not by the existing production parser architecture | `FOUNDER-ACCEPTED / OPEN` | Do not infer Runtime/Production resource-isolation assurance; address only in a separately authorized production-hardening scope. |
| `IR-SX1-P2-03` — export compatibility was not exercised through live delivery and storage | `FOUNDER-ACCEPTED / OPEN` | Preserve the representative write/reopen and source-contract claim only; require a separately authorized live integration gate before Production inference. |

P3 execution/environment notes remain in the risk register and IR evidence.

## 6. Explicit authorization boundary

This decision means only:

**SF2-C2 canonical technical baseline =
`bd281ab1d61d7177a593e449ac04ba1d4c79d882` / tree
`3eb2266e4177fba76960316fa167895b01ec84fb`.**

It does not authorize:

- merge into main;
- push, tag or release;
- AF3, BOS-AI1, REG4, MG5 or OC6;
- Business AI Runtime or OpenClaw Production;
- Production Deployment;
- database/migration execution;
- any next implementation phase.

Every surface above remains `STOP / NO_GO / NOT_AUTHORIZED` until a separate
Founder decision.

## 7. Historical and rollback identity

- Previous canonical baseline: `9c1bae61aa853eb438922b14bff720a32b6125d8`,
  preserved as historical and never rewritten.
- Full SX-1 rollback point:
  `4d5ef23d28ea25f38229f71b416b6e007ec0beed`.
- The documentation commit that records this decision is not the canonical
  baseline; it must point back to the exact approved commit/tree above.

Related records: [MASTER CONTEXT](../MASTER_CONTEXT.md),
[Evidence Index](./SF2C2_EVIDENCE_INDEX.md),
[Residual Risk Register](./SF2C2_RESIDUAL_RISK_REGISTER.md), and
[Project Decision Log](../PROJECT_DECISION_LOG.md).

**Final recorded state: FOUNDER-APPROVED NEW SF2-C2 CANONICAL BASELINE / STOP.**
