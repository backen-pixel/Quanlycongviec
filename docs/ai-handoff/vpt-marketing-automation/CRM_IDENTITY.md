# CRM identity links — incremental implementation, 2026-10-02

Base PR22:79e012b. The full customer/spend → AI intake/handoff → dashboard → acceptance goal remains active. This increment implements the CRM relationship service needed to preserve source records while reviewing duplicates. It is not complete automated deduplication or a release package.

## Contract and semantics

- GET/POST `/crm/leads/:id/identity` is mounted after CRM auth/Lead access. Feature `VPT_CRM_LEAD_IDENTITY=1`, default disabled; primary-only with failover disabled. Migration651 depends on650's fresh database authorization helper. No changes to650.
- An authorized human can LINK/UNLINK two same-company Leads using current snapshot tokens, a request ID and an evidence note. The server determines actor/company, and rechecks every available member's current authority in the database. A shared phone alone never creates a link. AI-provider evidence and delegation are not yet connected.
- Relationships are normalized undirected pairs, stored independently from CRM Lead/customer records. Commands, relationship revisions and audit events commit atomically. The ledger has no cascading entity FK; original conversations, Leads and attribution remain untouched.
- Active connected components retain stale links and missing/moved members. Such groups require review; filtering a stale link before closure would incorrectly manufacture two customers. The new company sees a generic unresolved history marker without the old-company peer IDs.
- Source generation tracks identity fields (company, customer binding, contact, customer name), separately from demand/routing. A→B→A does not revive identity evidence. Changing demand, stage or assignment does not change identity generation.
- UNLINK preserves review markers on all affected members. Retrying an old LINK after UNLINK returns current state, never activates the old relationship. Removing one side of a triangle does not split its remaining paths.
- The smallest Lead UUID is only a canonical key **at this snapshot**. It can change when groups change. Preserve original member/receipt IDs, acquisition times and graph revision/asOf. Do not attach permanent business records to the computed key.
- `UNLINKED` is not proof of uniqueness; `LINKS_CONFIRMED` only proves recorded relationships. Both return `deduplicationComplete:false` and `qualifiedUniquePaidLead:false`. Do not select qualification or first-paid source from an arbitrary member. Conflicts must remain UNKNOWN in the later cohort projection.

## Concurrency and permission

Identity graph operations use a company advisory lock, then ascending Lead row locks. They do not lock the company row before Lead (which would invert650). Record locks the union of both components before taking their snapshots. Fresh actor/company/tenant checks run before every read, write and replay. Read access to one member does not grant access to all members. Missing members become tombstones; inaccessible current members cause a safe denial.

Maximum component size100; overflow is an error, never a truncated successful graph. Public/authenticated roles cannot read or write ledger tables/RPCs; service role has RPC-only access. Source invalidation triggers update enrolled nodes through fixed-search-path definer functions.

## Incomplete work and rollout gates

This is a backend API, not a completed operator workflow. Still needed: authorized orphan/moved-member reconciliation and distinct-group resolution after unlink; UI/tool integration; strong provider identity/source receipt adapters; complete intake/identity coverage; trial/account/date registry and qualified paid cohort projection. These are operational blockers before enabling the feature, not claims satisfied by unit tests. The synthetic graph intentionally never declares overall deduplication complete.

The rest of the goal remains: actual receiver/backup/calendar bindings; AI verified advice, opt-out/takeover and atomic booking; decision dashboard and live UAT/Founder release. Finance remains deferred. No manual review of every routine customer is proposed as a replacement for automation; the human API is an exception path and a reusable service boundary for later approved automation.

## Evidence / rollback

Local47 graph/service/router tests PASS. PostgreSQL16 CI (fresh isolated database only) covers links/chains/triangles, unlink/replay, concurrent identity/qualification, current permissions, contact A→B→A, deletion and transfer. Verify the published run and independent review before relying on them; initially pending. No frontend change or browser test in this increment.

No real DB migration/flag/customer/ad/budget/message changes, no merge/deploy. Rollback disables the new feature and keeps nodes, edges, audit and invalidation triggers. Do not re-enable old evidence after removing invalidation tracking. Legacy destructive merge is not repaired by this increment and must not be used for the trial's identity resolution.
