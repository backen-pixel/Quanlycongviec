# SF2-C2 Canonical Baseline — Evidence Index

> Decision date: 2026-08-31
>
> Evidence subject: `9c1bae61aa853eb438922b14bff720a32b6125d8`
>
> Git tree: `4cc8bde842bab081323e196caf41947112749b71`

## 1. Traceability chain

`Founder decision` → `exact commit/tree` → `TT-1 formal traceable test` → `IR-1 independent review and rerun` → `canonical baseline record`

The evidence listed below supports only the SF2-C2 canonical technical baseline decision. It does not establish Production readiness or authorize a later phase.

## 2. TT-1 formal traceable test package

- Control Center package: `TT1_9c1bae61_EVIDENCE/`
- Packaged archive: `TT1_9c1bae61_EVIDENCE.zip`
- Archive SHA-256: `bc1cc4f560aee4f50118232ad3722229be2291ad1258b7b4923482ff1077da27`
- Result: **PASS**
- Candidate binding: exact full commit/tree above
- Pre/post candidate status: clean; source/test unchanged

Required records in the package:

| Record | Purpose |
|---|---|
| `TT1_PREFLIGHT_REPORT.md` | Preflight commit/tree, file integrity and clean-worktree checks |
| `TT1_ENVIRONMENT_MANIFEST.md` | OS, runtime, dependency and lockfile identity |
| `TT1_TEST_RESULTS.csv` | Exact commands, timestamps, exit codes, counts and raw-log hashes |
| `TT1_RAW_LOG_INDEX.md` | Raw-log inventory |
| `TT1_FINAL_TRACEABLE_TEST_REPORT.md` | Final TT-1 gate report |
| `raw_logs/` | Dependency-install and suite stdout/stderr evidence |

Suite results:

| Suite | Result | Raw log SHA-256 |
|---|---:|---|
| CP1 | `23/23 PASS` | `8e692b32a1e42a139bf729c3fb85fe6786a912d5da1655052f05caba0fcc09c9` |
| Software Factory | `57/57 PASS` | `7bdbf3a400542074bf49750efb88f288ec9418caabd7b4065ed4c2f3be2b4682` |
| SF2-C1 | `14/14 PASS` | `20bf5b3a2a2fb40d188f592e12f644eac8faf5be8167eed1e03071682dd7ed6b` |
| SF2-C2 | `13/13 PASS` | `7a871cd9da592b83c126783d7c5721cce58c5d388758338841c8bfde3463d817` |
| Business OS | `37/37 PASS` | `94b053d6cf5d946125a45b0d80d5370c12bcc5825e9952b7f496fd31c2527d8d` |
| Aggregate established suites | `144/144 PASS` | Derived from the five traceable suite records above |

Full regression was not run because no established canonical aggregate command exists in the committed package; no command was invented.

## 3. IR-1 Independent Review package

- Control Center package: `IR1_TT1_9c1bae61_EVIDENCE/`
- Review result: **PASS / STOP**
- Independent rerun: `144/144 PASS`
- Findings: `P0=0`, `P1=0`, `P2=3`
- Candidate binding: exact full commit/tree above
- Reviewer source/test changes: none

Primary evidence digests:

| Artifact | SHA-256 |
|---|---|
| `IR1_INDEPENDENT_REVIEW_REPORT.md` | `a541f94fc7701c66d56cb2ced90f5730afc0c68cf8e4f7a241acc3357dd752dd` |
| `IR1_FINDINGS_LEDGER.md` | `ccdf1056c8b0ce69f046466e6fc6f87e997654d7f11e83d22006592a8b29084c` |
| `IR1_REVIEW_ATTESTATION.json` | `d907587f9d3589b1e6f3f68cb9263354778fc87e4f6d193b5dfb485b8f2b6d85` |
| `IR1_ARTIFACT_MANIFEST.csv` | `dd2e8c9bb831bb599cf4f4371eb8d4c74d7288b5828faa8b3b7774d4d106b26d` |

The artifact manifest is the file-level integrity index for the complete IR-1 package, including environment, results, logs, findings, completion record and review tooling.

## 4. Decision and risk records

- [Canonical Baseline](./SF2C2_CANONICAL_BASELINE.md)
- [Residual Risk Register](./SF2C2_RESIDUAL_RISK_REGISTER.md)
- [MASTER CONTEXT](../MASTER_CONTEXT.md)
- [Project Decision Log](../PROJECT_DECISION_LOG.md)

The three P2 items are Founder-accepted residual risks only for this baseline decision. They remain visible in the risk register and are not waived for Business AI Runtime, OpenClaw Production or Production Deployment.

**Evidence index state: COMPLETE FOR SF2-C2 CANONICAL-BASELINE RECORDING / STOP.**
