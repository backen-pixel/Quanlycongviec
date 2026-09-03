# BOS-AI1 READ Pre-Effect Handoff — Formal Traceable Test

Verdict: **1,494/1,494 PASS**. No failed, cancelled, skipped or todo tests.

- Technical candidate: `b040d12a27ec0c99433a7c2abb988cc993cf337b`.
- Git tree: `4190816ac113d2b6352eb7d242b1d35a9f58ca1e`.
- Direct parent: `0c2b16f381421538ce220270305534612974d615`.
- Parent tree: `ba8e496311c9c99a9f8094a8197b41df4d066def`.
- Execution workspace: clean detached `BOS_AI1_READ_PRE_EFFECT_FORMAL_R0`.
- Runtime: v22.20.0; git version 2.54.0.windows.1; win32.
- Started: 2026-09-03T11:00:04.515Z; last suite finished: 2026-09-03T11:00:12.191Z.

| Suite | Result |
|---|---|
| read | 387/387 PASS |
| historical-draft | 176/176 PASS |
| baseline-regression | 383/383 PASS |
| historical-controlled-publish | 152/152 PASS |
| historical-pre-effect | 173/173 PASS |
| historical-draft-independent | 223/223 PASS |
| Total | 1494/1494 PASS |

READ contributes 387 cases. The remaining 1,107 are unchanged historical
BOS-AI1/REG4/MG5 regression, including prior independent proofs. The six external
historical files were recovered byte-for-byte from the approved DRAFT evidence;
their SHA-256 values are checked before running. No existing source or test changed.

| New source/fixture/test | Git blob | Canonical SHA-256 |
|---|---|---|
| `read-pre-effect-fixtures.cjs` | `01235171a3964a53493e59179477f0690294ca82` | `32745f2336ffce9a0db82322d06709a16c60f4eb06a7d5febca563dce7b566ac` |
| `read-pre-effect-handoff-proof.js` | `1789d8821b42121b13dee398dc6ed3ece9211357` | `c3b43020210b8537cf0cfb70cc5ed4c493e9fa52e186c488967ada2c8764bcb4` |
| `read-pre-effect-handoff-proof.test.js` | `cf9271284d8cd62edc78eb3a652b9d2d38675287` | `7e2680e660aee5245a02e75da062d3567b4114429e497ecde69af7fae88e7e59` |

HEAD, tree, detached state, clean worktree and source fingerprints were checked
before and after execution. Git canonical blobs match the technical candidate.
Windows checkout CRLF conversion is recorded separately as workspace SHA-256;
it is not treated as a different Git source version.

The portable `BOS_AI1_READ_PRE_EFFECT_EVIDENCE.json` contains
`formal-round0/manifest.json`, the exact commands/executables/cwd/timestamps,
each raw TAP/stderr and its digest, `run-tests.cjs`, historical test provenance,
and `acceptance-map.json` listing all 387 READ cases against Founder requirements.
The map is an index, not an additional test count.

For replay, extract the artifacts outside a clean detached checkout at the
technical candidate, then run the extracted `run-tests.cjs` with that checkout,
a new output directory, the exact candidate commit/tree above and READ count 387.
Original Windows command lines are preserved in the manifests.

This verdict covers the additive, synthetic READ API only. Historical proof
modules remain available as their historical contracts. No OpenClaw, real API,
business data, database, Business AI Runtime or Production was exercised.
Formal PASS is not Founder baseline approval. OC6 remains PAUSED at G0.
