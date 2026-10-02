# Synthetic browser acceptance — legacy reconciliation

2026-10-02, actual published0d41d343 UI components built with esbuild and React against a synthetic API wrapper. Localhost4186 only; CSP connect-src none; no Meta/CRM/session/contact data. Supported cua_repl browser tab14, closed after checks. Server session65167 stopped. Build initially hit sandbox child-process EPERM; the reviewed escalation was allowed and build succeeded. No automatic safety rejection was bypassed.

PASS observations:

- Preview exposes target code/title, matching field types, source/acquisition and expiry. Confirmation disabled without reason and explicit checkbox.
- Lost commit response after simulated persistence: fields, close, reload and navigation lock. Retrying uses identical requestId/payload. Visible log shows one ACCEPTED_ONCE and one REPLAY, then success and updated queue. Request0cd9da80-25ec-4537-894d-800e8f76f801.
- Wrong-company preview is rejected; no target/confirm form appears.
- Held preview disables reload/close/alternate review. Switch from companyA toB, releaseA: onlyB queue remains andA proposal does not appear.
- Expired proposal: new confirmation is blocked in UI, no commit POST occurs; new source check offered. Server expiry/locking separately tested in PostgreSQL.
- Held commit disables inputs, repeat submit, close, alternate review and reload.
-409 response clears proposal/command, explains changed context, unlocks close/reload and never reports success.
- Wrong-company commit acknowledgement is treated as uncertain, never success. Same-key retry after correcting synthetic response returns one REPLAY and success; request8c416e7f-7b27-4f66-aa6c-b653ac5480bd.
- Console captured no warning/error messages.

These checks prove client lifecycle behavior with synthetic responses. They do not prove provider rights, production data, database behavior or complete source coverage. No claim of full production stylesheet visual fidelity; fixture supplies minimal styling while the actual frontend is built in CI.
