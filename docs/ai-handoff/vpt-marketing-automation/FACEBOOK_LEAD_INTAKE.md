# Facebook Lead Ads → CRM: durable source intake

Increment from PR22 fa39e939, 2026-10-02. Target remains 250,000 VND per qualified unique paid Lead. This implements receipt-to-CRM/source integration, not the complete trial projection or live release.

## Before and after

The legacy webhook ACKs before Lead Ads processing; a saved `facebook_lead_ads` row causes retry to skip work even when CRM creation failed. Its helper also matches phone suffixes across Customers and can update the matched record. The new path stores a private durable receipt before ACK, then creates a company-scoped Customer, CRM Lead and immutable source proof in one transaction. It does not call that helper or create/mirror Facebook contacts/raw Lead Ads records.

- `VPT_FB_LEAD_INTAKE_PAGES`: empty by default. All Lead Ads forms for selected Pages belong exclusively to the new worker; unconfigured forms remain pending/review, never fall back to legacy processing. Unselected Pages retain existing behavior.
- Once any Page is enabled, the shared Facebook webhook requires `X-Hub-Signature-256` using raw bytes and `VPT_FACEBOOK_APP_SECRET` **before all writes**, including Messenger/logging. All Pages delivered to this endpoint must belong to that App. An invalid/missing signature returns403; durable DB failure returns503. Raw capture supports query/trailing slash URLs. This does not enable or subscribe any real Page.
- `VPT_META_GRAPH_VERSION` must be explicitly verified for the deployed App; no implicit API version. Tokens remain server-side and are sent only in Authorization headers to the fixed Graph host; redirects fail. Runtime rights are not established by SDK field existence.
- Primary DB only, with failover disabled; every storage call checks this condition. No external writes, advertisements or customer messages are issued.

## Routing and source contract

Authenticated `POST /api/facebook/lead-intake/bindings` accepts `{companyId, requestId, configuration}`. Configuration contains Page/form/account, region, owner, pipeline/stage, source, product type, exact contact field map, active flag, expected revision and approval reference. Database checks the current administrator/company/tenant, not a JWT role supplied by the caller. `VPT_FB_LEAD_INTAKE_ADMIN=1` is separately required; disabled by default. A recorded configuration is not proof of Founder production-release approval.

`GET /api/facebook/lead-intake/status?companyId=...` reports scoped bindings, counts and the oldest50 pending/review metadata. It returns neither provider tokens nor contact contents, and explicitly reports unique paid coverage incomplete. There is no management UI yet.

Receipt identity is `(Page, provider leadgen ID)`; incoming Page company and form binding revision are pinned. The worker rechecks the binding, its approving administrator, current Page/company/tenant, ad account and token expiry, recipient/region membership, pipeline/stage/source/product immediately before writing. Wrong or changed routing never silently uses defaults. Provider creation time is preserved independently of arrival/retry time.

The adapter fetches the provider Lead, verifies form ownership by Page, and verifies the ad's account/adset/campaign for paid attribution. Organic and unresolved source remain distinct. Webhook ad IDs, free-text campaign names, UTM parameters or model guesses are not accepted as paid evidence. No automatic qualification is recorded; a received form is not yet a qualified unique customer.

Database652 owns the receipt/lease/configuration ledger; CRM owns creation and `crm_lead_source_evidence`. A 120-second lease is checked after dependency locks and after CRM writes; expiry rolls back the transaction. A stale worker cannot finish/release a newer lease. Retrying after a successful commit does not recreate a deleted/moved CRM record. Public/authenticated users cannot access the new tables/RPCs directly; service role has RPC-only access to new tables. Existing legacy table permissions are outside this increment and remain a deployment audit dependency.

No contact is exposed to legacy scanning while creation is in progress. Exact matching legacy Lead Ads/contact records cause REVIEW, including partial/orphan imports; no phone-based adoption. Receipts/source proof retain history without cascading Lead deletion.

## Activation, recovery and remaining work

Before cutover, stop and drain legacy Lead Ads workers on **every replica** for each selected Page; do not mix old/new instances. The legacy `EXISTS` check cannot serialize an older replica that still creates records. Verify database/schema/trigger compatibility, Page/App/Graph permissions, routing/field maps, exception owner and real Sales acceptance before enabling the feature. Apply652 only via the approved release package. No configuration or Page is enabled by the migration.

Missing binding pins a NULL revision; later configuration does not automatically adopt the old receipt. Changed routing, legacy conflicts and exhausted retries remain in REVIEW. Explicit audited reconciliation and operator UI are still required; the status API exposes this queue but does not resolve it. Provider failures retry with bounded delay and reach REVIEW after10 failed processing attempts. A process crash leaves an expired lease recoverable after restart.

Disabling the Page flag alone is **not** a safe rollback: that would re-enable the legacy Lead Ads handler for that Page. Pause incoming delivery/processing for the selected Pages, drain or stop all workers, retain receipts/source history, and keep the exclusive routing guard until a reviewed recovery/cutover package is applied. Do not delete receipts to force another attempt.

Still unfinished in the overall goal: audited reconciliation, cross-channel identity resolution/coverage, trial/account/date registry, complete qualified paid cohort and dashboard, AI verified advice/handoff/takeover/opt-out/booking, actual survey roster and Founder release/UAT. Finance/7% is deferred. Nothing here establishes actual CPQL or opens the100m trial budget.

## Verification and provider references

Local41 adapter and real webhook callback tests PASS (Node24); includes exact-byte signatures, no writes on rejection, mixed events, ACK ordering, no legacy fallback, paid/organic/unknown evidence, provider failure, lease token handoff and uncertain commit response. Callback tests execute extracted production handlers with fake dependencies; they are not a full running Express server or live Meta acceptance. PostgreSQL CI and final independent review are pending publication. PostgreSQL fixture applies650/651/652, but is not a full production schema clone.

Read-only provider research used Meta's own [Lead SDK fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/lead.py), [Ad account/campaign fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/ad.py), and [Leadgen form Page fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/leadgenform.py). Official Webhooks/retrieval documentation returned429 during this session; App-specific API permission/behavior must be verified during authorized UAT. The older Messenger sample uses SHA1 and was not used to justify accepting SHA1; the new contract requires HMAC-SHA256 only.
