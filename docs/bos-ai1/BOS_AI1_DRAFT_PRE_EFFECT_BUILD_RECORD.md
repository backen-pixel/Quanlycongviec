# BOS-AI1 DRAFT Pre-Effect Handoff — Build record

Founder-authorized parent: `f2f79018abe727f9499ef2a5b541c7246c760f25`.
Initial build derives the proven in-memory safety/ordering primitives from the
approved additive Publish handoff while implementing a separate fixed DRAFT
contract. Existing modules and evidence are unchanged. No approval requirement
is removed from Publish; DRAFT uses its own scoped permission and action policy.

New authority and permits are private to the DRAFT module; the adapter is branded
and cannot be replaced by an arbitrary live connector. Action identity is bound
to one idempotency key, and the adapter owns creation of the non-canonical draft.
Audit records distinguish BOS control from Application Service results.

Development round 0 completed 2026-09-03: DRAFT 172/172 PASS, followed by full
880/880 PASS (172 DRAFT + 383 repository regression + 152 historical Controlled
Publish independent + 173 historical Pre-Effect independent). No failed,
cancelled, skipped or todo tests. Repairs used: **0/2**. Test runs changed no file.

Development ran on the four uncommitted new files above the documentation parent;
it is not described as an exact-commit formal run. Original TAP/stderr/manifests
are preserved externally and will be embedded in the evidence package.

The three historical external regression files were extracted byte-for-byte from
committed Pre-Effect evidence 18fd91bbc7e6ae8bfe10f4519219a4c53642d83e, verified by
SHA-256 and run with cwd set to the DRAFT worktree; their assertions/fixtures were
not modified. Repository regression includes READ/DRAFT, Controlled Publish,
Pre-Effect Publish, REG4 Builder/independent and MG5 Builder/independent tests.

Freeze these four paths as a technical candidate, then run 880 formal tests in a
separate clean detached workspace. Independent Review must use another clean
detached workspace and a reviewer who did not build this candidate. Bind both
reports to the same full candidate SHA/tree; evidence comes later without
source/test changes. Planned final footprint: 8/10. OC6 remains PAUSED at G0.

Rollback: STOP and preserve the candidate/evidence. Existing proof baselines are
untouched; no reset, force push, merge, tag, release or self-approval is permitted.

## Repair round 1 — immutable permit expiry after audit callbacks

Initial candidate `38a4dd853100f022843758360464206bfb1e0e58`, tree
`db3c9c873037b6f01bae640b2cf7b750da39f1e2`, passed 880 formal tests but Independent
Review found P2 `IR-DRAFT-P2-001`: re-evaluation could return ALLOW with an existing
permit that expired during its audit callback after the pre-callback expiry check.
Execution still rejected the expired permit with zero Domain/adapter/drafts;
P0=0/P1=0/P2=1. Original independent results: 222/223 adversarial PASS, 880/880
regression PASS. The initial commit, clean IR worktree and complete failed
review artifacts are preserved unchanged; no waiver or history rewrite.

Repair adds a check of immutable permit expiry against the final trusted clock
after audit callbacks and before returning ALLOW. Four Builder regressions cross
expiry in before/after ACTION_INTENT/BOS_DECISION callbacks. They require DENY,
PERMIT_EXPIRED, no returned permit and zero Application Service/Domain/drafts.

Round1 development: DRAFT 176/176, repository baseline383/383, historical
Controlled Publish152/152 and historical Pre-Effect173/173 = **884/884 PASS**.
Repairs used: **1/2**. The final candidate must receive fresh exact-commit formal
884/884 and an unchanged independent adversarial rerun before evidence/push.
Scope remains four candidate files and eight final files; OC6 stays PAUSED at G0.
