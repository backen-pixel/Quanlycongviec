# REG4 — Agent Registry V1 Proof — Builder Report

## 1. Control record

| Field | Value |
|---|---|
| Status | `FINAL CONTEXT-HARDENED BUILDER CANDIDATE READY FOR INDEPENDENT QA RE-TEST` |
| Actor | Builder Agent (`/root/reg4_builder`) |
| Technical Git identity | `tudonghoa-dev <tudonghoa@vanphuthanh.net>` |
| Delivery branch lineage / exception worktree | `work/reg4-agent-registry-v1` / detached HEAD |
| Architect input commit | `7dea5f83a8ce8ba23807f974c143a5844759a8b3` |
| Architect input tree | `40e8d1df7b916ad2b21e70a2e0aefb5391e30233` |
| Original implementation candidate commit / tree | `66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` / `ba3162906f1cbcac5c8a703bbe9bf4367195efef` |
| Founder-authorized repair parent commit / tree | `65d268aa682ff0c7888f731ed7aa98f632a307ca` / `6c5cb33fd988f0bb4f0520dcc68df9014b3f16f3` |
| Repaired implementation candidate commit | `2e8e42af4bfb4d41881cee1eaeae56e487e54d26` |
| Repaired implementation candidate tree | `f2ac3f068ae58c1ac53defd23d955a645edbbf78` |
| Builder self-repair rounds used | `2 / 2` — exhausted |
| P1 audit-hardening exception parent commit / tree | `5d1ea91ab77acae8d9d2adf372b69378119428a2` / `f91d7a920bdf9d5f58695581fcb44c65f8601d18` |
| Audit-hardening round-1 candidate commit / tree | `907636bccca80e3a6921aa6a5e9e3e473409971f` / `4cc9677a8c81cd8f13bb34bf9aa5ecb290968606` |
| Final exception round-2 parent commit / tree | `d5e146eca03d72f3ab292d8d7633da31e6827267` / `60f75497ab47b81f7b88ddf9c27727c9574c4e70` |
| Final context-hardened candidate commit / tree | `a5f3770e9795938d1d5d445a143a4015bf3be58a` / `c423554dccff7d949dc2aa946ec0fd2f0250751a` |
| P1 audit-hardening exception rounds used | `2 / 2` — exhausted |
| Round-1 copied QA test SHA-256 | `a73aecdc712fff1b017793ff18a53dc711bc7b6c69a158a860cc89ad5a95f0d9` |
| Strengthened round-2 copied QA SHA-256 / size | `dce0facb1bcddd00bd995b53cbfbdfe6c5ac78625edd4b27f09a4864bea9055d` / `49,700` bytes |
| Builder exception / waiver | Founder-authorized REG4-P1 audit-hardening exception only |

For final exception round 2/2, the Builder verified detached parent
`d5e146ec`, proved the round-1 candidate source/test immutable, checked the
strengthened QA file's exact hash and size, and reproduced both `REG4-QP1`
tests before patching. The QA file was already dirty by controlled copy and
was never edited, staged, or committed by Builder. Source and Builder test
were committed together before this report update.

## 2. Proof implementation

The candidate is a standalone CommonJS, synchronous, in-memory Agent Registry
using Node.js built-ins only. It implements:

- strict Agent Package, evidence, actor, command, array, and timestamp
  validation before copying;
- canonical ASCII sorting and SHA-256 binding of immutable versioned content;
- collision-free `(agent_id, version)` lookup and same-version immutability;
- the complete `DRAFT`, `IN_REVIEW`, `APPROVED`, `BLOCKED`, and `RETIRED`
  state machine with exact role boundaries;
- self-approval denial by either `created_by` or `agent_id`;
- mandatory passing automated-test and independent-review evidence gates;
- defensive copies for all package and audit inputs/outputs; and
- one deterministic, append-only, SHA-256 hash-chained audit record for every
  accepted or rejected registration and transition attempt.

Repair round 2 makes Proxy-sensitive extraction total/non-throwing, converts
untrusted exceptions into bounded generic `RegistryError` values, and binds a
deterministic fixed-format `correlation_id` into each audit preimage. The same
correlation ID is returned on rejected-operation errors. No raw thrown object,
message, cause, credential marker, or originating stack is retained or written
to audit.

The audit-hardening exception closes the remaining provenance gap: a
previously issued `RegistryError` can be caller-mutated and rethrown, but
normalization no longer uses `instanceof` or reads its public properties. A
private `WeakMap` binds each internally created error to a system reason code;
normalization always creates a new error from an immutable message catalog.
The audit writer independently allowlists accepted and rejected reason codes,
and emits only its fixed metadata schema. Outgoing errors contain only
allowlisted fields, a canonical message, matching correlation ID, and a
bounded stack contract with no internal path or external trace.

Final round 2 closes cross-context replay of genuine system codes. Every
Proxy-sensitive object/array inspection (`getPrototypeOf`, `ownKeys`, and
`getOwnPropertyDescriptor`) now executes inside an explicit validation-context
boundary. A trap failure is immediately replaced with a new `INVALID_INPUT`
or `INVALID_ACTOR`, regardless of the thrown value's private provenance.
Exact objects and dense arrays are copied from data descriptors into plain
snapshots before field access, so caller `get` traps are never consulted.
Actual registry policy errors raised after validation retain their intended
catalog code.

The implementation does not access an application entry point, filesystem,
environment, network, database, randomness, real data, Runtime, or Production.

## 3. Builder-owned changed files

| File | Purpose | SHA-256 at candidate verification |
|---|---|---|
| `tools/reg4/agent-registry.js` | Registry implementation, private provenance, contextual Proxy boundaries, descriptor snapshots, and audit reason enforcement | `417cab2beaa09c6e9649a9f1126f2af7937036f5ce84c721c84d1e1d001e6120` |
| `tools/reg4/agent-registry.test.js` | Builder trace suite `REG4-B01` through `REG4-B12` plus final strengthened `REG4-P1-01` | `019ac839a15f652cf43d314e04f29c206b545b0651f2b237948be9c37f827ae1` |
| `docs/reg4/REG4_BUILDER_REPORT.md` | This Builder handoff record | Created after the candidate and excluded from the candidate tree |

Relative to final exception parent
`d5e146eca03d72f3ab292d8d7633da31e6827267`, context-hardened candidate
`a5f3770e9795938d1d5d445a143a4015bf3be58a` changes exactly the first two
paths. The separately supplied dirty QA test is not part of the candidate
commit. No QA-owned file, dependency manifest, lockfile, application source,
database, migration, baseline, deployment, Runtime, or Production artifact was
modified by Builder.

## 4. Builder trace coverage

| Test ID | Demonstrated control |
|---|---|
| `REG4-B01` | Exact minimum registered shape, canonical output order, initial `DRAFT`, constants, and accepted registration audit |
| `REG4-B02` | All five statuses and all seven legal transition edges, including every legal retirement source |
| `REG4-B03` | Self-approval denial for both creator identity and Agent identity |
| `REG4-B04` | Same-content duplicate rejection and different-content same-version immutability conflict |
| `REG4-B05` | Package SHA-256 mismatch rejection with no package mutation |
| `REG4-B06` | Both mandatory passing evidence types required for approval |
| `REG4-B07` | Every prohibited status edge, every wrong role on every legal edge, unauthorized registration, missing identity, and invalid target |
| `REG4-B08` | One audit per mutating attempt, exact record shape, continuous sequence, audit IDs, previous hashes, and independent hash recomputation |
| `REG4-B09` | Hard-coded canonical known answer, independent preimage oracle, set permutation invariance, and field-change sensitivity |
| `REG4-B10` | Input non-mutation, deep-copy getters/returns/audits, registry isolation, and read-only no-audit behavior |
| `REG4-B11` | Exact shape, bounds, sparse positions, duplicate values, extra/Symbol/non-enumerable keys, and accessor rejection without getter execution |
| `REG4-B12` | Deterministic injected timestamps and rejected-operation package timestamp non-mutation |
| `REG4-P1-01` | Raw and Proxy-wrapped replay of genuine `SELF_APPROVAL_DENIED`/`ACTOR_NOT_AUTHORIZED` through request, actor, and command traps; context-owned replacement codes; descriptor-only snapshot acceptance under hostile `get`; reason/metadata allowlists; exactly-one correlated hash-chained audit; no leakage or partial state |

## 5. Commands and exact results

### 5.1 Input lock

```powershell
git rev-parse HEAD
git show -s --format=%T HEAD
git status --porcelain=v1
```

For final exception round 2 these returned parent
`d5e146eca03d72f3ab292d8d7633da31e6827267`, tree
`60f75497ab47b81f7b88ddf9c27727c9574c4e70`, detached HEAD, and exactly one
expected dirty path: `qa/reg4/agent-registry.independent.test.js`. Its SHA-256
was `dce0facb1bcddd00bd995b53cbfbdfe6c5ac78625edd4b27f09a4864bea9055d`
and its size was `49,700` bytes. The round-1 candidate source/test diff against
this parent was empty.

Before patch, the required reproducer:

```powershell
node --test --test-name-pattern="REG4-QP1" qa/reg4/agent-registry.independent.test.js
```

exited `1` with tests `2`, pass `1`, fail `1`; a genuine replayed
`SELF_APPROVAL_DENIED` reached the new registration audit instead of
context-owned `INVALID_INPUT`.

### 5.2 Formal audit-hardened candidate tests

```powershell
node --test --test-name-pattern="REG4-P1-01" tools/reg4/agent-registry.test.js
node --test --test-name-pattern="REG4-QP1" qa/reg4/agent-registry.independent.test.js
node --test tools/reg4/agent-registry.test.js
```

Run from exact final context-hardened candidate commit
`a5f3770e9795938d1d5d445a143a4015bf3be58a`:

| Command | Exit | Tests | Pass | Fail | Cancelled | Skipped | Todo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Targeted `REG4-P1-01` | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| Strengthened copied QA `REG4-QP1` pattern | 0 | 2 | 2 | 0 | 0 | 0 | 0 |
| Full Builder suite | 0 | 13 | 13 | 0 | 0 | 0 | 0 |

### 5.3 Repository and ownership gates

```powershell
git diff --check d5e146eca03d72f3ab292d8d7633da31e6827267..HEAD
git diff --name-only d5e146eca03d72f3ab292d8d7633da31e6827267..HEAD
git status --short
git rev-parse HEAD
git show -s --format=%T HEAD
git show -s --format="%an <%ae>" HEAD
Get-FileHash -Algorithm SHA256 qa/reg4/agent-registry.independent.test.js
```

At final context-hardened candidate verification:

- exception-parent `git diff --check` exited `0` with no output;
- the committed exception-parent diff listed exactly
  `tools/reg4/agent-registry.js` and
  `tools/reg4/agent-registry.test.js`;
- `git status --short` listed only the expected unstaged dirty QA file;
- copied QA SHA-256 remained exactly `dce0facb1bcddd00bd995b53cbfbdfe6c5ac78625edd4b27f09a4864bea9055d`;
- commit/tree matched the candidate identities in this report; and
- candidate commit author was
  `tudonghoa-dev <tudonghoa@vanphuthanh.net>`.

## 6. Repair and exception ledger

| Round | Trigger | Scope | Result |
|---:|---|---|---|
| 1 | First pre-candidate run passed `11/12`; the B11 fixture helper attempted to calculate a digest for deliberately duplicate malformed content before invoking the Registry | Builder test fixture only; replaced helper calculation with a syntactically valid placeholder digest so the malformed registration reaches the audited API | Next run and exact-candidate formal run passed `12/12` |
| 2 | Founder-authorized P1-01: Proxy traps could throw outside safe extraction/catch boundaries, exposing a raw exception and omitting the required rejection audit | Builder source/test only; total safe extraction for hostile introspection, safe error normalization, deterministic correlated audit schema, and dedicated Proxy security test | Exact repaired candidate targeted test passed `1/1`; full Builder suite passed `13/13`; no partial mutation, double audit, or sensitive exception leakage observed |

Both authorized Builder repair rounds are now consumed; no third repair is
authorized under the original repair ledger.

Founder separately authorized the following bounded P1 audit-hardening
exception:

| Exception round | Trigger | Scope | Result |
|---:|---|---|---|
| 1 / 2 | Exact original `REG4-QP1-01` showed that a previously issued and caller-poisoned `RegistryError` retained private class identity, so normalization trusted its mutated public `code` | Builder source/test only; immutable reason catalog, private `WeakMap` provenance, always-new error normalization, audit-writer reason allowlist, fixed outgoing error/metadata schema, poisoned and Proxy-wrapped regression fixtures | Reproducer changed from fail to pass; Builder targeted `1/1`, copied QA targeted `1/1`, full Builder `13/13` |
| 2 / 2 | Strengthened `REG4-QP1` replayed genuine private `SELF_APPROVAL_DENIED`/`ACTOR_NOT_AUTHORIZED` through a malformed request, command, or actor Proxy; replayable provenance incorrectly overrode the current validation context | Builder source/test only; context-owned trap boundaries, descriptor snapshots for exact objects/dense arrays, no direct caller `get`, raw and Proxy-wrapped multi-code replay plus hostile-`get` acceptance tests | Pre-patch `1/2` QA pass became `2/2`; Builder targeted `1/1`; full Builder `13/13`; exception budget exhausted |

Both P1 audit-hardening exception rounds are now consumed; no round 3 is
authorized. No dependency, database, migration, Business Rule, real secret, credential,
real data, external service, Runtime, or Production access was required. P1
closure remains for Independent QA/Review, not Builder self-certification.

## 7. Limitations retained by design

- Registry and audit state are process-local and lost on exit.
- Synthetic actor context is authorization test input, not authenticated
  identity.
- Evidence references are validated immutable metadata; referenced bytes are
  not opened or independently established by the Registry.
- Declared permissions, required tools, and prohibited actions are stored and
  fingerprint-bound but not executed or enforced at runtime.
- The audit chain is tamper-evident for exported snapshots, not durable,
  externally signed, or protected against wholesale process-memory
  replacement.
- Concurrency, durable idempotency, APIs, Business Rules, OpenClaw, Model
  Gateway, Business AI Runtime, deployment, and Production are out of scope.

## 8. Builder handoff

Final context-hardened implementation candidate
`a5f3770e9795938d1d5d445a143a4015bf3be58a` at tree
`c423554dccff7d949dc2aa946ec0fd2f0250751a` is ready for separately authored
Independent QA re-test and Independent Review. The copied QA artifact remains
an expected unstaged worktree change for Orchestrator/QA ownership. Builder
does not claim P1 closure, Independent QA, Independent Review, a REG4 baseline,
or Founder approval.

No push, force push, merge, tag, release, deployment, baseline mutation, MG5,
OC6, OpenClaw, Model Gateway, Runtime, or Production action was performed by
the Builder.
