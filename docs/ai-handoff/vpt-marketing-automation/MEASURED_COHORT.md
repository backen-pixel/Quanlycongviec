# Measured cohort and dashboard integration

Base PR22 `0a106ab09b3c17879a0a64fa82baf51a03c56575`, 2026-10-02. Risk HIGH: company scope, account costs and customer counts. This increment implements measurement configuration and an actual database report from649–654, with a dashboard. It does not complete provider coverage, open a trial or authorize spending. The full Marketing–Sales goal remains active.

## Current implementation

Additive655 stores a named30-day period with whole local days in Asia/Ho_Chi_Minh and every configured Facebook account, including disabled accounts. Versioned changes and idempotent requests have audit. A global trial-ID lock plus company lock prevents simultaneous cross-company creation from overwriting another company's record. These records are measurement configuration only; another period never authorizes another100m budget. There is no activation, campaign filter, custom spend allowance or coverage-complete input.

Authenticated CRM endpoints `/marketing-trials` (list/configure) and `/marketing-trials/:trialId/report` derive the actor from authentication and check current company/tenant/admin rights in PostgreSQL. Default-off `VPT_MARKETING_TRIAL_REPORT=1`, primary only. Tables and pure helper functions are private. Browser receives counts and metadata, not raw contacts, provider proof or tokens. Scope errors clear previous data.

The report reads trial, account roster, latest spend runs, receipts, full source history, current qualification and company identity inventory in one SQL statement. Stable helpers share that statement's MVCC snapshot. Unlike650's interactive quality read, they never enroll source-version rows. Fingerprint/inventory expressions match650/654; integration tests check parity and a concurrent qualification change. No existing migration is edited.

Account changes, disabled/moved accounts, missing days or a latest failed run keep spend unknown. An account without customers still contributes all its cost. Account/day is counted once from its latest whole-account run. Current-day cost remains provisional; future trial dates do not create zero spend.

Sources are considered across the entire identity group and history before applying the period. Provider `acquired_at` determines acquisition time; late delivery does not move it. A current cohort uses the earliest proven acquisition Lead for qualification, not the min-UUID group ID. Equal-time sources on different Leads remain ambiguous. The earliest known Lead creation, first touch and Customer creation establishes prior existence; missing history is unresolved. Current valid qualification on the acquisition Lead determines its status, and contradictory valid group decisions remain pending. A current REJECTED does not require ready routing. Stale evidence remains pending. Historical receipt/source evidence is retained even if a Lead is deleted/moved or detached.

## What the dashboard means

It shows verified spend and **observed** customer groups: qualified, pending, rejected, existing, organic, unknown source and unresolved, plus receipts awaiting processing/reconciliation. It identifies the saved period separately from the Page/date filters on the older report. Calendar remains explicitly not connected.

Provider census/reconciliation has not been connected. Webhook receipts are not proof of exhaustive Facebook delivery. Accordingly CPQL is `null`, target attainment is false and observed counts are clearly labeled incomplete. Caller fields cannot change that. This is a delivery step toward a complete report, not the final goal. The next increment must connect provider enumeration, pagination/watermarks, receipt disposition and coverage evidence, then exercise the full positive path (for example1m spend/4 qualified=250k) before publishing CPQL. Full multi-channel coverage must also distinguish each channel's readiness; Facebook scope does not prove the entire plan complete.

## Validation and release

Local25 domain/service cases PASS at initial entry. PostgreSQL suite applies649–655 twice on an isolated fixture and tests rights, cross-company race, all-account spend, read-only/parity, prior customer history, stale/rejected quality, consistent concurrent reads and retained source. Full build, browser and final independent review are pending at this initial entry. Record exact versions/results in MEASURED_COHORT_REVIEW.md before claiming acceptance. Fixtures do not replace real schema, role, account, provider or Sales UAT.

Before release: verify current schema and migration numbering, volume/performance and backup/restore; resolve trial dates/accounts, provider permissions/coverage, history exceptions and actual survey roster. Then prepare Founder release approval. Disable the new report flag to stop these API/UI paths; preserve configuration, audit and original source evidence. No rollback deletes accepted records or opens unsafe access. Existing Facebook intake pause/cutover requirements remain applicable.

Provider research for the next census step: Meta's official [LeadgenForm SDK](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/leadgenform.py) exposes a leads edge, and [Page SDK](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py) exposes form enumeration. SDK method existence does not establish actual App permissions, retention or complete historical coverage; those are unresolved adapter/UAT requirements.
