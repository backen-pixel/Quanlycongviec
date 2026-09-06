# BUSINESS AI OS — Internal Live Operation V1 Founder-local Runbook

Status: FOUNDER-LOCAL RELEASE CANDIDATE / HOLD

This is the release, operations, rollback, and Founder-acceptance runbook for one Founder-operated, private, localhost-only instance. It is not authorization for public-internet exposure, another user role, an external-customer Production deployment, a main/master merge, a schema migration, a permission/RLS increase, direct database write, any operational/domain write, or an autonomous Business AI Runtime.

The package is fail-closed: a module is not LIVE until current evidence proves its exact version, real source, data freshness, ecosystem/company scope, permissions, audit, reconciliation, drill-down, and any controlled-action gates.

The current release decision is **HOLD**. Do not describe it as READY until the five blocking gates—runtime, loopback health, connected-module reconciliation, configuration rollback, and no-write—have current PASS evidence. Warranty/Care may remain `NOT CONNECTED` without blocking V1 only while the gap is explicit and no synthetic substitute is shown. Backup/failover may remain `NOT VERIFIED` as an informational, non-blocking limitation unless evidence shows that a V1-critical source is unstable.

Fixed boundary: runtime profile `founder-local-read-only`; loopback bind only; authenticated `admin` only; no public internet; real data read in place through an existing Application Service or approved read model; no silent synthetic fallback; all background writers and operational/domain writes off.

## 1. Frozen-version record template

Complete this table only from the exact clean release checkout. Never copy credentials into it.

| Field | Required value |
|---|---|
| Release ID | REQUIRED |
| Repository identity | REQUIRED |
| Commit SHA (40 hex) | REQUIRED |
| Git tree SHA (40 hex) | REQUIRED |
| Branch or detached ref | REQUIRED |
| Release tag | REQUIRED or NONE |
| Working tree clean | REQUIRED: YES |
| Build timestamp UTC | REQUIRED |
| Build operator | REQUIRED |
| Independent verifier | REQUIRED |
| Backend package-lock SHA-256 | REQUIRED |
| Frontend package-lock SHA-256 | REQUIRED |
| Backend artifact SHA-256 | REQUIRED |
| Frontend artifact SHA-256 | REQUIRED |
| Internal environment ID | REQUIRED |
| Deployment/config revision | REQUIRED |
| Database environment ID | REQUIRED; identifier only |
| Latest applied migration | REQUIRED |
| Module activation report SHA-256 | REQUIRED |
| Approved rollback commit/tree | REQUIRED |

Verification binding:

| Gate | Result | Timestamp UTC | Evidence reference |
|---|---|---|---|
| Static verifier | REQUIRED | REQUIRED | REQUIRED |
| Business OS/cockpit tests | REQUIRED | REQUIRED | REQUIRED |
| Tenant/company isolation | REQUIRED | REQUIRED | REQUIRED |
| Founder-local same-origin frontend build | REQUIRED | REQUIRED | REQUIRED |
| Health and monitoring | REQUIRED | REQUIRED | REQUIRED |
| Data freshness | REQUIRED | REQUIRED | REQUIRED |
| Configuration rollback | REQUIRED | REQUIRED | REQUIRED |
| No-write posture | REQUIRED | REQUIRED | REQUIRED |
| Backup/failover | INFORMATIONAL; non-blocking unless a V1-critical source is unstable | REQUIRED | REQUIRED or NOT VERIFIED |
| Module reconciliation | REQUIRED | REQUIRED | REQUIRED |
| Access-control review | REQUIRED | REQUIRED | REQUIRED |
| Incident-stop rehearsal | REQUIRED | REQUIRED | REQUIRED |

Release Owner decision: APPROVE INTERNAL / HOLD / REJECT

Release Owner:

Decision timestamp UTC:

Immutable approval reference:

Incident Commander:

## 2. Reproducible local/internal run procedure

### Select and freeze

1. The Release Owner selects one repository, exact implementation commit, and implementation tree.
2. Create a separate clean checkout/worktree at that commit. Do not reset an active workspace.
3. Confirm git status is empty and generate the ignored candidate attestation for that exact implementation HEAD/tree (C3-R2).
4. Generate all static, runtime, browser, live-read, and reconciliation evidence on that same C3-R2. Every artifact must carry the C3-R2 commit/tree plus the current candidate-attestation hash and timestamp; at final verification, no timestamp may be in the future and every acceptance artifact must be no more than 24 hours old.
5. Keep all secrets outside Git and operator evidence.
6. After runtime evidence is complete, a later docs-only acceptance commit (C4) may bind `verified_source_candidate` to C3-R2. C4 must not be a merge and may modify only the four tracked acceptance records in this directory and `evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json`; the implementation commit must exist, remain an ancestor, and its recorded tree must match Git. The tracked report cannot self-reference its own future commit hash.
7. For each PASS gate, use the exact artifact inventory from the manifest and set `checked_at` to the latest timestamp among those artifacts.
8. Run the credential-free verifier from the clean C4 acceptance checkout:

       pwsh -NoProfile -File scripts/verify-internal-live-v1.ps1 -RepoRoot . -Strict

Strict verification must pass from the frozen checkout.

### Install, test, and build

Use the approved Node version and lockfiles:

       cd backend
       npm ci --prefer-offline --no-audit
       npm run test:tenant
       cd ../frontend
       npm ci --prefer-offline --no-audit
       npm run build:founder-local

Also run the repository's current Business OS/cockpit contract test command and record it in the frozen record. If no package script exists, invoke only the reviewed, committed test files for the frozen candidate. A report from another commit is not evidence.

### Internal configuration

- Keep the secret-bearing environment file outside the repository; values must not enter Git, docs, logs, browser bundles, or evidence.
- Set `RUNTIME_PROFILE=founder-local-read-only`, `FOUNDER_LOCAL_READ_ONLY=1`, and `FOUNDER_LOCAL_PORT=4010`.
- Keep `FOUNDER_ADVISORY_CONFIG_ENABLED=0` until its dedicated gate passes. Keep every operational/domain write disabled regardless of that advisory flag.
- The profile must force background jobs, scheduled notifications, replication, failover/failback, realtime writes, queues, external sync, and canonical database writes off.
- Bind backend and frontend only to `127.0.0.1`; do not use `0.0.0.0`, a LAN address, a tunnel/proxy, a public hostname, or an external domain.
- Permit only the designated authenticated Founder `admin`. Frontend hiding is not authorization; the API must deny every other role.
- Existing Render files are outside this Founder-local procedure and are not deployment authority.

### Start and smoke

Do not start `src/server.js` against real data unless the frozen candidate contains and passes the Founder-local runtime-profile checks. `NODE_ENV=test` and `REDIS_DISABLED=1` alone are insufficient.

The reviewed real-data acceptance path mounts only the authenticated Business OS router and performs no operational write:

       cd backend
       $env:REDIS_DISABLED='1'
       $env:PG_POOL_DISABLED='1'
       $env:SUPABASE_FAILOVER_ENABLED='0'
       $env:SUPABASE_AUTO_FAILOVER='0'
       $env:SUPABASE_AUTO_FAILBACK='0'
       node --env-file='<approved internal env file>' tests/founder-cockpit-live-read.js

It must return six systems, fifteen modules, the expected scoped companies, two manufacturing views, `writes_enabled=false`, and at least one real negative scope check. Never place the environment-file path or its contents in shared evidence.

After the frontend build and static verifier pass, start the integrated frozen process from `backend` with the protected environment file selected explicitly:

       $env:RUNTIME_PROFILE='founder-local-read-only'
       $env:FOUNDER_LOCAL_READ_ONLY='1'
       $env:FOUNDER_LOCAL_PORT='4010'
       $env:FOUNDER_ADVISORY_CONFIG_ENABLED='0'
       $env:FOUNDER_LOCAL_ENV_FILE='<Founder-local protected environment file>'
       npm run start:founder-local

The start command must serve the already-built frontend and backend together on `127.0.0.1:4010`; stop immediately if any operational/domain writer is enabled or the bind is not loopback. Keep the local advisory file write disabled until its six-gate evidence passes. Then verify the authenticated `GET /api/business-os/health` contract, explicit company scope, denied roles/companies, current timestamps, and the absence of fixtures or synthetic fallback.

Open the integrated application from the same loopback listener:

       http://127.0.0.1:4010/business-os

Sign in with the designated Founder `admin` account. The Vite development server on port 5173 is not the frozen acceptance runtime.

## 3. Monitoring, data freshness, and audit

### Service checks

| Signal | Frequency | Pass rule | Failure action |
|---|---:|---|---|
| GET /api/business-os/health | before use and every 5 minutes | authenticated response is current, scope/protections PASS, no blocking module | stop acceptance |
| uptime/restarts | 5 minutes | no unexplained restart loop | stop acceptance |
| Supabase primary health | 1 minute | selected target healthy | block data-dependent modules |
| writer-safety snapshot | before use and every change | background, realtime, controlled/domain, and public-bind flags are false | stop process |
| error rate and latency | 5 minutes | within release SLO | disable affected actions |

The Business OS health route requires the Founder `admin` token. Pass it only through the approved local operator method; never store the token in release evidence. The verifier must reject a non-loopback health URL and redirects.

### Dataset freshness contract

Every cockpit aggregate must expose dataset ID, source module, ecosystem/company scope, source watermark, observed time, freshness SLO, freshness status, and reconciliation evidence. Allowed freshness states are `FRESH`, `STALE`, `UNKNOWN`, and `NOT_CONNECTED`. The UI must not invent a source time; `UNKNOWN` is not `FRESH`.

For read-in-place sources, `observed_at` records the current successful read observation and `source_updated_at` records the latest source mutation watermark when the source exposes one. A missing source watermark must remain null rather than being replaced by the observation time. The freshness state must state which watermark and SLO produced it; an old business mutation alone is not proof of connector staleness when a current read observation succeeded.

Default internal SLOs, pending an approved signal dictionary:

| Dataset family | Default SLO |
|---|---:|
| CRM, lead/deal, task/work | 15 minutes |
| Project, production, logistics, purchasing | 30 minutes |
| workload and manufacturing capacity | 60 minutes |
| accounting/reporting | 24 hours, with close date shown |
| permission, approval, audit eligibility | 5 minutes |

These defaults are monitoring thresholds, not new Business Rules. A stricter approved source SLO wins.

Daily verification:

1. select the same tenant/company in cockpit and source module;
2. record both watermarks;
3. compare approved counts/totals;
4. record variance and tolerance;
5. set UNDER RECONCILIATION for unexplained variance;
6. set BLOCKED immediately for cross-company exposure.

Audit each enabled action for actor, tenant/company, permission, approval, idempotency, validation, outcome, and compensation reference. Missing audit evidence disables the action.

### Provisional advisory configuration gate

The local advisory path may move from `PENDING_VERIFICATION` to `ENABLED` only after the frozen candidate proves all six bounded gates:

1. existing bounded service/rule: allow-listed warning values only, Founder-local file storage, non-canonical, zero operational effect;
2. permission: authenticated Founder `admin` and valid ecosystem/company scope;
3. approval and validation: explicit Founder confirmation and reason, bounded values, and expected version;
4. idempotency: exact replay returns the same result and conflicting key reuse fails closed;
5. audit/versioning: actor reference, action, UTC time, version, checksum, and outcome are retained without secrets;
6. rollback/compensation: a prior version can be restored and the rollback is itself versioned and audited.

Failure of any gate keeps `FOUNDER_ADVISORY_CONFIG_ENABLED=0`. Passing this gate still does not enable operational/domain writes, direct database writes, migrations, permission changes, background jobs, or automatic actions.

### Evidence handling

Sanitized automated technical evidence for the current candidate belongs only under `evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/`. That generated directory is Git-ignored except for its guard file; the tracked manifest in the parent directory inventories the exact artifact names and gate state. Each generated artifact must use the documented type/schema, bind to the exact C3-R2 candidate attestation, and be no more than 24 hours old. Historical candidate directories remain immutable. Never save tokens, passwords, `.env` paths, connection strings, raw personal data, or recovery secrets.

## 4. Informational read-only backup/failover verification

The existing verify-only path is:

       cd backend
       npm run db:verify-backup

It invokes sync-supabase-backup.js with --verify and performs count-only reads on selected primary/backup tables. Run it only from a protected operator session with read-capable connection variables.

Record checked_at, environment IDs, latest completed backup ID/time, schema-freeze time, drift, verifier, and PASS/FAIL/UNKNOWN when this already authorized read-only path is available. Count equality alone is not recoverability and must not be labeled as a restore PASS.

Backup/failover is informational and non-blocking for this Founder-local read-only V1 unless current evidence shows that a V1-critical source is unstable. Do not copy or restore real source data to close this informational item. A platform-owned local configuration restore may be rehearsed with synthetic or empty isolated state as part of the separate blocking configuration-rollback gate.

Never run these during verification:

- db:sync-backup, db:run-backup-sync, db:sync-failover-merge;
- storage:sync-backup;
- any db:migrate command;
- backup-sync run or switch endpoints;
- restore, delete, reset, clean, or down-migration.

## 5. Rollback and incident stop

Code rollback and data recovery are separate.

1. Disable new controlled actions for the affected module.
2. Preserve logs, audit receipts, deployment ID, commit/tree, timestamps, and affected company IDs.
3. Route users to the canonical module or approved legacy entry point when isolation remains intact.
4. Start a clean checkout/worktree at the approved rollback commit; do not rewrite history.
5. Keep additive schema and operational records.
6. Correct database-contract defects only through a separately reviewed forward-fix migration.
7. Restore only into an isolated environment first; reconcile before any target change.
8. Require Release Owner and Data Owner approval for a target change.

Immediate stop triggers:

- cross-company/tenant exposure;
- direct database write outside an approved Application Service;
- permission or approval bypass;
- unexplained accounting variance;
- stale/synthetic data presented as live;
- audit loss or idempotency failure;
- unavailable backup/rollback evidence;
- restart loop, corruption, or abnormal error rate.

Do not activate automatic failover or a quick database switch during triage. Re-enable only after the full gate set passes with new evidence.

## 6. Access-control checklist

- [ ] Runtime profile is `founder-local-read-only` and the process binds only to `127.0.0.1`.
- [ ] No public URL, tunnel, proxy, LAN bind, or external-customer onboarding exists.
- [ ] Only the designated authenticated Founder `admin` can enter; every other role is denied by the API.
- [ ] Disabled users, revoked sessions, and invalid/expired tokens are denied.
- [ ] Tenant A cannot list, search, open, export, cache, or infer Tenant B records.
- [ ] Company A cannot list, search, open, export, cache, or infer Company B records without approved scope.
- [ ] Ecosystem/company selection persists through drill-down.
- [ ] Direct-link and changed-ID negative tests do not leak existence.
- [ ] Realtime writers, background jobs, failover/failback, replication, external sync, and response caching remain disabled.
- [ ] API authorization is tested separately from frontend visibility.
- [ ] Approval-required actions reject missing, expired, foreign, and self-issued approvals.
- [ ] Operational/domain actions remain disabled.
- [ ] Any enabled advisory configuration is local-file-only, explicitly Founder-confirmed, validated, idempotent, audited/versioned, rollback-tested, and has zero operational effect.
- [ ] Cockpit/Executive AI has no database credential or generic CRUD.
- [ ] Authentication, denial, scope change, approval, action, failure, and rollback are auditable.
- [ ] Reviewer and Release Owner are independent where required.

Any failure sets the affected module to BLOCKED.

## 7. Module activation and acceptance

`MODULE_ACTIVATION_STATUS.schema.json` is the machine contract. `INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json` records the current real-data result. Connected read modules may be LIVE or LIVE WITH DATA GAPS; Warranty/Care may remain explicitly NOT CONNECTED and non-blocking. Operational/domain actions remain disabled. The local advisory configuration status remains PENDING VERIFICATION until its bounded six-gate evidence passes.

The mandatory release artifacts are `INTERNAL_LIVE_OPERATION_V1_FOUNDER_ACCEPTANCE.md`, `INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json`, `INTERNAL_LIVE_OPERATION_V1_RUNBOOK.md`, `INTERNAL_LIVE_OPERATION_V1_VERIFICATION_SUMMARY.md`, and sanitized automated evidence under `evidence/internal-live-operation-v1/runtime-safety/`.

Set `ready_for_internal_daily_use=true` and `acceptance_decision=APPROVE_INTERNAL` only when runtime, health, reconciliation, configuration rollback, and no-write gates are all PASS with timestamps and evidence references. The truthful decision remains HOLD while any blocking gate is PENDING or FAIL. Backup/failover remains visible but informational and non-blocking unless a V1-critical source is shown to be unstable.

Permitted module states:

- LIVE
- LIVE WITH DATA GAPS
- UNDER RECONCILIATION
- NOT CONNECTED
- BLOCKED
- FOUNDER DECISION REQUIRED

### Founder acceptance view

Complete only after the report passes:

- Internal URL and sign-in method: REQUIRED
- Frozen release ID/commit/tree/deployment time: REQUIRED
- LIVE modules: REQUIRED
- LIVE WITH DATA GAPS modules: REQUIRED
- UNDER RECONCILIATION / NOT CONNECTED / BLOCKED modules: REQUIRED
- Dataset last-update times and scope: REQUIRED
- Enabled operational/domain actions: NONE in Founder-local V1
- Advisory configuration status: DISABLED / PENDING VERIFICATION / ENABLED; if enabled, show its zero-operational-effect evidence
- Protected actions: REQUIRED
- Critical residual risks: REQUIRED
- Decision: APPROVE INTERNAL DAILY USE / APPROVE INTERNAL WITH EXPLICIT DATA GAPS / HOLD / REJECT / FOUNDER DECISION REQUIRED

Never include a password, token, database URI, or recovery secret.

## 8. Mandatory Founder escalation

Create `CONSOLIDATED_FOUNDER_DECISION_REQUEST_V1.md` only when a mandatory exception actually remains: the authoritative source is ambiguous; a canonical Business Rule/behavior must change; schema/migration or permission/RLS must change; privilege must increase; cross-company exposure exists; accounting requires a new policy; direct database write appears necessary; or main/master merge, Runtime/external Production, or scope/risk expansion is requested. Pending routine runtime evidence is HOLD, not itself a Founder exception.
