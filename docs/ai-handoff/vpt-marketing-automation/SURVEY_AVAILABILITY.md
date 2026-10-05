# Survey source and availability preparation

2026-10-03, basec621fe6. **Runtimec0d07e6 verified; default-off; no booking or release.** This increment advances the scheduling part of the approved goal. It does not replace the eventual AI → customer confirmation → atomic booking → Sales handoff flow with a manual-only solution.

## Verified current calendar behavior

The repository already owns CRM events and participants (`database/22_events.sql`,245,506,508). Events can involve people across companies and custom modules. The old calendar GET is unsuitable as proof of complete free time: `fetchMyParticipantEventIds` catches source errors as an empty list, and supplemental participant events are capped at500. Existing POST/PUT writes events and participants in multiple transactions; some participant failures are ignored. New availability queries read these tables directly without those truncations or catch-to-empty semantics.

## Source contract

Private `crm_survey_rosters` stores one current source per company/staff/region; `crm_survey_roster_events` preserves exact command receipts. `SAVE`/`DISABLE` require authenticated current administration, expected revision, request UUID and reason. Request replay must match actor/company/body; it returns historical acknowledgement, never a booking. Direct table access is denied to public/application roles. No sources or permissions are seeded.

SAVE requires active in-company staff/region membership, 1–64 explicit future intervals of15 minutes–8 hours, buffer0–180 minutes around each interval, source reference and expiry within31 days. Intervals and buffers must not overlap within that source. The human confirmer asserts `calendarSource: CRM_COMPLETE` and `externalCalendarCoverage: ALL_BUSY_IN_CRM`: all other obligations must already be represented in CRM, and the buffered intervals must fit that person's actual availability. This assertion is auditable human-supplied data, **not independent proof** that external calendars are complete. Until the real source/roster has been reviewed and accepted for operation, no production free-time claim is established. If obligations remain in an unconnected calendar, do not publish that assertion.

Server time records who confirmed and when. Current confirmer administration, staff/company/tenant/region membership and expiry are checked when reading availability. A disabled or expired source produces no candidate. User-supplied actor IDs, model assertions or a bare `customerConfirmed` boolean cannot confer authority.

## Availability meaning

GET `/facebook/customer-care/survey/availability` takes company/thread and UTC from/to, at most14 days within31 days ahead. Current care/CRM routing must be valid and mode WAITING. For each currently eligible source, a complete statement snapshot includes all non-cancelled CRM events where the person is assignee, creator or a non-declined participant. There is no company/module filter on busy occupancy; the output never includes other events' titles, locations, customers or IDs.

Intervals use `[start,end)`. Travel buffer expands the tested interval. Discrete occurrence dates block each whole Vietnam day. All-day events conservatively include the end's Vietnam calendar day. Missing/equal end on a timed event blocks from start onward; invalid/infinite times or unknown all-day semantics block conservatively. NULL/unknown statuses remain busy; only exact cancelled events or declined participant links are excluded. This may suppress usable times until old data is corrected; it must not invent availability.

Results are `AVAILABLE_SNAPSHOT`, `NO_CONFIRMED_OPTION`, `CARE_OR_ROUTING_UNAVAILABLE`, or `NARROW_RANGE_REQUIRED`. More than200 candidate intervals requires narrowing the range and returns no partial list. Database failure propagates unavailable, never an empty valid calendar. One statement materializes every candidate person's CRM calendar and participant inventory. Subsequent source-version changes remove that source from the result. Calendar/source/care versions generate opaque option versions; these are observations at query time, not a serializable hold. Options expire in at most30 seconds or at source expiry. A final SQL time fence and service check discard/refuse already expired options after waits or network delay. Nonfinite occurrence dates are unavailable. Every result says `reservationMade:false` and `customerConfirmationRequired:true`.

## API and release boundary

Authenticated parent route exposes GET `survey/roster`, POST `survey/roster/change`, GET `survey/availability`, gated by `VPT_SURVEY_ADMIN=1` and primary-only operation. Body/query keys, server actor, returned scope and receipt identity are checked. UI is not part of this increment. Existing CRM event write paths are unchanged.

**Still required for actual booking:** confirmed real calendar coverage and roster; proof binding the customer's confirmation to the exact offered person/time/location/version; current authority/consent/takeover recheck; one transaction for reservation, canonical CRM event, participants, audit and handoff/outbox; same resource locks and safe mutations across all old write paths. A statement-level lock alone cannot close the legacy DELETE-participants → INSERT-participants gap. No customer message, AI right, external calendar write or claimed Sales delivery is introduced here.

Verification: local9 service/contract tests PASS. Isolated PostgreSQL cases cover source rights/replay/concurrency/rollback, every person relationship, cross-company/custom events, NULL/unknown time/status, buffers and boundaries, >1000 participant events, expired/revoked source, opt-out/takeover, too many options and unavailable storage. Runtime CI: PostgreSQL100 PASS including13 survey cases; Node22 567 PASS; all10 jobs/full build and report/Messenger regressions SUCCESS. Independent code review PASS; [versioned evidence](SURVEY_AVAILABILITY_REVIEW.md). No browser/UAT evidence claimed.

Rollback: disable VPT_SURVEY_ADMIN, retain source/receipt history, leave the existing CRM calendar intact. No live migration or configuration change is authorized by this document. Full Marketing–Sales goal remains ACTIVE; CPQL250,000 VND is unproven operationally.
