# Synthetic browser validation — reconciliation dashboard

2026-10-02. Real MarketingLeadTrial + FacebookSourceRecovery components, bundled with local fake API only. Localhost4185, CSP connect-src none, no login/CRM/customer/provider connection. Supported Codex browser tab13; closed and server81050 stopped after checks. No production activation.

808a307 interaction checks PASS:

- Scope interval, counts, missing/review/source exceptions rendered with readable layout.
- Lost POST response displayed uncertainty. Report reload retained request. Retry used the exact same requestUUID/body6147b175-6615-4ca9-bf2e-c10a171abd5b; successful response cleared uncertainty.
- Response carrying another company was rejected and retained same-request retry.
- During held POST, report refresh and configuration controls disabled.
- Switching A to B during held A POST retained B's 2m/8 display after A completed; no A data/late state applied.
- Read error hid prior report figures/recovery panel and displayed an error.
- RUNNING displayed progress and disabled new scan; STALE displayed changed-scope warning.
- Browser console and fixture errors empty. Full screenshot visually checked.

5ff846 final UI delta checks PASS:

- Labels now say form submissions, with an explicit distinction from unique verified customers.
- Configured a valid new-period form using native date keyboard input (date.fill alone changed DOM without React notification in this browser runtime). Verified save enabled, then held recovery request and verified save disabled. Released request without saving any new period.
- Rebuilt final UI blobs4b2b2160e2bc0f2be08f996a67109633177b9052/aabea3d92c8ad278df4c85f2ba273020ac4c3be2; reloaded, confirmed final labels and no console errors.

The fixture is an interaction test, not evidence of real provider permissions, complete account/legacy scope, actual CPQL, actual customer delivery or operational readiness. PostgreSQL/CI and independent review are recorded separately in canonical repo documents.

