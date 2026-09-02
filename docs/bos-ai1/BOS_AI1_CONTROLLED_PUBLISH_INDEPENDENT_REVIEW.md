# BOS-AI1 Controlled Publish — Independent Review

**Verdict: PASS for the exact synthetic technical candidate below. P0 = 0, P1 = 0, P2 = 0.**
This review does not grant Founder baseline approval or resume OC6.

## Independent role and reviewed identity

Reviewer: separate subagent `/root/independent_publish_review`, operating after
the Builder's technical freeze, in a separate detached worktree. I inspected
the Founder Decision, Architect contract, implementation, Builder tests and
baseline interfaces; authored my own fixtures and adversarial tests outside
the worktree; independently executed the regression and adversarial gates.
I did not build, modify, commit, push or repair candidate implementation,
tracked tests, baseline records, REG4 or MG5. No Builder fixture/test module
is imported by the independent suite. Independence here means a separate
review role and workspace, not an external human certification.

| Item | Exact value |
|---|---|
| Technical commit | `1317f1468a341379f51e33b5631d7767af7c8848` |
| Technical tree | `ab7296b7ac316ea24324f5dc431a66c3375d91ca` |
| Parent commit | `c0ba1b282422c68bd96478d7585f2c2381198420` |
| Parent tree | `02f6ed227a288009f449ef9de4e94ba98ceb6c33` |
| Workspace | `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_CONTROLLED_PUBLISH_IR_WORKSPACE` |
| State before/after | Detached HEAD, clean; `git status --porcelain=v1 --untracked-files=all` empty |
| Environment | Node v22.20.0; Git 2.54.0.windows.1; Windows x64; Asia/Saigon |

## Executed gates

The final byte-preserving evidence run completed on 2026-09-02 UTC. Both
commands executed from the exact review workspace, using
`C:\Program Files\nodejs\node.exe`.

```text
node --test tools/bos-ai1/controlled-publish-proof.test.js tools/bos-ai1/project-progress-brief-proof.test.js tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js tools/mg5/model-gateway-proof.test.js qa/mg5/model-gateway-proof.independent.test.js
```

Result: **195/195 PASS**, exit 0; failed/cancelled/skipped/todo all zero.
Raw stdout: `regression.raw.tap`; stderr empty.

```text
node --test "C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\BOS_AI1_CONTROLLED_PUBLISH_EVIDENCE\independent\controlled-publish.independent.test.js"
```

Result: **152/152 PASS**, exit 0; failed/cancelled/skipped/todo all zero.
Raw stdout: `adversarial.raw.tap`; stderr empty.

The independent suite covers:

- Missing approval followed by BOS re-entry and two current REG4 reads before acceptance.
- All 21 binding fields, with the required Founder fields listed independently rather than imported from implementation metadata.
- 43 authority/permission mutations, each at both the mutation hook and final REG4 boundary: actors, company, package, task, delegation, resource, policy, approval, approver and fresh time.
- Current/final RETIRED/BLOCKED state, real REG4 retirement, malformed registry evidence/hash and missing Agent permissions/tools.
- Fifty completed duplicates, semantic conflicts, nested calls at snapshot/registry/hook/adapter, and nested distinct keys sharing an approval. Consumed approval survives fixture replacement and cannot fund another delivery.
- PARTIAL, TIMEOUT_AFTER_ACCEPT and hostile throw after acceptance: one accepted fake effect, terminal COMPENSATION_REQUIRED receipt, no retry. Pre-effect failure releases the reservation for an explicit caller retry.
- Hostile getters, proxies, cycles, symbols, prototypes, unknown fields, invalid digests and out-of-scope actions; immutable views; complete invocation audit counts, correlations and independently recomputed hash chains.
- Fake dependency branding, one-owner binding, and local proof/crypto dependency closure.

## Findings ledger and scope checks

| Severity | Open findings | Result |
|---|---:|---|
| P0 | 0 | None established |
| P1 | 0 | None established |
| P2 | 0 | None established |

The technical diff is exactly four added paths: the controlled Publish source,
its Builder test, the Architect contract and Builder record. There are no
changes to existing files, REG4, MG5, original BOS-AI1 READ/DRAFT source/tests,
dependencies, baseline records, OC6 or P01–P14. `git diff --check` passes.
The manifest records the exact changed-path list, protected-path diff, Git
blob IDs, Git-blob SHA-256, physical-file SHA-256 and Git-filtered worktree
blob identities. Every reviewed physical file resolves to its expected Git
blob; original baseline source/test blobs equal the parent.

The implementation has no new package dependency and performs effects only
through private in-memory fake state. Review/testing did not use network,
database, email, real business data, real models, secrets, OpenClaw, application
Runtime or Production. The reviewer made no implementation repair; all
independent product tests passed on their first execution. An initial local
evidence-export attempt failed because PowerShell had not created an empty
status file; only the external evidence runner was corrected, after which the
complete exact-version evidence run passed. This was not a candidate repair.

No mandatory STOP condition was established within this reviewed scope.
The final branch/evidence commit and push are outside this independent
technical review. Any later evidence-only commit must preserve the reviewed
source/test blobs and existing baseline identities and pass the final clean
worktree/scope gates.

## Exactly-once and uncertainty limits

The proved property is **one fake acceptance per semantic idempotency key
within one synchronous process and one bound proof lifetime**. Reservation
occurs before external trust callbacks; current authority is sampled after
the final registry call; no callback executes between final validation,
private approval consumption and acceptance. Adapter callbacks happen after
acceptance and cannot reset reservations or consumed approvals. Identical
completed calls recover a stored receipt after current authority validation;
this does not create a second effect or authorize another delivery.

PARTIAL/UNKNOWN are deliberate fake outcomes with recorded effect identity,
terminal compensation-required receipts and no retry. No real external
outcome is left unidentified. The proof does **not** establish restart,
multi-process, multi-worker, distributed, durable or production exactly-once,
and it assumes trusted JavaScript built-ins and the synthetic authority
boundary described in the contract.

OC6 remains **PAUSED at G0**. Founder must separately decide APPROVE / DENY
BOS-AI1 CONTROLLED PUBLISH PROOF BASELINE before any future G0 resumption.

## Evidence digests

All files are siblings of this report. Exact argv, UTC times, environment,
pre/post states, counts and file/blob digests are in `independent-manifest.json`.

| File | SHA-256 |
|---|---|
| `independent-manifest.json` | `ba6f846cfa5f0fca27c3a5e3d7c1f14327423bff37ccb3d313f4b941e2186028` |
| `controlled-publish.independent.test.js` | `f78adfaaf741eb3cd20f3cfc70653ef24c7de0beae9e480cbfc3816c6d5fe880` |
| `run-independent-review.cjs` | `24025e8bc80123f0a0fcf64fb7893e7f54ee2f8c4c2d1f51402e998c3aad9481` |
| `regression.raw.tap` | `b149341c02d6dda87b0fc53aec80b0ac27de5735d54f6a96a285ab048550bd1a` |
| `adversarial.raw.tap` | `71afc968f0bbda09138dda075c332a6ae83074c366fa9e8eaedf0382dba146ec` |

The runner can regenerate evidence, but timing-dependent TAP/manifest hashes
will change on another execution. Preserve these reviewed bytes for the
Founder evidence package; do not substitute a later run silently.
