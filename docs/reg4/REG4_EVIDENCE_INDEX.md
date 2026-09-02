# REG4 Agent Registry V1 — Founder-Approved Evidence Index

> Record date: 2026-09-02
>
> Authority: Founder Approval — REG4 Agent Registry V1 Baseline
>
> Verdict: **APPROVED / COMPLETE / STOP**

## 1. Authoritative identities

REG4 has two approved records with different purposes. They must not be
substituted for each other.

| Record | Commit | Tree | Meaning |
|---|---|---|---|
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` | Exact code/test/report target of Formal Traceable Test and Independent Review |
| REG4 Final Evidence Record | `4d2093c83d80e1de5b2de174d77e871bad2fb1f5` | `f7fbcf6e3de4853bf8ff3be3db6781256ce81342` | Consolidated evidence package; does not replace the Technical Baseline |

The documentation-only closure commit after Founder approval may advance
`work/reg4-agent-registry-v1`, but it does not redefine either record above.

## 2. Formal Traceable Test binding

The formal-test worktree was detached and clean at exact commit
`3def40122e4072f266c943bc4eb84d3164501339`, tree
`aef6c623ce7f549b560af46e73a7ee6d0abd35ae`.

| Gate | Result |
|---|---:|
| Builder targeted `REG4-P1-01` | `1/1 PASS` |
| Independent QA targeted `REG4-QP1` | `2/2 PASS` |
| Targeted total | `3/3 PASS` |
| Full Builder | `13/13 PASS` |
| Full Independent QA | `14/14 PASS` |
| Combined regression | `27/27 PASS` |
| Failed / cancelled / skipped / todo | `0 / 0 / 0 / 0` |

Founder-close verification reran targeted `3/3` and combined `27/27` at the
same exact commit/tree with a clean worktree; all passed. This verification
confirms but does not replace the recorded Formal Traceable Test.

## 3. Independent Review binding

Independent Review ran read-only in a separate detached clean worktree at the
same exact Technical Baseline:

```text
commit = 3def40122e4072f266c943bc4eb84d3164501339
tree   = aef6c623ce7f549b560af46e73a7ee6d0abd35ae
result = PASS
P0/P1/P2 = 0/0/0
P1-01 CLOSED = YES
audit completeness = COMPLETE
```

The reviewer did not edit source, test or evidence and did not commit, push,
merge, tag, release or approve the baseline.

## 4. Evidence map

| Artifact | Purpose |
|---|---|
| [Architect Design](./REG4_ARCHITECT_DESIGN.md) | Approved proof contract, state model, permissions, audit and trace matrix |
| [Builder Report](./REG4_BUILDER_REPORT.md) | Implementation lineage, repair rounds and Builder evidence |
| [Independent QA Report](./REG4_INDEPENDENT_QA_REPORT.md) | Independent tests, exact candidate identity and findings ledger |
| [Final Evidence Package](./REG4_EVIDENCE_PACKAGE.md) | Consolidated formal-test, review, fingerprints, delivery and scope record |
| [BOS-AI1 Design Alignment](./REG4_BOS_AI1_DESIGN_ALIGNMENT.md) | Post-approval read-only comparison and implementation-opening recommendation |
| `tools/reg4/agent-registry.js` | Approved proof implementation source |
| `tools/reg4/agent-registry.test.js` | Builder suite |
| `qa/reg4/agent-registry.independent.test.js` | Independent QA suite |

Canonical source Git-blob SHA-256 at the Technical Baseline:

```text
20b8ac790590e5eb36b05f1f55fe4e8251558ad75396805c214d194f2459f3f5
```

## 5. Approved proof statement and limits

REG4 V1 proves, with synthetic in-memory data, that an Agent Package can be
registered, identified, versioned, fingerprint-checked, permission/evidence
bound, approval-lifecycle controlled, protected from self-approval and recorded
in a complete audit chain. It also proves that attacker-controlled errors do not
control audit reason codes or error metadata.

The approval does not create a production Registry, durable persistence,
runtime IAM, Model Gateway, OpenClaw integration, Business Rules, autonomous
write or Production eligibility.

## 6. Delivery and authority boundary

- Authorized branch: `work/reg4-agent-registry-v1`.
- Final Evidence Record remote SHA before documentation closure:
  `4d2093c83d80e1de5b2de174d77e871bad2fb1f5`.
- Documentation closure: fast-forward only; no force push.
- Merge to main: `NOT_AUTHORIZED`.
- Tag/release: `NOT_AUTHORIZED`.
- BOS-AI1 implementation: `NOT_AUTHORIZED`.
- MG5, OC6, OpenClaw, Business AI Runtime and Production: `NOT_AUTHORIZED`.
- Current state: **STOP** pending Founder decision.
