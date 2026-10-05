# Facebook spend integration — candidate, 02/10/2026

## Objective and current boundary

Continue all four Founder objectives: customer/spend linkage, AI intake/handoff, decision dashboard, independent acceptance and Founder release package. This increment connects the spend source and its display. It does **not** complete canonical customer identity/qualification, the trial registry, regional allocation, survey calendar, AI delivery/takeover or live acceptance. Finance remains deferred. The target is 250,000 VND per qualified unique paid Lead; no measured CPQL is claimed yet.

Base: PR22 `38c71c15aa981d88653e65bb3432d01a1ed42db2`; source files verified by Git blob hashes. Main was re-read and source helper/AGENTS remained unchanged; new migration649 did not exist on main at inspection. Keep PR19 dependency and PR20 decisions. No production access, ad changes, customer messages or database migrations performed.

## Source and storage

- Existing `fbMarketingSync` invokes the new account-level reader only with `VPT_CERTIFIED_FACEBOOK_SPEND=1` (default off). It still performs the existing catalog/daily-ad synchronization. Pagination truncation, missing currency and malformed spend now fail rather than publishing apparent success, including with the flag off.
- Reads Meta account identity, VND currency and UTC+7 timezone. Retrieves all pages of daily account Insights and the whole-period account total, and requires exact reconciliation. Account-level spend includes ads that created no Lead. Complete empty reports can prove zero; a missing day in an incomplete response cannot.
- API/redirect/pagination errors remain sanitized. Only graph.facebook.com, the same version/account/path and header authorization are permitted. Tokens in pagination query strings are removed. Unknown or fractional VND values fail explicitly; validate actual platform precision before release.
- Report day boundaries use the account timezone (supported UTC+7 zones only). Current-day values are provisional; reads are not platform settlement. Daily/period responses changing between calls may cause UNKNOWN and require another sync.
- New migration649 records each run before reading, and atomically publishes validated daily totals only after completion. Latest means newest started run ID, never last finisher. New failures or interrupted runs supersede older success. No fallback to an older cheap number. Direct public/anon/authenticated/service_role table access is revoked; privileged RPCs validate company/account and are service-role only.
- New storage path refuses the shared router while failover is enabled or the active target is not primary. The enclosing sync also returns before legacy journal writes when that guard fails. This does not prove existing global DB controls; those remain release gates.

## Read path and UI

`GET /api/ad-analytics/marketing/spend-coverage?company_id=…&from=YYYY-MM-DD&to=YYYY-MM-DD` resolves company permission on the server. Only platform_admin is unrestricted. Company admins stay in their company; ecosystem/legacy global admins need an enforced tenant scope. Client coverage, account lists and permission flags are ignored.

The adapter reads **all configured accounts** for the company using an exact row count, including accounts that have been disabled; disabled/expired/missing/latest-incomplete accounts make the result UNKNOWN. Freshness is provisionally six hours, subject to operational acceptance. It never uses the Lead join to select spend. It refuses missing dates and does not sum overlapping snapshots. The result concerns configured Facebook accounts, **not all trial channels or a finalized trial account roster**; allocation/registry remains next work. Account ownership/history must be frozen/recorded by that registry before CPQL is enabled.

The existing dashboard has an aggregate Facebook spend card with period, source timestamp, configured-account scope and unknown reason. It explicitly does not apply the Page filter. Scope changes, errors and sync start hide old numbers; completion (including failure) refreshes the card. The 250k/Lead result remains unknown until the canonical CRM/trial adapter is ready. No mock figures are shipped in this UI.

Related legacy account status/test/config/sync endpoints are now company-scoped; account configuration uses verified company→tenant membership, insert or conditional owner update instead of an unscoped upsert. A company-scoped sync no longer launches the global analysis writer. Cron invocation remains trusted/global. This change requires account administration regression UAT.

## Verification and rollout

Local Node unit/integration/regression: see VALIDATION for current count. Includes the actual mounted route and existing sync helper with synthetic dependencies, missing tenant, wrong company, disabled feature, failover, malformed sources, all spend including no-Lead ads. Added real isolated PostgreSQL16 tests and a whole-frontend Vite build in CI. Their presence is not PASS: inspect the final head's job results. Browser verification uses only local synthetic data.

Before release: isolated PG/CI + independent review; trial start/account roster, canonical CRM dedup and qualification; operational region/recipient/calendar bindings; allowed staging source-to-recipient UAT and a manual Ads Manager spend comparison. Then Founder approves the concrete release package. No source evidence flag should be enabled merely because unit tests pass.

Rollback: disable the new evidence flag, stop affected new readers/writers, preserve all evidence runs and business records. Revert code only after reconciling active runs; never restore cross-company account access or erase spend history.

Reference: [Meta's account Insights example](https://www.postman.com/meta/facebook-marketing-api/request/u38qbri/get-insight-details-from-an-adaccount-l4) and [Meta Marketing API collection](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi). Official developer guide returned429 during inspection; exact real-account response/permissions remain unverified.
