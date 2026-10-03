# Synthetic browser acceptance — care console

Runtime52741b81e3e526402150bcad2b230612d0f94c52. Actual FacebookCustomerCareConsole.jsx and careConsoleState.mjs compiled with React StrictMode and a mocked API. Local127.0.0.1:4186 fixture has CSP connect-src none; no login, real CRM/Meta connection, customer message or ad action. Fixture CSS is simplified: these are functional/browser-state checks, not full production-layout or live account acceptance.

PASS observed through the supported in-app browser:
- StrictMode initial queue loads and controls unlock.
- Detail shows the correct synthetic company/CRM owner/region; history loads55/55 messages from initial50. Script-like customer text renders literally; no console errors/warnings observed.
- Lost commit response retains exact request UUID and body. Component remount preserves it; retry logs one ACCEPTED_ONCE and a REPLAY for the same key. A full browser reload after403 also retains the pending intent and permits confirmation after rights recover in the fixture. Real DB idempotency/concurrency is covered separately by PostgreSQL, not by mocked provider state.
- Held read from companyA, switch toB/readB, then releaseA: only B details remain. Wrong-company detail returns an error with no transcript.
- Held POST disables refresh/note/other mutations. Wrong-company acknowledgement does not clear the intent; exact-key retry confirms.
-403 clears the visible detail/queue and retains uncertain intent.409 clears the obsolete command and requires a fresh read. Stale history clears the detail before further control.
- Queue failure displays unavailable counters (—), not zero.
- OPT_OUT changes the queue state and removes the control form; there is no UI path to resume contact.

Tab15 and server session93032 were closed after checks. No screenshot is presented as a live system result. Attachments are counted but not fetched/rendered; AI advice/sending, bookings and operational UAT remain unfinished.
