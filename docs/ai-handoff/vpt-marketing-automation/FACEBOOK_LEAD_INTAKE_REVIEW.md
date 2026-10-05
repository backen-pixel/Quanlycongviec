# Lead Ads intake: independent review and isolated evidence

Implementation `d6daf4f92118cf62b684188fe17e3eb7d04675e5`, parent `fa39e939440d2216771688f9a6acfce5266aed02`. PR22 remains draft and unmerged. Full four-part goal remains active; this is the first verified provider-receipt-to-CRM implementation, not activation or complete measurement.

## Independent review

Separate read-only reviewer `architecture_v11_review` reviewed source integration, adapter, raw-body capture/webhook ordering, admin endpoint, SQL, tests and rollout contract. The reviewer independently verified six published blobs against the reviewed candidate, confirmed650/651 unchanged, ran41 local tests, inspected all CI jobs and read the PostgreSQL log. Root verified all12 changed Git blobs. Final conclusion: **PASS for this bounded increment**, no remaining blocking finding.

Closed findings:

- **P1:** nullable administrator/company predicates could evaluate UNKNOWN and evade `IF NOT (...)`. Permission guard now requires the allow expression `IS TRUE`. Regression includes a tenantless target company with unscoped admin, sales_admin and NULL role, plus mismatched tenant scope.
- **P2:** a lease could expire while waiting for dependency locks. The context and final write both recheck expiry; exception rolls back Customer, Lead and source evidence. Regression holds the recipient lock past a short lease, then verifies no CRM write committed.

## Executed verification

- [Automation36995448680](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36995448680): all eight jobs SUCCESS. Node18/22 each **344 PASS**, including41 new adapter/webhook callback tests.
- [PostgreSQL intake110801003382](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36995448680/job/110801003382): fresh isolated PostgreSQL16, migrations650/651/652 each applied twice; **20 scenarios + parent =21 PASS,0 FAIL,0 SKIP**. Covers private ACLs, admin scope, atomic batch rollback, concurrent receipt/commit deduplication, transaction rollback, stale lease and expiry while blocked, current recipient/tenant/account/approval, legacy partial import, wrong provider source, organic/unknown, revision/company changes, deletion retry and scoped status. New Lead is readable by qualification/identity services and remains PENDING.
- CI checkout is PR merge ref `440ccc79c78c3d1d60c1467cb089e43644f7e3ea`, containing implementation `d6daf4f` and base `e16c885ae7c2305645be02a1227bf378cb59137f`; not a direct-head checkout. Root and reviewer independently read this identity in the PG log.
- Existing command, spend, CRM qualification and identity PostgreSQL jobs PASS. [Frontend build110801003165](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36995448680/job/110801003165):10,298 modules,39.94 seconds, SUCCESS.
- [Report regression36995448673](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36995448673) and [Messenger PostgreSQL regression36995448682](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36995448682): SUCCESS.

Callback tests run the real extracted production webhook and Lead Ads handlers with synthetic dependencies; raw-byte helper tests are separate. No full listening Express/server or real Meta webhook was exercised. PostgreSQL fixture includes650/651 triggers but is not a full production schema clone; all legacy trigger/FK behavior still requires staging verification. No frontend change/browser test in this increment. Reviewer did not run live Meta, local PostgreSQL or browser tests.

## Remaining release gates

All new paths remain disabled by default. No live DB/flag/routing/ad/budget/message changes or release. Cutover must stop and drain every legacy replica for selected Pages. Preserve ownership guard on rollback; removing Page IDs alone would re-enable legacy processing and is unsafe. See [contract and recovery details](FACEBOOK_LEAD_INTAKE.md).

Explicit reconciliation for missing/changed bindings, legacy records, REVIEW receipts and changed/deleted identity groups is incomplete. Management UI, trial/account/date registry, full identity/quality/source coverage, complete CPQL dashboard, AI advice/handoff/opt-out/takeover/booking, receiver/backup/calendar and Founder release acceptance remain open. A form or paid source proof does not certify a unique qualified customer. No claim of achieving250,000 VND CPQL or starting the100m/30-day trial; Finance/7% remains deferred.
