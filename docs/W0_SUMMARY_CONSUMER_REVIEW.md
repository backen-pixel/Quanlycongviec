# W0 summary consumer review and cockpit alignment

Base: `3679161d1cf176665f622d60d80a52542c5f8360` on `codex/w0-summary-fix-20260923`.
Date: 2026-09-23.

Final laptop run: Windows, Node.js v22.20.0, 111/111 tests passed, zero failures/skips/cancellations, exit 0, empty stderr. Breakdown: prior 79 + route bridge 9 + cockpit contract 6 + existing frontend contract 17. JSX syntax check also passed. This is isolated synthetic-data evidence, not live HTTP/database/browser validation.

## Caller map

| Caller | Path | Impact |
|---|---|---|
| Work summary route | `backend/src/routes/workTasks.js` | Returns `fetchUnifiedTasksSummary` result unchanged. New callback bridge tests cover response, query scope and failures. |
| Heartbeat | `backend/src/helpers/appHeartbeat.js` | Uses separate open/overdue counters; their logic is unchanged. Earlier regression suite covers their filters. |
| Founder cockpit | `backend/src/helpers/founderCockpitReadModel.js` | Uses the shared query builder with two arguments, then its own summarizer; it never calls `fetchUnifiedTasksSummary`. Its separate cancellation bug is corrected here. |
| Work overview | `frontend/src/pages/WorkOverviewPage.jsx` | Calls task lists, not `/work-tasks/summary`. |
| Founder UI | `frontend/src/business-os/FounderCockpit.jsx` | Shows corrected completed count and a separate cancelled count; adds Vietnamese labels for cancelled/closed. |

Search included tracked JavaScript/JSX/TypeScript/TSX/MJS/CJS/Python/PowerShell/shell files. No direct frontend caller of `/work-tasks/summary` was found. External clients and dynamically assembled URLs remain unverified. Generated API documentation registers the endpoint, but is not a caller.

## Cockpit correction

`summarizeWorkRows` counts completed (`done`/`completed`) and cancelled work separately and exposes `closed = done + cancelled`. Open/overdue counts keep their previous semantics. `mergeWorkSummaries` preserves separate counts across companies and planning horizons.

Injected/legacy readers without valid separate `done` and `cancelled` counts cannot prove a completed-only total. Their aggregate `done`, `cancelled`, `closed`, and corresponding status buckets are `null`; open/overdue remain available. Unavailable-source fallback packets also expose null new fields. The default workload reader supplies the new fields.

Existing callers that interpret `done` as all closed work must use `closed`. This applies to both the task summary and the cockpit payload. No contract version, permission, route or data-write capability was changed.

## Tests

- `backend/tests/work-tasks-summary-route.test.js`: nine tests load the full real route module and real helper with explicit fake imports. They invoke the registered callback and synthetic request/response objects. This verifies callback integration, not real Express HTTP routing, JWT authentication, tenant middleware, RLS or the Supabase SDK.
- `backend/tests/founder-work-summary-contract.test.js`: six tests for status separation, overdue behavior, empty data, multi-company aggregation, legacy reader uncertainty and agreement with the task summary on shared status/module semantics.
- The original 79-case suite is rerun against the candidate files on the laptop.
- The existing pure frontend contract suite is included; JSX syntax is checked separately. This does not verify browser layout or live frontend operation.

Run the two new test files from the checkout root:

```sh
node --test backend/tests/work-tasks-summary-route.test.js backend/tests/founder-work-summary-contract.test.js
```

The broader historical Founder backend tests import application configuration, SDKs and HTTP setup; those files are not executed in this restricted run.

## Limits / remaining work

- No database, HTTP server, real credentials, external send or production deployment is used.
- No live query-performance or external-client compatibility evidence is available.
- The cockpit's paging helper and view-row duplication are unchanged. This patch does not certify completeness or unique business-task counts for the entire cockpit.
- WorkOverview list badges are based on requested pages; this independent limitation is not fixed here.
- `resolveDealColumnKey` still classifies all-terminal deal groups as done, but no caller exists in the tracked frontend source. Individual task columns already separate cancelled correctly.
- This internal proof does not close production or Founder acceptance gates.

Before integration into a running application, review downstream consumers and execute authorized staging checks. To abandon this candidate before merge, leave its isolated branch unused. If already merged, revert this follow-up commit; reverting the earlier summary correction is a separate decision. No data or migration rollback is involved.
