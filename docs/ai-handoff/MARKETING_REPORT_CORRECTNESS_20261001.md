# Marketing report correctness — implementation evidence

Date: 2026-10-01. Issue #18. State: review candidate, not production acceptance.

## Reproduction and changes

Source inspected: bb6f1f26a66905de7701947c0b03c82c41343061. Existing reporting implementation counts attribution rows instead of distinct CRM lead IDs, swallows CRM errors as empty rows, and groups distinct campaigns by equal names. UI retained previous numbers after a failed refresh.

This patch changes the existing summary/ads/campaigns/pages routes and their current UI only. A Set per output group deduplicates Lead, Deal and order-value increments, with a separate unique paid-Lead set for pages. Campaign ID is the primary grouping key; legacy manual grouping stays when IDs are absent. Required CRM data rejects read errors, promise rejection and malformed result shapes with fixed 503/UNKNOWN output. The four reporting route catches no longer expose/log raw upstream error messages. A UI fetch failure clears prior metrics/rows/insights and displays unavailable instead of a zero-lead conclusion.

## Reproducible checks

- Candidate: node --test --test-reporter=tap backend/tests/adAnalytics.correctness.test.js -> 31 PASS, 0 FAIL, 0 skipped (Node 24.19.0).
- Baseline: set AD_ANALYTICS_REGRESSION_BASELINE=1 for that same test command -> 9 PASS, 22 FAIL, 0 skipped. It reads the pinned Git blob locally, with no network request.
- node --check backend/src/routes/adAnalytics.js and test file -> PASS.
- git diff --check -> PASS before commit.
- Existing shared CURRENT/WORKLOG bytes remain preserved after the new prefix.
- New read-only PR workflow targets Node 18/22, has no app secrets, package install, app startup, live database, advertising call or deploy step. CI status is not asserted until its exact-head result is read.

## Boundaries / remaining gates

Author-run regression checks, not an independent reviewer or full application integration test. Auth is mocked in tests; existing runtime permissions are not expanded. UI test executes the real loading callback in VM and checks the unavailable branch; no browser/React render or JSX compilation performed locally (parser absent). This is one-Lead-per-group counting, not unique people deduplication or a verified paid-click attribution model; groups can overlap. Existing estimated-order-value semantics are unchanged and are not cash received. Optional enrichment failures, report caps/pagination, date/timezone boundaries, spend on ads without linked leads and the separate cached insights calculations still require their own verification. No claim of end-to-end complete marketing or production readiness follows from this patch.

No SQL/config/assignment/advertising/production changes. A separate live configuration query was blocked; no reroute or retry to bypass that block occurred. Rollback is a revert of this isolated code/docs commit only; no customer, receipt or attribution data is deleted.
