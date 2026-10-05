# Care console — independent review and exact-version evidence

Runtime52741b81e3e526402150bcad2b230612d0f94c52; tree8fbb8300616c4ccb60a8e71ef5013ef508136e41. Base57de6ea9e75ffb41dd27e9812adea75b83b8ac8d.17 baseline files and all13 changed publication blobs checked against Git hashes. PR22 remains DRAFT/open, no merge/deploy/live DB, flag, account or ad action.

Independent reviewer /root/architecture_v11_review in a separate session returned PASS for this exact runtime; no blocking findings. It independently ran27 local tests, checked three published critical blobs (SQL/UI/state), and read CI logs. StrictMode lock cleanup was verified; queue membership token closes the cross-boundary priority/state change issue. Browser checks were performed by the implementing agent and are documented separately, not attributed to the independent reviewer.

| Evidence | Result |
|---|---|
| Targeted local care/console |27 PASS,0FAIL,0SKIP |
| [CI37030471591](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37030471591) |All10 jobs SUCCESS |
| [PostgreSQL110915714022](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37030471591/job/110915714022) |69 PASS,0FAIL,0SKIP;68 child scenarios+parent,9 console cases |
| [Node22 110915714135](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37030471591/job/110915714135) |538 PASS,0FAIL,0SKIP |
| [Frontend110915713423](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37030471591/job/110915713423) |10305 modules;38.65s; SUCCESS |
| Report37030471961 / Messenger37030471306 |Both SUCCESS |
| [Synthetic browser](FACEBOOK_CARE_CONSOLE_BROWSER.md) |PASS within documented fixture scope |

CI checkoutdfd12b28d85bb60f8412c6befe64e8e427e37898 explicitly merges52741b81 into basee16c885ae7c2305645be02a1227bf378cb59137f. PG16 is isolated synthetic data. Cases cover service-only RPCs/current scope, filtered/ordered queue, all pages without duplicates, boundary and non-boundary changes,125-message complete history, foreign/stale cursors, changed Page/company and actor revocation. Existing controls/opt-out/concurrency tests remain in the suite.

PASS is bounded to code and isolated evidence. Operator control is currently company-admin scope; no AI runtime authority or sending/booking is opened. Qualified customer/spend completeness, approved product facts, actual calendar/roster, outbound policy/dispatch, notifications/escalation, attachments, production privacy/performance and operational UAT remain full-goal requirements. No actual CPQL target or7% revenue attainment claim. Follow [contract/rollback](FACEBOOK_CARE_CONSOLE.md); goal ACTIVE.
