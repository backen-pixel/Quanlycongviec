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
