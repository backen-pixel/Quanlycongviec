# Facebook–CRM reconciliation — review and validation

2026-10-02. **PASS for this increment's code, isolated database checks and synthetic UI. Full Marketing–Sales goal remains IN PROGRESS; real operation/release remains HOLD.**

## Versions and independent review

Baseline730c388ef436f233622ab6137b2ba89008e33c46. Initial implementation808a307172a6173466c505e1b003c21d89880699; final runtime5ff846dc8f2fc9d656e6fba0961300cbbc55868f. CI mergee9e7b0032c07b5cad3252b83874d4cdb51b94be1 contains final runtime and basePR19 e16c885ae7c2305645be02a1227bf378cb59137f. Risk HIGH: company scope, source identity and measurement.

Separate reviewer session /root/architecture_v11_review independently read SQL657, domain projection and UI, reran79 local cases, compared published blobs and read initial808 CI logs. Verdict PASS, no blocker. One P3 label finding was fixed at5ff846: counts refer to form submissions, not unique customers. Reviewer verified both final UI blobs and closed P3; no new findings. Reviewer did not independently operate the browser. The primary agent ran and recorded the synthetic UI checks and read final5ff CI logs below.

## Final runtime evidence

| Check | Evidence | Result |
|---|---|---|
| Local domain/worker/API |25 existing trial +25 reconciliation +29 census cases |79 PASS |
| Automation |[run37016285763](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37016285763) |All10 jobs SUCCESS |
| Census + reconciliation PostgreSQL16 |[job110867834760](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37016285763/job/110867834760) |17 PASS,0 FAIL,0 SKIP;16 scenarios plus parent |
| Node22 regressions |[job110867834507](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37016285763/job/110867834507) |489 PASS,0 FAIL,0 SKIP |
| Whole frontend build |[job110867834544](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37016285763/job/110867834544) |10,302 modules; SUCCESS33.76s |
| Report regression |[run37016285556](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37016285556) |SUCCESS |
| Messenger integration |[run37016285863](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37016285863) |SUCCESS |
| Browser |[synthetic interaction record](FACEBOOK_CRM_RECONCILIATION_BROWSER.md) |PASS, no console errors |

The PostgreSQL job applies649–657 twice. Added scenarios prove private-helper access restrictions, wrong-company rejection, real656 census joined to652 CRM intake, reverse detection of known IDs omitted by enumeration, concurrent receipt mutation preserving one-statement snapshot consistency, deleted CRM, scope/token changes, and latest failed-run visibility. The source worker uses synthetic provider responses; no real customers or tokens are involved.

## Practical result and limits

The dashboard now shows which submissions have corresponding CRM evidence, which await intake/review, and which known IDs were not found in the scan. Recovery is available through the existing authenticated, default-off endpoint. Uncertain responses retry the same command key and late responses cannot replace another company's view. The primary-only and server-side authority checks remain in place.

This is a current derived view over durable receipt/source/census records, not a new canonical customer store. It covers the enumerated API set and durable private receipts/evidence. Legacy records that never produced a new receipt, complete Page/account/entrypoint permissions and provider retention are not proven by these tests. MATCHED_ENUMERATED is not complete coverage. CPQL remains unavailable; do not treat1m/4 observed qualified customers as a verified250k result yet.

Next required work: complete scope/legacy dispositions and aligned measured source/spend coverage for the positive CPQL path; verified AI care/takeover, actual survey scheduling and operational UAT remain part of the full goal. Pending operational inputs were already requested from Founder. No budget, permission or trial was activated.

[Implementation/rollback](FACEBOOK_CRM_RECONCILIATION.md). Rollback stops the new recovery UI/worker while preserving evidence and existing CRM records. The additive read helper may remain installed. No merge/deploy/live migration/provider write was performed.
