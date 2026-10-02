# Response library operator console
2026-10-02. Baseline822068809e7c692e361e333e2f7f45c9683d7b6f. Default-off, no model calls or provider changes.

Facebook → Chăm khách → Nội dung tư vấn provides a company-scoped editor: title, purpose, product choice, region/channel choices, question, exact answer, source reference, expiry in Vietnam time and action reason. Draft edits invalidate approval; unsaved edits disable approve/preview/history until saved and reopened. Approve requires the existing explicit human publisher grant, current server validation and exact viewed version. No UI to grant publisher rights. Preview is literal text and always send:false.

SQL662 provides primary/authenticated product/region selectors and historical receipt paging. Results expose only id/name/code; shared/null-company, foreign and inactive products are omitted. Search uses literal substring matching. Each selector page is50 items; stale/ineligible cursors fail. Selections from earlier pages remain selected and can be removed even if labels are not yet loaded. This is a live catalog, not frozen inventory.

History provides50 older events per page tied to the current entry version. It shows previous document, reason, time and actor label, omitting stored approval-ready/dispatch flags. History is visibly marked as historical, with no controls to restore or approve a historical snapshot. Current actor/company/entry rights are rechecked on every request.

## UI request discipline
A mutation records the exact request, body, actor/company key in sessionStorage before POST. Unknown/lost/wrong acknowledgements keep that request and lock new mutations; remount/reload retries the same key.400/409 clears the rejected intent and requires re-reading.403 clears visible data but retains an ambiguous intent. Corrupt or blocked storage disables new changes. Stored content is only the pending command; it may contain the draft response/source reference, not a full customer transcript.

Acknowledgement is historical: the UI clears displayed entry and requires an authoritative reload instead of painting receipt state as current. Keyed actor/company remount and request-generation guards discard late responses. Switching the two care tabs preserves unsaved editor state. Moving to another entry or reloading asks before discarding unsaved edits; ordinary pagination failure preserves the draft. Permission failure clears it.

No AI/provider call, final quote, order close, account permission, sending, budget or live database change is introduced. Existing customer-care console retains its behavior.

## Verification and rollback
Local20 tests PASS (9 prior library +11 UI-state/service). PostgreSQL4 new selector/history cases, whole frontend build, actual-component synthetic browser and final independent review pending. Reviewer found a potential unsaved-draft loss on list pagination failure; fixed to preserve the editor for ordinary failures, with browser regression planned.

Disable VPT_CARE_LIBRARY_ADMIN to stop library API access; care receive/control flags remain separate. Keep existing entries/events/publisher enrollments; do not delete history or reopen public table writes. No production UI/signoff is claimed from simplified fixture CSS. Remaining goal work includes verified VPT content, AI consumer/delegation/dispatch, actual calendar/booking, complete operational measurement, UAT and Founder release.

