# BOS-AI1 Controlled Publish Effect Extension V1 — Architect contract

Authority: Founder Decision supplied on 2026-09-02, Controlled Publish Effect
Extension Fast Track. OC6 remains **PAUSED at G0**; P01–P14 are unchanged.

Parent: `c0ba1b282422c68bd96478d7585f2c2381198420` / tree
`02f6ed227a288009f449ef9de4e94ba98ceb6c33`.
Branch: `proof/bos-ai1-controlled-publish-v1`.
The suggested C:\Projects workspace is relocated under the writable task
workspace as `BOS_AI1_CONTROLLED_PUBLISH_V1_WORKSPACE`; ancestry is unchanged.

## Narrow additive entry point

`tools/bos-ai1/controlled-publish-proof.js` owns only
`project.publish_status_update`, classified LIMITED_WRITE. The existing BOS-AI1
READ/DRAFT/PUBLISH-stop entry point and all REG4/MG5 source, tests and baseline
records remain byte-identical. This is an additional BOS-AI1 proof API, not a
route, server, runtime, model, business rule or production publish capability.

The caller first invokes BOS-AI1 without approval and receives
REQUIRE_APPROVAL / zero effects. Synthetic approval is installed in the trusted
in-memory authority fixture, and the caller **re-enters the same BOS-AI1 invoke
boundary** with the approval ID. There is no approval callback that bypasses
the policy gate or invokes an adapter directly.

## State and ordering

Request snapshot → reserve idempotency → real REG4 read and hash/evidence check
→ trusted synthetic identity/task/delegation/resource/policy/approval snapshot
→ optional mutation hook → final REG4 read → final internal authority snapshot
and fresh synthetic time → revalidate every gate → consume approval and append
one fake effect synchronously → classify result → immutable receipt and audit.

The authority and adapter are branded objects backed by module-private memory.
Their mutators copy data before storing it. No external resolver, clock callback,
getter or hook runs between final validation and acceptance. REG4 is the last
external trust call; internal authority is sampled after it, so a callback
changing authority while REG4 is read is caught. Fake adapter callbacks run
only **after** the accepted effect is recorded and the key is reserved.

The authority and adapter each bind to one proof instance. Reservations and
consumed approval IDs cannot be reset through fixture replacement. Exactly-once
means one acceptance per semantic idempotency key in this synchronous process
and proof lifetime. Restart, multiple workers and durable/production exactly-once
are outside this contract. No dependency or persistent state is introduced.

Approval binds action_id, company, resource ID/version, requester, executor,
on_behalf_of, delegation ID/version, policy version, validity interval,
idempotency key, plus agent/package, task, approver and payload hash. Approval
cannot add permissions. A consumed approval cannot fund a new delivery. An
identical completed delivery may recover its stored receipt after current
authority validation without another effect; this is receipt recovery, not a
second use of approval. Changed semantic content is denied. Reentrant in-flight
delivery is denied REQUEST_IN_PROGRESS.

SUCCESS records APPLIED; PARTIAL records PARTIAL; TIMEOUT_AFTER_ACCEPT or a
throw after acceptance records UNKNOWN. PARTIAL/UNKNOWN return
COMPENSATION_REQUIRED and are terminal, cached receipts. No retry, cancellation
or compensating write is performed. These are deliberate fake outcomes, not
unobserved real external effects.

Every invocation has one hash-linked safe audit record, including malformed
requests, denials, approval waits, in-flight and completed duplicates, and
uncertain results. Valid caller correlation IDs are preserved; malformed input
gets a generated correlation ID. Audits contain request/context digests and
canonical decisions, not raw payloads or exception text. Audit storage is owned
memory with no injectable sink or post-effect external dependency.

## Trace matrix and gates

| ID | Required evidence |
|---|---|
| CP01 | Missing approval: REQUIRE_APPROVAL, zero effects; re-entry creates one |
| CP02 | Current Agent tuple/hash/evidence and APPROVED state; RETIRED/BLOCKED deny |
| CP03 | Active actors, task, delegation and all permission sources required |
| CP04 | Company/resource/version and exact policy/action/tool enforced |
| CP05 | Every approval binding, expiry, not-before, revocation and consumption |
| CP06 | Sequential/conflicting/nested delivery; no second acceptance |
| CP07 | Partial/timeout/throw cached as COMPENSATION_REQUIRED; no blind retry |
| CP08 | Safe complete audit/correlation for every return path |
| CP09 | Full unchanged BOS-AI1, REG4 and MG5 regression |
| CP10 | <=12 changed files, <=2 repair rounds, independent exact-commit review |

Development tests precede a frozen technical commit. Formal tests and independent
review run on that exact commit/tree, in separate detached workspaces. Raw logs
and hashes are retained outside the worktrees. Final evidence documentation is
a separate commit with source/test blob equality verified. Push only the named
branch after PASS, no P0/P1, clean worktree and scope verification. No merge,
tag, release or deployment is included.

Mandatory STOP conditions from the Founder Decision remain binding. Final state
is STOP awaiting APPROVE / DENY BOS-AI1 CONTROLLED PUBLISH PROOF BASELINE. This
work does not resume OC6 G0.
