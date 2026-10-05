# CRM identity — review and test evidence, 2026-10-02

Implementation head: `e434f4e44f2ff7811567f0663d2fb8d88d06e7b9`; parent `79e012b089015089ce6d324de486979fcc2e1ef6`. PR22 remains draft, open and unmerged. This is a backend increment, not completion of the Marketing–Sales goal or permission to activate it.

## Scope and independent review

The separate read-only reviewer `architecture_v11_review` independently ran all 47 graph/service/router tests, checked 11 source blobs against the parent, and reviewed locking, current authorization, relationship closure, source generations, tombstones, unlink/replay and cross-company redaction. Static code review PASS, no blocking findings. After publication the reviewer independently matched the SQL, service and graph to the reviewed candidate. Root verified all 12 changed Git blobs.

Published Git blob IDs:

- Migration 651: `04431c8cdd4b1460a3b1b98ed7ea33293172b366`.
- Identity service: `9f8629a357feab3499e203e8cc55360095125b72`.
- Graph projection: `0da09c05a21e8ee4d1d8d6465be454392b9f6d65`.

## Isolated verification

- [Automation run 36991797366](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36991797366): SUCCESS. Node 18 and 22 each 303 tests PASS. Existing command, spend and CRM qualification PostgreSQL jobs also PASS.
- [Identity PostgreSQL job 110789457667](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36991797366/job/110789457667): PostgreSQL 16 in a fresh isolated database; 13 scenarios plus parent = 14 PASS, 0 FAIL, 0 SKIP. Both migrations 650/651 applied twice to check repeatability in the fixture. Covers permissions, preserved source records, chain/triangle closure, stale contact edits, unlink/replay, simultaneous commands, identity alongside qualification, deleted and moved members, current tenant permissions.
- Checkout is PR merge ref `129c257c268d63745af489ec7bb8b6dbae0c810e`, combining this implementation with base `e16c885ae7c2305645be02a1227bf378cb59137f`; it is not a direct head checkout. Root and the independent reviewer each read the job log and its checkout identity. The reviewer confirmed both runs and all seven automation jobs succeeded.
- [Frontend job 110789457706](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36991797366/job/110789457706): entire frontend build PASS, 10,298 modules, 38.48 seconds.
- [Report regression run 36991797359](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36991797359): SUCCESS.

No frontend changes or new browser testing in this increment. The database fixture is not a production schema clone or live UAT. Parallel-call tests cover the stated scenarios; they do not prove every possible legacy lock interaction or performance at production scale.

## Remaining gates

Keep `VPT_CRM_LEAD_IDENTITY` off. Still needed: orphan/moved-member reconciliation, distinct-group resolution after unlink, UI/tool bindings, verified provider identity/source receipts, complete intake coverage and trial/account/date registry. A singleton is not certified unique; linked members are not automatically qualified paid Leads. Both completion flags remain false. Do not use legacy destructive merge to fill this gap.

Then finish the approved goal: verified AI intake and handoff, real receiver/backup and calendar bindings, takeover/opt-out/booking, decision dashboard, live acceptance and a concrete Founder release package. Finance/7% remains deferred and does not block lead preparation. Target 250, 000 VND/qualified unique paid Lead, one-time 100m/30-day ceiling and 80/20 regions remain unchanged. No actual CPQL result has been established.

No production DB/flag, customer message, advertisement, budget, merge or deployment was changed. Disable the feature to roll back; preserve identity/audit/source invalidation history.
