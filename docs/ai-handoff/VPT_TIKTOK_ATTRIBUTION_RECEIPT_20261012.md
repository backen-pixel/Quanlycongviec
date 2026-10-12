# VPT — TikTok attribution receipt (12/10/2026)

Status: prepared for draft PR; not deployed. Base main `0378112a5900b36d3bf820b7a57aef811424fdd7` includes PR107 and plugin0.3.3 from PR109. The existing open PR inventory had no matching attribution fix. Founder requested continuing the multichannel work; this package only repairs measurement. No budgets, OA routing, advertisements or customer records are changed.

## Problem and resulting behavior

PR107 classified all `platform=tiktok` visits without a medium as paid. Organic links can also have that platform, so paid CPL could include organic customers. The plugin collected `ttclid` but form intake kept it only in free-text notes; click intake discarded it after deriving a platform.

- TikTok Ads requires a nonempty structured `ttclid` or TikTok plus an explicit paid medium. A bare TikTok platform remains “Trực tiếp / khác”; no historical paid status is guessed from notes or names.
- A receipt containing both a Google click ID (gclid/gbraid/wbraid) and ttclid is classified as “Trực tiếp / khác” because it cannot identify one paid source. Both original IDs and source tags are retained; no source field is overwritten to make the classification fit. Existing single-provider Google behavior is unchanged.
- `ttclid` is bounded to512 characters, accepted by form and click contracts, projected atomically from the immutable CRM receipt to `lead_attribution`, stored on `web_conversion_events`, and selected by the report.
- The first-touch helper includes TikTok click ID in its whole-snapshot identity guard. A later different TikTok click cannot donate a campaign or keyword to the original touch.
- Plugin0.3.4 preserves0.3.3's upsell box. Its scoped hidden-input fallback covers existing VPT_V1 CF7 templates that lack `[hidden ttclid]`; the documented template also includes that field. New campaigns replace the attribution bundle; the30-minute TTL remains.
- Existing UTM source/medium and test flags are retained. `utm_source=vpt_test` and explicit test leads remain excluded from production counts even when they carry a TikTok ID. Do not put two utm_source parameters in a QA URL or expect excluded QA to increase a production KPI.
- Website clicks remain events, separate from form leads and valid leads. This does not implement OA paid/organic attribution, unify native Facebook forms with website reporting, or turn website events into unique customers.

## Files and dependencies

Runtime: `externalLeadTracking.js`, `webClickEvent.js`, `parseLandingUrl.js`, `leadAttribution.js`, `marketingAutomation/webConversions.js`; WordPress bridge entrypoint, JS, PHP core and hidden-field template. No production package dependency was added.

Candidate migration `database/722_tiktok_attribution_receipt.sql` extends717/718. It adds nullable text columns and bounded-ID checks, replaces the existing717 guard/projection with an allowlisted extension, and preserves SECURITY INVOKER, function ACLs, RLS and trigger identity. It performs no backfill. Created via `supabase migration new` then numbered for this repository's established database/NNN convention. No old migration is edited.

## Validation performed locally

- Node v24.19.0:38/38 focused backend tests passed (form parsing/route, click route, channel/report, UI helper, first-touch identity and concurrent mock writes). Route testing now isolates production config so imports cannot start DB health checks. Report fakes honor selected fields so a missing ttclid SELECT is detectable.
- WordPress JS:25/25 passed, including hidden field, paid/organic/QA, new touch replacement and TTL.
- PHP8.3:22/22 core/real-Node-contract checks passed; `php -n -l` passed for core and plugin entrypoint. PHP was extracted into scratch only, not installed on a user server.
- Actual PostgreSQL17.5 engine via PGlite0.3.14 WASM: candidate migration and rollback passed, including replay, legacy receipt compatibility, structured-ID roundtrip, size/scope rejection, immutable receipts, downstream failure rolling back the lead insert, duplicate click protection, role/ACL denial and preserving stored evidence on rollback.
- `git diff --check` and changed runtime JS syntax checks passed.
- Docker is unavailable locally. The existing PostgreSQL16 multi-session enrichment fixture was extended with ttclid, but not run locally. The scoped GitHub workflow runs it plus the new SQL fixture in isolated Docker and runs website route/WordPress tests on Node18/22. CI results must be read separately; they are not claimed here.

SQL fallback command (test dependency supplied outside the repository):

```sh
NODE_PATH=<temporary-test-node_modules> VPT_SQL_TEST_ENGINE=pglite node --test backend/tests/tiktokAttribution.sql.test.js
```

Docker command: `node --test backend/tests/tiktokAttribution.sql.test.js backend/tests/marketingIntake.sql.test.js`.

## Release order and remaining acceptance

1. Review the draft, independent findings and CI at the proposed head. Recheck main and the full migration filename/hash before assigning722 in production; multiple agents work on this repo.
2. Apply722 to isolated staging first, then only through an approved production release. Apply schema before backend: otherwise ttclid SELECT/INSERT and the old717 allowlist cannot accept the new contract.
3. Deploy backend after schema; old plugin payloads remain valid. Deploy plugin0.3.4 last, clear its cache, and verify the active CF7 form/receipt path rather than only source code.
4. Keep QA exclusion and raw source separate. Use synthetic staging data for paid channel counts; live diagnostic records must remain excluded from production KPIs. Never use a real customer merely to satisfy a test.
5. Independently verify the authorized runtime version, configured company and actual source-to-CRM receipt. Repository/CI evidence does not prove a WordPress install or CRM operational acceptance.

## Rollback without erasing evidence

Rollback is a separately controlled release. Preserve the WordPress outbox and immutable CRM receipts; never purge queued jobs or erase click IDs. Drain or explicitly reconcile queued payloads carrying ttclid before downgrading their accepting backend. Revert plugin/backend writers/readers before restoring the717 guard/projection with722 rollback. Nullable ttclid columns and all values intentionally remain. Restored717 rejects future ttclid receipts, so SQL rollback must not race new writers or queued new-format retries. Existing legacy inserts continue to work, and existing ttclid receipts remain immutable. No rollback was executed against production.
