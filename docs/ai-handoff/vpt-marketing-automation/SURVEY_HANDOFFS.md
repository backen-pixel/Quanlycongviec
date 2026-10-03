# Survey handoff receipt — SQL668

Status: scoped implementation/review PASS on PR22, runtime a35deef4; [versioned evidence](SURVEY_HANDOFFS_REVIEW.md) and [browser checks](SURVEY_HANDOFFS_BROWSER.md). Release HOLD. Base ebe5e302. No live migration, configuration, send or release. VPT_SURVEY_HANDOFFS defaults off and requires Primary. This increment serves existing customer-confirmed bookings; it does not finish the full Marketing–Sales goal.

## Staff workflow

CRM → Sự kiện → Bàn giao khảo sát opens a normal authenticated staff page, not the admin-only Facebook console. Current recipient can see their work and acknowledge receipt; current Lead owner and current company administrator can monitor, but cannot acknowledge for someone else. Current company/tenant, active identity, region membership, canonical Lead/Customer/Page/contact/booking/event relationships are checked in PostgreSQL. An unassigned Lead is not public. Moving a recipient to another company never exposes their new live name to the old company.

Queue has PENDING/ACKNOWLEDGED counts, stable pagination and explicit unavailable scope. Admin sees only an opaque row for a company-owned handoff whose canonical data has moved out of scope. No zero-on-error. Detail contains CRM requirements, current appointment alongside the original customer-confirmed appointment, customer contact, care control, receipt and full paginated conversation. URLs in attachments are displayed as inert text; no automatic fetch/render.

## Receipt semantics

`crm_event_participants.status=confirmed` records the booking participant; it is not staff acknowledgement. SQL668 writes a private receipt, handoff state and audit atomically. The historical booking result remains BOOKED_HANDOFF_PENDING. Read returns current handoff state separately. ACK does not send, grant contact consent, resume AI, alter a calendar, or establish survey completion. STOP/takeover and delivery conflicts stay visible. Existing work survives proposer deactivation and roster expiry.

ACK binds a globally unique request to actor, company, proposal and exact context version. Same request/body replay uses the saved result after fresh scope and recipient checks. Changed appointment/source/context requires re-reading; changing event time/person or adding participants prevents acknowledging it as the original confirmed appointment. Browser persists the exact pending request before POST and retains it across reload/unknown outcome, scoped by actor/company, without customer content.

## Concurrency and limits

Context locks current actor/company, thread, calendar guard, handoff and canonical identity rows. Calendar gate precedes event/participant access and prevents participant phantoms, matching SQL664/665 order. No calendar permit is minted. One statement inventory provides queue membership/count/version consistency; full transcript is bound to the context version. New conversation requires reloading before ACK. Receipt acknowledges the observed snapshot; later changes remain detectable and do not rewrite the receipt.

Inventory currently computes full relevant context/message fingerprints for the company. Measure performance and contention with representative history before release; detail also uses the calendar gate. Legacy calendar writes, reschedule/cancel, booking outcome notification, unresolved dispatch exceptions, full actual source/spend coverage and CPQL acceptance remain separate unfinished work. No claim of 250,000 VND actual CPQL.

## Verification and rollback

Local adapter tests and isolated PostgreSQL cases cover current authority, null owner, company transfers, exact replay/concurrency, rollback, STOP, history/cursor invalidation and broad backup grants. Positive fixtures create bookings through the actual dispatcher and signed receiver using a fake provider. PostgreSQL179, Node22 604, full frontend build, local browser checks and independent review PASS are recorded against runtime a35deef4. Real operational acceptance is still required.

Rollback: disable VPT_SURVEY_HANDOFFS on Primary, retain receipts/handoffs/audit and existing calendar bookings. Do not delete evidence, reopen care, revert safe permissions or alter historical results. Live release still needs the Founder package and decision.
