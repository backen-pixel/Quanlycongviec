# Customer-care foundation — independent review and evidence

Runtime:73fa7c68e75c1a4a40153feaa1b50d11b442f254; treeb9cd20c7a3309d40da82394421b4dc83fb1f4094. All13 published file blobs were checked against local Git hashes. Base203a1fdaa312220b7418b87d34b004f91575a62e. PR22 remains DRAFT/open, stacked on PR19; no merge/deploy/live migration/flag/ad action.

Independent reviewer in a separate session (/root/architecture_v11_review) returned PASS for this exact runtime after checking SQL and webhook/service delta. Original findings closed: foreign historical Lead/Customer mappings are rejected even for first-ever threads; earliest human-request deadline survives late/out-of-order requests; ordinary late messages do not alter it; outbound echo alone cannot prove human takeover; actual webhook test harness has the new service and checks ACK/failure/send guards. Reviewer independently reran10 integration cases, all PASS. No blocking code finding remains in this increment; runtime release remains HOLD.

| Evidence | Result |
|---|---|
| Local targeted suite |64 PASS,0FAIL,0SKIP:18 care,36 existing intake,10 actual webhook |
| [Automation CI37026960278](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37026960278) |All10 jobs SUCCESS, including PostgreSQL and Node18/22 |
| [PostgreSQL job110903930433](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37026960278/job/110903930433) |60 PASS,0FAIL,0SKIP:59 child cases+parent,16 new care cases |
| [Node22 job110903930434](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37026960278/job/110903930434) |529 PASS,0FAIL,0SKIP |
| [Frontend job110903930428](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37026960278/job/110903930428) |Whole build SUCCESS,10303 modules,37.03s |
| Report37026960273 / Messenger37026960346 |Both SUCCESS |

CI checkoutec952b1f4545e3175db679e1441ed5dacfa59e6a explicitly merges runtime73fa7c68 into basee16c885ae7c2305645be02a1227bf378cb59137f. PG16 is isolated with synthetic data; no local/production database was used. No UI component changed, so no new browser acceptance is claimed. Historical browser evidence remains tied to its own prior version.

PG cases cover private tables/public roles, same-message concurrency, conflicting IDs, batch rollback, crash/replay, reversed/late requests and ordinary messages, echo vs takeover, sticky opt-out, current/revoked actor/company/recipient permissions, parallel control/version changes, Page transfer, foreign existing CRM mappings, bounded transcript and metadata-only queue. Actual webhook tests verify durable write before acknowledgement, invalid signature and storage failure without legacy fallback, and all five legacy sender entry points refusing enrolled Pages before provider access.

The implementation is only signed receive/review and durable control. Pages remain unenrolled; enabling enrollment blocks existing in-app sending for that Page. External apps/native Meta sends are not controlled. Missing CRM links/recipients remain visible exceptions, phrase matching is not general intent comprehension, historical Page ownership is not certified, and no AI-send delegation or resume path exists. The operator UI, controlled dispatch, facts/templates, real survey scheduling, escalation and operational UAT remain full-goal work. Follow [contract/rollback](FACEBOOK_CUSTOMER_CARE.md). Goal ACTIVE, no actual CPQL/7% result claimed.
