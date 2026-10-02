# CRM identity operations — validation and independent review

Date: 2026-10-02. PR22 remains draft/open/unmerged. Implementation `5d9a093aebf4d50eb90217d633faf0484ff7b4ae`, tree `5f68273b3bfeedc7e22f48641ef1ca4f8135c607`, parent `301db0d720c7fb2f84ef6b1d2c9a7c4850a76703`. All14 increment blobs matched the tested local candidate. Follow-up `96451de01c84757e3f7ee4b7b70c5c02bf5f5356` changes one test line to apply migration654 in the Facebook intake suite; runtime/UI are unchanged. [Contract and release gates](CRM_IDENTITY_OPERATIONS.md).

## Independent result: PASS for this increment

Separate reviewer `architecture_v11_review` read the requirements, SQL/domain/service/UI and cases; independently reran89 local tests and compared4 published critical blobs (SQL654, review card, projection, PG cases). Findings closed before implementation publication:

- Historical Lead transfer-back or deleted-ID restoration could race DETACH. Stable metadata/node locks and restore-generation invalidation now fence the action; actual PG regression covers both.
- LeadDetail needed a Fragment around the two quality-tab cards; fixed and full frontend built.
- Same-Lead/Customer source edits could leave a completed identity result visible. Revision-key invalidation now clears/reloads it; ambiguous writes retain their original request and display changed-source status. Timestamp makes the observation time explicit.

Reviewer read the PostgreSQL/Node22/build logs below and returned PASS for5d9a093. The reviewer also read the test-only96451de delta; its all-migrations CI subsequently passed. Browser evidence was performed by the implementing agent, not independently rerun by reviewer.

Audit links actor, request, evidence and decisions. It does not retain a full before/after copy of every contact field and must not be described as reconstructing all historical PII. Reviewer accepted that boundary for this increment.

## Executed checks

- Local Node24:89/89 PASS (47 existing identity tests,42 new projection/service cases), no failures/skips.
- [Implementation CI37002803895](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37002803895): all8 automation jobs SUCCESS. Node18 and22 each410 PASS, no failures/skips.
- [Isolated PostgreSQL identity job](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37002803895/job/110824121530):26 scenarios+parent=27 PASS/0 FAIL/0 SKIP. Fresh PostgreSQL16, migrations650/651/654 each applied twice. Includes permissions, new complete inventory, DISTINCT and transitive legacy LINK guard, contact A–B–A, whole-group reconfirm, unlink, concurrent decisions, replay/revocation, retained historical node, restore and transfer-back race.
- [Full frontend build](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37002803895/job/110824121549):10,300 modules;35.67seconds. Report37002803885 and Messenger37002803877 SUCCESS. CI checkout was merge `1cb4b18ed5beeb04f23c363266126530ab7cc4ac`, containing5d9a093 and PR19 basee16c885, not a direct-head run.
- [Combined-migrations CI37003775875](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37003775875) at96451de: all8 jobs SUCCESS; report37003775845 and Messenger37003775877 SUCCESS. [Intake/recovery PG job](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37003775875/job/110827186668):31 PASS/0 FAIL/0 SKIP with650–654 each applied twice. Checkout merge8691438 includes96451de+basee16c885. This checks the new INSERT trigger alongside the receipt/CRM/recovery transaction path.

## Browser evidence and limits

Supported CUA, real review component, React StrictMode, synthetic API, loopback only and CSP `connect-src 'none'`. Verified: shared-contact candidates; explicit DISTINCT; search change clears peer/acknowledgment; lost write response retains the exact request UUID/body across source revision and retry; source edit without pending write clears old result immediately; delayed reads/writes across company changes do not overwrite current scope; read errors clear data; missing company hides the card. No JS errors. Generated CSS from the actual component and inspected1280×720 layout including the save button. Temporary tab and server were closed.

Not full-app authentication, production schema clone, live Meta, mobile/a11y certification or real-customer UAT. Migrations have not been applied to real databases. No merge, release, AI/customer messages, ad changes or trial launch. Default-off flag remains off.

## Remaining objective

Exact-contact review completeness does not prove qualified unique paid customers. Complete trial/account/date and provider/source coverage, legacy/orphan disposition, qualification and full spend still need one trusted cohort projection. Do not drop unavailable source/receipt history or count raw forms as qualified Leads. AI knowledge/care/handoff/opt-out/calendar, cost/customer/survey/pending dashboard and Founder acceptance/release package remain IN PROGRESS. Finance/7% is deferred and does not block Lead-only preparation. Full four-part goal remains active.
