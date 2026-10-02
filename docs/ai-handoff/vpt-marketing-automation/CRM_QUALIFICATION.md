# CRM qualification increment — 2026-10-02

Base: PR22 ec53dafdf23f32c6638997e45ae2d9e5559c3455. This increment implements the **human confirmation/exception path** inside the existing CRM. It does not replace the goal of automated intake/qualification with manual processing of every customer.

## Behavior

- LeadDetail contains a confirmation panel backed by `/crm/leads/:id/marketing-quality`. Responsible users/company administrators confirm usable contact, product demand and service area with an evidence note. Frontend form values are human attestations, not provider-verified facts.
- Application service only accepts decision/revision/context and an idempotency key. Actor/company come from authenticated server context. Existing CRM access middleware applies first; the database additionally requires current active ownership/administrative authority, company/tenant scope and active routing. Merely being a participant is insufficient. Broader roles blocked by existing middleware remain blocked; no role expansion is included.
- New additive migration650 writes immutable events and uses transaction locks plus optimistic revisions. Repeated requests return current state; changed requests cannot reuse a key. A recorded event is the audit evidence. There is no new business-table writer outside CRM.
- Relevant Lead, Customer, region, assignee or region-membership changes invalidate prior evidence. Protected monotonic source revisions prevent A→B→A from restoring old qualification. The original CRM writers continue working; triggers only track rows enrolled by this feature. Customer city/contact edits are included. Ordinary stage/progress changes do not invalidate demand by themselves.
- Existing destructive merge/delete paths are not used for identity resolution. Evidence has no cascading FK to those entities and survives deletion; a deleted or moved Lead cannot be read/qualified through its old scope. This does not fix the legacy multi-step merge's other partial-write risks. Never automatically transfer evidence to a surviving Lead.
- An unavailable source is an error and clears the panel. Changed Lead/company remounts it. Pending/failed save hides old qualification until reloaded.

## Feature and rollout gates

`VPT_CRM_LEAD_QUALITY=1` enables the new endpoints; default is disabled. Both reads and writes require primary-only routing (failover disabled). Migration must be rehearsed on isolated PostgreSQL before any approved runtime installation. It adds triggers to CRM/customer/region/user/membership updates; review locks, latency, privileges and actual schema on the approved deployment environment. No migration/flag was applied to a real database by this task.

Rollback disables this feature and preserves evidence/source revisions. Keep invalidation triggers while evidence might be reused. Removing them would make old evidence unsuitable; invalidate/reconfirm before any future reuse. Do not restore broad public writes or delete history.

## What this proves and what remains

Qualification is about demand/contact/area. It is **not** proof of a unique paid customer, paid source, trial inclusion, automated eligibility, or achieved250k CPQL. Response explicitly reports `qualifiedUniquePaidLead:false`.

Still required for the full objective: non-destructive cross-channel identity links and verified source receipts; trial start/account roster and complete cohort projection; receiver/backup/calendar bindings; verified AI fact extraction/delegation, takeover/opt-out and atomic scheduling; operational dashboard; full integration/live UAT; independent review and Founder release. Finance remains deferred.

## Validation

Verified implementation head7079b266: independent review PASS after closing three P2 findings; Node18/22 combined256 tests PASS; PostgreSQL16 CRM21PASS/0SKIP; whole frontend build and synthetic-only supported-browser checks PASS within the scopes in [the review evidence](CRM_QUALIFICATION_REVIEW.md). CI used the PR merge ref containing this head. No live UAT/release claim. A later docs-only commit does not change these code blobs.

- 18 downloaded CRM/UI/migration source blobs verified at ec53daf; support files also compared to the same Git tree before publication.
- Local service + actual-router tests:35 PASS. This is not SQL/runtime authorization proof.
- New PostgreSQL16 CI exercises table/function ACLs, two concurrent decisions, CRM edits, retries, source invalidation including A→B→A, revoked users, tenant/region scope, rollback and deletion evidence preservation. Read the exact published run before claiming PASS.
- Full authenticated LeadDetail and live CRM acceptance remain pending; a draft PR is not approval to release. The local browser exercised the real component under a synthetic wrapper.
