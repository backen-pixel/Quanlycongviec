# Facebook legacy source reconciliation

2026-10-02; baseline PR22 `8394ed15c45c303dd1be30721f154912fee4dce9`. Risk HIGH: company scope, customer identity, provider credentials and measurement. Implementation and synthetic validation PASS at runtime0d41/test2d90; [exact evidence](FACEBOOK_LEGACY_RECONCILIATION_REVIEW.md). Not a release decision.

## Operator result

The intake console can review a receipt stopped by `LEGACY_RECONCILIATION_REQUIRED`. When the old Facebook Lead Ads and contact rows point to the same existing Lead and Customer, the server reads the Lead/form/ad directly from Meta, validates Page/account scope and compares contact against the current linked CRM. An administrator sees the exact proposed CRM target, matching field types, paid/organic/unknown source, acquisition time and expiry. Confirmation with a reason attaches source evidence and completes the receipt, keeping CRM IDs, history, assignment, pipeline and identity unchanged.

This is an exception workflow. It never searches for a target by phone, automatically merges people, qualifies a customer, or turns an old customer into a newly acquired one. No raw provider contact or credential is returned by the preview. A historical mapping by itself is not sufficient evidence.

## Service and storage contract

- Authenticated parent route: `/api/facebook/lead-intake`.
- `POST /legacy/preview`: companyId, receiptId and exact receipt expectedVersion only. The actor comes from server authentication. Client proof, target and match claims are rejected.
- Server calls `marketing_fb_legacy_context`, then existing `readVerifiedLead` outside any database transaction. `matchingFields` uses the CRM identity normalizers: every overlapping contact must agree, malformed contact is refused and at least one valid field must overlap.
- `marketing_fb_legacy_prepare` rechecks the context after the network fetch, validates source identifiers/account/time and stores an immutable private proposal. Only the trusted application server can call these RPCs. Provider proof and computed contact match fields share the existing intake service-role trust boundary; public/authenticated database roles cannot invoke them.
- Proposal expiry is at most five minutes and no later than five minutes after the provider fetch. Legacy row transaction versions catch edits that return to their old values; current CRM qualification source generations catch CRM/contact/assignment changes. This is a short-lived concurrency token, not a permanent PostgreSQL row identity.
- `POST /legacy/commit`: companyId, requestId and command {proposalId, reason}. Database rechecks fresh actor/company/tenant, Page/account/binding and CRM routing, allowed Page list, exact target/version and expiry after locks and writes. Proof, receipt completion and audit commit together. Same request/actor/company/payload returns the recorded acknowledgement; another payload cannot reuse the key. Replays still require current administration rights.
- Migration658 adds private proposals/events and three service RPCs. Context temporarily borrows the existing intake routing validator within its transaction and restores the receipt before return; it does not enqueue a new worker job. CRM qualification version enrollment may occur, but no business entity is edited by review.
- `VPT_FB_LEAD_INTAKE_ADMIN=1`, `VPT_FB_LEGACY_REVIEW=1`, primary database ownership and configured `VPT_FB_LEAD_INTAKE_PAGES` are required. Default off. Existing generic recovery still refuses legacy rows.

## Limits and remaining full-goal work

Only complete, agreeing historical mappings are adoptable here. Missing mappings, missing receipts, deleted/moved entities, unmatchable contacts and unavailable provider records remain exceptions. They require further inventory/disposition, not recreation or a guessed attribution. Enumeration is still a subset of provider history, and neither this flow nor a completed receipt establishes full Page/account/entrypoint/retention coverage. Actual CPQL stays unavailable until complete source/spend cohort evidence is established. AI care, survey/calendar, operational acceptance and other channels remain unfinished.

## Verification and rollback

Local contact/HTTP tests; isolated PostgreSQL rights, scope, concurrency, rollback, replay, expiry and preserved-history tests; whole frontend build; synthetic browser and independent review are required before claiming this increment verified. Exact results are recorded separately when available. No synthetic check substitutes for live account/schema/backup/restore acceptance.

Disable `VPT_FB_LEGACY_REVIEW` to stop new previews/confirmations. Preserve completed source evidence and audit; do not delete transactions or reopen old public writes. Migration/flags on real environments, production release and the 30-day trial still need the Founder release package and decision.
