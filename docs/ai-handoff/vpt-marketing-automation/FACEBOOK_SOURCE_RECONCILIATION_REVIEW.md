# Facebook source enumeration — independent review and validation

2026-10-02. **PASS for this increment's code and isolated evidence. Full Marketing–Sales goal remains IN PROGRESS; operational acceptance and release remain HOLD.**

## Version and review scope

PR22 is draft and stacked on PR19. Reviewed runtime: `1625f66ee7a5d985fc9c290d460c40cdab12b200`; preceding runtime `000f11988e72c15b2f73fb99dba76a62471b0375`; pre-increment baseline `775d5224b89d7360b07215a9245d3fa7517ecc97`. CI checked merge `ef6480935512becb4ad8162978a91eb052a6d510`, containing the reviewed runtime and base `e16c885ae7c2305645be02a1227bf378cb59137f`.

Independent reviewer: separate agent session `/root/architecture_v11_review`, read-only, not the author. Risk HIGH: provider credentials, source identity and company routing. Reviewer independently compared published SQL/test blobs, reran 29 local adapter/worker/API cases, read PostgreSQL and Node22 job logs, and returned scoped PASS with no remaining blocker.

Three production findings were resolved before final validation: verify each form's Page before enumeration; reject lease expiry after waiting for Page/receipt locks, rolling back the chunk; and revalidate the Page scope recorded after initial start checks. The first PostgreSQL run exposed a test defect: a barrier inside a STABLE helper preserved the statement snapshot and did not reproduce the intended phantom-Page race. The final test pauses the VOLATILE start function before the next scope statement. The failure remains recorded as history, not counted as a passing attempt.

## Verified results

| Check | Exact evidence | Result |
|---|---|---|
| Adapter, worker and HTTP checks | Local Node24; independently rerun by reviewer | 29 PASS |
| Full automation workflow | [run37012747335](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747335) | All 10 jobs SUCCESS |
| Census PostgreSQL16 | [job110856168996](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747335/job/110856168996) | 11 PASS, 0 FAIL, 0 SKIP; 10 scenarios plus parent |
| Node18 regression | [job110856168833](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747335/job/110856168833) | 464 PASS, 0 FAIL, 0 SKIP |
| Node22 regression | [job110856168905](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747335/job/110856168905) | 464 PASS, 0 FAIL, 0 SKIP |
| Whole frontend build | [job110856168712](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747335/job/110856168712) | 10,301 modules; SUCCESS, 40.16s |
| Existing report regression | [run37012747643](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747643) | SUCCESS |
| Existing Messenger integration | [run37012747150](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37012747150) | SUCCESS |

PostgreSQL applies migrations649–656 twice in an isolated database and exercises role restrictions, wrong company/actor, duplicate start, parallel claims/commits, persisted cursors after worker restart, old leases, failed latest scans, token/actor/scope changes and both lock-wait expiry cases. A real census worker using synthetic provider responses finds two in-period IDs, queues them through652, and the real intake creates two CRM Leads. Webhook replay creates no additional Lead. Out-of-period IDs are excluded. No real customer or credential was used.

No new browser check is claimed: this increment changes backend/API/worker behavior; earlier synthetic dashboard evidence remains scoped to af14635. Reviewer observed frontend still running in its last snapshot; the primary agent subsequently read the completed successful build and all workflow results above.

## Limits and next dependency

SCANNED means API_ENUMERATION_ONLY. It is not proof of exhaustive Page/account/entrypoint access or provider retention. CPQL remains unavailable until all necessary source and spend coverage is established for the same period, identity/qualification is current, and missing/legacy/orphan records have explicit dispositions. The positive measured path and its incomplete/error cases remain required work. AI care, calendar, multi-channel rollout and real operations acceptance are not complete.

No merge, deployment, migration execution against a real DB, provider write, advertisement change, trial start or recurring budget was authorized by these tests. The default-off flag and selected Pages remain operational gates. See [implementation and rollback](FACEBOOK_SOURCE_RECONCILIATION.md). Canonical current state is [CURRENT](../CURRENT.md); historical entries preserve the result at their own version.
