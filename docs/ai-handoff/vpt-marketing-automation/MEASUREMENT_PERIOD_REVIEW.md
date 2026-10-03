# Independent review — measurement period

2026-10-03. **PASS for SQL670, report projection and period UI at candidate `5076b2a34ac5d595d1f998e18ba61a56ca5c422d`. Release/UAT/complete CPQL HOLD; full goal ACTIVE.** Reviewer is the separate `/root/architecture_v11_review` session, read-only throughout this increment.

## Exact source

Candidate tree `869d8a069795771c8a912cf685d2bc0ee6a761c4`. CI merge checkout `162f00ee34e78f073bc5a186e21343ecee3e6f7b` has parents base `e16c885ae7c2305645be02a1227bf378cb59137f` and candidate `5076b2a34ac5d595d1f998e18ba61a56ca5c422d`, and the identical tree. This is merge-checkout evidence, not a direct-head checkout claim.

Verified blobs: SQL670 `acab041afd6cc100da1f64a714fe4a4054977b2a`; receipt projection `b79ab7677821e9445136a018c161eb17394c11bc`; period PostgreSQL cases `3a42831cf4993aeec90fb5ef2379df41555bf7f6`. Published tree equals the staged local tree before non-force branch update. Local checkout synchronized by fetch and compare-and-swap HEAD, without reset/deletion.

## Validation

| Evidence | Result |
|---|---|
| [Automation37101196618](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196618) | All10 jobs SUCCESS |
| [Census PostgreSQL111140903154](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196618/job/111140903154) | 26 PASS /0 FAIL /0 SKIP, including9 new period cases |
| [Trial PostgreSQL111140903149](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196618/job/111140903149) | 13 PASS /0 FAIL /0 SKIP |
| [Node22 111140903113](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196618/job/111140903113) | 643 PASS /0 FAIL /0 SKIP |
| [Frontend111140903100](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196618/job/111140903100) | 10,310 modules,40.12 seconds, SUCCESS |
| [Report37101196572](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196572), [Messenger37101196569](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37101196569) | SUCCESS |
| Local Node24 | 143 relevant domain/service/provider cases PASS |
| Independent local | 25 final period cases PASS; earlier broader scoped runs also passed |
| [Supported browser check](MEASUREMENT_PERIOD_BROWSER.md) | Actual components + synthetic API; correct cutoff, no false zero-day result, conflicts visible and source-error state |

PostgreSQL16 fixtures apply SQL670 twice and exercise real census RPCs and intake with fake providers. Tests cover private observations, exclusive day boundary, current-day and first-day recovery→CRM, no completed day, future trial rejection, replay of persisted pre-midnight cutoffs, historical NULL-policy intraday run, restart/pagination, late receipt, conflicting/future metadata rollback, Page/scope/lease changes, observation rollback and one-statement concurrent snapshots. These are not real Meta permissions, real-schema UAT, volume or restore evidence.

## Review findings closed

1. **P2, hidden outside-period conflict:** a DONE receipt's source and current census observation could disagree while both dates were outside the measured window; reverse reconciliation returned matched. Explicit CONFLICT now survives report and both reconciliation directions. Regression covers the original case. Receipt state REVIEW with otherwise matching metadata remains review-required, not a fabricated timestamp conflict.
2. **P2, same-day recovery regression:** using the measurement cutoff as the recovery boundary delayed missing current-day webhooks and blocked day-one recovery. Original `until_at` now remains the operational recovery boundary; new `measurement_until_at` only filters the measured cohort. Tests prove day-one intake into CRM without adding it to a nonexistent closed-day metric.
3. **P3, premature success wording:** the no-closed-day message no longer claims recovery already succeeded; unavailable metric cards do not show zero. Recovery and measurement intervals are distinct in the UI.

Earlier `efcf783` automation37100271922 failed six trial-fixture assertions: current-day acquisition and both-days spend no longer matched the new measurement contract. Updated fixtures to a completed day; did not weaken source/identity/authorization requirements. `90b1068` automation37100813356 failed one existing snapshot assertion because REVIEW had been mislabeled CONFLICT; fixed runtime metadata validation and retained the snapshot assertion. Final5076b2a passed all required jobs. Never cite either earlier run as all-PASS.

## Remaining scope and rollback

See [contract](MEASUREMENT_PERIOD.md). Complete the source registry and current provider permissions/retention evidence, then a versioned measurement close with positive CPQL; connect survey/pending dashboard, resolve remaining care/calendar/legacy/UAT/restore gates and prepare Founder release. The measured period is now consistent, but the source population is still unproven. No global or multichannel CPQL attainment is certified, and no budget execution is authorized.

Flags remain off; no actual DB migration, Meta request, enrollment, message, model API, ad change, merge or deployment. Stop affected report/census flags to disable new paths while preserving evidence and already accepted customers. Do not delete receipts/observations, silently discard conflicts or reset ambiguous external actions.
