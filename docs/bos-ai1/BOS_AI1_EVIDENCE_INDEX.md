# BOS-AI1 — Founder-Approved Evidence Index

> Record date: 2026-09-02
>
> Authority: Founder Approval — BOS-AI1 Controlled Publish Proof Baseline V1, with preserved V1.2B READ/DRAFT history
>
> Verdict: **CONTROLLED PUBLISH V1 APPROVED / DOCUMENTATION CLOSURE / OC6 G0 CONDITIONAL**

## 0. Controlled Publish Proof Baseline V1 — current approval

| Record | Exact commit | Exact tree |
|---|---|---|
| Controlled Publish Technical Baseline V1 | `1317f1468a341379f51e33b5631d7767af7c8848` | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |
| Controlled Publish Final Evidence Record | `24f5cec5880e5f37c60930cd07388a8ec360d414` | `0bed4862bc3dbc7a1b6806481519785fd7103a81` |
| Historical READ/DRAFT Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | `f17e4c4f699335ddad056310c8d70e3ed3df6909` |

Formal 195/195 and Independent Adversarial 152/152 are both bound to the
Controlled Publish technical commit/tree above. Closure verification decoded
the committed portable evidence, checked all 24 artifact hashes and matched
both original manifests and raw PASS counts. P0/P1/P2=0/0/0; proof files 8/12;
implementation repairs 0/2. Evidence adds only documentation to the technical
baseline; source/test blobs are identical. READ/DRAFT historical blobs remain
unchanged, and its immutable commit is retained.

| Current evidence | Purpose |
|---|---|
| [Controlled Publish Baseline](./BOS_AI1_CONTROLLED_PUBLISH_BASELINE.md) | Founder approval, full identities, scope and closure authority |
| [Formal Test](./BOS_AI1_CONTROLLED_PUBLISH_FORMAL_TEST.md) | Exact-commit 195/195 execution |
| [Independent Review](./BOS_AI1_CONTROLLED_PUBLISH_INDEPENDENT_REVIEW.md) | Independent 152/152 adversarial, 195/195 regression and findings |
| [Decision Evidence](./BOS_AI1_CONTROLLED_PUBLISH_EVIDENCE.md) | Preserved pre-approval decision package |
| [Portable Evidence](./BOS_AI1_CONTROLLED_PUBLISH_EVIDENCE.json) | Original artifact bytes, manifests, test source and SHA-256 |

Exactly one documentation-only closure commit may follow `24f5cec5...`, with
fast-forward push to `proof/bos-ai1-controlled-publish-v1`. Its actual SHA/tree
is reported externally after creation. No source/test, merge, force push,
tag or release is authorized. After closure, rerun OC6 G0 using this baseline:
PASS permits continuation of the already approved OC6 proof Fast Track; FAIL
requires STOP. Real OpenClaw, Runtime and Production remain NO_GO.

Sections 1–8 below preserve the earlier V1.2B READ/DRAFT evidence and its
authority at that historical decision. Their old STOP/no-OC6 statements are
superseded only by the narrowly authorized continuation in this section.

## 1. Authoritative identities

BOS-AI1 V1.2B historical READ/DRAFT has two approved records with different purposes. They must not be
substituted for each other.

| Record | Commit | Tree | Meaning |
|---|---|---|---|
| BOS-AI1 Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | `f17e4c4f699335ddad056310c8d70e3ed3df6909` | Exact source/test/report target of Formal Traceable Test and Independent Review |
| BOS-AI1 Final Evidence Record | `2c8950670ab481c18ac371e32d46107a15912174` | `3e2b9ab56f5fdcfe879d35484939cee70657885a` | Documentation evidence package; source/test blobs remain identical to the Technical Baseline |

The Founder-authorized documentation-only closure commit has direct parent
`2c8950670ab481c18ac371e32d46107a15912174`. It may advance the authorized
branch but does not redefine either approved record above; its SHA/tree is
reported externally after commit creation because a commit cannot contain its
own identity.

## 2. Preserved failed evidence

| Record | Commit | Tree | Status |
|---|---|---|---|
| Failed candidate | `bfca56ef3fe242f2595813e734d8a6b3b94341e0` | `a5f9c21afc9c379f5de9bd17a2d3d8d3cef2d788` | Preserved unchanged as evidence of the four original P1 findings |

The Technical Baseline has the failed candidate as its direct parent. No
amend, reset or history rewrite was used.

## 3. Formal Traceable Test binding

Formal Traceable Test ran in a separate detached clean worktree at exact
Technical Baseline `f44c14365589b7ff9f1df2ce40185ef8ebece05f`, tree
`f17e4c4f699335ddad056310c8d70e3ed3df6909`.

| Gate | Result |
|---|---:|
| E01–E09 | `9/9 PASS` |
| C01–C09 | `9/9 PASS` |
| A01–A07 | `7/7 PASS` |
| T01–T06 | `6/6 PASS` |
| L01–L05 | `5/5 PASS` |
| P1C-01–P1C-04 | `4/4 PASS` |
| BOS-AI1 full | `40/40 PASS` |
| REG4 Builder | `13/13 PASS` |
| REG4 Independent QA | `14/14 PASS` |
| REG4 combined | `27/27 PASS` |
| Full combined regression | `67/67 PASS` |
| Failed / cancelled / skipped / todo | `0 / 0 / 0 / 0` |

The final evidence commit reran P1C `4/4` and combined `67/67`; both passed.
This confirms source/test integrity but does not transfer the formal binding
away from the Technical Baseline.

## 4. Independent Review binding

Independent Review ran read-only in a separate detached clean worktree at the
same exact Technical Baseline:

```text
commit = f44c14365589b7ff9f1df2ce40185ef8ebece05f
tree   = f17e4c4f699335ddad056310c8d70e3ed3df6909
result = PASS
P0/P1/P2 = 0/0/0
audit completeness = COMPLETE
```

The reviewer was not the Builder, reran all required inventories, edited no
file and performed no commit, push, merge, tag, release or baseline approval.

## 5. P1 closure map

| Finding | Closure evidence | Result |
|---|---|---|
| Hostile Proxy/thrown value controls decision metadata | Module-private provenance; unproven error becomes safe `DENY/INVALID_REQUEST`; no attacker text | `CLOSED` |
| Agent can retire after REG4 revalidation | Final trusted context resolves before the final REG4 read; no external trust read before effect | `CLOSED` |
| Missing approver can be treated as verified | Non-`none` approver must resolve; audit separates claimed and verified identity | `CLOSED` |
| Reentrant identical delivery creates two drafts | Fresh idempotency lookup after hook, final context comparison and REG4 revalidation | `CLOSED` |

Every tested invocation creates exactly one linked in-memory audit record.
P1C-04 has two invocations and therefore two linked audits, while creating
exactly one draft.

## 6. Evidence map

| Artifact | Purpose |
|---|---|
| [Proof Baseline](./BOS_AI1_PROOF_BASELINE.md) | Founder-approved technical identity, proof statement and authority boundary |
| [Governance Closure Appendix](./BOS_AI1_PROOF_GOVERNANCE_CLOSURE_V1_2B.md) | Mandatory E01–R04 inventory and PASS/STOP gates |
| [Architect Handoff](./BOS_AI1_ARCHITECT_HANDOFF_V1_2B.md) | Approved proof contract and trace design |
| [Original Execution Record](./BOS_AI1_EXECUTION_RECORD_V1_2B.md) | Parent provenance and execution envelope |
| [Synthetic Fixture Manifest](./BOS_AI1_SYNTHETIC_FIXTURE_MANIFEST.md) | Synthetic in-memory fixture inventory |
| [Original Builder Report](./BOS_AI1_BUILDER_REPORT.md) | Initial implementation and test evidence |
| [P1 Closure Execution Record](./BOS_AI1_P1_CLOSURE_EXECUTION_RECORD.md) | Four-finding repair trace and round count |
| [P1 Closure Builder Report](./BOS_AI1_P1_CLOSURE_BUILDER_REPORT.md) | Failed reproduction and Builder reruns |
| [Formal Traceable Test](./BOS_AI1_P1_CLOSURE_FORMAL_TRACEABLE_TEST.md) | Exact commit/tree formal test binding |
| [Independent Review](./BOS_AI1_P1_CLOSURE_INDEPENDENT_REVIEW.md) | Read-only independent rerun and finding disposition |
| [Closure Evidence Package](./BOS_AI1_P1_CLOSURE_EVIDENCE_PACKAGE.md) | Consolidated decision evidence and gates |
| [Provenance Manifest](./BOS_AI1_P1_CLOSURE_PROVENANCE_MANIFEST.md) | Commit, tree, changed paths and SHA-256 integrity |
| `tools/bos-ai1/project-progress-brief-proof.js` | Approved proof implementation source |
| `tools/bos-ai1/project-progress-brief-proof.test.js` | BOS-AI1 test inventory including P1C closure |

Canonical source and test Git-blob SHA-256 at the Technical Baseline:

```text
source = 085a6a4e73fc47dc238e32da906c4ea56cd4c74ee08e19ea876a8b1e725ce36a
test   = 8b6e1caa2bd929149ef593bc3cb382e0ee1c1725d25223d02801b34290ad3836
```

## 7. Approved proof statement and limits

BOS-AI1 V1.2B proves, with synthetic in-memory data, a governed Project
Progress Brief flow for scoped READ and non-canonical DRAFT effects. It binds
Agent ID, Agent version, package SHA-256 and the approved REG4 commit/tree;
revalidates Agent status and required evidence references immediately before
effect; fails closed on unavailable or changed trust context; enforces
idempotency; and records one safe linked proof-ledger entry per invocation.

The approval does not establish durable/tamper-proof audit, production IAM,
database persistence, Business Rules, Model Gateway, OpenClaw integration,
Business AI Runtime, autonomous Publish or Production eligibility.

## 8. Delivery and authority boundary

- Authorized branch: `proof/bos-ai1-v1.2b-p1-closure`.
- Final Evidence Record remote SHA before documentation closure:
  `2c8950670ab481c18ac371e32d46107a15912174`.
- Documentation closure: exactly one documentation-only commit, direct parent
  the Final Evidence Record, fast-forward push only.
- Source/test changes: `NOT_AUTHORIZED`.
- Force push / merge / tag / release: `NOT_AUTHORIZED`.
- MG5, OC6, OpenClaw, Business AI Runtime and Production: `NOT_AUTHORIZED`.
- Current state: **APPROVED / COMPLETE / STOP**.
