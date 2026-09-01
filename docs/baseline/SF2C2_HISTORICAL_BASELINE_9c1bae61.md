# SF2-C2 Historical Canonical Baseline — 9c1bae61

> Original decision date: 2026-08-31
>
> Superseded as the current development baseline: 2026-09-01
>
> Status: **HISTORICAL BASELINE / IMMUTABLE AUDIT RECORD**

This record preserves the former Founder-approved SF2-C2 canonical baseline.
It is not deleted, rewritten or invalidated by the successor baseline. It is
no longer the current reference for new SF2-C2 development.

## 1. Historical identity

- Full commit: `9c1bae61aa853eb438922b14bff720a32b6125d8`.
- Git tree: `4cc8bde842bab081323e196caf41947112749b71`.
- Parent audit candidate: `0c6f2c764f93b1518f87d2e138e25f1cc164acc7`.
- Remediation path: `backend/src/routes/assistant.js`.
- Restored file Git blob: `a4e456bb5e45bd4703b166acaf151813aab802a3`.
- Protected source SHA-256:
  `4883245fdc9ab2be27e6e41a62fab2f55124338cb82629c0d8594e8884cecd61`.

The historical commit remains an ancestor of the current canonical baseline
and must remain addressable by its exact full commit/tree.

## 2. Historical gate evidence

### TT-1

- Formal result: `144/144 PASS` across CP1, Software Factory, SF2-C1,
  SF2-C2 and Business OS.
- Archive: `TT1_9c1bae61_EVIDENCE.zip`.
- Archive SHA-256:
  `bc1cc4f560aee4f50118232ad3722229be2291ad1258b7b4923482ff1077da27`.

### IR-1

- Verdict: `PASS / STOP`.
- Independent rerun: `144/144 PASS`.
- P0: `0`.
- P1: `0`.
- P2: `3`, accepted by Founder for the historical baseline decision.

Primary historical evidence digests:

| Artifact | SHA-256 |
|---|---|
| `IR1_INDEPENDENT_REVIEW_REPORT.md` | `a541f94fc7701c66d56cb2ced90f5730afc0c68cf8e4f7a241acc3357dd752dd` |
| `IR1_FINDINGS_LEDGER.md` | `ccdf1056c8b0ce69f046466e6fc6f87e997654d7f11e83d22006592a8b29084c` |
| `IR1_REVIEW_ATTESTATION.json` | `d907587f9d3589b1e6f3f68cb9263354778fc87e4f6d193b5dfb485b8f2b6d85` |
| `IR1_ARTIFACT_MANIFEST.csv` | `dd2e8c9bb831bb599cf4f4371eb8d4c74d7288b5828faa8b3b7774d4d106b26d` |

## 3. Historical residual risks

The 2026-08-31 decision accepted three P2 residuals for this exact historical
baseline: no canonical aggregate command, no dependency-vulnerability audit,
and partial provenance/non-repudiation. Their original disposition remains in
the Git history and the historical section of the current risk register.

The successor baseline performed an explicit dependency audit and has its own
Founder-accepted residual-risk set. Results from the successor must not be
back-projected onto this historical baseline.

## 4. Supersession boundary

On 2026-09-01 Founder approved
`bd281ab1d61d7177a593e449ac04ba1d4c79d882` / tree
`3eb2266e4177fba76960316fa167895b01ec84fb` as the new SF2-C2 canonical
baseline for subsequent development.

This historical record remains audit evidence only. Supersession does not
authorize deletion, history rewriting, merge, tag, release, Runtime,
Production, migration or deployment.

Current record: [SF2-C2 Canonical Baseline](./SF2C2_CANONICAL_BASELINE.md).

**Historical state: PRESERVED / SUPERSEDED / NOT DELETED.**
