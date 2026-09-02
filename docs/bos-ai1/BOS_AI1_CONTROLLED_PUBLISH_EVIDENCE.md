# BOS-AI1 Controlled Publish Proof — Founder decision package

State: **ALL TECHNICAL GATES PASS — STOP FOR FOUNDER BASELINE DECISION**.
No baseline approval is implied.
OC6 remains **PAUSED at G0**; its P01–P14 and acceptance standard are unchanged.

## Authority and immutable technical identity

Founder Decision: Controlled Publish Effect Extension Fast Track, supplied on
2026-09-02. Original attachment SHA-256:
`c5b88dac0fb327cd13d5375d0abf005b3d29d6b408722b78dedc64efb18b3ac7`.

| Item | Commit | Tree |
|---|---|---|
| Authorized Integration Parent | `c0ba1b282422c68bd96478d7585f2c2381198420` | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |
| Controlled Publish technical candidate | `1317f1468a341379f51e33b5631d7767af7c8848` | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |

The evidence-record commit is a documentation-only descendant of this
technical candidate. Its final SHA/tree and exact remote verification are
recorded in the external handoff after creation. Neither a moving branch nor
that documentation commit substitutes for the tested technical identity.

Canonical source SHA-256 (Git blob bytes):

| Path | Git blob | SHA-256 |
|---|---|---|
| tools/bos-ai1/controlled-publish-proof.js | `a61d296ee6347838bbd64f94ae24bd2d6d17e1b8` | `9b7e10eafa4533c59cc2a66068f00d7a7f3d19b8d1f19546d72d37e35c7528ad` |
| tools/bos-ai1/controlled-publish-proof.test.js | `d2739867f20c17e0c39c0ab95bf9a06a1b874853` | `74329417f4a2056eb972b222043e7ca7ba5345b021f81b5be8258a6809ee409d` |

## Evidence map

| Record | Purpose |
|---|---|
| BOS_AI1_CONTROLLED_PUBLISH_CONTRACT.md | Architect contract, CP01–CP10, ordering and scope |
| BOS_AI1_CONTROLLED_PUBLISH_BUILD_RECORD.md | Builder gate and repair accounting |
| BOS_AI1_CONTROLLED_PUBLISH_FORMAL_TEST.md | Exact-commit formal execution |
| BOS_AI1_CONTROLLED_PUBLISH_INDEPENDENT_REVIEW.md | Independent reviewer verdict and findings |
| BOS_AI1_CONTROLLED_PUBLISH_EVIDENCE.json | Portable raw evidence, test source, original decision and manifests |

The portable evidence JSON stores artifact bytes as base64 with SHA-256 and
length. Decode each artifact's `data` to recover exact bytes; verify `sha256`
before running its test/runner. Independent test source is evidence authored
outside the candidate by the reviewer, not Builder fixture reuse. External
evidence folder: sibling `BOS_AI1_CONTROLLED_PUBLISH_EVIDENCE`.

## Scope and outcome

| Final gate | Result |
|---|---|
| Development Tests | 195/195 PASS |
| Formal Traceable Test | 80 controlled + 40 BOS-AI1 + 27 REG4 + 48 MG5 = 195/195 PASS |
| Independent rerun of full regression | 195/195 PASS |
| Independent adversarial tests, own fixtures | 152/152 PASS |
| Open findings | P0=0 / P1=0 / P2=0 |
| Implementation repair rounds | 0/2 |
| Changed repository paths | 8/12, all additive |
| Formal/review workspaces | Detached and clean before/after |

There are 347 distinct executed test cases across the principal and independent
adversarial suites. Repeated group/regression runs are not counted again.
The independent evidence-export script needed one local file-output correction;
candidate source/tests did not change and this was not an implementation repair.

The exact-branch push is gated by a clean committed worktree, the eight-path
allowlist, no source/test difference from the reviewed candidate, complete
evidence hashes and zero P0/P1. Its actual result and remote SHA are in the
external final handoff; this document does not pre-claim a remote operation.

Changed paths are the two new files under `tools/bos-ai1` and these six new
records under `docs/bos-ai1`: CONTRACT.md, BUILD_RECORD.md, FORMAL_TEST.md,
INDEPENDENT_REVIEW.md, EVIDENCE.md and EVIDENCE.json, each with the
`BOS_AI1_CONTROLLED_PUBLISH_` filename prefix. Generated raw evidence lives
outside the worktrees and is embedded in the single portable JSON artifact.

Only the synthetic `project.publish_status_update` LIMITED_WRITE proof was
added. Missing approval returns REQUIRE_APPROVAL with no effect; a valid
approval requires re-entry and complete revalidation before one fake effect.
Consumed/misbound/expired/revoked approval cannot create another effect.
Sequential and nested idempotency are controlled. PARTIAL/UNKNOWN results
require compensation and are never retried automatically. Every branch has
safe, linked audit and correlation.

All existing BOS-AI1/REG4/MG5 source, tests, baseline documents and dependency
manifests remain unchanged. No production rule, database, actual model,
secret, credential, external business system, OpenClaw, Runtime or Production
capability is used. The only authorized remote action is the gated Git push
to `proof/bos-ai1-controlled-publish-v1`.

Exactly-once is limited to one synchronous in-memory proof instance and
lifetime. The fake adapter always records its simulated acceptance internally;
UNKNOWN describes its deliberately uncertain result, not a real unobserved
external effect. No restart durability, distributed execution or real
compensation is claimed.

## Founder decision boundary

After all gates pass and the named branch is pushed and verified, STOP for:

**APPROVE BOS-AI1 CONTROLLED PUBLISH PROOF BASELINE**

or

**DENY BOS-AI1 CONTROLLED PUBLISH PROOF BASELINE**.

Only a subsequent Founder approval permits OC6 to run G0 again with the new
baseline. This package does not execute G0 or resume OC6.
