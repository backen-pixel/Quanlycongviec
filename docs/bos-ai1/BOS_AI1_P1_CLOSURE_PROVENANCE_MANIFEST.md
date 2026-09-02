# BOS-AI1 V1.2B P1 Closure — Provenance and Integrity Manifest

## Immutable identities

| Object | Commit / tree |
|---|---|
| Authorized implementation parent | `7fe9c7cee8387b586fa63f1f88328cb09db46203` / `444ed671acbf53a6f00ef9231be8a042e2c38bbd` |
| Failed candidate retained as evidence | `bfca56ef3fe242f2595813e734d8a6b3b94341e0` / `a5f9c21afc9c379f5de9bd17a2d3d8d3cef2d788` |
| P1 technical closure | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` / `f17e4c4f699335ddad056310c8d70e3ed3df6909` |
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` / `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |
| Main ref observed before closure and before evidence creation | `ac500d7149ec3ad8a93d44ae868619e64d41cc72` |
| REG4 working baseline ref observed before closure and before evidence creation | `5d1ea91ab77acae8d9d2adf372b69378119428a2` |

## Canonical Git-blob SHA-256

These SHA-256 values are computed over the exact Git blob bytes at technical commit `f44c1436…`, not over a Windows checkout with CRLF conversion.

| Path | SHA-256 |
|---|---|
| `tools/bos-ai1/project-progress-brief-proof.js` | `085a6a4e73fc47dc238e32da906c4ea56cd4c74ee08e19ea876a8b1e725ce36a` |
| `tools/bos-ai1/project-progress-brief-proof.test.js` | `8b6e1caa2bd929149ef593bc3cb382e0ee1c1725d25223d02801b34290ad3836` |
| `docs/bos-ai1/BOS_AI1_P1_CLOSURE_EXECUTION_RECORD.md` | `12af7bbf884726e7d1e3443cd0d80b5a010331dc35e22d2eabe285eae4da0961` |
| `docs/bos-ai1/BOS_AI1_P1_CLOSURE_BUILDER_REPORT.md` | `c2a301aca36e36fac87f68d1adc96a7330aac10f0e0e31cd7b33aab0aa930990` |
| `docs/bos-ai1/BOS_AI1_PROOF_GOVERNANCE_CLOSURE_V1_2B.md` | `6884a8a3aa687c642241760cf59a599f87c95d92b7886be0ee4bfc814f8383e9` |
| `docs/bos-ai1/BOS_AI1_P1_CLOSURE_FORMAL_TRACEABLE_TEST.md` | `c54f304e4634433ab20067ae9a10a2a966f6ec6edf538818a8316c3f72a96b8d` |
| `docs/bos-ai1/BOS_AI1_P1_CLOSURE_INDEPENDENT_REVIEW.md` | `40b39aaad7f17bd69ebc1eced5e6a19bfbcd44d11a56c7e5c219b2bbb51128be` |
| `docs/bos-ai1/BOS_AI1_P1_CLOSURE_EVIDENCE_PACKAGE.md` | `3b3e726a5d99f7c50a2ebb826952f39fb21af4c3a8a579f515962a9198dc4ed6` |

For transparency, the governance appendix has Windows checked-out-file SHA-256 `7f74d51410d1099f8054b9409695ac4d2ee654b786971dd03fe23169c9e547c5`; the difference is checkout line-ending normalization. The canonical Git-blob value above matches the provenance source.

This manifest does not list its own SHA-256 because embedding that value would change the file. Its Git blob and the final evidence commit/tree are reported after the documentation-only commit is created.

## Changed-file manifest relative to failed candidate

Technical closure paths:

1. `tools/bos-ai1/project-progress-brief-proof.js`
2. `tools/bos-ai1/project-progress-brief-proof.test.js`
3. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_EXECUTION_RECORD.md`
4. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_BUILDER_REPORT.md`

Documentation-only evidence paths:

5. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_FORMAL_TRACEABLE_TEST.md`
6. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_INDEPENDENT_REVIEW.md`
7. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_EVIDENCE_PACKAGE.md`
8. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_PROVENANCE_MANIFEST.md`

Total changed paths after evidence creation: `8/10`. No dependency, database, migration, REG4 source/test, Business Rules, MG5, OC6, OpenClaw, Runtime or Production path is included.

## Operation attestation

- Branch: `proof/bos-ai1-v1.2b-p1-closure`.
- Repair rounds used: `1/2`.
- No force push, merge, tag or release.
- Push is permitted only after P0=0, P1=0, all tests pass, evidence is committed, and the branch worktree is clean.
- The final evidence commit/tree and remote SHA equality are recorded in the final Founder handoff.
