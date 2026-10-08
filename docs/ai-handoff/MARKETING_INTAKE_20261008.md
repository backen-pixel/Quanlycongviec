# Marketing intake — prepared and locally tested, not released

Branch `codex/marketing-attribution-20261008`, baseline `ac8971fb`. Scope: marketing report follow-up dated 08/10/2026. No production writes, migration, backfill, merge, deployment, contact changes or sales-status changes performed. Draft PR publication is requested; see the final handoff for its URL and exact reviewed SHA.

## Evidence and boundaries

- Read AGENTS.md, CLAUDE.md, CURRENT.md, DECISIONS.md, WORKLOG.md and architecture index. No repository `.agents/skills` files found.
- Before the later instruction to stop production reads, read-only schema checks on primary qlycv `kdxypztstbeovyedmvem` confirmed `crm_leads` and `lead_attribution` columns/indexes. Both have RLS enabled, no policies, and grants only to `service_role` among anon/authenticated/service_role. This patch preserves those grants/RLS and uses invoker triggers; no public RPC or new security-definer function.
- A scoped, non-PII projection confirmed three VPT codes lack attribution and the two specified campaign strings occur in the relevant descriptions. No descriptions/contact details were exported. No `external_api_logs` query was performed. Stopped production reads after the cancellation update; subsequent verification uses synthetic local PostgreSQL only.
- Source traced: `POST /api/external/leads` and `/deals` resolve company from API key, preserve `source_id`, then insert `crm_leads`. Previously no structured attribution write. This establishes the repository writer, not the deployed website's actual request payload or release SHA.
- Existing enrichment could overwrite first-touch facts when `fb_ad_id` was NULL, and could not fill campaign when ad was already present. Corrected with a single atomic, complete-snapshot compare-and-set patch, immutable provenance, company checks, and campaign/click/ad identity guards. See the independent-review remediation below; the earlier per-field implementation was insufficient. Historical NULL-company rows are not automatically enriched by company-bound callers; reconcile them separately.

## Changes

- External API accepts optional `is_test` (strict boolean) and `attribution` (allowlisted object). Old requests remain valid; descriptions and Page names are never parsed into advertising evidence. IDs must be strings. Caller cannot inject company/lead/customer IDs, raw data or timestamps into the receipt.
- Migration 714 adds an immutable `crm_leads.intake_attribution` receipt, `is_test`, `assigned_at`, and platform-neutral campaign/ad/adset IDs plus gbraid/wbraid on `lead_attribution`. A trigger projects receipt to attribution in the same transaction as Lead insert. Facebook/Instagram IDs also populate existing Facebook columns; Google IDs never populate them. Failure of attribution insert aborts the Lead insert.
- Existing customer/source preparation precedes the Lead insert; this patch does not make the entire endpoint transaction atomic or introduce whole-request idempotency. Clients must not assume retrying POST cannot create a second Lead. Receipt uniqueness is enforced by the existing unique lead-attribution index.
- Excludes explicitly marked tests in adAnalytics, adInsights, partner lead/aggregate/conversion reads, MCP Ads aggregate/conversion reads, and the P1 trial cohort (without counting tests as unavailable CRM). Operational CRM lists remain available. This is not a retrofit of every ERP/KPI report, historical snapshot or contact-only touch count.
- Partner list/detail responses include source ID, generic campaign/ad IDs, all five UTM fields, click IDs and explicit milestones. Existing Facebook-specific aggregate/filter semantics are retained; no new Google campaign dashboard was built.

Example tracking fragment for the existing external endpoint (no PII):

```json
{
  "is_test": false,
  "attribution": {
    "kenh": "website",
    "platform": "google",
    "campaign_id": "23976669573",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "campaign-label",
    "gclid": "actual-click-value-if-present"
  }
}
```

Omit absent fields; never send the literal example click value. `landing_url` can supply UTM/click parameters; arbitrary query parameters are discarded and only origin/path is retained. Do not put PII in URL paths or tracking strings. Metadata is caller-supplied evidence, not independently verified ad-platform attribution.

## Milestone definitions (no sales redefinition)

| API milestone | Stored evidence | Limits |
|---|---|---|
| `received_at` | `crm_leads.created_at` | CRM receipt, not a unique person or historical ad click |
| `assigned_at` | New database-observed assignment timestamp | Current assignment after install; existing assignments remain NULL until changed; unassignment clears it |
| `contacted_at` | Existing `first_touch_time` | Exposes the legacy recorded field; this patch neither writes it nor proves a successful conversation |
| `closed_on` | Existing `actual_close_date` | Date, not inferred from deposits; NULL remains unknown |

Stage/type/funnel remain unchanged. `type=lead` is not unique customers or all intake. Existing value/revenue-labelled aggregates are not financial verification; no inference from `deposit_received` was added.

## Repair plan — not executed on production

`database/repairs/marketing_20261008.sql` is a psql script, default dry-run. Apply requires explicit `-v apply=true` after approval. Hard locks: tenant `7d42e731-895b-4ba8-99d6-0005c4e23544`, company VPT `991dc79d-cbf5-49f9-a364-35227cb47635`, and exactly three codes. Phúc Đạt `29677f68-967e-4256-92fd-492bb580e888` is not modified.

- 1441: mark test only after a TEST token evidence guard. This guard has not been confirmed against full production title/description; it deliberately stops for review if evidence differs.
- 1442/1443: insert reviewed Google campaign IDs 23976669573 / 24315831726 only if matching description evidence still exists and no attribution has appeared. Do not populate click IDs, ad IDs or UTMs from guesses.
- `cham_dau_luc` uses original CRM creation time with explicit provenance `touch_time_basis=crm_received_at`, `click_time_unknown=true`. Does not fabricate customer-contact or click time.
- Row locks, tenant recheck, private RLS journal, idempotent rerun. Original source/description/contact/status/first-touch fields are never assigned. Existing table triggers may maintain `updated_at`; the script does not claim byte-for-byte restoration of unrelated audit triggers.
- Paired rollback compares inserted attribution against its saved image and refuses drift before undoing anything. Restores prior test flag and deletes only this repair's inserted attribution. Concurrent changes to unrelated sales/contact fields are preserved. Empty journal remains for repeatability.

## Verification completed

Node v24.19.0 after review remediation: **136/136 tests passed** with the command below. All changed JavaScript passed `node --check`; `git diff --check` passed.

```sh
node --test backend/tests/externalLeadTracking.test.js backend/tests/externalLeadTracking.route.test.js backend/tests/leadAttribution.enrichment.test.js backend/tests/partnerMarketing.route.test.js backend/tests/marketingIntake.sql.test.js backend/tests/adAnalytics.correctness.test.js backend/tests/p1QualificationQueue.route.test.js backend/tests/p1QualificationSummary.route.test.js
```

SQL test runs PostgreSQL 16 in a disposable Docker container, network disabled, no published port or production credentials, using synthetic CRM and the actual existing attribution DDL. Tested: migration replay, service-role insertion, anon/authenticated denial, immutable receipt, downstream failure rollback, default dry-run, repeat apply, cross-company exclusion, wrong-tenant rejection, drift refusal, repeat rollback and receipt-preserving schema rollback. Container removed after test.

Route tests use mocked dependencies, not a live authenticated HTTP/Supabase server. Local checks used Node 24; Node 18/22 are covered by the prepared CI matrix, whose result must be read for the published SHA. Full staging schema/trigger interactions, deployed web payload, UI, load/performance and end-to-end website acceptance remain outstanding. Supabase changelog fetch was blocked (403/content-type); RLS docs were accessible. No Supabase CLI installed; numbered SQL preparation follows repository convention, not a claimed CLI-generated migration history entry.

## Release decisions and rollback

1. Review diff, schema and contract; verify on a full-schema staging copy with synthetic data and real service-role/PostgREST/API auth. In particular check existing assignment triggers, company transfer, copying test records into new records, customer preparation side effects and report caches/snapshots.
2. Install the prepared WordPress core update only after backend acceptance, then exercise successful/missing attribution and failed transactions. No data-only fix can repair future senders that continue putting campaign IDs solely in descriptions.
3. Obtain approval for production migration 714, then backend release, followed by the reviewed repair dry-run/apply. Migration must precede backend changes; no missing-column fallback that silently re-includes tests. New metadata remains inactive on production until this release.
4. Reconcile the exact repair preview and TEST evidence before apply; verify report deltas and unchanged contact/sales fields afterwards. Publishing a branch, if wanted, must use a draft PR and must not trigger deployment.
5. Roll back backend first, then use 714 rollback to remove new triggers/functions while retaining all columns/receipts/flags. Rollback loses new tracking enforcement; old reports may count tests again, so pause affected reporting until corrected. Repair rollback is separate and drift-guarded. Do not drop populated columns or delete originals.

Remaining: no automatic historical campaign enrichment across all Facebook leads, no blanket test-name classifier, no new frontend controls, no deduplication/financial redefinition, no production acceptance claim.

## Follow-up: website integration and draft PR

Repository inspection found `integrations/wordpress/vpt-v1-crm-bridge/` (CF7 form 11116). Existing `core.php` collected UTM/gclid/gbraid/wbraid/campaignid/adgroupid into notes only. This patch now also sends structured attribution and `is_test` derived from the existing admin-gated test mode. It preserves the source selector, descriptions/notes, owner/pipeline/region, business fingerprint, live/test guards and uncertain-response/no-retry policy. The WordPress entrypoint, JavaScript capture, settings, API key and deployed site were not changed. Queued jobs hold old serialized payloads and are not replayed. Capture of a new ad_id/fbclid absent from this bridge remains outside this patch.

Added `.github/workflows/marketing-intake.yml`: PR-only, read-only repository permission, Node 18/22, disposable local PostgreSQL, pure PHP mapping; no secrets, deployment steps or production URLs invoked. Existing report workflow also applies. Render source configs contain backend/frontend deployment descriptions but do not establish an isolated WordPress/CRM staging target; none was contacted.

Local test groups on final source (some P1 summary tests import queue tests, so totals include inherited cases):

| Group | Passed | Evidence |
|---|---:|---|
| Input normalization | 5/5 | `externalLeadTracking.test.js` |
| Actual external handler with mocks | 2/2 | `externalLeadTracking.route.test.js` |
| First-touch enrichment/races | 12/12 | `leadAttribution.enrichment.test.js` |
| Partner metadata/scope | 2/2 | `partnerMarketing.route.test.js` |
| PostgreSQL scenario and concurrency subtests | 9/9 | `marketingIntake.sql.test.js`, assertions include apply/replay/permissions/rollback |
| Report handler correctness | 76/76 | `adAnalytics.correctness.test.js` |
| P1 queue | 10/10 | `p1QualificationQueue.route.test.js` |
| P1 summary including inherited queue tests | 20/20 | `p1QualificationSummary.route.test.js` |
| Existing report CI command, includes the 76 above | 131/131 | correctness + UI state + action lifecycle suites |
| WordPress differential/contract | 14/14 | `tests/test_core.py`, includes pure PHP-to-Node request normalization |

The SQL harness initially raced PostgreSQL's temporary initialization socket during rerun; fixed readiness to wait for the final TCP listener inside the network-disabled container, then passed. PHP bridge validation found the missing explicit direct-platform value; fixed it and reran the entire differential suite. Neither failure involved production.

Security details: existing CRM/attribution table RLS/grants unchanged. New trigger functions explicitly revoke EXECUTE from PUBLIC/anon/authenticated; they are SECURITY INVOKER. Approved repair apply creates a private journal schema/table, enables RLS and revokes PUBLIC/anon/authenticated privileges. Default dry-run does not create that journal. Migration does not grant any new role access. Rollback removes new triggers/functions but keeps populated columns/receipts; journal repair rollback rejects drift. General ERP/KPI reports, contact-only counts and old snapshots still require separate coverage decisions.

## Independent-review P2 remediation (after c38febe3)

Reproduced both review findings on `c38febe3b536a9c5f5bd130f902e81ddba235370` without production access: four conflicting-click variants and two campaign-only concurrency variants failed (**6 failures; 5 existing tests passed**). The old helper retained first IDs but could fill other nullable fields from a losing/later touch, and returned success when conditional writes affected zero rows.

Root fix in `leadAttribution.js`: read all enrichment fields in one snapshot; reject conflicting gclid/fbclid/gbraid/wbraid, ad/campaign/form/leadgen identities and landing URL; construct only missing fields; write the entire patch in one SQL UPDATE guarded by the complete snapshot (including NULLs and company). `.select('id').maybeSingle()` distinguishes an applied write from zero affected rows. On a lost comparison, re-read and revalidate identities before a bounded retry (maximum three UPDATE attempts); contention exhaustion returns `ok:false, skipped:xung_dot_dong_thoi`. No identity/provenance or first-touch timestamp is overwritten. No new RPC, migration, privilege or production operation was added.

The PostgreSQL fixture executes the actual JS helper with a narrow Supabase-shaped adapter against separate asynchronous psql sessions in the existing network-disabled PostgreSQL 16 container, under service_role. A barrier ensures both initial SELECT snapshots finish before either UPDATE. It checks all four click conflicts, competing Facebook/generic campaign-only writes, competing gclid-only writes, and safe same-click retry/idempotency. Losing requests must return a conflict and must not donate a campaign name/keyword. Raw provenance and first-touch time remain unchanged. This exercises PostgreSQL's real conditional UPDATE semantics, not a database mutation mock; it does not claim HTTP/PostgREST or full deployment acceptance.

Local results after remediation: **136/136** Node cases (12 helper tests; PostgreSQL parent plus 8 subtests; unchanged other groups). Added a workflow path for the PostgreSQL fixture so changes cannot silently skip CI. `node --check` and `git diff --check` passed. The published SHA/CI results are recorded in PR #72; independent re-review and the original full staging/release gates remain required. Rollback of this remediation is a code revert; the original migration/backfill rollback remains separate and unchanged.
