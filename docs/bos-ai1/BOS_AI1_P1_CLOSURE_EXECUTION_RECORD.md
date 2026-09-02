# BOS-AI1 Proof V1.2B — P1 Closure Execution Record

## Authority and exact starting point

| Item | Exact value | Status |
|---|---|---|
| Authority | Founder-approved BOS-AI1 P1 Closure Fast Track | AUTHORIZED |
| Failed-evidence parent | `bfca56ef3fe242f2595813e734d8a6b3b94341e0` | VERIFIED |
| Failed-evidence parent tree | `a5f9c21afc9c379f5de9bd17a2d3d8d3cef2d788` | VERIFIED |
| Workspace | `C:\Projects\Quanlycongviec-bos-ai1-proof-v1_2b-p1-closure` | VERIFIED |
| Branch | `proof/bos-ai1-v1.2b-p1-closure` | VERIFIED |
| Starting status | Clean | VERIFIED |

The previous BOS-AI1 workspace and branch were preserved as failed evidence. No reset, cleanup, amendment or write was performed there.

## Closed scope

Only these four paths are changed relative to the failed-evidence parent:

1. `tools/bos-ai1/project-progress-brief-proof.js`
2. `tools/bos-ai1/project-progress-brief-proof.test.js`
3. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_EXECUTION_RECORD.md`
4. `docs/bos-ai1/BOS_AI1_P1_CLOSURE_BUILDER_REPORT.md`

No dependency, REG4 source/test, database, migration, Business Rules, MG5, OC6, OpenClaw, Business AI Runtime or Production path is changed. No third tool or business feature is added.

## P1 closure implementation

### P1C-01 — hostile thrown values

The former `instanceof ProofDecision` recognition boundary could execute an attacker-controlled `getPrototypeOf` trap while handling an earlier Proxy exception. Internal decisions now use opaque markers whose decision/reason pair is held in a module-private `WeakMap`. Catch handling performs a safe provenance lookup without reading properties or prototype state from an untrusted thrown value. Unproven values return the standard `DENY/INVALID_REQUEST` envelope and exactly one safe audit record.

### P1C-02 — final REG4 ordering

The final trusted identity/task/delegation/project/policy resolution and immutable-context comparison now finish before the last REG4 read. The last REG4 read is immediately followed only by internal idempotency/state operations and READ release or DRAFT commit. There is no externally controlled resolver call after that read. A real REG4 lifecycle test retires the Agent from the final policy resolver and proves `DENY/AGENT_RETIRED`, zero draft and exactly one BOS audit record.

### P1C-03 — approver verification and audit distinction

Any claimed approver other than the literal `none` must resolve to an active trusted identity whose ID and company match the request. A missing approver returns `DENY/FORGED_AUTHORITY` with zero draft. Audit records now store the safe request claim as `claimed_approver_id`; `approver_id` is populated only after trusted verification and remains `null` when resolution fails. Existing valid C01 actor separation remains intact.

### P1C-04 — reentrant idempotency closure

After the hook, final context comparison and last REG4 revalidation, the proof performs a synchronous final idempotency lookup before any DRAFT commit. A reentrant same delivery therefore lets the nested invocation commit exactly one draft; the outer invocation recovers that draft as `ALLOW/DUPLICATE_REQUEST`. The linked ledger contains the nested `DRAFT_CREATED` record followed by the outer `DUPLICATE_RETURNED` record.

## Test chronology and repair accounting

- Initial targeted P1C run against the failed implementation: 0/4 PASS; all four approved IR findings reproduced.
- Repair round 1 implemented the four closed-scope corrections.
- Targeted P1C rerun: 4/4 PASS.
- Full BOS-AI1 rerun after repair round 1: 40/40 PASS.
- Repair rounds used at Builder handoff: 1/2.

No technical commit, push, merge, tag or release is performed by Builder. Exact final SHA/tree binding and Independent Review remain separate authorized steps.
