# PR19 browser verification and independent agent review — 2026-10-01

## Result and exact scope
**Independent agent: APPROVE the functional PR19 candidate. Operational acceptance: HOLD. No release authorization.**

Compared PR base `0db11ce1adb0fb89fc87529036e495a62d58fce7` with candidate backend/UI. Original reviewed PR head: `1d2520d2286423269adc50104185fe3cbe10bc04`. Approved production blobs:
- backend/src/routes/adAnalytics.js: `fb2767c1e19abc5f3390720f11d5120eed7905e7`
- frontend/src/pages/AdAnalyticsPage.jsx: `565f8990b3ef599f551398ec0e342239529c7d13`

Founder explicitly authorized local mock-only browser verification and a separate read-only reviewer agent. Reviewer was a separate agent in the same Codex task, not a human reviewer or GitHub APPROVED review. It inspected source/diffs/test evidence and independently reran tests; it inspected saved browser evidence but did not run its own browser session.

## Finding resolved by this follow-up
P1: an ad-name save started for company A can finish after the user selects B. The old closure then starts a new A report request; request-generation checks treat that request as current. The UI can show A's metrics below B's selected filter.

The fix registers the latest mounted report loader in `refreshReportRef`, clears it on effect cleanup, and uses it from single/bulk name-save, reanalysis and marketing-completion callbacks. The existing request-generation guard remains. The follow-up does not alter backend business rules.

## Validation
- Original 41 tests: 41 PASS.
- New 12 lifecycle cases on original head: 4 PASS / 8 FAIL (four delayed filter-change failures and four post-unmount refresh failures).
- Candidate integrated suite: 53 PASS / 0 FAIL; separate reviewer reran 41 existing + 12 lifecycle tests successfully.
- CI updated to include the new test on Node 18 and 22; published commit CI must be read back.
- Source blobs compared with GitHub; JSX compiled into the local browser fixture.
- Actual React StrictMode UI with a synthetic in-memory API: original B filter showed A/11 after delayed save; candidate remained B/22.
- Browser candidate: simulated `crm_leads` read failure displayed UNKNOWN/unverified and removed old figures; reload recovered B/22; empty result displayed no data.
- Requested viewports 1440/768/375 px (document widths 1434/762/369 due scrollbar): no horizontal page overflow observed; wide table scroll remained inside its container.

Run isolated tests from repository root:

```sh
node --test --test-reporter=tap backend/tests/adAnalytics.correctness.test.js backend/tests/adAnalytics.ui-state.test.js backend/tests/adAnalytics.action-lifecycle.test.js
```

The added lifecycle harness executes the actual effect and action callback bodies with controlled completions. It is not a replacement for React scheduling or whole-app E2E. Company-switch and unmount are covered in VM for all four paths; only single-save/company-switch was reproduced in browser. Marketing test starts at `onXong`, not the full child mutation.

## Independent review observations
No newly introduced blocking finding in the scoped production delta:
- Lead, quality, Deal, closed count and revenue are deduplicated together inside each group.
- Page paid-Lead tracking occurs before dedup, preserving organic-first/paid-later behavior.
- Campaign keys prefer actual ID and separate ID/manual-name/ad namespaces.
- Required CRM Lead read failures are sanitized to 503/UNKNOWN; upstream details are not exposed.
- Authentication middleware and company-scope intersection are unchanged.
- UI publishes only a current completed report, clears outdated figures and uses stable campaign IDs.

Pre-existing limitations are not solved by this PR: capped/unpaginated reads and fallback-to-empty ancillary reads for quality scores/catalog/Page/spend. The guarantee is specifically for required `crm_leads` reads, not every report data source.

## Evidence and remaining gate
Screenshots, DOM snapshots, source-integrity hashes, full TAP outputs and the local mock fixture are preserved in the Founder Control Center workspace under `work/PR19-review/`; they are not contained in this GitHub document. The fixture serves loopback only with CSP `connect-src 'none'` and does not bundle the production API client.

No full application build/login/permission integration, physical mobile device test, official visual baseline comparison, comprehensive accessibility or real CRM E2E was completed. Company/Page combobox accessible names require a separate accessibility follow-up.

Real Facebook → canonical CRM → active Sales Admin → report reconciliation remains HOLD. Need an allowed environment, sample receipt/Lead ID and intended recipient; do not infer successful handoff merely from a Lead's existence. Historical CRM config-read block was not retried through another route. No production activation, merge, deploy, messages, ads/budget, customer/recipient or configuration changes.

Rollback: revert the follow-up commit only; preserve customer data, attribution and prior history.
