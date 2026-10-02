# Facebook form intake console and recovery

Base PR22 `459c8406e929889bafb5922ea1877e3a6cb1f960`. This increment supports the ongoing customer/spend, AI handoff, dashboard and release goal; it does not complete the trial or establish 250k CPQL. Risk: HIGH (scoped personal-data intake/routing and controlled retry). Production remains HOLD.

## Behavior

Facebook → **Tiếp nhận biểu mẫu**, shown to the existing admin-like UI group. The server and database independently check current company/tenant/admin rights; visibility is not authorization. A single company must be selected. The console shows receipt state counts across the whole company history, configured recipient/region/product, and unresolved receipts oldest first, 50 per cursor page. Names are joined only within the receipt's company. It does not show contact payloads, tokens or legacy unscoped Lead Ads data. Imported receipts are not qualified unique customers.

`GET /api/facebook/lead-intake/console?companyId=...&cursor=...` uses `marketing_fb_lead_console`. Cursor is an opaque receipt UUID resolved inside the authorized company. Concurrent processing can remove pending rows from later pages; totals are live, not a frozen export. `GET /status` remains compatible. A failure clears the displayed numbers and disables action; no error-as-zero or previous-company response is used. The component is keyed by company and also fences pending reads/writes.

`POST /api/facebook/lead-intake/recover` requires a fresh request UUID, receipt version, explicit current binding revision and a 20–2000-character reason. Current authorization, receipt state, Page ownership, approved binding and every recipient/routing dependency are checked in the database transaction. The common worker context validator runs under a transaction-local temporary lease and cannot expose its tokens through this API. Before/after audit and the transition back to PENDING are atomic. The existing attempt count is retained; repeated failures at the retry limit return to REVIEW, not an unbounded new automatic retry allowance.

No recovery for DONE, active/expired LEASED, already queued without an error, CRM/source evidence/completion tombstones, legacy source/contact evidence or envelope scope conflicts. Expired leases recover through the normal worker. Old or missing binding revision can be adopted only through the explicit command, with unchanged company/Page/form/source identity. Legacy adoption remains a separate unimplemented reconciliation operation. Worker commits still verify provider identity and all current authority. Recovery does not mark a customer qualified, merge identities or assign paid evidence.

An identical request after a lost response acknowledges the saved action without replaying the transition. Reusing its key with a different command conflicts. Concurrent fresh requests or a worker claim invalidate the receipt fingerprint, so an old screen cannot silently overwrite a new state. UI ambiguous outcomes retain the original request identity/body for retry. The normal page/binding configuration API remains separate; a new binding editor and provider form discovery are not included here.

## Enablement and rollback

Migration653 is additive to650/651/652; no existing migration is changed. New table is private/RLS; public, anonymous, authenticated and direct service access are revoked. Only scoped SECURITY DEFINER RPCs are granted to service_role. `VPT_FB_LEAD_INTAKE_ADMIN=1` opens management reads/binding API as before; new writes additionally require **`VPT_FB_LEAD_RECOVERY=1`** (default off). This increment does not set either flag or configure real Pages.

**`VPT_FB_LEAD_INTAKE_WORKER_PAUSED=1`** stops a process from claiming more work, and checks pause again after context/provider reads before commit. Signed enqueue and selected-Page legacy exclusion stay enabled. This is a deployment/process control, not a company-global database kill switch. Apply it to **all** intake replicas and drain any RPC already sent before declaring processing stopped. An in-flight commit already submitted cannot be recalled. On resume, expired leases are recovered by the worker. Never clear `VPT_FB_LEAD_INTAKE_PAGES` alone as rollback: that re-enables the legacy handler. Keep receipts/audits and source ownership. Live cutover must still stop/drain all legacy replicas.

## Evidence and remaining gates

Local 65 adapter/actual callback/admin/pause cases pass. PostgreSQL fixture now applies650–653 twice and exercises pagination, fresh permissions, audited retry, explicit rebind, optimistic concurrency, idempotent response-loss retry, rollback and tombstones. Isolated PostgreSQL CI, complete frontend build, supported synthetic browser and independent final review are pending at this entry. No production clone, actual Meta delivery or real CRM acceptance is asserted.

Still required: binding setup UI/form discovery, legacy/orphan identity reconciliation, complete qualified unique paid cohort and trial registry, actual CPQL dashboard, approved product knowledge/AI care, real survey calendar, full acceptance and Founder release decision. Finance remains deferred. No merge/deploy, live DB or ad budget change.
