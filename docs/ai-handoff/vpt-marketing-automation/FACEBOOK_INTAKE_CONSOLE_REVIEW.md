# Independent review and synthetic UI acceptance — intake console

## Tested version and verdict

Implementation: `ad806775d3a8f76ecc03dbd34504cea7b6c74833`, tree `9592e1d7cbec2d65ebf748fc208ee6cb59b7aae6`. All13 changed blobs matched local candidates before advancing PR22. Source PR22 `459c8406`; base branch PR19 `e16c885ae7c2305645be02a1227bf378cb59137f` remains unmerged. Risk HIGH, production release HOLD.

Independent reviewer `architecture_v11_review`, separate from the author, read SQL653, API/worker/UI and tests/docs; reran65 local tests and verified5 published blobs. Verdict **PASS for this increment**, after closing one P2: an ambiguous write response retained its request only until the user changed selection/reloaded/paged. Those controls now stay disabled while the outcome is uncertain; retry retains the exact request UUID and command. Terminal400/403/409 clears the uncertainty lock so the user can refresh rights/state.

## Automated evidence

- Local65 adapter, extracted production webhook handler, admin and pause tests:65 PASS,0 FAIL,0 SKIP. These are not a whole Express-server boot.
- [Automation run36998477736](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36998477736): all8 jobs SUCCESS. Node18 and22 each368 tests PASS.
- [Isolated PostgreSQL16 intake/console job110810517519](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36998477736/job/110810517519):30 scenarios plus parent =31 PASS,0 FAIL,0 SKIP. Fixture applies650/651/652/653 twice. Ten new scenarios cover scoped access/private tables, audit+state atomicity, fresh/identical concurrent retries, missing binding revision adoption, stale/leased/queued rows, owner/actor/binding revocation, completion/legacy/source tombstones and cursor pagination above50. Tests use real PostgreSQL transactions and parallel clients in an isolated database, not a production clone.
- Existing command/spend/qualification/identity PostgreSQL jobs PASS. [Full frontend build](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36998477736/job/110810517401):10,299 modules,29.17seconds, SUCCESS.
- [Report correctness36998477330](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36998477330) and [Messenger PostgreSQL36998477317](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36998477317):SUCCESS.

The CI checkout is PR merge ref `d80bf3d669bf107c9f3de8c3540270bb77f5acd5`, combining implementation `ad806775` and base `e16c885`; it is not a direct-head checkout. Reviewer independently read the PostgreSQL log and all job outcomes.

## Supported browser, synthetic data only

Author used the supported in-app browser at loopback `127.0.0.1:4184`, actual component from implementation, synthetic company wrapper/API, React StrictMode. CSP `connect-src 'none'`; no production client, login or customer data. Observed:

1. Lost response after accepted mock write: form/body immutable; reload, other selection and pagination disabled. Retry used the identical UUID `0cf05f03-bcbe-4659-a25c-0b642ff6bd70` and body; acknowledged without a new command.
2. Delayed companyA read completed after selectingB: selectedB and count22/recipientB remained; oldA/count11 did not replace them.
3. Read failure: old numbers, queue and action removed; recovery restored current-company data.
4. Delayed companyB write completed after selectingA: currentA/count11 remained, no old-company success update/reload applied.
5. Next/previous page controls loaded the requested cursor. Legacy-review row had an explanation and no retry button.
6. No company selected: only the choose-company message; no management controls.
7. Default browser viewport screenshot inspected; readable cards/form/queue. Browser error log empty. No comprehensive accessibility, mobile/whole-app navigation, real API/auth or visual-baseline claim.

Fixture at local `work/vpt-intake-console/browser-fixture/`; browser tab and server closed after testing. Reviewer reviewed code and CI, did not rerun this browser session.

## Remaining scope and rollback

No merge, deployment, live migration, feature-flag activation, real Meta call or ad/customer operation. Recovery remains separately default-off. Worker pause is process-local, must cover all replicas and drain submitted RPCs; selected-Page ownership/signature/receipt intake must remain. See [contract](FACEBOOK_INTAKE_CONSOLE.md) and [source intake rollout](FACEBOOK_LEAD_INTAKE.md).

The complete Founder goal remains active: binding editor/provider discovery, legacy/orphan and distinct identity resolution, trial registry + complete paid-qualified unique cohort/CPQL, verified AI care/real survey slots, overall acceptance and Founder release. This PASS does not prove CPQL250k or trial launch.
