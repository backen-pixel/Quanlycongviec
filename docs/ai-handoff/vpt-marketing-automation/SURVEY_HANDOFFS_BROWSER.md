# Local survey handoff browser verification

2026-10-03. Actual `SurveyHandoffs.jsx` and `surveyHandoffState.mjs` from runtime76340d8 compiled under React StrictMode with a synthetic API. Later locking changes affect SQL only. Supported in-app browser, local127.0.0.1:4188; CSP connect-src none, external image/media fetch prohibited. No login, CRM, customer data or provider network access. Temporary tab and local server closed after checks.

Observed functional results:

1. Recipient opens customer/requirements/current appointment; initial50/55 messages expands to55/55 with the oldest message present.
2. A script-like message is rendered literally. Attachment addresses are inert text, no automatic fetch/render.
3. Simulated ACK commits but loses response. UI hides old data and retains a pending command. Browser reload preserves pending state; retry succeeds against the fixture's exact-key check, without a second receipt.
4. Manager can read; receive-work button is disabled and explains only the assigned recipient can acknowledge.
5. A detail response held while switching from company A to B is discarded when released. B shows its own empty queue, no A detail.
6. OPTED_OUT displays “Khách yêu cầu ngừng liên hệ” and explains receipt does not reopen AI contact or mark survey complete.
7. Revoked permission during history load hides previous queue/detail and reports the refusal.
8. Queue source failure hides old counts/items and shows an error; it does not present zero waiting customers as a successful result.

Scope: component behavior with simplified fixture CSS, not full production layout or operational UAT. PostgreSQL tests separately verify actual permission/idempotency/concurrency semantics. Company-selector integration is build-checked; real role/account configuration, notification, survey cancellation/reschedule, source/spend coverage, performance and Founder release remain outstanding.
