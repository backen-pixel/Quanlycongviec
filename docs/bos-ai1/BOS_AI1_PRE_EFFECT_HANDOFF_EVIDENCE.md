# BOS-AI1 Pre-Effect Handoff V1 — Founder evidence package

Technical verdict: **PASS; Founder baseline approval PENDING**. OC6 remains
**PAUSED at G0**. This package does not open a real service or a new phase.

| Record | Full SHA / tree |
|---|---|
| Technical candidate proposed for approval | `a4c80f30e3afcf8d0c2fec43d8634368890b383d` |
| Technical candidate tree | `7850bf028741e6319c62262cbd2b2f86c822134a` |
| Initial candidate, with historical P2 finding | `3d2b647a5d106590b86a18408bf1d631f491dc04` |
| Initial candidate tree | `b80e757929c5c976a7af4d08a4504bd273549592` |
| Documentation branch base | `f259c891e266b51e44cc1691562443054c3fc812` |
| Approved prior Controlled Publish technical baseline | `1317f1468a341379f51e33b5631d7767af7c8848` |
| Prior technical tree | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |
| Historical READ/DRAFT baseline | `f44c14365589b7ff9f1df2ce40185ef8ebece05f` |

REG4 `3def40122e4072f266c943bc4eb84d3164501339` and MG5
`c0ba1b282422c68bd96478d7585f2c2381198420` remain intact. Every prior
BOS/REG4/MG5 source and test is unchanged. Later evidence documents never replace
the technical commit above.

## Completed gates

| Gate | Result |
|---|---|
| Formal handoff tests | 188/188 PASS |
| Formal original BOS/REG4/MG5 regression | 195/195 PASS |
| Formal historical Controlled Publish adversarial regression | 152/152 PASS |
| Formal unique cases | **535/535 PASS** |
| Fresh independently authored handoff adversarial tests | **173/173 PASS** |
| Independent rerun of repository + historical suites | 383/383 + 152/152 PASS |
| Open findings | **P0=0, P1=0, P2=0** |
| Repair rounds consumed | **2/2** |
| Total tracked paths in proof plus evidence | **8/12** |

The 535-case independent rerun repeats the same formal cases; it is not another
535 unique tests. Across the final formal and new independent suites, there are
708 unique cases. All final evidence binds the same technical SHA/tree, and each
review/test worktree was clean before and after execution.

## Handoff demonstrated

BOS validates current Agent/authority/approval, writes Action Intent and ALLOW,
then returns an immutable bound permit with zero effect. The separate Application
Service checks the permit and invokes Domain. Domain DENY/STOP or changed state
prevents any Adapter call. After Domain ALLOW, final authority/expiry/Domain
revision checks precede atomic consumption and one fake Adapter acceptance.

Primary audit failure before effect stops execution. Partial/unknown effects and
failed post-effect audit return COMPENSATION_REQUIRED, with retrievable secondary
receipts. Exact duplicates recover results or IN_PROGRESS without another effect.
Hostile data cannot supply audit metadata or escape through Proxy/getter errors.

IR-HANDOFF-001 was found on the initial candidate: exporting a growing private
ledger with the bounded input copier could hide its receipts. Repair round 2
copies each trusted record separately; the independent assertions are retained
and rerun unchanged. Initial FAIL evidence and its commit remain preserved.

## Portable raw evidence

`BOS_AI1_PRE_EFFECT_HANDOFF_EVIDENCE.json` embeds 123 artifacts
with byte length, SHA-256 and base64 data. It includes Founder authorization,
development failures and repairs, both formal runs, both independent reviews,
independent test fixtures, exact command/timestamp manifests and raw TAP.

- Final formal: `formal-final/formal-manifest.json`.
- Final independent: `independent-final/independent-manifest.json`.
- Historical initial-candidate records: `formal/` and `independent/`.

To inspect an artifact, decode its base64 data and verify length and SHA-256.
Use the manifests' exact technical identity and command arguments for reruns.
The historical 152-test adaptation changes only its ROOT workspace declaration;
no historical assertion or fixture is changed. The final independent fixtures
and assertions remain reviewer-authored, separate from Builder tests.

## Scope and final decision

In-memory synthetic data, clock, authority, approvals, Domain, Adapter and audit.
Exactly-once is process-local and synchronous; this does not establish durable
audit, crash recovery, multi-process serialization, throughput or production
readiness. Trusted harness callbacks are fault-injection tools, not a sandbox
for arbitrary code. No model, real network business call, DB, secret, real data,
OpenClaw, Runtime or Production was used.

Only the final gated Git egress is authorized, to
`https://github.com/backen-pixel/Quanlycongviec.git`, branch
`proof/bos-ai1-pre-effect-domain-audit-v1`. No force push, main update, merge,
tag, release or self-approval. Exact final evidence SHA and remote verification
are reported separately after the documentation-only evidence commit.

STOP for Founder **APPROVE / DENY BOS-AI1 PRE-EFFECT HANDOFF PROOF BASELINE**.
Only a subsequent Founder approval permits OC6 to rerun G0 using this baseline.
