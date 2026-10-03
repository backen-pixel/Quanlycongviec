# Legacy Facebook source adoption — verification

2026-10-02. Runtime `0d41d3433f0e02c522f5f3e22666a8ba21087def`; final test follow-up `2d90f5c85a8b8d6a8be7fc691a3821ef71adc68e`. PR22 remains draft/open, stacked on PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`. No live migration, configuration, ad change, merge, deployment or trial activation.

## Outcome and boundaries

The default-off intake console can attach a newly verified Facebook source to the same existing Lead/Customer named by both historical mappings. The server checks current contact and provider scope, prepares an expiring exact-context proposal and commits only after an authenticated admin confirms it. The receipt, source evidence and audit are atomic; CRM history/IDs/ownership, identity and qualification are unchanged.

Incomplete/conflicting mappings, missing receipts, unavailable provider history and source-scope coverage are still unresolved. This is not proof that all legacy records are reconciled or that actual CPQL/250k attainment is known. Full Marketing–Sales goal remains ACTIVE; AI care, surveys/calendar, source/spend completion, operational UAT and release approval remain required.

## Evidence for the checked version

-43 baseline files verified against Git blob hashes at8394ed1. All13 initial published deltas matched local Gitblob hashes. Follow-up2d90 changes only the PostgreSQL legacy case fixture; runtime unchanged.
- Local Node24:82 PASS/0FAIL/0SKIP, consisting of existing65 intake/admin/actual-webhook cases and17 new contact/service cases. Network/flags/primary changes, untrusted client fields, wrong scope/version, contact contradictions and error redaction are covered.
- [Automation run37021665037](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37021665037): all10 jobs SUCCESS.
- [Isolated PostgreSQL16 job110886001183](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37021665037/job/110886001183):44 PASS/0FAIL/0SKIP =43 cases plus parent, including13 legacy cases. Migrations650–654 and658 applied twice. Checks private rights, unchanged receipt on preview, old CRM/history preserved, same-request concurrency, competing proposals, crash rollback, missing/foreign/conflicting mappings, contact/history edits, ABA edits, actor/Page/membership revocation, allowed Pages, wrong actor, bad proof, organic source, expiry while locked and deleted CRM.
- Follow-up fixture enforces migration42's four Lead/Customer foreign keys with ON DELETE SET NULL for new legacy cases. NOT VALID tolerates tombstones intentionally left by older regression tests while checking all new writes; this is a test setup detail, not a proposed production schema change. This fixture is not the entire production schema.
- [Node22 job110886001405](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37021665037/job/110886001405):506 PASS/0FAIL/0SKIP. Node18 job110886001279 also SUCCESS.
- [Full frontend build110886001155](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37021665037/job/110886001155):10303 modules,36.38s, SUCCESS.
- Checkout merge `6f95a5c025b42d613525522183022c0bb37e5517` contains2d90f5c and basee16c885, confirmed in job checkout logs.
- Report regression run37021664954 and Messenger PostgreSQL run37021664395 SUCCESS.
- Supported synthetic browser checks on actual components PASS; [scope and observations](FACEBOOK_LEGACY_RECONCILIATION_BROWSER.md). No real provider/CRM access and no console errors.

## Independent review

Reviewer `/root/architecture_v11_review`, a separate session authorized by Founder, inspected SQL658, server/domain, parent route, UI, tests and contract. It independently ran82 tests, verified four published runtime/UI blobs and read initial0d41 CI logs. Conclusion: PASS for source adoption scope, no blocking findings. It noted the initial fixture lacked migration42's delete-null foreign keys; test-only2d90 adds them and CI is green. Reviewer separately verified the follow-up blob and final PostgreSQL log: PASS for2d90, no new findings, fixture note resolved. Runtime review remains PASS; no production acceptance is inferred.

This review authorizes no live action. Runtime remains default off. Rollback disables VPT_FB_LEGACY_REVIEW and preserves CRM, committed source proof, proposals and audit; never delete transactions to simulate rollback.
