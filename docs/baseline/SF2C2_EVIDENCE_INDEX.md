# SF2-C2 Canonical Baseline — Evidence Index

> Decision date: 2026-09-01
>
> Evidence subject: `bd281ab1d61d7177a593e449ac04ba1d4c79d882`
>
> Git tree: `3eb2266e4177fba76960316fa167895b01ec84fb`
>
> Status: **COMPLETE / FOUNDER-APPROVED / STOP**

## 1. Current traceability chain

`Founder security authorization` → `SX-1 local candidate` → `development
validation` → `exact-SHA Formal Traceable Test` → `separate-workspace
Independent Review` → `Founder baseline approval` → `canonical record`

All claims in this index bind the exact full commit/tree above. This evidence
supports only the SF2-C2 canonical technical baseline decision and does not
establish Production readiness or authorize a later phase.

## 2. Candidate and supply-chain identity

- Founder-authorized starting commit:
  `4d5ef23d28ea25f38229f71b416b6e007ec0beed`.
- SX-1 implementation commit:
  `684d25fd34928bbde23c1bc01bd5572ea2a4d5dd`.
- Test-only remediation commit and final candidate:
  `bd281ab1d61d7177a593e449ac04ba1d4c79d882`.
- Final tree: `3eb2266e4177fba76960316fa167895b01ec84fb`.
- Official tarball source:
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- Tarball SHA-256:
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
- Tarball Git blob: `b9df84a5c07d3bb78d75e310b7931e3dbf56783e`.
- Business source/database/migration changed by SX-1: `NO / NO / NO`.

The committed development record
`SX1_XLSX_SECURITY_REMEDIATION_EVIDENCE.md` captures candidate construction
and the stopped first FTT attempt. Its pre-FTT status fields are historical to
candidate creation and are superseded for gate disposition by the successful
exact-SHA FTT and IR packages below; the file is not rewritten inside the
approved baseline commit.

## 3. Formal Traceable Test package

- Control Center package: `FTT_SX1_bd281ab1_EVIDENCE/`.
- Archive: `FTT_SX1_bd281ab1_EVIDENCE.zip`.
- Archive bytes: `33,507`.
- Archive SHA-256:
  `714c4d2c63e41f1e5f1f82bb91b159ed41615b87ae6518618c8ee86748c9d6a4`.
- Result: **PASS**.
- Candidate binding: exact full commit/tree above.
- Pre/post status: clean; source/test unchanged.

Primary FTT records:

| Artifact | SHA-256 |
|---|---|
| `FTT_FINAL_TRACEABLE_TEST_REPORT.md` | `8b7d0afb93dabfff6ab693c946c204aa08a37c6fc5776bc15c1c5942c7e1f4e5` |
| `FTT_TEST_RESULTS.csv` | `2098b554118cddf08195e07a9c8a154e80cf64ffa60545ea5c336cc7a928fe0a` |
| `FTT_ARTIFACT_MANIFEST.csv` | `f2f31fed4ef2a43f7451bcc1bdf514773a893ef7c1ca22035a5c4c263a029f00` |

Formal results:

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

`npm audit --omit=dev --json`: Critical `0`, High `0`, Moderate `0`, Low `0`,
Info `0`.

## 4. Independent Review package

- Control Center package: `IR_SX1_FTT_bd281ab1_EVIDENCE/`.
- Archive: `IR_SX1_FTT_bd281ab1_EVIDENCE.zip`.
- Archive bytes: `56,215`.
- Archive SHA-256:
  `23d6b7d8c0d93df85232343b1b2d49e02808ea933e35039a395e13fe6f2ad9be`.
- Review result: **PASS / STOP**.
- Independent exact-SHA rerun: `160/160 PASS`.
- Independent audit: every severity `0`.
- Findings: `P0=0`, `P1=0`, `P2=3`, blocking findings `0`.
- Reviewer source/test/candidate/FTT changes: none.

Primary IR records:

| Artifact | SHA-256 |
|---|---|
| `IR_INDEPENDENT_REVIEW_REPORT.md` | `376105c2b1a76fe6d42ae660ae8e701a3c992476d3b7ba6cd080c22be649feb7` |
| `IR_FINDINGS_LEDGER.md` | `357183768cfe268246b23dfb241487aa446e84622ddbec6796339fdb5ec2f5bf` |
| `IR_REVIEW_ATTESTATION.json` | `02f4835d63d1527a00416fd322e3d7eb3cb0a7cc7b4e19ac847c03fdce48776c` |
| `IR_ARTIFACT_MANIFEST.csv` | `36ea444b69716314ba82dbdfe8e5310afcb72cd3215f3b1a7c83be7daafcb5ce` |

The IR manifest contains 43 self-excluded artifact records with zero digest or
byte-count mismatch. Archive-to-directory comparison also reported zero
mismatch. Superseded reviewer harness probes remain retained and disclosed as
P3 execution notes; they are not candidate or formal-suite failures.

## 5. Founder decision record

Founder approved the exact subject commit/tree on 2026-09-01 and accepted the
three open P2 residual risks for the baseline decision. The pre-decision memo
is retained in the Control Center as
`FOUNDER_DECISION_MEMO_SX1_bd281ab1.md`, SHA-256
`74e52b4c1933316eeceb74f9bf93943c938dc02e37d627f2a8aa6f63b1ef750e`.

Founder approval does not close the P2 items and does not authorize Runtime,
Production, merge, tag, release, migration, deployment or a next phase.

## 6. Historical baseline evidence retained

The predecessor baseline remains preserved as a historical record:

- Commit: `9c1bae61aa853eb438922b14bff720a32b6125d8`.
- Tree: `4cc8bde842bab081323e196caf41947112749b71`.
- TT-1 archive: `TT1_9c1bae61_EVIDENCE.zip`.
- TT-1 archive SHA-256:
  `bc1cc4f560aee4f50118232ad3722229be2291ad1258b7b4923482ff1077da27`.
- IR-1 package: `IR1_TT1_9c1bae61_EVIDENCE/`.
- Historical result: `144/144 PASS`, `P0=0`, `P1=0`, `P2=3`.

Historical evidence is not deleted, rewritten or represented as the current
development baseline. See
[Historical Baseline 9c1bae61](./SF2C2_HISTORICAL_BASELINE_9c1bae61.md).

## 7. Current decision and risk records

- [Canonical Baseline](./SF2C2_CANONICAL_BASELINE.md)
- [Historical Baseline 9c1bae61](./SF2C2_HISTORICAL_BASELINE_9c1bae61.md)
- [Residual Risk Register](./SF2C2_RESIDUAL_RISK_REGISTER.md)
- [MASTER CONTEXT](../MASTER_CONTEXT.md)
- [Project Decision Log](../PROJECT_DECISION_LOG.md)

**Evidence index state: COMPLETE FOR NEW SF2-C2 CANONICAL BASELINE / STOP.**
