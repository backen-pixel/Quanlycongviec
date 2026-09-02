# BOS-AI1 Controlled Publish Proof Baseline V1 — Founder approved

Approval date: 2026-09-02. Authority: **FOUNDER APPROVAL — BOS-AI1 CONTROLLED
PUBLISH PROOF BASELINE V1**, supplied directly in the current Founder task.
Verdict: **FOUNDER-APPROVED**. This is approval of a synthetic proof only.

## 1. Immutable identities

| Record | Full commit SHA | Git tree SHA |
|---|---|---|
| Controlled Publish Technical Baseline V1 | `1317f1468a341379f51e33b5631d7767af7c8848` | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |
| Final Evidence Record | `24f5cec5880e5f37c60930cd07388a8ec360d414` | `0bed4862bc3dbc7a1b6806481519785fd7103a81` |
| Historical READ/DRAFT Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | `f17e4c4f699335ddad056310c8d70e3ed3df6909` |
| Integration Parent of the technical proof | `c0ba1b282422c68bd96478d7585f2c2381198420` | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |

A branch, abbreviated SHA, later evidence/closure record or working directory
must not replace the technical identity. The historical READ/DRAFT commit,
tree and code/test remain intact. V1 adds only the narrow fake LIMITED_WRITE
Publish proof; it does not rewrite the prior baseline.

## 2. Closure verification performed

Read-only identity verification completed 2026-09-02T16:12:53Z. Git returned
the exact technical tree above. `24f5cec5` resolves to the full evidence SHA
above and has the approved technical commit as its immediate parent.

The verifier read the portable evidence JSON from that Git commit, decoded
all 24 artifacts and verified byte lengths and SHA-256. It confirmed:

- `formal-manifest.json`: commit `1317f1468a341379f51e33b5631d7767af7c8848`,
  tree `ab7296b7ac316ea24324f5dc431a66c3375d91ca`, combined **195/195 PASS**, exit 0.
- `independent/independent-manifest.json`: clean pre/post at that same exact
  commit/tree, independent adversarial **152/152 PASS**, exit 0, P0/P1/P2=0/0/0.
- Both original raw TAP logs match their recorded hashes and PASS counts.
- Every source/test outside `docs` is identical between technical and evidence
  commits. Their diff consists of exactly four added evidence documents.
- The original READ/DRAFT source/test blobs match historical `f44c1436...`.

No substituted commit, newly inferred test result or reattribution to the
documentation commit was used. Verifier and machine-readable result are in
the external sibling `BOS_AI1_CONTROLLED_PUBLISH_CLOSURE` evidence directory.

| Source/test | Git blob at both approved and evidence commits |
|---|---|
| tools/bos-ai1/controlled-publish-proof.js | `a61d296ee6347838bbd64f94ae24bd2d6d17e1b8` |
| tools/bos-ai1/controlled-publish-proof.test.js | `d2739867f20c17e0c39c0ab95bf9a06a1b874853` |
| tools/bos-ai1/project-progress-brief-proof.js | `05f51d90b4f187d95682b58f75430f88bad9f82d` |
| tools/bos-ai1/project-progress-brief-proof.test.js | `ece5780d08899d4b07caf846dec88452722074dd` |

## 3. Approved proof behavior and limits

For `project.publish_status_update` / LIMITED_WRITE, missing valid approval
produces no effect. Approval returns to BOS-AI1 for current Agent, delegation,
permissions, company, resource/version, policy and approver validation before
one fake acceptance. Sequential/nested duplicate requests do not accept again.
Partial or uncertain simulated results return COMPENSATION_REQUIRED without
blind retry; every invocation has safe audit and correlation.

Proof data, authority, approval, adapter and effects are synthetic and in memory.
Exactly-once covers one synchronous process and one bound proof lifetime.
The approval establishes no real Publish, database/email/external system,
durable audit, load capacity, Production recovery or operational readiness.

Approval basis: Formal 195/195, Independent Adversarial 152/152, P0=0/P1=0/P2=0,
proof files 8/12, implementation repairs 0/2, clean worktrees, evidence pushed
to `proof/bos-ai1-controlled-publish-v1`.

## 4. Authorized documentation closure and OC6 continuation

Exactly one documentation-only commit may update MASTER CONTEXT, PROJECT
DECISION LOG, BOS-AI1 Evidence Index and this baseline record, with immediate
parent `24f5cec5880e5f37c60930cd07388a8ec360d414`. It may be fast-forward pushed
to the same named branch. Its full SHA/tree and remote verification are
reported in the external handoff after creation; it is not a new technical baseline.

Source/test modification, force push, merge, tag and release are prohibited
for closure. No real OpenClaw, Business AI Runtime, Production or new major
phase is opened.

After closure, OC6 must rerun G0 with this new baseline, retaining historical
READ/DRAFT and pinned REG4/MG5. G0 PASS permits the already approved OC6 Proof
Fast Track to continue within unchanged P01–P14/G0–G9/IR-OC6-1 and its 20-file,
two-repair envelope. G0 FAIL requires STOP and an exact remaining gap report.
This record does not pre-claim G0 PASS and does not self-approve OC6 baseline.
