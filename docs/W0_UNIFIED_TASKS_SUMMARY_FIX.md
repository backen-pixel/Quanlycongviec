# W0 unified task summary correction

Scope: `GET /api/work-tasks/summary` via `fetchUnifiedTasksSummary`.
Base: `fb31811f0da694b40f3a143dc2e48f6a75828857`.

## Behavior

- `done` and `by_status.done` count `done`/`completed` only.
- `cancelled` and `by_status.cancelled` count cancelled rows separately.
- `closed = done + cancelled` preserves the aggregate for callers that need all closed rows.
- Open-work filters continue to exclude all three closed statuses.
- `total` and the status/module buckets count returned `unified_tasks_v` rows; they do not deduplicate business tasks.
- `source_total_rows` is the exact count for the executed task query when available, including its filters and any truncated assignee lead list. It is not an exact total for all work of that assignee.
- `count_basis = UNIFIED_VIEW_ROWS` makes this counting unit explicit.

## Completeness

`coverage` is `PARTIAL` when the returned task rows fall short of the exact query count, when the 3,000-row limit is reached without that count, or when the assignee lead lookup reaches its 500-ID limit. A limit boundary is conservative: PARTIAL means completeness was not established; it does not always prove another row exists.

When an assignee lead lookup is used, the helper cannot prove its completeness: that lookup has no exact total and can be capped by the server below 500. Therefore a short response cannot establish `EXACT`; it reports `UNKNOWN` unless a limit already makes it `PARTIAL`. An explicit `lead_id` bypasses that lookup.

Otherwise, a safe integer exact task query count equal to returned rows gives `EXACT`. Missing or inconsistent count metadata gives `UNKNOWN` except at the row limit.

`count_relation` is `eq` for EXACT, `gte` for PARTIAL and `unknown` for UNKNOWN: the relation describes the source total relative to the observed `total`.

`assignee_scope_complete` is `false` at the 500-ID limit and `null` otherwise (unverified or not applicable).

## Compatibility and remaining work

The meaning of `done` changes intentionally. Consumers needing the prior closed total must use `closed`; consumers showing task totals must respect `coverage` and `count_basis`. No caller outside this checkout has been validated. No production database performance or HTTP/UI test was performed.

This change does not alter view SQL, permissions, project relationships, deduplication, customer acceptance, or live data adapters. Those W0 findings remain separate.

## Offline regression

From the repository root, with Node.js installed:

```sh
node --test backend/tests/customer-journey-read-model.test.js backend/tests/unified-tasks-summary.test.js
```

The summary tests evaluate the real helper source using fake database responses and allow only two explicit fake application imports. They use synthetic data; they do not load the application, dotenv, database client or routes. The integration run additionally used Node permission restrictions, a network-denying preload and the previous acceptance/isolation harness outside the checkout.

## Rollback

Before merging, the existing founder-local worktree is unaffected. Discarding this isolated branch is sufficient to abandon the candidate. After integrating the change, revert its fix commit; rerun offline tests. No migration or data rollback is involved.
