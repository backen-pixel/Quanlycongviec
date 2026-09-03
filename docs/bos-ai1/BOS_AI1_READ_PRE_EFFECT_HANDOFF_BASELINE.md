# BOS-AI1 READ Pre-Effect Handoff Proof Technical Baseline V1

> Record date: 2026-09-03
>
> Founder verdict: **APPROVED — SYNTHETIC PROOF ONLY**
>
> Authority: direct Founder approval of BOS-AI1 READ Pre-Effect Handoff Proof Baseline V1.
>
> Current continuation: **DOCUMENTATION CLOSURE / OC6 PAUSED AT G0 UNTIL CLOSURE AND GITHUB VERIFICATION**.

## 1. Approved identities

| Record | Full commit | Git tree |
|---|---|---|
| Approved READ technical baseline | `b040d12a27ec0c99433a7c2abb988cc993cf337b` | `4190816ac113d2b6352eb7d242b1d35a9f58ca1e` |
| Final evidence record | `f50a9ee689d9a442e3e9d150b7d4676705fb5d6c` | `a4f0ce71e95f3d1084016029604396270600e301` |
| Documentation parent of the READ technical baseline | `0c2b16f381421538ce220270305534612974d615` | `ba8e496311c9c99a9f8094a8197b41df4d066def` |
| Preserved DRAFT technical baseline | `a0fbabb9e210b4fdf2ad2e7fc2b8e9f89200d0d0` | `6d0e3895400599570aefffaa14430231c1dfa443` |
| Preserved DRAFT evidence record | `3f7092a3902a9050846ef497056793bf5d690b71` | `93b4021addb044d5e33097c4915a84ea4d6794f5` |

Evidence has the READ technical commit as its direct parent and adds exactly four
documents. Its three source/fixture/test blobs are identical to the technical baseline.
The technical commit directly follows the documentation parent above. READ is the
latest BOS-AI1 technical authority; prior approved baselines, failed candidates and
all historical source/tests/evidence remain preserved. Evidence and documentation
closure never replace the exact technical identity.

## 2. Evidence binding verified before recording approval

Read-only closure verification inspected existing Git objects and decoded the
committed portable package in memory. All 82 artifact byte lengths and SHA-256
hashes match. Original manifests and raw TAP agree with the approved technical
commit/tree; 17 reviewed source/test fingerprints match. Tests were not rerun.
Formal and Independent execution snapshots/workspaces are clean detached HEAD
before/after. The evidence workspace is clean on its proof branch before/after.

| Inventory bound to the approved technical commit/tree | Result |
|---|---:|
| Formal READ handoff | 387/387 PASS |
| Formal historical DRAFT handoff | 176/176 PASS |
| Formal repository baseline regression | 383/383 PASS |
| Historical Controlled Publish independent regression | 152/152 PASS |
| Historical Pre-Effect independent regression | 173/173 PASS |
| Historical DRAFT independent regression | 223/223 PASS |
| Formal total | **1494/1494 PASS** |
| Independent adversarial final | **85/85 PASS** |
| Independent regression | **1494/1494 PASS** |
| Open P0 / P1 / P2 | **0 / 0 / 0** |
| Proof footprint | **9/10 tracked paths** |
| Conservative correction rounds | **1/2** |
| Implementation/Builder source-test repairs | **0** |

Final runs have zero failures, cancellations, skips and todo cases. The initial
independent run remains **83/85, two failures, exit code 1**. One reviewer-fixture
correction round fixed two assumptions: fractional numeric row values are rejected
at the private snapshot; real REG4 rejects empty required permission/tool arrays.
The corrected assertions cover early rejection and use valid nonempty unrelated
grant tokens. No target implementation or Builder test changed. Original/final TAP,
manifests and exact reviewer test bytes are retained. The Builder record's 0/2 is
the state at technical freeze; the final conservative 1/2 includes the later fixture
correction. Neither record is rewritten.

| Tested file | Git blob | Canonical Git SHA-256 |
|---|---|---|
| tools/bos-ai1/read-pre-effect-fixtures.cjs | `01235171a3964a53493e59179477f0690294ca82` | `32745f2336ffce9a0db82322d06709a16c60f4eb06a7d5febca563dce7b566ac` |
| tools/bos-ai1/read-pre-effect-handoff-proof.js | `1789d8821b42121b13dee398dc6ed3ece9211357` | `c3b43020210b8537cf0cfb70cc5ed4c493e9fa52e186c488967ada2c8764bcb4` |
| tools/bos-ai1/read-pre-effect-handoff-proof.test.js | `cf9271284d8cd62edc78eb3a652b9d2d38675287` | `7e2680e660aee5245a02e75da062d3567b4114429e497ecde69af7fae88e7e59` |

Portable evidence canonical size: **1,826,107 bytes**; Git blob
`b8611cc6676fcef55d4e37121a471f88b580b116`; SHA-256
`de6fec1673d5cd2ff0b3b7690fa726847dffb41a761d49ab0abc2fcce044234d`.
Its 82 artifacts contain 1,354,302 decoded bytes. All 4,172 pre-existing tracked
files are preserved. Proof footprint 9/10 describes the approved proof through
the evidence commit; the four governance closure paths are separately authorized.

The external read-only verification report is `READ_BASELINE_BINDING_VERIFICATION.json`,
SHA-256 `402f27feafdf6451234500261315c28528059c3f309a7212862fdb5ea14dd885`.
Its 180 checks passed. The frozen evidence package still records the pre-approval
PENDING state; this later governance record records direct Founder approval.

## 3. Recognized behavior and limits

BOS ALLOW returns a control permit and metadata with zero business reads. Successful
pre-effect audit issues a distinct execution permit. Application Service enters
Domain before any private Repository read. Domain DENY/STOP performs no repository
call, read or data release and exposes no resource-existence detail. Domain ALLOW
permits the controlled read followed by fixed filtering/redaction and RESULT PREPARED
audit, fresh authority/revision checks and one callback-free return of the safe projection.

Sequential, Promise-scheduled and reentrant duplicates do not repeat the read or
data release; they return receipts or IN_PROGRESS. Audit, filter/redaction and
dependency faults suppress data release. Audit carries metadata only, without raw
rows, exception text, free text or row/projection content hashes. Agent, actor,
grant, permission, tenant/resource/version and original expiry remain checked.

Approval recognizes fake data, a synthetic Domain/Repository, fixed projection and
in-memory audit/state. It does not establish canonical real Domain Business Rules,
database persistence, arbitrary-text redaction, durable/tamper-proof audit,
distributed exactly-once delivery, timing-channel resistance, production load or
recovery, real model/API integration, Business AI Runtime or Production readiness.
The unchanged REG4 synchronous current snapshot is the trusted registry primitive;
legacy proof APIs remain their historical contracts.

## 4. Documentation closure and GitHub authority

Exactly one documentation-only commit is authorized with direct parent
`f50a9ee689d9a442e3e9d150b7d4676705fb5d6c`. Its exact four paths are:

- `docs/MASTER_CONTEXT.md`
- `docs/PROJECT_DECISION_LOG.md`
- `docs/bos-ai1/BOS_AI1_EVIDENCE_INDEX.md`
- `docs/bos-ai1/BOS_AI1_READ_PRE_EFFECT_HANDOFF_BASELINE.md`

Only non-force fast-forward push to https://github.com/backen-pixel/Quanlycongviec.git,
branch `proof/bos-ai1-read-pre-effect-v1`, is authorized. No source/test/evidence
edit, main update, force push, PR, merge, tag or release is authorized. Historical
decisions, baseline records, source/tests and evidence remain intact. The closure's
full SHA/tree and verified GitHub branch tip are recorded externally after the commit
exists; this document cannot contain its own commit identity or pre-claim publication.
Rollback means STOP and report, preserving history without automatic reset, rewrite,
revert or substitution of the approved technical baseline.

## 5. Conditional OC6 continuation

OC6 remains PAUSED at G0 during documentation closure. Only after closure and GitHub
verification may G0 rerun with READ technical commit `b040d12a27ec0c99433a7c2abb988cc993cf337b`,
tree `4190816ac113d2b6352eb7d242b1d35a9f58ca1e`. Keep REG4
`3def40122e4072f266c943bc4eb84d3164501339` / `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`
and MG5 `c0ba1b282422c68bd96478d7585f2c2381198420` / `02f6ed227a288009f449ef9de4e94ba98ceb6c33`
unchanged, together with the prior BOS baselines. G0 must verify the latest integration
ancestry and compatibility without changing the underlying contracts or criteria.

G0 PASS permits continuation of the already approved OC6 Proof Fast Track, retaining
P01–P14, G0–G9, IR-OC6-1, maximum 20 files/two repair rounds and all existing limits.
G0 FAIL requires STOP and the exact remaining gap. This record does not claim G0
PASS, an OC6 run or OC6 baseline approval. No real OpenClaw/model/API, real business
data, Business AI Runtime, Production, main merge, tag/release or new major phase
may be opened by this record.

## 6. Preserved supporting evidence

- [Formal Test](./BOS_AI1_READ_PRE_EFFECT_FORMAL_TEST.md)
- [Independent Review](./BOS_AI1_READ_PRE_EFFECT_INDEPENDENT_REVIEW.md)
- [Decision evidence](./BOS_AI1_READ_PRE_EFFECT_EVIDENCE.md)
- [Portable evidence](./BOS_AI1_READ_PRE_EFFECT_EVIDENCE.json)
- [Proof contract](./BOS_AI1_READ_PRE_EFFECT_CONTRACT.md)
- [Build record](./BOS_AI1_READ_PRE_EFFECT_BUILD_RECORD.md)
- [Preserved DRAFT baseline](./BOS_AI1_DRAFT_PRE_EFFECT_HANDOFF_BASELINE.md)
- [Evidence index](./BOS_AI1_EVIDENCE_INDEX.md)
- [Decision log](../PROJECT_DECISION_LOG.md)
