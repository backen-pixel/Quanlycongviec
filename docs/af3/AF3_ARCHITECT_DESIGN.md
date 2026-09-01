# AF3 Engineering Cell V1 — Architect Design

## 1. Control record

| Field | Value |
|---|---|
| Status | `READY FOR BUILD` |
| Requestor | Founder |
| Actor | Architect Agent (`/root/architect_agent`) |
| Authorized action | Analyze the repository and design exactly one small AF3 proof; create this design artifact only |
| Authorization / policy basis | Founder Execution Order `OPEN AF3 — ENGINEERING CELL V1 PROOF`; root `AGENTS.md`; `docs/adr/0022-ai-software-factory-separation-of-duties.md`; `docs/architecture/software-factory/AGENT_RESPONSIBILITY_MATRIX.md`; `docs/architecture/software-factory/PERMISSION_MATRIX.md` |
| Working branch | `work/af3-engineering-cell-v1` |
| Canonical code baseline | `bd281ab1d61d7177a593e449ac04ba1d4c79d882` |
| Canonical code tree | `3eb2266e4177fba76960316fa167895b01ec84fb` |
| Latest documentation record / branch start | `d8a917cab70f185c6f93a0b04e09c58ae89fa64b` |
| Branch-start tree | `89ceae7cbb8a805e0f745d00cfe72f57841f14b3` |
| Architect files changed | `docs/af3/AF3_ARCHITECT_DESIGN.md` only |
| Architect exception | None |

The canonical code baseline is an ancestor of the documentation record. The
delta from the code baseline to the documentation record is documentation-only
(seven files under `docs/`). No application code differs between those two
authorized starting points.

## 2. Proof objective

Build and independently verify a small, deterministic, non-production utility
that converts already-computed evidence descriptors into one canonical AF3
evidence manifest and a SHA-256 manifest digest.

The proof demonstrates the controlled chain:

`Founder requirement -> Architect contract -> Builder implementation/test -> independent QA test/review -> evidence package -> Founder decision`

This is an engineering-process proof, not a Business OS feature. It does not
claim to verify file contents; callers supply each file's precomputed SHA-256
and byte count. It only validates, canonicalizes, sorts, and binds those
descriptors into a reproducible manifest digest.

## 3. Scope

### In scope

- One CommonJS module under `tools/af3/`.
- One Builder-owned `node:test` suite under `tools/af3/`.
- One QA-owned, independently authored `node:test` suite under `qa/af3/`.
- Role reports and one consolidated evidence package under `docs/af3/`.
- Node.js built-ins only (`node:crypto`, `node:test`, and
  `node:assert/strict`).
- Deterministic validation, canonical ordering, JSON serialization, and
  SHA-256 hashing of in-memory synthetic input.

### Out of scope

- `backend/src/**`, `frontend/**`, mobile applications, production scripts,
  deployment definitions, and runtime configuration.
- Business Rules, APIs, UI, authentication, tenant logic, or permissions.
- Database, Supabase, SQL, schema, migration, seed, or real data.
- OpenClaw, Business AI Runtime, Software Factory Runtime wiring, network
  services, or production/staging execution.
- Reading files, computing individual file hashes, signing, encryption,
  release/tag creation, merge, deployment, or baseline approval.
- Any dependency manifest or lockfile change.

## 4. Architecture and API contract

### Module boundary

Planned module:

`tools/af3/canonical-evidence-manifest.js`

It is a standalone developer-proof module. No application entry point may
import or mount it. It must not access the filesystem, network, environment,
clock, randomness, database, runtime adapters, or production data.

### Export

```js
const { createCanonicalEvidenceManifest } = require('./canonical-evidence-manifest');
```

`createCanonicalEvidenceManifest(entries)` is synchronous and side-effect
free. It must not mutate `entries` or any entry object.

### Input contract

`entries` must be an array containing 1 through 1000 objects. Each object must
have exactly these three own enumerable keys:

| Key | Contract |
|---|---|
| `path` | String, 1..240 characters, printable ASCII limited to `[A-Za-z0-9._/-]`; repo-relative canonical POSIX form; no leading/trailing slash, empty segment, `.` segment, `..` segment, backslash, drive prefix, or duplicate path |
| `sha256` | Exactly 64 lowercase hexadecimal characters |
| `bytes` | Integer from 0 through `Number.MAX_SAFE_INTEGER` |

Unknown keys and duplicate paths are rejected. Invalid inputs throw a
descriptive `TypeError` or `RangeError`; callers must not receive a partial
manifest.

### Canonicalization contract

1. Validate the complete input before producing output.
2. Copy each accepted descriptor into a new object with key order
   `path`, `sha256`, `bytes`.
3. Sort copies by ascending ASCII path comparison using `<`/`>` semantics,
   not locale-dependent comparison.
4. Construct the body with this exact key order:
   `schema_version`, `hash_algorithm`, `entry_count`, `entries`.
5. Define canonical bytes as UTF-8 encoding of `JSON.stringify(body)` with no
   whitespace or trailing newline.
6. Define `manifest_sha256` as lowercase hexadecimal SHA-256 of those canonical
   bytes.
7. Return a new object containing the body fields in the same order followed
   by `manifest_sha256`.

Fixed values:

```text
schema_version = af3-evidence-manifest/v1
hash_algorithm = sha256
```

### Output shape

```json
{
  "schema_version": "af3-evidence-manifest/v1",
  "hash_algorithm": "sha256",
  "entry_count": 2,
  "entries": [
    {
      "path": "docs/af3/AF3_ARCHITECT_DESIGN.md",
      "sha256": "1111111111111111111111111111111111111111111111111111111111111111",
      "bytes": 1200
    },
    {
      "path": "tools/af3/canonical-evidence-manifest.js",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "bytes": 900
    }
  ],
  "manifest_sha256": "<64 lowercase hexadecimal characters>"
}
```

The digest placeholder above is illustrative. Builder tests must use a
separate small synthetic fixture and a hard-coded known-answer digest derived
independently from the implementation.

## 5. Threats and edge cases

- Absolute, drive-prefixed, backslash, empty-segment, `.`-segment, and
  traversal (`..`) paths must fail closed.
- Duplicate paths must fail rather than permit ambiguous last-write behavior.
- Uppercase, short, long, or non-hex digests must fail.
- Negative, fractional, non-finite, string, or unsafe byte counts must fail.
- Empty arrays, oversized arrays, nulls, arrays-as-entries, missing keys, and
  extra keys must fail.
- Input order must not change canonical output or digest.
- A change to any accepted `path`, `sha256`, or `bytes` value must change the
  manifest digest for the test fixtures.
- Caller-owned arrays/objects must remain unchanged.
- Locale, timezone, clock, environment, operating system, and current working
  directory must not affect output.
- SHA-256 collision resistance is relied upon but not proven by this proof.
- This utility does not hash files and is not safe evidence that a supplied
  descriptor matches file bytes; that responsibility remains with the evidence
  collector and must be disclosed in the evidence package.
- This is a local developer utility, not a parser for untrusted remote traffic.

## 6. Exact planned files and ownership

No AF3 file outside this closed list is approved. Total planned AF3 change is
seven files, below the Founder limit of 20.

| # | File | Owner / purpose |
|---:|---|---|
| 1 | `docs/af3/AF3_ARCHITECT_DESIGN.md` | Architect Agent; this immutable design and handoff |
| 2 | `tools/af3/canonical-evidence-manifest.js` | Builder Agent; proof implementation |
| 3 | `tools/af3/canonical-evidence-manifest.test.js` | Builder Agent; Builder acceptance tests |
| 4 | `docs/af3/AF3_BUILDER_REPORT.md` | Builder Agent; implementation, change, test, exception, and commit record |
| 5 | `qa/af3/canonical-evidence-manifest.independent.test.js` | Independent QA Agent; separately authored black-box verification |
| 6 | `docs/af3/AF3_INDEPENDENT_QA_REPORT.md` | Independent QA Agent; exact-SHA review, commands, findings, and severity ledger |
| 7 | `docs/af3/AF3_EVIDENCE_PACKAGE.md` | Orchestrator/evidence owner; consolidated trace and Founder decision input |

Adding, renaming, or modifying any other file requires STOP and Founder review.
In particular, do not modify `package.json`, lockfiles, application source,
existing tests, database files, migration files, deploy files, or baseline
records.

## 7. Builder acceptance tests

Builder must cover, at minimum:

1. A known-answer fixture returns the exact canonical object, ASCII path order,
   and independently precomputed hard-coded digest.
2. Multiple permutations of the same entries return deep-equal output.
3. Input arrays and entry objects remain unchanged.
4. Changing each accepted field changes the digest in the synthetic fixture.
5. Top-level type, empty-array, and 1001-entry bounds fail.
6. Missing/extra keys and non-object entries fail.
7. Invalid path matrix and duplicate path fail.
8. Invalid SHA-256 and byte-count matrices fail.

Formal Builder command from repository root:

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js
```

Builder pass criteria: process exit code `0`; all planned assertions pass;
failed, skipped, cancelled, and todo counts are all `0`; no network, database,
runtime, application server, or Production access occurs.

## 8. Independent QA plan

Independent QA must be a separate agent identity from Architect and Builder.
QA may read the design, Builder source, Builder tests, Builder report, Git diff,
and candidate identity, but must not modify any Builder-owned file. QA creates
only files 5 and 6 in the planned-file table.

QA must first inspect for design drift and hidden side effects, then author a
black-box suite from this contract without importing helper/oracle code from
the Builder test. The independent suite must include:

1. Its own canonical-body construction with `node:crypto` and a known-answer
   assertion against the module result.
2. Permutation invariance.
3. Boundary acceptance (one entry and 1000 entries).
4. Traversal/absolute/backslash/duplicate rejection.
5. Malformed hash, bytes, shape, and count rejection.
6. Non-mutation of caller input.

Independent QA command from repository root:

```powershell
node --test qa/af3/canonical-evidence-manifest.independent.test.js
```

Combined regression command:

```powershell
node --test tools/af3/canonical-evidence-manifest.test.js qa/af3/canonical-evidence-manifest.independent.test.js
```

QA pass criteria: both commands exit `0`; all assertions pass; no skipped,
cancelled, or todo tests; design drift is absent; `P0=0` and `P1=0`. QA reports
P0/P1/P2 separately and does not fix a failure. A P0 or P1 is an immediate STOP.

For traceability, formal and independent runs must record the exact full commit
SHA and tree under test. The implementation candidate must be committed before
independent QA begins. Later QA/evidence documentation commits must not be
misrepresented as the implementation candidate; the evidence package records
both candidate identity and final branch-head identity.

## 9. Formal repository checks

In addition to the test commands, the evidence owner must record these checks:

```powershell
git diff --check d8a917cab70f185c6f93a0b04e09c58ae89fa64b..HEAD
git diff --name-only d8a917cab70f185c6f93a0b04e09c58ae89fa64b..HEAD
git status --short
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Repository pass criteria:

- `git diff --check` emits no error.
- Changed paths are exactly the seven planned paths (or the prefix of that list
  appropriate to the current workflow stage), never more than 20.
- No source, existing test, database/migration, dependency, runtime,
  Production, deploy, baseline, tag, or release file changes.
- Worktree is clean before exact-SHA formal testing and final reporting.
- Push target is only `origin/work/af3-engineering-cell-v1`; no force push.

## 10. Builder constraints

- Implement exactly this contract, only in files 2 through 4.
- Do not reinterpret the proof as production-ready evidence verification.
- Do not import application modules or expose the utility through an app entry
  point, route, package script, runtime, UI, or service.
- Do not add dependencies or modify manifests/locks.
- Do not read real files or data in implementation/tests; use synthetic strings
  and byte counts only.
- Do not weaken validation or tests to obtain PASS.
- Record requestor, Builder identity, policy basis, files changed, exact commands
  and results, exceptions, input commit, output full commit/tree, and any repair
  rounds in `AF3_BUILDER_REPORT.md`.
- At most two total self-repair rounds are allowed by the Founder order. If a
  third is needed, STOP.
- Do not merge, tag, release, deploy, change a baseline, or self-approve AF3.

## 11. Rollback

No data or schema rollback exists. Before Founder approval, rollback is a Git
revert of the AF3-only commits or removal of the seven planned additive files.
The canonical code baseline, documentation baseline, application behavior,
database, runtime, and Production remain unchanged.

## 12. Stop conditions

STOP and present the issue to Founder if any Founder condition occurs,
including:

- More than 20 files are required, or any eighth/unplanned file is required.
- Application code, existing tests, Business Rules, database, migration,
  dependencies, runtime configuration, baseline records, or Production must
  change.
- Real credential/secret or real business/Production data is discovered.
- A Critical/High vulnerability is discovered.
- Tests remain failing after two total repair rounds.
- Independent QA reports P0 or P1.
- Architect, Builder, and Independent QA cannot remain separate identities and
  artifact owners.
- OpenClaw, Business AI Runtime, staging/Production runtime, merge, baseline
  change, phase opening, tag, release, or deployment becomes necessary.
- The branch is not `work/af3-engineering-cell-v1`, or the push would target any
  other branch or require force push.

## 13. Assumptions and exceptions

- Node.js `>=18` is the repository contract; inspection found Node.js
  `v22.20.0` in this workspace and existing use of `node:test`.
- CommonJS matches the repository backend convention, but this proof remains
  outside `backend/src` and is not an application module.
- Synthetic SHA-256 values in tests are non-secret test data.
- The branch began at the exact latest documentation record requested by
  Founder and the worktree was clean at Architect inspection time.
- No STOP condition was found during architecture analysis.
- No architecture exception is requested.

## 14. Handoff decision

The proof is small, isolated, deterministic, reversible, and compatible with
the separation-of-duties policy. Builder may proceed only within this contract.
This document is not an AF3 baseline approval and does not authorize any later
phase, Runtime, Production, merge, tag, release, migration, or deployment.
