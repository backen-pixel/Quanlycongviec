# SF2-C2 Canonical Technical Baseline

> Decision date: 2026-08-31
>
> Authority: Founder Order — Record SF2-C2 Canonical Baseline
>
> Status: **FOUNDER-APPROVED SF2-C2 CANONICAL BASELINE**

## 1. Immutable baseline identity

- Full commit SHA: `9c1bae61aa853eb438922b14bff720a32b6125d8`
- Git tree SHA: `4cc8bde842bab081323e196caf41947112749b71`
- Parent audit candidate: `0c6f2c764f93b1518f87d2e138e25f1cc164acc7`
- Remediation scope in the baseline commit: exactly one path, `backend/src/routes/assistant.js`
- Restored file Git blob: `a4e456bb5e45bd4703b166acaf151813aab802a3`
- Founder-authorized protected source SHA-256: `4883245fdc9ab2be27e6e41a62fab2f55124338cb82629c0d8594e8884cecd61`

The commit above is the Founder-approved SF2-C2 canonical technical baseline. Earlier recovery candidates remain audit artifacts and must not replace this identity.

## 2. Approval evidence

### TT-1 formal traceable test

TT-1 bound every result to the exact commit/tree above and retained clean pre/post status:

| Suite | Result |
|---|---:|
| CP1 | `23/23 PASS` |
| Software Factory | `57/57 PASS` |
| SF2-C1 | `14/14 PASS` |
| SF2-C2 | `13/13 PASS` |
| Business OS | `37/37 PASS` |
| Aggregate established suites | `144/144 PASS` |

No canonical aggregate/full-regression command exists in the committed package, so TT-1 did not invent one.

TT-1 archive SHA-256: `bc1cc4f560aee4f50118232ad3722229be2291ad1258b7b4923482ff1077da27`.

### IR-1 Independent Review

- IR-1 verdict: **PASS / STOP**
- Independently rerun established suites: `144/144 PASS`
- P0: `0`
- P1: `0`
- Candidate/source/test modification by reviewer: `NO`
- Exact reviewed commit/tree: identical to this baseline

Evidence digests:

- `IR1_INDEPENDENT_REVIEW_REPORT.md`: `a541f94fc7701c66d56cb2ced90f5730afc0c68cf8e4f7a241acc3357dd752dd`
- `IR1_FINDINGS_LEDGER.md`: `ccdf1056c8b0ce69f046466e6fc6f87e997654d7f11e83d22006592a8b29084c`
- `IR1_REVIEW_ATTESTATION.json`: `d907587f9d3589b1e6f3f68cb9263354778fc87e4f6d193b5dfb485b8f2b6d85`
- `IR1_ARTIFACT_MANIFEST.csv`: `dd2e8c9bb831bb599cf4f4371eb8d4c74d7288b5828faa8b3b7774d4d106b26d`

## 3. Founder disposition of IR-1 residual risks

Founder accepts the following three IR-1 P2 findings as residual risk for the SF2-C2 canonical-baseline decision. They remain recorded and are not represented as fixed, closed, or suitable for Production inference.

| Finding | Founder disposition | Continuing boundary |
|---|---|---|
| `IR1-P2-01` — no established canonical aggregate regression command | Accepted residual risk | A future single full-regression gate requires an explicitly defined canonical command; TT-1/IR-1 only claim the five established suites. |
| `IR1-P2-02` — no dependency-vulnerability audit; locked install emitted dependency maintenance warnings | Accepted residual risk | Dependency vulnerability status remains unknown and requires separately authorized audit/remediation before Runtime or Production eligibility. |
| `IR1-P2-03` — historical provenance/non-repudiation remains partial; remediation commit and local attestation are unsigned | Accepted residual risk | Preserve exact SHA/tree/evidence digests; future release workflow should use signed commits/attestations. |

IR-1 also retains its P3 execution/runtime notes, including Node's experimental SQLite warning. Those notes are not converted into Production assurances by this decision.

## 4. Explicit status boundary

This approval means only:

**SF2-C2 canonical technical baseline = `9c1bae61aa853eb438922b14bff720a32b6125d8` / tree `4cc8bde842bab081323e196caf41947112749b71`.**

It does **not** mean:

- production-ready;
- Runtime or Production authorized;
- deployment or migration authorized;
- AF3, BOS-AI1, REG4, MG5, OC6, Business AI Runtime, OpenClaw Production, Production Deployment, or any next phase opened;
- push, tag, merge, or canonical-main mutation authorized.

All those surfaces remain `STOP / NO_GO / NOT_AUTHORIZED` until a separate Founder decision.

## 5. Audit and rollback identity

- Immediate parent/audit rollback point: `0c6f2c764f93b1518f87d2e138e25f1cc164acc7`
- Baseline commit is immutable for decision and evidence binding.
- Historical local PASS narratives remain historical evidence; this record is the reconciliation point that binds Founder approval to an exact commit/tree, TT-1, and IR-1.

Related control records: [MASTER CONTEXT](../MASTER_CONTEXT.md), [Evidence Index](./SF2C2_EVIDENCE_INDEX.md), and [Residual Risk Register](./SF2C2_RESIDUAL_RISK_REGISTER.md).

**Final recorded state: FOUNDER-APPROVED SF2-C2 CANONICAL BASELINE / STOP.**
