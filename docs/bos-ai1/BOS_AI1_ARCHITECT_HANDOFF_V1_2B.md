# BOS-AI1 Proof V1.2B — Architect Handoff

## Contract

The module exports `createProjectProgressBriefProof({ registry, now, resolvers, beforeFinalRevalidation })`, `calculatePayloadSha256`, and frozen `TOOL_CONTRACTS`, `DECISIONS`, `REASON_CODES`, `REG4_BASELINE`, and `AGENT_CONTRACT`. A created proof exposes only `invoke(request)`, `listDrafts()`, and `listAuditRecords()`.

| Tool | Contract | Effect | Required permission |
|---|---:|---|---|
| `project.get_progress_summary` | `1.0.0` | READ | `project.progress.read` |
| `project.create_status_update_draft` | `1.0.0` | DRAFT | `project.status_update.draft` |

`PUBLISH` is evaluated as a policy request against `project.status_update.publish`; it is not a third tool contract and cannot dispatch or mutate business state.

## Bound request context

Every valid request binds request/idempotency/correlation identifiers; requested operation; exact Agent ID/version/package SHA-256 and REG4 baseline commit/tree; requester, executor, represented principal and approver; company; task and delegation IDs/versions; resource type/ID/version; tool/contract/action; canonical payload digest; approval reference when present; and optional claimed role/permissions solely for spoof-denial tests.

The executor's trusted synthetic identity also binds the exact Agent tuple. Task and delegation records bind actor context, company, resource, tool and action scopes. Approval records bind the complete Agent, actor, company, task, delegation, resource, tool, action and payload tuple.

## Authorization and effect flow

1. Snapshot data-only input and verify its payload digest.
2. Validate exact proof Agent identity and exact tool/policy request shape.
3. Read the actual REG4 record at T0 and verify tuple, recomputed package fingerprint, APPROVED status, evidence presence, permission, required tool and prohibited action.
4. Resolve trusted synthetic actor, company, task, delegation, project, policy and approval context.
5. Compute permission as the intersection of Agent, requester, executor, represented principal, task, delegation, resource and policy permissions.
6. Detect idempotency conflict before preparing an effect.
7. Apply approval gates. Even a valid Publish approval returns `STOP/FOUNDER_DECISION_REQUIRED`.
8. Prepare READ/DRAFT data without committing it, run the test-only boundary hook, then immediately repeat REG4 validation at T1 and trusted context validation.
9. Atomically release scoped READ data or commit one visibly non-canonical DRAFT.
10. Return a safe envelope and append exactly one safe, hash-linked in-memory audit record.

Any external exception or unverifiable dependency is converted to a system-owned fail-closed reason. Raw messages, stack traces, arbitrary error properties, payloads, credentials and approval secrets never enter the ledger or error envelope. Defensive copies prevent callers from mutating stored drafts or ledger records.

## Governance inventory mapping

- `E01–E09`: exact REG4 tuple, package immutability/fingerprint, lifecycle status, evidence presence and final T1 revalidation.
- `C01–C09`: actor separation, company/resource isolation, anti-spoofing, task/delegation validity, represented-principal permission and immutable call context.
- `A01–A07`: approval absence, expiry, revocation, replay, action binding, resource staleness and non-escalation of permission.
- `T01–T06`: scoped READ, visibly non-canonical DRAFT, Publish STOP and exactly-once idempotency.
- `L01–L05`: one ledger record per outcome, fail-closed dependencies, safe metadata, proof-only claims and explicit disposition/compensation.
- `R01–R04`: external REG4 regression, file-count, forbidden-path and no-remote-operation gates.

This handoff is an implementation design. It does not declare a canonical baseline and does not authorize Production or a later phase.
