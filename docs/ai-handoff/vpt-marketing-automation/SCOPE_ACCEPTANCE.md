# Accepted Facebook measurement scope

Status: implementation under isolated verification; no live data, activation, release or observed business attainment. Baseline: one-time 100m/30-day cap; interim 250,000 VND per unique qualified paid Lead. The full Marketing–Sales goal remains active.

## Behavior

`GET/POST /crm/marketing-trials/:trialId/scope-acceptance?company_id=...` is authenticated, current-authority, primary-only and default-off (`VPT_MARKETING_SCOPE_ACCEPTANCE=1` plus `VPT_MARKETING_TRIAL_REPORT=1` only in the approved environment). SQL677 follows 676; never edit or replay old live migrations to introduce this feature.

The operator supplies an evidence artifact (1 byte–1 MiB), its reference and explanation, three explicit provenance claims, and **all historical destination sets** per account/ad/time interval. UI uses Vietnam time and supports successive intervals. Nothing preselects a destination or attestation. API hashes actual bytes; the private append stores those bytes with the exact command. Public receipts expose hashes/sizes, not the artifact, free text, customer contacts or raw source inventory. Do not attach secrets or unnecessary contact data.

The server derives amounts/counts. It requires current registry/routing, current whole-account spend (including accounts/ads with no customers), stable delivery evidence including zero-spend signals, traversed and reconciled source IDs, current source-file reconciliation and no unresolved customer/qualification gaps. Each delivered ad/day needs continuous nonoverlapping destination history; each paid proof must match account/ad/adset/campaign/Page/form at acquisition. Every required source export binds the exact request, original-file hash, normalized tuple digest, period, census/page witness and current authority. An empty export is accepted only when the same provenance is attested and no discrepancy exists; no qualified customer gives null CPQL, not zero or a target pass.

The result is `QUALIFIED_SCOPE_CPQL` based on `OPERATOR_ACCEPTED_PROVENANCE_AND_SERVER_RECONCILIATION`. It may say the 250k threshold is met **in this accepted scope**. It does not certify the whole provider universe or all channels, and never grants budget execution. Website/Messenger/other unsupported destinations remain explicit gaps; cannot be silently dropped. A statement of no lead source is not sufficient without the same account/ad historical evidence and operator attestation.

## Consistency and history

SQL uses a stable snapshot for facts, latest exports/results and delivery. The fingerprint includes trial, identity, qualification, all account spend, sources, registry, exports, delivery and closed-day/freshness gates. The private acceptance stream serializes per company/trial using expected revision; request replay checks current authority and exact actor/company/trial/command before returning immutable history. Recheck strict authority after acquiring legacy helper locks, including `is_active=NULL` changes while waiting.

Before/after append context comparison catches late changes and rolls back report/artifact together. ACCEPT versus REVOKE races permit only one command at the expected revision. REVOKE references the latest ACCEPT and works even when source computation fails. Replaying an old ACCEPT after REVOKE returns history only, never reactivates it. UI clears current values on reload/write/error, scopes state to actor/company/trial and stores only exact pending command plus file hash/size; reloading requires reselecting the same file for an uncertain ACCEPT. Historical receipts are labelled history.

## Verification and rollback

New domain/service/UI-state tests cover 1m/4, zero-lead spend, zero-spend delivery, intraday intervals, contradictory metadata, incomplete/empty/filtered exports, qualification, receipt privacy, default-off/failover, replay and Vietnam time. PostgreSQL cases run through real collector/intake/qualification/registry/parser/service functions, current rights, exact retries, competing decisions, late receipts, source outage, expiry and authority changes while waiting.

Local at initial candidate: 24 new tests / 63 new+related PASS. PostgreSQL, frontend build, synthetic browser and final independent review pending. Later review record must cite the tested head/tree; these local numbers do not prove production readiness.

Rollback: keep/turn the new flag off and keep all acceptance/revocation/artifact evidence. Existing observed reports remain available. Do not delete accepted history, enable money movement, restore revoked permissions or run a live migration as rollback. Founder release package still requires real source provenance/configuration, successful operational UAT, restore/performance checks and the exact deployed revision.

Next toward the full goal: finish other declared entrypoints; join survey/pending operations with the measured cohort; complete AI/calendar/exception operating setup; end-to-end UAT and Founder release. Pending model credential decisions are not resolved by this work.
