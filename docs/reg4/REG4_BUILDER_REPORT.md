# REG4 — Agent Registry V1 Proof — Builder Report

## 1. Control record

| Field | Value |
|---|---|
| Status | `BUILDER CANDIDATE READY FOR INDEPENDENT QA` |
| Actor | Builder Agent (`/root/reg4_builder`) |
| Technical Git identity | `tudonghoa-dev <tudonghoa@vanphuthanh.net>` |
| Working branch | `work/reg4-agent-registry-v1` |
| Architect input commit | `7dea5f83a8ce8ba23807f974c143a5844759a8b3` |
| Architect input tree | `40e8d1df7b916ad2b21e70a2e0aefb5391e30233` |
| Implementation candidate commit | `66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` |
| Implementation candidate tree | `ba3162906f1cbcac5c8a703bbe9bf4367195efef` |
| Builder self-repair rounds used | `1 / 2` |
| Builder exception / waiver | None |

The Builder verified the exact Architect input before implementation and read
the complete root `AGENTS.md` and `docs/reg4/REG4_ARCHITECT_DESIGN.md`. The
Builder changed only the three Builder-owned paths authorized by the design.
The source and Builder test were committed together as the immutable
implementation candidate before this report was created.

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

The implementation does not access an application entry point, filesystem,
environment, network, database, randomness, real data, Runtime, or Production.

## 3. Builder-owned changed files

| File | Purpose | SHA-256 at candidate verification |
|---|---|---|
| `tools/reg4/agent-registry.js` | Registry implementation | `554e6447a85ad83f3e7c9a00cc323f6f653fd634b3a7386508c961e475ed1245` |
| `tools/reg4/agent-registry.test.js` | Builder trace suite `REG4-B01` through `REG4-B12` | `ac3c66fc0e360caf1697fccffd0fe18b3040801696d00e98cff4687c460598e6` |
| `docs/reg4/REG4_BUILDER_REPORT.md` | This Builder handoff record | Created after the candidate and excluded from the candidate tree |

Relative to the Architect input, implementation candidate
`66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` changes exactly the first two
paths. No existing file, dependency manifest, lockfile, application source,
database, migration, baseline, deployment, Runtime, or Production artifact was
modified.

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

## 5. Commands and exact results

### 5.1 Input lock

```powershell
git rev-parse HEAD
git show -s --format=%T HEAD
git status --porcelain=v1
```

Before Builder changes these returned Architect commit
`7dea5f83a8ce8ba23807f974c143a5844759a8b3`, Architect tree
`40e8d1df7b916ad2b21e70a2e0aefb5391e30233`, and an empty porcelain status.

### 5.2 Formal candidate test

```powershell
node --test tools/reg4/agent-registry.test.js
```

Run from exact candidate commit
`66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef`:

- exit code: `0`;
- tests: `12`;
- pass: `12`;
- fail: `0`;
- cancelled: `0`;
- skipped: `0`;
- todo: `0`.

### 5.3 Repository and ownership gates

```powershell
git diff --check b19fef26e6ded04d6496c6478ff84eaf879f074e..HEAD
git diff --name-only b19fef26e6ded04d6496c6478ff84eaf879f074e..HEAD
git diff --name-only 7dea5f83a8ce8ba23807f974c143a5844759a8b3..HEAD
git status --short
git rev-parse HEAD
git show -s --format=%T HEAD
git show -s --format="%an <%ae>" HEAD
```

At candidate verification:

- `git diff --check` exited `0` with no output;
- the branch-start diff listed exactly the Architect design and the two
  implementation-candidate files;
- the Architect-input diff listed exactly
  `tools/reg4/agent-registry.js` and
  `tools/reg4/agent-registry.test.js`;
- `git status --short` was empty;
- commit/tree matched the candidate identities in this report; and
- candidate commit author was
  `tudonghoa-dev <tudonghoa@vanphuthanh.net>`.

## 6. Repair and exception ledger

| Round | Trigger | Scope | Result |
|---:|---|---|---|
| 1 | First pre-candidate run passed `11/12`; the B11 fixture helper attempted to calculate a digest for deliberately duplicate malformed content before invoking the Registry | Builder test fixture only; replaced helper calculation with a syntactically valid placeholder digest so the malformed registration reaches the audited API | Next run and exact-candidate formal run passed `12/12` |

No implementation defect was found by the Builder suite. No second repair round
was used. No exception, waiver, architecture deviation, new dependency,
database, migration, Business Rule, secret, credential, real data, external
service, Runtime, or Production access was required.

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

Implementation candidate
`66b291fe01aaf62d61c72b3cf9feecd4c2d1a9ef` at tree
`ba3162906f1cbcac5c8a703bbe9bf4367195efef` is ready for a separately authored
Independent QA suite and review. Builder does not claim Independent QA,
Independent Review, a REG4 baseline, or Founder approval.

No push, force push, merge, tag, release, deployment, baseline mutation, MG5,
OC6, OpenClaw, Model Gateway, Runtime, or Production action was performed by
the Builder.
