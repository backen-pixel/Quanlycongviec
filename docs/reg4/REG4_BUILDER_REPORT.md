# REG4 — Agent Registry V1 Proof — Builder Report

## 1. Control record

| Field | Value |
|---|---|
| Status | `AUDIT-HARDENED BUILDER CANDIDATE READY FOR INDEPENDENT QA RE-TEST` |
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
| Audit-hardened implementation candidate commit | `907636bccca80e3a6921aa6a5e9e3e473409971f` |
| Audit-hardened implementation candidate tree | `4cc9677a8c81cd8f13bb34bf9aa5ecb290968606` |
| P1 audit-hardening exception rounds used | `1 / 2` |
| Preserved copied QA test SHA-256 | `a73aecdc712fff1b017793ff18a53dc711bc7b6c69a158a860cc89ad5a95f0d9` |
| Builder exception / waiver | Founder-authorized REG4-P1 audit-hardening exception only |

For the audit-hardening exception, the Builder verified detached parent
`5d1ea91a`, reread the complete root `AGENTS.md` and relevant REG4 artifacts,
and reproduced exact copied QA failure `REG4-QP1-01` before patching. The QA
file was already dirty by controlled copy, retained the authorized SHA-256,
and was never edited, staged, or committed by Builder. Source and Builder test
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

The implementation does not access an application entry point, filesystem,
environment, network, database, randomness, real data, Runtime, or Production.

## 3. Builder-owned changed files

| File | Purpose | SHA-256 at candidate verification |
|---|---|---|
| `tools/reg4/agent-registry.js` | Registry implementation, private error provenance, and audit reason enforcement | `b2fe74d8c4fc108788990689e2f0ed44115414b47f32340a04c4c530a606eb1a` |
| `tools/reg4/agent-registry.test.js` | Builder trace suite `REG4-B01` through `REG4-B12` plus strengthened `REG4-P1-01` | `3c01a76a9874840e278894114bc7d6068aa28abe1f1be912d4845835b0c44a44` |
| `docs/reg4/REG4_BUILDER_REPORT.md` | This Builder handoff record | Created after the candidate and excluded from the candidate tree |

Relative to exception parent
`5d1ea91ab77acae8d9d2adf372b69378119428a2`, audit-hardened candidate
`907636bccca80e3a6921aa6a5e9e3e473409971f` changes exactly the first two
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
| `REG4-P1-01` | Proxy traps plus poisoned previously issued and Proxy-wrapped errors; private canonical provenance; reason/metadata allowlists; safe fixed stack; exactly-one correlated audit; no arbitrary property leakage, partial state, or double audit; complete hash-chain recomputation |

## 5. Commands and exact results

### 5.1 Input lock

```powershell
git rev-parse HEAD
git show -s --format=%T HEAD
git status --porcelain=v1
```

For the audit-hardening exception these returned parent
`5d1ea91ab77acae8d9d2adf372b69378119428a2`, tree
`f91d7a920bdf9d5f58695581fcb44c65f8601d18`, detached HEAD, and exactly one
expected dirty path: `qa/reg4/agent-registry.independent.test.js`. Its SHA-256
was `a73aecdc712fff1b017793ff18a53dc711bc7b6c69a158a860cc89ad5a95f0d9`.

Before patch, the required reproducer:

```powershell
node --test --test-name-pattern="REG4-QP1-01" qa/reg4/agent-registry.independent.test.js
```

exited `1` with tests `1`, pass `0`, fail `1`; the poisoned public error code
`HOSTILE_UNTRUSTED_CODE` reached audit instead of canonical `INVALID_INPUT`.

### 5.2 Formal audit-hardened candidate tests

```powershell
node --test --test-name-pattern="REG4-P1-01" tools/reg4/agent-registry.test.js
node --test --test-name-pattern="REG4-QP1-01" qa/reg4/agent-registry.independent.test.js
node --test tools/reg4/agent-registry.test.js
```

Run from exact audit-hardened candidate commit
`907636bccca80e3a6921aa6a5e9e3e473409971f`:

| Command | Exit | Tests | Pass | Fail | Cancelled | Skipped | Todo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Targeted `REG4-P1-01` | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| Exact copied QA `REG4-QP1-01` | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| Full Builder suite | 0 | 13 | 13 | 0 | 0 | 0 | 0 |

### 5.3 Repository and ownership gates

```powershell
git diff --check 5d1ea91ab77acae8d9d2adf372b69378119428a2..HEAD
git diff --name-only 5d1ea91ab77acae8d9d2adf372b69378119428a2..HEAD
git status --short
git rev-parse HEAD
git show -s --format=%T HEAD
git show -s --format="%an <%ae>" HEAD
Get-FileHash -Algorithm SHA256 qa/reg4/agent-registry.independent.test.js
```

At audit-hardened candidate verification:

- exception-parent `git diff --check` exited `0` with no output;
- the committed exception-parent diff listed exactly
  `tools/reg4/agent-registry.js` and
  `tools/reg4/agent-registry.test.js`;
- `git status --short` listed only the expected unstaged dirty QA file;
- copied QA SHA-256 remained exactly `a73aecdc712fff1b017793ff18a53dc711bc7b6c69a158a860cc89ad5a95f0d9`;
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
| 1 / 2 | Exact `REG4-QP1-01` showed that a previously issued and caller-poisoned `RegistryError` retained private class identity, so normalization trusted its mutated public `code` | Builder source/test only; immutable reason catalog, private `WeakMap` provenance, always-new error normalization, audit-writer reason allowlist, fixed outgoing error/metadata schema, poisoned and Proxy-wrapped regression fixtures | Reproducer changed from fail to pass; Builder targeted `1/1`, copied QA targeted `1/1`, full Builder `13/13`; exception round 2 unused |

No dependency, database, migration, Business Rule, real secret, credential,
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

Audit-hardened implementation candidate
`907636bccca80e3a6921aa6a5e9e3e473409971f` at tree
`4cc9677a8c81cd8f13bb34bf9aa5ecb290968606` is ready for separately authored
Independent QA re-test and Independent Review. The copied QA artifact remains
an expected unstaged worktree change for Orchestrator/QA ownership. Builder
does not claim P1 closure, Independent QA, Independent Review, a REG4 baseline,
or Founder approval.

No push, force push, merge, tag, release, deployment, baseline mutation, MG5,
OC6, OpenClaw, Model Gateway, Runtime, or Production action was performed by
the Builder.
