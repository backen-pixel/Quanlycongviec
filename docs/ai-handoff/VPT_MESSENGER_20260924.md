# VPT — Messenger attribution and response protocol — 2026-09-24

Status: review branch only. Not deployed; no production migration, no backfill,
no customer messages, and no ad changes have been executed by this change.

## Creative comparison
Account 835757498658305, ad 120251440561920435.
21 September 2026 10:00:17 Asia/Ho_Chi_Minh: creative
1803932080611477 -> 1386284963488278. Windsor history has identical body text.
Meta UI independently confirms update at 10:00 and re-approval at 10:02.
The connector returned only the current creative, and the UI activity detail
did not expose the old video, CTA or Messenger flow. Those old fields remain UNKNOWN.
No restoration is justified until the old creative payload/preview is obtained.
Current story is 409741855550833_122200695152472983.
Changes on 22 September to age/Advantage audience confound a simple before/after test.
The UI has two pre-existing unpublished drafts; they were not published or discarded.

## Live operational work
Three reusable responses were saved and re-read in the CRM server account
kinhphucdat@gmail.com. They are personal saved replies, not a team-wide rollout:
1. VPT 01 — Hỏi nhu cầu: new/replacement kitchen and installation area.
2. VPT 02 — Kích thước và thời gian: planned date, length, optional photo/plan.
3. VPT 03 — Vật liệu và liên hệ: inox/aluminium, optional budget, optional Zalo/call.
Do not require a phone number before answering the customer's question.

## Response standard
- First useful HUMAN response <300 seconds from the first customer message of an
  unanswered conversation, not from CRM import time.
- Automatic greeting is not a human reply and does not close the timer.
- At 180 seconds: due soon; at 300 seconds: overdue.
- Repeated customer messages must not reset the start time.
- Measure coverage, median, p90 and % under 300 seconds; UNKNOWN if actor/time
  cannot be distinguished. Never infer a human response from any outbound echo.
- Meta unanswered automation offers 6/12/24 hours only; existing minimum is six
  hours. It cannot implement this SLA.
- CRM responseSla helper is tested but NOT wired to inbox, notifications or
  a staffed rota. Duty coverage and supervisor escalation are not verified.
  Do not claim the team currently meets the target.

## Implemented in this branch
- Explicit ADS referral extraction from standalone/message/postback payloads.
- Exact string ad IDs; reject numeric precision loss, conflicting IDs, echoes,
  customer-text guesses, missing timestamp and non-ad referrals.
- Append-only event evidence, deterministic duplicate suppression.
- Original event timestamp, contact ID, Page ID, immutable company ID and ad ID.
- Opt-in FB_AD_ATTRIBUTION_PAGE_IDS; default off. VPT Page is 409741855550833.
- GET /api/facebook/ad-attribution requires company_id, page_id, from, to
  (Vietnam dates, maximum 91 days); optional offset. 500 rows per page.
- Existing tenant/company/Page authorization plus company-scoped lead linking.
- Export grain is referral_event, not customer. Fetch every page; deduplicate
  by event_key. Join ad/adset/campaign dimension from Windsor by exact ad ID
  scoped to account 835757498658305, never by ad name.
- Qualification and revenue attribution stay UNKNOWN.
- No raw messages, phone, name, email or token in the evidence export.

## Release gates and exact missing work
1. Run SQL 633 in isolated staging and validate RLS, duplicate upsert,
   cross-company denial, contact relinking, pagination and failure behavior.
2. Existing Facebook receiver has no verified raw-body signature check in the
   inspected source. Evidence is explicitly unverified_webhook. Validate signed
   Meta delivery (including app-secret configuration) before treating it as
   verified attribution. Do not expose production secrets or silently bypass it.
3. Confirm Render production revision, review and deploy through the repo's
   approved release path. AGENTS.md disallows direct main edits/production deploy.
4. Enable only the intended Page after verification; test one real ad referral
   through Messenger -> CRM -> evidence export. Do not send a test to customers.
5. Historical backfill needs retained referral-bearing webhook payloads or
   explicit UI evidence. Name/phone alone is insufficient. No bulk backfill yet.
6. Add team-scoped saved replies and a measured human-response queue/rota;
   a pure timer function is not a functioning SLA.

## Validation / rollback
Eight node:test cases pass: exact identity/time, three payload shapes,
deduplication, non-ad/echo rejection, conflict/time rejection, persistence errors
and strict five-minute boundary. Node syntax check passes.
SQL and live end-to-end behavior have NOT been tested.
Rollback: unset FB_AD_ATTRIBUTION_PAGE_IDS, revert this feature commit.
Retain the evidence table for audit; no destructive rollback script.
