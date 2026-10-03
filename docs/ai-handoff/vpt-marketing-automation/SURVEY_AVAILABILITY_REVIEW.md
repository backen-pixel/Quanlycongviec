# Survey availability review and validation

2026-10-03. Runtime `c0d07e6a2d17b1e4cf77416bae5ebc16f0724c0e`, parent `c621fe6f46f5938cf0f934652a39676a42e81e02`, PR19 base `e16c885ae7c2305645be02a1227bf378cb59137f`. All10 changed runtime blobs verified before branch update. PR22 remains draft, unmerged and default-off.

## Scope reviewed

This increment supplies staff availability sources and current CRM busy-time observations to the future booking flow. It adds SQL663, authenticated survey source/read APIs and tests. It does not reserve, book, send customer messages, deliver Sales handoff, change old calendar writers or prove completeness of actual external calendars. [Contract and limits](SURVEY_AVAILABILITY.md).

Independent reviewer `/root/architecture_v11_review` read the candidate and matched four published SQL/service/test blobs. Reviewer ran9 local tests and independently read the PostgreSQL, Node22, frontend and checkout logs listed below. Three findings were fixed before runtime publication: all persons now share one materialized calendar inventory; SQL/service reject options expired during lock/network waits; nonfinite occurrence dates cannot produce free time. Final independent code/CI review PASS, with no remaining blocking finding in this increment.

## Verified runtime evidence

- Local:9/9 service tests PASS, independently repeated by reviewer.
- [Automation37084310582](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37084310582): all10 jobs SUCCESS.
- PostgreSQL job111091314837:100 PASS,0 FAIL,0 SKIP.13 new survey cases cover private access, scoped/current rights, publication replay/concurrency/rollback, all three person links, other companies/custom modules, unknown statuses/times, travel buffer and boundaries, >1000 participant events, expired/revoked sources, takeover/opt-out, nonfinite dates, reassignment during one snapshot,30.2-second wait invalidating observations, too many results and actual source-read failure.
- Node22 job111091314873:567 PASS,0 FAIL,0 SKIP; Node18 job also SUCCESS.
- Frontend job111091314784:10,307 modules, full build SUCCESS in26.77 seconds. No frontend component changed in this increment, and no browser/UAT acceptance is claimed.
- CI checkout `8acbad94fc1b23f435aa559731a6e444256bd9cf` is the merge of runtimec0d07e6 and basee16c885; logs identify both.
- [Messenger37084310583](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37084310583) and [report correctness37084310587](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37084310587): SUCCESS.

## Remaining requirements and rollback

Real calendar coverage, dated roster, travel assumptions and responsible people remain unconfirmed. `CRM_COMPLETE`/`ALL_BUSY_IN_CRM` is an auditable human assertion backed by a reference, not an automated census of external systems. Do not activate against real data until the applicable release package verifies that assertion.

Actual booking still needs customer confirmation bound to person/time/location/version, current takeover/consent checks, atomic creation of canonical event/participants/audit/handoff and protection across old multi-transaction writers. The existing DELETE-participants → INSERT-participants gap cannot be solved by a statement lock alone. Availability versions are not permission to write or a held slot.

Disable VPT_SURVEY_ADMIN to stop these APIs; retain roster/history. Existing CRM events remain untouched. No migrations, permissions, configuration, advertising, trial start, model calls or deployment were changed in live environments. Full Marketing–Sales goal remains ACTIVE; actual CPQL250,000 VND has not been established.
