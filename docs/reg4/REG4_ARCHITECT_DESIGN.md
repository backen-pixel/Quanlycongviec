# REG4 — Agent Registry V1 Proof — Architect Design

## 1. Control record

| Field | Value |
|---|---|
| Status | `READY FOR BUILD` |
| Requestor | Founder |
| Actor | Architect Agent (`/root/reg4_architect`) |
| Authorized action | Design the REG4 in-memory Agent Registry V1 proof and create only this design artifact |
| Authorization / policy basis | Founder Execution Order `REG4 — AGENT REGISTRY V1 PROOF`; root `AGENTS.md`; `docs/adr/0022-ai-software-factory-separation-of-duties.md`; `docs/architecture/software-factory/AGENT_RESPONSIBILITY_MATRIX.md`; `docs/architecture/software-factory/PERMISSION_MATRIX.md` |
| Working branch | `work/reg4-agent-registry-v1` |
| Latest AF3 documentation record / branch start | `b19fef26e6ded04d6496c6478ff84eaf879f074e` |
| Required AF3 implementation ancestor | `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b` |
| Required SF2-C2 canonical ancestor | `bd281ab1d61d7177a593e449ac04ba1d4c79d882` |
| Architect file changed | `docs/reg4/REG4_ARCHITECT_DESIGN.md` only |
| Architect exception | None |

At Architect inspection, the working branch and branch-start commit matched the
Founder order. Both required commits were ancestors of the branch start, and
the worktree was clean. Architect inspection and design did not run tests,
change source code, commit, push, merge, tag, release, alter a baseline, or open
Runtime or Production.

## 2. Proof objective

Build and independently verify one small, deterministic, non-production,
in-memory Agent Registry V1. The proof must demonstrate that a synthetic Agent
Package can be:

- registered and uniquely identified by `agent_id` and `version`;
- bound to immutable versioned content by a canonical SHA-256 fingerprint;
- assigned declarative permissions, required tools, prohibited actions, and
  evidence references;
- governed through `DRAFT`, `IN_REVIEW`, `APPROVED`, `BLOCKED`, and `RETIRED`;
- protected from self-approval, unauthorized transitions, invalid transition
  order, fingerprint mismatch, missing approval evidence, and same-version
  content replacement; and
- traced by an append-only, hash-chained audit record for every accepted or
  rejected registration and state-changing attempt.

The proof demonstrates this controlled chain:

`Founder Requirement -> Architect Agent -> Builder Agent -> Independent QA Agent -> Formal Traceable Test -> Independent Review -> Evidence Package -> Founder Decision`

It is a technical registry-policy proof, not a Business Rule, production
registry, identity system, runtime adapter, deployment component, or baseline
approval.

## 3. Scope

### 3.1 In scope

- One standalone CommonJS module under `tools/reg4/`.
- One Builder-owned `node:test` suite under `tools/reg4/`.
- One independently authored QA suite under `qa/reg4/`.
- Synthetic, in-memory Agent Packages, actors, evidence references, timestamps,
  registry state, and audit records.
- Node.js built-ins only: `node:crypto`, `node:test`, and
  `node:assert/strict`.
- Deterministic dependency injection for clock values used in tests.
- Architect, Builder, QA, and consolidated evidence artifacts under
  `docs/reg4/`.

### 3.2 Out of scope

- `backend/src/**`, frontend or mobile applications, routes, servers, UI, or
  application entry points.
- Business Rules, domain behavior, tenant rules, real authentication, or actor
  principal resolution.
- Database, Supabase, SQL, schema, migration, seed, durable persistence,
  concurrency, distributed locks, or idempotency across process restarts.
- Real Agent archives, filesystem package collection, network access, secrets,
  credentials, or real evidence/data.
- Execution or enforcement of declared Agent permissions, tools, or prohibited
  actions. REG4 V1 stores and binds these declarations only.
- OpenClaw, Model Gateway, Business AI Runtime, Software Factory Runtime,
  staging, Production, deployment, merge, tag, release, or baseline mutation.
- Dependency manifest or lockfile changes.

## 4. Technology and module placement

Use CommonJS JavaScript because the repository requires Node.js `>=18`, the
workspace inspected by Architect used Node.js `v22.20.0`, the repository already
uses `node:test`, and AF3 established an approved isolated proof pattern under
`tools/` and `qa/`.

Planned module:

`tools/reg4/agent-registry.js`

It must not be imported by an application entry point. It must not access the
filesystem, environment, network, database, process-global mutable state,
randomness, or production data. Time is obtained only from the injected `now`
function.

## 5. Agent Package contract

### 5.1 Registered record

Every successfully registered package returned by the Registry has at least
this exact functional shape:

```js
{
  agent_id,
  name,
  version,
  package_sha256,
  created_by,
  permissions,
  required_tools,
  prohibited_actions,
  evidence_references,
  approval_status,
  timestamps: {
    created_at,
    updated_at,
  },
}
```

The model deliberately separates two concerns:

1. Immutable versioned content: `agent_id`, `name`, `version`, `created_by`,
   `permissions`, `required_tools`, `prohibited_actions`, and
   `evidence_references`.
2. Registry lifecycle metadata: `approval_status` and `timestamps`.

`package_sha256` binds the immutable versioned content. Lifecycle fields are
excluded from the fingerprint preimage because a legitimate approval-state or
timestamp transition must not rewrite the package version fingerprint.

### 5.2 Field validation

| Field | Contract |
|---|---|
| `agent_id` | Lowercase canonical identifier, 3 through 64 characters; first character `a-z`; remaining characters limited to `a-z`, `0-9`, `.`, `_`, and `-` |
| `name` | String, trimmed, Unicode NFC, 1 through 120 Unicode characters, no control character |
| `version` | Strict SemVer core `MAJOR.MINOR.PATCH`; no leading zero except the value zero; no prerelease or build suffix in V1 |
| `package_sha256` | Exactly 64 lowercase hexadecimal characters and equal to the independently recomputed canonical package digest |
| `created_by` | Canonical actor identifier and exactly equal to the registering actor's `actor_id` |
| `permissions` | Array of 1 through 100 unique canonical scope tokens |
| `required_tools` | Array of 0 through 100 unique canonical tool tokens |
| `prohibited_actions` | Array of 1 through 100 unique canonical action tokens |
| `evidence_references` | Array of 0 through 100 unique evidence-reference objects |
| `approval_status` | Registry-owned; initially `DRAFT`; caller cannot set it during registration |
| `timestamps.created_at` | Registry-owned canonical ISO-8601 UTC timestamp |
| `timestamps.updated_at` | Registry-owned canonical ISO-8601 UTC timestamp; equal to `created_at` at registration |

Canonical scope/tool/action/actor tokens are non-empty printable ASCII tokens,
maximum 128 characters, and must match a deliberately narrow grammar selected
by the Builder contract. Tokens must not contain whitespace, path traversal,
control characters, or non-canonical aliases.

Every structured object must be a plain data object with the exact required own
enumerable string keys, no accessors, no extra enumerable string or Symbol
keys, and no sparse array positions. The implementation validates before
copying. Caller arrays and objects must never become Registry-owned references.

### 5.3 Evidence reference

Each evidence reference has exactly these own enumerable keys and key order in
canonical output:

```js
{
  evidence_id,
  evidence_type, // 'AUTOMATED_TEST' | 'INDEPENDENT_REVIEW'
  result,        // 'PASS' | 'FAIL'
  sha256,        // 64 lowercase hexadecimal characters
}
```

`evidence_id` values must be unique inside a package version. Evidence is
synthetic metadata in this proof. REG4 V1 does not read an evidence file or
prove that the referenced bytes exist.

Approval requires at least one `AUTOMATED_TEST` reference with `result=PASS`
and at least one `INDEPENDENT_REVIEW` reference with `result=PASS`. A package
may be registered in `DRAFT` without these references, but because versioned
content is immutable it must use a new version to add or replace evidence.

## 6. Canonical SHA-256 contract

### 6.1 Exact preimage body

The canonical body has this exact key order:

```js
{
  schema_version: 'reg4-agent-package/v1',
  agent_id,
  name,
  version,
  created_by,
  permissions,
  required_tools,
  prohibited_actions,
  evidence_references,
}
```

`package_sha256`, `approval_status`, and `timestamps` are not in this body.

### 6.2 Canonicalization algorithm

1. Validate the complete immutable package content before producing a digest.
2. Copy every accepted value into newly allocated plain objects and arrays.
3. Sort `permissions`, `required_tools`, and `prohibited_actions` by ascending
   ASCII comparison using `<` and `>`, not locale-dependent comparison.
4. Copy every evidence reference with exact key order `evidence_id`,
   `evidence_type`, `result`, `sha256`, then sort references by ascending ASCII
   `evidence_id`.
5. Construct the canonical body in the exact top-level key order above.
6. Define canonical bytes as UTF-8 encoding of `JSON.stringify(body)`, without
   whitespace or trailing newline.
7. Define `package_sha256` as lowercase hexadecimal SHA-256 of those bytes.
8. During registration, validate the supplied digest syntax, recompute the
   digest, and compare equal-length digest bytes using `timingSafeEqual`.
9. A mismatch fails closed before Registry mutation and produces one rejected
   audit record with reason `PACKAGE_SHA256_MISMATCH`.

Multiple input permutations of set-like arrays must produce identical
canonical bytes and digest. Changing any accepted versioned field must change
the digest for the Builder and QA fixtures. SHA-256 collision resistance is
relied upon but not proven.

## 7. Identity, uniqueness, and version immutability

The Registry stores packages by a collision-free internal composite key derived
from the validated pair `(agent_id, version)`.

- If the pair does not exist and the supplied digest matches, registration
  creates exactly one `DRAFT` record.
- Re-registering the same pair and same canonical content is rejected with
  `AGENT_VERSION_ALREADY_REGISTERED`.
- Re-registering the same pair with different canonical content and a valid
  digest for that different content is rejected with
  `IMMUTABLE_VERSION_CONFLICT`.
- A rejected duplicate, conflict, or malformed attempt must not change the
  original package, status, fingerprint, evidence, or timestamps.
- Any content change requires a new `version`.

## 8. Actor roles and permission boundaries

Registry commands receive a synthetic trusted actor context:

```js
{ actor_id, role }
```

| Role | Authorized action | Not authorized |
|---|---|---|
| `AUTHOR` | Register a package whose `created_by` equals the actor's `actor_id` | Review, approve, block, retire, alter an existing version |
| `REVIEWER` | `DRAFT -> IN_REVIEW`; `IN_REVIEW -> BLOCKED` | Register, approve, retire, repair package content |
| `APPROVER` | `IN_REVIEW -> APPROVED` after self-approval and evidence gates | Register, review, block, retire, bypass evidence |
| `REGISTRY_ADMIN` | Transition any non-retired package to `RETIRED` | Approve, reopen a retired package, change immutable content |

The Agent Package `permissions` field is declarative metadata and does not grant
Registry authority. Runtime or prompt claims cannot elevate this field into an
actor role.

This proof validates authorization logic only. It does not authenticate the
synthetic actor context. A production trusted-principal resolver is expressly
out of scope.

## 9. Exact approval state machine

```text
DRAFT
  |-- REVIEWER ------> IN_REVIEW
  `-- REGISTRY_ADMIN -> RETIRED

IN_REVIEW
  |-- APPROVER + required evidence + non-self -> APPROVED
  |-- REVIEWER -------------------------------> BLOCKED
  `-- REGISTRY_ADMIN -------------------------> RETIRED

BLOCKED
  `-- REGISTRY_ADMIN -> RETIRED

APPROVED
  `-- REGISTRY_ADMIN -> RETIRED

RETIRED
  `-- terminal
```

`BLOCKED` is not reopened in V1. Because package content and evidence are
immutable for a version, remediation must be represented by a new version.

Transition validation uses this deterministic precedence:

1. Validate actor context.
2. Resolve the package by validated identity and version.
3. Validate the requested target status.
4. Require an allowed source-to-target edge.
5. Require the exact authorized actor role for that edge.
6. For approval, enforce self-approval prohibition.
7. For approval, enforce required evidence.

Self-approval is denied when the approving `actor_id` equals either the
package's `created_by` or `agent_id`, even when the caller supplies role
`APPROVER`. Direct `DRAFT -> APPROVED`, transitions out of `RETIRED`, same-state
transitions, and every edge absent from the map are rejected.

Minimum rejection reason codes:

- `INVALID_INPUT`
- `INVALID_ACTOR`
- `CREATOR_MISMATCH`
- `PACKAGE_SHA256_MISMATCH`
- `AGENT_VERSION_ALREADY_REGISTERED`
- `IMMUTABLE_VERSION_CONFLICT`
- `AGENT_VERSION_NOT_FOUND`
- `INVALID_STATE_TRANSITION`
- `ACTOR_NOT_AUTHORIZED`
- `SELF_APPROVAL_DENIED`
- `REQUIRED_EVIDENCE_MISSING`

## 10. Audit contract and hash chain

Every call that attempts a registration or transition creates exactly one
audit record, whether the attempt is accepted or rejected. Read-only getters do
not create audit records.

Each audit record has this exact functional content:

```js
{
  sequence,
  audit_id,
  operation,                  // 'REGISTER' | 'TRANSITION'
  outcome,                    // 'ACCEPTED' | 'REJECTED'
  reason_code,
  actor_id,
  actor_role,
  agent_id,
  version,
  from_status,
  to_status,
  supplied_package_sha256,
  resolved_package_sha256,
  occurred_at,
  previous_audit_sha256,
  audit_sha256,
}
```

Rules:

- Audit state is private and append-only.
- `sequence` starts at 1 and increments by exactly one for every attempted
  mutating operation.
- `audit_id` is deterministically derived from the sequence, for example
  `reg4-audit-000001`.
- The first record uses 64 lowercase zeroes as `previous_audit_sha256`.
- Later records use the immediately preceding record's `audit_sha256`.
- `audit_sha256` is SHA-256 over UTF-8 `JSON.stringify` of the audit body in the
  exact field order above, excluding only the `audit_sha256` field itself.
- Malformed attempts that cannot safely yield an identity use `null` for the
  unavailable subject fields; the attempt is still audited as rejected.
- Rejected operations append audit but do not modify any Agent Package field or
  package `updated_at`.
- Accepted registration and transition append audit after all validation and
  as part of the same synchronous in-memory operation.
- `listAuditRecords()` returns deep copies and cannot expose the internal audit
  array or mutable record references.
- Independent QA must recompute the chain with its own `node:crypto` oracle.

The audit chain demonstrates sequence continuity and detectable record
alteration inside the exported snapshot. It is not durable, externally signed,
or safe against process-memory replacement; those properties are out of scope.

## 11. API surface

Planned export:

```js
const {
  createAgentRegistry,
  calculatePackageSha256,
  STATUSES,
  ACTOR_ROLES,
} = require('./agent-registry');
```

Planned usage:

```js
const registry = createAgentRegistry({ now });

registry.registerAgentPackage(request, actor);
registry.transitionApproval(command, actor);
registry.getAgentPackage(agentId, version);
registry.listAuditRecords();
```

Contract details:

- `calculatePackageSha256(content)` validates, canonicalizes, and hashes only
  immutable package content and has no side effects.
- `createAgentRegistry({ now })` creates isolated private package and audit
  stores. `now()` is required to return a canonical ISO-8601 UTC timestamp and
  is injected so tests do not use the wall clock.
- `registerAgentPackage(request, actor)` accepts immutable content plus the
  declared `package_sha256`; it derives lifecycle fields and returns a deep
  copy of the stored `DRAFT` record.
- `transitionApproval(command, actor)` accepts `agent_id`, `version`,
  `to_status`, and an optional bounded reason string. Accepted transitions
  update only `approval_status` and `timestamps.updated_at`.
- `getAgentPackage(agentId, version)` returns a deep copy or a documented
  not-found result and never mutates or audits.
- `listAuditRecords()` returns all audit records in sequence order as deep
  copies.
- Validation or policy failures throw a stable `RegistryError` carrying the
  reason `code` after the rejected audit record has been appended.

No internal Map, array, mutable helper, direct audit writer, or state setter may
be exported.

## 12. Founder requirement trace matrix

| Founder requirement | Builder test ID | Independent QA test ID | Expected audit evidence |
|---|---|---|---|
| Successful registration and all minimum fields | `REG4-B01` | `REG4-Q01` | Exactly one `REGISTER / ACCEPTED / REGISTERED`; resulting record is `DRAFT` |
| Identity, version, and complete lifecycle state coverage | `REG4-B02` | `REG4-Q02` | Exactly one accepted audit per legal transition; correct source and target states |
| Agent cannot approve itself | `REG4-B03` | `REG4-Q03` | `TRANSITION / REJECTED / SELF_APPROVAL_DENIED`; package remains `IN_REVIEW` |
| Same `agent_id` and `version` cannot replace content | `REG4-B04` | `REG4-Q04` | `REGISTER / REJECTED / IMMUTABLE_VERSION_CONFLICT`; original record unchanged |
| Fingerprint mismatch is rejected | `REG4-B05` | `REG4-Q05` | `REGISTER / REJECTED / PACKAGE_SHA256_MISMATCH`; no package created |
| Missing mandatory evidence cannot approve | `REG4-B06` | `REG4-Q06` | `TRANSITION / REJECTED / REQUIRED_EVIDENCE_MISSING`; package remains `IN_REVIEW` |
| Wrong actor role or transition order is rejected | `REG4-B07` | `REG4-Q07` | `ACTOR_NOT_AUTHORIZED` or `INVALID_STATE_TRANSITION`; package unchanged |
| Every registration, change, and rejection is audited | `REG4-B08` | `REG4-Q08` | Audit count equals mutating-attempt count; continuous sequence and valid hash chain |
| Canonical SHA known answer and permutation invariance | `REG4-B09` | `REG4-Q09` | Accepted registration records the independently expected fingerprint |
| Input/output mutation cannot alter Registry state | `REG4-B10` | `REG4-Q10` | Reads add no audit; stored record and prior audit hashes remain unchanged |
| Strict malformed, sparse-array, duplicate, extra-key, and Symbol-key rejection | `REG4-B11` | `REG4-Q11` | One `REGISTER / REJECTED / INVALID_INPUT` per rejected registration call |
| Deterministic timestamps and rejected-operation non-mutation | `REG4-B12` | `REG4-Q12` | Audit attempt time advances; rejected operation does not change package `updated_at` |

Builder tests must also cover exact output key order, string/array bounds, status
constants, missing package lookup, duplicate same-content registration, all
legal retirement edges, and all prohibited state edges. Independent QA must
author its fixtures and SHA/audit oracles independently rather than importing
Builder test helpers.

## 13. Exact planned files and ownership

The complete REG4 proof is a closed list of seven files, below the Founder limit
of 20 changed files:

| # | File | Owner / purpose |
|---:|---|---|
| 1 | `docs/reg4/REG4_ARCHITECT_DESIGN.md` | Architect Agent; immutable design contract and handoff |
| 2 | `tools/reg4/agent-registry.js` | Builder Agent; in-memory Registry implementation |
| 3 | `tools/reg4/agent-registry.test.js` | Builder Agent; acceptance and regression tests `REG4-B01` through `REG4-B12` |
| 4 | `docs/reg4/REG4_BUILDER_REPORT.md` | Builder Agent; candidate identity, commands, results, repair and exception trace |
| 5 | `qa/reg4/agent-registry.independent.test.js` | Independent QA Agent; independent tests `REG4-Q01` through `REG4-Q12` |
| 6 | `docs/reg4/REG4_INDEPENDENT_QA_REPORT.md` | Independent QA Agent; exact-candidate review, findings, severity and results |
| 7 | `docs/reg4/REG4_EVIDENCE_PACKAGE.md` | Evidence owner; consolidated trace, fingerprints, branch and Founder decision input |

Adding, renaming, or modifying any other path requires STOP and Founder review.
In particular, do not modify `package.json`, a lockfile, AF3 artifact, baseline
record, application source, existing application test, database/migration,
deployment configuration, tag, or release artifact.

## 14. Builder and Independent QA boundaries

Builder may modify only files 2 through 4. Builder must commit source and
Builder tests as the implementation candidate before Independent QA begins.
The report may be committed separately so the exact source/test candidate is
stable.

Independent QA is a separate agent identity. QA may inspect all Builder-owned
artifacts, the candidate commit/tree, and the diff, but must not modify files 2,
3, or 4. QA owns only files 5 and 6. A QA failure returns the work to the
Orchestrator/Builder; QA never fixes Builder code.

At most two Builder self-repair rounds are allowed. A repair must preserve QA's
independent tests and must produce a new exact candidate SHA/tree. A third
repair requirement is an immediate STOP.

## 15. Formal traceable test and repository gate

### 15.1 Builder command

From the repository root:

```powershell
node --test tools/reg4/agent-registry.test.js
```

Pass requires exit code `0`, all tests passed, and fail/cancelled/skipped/todo
counts all zero.

### 15.2 Independent QA and combined commands

```powershell
node --test qa/reg4/agent-registry.independent.test.js
node --test tools/reg4/agent-registry.test.js qa/reg4/agent-registry.independent.test.js
```

Both commands must exit `0`; all assertions must pass with no skipped,
cancelled, or todo test. Independent Review must report `P0=0` and `P1=0`.

### 15.3 Formal repository commands

```powershell
git diff --check b19fef26e6ded04d6496c6478ff84eaf879f074e..HEAD
git diff --name-only b19fef26e6ded04d6496c6478ff84eaf879f074e..HEAD
git status --short
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

After QA/evidence documentation commits, source/test immutability must be shown
against the exact implementation candidate:

```powershell
git diff --exit-code <IMPLEMENTATION_CANDIDATE>..HEAD -- tools/reg4/agent-registry.js tools/reg4/agent-registry.test.js
```

The evidence package must record:

- branch-start commit, implementation candidate commit/tree, QA artifact
  commit/tree, and final branch-head commit/tree;
- SHA-256 of each proof artifact and one canonical artifact-manifest digest;
- exact commands, exit codes, and test totals;
- trace matrix results, all accepted/rejected audit expectations, repair count,
  exception/waiver ledger, and P0/P1/P2 ledger;
- worktree state, changed-file count and list;
- authenticated technical account `tudonghoa-dev` before delivery;
- non-force push only to `origin/work/reg4-agent-registry-v1`; and
- remote-ref read-back matching the pushed final commit.

The existing AF3 canonical evidence-manifest utility may be used by the
evidence owner to calculate an artifact manifest without introducing a REG4
runtime dependency. REG4 implementation must not import AF3 or application
code.

## 16. Assumptions and limitations

- All Agent Packages, actors, clocks, and evidence references are synthetic and
  non-secret.
- SemVer V1 intentionally supports only `MAJOR.MINOR.PATCH`.
- Actor context is trusted test input; identity authenticity is not proven.
- Evidence references bind declared hashes but do not prove referenced bytes
  exist or passed a real test.
- Permissions, required tools, and prohibited actions are immutable declarations
  only and are not executed or enforced against a runtime.
- In-memory state is lost on process exit and has no durable concurrency or
  multi-process guarantees.
- The injected clock is trusted. Tests use deterministic monotonic ISO UTC
  values; rejected attempts consume an audit time but do not change a package
  timestamp.
- The audit hash chain is tamper-evident only for the exported sequence, not
  durable or externally signed.
- SHA-256 collision resistance is relied upon, not proven.
- No architecture exception, dependency addition, database, migration,
  Business Rule, Runtime, or Production access is required.

## 17. Risks

- Treating this in-memory proof as a production Registry would create identity,
  durability, concurrency, and audit-retention risks.
- Treating evidence references as verified evidence would overstate the proof.
- Allowing lifecycle fields into the content fingerprint would make legitimate
  state changes appear to mutate a package version.
- Allowing unordered arrays without canonical sorting would make semantically
  equal package content produce different fingerprints.
- Returning internal objects would permit caller mutation and break
  immutability/audit guarantees.
- Recording only accepted operations would make the audit history incomplete.
- Conflating declared Agent permissions with Registry actor authority would
  permit privilege escalation.

The Builder must fail closed on these boundaries and must not broaden V1 to
solve the out-of-scope production limitations.

## 18. STOP conditions

STOP and present the issue to Founder if any Founder condition occurs,
including:

- More than 20 changed files are needed, any eighth/unplanned REG4 path is
  needed, or any change outside the closed REG4 list is required.
- Application code, existing application tests, AF3 artifacts, baseline records,
  Business Rules, database, migration, dependency, runtime configuration, or
  deployment files must change.
- A real credential, secret, real business data, or Production data is found.
- A Critical/High issue remains open, or Independent Review reports P0 or P1.
- Tests still fail after two total Builder self-repair rounds.
- Architect, Builder, and Independent QA cannot remain separate identities and
  artifact owners.
- Production authentication, durable persistence, concurrency, API, Runtime,
  Model Gateway, OpenClaw, Business AI Runtime, staging, or Production becomes
  necessary to make the proof pass.
- The branch is not `work/reg4-agent-registry-v1`, the authenticated delivery
  account is not `tudonghoa-dev`, push would target another branch, or force
  push is required.
- Merge, protected baseline modification, tag, release, deployment, or opening
  MG5, OC6, Runtime, or Production becomes necessary.

## 19. Rollback

REG4 V1 has no data or schema rollback. Before Founder approval, rollback is a
Git revert of REG4-only commits or removal of the seven additive REG4 files.
Application behavior, database, AF3 and SF2-C2 baselines, Runtime, and Production
remain unchanged.

## 20. Architect handoff decision

The proposed proof is isolated, deterministic, reversible, independently
testable, auditable, and fits within `7/20` changed files using no new
dependency. Builder may proceed only within this exact contract.

Status: `READY FOR BUILD`.

This document is not `APPROVE REG4 BASELINE`, does not self-designate any REG4
commit or tree as a baseline, and does not authorize merge, tag, release,
deployment, MG5, OC6, OpenClaw, Model Gateway, Business AI Runtime, Software
Factory Runtime, or Production. Final authority remains one Founder decision:
`APPROVE REG4 BASELINE` or `DENY REG4 BASELINE` after all formal gates pass.
