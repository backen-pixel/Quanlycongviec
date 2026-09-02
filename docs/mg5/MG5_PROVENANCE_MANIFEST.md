# MG5 Proof V1 — Provenance Manifest

## Authority envelope

This manifest belongs only to the Founder-approved **MG5 Proof Implementation
Fast Track**. The controlling implementation parent is
`057de036f9434b6acdd1951b556bc2cbd77cd881`, with tree
`6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf`.

The authorization is limited to synthetic data, fake synchronous adapters and
in-memory policy, budget, idempotency and audit state. It excludes OC6,
OpenClaw, Business AI Runtime, Production, real models/providers/APIs,
credentials, real tenant data, database/migration work and business effects.
It also excludes merge to `main`, force-push, tag and release.

## Commit chain

```text
057de036f9434b6acdd1951b556bc2cbd77cd881  authorized parent
    |
    +-- c0ba1b282422c68bd96478d7585f2c2381198420  technical candidate
            tree 02f6ed227a288009f449ef9de4e94ba98ceb6c33
```

The final evidence-record commit and tree are assigned by Git after this
manifest and the evidence documents are committed. Their exact identities are
verified at the local and remote branch heads and supplied to Founder with the
baseline decision request; they are intentionally not self-referential fields
inside their own Git tree.

## Technical-candidate artifact identities

| Path | Git blob |
|---|---|
| `docs/mg5/MG5_BUILDER_REPORT.md` | `e5ec521c894cd79ed777b6efb51e9588ff89fddd` |
| `docs/mg5/MG5_INDEPENDENT_QA_REPORT.md` | `91d26e3656853dd899455266813436d294cbbfb5` |
| `docs/mg5/MG5_PROOF_IMPLEMENTATION_CONTRACT.md` | `e12cc9df429086ea84351cfa27ecba6e0e479ecc` |
| `qa/mg5/model-gateway-proof.independent.test.js` | `fd04d560cb3fddfa46ce7c055af9c702c95c4601` |
| `tools/mg5/model-gateway-proof.js` | `537ec2930573735c4c1671e4929b28b8910b9ac4` |
| `tools/mg5/model-gateway-proof.test.js` | `72608771e27e0f4f307b55b71e9760e5d3dd52fc` |

## Predecessor bindings

| Record | Commit | Tree |
|---|---|---|
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |
| BOS-AI1 Technical Baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` | `f17e4c4f699335ddad056310c8d70e3ed3df6909` |

| Bound predecessor path | Blob at baseline, parent and candidate |
|---|---|
| `tools/reg4/agent-registry.js` | `be69c77be7559f8fb2ccf896612e65e0f605b595` |
| `tools/bos-ai1/project-progress-brief-proof.js` | `05f51d90b4f187d95682b58f75430f88bad9f82d` |
| `tools/bos-ai1/project-progress-brief-proof.test.js` | `ece5780d08899d4b07caf846dec88452722074dd` |

Both baselines are ancestors of the authorized parent. The candidate is a
single-parent child of that exact parent. No predecessor source or test was
modified.

## Role and artifact separation

| Role | Owned evidence |
|---|---|
| Architect | `MG5_PROOF_IMPLEMENTATION_CONTRACT.md` |
| Builder | proof source, Builder test and `MG5_BUILDER_REPORT.md` |
| Independent QA | independent test and `MG5_INDEPENDENT_QA_REPORT.md` |
| Orchestrator | `MG5_FORMAL_TRACEABLE_TEST.md`, this manifest, evidence package and evidence index |
| Independent Reviewer | `MG5_INDEPENDENT_REVIEW.md`, based on a separate clean detached worktree |

Builder used `2/2` authorized repair rounds. Independent QA corrected one
QA-only Git-blob oracle error without changing the expected baseline or any
candidate artifact. The Independent Reviewer made no candidate change.

## Execution provenance

- Runtime: Node.js `v22.20.0`.
- Technical-candidate FTT worktree:
  `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\SX1_XLSX_SECURITY_REMEDIATION_2026-09-01\MG5_FTT_c0ba1b28`.
- Independent-review worktree:
  `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\SX1_XLSX_SECURITY_REMEDIATION_2026-09-01\MG5_IR_c0ba1b28`.
- Both were detached at the exact candidate and clean before and after their
  respective gates.
- FTT: `115/115 PASS`; MG5 deterministic rerun: `48/48 PASS`.
- Independent Review: `115/115 PASS`; deterministic combined rerun exit `0`.
- Open findings: `P0=0`, `P1=0`, `P2=0`.

All content in this manifest is proof evidence, not a claim of Production
durability, tamper resistance, distributed atomicity, provider behavior or
business correctness.
