# VPT Messenger candidate — 29 September 2026

Issue: https://github.com/backen-pixel/Quanlycongviec/issues/7

State: local review candidate; **40/40 local tests pass**. No production writes, ad activation, remote commit/PR or deployment. Baseline main pinned to `413e8f575b5b611b25a50980564d754b7bfcf211`.

## What is proven

Main has no `lead_attribution` or `fb_ad_id` writer (repository search plus full tree/source review). Current facebook.js returns 200 before persistence, stores attachment-only message metadata, and skips duplicate messages before incomplete Lead creation/linking can recover. Runtime attribution records supplied by root are not proof of this code path; seven ad rows share a backfill-like timestamp.

This candidate opts in only the reviewed VPT Page through `FB_DURABLE_MESSENGER_PAGE_IDS=409741855550833`. Empty/unset is the default. Messenger events are queued before ACK. Database claim leases and completion tokens survive restart and reject stale workers. Referral capture is independent of message presence, so referral/postback events are retained before a phone or Lead exists. Existing `lead_attribution` holds contact-first numeric ad/campaign evidence and links to the Lead later. Free-form ref/source/message/PSID/phone stays in the service-only receipt inbox; the attribution RPC rejects additional referral fields. Campaign mapping uses an exact reviewed ad ID plus Page/company match, never message text.

An additive `crm_leads.facebook_contact_id` unique identity and `create_facebook_contact_lead_once` transaction protect opt-in auto/manual/legacy scan creation. It locks the contact, validates VPT Page/company/type, reuses a committed Lead or inserts and links atomically. All early customer/phone reuse branches use that same transaction. Retry does not increase unread count or create another Lead. Failed message linking retries even if a Lead was already committed.

## Files and DB contract

- `database/639_facebook_contact_lead_atomic.sql`: nullable FK/unique identity and service-role-only atomic RPC. Uses existing Page config and caller fields; no history backfill.
- `database/640_facebook_messenger_receipts.sql`: receipt inbox and claim/finish RPCs; raw events denied to anon/authenticated.
- `database/641_facebook_referral_attribution.sql`: capture/link RPCs against the **existing, not versioned** attribution table. It fails if that table is missing. Runtime column types/defaults/nullability/FKs and the two partial unique indexes have now been compared with this migration; the tests build the table from that exact schema snapshot. Migration641 fails closed on missing/mismatched types or indexes. A clean install still needs the reviewed historical baseline.
- Backend helpers, `routes/facebook.js`, CRM `routes/leadLifecycle.js`, and one legacy scan request in `server.js`.
- Five test files, mapping example and handoff. The example has A2/B only: ad `120251592173560435` → adset `120251591871400435`; ad `120251591919430435` → adset `120251591877500435`; both campaign `120251591865910435`. IDs come from the approved 24 September report and must be compared with the current Meta draft before loading.

Safe runtime reads: Page id/default_company/module/type/owner; existence and types of new column/table/RPCs; counts by receipt status/attempt; mapped ad/campaign IDs and counts only. No phone, PSID, message content, raw JSON or tokens are needed for these checks. Raw events can contain personal data and should not be dumped to reports.

New `app_settings` key: `facebook_ad_campaign_mapping_v1`. Value is the object in `backend/config-examples/facebook_ad_campaign_mapping_v1.json`. Loading this example is a production configuration change and has **not** occurred.

## Verification run

```bash
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.cjs \
  node --test backend/tests/facebook*.test.js
node --check backend/src/routes/facebook.js
node --check backend/src/routes/crm/routes/leadLifecycle.js
node --check backend/src/server.js
```

40/40 passed with isolated PGlite and dependency-injected handler VM. Tests include exact runtime NOT NULL/default/FK behavior, cross-company merge rollback, stale Lead customer repair, rejection of free-form data in broadly accessible attribution, ACK ordering, failed enqueue503, replay within/after memory TTL, atomic rollback/defaults/permissions, blocked phones, failed message link recovery, expired leases/stale tokens, attribution before Lead, exact mapping and first-touch preservation. No application environment was read and no server was started.

Baseline counterexample: same real handler functions fail ACK-before-write and message replay recovery assertions. These are meaningful failure tests, not source-string checks.

## Gates before activation

1. Schema comparison is complete using the captured runtime metadata. The existing table has RLS=false and broad anon/authenticated CRUD/TRUNCATE/REFERENCES/TRIGGER grants; this patch does not change global ACL. No free-form private fields are added to it. Treat this legacy table as a mutable reporting mirror, not independent tamper-proof evidence; the protected receipts are the source evidence. Import a reviewed baseline if deploying into clean staging.
2. Review candidate diff and run the separate PostgreSQL service CI suite for independent-connection manual+webhook races, interrupted transaction recovery and lease fencing. This workspace has no postgres/psql/initdb/docker/podman; apt update failed because setgroups/setuid is unavailable, and no permission workaround was attempted. The 40 local PGlite/VM tests do not establish multi-process runtime behavior; a CI test must actually run before that gate is marked passed.
3. Verify current branch against target deployment SHA. `/api/health` proves liveness/DB route status but does **not** expose the build SHA; use Render deployment identity separately. Keep receipt flag empty until migrations/config are ready.
4. Confirm Meta `messaging_referrals` delivery for this Page and run one controlled ad referral → phone → correct-company/owner Lead → campaign evidence check with authorized test data. Do not replay production messages into a test route or send synthetic customer messages without authorization.
5. Only then enable the agreed paused A2/B trial and its separate budget controls. This patch neither activates ads nor implements the 50k-no-phone pause/midnight resume automation.

## Limits and rollback

Lead creation is atomic per Facebook contact for code paths carrying that identity. Any undiscovered writer omitting the key is outside that guarantee. Customer creation remains before the Lead RPC and can leave an unused customer in a race. Notifications/tasks can be absent after a crash immediately after commit; exactly-once downstream side effects are not claimed. A Lead shared across contacts keeps its original first-touch attribution; a second contact's evidence remains pending rather than overwriting history.

Drain receipt backlog while ads remain paused, disable the opt-in flag, then revert backend. Retain additive columns/tables and attribution evidence; do not delete contacts/Leads or replay historical events as rollback. If processing cannot drain, retain queued events and investigate their non-sensitive status counters before changing rollout state.
