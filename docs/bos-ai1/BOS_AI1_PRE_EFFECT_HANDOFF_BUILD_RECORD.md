# Pre-Effect Handoff V1 — Build and scope record

Founder authority is the Pre-Effect Domain and Audit Handoff Fast Track supplied
in this task. OC6 remains PAUSED at G0 pending a separate Founder baseline verdict.

Parent: `f259c891e266b51e44cc1691562443054c3fc812` (documentation record), containing
approved technical `1317f1468a341379f51e33b5631d7767af7c8848` / tree
`ab7296b7ac316ea24324f5dc431a66c3375d91ca`. The parent delta has exactly the eight
authorized evidence/closure documentation paths and no source/test changes.

## Implementation

One additive proof module, one test module, Architect contract and this build
record: four tracked paths before the evidence documentation. Original BOS,
REG4, MG5, dependencies and business rules remain byte-identical to the parent.
Fake-only, synchronous, process-local proof; no network/runtime/database/model.

The control decision returns a permit after pre-effect audit, without calling
Application Service, Domain or Adapter. A separate Application Service endpoint
enforces branded permit binding, current authority, Domain veto and final Domain
revision checks before private atomic consumption/acceptance. Uncertain effects
and failed post-effect audit preserve secondary evidence for compensation.

## Development and repair accounting

Initial new suite: 182/186 PASS, four FAIL. Root cause was the test fixture's REG4
read counter increment being inside an optional callback expression. Without
that callback, four BLOCKED/RETIRED injections never reached their intended read.

Repair round 1: increment the fixture counter unconditionally, then invoke the
optional callback. No production/proof source modification in this repair.
No acceptance criterion was removed or weakened. Repairs consumed: **1/2**.

Post-repair full repository suite: **381/381 PASS** = 186 new handoff tests +
195 unchanged baseline regression tests (Controlled Publish 80; READ/DRAFT 40;
REG4 Builder/Independent 27; MG5 Builder/Independent 48). A preceding 355-test
run omitted the two qa independent suites; the complete 381-test run supersedes
it for the regression gate. Both raw runs are retained, never added as unique tests.

The previous 152 independent Controlled Publish adversarial tests are rerun as
additional historical regression. The external test copy changes only ROOT to
the current pinned test workspace; all fixtures/assertions remain unchanged.
Formal evidence separately records this adaptation and its hash.

## Review and evidence plan

Freeze the technical commit after these four paths; Formal Traceable Test and
fresh independent reviewer each use their own clean detached worktree at that
exact commit/tree. Portable evidence and reports are added later in documents
only, with source/test equality verified. At most eight tracked paths anticipated,
within the Founder limit of 12. No further source/test repair without counting
the remaining second round and rerunning the exact-commit gates.

The final verdict requires formal and independent PASS, P0/P1=0, no unresolved
control issue, a clean worktree, exact file inventory, and non-force push only to
`proof/bos-ai1-pre-effect-domain-audit-v1`. No main merge, tag or release.

Rollback is to stop using this separate proof branch and retain the approved
prior baselines. No history rewrite or deployment rollback is performed.
