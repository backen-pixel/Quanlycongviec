# BUSINESS AI OS — Internal Live Operation V1

Status: INTERNAL RELEASE CANDIDATE / FOUNDER DECISION REQUIRED

This is the complete release, operations, rollback, and Founder-acceptance runbook for an internal managed environment. It is not authorization for an external-customer Production deployment, a main/master merge, a schema migration, a permission/RLS increase, direct database write, or an autonomous Business AI Runtime.

The package is fail-closed: a module is not LIVE until current evidence proves its exact version, real source, data freshness, ecosystem/company scope, permissions, audit, reconciliation, drill-down, and any controlled-action gates.

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
| Frontend production build | REQUIRED | REQUIRED | REQUIRED |
| Health and monitoring | REQUIRED | REQUIRED | REQUIRED |
| Data freshness | REQUIRED | REQUIRED | REQUIRED |
| Backup verification | REQUIRED | REQUIRED | REQUIRED |
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

1. The Release Owner selects one repository, exact commit, and tree.
2. Create a separate clean checkout/worktree at that commit. Do not reset an active workspace.
3. Confirm git status is empty and complete the frozen-version record.
4. Keep all secrets outside Git and operator evidence.
5. Run the credential-free verifier:

       pwsh -NoProfile -File scripts/verify-internal-live-v1.ps1 -RepoRoot . -Strict

Strict verification must pass from the frozen checkout.

### Install, test, and build

Use the approved Node version and lockfiles:

       cd backend
       npm ci --prefer-offline --no-audit
       npm run test:tenant
       cd ../frontend
       npm ci --prefer-offline --no-audit
       npm run build

Also run the repository's current Business OS/cockpit contract test command and record it in the frozen record. If no package script exists, invoke only the reviewed, committed test files for the frozen candidate. A report from another commit is not evidence.

### Internal configuration

- Store secrets in the managed environment secret store. The Render blueprint declares secret names with sync: false; values must not enter Git, docs, logs, or browser bundles.
- Keep SUPABASE_FAILOVER_ENABLED=0 and SUPABASE_AUTO_FAILOVER=0 unless separately approved.
- Keep backup-sync schedules and every controlled action disabled until their owners approve them.
- Restrict the environment to named internal users through VPN, SSO, IP restriction, or an equivalent internal control.
- Do not attach an external customer domain or public onboarding.
- The existing Render files are reference configuration. This runbook does not create, update, or deploy a Render service.

### Start and smoke

Do not start `src/server.js` against the real environment merely to perform a read-only acceptance smoke. The existing full server starts presence writes and database-configured background jobs, and no single reviewed flag disables every write. `NODE_ENV=test` and `REDIS_DISABLED=1` are insufficient.

The reviewed real-data acceptance path mounts only the authenticated Business OS router and performs no operational write:

       cd backend
       $env:REDIS_DISABLED='1'
       $env:PG_POOL_DISABLED='1'
       $env:SUPABASE_FAILOVER_ENABLED='0'
       $env:SUPABASE_AUTO_FAILOVER='0'
       $env:SUPABASE_AUTO_FAILBACK='0'
       node --env-file='<approved internal env file>' tests/founder-cockpit-live-read.js

It must return six systems, fifteen modules, the expected scoped companies, two manufacturing views, `writes_enabled=false`, and at least one real negative scope check. Never place the environment-file path or its contents in shared evidence.

Starting the frozen full process with `npm start` is permitted only after the Release Owner names the managed internal target, approves its existing background-job posture, supplies the access boundary, and verifies that no startup DDL or prohibited autonomous action can execute. Then verify GET /api/health returns HTTP 200 and status=ok, the response time is current, the company scope is explicit, denied companies/modules remain inaccessible, and Live Mode never substitutes fixtures or synthetic data.

If a separate static frontend is used, build it from the same frozen commit and bind it only to the approved internal backend.

## 3. Monitoring, data freshness, and audit

### Service checks

| Signal | Frequency | Pass rule | Failure action |
|---|---:|---|---|
| GET /api/health | 1 minute | HTTP 200, status=ok, current time | alert and incident triage |
| uptime/restarts | 5 minutes | no unexplained restart loop | stop acceptance |
| Supabase primary health | 1 minute | selected target healthy | block data-dependent modules |
| replication/failback queue | 5 minutes | within approved threshold | mark affected data stale |
| GET /api/metrics | 5 minutes | authorized read succeeds | investigate service/access |
| error rate and latency | 5 minutes | within release SLO | disable affected actions |

GET /api/metrics requires an admin or manager bearer token. Never store the token in release evidence. POST /api/metrics/reset is a mutation and is excluded.

### Dataset freshness contract

Every cockpit aggregate must expose dataset ID, source module, ecosystem/company scope, source watermark, observed time, freshness SLO, freshness status, and reconciliation evidence. Allowed freshness states are FRESH, STALE, UNKNOWN, and NOT_CONNECTED. The UI must not invent a source time; UNKNOWN is not FRESH.

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

## 4. Read-only backup verification

The existing verify-only path is:

       cd backend
       npm run db:verify-backup

It invokes sync-supabase-backup.js with --verify and performs count-only reads on selected primary/backup tables. Run it only from a protected operator session with read-capable connection variables.

Record checked_at, environment IDs, latest completed backup ID/time, schema-freeze time, drift, verifier, and PASS/FAIL/UNKNOWN. PASS also requires a separately proven restore rehearsal in an isolated environment; count equality alone is not recoverability.

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

- [ ] Environment is INTERNAL MANAGED with no external-customer onboarding.
- [ ] Network access is limited to approved internal users.
- [ ] Operators use individual accounts; disabled users and revoked sessions are denied.
- [ ] Admin/manager/module permissions are not granted by the release procedure.
- [ ] Tenant A cannot list, search, open, export, cache, or infer Tenant B records.
- [ ] Company A cannot list, search, open, export, cache, or infer Company B records without approved scope.
- [ ] Ecosystem/company selection persists through drill-down.
- [ ] Direct-link and changed-ID negative tests do not leak existence.
- [ ] Realtime, export, reporting, cache, and jobs preserve scope.
- [ ] API authorization is tested separately from frontend visibility.
- [ ] Approval-required actions reject missing, expired, foreign, and self-issued approvals.
- [ ] Controlled actions name an existing Application Service and Domain Rule.
- [ ] Duplicate submission and compensation are tested.
- [ ] Cockpit/Executive AI has no database credential or generic CRUD.
- [ ] Authentication, denial, scope change, approval, action, failure, and rollback are auditable.
- [ ] Reviewer and Release Owner are independent where required.

Any failure sets the affected module to BLOCKED.

## 7. Module activation and acceptance

MODULE_ACTIVATION_STATUS.schema.json is the machine contract. MODULE_ACTIVATION_REPORT.json records the current real-data result. Connected read modules may be LIVE or LIVE WITH DATA GAPS, no real cockpit action is enabled, and final internal activation remains FOUNDER DECISION REQUIRED until the missing managed-runtime and backup/restore authority are supplied and verified.

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
- Enabled real actions with Application Services: REQUIRED or NONE
- Protected actions: REQUIRED
- Critical residual risks: REQUIRED
- Decision: APPROVE INTERNAL DAILY USE / APPROVE INTERNAL WITH EXPLICIT DATA GAPS / HOLD / REJECT / FOUNDER DECISION REQUIRED

Never include a password, token, database URI, or recovery secret.

## 8. Mandatory Founder escalation

Consolidate a Founder Decision when the authoritative source is ambiguous; a Business Rule/canonical behavior must change; schema/migration or permission/RLS must change; privilege must increase; cross-company exposure exists; accounting requires new policy; direct DB write seems necessary; main/master merge, Runtime, external Production, or scope/risk expansion is requested.
