# Internal Live Operation V1 — Runtime Safety Evidence

This is the only repository evidence root for the Founder-local/private/localhost acceptance run.

The approved correction uses implementation generation **C3-R1**, not the docs-only
C4 acceptance step. Historical C3 and its flat `runtime/` evidence remain unchanged.
See `docs/internal-live-v1/NARROW_CORRECTION_REVERIFICATION.md` for the narrow scope,
history disclosure, refreeze sequence and unchanged HOLD/STOP boundaries.

Tracked files describe the evidence contract. Generated artifacts belong in `runtime/candidates/c3-r1/`, which is Git-ignored so a local verification run does not dirty the frozen checkout.

Permitted evidence is sanitized technical output: command name, exit code, UTC timestamps, commit/tree, non-secret configuration flags, redacted scope identifiers, counts/tolerances, and PASS/PENDING/FAIL results.

Never store tokens, passwords, cookies, `.env` contents or paths, database connection strings, writable credentials, raw personal/business records, recovery secrets, or confidential advisory values.

The blocking readiness gates are runtime, authenticated loopback health, connected-module reconciliation, configuration rollback, and no-write. `INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json` must remain HOLD until all five are PASS with current evidence references.

Backup/failover is informational and non-blocking for Founder-local read-only unless current evidence shows that a V1-critical source is unstable. Keep `NOT VERIFIED` visible and never infer restore readiness from a count-only check.

Every PASS artifact uses schema `1.0.0`, its documented exact `evidence_type`, and a UTC `checked_at` or `generated_at` that is not in the future and is no more than 24 hours old. Except for the attestation itself, each artifact carries `candidate.commit`, `candidate.tree`, `candidate.candidate_attestation_sha256`, and `candidate.attested_at`. The hash must match the exact current bytes of `candidate-attestation.json`. This binds static, runtime, browser, live-read, reconciliation, configuration-rollback, and no-write proof to one clean C3-R1 implementation candidate rather than merely to a nearby checkout.

At acceptance, `EVIDENCE_MANIFEST.json.artifact_sha256` contains the exact SHA-256 inventory for every artifact backing a PASS gate. Strict verification recomputes every hash and rejects missing, extra, changed, or stale artifacts. Generated evidence is removed before a rerun and published atomically, so a failed attempt cannot reuse an older PASS.

| Artifact | Exact `evidence_type` | Time field |
|---|---|---|
| `candidate-attestation.json` | `FOUNDER_LOCAL_CANDIDATE_ATTESTATION` | `checked_at` |
| `static-verification.json` | `FOUNDER_LOCAL_STATIC_VERIFICATION` | `checked_at` |
| `configuration-rollback-verification.json` | `FOUNDER_ADVISORY_CONFIGURATION_ROLLBACK_VERIFICATION` | `checked_at` |
| `founder-local-safety-verification.json` | `FOUNDER_LOCAL_STATIC_SAFETY_VERIFICATION` | `checked_at` |
| `runtime-acceptance-summary.json` | `FOUNDER_LOCAL_RUNTIME_ACCEPTANCE` | `checked_at` |
| `browser-runtime-verification.json` | `FOUNDER_LOCAL_BROWSER_RUNTIME_VERIFICATION` | `checked_at` |
| `lifecycle-runtime-verification.json` | `FOUNDER_LOCAL_LIFECYCLE_RUNTIME_VERIFICATION` | `checked_at` |
| `real-data-live-read.json` | `FOUNDER_COCKPIT_REAL_DATA_LIVE_READ` | `generated_at` |
| `real-data-reconciliation.json` | `FOUNDER_COCKPIT_REAL_DATA_RECONCILIATION` | `generated_at` |
| `backup-failover-verification.json` | `FOUNDER_LOCAL_BACKUP_FAILOVER_VERIFICATION` | `checked_at` |

On the clean implementation candidate (C3-R1), first run `node evidence/internal-live-operation-v1/runtime-safety/write-candidate-attestation.js`. Then run `node evidence/internal-live-operation-v1/runtime-safety/run-static-verification.js`. The static runner requires that exact attestation, refuses to run after all tracked blocking gates are PASS, invokes the structural verifier without final-freeze strictness, and runs tenant, Business OS, advisory configuration, Founder-local safety, frontend contract, and dedicated same-origin `npm run build:founder-local` checks. Only after preflight, it atomically replaces each of three sanitized ignored artifacts: `runtime/candidates/c3-r1/static-verification.json`, `runtime/candidates/c3-r1/configuration-rollback-verification.json`, and `runtime/candidates/c3-r1/founder-local-safety-verification.json`. It rechecks HEAD, tree, worktree cleanliness, and attestation bytes after all checks. The generated static artifact is not a prerequisite of the verifier invocation that creates it.

Generate the candidate-bound runtime artifacts on the same clean C3-R1 checkout: `runtime/candidates/c3-r1/runtime-acceptance-summary.json`, `runtime/candidates/c3-r1/browser-runtime-verification.json`, `runtime/candidates/c3-r1/real-data-live-read.json`, and `runtime/candidates/c3-r1/real-data-reconciliation.json`. Browser proof must use the built integrated application on `http://127.0.0.1:4010`, enforce same-origin requests, authenticate an admin, render the Business OS contract, load the vetted CRM drill-down, and observe no write.

After evidence completes, C4 may change only these tracked acceptance records: `INTERNAL_LIVE_OPERATION_V1_FOUNDER_ACCEPTANCE.md`, `INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json`, `INTERNAL_LIVE_OPERATION_V1_RUNBOOK.md`, `INTERNAL_LIVE_OPERATION_V1_VERIFICATION_SUMMARY.md`, and `EVIDENCE_MANIFEST.json`. No code, test, schema, verifier, or evidence generator may change after C3-R1. For each PASS gate, copy the exact manifest artifact set into the module-status record and set gate `checked_at` to the latest timestamp among those artifacts. Finally run `pwsh -NoProfile -File scripts/verify-internal-live-v1.ps1 -RepoRoot . -Strict` from the clean C4 checkout. The verifier rejects stale, future, mistyped, cross-candidate, incomplete, or non-acceptance C4 evidence.

Freshness evidence records both the current read observation (`observed_at`) and the latest source mutation watermark (`source_updated_at`) when available. Permitted states are `FRESH`, `STALE`, `UNKNOWN`, and `NOT_CONNECTED`; never replace a missing source watermark with an invented timestamp.

The runtime blocking gate also requires the exact candidate-bound lifecycle
artifact. `verify-founder-local-lifecycle.js` must prove two distinct owned runs,
stop and repeat-stop for each, clean restart, both processes dead, port closed and
PID/lock absent without manual cleanup. The static runner retains all seven prior
checks and adds browser readiness, lifecycle and historical-evidence isolation
regressions. The strict verifier requires these checks and lifecycle proof; a
browser PASS alone cannot satisfy the corrected runtime gate.

For live runtime verification, set `FOUNDER_LOCAL_ENV_FILE` explicitly in the protected operator process and run `npm run verify:founder-local-runtime` from `backend/`. The verifier does not search another checkout for an environment file. It may use an explicitly supplied acceptance token or password pair; when neither is supplied, it discovers an active tenant-bound `admin` through the guarded read-only client and mints a short-lived, purpose-bound Founder-local session token in memory. It proves that expired and ordinary/non-expiring application tokens are denied, uses a transient browser context with tab-scoped credentials, never records the identity or token, and performs a real non-admin denial check whenever an eligible non-admin identity exists.

Warranty/Care may remain NOT CONNECTED and non-blocking when explicit. Operational/domain writes remain disabled. The provisional advisory configuration is a separate local-file-only gate and has zero operational effect even if later verified and enabled.
