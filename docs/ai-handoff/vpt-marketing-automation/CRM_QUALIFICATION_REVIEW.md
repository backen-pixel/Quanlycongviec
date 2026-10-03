# CRM qualification review and evidence — 2026-10-02

Scope: confirmation/exception path inside CRM, not the complete Marketing–Sales goal. Base ec53daf; implementation46155bc; reviewed follow-up **7079b26690adb54fc99c6921703d3a473da61040**. Thirteen changed/new files were verified by Git blob hashes before publication to draft PR22.

## Independent review

Separate read-only reviewer `architecture_v11_review` inspected the CRM/auth/schema source and candidate. Independently reran35 service/router tests: PASS. Initial CHANGES_REQUESTED had three P2 findings, all fixed:

1. Editing Customer fields without updating Lead left the UI qualification unchanged. The mount revision now includes current Customer and Lead fields, so the panel is remounted.
2. Recipient tenant changes were missing from readiness and source invalidation. Current recipient/company tenant must match; user tenant changes increment protected source revision. Both null is a documented legacy same-company case; only one missing fails closed.
3. Cached tenant suspension could allow a write. RPC now locks/checks the current tenant row before reads, new records and retries.

Final reviewer verdict: **PASS for this increment**, no remaining finding. Reviewer verified SQL74703a19ef65a02e08569c486170774aaef75dec, PG testsb6a62ec043163a2657668f942c449a38dd0bc6df and LeadDetail37df04b5e059eeacbffc0813da7758685de3b325 against GitHub7079b266. Reviewer read the PG log and CI state; did not execute browser or PostgreSQL locally. No operational/release approval is implied.

## Automated evidence

[Automation run36987988029](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36987988029) and [report run36987987978](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36987987978): SUCCESS.

Actions checked out PR merge ref369436b227b104f88bef80d383e78e92e6b8c490, merging head7079b266 into basee16c885; do not call it a direct head checkout.

- Node18/22 domain/router/regression suites:256 PASS/0FAIL/0SKIP; Node22 log job110777296871 read.
- Fresh isolated PostgreSQL16 CRM qualification job110777296958:20 scenarios plus parent =21 PASS/0FAIL/0SKIP. ACL, duplicate commands, concurrent decisions, Customer changes/A→B→A, stale forms, region and recipient tenant/membership, actor/tenant revocation, CRM write concurrency, rollback, evidence survival after Lead deletion. The fixture does not prove full production schema compatibility or live RLS behavior.
- Existing command and spend PostgreSQL jobs: SUCCESS.
- Whole frontend Vite build job110777296981:10,298 modules,38.44s. No production preparation/deployment scripts run.

## Supported browser evidence (root, synthetic only)

Actual `LeadQualityCard` bundled with fake API only; loopback127.0.0.1:4184, CSP `connect-src 'none'`. Supported browser9; no credentials/CRM/ad access. Verified:

- Customer revision change moves QUALIFIED to PENDING/needs recheck and clears checked facts.
- Pending save hides old status; delayed result for A after switching to B does not overwrite B.
- Returning to A shows its own saved evidence.
- Source read failure clears old status; recovery reloads the current record.
- Failed/uncertain save clears old status and asks to reload before acting again.

Screenshot of source failure inspected. Component behavior with a synthetic wrapper was exercised, not full authenticated LeadDetail or mobile visual acceptance. The real LeadDetail mount was code-reviewed and included in full-app build. Temporary browser closed and local server stopped afterward.

## Release remains HOLD

Default-off, no real migration/flags, no merge/deploy/customer send or ad change. Additive source-revision triggers need staging lock/latency/schema review. Cross-channel identity, verified paid source, trial/account scope, AI extraction/delegation, live receiver/calendar bindings and operational dashboard remain unfinished. Founder live acceptance/release package still required; Finance is deferred.
