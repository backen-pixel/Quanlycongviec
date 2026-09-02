# BOS-AI1 Proof V1.2B — Synthetic Fixture Manifest

All values below are invented solely for deterministic in-memory tests. They are not real people, companies, projects, credentials, approvals or production records.

## REG4 Agent Package fixture

- Agent ID: `bos-ai1.project-progress-brief`
- Agent version: `1.0.0`
- Creator: `builder.agent`
- Required tools: the two approved proof contracts only
- Permissions: READ, DRAFT, and Publish policy evaluation permission
- Prohibited actions: `critical_write`, `limited_write`, `production.deploy`, `runtime.execute`
- Mandatory evidence references: synthetic passing `AUTOMATED_TEST` and `INDEPENDENT_REVIEW` entries
- Package SHA-256: calculated by the real REG4 `calculatePackageSha256` function in each test
- Lifecycle variants: APPROVED, BLOCKED, RETIRED and IN_REVIEW-with-missing-evidence are created through the real REG4 transition API

## Actor and company fixtures

| Actor ID | Synthetic role | Company | Purpose |
|---|---|---|---|
| `requester` | `PROJECT_MANAGER` | `company-a` | Requests the proof operation |
| `executor` | `AGENT_EXECUTOR` | `company-a` | Binds the exact REG4 Agent tuple |
| `principal` | `PROJECT_OWNER` | `company-a` | Represented principal (`on_behalf_of`) |
| `approver` | `APPROVER` | `company-a` | Synthetic approval identity |

Negative fixtures use invented `company-b`, `unknown.agent`, forged `FOUNDER` role, and nonexistent `system.root` permission values.

## Task, delegation and project fixtures

- Task `task-1` version `1` binds company, three operational actors, resource `project/project-1`, both tool names, the READ/DRAFT actions and Publish policy action; it expires after the fixed proof clock.
- Delegation `delegation-1` version `1` binds `principal` to `executor`, the same company/resource/tool/action scopes, and has explicit revoked/expiry variants.
- Project `project-1` version `7` belongs to `company-a`. Its scoped output fields are `name`, `progress_percent`, and `status`.
- The project also contains synthetic `internal_secret` and `milestone` fields solely to prove field scoping and context-change denial. These values never enter a ledger record.

## Approval fixture

Approval `approval-1` binds the exact Agent tuple/fingerprint, four actor positions, company, task/delegation IDs and versions, resource/version, draft tool contract, Publish policy action and payload SHA-256. Tests create ACTIVE, expired, REVOKED, CONSUMED, wrong-action and stale-resource variants. No approval is consumed because Publish never executes.

## Storage and lifetime

Resolvers, drafts, idempotency entries and audit records use process-local memory only. There is no database, migration, network call, real credential, durable store or production integration.
